// app/api/webhooks/[provider]/route.ts
// Dynamic Multi-Provider Webhook Endpoint Handler (Meta, Google, Stripe, Custom).

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logWebhookEvent, updateWebhookEventStatus } from '@/lib/webhooks/core/dead-letter';
import { verifyMetaHandshakeToken, verifyMetaSignature } from '@/lib/webhooks/core/verify-signature';
import { routeMetaWebhook } from '@/lib/webhooks/providers/meta/router';
import { WebhookProvider } from '@/lib/webhooks/core/types';
import { PLATFORM_CONFIG } from '@/config/platform.config';

interface RouteParams {
  params: Promise<{ provider: string }>;
}

/**
 * GET — Provider Verification Handshake (Meta, etc.)
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  const searchParams = req.nextUrl.searchParams;

  // 1. Meta Handshake (hub.mode=subscribe, hub.verify_token, hub.challenge)
  if (provider === 'meta') {
    const mode = searchParams.get('hub.mode');
    const token = searchParams.get('hub.verify_token');
    const challenge = searchParams.get('hub.challenge');

    if (mode === 'subscribe') {
      const supabase = createAdminClient();
      const { data: config } = await supabase
        .from('provider_webhook_configs')
        .select('verify_token, is_enabled')
        .eq('provider', 'meta')
        .maybeSingle();

      const expectedToken = config?.verify_token || process.env.META_WEBHOOK_VERIFY_TOKEN || 'ibloom_webhook_secret_verify_2026';

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
 * POST — Incoming Webhook Payload Receiver
 */
export async function POST(req: NextRequest, { params }: RouteParams) {
  const { provider } = await params;
  const providerKey = provider.toLowerCase() as WebhookProvider;

  // Measure 3: Read raw body string FIRST before any JSON parsing
  const rawBody = await req.text();
  const signatureHeader = req.headers.get('x-hub-signature-256');

  const supabase = createAdminClient();

  // 1. Fetch provider configuration & secret token from DB
  const { data: config } = await supabase
    .from('provider_webhook_configs')
    .select('is_enabled, secret_token, verify_token')
    .eq('provider', providerKey)
    .maybeSingle();

  // If provider is explicitly disabled in Superadmin Control Center, log & gate
  if (config && !config.is_enabled) {
    let parsedPayload = {};
    try { parsedPayload = JSON.parse(rawBody); } catch {}

    await logWebhookEvent({
      provider: providerKey,
      sub_provider: 'whatsapp',
      event_type: 'disabled_gated',
      payload: parsedPayload,
      status: 'disabled_provider',
      error_message: `Webhook endpoint for provider '${providerKey}' is currently disabled in Superadmin settings.`,
    });

    return NextResponse.json({ status: 'disabled', message: 'Webhook endpoint disabled' }, { status: 200 });
  }
  let appSecret =
    process.env.META_APP_SECRET ||
    process.env.NEXT_PUBLIC_META_APP_SECRET ||
    PLATFORM_CONFIG.metaAppSecret ||
    '';

  if (config?.secret_token && config.secret_token !== 'meta_app_secret_placeholder') {
    appSecret = config.secret_token;
  }

  if (providerKey === 'meta' && appSecret) {
    const isValid = verifyMetaSignature(rawBody, signatureHeader, appSecret);
    if (!isValid) {
      console.warn('[Meta Webhook POST] HMAC Signature verification failed!');
      // Log dead-letter for invalid signature
      let parsedPayload = {};
      try { parsedPayload = JSON.parse(rawBody); } catch {}

      await logWebhookEvent({
        provider: providerKey,
        sub_provider: 'whatsapp',
        event_type: 'signature_mismatch',
        payload: parsedPayload,
        status: 'dead_letter',
        error_message: 'X-Hub-Signature-256 HMAC verification failed',
      });

      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }
  }

  // 3. Parse JSON Body
  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // 4. Determine Event Type & Log Raw Payload to webhook_events
  const eventType = payload.entry?.[0]?.changes?.[0]?.field || 'messages';
  const subProvider = providerKey === 'meta' ? 'whatsapp' : 'generic';

  const loggedRecord = await logWebhookEvent({
    provider: providerKey,
    sub_provider: subProvider,
    event_type: eventType,
    payload,
    status: 'received',
  });

  // 5. Asynchronous Processing Execution
  // Immediately acknowledge Meta with HTTP 200 OK to prevent 7-day retries
  const executionPromise = (async () => {
    if (providerKey === 'meta') {
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

  return NextResponse.json({ status: 'ok', received: true }, { status: 200 });
}
