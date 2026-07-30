'use client';

import React, { useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import MetaDebugBanner from '@/components/layout/MetaDebugBanner';

export default function PlatformLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  return (
    <div className="h-screen w-screen overflow-hidden flex bg-[#F1F5F9] dark:bg-[#10141D] text-[#1C2434] dark:text-white font-sans antialiased transition-colors">
      {/* Sidebar - Pinned Fixed to Left */}
      <Sidebar
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        sidebarExpanded={sidebarExpanded}
        setSidebarExpanded={setSidebarExpanded}
      />

      {/* Right Column Workspace */}
      <div className="relative flex flex-1 flex-col h-full overflow-hidden">
        {/* Top Warning Banner for Graph API Debug Logging */}
        <MetaDebugBanner />

        {/* Header - Fixed to Top */}
        <Header
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          sidebarExpanded={sidebarExpanded}
          setSidebarExpanded={setSidebarExpanded}
        />

        {/* Main Content Area - ONLY THIS SCROLLS */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-6">
          <div className="max-w-7xl mx-auto w-full space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
