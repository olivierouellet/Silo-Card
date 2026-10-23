/** From the card's config and the sensor's state to the numbers the card shows. */
import { GRAINS, ResolvedConfig } from './const';
import {
  Part,
  Position,
  SiloGeometry,
  buildParts,
  capacityVolume,
  partVolume,
  partVolumeBelow,
  position,
  totalHeight,
  volumeBelow,
} from './geometry';
import { KG_PER_M3, KILOGRAMS, METRES } from './units';

export interface Silo {
  geometry: SiloGeometry;
  parts: Part[];
  height: number;
  sensorHeight: number;
  /** Volume when full (m³), as `include_roof` defines full. */
  capacity: number;
  /** Bulk density (kg/m³), when the config gives a grain, a density or a capacity. */
  density?: number;
}

export interface PartFill {
  part: Part;
  volume: number;
  /** 0 to 1. */
  fraction: number;
}

export interface Reading {
  /** Height of the grain above the silo's lowest point (m). */
  level: number;
  /** From the sensor down to the grain (m). */
  distance: number;
  volume: number;
  /** Of `capacity`; above 100 when grain fills the roof and the roof is not part of "full". */
  percent: number;
  weight?: number;
  remaining?: number;
  position: Position;
  parts: PartFill[];
}

/** The silo described by the config, or null while a dimension it needs is missing. */
export function siloFromConfig(cfg: ResolvedConfig): Silo | null {
  const m = METRES[cfg.unit] ?? 1;
  const len = (value: number | undefined) => (Number.isFinite(value) && value! > 0 ? value! * m : 0);
  const rings = Math.max(1, Math.round(cfg.rings));
  const geometry: SiloGeometry = {
    shape: cfg.shape,
    diameter: len(cfg.diameter),
    rings,
    ringHeight: len(cfg.ring_height),
    top: cfg.top,
    topHeight: len(cfg.top_height),
    bottom: cfg.bottom,
    bottomHeight: len(cfg.bottom_height),
    outlet: len(cfg.outlet),
  };
  if (!geometry.diameter || !geometry.ringHeight) return null;
  const parts = buildParts(geometry);
  const height = totalHeight(parts);
  const capacity = capacityVolume(parts, geometry.shape, cfg.include_roof);

  let density: number | undefined;
  if (cfg.capacity && cfg.capacity > 0) {
    // The weight of the whole silo, or of one full ring: the hopper and roof then follow from their volume.
    const ring = parts.find((p) => p.kind === 'ring')!;
    const volume = cfg.capacity_per === 'ring' ? partVolume(ring, geometry.shape) : capacity;
    density = (cfg.capacity * (KILOGRAMS[cfg.weight_unit] ?? 1)) / volume;
  } else if (cfg.density && cfg.density > 0) density = cfg.density * (KG_PER_M3[cfg.density_unit] ?? 1);
  else if (cfg.grain && cfg.grain in GRAINS) density = GRAINS[cfg.grain] * KG_PER_M3['lb/bu'];

  return {
    geometry,
    parts,
    height,
    sensorHeight: len(cfg.sensor_height) || height,
    capacity,
    density,
  };
}

/** Fill for a sensor value in metres; null when there is no usable value. */
export function readSilo(silo: Silo, value: number, measure: 'distance' | 'level'): Reading | null {
  if (!Number.isFinite(value)) return null;
  const raw = measure === 'level' ? value : silo.sensorHeight - value;
  const level = Math.min(Math.max(raw, 0), silo.height);
  const { shape } = silo.geometry;
  const volume = volumeBelow(silo.parts, shape, level);
  const weight = silo.density === undefined ? undefined : volume * silo.density;
  return {
    level,
    distance: Math.max(silo.sensorHeight - level, 0),
    volume,
    percent: silo.capacity > 0 ? (volume / silo.capacity) * 100 : 0,
    weight,
    remaining: weight === undefined ? undefined : Math.max(silo.capacity * silo.density! - weight, 0),
    position: position(silo.parts, level),
    parts: silo.parts.map((part) => {
      const full = partVolume(part, shape);
      const below = partVolumeBelow(part, shape, level);
      return { part, volume: below, fraction: full > 0 ? below / full : 0 };
    }),
  };
}
