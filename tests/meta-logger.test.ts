import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type LoggerModule = typeof import('@/lib/meta/logger');

let tmpDir: string;
let logger: LoggerModule;
let logFilePath: string;

const baseEntry = {
  method: 'GET' as const,
  endpoint: '/v25.0/me',
  fullUrl: 'https://graph.facebook.com/v25.0/me?access_token=EAAsecrettoken',
  responseStatus: 200,
  ok: true,
  durationMs: 42,
  responseBody: { id: '123' },
};

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-logger-'));
  logFilePath = path.join(tmpDir, 'data', 'meta_graph_api_logs.json');
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  vi.resetModules();
  logger = await import('@/lib/meta/logger');
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const readLogFile = () => JSON.parse(fs.readFileSync(logFilePath, 'utf-8'));

describe('sanitizePayload', () => {
  it('passes through nullish and primitive values untouched', () => {
    expect(logger.sanitizePayload(null)).toBeNull();
    expect(logger.sanitizePayload(undefined)).toBeUndefined();
    expect(logger.sanitizePayload(42)).toBe(42);
    expect(logger.sanitizePayload('https://graph.facebook.com/v25.0/me')).toBe(
      'https://graph.facebook.com/v25.0/me'
    );
  });

  it('masks access and input tokens embedded in query strings', () => {
    expect(logger.sanitizePayload('https://graph.facebook.com/me?access_token=EAAsecret&fields=id')).toBe(
      'https://graph.facebook.com/me?access_token=EAAsecret_MASKED&fields=id'
    );
    expect(logger.sanitizePayload('debug_token?input_token=ABC123')).toBe('debug_token?input_token=ABC123_MASKED');
  });

  it('masks long secret-bearing object keys while preserving the head and tail', () => {
    expect(logger.sanitizePayload({ access_token: 'EAAB1234567890xyz', id: '42' })).toEqual({
      access_token: 'EAAB12...0xyz (MASKED)',
      id: '42',
    });
  });

  it('fully masks short secret values', () => {
    expect(logger.sanitizePayload({ password: 'short' })).toEqual({ password: '***MASKED***' });
  });

  it('masks secrets nested in objects and arrays without mutating the input', () => {
    const input = { auth: { appsecret: 'abcdefghijklmnop' }, list: [{ secret: 'qrstuvwxyz012345' }] };
    const sanitized = logger.sanitizePayload(input);

    expect(sanitized.auth.appsecret).toContain('(MASKED)');
    expect(sanitized.list[0].secret).toContain('(MASKED)');
    expect(input.auth.appsecret).toBe('abcdefghijklmnop');
  });

  it('leaves non-string secret values alone', () => {
    expect(logger.sanitizePayload({ access_token: 12345 })).toEqual({ access_token: 12345 });
  });
});

describe('logMetaGraphApiCall', () => {
  it('creates the log file on first write and stores a sanitized entry', () => {
    const written = logger.logMetaGraphApiCall(baseEntry);

    expect(written).not.toBeNull();
    expect(written!.id).toMatch(/^log_\d+_[a-z0-9]+$/);
    expect(new Date(written!.timestamp).toString()).not.toBe('Invalid Date');
    expect(written!.fullUrl).toContain('EAAsecrettoken_MASKED');

    const logs = readLogFile();
    expect(logs).toHaveLength(1);
    expect(logs[0].endpoint).toBe('/v25.0/me');
  });

  it('prepends newer entries so the newest log is first', () => {
    logger.logMetaGraphApiCall({ ...baseEntry, endpoint: '/first' });
    logger.logMetaGraphApiCall({ ...baseEntry, endpoint: '/second' });

    expect(readLogFile().map((l: any) => l.endpoint)).toEqual(['/second', '/first']);
  });

  it('recovers from a corrupted log file instead of throwing', () => {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.writeFileSync(logFilePath, 'not-json', 'utf-8');

    expect(logger.logMetaGraphApiCall(baseEntry)).not.toBeNull();
    expect(readLogFile()).toHaveLength(1);
  });

  it('caps the log history at 500 entries', () => {
    const existing = Array.from({ length: 500 }, (_, i) => ({ ...baseEntry, id: `old_${i}`, endpoint: `/old_${i}` }));
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.writeFileSync(logFilePath, JSON.stringify(existing), 'utf-8');

    logger.logMetaGraphApiCall({ ...baseEntry, endpoint: '/newest' });

    const logs = readLogFile();
    expect(logs).toHaveLength(500);
    expect(logs[0].endpoint).toBe('/newest');
    expect(logs[499].endpoint).toBe('/old_498');
  });

  it('returns null and does not throw when the log file cannot be written', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => {
      throw new Error('EACCES');
    });

    expect(logger.logMetaGraphApiCall(baseEntry)).toBeNull();
  });
});

