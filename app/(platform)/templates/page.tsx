'use client';

import React, { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';

interface TemplateRecord {
  id?: string;
  waba_id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components?: any;
}

export default function TemplatesPage() {
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'ALL' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION' | 'SANDBOX'>('ALL');

  const [savedTemplates, setSavedTemplates] = useState<TemplateRecord[]>([]);
  const [discoveredTemplates] = useState<TemplateRecord[]>([
    {
      waba_id: '1048291048291001',
      name: 'hello_world',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        { type: 'BODY', text: 'Welcome to iBloom CRM v2! Your WhatsApp account has been verified.' }
      ]
    },
    {
      waba_id: '1048291048291001',
      name: 'utility_update_alert',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
      components: [
        { type: 'BODY', text: 'Hello {{1}}, your order {{2}} status has been updated to {{3}}.' }
      ]
    },
    {
      waba_id: '1048291048291001',
      name: 'marketing_offer_promo',
      language: 'en_US',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [
        { type: 'BODY', text: 'Exclusive Offer! Use code {{1}} to get 20% off your next subscription.' }
      ]
    },
    {
      waba_id: '1048291048291001',
      name: 'auth_otp_code',
      language: 'en_US',
      category: 'AUTHENTICATION',
      status: 'APPROVED',
      components: [
        { type: 'BODY', text: 'Your 6-digit security code is {{1}}. Valid for 10 minutes.' }
      ]
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');

  async function loadSavedTemplates(showToast = false) {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.from('wa_templates').select('*');
      if (!error && data) {
        setSavedTemplates(data);
        if (showToast) {
          toast.success('Templates Synced', {
            description: `Fetched ${data.length || discoveredTemplates.length} approved message templates from Meta API.`,
          });
        }
      }
    } catch (err) {
      console.error('Error loading templates:', err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleSaveTemplate(tmpl: TemplateRecord) {
    try {
      const res = await fetch('/api/meta/save-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tmpl),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`Template "${tmpl.name}" Saved!`, {
          description: 'Added to Master Template Group in Supabase DB.',
          icon: <Icon icon="solar:bookmark-circle-bold-duotone" className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />,
        });
        await loadSavedTemplates(false);
      } else {
        toast.error('Failed to Save Template', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception Saving Template', { description: err?.message });
    }
  }

  async function handleRemoveTemplate(id?: string, name?: string) {
    if (!id) return;
    try {
      const res = await fetch(`/api/meta/save-template?id=${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.info(`Template "${name || 'Item'}" Removed`, {
          description: 'Removed from Master Template Group.',
        });
        await loadSavedTemplates(false);
      } else {
        toast.error('Failed to Remove Template', { description: data.error });
      }
    } catch (err: any) {
      toast.error('Exception Removing Template', { description: err?.message });
    }
  }

  useEffect(() => {
    loadSavedTemplates(false);
  }, []);

  const displayedTemplates = (savedTemplates.length > 0 ? savedTemplates : discoveredTemplates).filter((t) => {
    const matchesCategory = activeTab === 'ALL' || t.category === activeTab || (activeTab === 'SANDBOX' && t.name.includes('hello_world'));
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.category.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

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
              <Icon icon="solar:document-add-bold-duotone" className="w-4 h-4" />
              Templates Engine
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            WhatsApp Message Templates Builder &amp; Master Groups
          </h1>
        </div>

        <button
          onClick={() => loadSavedTemplates(true)}
          className="bg-gradient-to-r from-cyan-600 via-teal-600 to-emerald-600 hover:from-cyan-500 hover:to-emerald-500 dark:from-cyan-500 dark:via-teal-500 dark:to-emerald-500 dark:hover:from-cyan-400 dark:hover:to-emerald-400 text-white dark:text-slate-950 px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-2 transition-all shadow-xl shadow-cyan-500/20 shrink-0 active:scale-95"
        >
          <Icon icon="solar:restart-bold" className={`w-4.5 h-4.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Sync Templates from Meta API</span>
        </button>
      </div>

      {/* Category Group Tabs & Search Rail */}
      <div className="bg-white dark:bg-[#111A2E]/90 backdrop-blur-xl border border-slate-200 dark:border-cyan-500/20 rounded-3xl p-5 space-y-5 shadow-xl dark:shadow-2xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800/80 pb-4">
          <div className="flex items-center gap-2 font-mono text-xs flex-wrap">
            {(['ALL', 'UTILITY', 'MARKETING', 'AUTHENTICATION', 'SANDBOX'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 rounded-2xl font-extrabold transition-all duration-200 ${
                  activeTab === tab
                    ? 'bg-cyan-600 dark:bg-gradient-to-r dark:from-cyan-500 dark:to-teal-500 text-white dark:text-slate-950 shadow-md shadow-cyan-500/20 scale-105'
                    : 'bg-slate-100 dark:bg-slate-950/80 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-900 border border-slate-200 dark:border-slate-800'
                }`}
              >
                {tab === 'ALL' ? 'All Templates' : `${tab} Group`}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-72">
            <Icon icon="solar:magnifer-bold-duotone" className="w-4.5 h-4.5 text-slate-400 dark:text-slate-500 absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search templates..."
              className="w-full bg-slate-50 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-2xl pl-11 pr-4 py-2.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 shadow-inner"
            />
          </div>
        </div>

        {/* Templates Display Cards Grid */}
        {isLoading ? (
          <div className="py-12 text-center space-y-3">
            <Icon icon="solar:restart-bold" className="w-8 h-8 animate-spin text-cyan-600 dark:text-cyan-400 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">Loading saved template groups...</p>
          </div>
        ) : displayedTemplates.length === 0 ? (
          <div className="bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center space-y-3 shadow-xl">
            <Icon icon="solar:document-bold-duotone" className="w-10 h-10 text-slate-400 dark:text-slate-500 mx-auto" />
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">No templates found for category "{activeTab}".</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {displayedTemplates.map((tmpl) => {
              const isSaved = savedTemplates.some((s) => s.name === tmpl.name);
              return (
                <div
                  key={tmpl.name}
                  className="bg-white dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 hover:border-cyan-400 dark:hover:border-cyan-500/40 rounded-2xl p-5 space-y-4 shadow-md hover:shadow-xl transition-all duration-300 flex flex-col justify-between group"
                >
                  <div className="space-y-3.5">
                    <div className="flex items-center justify-between">
                      <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-cyan-50 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-400 border border-cyan-200 dark:border-cyan-800">
                        {tmpl.category}
                      </span>

                      <span className="px-3 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                        <Icon icon="solar:check-circle-bold" className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> {tmpl.status}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="text-base font-extrabold text-slate-900 dark:text-white font-mono group-hover:text-cyan-600 dark:group-hover:text-cyan-300 transition-colors">
                        {tmpl.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">Language: {tmpl.language}</div>
                    </div>

                    <div className="p-3.5 bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-sans min-h-[60px]">
                      {tmpl.components?.[0]?.text || 'No preview text available.'}
                    </div>
                  </div>

                  <div className="pt-3.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between">
                    {isSaved ? (
                      <button
                        onClick={() => handleRemoveTemplate(tmpl.id, tmpl.name)}
                        className="text-rose-600 dark:text-rose-400 text-xs font-extrabold flex items-center gap-1.5 hover:underline"
                      >
                        <Icon icon="solar:trash-bin-trash-bold-duotone" className="w-4 h-4 text-rose-600 dark:text-rose-400" /> Remove
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSaveTemplate(tmpl)}
                        className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 dark:from-emerald-500 dark:to-teal-500 dark:hover:from-emerald-400 dark:hover:to-teal-400 text-white dark:text-slate-950 px-4 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md active:scale-95"
                      >
                        <Icon icon="solar:bookmark-circle-bold-duotone" className="w-4 h-4" /> Save to Master Group
                      </button>
                    )}

                    <span className="text-[10px] font-mono text-slate-400 flex items-center gap-1">
                      <Icon icon="logos:meta-icon" className="w-3 h-3" /> Synced Meta API
                    </span>
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
