'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Send, 
  Smartphone, 
  FileCode2, 
  CheckCircle2, 
  AlertCircle, 
  Radio, 
  Clock, 
  ChevronRight,
  ChevronDown,
  Loader2,
  Inbox,
  XCircle,
  Zap,
  Info,
  Variable,
  Users,
} from 'lucide-react';
import { Icon } from '@iconify/react';
import PhoneSimulator from '../templates/components/PhoneSimulator';
import { VariableExample } from '@/lib/types/template-types';

interface EventLog {
  id: string;
  timestamp: string;
  status: 'DELIVERED' | 'FAILED' | 'PENDING';
  recipient: string;
  template: string;
  templateLanguage: string;
  phoneNumber: string;
  metaMessageId: string | null;
  errorMessage?: string;
  metaResponse?: any;
}

/**
 * A contact carrying the `admin` label — the only contacts this super-admin
 * page offers as test recipients.
 */
interface AdminContact {
  contact_uid: string;
  name: string | null;
  wa_phone: string;
  opt_in_status: string;
}

/**
 * Label whose members may receive validation test broadcasts. Matched
 * case-insensitively against `labels.name`.
 */
const ADMIN_LABEL_NAME = 'admin';

/**
 * Contacts store E.164 digits without a leading `+`; the Meta send route and
 * this form both expect the `+`. Normalise in one place.
 */
function toE164(waPhone: string): string {
  const digits = (waPhone || '').replace(/[^\d]/g, '');
  return digits ? `+${digits}` : '';
}

// Extract {{key}} variable keys from a text string (supports {{1}} and {{name}})
function extractVariableKeys(text: string): string[] {
  if (!text) return [];
  const matches = [...text.matchAll(/\{\{([^}]+)\}\}/g)];
  const keys = [...new Set(matches.map((m) => m[1].trim()))];
  return keys;
}

// Build variables from a template's components JSONB
function extractTemplateVariables(components: any[]): string[] {
  const allKeys: string[] = [];
  for (const comp of components || []) {
    const text = comp.text || comp.body || '';
    extractVariableKeys(text).forEach((k) => allKeys.push(k));
  }
  const uniqueKeys = [...new Set(allKeys)];
  return uniqueKeys.sort((a, b) => {
    const isNumA = /^\d+$/.test(a);
    const isNumB = /^\d+$/.test(b);
    if (isNumA && isNumB) return parseInt(a, 10) - parseInt(b, 10);
    if (isNumA) return -1;
    if (isNumB) return 1;
    return a.localeCompare(b);
  });
}

// Normalise a DB template row into a WhatsAppTemplate-compatible object for PhoneSimulator
function normalizeForPreview(tmpl: any) {
  const components: any[] = Array.isArray(tmpl.components) ? tmpl.components : [];
  const headerComp = components.find((c) => c.type === 'HEADER');
  const bodyComp   = components.find((c) => c.type === 'BODY');
  const footerComp = components.find((c) => c.type === 'FOOTER');
  const btnComp    = components.find((c) => c.type === 'BUTTONS');

  return {
    name: tmpl.name,
    language: tmpl.language || 'en_US',
    category: tmpl.category || 'UTILITY',
    status: tmpl.status || 'APPROVED',
    header: headerComp ? {
      type: headerComp.format || 'TEXT',
      textValue: headerComp.text || '',
    } : undefined,
    body: {
      text: bodyComp?.text || tmpl.body_text || '',
      examples: [],
    },
    footer: footerComp ? { text: footerComp.text || '' } : undefined,
    buttons: btnComp?.buttons?.map((b: any, i: number) => ({
      id: `btn-${i}`,
      type: b.type || 'QUICK_REPLY',
      text: b.text || '',
      value: b.url || b.phone_number || '',
    })) || [],
    components,
  };
}

