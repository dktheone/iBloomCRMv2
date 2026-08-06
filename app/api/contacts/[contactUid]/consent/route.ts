// app/api/contacts/[contactUid]/consent/route.ts
// Consent status mutation endpoint (D-032: opt-out is terminal)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { setOptStatus } from '@/lib/contacts/mutations';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ contactUid: string }> }
) {
  try {
    const { contactUid } = await params;
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
    const { status, source } = body;

    // Validate status
    if (!['unknown', 'opted_in', 'opted_out'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }

    // Call mutation (trigger handles consent_events write)
    await setOptStatus({
      contactUid,
      tenantUid: userTenant.tenant_uid,
      status,
      source,
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Consent update error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update consent status' },
      { status: 500 }
    );
  }
}
