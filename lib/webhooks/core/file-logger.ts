// lib/webhooks/core/file-logger.ts
// Independent filesystem JSON logger for raw webhooks (zero database dependency during testing).

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { WebhookEventRecord, WebhookEventStatus, WebhookProvider, WebhookSubProvider } from './types';

const LOG_FILE_PATH = path.join(process.cwd(), 'data', 'webhook_raw_logs.json');
const MAX_LOG_ENTRIES = 200;

export interface WebhookFileLogEntry {
  event_uid: string;
  provider: WebhookProvider;
  sub_provider: WebhookSubProvider;
  event_type: string;
  external_event_id?: string | null;
  headers: Record<string, string>;
  query_params?: Record<string, string>;
  method: 'GET' | 'POST';
  payload: Record<string, any>;
  raw_body?: string;
  status: WebhookEventStatus;
  error_message?: string | null;
  received_at: string;
}

/**
 * Ensures the data directory and JSON log file exist.
 */
function ensureLogFile(): void {
  const dir = path.dirname(LOG_FILE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE_PATH)) {
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify([], null, 2), 'utf-8');
  }
}

/**
 * Appends a raw webhook event to data/webhook_raw_logs.json.
 * Keeps the most recent MAX_LOG_ENTRIES (default 200).
 */
export function logWebhookToFile(entry: Omit<WebhookFileLogEntry, 'event_uid' | 'received_at'>): WebhookFileLogEntry {
  try {
    ensureLogFile();

    const fullEntry: WebhookFileLogEntry = {
      event_uid: crypto.randomUUID(),
      received_at: new Date().toISOString(),
      ...entry,
    };

    let logs: WebhookFileLogEntry[] = [];
    try {
      const content = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
      logs = JSON.parse(content || '[]');
      if (!Array.isArray(logs)) logs = [];
    } catch {
      logs = [];
    }

    // Prepend new entry to top
    logs.unshift(fullEntry);

    // Limit to latest entries
    if (logs.length > MAX_LOG_ENTRIES) {
      logs = logs.slice(0, MAX_LOG_ENTRIES);
    }

    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(logs, null, 2), 'utf-8');
    console.log(`[Webhook File Logger] Saved event ${fullEntry.event_uid} (${fullEntry.event_type}) to ${LOG_FILE_PATH}`);

    return fullEntry;
  } catch (err) {
    console.error('[Webhook File Logger Error]', err);
    return {
      event_uid: crypto.randomUUID(),
      received_at: new Date().toISOString(),
      ...entry,
    };
  }
}

/**
 * Reads logged webhook events from data/webhook_raw_logs.json.
 * Converts to WebhookEventRecord format expected by the UI.
 */
export function getWebhookFileLogs(provider?: string, limit: number = 100): WebhookEventRecord[] {
  try {
    ensureLogFile();
    const content = fs.readFileSync(LOG_FILE_PATH, 'utf-8');
    const logs: WebhookFileLogEntry[] = JSON.parse(content || '[]');

    if (!Array.isArray(logs)) return [];

    let filtered = logs;
    if (provider && provider !== 'all') {
      filtered = filtered.filter((log) => log.provider === provider);
    }

    return filtered.slice(0, limit).map((log) => ({
      event_uid: log.event_uid,
      tenant_uid: null,
      provider: log.provider,
      sub_provider: log.sub_provider,
      phone_line_uid: null,
      event_type: log.event_type,
      external_event_id: log.external_event_id || null,
      payload: log.payload,
      status: log.status,
      error_message: log.error_message || null,
      attempts: 1,
      received_at: log.received_at,
    }));
  } catch (err) {
    console.error('[Webhook File Logger Read Error]', err);
    return [];
  }
}
