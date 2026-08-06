'use client';

import React, { useState } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';

interface SecretLockControlProps {
  label: string;
  value: string;
  onSave: (newValue: string) => Promise<void>;
  helperText?: string;
}

export function SecretLockControl({ label, value, onSave, helperText }: SecretLockControlProps) {
  const [isLocked, setIsLocked] = useState(true);
  const [showSecret, setShowSecret] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [isSaving, setIsSaving] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied to clipboard!`);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editValue);
      setIsLocked(true);
      toast.success(`${label} updated successfully!`);
    } catch (err) {
      toast.error('Failed to update secret token');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
          <Icon icon={isLocked ? 'solar:lock-password-bold' : 'solar:lock-keyhole-unlocked-bold'} className={`w-4 h-4 ${isLocked ? 'text-slate-400' : 'text-amber-500'}`} />
          <span>{label}</span>
        </label>

        <div className="flex items-center gap-1.5">
          {/* Eye Toggle */}
          <button
            type="button"
            onClick={() => setShowSecret(!showSecret)}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title={showSecret ? 'Hide secret' : 'Reveal secret'}
          >
            <Icon icon={showSecret ? 'solar:eye-closed-bold' : 'solar:eye-bold'} className="w-4 h-4" />
          </button>

          {/* Lock / Unlock Toggle */}
          <button
            type="button"
            onClick={() => {
              if (isLocked) {
                setEditValue(value);
                setIsLocked(false);
              } else {
                setIsLocked(true);
              }
            }}
            className={`p-1.5 rounded-lg transition-colors ${
              isLocked
                ? 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400'
                : 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-700'
            }`}
            title={isLocked ? 'Unlock to edit secret' : 'Lock editing'}
          >
            <Icon icon={isLocked ? 'solar:lock-bold' : 'solar:lock-keyhole-unlocked-bold'} className="w-4 h-4" />
          </button>

          {/* Copy Button */}
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors"
            title="Copy to clipboard"
          >
            <Icon icon="solar:copy-bold" className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type={showSecret || !isLocked ? 'text' : 'password'}
          readOnly={isLocked}
          value={isLocked ? value : editValue}
          onChange={(e) => setEditValue(e.target.value)}
          className={`w-full px-3 py-2 text-xs font-mono rounded-lg border transition-all ${
            isLocked
              ? 'bg-slate-100 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 select-all'
              : 'bg-white dark:bg-slate-900 border-cyan-500 text-slate-900 dark:text-white focus:ring-2 focus:ring-cyan-500/20'
          }`}
        />

        {!isLocked && (
          <button
            type="button"
            disabled={isSaving}
            onClick={handleSave}
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white text-xs font-bold transition-colors shrink-0 flex items-center gap-1.5"
          >
            {isSaving ? (
              <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
            ) : (
              <Icon icon="solar:check-circle-bold" className="w-4 h-4" />
            )}
            <span>Save</span>
          </button>
        )}
      </div>

      {helperText && <p className="text-[10px] text-slate-500 dark:text-slate-400">{helperText}</p>}
    </div>
  );
}
