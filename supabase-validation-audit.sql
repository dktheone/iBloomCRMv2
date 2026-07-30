-- ====================================================================
-- iBloomCRM v2 — Security Validation Audit Log Schema Migration
-- Run this script in the Supabase SQL Editor (https://supabase.com/dashboard/project/bibbpavwvarzljqqwcef/sql)
-- ====================================================================

-- 1. Create validation_audit_logs table
CREATE TABLE IF NOT EXISTS public.validation_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
    form_surface VARCHAR(100) NOT NULL, -- e.g., 'setup_wizard', 'asset_enrollment', 'template_saving'
    rejected_field VARCHAR(100) NOT NULL, -- e.g., 'superAdminPhone', 'password'
    failure_reason TEXT NOT NULL, -- e.g., 'Invalid E.164 phone format'
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Enable Row Level Security (RLS)
ALTER TABLE public.validation_audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policy for Super Admin View
DROP POLICY IF EXISTS "Super admin view validation logs" ON public.validation_audit_logs;
CREATE POLICY "Super admin view validation logs" 
ON public.validation_audit_logs 
FOR SELECT 
TO authenticated 
USING (
    EXISTS (
        SELECT 1 FROM public.users 
        WHERE users.id = auth.uid() AND users.role = 'super_admin'
    )
);

-- 4. Verify table creation
SELECT 'Validation Audit Log Table Created Successfully!' as status;
