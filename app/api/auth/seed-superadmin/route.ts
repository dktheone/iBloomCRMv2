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
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

    if (listError || !usersData?.users) {
      return NextResponse.json({
        status: 'SERVICE_KEY_ERROR',
        message: listError?.message || 'Failed to retrieve auth users. Please verify SUPABASE_SERVICE_ROLE_KEY in .env.local',
      }, { status: 500 });
    }

    const existingUser = usersData.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());

    let authUserId = PLATFORM_CONFIG.superAdminId;

    if (existingUser) {
      authUserId = existingUser.id;
      // Reset password and set email_confirm to true
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
        password: passParam,
        email_confirm: true,
        user_metadata: { full_name: PLATFORM_CONFIG.superAdminName },
      });

      if (updateError) {
        return NextResponse.json({ status: 'UPDATE_FAILED', message: updateError.message }, { status: 500 });
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
        return NextResponse.json({ status: 'CREATE_FAILED', message: createError.message }, { status: 500 });
      }

      if (createData?.user) {
        authUserId = createData.user.id;
      }
    }

    // 2. Ensure Tenant Zero exists in public.tenants
    await supabaseAdmin.from('tenants').upsert({
      id: tenantZeroId,
      name: PLATFORM_CONFIG.masterAgencyName,
      slug: PLATFORM_CONFIG.masterAgencySlug,
      status: 'active',
      is_master_agency: true,
    });

    // 3. Ensure Super Admin profile exists in public.users
    await supabaseAdmin.from('users').upsert({
      id: authUserId,
      email: targetEmail,
      full_name: PLATFORM_CONFIG.superAdminName,
      role: 'super_admin',
      mfa_enabled: true,
    });

    // 4. Ensure User Tenant junction exists in public.user_tenants
    await supabaseAdmin.from('user_tenants').upsert({
      user_id: authUserId,
      tenant_id: tenantZeroId,
      role: 'owner',
      is_default: true,
    }, { onConflict: 'user_id,tenant_id' });

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
