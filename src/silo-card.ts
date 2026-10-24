import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { HassEntity, HomeAssistant, Measure, Row, SiloCardConfig } from './types';
import {
  CARD_TAG,
  CARD_VERSION,
  DEFAULTS,
  DEFAULT_COLOR,
  DEFAULT_ICON,
  EDITOR_TAG,
  ROW_ICONS,
  ResolvedConfig,
} from './const';
import { SensorStatus, drawSilo } from './drawing';
import { Reading, Silo, readSilo, siloFromConfig } from './silo';
import { CUBIC_METRES, KILOGRAMS, LengthUnit, METRES, VolumeUnit, WeightUnit, durationMs, sensorMetres } from './units';
import { Lang, intlLocale, localize, resolveLanguage } from './localize/localize';
import { integrationLevel, integrationSilo, integrationSource } from './integration';

console.info(
  `%c  SILO-CARD \n%c  Version ${CARD_VERSION}    `,
  'color: #7a5312; font-weight: bold; background: #f7ead2',
  'color: white; font-weight: bold; background: #7a5312',
);

interface WindowWithCustomCards extends Window {
  customCards: Array<{ type: string; name: string; description: string; preview?: boolean; documentationURL?: string }>;
}
const w = window as unknown as WindowWithCustomCards;
w.customCards = w.customCards || [];
w.customCards.push({
  type: CARD_TAG,
  name: 'Silo Card',
  description:
    'Draws a grain silo or bin section by section, and how full it is, from a distance sensor at the top. EN / FR.',
  preview: true,
  documentationURL: 'https://github.com/olivierouellet/Silo-Card',
});

/** Between a number and its unit. */
const NBSP = '\u00a0';
/** In place of a value while the sensor has no reading. */
const DASH = '\u2014';
/** How far back the recorder is searched for the last reading, step by step (10 days is its default). */
const LOOKBACK_HOURS = [1, 24, 240];

/** A state from `history/history_during_period` with `minimal_response`: times in seconds. */
interface HistoryState {
  s: string;
  lu: number;
  lc?: number;
}

/** A reading that isn't current: in metres, what the sensor measures, and when it stopped (ms). */
interface LastReading {
  value: number;
  measure: Measure;
  time: number;
}

/**
 * A card this many columns wide or less, in a sections view, is compact: icons for labels and shorter
 * values. Outside a sections view, a card this many pixels wide or less (4 columns are at most about 160).
 */
const COMPACT_COLUMNS = 4;
const COMPACT_WIDTH = 180;

/** setTimeout's longest delay, about 24 days. */
const MAX_TIMEOUT = 2 ** 31 - 1;

/** Why there is no current reading, from `_measure`. */
interface Missing {
  message: string;
  /** The sensor that has no reading: the integration's source, or the card's entity. */
  sensor: string;
  state: string;
  /** The sensor has a value, but older than `stale_after`. */
  tooOld?: boolean;
}

/** How long ago, in minutes up to an hour, hours up to two days, then days. */
function since(time: number): [number, 'minute' | 'hour' | 'day'] {
  const minutes = Math.max(1, Math.round((Date.now() - time) / 60_000));
  if (minutes < 60) return [minutes, 'minute'];
  if (minutes < 48 * 60) return [Math.round(minutes / 60), 'hour'];
  return [Math.round(minutes / 1440), 'day'];
}

/** Decimals shown for each unit. */
const LENGTH_DECIMALS: Record<LengthUnit, number> = { m: 2, cm: 0, mm: 0, ft: 1, in: 0 };
const WEIGHT_DECIMALS: Record<WeightUnit, number> = { t: 1, kg: 0, ton: 1, lb: 0 };
const VOLUME_DECIMALS: Record<VolumeUnit, number> = { m3: 1, L: 0, ft3: 0, bu: 0 };

/** Home Assistant's theme colour names (the `ui_color` selector), drawn with the theme's own value. */
const THEME_COLORS = new Set(
  'primary accent red pink purple deep-purple indigo blue light-blue cyan teal green light-green lime yellow amber orange deep-orange brown light-grey grey dark-grey blue-grey black white disabled'.split(
    ' ',
  ),
);

