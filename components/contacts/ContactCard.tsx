// components/contacts/ContactCard.tsx
// Left panel: Contact identity, avatar, phone, email, opt-in status badge

'use client';

import { Icon } from '@iconify/react';
import type { Contact } from '@/lib/types/inbox';

interface ContactCardProps {
  contact: Contact;
  onEdit?: () => void;
}

export default function ContactCard({ contact, onEdit }: ContactCardProps) {
  const initials = contact.name
    ? contact.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : '?';

  const optInStatusConfig = {
    opted_in: {
      label: 'Opted In',
      color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300',
      icon: 'solar:check-circle-bold',
    },
    opted_out: {
      label: 'Opted Out',
      color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300',
      icon: 'solar:close-circle-bold',
    },
    unknown: {
      label: 'Unknown',
      color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
      icon: 'solar:question-circle-bold',
    },
  };

  const statusInfo = optInStatusConfig[contact.opt_in_status];

  return (
    <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-6">
      {/* Avatar + Name */}
      <div className="flex flex-col items-center text-center space-y-4">
        <div className="w-24 h-24 rounded-full bg-gradient-to-br from-cyan-500 to-teal-600 text-white font-bold text-2xl grid place-items-center shadow-sm">
          {contact.avatar_url ? (
            <img src={contact.avatar_url} alt={contact.name || 'Contact'} className="w-full h-full rounded-full object-cover" />
          ) : (
            initials
          )}
        </div>

        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{contact.name || 'Unnamed Contact'}</h2>
          {contact.email && <p className="text-xs text-slate-500 dark:text-slate-400">{contact.email}</p>}
        </div>

        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="w-full py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
          >
            <Icon icon="solar:pen-bold" className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span>Edit Profile</span>
          </button>
        )}
      </div>

      {/* Contact Info */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
          <Icon icon="solar:phone-bold" className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <div className="flex-1">
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">WhatsApp Phone</div>
            <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">+{contact.wa_phone}</div>
          </div>
        </div>

        {contact.email && (
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
            <Icon icon="solar:letter-bold" className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
            <div className="flex-1">
              <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Email</div>
              <div className="text-sm font-mono text-slate-900 dark:text-white break-all">{contact.email}</div>
            </div>
          </div>
        )}

        {/* Opt-in Status Badge */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/50">
          <Icon icon={statusInfo.icon} className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
          <div className="flex-1">
            <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 uppercase">Consent Status</div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>
      </div>

      {/* Demographics */}
      {(contact.preferred_language || contact.country_code || contact.timezone || contact.date_of_birth) && (
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <h3 className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300 uppercase">Demographics</h3>
          <div className="space-y-1 text-xs">
            {contact.preferred_language && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Language:</span>
                <span className="font-mono text-slate-900 dark:text-white">{contact.preferred_language}</span>
              </div>
            )}
            {contact.country_code && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Country:</span>
                <span className="font-mono text-slate-900 dark:text-white">{contact.country_code}</span>
              </div>
            )}
            {contact.timezone && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Timezone:</span>
                <span className="font-mono text-slate-900 dark:text-white text-[10px]">{contact.timezone}</span>
              </div>
            )}
            {contact.date_of_birth && (
              <div className="flex justify-between">
                <span className="text-slate-500 dark:text-slate-400">Birthday:</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {new Date(contact.date_of_birth).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
        <div className="flex justify-between">
          <span>Created:</span>
          <span>{new Date(contact.created_at).toLocaleDateString()}</span>
        </div>
        {contact.last_activity_at && (
          <div className="flex justify-between">
            <span>Last Activity:</span>
            <span>{new Date(contact.last_activity_at).toLocaleDateString()}</span>
          </div>
        )}
      </div>
    </div>
  );
}
