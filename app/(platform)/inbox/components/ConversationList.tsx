'use client';

import React, { useState, useMemo } from 'react';
import { Icon } from '@iconify/react';
import type { ConversationListItem } from '@/lib/types/inbox';

interface Props {
  conversations: ConversationListItem[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
}

function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

interface RowProps {
  conv: ConversationListItem;
  isSelected: boolean;
  onClick: () => void;
}

const ConversationRow: React.FC<RowProps> = ({ conv, isSelected, onClick }) => {
  const { contact, last_message_preview, last_message_at, last_message_direction, unread_count, lifecycle_status, window_expires_at } = conv;
  const name = contact?.name || contact?.wa_phone || 'Unknown';
  const hasUnread = unread_count > 0;

  const isExpired = window_expires_at ? new Date(window_expires_at) < new Date() : false;

  let statusColor = 'bg-slate-400';
  if (lifecycle_status === 'open') statusColor = 'bg-emerald-500';
  if (lifecycle_status === 'pending') statusColor = 'bg-amber-500';
  if (lifecycle_status === 'resolved') statusColor = 'bg-slate-500';

  return (
    <div
      onClick={onClick}
      className={`h-[76px] px-3 py-2.5 cursor-pointer flex items-center gap-3 transition-colors ${
        isSelected
          ? 'bg-cyan-100 dark:bg-cyan-900/40 border-l-2 border-cyan-500'
          : hasUnread
            ? 'bg-cyan-50 dark:bg-cyan-950/30 hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/50 border-l-2 border-transparent'
      }`}
    >
      {/* Avatar */}
      <div className="relative shrink-0 w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
        {getInitials(name)}
        <div className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 ${statusColor}`} />
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 min-w-0">
            <span className={`text-sm truncate text-slate-900 dark:text-white ${hasUnread ? 'font-bold' : 'font-semibold'}`}>
              {name}
            </span>
            {contact?.opt_in_status === 'opted_out' && (
              <Icon icon="solar:forbidden-bold-duotone" className="text-red-500 shrink-0 text-sm" />
            )}
            {isExpired && (
              <span title="24h window expired" className="text-xs">⏰</span>
            )}
          </div>
          <span className={`text-xs whitespace-nowrap ${hasUnread ? 'text-cyan-600 dark:text-cyan-400 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
            {formatRelativeTime(last_message_at)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 mt-0.5">
          <div className={`text-xs truncate ${hasUnread ? 'text-slate-700 dark:text-slate-300 font-bold' : 'text-slate-500 dark:text-slate-400'}`}>
            {last_message_direction && (
              <span className="mr-1">
                {last_message_direction === 'outbound' ? '▶' : '←'}
              </span>
            )}
            {last_message_preview || 'No messages yet'}
          </div>
          {hasUnread && (
            <div className="shrink-0 bg-cyan-600 text-white text-[10px] font-bold rounded-full w-5 h-5 grid place-items-center shadow-sm">
              {unread_count > 99 ? '99+' : unread_count}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function ConversationList({ conversations, selectedId, isLoading, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const filters = ['All', 'Mine', 'Unassigned', 'Open', 'Pending', 'Resolved'];

  const filteredConversations = useMemo(() => {
    return (conversations || []).filter(conv => {
      // Filter by search
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch =
        !searchQuery ||
        (conv.contact?.name?.toLowerCase().includes(searchLower)) ||
        (conv.contact?.wa_phone?.includes(searchLower));

      // Filter by status tab
      let matchesFilter = true;
      const f = activeFilter.toLowerCase();
      if (f === 'open') matchesFilter = conv.lifecycle_status === 'open';
      if (f === 'pending') matchesFilter = conv.lifecycle_status === 'pending';
      if (f === 'resolved') matchesFilter = conv.lifecycle_status === 'resolved';

      return matchesSearch && matchesFilter;
    });
  }, [conversations, searchQuery, activeFilter]);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="shrink-0 p-4 pb-2">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Icon icon="solar:chat-round-dots-bold-duotone" className="text-2xl text-cyan-500" />
            <div>
              <h2 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">Inbox</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {(conversations || []).length} conversations
              </p>
            </div>
          </div>
          <button
            className="text-cyan-500 hover:text-cyan-600 transition-colors p-1"
            title="New Conversation"
          >
            <Icon icon="solar:add-circle-bold" className="text-2xl" />
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="shrink-0 px-3 py-2">
        <div className="relative">
          <Icon icon="solar:magnifer-bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg" />
          <input
            type="text"
            placeholder="Search contacts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white rounded-xl py-2 pl-9 pr-4 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-all placeholder:text-slate-500 dark:placeholder:text-slate-400"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="shrink-0 px-3 py-2 overflow-x-auto no-scrollbar flex items-center gap-1.5 border-b border-slate-100 dark:border-slate-800 pb-3">
        {filters.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`whitespace-nowrap text-xs font-bold px-3 py-1 rounded-full transition-colors ${
              activeFilter === filter
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
            }`}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* List Area */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-3 space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse h-20 rounded-xl bg-slate-100 dark:bg-slate-800/50 flex items-center px-3 gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3" />
                  <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6 text-center">
            <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800/50 rounded-2xl flex items-center justify-center mb-4">
              <Icon icon="solar:chat-round-dots-bold-duotone" className="text-4xl text-slate-300 dark:text-slate-600" />
            </div>
            <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">
              No conversations yet
            </p>
          </div>
        ) : (
          <div className="py-1">
            {filteredConversations.map(conv => (
              <ConversationRow
                key={conv.conversation_uid}
                conv={conv}
                isSelected={selectedId === conv.conversation_uid}
                onClick={() => onSelect(conv.conversation_uid)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
