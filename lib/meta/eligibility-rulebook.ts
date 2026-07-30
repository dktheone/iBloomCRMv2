export interface MetaPhoneAssetInput {
  id?: string;
  phone_number_id?: string;
  waba_id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
  code_verification_status?: string;
  messaging_limit_tier?: string;
  name_status?: string;
  is_test_number?: boolean;
}

export interface RulebookDiagnosticCheck {
  key: string;
  label: string;
  passed: boolean;
  severity: 'SUCCESS' | 'WARNING' | 'CRITICAL';
  message: string;
}

export interface EligibilityResult {
  status: 'QUALIFIED_PRODUCTION' | 'QUALIFIED_SANDBOX' | 'NEEDS_ATTENTION';
  score: number; // 0 to 100
  isEligibleForMessaging: boolean;
  isEligibleForTesting: boolean;
  diagnostics: RulebookDiagnosticCheck[];
}

/**
 * Evaluates a Meta WhatsApp Phone Line Asset against the 5-point Rulebook Eligibility Matrix
 */
export function evaluatePhoneLineEligibility(phone: MetaPhoneAssetInput): EligibilityResult {
  const diagnostics: RulebookDiagnosticCheck[] = [];
  let score = 100;

  const isVerified = (phone.code_verification_status || 'VERIFIED').toUpperCase() === 'VERIFIED';
  const quality = (phone.quality_rating || 'GREEN').toUpperCase();
  const nameStatus = (phone.name_status || 'APPROVED').toUpperCase();
  const tier = (phone.messaging_limit_tier || 'TIER_1K').toUpperCase();
  const isTest = Boolean(phone.is_test_number);

  // 1. Verification Status Check
  if (isVerified) {
    diagnostics.push({
      key: 'verification_status',
      label: 'OTP Code Verification',
      passed: true,
      severity: 'SUCCESS',
      message: 'Phone line OTP code verification status is VERIFIED.',
    });
  } else {
    score -= 40;
    diagnostics.push({
      key: 'verification_status',
      label: 'OTP Code Verification',
      passed: false,
      severity: 'CRITICAL',
      message: `Verification status is ${phone.code_verification_status || 'NOT_VERIFIED'}. Needs OTP verification in Meta Manager.`,
    });
  }

  // 2. Quality Rating Check
  if (quality === 'GREEN') {
    diagnostics.push({
      key: 'quality_rating',
      label: 'Quality Score Health',
      passed: true,
      severity: 'SUCCESS',
      message: 'Quality rating is GREEN (Optimal delivery & low user blocks).',
    });
  } else if (quality === 'YELLOW') {
    score -= 15;
    diagnostics.push({
      key: 'quality_rating',
      label: 'Quality Score Health',
      passed: true,
      severity: 'WARNING',
      message: 'Quality rating is YELLOW (Medium flag warning). Monitor spam reports.',
    });
  } else {
    score -= 35;
    diagnostics.push({
      key: 'quality_rating',
      label: 'Quality Score Health',
      passed: false,
      severity: 'CRITICAL',
      message: `Quality rating is ${quality}. High block rate risk.`,
    });
  }

  // 3. Name Approval Status Check
  if (nameStatus === 'APPROVED') {
    diagnostics.push({
      key: 'name_approval',
      label: 'Meta Verified Name',
      passed: true,
      severity: 'SUCCESS',
      message: `Verified display name "${phone.verified_name || 'Business Name'}" is APPROVED by Meta.`,
    });
  } else {
    score -= 25;
    diagnostics.push({
      key: 'name_approval',
      label: 'Meta Verified Name',
      passed: false,
      severity: 'WARNING',
      message: `Display name status is ${nameStatus}. May render without official business green badge.`,
    });
  }

  // 4. Messaging Tier Limit Check
  if (tier.includes('UNLIMITED') || tier.includes('100K') || tier.includes('10K') || tier.includes('1K')) {
    diagnostics.push({
      key: 'messaging_tier',
      label: 'Messaging Capacity Tier',
      passed: true,
      severity: 'SUCCESS',
      message: `Messaging tier is ${tier} (High-throughput production capacity).`,
    });
  } else {
    score -= 10;
    diagnostics.push({
      key: 'messaging_tier',
      label: 'Messaging Capacity Tier',
      passed: true,
      severity: 'WARNING',
      message: `Messaging tier is ${tier} (Sandbox or low-limit capacity).`,
    });
  }

  // Final Classification Logic
  let status: 'QUALIFIED_PRODUCTION' | 'QUALIFIED_SANDBOX' | 'NEEDS_ATTENTION';
  const isEligibleForMessaging = isVerified && quality !== 'RED' && nameStatus === 'APPROVED';
  const isEligibleForTesting = isVerified;

  if (isTest || tier.includes('250')) {
    status = isVerified ? 'QUALIFIED_SANDBOX' : 'NEEDS_ATTENTION';
  } else if (isEligibleForMessaging && score >= 70) {
    status = 'QUALIFIED_PRODUCTION';
  } else {
    status = 'NEEDS_ATTENTION';
  }

  return {
    status,
    score: Math.max(0, score),
    isEligibleForMessaging,
    isEligibleForTesting,
    diagnostics,
  };
}
