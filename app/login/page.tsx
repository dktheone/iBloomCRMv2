'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { FormField } from '@/components/ui/FormField';
import useColorMode from '@/hooks/useColorMode';

export default function LoginPage() {
  const router = useRouter();
  const [colorMode, setColorMode] = useColorMode();
  const supabase = createClient();

  const [email, setEmail] = useState(PLATFORM_CONFIG.superAdminEmail);
  const [password, setPassword] = useState('');
  const [mfaStep, setMfaStep] = useState(false);
  const [mfaCode, setMfaCode] = useState('');

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  function validateLoginForm() {
    const errors: Record<string, string> = {};
    if (!email || !email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }
    if (!password || password.length < 6) {
      errors.password = 'Password must be at least 6 characters long';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleLoginSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateLoginForm()) return;

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        console.error('[Supabase Auth Error]:', error);
        setErrorMessage(error.message || `Authentication failed: ${error.status || 'Invalid Credentials'}`);
        setIsLoading(false);
        return;
      }

      if (!data?.user) {
        setErrorMessage('User session could not be established. Please check your credentials.');
        setIsLoading(false);
        return;
      }

      const { data: mfaData, error: mfaError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (!mfaError && mfaData.nextLevel === 'aal2' && mfaData.currentLevel === 'aal1') {
        setMfaStep(true);
        setSuccessMessage('Password verified. Please enter your 6-digit MFA Security Code.');
        setIsLoading(false);
        return;
      }

      await resolveTenantAndRedirect(data.user.id);

    } catch (err: any) {
      console.error('[Login Catch Error]:', err);
      const detail = err?.message || err?.error_description || (typeof err === 'string' ? err : JSON.stringify(err));
      setErrorMessage(detail && detail !== '{}' ? detail : 'Authentication failed. Please verify your credentials.');
      setIsLoading(false);
    }
  }

  async function handleMfaVerify(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError || !factors.totp.length) {
        setErrorMessage('No MFA authenticator factors found for this account.');
        setIsLoading(false);
        return;
      }

      const factorId = factors.totp[0].id;
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) {
        setErrorMessage(challengeError.message);
        setIsLoading(false);
        return;
      }

      const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: mfaCode,
      });

      if (verifyError) {
        setErrorMessage(verifyError.message);
        setIsLoading(false);
        return;
      }

      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        await resolveTenantAndRedirect(userData.user.id);
      } else {
        router.push('/dashboard');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to verify MFA security code.');
      setIsLoading(false);
    }
  }

  async function resolveTenantAndRedirect(userId: string) {
    setSuccessMessage('Authentication successful! Resolving Tenant Zero Master Agency session...');

    try {
      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id, role, tenants(name, slug)')
        .eq('user_id', userId)
        .limit(1);

      if (userTenants && userTenants.length > 0) {
        console.log('Resolved Tenant Zero Session:', userTenants[0]);
      }
    } catch (err) {
      console.warn('Tenant resolution notice:', err);
    }

    setTimeout(() => {
      router.push('/dashboard');
    }, 600);
  }

  return (
    <div className="min-h-screen w-screen bg-[#0A0E1A] text-slate-100 font-sans flex flex-col justify-between transition-colors relative overflow-hidden">
      {/* Background Neon Accents */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header Rail */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/80 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/95 text-slate-950 grid place-items-center shadow-lg shadow-black/40 border border-slate-700/50">
            <Icon icon="logos:meta-icon" className="w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-extrabold tracking-tight text-white">
              iBloom<span className="text-cyan-400">CRM</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase font-bold">
              Master Agency Engine
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 bg-slate-950 border border-slate-800 px-3.5 py-1.5 rounded-2xl text-xs font-mono">
            <span className="text-slate-400 font-bold">System:</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> ONLINE
            </span>
          </div>

          <button
            onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}
            className="w-9.5 h-9.5 rounded-2xl bg-slate-950 border border-slate-800 grid place-items-center text-slate-300 hover:text-cyan-400 transition-colors shadow-inner"
          >
            {colorMode === 'dark' ? <Icon icon="solar:sun-bold-duotone" className="w-4.5 h-4.5 text-amber-400" /> : <Icon icon="solar:moon-bold-duotone" className="w-4.5 h-4.5 text-slate-300" />}
          </button>
        </div>
      </header>

      {/* Main Form Center Card */}
      <div className="flex-1 grid place-items-center p-4 md:p-6 relative z-10">
        <div className="w-full max-w-md bg-[#111A2E]/90 backdrop-blur-xl border border-cyan-500/20 rounded-3xl p-6 md:p-8 shadow-2xl space-y-6 relative">
          
          {/* Card Title Header — High Contrast Icon Container with Shadow */}
          <div className="space-y-2 text-center">
            <div className="w-14 h-14 rounded-3xl bg-gradient-to-br from-cyan-500 to-teal-600 text-slate-950 grid place-items-center mx-auto mb-3 shadow-xl shadow-cyan-500/30 border border-cyan-400/40">
              <Icon icon="solar:lock-keyhole-bold-duotone" className="w-7 h-7 text-slate-950" />
            </div>
            <h1 className="text-xl md:text-2xl font-extrabold text-white tracking-tight">
              {mfaStep ? 'Multi-Factor Verification' : 'Super Admin Sign In'}
            </h1>
            <p className="text-xs text-slate-400">
              {mfaStep 
                ? 'Enter the 6-digit TOTP security code from your Authenticator app'
                : 'Sign in to access Tenant Zero Master Agency &amp; Tech Provider Setup'}
            </p>
          </div>

          {/* Feedback Banners */}
          {errorMessage && (
            <div className="bg-rose-950/80 border border-rose-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs text-rose-200">
              <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-mono">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-950/80 border border-emerald-500/40 rounded-2xl p-4 flex items-start gap-3 text-xs text-emerald-200">
              <Icon icon="solar:check-circle-bold-duotone" className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-mono">{successMessage}</div>
            </div>
          )}

          {/* Login Form Step 1 */}
          {!mfaStep ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Super Admin Email</label>
                <div className="relative">
                  <Icon icon="solar:letter-bold-duotone" className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: '' }));
                    }}
                    placeholder={PLATFORM_CONFIG.superAdminEmail}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 shadow-inner font-mono"
                    required
                  />
                </div>
                {fieldErrors.email && <span className="text-[10px] text-rose-400">{fieldErrors.email}</span>}
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300">Password</label>
                <div className="relative">
                  <Icon icon="solar:lock-password-bold-duotone" className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (fieldErrors.password) setFieldErrors((prev) => ({ ...prev, password: '' }));
                    }}
                    placeholder="••••••••••••••••"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 shadow-inner font-mono"
                    required
                  />
                </div>
                {fieldErrors.password && <span className="text-[10px] text-rose-400">{fieldErrors.password}</span>}
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-cyan-500 via-teal-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-slate-950 py-3 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-cyan-500/20 transition-all disabled:opacity-50 mt-4 active:scale-95"
              >
                {isLoading ? (
                  <>
                    <Icon icon="solar:restart-bold" className="w-4.5 h-4.5 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Authenticate Super Admin</span>
                    <Icon icon="solar:alt-arrow-right-bold" className="w-4.5 h-4.5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* MFA Form Step 2 */
            <form onSubmit={handleMfaVerify} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300 text-center">6-Digit Security Code</label>
                <div className="relative">
                  <Icon icon="solar:key-minimalistic-square-bold-duotone" className="w-4.5 h-4.5 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2.5 text-center text-base font-mono font-bold tracking-widest text-emerald-400 focus:outline-none focus:border-cyan-500 shadow-inner"
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMfaStep(false)}
                  className="w-1/3 bg-slate-900 hover:bg-slate-800 text-slate-300 py-2.5 rounded-2xl text-xs font-bold border border-slate-800"
                >
                  Back
                </button>
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length < 6}
                  className="w-2/3 bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 py-2.5 rounded-2xl text-xs font-black flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/20 disabled:opacity-50"
                >
                  {isLoading ? <Icon icon="solar:restart-bold" className="w-4.5 h-4.5 animate-spin" /> : 'Verify Code & Sign In'}
                </button>
              </div>
            </form>
          )}

          {/* Footer Metadata */}
          <div className="pt-4 border-t border-slate-800 text-center space-y-1">
            <div className="text-[11px] font-mono text-slate-400">
              Platform Control: <span className="text-cyan-400 font-bold">Master Agency (Tenant Zero)</span>
            </div>
            <div className="text-[10px] text-slate-500">
              Protected by Enterprise Multi-Tenant RLS &amp; Supabase Vault
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Footer Rail */}
      <footer className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/80 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
        <span>© 2026 iBloom CRM v2 — Enterprise WhatsApp Operations Platform</span>
        <span className="font-mono text-[10px] bg-slate-950 px-3 py-1 rounded-xl border border-slate-800 font-bold flex items-center gap-1.5">
          <Icon icon="logos:meta-icon" className="w-3.5 h-3.5" /> Meta App: {PLATFORM_CONFIG.metaAppName} ({PLATFORM_CONFIG.metaApiVersion})
        </span>
      </footer>
    </div>
  );
}
