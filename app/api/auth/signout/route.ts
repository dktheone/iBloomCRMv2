import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function signOutAndRedirect(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();

  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL('/login', requestUrl.origin), {
    status: 302,
  });
}

export const POST = signOutAndRedirect;
export const GET = signOutAndRedirect;