export function cssColor(color: string | undefined): string {
  if (!color) return DEFAULT_COLOR;
  return THEME_COLORS.has(color) ? `var(--${color}-color, ${color})` : color;
}

@customElement(CARD_TAG)
export class SiloCard extends LitElement {
  public static async getConfigElement(): Promise<HTMLElement> {
    await import('./editor');
    return document.createElement(EDITOR_TAG);
  }

  /**
   * Default config when the card is added from the picker: a Silo integration sensor, which brings its own
   * silo; else the first distance sensor and a small hopper bin.
   */
  public static getStubConfig(hass: HomeAssistant): Partial<SiloCardConfig> {
    const silo = Object.values(hass.states).find((s) => integrationSilo(s));
    if (silo) return { entity: silo.entity_id };
    const sensor = Object.values(hass.states).find(
      (s) => s.entity_id.startsWith('sensor.') && s.attributes.device_class === 'distance',
    );
    const imperial = hass.config?.unit_system?.length === 'mi';
    const shape = imperial
      ? { unit: 'ft', diameter: 10, rings: 5, ring_height: 2.67, top_height: 2.5, bottom_height: 6 }
      : { unit: 'm', diameter: 3, rings: 5, ring_height: 0.8, top_height: 0.8, bottom_height: 1.8 };
    return {
      ...(sensor ? { entity: sensor.entity_id } : {}),
      ...shape,
      top: 'cone',
      bottom: 'cone',
      grain: 'wheat',
      ...(imperial ? { weight_unit: 'ton', volume_unit: 'bu' } : {}),
    } as Partial<SiloCardConfig>;
  }

  @state() private _config?: ResolvedConfig;
  @state() public hass?: HomeAssistant;
  /** The config being drawn: the card's, with the integration's silo over it. */
  private _view!: ResolvedConfig;
  /**
   * The sensor's last reading before it lost it, from the recorder: `state` in the sensor's unit, and `time`
   * (ms) when the reading stopped. `key` is the sensor and when it lost the reading; nothing found leaves only it.
   */
  @state() private _last?: { key: string; state?: string; time?: number };
  /** The sensor whose last reading `updated` should look up, set by `render`. */
  private _lookup?: { sensor: string; since: string };
  /** When the current reading becomes too old (`stale_after`), set by `render`; a timer redraws the card then. */
  private _staleAt?: number;
  private _staleTimer?: ReturnType<typeof setTimeout>;
  /** The `updated` row shows how long ago, set by `render`; the timer redraws the card every minute then. */
  private _ticking = false;
  /** The card is narrow (`COMPACT_COLUMNS`): icons for labels, and no captions it can do without. */
  @state() private _compact = false;
  private _resize?: ResizeObserver;

  public setConfig(config: SiloCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    this._config = { ...DEFAULTS, ...config } as ResolvedConfig;
  }

  public getCardSize(): number {
    return 4;
  }

  /**
   * Sections view: as tall as its content by default ("Auto height"). Given a fixed height in the Layout tab,
   * the drawing shrinks to fit it; under 3 rows there is no room for the silo and its numbers.
   */
  public getGridOptions() {
    return { columns: 6, min_columns: 3, rows: 'auto' as const, min_rows: 3 };
  }

  private _t(key: string, vars?: Record<string, string>): string {
    return localize(key, this._lang, vars);
  }

  private get _lang(): Lang {
    return resolveLanguage(this._config?.language, this.hass);
  }

