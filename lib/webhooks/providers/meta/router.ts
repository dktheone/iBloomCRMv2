// lib/webhooks/providers/meta/router.ts
// Meta payload router: resolves tenant & line from phone_number_id and delegates to handlers.

import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookHandlerResult } from '@/lib/webhooks/core/types';
import { processInboundMessage } from './whatsapp/messages';
import { processStatusReceipt } from './whatsapp/statuses';
import { processUserPreferences } from './preferences';

export interface MetaWebhookPayload {
  object: string;
  entry?: Array<{
    id: string; // Meta WABA ID
    changes?: Array<{
      field: string;
      value: {
        messaging_product?: string;
        metadata?: {
          display_phone_number?: string;
          phone_number_id?: string;
        };
        contacts?: Array<{
          profile?: { name?: string };
          wa_id?: string;
        }>;
        messages?: Array<Record<string, any>>;
        statuses?: Array<Record<string, any>>;
        user_preferences?: Record<string, any>;
        event?: string;
        message_template_id?: string;
        reason?: string;
      };
    }>;
  }>;
}

/**
 * Route incoming Meta webhook payload entries.
 */
export async function routeMetaWebhook(rawPayload: MetaWebhookPayload): Promise<WebhookHandlerResult[]> {
  const supabase = createAdminClient();
  const results: WebhookHandlerResult[] = [];

  // Normalize Meta Developer Test Modal payload format (which lacks "entry" array wrapper)
  let payload = rawPayload;
  if (!payload.entry && (rawPayload as any).field && (rawPayload as any).value) {
    const fieldVal = (rawPayload as any).field;
    const valueObj = (rawPayload as any).value;
    payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: valueObj.metadata?.phone_number_id || 'test_waba_id',
          changes: [
            {
              field: fieldVal,
              value: valueObj,
            },
          ],
        },
      ],
    };
  }

  if (!payload.entry || !Array.isArray(payload.entry)) {
    return [{ success: false, status: 'dead_letter', error: 'Payload missing entry array' }];
  }

  for (const entry of payload.entry) {
    const wabaId = entry.id;
    const changes = entry.changes || [];

    for (const change of changes) {
      const field = change.field;
      const val = change.value;

      // 1. Resolve Tenant & Phone Line by phone_number_id (if present)
      let tenantUid: string | null = null;
      let phoneLineUid: string | null = null;
      const metaPhoneNumberId = val.metadata?.phone_number_id;

      if (metaPhoneNumberId) {
        const { data: phoneLine } = await supabase
          .from('wa_phone_numbers')
          .select('phone_line_uid, tenant_uid')
          .eq('meta_phone_number_id', metaPhoneNumberId)
          .maybeSingle();

        if (phoneLine) {
          tenantUid = phoneLine.tenant_uid;
          phoneLineUid = phoneLine.phone_line_uid;
        }
      }

      // If tenant resolution fails for message/status field, check if it's Meta Test Modal dummy ID
      if (!tenantUid && ['messages', 'statuses'].includes(field)) {
        if (metaPhoneNumberId === '123456123' || metaPhoneNumberId?.startsWith('12345')) {
          results.push({
            success: true,
            status: 'processed',
            external_event_id: metaPhoneNumberId,
            details: { note: 'Meta Developer Test Modal Sample Payload' },
          });
          continue;
        }

        console.warn(`[Meta Webhook Router] Could not resolve tenant for phone_number_id: ${metaPhoneNumberId}`);
        results.push({
          success: false,
          status: 'unresolved_tenant',
          error: `Unregistered phone_number_id: ${metaPhoneNumberId}`,
        });
        continue;
      }

      // 2. Handle Inbound Messages
      if (val.messages && Array.isArray(val.messages) && tenantUid && phoneLineUid) {
        const contactProfile = val.contacts?.[0]?.profile;
        for (const msgPayload of val.messages) {
          const res = await processInboundMessage({
            tenantUid,
            phoneLineUid,
            wabaUid: wabaId,
            payloadMessage: msgPayload,
            contactProfile,
          });
          results.push(res);
        }
      }

      // 3. Handle Status Receipts (sent, delivered, read, failed)
      if (val.statuses && Array.isArray(val.statuses) && tenantUid && phoneLineUid) {
        for (const statusPayload of val.statuses) {
          const res = await processStatusReceipt({
            tenantUid,
            phoneLineUid,
            payloadStatus: statusPayload,
          });
          results.push(res);
        }
      }

      // 4. Handle User Preferences (Marketing Opt-out)
      if (val.user_preferences && tenantUid) {
        const res = await processUserPreferences({
          tenantUid,
          payloadPreference: val.user_preferences,
        });
        results.push(res);
      }

      // 5. Handle Template Status Updates (APPROVED, REJECTED, etc.)
      if (field === 'message_template_status_update' && val.message_template_id) {
        const eventStatus = val.event || 'UPDATED';
        await supabase
          .from('wa_templates')
          .update({ status: eventStatus, updated_at: new Date().toISOString() })
          .eq('meta_template_id', val.message_template_id);

        results.push({
          success: true,
          status: 'processed',
          external_event_id: val.message_template_id,
        });
      }
    }
  }

  if (results.length === 0) {
    results.push({ success: true, status: 'processed', details: { note: 'No actionable entries found' } });
  }

  return results;
}
