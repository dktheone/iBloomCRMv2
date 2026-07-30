'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export default function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  
  const [isNavigating, setIsNavigating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Whenever pathname or searchParams change, complete the progress bar
    setProgress(100);
    const timer = setTimeout(() => {
      setIsNavigating(false);
      setProgress(0);
    }, 300);

    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  useEffect(() => {
    // Intercept all link clicks across the entire app to start progress bar instantly (< 10ms)
    function handleAnchorClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const anchor = target.closest('a');
      
      if (anchor && anchor.href && anchor.href.startsWith(window.location.origin)) {
        const targetUrl = new URL(anchor.href);
        if (targetUrl.pathname !== window.location.pathname || targetUrl.search !== window.location.search) {
          setIsNavigating(true);
          setProgress(30);
          
          // Animate progress smoothly
          const interval = setInterval(() => {
            setProgress((prev) => {
              if (prev >= 85) {
                clearInterval(interval);
                return 85;
              }
              return prev + 15;
            });
          }, 100);
        }
      }
    }

    document.addEventListener('click', handleAnchorClick);
    return () => document.removeEventListener('click', handleAnchorClick);
  }, []);

  if (!isNavigating && progress === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none h-1 bg-slate-200/20">
      <div
        className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-amber-500 transition-all duration-300 ease-out shadow-[0_0_10px_#06b6d4]"
        style={{
          width: `${progress}%`,
          opacity: progress === 100 ? 0 : 1,
        }}
      />
    </div>
  );
}
