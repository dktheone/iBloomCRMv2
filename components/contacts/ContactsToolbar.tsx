'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import { useRouter } from 'next/navigation';

export interface ContactStats {
  total: number;
  optedIn: number;
  optedOut: number;
  unknown: number;
}

interface ContactsToolbarProps {
  stats: ContactStats;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
  /** Rendered to the right of the built-in actions — used by Phase 5 for filters. */
  children?: React.ReactNode;
}

/**
 * Horizontal action + analysis bar for /contacts (R1).
 *
 * Stats are passed in rather than fetched here: the page already loads the
 * contact rows it needs, so a second round trip to a /stats endpoint would only
 * add a way for the two numbers to disagree.
 */
export const ContactsToolbar: React.FC<ContactsToolbarProps> = ({
  stats,
  search,
  onSearchChange,
  onRefresh,
  isLoading = false,
  children,
}) => {
  const router = useRouter();

  const chips = [
    {
      key: 'total',
      label: 'Total',
      value: stats.total,
      icon: 'solar:users-group-two-rounded-bold',
      className: 'text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700',
    },
    {
      key: 'in',
      label: 'Opted In',
      value: stats.optedIn,
      icon: 'solar:check-circle-bold',
      className: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800',
    },
    {
      key: 'out',
      label: 'Opted Out',
      value: stats.optedOut,
      icon: 'solar:close-circle-bold',
      className: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800',
    },
    {
      key: 'unknown',
      label: 'Unknown',
      value: stats.unknown,
      icon: 'solar:question-circle-bold',
      className: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800',
    },
  ];

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
      {/* Row 1 — analysis chips (consent breakdown) */}
      <div className="flex flex-wrap items-center gap-2 p-4">
        {chips.map((chip) => (
          <div
            key={chip.key}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${chip.className}`}
          >
            <Icon icon={chip.icon} className="w-3.5 h-3.5 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-wider font-bold opacity-70">
              {chip.label}
            </span>
            <span className="text-sm font-bold tabular-nums">{chip.value}</span>
          </div>
        ))}
      </div>

      {/* Row 2 — search + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-4">
        <div className="relative w-full lg:w-80 shrink-0">
          <Icon
            icon="solar:magnifer-bold"
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="w-full pl-9 pr-4 h-10 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {children}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh"
            className="h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-2 text-xs font-bold"
          >
            <Icon
              icon="solar:refresh-bold"
              className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
            />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => router.push('/contacts/import')}
            className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs font-bold"
          >
            <Icon icon="solar:upload-bold" className="w-4 h-4" />
            Import
          </button>

          <button
            type="button"
            onClick={() => router.push('/contacts/new')}
            className="h-10 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-600 text-white transition-colors flex items-center gap-2 text-xs font-bold"
          >
            <Icon icon="solar:user-plus-bold" className="w-4 h-4" />
            New Contact
          </button>
        </div>
      </div>
    </div>
  );
};

ContactsToolbar.displayName = 'ContactsToolbar';
