import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
const from = vi.fn(() => ({ insert }));
const createAdminClient = vi.fn(() => ({ from }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient }));

const loadLogger = async () => (await import('@/lib/security/audit-logger')).logValidationFailure;

const failure = {
  formSurface: 'setup_wizard',
  rejectedField: 'superAdminEmail',
  failureReason: 'Invalid email address',
};

beforeEach(() => {
  vi.clearAllMocks();
  insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('logValidationFailure', () => {
  it('inserts the failure into validation_audit_logs with an ISO timestamp', async () => {
    const logValidationFailure = await loadLogger();

    await logValidationFailure({ ...failure, ipAddress: '10.0.0.5', userAgent: 'Vitest UA' });

    expect(from).toHaveBeenCalledWith('validation_audit_logs');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        form_surface: 'setup_wizard',
        rejected_field: 'superAdminEmail',
        failure_reason: 'Invalid email address',
        ip_address: '10.0.0.5',
        user_agent: 'Vitest UA',
      })
    );
    expect(new Date(insert.mock.calls[0][0].created_at).toString()).not.toBe('Invalid Date');
  });

  it('defaults the client fingerprint when it is unknown', async () => {
    const logValidationFailure = await loadLogger();

    await logValidationFailure(failure);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: '127.0.0.1', user_agent: 'Unknown Browser' })
    );
  });

  it('swallows Supabase failures so validation flows are never interrupted', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    insert.mockRejectedValue(new Error('relation does not exist'));
    const logValidationFailure = await loadLogger();

    await expect(logValidationFailure(failure)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('swallows admin client construction failures', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    createAdminClient.mockImplementationOnce(() => {
      throw new Error('missing service role key');
    });
    const logValidationFailure = await loadLogger();

    await expect(logValidationFailure(failure)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
