-- Migration: Add WABA Onboarding & Template Namespace Fields
-- Description: Adds message_template_namespace, business_id, messaging_limit_tier to WABA & Phone tables.

-- 1. Alter public.wabas
ALTER TABLE IF EXISTS public.wabas
ADD COLUMN IF NOT EXISTS message_template_namespace text,
ADD COLUMN IF NOT EXISTS business_id text,
ADD COLUMN IF NOT EXISTS business_verification_status text DEFAULT 'UNVERIFIED';

-- 2. Alter public.wa_phone_numbers
ALTER TABLE IF EXISTS public.wa_phone_numbers
ADD COLUMN IF NOT EXISTS messaging_limit_tier text DEFAULT 'TIER_1K',
ADD COLUMN IF NOT EXISTS name_status text DEFAULT 'NOT_APPROVED';

-- 3. Alter public.provider_config
ALTER TABLE IF EXISTS public.provider_config
ADD COLUMN IF NOT EXISTS business_id text,
ADD COLUMN IF NOT EXISTS primary_waba_id text;
