'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Icon } from '@iconify/react';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/components/providers/SessionProvider';
import type { ConversationListItem, Message, Conversation, OptInStatus } from '@/lib/types/inbox';
import { isWindowOpen, windowMinutesRemaining } from '@/lib/types/inbox';
import ConversationList from './components/ConversationList';
import ChatThread from './components/ChatThread';
import InfoPanel from './components/InfoPanel';

type PanelView = 'list' | 'thread' | 'info';

export default function InboxPage() {
  const supabase = createClient();
  const { tenantProfile } = useSession();

  // ── State ──────────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoadingConvs, setIsLoadingConvs] = useState(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [mobileView, setMobileView] = useState<PanelView>('list');

  // ── Load conversation list ─────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select(`
          conversation_uid,
          lifecycle_status,
          last_message_at,
          last_message_preview,
          last_message_direction,
          unread_count,
          window_expires_at,
          is_pinned,
          tags,
          assigned_to,
          contact:contacts (
            contact_uid, name, wa_phone, avatar_url, opt_in_status
          ),
          phone_number:wa_phone_numbers (
            display_phone_number, verified_name
          ),
          assigned_agent:users!assigned_to (
            user_uid, full_name
          )
        `)
        .order('is_pinned', { ascending: false })
        .order('last_message_at', { ascending: false })
        .limit(100);

      if (!error && data) {
        setConversations(data as unknown as ConversationListItem[]);
      }
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setIsLoadingConvs(false);
    }
  }, [supabase]);

  // ── Load messages for selected conversation ─────────────────────────────────
  const loadMessages = useCallback(async (convId: string) => {
    setIsLoadingMessages(true);
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_uid', convId)
        .order('created_at', { ascending: true })
        .limit(60);

      if (!error && data) {
        setMessages(data as Message[]);
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [supabase]);

  // ── Load full conversation detail ──────────────────────────────────────────
  const loadConversationDetail = useCallback(async (convId: string) => {
    const { data } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts (
          *,
          labels:contact_labels_active (
            label_uid,
            applied_at,
            expires_at,
            applied_by_module,
            label:labels (name, color)
          )
        ),
        phone_number:wa_phone_numbers (display_phone_number, verified_name),
        assigned_agent:users!assigned_to (user_uid, full_name, email)
      `)
      .eq('conversation_uid', convId)
      .single();
    if (data) setSelectedConv(data as unknown as Conversation);
  }, [supabase]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // ── Load messages when conversation selected ───────────────────────────────
  useEffect(() => {
    if (selectedConvId) {
      loadMessages(selectedConvId);
      loadConversationDetail(selectedConvId);
      // Mark as read
      supabase
        .from('conversations')
        .update({ unread_count: 0 })
        .eq('conversation_uid', selectedConvId)
        .then(() => {
          setConversations(prev =>
            prev.map(c =>
              c.conversation_uid === selectedConvId ? { ...c, unread_count: 0 } : c
            )
          );
        });
    }
  }, [selectedConvId, loadMessages, loadConversationDetail, supabase]);

  // ── Realtime: conversation list updates (D-101) ────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('inbox:conversations')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversations' },
        () => loadConversations()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, loadConversations]);

  // ── Realtime: live messages in open thread (D-101) ─────────────────────────
  useEffect(() => {
    if (!selectedConvId) return;

    const channel = supabase
      .channel(`inbox:messages:${selectedConvId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_uid=eq.${selectedConvId}`,
        },
        (payload) => {
          setMessages(prev => [...prev, payload.new as Message]);
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
          filter: `conversation_uid=eq.${selectedConvId}`,
        },
        (payload) => {
          setMessages(prev =>
            prev.map(m =>
              m.message_uid === (payload.new as Message).message_uid
                ? (payload.new as Message)
                : m
            )
          );
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [supabase, selectedConvId]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleSelectConversation = (convId: string) => {
    setSelectedConvId(convId);
    setMobileView('thread');
  };

  const handleBackToList = () => {
    setMobileView('list');
    setSelectedConvId(null);
    setSelectedConv(null);
  };

  const handleMessageSent = (msg: Message) => {
    setMessages(prev => [...prev, msg]);
  };

  const handleStatusChange = async (status: 'open' | 'pending' | 'resolved') => {
    if (!selectedConvId) return;
    await supabase
      .from('conversations')
      .update({ lifecycle_status: status, updated_at: new Date().toISOString() })
      .eq('conversation_uid', selectedConvId);
    setSelectedConv(prev => prev ? { ...prev, lifecycle_status: status } : prev);
    loadConversations();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const windowOpen = isWindowOpen(selectedConv?.window_expires_at);
  const windowMins = windowMinutesRemaining(selectedConv?.window_expires_at);

  return (
    <div className="h-full flex bg-slate-50 dark:bg-[#10141D] overflow-hidden">

      {/* ── Panel A: Conversation List (320px) ──────────────────────────────── */}
      <div className={`
        h-full flex-shrink-0 flex flex-col
        w-full lg:w-80 xl:w-96
        border-r border-slate-200 dark:border-slate-800/80
        bg-white dark:bg-[#111827]
        ${mobileView !== 'list' ? 'hidden lg:flex' : 'flex'}
      `}>
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          isLoading={isLoadingConvs}
          onSelect={handleSelectConversation}
        />
      </div>

      {/* ── Panel B: Chat Thread (flex-1) ────────────────────────────────────── */}
      <div className={`
        h-full flex-1 flex flex-col min-w-0
        bg-white dark:bg-[#0F1623]
        ${mobileView === 'thread' ? 'flex' : 'hidden lg:flex'}
      `}>
        {selectedConvId && selectedConv ? (
          <ChatThread
            conversation={selectedConv}
            messages={messages}
            isLoading={isLoadingMessages}
            windowOpen={windowOpen}
            windowMins={windowMins}
            onBack={handleBackToList}
            onMessageSent={handleMessageSent}
            onStatusChange={handleStatusChange}
            onShowInfo={() => setMobileView('info')}
          />
        ) : (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-cyan-500/20 to-teal-500/20 border border-cyan-500/20 grid place-items-center mb-5">
              <Icon icon="solar:chat-round-dots-bold-duotone" className="w-10 h-10 text-cyan-500/60" />
            </div>
            <h2 className="text-lg font-extrabold text-slate-700 dark:text-slate-300 mb-1">
              Select a conversation
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-500 max-w-xs">
              Choose a conversation from the list to view the full message thread and reply.
            </p>
          </div>
        )}
      </div>

      {/* ── Panel C: Info Panel (360px) ──────────────────────────────────────── */}
      {selectedConv && (
        <div className={`
          h-full flex-shrink-0
          w-full xl:w-80 2xl:w-96
          border-l border-slate-200 dark:border-slate-800/80
          bg-slate-50 dark:bg-[#111827]
          ${mobileView === 'info' ? 'flex flex-col' : 'hidden xl:flex xl:flex-col'}
        `}>
          <InfoPanel
            conversation={selectedConv}
            onBack={() => setMobileView('thread')}
            onStatusChange={handleStatusChange}
          />
        </div>
      )}
    </div>
  );
}
