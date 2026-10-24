import type { BottomType, Shape, TopType } from './geometry';
import type { DensityUnit, Duration, LengthUnit, VolumeUnit, WeightUnit } from './units';
import type { GrainId } from './const';

/** The parts of Home Assistant's `hass` object this card uses. */
export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_updated: string;
  last_changed: string;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  entities?: Record<string, { device_id?: string | null }>;
  devices?: Record<string, { name?: string | null; name_by_user?: string | null }>;
  config?: { unit_system?: { length?: string } };
  language?: string;
  locale?: { language: string };
  callWS?<T>(msg: Record<string, unknown>): Promise<T>;
}

export type Language = 'auto' | 'en' | 'fr';

/** What the sensor reports: the distance from the sensor down to the grain, or the grain's height. */
export type Measure = 'distance' | 'level';

/** What lies over the grain colour. */
export type Texture = 'stipple' | 'layers' | 'shaded' | 'hatching';

/** The lines beside the drawing, in the order given. */
export type Row = 'percent' | 'weight' | 'remaining' | 'volume' | 'level' | 'rings' | 'distance';

export interface SiloCardConfig {
  type: string;
  entity?: string;
  measure?: Measure;
  /** Height of the sensor above the silo's lowest point; the top of the silo when not set. */
  sensor_height?: number;

  /** Unit of every length below that has no unit of its own (`diameter_unit`, `ring_height_unit`…). */
  unit?: LengthUnit;
  diameter_unit?: LengthUnit;
  ring_height_unit?: LengthUnit;
  top_height_unit?: LengthUnit;
  top_opening_unit?: LengthUnit;
  bottom_height_unit?: LengthUnit;
  outlet_unit?: LengthUnit;
  sensor_height_unit?: LengthUnit;
  shape?: Shape;
  diameter?: number;
  rings?: number;
  ring_height?: number;
  top?: TopType;
  top_height?: number;
  /** Diameter of the flat lid at the top of a cone roof; 0 for a pointed roof. */
  top_opening?: number;
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
  /** The big value at the top of the stats. */
  primary?: Row | 'none';
  rows?: readonly Row[];
  /** The lines' names, or an icon for each (the name then shows on hover). */
  labels?: 'text' | 'icons';
  /** The silo beside the numbers, above them, or above them only when the card is narrow. */
  layout?: 'auto' | 'side' | 'stacked';
  /** The title and icon in the header, or the title alone above the main value. */
  title_position?: 'header' | 'stats';
  texture?: Texture;
  show_sensor?: boolean;
  /** While the sensor has no reading, its last one from the recorder, marked as stale. */
  show_last_reading?: boolean;
  /** A reading older than this counts as none: the sensor is shown as unavailable. */
  stale_after?: Duration;
  language?: Language;
}

declare global {
  interface HASSDomEvents {
    'config-changed': { config: SiloCardConfig };
  }
}
