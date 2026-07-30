-- iBloomCRM v2 WABA Provider & Asset Schema Migration
-- File: 20260723_002_waba_provider.sql

-- 1. Provider Config (iBloomConnect Singleton Meta App identity)
CREATE TABLE IF NOT EXISTS public.provider_config (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meta_app_id VARCHAR(100) NOT NULL UNIQUE,
    app_mode VARCHAR(20) NOT NULL DEFAULT 'dev', -- dev, live
    app_category VARCHAR(100) NOT NULL DEFAULT 'Business Tools',
    privacy_policy_url TEXT NOT NULL DEFAULT 'https://crm.ibloomsolutions.com/privacy-policy',
    webhook_callback_url TEXT NOT NULL DEFAULT 'https://crm.ibloomsolutions.com/api/webhooks/meta',
    requested_scopes TEXT[] NOT NULL DEFAULT ARRAY['whatsapp_business_messaging', 'whatsapp_business_management'],
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Provider Secrets Table (Encrypted Vault storage)
CREATE TABLE IF NOT EXISTS public.provider_secrets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    provider_config_id UUID NOT NULL REFERENCES public.provider_config(id) ON DELETE CASCADE,
    encrypted_app_secret TEXT NOT NULL,
    encrypted_webhook_verify_token TEXT NOT NULL,
    encrypted_system_user_token TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. WABAs Table (Meta WhatsApp Business Accounts)
CREATE TABLE IF NOT EXISTS public.wabas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    waba_id VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    timezone VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    account_review_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED
    health_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- HEALTHY, DEGRADED, RESTRICTED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. WhatsApp Phone Numbers Table
CREATE TABLE IF NOT EXISTS public.wa_phone_numbers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    waba_id UUID NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
    phone_number_id VARCHAR(100) UNIQUE NOT NULL,
    display_phone_number VARCHAR(50) NOT NULL,
    verified_name VARCHAR(255) NOT NULL,
    quality_rating VARCHAR(20) NOT NULL DEFAULT 'GREEN', -- GREEN, YELLOW, RED, UNKNOWN
    code_verification_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- NOT_VERIFIED, VERIFIED
    is_test_number BOOLEAN NOT NULL DEFAULT FALSE,
    health_status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- HEALTHY, WARNING, CRITICAL
    messaging_limit_tier VARCHAR(50) NOT NULL DEFAULT 'TIER_NOT_SET', -- TIER_NOT_SET, TIER_1K, TIER_10K, TIER_100K, UNLIMITED
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. WhatsApp Message Templates Table
CREATE TABLE IF NOT EXISTS public.wa_templates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    waba_id UUID NOT NULL REFERENCES public.wabas(id) ON DELETE CASCADE,
    meta_template_id VARCHAR(100),
    name VARCHAR(255) NOT NULL,
    language VARCHAR(10) NOT NULL DEFAULT 'en_US',
    category VARCHAR(50) NOT NULL DEFAULT 'UTILITY', -- UTILITY, MARKETING, AUTHENTICATION
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, ARCHIVED
    components JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(waba_id, name, language)
);

-- Seed Default Provider Config for ibloom_connect
INSERT INTO public.provider_config (id, meta_app_id, app_mode, app_category, privacy_policy_url, webhook_callback_url)
VALUES (
    '99999999-9999-9999-9999-999999999999',
    '847291048291048',
    'live',
    'Tech Provider / CRM',
    'https://crm.ibloomsolutions.com/privacy-policy',
    'https://crm.ibloomsolutions.com/api/webhooks/meta'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.provider_secrets (provider_config_id, encrypted_app_secret, encrypted_webhook_verify_token, encrypted_system_user_token)
VALUES (
    '99999999-9999-9999-9999-999999999999',
    'enc_v1_8f93a109b4d8e72c',
    'enc_v1_ibloom_secure_verify_tok_99',
    'enc_v1_EAAG847291048291048_system_user_token_live'
) ON CONFLICT (id) DO NOTHING;

-- Seed Sample Master WABA & Phone Numbers
INSERT INTO public.wabas (id, tenant_id, waba_id, name, currency, timezone, account_review_status, health_status)
VALUES (
    '88888888-8888-8888-8888-888888888888',
    '00000000-0000-0000-0000-000000000000',
    '108492048102948',
    'iBloom Master Agency WABA',
    'INR',
    'Asia/Kolkata',
    'PENDING',
    'PENDING'
) ON CONFLICT (id) DO NOTHING;

-- INSERT INTO public.wa_phone_numbers (tenant_id, waba_id, phone_number_id, display_phone_number, verified_name, quality_rating, is_test_number, health_status, messaging_limit_tier)
-- VALUES 
-- (
--     '00000000-0000-0000-0000-000000000000',
--     '88888888-8888-8888-8888-888888888888',
--     '105938201948271',
--     '+1 555 019 2831',
--     'iBloom Meta Test Number 1',
--     'GREEN',
--     TRUE,
--     'HEALTHY',
--     'TIER_1K'
-- ),
-- (
--     '00000000-0000-0000-0000-000000000000',
--     '88888888-8888-8888-8888-888888888888',
--     '105938201948272',
--     '+1 555 019 2832',
--     'iBloom Meta Test Number 2',
--     'GREEN',
--     TRUE,
--     'HEALTHY',
--     'TIER_1K'
-- ),
-- (
--     '00000000-0000-0000-0000-000000000000',
--     '88888888-8888-8888-8888-888888888888',
--     '105938201948999',
--     '+91 98765 43210',
--     'iBloom Official Master Line',
--     'GREEN',
--     FALSE,
--     'HEALTHY',
--     'TIER_10K'
-- ) ON CONFLICT DO NOTHING;

-- Seed Sample WhatsApp Templates
-- INSERT INTO public.wa_templates (tenant_id, waba_id, meta_template_id, name, language, category, status, components)
-- VALUES 
-- (
--     '00000000-0000-0000-0000-000000000000',
--     '88888888-8888-8888-8888-888888888888',
--     'tmpl_1001',
--     'welcome_onboarding_alert',
--     'en_US',
--     'UTILITY',
--     'APPROVED',
--     '[{"type": "HEADER", "format": "TEXT", "text": "Welcome to {{1}}"}, {"type": "BODY", "text": "Hello {{2}}, your Master Agency profile has been successfully configured. Your App ID is {{3}}."}, {"type": "FOOTER", "text": "iBloom CRM Security Alert"}]'::jsonb
-- ),
-- (
--     '00000000-0000-0000-0000-000000000000',
--     '88888888-8888-8888-8888-888888888888',
--     'tmpl_1002',
--     'asset_health_warning',
--     'en_US',
--     'UTILITY',
--     'APPROVED',
--     '[{"type": "BODY", "text": "Alert: Phone Number {{1}} quality rating changed to {{2}}. Please check your messaging limits."}, {"type": "FOOTER", "text": "iBloom Asset Monitor"}]'::jsonb
-- ) ON CONFLICT DO NOTHING;
