// lib/contacts/queries.ts
// Server-side read operations for Contacts module
// Decisions: D-102…D-108 (contact module), D-110 (label provenance)

import { createClient } from '@/lib/supabase/server';
import type { Contact } from '@/lib/types/inbox';

export interface ListContactsParams {
  tenantUid: string;
  limit?: number;
  cursor?: string;
  search?: string;
  optInStatus?: string[];
  labelUids?: string[];
}

export interface ListContactsResult {
  data: Contact[];
  count: number;
  cursor: string | null;
}

/**
 * List contacts with pagination, filtering, and label joins.
 * Uses contact_labels_active view (D-110) to exclude expired labels automatically.
 */
export async function listContacts(params: ListContactsParams): Promise<ListContactsResult> {
  const supabase = await createClient();

  let query = supabase
    .from('contacts')
    .select(
      `
      *,
      labels:contact_labels_active(
        label_uid,
        applied_at,
        expires_at,
        applied_by_module,
        label:labels(name, color)
      )
    `,
      { count: 'exact' }
    )
    .eq('tenant_uid', params.tenantUid)
    .order('created_at', { ascending: false })
    .limit(params.limit || 50);

  if (params.search) {
    query = query.or(`name.ilike.%${params.search}%,wa_phone.ilike.%${params.search}%,email.ilike.%${params.search}%`);
  }

  if (params.optInStatus?.length) {
    query = query.in('opt_in_status', params.optInStatus);
  }

  // Label filter: contacts with ANY of the specified labels
  if (params.labelUids?.length) {
    const { data: contactsWithLabels } = await supabase
      .from('contact_labels_active')
      .select('contact_uid')
      .eq('tenant_uid', params.tenantUid)
      .in('label_uid', params.labelUids);

    const contactUids = contactsWithLabels?.map((cl) => cl.contact_uid) || [];
    if (contactUids.length) {
      query = query.in('contact_uid', contactUids);
    } else {
      // No contacts match — return empty
      return { data: [], count: 0, cursor: null };
    }
  }

  if (params.cursor) {
    query = query.lt('created_at', params.cursor);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: (data as Contact[]) || [],
    count: count || 0,
    cursor: data?.length ? data[data.length - 1].created_at : null,
  };
}

/**
 * Get full contact detail with all related data:
 * - Labels (via contact_labels_active with provenance)
 * - Addresses
 * - Identifiers
 * - Activity timeline (pre-rendered titles, D-105)
 */
export async function getContactDetail(contactUid: string, tenantUid: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contacts')
    .select(
      `
      *,
      labels:contact_labels_active(
        label_uid,
        applied_at,
        expires_at,
        applied_by_module,
        applied_by_ref_uid,
        applied_by_uid,
        label:labels(name, color)
      ),
      addresses:contact_addresses(*),
      identifiers:contact_identifiers(*),
      activity:contact_activity(
        activity_uid,
        activity_type,
        title,
        occurred_at,
        detail,
        source_module
      )
    `
    )
    .eq('contact_uid', contactUid)
    .eq('tenant_uid', tenantUid)
    // D-105: timeline is reverse-chronological. Embedded resources need an explicit
    // order — without this the nested rows come back in arbitrary order.
    .order('occurred_at', { referencedTable: 'contact_activity', ascending: false })
    .limit(200, { referencedTable: 'contact_activity' })
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get consent history for a contact (append-only audit log, D-104)
 */
export async function getConsentHistory(contactUid: string, tenantUid: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('contact_consent_events')
    .select('*')
    .eq('contact_uid', contactUid)
    .eq('tenant_uid', tenantUid)
    .order('occurred_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get all labels for a tenant (for label picker)
 */
export async function getLabels(tenantUid: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('labels')
    .select('*')
    .eq('tenant_uid', tenantUid)
    .order('name');

  if (error) throw error;
  return data || [];
}

/**
 * Get custom field definitions for a tenant
 */
export async function getCustomFieldDefs(tenantUid: string, entityType: string = 'contact') {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('custom_field_defs')
    .select('*')
    .eq('tenant_uid', tenantUid)
    .eq('entity_type', entityType)
    .order('sort_order');

  if (error) throw error;
  return data || [];
}
