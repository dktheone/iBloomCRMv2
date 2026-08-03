import { createAdminClient } from '@/lib/supabase/admin';
import { enrollPhoneSchema } from '@/lib/validations/schemas';
import { upsertPhoneAssetToDb, upsertWabaAssetToDb } from '@/lib/meta/graph-client';
import { recordAuditEvent } from '@/lib/security/audit-engine';
import { apiError, apiException, apiSuccess } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request';
import { validatePayload } from '@/lib/api/validate';
import { resolveMasterTenantId } from '@/lib/supabase/tenant';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate payload with Zod Schema Guard
    const validationResult = await validatePayload(enrollPhoneSchema, body, request, 'asset_enrollment');

    if (!validationResult.success) {
      return validationResult.response;
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
      waba_name,
      waba_currency,
      waba_timezone_id,
      waba_message_template_namespace,
      waba_account_review_status,
    } = validationResult.data;

    const targetPhoneMetaId = phone_number_id || id;
    if (!targetPhoneMetaId || !waba_id) {
      return apiError('waba_id and phone_number_id are required', 400);
    }

    // 4 Explicit Lifecycle Actions: PROVISION | LOCK_AND_ACTIVATE | RE_ACTIVATE | DETACH
    const action = body.action || 'LOCK_AND_ACTIVATE';
    const supabaseAdmin = createAdminClient();

    // 2. Query or Ensure Tenant Zero ID (is_master_agency = true)
    const tenantId = await resolveMasterTenantId(supabaseAdmin, 'id');

    const requestMeta = getRequestMeta(request);

    // Handle DETACH action with SOFT DELETE (No Hard Deletes!)
    if (action === 'DETACH') {
      const { data: updatedPhone, error: updateErr } = await supabaseAdmin
        .from('wa_phone_numbers')
        .update({
          lifecycle_status: 'UNLOCKED_STANDBY',
          is_locked: false,
          updated_at: new Date().toISOString(),
        })
        .eq('phone_number_id', targetPhoneMetaId)
        .select()
        .single();

      if (updateErr) {
        return apiError(updateErr.message);
      }

      // Record Audit Event in Option-1 Log Engine
      await recordAuditEvent({
        tenantId,
        eventType: 'ASSET_DETACH',
        targetId: targetPhoneMetaId,
        details: {
          display_phone_number: display_phone_number || targetPhoneMetaId,
          verified_name: verified_name || 'iBloom WhatsApp Line',
          previous_status: updatedPhone?.lifecycle_status,
          new_status: 'UNLOCKED_STANDBY',
        },
        ...requestMeta,
      });

      return apiSuccess({
        message: `Line ${display_phone_number || targetPhoneMetaId} soft-detached and transitioned to UNLOCKED_STANDBY in DB.`,
        enrolledLine: updatedPhone,
      });
    }

    let targetLifecycleStatus = 'LIVE_OPERATIONAL';
    let auditEventType = 'ASSET_LOCK';

    if (action === 'PROVISION') {
      targetLifecycleStatus = 'PROVISIONED';
      auditEventType = 'ASSET_PROVISION';
    } else if (action === 'LOCK_AND_ACTIVATE') {
      targetLifecycleStatus = 'LIVE_OPERATIONAL';
      auditEventType = 'ASSET_LOCK';
    } else if (action === 'RE_ACTIVATE') {
      targetLifecycleStatus = 'LIVE_OPERATIONAL';
      auditEventType = 'ASSET_RE_ACTIVATED';
    }

    // 3. Upsert Parent WABA into public.wabas via standardized helper preserving exact Meta metadata
    const wabaRow = await upsertWabaAssetToDb({
      waba_id,
      name: waba_name || body.waba_name || `WABA ${waba_id}`,
      currency: waba_currency || body.waba_currency || 'INR',
      timezone_id: waba_timezone_id || body.waba_timezone_id || '71',
      account_review_status: waba_account_review_status || body.waba_account_review_status || 'APPROVED',
      message_template_namespace: waba_message_template_namespace || body.waba_message_template_namespace || 'ibloom_template_ns',
    }, tenantId);

    if (!wabaRow) {
      return apiError('Failed to resolve parent WABA record in DB.');
    }

    // 4. Enroll phone line using Lifecycle helper
    const enrolledResult = await upsertPhoneAssetToDb({
      id: targetPhoneMetaId,
      phone_number_id: targetPhoneMetaId,
      waba_id: wabaRow.id, // UUID
      display_phone_number: display_phone_number || targetPhoneMetaId,
      verified_name: verified_name || 'iBloom WhatsApp Line',
      quality_rating: quality_rating || 'GREEN',
      code_verification_status: code_verification_status || 'VERIFIED',
      messaging_limit_tier: messaging_limit_tier || 'TIER_1K',
      name_status: name_status || 'APPROVED',
      is_test_number: Boolean(is_test_number),
      target_lifecycle_status: targetLifecycleStatus as any,
    }, tenantId);

    if (!enrolledResult) {
      return apiError('Failed to save phone line asset into database.');
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      tenantId,
      eventType: auditEventType,
      targetId: targetPhoneMetaId,
      details: {
        display_phone_number: display_phone_number || targetPhoneMetaId,
        verified_name: verified_name || 'iBloom WhatsApp Line',
        lifecycle_status: targetLifecycleStatus,
        waba_id,
      },
      ...requestMeta,
    });

    return apiSuccess({
      message: `Phone line ${display_phone_number || targetPhoneMetaId} transitioned to ${targetLifecycleStatus}!`,
      enrolledLine: enrolledResult,
    });
  } catch (err: any) {
    return apiException(err, 'Error enrolling phone line', 500, '[Enroll Phone Exception]');
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const phoneNumberId = searchParams.get('phone_number_id');

    if (!phoneNumberId) {
      return apiError('phone_number_id required', 400);
    }

    const supabaseAdmin = createAdminClient();
    
    // SOFT DELETE: Update lifecycle_status = 'UNLOCKED_STANDBY', is_locked = false (NO HARD DELETE!)
    const { data: updatedLine, error } = await supabaseAdmin
      .from('wa_phone_numbers')
      .update({
        lifecycle_status: 'UNLOCKED_STANDBY',
        is_locked: false,
        updated_at: new Date().toISOString(),
      })
      .eq('phone_number_id', phoneNumberId)
      .select();

    if (error) {
      return apiError(error.message);
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      eventType: 'ASSET_DETACH',
      targetId: phoneNumberId,
      details: { action: 'DELETE_REQUEST', new_status: 'UNLOCKED_STANDBY' },
      ...getRequestMeta(request),
    });

    return apiSuccess({ message: `Phone line ${phoneNumberId} soft-detached.`, line: updatedLine });
  } catch (err: any) {
    return apiException(err, 'Error detaching phone line');
  }
}