describe('getMetaGraphLogs', () => {
  const seed = () => {
    logger.logMetaGraphApiCall({ ...baseEntry, method: 'GET', endpoint: '/wabas', ok: true, responseStatus: 200 });
    logger.logMetaGraphApiCall({
      ...baseEntry,
      method: 'POST',
      endpoint: '/messages',
      ok: false,
      responseStatus: 400,
      responseBody: { error: { message: 'Invalid template' } },
    });
    logger.logMetaGraphApiCall({ ...baseEntry, method: 'DELETE', endpoint: '/templates', ok: true, responseStatus: 200 });
  };

  it('returns an empty result set when no logs exist', () => {
    expect(logger.getMetaGraphLogs()).toEqual({
      logs: [],
      totalCount: 0,
      totalPages: 1,
      currentPage: 1,
      limit: 15,
    });
  });

  it('returns all logs newest-first by default', () => {
    seed();
    const result = logger.getMetaGraphLogs();

    expect(result.totalCount).toBe(3);
    expect(result.logs.map((l) => l.endpoint)).toEqual(['/templates', '/messages', '/wabas']);
  });

  it('filters by HTTP method case-insensitively', () => {
    seed();
    expect(logger.getMetaGraphLogs({ method: 'post' }).logs.map((l) => l.endpoint)).toEqual(['/messages']);
  });

  it('filters by success and error status', () => {
    seed();
    expect(logger.getMetaGraphLogs({ status: 'SUCCESS' }).totalCount).toBe(2);
    expect(logger.getMetaGraphLogs({ status: 'ERROR' }).logs.map((l) => l.endpoint)).toEqual(['/messages']);
  });

  it('searches endpoints and response bodies', () => {
    seed();
    expect(logger.getMetaGraphLogs({ search: 'WABAS' }).totalCount).toBe(1);
    expect(logger.getMetaGraphLogs({ search: 'invalid template' }).logs[0].endpoint).toBe('/messages');
    expect(logger.getMetaGraphLogs({ search: 'no-such-thing' }).totalCount).toBe(0);
  });

  it('paginates results', () => {
    seed();
    const page2 = logger.getMetaGraphLogs({ page: 2, limit: 2 });

    expect(page2).toMatchObject({ totalCount: 3, totalPages: 2, currentPage: 2, limit: 2 });
    expect(page2.logs.map((l) => l.endpoint)).toEqual(['/wabas']);
  });

  it('falls back to an empty result set when the log file is unreadable', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    seed();
    fs.writeFileSync(logFilePath, '{corrupt', 'utf-8');

    expect(logger.getMetaGraphLogs()).toMatchObject({ logs: [], totalCount: 0 });
  });
});

describe('clearMetaGraphLogs', () => {
  it('empties the log history', () => {
    logger.logMetaGraphApiCall(baseEntry);

    expect(logger.clearMetaGraphLogs()).toEqual({ success: true });
    expect(readLogFile()).toEqual([]);
  });
});
