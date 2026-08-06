import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { SendMessageRequest } from '@/lib/types/inbox';

// Next.js 15: route params arrive as a Promise and must be awaited.
type Params = { params: Promise<{ id: string }> };

// ── POST /api/inbox/conversations/[id]/send ────────────────────────────────────
// Canonical send pipeline (D-040): window check → build payload → Meta API → persist
//
// Body: SendMessageRequest (see lib/types/inbox.ts)
// Returns: { message: MessageRow }

export async function POST(req: NextRequest, { params }: Params) {
  const { id: conversationId } = await params;

  try {
    const supabase = await createClient();
    const admin    = createAdminClient();

    // ── 1. Auth: get calling user ────────────────────────────────────────────
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Load conversation + contact + phone line ──────────────────────────
    const { data: conv, error: convError } = await admin
      .from('conversations')
      .select(`
        *,
        contact:contacts ( contact_uid, wa_phone, opt_in_status ),
        phone_line:wa_phone_numbers (
          phone_line_uid, meta_phone_number_id, lifecycle_status, is_locked
        )
      `)
      .eq('conversation_uid', conversationId)
      .single();

    if (convError || !conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conv.lifecycle_status === 'resolved') {
      return NextResponse.json({ error: 'Conversation is resolved. Reopen first.' }, { status: 400 });
    }

    // ── 2b. Consent gate (D-032) ─────────────────────────────────────────────
    // opted_out is terminal. Checked before the payload is built, let alone
    // sent. Internal notes are exempt below — they never reach the contact.
    const optInStatus = (conv as any).contact?.opt_in_status;
    // ── 3. Parse request body ────────────────────────────────────────────────
    const body: SendMessageRequest = await req.json();

    // An internal note is never delivered to the contact, so consent does not
    // gate it. Everything else does.
    if (body.type !== 'note' && optInStatus === 'opted_out') {
      return NextResponse.json(
        {
          error: 'Contact has opted out. Opt-out is terminal (D-032) and cannot be overridden.',
          code: 'RECIPIENT_OPTED_OUT',
        },
        { status: 403 }
      );
    }

    // ── 4. Window gate (D-036) ───────────────────────────────────────────────
    const windowOpen = conv.window_expires_at
      ? new Date(conv.window_expires_at) > new Date()
      : false;

    const isTemplateOrNote =
      body.type === 'template' || body.type === 'note';

    if (!windowOpen && !isTemplateOrNote) {
      return NextResponse.json(
        { error: '24h messaging window is closed. Use a template to re-engage.' },
        { status: 422 }
      );
    }

    // ── 5. Internal note path (no Meta API call) ─────────────────────────────
    if (body.type === 'note') {
      const { data: noteMsg, error: noteErr } = await admin
        .from('messages')
        .insert({
          tenant_uid:       conv.tenant_uid,
          conversation_uid: conversationId,
          phone_line_uid:   conv.phone_line_uid,
          contact_uid:      conv.contact_uid,
          direction:        'outbound',
          message_type:     'system',
          content:          { event: 'note', actor_uid: user.id, note: body.body },
          source_type:      'agent',
          sent_by:          user.id,
          status:           'sent',
          sent_at:          new Date().toISOString(),
        })
        .select()
        .single();

      if (noteErr) throw new Error(noteErr.message);
      return NextResponse.json({ message: noteMsg });
    }

    // ── 6. Resolve phone line credentials ────────────────────────────────────
    const phoneLine = (conv as any).phone_line;
    if (!phoneLine?.meta_phone_number_id) {
      return NextResponse.json({ error: 'Phone line not configured' }, { status: 400 });
    }

    // Get the system user token from provider_secrets (service role)
    const { data: secrets } = await admin
      .from('provider_secrets')
      .select('encrypted_system_user_token')
      .limit(1)
      .single();

    if (!secrets?.encrypted_system_user_token) {
      return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 500 });
    }

    const accessToken = secrets.encrypted_system_user_token; // stored plaintext for now (vault in prod)
    const toPhone     = (conv as any).contact?.wa_phone?.replace(/\D/g, ''); // strip non-digits

    // ── 7. Build Meta API payload ────────────────────────────────────────────
    let metaPayload: Record<string, unknown>;
    let messageContent: Record<string, unknown>;

    if (body.type === 'text') {
      metaPayload = {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'text',
        text: { body: body.body, preview_url: false },
      };
      messageContent = { body: body.body };
    } else if (body.type === 'template') {
      // Load template
      const { data: tpl } = await admin
        .from('wa_templates')
        .select('*')
        .eq('template_uid', body.template_uid)
        .single();

      if (!tpl) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      }

      // Build components with bindings
      const components = buildTemplateComponents(tpl.components ?? [], body.bindings ?? {});

      metaPayload = {
        messaging_product: 'whatsapp',
        to: toPhone,
        type: 'template',
        template: {
          name:       tpl.name,
          language:   { code: tpl.language },
          components: components,
        },
      };

      messageContent = {
        template_uid:      tpl.template_uid,
        template_name:     tpl.name,
        language:          tpl.language,
        components:        tpl.components ?? [],
        resolved_bindings: body.bindings ?? {},
      };
    } else {
      return NextResponse.json({ error: `Message type '${body.type}' not yet supported in send API` }, { status: 400 });
    }

    // ── 8. Call Meta Cloud API ───────────────────────────────────────────────
    const metaRes = await fetch(
      `https://graph.facebook.com/v22.0/${phoneLine.meta_phone_number_id}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metaPayload),
      }
    );

    const metaData = await metaRes.json();

    if (!metaRes.ok || metaData.error) {
      // Persist failed message for audit trail (D-095)
      const { data: failedMsg } = await admin
        .from('messages')
        .insert({
          tenant_uid:       conv.tenant_uid,
          conversation_uid: conversationId,
          phone_line_uid:   conv.phone_line_uid,
          contact_uid:      conv.contact_uid,
          direction:        'outbound',
          message_type:     body.type,
          content:          messageContent,
          source_type:      'agent',
          sent_by:          user.id,
          template_uid:     body.type === 'template' ? body.template_uid : null,
          status:           'failed',
          error_code:       String(metaData.error?.code ?? metaData.error?.error_subcode ?? 'unknown'),
          error_title:      metaData.error?.message ?? 'Meta API error',
          failed_at:        new Date().toISOString(),
        })
        .select()
        .single();

      return NextResponse.json(
        {
          error:         'Meta API send failed',
          meta_error:    metaData.error,
          message:       failedMsg,
        },
        { status: 502 }
      );
    }

    const waMessageId: string = metaData.messages?.[0]?.id;

    // ── 9. Persist sent message ──────────────────────────────────────────────
    const { data: savedMsg, error: insertErr } = await admin
      .from('messages')
      .insert({
        tenant_uid:       conv.tenant_uid,
        conversation_uid: conversationId,
        phone_line_uid:   conv.phone_line_uid,
        contact_uid:      conv.contact_uid,
        direction:        'outbound',
        message_type:     body.type,
        content:          messageContent,
        source_type:      'agent',
        sent_by:          user.id,
        template_uid:     body.type === 'template' ? body.template_uid : null,
        wa_message_id:    waMessageId,
        status:           'sent',
        sent_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    return NextResponse.json({ message: savedMsg, wa_message_id: waMessageId });

  } catch (err: any) {
    console.error('[inbox/send] Unhandled error:', err);
    return NextResponse.json({ error: err.message ?? 'Internal server error' }, { status: 500 });
  }
}

// ── Helper: build Meta template components with variable bindings ──────────────
function buildTemplateComponents(
  tplComponents: any[],
  bindings: Record<string, string>
): any[] {
  const result: any[] = [];

  for (const comp of tplComponents) {
    const type = (comp.type ?? '').toUpperCase();

    if (type === 'BODY') {
      // Extract placeholder indices
      const text: string = comp.text ?? '';
      const matches = [...text.matchAll(/\{\{(\d+)\}\}/g)];
      if (matches.length > 0) {
        result.push({
          type: 'body',
          parameters: matches.map(m => ({
            type: 'text',
            text: bindings[m[1]] ?? `{{${m[1]}}}`,
          })),
        });
      }
    } else if (type === 'HEADER') {
      if (comp.format === 'TEXT') {
        const matches = [...(comp.text ?? '').matchAll(/\{\{(\d+)\}\}/g)];
        if (matches.length > 0) {
          result.push({
            type: 'header',
            parameters: matches.map(m => ({
              type: 'text',
              text: bindings[m[1]] ?? `{{${m[1]}}}`,
            })),
          });
        }
      }
      // IMAGE/VIDEO/DOCUMENT headers with media_uid not yet supported here — future Broadcast module
    } else if (type === 'BUTTONS') {
      const buttons: any[] = comp.buttons ?? [];
      buttons.forEach((btn: any, i: number) => {
        if (btn.type === 'URL' && btn.url?.includes('{{1}}')) {
          result.push({
            type: 'button',
            sub_type: 'url',
            index: String(i),
            parameters: [{ type: 'text', text: bindings['url_suffix'] ?? '' }],
          });
        }
      });
    }
  }

  return result;
}
