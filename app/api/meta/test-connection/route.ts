import { NextRequest, NextResponse } from 'next/server';
import { testMetaAppConnection } from '@/lib/meta/graph-client';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { getOrSetCache } from '@/lib/redis/client';
import { requireApiUser } from '@/lib/auth/guard';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('force') === 'true';

    // Query with 5-minute (300s) Local Redis / LRU Cache
    const result = await getOrSetCache(
      'meta:connection_test',
      () => testMetaAppConnection(),
      300,
      forceRefresh
    );

    if (result.success) {
      try {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();

        if (session) {
          const supabaseAdmin = createAdminClient();
          await supabaseAdmin.from('provider_config').upsert({
            meta_app_id: result.metaAppId,
            app_mode: PLATFORM_CONFIG.appMode,
            app_category: 'Tech Provider / Business Management CRM',
            webhook_callback_url: PLATFORM_CONFIG.webhookCallbackUrl,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'meta_app_id' });
        }
      } catch (dbErr) {
        console.warn('[Meta Test Connection DB Sync Notice]:', dbErr);
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      platform: {
        metaAppId: PLATFORM_CONFIG.metaAppId,
        appName: PLATFORM_CONFIG.metaAppName,
        appMode: PLATFORM_CONFIG.appMode,
        webhookUrl: PLATFORM_CONFIG.webhookCallbackUrl,
        // NOTE: webhook verify token is a secret and is intentionally NOT returned in the API response.
      },
      connectionTest: result,
    });
  } catch (error: any) {
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      success: false,
      error: error?.message || 'Failed to test Meta Graph API connection.',
    }, { status: 500 });
  }
}
