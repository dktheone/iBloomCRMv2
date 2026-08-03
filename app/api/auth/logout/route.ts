import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { apiError, apiSuccess } from '@/lib/api/response';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return apiSuccess({
      message: 'Successfully signed out of iBloom CRM v2.',
      redirectUrl: '/login',
    });
  } catch (error: any) {
    return apiError(error?.message || 'Failed to sign out.');
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (error) {
    console.warn('[Logout GET Notice]:', error);
  }

  return NextResponse.redirect(new URL('/login', request.url));
}
