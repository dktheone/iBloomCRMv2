'use client';

import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { WebhookEventRecord } from '@/lib/webhooks/core/types';

interface PayloadViewerModalProps {
  event: WebhookEventRecord | null;
  onClose: () => void;
  onReplay: (eventUid: string) => Promise<void>;
}

export function PayloadViewerModal({ event, onClose, onReplay }: PayloadViewerModalProps) {
  const [isReplaying, setIsReplaying] = useState(false);

  if (!event) return null;

  const jsonString = JSON.stringify(event.payload, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(jsonString);
    toast.success('Payload copied to clipboard!');
  };

  const handleReplay = async () => {
    setIsReplaying(true);
    try {
      await onReplay(event.event_uid);
      toast.success('Webhook event replayed successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Replay failed');
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-[#1A2232] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div>
            <h3 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
              <Icon icon="solar:code-bold" className="w-4 h-4 text-cyan-600" />
              <span>Webhook Payload Detail</span>
            </h3>
            <p className="text-[11px] text-slate-500 font-mono">
              UID: {event.event_uid} | Event: {event.event_type}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <Icon icon="solar:close-circle-bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body — Raw JSON Payload */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Status Details */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono">
            <div>
              <span className="text-slate-400 block text-[10px]">Provider:</span>
              <span className="font-bold text-slate-800 dark:text-white uppercase">{event.provider}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Status:</span>
              <span className="font-bold text-cyan-600 uppercase">{event.status}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">External ID:</span>
              <span className="truncate block text-slate-700 dark:text-slate-300">{event.external_event_id || 'N/A'}</span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px]">Received At:</span>
              <span className="text-slate-700 dark:text-slate-300">{new Date(event.received_at).toLocaleTimeString()}</span>
            </div>
          </div>

          {event.error_message && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs font-mono">
              <strong>Error Remark:</strong> {event.error_message}
            </div>
          )}

          {/* JSON Tree */}
          <div className="relative">
            <pre className="p-4 rounded-xl bg-slate-950 text-cyan-400 font-mono text-xs overflow-x-auto border border-slate-800 leading-relaxed max-h-[350px]">
              {jsonString}
            </pre>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={handleCopy}
            className="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-white dark:hover:bg-slate-800 transition-colors flex items-center gap-1.5"
          >
            <Icon icon="solar:copy-bold" className="w-4 h-4" />
            <span>Copy Raw JSON</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={handleReplay}
              disabled={isReplaying}
              className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white text-xs font-bold transition-colors shadow-sm flex items-center gap-1.5"
            >
              {isReplaying ? (
                <>
                  <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
                  <span>Replaying...</span>
                </>
              ) : (
                <>
                  <Icon icon="solar:play-circle-bold" className="w-4 h-4" />
                  <span>Replay Event</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
