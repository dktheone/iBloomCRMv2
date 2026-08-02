import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseAdmin = createAdminClient();

  // Test selecting or inserting lifecycle_status and is_locked on wa_phone_numbers
  const dummyWabaMetaId = '999999999999999';
  const dummyPhoneMetaId = '888888888888888';
  const tenantZeroId = '00000000-0000-0000-0000-000000000000';

  // 1. Ensure WABA
  const { data: wabaRow } = await supabaseAdmin.from('wabas').upsert({
    tenant_id: tenantZeroId,
    waba_id: dummyWabaMetaId,
    name: 'Debug WABA',
  }, { onConflict: 'waba_id' }).select('id').single();

  if (!wabaRow) {
    return NextResponse.json({ success: false, error: 'Could not create dummy WABA' });
  }

  // 2. Test inserting lifecycle_status and is_locked
  const { data: phoneRow, error: phoneErr } = await supabaseAdmin.from('wa_phone_numbers').upsert({
    tenant_id: tenantZeroId,
    waba_id: wabaRow.id,
    phone_number_id: dummyPhoneMetaId,
    display_phone_number: '+1 555-0199',
    lifecycle_status: 'LIVE_OPERATIONAL',
    is_locked: true,
  }, { onConflict: 'phone_number_id' }).select();

  // Cleanup
  if (!phoneErr) {
    await supabaseAdmin.from('wa_phone_numbers').delete().eq('phone_number_id', dummyPhoneMetaId);
  }
  await supabaseAdmin.from('wabas').delete().eq('waba_id', dummyWabaMetaId);

  return NextResponse.json({
    success: !phoneErr,
    phoneRow,
    phoneErr: phoneErr?.message || null,
  });
}
