// app/api/media/[media_id]/route.ts
// Authenticated streaming proxy for Meta WhatsApp media assets (images, voice notes, videos, docs).

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { PLATFORM_CONFIG } from '@/config/platform.config';

interface RouteParams {
  params: Promise<{ media_id: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const { media_id } = await params;

  if (!media_id) {
    return NextResponse.json({ error: 'Media ID is required' }, { status: 400 });
  }

  // 1. Authenticate Request
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = PLATFORM_CONFIG.systemUserAccessToken;
  if (!token) {
    return NextResponse.json({ error: 'System user access token not configured' }, { status: 500 });
  }

  try {
    // 2. Fetch Media Metadata from Meta Graph API
    const metaGraphUrl = `https://graph.facebook.com/${PLATFORM_CONFIG.metaApiVersion}/${media_id}`;
    const metaRes = await fetch(metaGraphUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!metaRes.ok) {
      const errText = await metaRes.text();
      console.error('[Media Proxy] Failed to fetch media metadata from Meta:', errText);
      return NextResponse.json({ error: 'Failed to retrieve media metadata from Meta' }, { status: metaRes.status });
    }

    const metaData = await metaRes.json();
    const downloadUrl = metaData.url;
    const mimeType = metaData.mime_type || 'application/octet-stream';

    if (!downloadUrl) {
      return NextResponse.json({ error: 'No download URL returned by Meta' }, { status: 404 });
    }

    // 3. Download Binary from Meta CDN
    const binaryRes = await fetch(downloadUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': 'iBloomCRM/2.0',
      },
    });

    if (!binaryRes.ok) {
      console.error('[Media Proxy] Failed to download media binary from Meta CDN');
      return NextResponse.json({ error: 'Failed to download binary from Meta CDN' }, { status: binaryRes.status });
    }

    const binaryBuffer = await binaryRes.arrayBuffer();

    // 4. Return Stream with Proper Headers and Cache
    return new NextResponse(Buffer.from(binaryBuffer), {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': binaryBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=86400, stale-while-revalidate=43200',
      },
    });
  } catch (err: any) {
    console.error('[Media Proxy Error]', err);
    return NextResponse.json({ error: err?.message || 'Internal media streaming error' }, { status: 500 });
  }
}