export default function ValidationBroadcastPage() {
  const supabase = createClient();

  const [isLoading, setIsLoading]   = useState(true);
  const [testNumbers, setTestNumbers] = useState<any[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<any[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  const [selectedNumber, setSelectedNumber]           = useState('');
  const [isPhoneDropdownOpen, setIsPhoneDropdownOpen] = useState(false);
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);

  const [recipientPhone, setRecipientPhone] = useState('+919532358574');
  const [adminContacts, setAdminContacts] = useState<AdminContact[]>([]);
  const [isLoadingAdmins, setIsLoadingAdmins] = useState(true);
  const [isRecipientDropdownOpen, setIsRecipientDropdownOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [templateParams, setTemplateParams]     = useState<{ [key: string]: string }>({});
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs]           = useState<EventLog[]>([]);

  /* ──────────────────────────────────────────────
   * Load LOCKED phone numbers on mount
   * ────────────────────────────────────────────── */
  useEffect(() => {
    async function loadPhoneNumbers() {
      setIsLoading(true);
      try {
        const { data: phoneData } = await supabase.from('wa_phone_numbers').select('*');

        const lockedPhones = (phoneData || []).filter(
          (p: any) => p.is_locked === true || p.lifecycle_status === 'LIVE_OPERATIONAL' || p.lifecycle_status === 'LOCKED'
        );

        if (lockedPhones.length > 0) {
          setTestNumbers(lockedPhones);
          const firstPhoneId = lockedPhones[0].meta_phone_number_id || lockedPhones[0].phone_number_id || lockedPhones[0].phone_line_uid;
          setSelectedNumber(firstPhoneId);
        } else {
          setTestNumbers([]);
          setSelectedNumber('');
        }
      } catch (err) {
        console.error('Error loading phone numbers:', err);
      } finally {
        setIsLoading(false);
      }
    }
    loadPhoneNumbers();
  }, []);

  /* ──────────────────────────────────────────────
   * Load contacts carrying the `admin` label
   *
   * Resolved in three plain queries rather than one nested PostgREST filter:
   * `contact_labels_active` is a view, so embedded-resource joins off it are
   * not reliably inferable. RLS scopes every step to the caller's tenant.
   * ────────────────────────────────────────────── */
  const loadAdminContacts = useCallback(async () => {
    setIsLoadingAdmins(true);
    try {
      const { data: labelRows, error: labelErr } = await supabase
        .from('labels')
        .select('label_uid')
        .ilike('name', ADMIN_LABEL_NAME);

      if (labelErr) throw labelErr;
      const labelUids = (labelRows || []).map((l: any) => l.label_uid);
      if (labelUids.length === 0) { setAdminContacts([]); return; }

      const { data: linkRows, error: linkErr } = await supabase
        .from('contact_labels_active')
        .select('contact_uid')
        .in('label_uid', labelUids);

      if (linkErr) throw linkErr;
      const contactUids = [...new Set((linkRows || []).map((r: any) => r.contact_uid))];
      if (contactUids.length === 0) { setAdminContacts([]); return; }

      const { data: contactRows, error: contactErr } = await supabase
        .from('contacts')
        .select('contact_uid, name, wa_phone, opt_in_status')
        .in('contact_uid', contactUids)
        .order('name', { ascending: true });

      if (contactErr) throw contactErr;
      setAdminContacts((contactRows || []) as AdminContact[]);
    } catch (err) {
      console.error('Error loading admin-labelled contacts:', err);
      setAdminContacts([]);
    } finally {
      setIsLoadingAdmins(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadAdminContacts();
  }, [loadAdminContacts]);

  /* ──────────────────────────────────────────────
   * Load templates whenever selected phone changes
   * ────────────────────────────────────────────── */
  const loadTemplatesForPhone = useCallback(async (phoneId: string) => {
    if (!phoneId) { setApprovedTemplates([]); setSelectedTemplate(''); return; }
    setIsLoadingTemplates(true);
    try {
      const phoneObj = testNumbers.find((n: any) =>
        (n.meta_phone_number_id || n.phone_number_id || n.phone_line_uid) === phoneId
      );
      const wabaUid = phoneObj?.waba_uid || phoneObj?.waba_id;

      let query = supabase.from('wa_templates').select('*');
      if (wabaUid) query = query.eq('waba_uid', wabaUid);

      const { data: tmplData } = await query;
      const templates = (tmplData || []).filter(
        (t: any) => t.is_locked === true || t.local_staging_status === 'LOCKED' || t.status === 'APPROVED'
      );

      setApprovedTemplates(templates);
      if (templates.length > 0) {
        const firstKey = templates[0].template_uid || templates[0].id || templates[0].name;
        setSelectedTemplate(firstKey);
      } else {
        setSelectedTemplate('');
        setTemplateParams({});
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [testNumbers, supabase]);

  useEffect(() => {
    if (selectedNumber) loadTemplatesForPhone(selectedNumber);
  }, [selectedNumber]);

  /* ──────────────────────────────────────────────
   * Reset params when selected template changes
   * ────────────────────────────────────────────── */
  useEffect(() => {
    if (!selectedTemplateObj) { setTemplateParams({}); return; }
    const keys = extractTemplateVariables(
      Array.isArray(selectedTemplateObj.components) ? selectedTemplateObj.components : []
    );
    const init: { [key: string]: string } = {};
    keys.forEach((k) => { init[k] = ''; });
    setTemplateParams(init);
  }, [selectedTemplate]);

  /* ──────────────────────────────────────────────
   * Derived helpers
   * ────────────────────────────────────────────── */
  const selectedPhoneObj = testNumbers.find((n: any) =>
    (n.meta_phone_number_id || n.phone_number_id || n.phone_line_uid) === selectedNumber
  ) || testNumbers[0];

  const selectedTemplateObj = approvedTemplates.find((t: any) =>
    (t.template_uid || t.id || t.name) === selectedTemplate
  ) || approvedTemplates[0];

  // Which admin contact (if any) the typed number currently corresponds to.
  const matchedAdminContact = adminContacts.find(
    (c) => toE164(c.wa_phone) === toE164(recipientPhone)
  );

  // Variable keys in selected template (numeric or named)
  const variableKeys = selectedTemplateObj
    ? extractTemplateVariables(Array.isArray(selectedTemplateObj.components) ? selectedTemplateObj.components : [])
    : [];

  // VariableExample[] for PhoneSimulator preview
  const previewVariables: VariableExample[] = variableKeys.map((key) => ({
    key: key,
    index: /^\d+$/.test(key) ? parseInt(key, 10) : undefined,
    exampleValue: templateParams[key] || `{{${key}}}`,
  }));

  const previewTemplate = selectedTemplateObj ? normalizeForPreview(selectedTemplateObj) : null;

  /* ──────────────────────────────────────────────
   * Send handler
   * ────────────────────────────────────────────── */
  async function handleSendTestMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedNumber || !selectedTemplate) return;
    setIsSending(true);

    const phoneId      = selectedPhoneObj?.meta_phone_number_id || selectedPhoneObj?.phone_number_id || selectedNumber;
    const templateName = selectedTemplateObj?.name || selectedTemplate;
    const templateLang = selectedTemplateObj?.language || 'en_US';

    // Build parameter components for Meta API (header & body parameters)
    const paramComponents: any[] = [];

    // 1. Check if template has a HEADER component requiring parameters
    const headerComp = Array.isArray(selectedTemplateObj?.components)
      ? selectedTemplateObj.components.find((c: any) => c.type === 'HEADER')
      : null;

    if (headerComp && headerComp.format && headerComp.format !== 'TEXT' && headerComp.format !== 'NONE') {
      const fmt = headerComp.format;
      const mediaUrl = headerComp.media_url || headerComp.example?.header_handle?.[0];

      if (fmt === 'IMAGE') {
        paramComponents.push({
          type: 'header',
          parameters: [
            {
              type: 'image',
              image: {
                link: mediaUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
              },
            },
          ],
        });
      } else if (fmt === 'VIDEO') {
        paramComponents.push({
          type: 'header',
          parameters: [
            {
              type: 'video',
              video: {
                link: mediaUrl || 'https://www.w3schools.com/html/mov_bbb.mp4',
              },
            },
          ],
        });
      } else if (fmt === 'DOCUMENT') {
        paramComponents.push({
          type: 'header',
          parameters: [
            {
              type: 'document',
              document: {
                link: mediaUrl || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
                filename: 'invoice.pdf',
              },
            },
          ],
        });
      } else if (fmt === 'LOCATION') {
        paramComponents.push({
          type: 'header',
          parameters: [
            {
              type: 'location',
              location: {
                latitude: '28.6139',
                longitude: '77.2090',
                name: 'iBloom HQ',
                address: 'New Delhi, India',
              },
            },
          ],
        });
      }
    }

    // 2. Body parameters
    if (variableKeys.length > 0) {
      paramComponents.push({
        type: 'body',
        parameters: variableKeys.map((key) => {
          const val = templateParams[key] || `{{${key}}}`;
          const isNum = /^\d+$/.test(key);
          return isNum
            ? { type: 'text', text: val }
            : { type: 'text', text: val, parameter_name: key };
        }),
      });
    }

    const pendingLog: EventLog = {
      id: `msg_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      status: 'PENDING',
      recipient: recipientPhone,
      template: templateName,
      templateLanguage: templateLang,
      phoneNumber: selectedPhoneObj?.display_phone_number || phoneId,
      metaMessageId: null,
    };
    setLogs((prev) => [pendingLog, ...prev]);

    try {
      const res = await fetch('/api/meta/send-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number_id: phoneId,
          recipient_phone: recipientPhone,
          template_name: templateName,
          language: templateLang,
          components: paramComponents.length > 0 ? paramComponents : undefined,
        }),
      });

      const data = await res.json();
      const finalLog: EventLog = {
        ...pendingLog,
        status: data.success ? 'DELIVERED' : 'FAILED',
        metaMessageId: data.metaMessageId || null,
        errorMessage:  data.success ? undefined : (data.error || 'Unknown error'),
        metaResponse:  data.metaResponse,
      };
      setLogs((prev) => [finalLog, ...prev.filter(l => l.id !== pendingLog.id)]);
    } catch (err: any) {
      setLogs((prev) => [{ ...pendingLog, status: 'FAILED', errorMessage: err?.message || 'Network error' }, ...prev.filter(l => l.id !== pendingLog.id)]);
    } finally {
      setIsSending(false);
    }
  }

  /* ─────────────────────────────────────────────────────────
   * RENDER
   * ───────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>Platform</span>
            <ChevronRight className="w-3 h-3" />
            <span>Validation Broadcast</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Live Event Logs</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1C2434] dark:text-white tracking-tight">
            Validation & Live Test Broadcast
          </h1>
        </div>
        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 font-bold self-start">
          <Radio className="w-3.5 h-3.5 animate-pulse" /> Meta API Route Live
        </span>
      </div>

      {/* Main 3-Col Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left: Dispatch Form ── */}
        <div className="bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
            <Send className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <h2 className="text-sm font-bold text-[#1C2434] dark:text-white">Dispatch Test Message</h2>
          </div>

          {isLoading && (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600 mx-auto" />
              <p className="text-xs text-slate-500 font-mono">Loading locked phone lines...</p>
            </div>
          )}

          {!isLoading && testNumbers.length === 0 && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2 text-xs text-amber-800 dark:text-amber-300">
              <div className="font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4 shrink-0" /> No Locked Phone Lines Found
              </div>
              <p className="text-[11px] leading-relaxed">Lock an operational phone line in <b>Asset Hub</b> first.</p>
            </div>
          )}

          {!isLoading && testNumbers.length > 0 && (
            <form onSubmit={handleSendTestMessage} className="space-y-4">

              {/* ── Phone Line Selector ── */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1.5">
                  <span>Sending Phone Line</span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                    🔒 {testNumbers.length} Locked
                  </span>
                </label>
                <div className="relative">
                  <div className="relative group">
                    <button type="button" onClick={() => { setIsPhoneDropdownOpen(!isPhoneDropdownOpen); setIsTemplateDropdownOpen(false); setIsRecipientDropdownOpen(false); }}
                      className="w-full bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-cyan-500/60 rounded-xl px-3.5 py-2.5 text-xs font-mono flex items-center justify-between gap-2 shadow-xs transition-all text-left">
                      <div className="flex items-center gap-2.5 truncate">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/90 border border-emerald-300 dark:border-emerald-700 flex items-center justify-center shrink-0">
                          <Smartphone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <span className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight truncate">
                          {selectedPhoneObj?.display_phone_number || selectedPhoneObj?.meta_phone_number_id || selectedNumber || 'Select phone line'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">🔒 LOCKED</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isPhoneDropdownOpen ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    {selectedPhoneObj && (
                      <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-[9999] w-72 p-3 bg-slate-900/95 text-slate-100 text-xs rounded-2xl shadow-2xl border border-cyan-500/40 backdrop-blur-xl pointer-events-none space-y-1.5">
                        <div className="flex justify-between border-b border-slate-800 pb-1 font-mono text-cyan-400 font-bold">
                          <span>{selectedPhoneObj.display_phone_number}</span>
                          <span className="text-[10px] text-emerald-400">🔒 LOCKED OPERATIONAL</span>
                        </div>
                        <div className="space-y-1 font-mono text-[11px] text-slate-300">
                          <p><span className="text-slate-400">Verified Name:</span> {selectedPhoneObj.verified_name || 'N/A'}</p>
                          <p><span className="text-slate-400">Phone ID:</span> {selectedPhoneObj.meta_phone_number_id || selectedPhoneObj.phone_number_id}</p>
                          <p><span className="text-slate-400">WABA UID:</span> {selectedPhoneObj.waba_uid || 'N/A'}</p>
                          <p><span className="text-slate-400">Quality:</span> {selectedPhoneObj.quality_rating || 'GREEN'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                  {isPhoneDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-[999] bg-white dark:bg-[#121A2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-64 overflow-y-auto p-2 space-y-1.5">
                      {testNumbers.map((phone: any, idx: number) => {
                        const phoneId = phone.meta_phone_number_id || phone.phone_number_id || phone.phone_line_uid || `phone-${idx}`;
                        const isSelected = phoneId === selectedNumber;
                        return (
                          <div key={phone.phone_line_uid || phoneId}
                            onClick={() => { setSelectedNumber(phoneId); setIsPhoneDropdownOpen(false); }}
                            className={`p-3 rounded-xl cursor-pointer transition-all border flex flex-col gap-2 ${isSelected ? 'bg-cyan-50/80 dark:bg-cyan-950/50 border-cyan-400 dark:border-cyan-700/80' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Smartphone className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                                <span className="font-extrabold text-sm text-slate-900 dark:text-white font-mono">{phone.display_phone_number || phoneId}</span>
                              </div>
                              {isSelected && <span className="text-[10px] font-bold font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/60 px-2 py-0.5 rounded-full border border-cyan-300 dark:border-cyan-700">SELECTED</span>}
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-purple-100 dark:bg-purple-950/80 text-purple-800 dark:text-purple-300 border border-purple-300 dark:border-purple-800 truncate max-w-[130px]">👤 {phone.verified_name || 'Verified Line'}</span>
                              <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">📱 {phone.meta_phone_number_id || phoneId}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Recipient Phone (admin-labelled contacts + free entry) ── */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1.5">
                  <span>Recipient Phone Number</span>
                  {isLoadingAdmins ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400">
                      <Loader2 className="w-3 h-3 animate-spin" /> Loading...
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-950/80 px-2 py-0.5 rounded-full border border-cyan-300 dark:border-cyan-800">
                      🏷️ {adminContacts.length} Admin Contact{adminContacts.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </label>

                <div className="relative">
                  <div className="flex items-stretch gap-2">
                    <input
                      type="text"
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="+919532358574"
                      className="flex-1 min-w-0 bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-600 dark:text-cyan-400 focus:outline-none focus:border-cyan-500/60"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setIsRecipientDropdownOpen(!isRecipientDropdownOpen);
                        setIsPhoneDropdownOpen(false);
                        setIsTemplateDropdownOpen(false);
                      }}
                      title="Pick an admin-labelled contact"
                      className="shrink-0 px-3 bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-cyan-500/60 rounded-xl flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
                    >
                      <Users className="w-3.5 h-3.5 text-cyan-600 dark:text-cyan-400" />
                      <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isRecipientDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {/* Who the typed number resolves to, if anyone */}
                  <div className="mt-1.5 text-[10px] font-mono">
                    {matchedAdminContact ? (
                      <span className="text-emerald-600 dark:text-emerald-400">
                        ✅ {matchedAdminContact.name || 'Unnamed'} · admin contact
                      </span>
                    ) : (
                      <span className="text-slate-400 dark:text-slate-500">
                        Manual number — not in the admin contact list
                      </span>
                    )}
                  </div>

                  {isRecipientDropdownOpen && (
                    <div className="absolute left-0 right-0 top-full mt-2 z-[999] bg-white dark:bg-[#121A2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-64 overflow-y-auto p-2 space-y-1.5">
                      {isLoadingAdmins ? (
                        <div className="p-4 text-center text-xs font-mono text-slate-400 flex items-center justify-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading admin contacts...
                        </div>
                      ) : adminContacts.length === 0 ? (
                        <div className="p-3 text-[11px] font-mono text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl leading-relaxed">
                          No contacts carry the <b>admin</b> label. Add the label to a contact in{' '}
                          <b>Contacts</b>, then reopen this list. You can still type a number by hand.
                        </div>
                      ) : (
                        adminContacts.map((c) => {
                          const e164 = toE164(c.wa_phone);
                          const isSelected = e164 === toE164(recipientPhone);
                          return (
                            <div
                              key={c.contact_uid}
                              onClick={() => { setRecipientPhone(e164); setIsRecipientDropdownOpen(false); }}
                              className={`p-3 rounded-xl cursor-pointer transition-all border flex flex-col gap-1.5 ${isSelected ? 'bg-cyan-50/80 dark:bg-cyan-950/50 border-cyan-400 dark:border-cyan-700/80' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 truncate">
                                  <div className="w-6 h-6 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-white font-bold text-[9px] grid place-items-center shrink-0">
                                    {c.name ? c.name.slice(0, 2).toUpperCase() : '?'}
                                  </div>
                                  <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                                    {c.name || 'Unnamed'}
                                  </span>
                                </div>
                                {isSelected && (
                                  <span className="shrink-0 text-[10px] font-bold font-mono text-cyan-600 dark:text-cyan-400 bg-cyan-100 dark:bg-cyan-900/60 px-2 py-0.5 rounded-full border border-cyan-300 dark:border-cyan-700">
                                    SELECTED
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                                <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">
                                  📱 {e164}
                                </span>
                                <span className={`px-2 py-0.5 rounded-md font-semibold border ${
                                  c.opt_in_status === 'opted_in'
                                    ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                    : c.opt_in_status === 'opted_out'
                                    ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800'
                                    : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                }`}>
                                  {c.opt_in_status === 'opted_in' ? '✅' : c.opt_in_status === 'opted_out' ? '⛔' : '❔'}{' '}
                                  {c.opt_in_status.toUpperCase()}
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Template Selector ── */}
              <div>
                <label className="flex items-center justify-between text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1.5">
                  <span>Select Template</span>
                  {isLoadingTemplates ? (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-slate-400"><Loader2 className="w-3 h-3 animate-spin" /> Loading...</span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-950/80 px-2 py-0.5 rounded-full border border-violet-300 dark:border-violet-800">
                      📋 {approvedTemplates.length} Template{approvedTemplates.length !== 1 ? 's' : ''}
                    </span>
                  )}
                </label>

                {approvedTemplates.length === 0 && !isLoadingTemplates ? (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-xs font-mono text-amber-800 dark:text-amber-300">
                    No templates found for this WABA. Create and lock one in <b>Templates Builder</b>.
                  </div>
                ) : (
                  <div className="relative">
                    <div className="relative group">
                      <button type="button" onClick={() => { setIsTemplateDropdownOpen(!isTemplateDropdownOpen); setIsPhoneDropdownOpen(false); setIsRecipientDropdownOpen(false); }}
                        disabled={isLoadingTemplates}
                        className="w-full bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] hover:border-violet-500/60 rounded-xl px-3.5 py-2.5 text-xs font-mono flex items-center justify-between gap-2 shadow-xs transition-all text-left disabled:opacity-60">
                        <div className="flex items-center gap-2.5 truncate">
                          <div className="w-7 h-7 rounded-lg bg-violet-100 dark:bg-violet-950/90 border border-violet-300 dark:border-violet-700 flex items-center justify-center shrink-0">
                            <FileCode2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
                          </div>
                          <div className="truncate">
                            <div className="font-extrabold text-sm text-slate-900 dark:text-white tracking-tight font-mono truncate">{selectedTemplateObj?.name || 'Select a template'}</div>
                            {selectedTemplateObj && <div className="text-[10px] text-slate-500 dark:text-slate-400">{selectedTemplateObj.language || 'en_US'} · {selectedTemplateObj.category || 'UTILITY'}</div>}
                          </div>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${isTemplateDropdownOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {selectedTemplateObj && (
                        <div className="absolute left-0 bottom-full mb-2 hidden group-hover:block z-[9999] w-72 p-3 bg-slate-900/95 text-slate-100 text-xs rounded-2xl shadow-2xl border border-violet-500/40 backdrop-blur-xl pointer-events-none space-y-1.5">
                          <div className="flex justify-between border-b border-slate-800 pb-1 font-mono text-violet-400 font-bold">
                            <span>{selectedTemplateObj.name}</span>
                            <span className="text-[10px] text-emerald-400">{selectedTemplateObj.status || 'APPROVED'}</span>
                          </div>
                          <div className="space-y-1 font-mono text-[11px] text-slate-300">
                            <p><span className="text-slate-400">Language:</span> {selectedTemplateObj.language || 'en_US'}</p>
                            <p><span className="text-slate-400">Category:</span> {selectedTemplateObj.category || 'UTILITY'}</p>
                            <p><span className="text-slate-400">Variables:</span> {variableKeys.length > 0 ? variableKeys.map(k => `{{${k}}}`).join(', ') : 'None'}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    {isTemplateDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full mt-2 z-[999] bg-white dark:bg-[#121A2A] border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl max-h-64 overflow-y-auto p-2 space-y-1.5">
                        {approvedTemplates.map((tmpl: any, idx: number) => {
                          const tmplKey = tmpl.template_uid || tmpl.id || `tmpl-${idx}`;
                          const tmplVal = tmpl.template_uid || tmpl.id || tmpl.name;
                          const isSelected = tmplVal === selectedTemplate;
                          const tmplVarCount = extractTemplateVariables(Array.isArray(tmpl.components) ? tmpl.components : []).length;
                          return (
                            <div key={tmplKey} onClick={() => { setSelectedTemplate(tmplVal); setIsTemplateDropdownOpen(false); }}
                              className={`p-3 rounded-xl cursor-pointer transition-all border flex flex-col gap-1.5 ${isSelected ? 'bg-violet-50/80 dark:bg-violet-950/50 border-violet-400 dark:border-violet-700/80' : 'bg-slate-50/50 dark:bg-slate-900/50 border-slate-200/80 dark:border-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800/60'}`}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <FileCode2 className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
                                  <span className="font-bold text-sm text-slate-900 dark:text-white font-mono truncate">{tmpl.name}</span>
                                </div>
                                {isSelected && <span className="text-[10px] font-bold font-mono text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/60 px-2 py-0.5 rounded-full border border-violet-300 dark:border-violet-700">SELECTED</span>}
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap font-mono text-[10px]">
                                <span className="px-2 py-0.5 rounded-md font-semibold bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-300 dark:border-blue-800">🌐 {tmpl.language || 'en_US'}</span>
                                <span className="px-2 py-0.5 rounded-md font-semibold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">📁 {tmpl.category || 'UTILITY'}</span>
                                {tmplVarCount > 0 && (
                                  <span className="px-2 py-0.5 rounded-md font-semibold bg-rose-100 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">🧩 {tmplVarCount} var{tmplVarCount !== 1 ? 's' : ''}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Template Variable Inputs ── */}
              {variableKeys.length > 0 && (
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                    <Variable className="w-3.5 h-3.5 text-rose-500" />
                    Template Parameters
                    <span className="ml-1 text-[10px] font-mono text-rose-500 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800">
                      {variableKeys.length} required
                    </span>
                  </div>
                  {variableKeys.map((key) => (
                    <div key={`param-${key}`}>
                      <label className="block text-[10px] font-semibold font-mono text-slate-500 dark:text-slate-400 mb-1">
                        <span className="text-rose-500 dark:text-rose-400">{`{{${key}}}`}</span> — Parameter <span className="text-slate-700 dark:text-slate-200 font-bold">{key}</span>
                      </label>
                      <input
                        type="text"
                        value={templateParams[key] || ''}
                        onChange={(e) => setTemplateParams((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`Enter value for {{${key}}}`}
                        className="w-full bg-white dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-lg px-3 py-2 text-xs font-mono text-slate-800 dark:text-white focus:outline-none focus:border-rose-500/60 placeholder:text-slate-400"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Dispatch Button ── */}
              <button type="submit"
                disabled={isSending || testNumbers.length === 0 || approvedTemplates.length === 0 || !selectedNumber || !selectedTemplate}
                className="w-full bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-500 hover:to-cyan-600 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50 transition-all active:scale-[0.98]">
                {isSending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /><span>Dispatching to Meta API...</span></>
                ) : (
                  <><Zap className="w-4 h-4" /><span>Dispatch Test Message</span></>
                )}
              </button>
            </form>
          )}
        </div>

        {/* ── Centre: Live Preview (PhoneSimulator) ── */}
        <div className="flex flex-col gap-4">
          <div className="bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-2xl p-5 shadow-sm flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 w-full border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
              <Icon icon="logos:whatsapp-icon" className="w-4 h-4" />
              <h2 className="text-sm font-bold text-[#1C2434] dark:text-white">Template Preview</h2>
              {variableKeys.length > 0 && (
                <span className="ml-auto text-[10px] font-mono font-bold text-rose-500 dark:text-rose-400 bg-rose-100 dark:bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-300 dark:border-rose-800">
                  Live with params
                </span>
              )}
            </div>
            {previewTemplate ? (
              <PhoneSimulator template={previewTemplate as any} variables={previewVariables} />
            ) : (
              <div className="py-12 text-center space-y-2 text-xs text-slate-500 dark:text-slate-400 font-mono">
                <FileCode2 className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
                <p>Select a template to preview</p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: Event Log ── */}
        <div className="bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
            <h2 className="text-sm font-bold text-[#1C2434] dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Event Stream ({logs.length})
            </h2>
            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" /> Live
            </span>
          </div>

          {logs.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] grid place-items-center mx-auto shadow-inner">
                <Inbox className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
              </div>
              <div className="text-xs font-bold text-[#1C2434] dark:text-white">No Logs Yet</div>
              <p className="text-[11px] text-slate-500 dark:text-[#8A99AD]">Dispatch a test message to see real-time delivery status and Meta API responses.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
              {logs.map((log) => (
                <div key={log.id}
                  className={`p-4 rounded-2xl border text-xs font-mono space-y-2.5 transition-all ${log.status === 'DELIVERED' ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/60' : log.status === 'FAILED' ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800/60' : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800/60'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {log.status === 'DELIVERED' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                        : log.status === 'FAILED' ? <XCircle className="w-4 h-4 text-rose-500 shrink-0" />
                        : <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />}
                      <span className="font-extrabold text-slate-900 dark:text-white truncate">{log.template}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded-lg text-[10px] font-extrabold border ${log.status === 'DELIVERED' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30' : log.status === 'FAILED' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30'}`}>
                      {log.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">📱 {log.recipient}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">🔒 {log.phoneNumber}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700">🕐 {log.timestamp}</span>
                  </div>
                  {log.metaMessageId && (
                    <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono bg-emerald-50 dark:bg-emerald-950/50 px-2 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800 truncate">
                      ✅ wamid: {log.metaMessageId}
                    </div>
                  )}
                  {log.errorMessage && (
                    <div className="text-[10px] text-rose-700 dark:text-rose-400 font-mono bg-rose-50 dark:bg-rose-950/50 px-2 py-1 rounded-lg border border-rose-200 dark:border-rose-800">
                      ❌ {log.errorMessage}
                    </div>
                  )}
                  {log.metaResponse && (
                    <details className="text-[10px] text-slate-400">
                      <summary className="cursor-pointer flex items-center gap-1 hover:text-slate-600 dark:hover:text-slate-300">
                        <Info className="w-3 h-3" /> Meta Raw Response
                      </summary>
                      <pre className="mt-1.5 p-2 bg-slate-100 dark:bg-slate-950 rounded-lg overflow-x-auto text-[9px] text-slate-600 dark:text-slate-400 max-h-32">
                        {JSON.stringify(log.metaResponse, null, 2)}
                      </pre>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
