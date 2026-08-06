'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { evaluateAssetLifecycle } from '@/lib/meta/asset-lifecycle';
import { detectMetaStatusDrift } from '@/lib/meta/status-drift';

interface WabaRecord {
  id?: string;
  waba_id: string;
  name: string;
  currency: string;
  timezone_id?: string;
  timezone?: string;
  account_review_status: string;
  message_template_namespace?: string;
  business_verification_status?: string;
}

interface PhoneRecord {
  id?: string;
  phone_number_id: string;
  meta_phone_number_id?: string;
  phone_line_uid?: string;
  waba_id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status: string;
  is_test_number: boolean;
  messaging_limit_tier?: string;
  name_status?: string;
  lifecycle_status?: string;
  is_locked?: boolean;
}

export default function AssetsPage() {
  const supabase = createClient();

  const [enrollingPhoneId, setEnrollingPhoneId] = useState<string | null>(null);
  const [unenrollingPhoneId, setUnenrollingPhoneId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  const [dbEnrolledPhones, setDbEnrolledPhones] = useState<PhoneRecord[]>([]);
  const [dbEnrolledWabas, setDbEnrolledWabas] = useState<WabaRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<'ALL' | 'LIVE_OPERATIONAL' | 'PROVISIONED' | 'UNLOCKED_STANDBY' | 'UNREGISTERED'>('ALL');

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied ${text} to clipboard!`, {
      icon: <Icon icon="solar:copy-bold-duotone" className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />,
    });
    setTimeout(() => setCopiedId(null), 2000);
  }

  // TanStack Query for Meta Discovered Assets
  const {
    data: assetsData,
    isLoading: isSyncing,
    refetch: refetchAssets,
  } = useQuery({
    queryKey: ['meta-discovered-assets'],
    queryFn: async () => {
      const res = await fetch('/api/meta/sync-assets');
      const data = await res.json();
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const discoveredWabas: WabaRecord[] = assetsData?.wabas || [];
  const discoveredPhones: PhoneRecord[] = assetsData?.phoneNumbers || [];
  const code200Detected = Boolean(assetsData?.errorCode200Detected);

  async function handleManualSyncAssets() {
    toast.info('Fetching Live Assets from Meta API...');
    try {
      const res = await fetch('/api/meta/sync-assets?force=true');
      const data = await res.json();
      if (data.success) {
        toast.success('Live Assets Synced from Meta API!', {
          description: `Discovered ${data.wabaCount || 0} WABA(s) and ${data.phoneCount || 0} line(s).`,
        });
      } else {
        toast.error('Sync Failed', { description: data.error });
      }
      refetchAssets();
      await loadEnrolledAssetsFromSupabase();
    } catch (err: any) {
      toast.error('Network Error', { description: err?.message });
    }
  }

  async function loadEnrolledAssetsFromSupabase() {
    try {
      const res = await fetch('/api/meta/enrolled-assets');
      const data = await res.json();

      if (data.success) {
        if (data.enrolledPhones) setDbEnrolledPhones(data.enrolledPhones);
        if (data.enrolledWabas) setDbEnrolledWabas(data.enrolledWabas);
      } else {
        const { data: phoneData } = await supabase.from('wa_phone_numbers').select('*');
        const { data: wabaData } = await supabase.from('wabas').select('*');
        if (phoneData) setDbEnrolledPhones(phoneData);
        if (wabaData) setDbEnrolledWabas(wabaData);
      }
    } catch (err) {
      console.error('Error loading enrolled assets from Supabase API:', err);
    }
  }

  async function handleEnrollPhoneAsset(
    phone: PhoneRecord,
    parentWaba?: WabaRecord,
    action: 'PROVISION' | 'LOCK_AND_ACTIVATE' | 'RE_ACTIVATE' | 'DETACH' = 'LOCK_AND_ACTIVATE'
  ) {
    const targetId = phone.meta_phone_number_id || phone.phone_line_uid || phone.phone_number_id || phone.id || '';
    if (action === 'DETACH') {
      setUnenrollingPhoneId(targetId);
    } else {
      setEnrollingPhoneId(targetId);
    }

    try {
      const res = await fetch('/api/meta/enroll-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...phone,
          waba_id: parentWaba?.waba_id || phone.waba_id,
          waba_name: parentWaba?.name,
          waba_currency: parentWaba?.currency,
          waba_timezone_id: parentWaba?.timezone_id || parentWaba?.timezone,
          waba_message_template_namespace: parentWaba?.message_template_namespace,
          waba_account_review_status: parentWaba?.account_review_status,
          action,
        }),
      });

      const data = await res.json();

      if (data.success) {
        const actionLabel =
          action === 'PROVISION'
            ? 'PROVISIONED'
            : action === 'LOCK_AND_ACTIVATE'
            ? 'LIVE OPERATIONAL & LOCKED'
            : action === 'RE_ACTIVATE'
            ? 'RE-ACTIVATED & LOCKED'
            : 'DETACHED TO UNLOCKED STANDBY';

        toast.success(`Line ${phone.display_phone_number} is now ${actionLabel}!`, {
          description: `Database records updated in wabas & wa_phone_numbers tables.`,
          icon: <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
        });
        await loadEnrolledAssetsFromSupabase();
      } else {
        toast.error('Action Failed', { description: data.error || 'Could not update phone line status.' });
      }
    } catch (err: any) {
      toast.error('Exception', { description: err?.message || 'Failed to update phone line status.' });
    } finally {
      setEnrollingPhoneId(null);
      setUnenrollingPhoneId(null);
    }
  }

  useEffect(() => {
    loadEnrolledAssetsFromSupabase();
  }, []);

  function getEnrolledDbRecord(phoneId: string): PhoneRecord | undefined {
    const normalizedTarget = (phoneId || '').trim();
    if (!normalizedTarget) return undefined;
    return dbEnrolledPhones.find((p: any) => 
      ((p.meta_phone_number_id || p.phone_number_id || p.phone_line_uid || p.id || '') as string).trim() === normalizedTarget
    );
  }

  function getEnrolledDbWaba(wabaId: string): WabaRecord | undefined {
    const normalizedTarget = (wabaId || '').trim();
    if (!normalizedTarget) return undefined;
    return dbEnrolledWabas.find((w: any) => 
      ((w.meta_waba_id || w.waba_id || w.waba_uid || w.id || '') as string).trim() === normalizedTarget
    );
  }

  // Strict Database-Driven Counts
  const liveOperationalCount = discoveredPhones.filter(
    (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'LIVE_OPERATIONAL'
  ).length;

  const provisionedCount = discoveredPhones.filter(
    (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'PROVISIONED'
  ).length;

  const unlockedStandbyCount = discoveredPhones.filter(
    (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'UNLOCKED_STANDBY'
  ).length;

  const unregisteredCount = discoveredPhones.length - (liveOperationalCount + provisionedCount + unlockedStandbyCount);

  return (
    <div className="space-y-6 p-2 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gradient-to-r dark:from-[#0F172A]/90 dark:via-[#131C31]/90 dark:to-[#0F172A]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 shadow-xl dark:shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <Icon icon="solar:server-square-bold-duotone" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Platform
            </span>
            <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1.5">
              <Icon icon="solar:layers-bold-duotone" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              WhatsApp Asset Management &amp; Provisioning Engine
            </span>
          </div>

          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              WhatsApp Business Accounts &amp; Line Assets Hub
            </h1>

            {/* Interactive Info Icon Tooltip */}
            <div className="relative inline-block">
              <button
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                onClick={() => setShowTooltip(!showTooltip)}
                className="text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition-colors focus:outline-none"
                aria-label="Lifecycle Info"
              >
                <Icon icon="solar:info-circle-bold-duotone" className="w-6 h-6 text-cyan-500 dark:text-cyan-400" />
              </button>

              {/* Tooltip Overlay Card */}
              {showTooltip && (
                <div className="absolute left-0 top-8 z-50 w-80 md:w-96 bg-slate-900 text-white border border-cyan-500/40 rounded-2xl p-4 shadow-2xl space-y-2 backdrop-blur-2xl text-xs font-sans">
                  <div className="flex items-center gap-2 font-bold text-cyan-400 border-b border-slate-800 pb-2">
                    <Icon icon="solar:layers-bold-duotone" className="w-4 h-4" />
                    <span>4-Stage Asset Lifecycle Engine Architecture</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    Integrated multi-tenant lifecycle engine with append-only soft-delete audit logging:
                  </p>
                  <div className="space-y-1.5 font-mono text-[10px]">
                    <div className="flex items-center gap-1.5 text-slate-400">
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                      <strong>1. UNREGISTERED:</strong> Portfolio line available in Meta API (Not in DB).
                    </div>
                    <div className="flex items-center gap-1.5 text-amber-400">
                      <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                      <strong>2. PROVISIONED:</strong> Staged in DB, pending rulebook eligibility check.
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                      <strong>3. LIVE OPERATIONAL:</strong> Locked &amp; active for tenant messaging.
                    </div>
                    <div className="flex items-center gap-1.5 text-cyan-400">
                      <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                      <strong>4. UNLOCKED STANDBY:</strong> Soft-detached in DB (Re-activatable in 1 click).
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleManualSyncAssets}
            disabled={isSyncing}
            className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 dark:from-cyan-500 dark:via-teal-500 dark:to-emerald-500 dark:hover:from-cyan-400 dark:hover:to-emerald-400 text-white dark:text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 shrink-0 disabled:opacity-50 active:scale-95"
          >
            <Icon icon="solar:restart-bold" className={`w-4.5 h-4.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Discovering Meta API...' : 'Fetch Live Assets from Meta API'}</span>
          </button>
        </div>
      </div>

      {/* Code 200 Banner */}
      {code200Detected && (
        <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/40 rounded-3xl p-5 flex items-start gap-4 text-xs text-rose-900 dark:text-rose-200 shadow-xl">
          <Icon icon="solar:danger-triangle-bold-duotone" className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-extrabold text-sm text-rose-950 dark:text-white">Meta API Error Code 200 Detected (Missing Asset Permission):</span>
            <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed max-w-3xl">
              The System User token is valid, but Meta Graph API returned Error Code 200 ("Permissions error"). Solution: Go to Meta Business Manager &gt; Business Assets &gt; WABAs &gt; Assign System User with Full Control.
            </p>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-6 shadow-xl dark:shadow-2xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
              <Icon icon="solar:layers-bold-duotone" className="w-5.5 h-5.5 text-cyan-600 dark:text-cyan-400" />
              Available WhatsApp Business Lines &amp; Operational Actions
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Sleek Compact Pill Filter Switcher Rail */}
            <div className="bg-slate-100 dark:bg-slate-950/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-1 text-xs font-mono flex-wrap">
              <button
                onClick={() => setViewFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  viewFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Lines ({discoveredPhones.length})
              </button>

              <button
                onClick={() => setViewFilter('LIVE_OPERATIONAL')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'LIVE_OPERATIONAL'
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500'
                }`}
              >
                <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5" />
                <span>🟢 Live ({liveOperationalCount})</span>
              </button>

              <button
                onClick={() => setViewFilter('PROVISIONED')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'PROVISIONED'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-600 dark:text-amber-400 hover:text-amber-500'
                }`}
              >
                <Icon icon="solar:clock-circle-bold" className="w-3.5 h-3.5" />
                <span>🟡 Provisioned ({provisionedCount})</span>
              </button>

              <button
                onClick={() => setViewFilter('UNLOCKED_STANDBY')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'UNLOCKED_STANDBY'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-cyan-600 dark:text-cyan-400 hover:text-cyan-500'
                }`}
              >
                <Icon icon="solar:bolt-bold" className="w-3.5 h-3.5" />
                <span>⚡ Standby in DB ({unlockedStandbyCount})</span>
              </button>

              <button
                onClick={() => setViewFilter('UNREGISTERED')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'UNREGISTERED'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                }`}
              >
                <Icon icon="solar:add-circle-bold" className="w-3.5 h-3.5" />
                <span>⚪ Unregistered ({unregisteredCount})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Icon icon="solar:magnifer-bold-duotone" className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search line numbers..."
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-cyan-500 shadow-inner"
              />
            </div>
          </div>
        </div>

        {isSyncing ? (
          <div className="p-12 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800/80 rounded-3xl text-center space-y-3">
            <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-cyan-600 dark:text-cyan-400 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Discovering WABAs and attached WhatsApp line assets from Meta API v25.0...</p>
          </div>
        ) : discoveredWabas.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-3 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 dark:text-amber-400 grid place-items-center mx-auto">
              <Icon icon="solar:building-bold-duotone" className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">No Owned WABAs Discovered Yet</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Click "Fetch Live Assets from Meta API" to discover registered WABAs under Portfolio ID {PLATFORM_CONFIG.metaBusinessPortfolioId}.
              </p>
            </div>
          </div>
        ) : (
          /* Hierarchical List: Parent WABA Cards containing attached WhatsApp Phone Sub-Rows */
          <div className="space-y-7">
            {discoveredWabas.map((waba, index) => {
              const dbWabaRecord = getEnrolledDbWaba(waba.waba_id);
              const isWabaInDb = Boolean(dbWabaRecord);

              const uniqueWabaKey = waba.waba_id ? `parent-waba-${waba.waba_id}-${index}` : `parent-waba-${index}`;
              const isCopied = copiedId === waba.waba_id;

              let attachedPhones = discoveredPhones.filter(
                (p) => p.waba_id === waba.waba_id || discoveredPhones.length === 1
              );

              // Apply Search Filter
              attachedPhones = attachedPhones.filter((p) =>
                (p.display_phone_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.verified_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (p.phone_number_id || '').toLowerCase().includes(searchTerm.toLowerCase())
              );

              // Apply View Mode Filter Tabs
              if (viewFilter === 'LIVE_OPERATIONAL') {
                attachedPhones = attachedPhones.filter(
                  (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'LIVE_OPERATIONAL'
                );
              } else if (viewFilter === 'PROVISIONED') {
                attachedPhones = attachedPhones.filter(
                  (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'PROVISIONED'
                );
              } else if (viewFilter === 'UNLOCKED_STANDBY') {
                attachedPhones = attachedPhones.filter(
                  (p) => getEnrolledDbRecord(p.phone_number_id || p.id || '')?.lifecycle_status === 'UNLOCKED_STANDBY'
                );
              } else if (viewFilter === 'UNREGISTERED') {
                attachedPhones = attachedPhones.filter((p) => !Boolean(getEnrolledDbRecord(p.phone_number_id || p.id || '')));
              }

              if (viewFilter !== 'ALL' && attachedPhones.length === 0) {
                return null;
              }

              return (
                <div
                  key={uniqueWabaKey}
                  className="bg-slate-50 dark:bg-[#0E1626]/90 border border-slate-200 dark:border-cyan-500/20 hover:border-cyan-400 dark:hover:border-cyan-500/40 rounded-3xl p-6 space-y-6 shadow-lg dark:shadow-xl relative overflow-hidden transition-all duration-300 group"
                >
                  {/* WABA Parent Header Rail — 2 CRISP COLUMNS (Left: Name & WABA ID | Right: Highlighted SAVED IN DB + Status Pills) */}
                  <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-5 border-b border-slate-200 dark:border-slate-800/80 pb-5">
                    {/* LEFT COLUMN: Logo + WABA Name + WABA ID */}
                    <div className="flex items-start gap-4">
                      <div className="w-13 h-13 rounded-2xl bg-white text-slate-950 grid place-items-center shadow-md border border-slate-200 dark:border-slate-700/50 shrink-0 p-2.5 group-hover:scale-105 transition-transform">
                        <Icon icon="logos:meta-icon" className="w-7 h-7" />
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                          WhatsApp Business Account: {dbWabaRecord?.name || waba.name}
                        </h3>
                        <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
                          <span>WABA ID: <strong className="text-slate-800 dark:text-slate-200">{waba.waba_id}</strong></span>
                          <button
                            onClick={() => copyToClipboard(waba.waba_id, waba.waba_id)}
                            className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors"
                            title="Copy WABA ID"
                          >
                            <Icon icon={isCopied ? "solar:check-circle-bold" : "solar:copy-bold-duotone"} className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* RIGHT COLUMN: Highlighted SAVED IN DB + Clean Status Pills Rail */}
                    <div className="flex items-center gap-2.5 flex-wrap self-start xl:self-center">
                      {isWabaInDb && (
                        <span className="px-3.5 py-1 rounded-full text-xs font-mono font-black bg-teal-500 text-slate-950 dark:bg-teal-400 dark:text-slate-950 border border-teal-300 dark:border-teal-500 flex items-center gap-1.5 shadow-md">
                          <Icon icon="solar:database-bold" className="w-3.5 h-3.5" />
                          <span>SAVED IN DB</span>
                        </span>
                      )}

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700/60 flex items-center gap-1.5 shadow-xs">
                        <Icon icon="solar:user-bold" className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        Owned WABA
                      </span>

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700/60 flex items-center gap-1.5 shadow-xs">
                        <Icon icon="solar:verified-check-bold" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        {waba.account_review_status || 'Approved'}
                      </span>

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-700/60 flex items-center gap-1.5 shadow-xs">
                        <Icon icon="solar:dollar-bold" className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        Currency: {waba.currency || 'INR'}
                      </span>

                      <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-700/60 flex items-center gap-1.5 shadow-xs">
                        <Icon icon="solar:clock-circle-bold-duotone" className="w-3.5 h-3.5 text-purple-600 dark:text-purple-400" />
                        Timezone: {waba.timezone_id || waba.timezone || 'UTC'}
                      </span>
                    </div>
                  </div>

                  {/* Sub-Section: Attached WhatsApp Phone Line Assets */}
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon icon="logos:whatsapp-icon" className="w-5 h-5 shrink-0" />
                      <h4 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                        WhatsApp Phone Line Assets ({attachedPhones.length})
                      </h4>
                      <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                        Available WhatsApp Lines &amp; Operational Actions
                      </span>
                    </div>

                    {attachedPhones.length === 0 ? (
                      <div className="p-6 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-500 font-mono shadow-xs">
                        No phone lines match the selected lifecycle filter.
                      </div>
                    ) : (
                      /* Modern Compact Horizontal List/Row Container */
                      <div className="space-y-3">
                        {attachedPhones.map((phone, pIdx) => {
                          const phoneIdKey = (phone.phone_number_id || phone.id || '').trim();
                          const dbRecord = getEnrolledDbRecord(phoneIdKey);

                          // Strict Database-Driven Stage Identification
                          const dbLifecycleStatus = dbRecord?.lifecycle_status || 'UNREGISTERED';
                          const isLiveOperational = dbLifecycleStatus === 'LIVE_OPERATIONAL';
                          const isProvisioned = dbLifecycleStatus === 'PROVISIONED';
                          const isUnlockedStandby = dbLifecycleStatus === 'UNLOCKED_STANDBY';
                          const isUnregistered = !dbRecord || dbLifecycleStatus === 'UNREGISTERED';

                          const lifecycleState = evaluateAssetLifecycle({
                            phone_number_id: phoneIdKey,
                            waba_id: phone.waba_id,
                            display_phone_number: phone.display_phone_number,
                            verified_name: phone.verified_name,
                            quality_rating: phone.quality_rating,
                            code_verification_status: phone.code_verification_status,
                            messaging_limit_tier: phone.messaging_limit_tier,
                            name_status: phone.name_status,
                            is_test_number: phone.is_test_number,
                            lifecycle_status: dbLifecycleStatus,
                          });

                          const statusDrift = detectMetaStatusDrift(phone, dbRecord);

                          const isEnrollingThis = enrollingPhoneId === phoneIdKey;
                          const isUnenrollingThis = unenrollingPhoneId === phoneIdKey;
                          const isProcessingThis = isEnrollingThis || isUnenrollingThis;

                          const subPhoneKey = phoneIdKey ? `sub-phone-${phoneIdKey}-${pIdx}` : `sub-phone-${pIdx}`;

                          return (
                            <div
                              key={subPhoneKey}
                              className={`rounded-2xl p-4 transition-all duration-300 shadow-sm hover:shadow-md flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${
                                isLiveOperational
                                  ? 'bg-emerald-50/60 dark:bg-[#0C2219]/80 border border-emerald-400/80 dark:border-emerald-500/40 ring-1 ring-emerald-500/10'
                                  : isProvisioned
                                  ? 'bg-amber-50/60 dark:bg-[#251D0C]/80 border border-amber-400/80 dark:border-amber-500/40 ring-1 ring-amber-500/10'
                                  : isUnlockedStandby
                                  ? 'bg-cyan-50/60 dark:bg-[#091E2A]/80 border border-cyan-400/80 dark:border-cyan-500/40 ring-1 ring-cyan-500/10'
                                  : 'bg-white dark:bg-[#121A2A] border border-slate-200 dark:border-slate-800/80 hover:border-cyan-500/40'
                              }`}
                            >
                              {/* Left Column: Phone Icon + Display Number & Verified Name */}
                              <div className="flex items-center gap-3.5 min-w-[240px]">
                                <div
                                  className={`w-10 h-10 rounded-xl border flex items-center justify-center p-2 shadow-xs shrink-0 ${
                                    isLiveOperational
                                      ? 'bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-700'
                                      : isProvisioned
                                      ? 'bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-700'
                                      : isUnlockedStandby
                                      ? 'bg-cyan-100 dark:bg-cyan-950 border-cyan-300 dark:border-cyan-700'
                                      : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                                  }`}
                                >
                                  <Icon icon="logos:whatsapp-icon" className="w-5.5 h-5.5" />
                                </div>

                                <div className="space-y-0.5 truncate">
                                  <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono tracking-tight">
                                    {phone.display_phone_number}
                                  </div>
                                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-300 truncate" title={phone.verified_name}>
                                    {phone.verified_name || 'iBloom Verified Business Line'}
                                  </div>
                                </div>
                              </div>

                              {/* Middle Column: Quality Rating & Diagnostic Score */}
                              <div className="flex items-center gap-3 flex-wrap font-mono text-xs">
                                <span className="px-3 py-1 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 shadow-xs">
                                  <Icon icon="solar:wifi-bold" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                  Quality: {phone.quality_rating || 'GREEN'}
                                </span>

                                <span className="px-3 py-1 rounded-full font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 flex items-center gap-1.5 shadow-xs">
                                  <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                  Score: {lifecycleState.eligibilityScore}/100
                                </span>

                                <span className="px-2.5 py-1 rounded-full font-bold bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-800">
                                  Tier: {phone.messaging_limit_tier || '1K'}
                                </span>
                              </div>

                              {/* Upstream Status Drift Warning Tooltip Overlay */}
                              {statusDrift.hasDrift && (
                                <div className="relative group shrink-0">
                                  <button className="p-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-500 transition-all focus:outline-none" aria-label="Status Drift Details">
                                    <Icon icon="solar:danger-triangle-bold-duotone" className="w-4 h-4 text-amber-500 animate-pulse" />
                                  </button>

                                  <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 hidden group-hover:block z-[9999] w-72 p-3 bg-slate-900/95 text-slate-100 text-xs font-sans rounded-2xl shadow-2xl border border-amber-500/40 backdrop-blur-xl pointer-events-none">
                                    <div className="flex items-center gap-1.5 font-bold text-amber-400 mb-1.5 border-b border-slate-800 pb-1 font-mono">
                                      <Icon icon="solar:danger-triangle-bold-duotone" className="w-4 h-4" />
                                      <span>Upstream Meta Status Drift</span>
                                    </div>
                                    <ul className="space-y-1 font-mono text-[11px] text-slate-300">
                                      {statusDrift.changes.map((change, cIdx) => (
                                        <li key={`drift-chg-${cIdx}`} className="flex items-start gap-1">
                                          <span className="text-amber-400">•</span>
                                          <span>{change}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                </div>
                              )}

                              {/* Right Column: DISTINCT TYPOGRAPHIC SUB-HEADING STATUS (Left) + COMPACT ACTION BUTTON (Right) */}
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-4 shrink-0 self-end xl:self-auto w-full xl:w-auto pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-200/60 dark:border-slate-800/60">
                                {/* Left Part: CLEAN ELEGANT TYPOGRAPHIC SUB-HEADING */}
                                <div className="shrink-0 flex items-center">
                                  {isLiveOperational && (
                                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-700 dark:text-emerald-400">
                                      <span className="relative flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                                      </span>
                                      <span>🟢 Live Operational (Active)</span>
                                    </div>
                                  )}

                                  {isProvisioned && (
                                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-700 dark:text-amber-400">
                                      <Icon icon="solar:clock-circle-bold" className="w-4 h-4 text-amber-500" />
                                      <span>🟡 Provisioned (Pending Lock)</span>
                                    </div>
                                  )}

                                  {isUnlockedStandby && (
                                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-cyan-700 dark:text-cyan-400">
                                      <Icon icon="solar:bolt-bold" className="w-4 h-4 text-cyan-500" />
                                      <span>⚡ Unlocked Standby (In DB)</span>
                                    </div>
                                  )}

                                  {isUnregistered && (
                                    <div className="flex items-center gap-1.5 text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">
                                      <Icon icon="solar:add-circle-bold" className="w-4 h-4 text-slate-400" />
                                      <span>⚪ Unregistered Portfolio Line</span>
                                    </div>
                                  )}
                                </div>

                                {/* Right Part: COMPACT MODERN ACTION BUTTON */}
                                <div className="shrink-0">
                                  {isLiveOperational && (
                                    <button
                                      onClick={() => handleEnrollPhoneAsset(phone, waba, 'DETACH')}
                                      disabled={isProcessingThis}
                                      className="w-full sm:w-auto bg-rose-500/10 hover:bg-rose-600 text-rose-700 dark:text-rose-300 hover:text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold border border-rose-400/60 dark:border-rose-700/60 transition-all flex items-center justify-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-50"
                                    >
                                      {isUnenrollingThis ? (
                                        <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 animate-spin" />
                                      ) : (
                                        <>
                                          <Icon icon="solar:lock-unlocked-bold" className="w-3.5 h-3.5" />
                                          <span>🔓 Detach Line</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {isUnlockedStandby && (
                                    <button
                                      onClick={() => handleEnrollPhoneAsset(phone, waba, 'RE_ACTIVATE')}
                                      disabled={isProcessingThis}
                                      className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-black px-4 py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                    >
                                      {isEnrollingThis ? (
                                        <>
                                          <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 animate-spin" />
                                          <span>Re-activating...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon icon="solar:bolt-bold" className="w-3.5 h-3.5" />
                                          <span>⚡ Re-Activate Line</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {isProvisioned && (
                                    <button
                                      onClick={() => handleEnrollPhoneAsset(phone, waba, 'LOCK_AND_ACTIVATE')}
                                      disabled={isProcessingThis}
                                      className="w-full sm:w-auto bg-gradient-to-r from-amber-500 to-teal-600 hover:from-amber-400 hover:to-teal-500 text-slate-950 font-black px-4 py-1.5 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                    >
                                      {isEnrollingThis ? (
                                        <>
                                          <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 animate-spin" />
                                          <span>Locking...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5" />
                                          <span>🔒 Lock &amp; Activate</span>
                                        </>
                                      )}
                                    </button>
                                  )}

                                  {isUnregistered && (
                                    <button
                                      onClick={() => handleEnrollPhoneAsset(phone, waba, 'PROVISION')}
                                      disabled={isProcessingThis}
                                      className="w-full sm:w-auto bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                                    >
                                      {isEnrollingThis ? (
                                        <>
                                          <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 animate-spin" />
                                          <span>Provisioning...</span>
                                        </>
                                      ) : (
                                        <>
                                          <Icon icon="solar:add-circle-bold" className="w-3.5 h-3.5" />
                                          <span>+ Provision Line</span>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
