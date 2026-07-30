import fs from 'fs';
import path from 'path';

const LOG_FILE_PATH = path.join(process.cwd(), 'data', 'meta_graph_api_logs.json');

export interface MetaGraphLogEntry {
  id: string;
  timestamp: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  endpoint: string;
  fullUrl: string;
  params?: any;
  requestBody?: any;
  responseStatus: number;
  ok: boolean;
  durationMs: number;
  responseBody: any;
}

/**
 * Ensures the data directory and JSON log file exist
 */
function ensureLogFile() {
  const dir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE_PATH)) {
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Sanitizes sensitive credentials (access tokens, app secrets) to prevent security leaks
 */
export function sanitizePayload(data: any): any {
  if (!data) return data;

  if (typeof data === 'string') {
    if (data.includes('access_token=') || data.includes('input_token=')) {
      return data.replace(/(access_token|input_token)=([^&]+)/gi, '$1=$2_MASKED');
    }
    return data;
  }

  if (typeof data === 'object') {
    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    for (const key of Object.keys(sanitized)) {
      if (/access_token|input_token|appsecret|password|secret/i.test(key)) {
        if (typeof sanitized[key] === 'string') {
          const val = sanitized[key];
          sanitized[key] = val.length > 8 ? `${val.substring(0, 6)}...${val.substring(val.length - 4)} (MASKED)` : '***MASKED***';
        }
      } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
        sanitized[key] = sanitizePayload(sanitized[key]);
      }
    }
    return sanitized;
  }

  return data;
}

/**
 * Append a new Meta Graph API request/response log entry
 */
export function logMetaGraphApiCall(entry: Omit<MetaGraphLogEntry, 'id' | 'timestamp'>) {
  try {
    ensureLogFile();
    const rawContent = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
    let logs: MetaGraphLogEntry[] = [];
    try {
      logs = JSON.parse(rawContent);
    } catch {
      logs = [];
    }

    const newLog: MetaGraphLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      method: entry.method,
      endpoint: entry.endpoint,
      fullUrl: sanitizePayload(entry.fullUrl),
      params: sanitizePayload(entry.params),
      requestBody: sanitizePayload(entry.requestBody),
      responseStatus: entry.responseStatus,
      ok: entry.ok,
      durationMs: entry.durationMs,
      responseBody: sanitizePayload(entry.responseBody),
    };

    // Prepend newest first & cap at 500 entries
    logs.unshift(newLog);
    if (logs.length > 500) {
      logs = logs.slice(0, 500);
    }

    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    return newLog;
  } catch (err) {
    console.error('[MetaGraphLogger Error]:', err);
    return null;
  }
}

/**
 * Retrieve paginated log entries with filters
 */
export function getMetaGraphLogs(options?: {
  page?: number;
  limit?: number;
  method?: string;
  status?: string;
  search?: string;
}) {
  ensureLogFile();
  try {
    const rawContent = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
    let logs: MetaGraphLogEntry[] = JSON.parse(rawContent);

    const methodFilter = options?.method?.toUpperCase() || 'ALL';
    const statusFilter = options?.status?.toUpperCase() || 'ALL';
    const searchFilter = (options?.search || '').toLowerCase().trim();

    if (methodFilter !== 'ALL') {
      logs = logs.filter((l) => l.method === methodFilter);
    }

    if (statusFilter === 'SUCCESS') {
      logs = logs.filter((l) => l.ok);
    } else if (statusFilter === 'ERROR') {
      logs = logs.filter((l) => !l.ok);
    }

    if (searchFilter) {
      logs = logs.filter(
        (l) =>
          l.endpoint.toLowerCase().includes(searchFilter) ||
          l.fullUrl.toLowerCase().includes(searchFilter) ||
          JSON.stringify(l.responseBody || {}).toLowerCase().includes(searchFilter)
      );
    }

    const page = options?.page || 1;
    const limit = options?.limit || 15;
    const totalCount = logs.length;
    const totalPages = Math.ceil(totalCount / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paginatedLogs = logs.slice(startIndex, startIndex + limit);

    return {
      logs: paginatedLogs,
      totalCount,
      totalPages,
      currentPage: page,
      limit,
    };
  } catch (err) {
    console.error('[GetMetaGraphLogs Error]:', err);
    return { logs: [], totalCount: 0, totalPages: 1, currentPage: 1, limit: 15 };
  }
}

/**
 * Clear all log history
 */
export function clearMetaGraphLogs() {
  ensureLogFile();
  fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
  return { success: true };
}
