'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { useSession } from '@/components/providers/SessionProvider';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { apiGet, apiPost } from '@/lib/api/http';

interface SetupStatus {
  providerConfigured: boolean;
  metaAppId: string;
  appMode: string;
  vaultStatus: boolean;
  wabaCount: number;
  phoneNumbersCount: number;
  testingNumbersCount: number;
  templatesCount: number;
  lifecycleStatus: string;
}

export default function DashboardPage() {
  const supabase = createClient();
  const { tenantProfile } = useSession();

  const [registeringPhoneId, setRegisteringPhoneId] = useState<string | null>(null);

  const [status, setStatus] = useState<SetupStatus>({
    providerConfigured: false,
    metaAppId: PLATFORM_CONFIG.metaAppId,
    appMode: PLATFORM_CONFIG.appMode,
    vaultStatus: true,
    wabaCount: 0,
    phoneNumbersCount: 0,
    testingNumbersCount: 0,
    templatesCount: 0,
    lifecycleStatus: 'active',
  });

  // TanStack Query for Meta API Live Connection (Client Deduplication & Session Lock)
  const {
    data: metaApiData,
    isLoading: isMetaTesting,
    refetch: refetchMetaConnection,
  } = useQuery({
    queryKey: ['meta-connection-test'],
    queryFn: () => apiGet('/api/meta/test-connection'),
    staleTime: 1000 * 60 * 5, // 5 minutes stale time
  });

  // TanStack Query for Unregistered Meta Assets Discovery
  const {
    data: unregisteredData,
    isLoading: isCheckingUnregistered,
    refetch: refetchUnregistered,
  } = useQuery({
    queryKey: ['meta-unregistered-assets'],
    queryFn: () => apiGet('/api/meta/unregistered-assets'),
    staleTime: 1000 * 60 * 5, // 5 minutes stale time
  });

  const connectionTest = metaApiData?.connectionTest;
  const isMetaSuccess = Boolean(connectionTest?.success);

  const unregisteredPhones = unregisteredData?.unregisteredPhones || [];
  const unregisteredWabas = unregisteredData?.unregisteredWabas || [];

  async function handleManualTestConnection() {
    toast.info('Testing Meta Graph API Connection...');
    try {
      const data = await apiGet('/api/meta/test-connection?force=true');
      if (data.connectionTest?.success) {
        toast.success('Meta Connection Verified!', {
          description: `Connected to ${data.connectionTest.appName || PLATFORM_CONFIG.metaAppName}.`,
        });
      } else {
        toast.error('Meta API Test Failed', { description: data.connectionTest?.error || data.error });
      }
      refetchMetaConnection();
      refetchUnregistered();
    } catch (err: any) {
      toast.error('Network Error', { description: err?.message });
    }
  }

  async function handleRegisterUnregisteredPhone(phone: any) {
    setRegisteringPhoneId(phone.id);
    try {
      const data = await apiPost('/api/meta/enroll-phone', {
        waba_id: phone.waba_id,
        phone_number_id: phone.id,
        display_phone_number: phone.display_phone_number,
        verified_name: phone.verified_name,
        quality_rating: phone.quality_rating,
        code_verification_status: phone.code_verification_status,
        is_test_number: phone.is_test_number,
      });

      if (data.success) {
        toast.success(`Registered & Locked line ${phone.display_phone_number} to Tenant Zero DB!`, {
          icon: <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-500" />,
        });
        refetchUnregistered();
        await loadDashboardMetrics();
      } else {
        toast.error('Registration Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Registration Exception', { description: err?.message });
    } finally {
      setRegisteringPhoneId(null);
    }
  }

  async function loadDashboardMetrics() {
    try {
      const { data: providerData } = await supabase.from('provider_config').select('*').limit(1);
      const { data: wabaData } = await supabase.from('wabas').select('waba_uid, meta_waba_id');
      const { data: phoneData } = await supabase.from('wa_phone_numbers').select('phone_line_uid, meta_phone_number_id, is_test_number');
      const { data: tmplData } = await supabase.from('wa_templates').select('template_uid, meta_template_id');

      const isConfigured = Boolean(providerData && providerData.length > 0);
      const config = isConfigured && providerData ? providerData[0] : null;

      const wabaCount = wabaData ? wabaData.length : 0;
      const phoneNumbersCount = phoneData ? phoneData.length : 0;
      const testingNumbersCount = phoneData ? phoneData.filter((p: any) => p.is_test_number).length : 0;
      const templatesCount = tmplData ? tmplData.length : 0;

      setStatus((prev) => ({
        ...prev,
        providerConfigured: isConfigured,
        metaAppId: config?.meta_app_id || PLATFORM_CONFIG.metaAppId,
        appMode: config?.app_mode || PLATFORM_CONFIG.appMode,
        wabaCount,
        phoneNumbersCount,
        testingNumbersCount,
        templatesCount,
        lifecycleStatus: tenantProfile?.status || 'active',
      }));
    } catch (err) {
      console.error('Error loading dashboard metrics:', err);
    }
  }

  useEffect(() => {
    loadDashboardMetrics();
  }, [tenantProfile]);

  const overallSetupProgress = isMetaSuccess && status.phoneNumbersCount > 0 ? 100 : isMetaSuccess ? 75 : status.providerConfigured ? 65 : 35;

  return (
    <div className="space-y-6 p-2 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 transition-colors">
      {/* Top Header Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-gradient-to-r dark:from-[#0F172A]/90 dark:via-[#131C31]/90 dark:to-[#0F172A]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 shadow-xl dark:shadow-2xl">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Icon icon="solar:server-square-bold-duotone" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Platform
            </span>
            <Icon icon="solar:alt-arrow-right-bold" className="w-3.5 h-3.5 text-slate-400 dark:text-slate-600" />
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold flex items-center gap-1.5">
              <Icon icon="solar:chart-2-bold-duotone" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Master Operations Dashboard
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <span>{tenantProfile?.name || PLATFORM_CONFIG.masterAgencyName} Control Hub</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-white text-slate-950 grid place-items-center shadow-lg border border-slate-200 dark:border-slate-700/50 shrink-0">
            <Icon icon="logos:meta-icon" className="w-5 h-5" />
          </div>

          <span className="text-xs font-mono text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/80 px-4 py-2 rounded-2xl border border-amber-200 dark:border-amber-500/40 flex items-center gap-2 font-bold shadow-lg">
            <Icon icon="solar:code-bold-duotone" className="w-4.5 h-4.5 text-amber-500 dark:text-amber-400 animate-pulse" />
            Meta App: {status.appMode.toUpperCase()} (ID: {status.metaAppId})
          </span>
        </div>
      </div>

      {/* Meta Graph API Live Connection Diagnostic Container */}
      <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-4 shadow-xl dark:shadow-2xl relative">
        {isMetaSuccess && (
          <div className="absolute top-5 right-5 w-7 h-7 rounded-full bg-emerald-500 text-slate-950 border-2 border-white dark:border-slate-950 grid place-items-center shadow-lg shadow-emerald-500/30 z-10" title="Meta Graph API Connection Verified">
            <Icon icon="solar:check-read-bold" className="w-4 h-4 text-slate-950 stroke-[3]" />
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Icon icon="logos:meta-icon" className="w-5 h-5 shrink-0" />
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white tracking-tight">
                Meta Graph API v25.0 Live Connection &amp; Token Diagnostics
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Validating System User access token, scopes, and Business Manager Portfolio permissions.
            </p>
          </div>

          <button
            onClick={handleManualTestConnection}
            disabled={isMetaTesting}
            className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-extrabold px-5 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 shrink-0 disabled:opacity-50 active:scale-95"
          >
            <Icon icon="solar:restart-bold" className={`w-4 h-4 ${isMetaTesting ? 'animate-spin' : ''}`} />
            <span>{isMetaTesting ? 'Testing Access Token...' : 'Run Meta Connection Test'}</span>
          </button>
        </div>

        {isMetaTesting ? (
          <div className="p-6 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-2xl text-center space-y-2">
            <Icon icon="solar:restart-bold" className="w-6 h-6 animate-spin text-cyan-600 dark:text-cyan-400 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Authenticating with graph.facebook.com/v25.0...</p>
          </div>
        ) : connectionTest ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs font-mono">
              <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">App Name / ID</span>
                <div className="text-slate-900 dark:text-white font-extrabold truncate">{connectionTest.appName}</div>
                <div className="text-cyan-600 dark:text-cyan-400 text-[11px]">ID: {connectionTest.metaAppId}</div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">Token Validity</span>
                <div className={`font-extrabold ${connectionTest.tokenValid ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  {connectionTest.tokenValid ? '✓ VALID & ACTIVE' : '❌ INVALID / EXPIRED'}
                </div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px] truncate">{connectionTest.expiresAt}</div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-950/80 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-1 col-span-1 lg:col-span-2">
                <span className="text-slate-500 dark:text-slate-400 text-[10px] uppercase font-bold">Granted Token Scopes</span>
                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                  {(connectionTest.scopes || []).map((scope: string) => (
                    <span key={scope} className="px-2 py-0.5 rounded-md text-[10px] bg-teal-100 dark:bg-teal-950/80 text-teal-800 dark:text-teal-300 border border-teal-300 dark:border-teal-700/60 font-bold">
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {connectionTest.errorCode200Detected && (
              <div className="bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-900 dark:text-rose-200">
                <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-sm block">Meta API Error Code 200 Detected:</span>
                  <p className="text-xs text-rose-800 dark:text-rose-300 leading-relaxed">
                    The token is valid, but Meta Graph API returned Error Code 200 ("Permissions error"). Solution: Go to Meta Business Manager &gt; Business Assets &gt; WABAs &gt; Assign System User with Full Control.
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* NEW COMPONENT 5: Live Unregistered Meta Assets Discovery & One-Click Enrollment Widget */}
      {unregisteredPhones.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500/10 via-teal-500/10 to-cyan-500/10 dark:from-amber-950/40 dark:via-teal-950/40 dark:to-cyan-950/40 border border-amber-300 dark:border-amber-500/40 rounded-3xl p-6 space-y-4 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-amber-200 dark:border-amber-800/60 pb-3">
            <div className="space-y-1">
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2 tracking-tight">
                <Icon icon="solar:shield-warning-bold-duotone" className="w-5 h-5 text-amber-500 dark:text-amber-400" />
                Live Unregistered Meta Assets Discovered ({unregisteredPhones.length})
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                These Meta WhatsApp line assets exist in your Portfolio but are <strong>not yet registered/locked in Tenant Zero DB</strong>.
              </p>
            </div>

            <Link
              href="/assets"
              className="text-xs font-mono font-bold text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 shrink-0"
            >
              <span>Manage in Asset Hub →</span>
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {unregisteredPhones.map((phone: any) => {
              const isRegistering = registeringPhoneId === phone.id;
              const eligibility = phone.eligibility;
              const isProd = eligibility?.status === 'QUALIFIED_PRODUCTION';

              return (
                <div
                  key={phone.id}
                  className="bg-white dark:bg-[#121A2A] border border-amber-200 dark:border-amber-500/30 rounded-2xl p-4 space-y-3 shadow-md hover:shadow-lg transition-all"
                >
                  <div className="flex items-center justify-between">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center p-1">
                      <Icon icon="logos:whatsapp-icon" className="w-4.5 h-4.5" />
                    </div>

                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                        isProd
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800'
                      }`}
                    >
                      {isProd ? '🟢 QUALIFIED PROD' : '🧪 SANDBOX TEST'}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono">
                      {phone.display_phone_number}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {phone.verified_name || 'Unregistered Line'}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                      Tier: {phone.messaging_limit_tier || '1K'}
                    </span>

                    <button
                      onClick={() => handleRegisterUnregisteredPhone(phone)}
                      disabled={isRegistering}
                      className="bg-cyan-600 hover:bg-cyan-500 text-white px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50"
                    >
                      {isRegistering ? (
                        <Icon icon="solar:restart-bold" className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <Icon icon="solar:add-circle-bold" className="w-3.5 h-3.5" />
                          <span>+ Register to DB</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 space-y-3 shadow-lg dark:shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">WABAs Enrolled</span>
            <div className="w-10 h-10 rounded-2xl bg-cyan-50 dark:bg-cyan-950/80 text-cyan-600 dark:text-cyan-400 grid place-items-center border border-cyan-200 dark:border-cyan-800 shadow-sm">
              <Icon icon="solar:building-3-bold-duotone" className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">{status.wabaCount}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">Active WABAs in Master Agency DB</p>
        </div>

        <div className="bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 space-y-3 shadow-lg dark:shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Phone Lines Enrolled</span>
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-600 dark:text-emerald-400 grid place-items-center border border-emerald-200 dark:border-emerald-800 shadow-sm">
              <Icon icon="logos:whatsapp-icon" className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">{status.phoneNumbersCount}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">Registered WhatsApp phone numbers</p>
        </div>

        <div className="bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 space-y-3 shadow-lg dark:shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Sandbox Test Lines</span>
            <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/80 text-blue-600 dark:text-blue-400 grid place-items-center border border-blue-200 dark:border-blue-800 shadow-sm">
              <Icon icon="solar:test-tube-bold-duotone" className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">{status.testingNumbersCount}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">Sandbox test phone numbers</p>
        </div>

        <div className="bg-white dark:bg-[#111A2E]/90 border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 space-y-3 shadow-lg dark:shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Message Templates</span>
            <div className="w-10 h-10 rounded-2xl bg-purple-50 dark:bg-purple-950/80 text-purple-600 dark:text-purple-400 grid place-items-center border border-purple-200 dark:border-purple-800 shadow-sm">
              <Icon icon="solar:document-text-bold-duotone" className="w-5 h-5" />
            </div>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">{status.templatesCount}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 font-sans">Meta approved message templates</p>
        </div>
      </div>
    </div>
  );
}
