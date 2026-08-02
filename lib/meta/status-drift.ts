export interface StatusDriftResult {
  hasDrift: boolean;
  severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'NONE';
  changes: string[];
  explanation: string;
}

/**
 * Compares live Meta Graph API phone line attributes against saved DB records
 * to detect upstream Meta status drift (e.g. Quality drops, Name status declined).
 */
export function detectMetaStatusDrift(
  liveMetaPhone: {
    quality_rating?: string;
    name_status?: string;
    code_verification_status?: string;
    messaging_limit_tier?: string;
  },
  savedDbPhone?: {
    quality_rating?: string;
    name_status?: string;
    code_verification_status?: string;
    messaging_limit_tier?: string;
  } | null
): StatusDriftResult {
  if (!savedDbPhone) {
    return {
      hasDrift: false,
      severity: 'NONE',
      changes: [],
      explanation: 'Line not yet enrolled in database.',
    };
  }

  const changes: string[] = [];
  let severity: 'CRITICAL' | 'WARNING' | 'INFO' | 'NONE' = 'NONE';

  // 1. Quality Rating Check
  const liveQuality = liveMetaPhone.quality_rating || 'GREEN';
  const savedQuality = savedDbPhone.quality_rating || 'GREEN';

  if (liveQuality !== savedQuality) {
    changes.push(`Quality Rating changed from '${savedQuality}' in DB to '${liveQuality}' on Meta`);
    if (liveQuality === 'RED') {
      severity = 'CRITICAL';
    } else {
      severity = 'WARNING';
    }
  }

  // 2. Display Name Status Check
  const liveNameStatus = liveMetaPhone.name_status || 'APPROVED';
  const savedNameStatus = savedDbPhone.name_status || 'APPROVED';

  const isHealthyNameStatus = (status: string) => status === 'APPROVED' || status === 'AVAILABLE_WITHOUT_REVIEW';

  if (liveNameStatus !== savedNameStatus && !(isHealthyNameStatus(liveNameStatus) && isHealthyNameStatus(savedNameStatus))) {
    changes.push(`Display Name Status: '${savedNameStatus}' in DB ➔ '${liveNameStatus}' on Meta`);
    if (liveNameStatus === 'DECLINED' || liveNameStatus === 'EXPIRED') {
      severity = 'CRITICAL';
    } else if ((severity as string) !== 'CRITICAL') {
      severity = 'WARNING';
    }
  }

  // 3. Code Verification Status Check
  const liveCodeStatus = liveMetaPhone.code_verification_status || 'VERIFIED';
  const savedCodeStatus = savedDbPhone.code_verification_status || 'VERIFIED';

  if (liveCodeStatus !== savedCodeStatus) {
    changes.push(`Code Verification changed from '${savedCodeStatus}' in DB to '${liveCodeStatus}' on Meta`);
    if (liveCodeStatus === 'EXPIRED' || liveCodeStatus === 'NOT_VERIFIED') {
      severity = 'CRITICAL';
    }
  }

  // 4. Messaging Tier Check
  const liveTier = liveMetaPhone.messaging_limit_tier || 'TIER_1K';
  const savedTier = savedDbPhone.messaging_limit_tier || 'TIER_1K';

  if (liveTier !== savedTier) {
    changes.push(`Messaging Tier changed from '${savedTier}' in DB to '${liveTier}' on Meta`);
    if (severity === 'NONE') severity = 'INFO';
  }

  const hasDrift = changes.length > 0;
  let explanation = 'Upstream Meta status matches database records perfectly.';

  if (hasDrift) {
    explanation = `Upstream Meta Status Drift Detected: ${changes.join('; ')}.`;
  }

  return {
    hasDrift,
    severity,
    changes,
    explanation,
  };
}
