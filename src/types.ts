import type { BottomType, Shape, TopType } from './geometry';
import type { DensityUnit, LengthUnit, VolumeUnit, WeightUnit } from './units';
import type { GrainId } from './const';

/** The parts of Home Assistant's `hass` object this card uses. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, { device_id?: string | null }>;
  devices?: Record<string, { name?: string | null; name_by_user?: string | null }>;
  config?: { unit_system?: { length?: string } };
  language?: string;
  locale?: { language: string };
}

export type Language = 'auto' | 'en' | 'fr';

/** What the sensor reports: the distance from the sensor down to the grain, or the grain's height. */
export type Measure = 'distance' | 'level';

/** What lies over the grain colour. */
export type Texture = 'stipple' | 'layers' | 'shaded' | 'hatching';

/** The lines beside the drawing, in the order given. */
export type Row = 'weight' | 'remaining' | 'volume' | 'level' | 'rings' | 'distance';

export interface SiloCardConfig {
  type: string;
  entity?: string;
  measure?: Measure;
  /** Height of the sensor above the silo's lowest point; the top of the silo when not set. */
  sensor_height?: number;

  /** Unit of every length below. */
  unit?: LengthUnit;
  shape?: Shape;
  diameter?: number;
  rings?: number;
  ring_height?: number;
  top?: TopType;
  top_height?: number;
  bottom?: BottomType;
  bottom_height?: number;
  outlet?: number;

  grain?: GrainId;
  density?: number;
  density_unit?: DensityUnit;
  /** Weight when full, in `weight_unit`. Wins over `density` and `grain`. */
  capacity?: number;
  /** Whether `capacity` is the whole silo's, or one ring's. */
  capacity_per?: 'silo' | 'ring';
  weight_unit?: WeightUnit;
  volume_unit?: VolumeUnit;
  include_roof?: boolean;
  /** Units the card shows, when they differ from the ones the silo was entered in. */
  display_unit?: LengthUnit;
  display_weight_unit?: WeightUnit;
  display_volume_unit?: VolumeUnit;
  /** Percentage under which the grain is drawn in the warning colour; 0 turns it off. */
  low_level?: number;

  title?: string;
  icon?: string;
  color?: string;
  rows?: readonly Row[];
  texture?: Texture;
  show_sensor?: boolean;
  language?: Language;
}

declare global {
  interface HASSDomEvents {
    'config-changed': { config: SiloCardConfig };
  }
}
