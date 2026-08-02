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
