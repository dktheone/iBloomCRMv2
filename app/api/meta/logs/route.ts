import { NextRequest } from 'next/server';
import { getMetaGraphLogs, clearMetaGraphLogs } from '@/lib/meta/logger';
import { apiException, apiSuccess } from '@/lib/api/response';
import { getPaginationParams } from '@/lib/api/request';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit } = getPaginationParams(searchParams, 15);
    const method = searchParams.get('method') || 'ALL';
    const status = searchParams.get('status') || 'ALL';
    const search = searchParams.get('search') || '';

    const result = getMetaGraphLogs({ page, limit, method, status, search });
    return apiSuccess({ ...result, isLoggingActive: true });
  } catch (err: any) {
    return apiException(err, 'Error reading Graph API logs');
  }
}

export async function DELETE() {
  try {
    clearMetaGraphLogs();
    return apiSuccess({ message: 'Meta Graph API log history cleared.' });
  } catch (err: any) {
    return apiException(err, 'Error clearing logs');
  }
}
