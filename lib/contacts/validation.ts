// lib/contacts/validation.ts
// Shared contact validation — used by the create form, the API routes, and CSV import.

import { z } from 'zod';

/**
 * WhatsApp phone. Meta requires E.164; we accept common human formatting on
 * input and normalize, then enforce 8–15 digits (ITU-T E.164 max is 15).
 */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const hadPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hadPlus ? `+${digits}` : digits;
}

export const waPhoneSchema = z
  .string()
  .trim()
  .min(1, 'WhatsApp phone is required')
  .transform(normalizePhone)
  .refine((v) => {
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }, 'WhatsApp phone must be 8–15 digits (E.164)');

const emptyToUndefined = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

export const contactInputSchema = z.object({
  waPhone: waPhoneSchema,
  name: z.string().trim().min(1, 'Name is required').max(200),
  email: z.preprocess(
    emptyToUndefined,
    z.string().email('Invalid email format').optional()
  ),
  preferredLanguage: z.preprocess(
    emptyToUndefined,
    z.string().max(10).optional()
  ),
  countryCode: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .length(2, 'Country must be a 2-letter ISO-3166-1 code')
      .transform((v) => v.toUpperCase())
      .optional()
  ),
  timezone: z.preprocess(emptyToUndefined, z.string().max(64).optional()),
  dateOfBirth: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD')
      .optional()
  ),
  notes: z.preprocess(emptyToUndefined, z.string().max(5000).optional()),
});

export type ContactInput = z.infer<typeof contactInputSchema>;

/**
 * Import rows may additionally carry a consent source. D-032: a row may only
 * arrive as opted_in if it names a source; opt-out is never settable by import
 * because it is terminal and needs explicit confirmation.
 */
export const importRowSchema = contactInputSchema.extend({
  optInSource: z.preprocess(emptyToUndefined, z.string().max(100).optional()),
});

export type ImportRow = z.infer<typeof importRowSchema>;

export interface RowError {
  row: number; // 1-based, matching the spreadsheet body
  field: string;
  message: string;
}

export interface ValidatedRows {
  valid: Array<{ row: number; data: ImportRow }>;
  errors: RowError[];
}

/**
 * Validate mapped import rows. Invalid rows are collected rather than thrown so
 * a single bad cell doesn't abort an otherwise good import.
 */
export function validateImportRows(
  records: Array<Record<string, string>>
): ValidatedRows {
  const valid: Array<{ row: number; data: ImportRow }> = [];
  const errors: RowError[] = [];

  records.forEach((record, idx) => {
    const rowNum = idx + 1;
    const result = importRowSchema.safeParse(record);

    if (result.success) {
      valid.push({ row: rowNum, data: result.data });
    } else {
      for (const issue of result.error.issues) {
        errors.push({
          row: rowNum,
          field: String(issue.path[0] ?? 'row'),
          message: issue.message,
        });
      }
    }
  });

  return { valid, errors };
}

/**
 * Flag duplicate phones inside a single upload. The DB upsert would silently
 * collapse these, so surface them as a warning instead of losing rows quietly.
 */
export function findDuplicatePhones(
  rows: Array<{ row: number; data: ImportRow }>
): Array<{ phone: string; rows: number[] }> {
  const byPhone = new Map<string, number[]>();

  for (const { row, data } of rows) {
    const existing = byPhone.get(data.waPhone);
    if (existing) existing.push(row);
    else byPhone.set(data.waPhone, [row]);
  }

  return [...byPhone.entries()]
    .filter(([, rowNums]) => rowNums.length > 1)
    .map(([phone, rowNums]) => ({ phone, rows: rowNums }));
}
