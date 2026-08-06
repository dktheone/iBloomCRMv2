'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@iconify/react';
import { useSession } from '@/components/providers/SessionProvider';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (arg: boolean) => void;
  sidebarExpanded: boolean;
  setSidebarExpanded: (arg: boolean) => void;
}

export default function Sidebar({
  sidebarOpen,
  setSidebarOpen,
  sidebarExpanded,
  setSidebarExpanded,
}: SidebarProps) {
  const pathname = usePathname();
  const { tenantProfile } = useSession();
  const [activeHref, setActiveHref] = useState(pathname);

  useEffect(() => {
    setActiveHref(pathname);
  }, [pathname]);

  const messagingNavItems = [
    {
      name: 'Inbox',
      href: '/inbox',
      icon: 'solar:chat-round-dots-bold-duotone',
      subtitle: 'Conversations & Live Chat'
    },
    {
      name: 'Contacts Hub',
      href: '/contacts',
      icon: 'solar:users-group-two-rounded-bold-duotone',
      subtitle: 'Audience & Contact Directory'
    },
    {
      name: 'Template Sync & Builder',
      href: '/templates',
      icon: 'solar:document-add-bold-duotone',
      subtitle: 'WhatsApp Template Management'
    },
    {
      name: 'Validation Broadcast',
      href: '/validation',
      icon: 'solar:square-share-line-bold-duotone',
      subtitle: 'Live Test Send & Event Logs'
    },
  ];

  const platformNavItems = [
    {
      name: 'Master Dashboard',
      href: '/dashboard',
      icon: 'solar:chart-2-bold-duotone',
      subtitle: 'Overview & Master Agency Status'
    },
    {
      name: 'Webhook Control Center',
      href: '/webhooks',
      icon: 'solar:shield-check-bold-duotone',
      subtitle: 'Multi-Provider Webhook Manager'
    },
    {
      name: 'Provider Config',
      href: '/provider',
      icon: 'solar:settings-bold-duotone',
      subtitle: 'Meta App Identity & Credentials'
    },
    {
      name: 'Asset Hub & Numbers',
      href: '/assets',
      icon: 'solar:layers-bold-duotone',
      subtitle: 'Testing & Business Lines'
    },
    {
      name: 'Graph API Debug Logs',
      href: '/meta-logs',
      icon: 'solar:bug-minimalistic-bold-duotone',
      subtitle: 'Live Intercepted API Inspector'
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div
        onClick={() => setSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-md transition-opacity lg:hidden ${
          sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      {/* Sidebar Container */}
      <aside
        className={`fixed left-0 top-0 z-50 flex h-full flex-col overflow-hidden bg-slate-900 text-slate-100 border-r border-slate-800/80 transition-all duration-300 ease-in-out lg:static shrink-0 shadow-2xl ${
          sidebarExpanded ? 'w-72' : 'w-20'
        } ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* 1. TOP HEADER LOGO */}
        <div className="shrink-0 flex items-center justify-between gap-2 px-5 py-4 border-b border-slate-800/80">
          <Link href="/dashboard" prefetch={true} onClick={() => setActiveHref('/dashboard')} className="flex items-center gap-3 overflow-hidden">
            <div className="w-10 h-10 rounded-2xl bg-white/95 text-slate-950 grid place-items-center shadow-lg shadow-black/40 border border-slate-700/50 shrink-0">
              <Icon icon="logos:meta-icon" className="w-6 h-6" />
            </div>
            {sidebarExpanded && (
              <div className="flex flex-col truncate">
                <span className="text-sm font-extrabold tracking-tight text-white truncate">
                  {tenantProfile?.name || 'Master Agency'}
                </span>
                <span className="text-[10px] font-mono text-cyan-400 tracking-widest uppercase truncate font-bold">
                  Platform Console
                </span>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1">
            {/* Desktop Rail Collapse Toggle */}
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="hidden lg:flex items-center justify-center w-8 h-8 rounded-xl bg-slate-950 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <Icon icon={sidebarExpanded ? "solar:alt-arrow-left-bold" : "solar:alt-arrow-right-bold"} className="w-4 h-4" />
            </button>

            {/* Mobile Close Toggle */}
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden p-1.5 rounded-xl text-slate-400 hover:text-white"
            >
              <Icon icon="solar:close-square-bold" className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 2. NAVIGATION MENU LIST */}
        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-6">

          {/* Messaging Section */}
          <div className="space-y-1">
            {sidebarExpanded && (
              <span className="text-[10px] font-mono text-cyan-500/70 font-bold uppercase tracking-widest px-3 mb-2 block">
                Messaging
              </span>
            )}
            {messagingNavItems.map((item) => {
              const isActive = activeHref === item.href || activeHref.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => { setActiveHref(item.href); setSidebarOpen(false); }}
                  className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-extrabold shadow-lg shadow-cyan-900/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                  title={!sidebarExpanded ? item.name : undefined}
                >
                  <Icon
                    icon={item.icon}
                    className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'
                    }`}
                  />
                  {sidebarExpanded && (
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-bold tracking-tight truncate">{item.name}</span>
                      <span className={`text-[10px] truncate ${isActive ? 'text-cyan-100' : 'text-slate-500 font-mono'}`}>
                        {item.subtitle}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Platform Section */}
          <div className="space-y-1">
            {sidebarExpanded && (
              <span className="text-[10px] font-mono text-slate-500 font-bold uppercase tracking-widest px-3 mb-2 block">
                Platform
              </span>
            )}
            {platformNavItems.map((item) => {
              const isActive = activeHref === item.href || (item.href !== '/dashboard' && activeHref.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch={true}
                  onClick={() => { setActiveHref(item.href); setSidebarOpen(false); }}
                  className={`flex items-center gap-3.5 px-3.5 py-3 rounded-2xl transition-all duration-200 group ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-extrabold shadow-lg shadow-cyan-900/30'
                      : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60'
                  }`}
                  title={!sidebarExpanded ? item.name : undefined}
                >
                  <Icon
                    icon={item.icon}
                    className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-cyan-400'
                    }`}
                  />
                  {sidebarExpanded && (
                    <div className="flex flex-col truncate">
                      <span className="text-xs font-bold tracking-tight truncate">{item.name}</span>
                      <span className={`text-[10px] truncate ${isActive ? 'text-cyan-100' : 'text-slate-500 font-mono'}`}>
                        {item.subtitle}
                      </span>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>
        </div>

        {/* 3. FOOTER USER PROFILE MINI CARD */}
        <div className="shrink-0 p-4 border-t border-slate-800/80 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500/30 text-cyan-400 font-bold text-xs grid place-items-center shrink-0">
              MA
            </div>
            {sidebarExpanded && (
              <div className="flex flex-col truncate text-xs">
                <span className="font-bold text-slate-200 truncate">Master Agency</span>
                <span className="text-[10px] text-slate-500 font-mono truncate">Tenant Zero</span>
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
