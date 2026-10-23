import { describe, expect, it } from 'vitest';

import { DEFAULTS, ResolvedConfig } from '../src/const';
import { readSilo, siloFromConfig } from '../src/silo';
import { KILOGRAMS, convertLength, sensorMetres } from '../src/units';
import type { SiloCardConfig } from '../src/types';

const config = (c: Partial<SiloCardConfig>) => ({ ...DEFAULTS, type: 'custom:silo-card', ...c }) as ResolvedConfig;

/** The maintainer's feed bin, as in its ESPHome file: 9 ft wide, a 7 ft hopper, seven 32 in rings, a 2 ft roof. */
const bin = config({
  unit: 'in',
  diameter: 108,
  rings: 7,
  ring_height: 32,
  top: 'cone',
  top_height: 24,
  bottom: 'cone',
  bottom_height: 84,
  capacity: 24,
  weight_unit: 'ton',
});

describe('siloFromConfig', () => {
  it('needs a diameter and a ring height', () => {
    expect(siloFromConfig(config({}))).toBeNull();
    expect(siloFromConfig(config({ diameter: 3 }))).toBeNull();
    expect(siloFromConfig(config({ diameter: 3, ring_height: 0 }))).toBeNull();
    expect(siloFromConfig(config({ diameter: 3, ring_height: 5 }))).not.toBeNull();
  });

  it('converts the lengths to metres and puts the sensor at the top by default', () => {
    const silo = siloFromConfig(bin)!;
    const height = (84 + 7 * 32 + 24) * 0.0254;
    expect(silo.height).toBeCloseTo(height);
    expect(silo.sensorHeight).toBeCloseTo(height);
    expect(siloFromConfig({ ...bin, sensor_height: 300 })!.sensorHeight).toBeCloseTo(300 * 0.0254);
  });

  it('takes the density from the capacity, then the density, then the grain', () => {
    const metric = { diameter: 2, ring_height: 3 };
    const cylinder = Math.PI * 3;
    expect(siloFromConfig(config({ ...metric }))!.density).toBeUndefined();
    expect(siloFromConfig(config({ ...metric, grain: 'wheat' }))!.density).toBeCloseTo(772.31, 1);
    expect(siloFromConfig(config({ ...metric, grain: 'wheat', density: 75, density_unit: 'kg/hL' }))!.density).toBe(
      750,
    );
    expect(siloFromConfig(config({ ...metric, grain: 'wheat', density: 700, capacity: 6 }))!.density).toBeCloseTo(
      6000 / cylinder,
    );
  });
});

describe('readSilo', () => {
  const silo = siloFromConfig(bin)!;
  const ton = KILOGRAMS.ton;

  it('turns the distance into the grain height, like the ESPHome lambdas', () => {
    const r = readSilo(silo, 2, 'distance')!;
    expect(r.level).toBeCloseTo(silo.height - 2);
    expect(r.distance).toBeCloseTo(2);
  });

  it('stays within the silo, and gives up on a missing value', () => {
    expect(readSilo(silo, 99, 'distance')!.level).toBe(0);
    expect(readSilo(silo, -1, 'distance')!.level).toBeCloseTo(silo.height);
    expect(readSilo(silo, NaN, 'distance')).toBeNull();
  });

  it('is full at the eave, and empty with nothing left to order', () => {
    const eave = (84 + 7 * 32) * 0.0254;
    const full = readSilo(silo, eave, 'level')!;
    expect(full.percent).toBeCloseTo(100);
    expect(full.weight! / ton).toBeCloseTo(24);
    expect(full.remaining).toBeCloseTo(0);
    expect(full.position).toEqual({ kind: 'rings', rings: 7 });

    const empty = readSilo(silo, 0, 'level')!;
    expect(empty.weight).toBe(0);
    expect(empty.remaining! / ton).toBeCloseTo(24);
    expect(empty.position).toEqual({ kind: 'empty' });
  });

  it('weighs about what the ESPHome "3 tons a ring, 3 for the hopper" gives', () => {
    // 4.5 rings: ESPHome says 4.5 × 3 + 3 = 16.5 tons. The geometry gives the hopper a little less
    // volume than a ring (4.20 m³ against 4.80 m³), so slightly less.
    const r = readSilo(silo, (84 + 4.5 * 32) * 0.0254, 'level')!;
    expect(r.position).toMatchObject({ kind: 'rings' });
    expect((r.position as { rings: number }).rings).toBeCloseTo(4.5);
    expect(r.weight! / ton).toBeCloseTo(16.4, 1);
    expect(r.parts.map((p) => Math.round(p.fraction * 100))).toEqual([100, 100, 100, 100, 100, 50, 0, 0, 0]);
  });

  it('takes the capacity of one full ring, and works out the hopper from its volume', () => {
    // The manufacturer's "3 tons a ring". The 7 ft hopper holds 87.5 % of a 32 in ring: 7 × 3 + 2.6 tons.
    const perRing = siloFromConfig({ ...bin, capacity: 3, capacity_per: 'ring' })!;
    const hopper = (84 * 0.0254) / 3 / (32 * 0.0254);
    expect(hopper).toBeCloseTo(0.875);
    const full = readSilo(perRing, (84 + 7 * 32) * 0.0254, 'level')!;
    expect(full.weight! / ton).toBeCloseTo(21 + 3 * hopper);
    expect(full.percent).toBeCloseTo(100);
    const inHopper = readSilo(perRing, 84 * 0.0254, 'level')!;
    expect(inHopper.weight! / ton).toBeCloseTo(3 * hopper);
  });

  it('goes over 100 % when grain fills a roof that is not part of "full"', () => {
    expect(readSilo(silo, 0, 'distance')!.percent).toBeGreaterThan(100);
    expect(readSilo(silo, 0, 'distance')!.remaining).toBe(0);
    const peaked = siloFromConfig({ ...bin, include_roof: true })!;
    expect(readSilo(peaked, 0, 'distance')!.percent).toBeCloseTo(100);
  });
});

describe('units', () => {
  it('reads the sensor in the unit it reports', () => {
    expect(sensorMetres('3.5', 'm', 'ft')).toBe(3.5);
    expect(sensorMetres('3500', 'mm', 'm')).toBe(3.5);
    expect(sensorMetres('10', 'ft', 'm')).toBeCloseTo(3.048);
    expect(sensorMetres('10', undefined, 'ft')).toBeCloseTo(3.048);
    expect(sensorMetres('unavailable', 'm', 'm')).toBeNaN();
    expect(sensorMetres('3', '%', 'm')).toBeNaN();
  });

  it('converts lengths for the editor, rounded', () => {
    expect(convertLength(108, 'in', 'ft')).toBe(9);
    expect(convertLength(9, 'ft', 'm')).toBe(2.743);
    expect(convertLength(2.743, 'm', 'cm')).toBe(274.3);
  });
});
