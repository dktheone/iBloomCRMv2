// app/api/admin/webhooks/config/route.ts
// Superadmin API endpoint for Provider Webhook Configurations & Secret Key Management.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Computes dynamic Webhook Callback URL based on env (NEXT_PUBLIC_WEBHOOK_URL or NEXT_PUBLIC_APP_URL).
 * Bulletproof sanitization: prevents duplicate /meta/meta or singular /api/webhook paths.
 */
function getDynamicWebhookUrl(provider: string): string {
  const envWebhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL;
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  let baseUrl = envWebhookUrl || `${envAppUrl.replace(/\/+$/, '')}/api/webhooks`;
  baseUrl = baseUrl.replace(/\/+$/, '');

  // 1. If baseUrl already ends with /provider (e.g. /webhooks/meta), return as-is
  if (baseUrl.endsWith(`/${provider}`)) {
    return baseUrl;
  }

  // 2. Normalize singular /api/webhook to plural /api/webhooks
  if (baseUrl.endsWith('/api/webhook')) {
    baseUrl = baseUrl.replace(/\/api\/webhook$/, '/api/webhooks');
  }

  // 3. Ensure path includes /api/webhooks
  if (!baseUrl.endsWith('/api/webhooks') && !baseUrl.includes('/api/webhooks')) {
    baseUrl = `${baseUrl}/api/webhooks`;
  }

  return `${baseUrl}/${provider}`;
}

/**
 * GET — Fetch all provider webhook configurations.
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: configs, error } = await adminClient
    .from('provider_webhook_configs')
    .select('*')
    .order('provider', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Dynamically attach live environment callback URL
  const enrichedConfigs = (configs || []).map((cfg) => ({
    ...cfg,
    callback_url: getDynamicWebhookUrl(cfg.provider),
  }));

  return NextResponse.json({ configs: enrichedConfigs });
}

/**
 * PATCH — Update provider webhook configuration (Enable/Disable, Secret Token, Verify Token).
 */
export async function PATCH(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { provider, is_enabled, verify_token, secret_token, instructions } = body;

    if (!provider) {
      return NextResponse.json({ error: 'Provider is required' }, { status: 400 });
    }

    const updatePayload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof is_enabled === 'boolean') updatePayload.is_enabled = is_enabled;
    if (verify_token !== undefined) updatePayload.verify_token = verify_token;
    if (secret_token !== undefined) updatePayload.secret_token = secret_token;
    if (instructions !== undefined) updatePayload.instructions = instructions;

    const adminClient = createAdminClient();
    const { data: updatedConfig, error } = await adminClient
      .from('provider_webhook_configs')
      .update(updatePayload)
      .eq('provider', provider)
      .select('*')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ config: updatedConfig });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
