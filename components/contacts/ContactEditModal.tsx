// components/contacts/ContactEditModal.tsx
// Pop-up modal for inline contact editing (R9)

'use client';

import React from 'react';
import ContactForm from '@/components/contacts/ContactForm';
import type { Contact } from '@/lib/types/inbox';

interface ContactEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  tenantUid: string;
  contact: Contact | null;
  onSuccess: (updatedContact: any) => void;
}

export const ContactEditModal: React.FC<ContactEditModalProps> = ({
  isOpen,
  onClose,
  tenantUid,
  contact,
  onSuccess,
}) => {
  if (!isOpen || !contact) return null;

  const initialLabelUids = (contact.labels || []).map((cl: any) => cl.label_uid);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fadeIn">
      <div 
        className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#1A2232] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-2 sm:p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <ContactForm
          tenantUid={tenantUid}
          mode="edit"
          initialData={{
            contactUid: contact.contact_uid,
            name: contact.name || '',
            waPhone: contact.wa_phone || '',
            email: contact.email || '',
            preferredLanguage: contact.preferred_language || '',
            countryCode: (contact.country_code as 'IN' | 'NP' | 'US') || 'IN',
            timezone: contact.timezone || 'Asia/Kolkata',
            dateOfBirth: contact.date_of_birth || '',
            notes: contact.notes || '',
            labelUids: initialLabelUids,
          }}
          onSuccess={(updated) => {
            onSuccess(updated);
            onClose();
          }}
          onCancel={onClose}
        />
      </div>
    </div>
  );
};
