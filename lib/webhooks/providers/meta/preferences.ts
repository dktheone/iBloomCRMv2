// lib/webhooks/providers/meta/preferences.ts
// Compliance processor for Meta platform user_preferences (marketing opt-out / stop events).

import { createAdminClient } from '@/lib/supabase/admin';
import { WebhookHandlerResult } from '@/lib/webhooks/core/types';
import { normalizeToE164 } from './whatsapp/messages';

export interface ProcessUserPreferencesParams {
  tenantUid: string;
  payloadPreference: Record<string, any>;
}

/**
 * Handle platform native user_preferences (marketing opt-out / resume).
 */
export async function processUserPreferences(params: ProcessUserPreferencesParams): Promise<WebhookHandlerResult> {
  const supabase = createAdminClient();
  const { tenantUid, payloadPreference } = params;

  const rawPhone = payloadPreference.wa_phone || payloadPreference.from || '';
  const action = payloadPreference.action || payloadPreference.type; // 'stop' | 'resume'

  if (!rawPhone || !action) {
    return {
      success: false,
      status: 'dead_letter',
      error: 'Missing wa_phone or action in user_preferences payload',
    };
  }

  const waPhone = normalizeToE164(rawPhone);
  const isOptOut = action.toLowerCase() === 'stop';

  try {
    const { error } = await supabase
      .from('contacts')
      .update({
        opt_in_status: isOptOut ? 'opted_out' : 'opted_in',
        updated_at: new Date().toISOString(),
      })
      .match({ tenant_uid: tenantUid, wa_phone: waPhone });

    if (error) {
      return {
        success: false,
        status: 'dead_letter',
        error: `Failed to update contact opt-in status: ${error.message}`,
      };
    }

    return {
      success: true,
      status: 'processed',
      tenant_uid: tenantUid,
    };
  } catch (err) {
    return {
      success: false,
      status: 'dead_letter',
      error: err instanceof Error ? err.message : 'Unknown preferences error',
    };
  }
}
