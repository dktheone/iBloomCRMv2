import { NextRequest, NextResponse } from 'next/server';
import { getMetaGraphLogs, clearMetaGraphLogs } from '@/lib/meta/logger';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '15', 10);
    const method = searchParams.get('method') || 'ALL';
    const status = searchParams.get('status') || 'ALL';
    const search = searchParams.get('search') || '';

    const result = getMetaGraphLogs({ page, limit, method, status, search });
    return NextResponse.json({ success: true, ...result, isLoggingActive: true });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Error reading Graph API logs' }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    clearMetaGraphLogs();
    return NextResponse.json({ success: true, message: 'Meta Graph API log history cleared.' });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Error clearing logs' }, { status: 500 });
  }
}
