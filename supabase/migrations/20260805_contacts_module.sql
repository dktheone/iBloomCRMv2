-- ====================================================================
-- iBloomCRM v2 — Contacts Module (Full Schema)
-- File: 20260805_contacts_module.sql
-- Decisions: D-102 … D-108 (contact module revision), D-109 … D-111 (campaign isolation Tier 1)
-- Depends on: 20260804_inbox_conversations_messages.sql (contacts table already exists)
-- Run in Supabase SQL Editor
-- ====================================================================

-- IMPORTANT: The `contacts` table was created by 20260804_inbox_conversations_messages.sql.
-- This migration ALTERS it and adds the full Contacts ecosystem around it.

-- ══════════════════════════════════════════════════════════════════════
-- PART 1: ALTER EXISTING CONTACTS TABLE
-- ══════════════════════════════════════════════════════════════════════

-- ── 1.1 Add demographic columns (D-103) ──────────────────────────────
ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS preferred_language  TEXT,                -- e.g. 'en', 'hi' — template resolution (D-041)
    ADD COLUMN IF NOT EXISTS country_code        CHAR(2),             -- ISO-3166-1 alpha-2 — pricing/analytics
    ADD COLUMN IF NOT EXISTS timezone            TEXT,                -- IANA e.g. 'Asia/Kolkata' — scheduler (D-048)
    ADD COLUMN IF NOT EXISTS date_of_birth       DATE;                -- birthday sequences need indexed EXTRACT

-- ── 1.2 Add consent provenance (D-032/D-104) ─────────────────────────
ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS opt_in_source       TEXT,                -- 'checkbox_signup', 'wa_reply_yes', 'csv_import_attested', etc.
    ADD COLUMN IF NOT EXISTS opt_in_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS opt_out_at          TIMESTAMPTZ;

-- ── 1.3 Add operational columns ──────────────────────────────────────
ALTER TABLE public.contacts
    ADD COLUMN IF NOT EXISTS created_by_uid               UUID REFERENCES public.users(user_uid),  -- null when webhook-created
    ADD COLUMN IF NOT EXISTS last_activity_at             TIMESTAMPTZ,                              -- denormalized from contact_activity
    ADD COLUMN IF NOT EXISTS data_retention_expires_at    TIMESTAMPTZ;                              -- DPDP erasure workflows

-- ── 1.4 Add GIN index on custom_fields (D-103) ───────────────────────
CREATE INDEX IF NOT EXISTS idx_contacts_custom_fields_gin
    ON public.contacts USING gin(custom_fields);

-- ── 1.5 Add updated_at touch trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_contacts_touch_updated_at ON public.contacts;
CREATE TRIGGER trg_contacts_touch_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.touch_contacts_updated_at();

-- ══════════════════════════════════════════════════════════════════════
-- PART 2: STICKY OPT-OUT + CONSENT EVENTS (D-032, D-104)
-- ══════════════════════════════════════════════════════════════════════

-- ── 2.1 contact_consent_events (append-only, service_role-revoked) ───
CREATE TABLE IF NOT EXISTS public.contact_consent_events (
    consent_event_uid   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    from_status         TEXT,                -- null on the first event
    to_status           TEXT NOT NULL CHECK (to_status IN ('unknown', 'opted_in', 'opted_out')),
    source              TEXT NOT NULL,       -- 'checkbox_signup', 'wa_reply_yes', 'wa_stop_reply', 'csv_import_attested', 'manual', 'support_request', 'api'
    channel             TEXT,                -- 'whatsapp', 'web', 'import', 'admin'
    actor_user_uid      UUID REFERENCES public.users(user_uid),  -- null when the contact acted
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata            JSONB                -- raw webhook payload, import attestation text, IP
);

CREATE INDEX idx_contact_consent_events_contact
    ON public.contact_consent_events(contact_uid, occurred_at DESC);
