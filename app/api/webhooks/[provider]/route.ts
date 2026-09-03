// app/api/webhooks/[provider]/route.ts
// Dynamic Multi-Provider Webhook Endpoint Handler (Meta, Google, Stripe, Custom).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logWebhookEvent, updateWebhookEventStatus } from '@/lib/webhooks/core/dead-letter';
import { verifyMetaHandshakeToken, verifyMetaSignature } from '@/lib/webhooks/core/verify-signature';
import { routeMetaWebhook } from '@/lib/webhooks/providers/meta/router';
import { WebhookProvider } from '@/lib/webhooks/core/types';
import { PLATFORM_CONFIG } from '@/config/platform.config';

import { logWebhookToFile } from '@/lib/webhooks/core/file-logger';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/**
 * GET — Provider Verification Handshake (Meta, etc.)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  const providerKey = provider.toLowerCase() as WebhookProvider;
  const searchParams = req.nextUrl.searchParams;

  // Log incoming GET handshake to local JSON file
  logWebhookToFile({
    provider: providerKey,
    sub_provider: 'whatsapp',
    event_type: 'handshake_get',
    headers: Object.fromEntries(req.headers.entries()),
    query_params: Object.fromEntries(searchParams.entries()),
    method: 'GET',
    payload: {
      mode: searchParams.get('hub.mode'),
      challenge: searchParams.get('hub.challenge'),
      verify_token: searchParams.get('hub.verify_token'),
    },
    status: 'received',
  });

  // 1. Meta Handshake (hub.mode=subscribe, hub.verify_token, hub.challenge)
  if (providerKey === 'meta') {
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe') {
      let expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN || 'ibloom_webhook_secret_verify_2026';

      try {
        const supabase = createAdminClient();
        const { data: config } = await supabase
          .from('provider_webhook_configs')
          .select('verify_token, is_enabled')
          .eq('provider', 'meta')
          .maybeSingle();

        if (config?.verify_token) {
          expectedToken = config.verify_token;
        }
      } catch (err) {
        console.warn('[Webhook Handshake] Supabase query failed, falling back to env verify token:', err);
      }

      if (verifyMetaHandshakeToken(token, expectedToken)) {
        console.log('[Meta Webhook GET] Verification handshake SUCCESS!');
        // Return raw challenge text with HTTP 200
        return new NextResponse(challenge || '', {
          status: 200,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
      console.warn('[Meta Webhook GET] Verification token mismatch:', token);
    }
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

/**
 * POST — Incoming Webhook Payload Receiver (Filesystem JSON Logging + Non-blocking DB)
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  const providerKey = provider.toLowerCase() as WebhookProvider;

  // STEP 0: Read raw body string FIRST before any validation
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-hub-signature-256');

  // STEP 0.1: Safe JSON parsing (handles non-JSON raw text gracefully)
  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    payload = { _raw_text: rawBody, _error: 'Unparseable non-JSON text payload' };
  }

  // STEP 0.2: Extract Event Type & External WAMID safely
  const eventType =
    payload.entry?.[0]?.changes?.[0]?.field ||
    payload.field ||
    (payload.object ? `object_${payload.object}` : 'raw_unfiltered');

  const externalEventId =
    payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id ||
    payload.value?.messages?.[0]?.id ||
    payload.entry?.[0]?.changes?.[0]?.value?.statuses?.[0]?.id ||
    payload.value?.statuses?.[0]?.id ||
    null;

  const subProvider = providerKey === 'meta' ? 'whatsapp' : 'generic';

  // STEP 0.3: PRIMARY LOGGING — WRITE DIRECTLY TO LOCAL JSON FILE FIRST
  const fileLog = logWebhookToFile({
    provider: providerKey,
    sub_provider: subProvider,
    event_type: eventType,
    external_event_id: externalEventId,
    headers: Object.fromEntries(req.headers.entries()),
    method: 'POST',
    payload,
    raw_body: rawBody,
    status: 'received',
  });

  console.log(`[Webhook Inbound Captured] ID: ${fileLog.event_uid} | Event: ${eventType} | Provider: ${providerKey}`);

  // Non-blocking optional Supabase DB write
  let loggedRecord: any = null;
  try {
    loggedRecord = await logWebhookEvent({
      provider: providerKey,
      sub_provider: subProvider,
      event_type: eventType,
      external_event_id: externalEventId,
      payload,
      status: 'received',
    });
  } catch (dbErr) {
    console.warn('[Webhook Supabase DB Skipped/Failed]', dbErr);
  }

  // 1. Check provider configuration from DB (safe fallback if DB unreachable)
  let isEnabled = true;
  let secretTokenFromDb = '';
  try {
    const supabase = createAdminClient();
    const { data: config } = await supabase
      .from('provider_webhook_configs')
      .select('is_enabled, secret_token, verify_token')
      .eq('provider', providerKey)
      .maybeSingle();

    if (config) {
      isEnabled = config.is_enabled;
      secretTokenFromDb = config.secret_token;
    }
  } catch (err) {
    console.warn('[Webhook Config Fetch Failed] Defaulting to enabled:', err);
  }

  if (!isEnabled) {
    if (loggedRecord?.event_uid) {
      await updateWebhookEventStatus(
        loggedRecord.event_uid,
        'disabled_provider',
        `Webhook endpoint for provider '${providerKey}' is currently disabled in Superadmin settings.`
      );
    }
    return NextResponse.json({ status: 'disabled', message: 'Webhook endpoint disabled' }, { status: 200 });
  }

  // 2. Verify HMAC Signature
  let appSecret =
    process.env.META_APP_SECRET ||
    process.env.NEXT_PUBLIC_META_APP_SECRET ||
    PLATFORM_CONFIG.metaAppSecret ||
    '';

  if (secretTokenFromDb && secretTokenFromDb !== 'meta_app_secret_placeholder') {
    appSecret = secretTokenFromDb;
  }

  if (providerKey === 'meta' && appSecret) {
    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    if (!isValid) {
      console.warn('[Meta Webhook POST] HMAC Signature verification failed!');
      if (loggedRecord?.event_uid) {
        try {
          await updateWebhookEventStatus(
            loggedRecord.event_uid,
            'dead_letter',
            'X-Hub-Signature-256 HMAC verification failed'
          );
        } catch {}
      }
      // Return 401 but request was already successfully captured to local JSON file!
      return NextResponse.json({ error: 'Invalid signature', logged_file_id: fileLog.event_uid }, { status: 401 });
    }
  }

  // 3. Asynchronous Processing Execution & Status Update
  const executionPromise = (async () => {
    if (providerKey === 'meta') {
      try {
        const results = await routeMetaWebhook(payload);
        const firstRes = results[0];

        if (loggedRecord?.event_uid) {
          await updateWebhookEventStatus(
            loggedRecord.event_uid,
            firstRes?.status || 'processed',
            firstRes?.error,
            firstRes?.tenant_uid,
            firstRes?.phone_line_uid
          );
        }
      } catch (procErr) {
        console.error('[Webhook Async Routing Error]', procErr);
      }
    }
  })();

  // Wait briefly or run in background
  try {
    await Promise.race([
      executionPromise,
      new Promise((res) => setTimeout(res, 500)), // 500ms max sync wait
    ]);
  } catch (e) {
    console.error('[Webhook Execution Error]', e);
  }

  return NextResponse.json({ status: 'ok', received: true, event_uid: fileLog.event_uid }, { status: 200 });
}
