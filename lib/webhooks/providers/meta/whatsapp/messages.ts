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

import { resolveUnifiedContactAndConversation } from '@/lib/contacts/contact-resolver';

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

  const contactName = contactProfile?.name || rawFrom;

  try {
    // 1 & 2. Resolve or create unified Contact & Conversation (prevents split chats)
    const { contact, conversation } = await resolveUnifiedContactAndConversation(supabase, {
      tenantUid,
      phoneLineUid,
      rawPhone: rawFrom,
      contactName,
      isInbound: true,
    });

    // 3. Structure Canonical Message Content
    let contentJson: Record<string, any> = {};
    let mediaRef: Record<string, any> | null = null;

    if (messageType === 'text') {
      contentJson = { body: payloadMessage.text?.body || '' };
    } else if (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType)) {
      const mediaObj = payloadMessage[messageType] || {};
      const mediaUrl = mediaObj.id ? `/api/media/${mediaObj.id}` : null;
      contentJson = {
        mime_type: mediaObj.mime_type || '',
        caption: mediaObj.caption || '',
        filename: mediaObj.filename || '',
        sha256: mediaObj.sha256 || '',
        media_url: mediaUrl,
      };
      // Stash media id and proxy URL for instant streaming
      mediaRef = {
        meta_media_id: mediaObj.id || '',
        mime_type: mediaObj.mime_type || '',
        url: mediaUrl,
        download_status: 'available',
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
