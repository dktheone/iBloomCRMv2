import fs from 'fs';
import path from 'path';

export interface AuditEventPayload {
  tenantId?: string | null;
  userId?: string | null;
  eventType: string; // e.g. ASSET_PROVISION, ASSET_LOCK, ASSET_DETACH, TEMPLATE_SAVE, TEMPLATE_DELETE
  targetId: string; // phone_number_id, template_id, waba_id, etc.
  details?: Record<string, any>;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Record an audit log event to daily append-only log files on VPS disk (Option 1).
 * Zero Supabase DB load or storage costs.
 */
export async function recordAuditEvent(payload: AuditEventPayload): Promise<boolean> {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const logsDir = path.join(process.cwd(), 'storage', 'logs', 'audit');

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    const logFilePath = path.join(logsDir, `${today}.jsonl`);

    const eventRecord = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      tenant_id: payload.tenantId || '00000000-0000-0000-0000-000000000000',
      user_id: payload.userId || '11111111-1111-1111-1111-111111111111',
      event_type: payload.eventType,
      target_id: payload.targetId,
      details: payload.details || {},
      ip_address: payload.ipAddress || '127.0.0.1',
      user_agent: payload.userAgent || 'Server API',
    };

    const line = JSON.stringify(eventRecord) + '\n';
    await fs.promises.appendFile(logFilePath, line, 'utf8');

    return true;
  } catch (err) {
    console.error('[Audit Engine Exception]: Failed to write audit event log to disk:', err);
    return false;
  }
}
