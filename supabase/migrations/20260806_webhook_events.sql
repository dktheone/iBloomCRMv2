-- ====================================================================
-- iBloomCRM v2 — Multi-Provider Webhook Events & Provider Config Schema
-- File: 20260806_webhook_events.sql
-- Run in Supabase SQL Editor (Append-Only Migration)
-- ====================================================================

-- ── 1. WEBHOOK EVENTS LOG & DEAD-LETTER TABLE ──────────────────────────────
-- Stores raw incoming payloads across providers (Meta, Google, Stripe, Custom).
-- Adheres strictly to the internal UUID `_uid` naming convention.

CREATE TABLE IF NOT EXISTS public.webhook_events (
    event_uid            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid           UUID REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    provider             VARCHAR(50) NOT NULL,            -- 'meta', 'google', 'stripe', 'custom'
    sub_provider         VARCHAR(50) NOT NULL,            -- 'whatsapp', 'instagram', 'facebook_leads'
    phone_line_uid       UUID REFERENCES public.wa_phone_numbers(phone_line_uid) ON DELETE SET NULL,
    event_type           VARCHAR(100) NOT NULL,           -- 'messages', 'statuses', 'user_preferences'
    external_event_id    VARCHAR(255),                    -- wamid or external event ID for deduplication
    payload              JSONB NOT NULL DEFAULT '{}'::jsonb,
    status               VARCHAR(50) NOT NULL DEFAULT 'received'
                             CHECK (status IN ('received', 'processed', 'pending_retry', 'dead_letter', 'unresolved_tenant', 'disabled_provider')),
    error_message        TEXT,
    attempts             INT NOT NULL DEFAULT 1,
    processed_at         TIMESTAMPTZ,
    received_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast query filtering, deduplication & status triage
CREATE INDEX IF NOT EXISTS idx_webhook_events_tenant ON public.webhook_events(tenant_uid);
CREATE INDEX IF NOT EXISTS idx_webhook_events_provider ON public.webhook_events(provider, sub_provider);
CREATE INDEX IF NOT EXISTS idx_webhook_events_external_id ON public.webhook_events(external_event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON public.webhook_events(status);
CREATE INDEX IF NOT EXISTS idx_webhook_events_received_at ON public.webhook_events(received_at DESC);

-- RLS Security
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on webhook_events" ON public.webhook_events;
CREATE POLICY "Service role full access on webhook_events" 
    ON public.webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Superadmin access on webhook_events" ON public.webhook_events;
CREATE POLICY "Superadmin access on webhook_events"
    ON public.webhook_events FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.user_uid = auth.uid() AND users.role IN ('super_admin', 'ops_admin')
        )
    );

-- ── 2. PROVIDER WEBHOOK CONFIGURATIONS TABLE ──────────────────────────────
-- Stores per-provider enable/disable toggles, secret keys, callback URLs, and instructions.

CREATE TABLE IF NOT EXISTS public.provider_webhook_configs (
    config_uid           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider             VARCHAR(50) NOT NULL UNIQUE,      -- 'meta', 'google', 'stripe', 'custom'
    display_name         VARCHAR(100) NOT NULL,
    icon_slug            VARCHAR(100) NOT NULL,            -- Iconify icon identifier
    is_enabled           BOOLEAN NOT NULL DEFAULT TRUE,
    callback_url         TEXT NOT NULL,
    verify_token         TEXT,
    secret_token         TEXT,
    instructions         TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Security for Provider Configs
ALTER TABLE public.provider_webhook_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on provider_webhook_configs" ON public.provider_webhook_configs;
CREATE POLICY "Service role full access on provider_webhook_configs" 
    ON public.provider_webhook_configs FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Superadmin access on provider_webhook_configs" ON public.provider_webhook_configs;
CREATE POLICY "Superadmin access on provider_webhook_configs"
    ON public.provider_webhook_configs FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.user_uid = auth.uid() AND users.role IN ('super_admin', 'ops_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.users
            WHERE users.user_uid = auth.uid() AND users.role IN ('super_admin', 'ops_admin')
        )
    );

-- Pre-seed Default Provider Configuration Rows
INSERT INTO public.provider_webhook_configs 
    (provider, display_name, icon_slug, is_enabled, callback_url, verify_token, secret_token, instructions)
VALUES 
    ('meta', 'Meta (WhatsApp & Instagram)', 'logos:whatsapp-icon', TRUE, 'https://crm.ibloomsolutions.com/api/webhooks/meta', 'ibloom_webhook_secret_verify_2026', 'meta_app_secret_placeholder', 'Subscribe to messages, message_template_status_update, phone_number_quality_update, and user_preferences in the Meta Developer Portal.'),
    ('google', 'Google Business & Lead Forms', 'logos:google-icon', FALSE, 'https://crm.ibloomsolutions.com/api/webhooks/google', 'google_verify_token_2026', 'google_client_secret_placeholder', 'Configure Google Cloud Pub/Sub webhook endpoint for Google Business Messaging & Local Lead extensions.'),
    ('stripe', 'Stripe Billing & Subscriptions', 'logos:stripe', FALSE, 'https://crm.ibloomsolutions.com/api/webhooks/stripe', 'stripe_verify_token_2026', 'whsec_stripe_placeholder', 'Add this endpoint in your Stripe Dashboard under Developers > Webhooks for subscription events.'),
    ('custom', 'Custom & Generic Webhooks', 'solar:code-bold', FALSE, 'https://crm.ibloomsolutions.com/api/webhooks/custom', 'custom_verify_token_2026', 'custom_secret_placeholder', 'Use this generic webhook receiver for n8n, Zapier, Make, or custom REST webhooks.')
ON CONFLICT (provider) DO NOTHING;

-- ── 3. REALTIME PUBLICATION FOR WEBHOOK EVENTS ──────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'webhook_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.webhook_events;
        RAISE NOTICE 'Added public.webhook_events to supabase_realtime';
    END IF;
END $$;

ALTER TABLE public.webhook_events REPLICA IDENTITY FULL;
