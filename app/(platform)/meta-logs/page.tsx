'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { MetaGraphLogEntry } from '@/lib/meta/logger';
import { apiDelete, apiGet } from '@/lib/api/http';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export default function MetaGraphLogsPage() {
  const [logs, setLogs] = useState<MetaGraphLogEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);

  const [methodFilter, setMethodFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);

  const [selectedLog, setSelectedLog] = useState<MetaGraphLogEntry | null>(null);
  const { copiedId, copyJson: copyJsonPayload } = useCopyToClipboard();

  async function fetchLogs(page = 1) {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '12',
        method: methodFilter,
        status: statusFilter,
        search: searchTerm,
      });

      const data = await apiGet(`/api/meta/logs?${params.toString()}`);

      if (data.success) {
        setLogs(data.logs || []);
        setTotalCount(data.totalCount || 0);
        setTotalPages(data.totalPages || 1);
        setCurrentPage(data.currentPage || 1);
      } else {
        toast.error('Failed to load Graph API logs', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Error fetching logs', { description: err?.message });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchLogs(1);
  }, [methodFilter, statusFilter]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    fetchLogs(1);
  }

  async function handleClearLogs() {
    if (!confirm('Are you sure you want to clear all Meta Graph API log history?')) return;

    setIsClearing(true);
    try {
      const data = await apiDelete('/api/meta/logs');

      if (data.success) {
        toast.success('Meta Graph API Log History Cleared!');
        setSelectedLog(null);
        fetchLogs(1);
      } else {
        toast.error('Failed to clear logs', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception clearing logs', { description: err?.message });
    } finally {
      setIsClearing(false);
    }
  }

  const successCount = logs.filter((l) => l.ok).length;
  const errorCount = logs.filter((l) => !l.ok).length;

  return (
    <div className="space-y-6 p-2 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gradient-to-r dark:from-[#0F172A]/90 dark:via-[#131C31]/90 dark:to-[#0F172A]/90 backdrop-blur-xl border border-slate-200 dark:border-indigo-500/20 rounded-3xl p-6 shadow-xl dark:shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Icon icon="solar:server-square-bold-duotone" className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Platform Debugger
            </span>
            <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1.5">
              <Icon icon="solar:bug-minimalistic-bold-duotone" className="w-4 h-4 text-indigo-500 animate-pulse" />
              Meta Graph API Live Log Inspector
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Meta Graph API Request &amp; Response Debugger
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchLogs(currentPage)}
            disabled={isLoading}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all border border-slate-300 dark:border-slate-700/80 shadow-md shrink-0 active:scale-95 disabled:opacity-50"
          >
            <Icon icon="solar:restart-bold" className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Logs</span>
          </button>

          <button
            onClick={handleClearLogs}
            disabled={isClearing || totalCount === 0}
            className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/80 dark:hover:bg-rose-900/80 text-rose-700 dark:text-rose-300 px-4 py-2.5 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all border border-rose-200 dark:border-rose-800/80 shadow-md shrink-0 active:scale-95 disabled:opacity-40"
          >
            <Icon icon="solar:trash-bin-trash-bold-duotone" className="w-4 h-4 text-rose-500" />
            <span>Clear History</span>
          </button>
        </div>
      </div>

      {/* Persistent Security & Debug Banner */}
      <div className="bg-indigo-50 dark:bg-gradient-to-r dark:from-indigo-950/80 dark:via-purple-950/50 dark:to-indigo-950/80 backdrop-blur-md border border-indigo-200 dark:border-indigo-500/40 rounded-3xl p-5 flex items-start gap-4 text-xs text-indigo-950 dark:text-indigo-200 shadow-xl">
        <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white grid place-items-center shrink-0 shadow-lg shadow-indigo-500/20 mt-0.5">
          <Icon icon="solar:shield-warning-bold-duotone" className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <span className="font-extrabold text-sm text-indigo-950 dark:text-white block">
            ⚠️ TEMPORARY DEBUG MODE ACTIVE — Sanitize &amp; Inspect API Responses
          </span>
          <p className="text-xs text-indigo-900 dark:text-indigo-300 leading-relaxed max-w-4xl">
            Every Meta Graph API endpoint call (GET, POST, PUT, DELETE) is intercepted and logged into a temporary JSON storage file (<code className="text-indigo-800 dark:text-indigo-200 font-mono font-bold">data/meta_graph_api_logs.json</code>). Sensitive credentials (<code className="text-indigo-800 dark:text-indigo-200 font-mono">access_token</code>) are automatically masked to prevent security leaks.
          </p>
        </div>
      </div>

      {/* Metrics Summary Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-indigo-500/20 shadow-xl space-y-1">
          <div className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Intercepted Calls</div>
          <div className="text-2xl font-black text-slate-900 dark:text-white font-mono">{totalCount}</div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-emerald-500/20 shadow-xl space-y-1">
          <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Page 200 OK Responses</div>
          <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">{successCount}</div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-rose-500/20 shadow-xl space-y-1">
          <div className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Page Error Responses</div>
          <div className="text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">{errorCount}</div>
        </div>

        <div className="p-5 rounded-3xl bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-indigo-500/20 shadow-xl space-y-1">
          <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">Logging Mode</div>
          <div className="text-base font-extrabold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5 pt-1">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-indigo-500"></span>
            </span>
            Active (Masked Secrets)
          </div>
        </div>
      </div>

      {/* Main Logs Table & Search Bar */}
      <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-indigo-500/20 rounded-3xl p-6 space-y-5 shadow-xl dark:shadow-2xl">
        {/* Controls Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold mr-1">Method:</span>
            {(['ALL', 'GET', 'POST', 'PUT', 'DELETE'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethodFilter(m)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  methodFilter === m
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {m}
              </button>
            ))}

            <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-2 hidden sm:block"></div>

            <span className="text-xs font-mono text-slate-500 dark:text-slate-400 font-bold mr-1">Status:</span>
            {(['ALL', 'SUCCESS', 'ERROR'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all ${
                  statusFilter === s
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                    : 'bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <form onSubmit={handleSearchSubmit} className="relative w-full md:w-72">
            <Icon icon="solar:magnifer-bold-duotone" className="w-4.5 h-4.5 text-slate-400 dark:text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search endpoint or response JSON..."
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl pl-11 pr-4 py-2 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 shadow-inner"
            />
          </form>
        </div>

        {/* Logs Table / Cards */}
        {isLoading ? (
          <div className="py-12 text-center space-y-3">
            <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-indigo-500 mx-auto" />
            <p className="text-xs text-slate-500 font-mono">Fetching intercepted Graph API calls...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-3 shadow-xl">
            <Icon icon="solar:bug-minimalistic-bold-duotone" className="w-10 h-10 text-slate-400 mx-auto" />
            <p className="text-xs text-slate-500 font-mono">No Graph API call logs found matching your filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => {
              const isSelected = selectedLog?.id === log.id;
              const is200 = log.ok;

              return (
                <div
                  key={log.id}
                  className={`bg-slate-50 dark:bg-slate-950/70 border rounded-2xl p-4.5 transition-all duration-200 space-y-3 ${
                    isSelected
                      ? 'border-indigo-500 dark:border-indigo-500/80 shadow-lg'
                      : is200
                      ? 'border-slate-200 dark:border-slate-800 hover:border-emerald-500/40'
                      : 'border-rose-200 dark:border-rose-800/60 hover:border-rose-500/40'
                  }`}
                >
                  {/* Top Summary Rail */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 font-mono text-xs">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-3 py-1 rounded-xl font-black text-[11px] tracking-wider ${
                        log.method === 'GET'
                          ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-400 border border-cyan-300 dark:border-cyan-800'
                          : log.method === 'POST'
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                          : log.method === 'DELETE'
                          ? 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                          : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                      }`}>
                        {log.method}
                      </span>

                      <span className="font-extrabold text-slate-900 dark:text-white truncate max-w-xs sm:max-w-md md:max-w-xl" title={log.endpoint}>
                        {log.endpoint}
                      </span>

                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                        is200
                          ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                          : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-400 border border-rose-300 dark:border-rose-800'
                      }`}>
                        {log.responseStatus} {is200 ? 'OK' : 'ERROR'}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 text-[11px]">
                      <span>{log.durationMs}ms</span>
                      <span>•</span>
                      <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <button
                        onClick={() => setSelectedLog(isSelected ? null : log)}
                        className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 px-3 py-1 rounded-xl text-[11px] font-extrabold transition-all border border-slate-300 dark:border-slate-700/80 shrink-0 ml-1"
                      >
                        {isSelected ? 'Hide Payload ▲' : 'Inspect Payload ▼'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded JSON Inspector Modal Block */}
                  {isSelected && (
                    <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl space-y-3 font-mono text-xs text-slate-200 relative">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-[11px]">
                        <span className="text-cyan-400 font-bold">Request URL: {log.fullUrl}</span>
                        <button
                          onClick={() => copyJsonPayload(log.responseBody, log.id)}
                          className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-3 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 border border-slate-700"
                        >
                          <Icon icon={copiedId === log.id ? "solar:check-circle-bold" : "solar:copy-bold-duotone"} className="w-3.5 h-3.5" />
                          <span>{copiedId === log.id ? 'Copied!' : 'Copy Response JSON'}</span>
                        </button>
                      </div>

                      {log.requestBody && (
                        <div className="space-y-1">
                          <span className="text-[10px] text-amber-400 font-bold uppercase">Request Body Payload:</span>
                          <pre className="p-3 bg-slate-950 rounded-xl overflow-x-auto text-[11px] text-amber-300 leading-relaxed max-h-48 scrollbar-thin">
                            {JSON.stringify(log.requestBody, null, 2)}
                          </pre>
                        </div>
                      )}

                      <div className="space-y-1">
                        <span className="text-[10px] text-emerald-400 font-bold uppercase">Response Payload Body:</span>
                        <pre className="p-3 bg-slate-950 rounded-xl overflow-x-auto text-[11px] text-emerald-300 leading-relaxed max-h-80 scrollbar-thin">
                          {JSON.stringify(log.responseBody, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800/80 pt-4 font-mono text-xs">
            <span className="text-slate-500">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({totalCount} total entries)
            </span>

            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchLogs(currentPage - 1)}
                disabled={currentPage <= 1 || isLoading}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-1.5 rounded-xl font-bold border border-slate-300 dark:border-slate-700/80 disabled:opacity-40"
              >
                ← Previous
              </button>

              <button
                onClick={() => fetchLogs(currentPage + 1)}
                disabled={currentPage >= totalPages || isLoading}
                className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 px-3.5 py-1.5 rounded-xl font-bold border border-slate-300 dark:border-slate-700/80 disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
