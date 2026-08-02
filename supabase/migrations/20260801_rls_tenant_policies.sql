-- Migration: 20260801_rls_tenant_policies.sql
-- Description: Multi-Tenant RLS Policies on public.wabas and public.wa_phone_numbers with Super Admin Global Access Bypass

-- 1. Enable Row Level Security (RLS)
ALTER TABLE public.wabas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_phone_numbers ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if any
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wabas" ON public.wabas;
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wa_phone_numbers" ON public.wa_phone_numbers;
DROP POLICY IF EXISTS "Allow authenticated tenant access to wabas" ON public.wabas;
DROP POLICY IF EXISTS "Allow authenticated tenant access to wa_phone_numbers" ON public.wa_phone_numbers;

-- 3. Dual-Rule RLS Policy for WABAs
CREATE POLICY "Tenant isolation with Super Admin global access on wabas" 
ON public.wabas 
FOR ALL 
TO authenticated 
USING (
  -- Rule A: Regular Tenant User can ONLY access their own tenant's WABAs
  tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid())
  OR 
  -- Rule B: Master Agency Super Admin gets Global Access across ALL tenants
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

-- 4. Dual-Rule RLS Policy for Phone Numbers
CREATE POLICY "Tenant isolation with Super Admin global access on wa_phone_numbers" 
ON public.wa_phone_numbers 
FOR ALL 
TO authenticated 
USING (
  -- Rule A: Regular Tenant User can ONLY access their own tenant's phone numbers
  tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid())
  OR 
  -- Rule B: Master Agency Super Admin gets Global Access across ALL tenants
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);

COMMENT ON POLICY "Tenant isolation with Super Admin global access on wabas" ON public.wabas IS 'Enforces multi-tenant isolation for client agencies while allowing super_admin global access.';
COMMENT ON POLICY "Tenant isolation with Super Admin global access on wa_phone_numbers" ON public.wa_phone_numbers IS 'Enforces multi-tenant isolation for client agencies while allowing super_admin global access.';
