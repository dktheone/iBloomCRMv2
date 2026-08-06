'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Icon } from '@iconify/react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { ContactsToolbar } from '@/components/contacts/ContactsToolbar';
import { ContactEditModal } from '@/components/contacts/ContactEditModal';
import type { Contact } from '@/lib/types/inbox';

export default function ContactsPage() {
  const supabase = createClient();
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tenantUid, setTenantUid] = useState<string>('');
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('contacts')
        .select(`
          *,
          labels:contact_labels_active(
            label_uid,
            applied_at,
            expires_at,
            applied_by_module,
            label:labels(name, color)
          )
        `)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setContacts(data as Contact[]);
        if (data.length > 0) {
          setTenantUid(data[0].tenant_uid);
        }
      }
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [supabase]);

  // Load tenant_uid explicitly if no contacts exist yet
  useEffect(() => {
    async function fetchTenant() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: userTenant } = await supabase
          .from('user_tenants')
          .select('tenant_uid')
          .eq('user_uid', user.id)
          .maybeSingle();
        if (userTenant) setTenantUid(userTenant.tenant_uid);
      }
    }
    fetchTenant();
  }, [supabase]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Consent breakdown for the toolbar chips — computed from the rows already
  // loaded, so the chips can never disagree with the table below them.
  const stats = useMemo(
    () => ({
      total: contacts.length,
      optedIn: contacts.filter((c) => c.opt_in_status === 'opted_in').length,
      optedOut: contacts.filter((c) => c.opt_in_status === 'opted_out').length,
      unknown: contacts.filter((c) => c.opt_in_status === 'unknown').length,
    }),
    [contacts]
  );

  const filtered = contacts.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name?.toLowerCase().includes(q) ||
      c.wa_phone?.includes(q) ||
      c.email?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400">
            <span>Platform</span>
            <Icon icon="solar:alt-arrow-right-bold" className="w-3 h-3" />
            <span className="text-cyan-600 dark:text-cyan-400 font-semibold">Contacts Hub</span>
          </div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Contacts &amp; Audience Directory
          </h1>
        </div>
      </div>

      {/* Toolbar — actions + analysis (R1) */}
      <ContactsToolbar
        stats={stats}
        search={search}
        onSearchChange={setSearch}
        onRefresh={loadContacts}
        isLoading={isLoading}
      />

      {/* Contacts Table */}
      <div className="bg-white dark:bg-[#1A2232] border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-8 text-center space-y-2">
            <Icon icon="solar:restart-bold" className="w-6 h-6 animate-spin text-cyan-500 mx-auto" />
            <p className="text-xs text-slate-500 font-mono">Loading contacts directory...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <Icon icon="solar:users-group-two-rounded-bold-duotone" className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {search ? 'No contacts match your search' : 'No contacts yet'}
            </div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
              {search
                ? 'Try a different name, phone number, or email address.'
                : 'Add a contact by hand, import a CSV or Excel file, or wait for the first inbound WhatsApp message to create one automatically.'}
            </p>
            {!search && (
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/contacts/new')}
                  className="h-10 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-500 dark:hover:bg-cyan-600 text-white transition-colors flex items-center gap-2 text-xs font-bold"
                >
                  <Icon icon="solar:user-plus-bold" className="w-4 h-4" />
                  New Contact
                </button>
                <button
                  type="button"
                  onClick={() => router.push('/contacts/import')}
                  className="h-10 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 text-xs font-bold"
                >
                  <Icon icon="solar:upload-bold" className="w-4 h-4" />
                  Import Contacts
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-50 dark:bg-slate-900/80 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="p-4 font-bold">Contact Name</th>
                  <th className="p-4 font-bold">WhatsApp Phone</th>
                  <th className="p-4 font-bold">Opt-In Status</th>
                  <th className="p-4 font-bold">Labels</th>
                  <th className="p-4 font-bold">Created At</th>
                  <th className="p-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((c) => (
                  <tr
                    key={c.contact_uid}
                    onClick={() => router.push(`/contacts/${c.contact_uid}`)}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors cursor-pointer"
                  >
                    <td className="p-4 font-bold text-slate-900 dark:text-white font-sans flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-white font-bold text-xs grid place-items-center shrink-0">
                        {c.name ? c.name.slice(0, 2).toUpperCase() : '?'}
                      </div>
                      <span>{c.name || 'Unnamed'}</span>
                    </td>
                    <td className="p-4 text-cyan-600 dark:text-cyan-400 font-bold">
                      +{c.wa_phone}
                    </td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        c.opt_in_status === 'opted_in'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                          : c.opt_in_status === 'opted_out'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {c.opt_in_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {c.labels && c.labels.length > 0 ? (
                          c.labels.map((cl) => (
                            <span
                              key={cl.label_uid}
                              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px]"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: cl.label?.color || '#94a3b8' }}
                              />
                              {cl.label?.name ?? '—'}
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400 italic">None</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingContact(c);
                        }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors inline-flex items-center gap-1 text-xs font-sans font-bold"
                        title="Edit contact"
                      >
                        <Icon icon="solar:pen-bold" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                        <span>Edit</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Contact Pop-up Modal */}
      <ContactEditModal
        isOpen={!!editingContact}
        onClose={() => setEditingContact(null)}
        tenantUid={tenantUid}
        contact={editingContact}
        onSuccess={() => {
          loadContacts();
        }}
      />
    </div>
  );
}
