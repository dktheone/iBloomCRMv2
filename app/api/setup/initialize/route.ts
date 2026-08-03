import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { setupWizardSchema } from '@/lib/validations/schemas';
import { apiError, apiSuccess } from '@/lib/api/response';
import { validatePayload } from '@/lib/api/validate';
import { fetchMasterTenant } from '@/lib/supabase/tenant';

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();

    // Check if Master Agency already exists in Supabase
    const masterAgency = await fetchMasterTenant(
      supabaseAdmin,
      'tenant_uid, id, name, is_master_agency, status, slug'
    );

    return NextResponse.json({
      isInitialized: Boolean(masterAgency),
      masterAgency,
    });
  } catch (err: any) {
    return NextResponse.json({ isInitialized: false, error: err?.message });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate incoming payload against Zod Schema Guard
    const validationResult = await validatePayload(
      setupWizardSchema,
      body,
      request,
      'setup_wizard',
      'Validation failed. Please check your form input.'
    );

    if (!validationResult.success) {
      return validationResult.response;
    }

    const { masterAgencyName, superAdminName, superAdminEmail, superAdminPhone, password } = validationResult.data;

    const supabaseAdmin = createAdminClient();

    // Check if Master Agency already exists
    const existingTenant = await fetchMasterTenant(supabaseAdmin, 'tenant_uid, id, slug');

    let tenantZeroId = crypto.randomUUID();
    let tenantSlug = PLATFORM_CONFIG.masterAgencySlug;

    if (existingTenant) {
      tenantZeroId = existingTenant.tenant_uid || existingTenant.id;
      tenantSlug = existingTenant.slug || PLATFORM_CONFIG.masterAgencySlug;
    }

    // Register/Update Super Admin in Supabase GoTrue Auth
    let finalUserId = crypto.randomUUID();
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: superAdminEmail,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: superAdminName,
        phone: superAdminPhone,
      },
    });

    if (!authError && authData?.user) {
      finalUserId = authData.user.id;
    } else {
      const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
      const existing = listData?.users?.find((u) => u.email?.toLowerCase() === superAdminEmail.toLowerCase());
      if (existing) {
        finalUserId = existing.id;
        await supabaseAdmin.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
      }
    }

    // Provision/Update Master Agency in public.tenants
    const tenantRecord = {
      tenant_uid: tenantZeroId,
      name: masterAgencyName,
      slug: tenantSlug,
      mask_id: 'TENANT-ZERO',
      status: 'active',
      is_master_agency: true,
      updated_at: new Date().toISOString(),
    };

    const { error: tenantErr } = await supabaseAdmin.from('tenants').upsert(tenantRecord);

    if (tenantErr) {
      return apiError(tenantErr.message);
    }

    // Provision Super Admin profile in public.users
    const userRecord = {
      user_uid: finalUserId,
      email: superAdminEmail,
      full_name: superAdminName,
      role: 'super_admin',
      mfa_enabled: true,
      updated_at: new Date().toISOString(),
    };

    await supabaseAdmin.from('users').upsert(userRecord);

    // Provision User Tenant Link in public.user_tenants
    const linkRecord = {
      user_uid: finalUserId,
      tenant_uid: tenantZeroId,
      role: 'owner',
      is_default: true,
    };

    await supabaseAdmin.from('user_tenants').upsert(linkRecord);

    // Provision Provider Config
    await supabaseAdmin.from('provider_config').upsert({
      meta_app_id: PLATFORM_CONFIG.metaAppId,
      app_mode: PLATFORM_CONFIG.appMode,
      app_category: 'Tech Provider / Business Management CRM',
      webhook_callback_url: PLATFORM_CONFIG.webhookCallbackUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meta_app_id' });

    return apiSuccess({
      message: 'Master Agency and Super Admin onboarding initialized successfully!',
      masterAgency: {
        name: masterAgencyName,
        status: 'ACTIVE',
        type: 'Master Control Agency (Tenant Zero)',
      },
      superAdmin: {
        email: superAdminEmail,
        name: superAdminName,
        phone: superAdminPhone,
      },
    });
  } catch (error: any) {
    return apiError(error?.message || 'Failed to initialize Master Agency onboarding setup.');
  }
}
