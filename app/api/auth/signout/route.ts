import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[Signout POST Error]:', error.message);
  }

  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL('/login', requestUrl.origin), {
    status: 302,
  });
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    console.error('[Signout GET Error]:', error.message);
  }

  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL('/login', requestUrl.origin), {
    status: 302,
  });
}
