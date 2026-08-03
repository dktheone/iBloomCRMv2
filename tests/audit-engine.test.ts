import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recordAuditEvent } from '@/lib/security/audit-engine';

let tmpDir: string;

const auditDir = () => path.join(tmpDir, 'storage', 'logs', 'audit');
const todayFile = () => path.join(auditDir(), `${new Date().toISOString().split('T')[0]}.jsonl`);
const readEvents = () =>
  fs
    .readFileSync(todayFile(), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-engine-'));
  vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('recordAuditEvent', () => {
  it('creates the daily JSONL file and writes a fully populated event', async () => {
    const ok = await recordAuditEvent({
      tenantId: 'tenant-9',
      userId: 'user-9',
      eventType: 'ASSET_LOCK',
      targetId: 'phone_1',
      details: { waba_id: 'waba_1' },
      ipAddress: '10.0.0.1',
      userAgent: 'Vitest',
    });

    expect(ok).toBe(true);
    const [event] = readEvents();
    expect(event).toMatchObject({
      tenant_id: 'tenant-9',
      user_id: 'user-9',
      event_type: 'ASSET_LOCK',
      target_id: 'phone_1',
      details: { waba_id: 'waba_1' },
      ip_address: '10.0.0.1',
      user_agent: 'Vitest',
    });
    expect(event.id).toMatch(/^evt_\d+_[a-z0-9]+$/);
    expect(new Date(event.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('falls back to tenant-zero, super admin and server defaults', async () => {
    await recordAuditEvent({ eventType: 'TEMPLATE_SAVE', targetId: 'tpl_1' });

    expect(readEvents()[0]).toMatchObject({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      user_id: '11111111-1111-1111-1111-111111111111',
      details: {},
      ip_address: '127.0.0.1',
      user_agent: 'Server API',
    });
  });

  it('treats explicit nulls as missing values', async () => {
    await recordAuditEvent({
      tenantId: null,
      userId: null,
      ipAddress: null,
      userAgent: null,
      eventType: 'ASSET_DETACH',
      targetId: 'phone_2',
    });

    expect(readEvents()[0].ip_address).toBe('127.0.0.1');
  });

  it('appends subsequent events to the same daily file', async () => {
    await recordAuditEvent({ eventType: 'ASSET_PROVISION', targetId: 'phone_1' });
    await recordAuditEvent({ eventType: 'ASSET_LOCK', targetId: 'phone_1' });

    expect(readEvents().map((e) => e.event_type)).toEqual(['ASSET_PROVISION', 'ASSET_LOCK']);
  });

  it('returns false instead of throwing when the disk write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(fs.promises, 'appendFile').mockRejectedValue(new Error('ENOSPC'));

    await expect(recordAuditEvent({ eventType: 'ASSET_LOCK', targetId: 'phone_1' })).resolves.toBe(false);
  });
});
