import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Next.js 15: route params arrive as a Promise and must be awaited.
type Params = { params: Promise<{ id: string }> };

// GET /api/inbox/conversations/[id]/messages — cursor-paginated, bottom-anchored
export async function GET(req: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(req.url);

    const before  = searchParams.get('before');   // ISO cursor — load messages before this time
    const limit   = Math.min(parseInt(searchParams.get('limit') ?? '50'), 100);

    let query = supabase
      .from('messages')
      .select('*')
      .eq('conversation_uid', id)
      .order('created_at', { ascending: false })   // newest first for cursor paging
      .limit(limit);

    if (before) {
      query = query.lt('created_at', before);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Return in ascending order (oldest first) for display
    const messages = (data ?? []).reverse();

    return NextResponse.json({
      messages,
      hasMore: (data ?? []).length === limit,
      nextCursor: messages.length > 0 ? messages[0].created_at : null, // oldest in page
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
