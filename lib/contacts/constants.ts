// lib/contacts/constants.ts
// Shared constants for the Contacts module.

import { IndiaFlagSvg, NepalFlagSvg, UsFlagSvg } from '@/components/ui/flags';

/**
 * IST, fixed for all manually-created contacts (R7).
 * IANA form, which is what Postgres and JS `Intl` both expect.
 * Note: this governs the *manual* form only — imported files may legitimately
 * carry other zones and the import path leaves them alone.
 */
export const DEFAULT_TIMEZONE = 'Asia/Kolkata';
export const DEFAULT_TIMEZONE_LABEL = 'IST (Asia/Kolkata)';

/** India is the default country in the contact form (R6). */
export const DEFAULT_COUNTRY = 'IN';

/**
 * The countries a contact may be assigned to. India first (default), then
 * Nepal, then the United States — the order requested in R6.
 * `code` is ISO 3166-1 alpha-2, matching `contacts.country_code CHAR(2)`.
 */
export const COUNTRY_OPTIONS = [
  { code: 'IN', name: 'India', dialCode: '+91', flagSvg: IndiaFlagSvg },
  { code: 'NP', name: 'Nepal', dialCode: '+977', flagSvg: NepalFlagSvg },
  { code: 'US', name: 'United States', dialCode: '+1', flagSvg: UsFlagSvg },
] as const;

export type CountryCode = (typeof COUNTRY_OPTIONS)[number]['code'];

/** Just the codes, for Zod enums and query validation. */
export const COUNTRY_CODE_VALUES = COUNTRY_OPTIONS.map((c) => c.code) as unknown as [
  CountryCode,
  ...CountryCode[],
];

/** Languages offered in the contact form's language select. */
export const LANGUAGE_OPTIONS = [
  { value: 'en', label: 'English' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ne', label: 'Nepali' },
  { value: 'bn', label: 'Bengali' },
  { value: 'ta', label: 'Tamil' },
  { value: 'te', label: 'Telugu' },
  { value: 'mr', label: 'Marathi' },
  { value: 'gu', label: 'Gujarati' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'ar', label: 'Arabic' },
] as const;

/**
 * Palette offered by the "create label" row in the label picker.
 * Matches the `labels.color` default (`#6366f1`) as the first entry.
 */
export const LABEL_COLORS = [
  '#6366f1', // indigo
  '#0891b2', // cyan
  '#059669', // emerald
  '#ca8a04', // amber
  '#dc2626', // red
  '#db2777', // pink
  '#7c3aed', // violet
  '#475569', // slate
] as const;

/** Provenance values written to `contact_labels.applied_by_module` (D-110). */
export const LABEL_MODULE_MANUAL = 'manual';
export const LABEL_MODULE_IMPORT = 'csv_import';
