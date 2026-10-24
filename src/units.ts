/** Unit conversions. Everything inside the card is in metres, cubic metres and kilograms. */

export type LengthUnit = 'm' | 'cm' | 'mm' | 'ft' | 'in';
export type VolumeUnit = 'm3' | 'L' | 'ft3' | 'bu';
/** `ton` is the short ton (2000 lb); `t` the metric tonne. */
export type WeightUnit = 't' | 'kg' | 'ton' | 'lb';
export type DensityUnit = 'kg/m3' | 'kg/hL' | 'lb/bu' | 'lb/ft3';

export const LENGTH_UNITS: LengthUnit[] = ['m', 'cm', 'mm', 'ft', 'in'];
export const VOLUME_UNITS: VolumeUnit[] = ['m3', 'L', 'ft3', 'bu'];
export const WEIGHT_UNITS: WeightUnit[] = ['t', 'kg', 'ton', 'lb'];
export const DENSITY_UNITS: DensityUnit[] = ['kg/m3', 'kg/hL', 'lb/bu', 'lb/ft3'];

const POUND = 0.45359237; // kg
const FOOT = 0.3048; // m
/** US (Winchester) bushel, 2150.42 cubic inches, the one grain is sold by in North America. */
const BUSHEL = 0.03523907016688; // m³

export const METRES: Record<LengthUnit, number> = { m: 1, cm: 0.01, mm: 0.001, ft: FOOT, in: 0.0254 };
export const CUBIC_METRES: Record<VolumeUnit, number> = { m3: 1, L: 0.001, ft3: FOOT ** 3, bu: BUSHEL };
export const KILOGRAMS: Record<WeightUnit, number> = { t: 1000, kg: 1, ton: 2000 * POUND, lb: POUND };
export const KG_PER_M3: Record<DensityUnit, number> = {
  'kg/m3': 1,
  'kg/hL': 10,
  'lb/bu': POUND / BUSHEL,
  'lb/ft3': POUND / FOOT ** 3,
};

/** A delay in the card's config: minutes, or the object of Home Assistant's duration selector. */
export type Duration = number | { days?: number; hours?: number; minutes?: number; seconds?: number };

/** A delay in milliseconds; 0 when it isn't set. */
export function durationMs(duration: Duration | undefined): number {
  if (typeof duration === 'number') return Math.max(duration, 0) * 60_000;
  if (!duration || typeof duration !== 'object') return 0;
  const { days = 0, hours = 0, minutes = 0, seconds = 0 } = duration;
  const ms = (((days * 24 + hours) * 60 + minutes) * 60 + seconds) * 1000;
  return Number.isFinite(ms) ? Math.max(ms, 0) : 0;
}

/** Units a distance sensor may report in, as Home Assistant spells them. */
const SENSOR_METRES: Record<string, number> = { mm: 0.001, cm: 0.01, m: 1, km: 1000, in: 0.0254, ft: FOOT, yd: 0.9144 };

/**
 * A sensor's state in metres, using its `unit_of_measurement` (or `fallback` when it has none).
 * Returns NaN for "unknown", "unavailable" and units that are not lengths.
 */
export function sensorMetres(state: string, unit: unknown, fallback: LengthUnit): number {
  const value = Number.parseFloat(state);
  if (!Number.isFinite(value)) return NaN;
  const factor = typeof unit === 'string' && unit ? SENSOR_METRES[unit.trim()] : METRES[fallback];
  return factor === undefined ? NaN : value * factor;
}

/** Converts a length between units, rounded to what makes sense for the target unit (editor unit changes). */
export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  const decimals: Record<LengthUnit, number> = { m: 3, cm: 1, mm: 0, ft: 2, in: 1 };
  const factor = 10 ** decimals[to];
  return Math.round(((value * METRES[from]) / METRES[to]) * factor) / factor;
}
