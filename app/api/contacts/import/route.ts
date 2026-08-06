// app/api/contacts/import/route.ts
// CSV/XLSX bulk import (D-032 consent gating, D-034 shared upsert path)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parseSpreadsheet, suggestMapping } from '@/lib/contacts/csv-parser';
import {
  validateImportRows,
  findDuplicatePhones,
  type RowError,
} from '@/lib/contacts/validation';

export const maxDuration = 60;

const MAX_ROWS = 5000;
const BATCH_SIZE = 200;

type ConflictStrategy = 'update' | 'skip' | 'fail';

async function resolveTenant(supabase: any) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Unauthorized', status: 401 as const };

  const { data: userTenant } = await supabase
    .from('user_tenants')
    .select('tenant_uid')
    .eq('user_uid', user.id)
    .single();

  if (!userTenant) return { error: 'No tenant', status: 403 as const };

  return { user, tenantUid: userTenant.tenant_uid as string };
}

/**
 * POST /api/contacts/import
 *
 * Two modes, selected by the `mode` form field:
 *   - "preview" (default): parse, suggest a column mapping, return the first
 *     rows so the UI can render the mapping step. Nothing is written.
 *   - "commit": apply the supplied mapping, validate every row, and upsert.
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const auth = await resolveTenant(supabase);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { user, tenantUid } = auth;

    const form = await req.formData();
    const file = form.get('file');
    const mode = (form.get('mode') as string) || 'preview';

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    let sheet;
    try {
      sheet = await parseSpreadsheet(file.name, await file.arrayBuffer());
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    if (sheet.headers.length === 0) {
      return NextResponse.json({ error: 'File is empty' }, { status: 400 });
    }

    if (sheet.rows.length > MAX_ROWS) {
      return NextResponse.json(
        {
          error: `File has ${sheet.rows.length} rows; the limit is ${MAX_ROWS}. Split the file and import in parts.`,
        },
        { status: 413 }
      );
    }

    // ── Preview mode: no writes ────────────────────────────────────────
    if (mode === 'preview') {
      return NextResponse.json({
        headers: sheet.headers,
        rowCount: sheet.rows.length,
        suggestedMapping: suggestMapping(sheet.headers),
        sample: sheet.rows.slice(0, 5),
      });
    }

    // ── Commit mode ────────────────────────────────────────────────────
    const mappingRaw = form.get('mapping');
    if (typeof mappingRaw !== 'string') {
      return NextResponse.json(
        { error: 'mapping is required when mode=commit' },
        { status: 400 }
      );
    }

    // { "<headerIndex>": "<contactFieldKey>" }
    const mapping: Record<string, string> = JSON.parse(mappingRaw);
    const conflictStrategy = ((form.get('conflictStrategy') as string) ||
      'update') as ConflictStrategy;

    if (!['update', 'skip', 'fail'].includes(conflictStrategy)) {
      return NextResponse.json(
        { error: 'conflictStrategy must be update, skip, or fail' },
        { status: 400 }
      );
    }

    if (!Object.values(mapping).includes('waPhone')) {
      return NextResponse.json(
        { error: 'A column must be mapped to WhatsApp Phone' },
        { status: 400 }
      );
    }

    // Apply the mapping: header index → field key
    const records = sheet.rows.map((cells) => {
      const record: Record<string, string> = {};
      for (const [idxStr, fieldKey] of Object.entries(mapping)) {
        if (!fieldKey) continue;
        record[fieldKey] = (cells[Number(idxStr)] ?? '').trim();
      }
      return record;
    });

    const { valid, errors } = validateImportRows(records);
    const duplicates = findDuplicatePhones(valid);

    if (valid.length === 0) {
      return NextResponse.json(
        { error: 'No valid rows to import', errors },
        { status: 422 }
      );
    }

    // Which of these phones already exist? Needed for skip/fail strategies and
    // for an honest created-vs-updated count under "update".
    const phones = [...new Set(valid.map((v) => v.data.waPhone))];
    const existingPhones = new Set<string>();

    for (let i = 0; i < phones.length; i += 500) {
      const { data: found, error: lookupError } = await supabase
        .from('contacts')
        .select('wa_phone')
        .eq('tenant_uid', tenantUid)
        .in('wa_phone', phones.slice(i, i + 500));

      if (lookupError) throw lookupError;
      for (const row of found ?? []) existingPhones.add(row.wa_phone);
    }

    if (conflictStrategy === 'fail' && existingPhones.size > 0) {
      return NextResponse.json(
        {
          error: `${existingPhones.size} contact(s) already exist. Choose "update" or "skip" to proceed.`,
          conflicts: [...existingPhones],
          errors,
        },
        { status: 409 }
      );
    }

    const toWrite =
      conflictStrategy === 'skip'
        ? valid.filter((v) => !existingPhones.has(v.data.waPhone))
        : valid;

    const skippedExisting = valid.length - toWrite.length;
    const nowIso = new Date().toISOString();

    // D-032: import never sets opted_out (terminal, needs explicit confirmation)
    // and only sets opted_in when the row names a consent source. Everything
    // else lands as 'unknown'. Consent-source rows also get opt_in_at so the
    // sticky-opt-out trigger has provenance to record.
    const payloads = toWrite.map(({ data }) => {
      const base: Record<string, unknown> = {
        tenant_uid: tenantUid,
        wa_phone: data.waPhone,
        name: data.name,
        email: data.email,
        preferred_language: data.preferredLanguage,
        country_code: data.countryCode,
        timezone: data.timezone,
        date_of_birth: data.dateOfBirth,
        notes: data.notes,
        created_by_uid: user.id,
        last_activity_at: nowIso,
      };

      if (data.optInSource) {
        base.opt_in_status = 'opted_in';
        base.opt_in_source = data.optInSource;
        base.opt_in_at = nowIso;
      }

      return base;
    });

    const writeErrors: RowError[] = [];
    let written = 0;

    for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
      const batch = payloads.slice(i, i + BATCH_SIZE);
      const { data: inserted, error } = await supabase
        .from('contacts')
        .upsert(batch, { onConflict: 'tenant_uid,wa_phone', ignoreDuplicates: false })
        .select('contact_uid');

      if (error) {
        // Record the batch as failed and keep going — a bad batch shouldn't
        // discard the batches that already landed.
        writeErrors.push({
          row: toWrite[i].row,
          field: 'batch',
          message: `Rows ${toWrite[i].row}–${toWrite[Math.min(i + BATCH_SIZE, toWrite.length) - 1].row}: ${error.message}`,
        });
        continue;
      }

      written += inserted?.length ?? batch.length;
    }

    const createdCount = toWrite.filter(
      (v) => !existingPhones.has(v.data.waPhone)
    ).length;

    return NextResponse.json({
      imported: written,
      created: Math.min(createdCount, written),
      updated: Math.max(written - createdCount, 0),
      skippedExisting,
      invalidRows: errors.length,
      errors: [...errors, ...writeErrors].slice(0, 200),
      duplicatePhones: duplicates,
      truncatedErrors: errors.length + writeErrors.length > 200,
    });
  } catch (error: any) {
    console.error('Contact import error:', error);
    return NextResponse.json(
      { error: error.message || 'Import failed' },
      { status: 500 }
    );
  }
}
