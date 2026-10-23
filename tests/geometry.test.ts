import { describe, expect, it } from 'vitest';

import {
  SiloGeometry,
  buildParts,
  capacityVolume,
  partVolume,
  position,
  totalHeight,
  volumeBelow,
  wallPoints,
  widthAt,
} from '../src/geometry';

const base: SiloGeometry = {
  shape: 'round',
  diameter: 2,
  rings: 1,
  ringHeight: 3,
  top: 'flat',
  topHeight: 0,
  bottom: 'flat',
  bottomHeight: 0,
  outlet: 0,
};

const cylinder = Math.PI * 1 * 1 * 3; // r = 1, h = 3

describe('buildParts', () => {
  it('stacks the bottom, the rings and the top', () => {
    const parts = buildParts({
      ...base,
      rings: 3,
      ringHeight: 1,
      bottom: 'cone',
      bottomHeight: 2,
      top: 'cone',
      topHeight: 0.5,
    });
    expect(parts.map((p) => `${p.kind}${p.index || ''}`)).toEqual(['bottom', 'ring1', 'ring2', 'ring3', 'top']);
    expect(parts.map((p) => p.z0)).toEqual([0, 2, 3, 4, 5]);
    expect(totalHeight(parts)).toBe(5.5);
  });

  it('leaves out a flat top and bottom, and a cone without height', () => {
    expect(buildParts(base).map((p) => p.kind)).toEqual(['ring']);
    expect(buildParts({ ...base, top: 'cone', topHeight: 0 }).map((p) => p.kind)).toEqual(['ring']);
  });

  it('keeps the outlet between nothing and the full diameter', () => {
    expect(buildParts({ ...base, bottom: 'cone', bottomHeight: 1, outlet: 5 })[0].w0).toBe(2);
    expect(buildParts({ ...base, bottom: 'cone', bottomHeight: 1, outlet: -1 })[0].w0).toBe(0);
  });
});

describe('volumes', () => {
  it('matches the textbook formulas', () => {
    const [ring] = buildParts(base);
    expect(partVolume(ring, 'round')).toBeCloseTo(cylinder);
    expect(partVolume(ring, 'square')).toBeCloseTo(2 * 2 * 3);

    const [cone] = buildParts({ ...base, bottom: 'cone', bottomHeight: 3 });
    expect(partVolume(cone, 'round')).toBeCloseTo(cylinder / 3);
    expect(partVolume(cone, 'square')).toBeCloseTo((2 * 2 * 3) / 3);

    const dome = buildParts({ ...base, top: 'dome', topHeight: 3 })[1];
    expect(partVolume(dome, 'round')).toBeCloseTo((2 / 3) * cylinder);
  });

  it('handles a hopper that ends in an outlet', () => {
    // Frustum r 0.25 → 1, h 3: π h / 3 (R² + R r + r²).
    const [hopper] = buildParts({ ...base, bottom: 'cone', bottomHeight: 3, outlet: 0.5 });
    expect(partVolume(hopper, 'round')).toBeCloseTo(Math.PI * (1 + 0.25 + 0.0625));
  });

  it('fills a pointed hopper as the cube of the height, like the ESPHome lambda', () => {
    const parts = buildParts({ ...base, bottom: 'cone', bottomHeight: 2 });
    const hopper = partVolume(parts[0], 'round');
    for (const y of [0.3, 1, 1.7]) expect(volumeBelow(parts, 'round', y) / hopper).toBeCloseTo((y / 2) ** 3);
  });

  it('fills a ring in proportion and the dome as an ellipsoid', () => {
    const parts = buildParts({ ...base, top: 'dome', topHeight: 1 });
    expect(volumeBelow(parts, 'round', 1.5)).toBeCloseTo(cylinder / 2);
    // Half the dome's height holds 11/16 of the dome.
    expect(volumeBelow(parts, 'round', 3.5) - cylinder).toBeCloseTo((11 / 16) * (2 / 3) * Math.PI);
    expect(volumeBelow(parts, 'round', 99)).toBeCloseTo(cylinder + (2 / 3) * Math.PI);
    expect(volumeBelow(parts, 'round', -1)).toBe(0);
  });

  it('counts the roof in the capacity only when asked', () => {
    const parts = buildParts({ ...base, top: 'cone', topHeight: 3 });
    expect(capacityVolume(parts, 'round', false)).toBeCloseTo(cylinder);
    expect(capacityVolume(parts, 'round', true)).toBeCloseTo(cylinder * (4 / 3));
  });
});

describe('position', () => {
  const parts = buildParts({
    ...base,
    rings: 4,
    ringHeight: 1,
    bottom: 'cone',
    bottomHeight: 2,
    top: 'cone',
    topHeight: 1,
  });
  it('says which part the grain surface is in', () => {
    expect(position(parts, 0)).toEqual({ kind: 'empty' });
    expect(position(parts, 1)).toEqual({ kind: 'bottom', fraction: 0.5 });
    expect(position(parts, 2)).toEqual({ kind: 'rings', rings: 0 });
    expect(position(parts, 4.5)).toEqual({ kind: 'rings', rings: 2.5 });
    expect(position(parts, 6)).toEqual({ kind: 'rings', rings: 4 });
    expect(position(parts, 6.25)).toEqual({ kind: 'top', fraction: 0.25 });
  });
});

describe('wallPoints', () => {
  it('traces the wall between two heights', () => {
    const [hopper] = buildParts({ ...base, bottom: 'cone', bottomHeight: 2 });
    expect(wallPoints(hopper)).toEqual([
      [0, 0],
      [1, 2],
    ]);
    expect(wallPoints(hopper, 0, 1)).toEqual([
      [0, 0],
      [0.5, 1],
    ]);
    expect(wallPoints(hopper, 3, 4)).toEqual([]);
    expect(widthAt(hopper, 1)).toBe(1);
  });

  it('follows the dome from its base to its crown', () => {
    const dome = buildParts({ ...base, top: 'dome', topHeight: 1 })[1];
    const points = wallPoints(dome);
    expect(points[0][0]).toBeCloseTo(1);
    expect(points[0][1]).toBeCloseTo(3);
    expect(points.at(-1)![0]).toBeCloseTo(0);
    expect(points.at(-1)![1]).toBeCloseTo(4);
    for (const [x, z] of points) expect(x * x + (z - 3) ** 2).toBeCloseTo(1); // on the curve
  });
});
