/** The silo's side view as SVG, drawn to scale: one shape per part, with the grain up to its level. */
import { html, nothing, svg, SVGTemplateResult, TemplateResult } from 'lit';

import { Part, wallPoints, widthAt } from './geometry';
import type { Reading, Silo } from './silo';
import type { Texture } from './types';

export interface DrawOptions {
  showSensor: boolean;
  low: boolean;
  texture: Texture;
  /** Tooltip for each part, in the order of `silo.parts`. */
  partTitles: string[];
  sensorTitle?: string;
}

/** Drawing height in CSS pixels; the width follows the silo's proportions. */
export const DRAWING_HEIGHT = 168;

type Point = [number, number];

/** SVG points for the part between two heights: up the right-hand wall, down the left. SVG y grows downwards. */
function outline(part: Part, zFrom?: number, zTo?: number): string {
  const right = wallPoints(part, zFrom, zTo);
  const left = [...right].reverse().map(([x, z]): Point => [-x, z]);
  return [...right, ...left].map(([x, z]) => `${round(x)},${round(-z)}`).join(' ');
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function drawSilo(silo: Silo, reading: Reading | null, opts: DrawOptions): TemplateResult {
  const { parts, height, sensorHeight } = silo;
  const width = silo.geometry.diameter;
  const bottom = parts.find((p) => p.kind === 'bottom');
  // A hopper bin stands on legs; leave it some clearance above the ground.
  const ground = bottom ? -bottom.z1 * 0.35 : 0;
  const sensorBox = Math.max(width, height) * 0.035;
  const top = Math.max(height, opts.showSensor ? sensorHeight + sensorBox : 0);
  const pad = Math.max(width, top - ground) * 0.04;
  const box = { x: -width / 2 - pad, y: -top - pad, w: width + 2 * pad, h: top - ground + 2 * pad };
  const level = reading?.level ?? 0;
  const legX = (width / 2) * 0.9;
  // The size of a screen pixel in silo units, so a texture looks the same on any silo.
  const px = box.h / DRAWING_HEIGHT;
  const texture = textures(opts.texture, px, width, level);

  // The <svg> element itself in `html`; Lit's `svg` tag is for the fragments inside it.
  return html`
    <svg
      class="silo ${opts.low ? 'low' : ''}"
      viewBox="${box.x} ${box.y} ${box.w} ${box.h}"
      width=${Math.round((DRAWING_HEIGHT * box.w) / box.h)}
      height=${DRAWING_HEIGHT}
      preserveAspectRatio="xMidYMax meet"
      role="img"
    >
      <defs>${texture.defs}</defs>
      <line
        class="ground"
        x1=${box.x}
        x2=${box.x + box.w}
        y1=${-ground}
        y2=${-ground}
        vector-effect="non-scaling-stroke"
      />
      ${
        bottom
          ? [-legX, legX].map(
              (x) =>
                svg`<line class="leg" x1=${x} x2=${x} y1=${-bottom.z1} y2=${-ground} vector-effect="non-scaling-stroke" />`,
            )
          : nothing
      }
      ${parts.map(
        (part, i) => svg`
          <g class="part ${part.kind}">
            <title>${opts.partTitles[i] ?? ''}</title>
            <polygon class="wall" points=${outline(part)} vector-effect="non-scaling-stroke" />
            ${
              reading && level > part.z0
                ? svg`<polygon class="grain" points=${outline(part, part.z0, level)} />
                    ${texture.fills.map(
                      (fill) => svg`<polygon class="texture" points=${outline(part, part.z0, level)} fill=${fill} />`,
                    )}`
                : nothing
            }
            <polygon class="edge" points=${outline(part)} vector-effect="non-scaling-stroke" />
          </g>
        `,
      )}
      ${
        reading && level > 0
          ? svg`<line class="surface" x1=${-surfaceHalf(parts, level)} x2=${surfaceHalf(parts, level)}
              y1=${-level} y2=${-level} vector-effect="non-scaling-stroke" />`
          : nothing
      }
      ${
        opts.showSensor
          ? svg`<g class="sensor">
              <title>${opts.sensorTitle ?? ''}</title>
              ${
                reading
                  ? svg`<line class="beam" x1="0" x2="0" y1=${-sensorHeight} y2=${-level} vector-effect="non-scaling-stroke" />`
                  : nothing
              }
              <rect x=${-sensorBox} y=${-sensorHeight - sensorBox} width=${sensorBox * 2} height=${sensorBox}
                rx=${sensorBox * 0.2} vector-effect="non-scaling-stroke" />
            </g>`
          : nothing
      }
    </svg>
  `;
}

/** Half the silo's width at the grain surface. */
function surfaceHalf(parts: Part[], level: number): number {
  const part = parts.find((p) => level >= p.z0 && level <= p.z1) ?? parts[parts.length - 1];
  return widthAt(part, level) / 2;
}

/** A repeatable sequence of numbers between 0 and 1, so the stipple tile is the same on every card. */
function seeded(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

/** The stipple tile, in screen pixels: [x, y, radius, light]. Large enough that the repeat doesn't show. */
const STIPPLE_TILE = 29;
const STIPPLE: Array<[number, number, number, boolean]> = (() => {
  const random = seeded(7);
  return Array.from({ length: 90 }, () => {
    const x = random() * STIPPLE_TILE;
    const y = random() * STIPPLE_TILE;
    const radius = random() < 0.3 ? 0.8 : 0.5;
    return [x, y, radius, random() < 0.25];
  });
})();

/**
 * What lies over the grain colour: pattern or gradient definitions, and the fills of the polygons drawn on
 * top of the grain. Darker and lighter marks come from CSS (`.texture-dark`, `.texture-light`), so they work
 * over any grain colour, including the low-level one. `px` is the size of a screen pixel in silo units.
 */
function textures(
  texture: Texture,
  px: number,
  width: number,
  level: number,
): { defs: SVGTemplateResult; fills: string[] } {
  switch (texture) {
    case 'layers': {
      // Soft wavy strata, like grain settling load after load.
      const step = 6 * px;
      const length = 40 * px;
      return {
        defs: svg`<pattern id="texture" patternUnits="userSpaceOnUse" width=${length} height=${4 * step}>
          ${[0, 1, 2, 3].map((k) => {
            const y = k * step + step / 2;
            const wave = (k % 2 ? 1.2 : 0.8) * px;
            return svg`<path class=${k % 2 ? 'texture-line faint' : 'texture-line'} stroke-width=${0.9 * px}
              d="M0 ${y} Q ${length / 4} ${y - wave} ${length / 2} ${y} T ${length} ${y}" />`;
          })}
        </pattern>`,
        fills: ['url(#texture)'],
      };
    }
    case 'shaded':
      // No pattern: darker at the walls, a little light left of centre (a round bin), darker towards the bottom.
      return {
        defs: svg`
          <linearGradient id="texture-x" gradientUnits="userSpaceOnUse" x1=${-width / 2} x2=${width / 2} y1="0" y2="0">
            <stop offset="0" stop-color="black" stop-opacity="0.22" />
            <stop offset="0.35" stop-color="white" stop-opacity="0.12" />
            <stop offset="0.6" stop-color="white" stop-opacity="0" />
            <stop offset="1" stop-color="black" stop-opacity="0.25" />
          </linearGradient>
          <linearGradient id="texture-y" gradientUnits="userSpaceOnUse" x1="0" x2="0" y1=${-level} y2="0">
            <stop offset="0" stop-color="black" stop-opacity="0" />
            <stop offset="1" stop-color="black" stop-opacity="0.18" />
          </linearGradient>`,
        fills: ['url(#texture-x)', 'url(#texture-y)'],
      };
    case 'hatching':
      // Thin 45° lines: the drafting convention for a cut through bulk material.
      return {
        defs: svg`<pattern id="texture" patternUnits="userSpaceOnUse" width=${5 * px} height=${5 * px}
          patternTransform="rotate(45)">
          <line class="texture-line" x1="0" y1="0" x2="0" y2=${5 * px} stroke-width=${px} />
        </pattern>`,
        fills: ['url(#texture)'],
      };
    default:
      // Stipple: fine dots of two sizes, mostly in shadow, some catching the light.
      return {
        defs: svg`<pattern id="texture" patternUnits="userSpaceOnUse" width=${STIPPLE_TILE * px}
          height=${STIPPLE_TILE * px}>
          ${STIPPLE.map(
            ([x, y, r, light]) =>
              svg`<circle class=${light ? 'texture-light' : 'texture-dark'} cx=${x * px} cy=${y * px} r=${r * px} />`,
          )}
        </pattern>`,
        fills: ['url(#texture)'],
      };
  }
}
