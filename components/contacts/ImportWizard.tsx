// components/contacts/ImportWizard.tsx
// Three-step CSV/XLSX import: upload → map columns → result (D-032)

'use client';

import { Icon } from '@iconify/react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IMPORT_TARGET_FIELDS } from '@/lib/contacts/csv-parser';

type Step = 'upload' | 'map' | 'result';
type ConflictStrategy = 'update' | 'skip' | 'fail';

interface PreviewResponse {
  headers: string[];
  rowCount: number;
  suggestedMapping: Record<string, string>;
  sample: string[][];
}

interface ImportResult {
  imported: number;
  created: number;
  updated: number;
  skippedExisting: number;
  invalidRows: number;
  errors: Array<{ row: number; field: string; message: string }>;
  duplicatePhones: Array<{ phone: string; rows: number[] }>;
  truncatedErrors: boolean;
}

export default function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [conflictStrategy, setConflictStrategy] = useState<ConflictStrategy>('update');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(selected: File) {
    setError(null);
    setBusy(true);
    setFile(selected);

    try {
      const body = new FormData();
      body.append('file', selected);
      body.append('mode', 'preview');

      const res = await fetch('/api/contacts/import', { method: 'POST', body });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Failed to read file');

      setPreview(json);
      setMapping(json.suggestedMapping || {});
      setStep('map');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setError(null);
    setBusy(true);

    try {
      const body = new FormData();
      body.append('file', file);
      body.append('mode', 'commit');
      body.append('mapping', JSON.stringify(mapping));
      body.append('conflictStrategy', conflictStrategy);

      const res = await fetch('/api/contacts/import', { method: 'POST', body });
      const json = await res.json();

      if (!res.ok) throw new Error(json.error || 'Import failed');

      setResult(json);
      setStep('result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  }

  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const phoneMapped = mappedFields.has('waPhone');

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {(['upload', 'map', 'result'] as Step[]).map((s, i) => {
          const order = ['upload', 'map', 'result'];
          const active = order.indexOf(step) >= i;
          return (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold ${
                  active
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-800 text-slate-500'
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-xs font-mono uppercase ${
                  active ? 'text-slate-900 dark:text-white' : 'text-slate-400'
                }`}
              >
                {s === 'upload' ? 'Upload' : s === 'map' ? 'Map Columns' : 'Result'}
              </span>
              {i < 2 && <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />}
            </div>
          );
        })}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-900 flex items-start gap-2">
          <Icon icon="solar:danger-triangle-bold" className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <p className="text-sm text-rose-800 dark:text-rose-300">{error}</p>
        </div>
      )}

      {/* ── Step 1: Upload ───────────────────────────────────────────── */}
      {step === 'upload' && (
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
          <label className="block border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-2xl p-12 text-center cursor-pointer hover:border-cyan-500 transition-colors">
            <input
              type="file"
              accept=".csv,.tsv,.txt,.xlsx,.xls"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUpload(f);
              }}
            />
            <Icon
              icon={busy ? 'solar:restart-bold' : 'solar:cloud-upload-bold'}
              className={`w-12 h-12 mx-auto text-cyan-600 dark:text-cyan-400 ${busy ? 'animate-spin' : ''}`}
            />
            <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
              {busy ? 'Reading file…' : 'Choose a file to import'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              CSV, TSV, XLSX or XLS — up to 5,000 rows
            </p>
          </label>

          <div className="mt-6 p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 space-y-1">
            <p className="text-xs font-bold text-amber-900 dark:text-amber-300">
              Consent rules for imports (D-032)
            </p>
            <ul className="text-xs text-amber-800 dark:text-amber-300 list-disc list-inside space-y-0.5">
              <li>Imported contacts land as <strong>unknown</strong> consent by default.</li>
              <li>A row is only marked opted-in if you map a column to <strong>Consent Source</strong>.</li>
              <li>Opt-out cannot be set by import — it is terminal and needs explicit confirmation.</li>
            </ul>
          </div>
        </div>
      )}

      {/* ── Step 2: Map columns ──────────────────────────────────────── */}
      {step === 'map' && preview && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase">
                Map Columns
              </h2>
              <span className="text-xs font-mono text-slate-500 dark:text-slate-400">
                {preview.rowCount} rows · {file?.name}
              </span>
            </div>

            <div className="space-y-3">
              {preview.headers.map((header, idx) => {
                const current = mapping[String(idx)] || '';
                return (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {header || <span className="italic text-slate-400">(unnamed column)</span>}
                      </div>
                      <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                        e.g. {preview.sample[0]?.[idx] || '—'}
                      </div>
                    </div>
                    <select
                      value={current}
                      onChange={(e) =>
                        setMapping((prev) => ({ ...prev, [String(idx)]: e.target.value }))
                      }
                      className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="">— Ignore this column —</option>
                      {IMPORT_TARGET_FIELDS.map((f) => (
                        <option
                          key={f.key}
                          value={f.key}
                          disabled={current !== f.key && mappedFields.has(f.key)}
                        >
                          {f.label}
                          {f.required ? ' *' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>

            {!phoneMapped && (
              <p className="mt-4 text-xs text-rose-600 dark:text-rose-400 font-medium">
                Map one column to WhatsApp Phone to continue.
              </p>
            )}
          </div>

          {/* Conflict strategy */}
          <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase mb-4">
              If a contact already exists
            </h2>
            <div className="space-y-2">
              {[
                { value: 'update', label: 'Update existing', hint: 'Overwrite fields from the file' },
                { value: 'skip', label: 'Skip existing', hint: 'Only insert contacts that are new' },
                { value: 'fail', label: 'Stop on conflict', hint: 'Import nothing if any phone already exists' },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-900/50"
                >
                  <input
                    type="radio"
                    name="conflictStrategy"
                    value={opt.value}
                    checked={conflictStrategy === opt.value}
                    onChange={() => setConflictStrategy(opt.value as ConflictStrategy)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white">{opt.label}</div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400">{opt.hint}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCommit}
              disabled={busy || !phoneMapped}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-bold transition-colors"
            >
              {busy ? (
                <>
                  <Icon icon="solar:restart-bold" className="w-5 h-5 animate-spin" />
                  Importing…
                </>
              ) : (
                <>
                  <Icon icon="solar:import-bold" className="w-5 h-5" />
                  Import {preview.rowCount} rows
                </>
              )}
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setPreview(null);
                setFile(null);
              }}
              disabled={busy}
              className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:opacity-50"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Result ───────────────────────────────────────────── */}
      {step === 'result' && result && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-6">
              <Icon
                icon="solar:check-circle-bold"
                className="w-8 h-8 text-emerald-500"
              />
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">Import complete</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {result.imported} contact{result.imported === 1 ? '' : 's'} written
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Created', value: result.created, tone: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Updated', value: result.updated, tone: 'text-cyan-600 dark:text-cyan-400' },
                { label: 'Skipped', value: result.skippedExisting, tone: 'text-slate-600 dark:text-slate-400' },
                { label: 'Invalid', value: result.invalidRows, tone: 'text-rose-600 dark:text-rose-400' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800"
                >
                  <div className={`text-2xl font-bold ${stat.tone}`}>{stat.value}</div>
                  <div className="text-[10px] font-mono uppercase text-slate-500 dark:text-slate-400">
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.duplicatePhones.length > 0 && (
            <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-amber-200 dark:border-amber-900 p-6">
              <h3 className="text-xs font-mono font-bold text-amber-800 dark:text-amber-300 uppercase mb-3">
                Duplicate phones in file ({result.duplicatePhones.length})
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
                These appeared more than once. Only the last occurrence was kept.
              </p>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.duplicatePhones.map((d) => (
                  <div key={d.phone} className="text-xs font-mono text-slate-700 dark:text-slate-300">
                    {d.phone} — rows {d.rows.join(', ')}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-rose-200 dark:border-rose-900 p-6">
              <h3 className="text-xs font-mono font-bold text-rose-800 dark:text-rose-300 uppercase mb-3">
                Row errors ({result.errors.length}
                {result.truncatedErrors ? '+, showing first 200' : ''})
              </h3>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <div
                    key={i}
                    className="text-xs font-mono text-slate-700 dark:text-slate-300 flex gap-2"
                  >
                    <span className="text-slate-400 shrink-0">Row {e.row}</span>
                    <span className="text-rose-600 dark:text-rose-400 shrink-0">{e.field}</span>
                    <span className="truncate">{e.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/contacts')}
              className="flex-1 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-bold transition-colors"
            >
              View Contacts
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setFile(null);
                setPreview(null);
                setResult(null);
                setMapping({});
              }}
              className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors"
            >
              Import another file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
