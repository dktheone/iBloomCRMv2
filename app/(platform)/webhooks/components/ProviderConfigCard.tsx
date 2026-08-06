'use client';

import React from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { ProviderWebhookConfig } from '@/lib/webhooks/core/types';
import { SecretLockControl } from './SecretLockControl';

interface ProviderConfigCardProps {
  config: ProviderWebhookConfig;
  onUpdateConfig: (updated: Partial<ProviderWebhookConfig>) => Promise<void>;
}

export function ProviderConfigCard({ config, onUpdateConfig }: ProviderConfigCardProps) {
  const handleCopyUrl = () => {
    navigator.clipboard.writeText(config.callback_url);
    toast.success('Callback URL copied to clipboard!');
  };

  const handleToggleEnabled = async () => {
    try {
      await onUpdateConfig({ is_enabled: !config.is_enabled });
      toast.success(
        !config.is_enabled
          ? `Enabled webhook endpoint for ${config.display_name}`
          : `Disabled webhook endpoint for ${config.display_name}`
      );
    } catch {
      toast.error('Failed to update provider status');
    }
  };

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      {/* Top Header & Enable/Disable Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <Icon icon={config.icon_slug} className="w-8 h-8 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{config.display_name}</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                  config.is_enabled
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 border border-slate-300 dark:border-slate-700'
                }`}
              >
                {config.is_enabled ? 'Active Endpoint' : 'Disabled'}
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Provider Endpoint Key: <code className="font-mono text-cyan-600">{config.provider}</code>
            </p>
          </div>
        </div>

        {/* Enable / Disable Toggle Switch */}
        <div className="flex items-center gap-3 self-start sm:self-center">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            {config.is_enabled ? 'Webhook Enabled' : 'Webhook Disabled'}
          </span>
          <button
            type="button"
            onClick={handleToggleEnabled}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              config.is_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                config.is_enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Callback URL Box */}
        <div className="md:col-span-2 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Icon icon="solar:link-circle-bold" className="w-4 h-4 text-cyan-600" />
              <span>Webhook Callback URL</span>
            </label>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5"
            >
              <Icon icon="solar:copy-bold" className="w-3.5 h-3.5" />
              <span>Copy Callback URL</span>
            </button>
          </div>

          <input
            type="text"
            readOnly
            value={config.callback_url}
            className="w-full px-3.5 py-2.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-cyan-400 rounded-xl focus:outline-none select-all"
          />
          <p className="text-[10px] text-slate-500 dark:text-slate-400">
            Paste this public URL into your {config.display_name} developer console / webhook settings.
          </p>
        </div>

        {/* Verify Token Control */}
        <SecretLockControl
          label="Verification Handshake Token (verify_token)"
          value={config.verify_token || ''}
          onSave={async (val) => onUpdateConfig({ verify_token: val })}
          helperText="Used by provider GET request to verify callback URL ownership."
        />

        {/* App Secret Control */}
        <SecretLockControl
          label="Secret Signing Token (secret_token / app_secret)"
          value={config.secret_token || ''}
          onSave={async (val) => onUpdateConfig({ secret_token: val })}
          helperText="Used to verify HMAC SHA-256 signature headers (X-Hub-Signature-256)."
        />
      </div>

      {/* Integration Instructions */}
      {config.instructions && (
        <div className="p-4 rounded-xl bg-cyan-50/50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-900/50 text-xs text-cyan-950 dark:text-cyan-200 space-y-1">
          <div className="font-bold flex items-center gap-1.5">
            <Icon icon="solar:info-circle-bold" className="w-4 h-4 text-cyan-600" />
            <span>Setup Instructions</span>
          </div>
          <p className="text-slate-700 dark:text-cyan-300/80 text-[11px] leading-relaxed">
            {config.instructions}
          </p>
        </div>
      )}
    </div>
  );
}
