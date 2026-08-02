-- iBloomCRM v2 WhatsApp Message Templates Lifecycle & Locking Migration
-- File: 20260802_wa_templates_lifecycle.sql

-- Add local_staging_status and is_locked columns to public.wa_templates
ALTER TABLE public.wa_templates 
  ADD COLUMN IF NOT EXISTS local_staging_status VARCHAR(50) DEFAULT 'DISCOVERED',
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;

-- Create indexes for fast filtering by WABA, staging status, and locking state
CREATE INDEX IF NOT EXISTS idx_wa_templates_waba_staging ON public.wa_templates(waba_uid, local_staging_status);
CREATE INDEX IF NOT EXISTS idx_wa_templates_is_locked ON public.wa_templates(waba_uid, is_locked);
