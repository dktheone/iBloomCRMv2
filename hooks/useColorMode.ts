'use client';

import { useEffect, useState } from 'react';

export default function useColorMode() {
  const [colorMode, setColorMode] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    // Sync initial state from document.documentElement
    const isDark = document.documentElement.classList.contains('dark');
    setColorMode(isDark ? 'dark' : 'light');
  }, []);

  const toggleColorMode = (mode: 'dark' | 'light') => {
    setColorMode(mode);
    if (mode === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('color-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('color-theme', 'light');
    }
  };

  return [colorMode, toggleColorMode] as const;
}
