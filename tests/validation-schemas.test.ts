import { describe, expect, it } from 'vitest';
import {
  e164PhoneRegex,
  enrollPhoneSchema,
  saveTemplateSchema,
  setupWizardSchema,
} from '@/lib/validations/schemas';

const validWizardInput = {
  masterAgencyName: 'iBloom Master Agency',
  superAdminName: 'DK',
  superAdminEmail: 'CRM@iBloomSolutions.com',
  superAdminPhone: '+91 9532358574',
  password: 'ChangeMe123!',
};

describe('e164PhoneRegex', () => {
  it.each(['+919532358574', '919532358574', '+14155552671'])('accepts %s', (phone) => {
    expect(e164PhoneRegex.test(phone)).toBe(true);
  });

  it.each(['+0919532358574', '+91 9532358574', '', 'abc', '+1'])('rejects %s', (phone) => {
    expect(e164PhoneRegex.test(phone)).toBe(false);
  });
});

describe('setupWizardSchema', () => {
  it('normalizes a valid payload by trimming and lowercasing the email', () => {
    const parsed = setupWizardSchema.parse({
      ...validWizardInput,
      masterAgencyName: '  iBloom Master Agency  ',
    });

    expect(parsed.masterAgencyName).toBe('iBloom Master Agency');
    expect(parsed.superAdminEmail).toBe('crm@ibloomsolutions.com');
  });

  it.each([
    ['masterAgencyName', 'ab', 'at least 3 characters'],
    ['superAdminName', 'D', 'at least 2 characters'],
    ['superAdminEmail', 'not-an-email', 'valid RFC-compliant email'],
    ['superAdminPhone', '12345', 'at least 8 digits'],
    ['password', 'short', 'at least 8 characters'],
  ])('rejects an invalid %s', (field, value, message) => {
    const result = setupWizardSchema.safeParse({ ...validWizardInput, [field]: value });

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toContain(message);
  });

  it('rejects agency and admin names longer than 100 characters', () => {
    const tooLong = 'a'.repeat(101);
    expect(setupWizardSchema.safeParse({ ...validWizardInput, masterAgencyName: tooLong }).success).toBe(false);
    expect(setupWizardSchema.safeParse({ ...validWizardInput, superAdminName: tooLong }).success).toBe(false);
  });

  it('rejects whitespace-padded phone numbers with fewer than 8 digits', () => {
    expect(setupWizardSchema.safeParse({ ...validWizardInput, superAdminPhone: '+9 1 9 5 3' }).success).toBe(false);
  });

  it('rejects a payload missing required fields', () => {
    const result = setupWizardSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.error!.issues).toHaveLength(5);
  });
});

describe('enrollPhoneSchema', () => {
  it('applies Meta-healthy defaults when only the WABA id is provided', () => {
    expect(enrollPhoneSchema.parse({ waba_id: 'waba_1' })).toMatchObject({
      waba_id: 'waba_1',
      quality_rating: 'GREEN',
      code_verification_status: 'VERIFIED',
      messaging_limit_tier: 'TIER_1K',
      name_status: 'APPROVED',
      is_test_number: false,
    });
  });

  it('preserves provided Meta attributes and parent WABA metadata', () => {
    const parsed = enrollPhoneSchema.parse({
      waba_id: 'waba_1',
      phone_number_id: 'phone_1',
      quality_rating: 'YELLOW',
      is_test_number: true,
      waba_name: 'iBloom WABA',
      waba_timezone_id: '71',
    });

    expect(parsed).toMatchObject({
      quality_rating: 'YELLOW',
      is_test_number: true,
      waba_name: 'iBloom WABA',
      waba_timezone_id: '71',
    });
  });

  it('requires waba_id and rejects wrongly typed fields', () => {
    expect(enrollPhoneSchema.safeParse({}).success).toBe(false);
    expect(enrollPhoneSchema.safeParse({ waba_id: 'waba_1', is_test_number: 'yes' }).success).toBe(false);
  });
});

describe('saveTemplateSchema', () => {
  it('applies template defaults for a minimal payload', () => {
    expect(saveTemplateSchema.parse({ name: 'order_update_v2' })).toEqual({
      waba_id: '1048291048291001',
      name: 'order_update_v2',
      language: 'en_US',
      category: 'UTILITY',
      status: 'APPROVED',
    });
  });

  it.each(['UTILITY', 'MARKETING', 'AUTHENTICATION', 'SANDBOX'])('accepts the %s category', (category) => {
    expect(saveTemplateSchema.parse({ name: 'x_1', category }).category).toBe(category);
  });

  it('rejects an unknown category', () => {
    const result = saveTemplateSchema.safeParse({ name: 'x_1', category: 'PROMO' });

    expect(result.success).toBe(false);
    expect(result.error!.issues[0].message).toContain('Valid category group is required');
  });

  it.each(['Order_Update', 'order update', 'order-update', 'órder'])(
    'rejects the non snake_case template name %s',
    (name) => {
      const result = saveTemplateSchema.safeParse({ name });

      expect(result.success).toBe(false);
      expect(result.error!.issues[0].message).toContain('lowercase snake_case');
    }
  );

  it('rejects an empty or missing template name', () => {
    expect(saveTemplateSchema.safeParse({ name: '' }).success).toBe(false);
    expect(saveTemplateSchema.safeParse({}).success).toBe(false);
  });

  it('keeps arbitrary component payloads untouched', () => {
    const components = [{ type: 'BODY', text: 'Hello {{1}}' }];

    expect(saveTemplateSchema.parse({ name: 'hello_world', components }).components).toEqual(components);
  });
});
