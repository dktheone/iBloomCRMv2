import { NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * API route authentication guard.
 *
 * The Next.js middleware explicitly skips all `/api/*` paths, so route handlers
 * are responsible for their own authentication. Several routes use the
 * service-role (RLS-bypassing) admin client, which means an unauthenticated
 * request could otherwise read/write tenant data. Call this at the top of any
 * privileged handler.
 *
 * Uses `supabase.auth.getUser()` (which re-validates the JWT against the Supabase
 * Auth server) rather than `getSession()` (which trusts the unverified cookie).
 */
export async function requireApiUser(): Promise<
  { user: User; response?: never } | { user?: never; response: NextResponse }
> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return {
        response: NextResponse.json(
          { success: false, error: 'Unauthorized. A valid authenticated session is required.' },
          { status: 401 }
        ),
      };
    }

    return { user };
  } catch {
    return {
      response: NextResponse.json(
        { success: false, error: 'Unauthorized. Failed to validate session.' },
        { status: 401 }
      ),
    };
  }
}

/**
 * Guard for the one-time bootstrap/onboarding flow.
 *
 * Before the Master Agency (Tenant Zero) exists, the `/setup` wizard must be
 * reachable without a session. Once the platform is initialized, these
 * endpoints become sensitive (they can create/reset the super admin) and must
 * require a valid authenticated session — mirroring the middleware that locks
 * `/setup` after initialization.
 *
 * Returns `{ ok: true }` when the request is allowed to proceed, otherwise a
 * `response` to return to the caller.
 */
export async function allowBootstrapOrRequireUser(): Promise<
  { ok: true; response?: never } | { ok?: never; response: NextResponse }
> {
  let isInitialized = false;
  try {
    const supabaseAdmin = createAdminClient();
    const { data } = await supabaseAdmin
      .from('tenants')
      .select('is_master_agency')
      .eq('is_master_agency', true)
      .limit(1);
    isInitialized = Boolean(data && data.length > 0);
  } catch {
    // If we cannot determine initialization state, fail closed and require auth.
    isInitialized = true;
  }

  if (!isInitialized) {
    return { ok: true };
  }

  const auth = await requireApiUser();
  if (auth.response) {
    return { response: auth.response };
  }
  return { ok: true };
}
