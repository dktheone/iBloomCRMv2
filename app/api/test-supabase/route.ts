import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

export async function GET() {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

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
        message: 'Successfully reached the configured Supabase project endpoint! Ready for SQL migrations.',
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
