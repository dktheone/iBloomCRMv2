// lib/contacts/mutations.ts
// Server-side write operations for Contacts module
// Decisions: D-032 (sticky opt-out), D-104 (consent events), D-106 (labels), D-110 (label provenance)

import { createClient } from '@/lib/supabase/server';
import type { Contact } from '@/lib/types/inbox';

export interface UpsertContactInput {
  tenantUid: string;
  waPhone: string;
  name?: string;
  email?: string;
  avatarUrl?: string;
  preferredLanguage?: string;
  countryCode?: string;
  timezone?: string;
  dateOfBirth?: string;
  customFields?: Record<string, unknown>;
  notes?: string;
  createdByUid?: string;
}

/**
 * Upsert contact (D-034: shared upsert path for all creators)
 * Deduplicates on (tenant_uid, wa_phone)
 */
export async function upsertContact(input: UpsertContactInput): Promise<Contact> {
  const supabase = await createClient();

  const payload = {
    tenant_uid: input.tenantUid,
    wa_phone: input.waPhone,
    name: input.name,
    email: input.email,
    avatar_url: input.avatarUrl,
    preferred_language: input.preferredLanguage,
    country_code: input.countryCode,
    timezone: input.timezone,
    date_of_birth: input.dateOfBirth,
    custom_fields: input.customFields || {},
    notes: input.notes,
    created_by_uid: input.createdByUid,
    last_activity_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('contacts')
    .upsert(payload, {
      onConflict: 'tenant_uid,wa_phone',
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Contact;
}

export interface ApplyLabelInput {
  tenantUid: string;
  contactUid: string;
  labelUid: string;
  appliedByUid?: string;
  appliedByModule?: string;
  appliedByRefUid?: string;
  expiresAt?: string;
}

/**
 * Apply label to contact with provenance (D-110)
 */
export async function applyLabel(input: ApplyLabelInput): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase.from('contact_labels').upsert(
    {
      tenant_uid: input.tenantUid,
      contact_uid: input.contactUid,
      label_uid: input.labelUid,
      applied_by_uid: input.appliedByUid,
      applied_by_module: input.appliedByModule || 'manual',
      applied_by_ref_uid: input.appliedByRefUid,
      expires_at: input.expiresAt,
      applied_at: new Date().toISOString(),
    },
    {
      onConflict: 'contact_uid,label_uid',
    }
  );

  if (error) throw error;
}

/**
 * Remove label from contact
 */
export async function removeLabel(contactUid: string, labelUid: string): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('contact_labels')
    .delete()
    .eq('contact_uid', contactUid)
    .eq('label_uid', labelUid);

  if (error) throw error;
}

export interface SetOptStatusInput {
  contactUid: string;
  tenantUid: string;
  status: 'unknown' | 'opted_in' | 'opted_out';
  source?: string;
}

/**
 * Set opt-in status (D-032: opt-out is terminal, sticky)
 * The trigger writes to contact_consent_events (D-104) — app code never writes there directly
 */
export async function setOptStatus(input: SetOptStatusInput): Promise<void> {
  const supabase = await createClient();

  if (input.status === 'opted_in' && !input.source) {
    throw new Error('opt_in_source required when opting in');
  }

  const payload: any = {
    opt_in_status: input.status,
  };

  if (input.status === 'opted_in') {
    payload.opt_in_source = input.source;
    payload.opt_in_at = new Date().toISOString();
  }

  if (input.status === 'opted_out') {
    payload.opt_out_at = new Date().toISOString();
  }

  // The trg_contacts_sticky_opt_out trigger writes to contact_consent_events (D-104)
  const { error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('contact_uid', input.contactUid)
    .eq('tenant_uid', input.tenantUid);

  if (error) throw error;
}

/**
 * Update contact custom fields
 * The guard trigger (D-111) prevents campaign-state keys
 */
export async function updateCustomFields(
  contactUid: string,
  tenantUid: string,
  customFields: Record<string, unknown>
): Promise<void> {
  const supabase = await createClient();

  const { error } = await supabase
    .from('contacts')
    .update({ custom_fields: customFields })
    .eq('contact_uid', contactUid)
    .eq('tenant_uid', tenantUid);

  if (error) throw error;
}

/**
 * Create label
 */
export async function createLabel(tenantUid: string, name: string, color: string = '#6366f1') {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('labels')
    .insert({
      tenant_uid: tenantUid,
      name,
      color,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}
