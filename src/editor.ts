import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

import type { HomeAssistant, SiloCardConfig } from './types';
import { DEFAULTS, DEFAULT_ICON, EDITOR_TAG, GRAINS, ROWS, TEXTURES } from './const';
import { INTEGRATION_DOMAIN, INTEGRATION_KEYS, integrationSilo } from './integration';
import { DENSITY_UNITS, KG_PER_M3, LENGTH_UNITS, LengthUnit, VOLUME_UNITS, WEIGHT_UNITS, convertLength } from './units';
import { Lang, intlLocale, localize, resolveLanguage } from './localize/localize';

/** Config keys holding a length, in `unit`. */
const LENGTHS = ['diameter', 'ring_height', 'top_height', 'bottom_height', 'outlet', 'sensor_height'] as const;

/** Number boxes step by what makes sense for the unit. */
const LENGTH_STEP: Record<LengthUnit, number> = { m: 0.01, cm: 1, ft: 0.01, in: 0.5 };

interface FormSchema {
  name: string;
  type?: string;
  title?: string;
  flatten?: boolean;
  expanded?: boolean;
  selector?: Record<string, unknown>;
  schema?: FormSchema[];
}

@customElement(EDITOR_TAG)
export class SiloCardEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _config?: SiloCardConfig;

  public setConfig(config: SiloCardConfig): void {
    this._config = config;
  }

  private get _lang(): Lang {
    return resolveLanguage(this._config?.language, this.hass);
  }

  private _t(key: string, vars?: Record<string, string>): string {
    return localize(key, this._lang, vars);
  }

  /** The silo of the chosen sensor, when it comes from the Silo integration. */
  private get _integration() {
    const entity = this._config?.entity;
    return integrationSilo(entity ? this.hass.states[entity] : undefined);
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass || !this._config) return nothing;
    const integration = this._integration;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ ...DEFAULTS, ...this._config }}
        .schema=${[{ name: 'entity', selector: { entity: { domain: ['sensor', 'input_number', 'number'] } } }]}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      ${
        integration
          ? html`<div class="note">
              ${this._t('editor.from_integration')}
              <a href="/config/integrations/integration/${INTEGRATION_DOMAIN}" target="_blank" rel="noopener">
                <ha-icon icon="mdi:cog-outline"></ha-icon>${this._t('editor.change_silo')}
              </a>
            </div>`
          : nothing
      }
      <ha-form
        .hass=${this.hass}
        .data=${{ ...DEFAULTS, ...this._config, ...integration }}
        .schema=${integration ? this._displaySchema(integration.measure ?? DEFAULTS.measure) : this._schema()}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
    `;
  }

  private _select(name: string, values: readonly string[], prefix: string, mode = 'dropdown'): FormSchema {
    return {
      name,
      selector: {
        select: { mode, options: values.map((value) => ({ value, label: this._t(`editor.${prefix}${value}`) })) },
      },
    };
  }

  /** A unit the card shows, or the one the silo was entered in when left empty. */
  private _sameAs(name: string, values: readonly string[], prefix: string): FormSchema {
    const options = values.map((value) => ({ value, label: this._t(`editor.${prefix}${value}`) }));
    return {
      name,
      selector: {
        select: { mode: 'dropdown', options: [{ value: '', label: this._t('editor.same_unit') }, ...options] },
      },
    };
  }

  /** Everything the integration would otherwise give: the sensor, the shape and the contents. */
  private _schema(): FormSchema[] {
    const cfg = { ...DEFAULTS, ...this._config! };
    const length = {
      number: { min: 0, step: LENGTH_STEP[cfg.unit], mode: 'box', unit_of_measurement: this._t(`units.${cfg.unit}`) },
    };
    const grains = [
      { value: '', label: this._t('editor.grain_none') },
      ...Object.keys(GRAINS).map((g) => ({ value: g, label: this._t(`grains.${g}`) })),
    ];
    return [
      this._select('measure', ['distance', 'level'], 'measure_', 'list'),
      ...(cfg.measure === 'distance' ? [{ name: 'sensor_height', selector: length }] : []),
      {
        name: '',
        type: 'expandable',
        flatten: true,
        expanded: true,
        title: this._t('editor.section_shape'),
        schema: [
          {
            name: '',
            type: 'grid',
            schema: [this._select('unit', LENGTH_UNITS, 'unit_'), this._select('shape', ['round', 'square'], 'shape_')],
          },
          { name: 'diameter', selector: length },
          {
            name: '',
            type: 'grid',
            schema: [
              { name: 'rings', selector: { number: { min: 1, max: 30, step: 1, mode: 'box' } } },
              { name: 'ring_height', selector: length },
            ],
          },
          {
            name: '',
            type: 'grid',
            schema: [
              this._select('top', ['flat', 'cone', 'dome'], 'top_'),
              ...(cfg.top === 'flat' ? [] : [{ name: 'top_height', selector: length }]),
            ],
          },
          {
            name: '',
            type: 'grid',
            schema: [
              this._select('bottom', ['flat', 'cone'], 'bottom_'),
              ...(cfg.bottom === 'cone' ? [{ name: 'bottom_height', selector: length }] : []),
            ],
          },
          ...(cfg.bottom === 'cone' ? [{ name: 'outlet', selector: length }] : []),
        ],
      },
      {
        name: '',
        type: 'expandable',
        flatten: true,
        title: this._t('editor.section_contents'),
        schema: [
          { name: 'grain', selector: { select: { mode: 'dropdown', options: grains } } },
          {
            name: '',
            type: 'grid',
            schema: [
              { name: 'density', selector: { number: { min: 0, step: 0.1, mode: 'box' } } },
              {
                name: 'density_unit',
                selector: { select: { mode: 'dropdown', options: DENSITY_UNITS.map((u) => ({ value: u, label: u })) } },
              },
            ],
          },
          {
            name: '',
            type: 'grid',
            schema: [
              {
                name: 'capacity',
                selector: {
                  number: { min: 0, step: 0.1, mode: 'box', unit_of_measurement: this._t(`units.${cfg.weight_unit}`) },
                },
              },
              this._select('weight_unit', WEIGHT_UNITS, 'weight_'),
            ],
          },
          this._select('capacity_per', ['silo', 'ring'], 'capacity_per_', 'list'),
          this._select('volume_unit', VOLUME_UNITS, 'volume_'),
          { name: 'include_roof', selector: { boolean: {} } },
        ],
      },
      ...this._displaySchema(cfg.measure),
    ];
  }

  /** How the card looks; the same with or without the integration. */
  private _displaySchema(measure: string): FormSchema[] {
    return [
      {
        name: '',
        type: 'expandable',
        flatten: true,
        expanded: !!this._integration,
        title: this._t('editor.section_display'),
        schema: [
          { name: 'title', selector: { text: {} } },
          {
            name: '',
            type: 'grid',
            schema: [
              { name: 'icon', selector: { icon: { placeholder: DEFAULT_ICON } } },
              { name: 'color', selector: { ui_color: { include_none: true } } },
            ],
          },
          this._select('texture', TEXTURES, 'texture_'),
          {
            name: '',
            type: 'grid',
            schema: [
              this._sameAs('display_unit', LENGTH_UNITS, 'unit_'),
              this._sameAs('display_weight_unit', WEIGHT_UNITS, 'weight_'),
              this._sameAs('display_volume_unit', VOLUME_UNITS, 'volume_'),
            ],
          },
          {
            name: 'rows',
            selector: {
              select: {
                multiple: true,
                reorder: true,
                mode: 'dropdown',
                options: ROWS.map((row) => ({ value: row, label: this._t(`editor.row_${row}`) })),
              },
            },
          },
          {
            name: 'low_level',
            selector: { number: { min: 0, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } },
          },
          ...(measure === 'distance' ? [{ name: 'show_sensor', selector: { boolean: {} } }] : []),
          this._select('language', ['auto', 'en', 'fr'], 'lang_'),
        ],
      },
    ];
  }

  private _computeLabel = (schema: FormSchema): string => {
    if (schema.name === 'diameter' && this._config?.shape === 'square') return this._t('editor.diameter_square');
    return this._t(`editor.${schema.name}`);
  };

  private _computeHelper = (schema: FormSchema): string | undefined => {
    switch (schema.name) {
      case 'sensor_height':
      case 'rings':
      case 'outlet':
      case 'capacity':
      case 'include_roof':
      case 'low_level':
      case 'title':
      case 'rows':
        return this._t(`editor.${schema.name}_helper`);
      case 'density': {
        const grain = this._config?.grain;
        if (!grain || !(grain in GRAINS)) return this._t('editor.density_helper_none');
        const unit = this._config?.density_unit ?? DEFAULTS.density_unit;
        const value = (GRAINS[grain] * KG_PER_M3['lb/bu']) / KG_PER_M3[unit];
        const shown = new Intl.NumberFormat(intlLocale(this._lang), { maximumFractionDigits: 1 }).format(value);
        return this._t('editor.density_helper', { value: `${shown} ${unit}` });
      }
      default:
        return undefined;
    }
  };

  private _valueChanged(ev: CustomEvent): void {
    // Both forms send all their data; keep what the other one holds.
    const value: Record<string, unknown> = { ...this._config, ...ev.detail.value };
    const before = { ...DEFAULTS, ...this._config! };

    if (integrationSilo(typeof value.entity === 'string' ? this.hass.states[value.entity] : undefined)) {
      // The integration has the silo: don't keep a second copy in the card.
      for (const key of INTEGRATION_KEYS) delete value[key];
    } else if (value.unit !== undefined && value.unit !== before.unit) {
      // A new unit: convert the lengths already entered, so the silo keeps its size.
      for (const key of LENGTHS) {
        if (typeof value[key] === 'number') {
          value[key] = convertLength(value[key] as number, before.unit, value.unit as LengthUnit);
        }
      }
    }

    // Keep the YAML short: drop the defaults, empty fields and fields that no longer apply.
    for (const [key, def] of Object.entries(DEFAULTS)) {
      if (JSON.stringify(value[key]) === JSON.stringify(def)) delete value[key];
    }
    for (const [key, v] of Object.entries(value)) {
      if (v === '' || v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) delete value[key];
    }
    if ((value.top ?? DEFAULTS.top) === 'flat') delete value.top_height;
    if ((value.bottom ?? DEFAULTS.bottom) !== 'cone') {
      delete value.bottom_height;
      delete value.outlet;
    }
    if ((value.measure ?? DEFAULTS.measure) !== 'distance') delete value.sensor_height;
    if (value.capacity === undefined) delete value.capacity_per;
    this._update(value as unknown as SiloCardConfig);
  }

  private _update(config: SiloCardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  static styles = css`
    .note {
      display: flex;
      flex-direction: column;
      gap: 6px;
      margin: 8px 0 16px;
      padding: 12px;
      border-radius: 8px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }
    .note a {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: var(--primary-color);
      text-decoration: none;
      --mdc-icon-size: 18px;
    }
  `;
}
