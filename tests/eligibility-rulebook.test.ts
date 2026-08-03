import { describe, expect, it } from 'vitest';
import {
  evaluatePhoneLineEligibility,
  type MetaPhoneAssetInput,
} from '@/lib/meta/eligibility-rulebook';

const basePhone: MetaPhoneAssetInput = {
  waba_id: 'waba_1',
  display_phone_number: '+91 95323 58574',
  verified_name: 'iBloom Solutions',
  quality_rating: 'GREEN',
  code_verification_status: 'VERIFIED',
  messaging_limit_tier: 'TIER_1K',
  name_status: 'APPROVED',
};

const diagnostic = (phone: MetaPhoneAssetInput, key: string) =>
  evaluatePhoneLineEligibility(phone).diagnostics.find((d) => d.key === key)!;

describe('evaluatePhoneLineEligibility', () => {
  it('qualifies a fully healthy line for production with a perfect score', () => {
    const result = evaluatePhoneLineEligibility(basePhone);

    expect(result.status).toBe('QUALIFIED_PRODUCTION');
    expect(result.score).toBe(100);
    expect(result.isEligibleForMessaging).toBe(true);
    expect(result.isEligibleForTesting).toBe(true);
    expect(result.diagnostics.map((d) => d.key)).toEqual([
      'verification_status',
      'quality_rating',
      'name_approval',
      'messaging_tier',
    ]);
    expect(result.diagnostics.every((d) => d.passed)).toBe(true);
  });

  it('treats missing Meta attributes as healthy defaults', () => {
    const result = evaluatePhoneLineEligibility({
      waba_id: 'waba_1',
      display_phone_number: '+91 95323 58574',
    });

    expect(result.status).toBe('QUALIFIED_PRODUCTION');
    expect(result.score).toBe(100);
    expect(diagnostic({ waba_id: 'w', display_phone_number: '+1' }, 'name_approval').message).toContain(
      'Business Name'
    );
  });

  it('normalizes lowercase Meta attribute casing', () => {
    const result = evaluatePhoneLineEligibility({
      ...basePhone,
      quality_rating: 'green',
      code_verification_status: 'verified',
      name_status: 'approved',
      messaging_limit_tier: 'tier_1k',
    });

    expect(result.score).toBe(100);
    expect(result.status).toBe('QUALIFIED_PRODUCTION');
  });

  it('penalizes unverified lines by 40 points and blocks messaging', () => {
    const result = evaluatePhoneLineEligibility({
      ...basePhone,
      code_verification_status: 'NOT_VERIFIED',
    });

    expect(result.score).toBe(60);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.isEligibleForMessaging).toBe(false);
    expect(result.isEligibleForTesting).toBe(false);
    expect(diagnostic({ ...basePhone, code_verification_status: 'NOT_VERIFIED' }, 'verification_status')).toMatchObject(
      { passed: false, severity: 'CRITICAL' }
    );
  });

  it('warns on YELLOW quality but keeps the line production eligible', () => {
    const phone = { ...basePhone, quality_rating: 'YELLOW' };
    const result = evaluatePhoneLineEligibility(phone);

    expect(result.score).toBe(85);
    expect(result.status).toBe('QUALIFIED_PRODUCTION');
    expect(result.isEligibleForMessaging).toBe(true);
    expect(diagnostic(phone, 'quality_rating')).toMatchObject({ passed: true, severity: 'WARNING' });
  });

  it('flags RED quality as critical and disqualifies messaging', () => {
    const phone = { ...basePhone, quality_rating: 'RED' };
    const result = evaluatePhoneLineEligibility(phone);

    expect(result.score).toBe(65);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.isEligibleForMessaging).toBe(false);
    expect(result.isEligibleForTesting).toBe(true);
    expect(diagnostic(phone, 'quality_rating')).toMatchObject({ passed: false, severity: 'CRITICAL' });
  });

  it('penalizes an unapproved display name and blocks messaging', () => {
    const phone = { ...basePhone, name_status: 'DECLINED' };
    const result = evaluatePhoneLineEligibility(phone);

    expect(result.score).toBe(75);
    expect(result.status).toBe('NEEDS_ATTENTION');
    expect(result.isEligibleForMessaging).toBe(false);
    expect(diagnostic(phone, 'name_approval')).toMatchObject({ passed: false, severity: 'WARNING' });
  });

  it('accepts every high-throughput messaging tier without penalty', () => {
    for (const tier of ['TIER_1K', 'TIER_10K', 'TIER_100K', 'TIER_UNLIMITED']) {
      const result = evaluatePhoneLineEligibility({ ...basePhone, messaging_limit_tier: tier });
      expect(result.score, tier).toBe(100);
      expect(diagnostic({ ...basePhone, messaging_limit_tier: tier }, 'messaging_tier').severity).toBe('SUCCESS');
    }
  });

  it('warns and deducts 10 points for an unrecognized low-capacity tier', () => {
    const phone = { ...basePhone, messaging_limit_tier: 'TIER_50' };
    const result = evaluatePhoneLineEligibility(phone);

    expect(result.score).toBe(90);
    expect(diagnostic(phone, 'messaging_tier')).toMatchObject({ passed: true, severity: 'WARNING' });
  });

  it('classifies verified test numbers as sandbox', () => {
    const result = evaluatePhoneLineEligibility({ ...basePhone, is_test_number: true });

    expect(result.status).toBe('QUALIFIED_SANDBOX');
    expect(result.isEligibleForMessaging).toBe(true);
  });

  it('classifies TIER_250 lines as sandbox rather than production', () => {
    const result = evaluatePhoneLineEligibility({ ...basePhone, messaging_limit_tier: 'TIER_250' });

    expect(result.status).toBe('QUALIFIED_SANDBOX');
    expect(result.score).toBe(90);
  });

  it('downgrades unverified test numbers to NEEDS_ATTENTION', () => {
    const result = evaluatePhoneLineEligibility({
      ...basePhone,
      is_test_number: true,
      code_verification_status: 'PENDING',
    });

    expect(result.status).toBe('NEEDS_ATTENTION');
  });

  it('never returns a negative score for a fully degraded line', () => {
    const result = evaluatePhoneLineEligibility({
      ...basePhone,
      code_verification_status: 'NOT_VERIFIED',
      quality_rating: 'RED',
      name_status: 'DECLINED',
      messaging_limit_tier: 'TIER_50',
    });

    expect(result.score).toBe(0);
    expect(result.status).toBe('NEEDS_ATTENTION');
  });
});
