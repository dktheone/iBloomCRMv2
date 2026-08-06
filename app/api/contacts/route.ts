// app/api/contacts/route.ts
// Contact create/list API (D-034 shared upsert path)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { upsertContact } from '@/lib/contacts/mutations';
import { listContacts } from '@/lib/contacts/queries';

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant from user_tenants
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_uid')
      .eq('user_uid', user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant' }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const cursor = searchParams.get('cursor') || undefined;
    const search = searchParams.get('search') || undefined;
    const optInStatus = searchParams.get('opt_in_status')?.split(',');
    const labelUids = searchParams.get('label_uids')?.split(',');

    const result = await listContacts({
      tenantUid: userTenant.tenant_uid,
      limit,
      cursor,
      search,
      optInStatus,
      labelUids,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('List contacts error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list contacts' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant from user_tenants
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_uid')
      .eq('user_uid', user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant' }, { status: 403 });
    }

    const body = await req.json();

    // Validate required fields
    if (!body.waPhone || !body.name) {
      return NextResponse.json(
        { error: 'wa_phone and name are required' },
        { status: 400 }
      );
    }

    // D-034: Use shared upsert path
    const contact = await upsertContact({
      tenantUid: userTenant.tenant_uid,
      waPhone: body.waPhone,
      name: body.name,
      email: body.email,
      avatarUrl: body.avatarUrl,
      preferredLanguage: body.preferredLanguage,
      countryCode: body.countryCode,
      timezone: body.timezone,
      dateOfBirth: body.dateOfBirth,
      customFields: body.customFields,
      notes: body.notes,
      createdByUid: user.id,
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error: any) {
    console.error('Create contact error:', error);

    // Detect unique constraint violation (duplicate wa_phone)
    if (error.code === '23505' || error.message?.includes('duplicate')) {
      return NextResponse.json(
        { error: 'A contact with this WhatsApp phone already exists' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create contact' },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get tenant from user_tenants
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_uid')
      .eq('user_uid', user.id)
      .single();

    if (!userTenant) {
      return NextResponse.json({ error: 'No tenant' }, { status: 403 });
    }

    const body = await req.json();

    // contactUid required for PATCH
    if (!body.contactUid) {
      return NextResponse.json({ error: 'contactUid required' }, { status: 400 });
    }

    // D-034: Use shared upsert path (wa_phone cannot change)
    const contact = await upsertContact({
      tenantUid: userTenant.tenant_uid,
      waPhone: body.waPhone, // Required for upsert, but unchanged
      name: body.name,
      email: body.email,
      avatarUrl: body.avatarUrl,
      preferredLanguage: body.preferredLanguage,
      countryCode: body.countryCode,
      timezone: body.timezone,
      dateOfBirth: body.dateOfBirth,
      customFields: body.customFields,
      notes: body.notes,
    });

    return NextResponse.json({ contact });
  } catch (error: any) {
    console.error('Update contact error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update contact' },
      { status: 500 }
    );
  }
}
