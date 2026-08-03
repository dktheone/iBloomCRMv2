import { describe, expect, it } from 'vitest';
import {
  canPerformCrmAction,
  evaluateAssetLifecycle,
  transitionAssetLifecycle,
  type AssetLifecycleState,
  type AssetLifecycleStatus,
  type CrmActionType,
} from '@/lib/meta/asset-lifecycle';

const healthyPhone = {
  waba_id: 'waba_1',
  display_phone_number: '+91 95323 58574',
  verified_name: 'iBloom Solutions',
  quality_rating: 'GREEN',
  code_verification_status: 'VERIFIED',
  messaging_limit_tier: 'TIER_1K',
  name_status: 'APPROVED',
};

const degradedPhone = { ...healthyPhone, code_verification_status: 'NOT_VERIFIED' };

describe('evaluateAssetLifecycle', () => {
  it('auto-advances an eligible provisioned line to LIVE_OPERATIONAL and locks it', () => {
    const state = evaluateAssetLifecycle({ ...healthyPhone, lifecycle_status: 'PROVISIONED', is_locked: false });

    expect(state.status).toBe('LIVE_OPERATIONAL');
    expect(state.isLocked).toBe(true);
    expect(state.statusLabel).toBe('LIVE OPERATIONAL (PROD)');
    expect(state.statusBadgeColor).toBe('emerald');
    expect(state.eligibilityScore).toBe(100);
    expect(state.diagnostics).toHaveLength(4);
  });

  it('defaults to PROVISIONED staging when a degraded line has no stored status', () => {
    const state = evaluateAssetLifecycle(degradedPhone);

    expect(state.status).toBe('PROVISIONED');
    expect(state.isLocked).toBe(false);
    expect(state.statusLabel).toBe('Provisioned Staging');
    expect(state.statusBadgeColor).toBe('amber');
    expect(state.isEligibleForMessaging).toBe(false);
  });

  it('labels an eligible sandbox line as LIVE OPERATIONAL (SANDBOX)', () => {
    const state = evaluateAssetLifecycle({
      ...healthyPhone,
      is_test_number: true,
      lifecycle_status: 'PROVISIONED',
    });

    expect(state.status).toBe('LIVE_OPERATIONAL');
    expect(state.statusLabel).toBe('LIVE OPERATIONAL (SANDBOX)');
    expect(state.statusBadgeColor).toBe('blue');
  });

  it('keeps an ineligible LOCKED line locked without advancing it', () => {
    const state = evaluateAssetLifecycle({ ...degradedPhone, lifecycle_status: 'LOCKED', is_locked: false });

    expect(state.status).toBe('LOCKED');
    expect(state.isLocked).toBe(true);
    expect(state.statusLabel).toBe('LOCKED & VERIFIED');
    expect(state.statusBadgeColor).toBe('cyan');
  });

  it('never re-locks an UNLOCKED_STANDBY line even when eligibility passes', () => {
    const state = evaluateAssetLifecycle({
      ...healthyPhone,
      lifecycle_status: 'UNLOCKED_STANDBY',
      is_locked: true,
    });

    expect(state.status).toBe('UNLOCKED_STANDBY');
    expect(state.isLocked).toBe(false);
    expect(state.statusLabel).toBe('UNLOCKED / STANDBY');
    expect(state.statusBadgeColor).toBe('slate');
  });

  it('reports the primary line flag as a strict boolean', () => {
    expect(evaluateAssetLifecycle({ ...healthyPhone, is_primary_line: true }).isPrimaryLine).toBe(true);
    expect(evaluateAssetLifecycle(healthyPhone).isPrimaryLine).toBe(false);
  });
});

describe('transitionAssetLifecycle', () => {
  const allStatuses: AssetLifecycleStatus[] = [
    'PROVISIONED',
    'LOCKED',
    'LIVE_OPERATIONAL',
    'UNLOCKED_STANDBY',
  ];

  const allowedTransitions: Array<[AssetLifecycleStatus, AssetLifecycleStatus]> = [
    ['PROVISIONED', 'LOCKED'],
    ['PROVISIONED', 'LIVE_OPERATIONAL'],
    ['PROVISIONED', 'UNLOCKED_STANDBY'],
    ['LOCKED', 'LIVE_OPERATIONAL'],
    ['LOCKED', 'UNLOCKED_STANDBY'],
    ['LIVE_OPERATIONAL', 'LOCKED'],
    ['LIVE_OPERATIONAL', 'UNLOCKED_STANDBY'],
    ['UNLOCKED_STANDBY', 'PROVISIONED'],
    ['UNLOCKED_STANDBY', 'LOCKED'],
    ['UNLOCKED_STANDBY', 'LIVE_OPERATIONAL'],
  ];

  it.each(allowedTransitions)('allows %s -> %s', (from, to) => {
    expect(transitionAssetLifecycle(from, to)).toEqual({ allowed: true });
  });

  it.each(allStatuses)('treats %s -> itself as a no-op', (status) => {
    expect(transitionAssetLifecycle(status, status)).toEqual({ allowed: true });
  });

  it('rejects rewinding an active line back to PROVISIONED', () => {
    for (const from of ['LOCKED', 'LIVE_OPERATIONAL'] as AssetLifecycleStatus[]) {
      const result = transitionAssetLifecycle(from, 'PROVISIONED');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe(`Illegal lifecycle transition from ${from} to PROVISIONED`);
    }
  });
});

describe('canPerformCrmAction', () => {
  const stateFor = (overrides: Partial<AssetLifecycleState>): AssetLifecycleState => ({
    status: 'LIVE_OPERATIONAL',
    isLocked: true,
    isPrimaryLine: false,
    eligibilityScore: 100,
    isEligibleForMessaging: true,
    isEligibleForTesting: true,
    diagnostics: [],
    statusLabel: 'LIVE OPERATIONAL (PROD)',
    statusBadgeColor: 'emerald',
    ...overrides,
  });

  const actions: CrmActionType[] = [
    'SYNC_TEMPLATES',
    'CREATE_TEMPLATE',
    'EDIT_TEMPLATE',
    'DELETE_TEMPLATE',
    'SEND_CAMPAIGN_MESSAGE',
    'SEND_SINGLE_MESSAGE',
  ];

  it.each(actions)('permits %s on a healthy live line', (action) => {
    expect(canPerformCrmAction(stateFor({}), action)).toEqual({ permitted: true });
  });

  it('permits template actions on a LOCKED line', () => {
    expect(canPerformCrmAction(stateFor({ status: 'LOCKED' }), 'SYNC_TEMPLATES')).toEqual({ permitted: true });
  });

  it('blocks every action on provisioned or standby lines', () => {
    for (const status of ['PROVISIONED', 'UNLOCKED_STANDBY'] as AssetLifecycleStatus[]) {
      const result = canPerformCrmAction(stateFor({ status, statusLabel: status }), 'SEND_SINGLE_MESSAGE');
      expect(result.permitted).toBe(false);
      expect(result.reason).toContain('LIVE_OPERATIONAL');
    }
  });

  it('blocks campaign sends when the line fails Meta messaging eligibility', () => {
    const result = canPerformCrmAction(stateFor({ isEligibleForMessaging: false }), 'SEND_CAMPAIGN_MESSAGE');

    expect(result.permitted).toBe(false);
    expect(result.reason).toContain('quality or verification checks');
  });

  it('still permits template sync when messaging eligibility fails', () => {
    expect(canPerformCrmAction(stateFor({ isEligibleForMessaging: false }), 'SYNC_TEMPLATES')).toEqual({
      permitted: true,
    });
  });
});
