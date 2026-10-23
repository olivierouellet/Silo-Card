/**
 * Sensors of the Silo integration carry their silo in a `silo` attribute, with the card's own option names,
 * and the grain height in metres in `level`. The card then needs nothing but the entity.
 */
import type { HassEntity, SiloCardConfig } from './types';

export const INTEGRATION_DOMAIN = 'silo';

/** The options the integration sets; the card's own values for them are ignored. */
export const INTEGRATION_KEYS = [
  'measure',
  'sensor_height',
  'unit',
  'shape',
  'diameter',
  'rings',
  'ring_height',
  'top',
  'top_height',
  'bottom',
  'bottom_height',
  'outlet',
  'grain',
  'density',
  'density_unit',
  'capacity',
  'capacity_per',
  'weight_unit',
  'volume_unit',
  'include_roof',
] as const;

export type IntegrationSilo = Pick<SiloCardConfig, (typeof INTEGRATION_KEYS)[number]>;

/** The silo of an integration sensor, or undefined for any other entity. */
export function integrationSilo(entity: HassEntity | undefined): IntegrationSilo | undefined {
  const silo = entity?.attributes.silo;
  if (!silo || typeof silo !== 'object' || Array.isArray(silo)) return undefined;
  const values: Record<string, unknown> = {};
  for (const key of INTEGRATION_KEYS) {
    const value = (silo as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) values[key] = value;
  }
  return values as IntegrationSilo;
}

/** The grain height in metres, or NaN while the integration's source sensor has no reading. */
export function integrationLevel(entity: HassEntity): number {
  const level = entity.attributes.level;
  return typeof level === 'number' && Number.isFinite(level) ? level : NaN;
}

/** The sensor the integration reads, for messages. */
export function integrationSource(entity: HassEntity): string | undefined {
  const source = entity.attributes.source;
  return typeof source === 'string' ? source : undefined;
}
