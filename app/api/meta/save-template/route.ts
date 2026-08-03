import { createAdminClient } from '@/lib/supabase/admin';
import { saveTemplateSchema } from '@/lib/validations/schemas';
import { recordAuditEvent } from '@/lib/security/audit-engine';
import { apiError, apiException, apiSuccess } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request';
import { validatePayload } from '@/lib/api/validate';
import { resolveMasterTenantId } from '@/lib/supabase/tenant';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate payload with Zod Schema Guard
    const validationResult = await validatePayload(saveTemplateSchema, body, request, 'template_saving');

    if (!validationResult.success) {
      return validationResult.response;
    }

    const { waba_id, name, language, category, status, components } = validationResult.data;

    const supabaseAdmin = createAdminClient();

    // Query dynamic Tenant Zero ID (is_master_agency = true)
    const tenantId = await resolveMasterTenantId(supabaseAdmin, 'id');

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
      return apiError(error.message);
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      tenantId,
      eventType: 'TEMPLATE_SAVE',
      targetId: name,
      details: { waba_id, language, category, status },
      ...getRequestMeta(request),
    });

    return apiSuccess({
      message: `Template ${name} saved to Master Templates Group!`,
      savedTemplate: data[0],
    });
  } catch (err: any) {
    return apiException(err, 'Failed to save template');
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return apiError('Template id required', 400);
    }

    const supabaseAdmin = createAdminClient();

    // SOFT DELETE: Update status = 'DELETED' (NO HARD DELETE!)
    const { data, error } = await supabaseAdmin
      .from('wa_templates')
      .update({
        status: 'DELETED',
        updated_at: new Date().toISOString(),
      })
      .eq('id', templateId)
      .select();

    if (error) {
      return apiError(error.message);
    }

    // Record Audit Event in Option-1 Log Engine
    await recordAuditEvent({
      eventType: 'TEMPLATE_DELETE',
      targetId: templateId,
      details: { action: 'SOFT_DELETE', new_status: 'DELETED' },
      ...getRequestMeta(request),
    });

    return apiSuccess({ message: 'Template soft-deleted from active group.', template: data });
  } catch (err: any) {
    return apiException(err, 'Failed to delete template');
  }
}
