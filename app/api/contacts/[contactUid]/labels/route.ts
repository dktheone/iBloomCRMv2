// app/api/contacts/[contactUid]/labels/route.ts
// Apply/remove labels on a contact (D-110 provenance)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyLabel, removeLabel } from '@/lib/contacts/mutations';
import { LABEL_MODULE_MANUAL } from '@/lib/contacts/constants';

interface Params {
  contactUid: string;
}

export async function POST(req: NextRequest, context: { params: Promise<Params> }) {
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

    const { contactUid } = await context.params;
    const body = await req.json();

    const { add = [], remove = [] } = body as { add?: string[]; remove?: string[] };

    // Apply labels with provenance (D-110)
    for (const labelUid of add) {
      await applyLabel({
        tenantUid: userTenant.tenant_uid,
        contactUid,
        labelUid,
        appliedByUid: user.id,
        appliedByModule: LABEL_MODULE_MANUAL,
      });
    }

    // Remove labels
    for (const labelUid of remove) {
      await removeLabel(contactUid, labelUid);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Apply/remove labels error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to apply/remove labels' },
      { status: 500 }
    );
  }
}
