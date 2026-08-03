import fs from 'fs';
import path from 'path';
import { apiException, apiSuccess } from '@/lib/api/response';
import { getPaginationParams } from '@/lib/api/request';

export const dynamic = 'force-dynamic';

/**
 * GET /api/meta/audit-logs
 * Option-1 Audit Log Gateway: Streams and filters append-only audit event logs from VPS disk.
 * Supports:
 * - date filtering (startDate, endDate)
 * - eventType filtering (ASSET_PROVISION, ASSET_LOCK, ASSET_DETACH, TEMPLATE_SAVE, TEMPLATE_DELETE)
 * - text search (query over target_id and details)
 * - pagination (page, limit)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const eventType = searchParams.get('eventType');
    const searchQuery = (searchParams.get('search') || '').toLowerCase().trim();
    const { page, limit } = getPaginationParams(searchParams, 50);

    const logsDir = path.join(process.cwd(), 'storage', 'logs', 'audit');
    if (!fs.existsSync(logsDir)) {
      return apiSuccess({
        logs: [],
        total: 0,
        page,
        limit,
        totalPages: 0,
      });
    }

    const files = fs.readdirSync(logsDir).filter((f) => f.endsWith('.jsonl') || f.endsWith('.parquet'));
    let allRecords: any[] = [];

    for (const file of files) {
      const fileDate = file.replace('.jsonl', '').replace('.parquet', '');
      
      // Date Range Filter Pruning
      if (startDate && fileDate < startDate) continue;
      if (endDate && fileDate > endDate) continue;

      const filePath = path.join(logsDir, file);
      if (file.endsWith('.jsonl')) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(Boolean);

        for (const line of lines) {
          try {
            const record = JSON.parse(line);

            // Parameter Filters
            if (eventType && record.event_type !== eventType) continue;
            if (searchQuery) {
              const searchable = `${record.target_id} ${record.event_type} ${JSON.stringify(record.details)}`.toLowerCase();
              if (!searchable.includes(searchQuery)) continue;
            }

            allRecords.push(record);
          } catch (e) {
            // Ignore malformed lines
          }
        }
      }
    }

    // Sort newest first
    allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = allRecords.length;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = allRecords.slice(startIndex, startIndex + limit);

    return apiSuccess({
      timestamp: new Date().toISOString(),
      logs: paginatedLogs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err: any) {
    return apiException(err, 'Error fetching audit logs', 500, '[Audit Logs API Error]');
  }
}
