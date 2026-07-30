'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@iconify/react';
import useColorMode from '@/hooks/useColorMode';
import { useSession } from '@/components/providers/SessionProvider';
import { PLATFORM_CONFIG } from '@/config/platform.config';

interface HeaderProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
  sidebarExpanded: boolean;
  setSidebarExpanded: (arg: boolean) => void;
}

export default function Header({
  sidebarOpen,
  setSidebarOpen,
  sidebarExpanded,
  setSidebarExpanded,
}: HeaderProps) {
  const [colorMode, setColorMode] = useColorMode();
  const { userProfile, tenantProfile } = useSession();
  const [notifDropdown, setNotifDropdown] = useState(false);
  const [userDropdown, setUserDropdown] = useState(false);

  const initials = userProfile?.full_name
    ? userProfile.full_name
        .split(' ')
        .filter(Boolean)
        .slice(-2)
        .map((n) => n[0].toUpperCase())
        .join('')
    : 'SA';

  return (
    <header className="sticky top-0 z-30 flex h-16 w-full bg-slate-900/90 backdrop-blur-xl border-b border-slate-800/80 drop-shadow-md transition-colors text-slate-100">
      <div className="flex flex-grow items-center justify-between px-4 md:px-6">
        {/* Left Side */}
        <div className="flex items-center gap-3">
          {/* Mobile Hamburger Toggle */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              setSidebarOpen(!sidebarOpen);
            }}
            className="z-40 block rounded-2xl border border-slate-800 bg-slate-950 p-2 text-slate-300 lg:hidden hover:bg-slate-800"
          >
            <Icon icon="solar:hamburger-menu-bold-duotone" className="w-5 h-5" />
          </button>

          {/* Desktop Rail Toggle */}
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="hidden lg:flex items-center gap-2 rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-300 hover:border-cyan-500 transition-all shadow-inner"
            title={sidebarExpanded ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            <Icon icon="solar:sidebar-minimalistic-bold-duotone" className="w-4 h-4 text-cyan-400" />
            <span className="font-mono text-[11px] font-bold">{sidebarExpanded ? 'Collapse' : 'Expand'}</span>
          </button>

          {/* Search Input */}
          <div className="hidden sm:block relative w-64 md:w-80">
            <Icon icon="solar:magnifer-bold-duotone" className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search assets, templates, numbers..."
              className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors shadow-inner"
            />
          </div>
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3 md:gap-4">
          {/* Meta App Status Badge — Soft Light Icon Background with Shadow */}
          <div className="hidden md:flex items-center gap-2.5 bg-slate-950/90 border border-amber-500/30 px-3.5 py-1.5 rounded-2xl text-xs font-mono shadow-md">
            <div className="w-5 h-5 rounded-lg bg-white/95 text-slate-950 grid place-items-center shadow-sm shrink-0">
              <Icon icon="logos:meta-icon" className="w-3.5 h-3.5" />
            </div>
            <span className="text-amber-300 font-bold flex items-center gap-1.5">
              <span>DEV ({PLATFORM_CONFIG.appMode.toUpperCase()} {PLATFORM_CONFIG.metaApiVersion})</span>
            </span>
          </div>

          {/* Dynamic Light / Dark Mode Switcher */}
          <button
            onClick={() => setColorMode(colorMode === 'dark' ? 'light' : 'dark')}
            className="w-9.5 h-9.5 rounded-2xl bg-slate-950 border border-slate-800 grid place-items-center text-slate-300 hover:text-cyan-400 transition-colors shadow-inner"
            title={`Switch to ${colorMode === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {colorMode === 'dark' ? (
              <Icon icon="solar:sun-bold-duotone" className="w-4.5 h-4.5 text-amber-400" />
            ) : (
              <Icon icon="solar:moon-bold-duotone" className="w-4.5 h-4.5 text-slate-300" />
            )}
          </button>

          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setNotifDropdown(!notifDropdown)}
              className="w-9.5 h-9.5 rounded-2xl bg-slate-950 border border-slate-800 grid place-items-center text-slate-300 hover:text-cyan-400 transition-colors relative shadow-inner"
            >
              <Icon icon="solar:bell-bold-duotone" className="w-4.5 h-4.5 text-slate-300" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-amber-400" />
            </button>

            {notifDropdown && (
              <div className="absolute right-0 mt-3 w-80 rounded-3xl bg-slate-900 border border-slate-800 p-4 shadow-2xl space-y-3 z-50">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                  <span className="text-xs font-extrabold text-white">Platform Notifications</span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950 px-2 py-0.5 rounded-full border border-amber-800 font-bold">DEV Mode</span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-3 bg-slate-950/80 rounded-2xl border border-slate-800 space-y-1">
                    <div className="font-bold text-amber-300 flex items-center gap-2">
                      <Icon icon="logos:meta-icon" className="w-4 h-4" /> Meta App Sandbox Active
                    </div>
                    <div className="text-[11px] text-slate-400">Tech Provider Advanced Access review pending.</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="h-6 w-[1px] bg-slate-800 hidden sm:block" />

          {/* User Profile Dropdown */}
          <div className="relative">
            <button
              onClick={() => setUserDropdown(!userDropdown)}
              className="flex items-center gap-3 p-1 rounded-2xl hover:bg-slate-800/60 transition-colors"
            >
              <div className="w-9.5 h-9.5 rounded-2xl bg-gradient-to-br from-cyan-500 to-teal-600 text-slate-950 font-black text-xs font-mono grid place-items-center shadow-lg shadow-cyan-500/20 border border-cyan-400/40">
                {initials}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-extrabold text-white leading-tight">
                  {userProfile?.full_name || 'Super Admin'}
                </div>
                <div className="text-[10px] font-mono text-slate-400">
                  {tenantProfile?.name || 'Master Agency'}
                </div>
              </div>
              <Icon icon="solar:alt-arrow-down-bold" className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {userDropdown && (
              <div className="absolute right-0 mt-3 w-64 rounded-3xl bg-slate-900 border border-slate-800 p-3 shadow-2xl space-y-2 z-50">
                <div className="px-3.5 py-2.5 border-b border-slate-800 space-y-1">
                  <div className="text-xs font-extrabold text-white">
                    {userProfile?.full_name || 'Super Admin'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">
                    {userProfile?.email}
                  </div>
                  <div className="text-[10px] font-mono text-cyan-400 font-bold">
                    Phone: {userProfile?.phone}
                  </div>
                </div>
                <div className="space-y-1">
                  <Link
                    href="/provider"
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 hover:text-white rounded-2xl transition-colors"
                  >
                    <Icon icon="solar:shield-check-bold-duotone" className="w-4 h-4 text-cyan-400" />
                    <span>Provider Settings</span>
                  </Link>
                  <Link
                    href="/logout"
                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-bold text-rose-400 hover:bg-rose-950/60 rounded-2xl transition-colors"
                  >
                    <Icon icon="solar:logout-2-bold-duotone" className="w-4 h-4 text-rose-400" />
                    <span>Sign Out</span>
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
