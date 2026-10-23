import { describe, expect, it } from 'vitest';

import { DEFAULTS, ResolvedConfig } from '../src/const';
import { integrationLevel, integrationSilo, integrationSource } from '../src/integration';
import { readSilo, siloFromConfig } from '../src/silo';
import { KILOGRAMS } from '../src/units';
import type { HassEntity } from '../src/types';

/** The fill sensor of the Silo integration, as its tests (tests/test_silo.py) describe it. */
const fill: HassEntity = {
  entity_id: 'sensor.soue_1_ben_2_fill_level',
  state: '55.7',
  last_updated: '',
  attributes: {
    unit_of_measurement: '%',
    source: 'sensor.soue1ben2_distance',
    level: (84 + 4.5 * 32) * 0.0254,
    silo: {
      measure: 'distance',
      unit: 'in',
      shape: 'round',
      diameter: 108,
      rings: 7,
      ring_height: 32,
      top: 'cone',
      top_height: 24,
      bottom: 'cone',
      bottom_height: 84,
      outlet: 0,
      capacity: 24,
      density_unit: 'kg/m3',
      weight_unit: 'ton',
      volume_unit: 'bu',
      include_roof: false,
    },
  },
};

describe('integrationSilo', () => {
  it('reads the silo of an integration sensor, and nothing from any other entity', () => {
    expect(integrationSilo(fill)?.diameter).toBe(108);
    expect(integrationSilo({ ...fill, attributes: { unit_of_measurement: 'm' } })).toBeUndefined();
    expect(integrationSilo({ ...fill, attributes: { silo: 'nope' } })).toBeUndefined();
    expect(integrationSilo(undefined)).toBeUndefined();
  });

  it('keeps only the options the integration sets', () => {
    const silo = integrationSilo({ ...fill, attributes: { ...fill.attributes, silo: { diameter: 3, title: 'x' } } });
    expect(silo).toEqual({ diameter: 3 });
  });

  it('gives the same weight as the integration', () => {
    // The card's own config loses to the integration's silo.
    const cfg = { ...DEFAULTS, type: 'custom:silo-card', diameter: 1, ...integrationSilo(fill) } as ResolvedConfig;
    const r = readSilo(siloFromConfig(cfg)!, integrationLevel(fill), 'level')!;
    expect(r.weight! / KILOGRAMS.ton).toBeCloseTo(16.4, 1);
    expect(integrationSource(fill)).toBe('sensor.soue1ben2_distance');
  });

  it('has no level while the source has no reading', () => {
    expect(integrationLevel({ ...fill, state: 'unknown', attributes: { ...fill.attributes, level: null } })).toBeNaN();
  });
});