CREATE INDEX idx_contact_consent_events_tenant
    ON public.contact_consent_events(tenant_uid);

-- Revoke UPDATE/DELETE from all roles including service_role (D-067 posture)
REVOKE UPDATE, DELETE ON public.contact_consent_events FROM anon, authenticated, service_role;

-- Guard trigger — raise on UPDATE/DELETE attempts
CREATE OR REPLACE FUNCTION public.guard_contact_consent_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'contact_consent_events is append-only (D-067/D-104) — UPDATE and DELETE are revoked';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contact_consent_events_guard_update
    BEFORE UPDATE ON public.contact_consent_events
    FOR EACH ROW EXECUTE FUNCTION public.guard_contact_consent_events_immutable();

CREATE TRIGGER trg_contact_consent_events_guard_delete
    BEFORE DELETE ON public.contact_consent_events
    FOR EACH ROW EXECUTE FUNCTION public.guard_contact_consent_events_immutable();

-- ── 2.2 Sticky opt-out trigger on contacts (D-032) ───────────────────
-- Writes the audit row to contact_consent_events so the trail cannot be bypassed.

CREATE OR REPLACE FUNCTION public.contacts_sticky_opt_out()
RETURNS TRIGGER AS $$
BEGIN
    -- Guard: opt-out is terminal
    IF OLD.opt_in_status = 'opted_out' AND NEW.opt_in_status <> 'opted_out' THEN
        RAISE EXCEPTION 'opt_in_status: opted_out is terminal (D-032) — cannot revert to % from opted_out', NEW.opt_in_status;
    END IF;

    -- Write consent event on every status change
    IF OLD.opt_in_status IS DISTINCT FROM NEW.opt_in_status THEN
        INSERT INTO public.contact_consent_events (
            tenant_uid, contact_uid, from_status, to_status, source, channel, actor_user_uid, occurred_at, metadata
        ) VALUES (
            NEW.tenant_uid,
            NEW.contact_uid,
            OLD.opt_in_status,
            NEW.opt_in_status,
            COALESCE(NEW.opt_in_source, 'manual'),
            'admin',  -- this trigger fires from direct table writes; other paths supply their own channel
            auth.uid(),
            NOW(),
            NULL
        );

        -- Stamp the timestamps
        IF NEW.opt_in_status = 'opted_in' AND NEW.opt_in_at IS NULL THEN
            NEW.opt_in_at := NOW();
        END IF;
        IF NEW.opt_in_status = 'opted_out' AND NEW.opt_out_at IS NULL THEN
            NEW.opt_out_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_contacts_sticky_opt_out
    BEFORE UPDATE OF opt_in_status ON public.contacts
    FOR EACH ROW
    EXECUTE FUNCTION public.contacts_sticky_opt_out();

