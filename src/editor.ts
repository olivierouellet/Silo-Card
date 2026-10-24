import { LitElement, html, css, nothing, TemplateResult } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import type { HomeAssistant, Row, SiloCardConfig } from './types';
import { DEFAULTS, DEFAULT_ICON, EDITOR_TAG, GRAINS, ROWS, TEXTURES } from './const';
import { INTEGRATION_DOMAIN, INTEGRATION_KEYS, integrationSilo } from './integration';
import { DENSITY_UNITS, KG_PER_M3, LENGTH_UNITS, LengthUnit, VOLUME_UNITS, WEIGHT_UNITS, convertLength } from './units';
import { Lang, intlLocale, localize, resolveLanguage } from './localize/localize';
import { LENGTH_KEYS, LengthKey } from './silo';

/** Number boxes step by what makes sense for the unit. */
const LENGTH_STEP: Record<LengthUnit, number> = { m: 0.01, cm: 1, mm: 1, ft: 0.01, in: 0.5 };

// Material Design Icons "drag" (mdiDrag).
const DRAG_ICON =
  'M7,19V17H9V19H7M11,19V17H13V19H11M15,19V17H17V19H15M7,15V13H9V15H7M11,15V13H13V15H11M15,15V13H17V15H15M7,11V9H9V11H7M11,11V9H13V11H11M15,11V9H17V11H15M7,7V5H9V7H7M11,7V5H13V7H11M15,7V5H17V7H15Z';

const sameOrder = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((id, i) => id === b[i]);

