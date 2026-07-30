import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { enrollPhoneSchema } from '@/lib/validations/schemas';
import { logValidationFailure } from '@/lib/security/audit-logger';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate payload with Zod Schema Guard
    const validationResult = enrollPhoneSchema.safeParse(body);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
      const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';

      for (const issue of validationResult.error.issues) {
        const fieldName = issue.path.join('.') || 'payload';
        fieldErrors[fieldName] = issue.message;

        await logValidationFailure({
          formSurface: 'asset_enrollment',
          rejectedField: fieldName,
          failureReason: issue.message,
          ipAddress,
          userAgent,
        });
      }

      return NextResponse.json(
        { success: false, error: 'Validation failed.', fieldErrors },
        { status: 400 }
      );
    }

    const {
      waba_id,
      phone_number_id,
      id,
      display_phone_number,
      verified_name,
      quality_rating,
      code_verification_status,
      messaging_limit_tier,
      name_status,
      is_test_number,
    } = validationResult.data;

    const targetPhoneMetaId = phone_number_id || id;
    if (!targetPhoneMetaId || !waba_id) {
      return NextResponse.json({ success: false, error: 'waba_id and phone_number_id are required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // 2. Query or Ensure Tenant Zero ID (is_master_agency = true)
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('is_master_agency', true)
      .limit(1);

    let tenantId = tenantData && tenantData.length > 0 ? tenantData[0].id : PLATFORM_CONFIG.tenantZeroId;

    // Ensure Tenant Zero exists in `tenants` table to satisfy foreign key constraint
    const { error: tenantErr } = await supabaseAdmin.from('tenants').upsert({
      id: tenantId,
      name: PLATFORM_CONFIG.masterAgencyName,
      slug: PLATFORM_CONFIG.masterAgencySlug,
      mask_id: 'TENANT-ZERO',
      status: 'active',
      is_master_agency: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

    if (tenantErr) {
      console.warn('[Enroll Phone Tenant Upsert Warning]:', tenantErr.message);
    }

    // 3. Upsert Parent WABA into public.wabas to resolve its UUID `id`
    const { data: wabaRow, error: wabaUpsertErr } = await supabaseAdmin
      .from('wabas')
      .upsert({
        tenant_id: tenantId,
        waba_id: waba_id,
        name: `WABA ${waba_id}`,
        currency: 'INR',
        timezone: 'UTC',
        account_review_status: 'APPROVED',
        message_template_namespace: 'ibloom_template_ns',
        business_id: PLATFORM_CONFIG.metaBusinessPortfolioId,
        business_verification_status: 'VERIFIED',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'waba_id' })
      .select('id, waba_id')
      .single();

    if (wabaUpsertErr || !wabaRow) {
      console.error('[Enroll Phone WABA Upsert Error]:', wabaUpsertErr?.message);
      return NextResponse.json({ success: false, error: wabaUpsertErr?.message || 'Failed to resolve parent WABA UUID.' }, { status: 500 });
    }

    // 4. Enroll phone line into public.wa_phone_numbers passing UUID wabaRow.id
    const { data, error } = await supabaseAdmin.from('wa_phone_numbers').upsert({
      tenant_id: tenantId,
      waba_id: wabaRow.id, // <--- Passes UUID wabaRow.id to satisfy foreign key constraint!
      phone_number_id: targetPhoneMetaId,
      display_phone_number: display_phone_number || targetPhoneMetaId,
      verified_name: verified_name || 'iBloom WhatsApp Line',
      quality_rating: quality_rating || 'GREEN',
      code_verification_status: code_verification_status || 'VERIFIED',
      messaging_limit_tier: messaging_limit_tier || 'TIER_1K',
      name_status: name_status || 'APPROVED',
      is_test_number: Boolean(is_test_number),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone_number_id' }).select();

    if (error) {
      console.error('[Enroll Phone Upsert Error]:', error.message);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `Phone line ${display_phone_number || targetPhoneMetaId} explicitly enrolled into Master Agency!`,
      enrolledLine: data ? data[0] : null,
    });
  } catch (err: any) {
    console.error('[Enroll Phone Exception]:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Error enrolling phone line' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumberId = searchParams.get('phone_number_id');

    if (!phoneNumberId) {
      return NextResponse.json({ success: false, error: 'phone_number_id required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();
    const { error } = await supabaseAdmin
      .from('wa_phone_numbers')
      .delete()
      .eq('phone_number_id', phoneNumberId);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: `Phone line ${phoneNumberId} unenrolled.` });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
