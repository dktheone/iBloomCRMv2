import { describe, expect, it } from 'vitest';
import { detectMetaStatusDrift } from '@/lib/meta/status-drift';

const live = {
  quality_rating: 'GREEN',
  name_status: 'APPROVED',
  code_verification_status: 'VERIFIED',
  messaging_limit_tier: 'TIER_1K',
};

describe('detectMetaStatusDrift', () => {
  it('reports no drift when the line is not yet enrolled', () => {
    expect(detectMetaStatusDrift(live, null)).toEqual({
      hasDrift: false,
      severity: 'NONE',
      changes: [],
      explanation: 'Line not yet enrolled in database.',
    });
    expect(detectMetaStatusDrift(live, undefined).severity).toBe('NONE');
  });

  it('reports no drift when Meta matches the database', () => {
    const result = detectMetaStatusDrift(live, { ...live });

    expect(result).toMatchObject({ hasDrift: false, severity: 'NONE', changes: [] });
    expect(result.explanation).toBe('Upstream Meta status matches database records perfectly.');
  });

  it('treats missing attributes on both sides as healthy defaults', () => {
    expect(detectMetaStatusDrift({}, {})).toMatchObject({ hasDrift: false, severity: 'NONE' });
  });

  it('flags a drop to RED quality as CRITICAL', () => {
    const result = detectMetaStatusDrift({ ...live, quality_rating: 'RED' }, { ...live });

    expect(result.hasDrift).toBe(true);
    expect(result.severity).toBe('CRITICAL');
    expect(result.changes).toEqual([`Quality Rating changed from 'GREEN' in DB to 'RED' on Meta`]);
    expect(result.explanation).toContain('Upstream Meta Status Drift Detected');
  });

  it('flags a drop to YELLOW quality as WARNING', () => {
    const result = detectMetaStatusDrift({ ...live, quality_rating: 'YELLOW' }, { ...live });

    expect(result.severity).toBe('WARNING');
    expect(result.changes).toHaveLength(1);
  });

  it('flags a recovery back to GREEN as drift too', () => {
    const result = detectMetaStatusDrift(live, { ...live, quality_rating: 'YELLOW' });

    expect(result.hasDrift).toBe(true);
    expect(result.severity).toBe('WARNING');
  });

  it.each(['DECLINED', 'EXPIRED'])('flags display name status %s as CRITICAL', (nameStatus) => {
    const result = detectMetaStatusDrift({ ...live, name_status: nameStatus }, { ...live });

    expect(result.severity).toBe('CRITICAL');
    expect(result.changes[0]).toContain('Display Name Status');
  });

  it('flags a pending display name review as WARNING', () => {
    const result = detectMetaStatusDrift({ ...live, name_status: 'PENDING_REVIEW' }, { ...live });

    expect(result.severity).toBe('WARNING');
  });

  it('ignores equivalent healthy display name statuses', () => {
    const result = detectMetaStatusDrift(
      { ...live, name_status: 'AVAILABLE_WITHOUT_REVIEW' },
      { ...live, name_status: 'APPROVED' }
    );

    expect(result.hasDrift).toBe(false);
    expect(result.severity).toBe('NONE');
  });

  it.each(['EXPIRED', 'NOT_VERIFIED'])('flags code verification status %s as CRITICAL', (codeStatus) => {
    const result = detectMetaStatusDrift({ ...live, code_verification_status: codeStatus }, { ...live });

    expect(result.severity).toBe('CRITICAL');
    expect(result.changes[0]).toContain('Code Verification');
  });

  it('records a non-critical code verification change without raising severity', () => {
    const result = detectMetaStatusDrift({ ...live, code_verification_status: 'PENDING' }, { ...live });

    expect(result.hasDrift).toBe(true);
    expect(result.severity).toBe('NONE');
  });

  it('reports a messaging tier change as INFO only', () => {
    const result = detectMetaStatusDrift({ ...live, messaging_limit_tier: 'TIER_10K' }, { ...live });

    expect(result.severity).toBe('INFO');
    expect(result.changes[0]).toContain('Messaging Tier changed');
  });

  it('does not downgrade a critical severity because of a tier change', () => {
    const result = detectMetaStatusDrift(
      { ...live, quality_rating: 'RED', messaging_limit_tier: 'TIER_10K' },
      { ...live }
    );

    expect(result.severity).toBe('CRITICAL');
    expect(result.changes).toHaveLength(2);
  });

  it('keeps CRITICAL quality severity when a warning-level name change also occurs', () => {
    const result = detectMetaStatusDrift(
      { ...live, quality_rating: 'RED', name_status: 'PENDING_REVIEW' },
      { ...live }
    );

    expect(result.severity).toBe('CRITICAL');
  });

  it('aggregates every drifted attribute into the explanation', () => {
    const result = detectMetaStatusDrift(
      {
        quality_rating: 'RED',
        name_status: 'DECLINED',
        code_verification_status: 'NOT_VERIFIED',
        messaging_limit_tier: 'TIER_250',
      },
      { ...live }
    );

    expect(result.changes).toHaveLength(4);
    expect(result.severity).toBe('CRITICAL');
    expect(result.explanation.endsWith('.')).toBe(true);
  });
});
