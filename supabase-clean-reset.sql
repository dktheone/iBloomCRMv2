-- ====================================================================
-- iBloomCRM v2 — Clean Database Reset & Schema Migration Script
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/bibbpavwvarzljqqwcef/sql)
-- ====================================================================

-- 1. Clean legacy test rows from public schema tables
DELETE FROM public.wa_account_events;
DELETE FROM public.wa_templates;
DELETE FROM public.wa_phone_numbers;
DELETE FROM public.wabas;
DELETE FROM public.provider_secrets;
DELETE FROM public.provider_config;
DELETE FROM public.user_tenants;
DELETE FROM public.users;
DELETE FROM public.tenants;

-- 2. Clean legacy test users from auth.users (if any exist)
DELETE FROM auth.users WHERE email = 'crm@ibloomsolutions.com';

-- 3. Ensure schema columns support dynamic random UUIDs and Master Agency flags
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS is_master_agency BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS mask_id VARCHAR(50) DEFAULT 'TENANT-ZERO';

CREATE UNIQUE INDEX IF NOT EXISTS idx_master_agency ON public.tenants (is_master_agency) WHERE is_master_agency = true;

-- 4. Enable Row Level Security (RLS) and add narrow SELECT policy for Master Agency initialization check
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public select on master agency status" ON public.tenants;
CREATE POLICY "Allow public select on master agency status" 
ON public.tenants 
FOR SELECT 
TO anon, authenticated 
USING (is_master_agency = true);

-- 5. Verify clean state
SELECT 'Clean DB reset complete! Ready for First-Time Setup Wizard (/setup).' as status;
