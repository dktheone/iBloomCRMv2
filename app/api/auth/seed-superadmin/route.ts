import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const passParam = searchParams.get('password') || 'MasterAdmin@2026!';
  const targetEmail = PLATFORM_CONFIG.superAdminEmail;
  const tenantZeroId = PLATFORM_CONFIG.tenantZeroId;

  try {
    const supabaseAdmin = createAdminClient();

    // 1. Fetch user by email via Admin API
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });

    if (listError || !usersData?.users) {
      return NextResponse.json({
        status: 'SERVICE_KEY_ERROR',
        message: listError?.message || 'Failed to retrieve auth users. Please verify SUPABASE_SERVICE_ROLE_KEY in .env.local',
      }, { status: 500 });
    }

    let existingUser = usersData.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
    let authUserId = existingUser?.id || PLATFORM_CONFIG.superAdminId;

    if (existingUser) {
      authUserId = existingUser.id;
      // Reset password and set email_confirm to true
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: passParam,
        email_confirm: true,
        user_metadata: { full_name: PLATFORM_CONFIG.superAdminName },
      });

      if (updateError) {
        return NextResponse.json({ status: 'UPDATE_FAILED', message: updateError.message || String(updateError) }, { status: 500 });
      }
    } else {
      // Create user cleanly via Admin API
      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: targetEmail,
        password: passParam,
        email_confirm: true,
        user_metadata: { full_name: PLATFORM_CONFIG.superAdminName },
      });

      if (createError) {
        // Fallback: If creation failed due to user existing, list again and force update password
        const { data: reListData } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
        const reMatch = reListData?.users?.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
        if (reMatch) {
          authUserId = reMatch.id;
          const { error: matchUpdateErr } = await supabaseAdmin.auth.admin.updateUserById(reMatch.id, {
            password: passParam,
            email_confirm: true,
            user_metadata: { full_name: PLATFORM_CONFIG.superAdminName },
          });
          if (matchUpdateErr) {
            return NextResponse.json({ status: 'MATCH_UPDATE_FAILED', message: matchUpdateErr.message, details: matchUpdateErr }, { status: 500 });
          }
        } else {
          return NextResponse.json({ status: 'CREATE_FAILED', message: createError.message || createError.name || 'User creation error', details: createError }, { status: 500 });
        }
      } else if (createData?.user) {
        authUserId = createData.user.id;
      }
    }

    // 2. Ensure Tenant Zero exists in public.tenants
    const tenantPayload = {
      tenant_uid: tenantZeroId,
      name: PLATFORM_CONFIG.masterAgencyName,
      slug: PLATFORM_CONFIG.masterAgencySlug,
      status: 'active',
      is_master_agency: true,
    };
    await supabaseAdmin.from('tenants').upsert(tenantPayload);

    // 3. Ensure Super Admin profile exists in public.users
    const userPayload = {
      user_uid: authUserId,
      email: targetEmail,
      full_name: PLATFORM_CONFIG.superAdminName,
      role: 'super_admin',
      mfa_enabled: true,
    };
    await supabaseAdmin.from('users').upsert(userPayload);

    // 4. Ensure User Tenant junction exists in public.user_tenants
    const linkPayload = {
      user_uid: authUserId,
      tenant_uid: tenantZeroId,
      role: 'owner',
      is_default: true,
    };
    await supabaseAdmin.from('user_tenants').upsert(linkPayload);

    return NextResponse.json({
      status: 'SUCCESS',
      message: `Super Admin (${targetEmail}) successfully provisioned and verified!`,
      userId: authUserId,
      loginCredentials: {
        email: targetEmail,
        password: passParam,
      },
    });

  } catch (error: any) {
    return NextResponse.json({
      status: 'PROVISION_ERROR',
      message: error?.message || String(error),
    }, { status: 500 });
  }
}
