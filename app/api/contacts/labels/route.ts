// app/api/contacts/labels/route.ts
// Label list + create API (D-110 provenance)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createLabelSchema } from '@/lib/validations/schemas';

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

    const { data, error } = await supabase
      .from('labels')
      .select('*')
      .eq('tenant_uid', userTenant.tenant_uid)
      .order('name', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ labels: data });
  } catch (error: any) {
    console.error('List labels error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list labels' },
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

    // Validate
    const result = createLabelSchema.safeParse(body);
    if (!result.success) {
      const firstError = result.error.issues[0];
      return NextResponse.json(
        { error: firstError.message },
        { status: 400 }
      );
    }

    const { name, color } = result.data;

    // Insert with UNIQUE (tenant_uid, name) enforcement
    const { data, error } = await supabase
      .from('labels')
      .insert({
        tenant_uid: userTenant.tenant_uid,
        name,
        color,
      })
      .select()
      .single();

    if (error) {
      // Detect unique constraint violation
      if (error.code === '23505' || error.message?.includes('duplicate')) {
        return NextResponse.json(
          { error: `A label named "${name}" already exists` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ label: data }, { status: 201 });
  } catch (error: any) {
    console.error('Create label error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to create label' },
      { status: 500 }
    );
  }
}
