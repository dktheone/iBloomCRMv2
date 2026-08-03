import { NextRequest } from 'next/server';
import { fetchMetaWabaAssets } from '@/lib/meta/graph-client';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { getOrSetCache } from '@/lib/redis/client';
import { apiError, apiSuccess } from '@/lib/api/response';

/**
 * GET /api/meta/sync-assets
 * DISCOVERY ONLY: Fetches live WABAs and Phone Lines from Meta Graph API v25.0 via Redis Cache.
 * CRITICAL RULE: DOES NOT AUTO-INSERT OR AUTO-UPSERT PHONE LINES INTO DATABASE WITHOUT EXPLICIT USER ACTION.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('force') === 'true';

    // Query with 5-minute (300s) Local Redis / LRU Cache Gateway
    const assetResult = await getOrSetCache(
      'meta:waba_assets',
      () => fetchMetaWabaAssets(),
      300,
      forceRefresh
    );

    if (!assetResult.success) {
      return apiError(assetResult.error || 'Failed to fetch WABA assets from Meta API v25.0.', 500, {
        errorCode200Detected: assetResult.errorCode200Detected || false,
        requestDetails: assetResult.requestDetails,
      });
    }

    return apiSuccess({
      timestamp: new Date().toISOString(),
      apiVersion: PLATFORM_CONFIG.metaApiVersion,
      wabaCount: assetResult.wabas.length,
      phoneCount: assetResult.phoneNumbers.length,
      wabas: assetResult.wabas,
      phoneNumbers: assetResult.phoneNumbers,
      wabaHealth: assetResult.wabaHealth,
      errorCode200Detected: assetResult.errorCode200Detected || false,
      isDemoFallback: assetResult.isDemoFallback || false,
      requestDetails: assetResult.requestDetails,
    });
  } catch (error: any) {
    return apiError(error?.message || 'Failed to sync Meta WABA assets.', 500, {
      timestamp: new Date().toISOString(),
    });
  }
}
