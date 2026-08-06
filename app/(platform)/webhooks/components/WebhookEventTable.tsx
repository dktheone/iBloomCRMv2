'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { createClient } from '@/lib/supabase/client';
import { WebhookEventRecord } from '@/lib/webhooks/core/types';
import { PayloadViewerModal } from './PayloadViewerModal';

interface WebhookEventTableProps {
  events: WebhookEventRecord[];
  provider: string;
  onRefresh: () => void;
  onReplayEvent: (eventUid: string) => Promise<void>;
}

export function WebhookEventTable({ events, provider, onRefresh, onReplayEvent }: WebhookEventTableProps) {
  const [eventList, setEventList] = useState<WebhookEventRecord[]>(events);
  const [selectedEvent, setSelectedEvent] = useState<WebhookEventRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [newEventsBadgeCount, setNewEventsBadgeCount] = useState<number>(0);
  const [highlightedUid, setHighlightedUid] = useState<string | null>(null);

  useEffect(() => {
    setEventList(events);
  }, [events]);

  // Real-Time Subscription to webhook_events
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`webhook_events_${provider}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'webhook_events',
          filter: `provider=eq.${provider}`,
        },
        (payload) => {
          const newRecord = payload.new as WebhookEventRecord;
          setEventList((prev) => [newRecord, ...prev]);
          setNewEventsBadgeCount((c) => c + 1);
          setHighlightedUid(newRecord.event_uid);

          // Clear highlight after 4 seconds
          setTimeout(() => {
            setHighlightedUid(null);
          }, 4000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [provider]);

  // Filtering
  const filteredList = eventList.filter((evt) => {
    if (statusFilter !== 'all' && evt.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchId = evt.external_event_id?.toLowerCase().includes(q);
      const matchType = evt.event_type.toLowerCase().includes(q);
      const matchUid = evt.event_uid.toLowerCase().includes(q);
      if (!matchId && !matchType && !matchUid) return false;
    }
    return true;
  });

  const statusBadge = (status: string) => {
    switch (status) {
      case 'processed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span>Processed</span>
          </span>
        );
      case 'pending_retry':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
            <span>Pending Buffer</span>
          </span>
        );
      case 'dead_letter':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            <span>Dead Letter</span>
          </span>
        );
      case 'disabled_provider':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700">
            <span>Disabled</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300 border border-cyan-300 dark:border-cyan-800">
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
      {/* Header & Live Notification Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
            <Icon icon="solar:history-bold" className="w-4 h-4 text-cyan-600" />
            <span>Incoming Webhook Request Logs</span>
          </h3>

          {/* New Event Notification Bell Badge */}
          {newEventsBadgeCount > 0 && (
            <button
              onClick={() => {
                setNewEventsBadgeCount(0);
                onRefresh();
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-600 text-white text-xs font-bold shadow-sm animate-bounce"
            >
              <Icon icon="solar:bell-bing-bold" className="w-3.5 h-3.5" />
              <span>{newEventsBadgeCount} new event{newEventsBadgeCount > 1 ? 's' : ''}</span>
            </button>
          )}
        </div>

        {/* Refresh Button */}
        <button
          onClick={() => {
            setNewEventsBadgeCount(0);
            onRefresh();
          }}
          className="px-3 py-1.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 text-cyan-600" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Icon icon="solar:magnifer-linear" className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by WAMID or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs text-slate-500 font-semibold shrink-0">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Statuses</option>
            <option value="processed">Processed 🟢</option>
            <option value="pending_retry">Pending Buffer 🟠</option>
            <option value="dead_letter">Dead Letter 🔴</option>
            <option value="disabled_provider">Disabled ⚪</option>
          </select>
        </div>
      </div>

      {/* Request Table */}
      <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-mono uppercase text-[10px]">
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">External WAMID</th>
              <th className="py-3 px-4">Received At</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
            {filteredList.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                  No webhook event logs recorded for this provider.
                </td>
              </tr>
            ) : (
              filteredList.map((evt) => {
                const isHighlighted = evt.event_uid === highlightedUid;
                return (
                  <tr
                    key={evt.event_uid}
                    className={`transition-colors duration-500 ${
                      isHighlighted
                        ? 'bg-cyan-100/70 dark:bg-cyan-950/70 animate-pulse'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-900/50'
                    }`}
                  >
                    <td className="py-3 px-4">{statusBadge(evt.status)}</td>
                    <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">
                      {evt.event_type}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                      {evt.external_event_id || 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 text-[11px]">
                      {new Date(evt.received_at).toLocaleTimeString()} ({new Date(evt.received_at).toLocaleDateString()})
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedEvent(evt)}
                        className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors inline-flex items-center gap-1"
                      >
                        <Icon icon="solar:code-bold" className="w-3.5 h-3.5 text-cyan-600" />
                        <span>View JSON</span>
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Payload Viewer Modal */}
      <PayloadViewerModal
        event={selectedEvent}
        onClose={() => setSelectedEvent(null)}
        onReplay={onReplayEvent}
      />
    </div>
  );
}
