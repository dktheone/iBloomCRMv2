'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { PLATFORM_CONFIG } from '@/config/platform.config';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: string;
  mfa_enabled: boolean;
}

export interface TenantProfile {
  id: string;
  name: string;
  slug: string;
  mask_id: string;
  is_master_agency: boolean;
  status: string;
}

interface SessionContextType {
  userProfile: UserProfile | null;
  tenantProfile: TenantProfile | null;
  isLoading: boolean;
  refreshSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType>({
  userProfile: null,
  tenantProfile: null,
  isLoading: true,
  refreshSession: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [tenantProfile, setTenantProfile] = useState<TenantProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  async function loadSessionData() {
    setIsLoading(true);
    try {
      // 1. Fetch active Supabase GoTrue auth user
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Query public.users for profile metadata safely using maybeSingle() to avoid 406 error
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        const full_name = userData?.full_name || user.user_metadata?.full_name || PLATFORM_CONFIG.superAdminName;
        const phone = user.user_metadata?.phone || userData?.phone || '+91 98765 43210';

        setUserProfile({
          id: user.id,
          email: user.email || PLATFORM_CONFIG.superAdminEmail,
          full_name,
          phone,
          role: userData?.role || 'super_admin',
          mfa_enabled: userData?.mfa_enabled ?? true,
        });

        // 2. Fetch Master Agency Tenant profile
        const { data: tenantData } = await supabase
          .from('tenants')
          .select('*')
          .eq('is_master_agency', true)
          .maybeSingle();

        if (tenantData) {
          setTenantProfile({
            id: tenantData.id,
            name: tenantData.name || PLATFORM_CONFIG.masterAgencyName,
            slug: tenantData.slug || 'master-agency',
            mask_id: tenantData.mask_id || 'IBL-MA-001',
            is_master_agency: true,
            status: tenantData.lifecycle_status || 'active',
          });
        } else {
          setTenantProfile({
            id: PLATFORM_CONFIG.tenantZeroId,
            name: PLATFORM_CONFIG.masterAgencyName,
            slug: 'master-agency',
            mask_id: 'IBL-MA-001',
            is_master_agency: true,
            status: 'active',
          });
        }
      } else {
        setUserProfile(null);
        setTenantProfile(null);
      }
    } catch (err) {
      console.warn('Session Provider load notice:', err);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    loadSessionData();

    // Listen for real-time auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadSessionData();
      } else {
        setUserProfile(null);
        setTenantProfile(null);
        setIsLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <SessionContext.Provider
      value={{
        userProfile,
        tenantProfile,
        isLoading,
        refreshSession: loadSessionData,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
