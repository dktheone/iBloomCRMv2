'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { ProviderWebhookConfig, WebhookEventRecord } from '@/lib/webhooks/core/types';
import { ProviderTabHeader } from './components/ProviderTabHeader';
import { ProviderConfigCard } from './components/ProviderConfigCard';
import { WebhookEventTable } from './components/WebhookEventTable';

export default function WebhookControlCenterPage() {
  const [configs, setConfigs] = useState<ProviderWebhookConfig[]>([]);
  const [activeProvider, setActiveProvider] = useState<string>('meta');
  const [events, setEvents] = useState<WebhookEventRecord[]>([]);
  const [eventCounts, setEventCounts] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Fetch Provider Configurations
  const fetchConfigs = async () => {
    try {
      const res = await fetch('/api/admin/webhooks/config');
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.configs || []);
      }
    } catch (err) {
      console.error('[Webhooks Page] Failed to fetch configs:', err);
    }
  };

  // 2. Fetch Webhook Events for Active Provider
  const fetchEvents = async (provider: string) => {
    try {
      const res = await fetch(`/api/admin/webhooks/events?provider=${provider}&limit=100`);
      if (res.ok) {
        const data = await res.json();
        const evts: WebhookEventRecord[] = data.events || [];
        setEvents(evts);
        setEventCounts((prev) => ({ ...prev, [provider]: evts.length }));
      }
    } catch (err) {
      console.error('[Webhooks Page] Failed to fetch events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  useEffect(() => {
    if (activeProvider) {
      fetchEvents(activeProvider);
    }
  }, [activeProvider]);

  // 3. Update Provider Config (Enable/Disable, Secret Token, Verify Token)
  const handleUpdateConfig = async (updatedFields: Partial<ProviderWebhookConfig>) => {
    try {
      const res = await fetch('/api/admin/webhooks/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: activeProvider,
          ...updatedFields,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to update configuration');
      }

      const data = await res.json();
      setConfigs((prev) =>
        prev.map((c) => (c.provider === activeProvider ? { ...c, ...data.config } : c))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
      throw err;
    }
  };

  // 4. Replay Webhook Event
  const handleReplayEvent = async (eventUid: string) => {
    const res = await fetch('/api/admin/webhooks/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_uid: eventUid }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Replay failed');
    }

    fetchEvents(activeProvider);
  };

  const activeConfig = configs.find((c) => c.provider === activeProvider);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-wider">
            <Icon icon="solar:shield-check-bold" className="w-4 h-4" />
            <span>Superadmin Platform Console</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white mt-1">
            Webhook Control Center
          </h1>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Monitor incoming real-time webhooks, manage secrets & verification tokens, and review payload logs.
          </p>
        </div>

        <button
          onClick={() => {
            fetchConfigs();
            fetchEvents(activeProvider);
            toast.success('Control Center refreshed!');
          }}
          className="px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A2232] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold shadow-xs hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors flex items-center gap-2 self-start sm:self-auto"
        >
          <Icon icon="solar:restart-bold" className="w-4 h-4 text-cyan-600" />
          <span>Refresh All</span>
        </button>
      </div>

      {/* Multi-Provider Tab Header */}
      <ProviderTabHeader
        configs={configs}
        activeProvider={activeProvider}
        onSelectProvider={(p) => setActiveProvider(p)}
        eventCounts={eventCounts}
      />

      {/* Active Provider Configuration Card */}
      {activeConfig ? (
        <ProviderConfigCard config={activeConfig} onUpdateConfig={handleUpdateConfig} />
      ) : (
        <div className="p-8 text-center bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
          Loading provider configuration...
        </div>
      )}

      {/* Request Log Table */}
      <WebhookEventTable
        events={events}
        provider={activeProvider}
        onRefresh={() => fetchEvents(activeProvider)}
        onReplayEvent={handleReplayEvent}
      />
    </div>
  );
}
