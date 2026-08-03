import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PLATFORM_CONFIG } from '@/config/platform.config';
import { setupWizardSchema } from '@/lib/validations/schemas';
import { logValidationFailure } from '@/lib/security/audit-logger';

export async function GET() {
  try {
    const supabaseAdmin = createAdminClient();

    // Check if Master Agency already exists in Supabase
    const { data: tenantData, error: tenantError } = await supabaseAdmin
      .from('tenants')
      .select('tenant_uid, id, name, is_master_agency, status, slug')
      .eq('is_master_agency', true)
      .limit(1);

    if (tenantError) {
      throw new Error(tenantError.message);
    }

    const isInitialized = Boolean(tenantData && tenantData.length > 0);

    return NextResponse.json({
      isInitialized,
      masterAgency: tenantData?.[0] || null,
    });
  } catch (err: any) {
    console.error('[Setup Initialize GET Error]:', err);
    return NextResponse.json(
      { isInitialized: false, error: err?.message || 'Failed to read Master Agency setup state.' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // 1. Validate incoming payload against Zod Schema Guard
    const validationResult = setupWizardSchema.safeParse(body);

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      const userAgent = request.headers.get('user-agent') || 'Unknown User-Agent';
      const ipAddress = request.headers.get('x-forwarded-for') || '127.0.0.1';

      for (const issue of validationResult.error.issues) {
        const fieldName = issue.path.join('.') || 'payload';
        fieldErrors[fieldName] = issue.message;

        // Log validation failure to security audit table
        await logValidationFailure({
          formSurface: 'setup_wizard',
          rejectedField: fieldName,
          failureReason: issue.message,
          ipAddress,
          userAgent,
        });
      }

      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed. Please check your form input.',
          fieldErrors,
        },
        { status: 400 }
      );
    }

    const { masterAgencyName, superAdminName, superAdminEmail, superAdminPhone, password } = validationResult.data;

    const supabaseAdmin = createAdminClient();

    // Check if Master Agency already exists
    const { data: existingTenants, error: existingTenantsError } = await supabaseAdmin
      .from('tenants')
      .select('tenant_uid, id, slug')
      .eq('is_master_agency', true)
      .limit(1);

    if (existingTenantsError) {
      return NextResponse.json({ success: false, error: existingTenantsError.message }, { status: 500 });
    }

    let tenantZeroId = crypto.randomUUID();
    let tenantSlug = PLATFORM_CONFIG.masterAgencySlug;

    if (existingTenants && existingTenants.length > 0) {
      tenantZeroId = existingTenants[0].tenant_uid || existingTenants[0].id;
      tenantSlug = existingTenants[0].slug || PLATFORM_CONFIG.masterAgencySlug;
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
      const { data: listData, error: listError } = await supabaseAdmin.auth.admin.listUsers();

      if (listError) {
        return NextResponse.json(
          { success: false, error: `Could not create or look up the Super Admin auth user: ${listError.message}` },
          { status: 500 }
        );
      }

      const existing = listData?.users?.find((u) => u.email?.toLowerCase() === superAdminEmail.toLowerCase());

      if (!existing) {
        return NextResponse.json(
          {
            success: false,
            error: authError?.message || 'Failed to provision the Super Admin auth user.',
          },
          { status: 500 }
        );
      }

      finalUserId = existing.id;
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
      });

      if (updateError) {
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
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
      return NextResponse.json({ success: false, error: tenantErr.message }, { status: 500 });
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

    const { error: userErr } = await supabaseAdmin.from('users').upsert(userRecord);

    if (userErr) {
      return NextResponse.json({ success: false, error: userErr.message }, { status: 500 });
    }

    // Provision User Tenant Link in public.user_tenants
    const linkRecord = {
      user_uid: finalUserId,
      tenant_uid: tenantZeroId,
      role: 'owner',
      is_default: true,
    };

    const { error: linkErr } = await supabaseAdmin.from('user_tenants').upsert(linkRecord);

    if (linkErr) {
      return NextResponse.json({ success: false, error: linkErr.message }, { status: 500 });
    }

    // Provision Provider Config
    const { error: providerErr } = await supabaseAdmin.from('provider_config').upsert({
      meta_app_id: PLATFORM_CONFIG.metaAppId,
      app_mode: PLATFORM_CONFIG.appMode,
      app_category: 'Tech Provider / Business Management CRM',
      webhook_callback_url: PLATFORM_CONFIG.webhookCallbackUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'meta_app_id' });

    if (providerErr) {
      return NextResponse.json({ success: false, error: providerErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
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
    console.error('[Setup Initialize POST Error]:', error);
    return NextResponse.json({
      success: false,
      error: error?.message || 'Failed to initialize Master Agency onboarding setup.',
    }, { status: 500 });
  }
}
