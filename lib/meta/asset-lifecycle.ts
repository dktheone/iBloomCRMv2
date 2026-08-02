import { evaluatePhoneLineEligibility, MetaPhoneAssetInput } from '@/lib/meta/eligibility-rulebook';

export type AssetLifecycleStatus =
  | 'PROVISIONED'        // Stage 1: Selected & Staged in DB (is_locked = false)
  | 'LOCKED'             // Stage 2: Eligibility Passed & Locked to Tenant (is_locked = true)
  | 'LIVE_OPERATIONAL'   // Stage 3: Fully Active for Template Sync & Messaging (is_locked = true)
  | 'UNLOCKED_STANDBY';  // Detached by Admin (is_locked = false)

export interface AssetLifecycleState {
  status: AssetLifecycleStatus;
  isLocked: boolean;
  isPrimaryLine: boolean;
  eligibilityScore: number;
  isEligibleForMessaging: boolean;
  isEligibleForTesting: boolean;
  diagnostics: any[];
  statusLabel: string;
  statusBadgeColor: string;
}

export type CrmActionType =
  | 'SYNC_TEMPLATES'
  | 'CREATE_TEMPLATE'
  | 'EDIT_TEMPLATE'
  | 'DELETE_TEMPLATE'
  | 'SEND_CAMPAIGN_MESSAGE'
  | 'SEND_SINGLE_MESSAGE';

/**
 * Evaluates full 3-Stage Lifecycle State for a WhatsApp Phone Asset
 */
export function evaluateAssetLifecycle(
  phone: MetaPhoneAssetInput & {
    lifecycle_status?: string;
    is_locked?: boolean;
    is_primary_line?: boolean;
  }
): AssetLifecycleState {
  const eligibility = evaluatePhoneLineEligibility(phone);

  let finalStatus: AssetLifecycleStatus = (phone.lifecycle_status as AssetLifecycleStatus) || 'PROVISIONED';
  let isLocked = Boolean(phone.is_locked);

  // Auto-advance status if eligibility checks pass and line was requested for activation
  if ((finalStatus === 'PROVISIONED' || finalStatus === 'LOCKED') && eligibility.isEligibleForMessaging) {
    finalStatus = 'LIVE_OPERATIONAL';
    isLocked = true;
  } else if (finalStatus === 'LOCKED') {
    isLocked = true;
  } else if (finalStatus === 'UNLOCKED_STANDBY') {
    isLocked = false;
  }

  let statusLabel = 'Provisioned Staging';
  let statusBadgeColor = 'amber';

  if (finalStatus === 'LIVE_OPERATIONAL') {
    statusLabel = eligibility.status === 'QUALIFIED_PRODUCTION' ? 'LIVE OPERATIONAL (PROD)' : 'LIVE OPERATIONAL (SANDBOX)';
    statusBadgeColor = eligibility.status === 'QUALIFIED_PRODUCTION' ? 'emerald' : 'blue';
  } else if (finalStatus === 'LOCKED') {
    statusLabel = 'LOCKED & VERIFIED';
    statusBadgeColor = 'cyan';
  } else if (finalStatus === 'UNLOCKED_STANDBY') {
    statusLabel = 'UNLOCKED / STANDBY';
    statusBadgeColor = 'slate';
  }

  return {
    status: finalStatus,
    isLocked,
    isPrimaryLine: Boolean(phone.is_primary_line),
    eligibilityScore: eligibility.score,
    isEligibleForMessaging: eligibility.isEligibleForMessaging,
    isEligibleForTesting: eligibility.isEligibleForTesting,
    diagnostics: eligibility.diagnostics,
    statusLabel,
    statusBadgeColor,
  };
}

/**
 * State Machine Guard: Validates whether a lifecycle transition is allowed
 */
export function transitionAssetLifecycle(
  currentStatus: AssetLifecycleStatus,
  targetStatus: AssetLifecycleStatus
): { allowed: boolean; reason?: string } {
  if (currentStatus === targetStatus) {
    return { allowed: true };
  }

  switch (currentStatus) {
    case 'PROVISIONED':
      if (targetStatus === 'LOCKED' || targetStatus === 'LIVE_OPERATIONAL' || targetStatus === 'UNLOCKED_STANDBY') {
        return { allowed: true };
      }
      break;
    case 'LOCKED':
      if (targetStatus === 'LIVE_OPERATIONAL' || targetStatus === 'UNLOCKED_STANDBY') {
        return { allowed: true };
      }
      break;
    case 'LIVE_OPERATIONAL':
      if (targetStatus === 'UNLOCKED_STANDBY' || targetStatus === 'LOCKED') {
        return { allowed: true };
      }
      break;
    case 'UNLOCKED_STANDBY':
      if (targetStatus === 'PROVISIONED' || targetStatus === 'LOCKED' || targetStatus === 'LIVE_OPERATIONAL') {
        return { allowed: true };
      }
      break;
  }

  return {
    allowed: false,
    reason: `Illegal lifecycle transition from ${currentStatus} to ${targetStatus}`,
  };
}

/**
 * Permission Gate: Checks if a CRM WhatsApp Action is permitted on a phone line
 */
export function canPerformCrmAction(
  phoneState: AssetLifecycleState,
  action: CrmActionType
): { permitted: boolean; reason?: string } {
  if (phoneState.status !== 'LIVE_OPERATIONAL' && phoneState.status !== 'LOCKED') {
    return {
      permitted: false,
      reason: `Action '${action}' blocked: Phone line is in ${phoneState.statusLabel} status. Line must be in LIVE_OPERATIONAL status to perform CRM operations.`,
    };
  }

  if (action === 'SEND_CAMPAIGN_MESSAGE' && !phoneState.isEligibleForMessaging) {
    return {
      permitted: false,
      reason: `Action '${action}' blocked: Line failed Meta quality or verification checks.`,
    };
  }

  return { permitted: true };
}
