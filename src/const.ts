import type { SiloCardConfig } from './types';

export const CARD_VERSION = '0.1.0';
export const CARD_TAG = 'silo-card';
export const EDITOR_TAG = 'silo-card-editor';

export const DEFAULT_ICON = 'mdi:silo';
export const DEFAULT_COLOR = '#d9a441';

/**
 * Standard bushel weights (lb per US bushel), the ones North American grain is bought and sold by.
 * Real grain varies with moisture and quality: set `density` from your own test weight when it matters.
 */
export const GRAINS = {
  wheat: 60,
  corn: 56,
  barley: 48,
  oats: 32,
  soybeans: 60,
  canola: 50,
  rye: 56,
  peas: 60,
  flax: 56,
  sorghum: 56,
} as const;

export const ROWS = ['percent', 'weight', 'remaining', 'volume', 'level', 'rings', 'distance'] as const;

/** The icon of each line, with `labels: icons`. */
export const ROW_ICONS: Record<(typeof ROWS)[number], string> = {
  percent: 'mdi:percent-circle-outline',
  weight: 'mdi:weight',
  remaining: 'mdi:truck-delivery',
  volume: 'mdi:cube-outline',
  level: 'mdi:arrow-expand-vertical',
  rings: 'mdi:ladder',
  distance: 'mdi:signal-distance-variant',
};

export const TEXTURES = ['stipple', 'layers', 'shaded', 'hatching'] as const;

export type GrainId = keyof typeof GRAINS;

/** Options the card falls back on, and the editor shows, when the config does not set them. */
export const DEFAULTS = {
  measure: 'distance',
  unit: 'm',
  shape: 'round',
  rings: 1,
  top: 'cone',
  top_height: 0,
  top_opening: 0,
  bottom: 'flat',
  bottom_height: 0,
  outlet: 0,
  density_unit: 'kg/m3',
  capacity_per: 'silo',
  weight_unit: 't',
  volume_unit: 'm3',
  include_roof: false,
  low_level: 20,
  primary: 'percent',
  rows: ['weight', 'remaining', 'level', 'rings'],
  labels: 'text',
  layout: 'auto',
  texture: 'stipple',
  show_sensor: true,
  language: 'auto',
} as const satisfies Partial<SiloCardConfig>;

export type ResolvedConfig = SiloCardConfig & {
  -readonly [K in keyof typeof DEFAULTS]: NonNullable<SiloCardConfig[K]>;
};
