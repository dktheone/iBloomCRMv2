// lib/webhooks/providers/meta/whatsapp/statuses.ts
// Outbound delivery status tick processor (sent → delivered → read → failed) with monotonic updates.

import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookHandlerResult } from '@/lib/webhooks/core/types';

export interface ProcessStatusReceiptParams {
  tenantUid: string;
  phoneLineUid: string;
  payloadStatus: Record<string, any>;
}

// Status hierarchy order for monotonic state advances
const STATUS_WEIGHT: Record<string, number> = {
  queued: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
};

/**
 * Process a Meta status receipt (sent, delivered, read, failed).
 */
export async function processStatusReceipt(params: ProcessStatusReceiptParams): Promise<WebhookHandlerResult> {
  const supabase = createAdminClient();
  const { tenantUid, phoneLineUid, payloadStatus } = params;

  const waMessageId = payloadStatus.id;
  const newStatus = payloadStatus.status; // 'sent' | 'delivered' | 'read' | 'failed'
  const timestamp = payloadStatus.timestamp ? new Date(parseInt(payloadStatus.timestamp) * 1000).toISOString() : new Date().toISOString();

  if (!waMessageId || !newStatus) {
    return {
      success: false,
      status: 'dead_letter',
      error: 'Missing id or status in status payload',
    };
  }

  try {
    // 1. Fetch current message state
    const { data: existingMsg, error: fetchErr } = await supabase
      .from('messages')
      .select('message_uid, status')
      .eq('wa_message_id', waMessageId)
      .maybeSingle();

    if (fetchErr) {
      return {
        success: false,
        status: 'dead_letter',
        error: `Failed to query message by wa_message_id: ${fetchErr.message}`,
      };
    }

    // Measure 1: If message row does not exist yet, buffer as pending_retry
    if (!existingMsg) {
      console.warn(`[Status Webhook] Message ${waMessageId} not found in DB yet. Buffering as pending_retry.`);
      return {
        success: false,
        status: 'pending_retry',
        external_event_id: waMessageId,
        error: `Message ${waMessageId} not found in DB yet (race condition buffer)`,
      };
    }

    // Monotonic guard: only advance status forward, never regress
    const currentWeight = STATUS_WEIGHT[existingMsg.status || 'queued'] || 0;
    const newWeight = STATUS_WEIGHT[newStatus] || 0;

    if (newWeight <= currentWeight && existingMsg.status !== 'failed') {
      return {
        success: true,
        status: 'processed',
        external_event_id: waMessageId,
        details: { skipped: 'Monotonic guard prevented status regression' },
      };
    }

    // 2. Prepare status update payload
    const updateData: Record<string, any> = {
      status: newStatus,
      status_updated_at: timestamp,
    };

    if (newStatus === 'sent') updateData.sent_at = timestamp;
    if (newStatus === 'delivered') updateData.delivered_at = timestamp;
    if (newStatus === 'read') updateData.read_at = timestamp;
    if (newStatus === 'failed') {
      updateData.failed_at = timestamp;
      const firstErr = payloadStatus.errors?.[0];
      if (firstErr) {
        updateData.error_code = String(firstErr.code || '');
        updateData.error_title = firstErr.title || firstErr.message || 'WhatsApp Delivery Error';
      }
    }

    // 3. Update message row
    const { error: updateErr } = await supabase
      .from('messages')
      .update(updateData)
      .eq('message_uid', existingMsg.message_uid);

    if (updateErr) {
      return {
        success: false,
        status: 'dead_letter',
        error: `Failed to update message status: ${updateErr.message}`,
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
      error: err instanceof Error ? err.message : 'Unknown status processor error',
    };
  }
}
