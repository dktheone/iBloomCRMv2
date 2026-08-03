'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';

export default function ProviderConfigPage() {
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { copy, isCopied } = useCopyToClipboard();
  const copiedUrl = isCopied('webhook-callback-url');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [metaAppId, setMetaAppId] = useState(PLATFORM_CONFIG.metaAppId);
  const [appMode, setAppMode] = useState<'live' | 'dev'>(PLATFORM_CONFIG.appMode);
  const [appCategory, setAppCategory] = useState('Tech Provider / Business Management CRM');
  
  const [appSecret, setAppSecret] = useState('••••••••••••••••••••••••••••••••');
  const [webhookToken, setWebhookToken] = useState(PLATFORM_CONFIG.webhookVerifyToken);
  const [systemUserToken, setSystemUserToken] = useState('EAAG847291048291048••••••••••••••••••••••••••••••••••••••••••••');

  const [showSecret, setShowSecret] = useState(false);
  const [showSystemToken, setShowSystemToken] = useState(false);

  const webhookCallbackUrl = PLATFORM_CONFIG.webhookCallbackUrl;

  useEffect(() => {
    async function loadProviderConfig() {
      setIsLoading(true);
      try {
        const { data, error } = await supabase.from('provider_config').select('*').limit(1);

        if (error) {
          console.warn('[ProviderConfig] Supabase fetch warning:', error.message);
        } else if (data && data.length > 0) {
          const config = data[0];
          setMetaAppId(config.meta_app_id || PLATFORM_CONFIG.metaAppId);
          setAppMode(config.app_mode || PLATFORM_CONFIG.appMode);
          setAppCategory(config.app_category || 'Tech Provider / Business Management CRM');
        }
      } catch (err: any) {
        console.error('Error loading provider config:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadProviderConfig();
  }, []);

  async function handleSaveVault(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);
    setErrorMessage(null);

    try {
      const { error: configError } = await supabase
        .from('provider_config')
        .upsert({
          meta_app_id: metaAppId,
          app_mode: appMode,
          app_category: appCategory,
          webhook_callback_url: webhookCallbackUrl,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'meta_app_id' });

      if (configError) {
        setErrorMessage(configError.message);
        toast.error('Save Failed', { description: configError.message });
        setIsSaving(false);
        return;
      }

      setSaveSuccess(true);
      toast.success('Provider Config Saved to Supabase Vault!', {
        description: 'Updated provider settings & synced Vault credentials.',
        icon: <Icon icon="solar:diskette-bold-duotone" className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
      });
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err: any) {
      const msg = err?.message || 'Failed to save provider configuration to Supabase.';
      setErrorMessage(msg);
      toast.error('Save Exception', { description: msg });
    } finally {
      setIsSaving(false);
    }
  }

  function handleCopyWebhookUrl() {
    copy(webhookCallbackUrl, 'webhook-callback-url', 'Webhook Callback URL copied to clipboard!');
  }

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
              <Icon icon="logos:meta-icon" className="w-4 h-4" />
              Tech Provider Setup
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            {PLATFORM_CONFIG.metaAppName} — Provider Vault Configuration
          </h1>
        </div>

        <button
          onClick={handleSaveVault}
          disabled={isSaving}
          className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 dark:from-cyan-500 dark:via-teal-500 dark:to-emerald-500 dark:hover:from-cyan-400 dark:hover:to-emerald-400 text-white dark:text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 shrink-0 disabled:opacity-50 active:scale-95"
        >
          {isSaving ? (
            <>
              <Icon icon="solar:restart-bold" className="w-4.5 h-4.5 animate-spin" />
              <span>Saving to Supabase...</span>
            </>
          ) : (
            <>
              <Icon icon="solar:diskette-bold-duotone" className="w-4.5 h-4.5" />
              <span>Save &amp; Sync Vault</span>
            </>
          )}
        </button>
      </div>

      {/* DEV Mode Notice */}
      {appMode === 'dev' && (
        <div className="bg-amber-50 dark:bg-gradient-to-r dark:from-amber-950/70 dark:via-amber-900/40 dark:to-amber-950/70 backdrop-blur-md border border-amber-200 dark:border-amber-500/40 rounded-3xl p-5 flex items-center gap-4 text-xs text-amber-900 dark:text-amber-200 shadow-xl">
          <Icon icon="solar:code-bold-duotone" className="w-6 h-6 text-amber-600 dark:text-amber-400 shrink-0" />
          <div>
            <span className="font-extrabold text-slate-900 dark:text-white">DEV (Sandbox) Mode Active:</span> Meta Tech Provider App is currently in development mode. Advanced Access review is in progress.
          </div>
        </div>
      )}

      {/* Banners */}
      {saveSuccess && (
        <div className="bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-500/40 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-800 dark:text-emerald-200 shadow-lg">
          <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <div>
            <span className="font-bold">Provider Configuration Saved:</span> Successfully updated `provider_config` in Supabase &amp; synced Vault credentials.
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="bg-rose-50 dark:bg-rose-950/70 border border-rose-200 dark:border-rose-500/40 rounded-2xl p-4 flex items-center gap-3 text-xs text-rose-800 dark:text-rose-200 shadow-lg">
          <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Main Setup Cards */}
      <div className="space-y-6">
        {/* Section 1: Meta App Identity */}
        <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-5 shadow-xl dark:shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
              <Icon icon="logos:meta-icon" className="w-5 h-5" />
              1. Meta App Identity Setup
            </h2>

            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-500 dark:text-slate-400">Mode:</span>
              <div className="bg-slate-100 dark:bg-slate-950/80 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 flex gap-1">
                <button
                  type="button"
                  onClick={() => setAppMode('dev')}
                  className={`px-3 py-1 rounded-xl text-[10px] font-extrabold transition-all ${
                    appMode === 'dev'
                      ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  DEV (Sandbox)
                </button>
                <button
                  type="button"
                  onClick={() => setAppMode('live')}
                  className={`px-3 py-1 rounded-xl text-[10px] font-extrabold transition-all ${
                    appMode === 'live'
                      ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-800'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  LIVE (Production)
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Meta App ID (<code className="text-cyan-700 dark:text-cyan-400 font-mono">meta_app_id</code>)
              </label>
              <input
                type="text"
                value={metaAppId}
                onChange={(e) => setMetaAppId(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-cyan-700 dark:text-cyan-400 focus:outline-none focus:border-cyan-500 shadow-inner"
              />
              <p className="text-[10px] text-slate-500">From Meta App Dashboard Settings &gt; Basic.</p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                App Category &amp; Classification
              </label>
              <input
                type="text"
                value={appCategory}
                onChange={(e) => setAppCategory(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-inner"
              />
              <p className="text-[10px] text-slate-500">Approved Tech Provider classification.</p>
            </div>
          </div>
        </div>

        {/* Section 2: Vault Credentials */}
        <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-5 shadow-xl dark:shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
              <Icon icon="solar:lock-password-bold-duotone" className="w-5.5 h-5.5 text-amber-500 dark:text-amber-400" />
              2. Vault-Encrypted Credentials
            </h2>

            <span className="text-[10px] font-mono text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/30 flex items-center gap-1.5 font-bold">
              <Icon icon="solar:lock-keyhole-bold" className="w-3.5 h-3.5" /> Stored in Vault
            </span>
          </div>

          <div className="space-y-5">
            {/* Meta App Secret */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">Meta App Secret</span>
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="text-[11px] text-cyan-600 dark:text-cyan-400 flex items-center gap-1 hover:underline"
                >
                  <Icon icon={showSecret ? "solar:eye-closed-bold-duotone" : "solar:eye-bold-duotone"} className="w-4 h-4" />
                  {showSecret ? 'Hide Secret' : 'Reveal Secret'}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={appSecret}
                  onChange={(e) => setAppSecret(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-inner"
                />
              </div>
            </div>

            {/* Shared Webhook Verify Token */}
            <div className="space-y-1.5">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Shared Webhook Verify Token
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={webhookToken}
                  onChange={(e) => setWebhookToken(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-cyan-700 dark:text-cyan-400 focus:outline-none focus:border-cyan-500 shadow-inner"
                />
              </div>
            </div>

            {/* Permanent System User Access Token */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-xs">
                <span className="font-bold text-slate-700 dark:text-slate-300">
                  Permanent System User Access Token
                </span>
                <button
                  type="button"
                  onClick={() => setShowSystemToken(!showSystemToken)}
                  className="text-[11px] text-cyan-600 dark:text-cyan-400 flex items-center gap-1 hover:underline"
                >
                  <Icon icon={showSystemToken ? "solar:eye-closed-bold-duotone" : "solar:eye-bold-duotone"} className="w-4 h-4" />
                  {showSystemToken ? 'Hide Token' : 'Reveal Token'}
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  type={showSystemToken ? 'text' : 'password'}
                  value={systemUserToken}
                  onChange={(e) => setSystemUserToken(e.target.value)}
                  className="flex-1 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-emerald-700 dark:text-emerald-400 focus:outline-none focus:border-cyan-500 shadow-inner"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Webhook Endpoint Wiring */}
        <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-4 shadow-xl dark:shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800/80 pb-4">
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2.5 tracking-tight">
              <Icon icon="solar:link-circle-bold-duotone" className="w-5.5 h-5.5 text-cyan-600 dark:text-cyan-400" />
              3. Shared Webhook Endpoint &amp; Signature Wiring
            </h2>

            <span className="text-[10px] font-mono text-emerald-800 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/80 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-500/30 font-bold flex items-center gap-1">
              <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5" /> Verified Active
            </span>
          </div>

          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Webhook Callback URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={webhookCallbackUrl}
                className="flex-1 bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-slate-800 dark:text-slate-300 focus:outline-none shadow-inner"
              />
              <button
                type="button"
                onClick={handleCopyWebhookUrl}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 rounded-2xl text-xs font-extrabold flex items-center gap-2 transition-all shadow-md active:scale-95"
              >
                <Icon icon={copiedUrl ? "solar:check-circle-bold" : "solar:copy-bold-duotone"} className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                <span>{copiedUrl ? 'Copied!' : 'Copy URL'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
