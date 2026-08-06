import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { saveTemplateSchema } from '@/lib/validations/schemas';
import { logValidationFailure } from '@/lib/security/audit-logger';
import { recordAuditEvent } from '@/lib/security/audit-engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate payload with Zod Schema Guard
    const validationResult = saveTemplateSchema.safeParse(body);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
      const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';

      for (const issue of validationResult.error.issues) {
        const fieldName = issue.path.join('.') || 'payload';
        fieldErrors[fieldName] = issue.message;

        await logValidationFailure({
          formSurface: 'template_saving',
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

    const { waba_id, name, language, category, status, components } = validationResult.data;

    const supabaseAdmin = createAdminClient();

    // Query dynamic Tenant Zero ID (is_master_agency = true)
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('is_master_agency', true)
      .limit(1);

    const tenantId = tenantData && tenantData.length > 0 ? tenantData[0].id : PLATFORM_CONFIG.tenantZeroId;

    // Save template into public.wa_templates
    const { data, error } = await supabaseAdmin.from('wa_templates').upsert({
      tenant_id: tenantId,
      waba_id,
      name,
      language,
      category,
      status,
      components,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'tenant_id,waba_id,name,language' }).select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      tenantId,
      eventType: 'TEMPLATE_SAVE',
      targetId: name,
      details: { waba_id, language, category, status },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      message: `Template ${name} saved to Master Templates Group!`,
      savedTemplate: data[0],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'Template id required' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    // SOFT DELETE: Update status = 'DELETED' (NO HARD DELETE!)
    const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);
    let updateQuery = supabaseAdmin
      .from('wa_templates')
      .update({
        status: 'DELETED',
        updated_at: new Date().toISOString(),
      });

    if (isTargetUuid) {
      updateQuery = updateQuery.eq('template_uid', templateId);
    } else {
      updateQuery = updateQuery.or(`meta_template_id.eq.${templateId},name.eq.${templateId}`);
    }

    const { data, error } = await updateQuery.select();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      eventType: 'TEMPLATE_DELETE',
      targetId: templateId,
      details: { action: 'SOFT_DELETE', new_status: 'DELETED' },
      ipAddress: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, message: 'Template soft-deleted from active group.', template: data });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message }, { status: 500 });
  }
}
