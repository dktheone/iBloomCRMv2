'use client';

import React, { useState, useRef } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import type { SendMessageRequest } from '@/lib/types/inbox';
import { isWindowOpen } from '@/lib/types/inbox';

interface Props {
  conversationId: string;
  windowExpiresAt?: string | null;
  windowMins: number;
  onMessageSent: (msg: any) => void;
}

type ComposerMode = 'text' | 'note';

export default function Composer({ conversationId, windowExpiresAt, windowMins, onMessageSent }: Props) {
  const [text, setText] = useState('');
  const [mode, setMode] = useState<ComposerMode>('text');
  const [isSending, setIsSending] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const windowOpen = isWindowOpen(windowExpiresAt);

  // Auto-grow textarea
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) handleSend();
    }
  };

  const handleSend = async () => {
    if (!text.trim() || isSending) return;

    const payload: SendMessageRequest =
      mode === 'note'
        ? { type: 'note', body: text.trim() }
        : { type: 'text', body: text.trim() };

    setIsSending(true);
    try {
      const res = await fetch(`/api/inbox/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.message) {
        onMessageSent(data.message);
        setText('');
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
      } else {
        toast.error('Send failed', { description: data.error ?? 'Unknown error' });
      }
    } catch (err: any) {
      toast.error('Network error', { description: err?.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="shrink-0 border-t border-slate-200 dark:border-slate-800/80 bg-white dark:bg-[#0F1623]">

      {/* Window-closed banner */}
      {!windowOpen && windowExpiresAt && (
        <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-700/40 flex items-center gap-2">
          <Icon icon="solar:clock-circle-bold-duotone" className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-300 font-medium">
            24h window closed — free-form messaging unavailable.{' '}
            <button
              onClick={() => setShowTemplatePicker(true)}
              className="font-bold underline underline-offset-2"
            >
              Select a template to send
            </button>
          </p>
        </div>
      )}

      {/* Mode badge */}
      {mode === 'note' && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-700/40 px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
            <Icon icon="solar:lock-keyhole-bold" className="w-3 h-3" />
            Internal Note — not sent to customer
          </span>
          <button
            onClick={() => setMode('text')}
            className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            Switch to message
          </button>
        </div>
      )}

      {/* Main compose area */}
      <div className="flex items-end gap-2 p-3">

        {/* Attach button */}
        <button
          disabled={!windowOpen || mode === 'note'}
          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Attach file"
        >
          <Icon icon="solar:paperclip-bold" className="w-5 h-5" />
        </button>

        {/* Text input */}
        <div className={`
          flex-1 flex items-end rounded-2xl border transition-colors
          ${mode === 'note'
            ? 'border-amber-300 dark:border-amber-700/60 bg-amber-50 dark:bg-amber-950/30'
            : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60'
          }
          ${!windowOpen && mode === 'text' ? 'opacity-50' : ''}
        `}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            disabled={(!windowOpen && mode === 'text') || isSending}
            rows={1}
            placeholder={
              mode === 'note'
                ? 'Write an internal note...'
                : !windowOpen
                ? '24h window closed — use a template'
                : 'Type a message... (Enter to send, Shift+Enter for new line)'
            }
            className={`
              flex-1 bg-transparent resize-none px-3.5 py-2.5 text-sm
              text-slate-900 dark:text-slate-100
              placeholder-slate-400 dark:placeholder-slate-500
              outline-none max-h-[120px] overflow-y-auto
              ${(!windowOpen && mode === 'text') ? 'cursor-not-allowed' : ''}
            `}
          />
        </div>

        {/* Right toolbar */}
        <div className="flex items-center gap-1 shrink-0">

          {/* Note mode toggle */}
          <button
            onClick={() => setMode(m => m === 'note' ? 'text' : 'note')}
            className={`
              w-9 h-9 rounded-xl flex items-center justify-center transition-colors
              ${mode === 'note'
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }
            `}
            title="Internal note (not sent to customer)"
          >
            <Icon icon="solar:lock-keyhole-bold" className="w-4.5 h-4.5" />
          </button>

          {/* Template picker */}
          <button
            onClick={() => setShowTemplatePicker(true)}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 transition-colors"
            title="Send a template"
          >
            <Icon icon="solar:document-text-bold-duotone" className="w-5 h-5" />
          </button>

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={!text.trim() || isSending || (!windowOpen && mode === 'text')}
            className="
              w-9 h-9 rounded-xl grid place-items-center transition-all
              bg-gradient-to-br from-cyan-600 to-teal-600 text-white
              hover:from-cyan-500 hover:to-teal-500
              shadow-md shadow-cyan-500/20
              disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none
              active:scale-95
            "
            title="Send"
          >
            {isSending
              ? <Icon icon="solar:restart-bold" className="w-4.5 h-4.5 animate-spin" />
              : <Icon icon="solar:arrow-up-bold" className="w-4.5 h-4.5" />
            }
          </button>
        </div>
      </div>

      {/* Template picker */}
      {showTemplatePicker && (
        <TemplatePicker
          conversationId={conversationId}
          onClose={() => setShowTemplatePicker(false)}
          onMessageSent={(msg) => {
            onMessageSent(msg);
            setShowTemplatePicker(false);
          }}
        />
      )}
    </div>
  );
}

// ── Inline Template Picker Modal ──────────────────────────────────────────────
function TemplatePicker({
  conversationId,
  onClose,
  onMessageSent,
}: {
  conversationId: string;
  onClose: () => void;
  onMessageSent: (msg: any) => void;
}) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  React.useEffect(() => {
    fetch('/api/meta/templates?status=approved')
      .then(r => r.json())
      .then(data => {
        setTemplates(data.templates ?? []);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);

  // Extract placeholder count from body component
  const getBodyPlaceholders = (template: any): number => {
    const body = (template.components ?? []).find((c: any) =>
      c.type === 'BODY' || c.type === 'body'
    );
    if (!body?.text) return 0;
    const matches = body.text.match(/\{\{\d+\}\}/g);
    return matches ? new Set(matches.map((m: string) => m.replace(/[{}]/g, ''))).size : 0;
  };

  const handleSend = async () => {
    if (!selected || isSending) return;
    setIsSending(true);
    try {
      const payload: SendMessageRequest = {
        type: 'template',
        template_uid: selected.template_uid,
        bindings,
      };
      const res = await fetch(`/api/inbox/conversations/${conversationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        onMessageSent(data.message);
        toast.success('Template sent!');
      } else {
        toast.error('Send failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Network error', { description: err?.message });
    } finally {
      setIsSending(false);
    }
  };

  const filtered = templates.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase())
  );

  const placeholderCount = selected ? getBodyPlaceholders(selected) : 0;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
      <div className="bg-white dark:bg-[#111827] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700/60 w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h3 className="font-extrabold text-slate-900 dark:text-white">Send Template</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Select an approved template to send</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Icon icon="solar:close-square-bold" className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Icon icon="solar:magnifer-bold" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>

        {/* Template list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Icon icon="solar:restart-bold" className="w-6 h-6 animate-spin text-cyan-500" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-slate-500 dark:text-slate-400">
              <Icon icon="solar:document-text-bold-duotone" className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No approved templates found</p>
            </div>
          ) : (
            filtered.map(t => {
              const isSelected = selected?.template_uid === t.template_uid;
              const body = (t.components ?? []).find((c: any) => c.type === 'BODY' || c.type === 'body');
              return (
                <button
                  key={t.template_uid}
                  onClick={() => { setSelected(t); setBindings({}); }}
                  className={`
                    w-full text-left p-3.5 rounded-2xl border transition-all
                    ${isSelected
                      ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/40'
                      : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/60'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-slate-900 dark:text-white font-mono">{t.name}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      t.category === 'MARKETING'
                        ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                        : 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                    }`}>
                      {t.category}
                    </span>
                  </div>
                  {body?.text && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 leading-relaxed">
                      {body.text}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-mono text-slate-400">{t.language}</span>
                    {isSelected && <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5 text-cyan-500 ml-auto" />}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Variable bindings form */}
        {selected && placeholderCount > 0 && (
          <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
            <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Fill in variables
            </p>
            {Array.from({ length: placeholderCount }, (_, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-mono text-slate-500 w-8 shrink-0">{`{{${i + 1}}}`}</span>
                <input
                  value={bindings[String(i + 1)] ?? ''}
                  onChange={e => setBindings(b => ({ ...b, [String(i + 1)]: e.target.value }))}
                  placeholder={`Variable ${i + 1}`}
                  className="flex-1 text-sm px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500 transition-colors"
                />
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-end gap-3 p-4 border-t border-slate-100 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!selected || isSending}
            className="
              px-5 py-2 text-sm font-extrabold text-white rounded-xl
              bg-gradient-to-r from-cyan-600 to-teal-600
              hover:from-cyan-500 hover:to-teal-500
              shadow-lg shadow-cyan-500/20
              disabled:opacity-40 disabled:cursor-not-allowed
              flex items-center gap-2 transition-all active:scale-95
            "
          >
            {isSending ? (
              <><Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" /> Sending...</>
            ) : (
              <><Icon icon="solar:arrow-up-bold" className="w-4 h-4" /> Send Template</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
