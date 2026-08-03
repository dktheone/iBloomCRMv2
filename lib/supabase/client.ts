import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';

export function createClient() {
  const supabaseUrl = getSupabaseUrl();
  let anonKey = getSupabaseAnonKey();

  // Clean up any trailing whitespace or accidental quotes
  anonKey = anonKey.trim().replace(/^["']|["']$/g, '');

  if (!anonKey || anonKey.endsWith('.placeholder')) {
    console.warn(
      '[Supabase Client Warning]: NEXT_PUBLIC_SUPABASE_ANON_KEY is missing or contains .placeholder! ' +
      'Next.js caches client-side NEXT_PUBLIC_ variables. Please restart your dev server (Ctrl+C then npx next dev -p 3000) after updating .env.local.'
    );
  }

  return createBrowserClient(supabaseUrl, anonKey);
}
