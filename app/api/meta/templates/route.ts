import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditEvent } from '@/lib/security/audit-engine';
import { fetchWabaMessageTemplates, upsertWabaAssetToDb } from '@/lib/meta/graph-client';
import { apiError, apiException, apiSuccess } from '@/lib/api/response';
import { resolveMasterTenantId } from '@/lib/supabase/tenant';
import { isUuid } from '@/lib/utils/identifiers';

const ZERO_TENANT_ID = '00000000-0000-0000-0000-000000000000';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const wabaIdParam = searchParams.get('waba_id');

    let resolvedWabaUuid: string | null = null;
    let metaNumericWabaId: string | null = null;

    if (wabaIdParam) {
      if (isUuid(wabaIdParam)) {
        resolvedWabaUuid = wabaIdParam;
        const { data: wabaRow } = await supabase
          .from('wabas')
          .select('waba_uid, meta_waba_id')
          .eq('waba_uid', wabaIdParam)
          .maybeSingle();
        if (wabaRow) metaNumericWabaId = wabaRow.meta_waba_id;
      } else {
        metaNumericWabaId = wabaIdParam;
        const { data: wabaRow } = await supabase
          .from('wabas')
          .select('waba_uid, meta_waba_id')
          .eq('meta_waba_id', wabaIdParam)
          .maybeSingle();
        if (wabaRow) resolvedWabaUuid = wabaRow.waba_uid;
      }
    }

    // 1. Fetch Saved Local Database Templates
    let dbTemplates: any[] = [];
    if (resolvedWabaUuid) {
      const { data } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('waba_uid', resolvedWabaUuid);
      if (data) dbTemplates = data;
    }

    // Set of existing DB template keys (name + language)
    const existingDbKeys = new Set(
      dbTemplates.map((t) => `${t.name?.toLowerCase()}_${(t.language || 'en_US').toLowerCase()}`)
    );

    // 2. Fetch Live Discovered Meta Graph API Templates
    let rawMetaTemplates: any[] = [];
    if (metaNumericWabaId) {
      const metaRes = await fetchWabaMessageTemplates(metaNumericWabaId);
      if (metaRes.success && Array.isArray(metaRes.templates)) {
        rawMetaTemplates = metaRes.templates;
      }
    }

    // 3. Filter Discovered Templates (Meta templates NOT yet saved in DB)
    const discoveredTemplates = rawMetaTemplates.filter((metaT) => {
      const key = `${metaT.name?.toLowerCase()}_${(metaT.language || 'en_US').toLowerCase()}`;
      return !existingDbKeys.has(key);
    });

    return apiSuccess({
      waba_id: metaNumericWabaId || wabaIdParam,
      waba_uuid: resolvedWabaUuid,
      discoveredTemplates,
      databaseTemplates: dbTemplates,
    });
  } catch (err: any) {
    return apiException(err);
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const body = await request.json();

    // Check for Batch Save ("Save All Discovered Templates")
    if (Array.isArray(body.batchTemplates) && body.waba_id) {
      let targetWabaUuid = body.waba_id;

      if (!isUuid(body.waba_id)) {
        const { data: wabaRow } = await supabaseAdmin
          .from('wabas')
          .select('waba_uid, id')
          .or(`meta_waba_id.eq.${body.waba_id},waba_id.eq.${body.waba_id}`)
          .maybeSingle();

        if (wabaRow) {
          targetWabaUuid = wabaRow.waba_uid || wabaRow.id;
        } else {
          // Auto-provision parent WABA asset row
          const newWaba = await upsertWabaAssetToDb({ waba_id: body.waba_id, name: `WABA ${body.waba_id}` });
          if (newWaba) targetWabaUuid = newWaba.waba_uid || newWaba.id;
        }
      }

      // Fetch master tenant ID
      const tenantId = await resolveMasterTenantId(supabaseAdmin, 'auto', ZERO_TENANT_ID);

      for (const t of body.batchTemplates) {
        const record = {
          tenant_uid: tenantId,
          waba_uid: targetWabaUuid,
          meta_template_id: t.meta_template_id || t.id || null,
          name: t.name.trim(),
          language: t.language || 'en_US',
          category: t.category || 'MARKETING',
          status: t.status || 'APPROVED',
          components: t.components || [],
          local_staging_status: 'LOCKED',
          is_locked: true,
          updated_at: new Date().toISOString(),
        };

        await supabaseAdmin
          .from('wa_templates')
          .upsert(record, { onConflict: 'waba_uid,name,language' });
      }

      return apiSuccess({
        message: `Successfully saved batch of ${body.batchTemplates.length} templates into DB as LOCKED operational!`,
      });
    }

    if (!body.name || !body.waba_id) {
      return apiError('Missing template name or waba_id', 400);
    }

    let resolvedWabaUuid = body.waba_id;

    if (!isUuid(body.waba_id)) {
      const { data: wabaRow } = await supabaseAdmin
        .from('wabas')
        .select('waba_uid')
        .or(`meta_waba_id.eq.${body.waba_id},waba_id.eq.${body.waba_id}`)
        .maybeSingle();

      if (wabaRow) {
        resolvedWabaUuid = wabaRow.waba_uid;
      } else {
        // Auto-provision parent WABA asset row
        const newWaba = await upsertWabaAssetToDb({ waba_id: body.waba_id, name: `WABA ${body.waba_id}` });
        if (newWaba) resolvedWabaUuid = newWaba.waba_uid;
      }
    }

    // Fetch master tenant ID
    const tenantId = await resolveMasterTenantId(supabaseAdmin, 'tenant_uid', ZERO_TENANT_ID);

    // Standardize single template payload for DB persistence as LOCKED operational
    const templateRecord = {
      tenant_uid: tenantId,
      waba_uid: resolvedWabaUuid,
      meta_template_id: body.meta_template_id || body.id || null,
      name: body.name.trim(),
      language: body.language || 'en_US',
      category: body.category || 'MARKETING',
      marketing_subtype: body.marketingSubtype || 'STANDARD',
      offer_text: body.offerText || null,
      status: body.status || 'APPROVED',
      components: body.components || [
        body.header ? { type: 'HEADER', format: body.header.type, text: body.header.textValue, media_url: body.header.mediaUrl } : null,
        body.body ? { type: 'BODY', text: body.body.text, examples: body.body.examples } : null,
        body.footer ? { type: 'FOOTER', text: body.footer.text } : null,
        body.buttons ? { type: 'BUTTONS', buttons: body.buttons } : null,
      ].filter(Boolean),
      local_staging_status: 'LOCKED',
      is_locked: true,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('wa_templates')
      .upsert(templateRecord, { onConflict: 'waba_uid,name,language' })
      .select('*')
      .single();

    if (error) {
      return apiError(error.message, 400);
    }

    // Append Audit Event
    await recordAuditEvent({
      eventType: 'TEMPLATE_SAVE',
      targetId: data.id || body.name,
      details: {
        name: body.name,
        category: body.category,
        status: body.status,
        waba_id: body.waba_id,
        is_locked: true,
      },
    });

    return apiSuccess({ template: data });
  } catch (err: any) {
    return apiException(err);
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');

    if (!templateId) {
      return apiError('Missing template id', 400);
    }

    // Soft-Delete Contract: update status to ARCHIVED & unlock
    const { error } = await supabase
      .from('wa_templates')
      .update({ status: 'ARCHIVED', is_locked: false, local_staging_status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('id', templateId);

    if (error) {
      return apiError(error.message, 400);
    }

    // Append Audit Event
    await recordAuditEvent({
      eventType: 'TEMPLATE_DELETE',
      targetId: templateId,
      details: {
        action: 'SOFT_DELETE_ARCHIVED',
      },
    });

    return apiSuccess({ message: 'Template soft-deleted and archived.' });
  } catch (err: any) {
    return apiException(err);
  }
}
