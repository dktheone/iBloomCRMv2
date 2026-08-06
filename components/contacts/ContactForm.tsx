// components/contacts/ContactForm.tsx
// Contact creation/edit form — Phase 0.7 rewrite (R5, R6, R7, R8)

'use client';

import { Icon } from '@iconify/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { FormField } from '@/components/ui/FormField';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { CountrySelect } from '@/components/ui/CountrySelect';
import { LabelPicker } from '@/components/contacts/LabelPicker';
import { User, Mail, Calendar, FileText } from 'lucide-react';
import { contactFormSchema, type ContactFormValues } from '@/lib/validations/schemas';
import {
  DEFAULT_COUNTRY,
  DEFAULT_TIMEZONE,
  DEFAULT_TIMEZONE_LABEL,
  LANGUAGE_OPTIONS,
} from '@/lib/contacts/constants';
import type { Label } from '@/lib/types/inbox';

interface ContactFormProps {
  tenantUid: string;
  mode: 'create' | 'edit';
  initialData?: {
    contactUid?: string;
    name?: string;
    waPhone?: string;
    email?: string;
    preferredLanguage?: string;
    countryCode?: string;
    timezone?: string;
    dateOfBirth?: string;
    notes?: string;
    labelUids?: string[];
  };
  onSuccess?: (contact: any) => void;
  onCancel?: () => void;
}

