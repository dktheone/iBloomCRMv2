import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PLATFORM_CONFIG } from '@/config/platform.config';

const GRAPH_API_BASE = `https://graph.facebook.com/${PLATFORM_CONFIG.metaApiVersion}`;

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { phone_number_id, recipient_phone, template_name, language, access_token } = body;

    if (!phone_number_id || !recipient_phone || !template_name) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: phone_number_id, recipient_phone, template_name' },
        { status: 400 }
      );
    }

    const token = access_token || PLATFORM_CONFIG.systemUserAccessToken;
    if (!token) {
      return NextResponse.json(
        { success: false, error: 'Access token not configured. Check PLATFORM_CONFIG.systemUserAccessToken.' },
        { status: 401 }
      );
    }

    const rawDigits = recipient_phone.replace(/[^\d]/g, '');
    const e164Phone = rawDigits ? `+${rawDigits}` : recipient_phone;

    // ── Consent gate (D-032) & Pre-Send Resolution ───────────────────────────
    // Resolved BEFORE the Meta call: a message that has already left the
    // platform cannot be un-sent, so an opt-out discovered afterwards is
    // worthless. Everything needed to persist the send is resolved here too,
    // so the post-send block does not have to re-query.
    const supabase = getAdminClient();
    let phoneLine: { phone_line_uid: string; tenant_uid: string } | null = null;
    let contactUid: string | null = null;
    let consentChecked = false;

    if (supabase) {
      // 1. Resolve phone line (by meta_phone_number_id, phone_line_uid, or fallback)
      let { data: line } = await supabase
        .from('wa_phone_numbers')
        .select('phone_line_uid, tenant_uid')
        .or(`meta_phone_number_id.eq.${phone_number_id},phone_line_uid.eq.${phone_number_id}`)
        .limit(1)
        .maybeSingle();

      if (!line) {
        // Fallback: search for any locked or operational line
        const { data: fallbackLine } = await supabase
          .from('wa_phone_numbers')
          .select('phone_line_uid, tenant_uid')
          .limit(1)
          .maybeSingle();
        line = fallbackLine;
      }

      phoneLine = line ?? null;

      if (phoneLine) {
        // 2. Lookup existing contact by either +E.164 format or raw digits format
        const { data: existing } = await supabase
          .from('contacts')
          .select('contact_uid, opt_in_status, wa_phone')
          .eq('tenant_uid', phoneLine.tenant_uid)
          .or(`wa_phone.eq.${e164Phone},wa_phone.eq.${rawDigits}`)
          .limit(1)
          .maybeSingle();

        consentChecked = true;

        if (existing) {
          contactUid = existing.contact_uid;

          // opted_out is terminal (D-032). Refuse before anything leaves.
          if (existing.opt_in_status === 'opted_out') {
            return NextResponse.json(
              {
                success: false,
                error:
                  'Recipient has opted out of messages from this business. Opt-out is terminal (D-032) and cannot be overridden.',
                code: 'RECIPIENT_OPTED_OUT',
                contact_uid: existing.contact_uid,
              },
              { status: 403 }
            );
          }
        }
      }
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: rawDigits,
      type: 'template',
      template: {
        name: template_name,
        language: {
          code: language || 'en_US',
        },
      },
    };

    // Attach body parameter components if provided
    if (Array.isArray(body.components) && body.components.length > 0) {
      payload.template.components = body.components;
    }

    const url = `${GRAPH_API_BASE}/${phone_number_id}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      return NextResponse.json({
        success: false,
        error: data.error?.message || `Meta API returned ${res.status}`,
        errorCode: data.error?.code,
        errorType: data.error?.type,
        metaResponse: data,
      });
    }

    const metaMessageId = data.messages?.[0]?.id || null;

    // ── Log into Database (contacts, conversations, messages) ────────────────
    // The message HAS been sent by this point. A failure here is a logging
    // failure, not a send failure — so it must not turn a successful send into
    // an error response. But it must also not be invisible: `persisted` and
    // `persist_error` are reported to the caller.
    let persisted = false;
    let persistError: string | null = null;

    if (supabase && metaMessageId && phoneLine) {
      try {
        const tenantUid = phoneLine.tenant_uid;

        // 1. Create the contact if the consent gate did not find one.
        if (!contactUid) {
          const { data: newContact, error: contactErr } = await supabase
            .from('contacts')
            .insert({
              tenant_uid: tenantUid,
              wa_phone: e164Phone,
              name: e164Phone,
            })
            .select('contact_uid')
            .single();

          if (contactErr) throw contactErr;
          contactUid = newContact?.contact_uid ?? null;
        }

        if (!contactUid) throw new Error('Could not resolve or create contact');

        // 2. Find or create Conversation
        let { data: conv } = await supabase
          .from('conversations')
          .select('conversation_uid')
          .eq('tenant_uid', tenantUid)
          .eq('contact_uid', contactUid)
          .eq('phone_line_uid', phoneLine.phone_line_uid)
          .maybeSingle();

        if (!conv) {
          const { data: newConv, error: convErr } = await supabase
            .from('conversations')
            .insert({
              tenant_uid: tenantUid,
              contact_uid: contactUid,
              phone_line_uid: phoneLine.phone_line_uid,
              lifecycle_status: 'open',
              bot_control: 'agent',
            })
            .select('conversation_uid')
            .single();

          if (convErr) throw convErr;
          conv = newConv;
        }

        if (!conv) throw new Error('Could not resolve or create conversation');

        // 3. Insert Message row (trigger handles conversation denormalization)
        const { error: msgErr } = await supabase.from('messages').insert({
          tenant_uid: tenantUid,
          conversation_uid: conv.conversation_uid,
          phone_line_uid: phoneLine.phone_line_uid,
          contact_uid: contactUid,
          direction: 'outbound',
          message_type: 'template',
          content: {
            template_name: template_name,
            language: language || 'en_US',
            components: body.components || [],
          },
          source_type: 'api',
          wa_message_id: metaMessageId,
          status: 'sent',
          sent_at: new Date().toISOString(),
        });

        if (msgErr) throw msgErr;
        persisted = true;
      } catch (dbErr: any) {
        persistError = dbErr?.message ?? String(dbErr);
        console.error('[send-template] Failed to log message to DB:', dbErr);
      }
    } else if (metaMessageId && !phoneLine) {
      persistError = supabase
        ? `No registered phone line matches '${phone_number_id}' — message sent but not logged.`
        : 'Supabase admin client unavailable — message sent but not logged.';
      console.error('[send-template]', persistError);
    }

    return NextResponse.json({
      success: true,
      metaMessageId,
      contactWaId: data.contacts?.[0]?.wa_id || null,
      // Surfaced so a send that Meta accepted but we failed to record is
      // visible instead of silent.
      persisted,
      persistError,
      consentChecked,
      metaResponse: data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Server Exception' },
      { status: 500 }
    );
  }
}
