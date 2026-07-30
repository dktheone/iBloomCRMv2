'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ShieldCheck, Loader2, LogOut } from 'lucide-react';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    async function executeSignOut() {
      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Sign out notice:', err);
      } finally {
        window.location.href = '/login';
      }
    }

    executeSignOut();
  }, [router]);

  return (
    <div className="min-h-screen w-screen bg-[#F1F5F9] dark:bg-[#10141D] text-[#1C2434] dark:text-white font-sans flex flex-col justify-between transition-colors">
      {/* Top Header Rail */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-[#E2E8F0] dark:border-[#2E3A47] bg-white/80 dark:bg-[#1C2434]/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-600 to-teal-600 grid place-items-center shadow-md">
            <ShieldCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold tracking-tight text-[#1C2434] dark:text-white">
              iBloom<span className="text-cyan-600 dark:text-cyan-400">CRM</span>
            </span>
            <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 tracking-widest uppercase">
              Secure Sign Out
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Card */}
      <div className="flex-1 grid place-items-center p-4 md:p-6">
        <div className="w-full max-w-md bg-white dark:bg-[#1A2232] border border-[#E2E8F0] dark:border-[#2E3A47] rounded-3xl p-8 shadow-2xl space-y-6 text-center">
          <div className="w-14 h-14 rounded-full bg-cyan-50 dark:bg-cyan-950/60 border border-cyan-200 dark:border-cyan-800 text-cyan-600 grid place-items-center mx-auto shadow-md">
            <Loader2 className="w-7 h-7 text-cyan-600 dark:text-cyan-400 animate-spin" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-[#1C2434] dark:text-white">
              Signing Out of iBloom CRM v2
            </h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto leading-relaxed">
              Clearing active session credentials and redirecting to Super Admin authentication...
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
