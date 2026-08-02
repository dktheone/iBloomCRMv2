-- ====================================================================
-- iBloomCRM v2 — Complete Master Clean Reset & Schema Script
-- File: 20260802_complete_clean_reset.sql
-- Purpose: Completely drops all existing tables/triggers/policies and 
--          recreates the full multi-tenant schema with standardized _uid 
--          columns, auth.users integration, and non-recursive RLS policies.
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/bibbpavwvarzljqqwcef/sql
-- ====================================================================

-- 1. Enable UUID Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Clean/Drop Legacy Triggers & Functions on auth.users and public
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin() CASCADE;

-- 3. Clean/Drop Legacy Tables (Cascading Drop)
DROP TABLE IF EXISTS public.wa_account_events CASCADE;
DROP TABLE IF EXISTS public.wa_templates CASCADE;
DROP TABLE IF EXISTS public.wa_phone_numbers CASCADE;
DROP TABLE IF EXISTS public.wabas CASCADE;
DROP TABLE IF EXISTS public.provider_secrets CASCADE;
DROP TABLE IF EXISTS public.provider_config CASCADE;
DROP TABLE IF EXISTS public.tenant_secrets CASCADE;
DROP TABLE IF EXISTS public.user_tenants CASCADE;
DROP TABLE IF EXISTS public.users CASCADE;
DROP TABLE IF EXISTS public.tenants CASCADE;
DROP TABLE IF EXISTS public.validation_audit_logs CASCADE;

-- Clean legacy auth users if any
DELETE FROM auth.users WHERE email = 'crm@ibloomsolutions.com';

-- ====================================================================
-- 4. CREATE FOUNDATION TABLES WITH STANDARDIZED _uid COLUMNS
-- ====================================================================

