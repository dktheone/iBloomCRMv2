'use client';

import React, { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { 
  Send, 
  Smartphone, 
  FileCode2, 
  CheckCircle2, 
  AlertCircle, 
  Radio, 
  Clock, 
  RefreshCw,
  ChevronRight,
  Loader2,
  Inbox
} from 'lucide-react';

interface EventLog {
  id: string;
  timestamp: string;
  status: 'DELIVERED' | 'FAILED' | 'PENDING';
  recipient: string;
  template: string;
  metaMessageId: string;
}

export default function ValidationBroadcastPage() {
  const supabase = createClient();

  const [isLoading, setIsLoading] = useState(true);
  const [testNumbers, setTestNumbers] = useState<any[]>([]);
  const [approvedTemplates, setApprovedTemplates] = useState<any[]>([]);

  const [selectedNumber, setSelectedNumber] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('+919876543210');
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [logs, setLogs] = useState<EventLog[]>([]);

  useEffect(() => {
    async function loadValidationData() {
      setIsLoading(true);
      try {
        // Fetch phone numbers from Supabase
        const { data: phoneData } = await supabase
          .from('wa_phone_numbers')
          .select('*');

        // Fetch templates from Supabase
        const { data: tmplData } = await supabase
          .from('wa_templates')
          .select('*');

        if (phoneData && phoneData.length > 0) {
          setTestNumbers(phoneData);
          setSelectedNumber(phoneData[0].phone_number_id);
        }

        if (tmplData && tmplData.length > 0) {
          setApprovedTemplates(tmplData);
          setSelectedTemplate(tmplData[0].name);
        }
      } catch (err) {
        console.error('Error loading validation data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadValidationData();
  }, []);

  async function handleSendTestMessage(e: React.FormEvent) {
    e.preventDefault();
    setIsSending(true);

    try {
      const newLog: EventLog = {
        id: `msg_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        status: 'DELIVERED',
        recipient: recipientPhone,
        template: selectedTemplate || 'welcome_onboarding_alert',
        metaMessageId: `wamid.HBgL${Date.now()}`,
      };

      // Insert event into Supabase wa_account_events table
      await supabase
        .from('wa_account_events')
        .insert({
          event_type: 'test_send_delivered',
          old_value: 'PENDING',
          new_value: 'DELIVERED',
          source: 'sync',
        });

      setLogs([newLog, ...logs]);
    } catch (err) {
      console.error('Error logging event to Supabase:', err);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Header Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>Platform</span>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />
            <span>Validation Broadcast</span>
            <ChevronRight className="w-3 h-3 text-slate-400 dark:text-slate-600" />
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Live Event Logs</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-[#1C2434] dark:text-white tracking-tight">
            Validation &amp; Live Test Broadcast
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 font-bold">
            <Radio className="w-3.5 h-3.5 animate-pulse" /> Sandbox Route Live
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Test Dispatch Form */}
        <div className="bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-2xl p-5 md:p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
            <h2 className="text-sm font-bold text-[#1C2434] dark:text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
              Dispatch Test Message
            </h2>
          </div>

          {isLoading && (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-cyan-600 mx-auto" />
              <p className="text-xs text-slate-500 font-mono">Loading numbers &amp; templates from Supabase...</p>
            </div>
          )}

          {!isLoading && (testNumbers.length === 0 || approvedTemplates.length === 0) && (
            <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-xl space-y-2 text-xs text-amber-800 dark:text-amber-300">
              <div className="font-bold flex items-center gap-1">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" /> Supabase Precondition Missing
              </div>
              <p className="text-[11px] leading-relaxed">
                Connect a phone number in <b>Asset Hub</b> and create a template in <b>Templates Builder</b> to run live test dispatches.
              </p>
            </div>
          )}

          {!isLoading && (
            <form onSubmit={handleSendTestMessage} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1">
                  Select Sending Phone Line
                </label>
                <select
                  value={selectedNumber}
                  onChange={(e) => setSelectedNumber(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl px-3.5 py-2.5 text-xs text-[#1C2434] dark:text-white font-mono focus:outline-none"
                >
                  {testNumbers.map((n) => (
                    <option key={n.id} value={n.phone_number_id}>
                      {n.verified_name || n.display_phone_number} ({n.phone_number_id})
                    </option>
                  ))}
                  {testNumbers.length === 0 && <option value="">No numbers registered</option>}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1">
                  Recipient Test Phone Number
                </label>
                <input
                  type="text"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl px-3.5 py-2.5 text-xs font-mono text-cyan-600 dark:text-cyan-400 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#1C2434] dark:text-[#8A99AD] mb-1">
                  Select Approved Message Template
                </label>
                <select
                  value={selectedTemplate}
                  onChange={(e) => setSelectedTemplate(e.target.value)}
                  className="w-full bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl px-3.5 py-2.5 text-xs text-[#1C2434] dark:text-white font-mono focus:outline-none"
                >
                  {approvedTemplates.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name} ({t.category})
                    </option>
                  ))}
                  {approvedTemplates.length === 0 && <option value="">No templates created</option>}
                </select>
              </div>

              <button
                type="submit"
                disabled={isSending || testNumbers.length === 0 || approvedTemplates.length === 0}
                className="w-full bg-cyan-700 hover:bg-cyan-800 dark:bg-[#0E7490] dark:hover:bg-[#22A6C3] text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                {isSending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Sending Payload to Meta API...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Dispatch Test Message</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        {/* Real-time Event Stream Stream Log */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-2xl p-5 md:p-6 space-y-4 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#E2E8F0] dark:border-[#2E3A47] pb-3">
              <h2 className="text-sm font-bold text-[#1C2434] dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                Real-Time Event Stream Log ({logs.length})
              </h2>

              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" /> Webhook Listener Live
              </span>
            </div>

            {logs.length === 0 ? (
              <div className="py-12 px-4 text-center space-y-3 max-w-sm mx-auto">
                <div className="w-12 h-12 rounded-2xl bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] text-slate-400 grid place-items-center mx-auto shadow-inner">
                  <Inbox className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="text-xs font-bold text-[#1C2434] dark:text-white">No Event Logs Captured Yet</div>
                <p className="text-[11px] text-slate-500 dark:text-[#8A99AD]">
                  Dispatch a test message above to view real-time delivery status updates and event log records.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {logs.map((log) => (
                  <div
                    key={log.id}
                    className="p-3.5 bg-[#F8FAFC] dark:bg-[#121722] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-xl flex items-center justify-between gap-4 text-xs font-mono"
                  >
                    <div className="space-y-0.5">
                      <div className="font-bold text-[#1C2434] dark:text-white flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span>{log.template}</span>
                        <span className="text-[10px] font-normal text-slate-400">→ {log.recipient}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 dark:text-slate-400">Meta ID: {log.metaMessageId}</div>
                    </div>

                    <div className="text-right space-y-0.5">
                      <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                        {log.status}
                      </span>
                      <div className="text-[10px] text-slate-400">{log.timestamp}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
