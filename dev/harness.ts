/**
 * Dev harness: renders several silos and the editor with a mock `hass`, plus minimal stand-ins for
 * ha-card, ha-icon and ha-form. Run with `yarn start`. URL options: `?dark&lang=fr&width=320&only=editor&integration&shot`.
 */
import '../src/silo-card';
import '../src/editor';
import type { SiloCard } from '../src/silo-card';
import type { HomeAssistant, SiloCardConfig } from '../src/types';
import { DEFAULTS, ResolvedConfig } from '../src/const';
import { readSilo, siloFromConfig } from '../src/silo';
import { INTEGRATION_KEYS } from '../src/integration';
import * as mdi from '@mdi/js';

/* ---------- stand-ins for Home Assistant elements ---------- */

class HaCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' }).innerHTML = `<style>:host{display:block;background:var(--card-background-color);
      border-radius:var(--ha-card-border-radius);box-shadow:var(--ha-card-box-shadow);color:var(--primary-text-color)}</style><slot></slot>`;
  }
}
customElements.define('ha-card', HaCard);

/** Real Material Design Icons, as Home Assistant draws them, so screenshots match. */
class HaIcon extends HTMLElement {
  static observedAttributes = ['icon'];
  attributeChangedCallback() {
    const name = (this.getAttribute('icon') ?? '').replace(/^mdi:/, '');
    const key = 'mdi' + name.replace(/(^|-)(\w)/g, (_, _dash, c: string) => c.toUpperCase());
    const path = (mdi as Record<string, string>)[key] ?? '';
    // In a shadow root: light-DOM children would shift the nodes Lit binds to while it clones templates.
    this.style.cssText = 'display:inline-flex;width:var(--mdc-icon-size,24px);height:var(--mdc-icon-size,24px)';
    (this.shadowRoot ?? this.attachShadow({ mode: 'open' })).innerHTML =
      `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor"><path d="${path}"/></svg>`;
  }
}
customElements.define('ha-icon', HaIcon);

interface Schema {
  name: string;
  type?: string;
  title?: string;
  selector?: Record<string, Record<string, unknown>>;
  schema?: Schema[];
}

/** Very small ha-form: enough to exercise the editor's schema, labels and value-changed events. */
class HaForm extends HTMLElement {
  data: Record<string, unknown> = {};
  schema: Schema[] = [];
  computeLabel?: (s: Schema) => string;
  computeHelper?: (s: Schema) => string | undefined;
  hass?: HomeAssistant;
  private _raf = 0;

  connectedCallback() {
    this._schedule();
  }

