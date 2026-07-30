import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseAdmin = createAdminClient();

  const dummyWabaMetaId = '999999999999999';
  const dummyPhoneMetaId = '888888888888888';
  const tenantZeroId = '00000000-0000-0000-0000-000000000000';

  // Step 1: Upsert into wabas to get UUID id
  const { data: wabaRow, error: wabaErr } = await supabaseAdmin
    .from('wabas')
    .upsert({
      tenant_id: tenantZeroId,
      waba_id: dummyWabaMetaId,
      name: 'Debug WABA',
      currency: 'USD',
      timezone: 'UTC',
      message_template_namespace: 'ibloom_template_ns',
      business_id: '1304712777970662',
      business_verification_status: 'VERIFIED',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'waba_id' })
    .select('id, waba_id')
    .single();

  if (wabaErr || !wabaRow) {
    return NextResponse.json({ success: false, step: 'waba_upsert', wabaErr: wabaErr?.message });
  }

  // Step 2: Upsert into wa_phone_numbers passing wabaRow.id (UUID)
  const { data: phoneRow, error: phoneErr } = await supabaseAdmin
    .from('wa_phone_numbers')
    .upsert({
      tenant_id: tenantZeroId,
      waba_id: wabaRow.id, // <--- Passing UUID!
      phone_number_id: dummyPhoneMetaId,
      display_phone_number: '+1 555-0199',
      verified_name: 'Debug Line',
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED',
      messaging_limit_tier: 'TIER_1K',
      name_status: 'APPROVED',
      is_test_number: false,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone_number_id' })
    .select();

  // Cleanup test rows
  if (!phoneErr) {
    await supabaseAdmin.from('wa_phone_numbers').delete().eq('phone_number_id', dummyPhoneMetaId);
  }
  await supabaseAdmin.from('wabas').delete().eq('waba_id', dummyWabaMetaId);

  return NextResponse.json({
    success: !phoneErr,
    wabaRow,
    phoneRow,
    phoneErr: phoneErr?.message || null,
  });
}
