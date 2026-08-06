'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Plus, Search, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { LABEL_COLORS } from '@/lib/contacts/constants';
import type { Label } from '@/lib/types/inbox';

interface LabelPickerProps {
  /** Whether the modal is visible. */
  open: boolean;
  onClose: () => void;
  /** Currently selected `label_uid`s. */
  value: string[];
  /** Called with the next selection on every toggle. */
  onChange: (labelUids: string[]) => void;
  title?: string;
  /**
   * Fires whenever the picker (re)loads the tenant's labels. Lets a parent
   * render chips for the current selection without a second round trip.
   */
  onLabelsLoaded?: (labels: Label[]) => void;
}

/**
 * Multi-select label picker rendered as an in-page modal (R8/R9).
 *
 * Deliberately self-contained: it owns its own fetch of the tenant's labels and
 * its own "create label" row, so the contact form, the import review step, and
 * the contacts filter bar can all mount it without duplicating that plumbing.
 * Selection state is lifted — the picker never writes to the server, it only
 * reports which labels are ticked. Callers persist via
 * `POST /api/contacts/[id]/labels`.
 */
export const LabelPicker: React.FC<LabelPickerProps> = ({
  open,
  onClose,
  value,
  onChange,
  title = 'Manage labels',
  onLabelsLoaded,
}) => {
  const [labels, setLabels] = useState<Label[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState('');

  // "Create label" row state
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0]);
  const [isCreating, setIsCreating] = useState(false);

  // Held in a ref so an inline `onLabelsLoaded` prop can't retrigger the fetch
  const onLabelsLoadedRef = useRef(onLabelsLoaded);
  onLabelsLoadedRef.current = onLabelsLoaded;

  const fetchLabels = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/contacts/labels');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load labels');
      setLabels(json.labels || []);
      onLabelsLoadedRef.current?.(json.labels || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load labels');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) fetchLabels();
  }, [open, fetchLabels]);

  // Escape closes the modal, matching the rest of the platform's overlays
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  function toggle(labelUid: string) {
    onChange(
      value.includes(labelUid) ? value.filter((v) => v !== labelUid) : [...value, labelUid]
    );
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/contacts/labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, color: newColor }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create label');

      // Insert locally and tick it, so creating implies selecting
      setLabels((prev) => [...prev, json.label].sort((a, b) => a.name.localeCompare(b.name)));
      onChange([...value, json.label.label_uid]);
      setNewName('');
      toast.success(`Label "${name}" created`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to create label');
    } finally {
      setIsCreating(false);
    }
  }

  if (!open) return null;

  const term = search.trim().toLowerCase();
  const visible = term ? labels.filter((l) => l.name.toLowerCase().includes(term)) : labels;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={onClose}
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <Tag className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              {title}
            </h2>
            {value.length > 0 && (
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-cyan-50 dark:bg-cyan-950/60 text-cyan-700 dark:text-cyan-300">
                {value.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800/60">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search labels..."
              className="w-full h-9 pl-9 pr-3 text-xs rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 transition-all"
            />
          </div>
        </div>

        {/* Label list — scrollable when needed */}
        <div className="px-5 py-3 flex-1 overflow-y-auto space-y-2 min-h-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : visible.length === 0 && !term ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
              No labels yet. Create one below.
            </p>
          ) : visible.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-4">
              No labels match &ldquo;{search}&rdquo;.
            </p>
          ) : (
            visible.map((label) => {
              const isSelected = value.includes(label.label_uid);
              return (
                <button
                  key={label.label_uid}
                  type="button"
                  onClick={() => toggle(label.label_uid)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-colors ${
                    isSelected
                      ? 'bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800'
                      : 'bg-slate-50 dark:bg-slate-900/40 border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0 border border-slate-200/60 dark:border-slate-700/60"
                      style={{ backgroundColor: label.color || '#6366f1' }}
                    />
                    <span
                      className={`font-semibold ${
                        isSelected
                          ? 'text-cyan-700 dark:text-cyan-300'
                          : 'text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      {label.name}
                    </span>
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />}
                </button>
              );
            })
          )}
        </div>

        {/* Create label row */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700/60 space-y-2.5">
          <div className="flex items-center gap-2">
            <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
              Create New Label
            </span>
          </div>

          <div className="flex items-start gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
              placeholder="Label name"
              maxLength={48}
              disabled={isCreating}
              className="flex-1 h-9 px-3 text-xs rounded-lg bg-white dark:bg-[#0F172A] border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 transition-all disabled:opacity-50"
            />

            {/* Color swatch picker — 8 colors in a compact row */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  disabled={isCreating}
                  aria-label={`Select colour ${c}`}
                  className={`w-5 h-5 rounded-md shrink-0 transition-all disabled:opacity-50 ${
                    newColor === c
                      ? 'ring-2 ring-cyan-500 ring-offset-1 ring-offset-white dark:ring-offset-slate-900'
                      : 'hover:scale-110'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleCreate}
              disabled={!newName.trim() || isCreating}
              className="h-9 px-3 text-xs font-bold rounded-lg bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
            >
              {isCreating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Creating...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

LabelPicker.displayName = 'LabelPicker';