  _schedule() {
    cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => this._render());
  }

  private _emit(name: string, value: unknown) {
    const data = { ...this.data, [name]: value };
    this.dispatchEvent(new CustomEvent('value-changed', { detail: { value: data } }));
  }

  private _field(s: Schema): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:6px 0;display:flex;flex-direction:column;gap:2px;font-size:14px';
    if (s.type === 'expandable' || s.type === 'grid') {
      if (s.title) {
        const h = document.createElement('div');
        h.textContent = `▾ ${s.title}`;
        h.style.cssText = 'font-weight:600;margin-top:10px';
        wrap.append(h);
      }
      const inner = document.createElement('div');
      inner.style.cssText =
        s.type === 'grid' ? 'display:grid;grid-template-columns:1fr 1fr;gap:4px 12px' : 'padding-left:8px';
      (s.schema ?? []).forEach((c) => inner.append(this._field(c)));
      wrap.append(inner);
      return wrap;
    }
    const label = document.createElement('label');
    label.textContent = this.computeLabel?.(s) ?? s.name;
    label.style.color = 'var(--secondary-text-color)';
    wrap.append(label);
    const [kind, cfg] = Object.entries(s.selector ?? { text: {} })[0];
    const value = this.data[s.name];
    let input: HTMLElement;
    if (kind === 'boolean') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!value;
      cb.onchange = () => this._emit(s.name, cb.checked);
      label.prepend(cb);
      return wrap;
    } else if (kind === 'select' && cfg.multiple) {
      // Checkboxes in the chosen order, with ↑ to move one up (ha-form drags chips instead).
      const chosen = [...((value as string[]) ?? [])];
      const options = cfg.options as { value: string; label: string }[];
      const ordered = [...chosen, ...options.map((o) => o.value).filter((v) => !chosen.includes(v))];
      const list = document.createElement('div');
      ordered.forEach((v, i) => {
        const row = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = chosen.includes(v);
        cb.onchange = () => this._emit(s.name, cb.checked ? [...chosen, v] : chosen.filter((c) => c !== v));
        const up = document.createElement('button');
        up.textContent = '↑';
        up.disabled = !cb.checked || i === 0;
        up.onclick = (e) => {
          e.preventDefault();
          const next = [...chosen];
          [next[i - 1], next[i]] = [next[i], next[i - 1]];
          this._emit(s.name, next);
        };
        row.append(cb, ` ${options.find((o) => o.value === v)?.label ?? v} `, up);
        list.append(row);
      });
      list.style.cssText = 'display:flex;flex-direction:column;gap:2px';
      input = list;
    } else if (kind === 'select' || kind === 'entity') {
      const options =
        kind === 'entity'
          ? Object.keys(this.hass?.states ?? {}).map((e) => ({ value: e, label: e }))
          : (cfg.options as { value: string; label: string }[]);
      const sel = document.createElement('select');
      options.forEach((o) => sel.append(new Option(o.label, o.value, false, o.value === (value ?? ''))));
      sel.onchange = () => this._emit(s.name, sel.value);
      input = sel;
    } else if (kind === 'number') {
      const num = document.createElement('input');
      num.type = cfg.mode === 'slider' ? 'range' : 'number';
      Object.assign(num, { min: String(cfg.min ?? ''), max: String(cfg.max ?? ''), step: String(cfg.step ?? 1) });
      num.value = String(value ?? '');
      num.onchange = () => this._emit(s.name, num.value === '' ? undefined : Number(num.value));
      input = num;
      const out = document.createElement('span');
      out.textContent = `${value ?? ''} ${cfg.unit_of_measurement ?? ''}`;
      wrap.append(out);
    } else if (kind === 'ui_color') {
      const sel = document.createElement('select');
      ['', 'amber', 'brown', 'green', 'teal', '#c0392b'].forEach((c) =>
        sel.append(new Option(c || '(default)', c, false, c === (value ?? ''))),
      );
      sel.onchange = () => this._emit(s.name, sel.value || undefined);
      input = sel;
    } else {
      const txt = document.createElement('input');
      txt.value = String(value ?? '');
      txt.onchange = () => this._emit(s.name, txt.value);
      input = txt;
    }
    wrap.append(input);
    const helper = this.computeHelper?.(s);
    if (helper) {
      const h = document.createElement('small');
      h.textContent = helper;
      wrap.append(h);
    }
    return wrap;
  }

  private _render() {
    this.replaceChildren(...this.schema.map((s) => this._field(s)));
  }
}
// Re-render whenever Lit assigns data/schema.
for (const prop of ['data', 'schema']) {
  const key = `__${prop}`;
  Object.defineProperty(HaForm.prototype, prop, {
    get() {
      return this[key];
    },
    set(v) {
      this[key] = v;
      this._schedule?.();
    },
  });
}
customElements.define('ha-form', HaForm);

