-- ====================================================================
-- iBloomCRM v2 — Inbox Module Amendments (Campaign State Isolation)
-- File: 20260805_inbox_amendments.sql
-- Decisions: D-113 (conversation re-open rule from campaign-state isolation Tier 2)
-- Depends on: 20260804_inbox_conversations_messages.sql (already executed)
-- Run in Supabase SQL Editor AFTER 20260805_contacts_module.sql
-- ====================================================================

-- CONTEXT: The campaign-state isolation analysis (blueprint/008-campaign-state-isolation.md)
-- identified that conversation state (lifecycle_status, tags[], assigned_to, is_pinned)
-- carries over across campaigns unless given clear rules. D-113 locks the re-open rule:
--
-- - An OUTBOUND campaign send does NOT reopen a 'resolved' conversation
-- - An INBOUND reply DOES reopen it (resolved → open, reopened_at set)
-- - A campaign send does not inherit Feb's tags[] or assignment
--
-- The existing trigger update_conversation_on_message() (20260804...:168-210) updates
-- last_message_at, preview, direction, unread_count, last_inbound_at, and window_expires_at,
-- but it currently writes lifecycle_status NOT AT ALL. This migration ADDS the reopen logic.

-- ══════════════════════════════════════════════════════════════════════
-- PART 1: ADD reopened_at COLUMN
-- ══════════════════════════════════════════════════════════════════════

ALTER TABLE public.conversations
    ADD COLUMN IF NOT EXISTS reopened_at TIMESTAMPTZ;

COMMENT ON COLUMN public.conversations.reopened_at IS
'D-113: Timestamp when a resolved conversation was reopened by an inbound message. NULL when never reopened or currently open/pending.';

-- ══════════════════════════════════════════════════════════════════════
-- PART 2: AMEND TRIGGER — ADD REOPEN-ON-INBOUND LOGIC (D-113)
-- ══════════════════════════════════════════════════════════════════════

-- This CREATE OR REPLACE preserves the existing logic and ADDS lifecycle_status handling.
-- Only inbound messages reopen resolved threads; outbound campaign sends do not.

CREATE OR REPLACE FUNCTION public.update_conversation_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_preview TEXT;
BEGIN
    -- Build message preview (emoji-prefixed per type)
    CASE NEW.message_type
        WHEN 'template' THEN v_preview := '📋 ' || COALESCE(NEW.content->>'name', 'Template');
        WHEN 'image'    THEN v_preview := '📷 Image';
        WHEN 'video'    THEN v_preview := '🎥 Video';
        WHEN 'audio'    THEN v_preview := '🎙 Audio';
        WHEN 'document' THEN v_preview := '📄 ' || COALESCE(NEW.content->>'filename', 'Document');
        WHEN 'location' THEN v_preview := '📍 Location';
        WHEN 'sticker'  THEN v_preview := '😊 Sticker';
        WHEN 'interactive' THEN v_preview := '🔘 ' || COALESCE(NEW.content->>'type', 'Interactive');
        WHEN 'system'   THEN v_preview := '⚙ ' || COALESCE(NEW.content->>'body', 'System');
        ELSE v_preview := '💬 ' || LEFT(COALESCE(NEW.content->>'body', ''), 80);
    END CASE;

    -- Update conversation state
    UPDATE public.conversations
    SET
        last_message_at       = NEW.created_at,
        last_message_preview  = v_preview,
        last_message_direction = NEW.direction,
        unread_count          = CASE
                                    WHEN NEW.direction = 'inbound' THEN unread_count + 1
                                    ELSE unread_count
                                END,
        last_inbound_at       = CASE
                                    WHEN NEW.direction = 'inbound' THEN NEW.created_at
                                    ELSE last_inbound_at
                                END,
        window_expires_at     = CASE
                                    WHEN NEW.direction = 'inbound' THEN NEW.created_at + INTERVAL '24 hours'
                                    ELSE window_expires_at
                                END,

        -- D-113: Inbound messages reopen resolved threads; outbound does not
        lifecycle_status      = CASE
                                    WHEN NEW.direction = 'inbound' AND lifecycle_status = 'resolved'
                                    THEN 'open'
                                    ELSE lifecycle_status
                                END,
        reopened_at           = CASE
                                    WHEN NEW.direction = 'inbound' AND lifecycle_status = 'resolved'
                                    THEN NEW.created_at
                                    ELSE reopened_at
                                END,

        updated_at            = NOW()
    WHERE conversation_uid = NEW.conversation_uid;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_conversation_on_message IS
'D-113: AFTER INSERT on messages. Updates conversation state including last_message preview, unread count, 24h window on inbound, and reopens resolved threads ONLY on inbound replies (not on outbound campaign sends).';

-- ══════════════════════════════════════════════════════════════════════
-- PART 3: VERIFICATION
-- ══════════════════════════════════════════════════════════════════════

SELECT 'Inbox amendments (D-113 reopen-on-inbound) applied successfully.' AS status;

-- ══════════════════════════════════════════════════════════════════════
-- DEFERRED (Inbox-owned, deliberately NOT changed here)
-- ══════════════════════════════════════════════════════════════════════

-- conversations.tags TEXT[] → join table
--   Reason: Inbox is mid-build; the array→join migration belongs to that module.
--   Filed as a follow-up. This amendment does not touch tags.
