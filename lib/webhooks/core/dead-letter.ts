// lib/webhooks/core/dead-letter.ts
// Helper service to log raw payloads to webhook_events and handle dead-letter buffering.

import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookEventRecord, WebhookEventStatus, WebhookProvider, WebhookSubProvider } from './types';

export interface LogWebhookEventParams {
  provider: WebhookProvider;
  sub_provider: WebhookSubProvider;
  event_type: string;
  payload: Record<string, any>;
  tenant_uid?: string | null;
  phone_line_uid?: string | null;
  external_event_id?: string | null;
  status?: WebhookEventStatus;
  error_message?: string | null;
}

/**
 * Log a raw webhook payload into public.webhook_events.
 */
export async function logWebhookEvent(params: LogWebhookEventParams): Promise<WebhookEventRecord | null> {
  const supabase = createAdminClient();

  const insertData = {
    provider: params.provider,
    sub_provider: params.sub_provider,
    event_type: params.event_type,
    payload: params.payload,
    tenant_uid: params.tenant_uid || null,
    phone_line_uid: params.phone_line_uid || null,
    external_event_id: params.external_event_id || null,
    status: params.status || 'received',
    error_message: params.error_message || null,
    attempts: 1,
    processed_at: params.status === 'processed' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('webhook_events')
    .insert(insertData)
    .select('*')
    .single();

  if (error) {
    console.error('[Webhook Dead-Letter Log Error]', error);
    return null;
  }

  return data as WebhookEventRecord;
}

/**
 * Update the status of an existing webhook event record in public.webhook_events.
 */
export async function updateWebhookEventStatus(
  eventUid: string,
  status: WebhookEventStatus,
  error_message?: string | null,
  tenant_uid?: string | null,
  phone_line_uid?: string | null
): Promise<void> {
  const supabase = createAdminClient();

  const updateData: Record<string, any> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (status === 'processed') {
    updateData.processed_at = new Date().toISOString();
  }
  if (error_message !== undefined) updateData.error_message = error_message;
  if (tenant_uid) updateData.tenant_uid = tenant_uid;
  if (phone_line_uid) updateData.phone_line_uid = phone_line_uid;

  await supabase
    .from('webhook_events')
    .update(updateData)
    .eq('event_uid', eventUid);
}
