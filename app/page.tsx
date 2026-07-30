import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export default async function RootPage() {
  const supabaseAdmin = createAdminClient();
  const supabase = await createClient();

  // 1. Check if Master Agency is initialized in Supabase
  const { data: tenantData } = await supabaseAdmin
    .from('tenants')
    .select('id, is_master_agency')
    .eq('is_master_agency', true)
    .limit(1);

  const isInitialized = Boolean(tenantData && tenantData.length > 0);

  if (!isInitialized) {
    redirect('/setup');
  }

  // 2. Check active Supabase GoTrue Auth session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect('/login');
  }

  redirect('/dashboard');
}
