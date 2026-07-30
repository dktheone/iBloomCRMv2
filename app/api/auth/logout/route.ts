import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();

    return NextResponse.json({
      success: true,
      message: 'Successfully signed out of iBloom CRM v2.',
      redirectUrl: '/login',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to sign out.',
    }, { status: 500 });
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