-- ══════════════════════════════════════════════════════════════════════
-- PART 3: CONTACT ACTIVITY (D-105)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contact_activity (
    activity_uid        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    activity_type       TEXT NOT NULL,       -- 'contact.created', 'message.sent', 'message.received', 'consent.changed',
                                             -- 'label.added', 'broadcast.included', 'sequence.enrolled', 'flow.entered',
                                             -- 'note.added', 'import.created', 'field.updated'
    source_module       TEXT,                -- which module emitted
    title               TEXT NOT NULL,       -- pre-rendered for display — timeline must not join per row
    detail              JSONB,
    actor_user_uid      UUID REFERENCES public.users(user_uid),
    ref_uid             UUID,                -- polymorphic pointer to the source row (broadcast_uid, flow_uid, etc.)
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_activity_timeline
    ON public.contact_activity(tenant_uid, contact_uid, occurred_at DESC);
CREATE INDEX idx_contact_activity_type
    ON public.contact_activity(tenant_uid, activity_type, occurred_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- PART 4: LABELS + CONTACT_LABELS (D-106, D-110)
-- ══════════════════════════════════════════════════════════════════════

-- ── 4.1 labels table ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.labels (
    label_uid           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    color               TEXT NOT NULL DEFAULT '#6366f1',  -- indigo-500 default
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_uid, name)
);

CREATE INDEX idx_labels_tenant ON public.labels(tenant_uid);

-- ── 4.2 contact_labels join table with provenance (D-110) ────────────
CREATE TABLE IF NOT EXISTS public.contact_labels (
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    label_uid           UUID NOT NULL REFERENCES public.labels(label_uid) ON DELETE CASCADE,
    applied_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    applied_by_uid      UUID REFERENCES public.users(user_uid),

    -- D-110: campaign provenance + staleness
    applied_by_module   TEXT,                -- 'manual' | 'broadcast' | 'flow' | 'sequence' | 'import' | 'api'
    applied_by_ref_uid  UUID,                -- broadcast_uid / flow_uid / sequence_uid — no FK yet (modules unbuilt)
    expires_at          TIMESTAMPTZ,         -- NULL = permanent

    PRIMARY KEY (contact_uid, label_uid)
);

CREATE INDEX idx_contact_labels_lookup
    ON public.contact_labels(tenant_uid, label_uid, applied_at DESC);
CREATE INDEX idx_contact_labels_expiry
    ON public.contact_labels(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_contact_labels_source
    ON public.contact_labels(applied_by_module, applied_by_ref_uid)
    WHERE applied_by_ref_uid IS NOT NULL;

-- ── 4.3 Migrate labels TEXT[] → join table (D-106) ───────────────────
-- Safe to re-run: only backfills if labels[] is non-empty and target rows don't exist.

DO $$
DECLARE
    v_contact RECORD;
    v_label_name TEXT;
    v_label_uid UUID;
BEGIN
    FOR v_contact IN
        SELECT contact_uid, tenant_uid, labels
        FROM public.contacts
        WHERE array_length(labels, 1) > 0
    LOOP
        FOREACH v_label_name IN ARRAY v_contact.labels
        LOOP
            -- Ensure the label exists
            INSERT INTO public.labels (tenant_uid, name)
            VALUES (v_contact.tenant_uid, v_label_name)
            ON CONFLICT (tenant_uid, name) DO NOTHING
            RETURNING label_uid INTO v_label_uid;

            -- If the label already existed, fetch its uid
            IF v_label_uid IS NULL THEN
                SELECT label_uid INTO v_label_uid
                FROM public.labels
                WHERE tenant_uid = v_contact.tenant_uid AND name = v_label_name;
            END IF;

            -- Create the join row
            INSERT INTO public.contact_labels (tenant_uid, contact_uid, label_uid, applied_by_module)
            VALUES (v_contact.tenant_uid, v_contact.contact_uid, v_label_uid, 'migration')
            ON CONFLICT (contact_uid, label_uid) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Drop the TEXT[] column (D-106)
ALTER TABLE public.contacts DROP COLUMN IF EXISTS labels;

-- ── 4.4 Time-windowed label reads (D-110) ────────────────────────────

CREATE OR REPLACE VIEW public.contact_labels_active
WITH (security_invoker = true) AS
SELECT * FROM public.contact_labels
WHERE expires_at IS NULL OR expires_at > NOW();

COMMENT ON VIEW public.contact_labels_active IS
'D-110: Active labels only (not expired). RLS from contact_labels applies to the reader.';

CREATE OR REPLACE FUNCTION public.contact_has_label(
    p_contact_uid UUID,
    p_label_name  TEXT,
    p_within      INTERVAL DEFAULT NULL   -- NULL = ever
) RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.contact_labels cl
        JOIN public.labels l ON l.label_uid = cl.label_uid
        WHERE cl.contact_uid = p_contact_uid
          AND l.name = p_label_name
          AND (cl.expires_at IS NULL OR cl.expires_at > NOW())
          AND (p_within IS NULL OR cl.applied_at > NOW() - p_within)
    );
$$;

COMMENT ON FUNCTION public.contact_has_label IS
'D-110: Check if a contact has a label, optionally within a time window. SECURITY INVOKER — caller RLS applies.';

-- ══════════════════════════════════════════════════════════════════════
-- PART 5: CUSTOM FIELD DEFINITIONS (D-103)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.custom_field_defs (
    field_def_uid       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    entity_type         TEXT NOT NULL DEFAULT 'contact',  -- future: 'lead', 'account', etc.
    field_key           TEXT NOT NULL,                    -- jsonb key in contacts.custom_fields
    label               TEXT NOT NULL,                    -- display name
    field_type          TEXT NOT NULL CHECK (field_type IN (
                            'text', 'number', 'date', 'boolean', 'select', 'multiselect', 'url', 'email', 'phone'
                        )),
    options             JSONB,                            -- for select / multiselect
    is_standard         BOOLEAN NOT NULL DEFAULT false,  -- seeded, not tenant-created
    is_required         BOOLEAN NOT NULL DEFAULT false,  -- form validation only (D-103, NOT a DB constraint)
    sort_order          INT NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_uid, entity_type, field_key)
);

