import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/inbox/conversations — paginated conversation list
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const status   = searchParams.get('status');   // open | pending | resolved | all
    const cursor   = searchParams.get('cursor');    // last_message_at ISO for pagination
    const limit    = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);
    const search   = searchParams.get('q');

    let query = supabase
      .from('conversations')
      .select(`
        conversation_uid,
        lifecycle_status,
        last_message_at,
        last_message_preview,
        last_message_direction,
        unread_count,
        window_expires_at,
        is_pinned,
        tags,
        assigned_to,
        contact:contacts (
          contact_uid,
          name,
          wa_phone,
          avatar_url,
          opt_in_status
        ),
        phone_number:wa_phone_numbers (
          display_phone_number,
          verified_name
        ),
        assigned_agent:users!assigned_to (
          user_uid,
          full_name
        )
      `)
      .order('is_pinned', { ascending: false })
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (status && status !== 'all') {
      query = query.eq('lifecycle_status', status);
    }
    if (cursor) {
      query = query.lt('last_message_at', cursor);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Client-side phone/name search filter (DB search via index is preferred in prod)
    let conversations = data ?? [];
    if (search) {
      const q = search.toLowerCase();
      conversations = conversations.filter((c: any) =>
        c.contact?.name?.toLowerCase().includes(q) ||
        c.contact?.wa_phone?.includes(q)
      );
    }

    return NextResponse.json({
      conversations,
      nextCursor: conversations.length === limit
        ? conversations[conversations.length - 1]?.last_message_at
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
