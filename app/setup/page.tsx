'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { FormField } from '@/components/ui/FormField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { setupWizardSchema } from '@/lib/validations/schemas';
import { evaluatePhoneLineEligibility } from '@/lib/meta/eligibility-rulebook';

interface DiscoveredWaba {
  waba_id: string;
  name: string;
  currency: string;
  timezone_id: string;
  account_review_status: string;
  message_template_namespace?: string;
  business_id?: string;
  business_verification_status?: string;
}

interface DiscoveredPhone {
  id: string;
  waba_id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  code_verification_status: string;
  is_test_number: boolean;
  messaging_limit_tier?: string;
  name_status?: string;
}

export default function SetupWizardPage() {
  const router = useRouter();
  const supabase = createClient();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isAlreadyInitialized, setIsAlreadyInitialized] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Field-Level Validation Error State
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form State
  const [masterAgencyName, setMasterAgencyName] = useState(PLATFORM_CONFIG.masterAgencyName || 'iBloom Master Agency (Tenant Zero)');
  const [superAdminName, setSuperAdminName] = useState(PLATFORM_CONFIG.superAdminName);
  const [superAdminEmail, setSuperAdminEmail] = useState(PLATFORM_CONFIG.superAdminEmail);
  const [superAdminPhone, setSuperAdminPhone] = useState('+919876543210');
  const [password, setPassword] = useState('MasterAdmin@2026!');

  // Onboarding Step 1 state (Token & Business Portfolio)
  const [businessPortfolio, setBusinessPortfolio] = useState<{ business_id: string; name: string } | null>(null);
  const [tokenScopes, setTokenScopes] = useState<string[]>([]);
  const [code200Detected, setCode200Detected] = useState(false);
  const [metaTesting, setMetaTesting] = useState(false);

  // Onboarding Step 2 state (Discovered WABAs)
  const [discoveredWabas, setDiscoveredWabas] = useState<DiscoveredWaba[]>([]);
  const [selectedWabaIds, setSelectedWabaIds] = useState<string[]>([]);
  const [fetchingWabas, setFetchingWabas] = useState(false);

  // Onboarding Step 3 state (Discovered Phone Numbers)
  const [discoveredPhones, setDiscoveredPhones] = useState<DiscoveredPhone[]>([]);
  const [selectedPhoneIds, setSelectedPhoneIds] = useState<string[]>([]);
  const [fetchingPhones, setFetchingPhones] = useState(false);

  // Provisioning Result
  const [provisionResult, setProvisionResult] = useState<any>(null);

  useEffect(() => {
    async function checkSetupState() {
      try {
        const res = await fetch('/api/setup/initialize');
        const data = await res.json();
        if (data.isInitialized && data.masterAgency) {
          setIsAlreadyInitialized(true);
          setProvisionResult({
            masterAgency: data.masterAgency,
            superAdmin: { email: PLATFORM_CONFIG.superAdminEmail, name: PLATFORM_CONFIG.superAdminName, phone: '+919876543210' }
          });
        }
      } catch (err) {
        console.warn('Setup state check notice:', err);
      }
    }
    checkSetupState();
  }, []);

  function validateFields() {
    const result = setupWizardSchema.safeParse({
      masterAgencyName,
      superAdminName,
      superAdminEmail,
      superAdminPhone,
      password,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        errors[key] = issue.message;
      });
      setFieldErrors(errors);
      toast.error('Validation Error', { description: 'Please fix the errors before proceeding.' });
      return false;
    }

    setFieldErrors({});
    return true;
  }

  async function handleAuthenticateAndRedirect(targetUrl: string = '/dashboard') {
    setIsRedirecting(true);
    setErrorMessage(null);

    try {
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: superAdminEmail,
        password: password,
      });

      if (loginErr) {
        console.warn('Auto-login notice, retrying:', loginErr.message);
        await new Promise((r) => setTimeout(r, 600));
        const { error: retryErr } = await supabase.auth.signInWithPassword({
          email: superAdminEmail,
          password: password,
        });

        if (retryErr) {
          toast.info('Onboarding Complete! Please log in to your account.', {
            description: `Email: ${superAdminEmail}`,
          });
          window.location.href = '/login';
          return;
        }
      }

      toast.success('Launching Dashboard...', { description: 'Authenticated with GoTrue Session.' });
      window.location.href = targetUrl;
    } catch (err: any) {
      console.warn('Auto-login fallback:', err);
      window.location.href = '/login';
    }
  }

  // Step 1 Execution: Test Meta Access Token & Resolve Portfolio
  async function handleStep1TokenResolution() {
    if (!validateFields()) return;

    setMetaTesting(true);
    setErrorMessage(null);
    setCode200Detected(false);

    try {
      const res = await fetch('/api/meta/onboarding?step=1');
      const data = await res.json();

      if (data.errorCode200Detected) {
        setCode200Detected(true);
        toast.error('Meta Code 200 Detected', { description: 'Missing Business Asset Access in Meta Manager.' });
      }

      if (data.success && data.portfolio) {
        setBusinessPortfolio(data.portfolio);
        setTokenScopes(data.scopes || []);
        toast.success(`Business Portfolio Resolved: ${data.portfolio.name}`, {
          description: `Portfolio ID: ${data.portfolio.business_id}`,
        });
        setCurrentStep(2);
        await handleStep2FetchWabas(data.portfolio.business_id);
      } else {
        setErrorMessage(data.error || 'Failed to resolve Meta Business Portfolio.');
        toast.error('Token Resolution Failed', { description: data.error });
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error resolving Meta Business Portfolio.';
      setErrorMessage(msg);
      toast.error('Exception', { description: msg });
    } finally {
      setMetaTesting(false);
    }
  }

  // Step 2 Execution: Discover WABAs under Portfolio
  async function handleStep2FetchWabas(bizId: string) {
    setFetchingWabas(true);
    try {
      const res = await fetch(`/api/meta/onboarding?step=2&business_id=${encodeURIComponent(bizId)}`);
      const data = await res.json();
      if (data.success && data.wabas) {
        setDiscoveredWabas(data.wabas);
        setSelectedWabaIds(data.wabas.map((w: DiscoveredWaba) => w.waba_id));
        toast.info(`Discovered ${data.wabas.length} WABA Account(s)`);
      }
    } catch (err: any) {
      toast.error('WABA Discovery Error', { description: err?.message });
    } finally {
      setFetchingWabas(false);
    }
  }

  // Step 2 Next Button: Fetch Phone Lines for Selected WABAs
  async function handleStep2Proceed() {
    if (selectedWabaIds.length === 0) {
      toast.error('Select at least one WABA account');
      return;
    }

    setFetchingPhones(true);
    setCurrentStep(3);

    try {
      const allPhones: DiscoveredPhone[] = [];
      for (const wabaId of selectedWabaIds) {
        const res = await fetch(`/api/meta/onboarding?step=3&waba_id=${encodeURIComponent(wabaId)}`);
        const data = await res.json();
        if (data.success && data.phoneNumbers) {
          allPhones.push(...data.phoneNumbers);
        }
      }
      setDiscoveredPhones(allPhones);
      setSelectedPhoneIds(allPhones.map((p) => p.id));
      toast.info(`Discovered ${allPhones.length} Phone Line Asset(s)`);
    } catch (err: any) {
      toast.error('Phone Line Discovery Error', { description: err?.message });
    } finally {
      setFetchingPhones(false);
    }
  }

  // Step 4 Execution: Provision & Save Selected Assets to Supabase DB
  async function handleStep4FinalizeProvisioning() {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const selectedWabaObjects = discoveredWabas.filter((w) => selectedWabaIds.includes(w.waba_id));
      const selectedPhoneObjects = discoveredPhones.filter((p) => selectedPhoneIds.includes(p.id));

      const res = await fetch('/api/meta/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          masterAgencyName,
          superAdminName,
          superAdminEmail,
          superAdminPhone,
          password,
          business_id: businessPortfolio?.business_id || PLATFORM_CONFIG.metaBusinessPortfolioId,
          wabas: selectedWabaObjects,
          phoneNumbers: selectedPhoneObjects,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setProvisionResult(data);
        setIsAlreadyInitialized(true);
        toast.success('Master Agency Onboarding Complete!', {
          description: `Saved ${selectedWabaObjects.length} WABA(s) & ${selectedPhoneObjects.length} Line(s) to Database.`,
        });
        await handleAuthenticateAndRedirect('/dashboard');
      } else {
        setErrorMessage(data.error || 'Failed to complete Master Agency provisioning.');
        toast.error('Provisioning Failed', { description: data.error });
      }
    } catch (err: any) {
      const msg = err?.message || 'Network error completing Master Agency setup.';
      setErrorMessage(msg);
      toast.error('Provisioning Exception', { description: msg });
    } finally {
      setIsLoading(false);
    }
  }

  const toggleWabaSelection = (wabaId: string) => {
    setSelectedWabaIds((prev) =>
      prev.includes(wabaId) ? prev.filter((id) => id !== wabaId) : [...prev, wabaId]
    );
  };

  const togglePhoneSelection = (phoneId: string) => {
    setSelectedPhoneIds((prev) =>
      prev.includes(phoneId) ? prev.filter((id) => id !== phoneId) : [...prev, phoneId]
    );
  };

  return (
    <div className="min-h-screen bg-[#0A0D14] text-white flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans selection:bg-cyan-500/20 selection:text-cyan-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-4xl space-y-4">
        {/* Top Header Brand Badge */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-white text-slate-950 grid place-items-center shadow-xl border border-slate-700/50">
            <Icon icon="logos:meta-icon" className="w-7 h-7" />
          </div>
          <div className="text-left">
            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
              <span>{masterAgencyName}</span>
            </h1>
            <p className="text-xs text-cyan-400 font-mono font-bold tracking-widest uppercase">
              Master Agency Chained Setup Stepper (Meta API v25.0)
            </p>
          </div>
        </div>

        {/* Setup Wizard Progress Stepper Rail */}
        <div className="bg-[#111A2E]/90 border border-cyan-500/20 rounded-3xl p-4 shadow-2xl backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-2 text-center text-xs font-mono">
            <div className={`p-2.5 rounded-2xl border transition-all ${currentStep === 1 ? 'bg-cyan-950 text-cyan-400 border-cyan-500/60 font-bold' : currentStep > 1 ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
              Step 1: Auth &amp; Portfolio
            </div>
            <div className={`p-2.5 rounded-2xl border transition-all ${currentStep === 2 ? 'bg-cyan-950 text-cyan-400 border-cyan-500/60 font-bold' : currentStep > 2 ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
              Step 2: Discovered WABAs
            </div>
            <div className={`p-2.5 rounded-2xl border transition-all ${currentStep === 3 ? 'bg-cyan-950 text-cyan-400 border-cyan-500/60 font-bold' : currentStep > 3 ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/40' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
              Step 3: Phone Assets
            </div>
            <div className={`p-2.5 rounded-2xl border transition-all ${currentStep === 4 ? 'bg-cyan-950 text-cyan-400 border-cyan-500/60 font-bold' : 'bg-slate-900 text-slate-500 border-slate-800'}`}>
              Step 4: Commit &amp; Enroll
            </div>
          </div>
        </div>
      </div>

      {/* Main Step Cards */}
      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-4xl">
        <div className="bg-[#111A2E]/90 border border-cyan-500/20 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 backdrop-blur-xl">
          {/* STEP 1: Super Admin & Meta Token Credentials Form */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Icon icon="solar:user-check-bold-duotone" className="w-5 h-5 text-cyan-400" />
                  Step 1: Super Admin Credentials &amp; Meta Portfolio ID
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Configure Tenant Zero Master Agency account &amp; test System User token access.
                </p>
              </div>

              {code200Detected && (
                <div className="p-4 bg-rose-950/80 border border-rose-500/40 rounded-2xl text-xs text-rose-200 flex items-start gap-3">
                  <Icon icon="solar:danger-triangle-bold-duotone" className="w-5 h-5 shrink-0 text-rose-400 mt-0.5" />
                  <div>
                    <span className="font-bold block text-white">Meta Error Code 200 (Asset Access Required):</span>
                    System User token is valid, but Meta Graph API returned Error Code 200. Grant Full Control to this WABA in Meta Business Manager.
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FormField
                  id="masterAgencyName"
                  label="Master Agency Name"
                  value={masterAgencyName}
                  onChange={(e) => setMasterAgencyName(e.target.value)}
                  error={fieldErrors.masterAgencyName}
                  icon={<Icon icon="solar:building-3-bold-duotone" className="w-4.5 h-4.5 text-slate-400" />}
                />

                <FormField
                  id="superAdminName"
                  label="Super Admin Full Name"
                  value={superAdminName}
                  onChange={(e) => setSuperAdminName(e.target.value)}
                  error={fieldErrors.superAdminName}
                  icon={<Icon icon="solar:user-check-bold-duotone" className="w-4.5 h-4.5 text-slate-400" />}
                />

                <FormField
                  id="superAdminEmail"
                  label="Super Admin Email (GoTrue Auth)"
                  type="email"
                  value={superAdminEmail}
                  onChange={(e) => setSuperAdminEmail(e.target.value)}
                  error={fieldErrors.superAdminEmail}
                  icon={<Icon icon="solar:letter-bold-duotone" className="w-4.5 h-4.5 text-slate-400" />}
                />

                <PhoneInput
                  id="superAdminPhone"
                  label="Super Admin Phone"
                  value={superAdminPhone}
                  onChange={(val) => setSuperAdminPhone(val)}
                  error={fieldErrors.superAdminPhone}
                />

                <FormField
                  id="password"
                  label="Super Admin Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  error={fieldErrors.password}
                  icon={<Icon icon="solar:lock-password-bold-duotone" className="w-4.5 h-4.5 text-slate-400" />}
                />

                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    Meta Business Portfolio ID (<code className="text-cyan-400 font-mono">NEXT_PUBLIC_META_BUSINESS_PORTFOLIO_ID</code>)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={PLATFORM_CONFIG.metaBusinessPortfolioId}
                    className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs font-mono text-cyan-400 cursor-not-allowed opacity-80"
                  />
                  <p className="text-[10px] text-slate-500 font-mono">Configured in `.env.local` for Master Agency owned assets.</p>
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleStep1TokenResolution}
                  disabled={metaTesting}
                  className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-extrabold px-6 py-3 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  {metaTesting ? (
                    <>
                      <Icon icon="solar:restart-bold" className="w-4.5 h-4.5 animate-spin" />
                      <span>Resolving Meta Portfolio...</span>
                    </>
                  ) : (
                    <>
                      <Icon icon="solar:shield-check-bold" className="w-4.5 h-4.5" />
                      <span>Test Access Token &amp; Proceed to Step 2 →</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Discovered Owned WABAs */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Icon icon="solar:building-3-bold-duotone" className="w-5 h-5 text-cyan-400" />
                  Step 2: Discovered Owned WABA Accounts
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Querying <code className="text-cyan-400 font-mono">owned_whatsapp_business_accounts</code> under Portfolio ID {businessPortfolio?.business_id}.
                </p>
              </div>

              {fetchingWabas ? (
                <div className="py-12 text-center space-y-3">
                  <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                  <p className="text-xs text-slate-400 font-mono">Discovering WABAs from Meta Graph API v25.0...</p>
                </div>
              ) : discoveredWabas.length === 0 ? (
                <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 font-mono">
                  No WABA accounts discovered for Portfolio ID {businessPortfolio?.business_id}.
                </div>
              ) : (
                <div className="space-y-3">
                  {discoveredWabas.map((waba) => {
                    const isSelected = selectedWabaIds.includes(waba.waba_id);
                    return (
                      <div
                        key={waba.waba_id}
                        onClick={() => toggleWabaSelection(waba.waba_id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 flex items-center justify-between ${
                          isSelected
                            ? 'bg-cyan-950/40 border-cyan-500 text-white shadow-lg shadow-cyan-900/20'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-white text-slate-950 grid place-items-center shrink-0">
                            <Icon icon="logos:meta-icon" className="w-5 h-5" />
                          </div>
                          <div className="space-y-0.5">
                            <div className="text-sm font-bold text-white font-mono">{waba.name}</div>
                            <div className="text-xs text-slate-400 font-mono">WABA ID: {waba.waba_id} | Namespace: {waba.message_template_namespace || 'ibloom_template_ns'}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
                            {waba.account_review_status}
                          </span>
                          <div className={`w-6 h-6 rounded-full border-2 grid place-items-center ${isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700'}`}>
                            {isSelected && <Icon icon="solar:check-read-bold" className="w-4 h-4 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs text-slate-400 hover:text-white font-mono flex items-center gap-1"
                >
                  ← Back to Step 1
                </button>

                <button
                  type="button"
                  onClick={handleStep2Proceed}
                  disabled={selectedWabaIds.length === 0 || fetchingWabas}
                  className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-extrabold px-6 py-3 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  <span>Discover Phone Line Assets →</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: Discovered Phone Line Assets */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Icon icon="logos:whatsapp-icon" className="w-5 h-5" />
                  Step 3: Discovered WhatsApp Phone Line Assets
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Select WhatsApp phone line assets to enroll into Master Agency Database.
                </p>
              </div>

              {fetchingPhones ? (
                <div className="py-12 text-center space-y-3">
                  <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
                  <p className="text-xs text-slate-400 font-mono">Discovering phone numbers linked to selected WABAs...</p>
                </div>
              ) : discoveredPhones.length === 0 ? (
                <div className="p-8 bg-slate-950/60 border border-slate-800 rounded-2xl text-center text-xs text-slate-400 font-mono">
                  No phone lines discovered for selected WABAs.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {discoveredPhones.map((phone) => {
                    const isSelected = selectedPhoneIds.includes(phone.id);
                    return (
                      <div
                        key={phone.id}
                        onClick={() => togglePhoneSelection(phone.id)}
                        className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 space-y-3 ${
                          isSelected
                            ? 'bg-emerald-950/30 border-emerald-500 text-white shadow-lg shadow-emerald-900/20'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="w-9 h-9 rounded-xl bg-[#132A20] border border-emerald-500/40 p-1.5 flex items-center justify-center">
                            <Icon icon="logos:whatsapp-icon" className="w-5 h-5" />
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950 text-cyan-400 border border-cyan-800">
                            {phone.messaging_limit_tier || 'TIER_1K'}
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <div className="text-base font-extrabold text-white font-mono">{phone.display_phone_number}</div>
                          <div className="text-xs text-slate-300 truncate">{phone.verified_name || 'iBloom Verified Line'}</div>
                        </div>

                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                          <span className="text-emerald-400 font-bold">Quality: {phone.quality_rating}</span>
                          <div className={`w-5 h-5 rounded-full border-2 grid place-items-center ${isSelected ? 'bg-emerald-500 border-emerald-400 text-slate-950' : 'border-slate-700'}`}>
                            {isSelected && <Icon icon="solar:check-read-bold" className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="text-xs text-slate-400 hover:text-white font-mono flex items-center gap-1"
                >
                  ← Back to Step 2
                </button>

                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  disabled={selectedPhoneIds.length === 0}
                  className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-extrabold px-6 py-3 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
                >
                  <span>Review &amp; Finalize Provisioning →</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Review, Rulebook Eligibility Matrix & Single-Click DB Commit */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="border-b border-slate-800 pb-4 space-y-1">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Icon icon="solar:rocket-bold-duotone" className="w-5 h-5 text-emerald-400 animate-pulse" />
                  Step 4: Asset Eligibility Diagnostic Matrix &amp; DB Enrollment
                </h2>
                <p className="text-xs text-slate-400 font-sans">
                  Rulebook evaluation matrix executed for selected Meta WABAs &amp; WhatsApp Phone line assets.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                  <div className="text-cyan-400 font-bold uppercase text-[10px]">Master Agency Account</div>
                  <div className="text-white font-extrabold text-sm">{masterAgencyName}</div>
                  <div className="text-slate-400">Super Admin: {superAdminName} ({superAdminEmail})</div>
                  <div className="text-slate-400">Portfolio ID: {businessPortfolio?.business_id || PLATFORM_CONFIG.metaBusinessPortfolioId}</div>
                </div>

                <div className="p-4 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-2">
                  <div className="text-emerald-400 font-bold uppercase text-[10px]">Selected Assets Summary</div>
                  <div className="text-white font-bold">{selectedWabaIds.length} WABA Account(s) Selected</div>
                  <div className="text-white font-bold">{selectedPhoneIds.length} Phone Line Asset(s) Selected</div>
                  <div className="text-slate-400">Target Tenant: <strong className="text-emerald-400">Tenant Zero (Master Control)</strong></div>
                </div>
              </div>

              {/* Asset Eligibility Evaluation Rulebook Matrix Table */}
              <div className="space-y-3">
                <div className="text-xs font-bold text-white font-mono flex items-center justify-between">
                  <span>Phone Line Asset Eligibility Diagnostic Scores ({selectedPhoneIds.length})</span>
                  <span className="text-[10px] text-cyan-400">Evaluated against 5-Point Diagnostic Rulebook</span>
                </div>

                <div className="space-y-3">
                  {discoveredPhones
                    .filter((p) => selectedPhoneIds.includes(p.id))
                    .map((phone) => {
                      const eligibility = evaluatePhoneLineEligibility({
                        phone_number_id: phone.id,
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
                          key={phone.id}
                          className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-xs font-mono"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
                            <div className="flex items-center gap-2">
                              <Icon icon="logos:whatsapp-icon" className="w-4.5 h-4.5" />
                              <span className="font-extrabold text-white">{phone.display_phone_number}</span>
                              <span className="text-slate-400 text-[11px]">({phone.verified_name || 'iBloom Line'})</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                                  isProd
                                    ? 'bg-emerald-950 text-emerald-400 border-emerald-700'
                                    : 'bg-blue-950 text-blue-400 border-blue-700'
                                }`}
                              >
                                {isProd ? '🟢 QUALIFIED PRODUCTION' : '🧪 QUALIFIED SANDBOX'}
                              </span>
                              <span className="text-cyan-400 font-bold text-[11px]">Score: {eligibility.score}/100</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                            {eligibility.diagnostics.map((diag) => (
                              <div key={diag.key} className="flex items-center gap-1.5 text-slate-300">
                                <Icon
                                  icon={diag.passed ? 'solar:check-circle-bold' : 'solar:danger-triangle-bold-duotone'}
                                  className={`w-3.5 h-3.5 shrink-0 ${diag.passed ? 'text-emerald-400' : 'text-amber-400'}`}
                                />
                                <span>{diag.label}:</span>
                                <strong className={diag.passed ? 'text-white' : 'text-amber-400'}>{diag.message}</strong>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              {errorMessage && (
                <div className="p-4 bg-rose-950/80 border border-rose-500/40 rounded-2xl text-xs text-rose-200 font-mono">
                  {errorMessage}
                </div>
              )}

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={isLoading}
                  className="text-xs text-slate-400 hover:text-white font-mono flex items-center gap-1"
                >
                  ← Back to Step 3
                </button>

                <button
                  type="button"
                  onClick={handleStep4FinalizeProvisioning}
                  disabled={isLoading || isRedirecting}
                  className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-black px-8 py-3.5 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-emerald-500/20 active:scale-95 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Icon icon="solar:restart-bold" className="w-5 h-5 animate-spin text-slate-950" />
                      <span>Enrolling WABAs &amp; Phone Lines to Database...</span>
                    </>
                  ) : (
                    <>
                      <Icon icon="solar:rocket-bold-duotone" className="w-5 h-5 text-slate-950" />
                      <span>Commit Assets to DB &amp; Launch Platform →</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
