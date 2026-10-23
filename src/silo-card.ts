import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { HomeAssistant, Row, SiloCardConfig } from './types';
import { CARD_TAG, CARD_VERSION, DEFAULTS, DEFAULT_COLOR, DEFAULT_ICON, EDITOR_TAG, ResolvedConfig } from './const';
import { drawSilo } from './drawing';
import { Reading, Silo, readSilo, siloFromConfig } from './silo';
import { CUBIC_METRES, KILOGRAMS, LengthUnit, METRES, VolumeUnit, WeightUnit, sensorMetres } from './units';
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

/** Decimals shown for each unit. */
const LENGTH_DECIMALS: Record<LengthUnit, number> = { m: 2, cm: 0, ft: 1, in: 0 };
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

  public setConfig(config: SiloCardConfig): void {
    if (!config) throw new Error('Invalid configuration');
    this._config = { ...DEFAULTS, ...config } as ResolvedConfig;
  }

  public getCardSize(): number {
    return 4;
  }

  public getGridOptions() {
    return { columns: 6, min_columns: 4, rows: 'auto' as const };
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

  /** The sensor's value in metres, or a message saying why there is none. */
  private _measure(integration: boolean): { value?: number; message?: string } {
    const cfg = this._config!;
    if (!cfg.entity) return { message: this._t('card.no_entity') };
    const stateObj = this.hass!.states[cfg.entity];
    if (!stateObj) return { message: this._t('card.entity_not_found', { entity: cfg.entity }) };
    if (integration) {
      const value = integrationLevel(stateObj);
      if (Number.isFinite(value)) return { value };
      const source = integrationSource(stateObj) ?? cfg.entity;
      const sourceState = this.hass!.states[source]?.state ?? 'unknown';
      return { message: this._t('card.unavailable', { entity: source, state: sourceState }) };
    }
    const value = sensorMetres(stateObj.state, stateObj.attributes.unit_of_measurement, cfg.unit);
    if (Number.isFinite(value)) return { value };
    if (Number.isFinite(Number.parseFloat(stateObj.state))) {
      const unit = String(stateObj.attributes.unit_of_measurement ?? '');
      return { message: this._t('card.not_a_length', { entity: cfg.entity, unit }) };
    }
    return { message: this._t('card.unavailable', { entity: cfg.entity, state: stateObj.state }) };
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._config || !this.hass) return nothing;
    const fromIntegration = integrationSilo(this._config.entity ? this.hass.states[this._config.entity] : undefined);
    const cfg = (this._view = { ...this._config, ...fromIntegration } as ResolvedConfig);
    const silo = siloFromConfig(cfg);
    const { value, message } = this._measure(!!fromIntegration);
    // The integration gives the grain height, whatever its own sensor measures.
    const measure = fromIntegration ? 'level' : cfg.measure;
    const reading = silo && value !== undefined ? readSilo(silo, value, measure) : null;
    const low = !!reading && cfg.low_level > 0 && reading.percent < cfg.low_level;
    const grain = cfg.grain ? this._t(`grains.${cfg.grain}`) : undefined;

    return html`
      <ha-card style=${styleMap({ '--silo-grain': cssColor(cfg.color) })}>
        <div class="header">
          <ha-icon icon=${cfg.icon || DEFAULT_ICON}></ha-icon>
          <div class="titles">
            <div class="title">${this._title()}</div>
            ${grain ? html`<div class="subtitle">${grain}</div>` : nothing}
          </div>
        </div>
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
                  <div class="drawing">${this._renderDrawing(silo, reading, low)}</div>
                  <div class="stats">
                    ${reading ? this._renderStats(silo, reading, low) : html`<div class="message">${message}</div>`}
                  </div>
                </div>
              `
        }
      </ha-card>
    `;
  }

  private _renderDrawing(silo: Silo, reading: Reading | null, low: boolean): TemplateResult {
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
      texture: cfg.texture,
      partTitles,
      sensorTitle: reading ? this._t('card.sensor_tooltip', { distance: this._length(reading.distance) }) : undefined,
    });
  }

  private _renderStats(silo: Silo, r: Reading, low: boolean): TemplateResult {
    const cfg = this._view;
    const values: Record<Row, string | undefined> = {
      weight: r.weight === undefined ? undefined : this._weight(r.weight),
      remaining: r.remaining === undefined ? undefined : this._weight(r.remaining),
      volume: this._volume(r.volume),
      level: this._length(r.level),
      // A wall without rings has nothing to count, unless the grain is in the hopper or roof.
      rings: silo.geometry.rings > 1 || r.position.kind !== 'rings' ? this._position(silo, r) : undefined,
      distance: this._length(r.distance),
    };
    const rows = cfg.rows
      .filter((row) => values[row] !== undefined)
      .map((row) => [this._t(`card.${row}`), values[row]!] as const);

    return html`
      <div class="percent ${low ? 'low' : ''}">
        <span class="value">${this._percent(r.percent)}</span>
        <span class="unit">${this._t('card.full')}</span>
        ${low ? html`<span class="badge"><ha-icon icon="mdi:alert-outline"></ha-icon>${this._t('card.low')}</span>` : nothing}
      </div>
      <dl>
        ${rows.map(
          ([label, value]) =>
            html`<div class="row">
              <dt>${label}</dt>
              <dd>${value}</dd>
            </div>`,
        )}
      </dl>
    `;
  }

  /** "4.3 of 7" on the rings, or the share of the hopper or roof that is full. */
  private _position(silo: Silo, r: Reading): string {
    const p = r.position;
    const filled = (kind: 'bottom' | 'top') =>
      this._percent((r.parts.find((f) => f.part.kind === kind)?.fraction ?? 0) * 100);
    if (p.kind === 'bottom') return this._t('card.in_bottom', { percent: filled('bottom') });
    if (p.kind === 'top') return this._t('card.in_top', { percent: filled('top') });
    if (p.kind === 'empty') return this._t('card.empty');
    return this._t('card.rings_value', { rings: this._number(p.rings, 1), total: String(silo.geometry.rings) });
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
    :host {
      display: block;
      --silo-wall: var(--secondary-text-color, #727272);
      --silo-low: var(--warning-color, #ffa600);
    }
    ha-card {
      padding: 12px 16px 16px;
      height: 100%;
      box-sizing: border-box;
    }
    .header {
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
    .body {
      display: flex;
      align-items: flex-end;
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
      display: flex;
    }
    svg.silo {
      max-width: 100%;
      height: auto;
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
    .sensor rect {
      fill: var(--primary-color);
      stroke: none;
    }
    .beam {
      stroke: var(--primary-color);
      stroke-width: 1px;
      stroke-dasharray: 3 3;
      opacity: 0.8;
    }
    .stats {
      flex: 1;
      min-width: 0;
      align-self: center;
    }
    .percent {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 4px 6px;
      margin-bottom: 8px;
    }
    .percent .value {
      font-size: 2em;
      font-weight: 500;
      line-height: 1.1;
    }
    .percent .unit {
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
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    'silo-card': SiloCard;
  }
}
