-- iBloomCRM v2 WhatsApp Message Templates Module Schema Migration
-- File: 20260801_templates_module_schema.sql

-- 1. Ensure public.wa_templates table has helper columns for fast indexing
ALTER TABLE public.wa_templates 
  ADD COLUMN IF NOT EXISTS marketing_subtype VARCHAR(50) DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS offer_text VARCHAR(60),
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_wa_templates_category ON public.wa_templates(category);
CREATE INDEX IF NOT EXISTS idx_wa_templates_status ON public.wa_templates(status);
CREATE INDEX IF NOT EXISTS idx_wa_templates_marketing_subtype ON public.wa_templates(marketing_subtype);

-- 2. Enable Row Level Security (RLS) on public.wa_templates
ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wa_templates" ON public.wa_templates;
CREATE POLICY "Tenant isolation with Super Admin global access on wa_templates" 
ON public.wa_templates 
FOR ALL 
TO authenticated 
USING (
  tenant_id IN (SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'super_admin')
);
