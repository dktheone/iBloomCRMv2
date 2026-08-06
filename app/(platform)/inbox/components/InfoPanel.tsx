'use client';

import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import type { Conversation } from '@/lib/types/inbox';

interface Props {
  conversation: Conversation;
  onBack: () => void;
  onStatusChange: (status: 'open' | 'pending' | 'resolved') => void;
}

function getInitials(name?: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatFullDate(dateString?: string): string {
  if (!dateString) return '';
  return new Date(dateString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
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
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'Yesterday';

  return date.toLocaleDateString();
}

type Tab = 'contact' | 'conversation' | 'activity';

export default function InfoPanel({ conversation, onBack, onStatusChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('contact');

  const { contact, phone_number, lifecycle_status, bot_control, unread_count, created_at, last_message_at } = conversation;
  const name = contact?.name || contact?.wa_phone || 'Unknown Contact';
  const waPhone = contact?.wa_phone || '';

  const customFields = (contact?.custom_fields as Record<string, any>) || {};

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="lg:hidden p-1.5 -ml-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg"
          >
            <Icon icon="solar:alt-arrow-left-bold" className="text-xl" />
          </button>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">Contact Info</h2>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="shrink-0 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-6">
          {(['contact', 'conversation', 'activity'] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 text-sm font-bold capitalize transition-colors relative ${
                activeTab === tab
                  ? 'text-cyan-600 dark:text-cyan-400'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-cyan-500 rounded-t-full" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <>
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200 dark:border-slate-700/50 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 flex items-center justify-center text-white font-bold text-2xl shadow-md mb-3">
                {getInitials(name)}
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 dark:text-white mb-1">
                {name}
              </h3>
              <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm font-medium">
                <span>{waPhone ? `+${waPhone}` : '—'}</span>
                {waPhone && (
                  <button
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                    title="Copy phone number"
                    onClick={() => navigator.clipboard.writeText(waPhone)}
                  >
                    <Icon icon="solar:copy-bold-duotone" />
                  </button>
                )}
              </div>

              <div className="mt-4">
                {contact?.opt_in_status === 'opted_in' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold">
                    Opted In
                  </span>
                ) : contact?.opt_in_status === 'opted_out' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-xs font-bold">
                    Opted Out
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold">
                    Unknown
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/50">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Labels</h4>
              {contact?.labels && contact.labels.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {contact.labels.map(cl => (
                    <span
                      key={cl.label_uid}
                      className="px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium"
                      style={cl.label?.color ? { backgroundColor: cl.label.color } : undefined}
                    >
                      {cl.label?.name ?? '—'}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No labels</p>
              )}
            </div>

            <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/50">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Custom Fields</h4>
              {Object.keys(customFields).length > 0 ? (
                <div className="space-y-3">
                  {Object.entries(customFields).map(([key, value]) => (
                    <div key={key} className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-slate-900 dark:text-white font-medium">
                        {String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">No custom fields</p>
              )}
            </div>
          </>
        )}

        {/* CONVERSATION TAB */}
        {activeTab === 'conversation' && (
          <>
            <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/50">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Status</h4>
              <div className="flex gap-2">
                {(['open', 'pending', 'resolved'] as const).map((status) => {
                  let activeClass = '';
                  if (status === 'open') activeClass = 'bg-emerald-500 text-white border-emerald-500';
                  else if (status === 'pending') activeClass = 'bg-amber-500 text-white border-amber-500';
                  else if (status === 'resolved') activeClass = 'bg-slate-500 text-white border-slate-500';

                  const isActive = lifecycle_status === status;

                  return (
                    <button
                      key={status}
                      onClick={() => onStatusChange(status)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg border capitalize transition-all ${
                        isActive
                          ? activeClass
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                      }`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-800/60 rounded-2xl p-4 border border-slate-200 dark:border-slate-700/50 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Control</span>
                {bot_control === 'bot' ? (
                  <span className="text-emerald-600 dark:text-emerald-400 text-sm font-bold">
                    🤖 Bot Mode
                  </span>
                ) : (
                  <span className="text-blue-600 dark:text-blue-400 text-sm font-bold">
                    👤 Agent Mode
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Phone Line</span>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-white">
                  <Icon icon="logos:whatsapp-icon" className="text-lg" />
                  {phone_number?.display_phone_number || 'Unknown'}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Conversation ID</span>
                <div className="flex items-center gap-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded max-w-[150px]">
                  <span className="truncate">{conversation.conversation_uid}</span>
                  <button
                    className="shrink-0 hover:text-slate-900 dark:hover:text-white"
                    onClick={() => navigator.clipboard.writeText(conversation.conversation_uid)}
                  >
                    <Icon icon="solar:copy-bold-duotone" />
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Started</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {formatFullDate(created_at)}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Last message</span>
                <span className="text-sm font-medium text-slate-900 dark:text-white">
                  {last_message_at ? formatRelativeTime(last_message_at) : 'Never'}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">Unread</span>
                <span className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900/50 dark:text-cyan-400 px-2 rounded-full text-xs font-bold">
                  {unread_count || 0}
                </span>
              </div>
            </div>
          </>
        )}

        {/* ACTIVITY TAB */}
        {activeTab === 'activity' && (
          <div className="bg-white dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/50 flex flex-col items-center justify-center p-8 text-center min-h-[200px]">
            <Icon icon="solar:history-bold-duotone" className="text-4xl text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
              Activity timeline coming soon
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
