// app/api/admin/webhooks/config/route.ts
// Superadmin API endpoint for Provider Webhook Configurations & Secret Key Management.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Computes dynamic Webhook Callback URL based on env (NEXT_PUBLIC_WEBHOOK_URL or NEXT_PUBLIC_APP_URL).
 */
function getDynamicWebhookUrl(provider: string): string {
  const envWebhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_URL;
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  if (envWebhookUrl) {
    const cleanBase = envWebhookUrl.replace(/\/+$/, '');
    // Normalize singular /api/webhook to plural /api/webhooks
    const normalizedBase = cleanBase.replace(/\/api\/webhook$/, '/api/webhooks');
    if (normalizedBase.endsWith('/api/webhooks')) {
      return `${normalizedBase}/${provider}`;
    }
    return `${normalizedBase}/${provider}`;
  }

  const cleanAppUrl = envAppUrl.replace(/\/+$/, '');
  return `${cleanAppUrl}/api/webhooks/${provider}`;
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
