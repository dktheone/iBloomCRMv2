// lib/contacts/contact-resolver.ts
// Unified Contact & Conversation Resolver to prevent split chats across +E.164 and raw digit formats.

import { SupabaseClient } from '@supabase/supabase-js';

export interface ResolveContactParams {
  tenantUid: string;
  phoneLineUid: string;
  rawPhone: string;
  contactName?: string;
  isInbound?: boolean;
}

export interface ResolvedContactAndConversation {
  contact: {
    contact_uid: string;
    name: string;
    wa_phone: string;
    opt_in_status?: string;
  };
  conversation: {
    conversation_uid: string;
    window_expires_at?: string | null;
    lifecycle_status?: string;
  };
}

/**
 * Normalizes phone number to canonical +E.164 format while generating query variants.
 */
export function getPhoneVariants(rawPhone: string) {
  const digits = rawPhone.replace(/\D/g, '');
  return {
    canonical: `+${digits}`,
    rawDigits: digits,
  };
}

/**
 * Resolves or creates a single unified contact and conversation.
 * Guarantees that +91... and 91... map to the exact same contact and conversation thread.
 */
export async function resolveUnifiedContactAndConversation(
  supabase: SupabaseClient,
  params: ResolveContactParams
): Promise<ResolvedContactAndConversation> {
  const { tenantUid, phoneLineUid, rawPhone, contactName, isInbound } = params;
  const { canonical, rawDigits } = getPhoneVariants(rawPhone);

  // 1. Find existing contact by either +E.164 or raw digits
  let { data: contact } = await supabase
    .from('contacts')
    .select('contact_uid, name, wa_phone, opt_in_status')
    .eq('tenant_uid', tenantUid)
    .or(`wa_phone.eq.${canonical},wa_phone.eq.${rawDigits}`)
    .limit(1)
    .maybeSingle();

  // If not found, insert with canonical format
  if (!contact) {
    const { data: newContact, error: createErr } = await supabase
      .from('contacts')
      .insert({
        tenant_uid: tenantUid,
        wa_phone: canonical,
        name: contactName || canonical,
      })
      .select('contact_uid, name, wa_phone, opt_in_status')
      .single();

    if (createErr) {
      // Handle potential race condition on unique index
      const { data: retryContact } = await supabase
        .from('contacts')
        .select('contact_uid, name, wa_phone, opt_in_status')
        .eq('tenant_uid', tenantUid)
        .or(`wa_phone.eq.${canonical},wa_phone.eq.${rawDigits}`)
        .limit(1)
        .maybeSingle();

      if (retryContact) {
        contact = retryContact;
      } else {
        throw createErr;
      }
    } else {
      contact = newContact;
    }
  } else {
    // If contact was saved without +, standardize it to canonical + format
    if (contact.wa_phone !== canonical) {
      await supabase
        .from('contacts')
        .update({ wa_phone: canonical, updated_at: new Date().toISOString() })
        .eq('contact_uid', contact.contact_uid);
      contact.wa_phone = canonical;
    }
  }

  if (!contact) {
    throw new Error(`Failed to resolve contact for phone: ${rawPhone}`);
  }

  // 2. Find or create single unified Conversation
  let { data: conversation } = await supabase
    .from('conversations')
    .select('conversation_uid, window_expires_at, lifecycle_status')
    .eq('tenant_uid', tenantUid)
    .eq('contact_uid', contact.contact_uid)
    .eq('phone_line_uid', phoneLineUid)
    .maybeSingle();

  // If not found directly, check for legacy duplicate contact conversations for this phone number
  if (!conversation) {
    const { data: legacyContacts } = await supabase
      .from('contacts')
      .select('contact_uid')
      .eq('tenant_uid', tenantUid)
      .or(`wa_phone.eq.${canonical},wa_phone.eq.${rawDigits}`);

    const legacyUids = (legacyContacts || []).map((c: any) => c.contact_uid);
    if (legacyUids.length > 0) {
      const { data: legacyConv } = await supabase
        .from('conversations')
        .select('conversation_uid, window_expires_at, lifecycle_status')
        .eq('tenant_uid', tenantUid)
        .in('contact_uid', legacyUids)
        .eq('phone_line_uid', phoneLineUid)
        .limit(1)
        .maybeSingle();

      if (legacyConv) {
        // Point legacy conversation to this canonical contact
        await supabase
          .from('conversations')
          .update({ contact_uid: contact.contact_uid, updated_at: new Date().toISOString() })
          .eq('conversation_uid', legacyConv.conversation_uid);

        conversation = legacyConv;
      }
    }
  }

  // If still no conversation, upsert one
  if (!conversation) {
    const now = new Date();
    const windowExpiry = isInbound
      ? new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data: newConv, error: convErr } = await supabase
      .from('conversations')
      .upsert(
        {
          tenant_uid: tenantUid,
          contact_uid: contact.contact_uid,
          phone_line_uid: phoneLineUid,
          lifecycle_status: 'open',
          bot_control: 'agent',
          last_inbound_at: isInbound ? now.toISOString() : null,
          window_expires_at: windowExpiry,
          updated_at: now.toISOString(),
        },
        { onConflict: 'tenant_uid,contact_uid,phone_line_uid' }
      )
      .select('conversation_uid, window_expires_at, lifecycle_status')
      .single();

    if (convErr) {
      throw convErr;
    }
    conversation = newConv;
  } else if (isInbound) {
    // If inbound message arrives, update window_expires_at to +24 hours
    const now = new Date();
    const windowExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from('conversations')
      .update({
        last_inbound_at: now.toISOString(),
        window_expires_at: windowExpiry,
        lifecycle_status: 'open',
        updated_at: now.toISOString(),
      })
      .eq('conversation_uid', conversation.conversation_uid);

    conversation.window_expires_at = windowExpiry;
  }

  return { contact, conversation };
}
