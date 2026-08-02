import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;

  // Skip static assets, _next internal routes, favicon, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.includes('.') ||
    pathname === '/favicon.ico'
  ) {
    return response;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bibbpavwvarzljqqwcef.supabase.co';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  // 1. Create Admin Client (Service Role) to bypass RLS for the initialization check!
  // This prevents Supabase RLS policies on public.tenants from returning empty data to anon requests!
  let isInitialized = false;
  try {
    const supabaseAdmin = createAdminClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('is_master_agency')
      .eq('is_master_agency', true)
      .limit(1);

    isInitialized = Boolean(tenantData && tenantData.length > 0);
  } catch (err) {
    console.warn('[Middleware Admin Init Check Notice]:', err);
  }

  // 2. Create Standard SSR Client for User Session Validation
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: any[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 3. SCENARIO A: DATABASE IS UNINITIALIZED (No Master Agency exists)
  if (!isInitialized) {
    // Allow access to /setup
    if (pathname === '/setup') {
      return response;
    }
    // Force redirect uninitialized visits to /setup
    return NextResponse.redirect(new URL('/setup', request.url));
  }

  // 4. SCENARIO B: DATABASE IS INITIALIZED (Master Agency exists)
  // Lock /setup permanently once initialized!
  if (pathname === '/setup') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 5. Check active Supabase GoTrue Auth Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isPublicRoute = pathname === '/login';

  // Unauthenticated user trying to access protected platform route -> Redirect to /login
  if (!session && !isPublicRoute) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated user trying to access /login -> Redirect to /dashboard
  if (session && isPublicRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
