import { describe, expect, it } from 'vitest';

import { durationMs } from '../src/units';

describe('durationMs', () => {
  it('reads a number as minutes', () => {
    expect(durationMs(90)).toBe(90 * 60_000);
  });

  it("reads Home Assistant's duration object", () => {
    expect(durationMs({ days: 1, hours: 2, minutes: 3, seconds: 4 })).toBe(((26 * 60 + 3) * 60 + 4) * 1000);
    expect(durationMs({ hours: 6 })).toBe(6 * 3600_000);
  });

  it('is 0 when not set or not a delay', () => {
    expect(durationMs(undefined)).toBe(0);
    expect(durationMs({})).toBe(0);
    expect(durationMs(-5)).toBe(0);
    expect(durationMs('2h' as unknown as number)).toBe(0);
  });
});
