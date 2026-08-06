import { z } from 'zod';

// E.164 International Phone Regex
export const e164PhoneRegex = /^\+?[1-9]\d{1,14}$/;

// 1. Setup Wizard Input Schema
export const setupWizardSchema = z.object({
  masterAgencyName: z
    .string({ message: 'Master Agency Name is required' })
    .min(3, 'Master Agency Name must be at least 3 characters')
    .max(100, 'Master Agency Name cannot exceed 100 characters')
    .trim(),

  superAdminName: z
    .string({ message: 'Super Admin Name is required' })
    .min(2, 'Super Admin Name must be at least 2 characters')
    .max(100, 'Super Admin Name cannot exceed 100 characters')
    .trim(),

  superAdminEmail: z
    .string({ message: 'Super Admin Email is required' })
    .email('Please enter a valid RFC-compliant email address')
    .toLowerCase()
    .trim(),

  superAdminPhone: z
    .string({ message: 'Super Admin Phone is required' })
    .min(8, 'Phone number must be at least 8 digits')
    .refine((val) => val.replace(/\s/g, '').length >= 8, 'Invalid phone number format'),

  password: z
    .string({ message: 'Password is required' })
    .min(8, 'Password must be at least 8 characters long'),
});

// 2. WABA Phone Enrollment Input Schema
export const enrollPhoneSchema = z.object({
  waba_id: z.string({ message: 'WABA ID is required' }),
  phone_number_id: z.string().optional(),
  id: z.string().optional(),
  display_phone_number: z.string().optional(),
  verified_name: z.string().optional(),
  quality_rating: z.string().optional().default('GREEN'),
  code_verification_status: z.string().optional().default('VERIFIED'),
  messaging_limit_tier: z.string().optional().default('TIER_1K'),
  name_status: z.string().optional().default('APPROVED'),
  is_test_number: z.boolean().optional().default(false),

  // Parent WABA Metadata Fields
  waba_name: z.string().optional(),
  waba_currency: z.string().optional(),
  waba_timezone_id: z.string().optional(),
  waba_message_template_namespace: z.string().optional(),
  waba_account_review_status: z.string().optional(),
});

// 3. WhatsApp Template Saving Input Schema
export const saveTemplateSchema = z.object({
  waba_id: z.string().default('1048291048291001'),

  name: z
    .string({ message: 'Template name is required' })
    .min(1, 'Template name cannot be empty')
    .regex(/^[a-z0-9_]+$/, 'Template name must be lowercase snake_case (a-z, 0-9, _)'),

  language: z.string().default('en_US'),

  category: z
    .enum(['UTILITY', 'MARKETING', 'AUTHENTICATION', 'SANDBOX'], {
      message: 'Valid category group is required',
    })
    .default('UTILITY'),

  status: z.string().default('APPROVED'),
  components: z.array(z.any()).optional(),
});

// 4. Contact Form Input Schema (client-side UX validation for the contacts module)
//
// This mirrors the fields on `components/contacts/ContactForm.tsx`. It is a UX
// layer only — `lib/contacts/validation.ts` still validates every write on the
// server, and the API rejects bad input regardless of what the browser sent.
//
// Country is deliberately a closed set (R6). The literals are repeated here
// rather than imported from `lib/contacts/constants.ts` because that module
// pulls in the flag components, and this file is imported by server code.
export const contactFormSchema = z.object({
  waPhone: z
    .string({ message: 'WhatsApp number is required' })
    .min(1, 'WhatsApp number is required')
    .refine(
      (val) => e164PhoneRegex.test(val.replace(/[\s()-]/g, '')),
      'Enter a valid number with country code, e.g. +919876543210'
    ),

  name: z
    .string({ message: 'Name is required' })
    .min(2, 'Name must be at least 2 characters')
    .max(120, 'Name cannot exceed 120 characters')
    .trim(),

  email: z
    .string()
    .trim()
    .email('Please enter a valid email address')
    .optional()
    .or(z.literal('')),

  countryCode: z.enum(['IN', 'NP', 'US'], { message: 'Please select a country' }),

  preferredLanguage: z.string().trim().max(10).optional().or(z.literal('')),

  dateOfBirth: z
    .string()
    .optional()
    .or(z.literal(''))
    .refine(
      (val) => !val || new Date(val) <= new Date(),
      'Date of birth cannot be in the future'
    ),

  notes: z.string().trim().max(2000, 'Notes cannot exceed 2000 characters').optional().or(z.literal('')),
});

export type ContactFormValues = z.infer<typeof contactFormSchema>;

// 5. Label Creation Schema (used by POST /api/contacts/labels)
export const createLabelSchema = z.object({
  name: z
    .string({ message: 'Label name is required' })
    .min(1, 'Label name cannot be empty')
    .max(48, 'Label name cannot exceed 48 characters')
    .trim(),

  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #6366f1')
    .default('#6366f1'),
});
