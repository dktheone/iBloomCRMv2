// components/contacts/ContactSidebar.tsx
// Right panel: Labels, custom fields, addresses, identifiers

'use client';

import { Icon } from '@iconify/react';
import type { Contact } from '@/lib/types/inbox';

interface ContactSidebarProps {
  contact: Contact & {
    labels?: Array<{
      label_uid: string;
      applied_at: string;
      expires_at?: string | null;
      applied_by_module?: string | null;
      applied_by_ref_uid?: string | null;
      label?: { name: string; color?: string | null };
    }>;
    addresses?: Array<{
      address_uid: string;
      label?: string | null;
      line1: string;
      line2?: string | null;
      city?: string | null;
      state?: string | null;
      pincode?: string | null;
      country_code?: string | null;
      is_primary: boolean;
    }>;
    identifiers?: Array<{
      identifier_uid: string;
      channel: string;
      value: string;
      is_verified: boolean;
    }>;
  };
  customFieldDefs: Array<{
    field_def_uid: string;
    field_key: string;
    label: string;
    field_type: string;
    is_standard: boolean;
    is_required: boolean;
  }>;
  tenantUid: string;
}

export default function ContactSidebar({ contact, customFieldDefs }: ContactSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Labels Section */}
      <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase">Labels</h3>
          <button className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1">
            <Icon icon="solar:add-circle-bold" className="w-3 h-3" />
            Add
          </button>
        </div>

        {contact.labels && contact.labels.length > 0 ? (
          <div className="space-y-2">
            {contact.labels.map((cl) => (
              <div
                key={cl.label_uid}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="text-xs font-bold px-2 py-1 rounded"
                    style={{
                      backgroundColor: cl.label?.color || '#6366f1',
                      color: '#fff',
                    }}
                  >
                    {cl.label?.name || 'Unknown'}
                  </span>
                  <button className="text-slate-400 hover:text-rose-600">
                    <Icon icon="solar:trash-bin-minimalistic-bold" className="w-3 h-3" />
                  </button>
                </div>

                {/* Provenance (D-110) */}
                <div className="text-[9px] font-mono text-slate-500 dark:text-slate-400 space-y-0.5">
                  <div>Applied: {new Date(cl.applied_at).toLocaleDateString()}</div>
                  {cl.applied_by_module && (
                    <div>
                      via {cl.applied_by_module}
                      {cl.applied_by_ref_uid && ` • ${cl.applied_by_ref_uid.slice(0, 8)}`}
                    </div>
                  )}
                  {cl.expires_at && <div>Expires: {new Date(cl.expires_at).toLocaleDateString()}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">No labels assigned</p>
        )}
      </div>

      {/* Custom Fields Section */}
      {customFieldDefs.length > 0 && (
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase">Custom Fields</h3>
          </div>

          <div className="space-y-2">
            {customFieldDefs.map((def) => {
              const value = contact.custom_fields?.[def.field_key];
              return (
                <div key={def.field_def_uid} className="flex justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">{def.label}:</span>
                  <span className="font-mono text-slate-900 dark:text-white">
                    {value !== undefined && value !== null ? String(value) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Addresses Section */}
      {contact.addresses && contact.addresses.length > 0 && (
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <h3 className="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase mb-3">Addresses</h3>
          <div className="space-y-3">
            {contact.addresses.map((addr) => (
              <div
                key={addr.address_uid}
                className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 space-y-1"
              >
                {addr.label && (
                  <div className="text-[10px] font-mono font-bold text-cyan-600 dark:text-cyan-400 uppercase">
                    {addr.label}
                    {addr.is_primary && ' (Primary)'}
                  </div>
                )}
                <div className="text-xs text-slate-900 dark:text-white">
                  <div>{addr.line1}</div>
                  {addr.line2 && <div>{addr.line2}</div>}
                  <div>
                    {[addr.city, addr.state, addr.pincode].filter(Boolean).join(', ')}
                  </div>
                  {addr.country_code && <div>{addr.country_code}</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Identifiers Section */}
      {contact.identifiers && contact.identifiers.length > 0 && (
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4">
          <h3 className="text-xs font-mono font-bold text-slate-900 dark:text-white uppercase mb-3">Identifiers</h3>
          <div className="space-y-2">
            {contact.identifiers.map((ident) => (
              <div
                key={ident.identifier_uid}
                className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-900/50"
              >
                <div className="text-xs">
                  <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">
                    {ident.channel}
                  </div>
                  <div className="font-mono text-slate-900 dark:text-white">{ident.value}</div>
                </div>
                {ident.is_verified && (
                  <Icon icon="solar:check-circle-bold" className="w-4 h-4 text-emerald-500" />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
