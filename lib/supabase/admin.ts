import { createClient } from '@supabase/supabase-js';

// Service-Role client for backend operations, Vault secret decryption, & system webhooks
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bibbpavwvarzljqqwcef.supabase.co';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!serviceRoleKey) {
    console.warn('[Supabase Admin] SUPABASE_SERVICE_ROLE_KEY is not set. Service-role operations will fail.');
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
