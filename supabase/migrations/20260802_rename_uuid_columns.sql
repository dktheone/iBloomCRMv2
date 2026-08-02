-- iBloomCRM v2 Standardized UUID _uid Naming Refactoring Migration
-- File: 20260802_rename_uuid_columns.sql

-- 1. Drop existing RLS policies on tables
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wabas" ON public.wabas;
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wa_phone_numbers" ON public.wa_phone_numbers;
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on wa_templates" ON public.wa_templates;
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on tenant_secrets" ON public.tenant_secrets;
DROP POLICY IF EXISTS "Tenant isolation with Super Admin global access on user_tenants" ON public.user_tenants;

-- 2. Drop existing foreign key constraints
ALTER TABLE public.user_tenants DROP CONSTRAINT IF EXISTS user_tenants_user_id_fkey;
ALTER TABLE public.user_tenants DROP CONSTRAINT IF EXISTS user_tenants_tenant_id_fkey;
ALTER TABLE public.tenant_secrets DROP CONSTRAINT IF EXISTS tenant_secrets_tenant_id_fkey;
ALTER TABLE public.provider_secrets DROP CONSTRAINT IF EXISTS provider_secrets_provider_config_id_fkey;
ALTER TABLE public.wabas DROP CONSTRAINT IF EXISTS wabas_tenant_id_fkey;
ALTER TABLE public.wa_phone_numbers DROP CONSTRAINT IF EXISTS wa_phone_numbers_tenant_id_fkey;
ALTER TABLE public.wa_phone_numbers DROP CONSTRAINT IF EXISTS wa_phone_numbers_waba_id_fkey;
ALTER TABLE public.wa_templates DROP CONSTRAINT IF EXISTS wa_templates_tenant_id_fkey;
ALTER TABLE public.wa_templates DROP CONSTRAINT IF EXISTS wa_templates_waba_id_fkey;

-- 3. Rename columns in public.tenants
ALTER TABLE public.tenants RENAME COLUMN id TO tenant_uid;

-- 4. Rename columns in public.users
ALTER TABLE public.users RENAME COLUMN id TO user_uid;

-- 5. Rename columns in public.user_tenants
ALTER TABLE public.user_tenants RENAME COLUMN id TO membership_uid;
ALTER TABLE public.user_tenants RENAME COLUMN user_id TO user_uid;
ALTER TABLE public.user_tenants RENAME COLUMN tenant_id TO tenant_uid;

-- 6. Rename columns in public.tenant_secrets
ALTER TABLE public.tenant_secrets RENAME COLUMN id TO secret_uid;
ALTER TABLE public.tenant_secrets RENAME COLUMN tenant_id TO tenant_uid;

-- 7. Rename columns in public.provider_config
ALTER TABLE public.provider_config RENAME COLUMN id TO config_uid;

-- 8. Rename columns in public.provider_secrets
ALTER TABLE public.provider_secrets RENAME COLUMN id TO secret_uid;
ALTER TABLE public.provider_secrets RENAME COLUMN provider_config_id TO config_uid;

-- 9. Rename columns in public.wabas
ALTER TABLE public.wabas RENAME COLUMN id TO waba_uid;
ALTER TABLE public.wabas RENAME COLUMN tenant_id TO tenant_uid;
ALTER TABLE public.wabas RENAME COLUMN waba_id TO meta_waba_id;

-- 10. Rename columns in public.wa_phone_numbers
ALTER TABLE public.wa_phone_numbers RENAME COLUMN id TO phone_line_uid;
ALTER TABLE public.wa_phone_numbers RENAME COLUMN tenant_id TO tenant_uid;
ALTER TABLE public.wa_phone_numbers RENAME COLUMN waba_id TO waba_uid;
ALTER TABLE public.wa_phone_numbers RENAME COLUMN phone_number_id TO meta_phone_number_id;

-- 11. Rename columns in public.wa_templates
ALTER TABLE public.wa_templates RENAME COLUMN id TO template_uid;
ALTER TABLE public.wa_templates RENAME COLUMN tenant_id TO tenant_uid;
ALTER TABLE public.wa_templates RENAME COLUMN waba_id TO waba_uid;

-- 12. Recreate Foreign Key Constraints
ALTER TABLE public.user_tenants ADD CONSTRAINT user_tenants_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.users(user_uid) ON DELETE CASCADE;
ALTER TABLE public.user_tenants ADD CONSTRAINT user_tenants_tenant_uid_fkey FOREIGN KEY (tenant_uid) REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE;

ALTER TABLE public.tenant_secrets ADD CONSTRAINT tenant_secrets_tenant_uid_fkey FOREIGN KEY (tenant_uid) REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE;
ALTER TABLE public.provider_secrets ADD CONSTRAINT provider_secrets_config_uid_fkey FOREIGN KEY (config_uid) REFERENCES public.provider_config(config_uid) ON DELETE CASCADE;

ALTER TABLE public.wabas ADD CONSTRAINT wabas_tenant_uid_fkey FOREIGN KEY (tenant_uid) REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE;

ALTER TABLE public.wa_phone_numbers ADD CONSTRAINT wa_phone_numbers_tenant_uid_fkey FOREIGN KEY (tenant_uid) REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE;
ALTER TABLE public.wa_phone_numbers ADD CONSTRAINT wa_phone_numbers_waba_uid_fkey FOREIGN KEY (waba_uid) REFERENCES public.wabas(waba_uid) ON DELETE CASCADE;

ALTER TABLE public.wa_templates ADD CONSTRAINT wa_templates_tenant_uid_fkey FOREIGN KEY (tenant_uid) REFERENCES public.tenants(tenant_uid) ON DELETE CASCADE;
ALTER TABLE public.wa_templates ADD CONSTRAINT wa_templates_waba_uid_fkey FOREIGN KEY (waba_uid) REFERENCES public.wabas(waba_uid) ON DELETE CASCADE;

-- 13. Recreate Unique Constraints
ALTER TABLE public.wa_templates DROP CONSTRAINT IF EXISTS wa_templates_waba_id_name_language_key;
ALTER TABLE public.wa_templates ADD CONSTRAINT wa_templates_waba_uid_name_language_key UNIQUE(waba_uid, name, language);

-- 14. Recreate RLS Policies
CREATE POLICY "Tenant isolation with Super Admin global access on wabas" 
ON public.wabas FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users WHERE user_uid = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Tenant isolation with Super Admin global access on wa_phone_numbers" 
ON public.wa_phone_numbers FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users WHERE user_uid = auth.uid() AND role = 'super_admin')
);

CREATE POLICY "Tenant isolation with Super Admin global access on wa_templates" 
ON public.wa_templates FOR ALL TO authenticated 
USING (
  tenant_uid IN (SELECT tenant_uid FROM public.user_tenants WHERE user_uid = auth.uid())
  OR EXISTS (SELECT 1 FROM public.users WHERE user_uid = auth.uid() AND role = 'super_admin')
);
