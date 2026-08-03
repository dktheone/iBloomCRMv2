'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { apiGet } from '@/lib/api/http';

export interface OperationalLine {
  phone_line_uid?: string;
  id?: string;
  meta_phone_number_id?: string;
  phone_number_id: string;
  waba_uid?: string;
  waba_id: string;
  meta_waba_id?: string;
  official_waba_id?: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
  waba_name?: string;
  lifecycle_status?: string;
  is_locked?: boolean;
}

interface WabaContextType {
  operationalLines: OperationalLine[];
  activeLine: OperationalLine | null;
  defaultLineId: string | null;
  setActiveLine: (line: OperationalLine) => void;
  makeDefaultLine: (line: OperationalLine) => void;
  isLoadingLines: boolean;
  refetchOperationalLines: () => Promise<void>;
}

const WabaContext = createContext<WabaContextType>({
  operationalLines: [],
  activeLine: null,
  defaultLineId: null,
  setActiveLine: () => {},
  makeDefaultLine: () => {},
  isLoadingLines: true,
  refetchOperationalLines: async () => {},
});

export function WabaProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const [operationalLines, setOperationalLines] = useState<OperationalLine[]>([]);
  const [activeLine, setActiveLineState] = useState<OperationalLine | null>(null);
  const [defaultLineId, setDefaultLineId] = useState<string | null>(null);
  const [isLoadingLines, setIsLoadingLines] = useState(true);

  async function fetchOperationalLines() {
    setIsLoadingLines(true);
    try {
      const data = await apiGet('/api/meta/enrolled-assets');

      let lines: OperationalLine[] = [];
      let wabasMap: Record<string, { waba_id?: string; meta_waba_id?: string; waba_uid?: string; name: string }> = {};

      if (data.success && data.enrolledWabas) {
        data.enrolledWabas.forEach((w: any) => {
          const mWabaId = w.meta_waba_id || w.waba_id;
          if (w.waba_uid) wabasMap[w.waba_uid] = { waba_id: mWabaId, meta_waba_id: mWabaId, waba_uid: w.waba_uid, name: w.name };
          if (w.id) wabasMap[w.id] = { waba_id: mWabaId, meta_waba_id: mWabaId, name: w.name };
          if (mWabaId) wabasMap[mWabaId] = { waba_id: mWabaId, meta_waba_id: mWabaId, name: w.name };
        });
      }

      if (data.success && data.enrolledPhones) {
        lines = data.enrolledPhones
          .filter(
            (p: any) => p.lifecycle_status === 'LIVE_OPERATIONAL' && (p.is_locked === true || p.is_locked === undefined)
          )
          .map((p: any) => {
            const wIdKey = p.waba_uid || p.waba_id;
            const parentWaba = wabasMap[wIdKey] || { waba_id: p.meta_waba_id || p.official_waba_id || p.waba_id, name: p.waba_name || 'WhatsApp Business Account' };
            const mPhoneId = p.meta_phone_number_id || p.phone_number_id;
            const mWabaId = parentWaba.meta_waba_id || parentWaba.waba_id || p.meta_waba_id || p.official_waba_id || p.waba_id;
            return {
              ...p,
              phone_line_uid: p.phone_line_uid || p.id,
              meta_phone_number_id: mPhoneId,
              phone_number_id: mPhoneId,
              meta_waba_id: mWabaId,
              official_waba_id: mWabaId,
              waba_name: parentWaba.name || 'WhatsApp Business Account',
            };
          });
      } else {
        const { data: dbPhones } = await supabase
          .from('wa_phone_numbers')
          .select('*, wabas(waba_uid, meta_waba_id, waba_id, name)')
          .eq('lifecycle_status', 'LIVE_OPERATIONAL');
        if (dbPhones) {
          lines = dbPhones.map((p: any) => {
            const mPhoneId = p.meta_phone_number_id || p.phone_number_id;
            const mWabaId = p.wabas?.meta_waba_id || p.wabas?.waba_id || p.waba_id;
            return {
              ...p,
              phone_line_uid: p.phone_line_uid || p.id,
              meta_phone_number_id: mPhoneId,
              phone_number_id: mPhoneId,
              meta_waba_id: mWabaId,
              official_waba_id: mWabaId,
              waba_name: p.wabas?.name || 'WhatsApp Business Account',
            };
          });
        }
      }

      setOperationalLines(lines);

      // Check saved default line in localStorage
      const savedDefaultId = typeof window !== 'undefined' ? localStorage.getItem('ibloom_default_operational_phone_id') : null;
      if (savedDefaultId) {
        setDefaultLineId(savedDefaultId);
      }

      if (savedDefaultId && lines.length > 0) {
        const matched = lines.find((l) => l.phone_number_id === savedDefaultId);
        if (matched) {
          setActiveLineState(matched);
        } else if (lines[0]) {
          setActiveLineState(lines[0]);
        }
      } else if (lines.length > 0) {
        setActiveLineState(lines[0]);
      }
    } catch (err) {
      console.error('Error loading operational WABA context lines:', err);
    } finally {
      setIsLoadingLines(false);
    }
  }

  function setActiveLine(line: OperationalLine) {
    setActiveLineState(line);
  }

  function makeDefaultLine(line: OperationalLine) {
    setActiveLineState(line);
    setDefaultLineId(line.phone_number_id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('ibloom_default_operational_phone_id', line.phone_number_id);
    }
  }

  useEffect(() => {
    fetchOperationalLines();
  }, []);

  return (
    <WabaContext.Provider
      value={{
        operationalLines,
        activeLine,
        defaultLineId,
        setActiveLine,
        makeDefaultLine,
        isLoadingLines,
        refetchOperationalLines: fetchOperationalLines,
      }}
    >
      {children}
    </WabaContext.Provider>
  );
}

export function useWabaContext() {
  return useContext(WabaContext);
}