CREATE INDEX idx_custom_field_defs_tenant
    ON public.custom_field_defs(tenant_uid, entity_type);

-- Seed standard definitions (D-103) — idempotent
INSERT INTO public.custom_field_defs (tenant_uid, entity_type, field_key, label, field_type, is_standard, sort_order)
SELECT
    t.tenant_uid,
    'contact',
    defs.field_key,
    defs.label,
    defs.field_type,
    true,
    defs.sort_order
FROM public.tenants t
CROSS JOIN (VALUES
    ('company_name', 'Company Name', 'text', 10),
    ('gender', 'Gender', 'select', 20),
    ('occupation', 'Occupation', 'text', 30),
    ('industry', 'Industry', 'select', 40),
    ('job_title', 'Job Title', 'text', 50),
    ('source_note', 'Source Note', 'text', 60)
) AS defs(field_key, label, field_type, sort_order)
ON CONFLICT (tenant_uid, entity_type, field_key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════
-- PART 6: CONTACT ADDRESSES (D-103)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contact_addresses (
    address_uid         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    label               TEXT,                            -- 'billing', 'shipping', 'home', 'work'
    line1               TEXT NOT NULL,
    line2               TEXT,
    city                TEXT,
    state               TEXT,
    pincode             TEXT,
    country_code        CHAR(2),                         -- ISO-3166-1 alpha-2
    is_primary          BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contact_addresses_contact
    ON public.contact_addresses(contact_uid);
CREATE INDEX idx_contact_addresses_city
    ON public.contact_addresses(tenant_uid, city) WHERE city IS NOT NULL;
CREATE INDEX idx_contact_addresses_pincode
    ON public.contact_addresses(tenant_uid, pincode) WHERE pincode IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- PART 7: CONTACT IDENTIFIERS (D-103)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contact_identifiers (
    identifier_uid      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    channel             TEXT NOT NULL CHECK (channel IN ('whatsapp', 'instagram', 'email', 'phone')),  -- D-099 reserved
    value               TEXT NOT NULL,                   -- E.164, IG handle, email address
    is_verified         BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_uid, channel, value)
);

CREATE INDEX idx_contact_identifiers_contact
    ON public.contact_identifiers(contact_uid);
CREATE INDEX idx_contact_identifiers_channel_value
    ON public.contact_identifiers(channel, value);

-- ══════════════════════════════════════════════════════════════════════
-- PART 8: CONTACT SOURCE EVENTS (D-103, from draft — kept)
-- ══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.contact_source_events (
    source_event_uid    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid          UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    contact_uid         UUID NOT NULL REFERENCES public.contacts(contact_uid) ON DELETE CASCADE,
    import_source       TEXT,                            -- 'csv', 'api', 'zapier', 'google_sheets'
    lead_source         TEXT,                            -- 'website', 'landing_page', 'meta_ad', 'referral', 'manual'
    campaign_name       TEXT,
    utm_source          TEXT,
    utm_campaign        TEXT,
    utm_medium          TEXT,
    meta_ad_id          TEXT,                            -- Meta Graph numeric ID (per 006 _uid convention: meta_ prefix)
    import_job_uid      UUID,                            -- bare uuid, no FK — import_jobs unbuilt (D-034, Import module)
    occurred_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_payload         JSONB
);

CREATE INDEX idx_contact_source_events_contact
    ON public.contact_source_events(contact_uid, occurred_at DESC);
CREATE INDEX idx_contact_source_events_lead_source
    ON public.contact_source_events(tenant_uid, lead_source) WHERE lead_source IS NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- PART 9: CAMPAIGN STATE GUARD (D-111)
-- ══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.guard_contact_custom_fields()
RETURNS TRIGGER AS $$
DECLARE
    v_key TEXT;
BEGIN
    FOREACH v_key IN ARRAY ARRAY(SELECT jsonb_object_keys(NEW.custom_fields))
    LOOP
        IF v_key ~* '^(campaign|broadcast|sequence|flow|last_offer|last_campaign|last_broadcast)' THEN
            RAISE EXCEPTION
                'custom_fields key "%" is campaign state (D-111) — write a contact_activity row instead',
                v_key;
        END IF;
    END LOOP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_contacts_guard_custom_fields
    BEFORE INSERT OR UPDATE OF custom_fields ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.guard_contact_custom_fields();

-- ══════════════════════════════════════════════════════════════════════
-- PART 10: RLS (D-108)
-- ══════════════════════════════════════════════════════════════════════

-- contacts RLS already exists from 20260804_inbox_conversations_messages.sql (verified correct pattern).
-- Add RLS for every new table using the live user_tenants + is_super_admin() pattern.

-- ── 10.1 contact_consent_events ──────────────────────────────────────
ALTER TABLE public.contact_consent_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_consent_events"
    ON public.contact_consent_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_consent_events"
    ON public.contact_consent_events FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.2 contact_activity ────────────────────────────────────────────
ALTER TABLE public.contact_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_activity"
    ON public.contact_activity FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_activity"
    ON public.contact_activity FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.3 labels ───────────────────────────────────────────────────────
ALTER TABLE public.labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on labels"
    ON public.labels FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on labels"
    ON public.labels FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.4 contact_labels ───────────────────────────────────────────────
ALTER TABLE public.contact_labels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_labels"
    ON public.contact_labels FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_labels"
    ON public.contact_labels FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.5 custom_field_defs ────────────────────────────────────────────
ALTER TABLE public.custom_field_defs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on custom_field_defs"
    ON public.custom_field_defs FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on custom_field_defs"
    ON public.custom_field_defs FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.6 contact_addresses ────────────────────────────────────────────
ALTER TABLE public.contact_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_addresses"
    ON public.contact_addresses FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_addresses"
    ON public.contact_addresses FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.7 contact_identifiers ──────────────────────────────────────────
ALTER TABLE public.contact_identifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_identifiers"
    ON public.contact_identifiers FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_identifiers"
    ON public.contact_identifiers FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ── 10.8 contact_source_events ────────────────────────────────────────
ALTER TABLE public.contact_source_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on contact_source_events"
    ON public.contact_source_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "Tenant isolation on contact_source_events"
    ON public.contact_source_events FOR ALL TO authenticated
    USING (
        tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
        OR public.is_super_admin()
    );

-- ══════════════════════════════════════════════════════════════════════
-- PART 11: VERIFICATION
-- ══════════════════════════════════════════════════════════════════════

SELECT 'Contacts module schema (demographics + consent + activity + labels + addresses + identifiers + source + guards + RLS) created successfully.' AS status;