declare global {
  interface Window {
    loadCardHelpers?: () => Promise<{
      createCardElement(config: Record<string, unknown>): HTMLElement & {
        constructor: { getConfigElement?: () => Promise<unknown> };
      };
    }>;
  }
}

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
  /**
   * Every tile in display order, hidden ones included, so a tile switched off keeps its place in the list
   * while editing. The config only stores the visible ones.
   */
  @state() private _order: Row[] = [...ROWS];

  public setConfig(config: SiloCardConfig): void {
    this._config = config;
    const visible = this._visible();
    // Rebuild the list only when the visible order changed outside of it (e.g. in YAML).
    if (
      !sameOrder(
        this._order.filter((row) => visible.includes(row)),
        visible,
      )
    ) {
      this._order = [...visible, ...ROWS.filter((row) => !visible.includes(row))];
    }
  }

  public connectedCallback(): void {
    super.connectedCallback();
    // `ha-sortable`, `ha-switch` and `ha-expansion-panel` are lazy-loaded by Home Assistant. Loading the
    // entities card's editor, which uses them, makes sure they are defined.
    if ((!customElements.get('ha-form') || !customElements.get('ha-sortable')) && window.loadCardHelpers) {
      window.loadCardHelpers().then(async (helpers) => {
        const card = await helpers.createCardElement({ type: 'entities', entities: [] });
        await card.constructor.getConfigElement?.();
        this.requestUpdate();
      });
    }
  }

  /** Each length's unit for the form: its own, or the default one. */
  private _lengthUnits(): Record<string, string> {
    const unit = this._config?.unit ?? DEFAULTS.unit;
    return Object.fromEntries(LENGTH_KEYS.map((key) => [`${key}_unit`, this._config?.[`${key}_unit`] ?? unit]));
  }

  /** The tiles shown, in order. */
  private _visible(): Row[] {
    return [...(this._config?.rows ?? DEFAULTS.rows)].filter((row): row is Row => ROWS.includes(row));
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
        .data=${{ ...DEFAULTS, ...this._lengthUnits(), ...this._config, ...integration }}
        .schema=${integration ? this._displaySchema(integration.measure ?? DEFAULTS.measure) : this._schema()}
        .computeLabel=${this._computeLabel}
        .computeHelper=${this._computeHelper}
        @value-changed=${this._valueChanged}
      ></ha-form>
      <ha-expansion-panel outlined .header=${this._t('editor.tiles')}>
        <div class="hint">${this._t('editor.tiles_hint')}</div>
        ${this._renderTiles()}
      </ha-expansion-panel>
    `;
  }

  private _renderTiles(): TemplateResult {
    const visible = new Set(this._visible());
    return html`
      <ha-sortable handle-selector=".handle" @item-moved=${this._tileMoved}>
        <div class="tiles">
          ${repeat(
            this._order,
            (row) => row,
            (row) => html`
              <div class="tile ${visible.has(row) ? '' : 'hidden'}">
                <div class="handle" title=${this._t('editor.drag')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d=${DRAG_ICON}></path></svg>
                </div>
                <span class="name">${this._t(`editor.row_${row}`)}</span>
                <ha-switch
                  .checked=${visible.has(row)}
                  aria-label=${this._t(`editor.row_${row}`)}
                  @change=${(ev: Event) => this._toggleTile(row, (ev.target as HTMLInputElement).checked)}
                ></ha-switch>
              </div>
            `,
          )}
        </div>
      </ha-sortable>
    `;
  }

  private _tileMoved(ev: CustomEvent<{ oldIndex: number; newIndex: number }>): void {
    ev.stopPropagation();
    const { oldIndex, newIndex } = ev.detail;
    const order = [...this._order];
    order.splice(newIndex, 0, order.splice(oldIndex, 1)[0]);
    this._order = order;
    const visible = new Set(this._visible());
    this._setRows(order.filter((row) => visible.has(row)));
  }

  private _toggleTile(row: Row, on: boolean): void {
    const visible = new Set(this._visible());
    if (on) visible.add(row);
    else visible.delete(row);
    this._setRows(this._order.filter((r) => visible.has(r)));
  }

  /** The tiles in the config; left out when they are the default ones, in the default order. */
  private _setRows(rows: Row[]): void {
    const config: SiloCardConfig = { ...this._config!, rows };
    if (sameOrder(rows, DEFAULTS.rows)) delete config.rows;
    this._update(config);
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

  /** A length and, beside it, its unit (the default unit unless another is chosen). */
  private _length(key: LengthKey): FormSchema {
    const cfg = { ...DEFAULTS, ...this._config! };
    const unit = cfg[`${key}_unit`] ?? cfg.unit;
    return {
      name: '',
      type: 'grid',
      schema: [
        { name: key, selector: { number: { min: 0, step: LENGTH_STEP[unit], mode: 'box' } } },
        {
          name: `${key}_unit`,
          selector: {
            select: {
              mode: 'dropdown',
              options: LENGTH_UNITS.map((u) => ({ value: u, label: this._t(`units.${u}`) })),
            },
          },
        },
      ],
    };
  }

  /** Everything the integration would otherwise give: the sensor, the shape and the contents. */
  private _schema(): FormSchema[] {
    const cfg = { ...DEFAULTS, ...this._config! };
    const grains = [
      { value: '', label: this._t('editor.grain_none') },
      ...Object.keys(GRAINS).map((g) => ({ value: g, label: this._t(`grains.${g}`) })),
    ];
    return [
      this._select('measure', ['distance', 'level'], 'measure_', 'list'),
      ...(cfg.measure === 'distance' ? [this._length('sensor_height')] : []),
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
          this._length('diameter'),
          { name: 'rings', selector: { number: { min: 1, max: 30, step: 1, mode: 'box' } } },
          this._length('ring_height'),
          this._select('top', ['flat', 'cone', 'dome'], 'top_'),
          ...(cfg.top === 'flat' ? [] : [this._length('top_height')]),
          ...(cfg.top === 'cone' ? [this._length('top_opening')] : []),
          this._select('bottom', ['flat', 'cone'], 'bottom_'),
          ...(cfg.bottom === 'cone' ? [this._length('bottom_height'), this._length('outlet')] : []),
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
          {
            name: '',
            type: 'grid',
            schema: [
              { name: 'title', selector: { text: {} } },
              this._select('title_position', ['header', 'stats'], 'title_position_'),
            ],
          },
          {
            name: '',
            type: 'grid',
            schema: [
              { name: 'icon', selector: { icon: { placeholder: DEFAULT_ICON } } },
              { name: 'color', selector: { ui_color: { include_none: true } } },
            ],
          },
          {
            name: 'primary',
            selector: {
              select: {
                mode: 'dropdown',
                options: [
                  ...ROWS.map((row) => ({ value: row, label: this._t(`editor.row_${row}`) })),
                  { value: 'none', label: this._t('editor.primary_none') },
                ],
              },
            },
          },
          this._select('texture', TEXTURES, 'texture_'),
          {
            name: '',
            type: 'grid',
            schema: [
              this._select('layout', ['auto', 'side', 'stacked'], 'layout_'),
              this._select('labels', ['text', 'icons'], 'labels_'),
            ],
          },
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
            name: 'low_level',
            selector: { number: { min: 0, max: 100, step: 5, mode: 'slider', unit_of_measurement: '%' } },
          },
          ...(measure === 'distance' ? [{ name: 'show_sensor', selector: { boolean: {} } }] : []),
          { name: 'show_last_reading', selector: { boolean: {} } },
          { name: 'stale_after', selector: { duration: { enable_day: true } } },
          this._select('language', ['auto', 'en', 'fr'], 'lang_'),
        ],
      },
    ];
  }

  private _computeLabel = (schema: FormSchema): string => {
    if (LENGTH_KEYS.some((key) => schema.name === `${key}_unit`)) return this._t('editor.length_unit');
    if (schema.name === 'diameter' && this._config?.shape === 'square') return this._t('editor.diameter_square');
    return this._t(`editor.${schema.name}`);
  };

  private _computeHelper = (schema: FormSchema): string | undefined => {
    switch (schema.name) {
      case 'sensor_height':
      case 'rings':
      case 'outlet':
      case 'top_opening':
      case 'capacity':
      case 'include_roof':
      case 'low_level':
      case 'show_last_reading':
      case 'stale_after':
      case 'title':
      case 'primary':
      case 'unit':
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
    } else {
      const unit = (value.unit ?? DEFAULTS.unit) as LengthUnit;
      for (const key of LENGTH_KEYS) {
        const own = this._config?.[`${key}_unit`];
        if (unit !== before.unit && own === undefined) {
          // A new default unit: the lengths that follow it are converted, so the silo keeps its size.
          delete value[`${key}_unit`];
          if (typeof value[key] === 'number') value[key] = convertLength(value[key] as number, before.unit, unit);
        } else if (value[`${key}_unit`] === unit) {
          // A length's own unit is only kept when it differs from the default. Changing it keeps the number:
          // it is read in the new unit (typing 32, then choosing "in").
          delete value[`${key}_unit`];
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
    const drop = (key: LengthKey) => {
      delete value[key];
      delete value[`${key}_unit`];
    };
    if ((value.top ?? DEFAULTS.top) === 'flat') drop('top_height');
    if ((value.top ?? DEFAULTS.top) !== 'cone') drop('top_opening');
    if ((value.bottom ?? DEFAULTS.bottom) !== 'cone') {
      drop('bottom_height');
      drop('outlet');
    }
    if ((value.measure ?? DEFAULTS.measure) !== 'distance') drop('sensor_height');
    if (value.capacity === undefined) delete value.capacity_per;
    this._update(value as unknown as SiloCardConfig);
  }

  private _update(config: SiloCardConfig): void {
    this._config = config;
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config }, bubbles: true, composed: true }));
  }

  static styles = css`
    ha-expansion-panel {
      display: block;
      margin: 16px 0;
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: 0.9em;
      margin-bottom: 8px;
    }
    .tile {
      display: flex;
      align-items: center;
      gap: 8px;
      min-height: 48px;
    }
    .tile.hidden .name {
      color: var(--disabled-text-color);
    }
    .handle {
      display: flex;
      padding: 8px;
      margin-left: -8px;
      cursor: grab;
      color: var(--secondary-text-color);
    }
    .handle svg {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }
    .name {
      flex: 1;
    }
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
