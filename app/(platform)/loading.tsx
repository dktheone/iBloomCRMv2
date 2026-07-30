import React from 'react';

export default function PlatformLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top Skeleton Rail */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-7 w-72 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
        <div className="h-8 w-36 bg-slate-200 dark:bg-slate-800 rounded-xl" />
      </div>

      {/* Hero Banner Skeleton */}
      <div className="h-32 w-full bg-slate-200 dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800" />

      {/* Grid Cards Skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-36 bg-slate-200 dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex justify-between items-center">
              <div className="w-9 h-9 bg-slate-300 dark:bg-slate-800 rounded-xl" />
              <div className="w-20 h-5 bg-slate-300 dark:bg-slate-800 rounded-lg" />
            </div>
            <div className="h-4 w-32 bg-slate-300 dark:bg-slate-800 rounded-lg" />
            <div className="h-3 w-24 bg-slate-300 dark:bg-slate-800 rounded-lg" />
          </div>
        ))}
      </div>

      {/* Details Box Skeleton */}
      <div className="h-64 w-full bg-slate-200 dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="h-5 w-64 bg-slate-300 dark:bg-slate-800 rounded-lg" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-20 bg-slate-300/60 dark:bg-slate-800/60 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
