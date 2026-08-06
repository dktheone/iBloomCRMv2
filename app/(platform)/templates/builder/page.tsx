'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useWabaContext } from '@/lib/context/waba-context';
import PhoneSimulator from '../components/PhoneSimulator';
import AIModal from '../components/AIModal';
import { createClient } from '@/lib/supabase/client';
import {
  WhatsAppTemplate,
  TemplateCategory,
  MarketingSubtype,
  HeaderType,
  TemplateButton,
  VariableExample,
} from '@/lib/types/template-types';

function TemplateBuilderContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { activeLine } = useWabaContext();

  const editId = searchParams.get('id');
  const cloneParam = searchParams.get('clone');
  const isEditMode = Boolean(editId);

  // Form Fields
  const [templateName, setTemplateName] = useState('');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState<TemplateCategory>('MARKETING');
  const [marketingSubtype, setMarketingSubtype] = useState<MarketingSubtype>('STANDARD');
  const [offerText, setOfferText] = useState('Limited Offer');

  // Header Setup
  const [headerType, setHeaderType] = useState<HeaderType>('NONE');
  const [headerText, setHeaderText] = useState('Welcome to iBloom');
  const [mediaUrl, setMediaUrl] = useState('');
  const [mediaFileName, setMediaFileName] = useState('');
  const [mediaFileSize, setMediaFileSize] = useState('');

  // Body & Variables
  const [bodyText, setBodyText] = useState('Hello *{{1}}*! Thank you for choosing our services.');
  const [variables, setVariables] = useState<VariableExample[]>([{ index: 1, exampleValue: 'Customer' }]);

  // Footer & Opt-Out
  const [footerText, setFooterText] = useState('Reply STOP to opt out.');

  // Buttons
  const [buttons, setButtons] = useState<TemplateButton[]>([]);

  // Authentication OTP Config
  const [authConfig, setAuthConfig] = useState({
    otpLength: 6,
    codeExpiryMinutes: 10,
    buttonText: 'Copy Code',
  });

  // UI Modals & State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isMockUploading, setIsMockUploading] = useState(false);

  // Load existing or cloned template data
  useEffect(() => {
    async function loadTemplateForEdit() {
      if (!editId) return;
      try {
        const { data: tmpl } = await supabase
          .from('wa_templates')
          .select('*')
          .or(`template_uid.eq.${editId},meta_template_id.eq.${editId}`)
          .maybeSingle();

        if (tmpl) {
          setTemplateName(tmpl.name || '');
          setLanguage(tmpl.language || 'en_US');
          setCategory(tmpl.category || 'MARKETING');
          setMarketingSubtype(tmpl.marketing_subtype || 'STANDARD');
          setOfferText(tmpl.offer_text || 'Limited Offer');

          const components = Array.isArray(tmpl.components) ? tmpl.components : [];
          const headerComp = components.find((c: any) => c.type === 'HEADER');
          const bodyComp = components.find((c: any) => c.type === 'BODY');
          const footerComp = components.find((c: any) => c.type === 'FOOTER');
          const btnComp = components.find((c: any) => c.type === 'BUTTONS');

          if (headerComp) {
            setHeaderType(headerComp.format || 'TEXT');
            setHeaderText(headerComp.text || '');
            setMediaUrl(headerComp.media_url || '');
          }

          if (bodyComp) {
            setBodyText(bodyComp.text || '');
            if (bodyComp.examples) setVariables(bodyComp.examples);
          } else if (tmpl.body_text) {
            setBodyText(tmpl.body_text);
          }

          if (footerComp) {
            setFooterText(footerComp.text || '');
          }

          if (btnComp && btnComp.buttons) {
            setButtons(
              btnComp.buttons.map((b: any, idx: number) => ({
                id: b.id || `btn_${idx}_${Date.now()}`,
                type: b.type || 'QUICK_REPLY',
                text: b.text || '',
                value: b.url || b.phone_number || b.value || '',
              }))
            );
          }
        }
      } catch (err) {
        console.error('Error loading template for edit:', err);
      }
    }

    if (editId) {
      loadTemplateForEdit();
    } else if (cloneParam) {
      try {
        const cloned: WhatsAppTemplate = JSON.parse(decodeURIComponent(cloneParam));
        setTemplateName(cloned.name || '');
        setLanguage(cloned.language || 'en_US');
        setCategory(cloned.category || 'MARKETING');
        setMarketingSubtype(cloned.marketingSubtype || 'STANDARD');
        setOfferText(cloned.offerText || 'Limited Offer');
        setHeaderType(cloned.header?.type || 'NONE');
        setHeaderText(cloned.header?.textValue || '');
        setMediaUrl(cloned.header?.mediaUrl || '');
        setBodyText(cloned.body?.text || '');
        if (cloned.body?.examples) setVariables(cloned.body.examples);
        setFooterText(cloned.footer?.text || '');
        if (cloned.buttons) {
          setButtons(
            cloned.buttons.map((b: any, idx: number) => ({
              id: b.id || `btn_${idx}_${Date.now()}`,
              type: b.type || 'QUICK_REPLY',
              text: b.text || '',
              value: b.url || b.phone_number || b.value || '',
            }))
          );
        }
      } catch (err) {
        console.error('Error parsing clone parameter:', err);
      }
    }
  }, [editId, cloneParam]);

  // Automated Variable Observer scanning {{n}} markers in body text
  useEffect(() => {
    const varMatches = bodyText.match(/\{\{(\d+)\}\}/g) || [];
    const uniqueIndexes = Array.from(
      new Set(
        varMatches
          .map((m) => {
            const match = m.match(/\d+/);
            return match ? parseInt(match[0]) : null;
          })
          .filter(Boolean) as number[]
      )
    ).sort((a, b) => a - b);

    const newVars = uniqueIndexes.map((idx) => {
      const existing = variables.find((v) => v.index === idx);
      return {
        index: idx,
        exampleValue: existing ? existing.exampleValue : `Value for ${idx}`,
      };
    });
    setVariables(newVars);
  }, [bodyText]);

  // Actions
  function addVariableToBody() {
    const nextIdx = variables.length + 1;
    setBodyText((prev) => `${prev} {{${nextIdx}}}`);
  }

  function handleMockFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      toast.error('File Exceeds Limit', { description: 'Media file must be less than 25MB.' });
      return;
    }

    setIsMockUploading(true);
    setTimeout(() => {
      setIsMockUploading(false);
      setMediaFileName(file.name);
      setMediaFileSize(`${(file.size / (1024 * 1024)).toFixed(2)} MB`);
      setMediaUrl(URL.createObjectURL(file));
      toast.success('Media Header Asset Uploaded!', {
        description: `Loaded ${file.name} ready for Meta API payload.`,
      });
    }, 1000);
  }

  function handleAddButton(type: 'URL' | 'PHONE_NUMBER' | 'QUICK_REPLY') {
    const urlCount = buttons.filter((b) => b.type === 'URL').length;
    const phoneCount = buttons.filter((b) => b.type === 'PHONE_NUMBER').length;
    const quickCount = buttons.filter((b) => b.type === 'QUICK_REPLY').length;

    if (type === 'URL' && urlCount >= 2) {
      toast.error('Limit Reached', { description: 'Maximum 2 URL buttons allowed per template.' });
      return;
    }
    if (type === 'PHONE_NUMBER' && phoneCount >= 1) {
      toast.error('Limit Reached', { description: 'Maximum 1 Phone Call button allowed per template.' });
      return;
    }
    if (type === 'QUICK_REPLY' && quickCount >= 3) {
      toast.error('Limit Reached', { description: 'Maximum 3 Quick Reply chips allowed.' });
      return;
    }

    const newBtn: TemplateButton = {
      id: `btn-${Date.now()}`,
      type,
      text: type === 'URL' ? 'Visit Website' : type === 'PHONE_NUMBER' ? 'Call Support' : 'Confirm',
      value: type === 'URL' ? 'https://ibloomsolutions.com' : type === 'PHONE_NUMBER' ? '+1234567890' : 'Confirm',
    };
    setButtons([...buttons, newBtn]);
  }

  function handleRemoveButton(id: string) {
    setButtons(buttons.filter((b) => b.id !== id));
  }

  async function handleSaveAndPublish(targetStatus: 'APPROVED' | 'PENDING' | 'DRAFT' = 'PENDING') {
    if (!templateName.trim()) {
      toast.error('Template Name Required');
      return;
    }

    // Name Regex Validation: Lowercase alphanumeric & underscores only
    const nameRegex = /^[a-z0-9_]+$/;
    if (!nameRegex.test(templateName.trim())) {
      toast.error('Invalid Template Name Format', {
        description: 'Lowercase letters, numbers, and underscores only (^[a-z0-9_]+$).',
      });
      return;
    }

    if (!bodyText.trim()) {
      toast.error('Message Body Required');
      return;
    }

    setIsSubmitting(true);
    try {
      const templatePayload: WhatsAppTemplate = {
        waba_id: activeLine?.waba_id || '108492048102948',
        name: templateName.trim(),
        language,
        category,
        marketingSubtype,
        offerText,
        status: targetStatus,
        header: {
          type: headerType,
          textValue: headerText,
          mediaUrl,
          mediaFileName,
          mediaFileSize,
        },
        body: {
          text: bodyText,
          examples: variables,
        },
        footer: {
          text: footerText,
        },
        buttons,
        authConfig: category === 'AUTHENTICATION' ? authConfig : undefined,
      };

      const res = await fetch('/api/meta/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(templatePayload),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Template "${templateName}" ${targetStatus === 'DRAFT' ? 'Saved as Draft' : 'Submitted for Meta Review'}!`, {
          description: 'Saved to Master Template Group in Supabase DB.',
          icon: <Icon icon="solar:check-circle-bold" className="w-5 h-5 text-emerald-400" />,
        });
        router.push('/templates');
      } else {
        toast.error('Save Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception saving template', { description: err?.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  const currentTemplateState: Partial<WhatsAppTemplate> = {
    name: templateName || 'new_template',
    language,
    category,
    marketingSubtype,
    offerText,
    header: {
      type: headerType,
      textValue: headerText,
      mediaUrl,
      mediaFileName,
      mediaFileSize,
    },
    body: {
      text: bodyText,
      examples: variables,
    },
    footer: {
      text: footerText,
    },
    buttons,
    authConfig,
  };

  return (
    <div className="space-y-6 p-2 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 transition-colors font-sans">
      {/* HEADER CONTROL BAR */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#0F172A]/90 dark:via-[#131C31]/90 dark:to-[#0F172A]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 shadow-xl dark:shadow-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/templates"
            className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 grid place-items-center transition-colors shrink-0"
          >
            <Icon icon="solar:alt-arrow-left-bold" className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              {isEditMode ? 'Edit WhatsApp Template' : 'Create New WhatsApp Template'}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure your WhatsApp message template with rich design and real-time simulator.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          <button
            onClick={() => setIsAIModalOpen(true)}
            className="bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white px-4 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all shadow-lg active:scale-95"
          >
            <Icon icon="solar:sparkles-bold" className="w-4 h-4" />
            <span>Build with AI</span>
          </button>

          <button
            onClick={() => handleSaveAndPublish('DRAFT')}
            disabled={isSubmitting}
            className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 px-4 py-2.5 rounded-2xl text-xs font-bold transition-all border border-slate-200 dark:border-slate-700 active:scale-95 disabled:opacity-50"
          >
            Save as Draft
          </button>

          <button
            onClick={() => handleSaveAndPublish('PENDING')}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white dark:text-slate-950 font-black px-6 py-2.5 rounded-2xl text-xs flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 active:scale-95 disabled:opacity-50"
          >
            <Icon icon="solar:check-circle-bold" className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
            <span>{isSubmitting ? 'Publishing...' : 'Save & Publish'}</span>
          </button>
        </div>
      </div>

      {/* SPLIT-SCREEN WORKSPACE LAYOUT: CONFIGURATION FORM (LEFT) vs REAL-TIME MOBILE SIMULATOR (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT PANEL: CONFIGURATION FORM EDITOR */}
        <div className="lg:col-span-7 bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 space-y-6 shadow-xl dark:shadow-2xl text-xs font-sans">
          {/* SECTION 1: NAME & LANGUAGE */}
          <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Icon icon="solar:pen-new-square-bold-duotone" className="w-4.5 h-4.5 text-cyan-500" />
              1. Name &amp; Language Setup
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Template Name *</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value.toLowerCase())}
                  disabled={isEditMode}
                  placeholder="e.g. welcome_message_offer"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:border-cyan-500 disabled:opacity-60"
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                  {isEditMode
                    ? 'Template name cannot be changed after creation.'
                    : 'Lowercase letters, numbers and underscores only (^[a-z0-9_]+$).'}
                </p>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Template Language</label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 font-bold"
                >
                  <option value="en_US">English (US) [en_US]</option>
                  <option value="es_ES">Spanish [es_ES]</option>
                  <option value="hi_IN">Hindi [hi_IN]</option>
                  <option value="ar_SA">Arabic [ar_SA]</option>
                </select>
              </div>
            </div>
          </div>

          {/* SECTION 2: CATEGORY STRATEGY CARDS */}
          <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Icon icon="solar:layers-bold-duotone" className="w-4.5 h-4.5 text-teal-500" />
              2. Template Category Strategy
            </h3>

            <div className="grid grid-cols-3 gap-3 font-mono text-xs">
              <button
                type="button"
                onClick={() => setCategory('MARKETING')}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  category === 'MARKETING'
                    ? 'bg-purple-500/10 border-purple-500 text-purple-600 dark:text-purple-300 font-extrabold ring-1 ring-purple-500/30'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Marketing
              </button>

              <button
                type="button"
                onClick={() => setCategory('UTILITY')}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  category === 'UTILITY'
                    ? 'bg-sky-500/10 border-sky-500 text-sky-600 dark:text-sky-300 font-extrabold ring-1 ring-sky-500/30'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Utility
              </button>

              <button
                type="button"
                onClick={() => setCategory('AUTHENTICATION')}
                className={`p-3 rounded-2xl border text-center transition-all ${
                  category === 'AUTHENTICATION'
                    ? 'bg-teal-500/10 border-teal-500 text-teal-600 dark:text-teal-300 font-extrabold ring-1 ring-teal-500/30'
                    : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                }`}
              >
                Authentication
              </button>
            </div>

            {/* MARKETING SUB-TYPES SELECTION GRID */}
            {category === 'MARKETING' && (
              <div className="space-y-3 p-3.5 bg-purple-500/5 border border-purple-500/20 rounded-2xl">
                <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 text-xs">
                  <Icon icon="solar:tag-horizontal-bold-duotone" className="w-4 h-4 text-purple-400" />
                  Marketing Template Type
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px] font-mono">
                  {(
                    [
                      'STANDARD',
                      'LIMITED_TIME_OFFER',
                      'COUPON_CODE',
                      'CATALOG',
                      'CALL_PERMISSION',
                      'CAROUSEL_MEDIA',
                    ] as const
                  ).map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => setMarketingSubtype(sub)}
                      className={`p-2 rounded-xl border transition-all truncate ${
                        marketingSubtype === sub
                          ? 'bg-purple-600 text-white font-bold border-purple-400'
                          : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {sub.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>

                {marketingSubtype === 'LIMITED_TIME_OFFER' && (
                  <div className="space-y-1 pt-2">
                    <label className="font-bold text-amber-500 text-xs">Offer Text (Max 60 chars)</label>
                    <input
                      type="text"
                      value={offerText}
                      onChange={(e) => setOfferText(e.target.value)}
                      placeholder="e.g. Limited Offer - 24h Left"
                      maxLength={60}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white font-mono"
                    />
                  </div>
                )}
              </div>
            )}

            {/* AUTHENTICATION FORM CONTROLS */}
            {category === 'AUTHENTICATION' && (
              <div className="space-y-3 p-3.5 bg-teal-500/5 border border-teal-500/20 rounded-2xl text-xs font-sans">
                <div className="text-teal-400 font-bold flex items-center gap-1.5">
                  <Icon icon="solar:shield-keyhole-bold-duotone" className="w-4 h-4" />
                  Meta Security Specification OTP Rules
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Authentication templates use Meta's fixed security layout. You can configure OTP length, expiry, and Copy Code button parameters below:
                </p>

                <div className="grid grid-cols-2 gap-3 font-mono">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-300">OTP Code Length (4-8)</label>
                    <input
                      type="number"
                      min={4}
                      max={8}
                      value={authConfig.otpLength}
                      onChange={(e) => setAuthConfig({ ...authConfig, otpLength: parseInt(e.target.value) || 6 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white font-bold"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-300">Expiry (Minutes 1-90)</label>
                    <input
                      type="number"
                      min={1}
                      max={90}
                      value={authConfig.codeExpiryMinutes}
                      onChange={(e) => setAuthConfig({ ...authConfig, codeExpiryMinutes: parseInt(e.target.value) || 10 })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-white font-bold"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* SECTION 3: TEMPLATE HEADER (OPTIONAL) */}
          <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Icon icon="solar:gallery-wide-bold-duotone" className="w-4.5 h-4.5 text-cyan-500" />
              3. Header Configuration (Optional)
            </h3>

            <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
              {(['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'] as const).map((hType) => (
                <button
                  key={hType}
                  type="button"
                  onClick={() => setHeaderType(hType)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    headerType === hType
                      ? 'bg-cyan-600 text-white shadow-xs'
                      : 'bg-slate-100 dark:bg-slate-950 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-900'
                  }`}
                >
                  {hType}
                </button>
              ))}
            </div>

            {headerType === 'TEXT' && (
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">Header Text (Max 60 chars, no variables allowed)</label>
                <input
                  type="text"
                  value={headerText}
                  onChange={(e) => setHeaderText(e.target.value)}
                  maxLength={60}
                  placeholder="e.g. Welcome to iBloom!"
                  className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:border-cyan-500"
                />
              </div>
            )}

            {(headerType === 'IMAGE' || headerType === 'VIDEO' || headerType === 'DOCUMENT') && (
              <div className="space-y-2 p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <label className="font-bold text-slate-700 dark:text-slate-300 block">
                  Media Header File Upload (PDF, JPG, PNG, MP4 up to 25MB)
                </label>

                <div className="border-2 border-dashed border-slate-300 dark:border-slate-800 hover:border-cyan-500 rounded-xl p-4 text-center cursor-pointer relative bg-white dark:bg-slate-900/50">
                  <input
                    type="file"
                    onChange={handleMockFileUpload}
                    accept={headerType === 'IMAGE' ? 'image/*' : headerType === 'VIDEO' ? 'video/*' : '.pdf'}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                  <Icon icon="solar:upload-track-bold-duotone" className="w-8 h-8 text-cyan-500 mx-auto mb-1" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-bold block">
                    {isMockUploading ? 'Uploading file...' : 'Click or Drag & Drop file to upload'}
                  </span>
                </div>

                {mediaFileName && (
                  <div className="flex items-center justify-between p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl font-mono text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <Icon icon="solar:file-check-bold" className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="truncate text-emerald-300">{mediaFileName}</span>
                      <span className="text-slate-400 text-[10px]">({mediaFileSize})</span>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-black shrink-0">
                      READY
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION 4: MESSAGE BODY & AUTOMATED VARIABLE OBSERVER */}
          <div className="space-y-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Icon icon="solar:document-bold-duotone" className="w-4.5 h-4.5 text-cyan-500" />
                4. Message Body (Mandatory)
              </h3>
              <span className="font-mono text-slate-400 text-[11px]">{bodyText.length} / 1000</span>
            </div>

            {/* Rich Text Toolbar */}
            <div className="flex items-center gap-1.5 p-2 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-mono flex-wrap">
              <button
                type="button"
                onClick={() => setBodyText((prev) => `${prev} *bold*`)}
                className="px-2 py-1 bg-white dark:bg-slate-900 rounded hover:bg-cyan-500/20 font-bold"
              >
                *B*
              </button>
              <button
                type="button"
                onClick={() => setBodyText((prev) => `${prev} _italic_`)}
                className="px-2 py-1 bg-white dark:bg-slate-900 rounded hover:bg-cyan-500/20 italic"
              >
                _I_
              </button>
              <button
                type="button"
                onClick={() => setBodyText((prev) => `${prev} ~strike~`)}
                className="px-2 py-1 bg-white dark:bg-slate-900 rounded hover:bg-cyan-500/20 line-through"
              >
                ~S~
              </button>
              <button
                type="button"
                onClick={() => setBodyText((prev) => `${prev} \`code\``)}
                className="px-2 py-1 bg-white dark:bg-slate-900 rounded hover:bg-cyan-500/20 font-mono"
              >
                `Code`
              </button>

              <div className="h-4 w-px bg-slate-300 dark:bg-slate-800 mx-1"></div>

              <button
                type="button"
                onClick={addVariableToBody}
                className="px-3 py-1 bg-cyan-600 text-white rounded font-bold hover:bg-cyan-500 flex items-center gap-1"
              >
                <Icon icon="solar:add-circle-bold" className="w-3.5 h-3.5" />
                <span>+ ADD VARIABLE</span>
              </button>
            </div>

            <textarea
              value={bodyText}
              onChange={(e) => setBodyText(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Type your WhatsApp message copy here... Use {{1}} for dynamic variables."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:border-cyan-500 leading-relaxed"
            />

            {/* AUTOMATED VARIABLE EXAMPLES FORM (Meta Compliance Requirement) */}
            {variables.length > 0 && (
              <div className="space-y-3 p-3.5 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800 dark:text-slate-200 text-xs flex items-center gap-1.5">
                    <Icon icon="solar:check-circle-bold-duotone" className="w-4 h-4 text-emerald-400" />
                    Dynamic Variable Examples (Required for Meta Review)
                  </span>
                </div>

                <div className="space-y-2">
                  {variables.map((v, vIdx) => (
                    <div key={v.index ?? (v as any).key ?? `var_${vIdx}`} className="flex items-center gap-3">
                      <span className="px-2.5 py-1 rounded-lg bg-cyan-600 text-white font-mono font-bold text-xs shrink-0">
                        {`{{${v.index}}}`}
                      </span>
                      <input
                        type="text"
                        value={v.exampleValue}
                        onChange={(e) => {
                          const updated = [...variables];
                          updated[vIdx].exampleValue = e.target.value;
                          setVariables(updated);
                        }}
                        placeholder={`Example value for {{${v.index}}}`}
                        className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-xs font-mono text-slate-900 dark:text-white"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION 5: TEMPLATE FOOTER (OPTIONAL) */}
          <div className="space-y-3 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Icon icon="solar:document-text-bold-duotone" className="w-4.5 h-4.5 text-cyan-500" />
                5. Template Footer (Optional)
              </h3>
              <button
                type="button"
                onClick={() => setFooterText('Reply STOP to opt out.')}
                className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 font-mono font-bold text-[11px] border border-rose-500/30 hover:bg-rose-500/20"
              >
                + STOP Opt-Out Shortcut
              </button>
            </div>

            <input
              type="text"
              value={footerText}
              onChange={(e) => setFooterText(e.target.value)}
              maxLength={60}
              placeholder="e.g. Reply STOP to opt out. Max 60 chars."
              className="w-full bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2.5 text-xs text-slate-900 dark:text-white font-mono placeholder-slate-400 focus:outline-none focus:border-cyan-500"
            />
          </div>

          {/* SECTION 6: INTERACTIVE BUTTONS BUILDER */}
          <div className="space-y-4">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Icon icon="solar:widget-bold-duotone" className="w-4.5 h-4.5 text-cyan-500" />
              6. Interactive Action Buttons
            </h3>

            <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
              <button
                type="button"
                onClick={() => handleAddButton('URL')}
                className="px-3 py-1.5 rounded-xl bg-cyan-600 text-white font-bold hover:bg-cyan-500 flex items-center gap-1.5 shadow-xs"
              >
                <Icon icon="solar:link-bold" className="w-3.5 h-3.5" />
                <span>+ Add URL Button</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddButton('PHONE_NUMBER')}
                className="px-3 py-1.5 rounded-xl bg-teal-600 text-white font-bold hover:bg-teal-500 flex items-center gap-1.5 shadow-xs"
              >
                <Icon icon="solar:phone-calling-bold" className="w-3.5 h-3.5" />
                <span>+ Add Phone Button</span>
              </button>

              <button
                type="button"
                onClick={() => handleAddButton('QUICK_REPLY')}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 flex items-center gap-1.5 shadow-xs"
              >
                <Icon icon="solar:chat-round-dots-bold" className="w-3.5 h-3.5" />
                <span>+ Add Quick Reply</span>
              </button>
            </div>

            {buttons.length > 0 && (
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl">
                {buttons.map((btn, bIdx) => (
                  <div key={btn.id || `btn-${bIdx}`} className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-mono font-bold">
                      <span className="text-cyan-400">{btn.type} BUTTON #{bIdx + 1}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveButton(btn.id)}
                        className="text-rose-500 hover:text-rose-400"
                      >
                        <Icon icon="solar:trash-bin-trash-bold" className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                      <input
                        type="text"
                        value={btn.text}
                        onChange={(e) => {
                          const updated = [...buttons];
                          updated[bIdx].text = e.target.value;
                          setButtons(updated);
                        }}
                        maxLength={25}
                        placeholder="Button Title (Max 25 chars)"
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-white"
                      />

                      <input
                        type="text"
                        value={btn.value}
                        onChange={(e) => {
                          const updated = [...buttons];
                          updated[bIdx].value = e.target.value;
                          setButtons(updated);
                        }}
                        placeholder={btn.type === 'URL' ? 'https://example.com' : btn.type === 'PHONE_NUMBER' ? '+1234567890' : 'Reply value'}
                        className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-2 text-white"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT PANEL: REAL-TIME SMARTPHONE SIMULATOR */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 shadow-xl dark:shadow-2xl space-y-4 sticky top-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Icon icon="solar:mobile-minimal-bold-duotone" className="w-5 h-5 text-cyan-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white font-mono">
                  Real-Time Mobile Device Simulator
                </h3>
              </div>
              <span className="text-[10px] font-mono text-emerald-500 font-bold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                LIVE SYNC
              </span>
            </div>

            <PhoneSimulator
              template={currentTemplateState}
              variables={variables}
            />
          </div>
        </div>
      </div>

      {/* BUILD WITH AI GENERATOR MODAL */}
      <AIModal
        isOpen={isAIModalOpen}
        onClose={() => setIsAIModalOpen(false)}
        onApplyGenerated={(gen) => {
          setCategory(gen.category);
          setBodyText(gen.bodyText);
          setFooterText(gen.footerText);
          setVariables(gen.variables);
          if (gen.buttons) setButtons(gen.buttons as any);
        }}
      />
    </div>
  );
}

export default function TemplateBuilderPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-xs font-mono text-slate-400">Loading Builder Engine...</div>}>
      <TemplateBuilderContent />
    </Suspense>
  );
}
