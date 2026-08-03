import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireApiUser } from '@/lib/auth/guard';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meta/enrolled-assets
 * Server-authenticated endpoint to query enrolled WABAs and Phone Lines from Supabase PostgreSQL DB.
 * Uses Service Role / Admin context to bypass client-side RLS blocks while serving the active Master Agency session.
 */
export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

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

    const mappedPhones = (dbPhones || []).map((p: any) => ({
      ...p,
      phone_number_id: p.meta_phone_number_id || p.phone_number_id || p.phone_line_uid || p.id,
      meta_phone_number_id: p.meta_phone_number_id || p.phone_number_id || p.phone_line_uid || p.id,
      waba_id: p.waba_uid || p.waba_id || p.meta_waba_id,
      id: p.phone_line_uid || p.id || p.meta_phone_number_id,
    }));

    const mappedWabas = (dbWabas || []).map((w: any) => ({
      ...w,
      waba_id: w.meta_waba_id || w.waba_id || w.waba_uid || w.id,
      meta_waba_id: w.meta_waba_id || w.waba_id || w.waba_uid || w.id,
      id: w.waba_uid || w.id || w.meta_waba_id,
    }));

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      enrolledPhones: mappedPhones,
      enrolledWabas: mappedWabas,
    });
  } catch (err: any) {
    console.error('[enrolled-assets Exception]:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch enrolled assets from DB.' },
      { status: 500 }
    );
  }
}
