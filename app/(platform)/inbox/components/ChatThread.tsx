'use client';

import React, { useRef, useEffect } from 'react';
import { Icon } from '@iconify/react';
import type { Conversation, Message } from '@/lib/types/inbox';
import MessageBubble from './MessageBubble';
import Composer from './Composer';

interface Props {
  conversation: Conversation;
  messages: Message[];
  isLoading: boolean;
  windowOpen: boolean;
  windowMins: number;
  onBack: () => void;
  onMessageSent: (msg: Message) => void;
  onStatusChange: (status: 'open' | 'pending' | 'resolved') => void;
  onShowInfo: () => void;
}

// ── Date separator helper ──────────────────────────────────────────────────────
function formatDateLabel(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = today.getTime() - msgDay.getTime();
  const days = Math.round(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return d.toLocaleDateString([], { weekday: 'long' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function isSameDay(a: string, b: string) {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate();
}

// ── Status config ──────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  open:     { label: 'Open',     color: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', next: 'pending'  as const, nextLabel: 'Mark Pending' },
  pending:  { label: 'Pending',  color: 'text-amber-600 dark:text-amber-400',    dot: 'bg-amber-500',   next: 'resolved' as const, nextLabel: 'Resolve'      },
  resolved: { label: 'Resolved', color: 'text-slate-500 dark:text-slate-400',    dot: 'bg-slate-400',   next: 'open'     as const, nextLabel: 'Reopen'       },
};

// ── Window banner ──────────────────────────────────────────────────────────────
function WindowBanner({ open, mins }: { open: boolean; mins: number }) {
  if (open && mins > 60) return null; // plenty of time — hide

  if (!open) {
    return (
      <div className="mx-4 mb-3 flex items-center gap-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/40 rounded-2xl px-4 py-2.5">
        <Icon icon="solar:lock-keyhole-bold-duotone" className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300">
          <span className="font-bold">24h window closed.</span> You can only send pre-approved templates until the customer replies.
        </p>
      </div>
    );
  }

  // < 1h remaining
  return (
    <div className="mx-4 mb-3 flex items-center gap-2 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-700/40 rounded-2xl px-4 py-2.5">
      <Icon icon="solar:clock-circle-bold-duotone" className="w-4 h-4 text-orange-600 dark:text-orange-400 shrink-0 animate-pulse" />
      <p className="text-xs text-orange-800 dark:text-orange-300">
        <span className="font-bold">{mins}m left</span> in the 24h messaging window.
      </p>
    </div>
  );
}

// ── Loading skeleton ───────────────────────────────────────────────────────────
function ThreadSkeleton() {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 animate-pulse">
      {[70, 50, 80, 60, 40].map((w, i) => (
        <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
          <div
            className="h-10 rounded-2xl bg-slate-200 dark:bg-slate-800"
            style={{ width: `${w}%`, maxWidth: 280 }}
          />
        </div>
      ))}
    </div>
  );
}

// ── Main ChatThread ────────────────────────────────────────────────────────────
export default function ChatThread({
  conversation,
  messages,
  isLoading,
  windowOpen,
  windowMins,
  onBack,
  onMessageSent,
  onStatusChange,
  onShowInfo,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contact = (conversation as any).contact;
  const phoneNumber = (conversation as any).phone_number;
  const status = conversation.lifecycle_status;
  const statusCfg = STATUS_CONFIG[status];

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Build initials
  const initials = contact?.name
    ? contact.name.split(' ').map((w: string) => w[0]).slice(0, 2).join('').toUpperCase()
    : contact?.wa_phone?.slice(-2) ?? '??';

  return (
    <div className="h-full flex flex-col min-h-0">

      {/* ── Thread Header ────────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0F1623]">

        {/* Back (mobile) */}
        <button
          onClick={onBack}
          className="lg:hidden w-8 h-8 rounded-xl grid place-items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Icon icon="solar:alt-arrow-left-bold" className="w-5 h-5" />
        </button>

        {/* Avatar */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-white font-bold text-sm grid place-items-center shrink-0 shadow-md">
          {initials}
        </div>

        {/* Contact info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-slate-900 dark:text-white truncate">
              {contact?.name ?? contact?.wa_phone ?? 'Unknown Contact'}
            </span>

            {/* Status pill */}
            <span className={`flex items-center gap-1 text-[10px] font-bold shrink-0 ${statusCfg.color}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot}`} />
              {statusCfg.label}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Icon icon="logos:whatsapp-icon" className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono truncate">
              {contact?.wa_phone ?? '—'}
            </span>
            {phoneNumber?.display_phone_number && (
              <>
                <span className="opacity-40">·</span>
                <span className="truncate">{phoneNumber.display_phone_number}</span>
              </>
            )}
          </div>
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-1 shrink-0">
          {/* Quick status toggle */}
          <button
            onClick={() => onStatusChange(statusCfg.next)}
            className={`
              hidden sm:flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-all
              ${status === 'resolved'
                ? 'border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                : status === 'pending'
                ? 'border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }
            `}
          >
            <Icon
              icon={status === 'resolved' ? 'solar:restart-bold' : status === 'pending' ? 'solar:check-circle-bold' : 'solar:pause-circle-bold'}
              className="w-3.5 h-3.5"
            />
            {statusCfg.nextLabel}
          </button>

          {/* Info panel toggle */}
          <button
            onClick={onShowInfo}
            className="w-8 h-8 rounded-xl grid place-items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Contact info"
          >
            <Icon icon="solar:info-circle-bold-duotone" className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ── Message Thread ───────────────────────────────────────────────────── */}
      {isLoading ? (
        <ThreadSkeleton />
      ) : (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-1 scroll-smooth"
          style={{ overscrollBehavior: 'contain' }}
        >
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center select-none">
              <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 grid place-items-center mb-4">
                <Icon icon="solar:chat-round-dots-bold-duotone" className="w-8 h-8 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-600 dark:text-slate-400">No messages yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                {windowOpen
                  ? 'Send a message to start the conversation.'
                  : 'Send a template to initiate the conversation.'
                }
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => {
              const prev = messages[idx - 1];
              const showDateSep = !prev || !isSameDay(prev.created_at, msg.created_at);
              const isOwn = msg.direction === 'outbound';

              return (
                <React.Fragment key={msg.message_uid}>
                  {/* Date separator */}
                  {showDateSep && (
                    <div className="flex items-center gap-3 py-2 my-2">
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                      <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {formatDateLabel(msg.created_at)}
                      </span>
                      <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    </div>
                  )}
                  <MessageBubble message={msg} isOwn={isOwn} />
                </React.Fragment>
              );
            })
          )}
        </div>
      )}

      {/* ── 24h Window Banner ────────────────────────────────────────────────── */}
      <WindowBanner open={windowOpen} mins={windowMins} />

      {/* ── Composer ─────────────────────────────────────────────────────────── */}
      {status !== 'resolved' ? (
        <Composer
          conversationId={conversation.conversation_uid}
          windowExpiresAt={conversation.window_expires_at}
          windowMins={windowMins}
          onMessageSent={onMessageSent}
        />
      ) : (
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800/80 px-4 py-4 flex items-center justify-center gap-3 bg-white dark:bg-[#0F1623]">
          <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-slate-400" />
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Conversation resolved.{' '}
            <button
              onClick={() => onStatusChange('open')}
              className="font-bold text-cyan-600 dark:text-cyan-400 hover:underline"
            >
              Reopen
            </button>{' '}
            to reply.
          </span>
        </div>
      )}
    </div>
  );
}
