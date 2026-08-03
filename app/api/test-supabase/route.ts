import { NextResponse } from 'next/server';
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabase/env';

export async function GET() {
  const supabaseUrl = getSupabaseUrl();
  const anonKey = getSupabaseAnonKey();

  try {
    // Ping Supabase REST API endpoint
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
      },
    });

    if (response.ok || response.status === 200 || response.status === 400 || response.status === 404) {
      return NextResponse.json({
        status: 'SUCCESS',
        connected: true,
        httpStatus: response.status,
        projectUrl: supabaseUrl,
        message: 'Successfully reached Supabase project endpoint (bibbpavwvarzljqqwcef)! Ready for SQL migrations.',
      });
    }

    if (response.status === 401) {
      return NextResponse.json({
        status: 'UNAUTHORIZED_KEY',
        connected: false,
        httpStatus: response.status,
        projectUrl: supabaseUrl,
        message: 'Reached Supabase project, but NEXT_PUBLIC_SUPABASE_ANON_KEY is invalid or placeholder. Please update .env.local with your real API key from Supabase Dashboard Settings > API.',
      });
    }

    return NextResponse.json({
      status: 'RESPONSE_RECEIVED',
      connected: false,
      httpStatus: response.status,
      projectUrl: supabaseUrl,
      message: `Received status ${response.status} from Supabase.`,
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'CONNECTION_FAILED',
      connected: false,
      projectUrl: supabaseUrl,
      error: error?.message || 'Failed to establish network connection to Supabase.',
    });
  }
}
