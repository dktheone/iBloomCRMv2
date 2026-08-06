-- ====================================================================
-- iBloomCRM v2 — Inbox / Chat Module Schema
-- File: 20260804_inbox_conversations_messages.sql
-- Decisions: D-095 … D-101
-- Depends on: 20260802_complete_clean_reset.sql (tenants, users, wabas, wa_phone_numbers)
-- Run in Supabase SQL Editor
-- ====================================================================

-- ── 1. CONTACTS ───────────────────────────────────────────────────────────────
-- Unique per (tenant_uid, wa_phone). Tenant-scoped, not per-number (D-031).

CREATE TABLE IF NOT EXISTS public.contacts (
    contact_uid         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    wa_phone            VARCHAR(30) NOT NULL,          -- E.164 e.g. +919876543210
    name                VARCHAR(255),
    email               VARCHAR(255),
    avatar_url          TEXT,
    opt_in_status       TEXT NOT NULL DEFAULT 'unknown'
                            CHECK (opt_in_status IN ('unknown', 'opted_in', 'opted_out')),
    custom_fields       JSONB NOT NULL DEFAULT '{}'::jsonb,
    labels              TEXT[] NOT NULL DEFAULT '{}'::text[],
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_uid, wa_phone)
);

CREATE INDEX idx_contacts_tenant ON public.contacts(tenant_uid);
CREATE INDEX idx_contacts_phone  ON public.contacts(wa_phone);

-- ── 2. CONVERSATIONS ──────────────────────────────────────────────────────────
-- Persistent thread per (tenant, contact, phone number). D-036, D-099.

CREATE TABLE IF NOT EXISTS public.conversations (
    conversation_uid        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid              UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid             UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    phone_line_uid          UUID NOT NULL REFERENCES public.wa_phone_numbers(phone_line_uid),

    -- Lifecycle (D-036)
    lifecycle_status        TEXT NOT NULL DEFAULT 'open'
                                CHECK (lifecycle_status IN ('open', 'pending', 'resolved')),

    -- 24h window (D-036)
    last_inbound_at         TIMESTAMPTZ,
    window_expires_at       TIMESTAMPTZ,   -- last_inbound_at + interval '24 hours'

    -- Assignment (D-038)
    assigned_to             UUID REFERENCES public.users(user_uid),
    assigned_at             TIMESTAMPTZ,

    -- Bot control (D-054)
    bot_control             TEXT NOT NULL DEFAULT 'agent'
                                CHECK (bot_control IN ('bot', 'agent')),
    active_flow_session_uid UUID,          -- FK to bot_sessions (future flows module)

    -- Denormalized list-view columns (D-099) — maintained by AFTER trigger on messages
    last_message_at         TIMESTAMPTZ,
    last_message_preview    TEXT,
    last_message_direction  TEXT CHECK (last_message_direction IN ('inbound', 'outbound')),
    unread_count            INT NOT NULL DEFAULT 0,

    -- UX extras (D-099)
    is_pinned               BOOLEAN NOT NULL DEFAULT FALSE,
    tags                    TEXT[] NOT NULL DEFAULT '{}'::text[],
    channel                 TEXT NOT NULL DEFAULT 'whatsapp'
                                CHECK (channel IN ('whatsapp')),   -- reserved: instagram, email

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_uid, contact_uid, phone_line_uid)
);

CREATE INDEX idx_conversations_tenant         ON public.conversations(tenant_uid);
CREATE INDEX idx_conversations_contact        ON public.conversations(contact_uid);
CREATE INDEX idx_conversations_last_msg_at    ON public.conversations(tenant_uid, last_message_at DESC);
CREATE INDEX idx_conversations_status         ON public.conversations(tenant_uid, lifecycle_status);
CREATE INDEX idx_conversations_assigned       ON public.conversations(assigned_to) WHERE assigned_to IS NOT NULL;

-- ── 3. MESSAGES ───────────────────────────────────────────────────────────────
-- Every message, no exceptions. D-095 → D-098.