  private _number(value: number, decimals: number): string {
    return new Intl.NumberFormat(intlLocale(this._lang), {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(value);
  }

  private _percent(value: number): string {
    return new Intl.NumberFormat(intlLocale(this._lang), { style: 'percent', maximumFractionDigits: 0 }).format(
      value / 100,
    );
  }

  private _length(metres: number): string {
    const unit = this._view.display_unit ?? this._view.unit;
    return `${this._number(metres / METRES[unit], LENGTH_DECIMALS[unit])}${NBSP}${this._t(`units.${unit}`)}`;
  }

  private _weight(kg: number): string {
    const unit = this._view.display_weight_unit ?? this._view.weight_unit;
    return `${this._number(kg / KILOGRAMS[unit], WEIGHT_DECIMALS[unit])}${NBSP}${this._t(`units.${unit}`)}`;
  }

  private _volume(m3: number): string {
    const unit = this._view.display_volume_unit ?? this._view.volume_unit;
    return `${this._number(m3 / CUBIC_METRES[unit], VOLUME_DECIMALS[unit])}${NBSP}${this._t(`units.${unit}`)}`;
  }

  /** The title: the config's, else the sensor's device name, else "Silo". */
  private _title(): string {
    const cfg = this._config!;
    if (cfg.title) return cfg.title;
    const deviceId = cfg.entity ? this.hass?.entities?.[cfg.entity]?.device_id : undefined;
    const device = deviceId ? this.hass?.devices?.[deviceId] : undefined;
    return device?.name_by_user || device?.name || this._t('card.default_title');
  }

  /**
   * The sensor's value in metres and when it last updated (ms), or a message saying why there is none, with
   * `missing` when the sensor is merely without a reading (unknown, unavailable, or older than `stale_after`,
   * then given as `old`) rather than set up wrong.
   */
  private _measure(integration: boolean): {
    value?: number;
    time?: number;
    message?: string;
    missing?: Missing;
    old?: LastReading;
  } {
    const cfg = this._config!;
    if (!cfg.entity) return { message: this._t('card.no_entity') };
    const stateObj = this.hass!.states[cfg.entity];
    if (!stateObj) return { message: this._t('card.entity_not_found', { entity: cfg.entity }) };
    if (integration) {
      const value = integrationLevel(stateObj);
      const source = integrationSource(stateObj) ?? cfg.entity;
      if (Number.isFinite(value)) return this._fresh(value, 'level', this.hass!.states[source] ?? stateObj);
      const state = this.hass!.states[source]?.state ?? 'unknown';
      const message = this._t('card.unavailable', { entity: source, state });
      return { message, missing: { message, sensor: source, state } };
    }
    const value = sensorMetres(stateObj.state, stateObj.attributes.unit_of_measurement, cfg.unit);
    if (Number.isFinite(value)) return this._fresh(value, this._view.measure, stateObj);
    if (Number.isFinite(Number.parseFloat(stateObj.state))) {
      const unit = String(stateObj.attributes.unit_of_measurement ?? '');
      return { message: this._t('card.not_a_length', { entity: cfg.entity, unit }) };
    }
    const message = this._t('card.unavailable', { entity: cfg.entity, state: stateObj.state });
    return { message, missing: { message, sensor: cfg.entity, state: stateObj.state } };
  }

  /**
   * A reading, unless the sensor last updated longer ago than `stale_after`: then it is missing, and the
   * reading is only the last one. Home Assistant updates a sensor only when its value changes, unless the
   * sensor forces it (ESPHome's `force_update`).
   */
  private _fresh(value: number, measure: Measure, sensor: HassEntity): ReturnType<SiloCard['_measure']> {
    const limit = durationMs(this._view.stale_after);
    const time = Date.parse(sensor.last_updated);
    if (!Number.isFinite(time)) return { value };
    if (!limit) return { value, time };
    if (Date.now() - time <= limit) {
      this._staleAt = time + limit;
      return { value, time };
    }
    const message = this._t('card.too_old', { entity: sensor.entity_id, time: this._ago(time) });
    return {
      message,
      missing: { message, sensor: sensor.entity_id, state: 'unavailable', tooOld: true },
      old: { value, measure, time },
    };
  }

  /**
   * The last reading of a sensor that has none now, in metres, and when it stopped; undefined until the
   * recorder has answered, or when it has nothing.
   */
  private _lastReading(missing: Missing): LastReading | undefined {
    const stateObj = this.hass!.states[missing.sensor];
    this._lookup = stateObj ? { sensor: missing.sensor, since: stateObj.last_changed } : undefined;
    const last = this._last;
    if (!stateObj || !last?.state || last.key !== `${missing.sensor}@${stateObj.last_changed}`) return undefined;
    const value = sensorMetres(last.state, stateObj.attributes.unit_of_measurement, this._view.unit);
    return Number.isFinite(value) ? { value, measure: this._view.measure, time: last.time! } : undefined;
  }

  protected updated(): void {
    if (this._lookup) this._fetchLast(this._lookup.sensor, this._lookup.since);
    clearTimeout(this._staleTimer);
    if (this._staleAt !== undefined || this._ticking) {
      const stale = this._staleAt === undefined ? MAX_TIMEOUT : Math.max(this._staleAt - Date.now(), 0) + 1000;
      const delay = Math.min(stale, this._ticking ? 60_000 : MAX_TIMEOUT, MAX_TIMEOUT);
      this._staleTimer = setTimeout(() => this.requestUpdate(), delay);
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    this._resize ??= new ResizeObserver(() => this._measureCompact());
    this._resize.observe(this);
  }

  /**
   * Compact by its columns in a sections view, which sets `--column-size` on the card's wrapper (changing
   * them resizes the card), else by its width.
   */
  private _measureCompact(): void {
    const columns = Number.parseFloat(getComputedStyle(this).getPropertyValue('--column-size'));
    const width = this.clientWidth;
    this._compact = Number.isFinite(columns) ? columns <= COMPACT_COLUMNS : width > 0 && width <= COMPACT_WIDTH;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    clearTimeout(this._staleTimer);
  }

  /**
   * Asks the recorder for the sensor's last number before `since`, when it lost its reading: an hour back,
   * then a day, then ten. The reading stopped when the state after it began.
   */
  private async _fetchLast(sensor: string, since: string): Promise<void> {
    const key = `${sensor}@${since}`;
    if (this._last?.key === key || !this.hass?.callWS) return;
    this._last = { key };
    const end = new Date(since).getTime();
    for (const hours of LOOKBACK_HOURS) {
      let states: HistoryState[];
      try {
        const result = await this.hass.callWS<Record<string, HistoryState[]>>({
          type: 'history/history_during_period',
          start_time: new Date(end - hours * 3600_000).toISOString(),
          end_time: new Date(end).toISOString(),
          entity_ids: [sensor],
          minimal_response: true,
          no_attributes: true,
        });
        states = result[sensor] ?? [];
      } catch {
        return;
      }
      let i = states.length - 1;
      while (i >= 0 && !Number.isFinite(Number.parseFloat(states[i].s))) i--;
      if (i >= 0) {
        const next = states[i + 1];
        const time = next ? (next.lc ?? next.lu) * 1000 : end;
        if (this._last?.key === key) this._last = { key, state: states[i].s, time };
        return;
      }
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    const fromIntegration = integrationSilo(this._config.entity ? this.hass.states[this._config.entity] : undefined);
    const cfg = (this._view = { ...this._config, ...fromIntegration } as ResolvedConfig);
    const silo = siloFromConfig(cfg);
    this._lookup = this._staleAt = undefined;
    const { value, time, message, missing, old } = this._measure(!!fromIntegration);
    const last = silo && missing && cfg.show_last_reading ? (old ?? this._lastReading(missing)) : undefined;
    const updated = value !== undefined ? time : last?.time;
    this._ticking = updated !== undefined && cfg.rows.includes('updated');
    // The integration gives the grain height, whatever its own sensor measures; its source's last reading
    // in the recorder is what that sensor measures.
    const measure = value !== undefined ? (fromIntegration ? 'level' : cfg.measure) : (last?.measure ?? cfg.measure);
    const measured = value ?? last?.value;
    const reading = silo && measured !== undefined ? readSilo(silo, measured, measure) : null;
    const status: SensorStatus = value !== undefined ? 'ok' : !reading ? 'none' : missing?.tooOld ? 'old' : 'stale';
    const low = status === 'ok' && !!reading && cfg.low_level > 0 && reading.percent < cfg.low_level;
    const grain = cfg.grain ? this._t(`grains.${cfg.grain}`) : undefined;
    // The title moves above the main value only when there is one; a setup message keeps the header.
    const titleInStats = cfg.title_position === 'stats' && !!silo && !!(reading || missing);

    return html`
      <ha-card
        class="layout-${cfg.layout} ${this._compact ? 'compact' : ''}"
        style=${styleMap({ '--silo-grain': cssColor(cfg.color) })}
      >
        ${
          titleInStats
            ? nothing
            : html`<div class="header">
                <ha-icon icon=${cfg.icon || DEFAULT_ICON}></ha-icon>
                <div class="titles">
                  <div class="title">${this._title()}</div>
                  ${grain ? html`<div class="subtitle">${grain}</div>` : nothing}
                </div>
              </div>`
        }
        ${
          !silo
            ? html`<div class="message">${this._t('card.no_dimensions')}</div>`
            : html`
                <div
                  class="body ${cfg.entity ? 'clickable' : ''}"
                  role=${cfg.entity ? 'button' : nothing}
                  tabindex=${cfg.entity ? 0 : nothing}
                  @click=${this._moreInfo}
                  @keydown=${this._keydown}
                >
                  <div class="drawing">${this._renderDrawing(silo, reading, low, status)}</div>
                  <div class="stats">
                    ${
                      reading || missing
                        ? html`${titleInStats ? this._renderName(grain) : nothing}
                          ${this._renderStats(silo, reading, low, status, missing, updated)}`
                        : html`<div class="message">${message}</div>`
                    }
                  </div>
                </div>
              `
        }
      </ha-card>
    `;
  }

  private _renderDrawing(silo: Silo, reading: Reading | null, low: boolean, status: SensorStatus): TemplateResult {
    const cfg = this._view;
    const partName = (kind: string, index: number) =>
      this._t(`card.part_${kind}`, { index: String(silo.geometry.rings > 1 ? index : '') }).trim();
    const partTitles = silo.parts.map((part, i) => {
      const fill = reading?.parts[i];
      if (!fill) return partName(part.kind, part.index);
      const amount = silo.density !== undefined ? this._weight(fill.volume * silo.density) : this._volume(fill.volume);
      return this._t('card.part_tooltip', {
        part: partName(part.kind, part.index),
        percent: this._percent(fill.fraction * 100),
        amount,
      });
    });
    return drawSilo(silo, reading, {
      showSensor: cfg.show_sensor && cfg.measure === 'distance',
      low,
      status,
      texture: cfg.texture,
      partTitles,
      sensorTitle:
        status === 'ok' && reading
          ? this._t('card.sensor_tooltip', { distance: this._length(reading.distance) })
          : undefined,
    });
  }

  /** The title above the main value, with the grain after it, when `title_position` is `stats`. */
  private _renderName(grain: string | undefined): TemplateResult {
    return html`<div class="name">
      <span class="title">${this._title()}</span>${grain ? html`<span class="subtitle">${grain}</span>` : nothing}
    </div>`;
  }

  /**
   * The main value and the rows. Without a reading, the same lines with dashes for values and the sensor's
   * state as the caption, so the card keeps its height. With the last reading instead, its values greyed.
   * The `updated` row says how long ago the reading was (`updated`, ms), in the sensor light's colour once it
   * isn't current. The message says why in a tooltip.
   */
  private _renderStats(
    silo: Silo,
    r: Reading | null,
    low: boolean,
    status: SensorStatus,
    missing?: Missing,
    updated?: number,
  ): TemplateResult {
    const cfg = this._view;
    const weighed = silo.density !== undefined;
    const values: Record<Row, string | undefined> = r
      ? {
          percent: this._percent(r.percent),
          weight: r.weight === undefined ? undefined : this._weight(r.weight),
          remaining: r.remaining === undefined ? undefined : this._weight(r.remaining),
          volume: this._volume(r.volume),
          level: this._length(r.level),
          // A wall without rings has nothing to count, unless the grain is in the hopper or roof.
          rings: silo.geometry.rings > 1 || r.position.kind !== 'rings' ? this._position(silo, r) : undefined,
          distance: this._length(r.distance),
          updated: updated === undefined ? DASH : this._compact ? this._age(updated) : this._ago(updated),
        }
      : {
          percent: DASH,
          weight: weighed ? DASH : undefined,
          remaining: weighed ? DASH : undefined,
          volume: DASH,
          level: DASH,
          rings: silo.geometry.rings > 1 ? DASH : undefined,
          distance: DASH,
          updated: DASH,
        };
    const stateName = missing && this._t(`card.state_${missing.state === 'unavailable' ? 'unavailable' : 'unknown'}`);
    const main = r ? this._main(silo, r) : ['', stateName!];
    // Without a main value (`primary: none`), the line stays for the state and the badges.
    const showValue = !r || cfg.primary !== 'none';
    const rows = cfg.rows
      .filter((row) => values[row] !== undefined)
      .map((row) => [row, this._t(`card.${row}`), values[row]!] as const);
    const icons = cfg.labels === 'icons' || this._compact;
    // The sand runs out once the reading is past stale_after, or gone.
    const icon = (row: Row) =>
      row === 'updated' && (status === 'old' || status === 'none') ? 'mdi:timer-sand-complete' : ROW_ICONS[row];

    return html`
      ${
        showValue || low || missing
          ? html`<div class="main ${low ? 'low' : ''} ${r ? '' : 'no-value'}" title=${missing?.message ?? nothing}>
              ${r && showValue ? html`<span class="value">${main[0]}</span>` : nothing}
              ${showValue && main[1] ? html`<span class="unit">${main[1]}</span>` : nothing}
              ${low ? html`<span class="badge"><ha-icon icon="mdi:alert-outline"></ha-icon>${this._t('card.low')}</span>` : nothing}
            </div>`
          : nothing
      }
      <dl class=${missing ? 'stale' : ''}>
        ${rows.map(
          ([row, label, value]) =>
            html`<div class="row ${icons ? 'with-icon' : ''} ${row === 'updated' ? `updated ${status}` : ''}">
              ${
                icons
                  ? html`<dt class="icon" title=${label} aria-label=${label}>
                      <ha-icon icon=${icon(row)}></ha-icon>
                    </dt>`
                  : html`<dt>${label}</dt>`
              }
              <dd>${value}</dd>
            </div>`,
        )}
      </dl>
    `;
  }

  /**
   * The big value and its caption: the `primary` option, or the fill when that value isn't there (no weight
   * without a density, no rings to count in a plain wall).
   */
  private _main(silo: Silo, r: Reading): [string, string] {
    const p = r.position;
    switch (this._view.primary) {
      case 'weight':
        if (r.weight !== undefined) return [this._weight(r.weight), this._t('card.main_weight')];
        break;
      case 'remaining':
        if (r.remaining !== undefined) return [this._weight(r.remaining), this._t('card.main_remaining')];
        break;
      case 'volume':
        return [this._volume(r.volume), this._t('card.main_volume')];
      case 'level':
        return [this._length(r.level), this._t('card.main_level')];
      case 'distance':
        return [this._length(r.distance), this._t('card.main_distance')];
      case 'rings': {
        if (p.kind === 'bottom' || p.kind === 'top') {
          const fill = r.parts.find((f) => f.part.kind === p.kind)?.fraction ?? 0;
          return [this._percent(fill * 100), ''];
        }
        const total = silo.geometry.rings;
        if (total > 1) {
          const rings = p.kind === 'rings' ? p.rings : 0;
          const caption = this._compact ? '' : this._t('card.main_rings', { total: String(total) });
          return [this._number(rings, 1), caption];
        }
        break;
      }
    }
    return [this._percent(r.percent), this._compact ? '' : this._t('card.full')];
  }

  /** "3 h ago", in the card's language. */
  private _ago(time: number): string {
    const [amount, unit] = since(time);
    return new Intl.RelativeTimeFormat(intlLocale(this._lang), { style: 'short' }).format(-amount, unit);
  }

  /** "3 h", without the "ago", for a compact card. */
  private _age(time: number): string {
    const [amount, unit] = since(time);
    return new Intl.NumberFormat(intlLocale(this._lang), { style: 'unit', unit, unitDisplay: 'short' }).format(amount);
  }

  /** "4.3 of 7" on the rings ("4.3" in a compact card), or the share of the hopper or roof that is full. */
  private _position(silo: Silo, r: Reading): string {
    const p = r.position;
    const filled = (kind: 'bottom' | 'top') =>
      this._percent((r.parts.find((f) => f.part.kind === kind)?.fraction ?? 0) * 100);
    if (p.kind === 'bottom' || p.kind === 'top') return filled(p.kind);
    if (p.kind === 'empty') return this._t('card.empty');
    const rings = this._number(p.rings, 1);
    return this._compact ? rings : this._t('card.rings_value', { rings, total: String(silo.geometry.rings) });
  }

  private _moreInfo(): void {
    if (!this._config?.entity) return;
    this.dispatchEvent(
      new CustomEvent('hass-more-info', { detail: { entityId: this._config.entity }, bubbles: true, composed: true }),
    );
  }

  private _keydown(ev: KeyboardEvent): void {
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      this._moreInfo();
    }
  }

  static styles = css`
    /* As tall as the sections slot when it has a fixed height (auto otherwise), so ha-card can fill it. */
    :host {
      display: block;
      height: 100%;
      --silo-wall: var(--secondary-text-color, #727272);
      --silo-low: var(--warning-color, #ffa600);
    }
    /* A column that fills the card: in a fixed-height slot the body gets what the header leaves. */
    ha-card {
      padding: 12px 16px 16px;
      height: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      /* Lets the layout follow the card's own width, not the screen's. */
      container-type: inline-size;
    }
    .header {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
    }
    .header ha-icon {
      color: var(--silo-grain);
      flex-shrink: 0;
    }
    .titles {
      min-width: 0;
    }
    .title {
      font-size: 1.15em;
      font-weight: 500;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .subtitle {
      font-size: 0.85em;
      color: var(--secondary-text-color);
    }
    /* The title above the main value, the grain beside it; without the header the card starts with the body. */
    .name {
      display: flex;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      margin-bottom: 2px;
    }
    .name .title {
      min-width: 0;
    }
    .name .subtitle {
      flex-shrink: 0;
    }
    .name + dl {
      margin-top: 8px;
    }
    .body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      align-items: stretch;
      gap: 16px;
      border-radius: 8px;
      outline: none;
    }
    .body.clickable {
      cursor: pointer;
    }
    .body:focus-visible {
      box-shadow: 0 0 0 2px var(--primary-color);
    }
    .drawing {
      flex-shrink: 0;
      max-width: 40%;
      min-height: 0;
      display: flex;
      align-items: flex-end;
    }
    /* Its natural size (168 px tall), scaled down to the space there is, keeping its proportions. */
    svg.silo {
      width: auto;
      height: auto;
      max-width: 100%;
      max-height: 100%;
      overflow: visible;
    }
    .wall {
      fill: color-mix(in srgb, var(--silo-wall) 8%, transparent);
      stroke: none;
    }
    .edge {
      fill: none;
      stroke: var(--silo-wall);
      stroke-width: 1.5px;
      stroke-linejoin: round;
    }
    .grain {
      fill: var(--silo-grain);
    }
    .low .grain {
      fill: var(--silo-low);
    }
    .texture {
      pointer-events: none;
    }
    .texture-dark {
      fill: rgba(0, 0, 0, 0.28);
    }
    .texture-light {
      fill: rgba(255, 255, 255, 0.4);
    }
    .texture-line {
      fill: none;
      stroke: rgba(0, 0, 0, 0.2);
    }
    .texture-line.faint {
      stroke: rgba(0, 0, 0, 0.14);
    }
    .surface {
      stroke: color-mix(in srgb, var(--silo-grain) 60%, black);
      stroke-width: 1.5px;
    }
    .low .surface {
      stroke: color-mix(in srgb, var(--silo-low) 60%, black);
    }
    /* The ring seams under the grain: darker on a light grain, lighter on a dark one, in light and dark themes. */
    .seam {
      --seam-on: var(--silo-grain);
      stroke: color-mix(in srgb, var(--seam-on) 45%, black);
      stroke-width: 1.5px;
    }
    @supports (color: lch(from red l c h)) {
      .seam {
        stroke: lch(from var(--seam-on) calc((62 - l) * 100) 0 0 / 0.45);
      }
    }
    .low .seam {
      --seam-on: var(--silo-low);
    }
    .leg,
    .ground {
      stroke: var(--silo-wall);
      stroke-width: 1.5px;
      stroke-linecap: round;
    }
    .ground {
      stroke: var(--divider-color, rgba(0, 0, 0, 0.12));
      stroke-width: 2px;
    }
    /*
     * The sensor is a status light: green with a reading, orange blinking with only the last one, red
     * blinking with none or one older than stale_after. The silo fades without a current reading, so it doesn't pass for the real level.
     */
    svg.silo {
      --silo-status: var(--success-color, #43a047);
    }
    svg.status-stale {
      --silo-status: var(--warning-color, #ffa600);
    }
    svg.status-old,
    svg.status-none {
      --silo-status: var(--error-color, #db4437);
    }
    .status-stale .structure,
    .status-old .structure {
      opacity: 0.5;
      filter: grayscale(0.6);
    }
    .status-none .structure {
      opacity: 0.25;
    }
    .sensor rect {
      fill: var(--silo-status);
      stroke: none;
    }
    .status-stale .sensor rect,
    .status-old .sensor rect,
    .status-none .sensor rect {
      animation: blink 2s ease-in-out infinite;
    }
    @keyframes blink {
      50% {
        opacity: 0.25;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .sensor rect {
        animation: none !important;
      }
    }
    .beam {
      stroke: var(--silo-status);
      stroke-width: 1px;
      stroke-dasharray: 3 3;
      opacity: 0.8;
    }
    .stats {
      flex: 1;
      min-width: 0;
      min-height: 0;
      align-self: center;
      overflow: hidden;
    }
    .main {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 6px;
      margin-bottom: 8px;
    }
    .main .value {
      font-size: 2em;
      font-weight: 500;
      line-height: 1.1;
    }
    .main .unit {
      color: var(--secondary-text-color);
    }
    /* The state alone, as tall as a value would be, so the rows stay where they are. */
    .main.no-value {
      min-height: 2.2em;
      align-items: center;
    }
    dl.stale dd {
      color: var(--secondary-text-color);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 2px;
      align-self: center;
      font-size: 0.8em;
      font-weight: 500;
      padding: 1px 8px 1px 5px;
      border-radius: 10px;
      color: var(--silo-low);
      background: color-mix(in srgb, var(--silo-low) 16%, transparent);
      --mdc-icon-size: 14px;
    }
    /* How long ago, in the sensor light's colour: orange with only the last reading, red past stale_after. */
    .row.updated.stale dt.icon,
    .row.updated.stale dd {
      color: var(--warning-color, #ffa600);
    }
    .row.updated.old dt.icon,
    .row.updated.old dd,
    .row.updated.none dt.icon,
    .row.updated.none dd {
      color: var(--error-color, #db4437);
    }
    dl {
      margin: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font-size: 0.9em;
    }
    /* With icons, each value right after its icon, left-aligned. */
    .row.with-icon {
      justify-content: flex-start;
      gap: 10px;
    }
    /* In a narrow card the value is cut short, not the icon. */
    /* A compact card is as narrow as 88 px on a phone: less padding and gap leave its values the room. */
    ha-card.compact {
      padding: 12px 8px;
    }
    ha-card.compact .row.with-icon {
      gap: 6px;
    }
    /* Narrower still (3 columns, under about 116 px): smaller text, so the values fit whole. */
    @container (max-width: 100px) {
      ha-card.compact .main .value {
        font-size: 1.6em;
      }
      ha-card.compact .row {
        font-size: 0.8em;
      }
      ha-card.compact dt.icon {
        --mdc-icon-size: 16px;
      }
    }
    .row.with-icon dd {
      text-align: left;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    dt.icon {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      overflow: visible;
      --mdc-icon-size: 18px;
    }
    dt {
      color: var(--secondary-text-color);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    dd {
      margin: 0;
      font-weight: 500;
      white-space: nowrap;
      text-align: right;
    }
    .message {
      padding: 8px 0;
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }

    /*
     * The silo above the numbers: always with layout: stacked, and with layout: auto when the card is too
     * narrow for both side by side (in em, so larger text stacks sooner).
     */
    ha-card.layout-stacked .body {
      flex-direction: column;
      gap: 8px;
    }
    ha-card.layout-stacked .drawing {
      max-width: none;
      flex: 1 1 auto;
      justify-content: center;
    }
    /* The numbers as a block centred under the silo, their lines still left-aligned. */
    ha-card.layout-stacked .stats {
      flex: 0 0 auto;
      align-self: center;
      width: fit-content;
      max-width: 100%;
    }
    @container (max-width: 14em) {
      ha-card.layout-auto .body {
        flex-direction: column;
        gap: 8px;
      }
      ha-card.layout-auto .drawing {
        max-width: none;
        flex: 1 1 auto;
        justify-content: center;
      }
      ha-card.layout-auto .stats {
        flex: 0 0 auto;
        align-self: center;
        width: fit-content;
        max-width: 100%;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'silo-card': SiloCard;
  }
}
