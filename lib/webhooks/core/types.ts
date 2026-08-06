// lib/webhooks/core/types.ts
// Core TypeScript interfaces for the Extensible Multi-Provider Webhook Engine.

export type WebhookProvider = 'meta' | 'google' | 'stripe' | 'custom';
export type WebhookSubProvider = 'whatsapp' | 'instagram' | 'facebook_leads' | 'google_pubsub' | 'stripe_billing' | 'generic';

export type WebhookEventStatus = 
  | 'received' 
  | 'processed' 
  | 'pending_retry' 
  | 'dead_letter' 
  | 'unresolved_tenant'
  | 'disabled_provider';

export interface WebhookEventRecord {
  event_uid: string;
  tenant_uid?: string | null;
  provider: WebhookProvider;
  sub_provider: WebhookSubProvider;
  phone_line_uid?: string | null;
  event_type: string;
  external_event_id?: string | null;
  payload: Record<string, any>;
  status: WebhookEventStatus;
  error_message?: string | null;
  attempts: number;
  processed_at?: string | null;
  received_at: string;
}

export interface ProviderWebhookConfig {
  config_uid: string;
  provider: WebhookProvider;
  display_name: string;
  icon_slug: string;
  is_enabled: boolean;
  callback_url: string;
  verify_token: string;
  secret_token: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

export interface WebhookHandlerResult {
  success: boolean;
  status: WebhookEventStatus;
  tenant_uid?: string | null;
  phone_line_uid?: string | null;
  external_event_id?: string | null;
  error?: string;
  details?: Record<string, any>;
}
