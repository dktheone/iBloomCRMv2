'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import { ProviderWebhookConfig } from '@/lib/webhooks/core/types';

interface ProviderTabHeaderProps {
  configs: ProviderWebhookConfig[];
  activeProvider: string;
  onSelectProvider: (provider: string) => void;
  eventCounts: Record<string, number>;
}

export function ProviderTabHeader({
  configs,
  activeProvider,
  onSelectProvider,
  eventCounts,
}: ProviderTabHeaderProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
      {configs.map((config) => {
        const isActive = activeProvider === config.provider;
        const count = eventCounts[config.provider] || 0;

        return (
          <button
            key={config.provider}
            onClick={() => onSelectProvider(config.provider)}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap border ${
              isActive
                ? 'bg-cyan-50 dark:bg-cyan-950/40 border-cyan-500 text-cyan-700 dark:text-cyan-300 shadow-xs'
                : 'bg-white dark:bg-[#1A2232] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
            }`}
          >
            <Icon icon={config.icon_slug} className="w-5 h-5 shrink-0" />
            <span>{config.display_name}</span>

            {/* Status Dot */}
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                config.is_enabled ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
              }`}
            />

            {/* Event Count Pill */}
            <span
              className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-mono ${
                isActive
                  ? 'bg-cyan-200 dark:bg-cyan-900 text-cyan-800 dark:text-cyan-200'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