CREATE TABLE IF NOT EXISTS public.messages (
    message_uid             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid              UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    conversation_uid        UUID NOT NULL REFERENCES public.conversations(conversation_uid) ON DELETE CASCADE,
    phone_line_uid          UUID NOT NULL REFERENCES public.wa_phone_numbers(phone_line_uid),
    contact_uid             UUID NOT NULL REFERENCES public.contacts(contact_uid),

    -- Type & Direction (D-096)
    direction               TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    message_type            TEXT NOT NULL DEFAULT 'text'
                                CHECK (message_type IN (
                                    'text', 'template', 'image', 'video', 'audio',
                                    'document', 'sticker', 'location', 'contacts',
                                    'reaction', 'interactive', 'order', 'system', 'unknown'
                                )),

    -- Content (D-097) — canonical jsonb shape per message_type
    content                 JSONB NOT NULL DEFAULT '{}'::jsonb,
    /*
      text:        { "body": "..." }
      template:    { "template_uid": "uuid", "template_name": "...", "language": "en_US",
                     "components": [...], "resolved_bindings": {"1": "John", ...} }
      image/video/
      document:    { "mime_type": "...", "caption": "...", "filename": "...", "sha256": "..." }
      audio:       { "mime_type": "audio/ogg", "voice": true }
      location:    { "latitude": 0.0, "longitude": 0.0, "name": "...", "address": "..." }
      interactive: { "interactive_type": "button|list", "header": {...}, "body": {...}, "action": {...} }
      reaction:    { "emoji": "👍", "target_wa_message_id": "wamid.xxx" }
      system:      { "event": "assigned|resolved|note", "actor_uid": "uuid", "note": "..." }
      unknown:     { "raw": { ...full Meta payload... } }
    */

    -- Media Storage reference (D-097)
    media_ref               JSONB,
    /*
      { "storage_path": "tenant/{uid}/messages/{uid}/file.jpg",
        "mime_type": "image/jpeg",
        "size_bytes": 204800,
        "download_status": "pending|stored|failed",
        "meta_media_id": "1234567890" }
    */

    -- Inbound context
    reply_to_wa_message_id  TEXT,          -- wamid of the message being replied to

    -- Provenance — outbound only (D-098)
    source_type             TEXT CHECK (source_type IN (
                                'agent', 'ai_agent', 'broadcast', 'flow', 'sequence', 'api'
                            )),
    source_ref_uid          UUID,          -- polymorphic: broadcast_uid | flow_node_event_uid …
    sent_by                 UUID REFERENCES public.users(user_uid),  -- human agent; null if automated
    ai_agent_id             TEXT,          -- slug/model id of AI agent (future)

    -- Template reference
    template_uid            UUID REFERENCES public.wa_templates(template_uid),

    -- Meta API (D-037)
    wa_message_id           TEXT UNIQUE,   -- Meta wamid — dedup key for status webhooks

    -- Outbound status — webhook-driven (D-037)
    status                  TEXT CHECK (status IN ('queued', 'sent', 'delivered', 'read', 'failed')),
    error_code              TEXT,
    error_title             TEXT,
    status_updated_at       TIMESTAMPTZ,
    sent_at                 TIMESTAMPTZ,
    delivered_at            TIMESTAMPTZ,
    read_at                 TIMESTAMPTZ,
    failed_at               TIMESTAMPTZ,

    -- Soft delete (D-098) — WhatsApp "delete for everyone"
    is_deleted              BOOLEAN NOT NULL DEFAULT FALSE,

    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns (D-101)
CREATE INDEX idx_messages_conversation   ON public.messages(conversation_uid, created_at DESC);
CREATE INDEX idx_messages_wa_message_id  ON public.messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE INDEX idx_messages_tenant_source  ON public.messages(tenant_uid, source_type) WHERE direction = 'outbound';
CREATE INDEX idx_messages_template       ON public.messages(template_uid) WHERE template_uid IS NOT NULL;
CREATE INDEX idx_messages_contact        ON public.messages(contact_uid);

-- ── 4. AFTER TRIGGER — maintain conversations denormalized columns (D-099) ────

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER AS $$
DECLARE
    v_preview TEXT;
BEGIN
    -- Build a human-readable preview from content
    v_preview := CASE NEW.message_type
        WHEN 'text'        THEN LEFT(NEW.content->>'body', 80)
        WHEN 'template'    THEN '📋 ' || COALESCE(NEW.content->>'template_name', 'Template')
        WHEN 'image'       THEN '📷 ' || COALESCE(NEW.content->>'caption', 'Image')
        WHEN 'video'       THEN '🎥 ' || COALESCE(NEW.content->>'caption', 'Video')
        WHEN 'audio'       THEN '🎙 Voice message'
        WHEN 'document'    THEN '📄 ' || COALESCE(NEW.content->>'filename', 'Document')
        WHEN 'location'    THEN '📍 ' || COALESCE(NEW.content->>'name', 'Location')
        WHEN 'sticker'     THEN '😊 Sticker'
        WHEN 'reaction'    THEN COALESCE(NEW.content->>'emoji', '👍') || ' Reaction'
        WHEN 'interactive' THEN '🔘 ' || COALESCE(NEW.content->'body'->>'text', 'Interactive message')
        WHEN 'system'      THEN '⚙ ' || COALESCE(NEW.content->>'event', 'System event')
        ELSE '💬 Message'
    END;

    UPDATE public.conversations SET
        last_message_at        = NEW.created_at,
        last_message_preview   = v_preview,
        last_message_direction = NEW.direction,
        unread_count = CASE
            WHEN NEW.direction = 'inbound' THEN unread_count + 1
            ELSE unread_count
        END,
        -- Refresh 24h window on inbound
        last_inbound_at  = CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at ELSE last_inbound_at END,
        window_expires_at = CASE WHEN NEW.direction = 'inbound' THEN NEW.created_at + INTERVAL '24 hours' ELSE window_expires_at END,
        updated_at = NOW()
    WHERE conversation_uid = NEW.conversation_uid;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_messages_update_conversation
    AFTER INSERT ON public.messages
    FOR EACH ROW
    EXECUTE FUNCTION public.update_conversation_on_message();

-- ── 5. RLS POLICIES ───────────────────────────────────────────────────────────

ALTER TABLE public.contacts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- Service Role — full access
CREATE POLICY "Service role full access on contacts"
    ON public.contacts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on conversations"
    ON public.conversations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on messages"
    ON public.messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated — tenant isolation (Class A: D-003)
CREATE POLICY "Tenant isolation on contacts"
    ON public.contacts FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY "Tenant isolation on conversations"
    ON public.conversations FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

CREATE POLICY "Tenant isolation on messages"
    ON public.messages FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 6. REALTIME PUBLICATION (D-101) ──────────────────────────────────────────
-- Enable Supabase Realtime for live chat updates.
-- Run these in Supabase Dashboard → Database → Replication if not already enabled.
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- ── 7. VERIFICATION ───────────────────────────────────────────────────────────
SELECT 'Inbox/Chat schema (contacts + conversations + messages + trigger + RLS) created successfully.' AS status;
