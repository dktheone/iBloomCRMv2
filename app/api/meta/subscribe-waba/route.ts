// app/api/meta/subscribe-waba/route.ts
// Helper endpoint to subscribe a WABA to live webhooks via Meta Graph API (POST /{meta_waba_id}/subscribed_apps).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';

const GRAPH_API_BASE = `https://graph.facebook.com/${PLATFORM_CONFIG.metaApiVersion}`;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { waba_uid, meta_waba_id } = await req.json();

    const adminClient = createAdminClient();
    let targetMetaWabaId = meta_waba_id;

    if (!targetMetaWabaId && waba_uid) {
      const { data: wabaRow } = await adminClient
        .from('wabas')
        .select('meta_waba_id')
        .eq('waba_uid', waba_uid)
        .maybeSingle();

      if (wabaRow) targetMetaWabaId = wabaRow.meta_waba_id;
    }

    if (!targetMetaWabaId) {
      // Fallback: fetch any active WABA
      const { data: wabaRow } = await adminClient
        .from('wabas')
        .select('meta_waba_id')
        .limit(1)
        .maybeSingle();

      if (wabaRow) targetMetaWabaId = wabaRow.meta_waba_id;
    }

    if (!targetMetaWabaId) {
      return NextResponse.json({ error: 'No WABA found to subscribe' }, { status: 400 });
    }

    const accessToken = PLATFORM_CONFIG.systemUserAccessToken;
    if (!accessToken) {
      return NextResponse.json({ error: 'System User Access Token is missing' }, { status: 400 });
    }

    // Call Meta Graph API: POST /{meta_waba_id}/subscribed_apps
    const graphUrl = `${GRAPH_API_BASE}/${targetMetaWabaId}/subscribed_apps`;
    const metaRes = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const metaData = await metaRes.json();

    if (!metaRes.ok || metaData.error) {
      console.error('[Meta WABA Subscribed Apps Error]', metaData);
      return NextResponse.json({
        success: false,
        error: metaData.error?.message || 'Meta Graph API WABA subscription failed',
        meta_response: metaData,
      }, { status: metaRes.status || 500 });
    }

    return NextResponse.json({
      success: true,
      meta_waba_id: targetMetaWabaId,
      message: `Successfully subscribed WABA ${targetMetaWabaId} to Meta App webhooks`,
      meta_response: metaData,
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'WABA subscription failed',
    }, { status: 500 });
  }
}