export default function ContactForm({ tenantUid, mode, initialData, onSuccess, onCancel }: ContactFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ContactFormValues & { labelUids: string[] }>({
    name: initialData?.name || '',
    waPhone: initialData?.waPhone || '',
    email: initialData?.email || '',
    countryCode: (initialData?.countryCode as 'IN' | 'NP' | 'US') || DEFAULT_COUNTRY,
    preferredLanguage: initialData?.preferredLanguage || '',
    dateOfBirth: initialData?.dateOfBirth || '',
    notes: initialData?.notes || '',
    labelUids: initialData?.labelUids || [],
  });

  // Per-field errors (R5: setup page's validation pattern)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ContactFormValues, string>>>({});

  // Label picker modal visibility
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [labelsMap, setLabelsMap] = useState<Record<string, Label>>({});

  // Chips for pre-selected labels need names/colours before the modal is ever
  // opened, so fetch the tenant's labels once on mount in edit mode.
  useEffect(() => {
    if (!initialData?.labelUids?.length) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/contacts/labels');
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const map: Record<string, Label> = {};
        for (const l of (json.labels || []) as Label[]) map[l.label_uid] = l;
        setLabelsMap(map);
      } catch {
        // Non-fatal: chips just render empty until the picker is opened
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialData?.labelUids?.length]);

  function handleChange(field: keyof ContactFormValues, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    // R5: Zod validation (setup page pattern)
    const result = contactFormSchema.safeParse(formData);
    if (!result.success) {
      const errors: Partial<Record<keyof ContactFormValues, string>> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ContactFormValues;
        if (!errors[field]) errors[field] = issue.message;
      }
      setFieldErrors(errors);
      toast.error('Please fix the errors before submitting');
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: any = {
        tenantUid,
        waPhone: result.data.waPhone.trim(),
        name: result.data.name,
        email: result.data.email || undefined,
        preferredLanguage: result.data.preferredLanguage || undefined,
        countryCode: result.data.countryCode,
        timezone: DEFAULT_TIMEZONE, // R7: fixed IST
        dateOfBirth: result.data.dateOfBirth || undefined,
        notes: result.data.notes || undefined,
      };

      if (mode === 'edit' && initialData?.contactUid) {
        payload.contactUid = initialData.contactUid;
      }

      const response = await fetch('/api/contacts', {
        method: mode === 'create' ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save contact');
      }

      const { contact } = await response.json();

      // R8: Attach labels (manual source)
      if (formData.labelUids.length > 0) {
        await fetch(`/api/contacts/${contact.contact_uid}/labels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ add: formData.labelUids }),
        });
      }

      toast.success(mode === 'create' ? 'Contact created' : 'Contact updated');
      router.push(`/contacts/${contact.contact_uid}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unknown error');
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase">
            Basic Information
          </h2>

          {/* Name */}
          <FormField
            label="Name"
            icon={User}
            value={formData.name}
            onChange={(e) => handleChange('name', e.target.value)}
            error={fieldErrors.name}
            required
            placeholder="John Doe"
          />

          {/* WhatsApp Phone */}
          <PhoneInput
            label="WhatsApp Phone"
            value={formData.waPhone}
            onChange={(val) => handleChange('waPhone', val)}
            error={fieldErrors.waPhone}
            required
            disabled={mode === 'edit'}
            helperText={
              mode === 'edit'
                ? 'Phone cannot be changed (unique identifier)'
                : 'E.164 format: country code + number'
            }
          />

          {/* Email */}
          <FormField
            label="Email"
            icon={Mail}
            type="email"
            value={formData.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            error={fieldErrors.email}
            placeholder="john@example.com"
          />
        </div>

        {/* Demographics */}
        <div className="bg-white dark:bg-[#1A2232] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 space-y-5">
          <h2 className="text-sm font-mono font-bold text-slate-900 dark:text-white uppercase">
            Demographics (Optional)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Country (R6) */}
            <CountrySelect
              label="Country"
              value={formData.countryCode}
              onChange={(val) => handleChange('countryCode', val)}
              error={fieldErrors.countryCode}
            />

            {/* Language */}
            <FormField
              label="Preferred Language"
              error={fieldErrors.preferredLanguage}
              helperText="Used for template localization"
            >
              <select
                value={formData.preferredLanguage || ''}
                onChange={(e) => handleChange('preferredLanguage', e.target.value)}
                className="w-full h-10 px-3.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all"
              >
                <option value="">Select language...</option>
                {LANGUAGE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label} ({opt.value})
                  </option>
                ))}
              </select>
            </FormField>

            {/* Field 7: Date of Birth */}
            <FormField
              label="Date of Birth"
              error={fieldErrors.dateOfBirth}
              helperText="YYYY-MM-DD"
            >
              <div className="relative">
                <Calendar className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="date"
                  value={formData.dateOfBirth || ''}
                  onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all"
                />
              </div>
            </FormField>
          </div>

          {/* Field 8: Notes */}
          <FormField
            label="Internal Notes"
            error={fieldErrors.notes}
            helperText="Free text for team notes"
          >
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <textarea
                value={formData.notes || ''}
                onChange={(e) => handleChange('notes', e.target.value)}
                rows={3}
                placeholder="Add internal notes about this contact..."
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 transition-all resize-none"
              />
            </div>
          </FormField>

          {/* R8: Labels Card */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-slate-900 dark:text-white">
                  Labels
                </label>
                <p className="text-[10px] text-slate-500">
                  Categorise this contact for audience segmentation
                </p>
              </div>
              <button
                type="button"
                onClick={() => setLabelsOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5"
              >
                <Icon icon="solar:tag-bold" className="w-3.5 h-3.5 text-cyan-600" />
                <span>Manage Labels ({formData.labelUids.length})</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 min-h-[32px] items-center">
              {formData.labelUids.length === 0 ? (
                <span className="text-xs text-slate-400 italic font-mono">
                  No labels selected — click &quot;Manage Labels&quot; to pick or create
                </span>
              ) : (
                formData.labelUids.map((uid) => {
                  const lbl = labelsMap[uid];
                  return (
                    <span
                      key={uid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-800 dark:text-slate-200 shadow-xs"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: lbl?.color || '#06b6d4' }}
                      />
                      <span>{lbl?.name || 'Label'}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setFormData((prev) => ({
                            ...prev,
                            labelUids: prev.labelUids.filter((id) => id !== uid),
                          }))
                        }
                        className="text-slate-400 hover:text-rose-500 transition-colors ml-1"
                      >
                        <Icon icon="solar:close-circle-bold" className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={isSubmitting}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 disabled:bg-cyan-400 text-white text-sm font-bold transition-colors shadow-sm"
          >
            {isSubmitting ? (
              <>
                <Icon icon="solar:restart-bold" className="w-5 h-5 animate-spin" />
                {mode === 'create' ? 'Creating...' : 'Saving...'}
              </>
            ) : (
              <>
                <Icon icon="solar:check-circle-bold" className="w-5 h-5" />
                {mode === 'create' ? 'Create Contact' : 'Save Changes'}
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              if (onCancel) onCancel();
              else router.back();
            }}
            disabled={isSubmitting}
            className="px-6 py-3 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        {/* D-032 Note */}
        <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900">
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Consent note (D-032):</strong> New contacts default to{' '}
            <code className="px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900 font-mono">
              opt_in_status = &apos;unknown&apos;
            </code>
            . Explicit opt-in must be captured via a separate consent flow with a documented source.
          </p>
        </div>
      </form>

      {/* Label Picker Modal (R8) */}
      <LabelPicker
        open={labelsOpen}
        onClose={() => setLabelsOpen(false)}
        value={formData.labelUids}
        onChange={(uids) => setFormData((prev) => ({ ...prev, labelUids: uids }))}
        onLabelsLoaded={(labels) => {
          const map: Record<string, Label> = {};
          for (const l of labels) map[l.label_uid] = l;
          setLabelsMap(map);
        }}
      />
    </>
  );
}