-- 4.1 Tenants Table (Spine of Multi-Tenancy)
CREATE TABLE public.tenants (
    tenant_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    is_master_agency BOOLEAN NOT NULL DEFAULT FALSE,
    mask_id VARCHAR(50) DEFAULT 'TENANT-ZERO',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_master_agency ON public.tenants (is_master_agency) WHERE is_master_agency = true;

-- 4.2 Users Table
CREATE TABLE public.users (
    user_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'tenant_user',
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3 User Tenants Junction (Multi-membership support)
CREATE TABLE public.user_tenants (
    membership_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_uid UUID NOT NULL REFERENCES public.users(user_uid) ON DELETE CASCADE,
    tenant_uid UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_uid, tenant_uid)
);

-- 4.4 Tenant Secrets Table (Vault-backed isolation)
CREATE TABLE public.tenant_secrets (
    secret_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    secret_key VARCHAR(100) NOT NULL,
    encrypted_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(tenant_uid, secret_key)
);

-- 4.5 Provider Config (iBloomConnect Singleton Meta App identity)
CREATE TABLE public.provider_config (
    config_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meta_app_id VARCHAR(100) NOT NULL UNIQUE,
    app_mode VARCHAR(20) NOT NULL DEFAULT 'dev',
    app_category VARCHAR(100) NOT NULL DEFAULT 'Business Tools',
    privacy_policy_url TEXT NOT NULL DEFAULT 'https://crm.ibloomsolutions.com/privacy-policy',
    webhook_callback_url TEXT NOT NULL DEFAULT 'https://crm.ibloomsolutions.com/api/webhooks/meta',
    requested_scopes TEXT[] NOT NULL DEFAULT ARRAY['whatsapp_business_messaging', 'whatsapp_business_management'],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6 Provider Secrets Table
CREATE TABLE public.provider_secrets (
    secret_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    config_uid UUID NOT NULL REFERENCES public.provider_config(config_uid) ON DELETE CASCADE,
    encrypted_app_secret TEXT NOT NULL,
    encrypted_webhook_verify_token TEXT NOT NULL,
    encrypted_system_user_token TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.7 WABAs Table (Meta WhatsApp Business Accounts)
CREATE TABLE public.wabas (
    waba_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    meta_waba_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    account_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    health_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.8 WhatsApp Phone Numbers Table
CREATE TABLE public.wa_phone_numbers (
    phone_line_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    waba_uid UUID NOT NULL REFERENCES public.wabas(waba_uid) ON DELETE CASCADE,
    meta_phone_number_id VARCHAR(100) UNIQUE NOT NULL,
    display_phone_number VARCHAR(50) NOT NULL,
    verified_name VARCHAR(255) NOT NULL,
    quality_rating VARCHAR(20) NOT NULL DEFAULT 'GREEN',
    code_verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    is_test_number BOOLEAN NOT NULL DEFAULT FALSE,
    health_status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    messaging_limit_tier VARCHAR(50) NOT NULL DEFAULT 'TIER_NOT_SET',
    lifecycle_status TEXT DEFAULT 'PROVISIONED',
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wa_phone_numbers_lifecycle_status ON public.wa_phone_numbers(lifecycle_status);
CREATE INDEX idx_wa_phone_numbers_is_locked ON public.wa_phone_numbers(is_locked);

-- 4.9 WhatsApp Message Templates Table
CREATE TABLE public.wa_templates (
    template_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid UUID NOT NULL REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    waba_uid UUID NOT NULL REFERENCES public.wabas(waba_uid) ON DELETE CASCADE,
    meta_template_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en_US',
    category VARCHAR(50) NOT NULL DEFAULT 'UTILITY',
    marketing_subtype VARCHAR(50) DEFAULT 'STANDARD',
    offer_text VARCHAR(60),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    rejected_reason TEXT,
    local_staging_status VARCHAR(50) DEFAULT 'DISCOVERED',
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(waba_uid, name, language)
);

CREATE INDEX idx_wa_templates_category ON public.wa_templates(category);
CREATE INDEX idx_wa_templates_status ON public.wa_templates(status);
CREATE INDEX idx_wa_templates_waba_staging ON public.wa_templates(waba_uid, local_staging_status);

-- 4.10 Validation Audit Logs Table
CREATE TABLE public.validation_audit_logs (
    log_uid UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_uid UUID REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    target_id VARCHAR(255),
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ====================================================================
-- 5. AUTH USERS AUTO-SYNC TRIGGER & NON-RECURSIVE HELPER FUNCTIONS
-- ====================================================================

-- 5.1 Non-recursive Super Admin check helper (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users 
    WHERE user_uid = auth.uid() AND role = 'super_admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 5.2 Auto-sync function from auth.users to public.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (user_uid, email, full_name, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Super Admin'),
    'super_admin'
  )
  ON CONFLICT (user_uid) DO UPDATE 
  SET email = EXCLUDED.email, updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES & SERVICE ROLE BYPASS
-- ====================================================================
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wabas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.validation_audit_logs ENABLE ROW LEVEL SECURITY;

-- Service Role Full Access Policies
CREATE POLICY "Service role full access on tenants" ON public.tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on users" ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on user_tenants" ON public.user_tenants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on tenant_secrets" ON public.tenant_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on provider_config" ON public.provider_config FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on provider_secrets" ON public.provider_secrets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on wabas" ON public.wabas FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on wa_phone_numbers" ON public.wa_phone_numbers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on wa_templates" ON public.wa_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on validation_audit_logs" ON public.validation_audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated User Policies
CREATE POLICY "Allow public select on master agency status" 
ON public.tenants FOR SELECT TO anon, authenticated 
USING (is_master_agency = true);

-- NON-RECURSIVE policy for public.users
CREATE POLICY "Allow user or super_admin to select profiles" 
ON public.users FOR SELECT TO authenticated 
USING (user_uid = auth.uid() OR public.is_super_admin());

CREATE POLICY "Allow user to select own tenant memberships" 
ON public.user_tenants FOR SELECT TO authenticated 
USING (user_uid = auth.uid() OR public.is_super_admin());

CREATE POLICY "Tenant isolation with Super Admin global access on wabas" 
ON public.wabas FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Tenant isolation with Super Admin global access on wa_phone_numbers" 
ON public.wa_phone_numbers FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR public.is_super_admin()
);

CREATE POLICY "Tenant isolation with Super Admin global access on wa_templates" 
ON public.wa_templates FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR public.is_super_admin()
);

-- ====================================================================
-- 7. Verification Output
-- ====================================================================
SELECT 'Complete Master Database Reset Finished! Schema, auth triggers, non-recursive helper, and RLS policies updated cleanly.' as status;
