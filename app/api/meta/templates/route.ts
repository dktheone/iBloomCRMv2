import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { recordAuditEvent } from '@/lib/security/audit-engine';
import { fetchWabaMessageTemplates, createWabaMessageTemplate, upsertWabaAssetToDb } from '@/lib/meta/graph-client';

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const supabaseAdmin = createAdminClient();
    const { searchParams } = new URL(request.url);
    const wabaIdParam = searchParams.get('waba_id');

    let resolvedWabaUuid: string | null = null;
    let metaNumericWabaId: string | null = null;

    if (wabaIdParam) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wabaIdParam);

      if (isUuid) {
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
    let rawDbTemplates: any[] = [];
    if (resolvedWabaUuid) {
      const { data } = await supabase
        .from('wa_templates')
        .select('*')
        .eq('waba_uid', resolvedWabaUuid);
      if (data) rawDbTemplates = data;
    }

    // 2. Fetch Live Discovered Meta Graph API Templates
    let rawMetaTemplates: any[] = [];
    if (metaNumericWabaId) {
      const metaRes = await fetchWabaMessageTemplates(metaNumericWabaId);
      if (metaRes.success && Array.isArray(metaRes.templates)) {
        rawMetaTemplates = metaRes.templates;
      }
    }

    // Build map of live Meta templates keyed by `${name}_${language}`
    const liveMetaMap = new Map<string, any>();
    rawMetaTemplates.forEach((mt) => {
      const key = `${mt.name?.toLowerCase()}_${(mt.language || 'en_US').toLowerCase()}`;
      liveMetaMap.set(key, mt);
    });

    const activeDbTemplates: any[] = [];
    const archivedOrDeletedTemplates: any[] = [];
    const dbUpdatesToPersist: any[] = [];

    // 3. Reconcile DB Records against Live Meta API
    for (const dbT of rawDbTemplates) {
      const key = `${dbT.name?.toLowerCase()}_${(dbT.language || 'en_US').toLowerCase()}`;
      const liveMeta = liveMetaMap.get(key);

      // Handle explicitly archived or previously deleted on Meta
      if (dbT.status === 'ARCHIVED' || dbT.status === 'DELETED_ON_META') {
        // If template was deleted on Meta but has now re-appeared on Meta:
        if (liveMeta) {
          const updatedT = {
            ...dbT,
            status: liveMeta.status || 'APPROVED',
            meta_template_id: liveMeta.id || dbT.meta_template_id,
            rejected_reason: liveMeta.rejected_reason || null,
            updated_at: new Date().toISOString(),
          };
          activeDbTemplates.push(updatedT);
          dbUpdatesToPersist.push({
            id: dbT.id || dbT.template_uid,
            waba_uid: dbT.waba_uid,
            name: dbT.name,
            language: dbT.language,
            status: liveMeta.status || 'APPROVED',
            meta_template_id: liveMeta.id || dbT.meta_template_id,
            rejected_reason: liveMeta.rejected_reason || null,
            updated_at: new Date().toISOString(),
          });
        } else {
          archivedOrDeletedTemplates.push(dbT);
        }
        continue;
      }

      // Handle DRAFT or PENDING_META templates (locally saved or pending Meta index)
      if (
        dbT.status === 'DRAFT' ||
        dbT.local_staging_status === 'DRAFT' ||
        dbT.local_staging_status === 'PENDING_META' ||
        !dbT.meta_template_id
      ) {
        if (liveMeta) {
          // Template has appeared on Meta! Upgrade to LOCKED & sync live status
          const liveStatus = liveMeta.status || 'APPROVED';
          const liveReason = liveMeta.rejected_reason || null;
          const updatedRecord = {
            ...dbT,
            status: liveStatus,
            meta_template_id: liveMeta.id || dbT.meta_template_id,
            rejected_reason: liveReason,
            local_staging_status: 'LOCKED',
            is_locked: true,
            updated_at: new Date().toISOString(),
          };
          activeDbTemplates.push(updatedRecord);
          dbUpdatesToPersist.push({
            id: dbT.id || dbT.template_uid,
            waba_uid: dbT.waba_uid,
            name: dbT.name,
            language: dbT.language,
            status: liveStatus,
            meta_template_id: liveMeta.id || dbT.meta_template_id,
            rejected_reason: liveReason,
            local_staging_status: 'LOCKED',
            is_locked: true,
            updated_at: new Date().toISOString(),
          });
        } else {
          // Retain local DB template with its active status (DRAFT, PENDING, APPROVED)
          activeDbTemplates.push(dbT);
        }
        continue;
      }

      // Operational Verified DB Template (LOCKED)
      if (liveMeta) {
        // Check for Status Drift or Component Updates
        const liveStatus = liveMeta.status || 'APPROVED';
        const liveReason = liveMeta.rejected_reason || null;
        let needsUpdate = false;

        const updatedRecord = { ...dbT };

        if (dbT.status !== liveStatus) {
          updatedRecord.status = liveStatus;
          updatedRecord.has_status_drift = true;
          needsUpdate = true;
        }

        if (dbT.rejected_reason !== liveReason) {
          updatedRecord.rejected_reason = liveReason;
          needsUpdate = true;
        }

        if (needsUpdate) {
          updatedRecord.updated_at = new Date().toISOString();
          dbUpdatesToPersist.push({
            id: dbT.id || dbT.template_uid,
            waba_uid: dbT.waba_uid,
            name: dbT.name,
            language: dbT.language,
            status: liveStatus,
            rejected_reason: liveReason,
            updated_at: new Date().toISOString(),
          });
        }

        activeDbTemplates.push(updatedRecord);
      } else {
        // Template was previously LOCKED on Meta but no longer exists! (Deleted on Meta)
        const orphanedRecord = {
          ...dbT,
          status: 'DELETED_ON_META',
          is_locked: false,
          local_staging_status: 'ORPHANED',
          updated_at: new Date().toISOString(),
        };
        archivedOrDeletedTemplates.push(orphanedRecord);
        dbUpdatesToPersist.push({
          id: dbT.id || dbT.template_uid,
          waba_uid: dbT.waba_uid,
          name: dbT.name,
          language: dbT.language,
          status: 'DELETED_ON_META',
          is_locked: false,
          local_staging_status: 'ORPHANED',
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 4. Async background update to Supabase DB for drift & orphaned rows
    if (dbUpdatesToPersist.length > 0) {
      (async () => {
        try {
          for (const row of dbUpdatesToPersist) {
            await supabaseAdmin
              .from('wa_templates')
              .update({
                status: row.status,
                rejected_reason: row.rejected_reason || null,
                is_locked: row.is_locked !== undefined ? row.is_locked : true,
                local_staging_status: row.local_staging_status || 'LOCKED',
                updated_at: row.updated_at,
              })
              .eq('waba_uid', row.waba_uid)
              .eq('name', row.name)
              .eq('language', row.language);
          }
        } catch (err) {
          console.error('[TemplateReconciliation DB Persist Error]:', err);
        }
      })();
    }

    // 5. Discovered Templates (Live Meta templates NOT yet saved in DB)
    const existingDbKeys = new Set(
      rawDbTemplates.map((t) => `${t.name?.toLowerCase()}_${(t.language || 'en_US').toLowerCase()}`)
    );

    const discoveredTemplates = rawMetaTemplates.filter((metaT) => {
      const key = `${metaT.name?.toLowerCase()}_${(metaT.language || 'en_US').toLowerCase()}`;
      return !existingDbKeys.has(key);
    });

    return NextResponse.json({
      success: true,
      waba_id: metaNumericWabaId || wabaIdParam,
      waba_uuid: resolvedWabaUuid,
      discoveredTemplates,
      databaseTemplates: activeDbTemplates,
      archivedOrDeletedTemplates,
      reconciledCount: dbUpdatesToPersist.length,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server Exception' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabaseAdmin = createAdminClient();
    const body = await request.json();

    // Check for Batch Save ("Save All Discovered Templates")
    if (Array.isArray(body.batchTemplates) && body.waba_id) {
      let targetWabaUuid = body.waba_id;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.waba_id);

      if (!isUuid) {
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
          if (newWaba) targetWabaUuid = newWaba.waba_uid;
        }
      }

      // Fetch master tenant ID
      const { data: tenantRow } = await supabaseAdmin
        .from('tenants')
        .select('tenant_uid')
        .eq('is_master_agency', true)
        .limit(1);
      const tenantId = tenantRow && tenantRow.length > 0 ? tenantRow[0].tenant_uid : '00000000-0000-0000-0000-000000000000';

      for (const tmpl of body.batchTemplates) {
        const record = {
          tenant_uid: tenantId,
          waba_uid: targetWabaUuid,
          meta_template_id: tmpl.id || tmpl.meta_template_id || null,
          name: tmpl.name.trim(),
          language: tmpl.language || 'en_US',
          category: tmpl.category || 'MARKETING',
          marketing_subtype: tmpl.marketingSubtype || 'STANDARD',
          offer_text: tmpl.offerText || null,
          status: tmpl.status || 'APPROVED',
          components: tmpl.components || [],
          local_staging_status: 'LOCKED',
          is_locked: true,
          updated_at: new Date().toISOString(),
        };

        await supabaseAdmin
          .from('wa_templates')
          .upsert(record, { onConflict: 'waba_uid,name,language' });
      }

      return NextResponse.json({
        success: true,
        message: `Successfully saved batch of ${body.batchTemplates.length} templates into DB as LOCKED operational!`,
      });
    }

    if (!body.name || !body.waba_id) {
      return NextResponse.json({ success: false, error: 'Missing template name or waba_id' }, { status: 400 });
    }

    let resolvedWabaUuid: string | null = null;
    let metaNumericWabaId: string | null = null;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.waba_id);

    if (isUuid) {
      resolvedWabaUuid = body.waba_id;
      const { data: wabaRow } = await supabaseAdmin
        .from('wabas')
        .select('waba_uid, meta_waba_id')
        .eq('waba_uid', body.waba_id)
        .maybeSingle();

      if (wabaRow) {
        metaNumericWabaId = wabaRow.meta_waba_id;
      }
    } else {
      metaNumericWabaId = body.waba_id;
      const { data: wabaRow } = await supabaseAdmin
        .from('wabas')
        .select('waba_uid')
        .eq('meta_waba_id', body.waba_id)
        .maybeSingle();

      if (wabaRow) {
        resolvedWabaUuid = wabaRow.waba_uid;
      } else {
        // Auto-provision parent WABA asset row in wabas table
        const newWaba = await upsertWabaAssetToDb({ waba_id: body.waba_id, name: `WABA ${body.waba_id}` });
        if (newWaba) {
          resolvedWabaUuid = newWaba.waba_uid;
        }
      }
    }

    if (!resolvedWabaUuid) {
      return NextResponse.json(
        { success: false, error: `Could not resolve or provision WABA UUID for ${body.waba_id}` },
        { status: 400 }
      );
    }

    // Fetch master tenant ID
    const { data: tenantRow } = await supabaseAdmin
      .from('tenants')
      .select('tenant_uid')
      .eq('is_master_agency', true)
      .limit(1);
    const tenantId = tenantRow && tenantRow.length > 0 ? tenantRow[0].tenant_uid : '00000000-0000-0000-0000-000000000000';

    const isDraft = body.status === 'DRAFT';
    let liveMetaId: string | null = body.meta_template_id || (body.id && !body.id.includes('-') && body.id.length > 10 ? body.id : null);
    let liveStatus = body.status || 'APPROVED';

    const isAlreadyOnMeta = Boolean(liveMetaId);

    // Dispatch Live Meta Graph API Submission ONLY for NEW non-draft templates NOT yet created on Meta
    if (!isDraft && !isAlreadyOnMeta && metaNumericWabaId) {
      const metaRes = await createWabaMessageTemplate(metaNumericWabaId, body);
      if (!metaRes.success) {
        return NextResponse.json({ success: false, error: metaRes.error }, { status: 400 });
      }
      if (metaRes.id) {
        liveMetaId = metaRes.id;
        liveStatus = metaRes.status || 'PENDING';
      }
    }

    const stagingStatus = isDraft
      ? 'DRAFT'
      : liveMetaId
      ? 'LOCKED'
      : 'PENDING_META';

    const isLocked = stagingStatus === 'LOCKED';

    // Standardize single template payload
    const templateRecord = {
      tenant_uid: tenantId,
      waba_uid: resolvedWabaUuid,
      meta_template_id: liveMetaId,
      name: body.name.trim(),
      language: body.language || 'en_US',
      category: body.category || 'MARKETING',
      marketing_subtype: body.marketingSubtype || 'STANDARD',
      offer_text: body.offerText || null,
      status: isDraft ? 'DRAFT' : liveStatus,
      components: body.components || [
        body.header ? { type: 'HEADER', format: body.header.type, text: body.header.textValue, media_url: body.header.mediaUrl } : null,
        body.body ? { type: 'BODY', text: body.body.text, examples: body.body.examples } : null,
        body.footer ? { type: 'FOOTER', text: body.footer.text } : null,
        body.buttons ? { type: 'BUTTONS', buttons: body.buttons } : null,
      ].filter(Boolean),
      local_staging_status: stagingStatus,
      is_locked: isLocked,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseAdmin
      .from('wa_templates')
      .upsert(templateRecord, { onConflict: 'waba_uid,name,language' })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
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
        is_locked: !isDraft,
      },
    });

    return NextResponse.json({
      success: true,
      template: data,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server Exception' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const templateId = searchParams.get('id');
    const permanent = searchParams.get('permanent') === 'true';

    if (!templateId) {
      return NextResponse.json({ success: false, error: 'Missing template id' }, { status: 400 });
    }

    const supabaseAdmin = createAdminClient();

    const isTargetUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(templateId);

    if (permanent) {
      // Hard delete from database
      let deleteQuery = supabaseAdmin.from('wa_templates').delete();
      if (isTargetUuid) {
        deleteQuery = deleteQuery.eq('template_uid', templateId);
      } else {
        deleteQuery = deleteQuery.or(`meta_template_id.eq.${templateId},name.eq.${templateId}`);
      }

      const { error } = await deleteQuery;

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 400 });
      }

      await recordAuditEvent({
        eventType: 'TEMPLATE_DELETE',
        targetId: templateId,
        details: { action: 'HARD_PERMANENT_DELETE' },
      });

      return NextResponse.json({ success: true, message: 'Template permanently deleted from CRM' });
    }

    // Soft-Delete Contract: update status to ARCHIVED & unlock
    let updateQuery = supabaseAdmin
      .from('wa_templates')
      .update({ status: 'ARCHIVED', is_locked: false, local_staging_status: 'ARCHIVED', updated_at: new Date().toISOString() });

    if (isTargetUuid) {
      updateQuery = updateQuery.eq('template_uid', templateId);
    } else {
      updateQuery = updateQuery.or(`meta_template_id.eq.${templateId},name.eq.${templateId}`);
    }

    const { error } = await updateQuery;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }

    // Append Audit Event
    await recordAuditEvent({
      eventType: 'TEMPLATE_DELETE',
      targetId: templateId,
      details: { action: 'SOFT_DELETE_ARCHIVED' },
    });

    return NextResponse.json({
      success: true,
      message: 'Template marked as ARCHIVED in DB',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server Exception' }, { status: 500 });
  }
}
