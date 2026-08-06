'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useWabaContext, OperationalLine } from '@/lib/context/waba-context';
import ExploreSidebar from './components/ExploreSidebar';
import PhoneSimulator from './components/PhoneSimulator';
import { WhatsAppTemplate, TemplateCategory } from '@/lib/types/template-types';
import { PREBUILT_TEMPLATES } from '@/lib/data/prebuilt-templates';

export default function TemplatesPage() {
  const router = useRouter();
  const supabase = createClient();
  const {
    operationalLines,
    activeLine,
    defaultLineId,
    setActiveLine,
    makeDefaultLine,
    isLoadingLines,
  } = useWabaContext();

  const [activeChannel, setActiveChannel] = useState<'whatsapp' | 'telegram' | 'facebook' | 'instagram'>('whatsapp');
  const [activeTab, setActiveTab] = useState<'custom' | 'explore'>('custom');

  // Custom Tab Filters
  const [statusFilter, setStatusFilter] = useState<'all' | 'APPROVED' | 'PENDING' | 'REJECTED' | 'DRAFT'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TemplateCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Explore Tab Filter
  const [selectedSubcategory, setSelectedSubcategory] = useState('all');

  // Partitioned Templates Data
  const [discoveredTemplates, setDiscoveredTemplates] = useState<WhatsAppTemplate[]>([]);
  const [databaseTemplates, setDatabaseTemplates] = useState<WhatsAppTemplate[]>([]);
  const [archivedOrDeletedTemplates, setArchivedOrDeletedTemplates] = useState<WhatsAppTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);

  // Overlay Modals
  const [previewTemplate, setPreviewTemplate] = useState<WhatsAppTemplate | null>(null);
  const [isWabaDrawerOpen, setIsWabaDrawerOpen] = useState(false);
  const [isArchivedModalOpen, setIsArchivedModalOpen] = useState(false);
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);

  function normalizeTemplateRecord(t: any, defaultWabaId: string): WhatsAppTemplate {
    const components = Array.isArray(t.components) ? t.components : [];
    const headerComponent = components.find((c: any) => c.type === 'HEADER');
    const bodyComponent = components.find((c: any) => c.type === 'BODY');
    const footerComponent = components.find((c: any) => c.type === 'FOOTER');
    const buttonsComponent = components.find((c: any) => c.type === 'BUTTONS');

    return {
      id: t.template_uid || t.id || t.meta_template_id,
      meta_template_id: t.meta_template_id || t.template_uid || t.id,
      waba_id: t.waba_uid || t.waba_id || defaultWabaId,
      name: t.name,
      language: t.language || 'en_US',
      category: t.category || 'MARKETING',
      marketingSubtype: t.marketing_subtype || 'STANDARD',
      status: t.status || 'APPROVED',
      rejected_reason: t.rejected_reason || null,
      header: t.header || (headerComponent ? {
        type: headerComponent.format || 'TEXT',
        textValue: headerComponent.text || '',
        mediaUrl: headerComponent.media_url || '',
      } : undefined),
      body: t.body || (bodyComponent ? {
        text: bodyComponent.text || '',
        examples: bodyComponent.examples || [],
      } : { text: t.body_text || '' }),
      footer: t.footer || (footerComponent ? {
        text: footerComponent.text || '',
      } : undefined),
      buttons: t.buttons || (buttonsComponent ? buttonsComponent.buttons : undefined),
      components,
    };
  }

  // Load Partitioned Discovered, DB & Archived Templates directly from API
  async function loadTemplates(showToast = false) {
    if (!activeLine) return;
    setIsLoadingTemplates(true);
    try {
      const targetWabaId = activeLine.official_waba_id || activeLine.waba_id;
      const res = await fetch(`/api/meta/templates?waba_id=${targetWabaId}`);
      const data = await res.json();

      if (data.success) {
        const disc = (data.discoveredTemplates || []).map((t: any) => normalizeTemplateRecord(t, targetWabaId));
        const db = (data.databaseTemplates || []).map((t: any) => normalizeTemplateRecord(t, targetWabaId));
        const arch = (data.archivedOrDeletedTemplates || []).map((t: any) => normalizeTemplateRecord(t, targetWabaId));

        setDiscoveredTemplates(disc);
        setDatabaseTemplates(db);
        setArchivedOrDeletedTemplates(arch);

        if (showToast) {
          let desc = `Discovered ${disc.length} Meta templates • ${db.length} Operational & Drafts in DB.`;
          if (arch.length > 0) {
            desc += ` (${arch.length} marked deleted/archived)`;
          }
          toast.success('Templates Synced & Reconciled!', {
            description: desc,
            icon: <Icon icon="solar:restart-bold" className="w-5 h-5 text-cyan-400" />,
          });
        }
      } else {
        setDiscoveredTemplates([]);
        setDatabaseTemplates([]);
        setArchivedOrDeletedTemplates([]);
      }
    } catch (err) {
      console.error('Error loading templates:', err);
      setDiscoveredTemplates([]);
      setDatabaseTemplates([]);
      setArchivedOrDeletedTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  }

  useEffect(() => {
    if (activeLine) {
      loadTemplates(false);
    }
  }, [activeLine]);

  // Actions: Save Single Discovered Template to DB
  async function handleSaveTemplateToDb(tmpl: WhatsAppTemplate) {
    if (!activeLine) return;
    try {
      const targetWabaId = activeLine.official_waba_id || activeLine.waba_id;
      const res = await fetch('/api/meta/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...tmpl,
          meta_template_id: tmpl.meta_template_id || tmpl.id,
          waba_id: targetWabaId,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(`Saved & Locked "${tmpl.name}"!`, {
          description: 'Template is now saved in local DB and locked for operational communication.',
          icon: <Icon icon="solar:bookmark-bold" className="w-5 h-5 text-amber-400" />,
        });
        await loadTemplates(false);
      } else {
        toast.error('Save Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception saving template', { description: err?.message });
    }
  }

  // Actions: Save All Discovered Templates to DB in Batch
  async function handleSaveAllBatch() {
    if (!activeLine || discoveredTemplates.length === 0) return;
    setIsSavingBatch(true);
    try {
      const targetWabaId = activeLine.official_waba_id || activeLine.waba_id;
      const res = await fetch('/api/meta/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          waba_id: targetWabaId,
          batchTemplates: discoveredTemplates,
        }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success('Batch Saved & Locked!', {
          description: `All ${discoveredTemplates.length} discovered Meta templates are now locked in DB for operational use.`,
          icon: <Icon icon="solar:bookmark-bold" className="w-5 h-5 text-amber-400" />,
        });
        await loadTemplates(false);
      } else {
        toast.error('Batch Save Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception batch saving templates', { description: err?.message });
    } finally {
      setIsSavingBatch(false);
    }
  }

  function handleDuplicateTemplate(tpl: WhatsAppTemplate) {
    const cloned: WhatsAppTemplate = {
      ...tpl,
      name: `${tpl.name}_copy`,
      status: 'DRAFT',
    };
    router.push(`/templates/builder?clone=${encodeURIComponent(JSON.stringify(cloned))}`);
  }

  async function handleDeleteTemplate(id?: string, name?: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/meta/templates?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.info(`Template "${name || 'Item'}" Soft-Deleted`, {
          description: 'Preserved in DB audit logs & removed from Meta WABA.',
        });
        await loadTemplates(false);
      } else {
        toast.error('Deletion Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception Deleting Template', { description: err?.message });
    }
  }

  async function handlePermanentDelete(id?: string, name?: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/meta/templates?id=${id}&permanent=true`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success(`Template "${name || 'Item'}" Permanently Deleted from CRM`, {
          icon: <Icon icon="solar:trash-bin-trash-bold" className="w-5 h-5 text-rose-400" />,
        });
        await loadTemplates(false);
      } else {
        toast.error('Permanent Delete Failed', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Error deleting template', { description: err?.message });
    }
  }

  // Filtered Templates Helper
  const allTemplates = [...discoveredTemplates, ...databaseTemplates];

  const filterTemplates = (list: WhatsAppTemplate[]) =>
    list.filter((t) => {
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
      const matchesCategory = categoryFilter === 'all' || t.category === categoryFilter;
      const matchesSearch =
        t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.body?.text || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesStatus && matchesCategory && matchesSearch;
    });

  const filteredDiscoveredTemplates = filterTemplates(discoveredTemplates);
  const filteredDatabaseTemplates = filterTemplates(databaseTemplates);
  const allFilteredDbTemplates = filteredDatabaseTemplates;

  const filteredLockedDatabaseTemplates = allFilteredDbTemplates.filter(
    (t) => t.status === 'APPROVED' || (t as any).local_staging_status === 'LOCKED'
  );

  const filteredDraftAndPendingTemplates = allFilteredDbTemplates.filter(
    (t) => t.status === 'DRAFT' || t.status === 'PENDING' || (t as any).local_staging_status === 'DRAFT' || (t as any).local_staging_status === 'PENDING_META'
  );

  // Filtered Prebuilt Templates
  const filteredPrebuiltTemplates = PREBUILT_TEMPLATES.filter((p) => {
    const matchesSub = selectedSubcategory === 'all' || p.subcategory === selectedSubcategory;
    const matchesSearch =
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.bodyText.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSub && matchesSearch;
  });

  return (
    <div className="space-y-6 p-2 max-w-[1700px] mx-auto text-slate-900 dark:text-slate-100 transition-colors font-sans">
      {/* TOP COMPACT WHATSAPP OPERATIONAL HEALTH & STATUS RIBBON */}
      <div className="bg-white dark:bg-gradient-to-r dark:from-[#0F172A]/90 dark:via-[#131C31]/90 dark:to-[#0F172A]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 shadow-xl dark:shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 grid place-items-center shadow-lg shrink-0">
            <Icon icon="logos:whatsapp-icon" className="w-6 h-6" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                WhatsApp Message Templates Workspace
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-mono text-[10px] font-bold border border-emerald-500/30">
                ● LIVE OPERATIONAL &amp; LOCKED
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage Meta-compliant WhatsApp templates, dynamic variables, and real-time smartphone previews.
            </p>
          </div>
        </div>

        {/* ACTIVE OPERATIONAL LINE DISPLAY CARD WITH HOVER TOOLTIP */}
        {activeLine && (
          <div className="bg-slate-900 border border-cyan-500/40 px-4 py-2.5 rounded-2xl flex items-center gap-4 shrink-0 shadow-lg relative group">
            <div
              className="relative inline-flex items-center gap-2 cursor-pointer"
              onMouseEnter={() => setIsTooltipVisible(true)}
              onMouseLeave={() => setIsTooltipVisible(false)}
            >
              <Icon icon="logos:whatsapp-icon" className="w-5 h-5 shrink-0" />
              <span className="text-base font-black text-white font-mono tracking-tight hover:text-cyan-300 transition-colors">
                {activeLine.display_phone_number}
              </span>
              <Icon icon="solar:info-circle-bold" className="w-4 h-4 text-cyan-400 opacity-80 hover:opacity-100 transition-opacity" />

              {/* TOP HOVER TOOLTIP WITH HIGH Z-INDEX */}
              {isTooltipVisible && (
                <div className="absolute bottom-full left-0 mb-2 flex flex-col gap-2 p-3.5 bg-slate-950 border border-cyan-500/60 rounded-2xl shadow-2xl z-[999] text-xs font-mono text-slate-200 whitespace-nowrap backdrop-blur-xl animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center gap-2 border-b border-slate-800 pb-1.5 font-bold text-cyan-400">
                    <Icon icon="solar:shield-check-bold" className="w-4 h-4 text-emerald-400" />
                    <span>Meta WABA Technical Assets</span>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <span className="text-slate-400">WABA ID:</span>
                    <span className="font-extrabold text-white">{activeLine.official_waba_id || activeLine.waba_id}</span>
                  </div>
                  <div className="flex items-center justify-between gap-5">
                    <span className="text-slate-400">Phone Number ID (PNID):</span>
                    <span className="font-extrabold text-white">{activeLine.phone_number_id}</span>
                  </div>
                  <div className="w-3 h-3 bg-slate-950 border-r border-b border-cyan-500/60 rotate-45 absolute -bottom-1.5 left-6"></div>
                </div>
              )}
            </div>

            <button
              onClick={() => setIsWabaDrawerOpen(true)}
              className="bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-black px-3 py-1.5 rounded-xl text-xs flex items-center gap-1 transition-all shadow-md active:scale-95"
              title="Switch active WABA line context or set default"
            >
              <Icon icon="solar:pen-bold" className="w-3.5 h-3.5" />
              <span>Switch / Edit ⚡</span>
            </button>
          </div>
        )}
      </div>

      {/* MAIN WHATSAPP TEMPLATES WORKSPACE CONTAINER */}
      <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-6 md:p-8 space-y-6 shadow-xl dark:shadow-2xl min-h-[320px] flex flex-col justify-between">
        {/* SLIM HORIZONTAL RIBBON BAR WORKSPACE HEADER */}
        <div className="bg-slate-900/90 border border-cyan-500/30 rounded-2xl p-3 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-lg font-sans">
          {/* Selected WABA, Display Phone & WABA ID in Clean Modern Label Ribbon Format */}
          {activeLine ? (
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              {/* Label Pill 1: WABA Name */}
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-cyan-500/40 text-cyan-400 font-extrabold flex items-center gap-1.5 shadow-xs">
                <Icon icon="solar:shop-bold-duotone" className="w-4 h-4 text-cyan-400" />
                <span>{activeLine.waba_name || 'WABA Account'}</span>
              </div>

              {/* Label Pill 2: Phone Display Number */}
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-emerald-500/40 text-emerald-400 font-extrabold flex items-center gap-1.5 shadow-xs">
                <Icon icon="logos:whatsapp-icon" className="w-4 h-4" />
                <span>{activeLine.display_phone_number}</span>
              </div>

              {/* Label Pill 3: WABA ID */}
              <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-300 font-semibold flex items-center gap-1.5 shadow-xs">
                <Icon icon="solar:shield-check-bold" className="w-4 h-4 text-purple-400" />
                <span>WABA ID: <strong className="text-white">{activeLine.official_waba_id || activeLine.waba_id}</strong></span>
              </div>

              <span className="text-[10px] text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 rounded border border-emerald-500/30">
                LIVE &amp; CONNECTED
              </span>
            </div>
          ) : (
            <div className="text-xs text-slate-400 font-mono">No active WABA line context selected</div>
          )}

          {/* Inline Action Buttons (Sync & Refresh + Create New Template) */}
          <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end flex-wrap">
            {archivedOrDeletedTemplates.length > 0 && (
              <button
                onClick={() => setIsArchivedModalOpen(true)}
                className="bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono flex items-center gap-1.5 border border-rose-800/80 transition-all active:scale-95 shadow-xs"
                title="View templates deleted on Meta or archived"
              >
                <Icon icon="solar:box-minimalistic-bold" className="w-4 h-4 text-rose-400" />
                <span>Archived / Deleted ({archivedOrDeletedTemplates.length})</span>
              </button>
            )}

            <button
              onClick={() => loadTemplates(true)}
              disabled={isLoadingTemplates}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-slate-700 transition-all active:scale-95 disabled:opacity-50"
              title="Sync & Refresh Meta Graph API Templates"
            >
              <Icon icon="solar:restart-bold" className={`w-3.5 h-3.5 text-cyan-400 ${isLoadingTemplates ? 'animate-spin' : ''}`} />
              <span>Sync &amp; Refresh</span>
            </button>

            <Link
              href="/templates/builder"
              className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 text-white font-black px-4 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 shrink-0"
            >
              <Icon icon="solar:add-circle-bold" className="w-4 h-4" />
              <span>+ Create New Template</span>
            </Link>
          </div>
        </div>

        {/* WORKSPACE SUB-LAYOUT: LEFT SIDEBAR + MAIN CONTENT GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sub-Navigation Pane */}
          <div className="lg:col-span-3 space-y-4">
            {/* Custom vs Explore Tab Switcher */}
            <div className="bg-slate-100 dark:bg-slate-950/80 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 gap-1 text-xs font-bold font-mono">
              <button
                onClick={() => setActiveTab('custom')}
                className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'custom'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon icon="solar:folder-bold" className="w-4 h-4" />
                <span>Custom</span>
              </button>

              <button
                onClick={() => setActiveTab('explore')}
                className={`py-2 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === 'explore'
                    ? 'bg-cyan-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Icon icon="solar:compass-bold" className="w-4 h-4" />
                <span>Explore</span>
              </button>
            </div>

            {activeTab === 'custom' ? (
              /* Custom Status Filter List */
              <div className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-3xl p-4 space-y-3 shadow-lg text-xs font-sans">
                <div className="flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2.5 font-bold text-slate-900 dark:text-white">
                  <Icon icon="solar:filter-bold-duotone" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                  <span>FILTER BY STATUS</span>
                </div>

                <div className="space-y-1 font-mono">
                  <button
                    onClick={() => setStatusFilter('all')}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
                      statusFilter === 'all'
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    <span>General (All)</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 dark:bg-slate-900 text-[10px]">
                      {allTemplates.length}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('APPROVED')}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
                      statusFilter === 'APPROVED'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-l-2 border-emerald-500'
                        : 'text-slate-500 hover:text-emerald-500'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Approved
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                      {allTemplates.filter((t) => t.status === 'APPROVED').length}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('PENDING')}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
                      statusFilter === 'PENDING'
                        ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-l-2 border-amber-500'
                        : 'text-slate-500 hover:text-amber-500'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span> Pending
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                      {allTemplates.filter((t) => t.status === 'PENDING').length}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('REJECTED')}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
                      statusFilter === 'REJECTED'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-l-2 border-rose-500'
                        : 'text-slate-500 hover:text-rose-500'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-rose-500"></span> Rejected
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 text-[10px]">
                      {allTemplates.filter((t) => t.status === 'REJECTED').length}
                    </span>
                  </button>

                  <button
                    onClick={() => setStatusFilter('DRAFT')}
                    className={`w-full text-left px-3 py-2 rounded-xl font-bold flex items-center justify-between transition-all ${
                      statusFilter === 'DRAFT'
                        ? 'bg-slate-500/10 text-slate-400 border-l-2 border-slate-500'
                        : 'text-slate-500 hover:text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-500"></span> Draft
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-400 text-[10px]">
                      {allTemplates.filter((t) => t.status === 'DRAFT').length}
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              /* Explore Tab Industry Sector Sidebar */
              <ExploreSidebar
                selectedSubcategory={selectedSubcategory}
                onSelectSubcategory={setSelectedSubcategory}
              />
            )}
          </div>

          {/* Right Main Content Panel */}
          <div className="lg:col-span-9 space-y-5">
            {/* Main Search & Category Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="relative flex-1">
                <Icon icon="solar:magnifer-bold-duotone" className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search templates by name or copy content..."
                  className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-cyan-500 font-mono shadow-inner"
                />
              </div>

              {activeTab === 'custom' && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value as any)}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shrink-0"
                >
                  <option value="all">All Categories</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="UTILITY">Utility</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              )}
            </div>

            {/* TAB CONTENT: CUSTOM WORKSPACE GRID (2 PARTITIONS) */}
            {activeTab === 'custom' && (
              <div className="space-y-8">
                {isLoadingTemplates ? (
                  <div className="p-12 text-center space-y-3 bg-slate-50 dark:bg-slate-950/40 rounded-3xl border border-slate-200 dark:border-slate-800">
                    <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-cyan-500 mx-auto" />
                    <p className="text-xs text-slate-400 font-mono">Fetching &amp; partitioning templates for WABA {activeLine?.official_waba_id || activeLine?.waba_id}...</p>
                  </div>
                ) : (
                  <>
                    {/* PARTITION 1: DISCOVERED META GRAPH API TEMPLATES (NOT YET SAVED IN DB) */}
                    <div className="space-y-4 bg-slate-950/40 border border-slate-800/80 rounded-3xl p-5 shadow-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 grid place-items-center">
                            <Icon icon="solar:globus-bold-duotone" className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-white font-mono flex items-center gap-2">
                              Discovered Meta Graph API Templates
                              <span className="px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px]">
                                {filteredDiscoveredTemplates.length} New
                              </span>
                            </h3>
                            <p className="text-[11px] text-slate-400">Live templates returned from Meta Graph API not yet stored in local database</p>
                          </div>
                        </div>

                        {filteredDiscoveredTemplates.length > 0 && (
                          <button
                            onClick={handleSaveAllBatch}
                            disabled={isSavingBatch}
                            className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black px-4 py-2 rounded-xl text-xs flex items-center gap-2 transition-all shadow-md active:scale-95 shrink-0 disabled:opacity-50"
                          >
                            <Icon icon="solar:bookmark-bold" className="w-4 h-4" />
                            <span>{isSavingBatch ? 'Saving All...' : 'Save All Discovered Templates to DB'}</span>
                          </button>
                        )}
                      </div>

                      {filteredDiscoveredTemplates.length === 0 ? (
                        <div className="p-6 bg-slate-900/60 border border-dashed border-slate-800 rounded-2xl text-center text-xs text-slate-400 font-mono">
                          ✓ All Meta Graph API templates for this WABA are saved &amp; locked in the database below!
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                          {filteredDiscoveredTemplates.map((tmpl) => (
                            <div
                              key={tmpl.id || tmpl.name}
                              className="bg-slate-900/90 border border-cyan-500/30 hover:border-cyan-400 rounded-2xl p-5 space-y-4 shadow-md transition-all relative flex flex-col justify-between"
                            >
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-extrabold text-white font-mono truncate" title={tmpl.name}>
                                    {tmpl.name}
                                  </h4>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
                                    {tmpl.status}
                                  </span>
                                </div>

                                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans line-clamp-3 min-h-[64px]">
                                  {tmpl.body?.text || 'No copy content'}
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    {tmpl.category}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {tmpl.language || 'en_US'}
                                  </span>
                                </div>
                              </div>

                              {/* Card Action Rail */}
                              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                                <button
                                  onClick={() => setPreviewTemplate(tmpl)}
                                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                                  title="Preview Mobile Simulator"
                                >
                                  <Icon icon="solar:eye-bold" className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Preview</span>
                                </button>

                                <button
                                  onClick={() => handleSaveTemplateToDb(tmpl)}
                                  className="bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-black px-3.5 py-1.5 rounded-xl text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95"
                                >
                                  <Icon icon="solar:bookmark-bold" className="w-3.5 h-3.5" />
                                  <span>Save to DB</span>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* PARTITION 2: LOCAL DRAFTS & PENDING SUBMISSIONS (Auto-hidden if 0 items) */}
                    {filteredDraftAndPendingTemplates.length > 0 && (
                      <div className="space-y-4 bg-slate-950/60 border border-purple-500/30 rounded-3xl p-5 shadow-xl">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 grid place-items-center">
                              <Icon icon="solar:document-add-bold-duotone" className="w-4.5 h-4.5" />
                            </div>
                            <div>
                              <h3 className="text-sm font-extrabold text-white font-mono flex items-center gap-2">
                                📝 Local Drafts &amp; Pending Meta Submissions
                                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 text-[10px] font-black">
                                  {filteredDraftAndPendingTemplates.length} UNLOCKED / DRAFT
                                </span>
                              </h3>
                              <p className="text-[11px] text-slate-400">Templates currently saved in local draft state or awaiting official Meta approval</p>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                          {filteredDraftAndPendingTemplates.map((tmpl) => {
                            const isDraft = tmpl.status === 'DRAFT' || !tmpl.meta_template_id || tmpl.meta_template_id.includes('-');
                            const metaId = tmpl.meta_template_id && !tmpl.meta_template_id.includes('-') ? tmpl.meta_template_id : null;

                            return (
                              <div
                                key={tmpl.id || tmpl.name}
                                className={`bg-slate-950 border rounded-2xl p-5 space-y-4 shadow-md hover:shadow-xl transition-all duration-300 relative group overflow-hidden flex flex-col justify-between ${
                                  isDraft ? 'border-slate-800 hover:border-purple-500/50' : 'border-amber-500/40 hover:border-amber-400'
                                }`}
                              >
                                <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <h4 className="text-sm font-extrabold text-white font-mono truncate" title={tmpl.name}>
                                      {tmpl.name}
                                    </h4>
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-mono font-black border shrink-0 flex items-center gap-1 ${
                                      isDraft
                                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                                        : 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                                    }`}>
                                      <Icon icon={isDraft ? "solar:pen-bold" : "solar:clock-circle-bold"} className="w-2.5 h-2.5" />
                                      {isDraft ? '✏️ LOCAL DRAFT' : '⏳ PENDING META REVIEW'}
                                    </span>
                                  </div>

                                  {/* META ID / LOCAL STATUS SUB-TAG */}
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono">
                                    {metaId ? (
                                      <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                                        <Icon icon="solar:hashtag-bold" className="w-3 h-3 text-cyan-400" />
                                        Meta ID: {metaId}
                                      </span>
                                    ) : (
                                      <span className="px-2 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800 flex items-center gap-1">
                                        <Icon icon="solar:database-bold" className="w-3 h-3 text-slate-500" />
                                        Local CRM Only (No Meta ID)
                                      </span>
                                    )}
                                  </div>

                                  <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans line-clamp-3 min-h-[64px]">
                                    {tmpl.body?.text || 'No copy content'}
                                  </div>

                                  <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
                                    <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                      {tmpl.category}
                                    </span>
                                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                      {tmpl.language || 'en_US'}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                                  <button
                                    onClick={() => setPreviewTemplate(tmpl)}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 transition-colors"
                                  >
                                    <Icon icon="solar:eye-bold" className="w-3.5 h-3.5 text-cyan-400" />
                                    <span>Preview</span>
                                  </button>

                                  <Link
                                    href={`/templates/builder?id=${tmpl.id}`}
                                    className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-colors ${
                                      isDraft
                                        ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/30'
                                        : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
                                    }`}
                                  >
                                    <Icon icon={isDraft ? "solar:upload-bold" : "solar:pen-bold"} className="w-3.5 h-3.5" />
                                    <span>{isDraft ? 'Submit to Meta' : 'Edit Template'}</span>
                                  </Link>

                                  <button
                                    onClick={() => handleDeleteTemplate(tmpl.id)}
                                    className="p-1.5 text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg transition-colors"
                                    title="Delete Template"
                                  >
                                    <Icon icon="solar:trash-bin-trash-bold" className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* PARTITION 3: STAGED & LOCKED OPERATIONAL DATABASE TEMPLATES */}
                    <div className="space-y-4 bg-slate-950/60 border border-amber-500/30 rounded-3xl p-5 shadow-xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30 grid place-items-center">
                            <Icon icon="solar:lock-keyhole-bold-duotone" className="w-4.5 h-4.5" />
                          </div>
                          <div>
                            <h3 className="text-sm font-extrabold text-white font-mono flex items-center gap-2">
                              Staged &amp; Locked Operational Database Templates
                              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-black">
                                {filteredLockedDatabaseTemplates.length} LOCKED
                              </span>
                            </h3>
                            <p className="text-[11px] text-slate-400">Templates saved in database and locked for active broadcast communication &amp; automation</p>
                          </div>
                        </div>
                      </div>

                      {filteredLockedDatabaseTemplates.length === 0 ? (
                        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-10 text-center space-y-3">
                          <Icon icon="solar:document-bold-duotone" className="w-10 h-10 text-slate-500 mx-auto" />
                          <h4 className="text-sm font-bold text-white">No locked database templates found</h4>
                          <p className="text-xs text-slate-400 max-w-sm mx-auto font-mono">
                            Click "Save to DB" on any discovered Meta template above or create a new template to lock it into your database.
                          </p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                          {filteredLockedDatabaseTemplates.map((tmpl) => (
                            <div
                              key={tmpl.id || tmpl.name}
                              className="bg-slate-950 border border-slate-800 hover:border-amber-500/50 rounded-2xl p-5 space-y-4 shadow-md hover:shadow-xl transition-all duration-300 relative group overflow-hidden flex flex-col justify-between"
                            >
                              <div className="space-y-3">
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-sm font-extrabold text-white font-mono truncate" title={tmpl.name}>
                                    {tmpl.name}
                                  </h4>
                                  <span className="px-2.5 py-0.5 rounded-full text-[9px] font-mono font-black bg-amber-500/15 text-amber-300 border border-amber-500/40 shrink-0 flex items-center gap-1">
                                    <Icon icon="solar:lock-bold" className="w-2.5 h-2.5" />
                                    LOCKED
                                  </span>
                                </div>

                                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 text-xs text-slate-300 leading-relaxed font-sans line-clamp-3 min-h-[64px]">
                                  {tmpl.body?.text || 'No copy content'}
                                </div>

                                <div className="flex items-center gap-2 text-[10px] font-mono font-bold">
                                  <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                                    {tmpl.category}
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                                    {tmpl.language || 'en_US'}
                                  </span>
                                </div>
                              </div>

                              {/* 4-ICON TRANSLUCENT CARD HOVER OVERLAY (Action Rail) */}
                              <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center gap-3 p-4">
                                <button
                                  onClick={() => setPreviewTemplate(tmpl)}
                                  className="w-10 h-10 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white grid place-items-center shadow-lg transition-transform hover:scale-110"
                                  title="Preview Mobile Simulator"
                                >
                                  <Icon icon="solar:eye-bold" className="w-5 h-5" />
                                </button>

                                <Link
                                  href={`/templates/builder?id=${tmpl.id || tmpl.name}`}
                                  className="w-10 h-10 rounded-xl bg-teal-600 hover:bg-teal-500 text-white grid place-items-center shadow-lg transition-transform hover:scale-110"
                                  title="Edit Template"
                                >
                                  <Icon icon="solar:pen-bold" className="w-5 h-5" />
                                </Link>

                                <button
                                  onClick={() => handleDuplicateTemplate(tmpl)}
                                  className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white grid place-items-center shadow-lg transition-transform hover:scale-110"
                                  title="Duplicate Template"
                                >
                                  <Icon icon="solar:copy-bold" className="w-5 h-5" />
                                </button>

                                <button
                                  onClick={() => handleDeleteTemplate(tmpl.id, tmpl.name)}
                                  className="w-10 h-10 rounded-xl bg-rose-600 hover:bg-rose-500 text-white grid place-items-center shadow-lg transition-transform hover:scale-110"
                                  title="Delete / Archive Template"
                                >
                                  <Icon icon="solar:trash-bin-trash-bold" className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* TAB CONTENT: EXPLORE PREBUILT LIBRARY */}
            {activeTab === 'explore' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs font-mono text-slate-500 dark:text-slate-400">
                  <span>Prebuilt Sector Blueprints ({filteredPrebuiltTemplates.length})</span>
                  <span>Click any card to clone into Template Builder</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredPrebuiltTemplates.map((pre) => (
                    <div
                      key={pre.id}
                      className="bg-white dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 hover:border-cyan-500/50 rounded-2xl p-5 space-y-4 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group cursor-pointer"
                      onClick={() => {
                        const templatePayload: WhatsAppTemplate = {
                          waba_id: activeLine?.waba_id || '',
                          name: pre.codeName,
                          language: pre.language,
                          category: pre.category,
                          marketingSubtype: pre.marketingSubtype,
                          status: 'DRAFT',
                          header: {
                            type: pre.headerType,
                            textValue: pre.headerText,
                          },
                          body: {
                            text: pre.bodyText,
                            examples: pre.defaultVariables,
                          },
                          footer: {
                            text: pre.footerText || '',
                          },
                          buttons: pre.buttons,
                        };
                        router.push(`/templates/builder?clone=${encodeURIComponent(JSON.stringify(templatePayload))}`);
                      }}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/30">
                            {pre.sector} • {pre.subcategory}
                          </span>
                          <span className="text-[10px] font-mono font-bold text-slate-400 flex items-center gap-1">
                            <Icon icon="solar:verified-check-bold" className="w-3.5 h-3.5 text-cyan-400" /> ADMIN
                          </span>
                        </div>

                        <div className="space-y-0.5">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-white font-mono group-hover:text-cyan-400 transition-colors">
                            {pre.title}
                          </h4>
                          <div className="text-[10px] font-mono text-slate-400">Code: {pre.codeName}</div>
                        </div>

                        <div className="p-3 bg-slate-50 dark:bg-slate-900/90 rounded-xl border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans line-clamp-3 min-h-[64px]">
                          {pre.bodyText}
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs font-bold text-cyan-600 dark:text-cyan-400 group-hover:translate-x-1 transition-transform">
                        <span>Use This Template &rarr;</span>
                        <Icon icon="solar:copy-bold" className="w-4 h-4" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RICH WABA CONTEXT SELECTION MODAL DRAWER WITH 'MAKE DEFAULT' BUTTONS */}
      {isWabaDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md grid place-items-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-xl w-full p-6 space-y-6 shadow-2xl text-white relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-cyan-500 text-slate-950 grid place-items-center shadow-lg">
                  <Icon icon="logos:whatsapp-icon" className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Select Operational WABA &amp; Line Context</h3>
                  <p className="text-xs text-slate-400">Choose active line for templates management or set default context</p>
                </div>
              </div>
              <button
                onClick={() => setIsWabaDrawerOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Icon icon="solar:close-square-bold" className="w-6 h-6" />
              </button>
            </div>

            {/* List of Operational WABAs Grouped with Child Phone Lines */}
            <div className="space-y-4 max-h-[420px] overflow-y-auto pr-1">
              {operationalLines.length === 0 ? (
                <div className="p-6 bg-slate-950 border border-slate-800 rounded-2xl text-center text-xs text-amber-400 font-mono">
                  No locked operational WABA lines found in DB. Navigate to /assets to lock lines.
                </div>
              ) : (
                Object.values(
                  operationalLines.reduce((acc, line) => {
                    const key = line.official_waba_id || line.waba_id;
                    if (!acc[key]) {
                      acc[key] = {
                        waba_id: key,
                        waba_name: line.waba_name || 'WhatsApp Business Account',
                        lines: [],
                      };
                    }
                    acc[key].lines.push(line);
                    return acc;
                  }, {} as Record<string, { waba_id: string; waba_name: string; lines: OperationalLine[] }>)
                ).map((group) => (
                  <div
                    key={group.waba_id}
                    className="bg-slate-950 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-lg"
                  >
                    {/* Parent WABA Header Card */}
                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30 grid place-items-center">
                          <Icon icon="solar:shop-bold-duotone" className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-extrabold text-white font-mono">{group.waba_name}</h4>
                          <p className="text-[11px] text-slate-400 font-mono">Meta WABA ID: <strong className="text-slate-300">{group.waba_id}</strong></p>
                        </div>
                      </div>

                      <span className="px-2.5 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800 text-[10px] font-mono font-bold">
                        {group.lines.length} {group.lines.length === 1 ? 'Line' : 'Lines'}
                      </span>
                    </div>

                    {/* Child Phone Lines Indented List */}
                    <div className="space-y-2 pl-2">
                      {group.lines.map((line) => {
                        const isActive = activeLine?.phone_number_id === line.phone_number_id;
                        const isDefault = defaultLineId === line.phone_number_id;

                        return (
                          <div
                            key={line.phone_number_id}
                            className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isActive
                                ? 'bg-cyan-500/10 border-cyan-500/80 text-cyan-300 ring-1 ring-cyan-500/30 shadow-md'
                                : isDefault
                                ? 'bg-amber-500/15 border-amber-500/80 text-amber-300 ring-1 ring-amber-500/30 shadow-md'
                                : 'bg-slate-900/90 border-slate-800/80 hover:border-slate-700 text-slate-300'
                            }`}
                          >
                            <div className="space-y-0.5 truncate">
                              <div className="flex items-center gap-2 font-mono">
                                <Icon icon="logos:whatsapp-icon" className="w-4 h-4 shrink-0" />
                                <span className="text-sm font-extrabold text-white">{line.display_phone_number}</span>

                                {isActive && (
                                  <span className="px-2 py-0.5 rounded bg-cyan-500 text-slate-950 text-[9px] font-black shrink-0">
                                    ACTIVE LINE
                                  </span>
                                )}
                                {isDefault && (
                                  <span className="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-black flex items-center gap-1 shrink-0">
                                    <Icon icon="solar:bookmark-bold" className="w-2.5 h-2.5" />
                                    DEFAULT CONTEXT
                                  </span>
                                )}
                              </div>

                              <div className="text-[11px] text-slate-400 font-sans pl-6 truncate">
                                {line.verified_name || 'Verified Line'} • <span className="font-mono text-slate-500">PNID: {line.phone_number_id}</span>
                              </div>
                            </div>

                            {/* Small Action Button Rail */}
                            <div className="flex items-center gap-2 shrink-0 self-center">
                              {!isActive && (
                                <button
                                  onClick={() => {
                                    setActiveLine(line);
                                    setIsWabaDrawerOpen(false);
                                    toast.info(`Switched active context to ${line.display_phone_number}`);
                                  }}
                                  className="bg-slate-800 hover:bg-slate-700 text-white font-bold px-3 py-1.5 rounded-xl text-xs transition-colors"
                                >
                                  Select Line
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  makeDefaultLine(line);
                                  toast.success(`Default Context Set to ${line.display_phone_number}!`, {
                                    description: 'Saved as default operational line across platform.',
                                    icon: <Icon icon="solar:bookmark-bold" className="w-4 h-4 text-amber-400" />,
                                  });
                                }}
                                disabled={isDefault}
                                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 ${
                                  isDefault
                                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-default'
                                    : 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 shadow-xs active:scale-95'
                                }`}
                              >
                                <Icon icon="solar:bookmark-bold" className="w-3.5 h-3.5" />
                                <span>{isDefault ? 'Default WABA' : 'Make Default'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ARCHIVED & DELETED ON META MODAL WINDOW */}
      {isArchivedModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md grid place-items-center p-4">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-xl w-full p-6 space-y-5 shadow-2xl text-white relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Icon icon="solar:box-minimalistic-bold-duotone" className="w-5 h-5 text-rose-400" />
                <div>
                  <h3 className="text-sm font-bold font-mono">Archived &amp; Deleted Meta Templates</h3>
                  <p className="text-[11px] text-slate-400">Templates deleted from Meta platform or archived locally</p>
                </div>
              </div>
              <button
                onClick={() => setIsArchivedModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Icon icon="solar:close-square-bold" className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
              {archivedOrDeletedTemplates.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 font-mono">
                  No archived or deleted templates found for this WABA.
                </div>
              ) : (
                archivedOrDeletedTemplates.map((t) => (
                  <div
                    key={t.id || t.name}
                    className="p-3.5 bg-slate-950 border border-slate-800 rounded-2xl flex items-center justify-between gap-3 text-xs font-mono"
                  >
                    <div className="space-y-1 truncate">
                      <div className="flex items-center gap-2 font-bold text-slate-100">
                        <span>{t.name}</span>
                        <span className="text-[10px] text-slate-400">({t.language})</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        {t.status === 'DELETED_ON_META' ? (
                          <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold flex items-center gap-1">
                            <Icon icon="solar:danger-triangle-bold" className="w-3 h-3" />
                            ⚠️ Deleted on Meta
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700 font-bold">
                            📦 Archived
                          </span>
                        )}
                        <span className="text-slate-500">{t.category}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => {
                          setIsArchivedModalOpen(false);
                          handleDuplicateTemplate(t);
                        }}
                        className="bg-cyan-950 text-cyan-300 hover:bg-cyan-900 border border-cyan-800 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                      >
                        Restore / Re-create
                      </button>

                      <button
                        onClick={async () => {
                          await handlePermanentDelete(t.id, t.name);
                        }}
                        className="bg-rose-950 text-rose-300 hover:bg-rose-900 border border-rose-800 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95"
                        title="Permanently remove from local CRM database"
                      >
                        <Icon icon="solar:trash-bin-trash-bold" className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* MOBILE SIMULATOR PREVIEW OVERLAY MODAL */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md grid place-items-center p-4">
          <div className="bg-slate-900 border border-cyan-500/40 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl text-white relative animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Icon icon="solar:mobile-minimal-bold-duotone" className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-bold font-mono">WhatsApp Mobile Simulator</h3>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
              >
                <Icon icon="solar:close-square-bold" className="w-5 h-5" />
              </button>
            </div>

            <PhoneSimulator
              template={previewTemplate}
              variables={previewTemplate.body?.examples || []}
            />
          </div>
        </div>
      )}
    </div>
  );
}
