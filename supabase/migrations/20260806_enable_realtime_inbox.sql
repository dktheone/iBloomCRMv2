-- ====================================================================
-- iBloomCRM v2 — Enable Supabase Realtime for the Inbox
-- File: 20260806_enable_realtime_inbox.sql
-- Decisions: D-101 (live inbox updates)
-- Depends on: 20260804_inbox_conversations_messages.sql
-- Run in Supabase SQL Editor
-- ====================================================================
--
-- WHY THIS IS A SEPARATE FILE
--
-- 20260804_inbox_conversations_messages.sql shipped with these two
-- ALTER PUBLICATION statements commented out (lines 251-252). That file is
-- already applied and is therefore immutable — standing project rule. So the
-- statements are re-issued here as a new migration rather than by editing the
-- original.
--
-- WHAT THIS FIXES
--
-- app/(platform)/inbox/page.tsx already subscribes to three postgres_changes
-- channels (conversation list, message INSERT, message UPDATE). Without the
-- tables in the supabase_realtime publication those subscriptions connect
-- successfully and then receive nothing, forever — a silent failure with no
-- error surfaced anywhere.
--
-- Everything below is idempotent and safe to re-run.

-- ══════════════════════════════════════════════════════════════════════
-- PART 1: ADD TABLES TO THE REALTIME PUBLICATION
-- ══════════════════════════════════════════════════════════════════════

-- ALTER PUBLICATION ... ADD TABLE has no IF NOT EXISTS form and errors with
-- 42710 if the table is already a member, so each add is guarded.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'conversations'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
        RAISE NOTICE 'Added public.conversations to supabase_realtime';
    ELSE
        RAISE NOTICE 'public.conversations already in supabase_realtime — skipped';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename  = 'messages'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
        RAISE NOTICE 'Added public.messages to supabase_realtime';
    ELSE
        RAISE NOTICE 'public.messages already in supabase_realtime — skipped';
    END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- PART 2: REPLICA IDENTITY
-- ══════════════════════════════════════════════════════════════════════
--
-- Postgres defaults to REPLICA IDENTITY DEFAULT, which puts only the primary
-- key in an UPDATE's `old` record. Supabase Realtime's `new` record is also
-- restricted to replicated columns.
--
-- The inbox's message-UPDATE subscription replaces a whole row in React state
-- from payload.new:
--
--     setMessages(prev => prev.map(m =>
--       m.message_uid === (payload.new as Message).message_uid
--         ? (payload.new as Message)   -- ← needs every column, not just the PK
--         : m
--     ));
--
-- This is exactly the path a delivery-status webhook will drive (queued → sent
-- → delivered → read). Without FULL, the tick would update from a partial row
-- and blank out the message body. FULL is required here, not optional.
ALTER TABLE public.messages      REPLICA IDENTITY FULL;

-- conversations is refetched rather than patched in place, so FULL is not
-- strictly required — but the list depends on unread_count, last_message_*,
-- and window_expires_at, and RLS filtering of realtime rows is more predictable
-- when the whole row is present.
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

-- ══════════════════════════════════════════════════════════════════════
-- PART 3: VERIFICATION
-- ══════════════════════════════════════════════════════════════════════

SELECT
    schemaname,
    tablename,
    'in supabase_realtime' AS status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename IN ('conversations', 'messages')
ORDER BY tablename;

-- Expect: relreplident = 'f' (FULL) for both.
SELECT
    c.relname       AS table_name,
    c.relreplident  AS replica_identity
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('conversations', 'messages')
ORDER BY c.relname;

SELECT 'Realtime enabled for public.conversations and public.messages (D-101).' AS status;

-- ══════════════════════════════════════════════════════════════════════
-- NOTE ON SECURITY
-- ══════════════════════════════════════════════════════════════════════
--
-- Realtime respects RLS for `authenticated` subscribers: a client is only
-- delivered rows its policies allow it to SELECT. Both tables already have
-- tenant-isolation policies from 20260804, so adding them to the publication
-- does not widen tenant visibility.
--
-- REPLICA IDENTITY FULL does mean the full row is written into the WAL. That is
-- what makes complete UPDATE payloads possible, and it is the intended
-- trade-off. Neither table stores secrets — tokens live in provider_secrets,
-- which is deliberately NOT published here.
