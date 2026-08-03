import { describe, expect, it } from 'vitest';
import { formatMetaTimezone } from '@/lib/meta/graph-client';

describe('formatMetaTimezone', () => {
  it.each([undefined, '', 0])('falls back to Asia/Kolkata for the empty input %s', (input) => {
    expect(formatMetaTimezone(input as any)).toBe('Asia/Kolkata');
  });

  it.each([
    [71, 'Asia/Kolkata'],
    ['71', 'Asia/Kolkata'],
    ['kolkata', 'Asia/Kolkata'],
    ['Kolkata', 'Asia/Kolkata'],
    [1, 'America/Los_Angeles'],
    ['pst', 'America/Los_Angeles'],
    [2, 'America/New_York'],
    ['EST', 'America/New_York'],
    [3, 'UTC'],
    ['gmt', 'UTC'],
    ['utc', 'UTC'],
  ])('maps the Meta timezone code %s to %s', (input, expected) => {
    expect(formatMetaTimezone(input)).toBe(expected);
  });

  it('trims surrounding whitespace before matching', () => {
    expect(formatMetaTimezone('  71  ')).toBe('Asia/Kolkata');
    expect(formatMetaTimezone(' Europe/London ')).toBe('Europe/London');
  });

  it('passes through IANA identifiers unchanged', () => {
    expect(formatMetaTimezone('Europe/London')).toBe('Europe/London');
    expect(formatMetaTimezone('America/Sao_Paulo')).toBe('America/Sao_Paulo');
  });

  it('falls back to Asia/Kolkata for unrecognized codes and malformed identifiers', () => {
    expect(formatMetaTimezone('999')).toBe('Asia/Kolkata');
    expect(formatMetaTimezone('America/Argentina/Buenos_Aires')).toBe('Asia/Kolkata');
  });
});
