-- Migration: 20260806_admin_consent_override.sql
-- Description: Allow Super Admin consent status overrides (reverting from opted_out when source is 'admin_override')

CREATE OR REPLACE FUNCTION public.contacts_sticky_opt_out()
RETURNS TRIGGER AS $$
BEGIN
    -- Guard: opt-out is terminal (D-032) for standard end-users, but allows Super Admin override
    IF OLD.opt_in_status = 'opted_out' AND NEW.opt_in_status <> 'opted_out' THEN
        IF NEW.opt_in_source NOT IN ('admin_override', 'super_admin', 'manual_override') 
           AND current_setting('role', true) NOT IN ('service_role', 'supabase_admin') THEN
            RAISE EXCEPTION 'opt_in_status: opted_out is terminal (D-032) — cannot revert to % from opted_out without admin_override source', NEW.opt_in_status;
        END IF;
    END IF;

    -- Write consent event on every status change
    IF OLD.opt_in_status IS DISTINCT FROM NEW.opt_in_status THEN
        INSERT INTO public.contact_consent_events (
            tenant_uid, contact_uid, from_status, to_status, source, channel, actor_user_uid, occurred_at, metadata
        ) VALUES (
            NEW.tenant_uid,
            NEW.contact_uid,
            OLD.opt_in_status,
            NEW.opt_in_status,
            COALESCE(NEW.opt_in_source, 'manual'),
            'admin',
            auth.uid(),
            NOW(),
            jsonb_build_object('admin_override', NEW.opt_in_source IN ('admin_override', 'super_admin', 'manual_override'))
        );

        -- Stamp the timestamps
        IF NEW.opt_in_status = 'opted_in' THEN
            NEW.opt_in_at := NOW();
        END IF;
        IF NEW.opt_in_status = 'opted_out' THEN
            NEW.opt_out_at := NOW();
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