/** ha-expansion-panel: a titled, always-open box. */
class HaExpansionPanel extends HTMLElement {
  header = '';
  connectedCallback() {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>:host{display:block;border:1px solid var(--divider-color);border-radius:12px;padding:0 16px 8px}
      h4{margin:12px 0 4px;font-weight:600}</style><h4></h4><slot></slot>`;
    shadow.querySelector('h4')!.textContent = `▾ ${this.header}`;
  }
}
customElements.define('ha-expansion-panel', HaExpansionPanel);

/** ha-switch: a checkbox with a `checked` property and a `change` event. */
class HaSwitch extends HTMLElement {
  private _input = document.createElement('input');
  constructor() {
    super();
    this._input.type = 'checkbox';
    this._input.onchange = () => this.dispatchEvent(new Event('change'));
    this.attachShadow({ mode: 'open' }).append(this._input);
  }
  get checked() {
    return this._input.checked;
  }
  set checked(value: boolean) {
    this._input.checked = value;
  }
}
customElements.define('ha-switch', HaSwitch);

/** ha-sortable: drag a row by its handle (native drag and drop), then `item-moved` with the two indexes. */
class HaSortable extends HTMLElement {
  connectedCallback() {
    let from = -1;
    const rows = () => [...(this.querySelector('div')?.children ?? [])] as HTMLElement[];
    this.addEventListener('pointerdown', (ev) => {
      const handle = (ev.target as HTMLElement).closest(this.getAttribute('handle-selector') ?? '.handle');
      rows().forEach((row) => (row.draggable = !!handle && row.contains(handle)));
    });
    this.addEventListener('dragstart', (ev) => (from = rows().indexOf(ev.target as HTMLElement)));
    this.addEventListener('dragover', (ev) => ev.preventDefault());
    this.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const to = rows().findIndex((row) => row.contains(ev.target as Node));
      if (from >= 0 && to >= 0 && from !== to) {
        this.dispatchEvent(new CustomEvent('item-moved', { detail: { oldIndex: from, newIndex: to } }));
      }
    });
  }
}
customElements.define('ha-sortable', HaSortable);

/* ---------- silos ---------- */

type Case = { title: string; config: Omit<SiloCardConfig, 'type'>; fill: number };

// The maintainer's bin, for the icon and layout cases.
const BIN_FOR_ICONS: Omit<SiloCardConfig, 'type'> = {
  entity: 'sensor.soue1ben2_distance',
  title: 'Soue 1 Ben 2',
  unit: 'ft',
  diameter: 9,
  rings: 7,
  ring_height: 32,
  ring_height_unit: 'in',
  top_height: 2,
  bottom: 'cone',
  bottom_height: 7,
  capacity: 3,
  capacity_per: 'ring',
  weight_unit: 'ton',
};

const CASES: Case[] = [
  {
    // The maintainer's feed bin, from its ESPHome file.
    title: 'Hopper bin · inches, capacity in short tons',
    fill: 0.62,
    config: {
      entity: 'sensor.soue1ben2_distance',
      title: 'Soue 1 Ben 2',
      unit: 'in',
      diameter: 108,
      rings: 7,
      ring_height: 32,
      top_height: 24,
      top_opening: 18,
      bottom: 'cone',
      bottom_height: 84,
      capacity: 24,
      weight_unit: 'ton',
    },
  },
  {
    title: 'Farm bin · flat floor, corn in bushels, low · layers',
    fill: 0.11,
    config: {
      entity: 'sensor.bin_3_distance',
      title: 'Bin 3',
      unit: 'ft',
      diameter: 27,
      rings: 8,
      ring_height: 2.67,
      top_height: 7.5,
      grain: 'corn',
      primary: 'remaining',
      texture: 'layers',
      weight_unit: 'ton',
      volume_unit: 'bu',
      rows: ['weight', 'remaining', 'volume', 'level', 'rings'],
    },
  },
  {
    title: 'Hopper bin · metres, wheat (French) · hatching',
    fill: 0.35,
    config: {
      entity: 'sensor.silo_ble_distance',
      title: 'Silo à blé',
      diameter: 3.66,
      rings: 6,
      ring_height: 0.84,
      top_height: 0.9,
      bottom: 'cone',
      bottom_height: 2.1,
      outlet: 0.3,
      grain: 'wheat',
      texture: 'hatching',
      language: 'fr',
      rows: ['weight', 'remaining', 'level', 'rings', 'distance'],
    },
  },
  {
    title: 'Tower silo · dome, level sensor · shaded',
    fill: 0.8,
    config: {
      entity: 'sensor.tower_level',
      title: 'Tower silo',
      measure: 'level',
      diameter: 6,
      rings: 1,
      ring_height: 18,
      top: 'dome',
      top_height: 2.5,
      grain: 'barley',
      texture: 'shaded',
      primary: 'weight',
      color: 'brown',
    },
  },
  {
    title: 'Square feed bin · grain in the roof',
    fill: 0.96,
    config: {
      entity: 'sensor.feed_distance',
      title: 'Feed',
      shape: 'square',
      diameter: 2.4,
      rings: 3,
      ring_height: 1.2,
      top_height: 0.6,
      bottom: 'cone',
      bottom_height: 1.6,
      outlet: 0.3,
      density: 650,
      primary: 'rings',
      rows: ['rings', 'weight', 'remaining'],
    },
  },
  {
    // Everything but the look comes from the Silo integration's sensor (see makeHass).
    title: 'Silo integration sensor · shown in m and t',
    fill: 0.45,
    config: {
      entity: 'sensor.soue1ben2_fill',
      primary: 'rings',
      rows: ['percent', 'remaining', 'weight', 'level', 'updated'],
      // Entered in inches and short tons; shown in metres and tonnes.
      display_unit: 'm',
      display_weight_unit: 't',
    },
  },
  {
    title: 'Icons instead of labels',
    fill: 0.62,
    config: {
      ...BIN_FOR_ICONS,
      labels: 'icons',
      rows: ['percent', 'weight', 'remaining', 'level', 'rings', 'distance', 'updated'],
    },
  },
  {
    title: 'Stacked (layout: stacked) · icons',
    fill: 0.4,
    config: {
      ...BIN_FOR_ICONS,
      entity: 'sensor.silo_ble_distance',
      layout: 'stacked',
      labels: 'icons',
      primary: 'rings',
    },
  },
  {
    title: 'Title above the main value (title_position: stats)',
    fill: 0.55,
    config: {
      ...BIN_FOR_ICONS,
      entity: 'sensor.silo_ble_distance',
      grain: 'wheat',
      title_position: 'stats',
    },
  },
  {
    title: 'No main value (primary: none) · title above',
    fill: 0.55,
    config: {
      ...BIN_FOR_ICONS,
      entity: 'sensor.silo_ble_distance',
      title_position: 'stats',
      primary: 'none',
      rows: ['percent', 'weight', 'remaining', 'level', 'rings'],
    },
  },
  {
    title: 'Too old · last update 5 h ago, stale_after: 1 h',
    fill: 0.5,
    config: {
      ...BIN_FOR_ICONS,
      entity: 'sensor.old',
      labels: 'icons',
      rows: ['weight', 'remaining', 'level', 'updated'],
      stale_after: { hours: 1 },
    },
  },
  {
    title: 'Stale · unavailable, last reading from the history',
    fill: 0,
    config: { ...BIN_FOR_ICONS, entity: 'sensor.stale', labels: 'icons', rows: ['weight', 'remaining', 'distance', 'updated'] },
  },
  {
    title: 'Errors · no reading, no dimensions',
    fill: 0,
    config: { entity: 'sensor.offline', diameter: 3, ring_height: 0.8, rings: 5, bottom: 'cone', bottom_height: 1.8 },
  },
  { title: '', fill: 0, config: { entity: 'sensor.offline' } },
];

/** The first bin, kept for the integration's sensor even when the page shows only the editor. */
const BIN = CASES[0].config;

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** When the offline sensors lost their reading: three hours ago. */
const LOST = new Date(Date.now() - 3 * 3600_000).toISOString();

/** The recorder: `sensor.stale` read 214 in until it went unavailable; `sensor.offline` has no history. */
async function recorder(msg: { entity_ids: string[] }): Promise<Record<string, Array<{ s: string; lu: number }>>> {
  const lost = new Date(LOST).getTime() / 1000;
  const id = msg.entity_ids[0];
  if (id !== 'sensor.stale') return {};
  return {
    [id]: [
      { s: '214.0', lu: lost - 600 },
      { s: 'unavailable', lu: lost },
    ],
  };
}

/** Sensor states for every case, at `scale` × its own fill. */
function makeHass(lang: string, scale: number): HomeAssistant {
  const states: HomeAssistant['states'] = {
    'sensor.offline': {
      entity_id: 'sensor.offline',
      state: 'unavailable',
      last_updated: LOST,
      last_changed: LOST,
      attributes: {},
    },
    'sensor.stale': {
      entity_id: 'sensor.stale',
      state: 'unavailable',
      last_updated: LOST,
      last_changed: LOST,
      attributes: { unit_of_measurement: 'in', device_class: 'distance' },
    },
  };
  for (const c of CASES) {
    const cfg = { ...DEFAULTS, type: 'custom:silo-card', ...c.config } as ResolvedConfig;
    const silo = siloFromConfig(cfg);
    if (!silo || !cfg.entity || cfg.entity in states || cfg.entity.endsWith('_fill')) continue;
    const fill = Math.min(c.fill * scale, 1);
    // Fill measured up to the peak; the sensor reports in metres, like ESPHome.
    const level = fill * silo.height;
    const value = cfg.measure === 'level' ? level : silo.sensorHeight - level;
    states[cfg.entity] = {
      entity_id: cfg.entity,
      state: value.toFixed(3),
      last_updated: new Date().toISOString(),
      last_changed: new Date().toISOString(),
      attributes: { unit_of_measurement: 'm', device_class: 'distance' },
    };
  }
  // A sensor that last updated five hours ago.
  const old = new Date(Date.now() - 5 * 3600_000).toISOString();
  states['sensor.old'] = { ...states['sensor.old'], last_updated: old, last_changed: old };
  // The Silo integration's fill sensor for the first bin: its silo and its grain height ride along.
  const bin = { ...DEFAULTS, type: 'custom:silo-card', ...BIN } as ResolvedConfig;
  const silo = siloFromConfig(bin)!;
  const level = 0.45 * Math.min(scale, 1 / 0.45) * silo.height;
  states['sensor.soue1ben2_fill'] = {
    entity_id: 'sensor.soue1ben2_fill',
    state: readSilo(silo, level, 'level')!.percent.toFixed(1),
    last_updated: '',
    last_changed: '',
    attributes: {
      unit_of_measurement: '%',
      source: 'sensor.soue1ben2_distance',
      level,
      silo: Object.fromEntries(INTEGRATION_KEYS.filter((k) => k in BIN).map((k) => [k, bin[k]])),
    },
  };
  return {
    language: lang,
    locale: { language: lang },
    config: { unit_system: { length: 'km' } },
    states,
    callWS: recorder as HomeAssistant['callWS'],
  };
}

let hass = makeHass(params.get('lang') ?? 'en', 1);
const cards: Array<{ hass?: HomeAssistant }> = [];
let editorConfig: SiloCardConfig = { type: 'custom:silo-card', ...CASES[0].config };

function build() {
  const root = $('cards');
  root.replaceChildren();
  cards.length = 0;
  const width = $<HTMLSelectElement>('width').value;
  root.style.gridTemplateColumns = width ? `repeat(auto-fill, ${width}px)` : '';
  for (const c of CASES) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = `<h3>${c.title}</h3>`;
    const card = document.createElement('silo-card') as SiloCard;
    card.setConfig({ type: 'custom:silo-card', ...c.config });
    card.hass = hass;
    cell.append(card);
    root.append(cell);
    cards.push(card);
  }
  if (params.has('shot')) return;
  // Editor + live preview
  const cell = document.createElement('div');
  cell.className = 'cell';
  cell.innerHTML = '<h3>Editor → preview</h3>';
  const preview = document.createElement('silo-card') as SiloCard;
  preview.setConfig(editorConfig);
  preview.hass = hass;
  const editor = document.createElement('silo-card-editor') as HTMLElement & {
    setConfig(c: SiloCardConfig): void;
    hass: HomeAssistant;
  };
  editor.className = 'editor';
  editor.hass = hass;
  editor.setConfig(editorConfig);
  const yaml = document.createElement('pre');
  yaml.textContent = JSON.stringify(editorConfig, null, 2);
  editor.addEventListener('config-changed', (ev) => {
    editorConfig = (ev as CustomEvent).detail.config;
    yaml.textContent = JSON.stringify(editorConfig, null, 2);
    try {
      preview.setConfig(editorConfig);
    } catch (err) {
      yaml.textContent += `\n${err}`;
    }
    editor.setConfig(editorConfig);
  });
  cell.append(preview, yaml, editor);
  root.append(cell);
  cards.push(preview, editor);
}

function applyHass() {
  hass = makeHass($<HTMLSelectElement>('lang').value, Number($<HTMLInputElement>('fill').value) / 100);
  cards.forEach((c) => (c.hass = hass));
}

if (params.has('dark')) {
  $<HTMLInputElement>('dark').checked = true;
  document.body.classList.add('dark');
}
if (params.get('lang')) $<HTMLSelectElement>('lang').value = params.get('lang')!;
if (params.get('width')) $<HTMLSelectElement>('width').value = params.get('width')!;
if (params.get('only') === 'editor') CASES.length = 0;
// ?integration: the editor starts on the Silo integration's fill sensor.
if (params.has('integration')) editorConfig = { type: 'custom:silo-card', entity: 'sensor.soue1ben2_fill' };
// ?shot: three clean cards for the README screenshot.
if (params.has('shot')) {
  CASES.splice(3);
  document.body.classList.add('shot');
}

$<HTMLInputElement>('dark').onchange = (e) =>
  document.body.classList.toggle('dark', (e.target as HTMLInputElement).checked);
$<HTMLSelectElement>('lang').onchange = applyHass;
$<HTMLInputElement>('fill').oninput = applyHass;
$<HTMLSelectElement>('width').onchange = build;
build();
