-- Migration: 20260801_asset_lifecycle_columns.sql
-- Description: Add physical columns lifecycle_status and is_locked to public.wa_phone_numbers for Unified 3-Stage Asset Lifecycle Engine

ALTER TABLE public.wa_phone_numbers 
ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'PROVISIONED',
ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;

-- Index for high-speed lifecycle status querying
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_lifecycle_status ON public.wa_phone_numbers(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_wa_phone_numbers_is_locked ON public.wa_phone_numbers(is_locked);

COMMENT ON COLUMN public.wa_phone_numbers.lifecycle_status IS 'Internal CRM Lifecycle Stage: PROVISIONED, LOCKED, LIVE_OPERATIONAL, UNLOCKED_STANDBY';
COMMENT ON COLUMN public.wa_phone_numbers.is_locked IS 'True if asset is locked to Tenant Zero CRM for active WhatsApp operations';
