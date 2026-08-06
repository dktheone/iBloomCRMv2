// lib/webhooks/providers/meta/whatsapp/messages.ts
// Inbound WhatsApp message processor with E.164 normalization & tenant/conversation resolution.

import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookHandlerResult } from '@/lib/webhooks/core/types';

/**
 * Normalizes phone numbers to standard E.164 (+<country_code><digits>).
 */
export function normalizeToE164(rawPhone: string): string {
  if (!rawPhone) return '';
  const digits = rawPhone.replace(/\D/g, '');
  return `+${digits}`;
}

export interface ProcessInboundMessageParams {
  tenantUid: string;
  phoneLineUid: string;
  wabaUid?: string;
  payloadMessage: Record<string, any>;
  contactProfile?: { name?: string };
}

/**
 * Process a single inbound Meta WhatsApp message.
 */
export async function processInboundMessage(params: ProcessInboundMessageParams): Promise<WebhookHandlerResult> {
  const supabase = createAdminClient();
  const { tenantUid, phoneLineUid, payloadMessage, contactProfile } = params;

  const waMessageId = payloadMessage.id;
  const rawFrom = payloadMessage.from || '';
  const messageType = payloadMessage.type || 'text';
  const timestamp = payloadMessage.timestamp ? new Date(parseInt(payloadMessage.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (!rawFrom || !waMessageId) {
    return {
      success: false,
      status: 'dead_letter',
      error: 'Missing from or id in inbound payload',
    };
  }

  // Measure 2: Strict E.164 Normalization (+91...)
  const waPhone = normalizeToE164(rawFrom);
  const contactName = contactProfile?.name || waPhone;

  try {
    // 1. Upsert Contact (tenant_uid, wa_phone)
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .upsert(
        {
          tenant_uid: tenantUid,
          wa_phone: waPhone,
          name: contactName,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_uid,wa_phone' }
      )
      .select('contact_uid, name, opt_in_status')
      .single();

    if (contactErr || !contact) {
      console.error('[Inbound Webhook] Contact upsert failed:', contactErr);
      return {
        success: false,
        status: 'dead_letter',
        error: `Contact upsert failed: ${contactErr?.message}`,
      };
    }

    // 2. Upsert Conversation (tenant_uid, contact_uid, phone_line_uid)
    const { data: conversation, error: convErr } = await supabase
      .from('conversations')
      .upsert(
        {
          tenant_uid: tenantUid,
          contact_uid: contact.contact_uid,
          phone_line_uid: phoneLineUid,
          lifecycle_status: 'open',
          last_inbound_at: timestamp,
          window_expires_at: new Date(new Date(timestamp).getTime() + 24 * 60 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_uid,contact_uid,phone_line_uid' }
      )
      .select('conversation_uid')
      .single();

    if (convErr || !conversation) {
      console.error('[Inbound Webhook] Conversation upsert failed:', convErr);
      return {
        success: false,
        status: 'dead_letter',
        error: `Conversation upsert failed: ${convErr?.message}`,
      };
    }

    // 3. Structure Canonical Message Content
    let contentJson: Record<string, any> = {};
    let mediaRef: Record<string, any> | null = null;

    if (messageType === 'text') {
      contentJson = { body: payloadMessage.text?.body || '' };
    } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType)) {
      const mediaObj = payloadMessage[messageType] || {};
      contentJson = {
        mime_type: mediaObj.mime_type || '',
        caption: mediaObj.caption || '',
        filename: mediaObj.filename || '',
        sha256: mediaObj.sha256 || '',
      };
      // Measure 4: Stash media id for background download
      mediaRef = {
        meta_media_id: mediaObj.id || '',
        mime_type: mediaObj.mime_type || '',
        download_status: 'pending',
      };
    } else if (messageType === 'location') {
      contentJson = {
        latitude: payloadMessage.location?.latitude,
        longitude: payloadMessage.location?.longitude,
        name: payloadMessage.location?.name || '',
        address: payloadMessage.location?.address || '',
      };
    } else if (messageType === 'reaction') {
      contentJson = {
        emoji: payloadMessage.reaction?.emoji || '',
        target_wa_message_id: payloadMessage.reaction?.message_id || '',
      };
    } else if (messageType === 'interactive') {
      contentJson = {
        interactive_type: payloadMessage.interactive?.type,
        button_reply: payloadMessage.interactive?.button_reply,
        list_reply: payloadMessage.interactive?.list_reply,
      };
    } else {
      contentJson = { raw: payloadMessage };
    }

    // 4. Insert Message Row (on Conflict wa_message_id DO NOTHING for idempotency)
    const { error: msgErr } = await supabase.from('messages').insert({
      tenant_uid: tenantUid,
      conversation_uid: conversation.conversation_uid,
      phone_line_uid: phoneLineUid,
      contact_uid: contact.contact_uid,
      direction: 'inbound',
      message_type: messageType,
      content: contentJson,
      media_ref: mediaRef,
      wa_message_id: waMessageId,
      reply_to_wa_message_id: payloadMessage.context?.id || null,
      status: 'delivered',
      created_at: timestamp,
    });

    if (msgErr && !msgErr.message.includes('duplicate key')) {
      console.error('[Inbound Webhook] Message insert error:', msgErr);
      return {
        success: false,
        status: 'dead_letter',
        error: `Message insert failed: ${msgErr.message}`,
      };
    }

    return {
      success: true,
      status: 'processed',
      tenant_uid: tenantUid,
      phone_line_uid: phoneLineUid,
      external_event_id: waMessageId,
    };
  } catch (err) {
    return {
      success: false,
      status: 'dead_letter',
      error: err instanceof Error ? err.message : 'Unknown inbound error',
    };
  }
}
