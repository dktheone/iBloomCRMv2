'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { evaluatePhoneLineEligibility } from '@/lib/meta/eligibility-rulebook';

interface WabaRecord {
  id: string;
  waba_id: string;
  name: string;
  currency: string;
  timezone_id: string;
  account_review_status: string;
  message_template_namespace?: string;
  business_verification_status?: string;
}

interface PhoneRecord {
  id?: string;
  phone_number_id: string;
  waba_id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status: string;
  is_test_number: boolean;
  messaging_limit_tier?: string;
  name_status?: string;
}

export default function AssetsPage() {
  const supabase = createClient();

  const [enrollingPhoneId, setEnrollingPhoneId] = useState<string | null>(null);
  const [unenrollingPhoneId, setUnenrollingPhoneId] = useState<string | null>(null);
  const [isRegisteringAll, setIsRegisteringAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [dbEnrolledPhones, setDbEnrolledPhones] = useState<PhoneRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewFilter, setViewFilter] = useState<'ALL' | 'REGISTERED_LOCKED' | 'UNREGISTERED'>('ALL');

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success(`Copied ${text} to clipboard!`, {
      icon: <Icon icon="solar:copy-bold-duotone" className="w-4 h-4 text-cyan-500 dark:text-cyan-400" />,
    });
    setTimeout(() => setCopiedId(null), 2000);
  }

  // TanStack Query for Meta Discovered Assets (Client Deduplication & Session Lock)
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
    staleTime: 1000 * 60 * 5, // 5 minutes stale time
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
      const { data: phoneData } = await supabase.from('wa_phone_numbers').select('*');
      if (phoneData) {
        setDbEnrolledPhones(phoneData);
      }
    } catch (err) {
      console.error('Error loading enrolled assets from Supabase:', err);
    }
  }

  async function handleEnrollPhoneAsset(phone: PhoneRecord) {
    setEnrollingPhoneId(phone.phone_number_id);
    try {
      const res = await fetch('/api/meta/enroll-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(phone),
      });

      const data = await res.json();

      if (data.success) {
        toast.success(`Registered & Locked phone line ${phone.display_phone_number} to DB!`, {
          description: `Saved to wa_phone_numbers table under WABA ID ${phone.waba_id}`,
          icon: <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
        });
        await loadEnrolledAssetsFromSupabase();
      } else {
        toast.error('Registration Failed', { description: data.error || 'Could not save phone line to DB.' });
      }
    } catch (err: any) {
      toast.error('Registration Exception', { description: err?.message || 'Failed to register phone line.' });
    } finally {
      setEnrollingPhoneId(null);
    }
  }

  async function handleEnrollAllForWaba(phones: PhoneRecord[]) {
    const unEnrolled = phones.filter((p) => !isEnrolled(p.phone_number_id));
    if (unEnrolled.length === 0) {
      toast.info('All phone line assets for this WABA are already registered!');
      return;
    }

    setIsRegisteringAll(true);
    let successCount = 0;

    for (const phone of unEnrolled) {
      try {
        const res = await fetch('/api/meta/enroll-phone', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(phone),
        });
        const data = await res.json();
        if (data.success) successCount++;
      } catch (err) {
        console.error('Error enrolling phone:', err);
      }
    }

    toast.success(`Registered & Locked ${successCount} line asset(s) to Master Agency DB!`, {
      icon: <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
    });
    await loadEnrolledAssetsFromSupabase();
    setIsRegisteringAll(false);
  }

  async function handleUnenrollPhoneAsset(phoneNumberId: string, displayPhone: string) {
    setUnenrollingPhoneId(phoneNumberId);
    try {
      const res = await fetch(`/api/meta/enroll-phone?phone_number_id=${phoneNumberId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.info(`Unregistered line ${displayPhone} from Master DB`, {
          description: 'Line asset removed from wa_phone_numbers table.',
        });
        await loadEnrolledAssetsFromSupabase();
      } else {
        toast.error('Unregistration Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Unregistration Exception', { description: err?.message });
    } finally {
      setUnenrollingPhoneId(null);
    }
  }

  useEffect(() => {
    loadEnrolledAssetsFromSupabase();
  }, []);

  function isEnrolled(phoneId: string) {
    return dbEnrolledPhones.some((p) => p.phone_number_id === phoneId);
  }

  const enrolledCount = discoveredPhones.filter((p) => isEnrolled(p.phone_number_id)).length;
  const unregisteredCount = discoveredPhones.length - enrolledCount;

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
              Asset Hub &amp; Numbers
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            WhatsApp Business Accounts (WABA) &amp; Line Assets Hub
          </h1>
        </div>

        <div className="flex items-center gap-3">
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
              Hierarchical Meta WABAs &amp; Attached Line Assets
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Querying `owned_whatsapp_business_accounts` under Portfolio ID <code className="text-cyan-700 dark:text-cyan-400 font-mono font-bold">{PLATFORM_CONFIG.metaBusinessPortfolioId}</code>.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* View Mode Filter Tabs */}
            <div className="bg-slate-100 dark:bg-slate-950/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center gap-1 text-xs font-mono">
              <button
                onClick={() => setViewFilter('ALL')}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  viewFilter === 'ALL'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Meta Lines ({discoveredPhones.length})
              </button>
              <button
                onClick={() => setViewFilter('REGISTERED_LOCKED')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'REGISTERED_LOCKED'
                    ? 'bg-emerald-500 text-slate-950 shadow-xs'
                    : 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-500'
                }`}
              >
                <Icon icon="solar:lock-bold" className="w-3.5 h-3.5" />
                <span>Locked CRM Lines ({enrolledCount})</span>
              </button>
              <button
                onClick={() => setViewFilter('UNREGISTERED')}
                className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1 transition-all ${
                  viewFilter === 'UNREGISTERED'
                    ? 'bg-amber-500 text-slate-950 shadow-xs'
                    : 'text-amber-600 dark:text-amber-400 hover:text-amber-500'
                }`}
              >
                <Icon icon="solar:shield-warning-bold" className="w-3.5 h-3.5" />
                <span>Unlocked ({unregisteredCount})</span>
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
          /* Hierarchical List: Parent WABA Cards containing attached WhatsApp Phone Sub-Cards */
          <div className="space-y-7">
            {discoveredWabas.map((waba, index) => {
              const uniqueWabaKey = waba.waba_id ? `parent-waba-${waba.waba_id}-${index}` : `parent-waba-${index}`;
              const isCopied = copiedId === waba.waba_id;
              const isNsCopied = copiedId === `ns-${waba.waba_id}`;

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
              if (viewFilter === 'REGISTERED_LOCKED') {
                attachedPhones = attachedPhones.filter((p) => isEnrolled(p.phone_number_id));
              } else if (viewFilter === 'UNREGISTERED') {
                attachedPhones = attachedPhones.filter((p) => !isEnrolled(p.phone_number_id));
              }

              if (viewFilter !== 'ALL' && attachedPhones.length === 0) {
                return null;
              }

              return (
                <div
                  key={uniqueWabaKey}
                  className="bg-slate-50 dark:bg-[#0E1626]/90 border border-slate-200 dark:border-cyan-500/20 hover:border-cyan-400 dark:hover:border-cyan-500/40 rounded-3xl p-6 space-y-6 shadow-lg dark:shadow-xl relative overflow-hidden transition-all duration-300 group"
                >
                  {/* WABA Parent Header Rail */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-slate-200 dark:border-slate-800/80 pb-5">
                    <div className="flex items-start gap-4">
                      {/* Meta App Logo Badge */}
                      <div className="w-13 h-13 rounded-2xl bg-white text-slate-950 grid place-items-center shadow-md border border-slate-200 dark:border-slate-700/50 shrink-0 p-2.5 group-hover:scale-105 transition-transform">
                        <Icon icon="logos:meta-icon" className="w-7 h-7" />
                      </div>

                      <div className="space-y-2">
                        {/* WABA Name & ID */}
                        <div className="space-y-0.5">
                          <h3 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
                            WhatsApp Business Account: {waba.name}
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

                        {/* Status Badges Rail */}
                        <div className="flex items-center gap-2.5 flex-wrap">
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
                            Timezone: {waba.timezone_id || 'UTC +7:00'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Meta Template Namespace Key Box */}
                    {waba.message_template_namespace && (
                      <div className="self-start md:self-auto bg-white dark:bg-slate-950/80 px-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-700 dark:text-slate-300 flex items-center gap-2.5 shadow-sm">
                        <Icon icon="solar:key-minimalistic-square-bold-duotone" className="w-4.5 h-4.5 text-amber-500 shrink-0" />
                        <span className="truncate max-w-xs md:max-w-md">
                          Meta Namespace: <code className="text-slate-900 dark:text-white font-extrabold">{waba.message_template_namespace}</code>
                        </span>
                        <button
                          onClick={() => copyToClipboard(waba.message_template_namespace!, `ns-${waba.waba_id}`)}
                          className="p-1 text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors ml-1 shrink-0"
                          title="Copy Namespace Key"
                        >
                          <Icon icon={isNsCopied ? "solar:check-circle-bold" : "solar:copy-bold-duotone"} className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sub-Section: Attached WhatsApp Phone Line Assets */}
                  <div className="space-y-5 pt-1">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Icon icon="logos:whatsapp-icon" className="w-5 h-5 shrink-0" />
                        <h4 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                          WhatsApp Phone Line Assets ({attachedPhones.length})
                        </h4>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-normal">
                          {viewFilter === 'REGISTERED_LOCKED'
                            ? 'Showing numbers initialized & locked in Master DB'
                            : 'Select lines to register with Master Agency DB'}
                        </span>
                      </div>

                      {attachedPhones.length > 0 && viewFilter !== 'REGISTERED_LOCKED' && (
                        <button
                          onClick={() => handleEnrollAllForWaba(attachedPhones)}
                          disabled={isRegisteringAll}
                          className="bg-white dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-900 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700/80 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md shrink-0 active:scale-95 disabled:opacity-50"
                        >
                          <Icon icon="solar:add-circle-bold" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                          <span>{isRegisteringAll ? 'Registering All...' : '+ Register All Assets'}</span>
                        </button>
                      )}
                    </div>

                    {attachedPhones.length === 0 ? (
                      <div className="p-6 bg-white dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center text-xs text-slate-500 font-mono shadow-xs">
                        No phone lines match the selected filter.
                      </div>
                    ) : (
                      /* Responsive Grid of Attached Phone Line Sub-Cards */
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-5">
                        {attachedPhones.map((phone, pIdx) => {
                          const enrolled = isEnrolled(phone.phone_number_id);
                          const isEnrolling = enrollingPhoneId === phone.phone_number_id;
                          const subPhoneKey = phone.phone_number_id ? `sub-phone-${phone.phone_number_id}-${pIdx}` : `sub-phone-${pIdx}`;

                          const eligibility = evaluatePhoneLineEligibility({
                            phone_number_id: phone.phone_number_id,
                            waba_id: phone.waba_id,
                            display_phone_number: phone.display_phone_number,
                            verified_name: phone.verified_name,
                            quality_rating: phone.quality_rating,
                            code_verification_status: phone.code_verification_status,
                            messaging_limit_tier: phone.messaging_limit_tier,
                            name_status: phone.name_status,
                            is_test_number: phone.is_test_number,
                          });

                          const isProd = eligibility.status === 'QUALIFIED_PRODUCTION';

                          return (
                            <div
                              key={subPhoneKey}
                              className={`bg-white dark:bg-[#121A2A] border rounded-2xl p-5 space-y-4 shadow-md hover:shadow-xl transition-all duration-300 relative overflow-hidden flex flex-col justify-between group/card ${
                                enrolled
                                  ? 'border-emerald-400 dark:border-emerald-500/40 hover:border-emerald-500 ring-1 ring-emerald-500/20'
                                  : 'border-slate-200 dark:border-slate-800 hover:border-cyan-500/50'
                              }`}
                            >
                              <div className="space-y-3.5">
                                {/* Top Bar */}
                                <div className="flex items-center justify-between">
                                  <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center p-1.5 shadow-sm group-hover/card:scale-105 transition-transform">
                                    <Icon icon="logos:whatsapp-icon" className="w-5 h-5" />
                                  </div>

                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                                        isProd
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                                      }`}
                                    >
                                      {isProd ? '🟢 PROD' : '🧪 SANDBOX'}
                                    </span>
                                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                      Tier: {phone.messaging_limit_tier || '1K'}
                                    </span>
                                  </div>
                                </div>

                                {/* Phone Number & Display Name */}
                                <div className="space-y-0.5">
                                  <div className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white font-mono tracking-tight flex items-center justify-between">
                                    <span>{phone.display_phone_number}</span>
                                    {enrolled && (
                                      <span className="text-[10px] font-sans px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-300 dark:border-emerald-700">
                                        LOCKED
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 truncate" title={phone.verified_name}>
                                    {phone.verified_name || 'iBloom Solutions'}
                                  </div>
                                </div>

                                {/* Status Badges Stack */}
                                <div className="space-y-1.5 pt-1 text-[11px] font-mono">
                                  <div className="px-3 py-1 rounded-full font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 w-fit shadow-xs">
                                    <Icon icon="solar:wifi-bold" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                    <span>Quality: {phone.quality_rating || 'GREEN'}</span>
                                  </div>

                                  <div className="px-3 py-1 rounded-full font-bold bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-800 flex items-center gap-1.5 w-fit shadow-xs">
                                    <Icon icon="solar:shield-check-bold" className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                                    <span>Rulebook Score: {eligibility.score}/100</span>
                                  </div>
                                </div>
                              </div>

                              {/* Bottom Action Pill Button */}
                              <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80">
                                {enrolled ? (
                                  <button
                                    onClick={() => handleUnenrollPhoneAsset(phone.phone_number_id, phone.display_phone_number)}
                                    disabled={unenrollingPhoneId === phone.phone_number_id}
                                    className="w-full bg-slate-100 dark:bg-slate-900 hover:bg-rose-50 dark:hover:bg-rose-950/80 text-emerald-700 dark:text-emerald-400 hover:text-rose-600 dark:hover:text-rose-300 py-2.5 rounded-xl text-xs font-extrabold border border-emerald-300 dark:border-emerald-500/40 hover:border-rose-300 dark:hover:border-rose-500/40 transition-all flex items-center justify-center gap-1.5 shadow-xs"
                                  >
                                    {unenrollingPhoneId === phone.phone_number_id ? (
                                      <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <>
                                        <Icon icon="solar:lock-bold" className="w-4 h-4 text-emerald-500" />
                                        <span>🔒 LOCKED &amp; ACTIVE IN MASTER DB</span>
                                      </>
                                    )}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => handleEnrollPhoneAsset(phone)}
                                    disabled={isEnrolling}
                                    className="w-full bg-cyan-100 dark:bg-cyan-950/90 hover:bg-cyan-200 dark:hover:bg-cyan-900 text-cyan-800 dark:text-cyan-300 py-2.5 rounded-xl text-xs font-bold border border-cyan-300 dark:border-cyan-800 flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-95 disabled:opacity-50"
                                  >
                                    {isEnrolling ? (
                                      <>
                                        <Icon icon="solar:restart-bold" className="w-4 h-4 animate-spin" />
                                        <span>Registering Asset...</span>
                                      </>
                                    ) : (
                                      <>
                                        <Icon icon="solar:add-circle-bold" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                        <span>+ Register &amp; Lock Asset to DB</span>
                                      </>
                                    )}
                                  </button>
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
            })}
          </div>
        )}
      </div>
    </div>
  );
}
