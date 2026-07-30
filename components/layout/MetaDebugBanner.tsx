'use client';

import React from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';

export default function MetaDebugBanner() {
  return (
    <div className="bg-[#1E1B4B] text-indigo-100 border-b border-indigo-500/30 px-4 py-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 font-mono shadow-md z-50">
      <div className="flex items-center gap-2 font-bold">
        <Icon icon="solar:bug-minimalistic-bold-duotone" className="w-4.5 h-4.5 text-amber-400 shrink-0 animate-pulse" />
        <span className="truncate">
          ⚠️ TEMPORARY DEBUG MODE ACTIVE: Meta Graph API requests (GET, POST, etc.) &amp; responses are logged for testing.
        </span>
      </div>

      <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
        <span className="text-[10px] text-indigo-300 font-normal hidden lg:inline">
          Tokens/secrets automatically masked
        </span>
        <Link
          href="/meta-logs"
          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white px-3 py-1 rounded-xl text-[11px] font-black tracking-wide flex items-center gap-1 shadow-md transition-all active:scale-95"
        >
          <span>View Live Graph Logs →</span>
        </Link>
      </div>
    </div>
  );
}
