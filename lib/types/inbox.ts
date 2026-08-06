// lib/types/inbox.ts
// Type definitions for the Inbox / Chat module — D-095…D-101

export type MessageType =
  | 'text' | 'template' | 'image' | 'video' | 'audio'
  | 'document' | 'sticker' | 'location' | 'contacts'
  | 'reaction' | 'interactive' | 'order' | 'system' | 'unknown';

export type MessageDirection = 'inbound' | 'outbound';

export type MessageStatus = 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

export type MessageSourceType =
  | 'agent' | 'ai_agent' | 'broadcast' | 'flow' | 'sequence' | 'api';

export type ConversationStatus = 'open' | 'pending' | 'resolved';

export type OptInStatus = 'unknown' | 'opted_in' | 'opted_out';

// ── Content shapes per message type (D-097) ───────────────────────────────────

export interface TextContent {
  body: string;
}

export interface TemplateContent {
  template_uid: string;
  template_name: string;
  language: string;
  components: unknown[];
  resolved_bindings?: Record<string, string>;
}

export interface MediaContent {
  mime_type: string;
  caption?: string;
  filename?: string; // document only
  sha256?: string;
  file_size?: number;
}

export interface AudioContent {
  mime_type: string;
  voice: boolean;
}

export interface LocationContent {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}

export interface ReactionContent {
  emoji: string;
  target_wa_message_id: string;
}

export interface InteractiveContent {
  interactive_type: 'button' | 'list' | 'product' | 'product_list';
  header?: { type: string; text?: string };
  body: { text: string };
  action: {
    buttons?: Array<{ id: string; title: string }>;
    sections?: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
  };
}

export interface SystemContent {
  event: 'assigned' | 'reassigned' | 'resolved' | 'reopened' | 'note' | 'bot_on' | 'bot_off';
  actor_uid?: string;
  note?: string;
  meta?: Record<string, unknown>;
}

export type MessageContent =
  | TextContent
  | TemplateContent
  | MediaContent
  | AudioContent
  | LocationContent
  | ReactionContent
  | InteractiveContent
  | SystemContent
  | Record<string, unknown>;

// ── Media reference ───────────────────────────────────────────────────────────

export interface MediaRef {
  storage_path: string;
  mime_type: string;
  size_bytes?: number;
  download_status: 'pending' | 'stored' | 'failed';
  meta_media_id?: string;
}

// ── Row shapes ────────────────────────────────────────────────────────────────

/**
 * A row in the tenant's `labels` table — the label itself, not an application
 * of it. `contact_labels` joins these onto contacts (see `ContactLabel`).
 */
export interface Label {
  label_uid: string;
  tenant_uid: string;
  name: string;
  color?: string | null;
  created_at?: string;
}

/**
 * A label as applied to a contact, read via the `contact_labels` join table (D-106).
 * Prefer selecting from the `contact_labels_active` view, which already filters
 * out expired rows (D-110).
 */
export interface ContactLabel {
  label_uid: string;
  applied_at: string;
  expires_at?: string | null;
  applied_by_uid?: string | null;
  applied_by_module?: string | null;
  applied_by_ref_uid?: string | null;
  /** Joined from `labels` */
  label?: { name: string; color?: string | null };
}

export interface Contact {
  contact_uid: string;
  tenant_uid: string;
  wa_phone: string;
  name?: string;
  email?: string;
  avatar_url?: string;

  // Consent + provenance (D-104). `opted_out` is terminal (D-032).
  opt_in_status: OptInStatus;
  opt_in_source?: string;
  opt_in_at?: string;
  opt_out_at?: string;

  // Demographics (D-103)
  preferred_language?: string;   // ISO 639-1, e.g. 'en', 'hi'
  country_code?: string;         // ISO 3166-1 alpha-2
  timezone?: string;             // IANA, e.g. 'Asia/Kolkata'
  date_of_birth?: string;        // YYYY-MM-DD

  // Operational
  custom_fields: Record<string, unknown>;
  notes?: string;
  created_by_uid?: string;       // null when webhook-created
  last_activity_at?: string;
  data_retention_expires_at?: string;

  created_at: string;
  updated_at: string;

  /**
   * Only present when the query explicitly joins `contact_labels_active`.
   * The `labels TEXT[]` column was dropped in 20260805_contacts_module.sql.
   */
  labels?: ContactLabel[];
}

export interface Conversation {
  conversation_uid: string;
  tenant_uid: string;
  contact_uid: string;
  phone_line_uid: string;
  lifecycle_status: ConversationStatus;
  last_inbound_at?: string;
  window_expires_at?: string;
  assigned_to?: string;
  assigned_at?: string;
  bot_control: 'bot' | 'agent';
  last_message_at?: string;
  last_message_preview?: string;
  last_message_direction?: MessageDirection;
  unread_count: number;
  is_pinned: boolean;
  tags: string[];
  channel: 'whatsapp';
  created_at: string;
  updated_at: string;
  // Joined fields
  contact?: Contact;
  phone_number?: { display_phone_number: string; verified_name: string };
  assigned_agent?: { user_uid: string; full_name: string; email: string };
}

export interface Message {
  message_uid: string;
  tenant_uid: string;
  conversation_uid: string;
  phone_line_uid: string;
  contact_uid: string;
  direction: MessageDirection;
  message_type: MessageType;
  content: MessageContent;
  media_ref?: MediaRef;
  reply_to_wa_message_id?: string;
  source_type?: MessageSourceType;
  source_ref_uid?: string;
  sent_by?: string;
  ai_agent_id?: string;
  template_uid?: string;
  wa_message_id?: string;
  status?: MessageStatus;
  error_code?: string;
  error_title?: string;
  status_updated_at?: string;
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  failed_at?: string;
  is_deleted: boolean;
  created_at: string;
}

// ── API contract types (D-101) ────────────────────────────────────────────────

export interface ConversationListItem {
  conversation_uid: string;
  contact: {
    contact_uid: string;
    name?: string;
    wa_phone: string;
    avatar_url?: string;
    opt_in_status: OptInStatus;
  };
  phone_number: {
    display_phone_number: string;
    verified_name: string;
  };
  lifecycle_status: ConversationStatus;
  last_message_at?: string;
  last_message_preview?: string;
  last_message_direction?: MessageDirection;
  unread_count: number;
  window_expires_at?: string;
  is_pinned: boolean;
  tags: string[];
  assigned_agent?: {
    user_uid: string;
    full_name: string;
  } | null;
}

export type SendMessageRequest =
  | { type: 'text'; body: string }
  | { type: 'template'; template_uid: string; bindings: Record<string, string> }
  | { type: 'image' | 'video' | 'document' | 'audio'; storage_path: string; caption?: string; filename?: string }
  | { type: 'location'; latitude: number; longitude: number; name?: string; address?: string }
  | { type: 'note'; body: string };

// ── Window helpers ────────────────────────────────────────────────────────────

/** Returns true if the 24h window is still open */
export function isWindowOpen(windowExpiresAt?: string | null): boolean {
  if (!windowExpiresAt) return false;
  return new Date(windowExpiresAt) > new Date();
}

/** Returns minutes remaining in window (0 if expired) */
export function windowMinutesRemaining(windowExpiresAt?: string | null): number {
  if (!windowExpiresAt) return 0;
  const diff = new Date(windowExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(diff / 60000));
}
