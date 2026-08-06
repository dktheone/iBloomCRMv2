import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Next.js 15: route params arrive as a Promise and must be awaited.
type Params = { params: Promise<{ id: string }> };

// GET /api/inbox/conversations/[id] — single conversation detail
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('conversations')
      .select(`
        *,
        contact:contacts (
          *,
          labels:contact_labels_active (
            label_uid,
            applied_at,
            expires_at,
            applied_by_module,
            label:labels (name, color)
          )
        ),
        phone_number:wa_phone_numbers (display_phone_number, verified_name),
        assigned_agent:users!assigned_to (user_uid, full_name, email)
      `)
      .eq('conversation_uid', id)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ conversation: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PATCH /api/inbox/conversations/[id] — update status, assignment, bot_control, unread_count
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const body = await req.json();

    const allowed = ['lifecycle_status', 'assigned_to', 'bot_control', 'unread_count', 'is_pinned', 'tags'];
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const { data, error } = await supabase
      .from('conversations')
      .update(updates)
      .eq('conversation_uid', id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ conversation: data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
