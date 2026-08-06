// app/api/admin/webhooks/events/route.ts
// Superadmin API endpoint for Webhook Event Logs & Replay Execution.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { routeMetaWebhook } from '@/lib/webhooks/providers/meta/router';
import { updateWebhookEventStatus } from '@/lib/webhooks/core/dead-letter';
import { WebhookHandlerResult } from '@/lib/webhooks/core/types';

/**
 * GET — Fetch filtered, paginated webhook logs.
 */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const provider = searchParams.get('provider') || 'meta';
  const status = searchParams.get('status') || 'all';
  const search = searchParams.get('search') || '';
  const limit = parseInt(searchParams.get('limit') || '50');

  const adminClient = createAdminClient();
  let query = adminClient
    .from('webhook_events')
    .select('*')
    .eq('provider', provider)
    .order('received_at', { ascending: false })
    .limit(limit);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  if (search) {
    query = query.or(`external_event_id.ilike.%${search}%,event_type.ilike.%${search}%`);
  }

  const { data: events, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ events: events || [] });
}

/**
 * POST — Replay a stored webhook event payload by event_uid.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { event_uid } = await req.json();

    if (!event_uid) {
      return NextResponse.json({ error: 'event_uid is required' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: record, error: fetchErr } = await adminClient
      .from('webhook_events')
      .select('*')
      .eq('event_uid', event_uid)
      .single();

    if (fetchErr || !record) {
      return NextResponse.json({ error: 'Webhook event record not found' }, { status: 404 });
    }

    let results: WebhookHandlerResult[] = [];
    if (record.provider === 'meta') {
      results = await routeMetaWebhook(record.payload);
      const firstRes = results[0];

      await updateWebhookEventStatus(
        record.event_uid,
        firstRes?.status || 'processed',
        firstRes?.error,
        firstRes?.tenant_uid,
        firstRes?.phone_line_uid
      );
    }

    return NextResponse.json({ success: true, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Replay failed' }, { status: 500 });
  }
}
