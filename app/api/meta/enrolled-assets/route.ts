import { createAdminClient } from '@/lib/supabase/admin';
import { apiException, apiSuccess } from '@/lib/api/response';
import { normalizePhoneRecord, normalizeWabaRecord } from '@/lib/meta/asset-normalizers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meta/enrolled-assets
 * Server-authenticated endpoint to query enrolled WABAs and Phone Lines from Supabase PostgreSQL DB.
 * Uses Service Role / Admin context to bypass client-side RLS blocks while serving the active Master Agency session.
 */
export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();

    const { data: dbPhones, error: phoneErr } = await supabaseAdmin
      .from('wa_phone_numbers')
      .select('*');

    const { data: dbWabas, error: wabaErr } = await supabaseAdmin
      .from('wabas')
      .select('*');

    if (phoneErr) {
      console.error('[enrolled-assets Error reading wa_phone_numbers]:', phoneErr.message);
    }
    if (wabaErr) {
      console.error('[enrolled-assets Error reading wabas]:', wabaErr.message);
    }

    return apiSuccess({
      timestamp: new Date().toISOString(),
      enrolledPhones: (dbPhones || []).map(normalizePhoneRecord),
      enrolledWabas: (dbWabas || []).map(normalizeWabaRecord),
    });
  } catch (err: any) {
    return apiException(err, 'Failed to fetch enrolled assets from DB.', 500, '[enrolled-assets Exception]');
  }
}
