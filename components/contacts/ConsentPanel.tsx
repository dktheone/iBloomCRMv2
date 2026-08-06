// components/contacts/ConsentPanel.tsx
// Consent management panel: opt-in status + Mark as Opted Out + consent history (D-032, D-104)

'use client';

import { Icon } from '@iconify/react';
import { useState } from 'react';
import type { Contact } from '@/lib/types/inbox';

interface ConsentEvent {
  consent_event_uid: string;
  from_status: string | null;
  to_status: string;
  source: string;
  channel: string | null;
  occurred_at: string;
  metadata?: Record<string, unknown> | null;
}

interface ConsentPanelProps {
  contact: Contact;
  consentHistory: ConsentEvent[];
  tenantUid: string;
}

export default function ConsentPanel({ contact, consentHistory }: ConsentPanelProps) {
  const [isOptingOut, setIsOptingOut] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const canOptOut = contact.opt_in_status !== 'opted_out';

  async function handleOptOut() {
    if (!canOptOut) return;

    const confirmed = confirm(
      'Mark this contact as Opted Out?\n\nThis is TERMINAL and IRREVERSIBLE (D-032). The contact will be permanently suppressed from all marketing communications.'
    );

    if (!confirmed) return;

    setIsOptingOut(true);
    try {
      const response = await fetch(`/api/contacts/${contact.contact_uid}/consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'opted_out' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update consent status');
      }

      // Reload page to show updated status
      window.location.reload();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsOptingOut(false);
    }
  }

  async function handleAdminOptInOverride() {
    const confirmed = confirm(
      'SUPER ADMIN OVERRIDE:\n\nRe-enable consent for this contact?\nThis will restore opt-in status so you can continue testing messages.'
    );

    if (!confirmed) return;

    setIsOptingOut(true);
    try {
      const response = await fetch(`/api/contacts/${contact.contact_uid}/consent`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'opted_in', source: 'admin_override' }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update consent status');
      }

      window.location.reload();
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsOptingOut(false);
    }
  }

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase">Consent Management</h3>
      </div>

      {/* Current Status */}
      <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Current Status</span>
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
              contact.opt_in_status === 'opted_in'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                : contact.opt_in_status === 'opted_out'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {contact.opt_in_status.toUpperCase()}
          </span>
        </div>

        {contact.opt_in_source && (
          <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
            Source: {contact.opt_in_source}
          </div>
        )}

        {contact.opt_in_at && (
          <div className="text-[10px] font-mono text-slate-600 dark:text-slate-400">
            Opted in: {new Date(contact.opt_in_at).toLocaleString()}
          </div>
        )}

        {contact.opt_out_at && (
          <div className="text-[10px] font-mono text-rose-600 dark:text-rose-400">
            Opted out: {new Date(contact.opt_out_at).toLocaleString()}
          </div>
        )}
      </div>

      {/* Mark as Opted Out Button */}
      {canOptOut && (
        <button
          onClick={handleOptOut}
          disabled={isOptingOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400 text-white text-xs font-bold transition-colors"
        >
          {isOptingOut ? (
            <>
              <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
              Updating...
            </>
          ) : (
            <>
              <Icon icon="solar:close-circle-bold" className="w-4 h-4" />
              Mark as Opted Out
            </>
          )}
        </button>
      )}

      {contact.opt_in_status === 'opted_out' && (
        <div className="space-y-2">
          <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900">
            <p className="text-xs text-rose-800 dark:text-rose-300 font-medium">
              This contact has opted out. Standard user opt-out is sticky (D-032).
            </p>
          </div>
          <button
            onClick={handleAdminOptInOverride}
            disabled={isOptingOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white text-xs font-bold transition-colors shadow-sm"
          >
            {isOptingOut ? (
              <>
                <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
                Overriding...
              </>
            ) : (
              <>
                <Icon icon="solar:shield-check-bold" className="w-4 h-4" />
                ⚡ Super Admin: Restore Opt-In Status
              </>
            )}
          </button>
        </div>
      )}

      {/* Consent History */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full text-xs font-mono text-cyan-600 dark:text-cyan-400 hover:underline"
        >
          <span className="font-bold uppercase">Consent History ({consentHistory.length})</span>
          <Icon
            icon={showHistory ? 'solar:alt-arrow-up-bold' : 'solar:alt-arrow-down-bold'}
            className="w-3 h-3"
          />
        </button>

        {showHistory && (
          <div className="mt-3 space-y-2 max-h-64 overflow-y-auto">
            {consentHistory.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">No consent events recorded</p>
            ) : (
              consentHistory.map((event) => (
                <div
                  key={event.consent_event_uid}
                  className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {event.from_status ? `${event.from_status} → ` : ''}
                      {event.to_status}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400">
                      {new Date(event.occurred_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[9px] font-mono text-slate-600 dark:text-slate-400">
                    Source: {event.source}
                    {event.channel && ` • ${event.channel}`}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
