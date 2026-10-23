/**
 * Silo geometry: the silo is a stack of parts, bottom to top, each one a frustum (cylinder, cone or
 * truncated cone) or a dome. Every length is in metres and every volume in cubic metres.
 *
 * Kept free of Lit and Home Assistant so it can be tested, and mirrored by an integration later.
 */

/** Cross-section: a circle, or a square whose side is the "diameter". */
export type Shape = 'round' | 'square';
export type TopType = 'flat' | 'cone' | 'dome';
export type BottomType = 'flat' | 'cone';

export interface SiloGeometry {
  shape: Shape;
  diameter: number;
  rings: number;
  ringHeight: number;
  top: TopType;
  topHeight: number;
  bottom: BottomType;
  bottomHeight: number;
  /** Diameter of a cone bottom at its lowest point (0 for a pointed hopper). */
  outlet: number;
}

export type PartKind = 'bottom' | 'ring' | 'top';

export interface Part {
  kind: PartKind;
  /** Ring number, from 1 at the bottom; 0 for the top and bottom. */
  index: number;
  profile: 'frustum' | 'dome';
  z0: number;
  z1: number;
  /** Width at z0 and z1 (a dome is w0 wide at its base and comes to a point). */
  w0: number;
  w1: number;
}

/** The parts from bottom to top. A flat top or bottom has no height, so no part. */
export function buildParts(g: SiloGeometry): Part[] {
  const parts: Part[] = [];
  let z = 0;
  if (g.bottom === 'cone' && g.bottomHeight > 0) {
    const outlet = Math.min(Math.max(g.outlet, 0), g.diameter);
    parts.push({ kind: 'bottom', index: 0, profile: 'frustum', z0: 0, z1: g.bottomHeight, w0: outlet, w1: g.diameter });
    z = g.bottomHeight;
  }
  for (let i = 1; i <= g.rings; i++) {
    parts.push({
      kind: 'ring',
      index: i,
      profile: 'frustum',
      z0: z,
      z1: z + g.ringHeight,
      w0: g.diameter,
      w1: g.diameter,
    });
    z += g.ringHeight;
  }
  if (g.top !== 'flat' && g.topHeight > 0) {
    const profile = g.top === 'dome' ? 'dome' : 'frustum';
    parts.push({ kind: 'top', index: 0, profile, z0: z, z1: z + g.topHeight, w0: g.diameter, w1: 0 });
  }
  return parts;
}

export function totalHeight(parts: Part[]): number {
  return parts.length ? parts[parts.length - 1].z1 : 0;
}

function area(shape: Shape, width: number): number {
  return shape === 'round' ? (Math.PI * width * width) / 4 : width * width;
}

/** Width of the part at height z (clamped to the part). */
export function widthAt(part: Part, z: number): number {
  const h = part.z1 - part.z0;
  const t = h > 0 ? Math.min(Math.max((z - part.z0) / h, 0), 1) : 0;
  if (part.profile === 'dome') return part.w0 * Math.sqrt(1 - t * t);
  return part.w0 + (part.w1 - part.w0) * t;
}

/** Volume of the part below height z. */
export function partVolumeBelow(part: Part, shape: Shape, z: number): number {
  const h = part.z1 - part.z0;
  const y = Math.min(Math.max(z - part.z0, 0), h);
  if (y <= 0) return 0;
  const a0 = area(shape, part.w0);
  if (part.profile === 'dome') {
    // Half an ellipsoid (or its square cousin): the area shrinks as 1 - (y/h)².
    return a0 * (y - (y * y * y) / (3 * h * h));
  }
  // Frustum between two similar cross-sections.
  const ay = area(shape, widthAt(part, z));
  return (y / 3) * (a0 + ay + Math.sqrt(a0 * ay));
}

export function partVolume(part: Part, shape: Shape): number {
  return partVolumeBelow(part, shape, part.z1);
}

/** Volume of the silo below height z. */
export function volumeBelow(parts: Part[], shape: Shape, z: number): number {
  return parts.reduce((sum, part) => sum + partVolumeBelow(part, shape, z), 0);
}

/** What "full" holds: up to the eave, or up to the peak when the roof is filled too. */
export function capacityVolume(parts: Part[], shape: Shape, includeRoof: boolean): number {
  return parts.filter((p) => includeRoof || p.kind !== 'top').reduce((sum, p) => sum + partVolume(p, shape), 0);
}

/** Where the grain surface is, for the "Rings" line: in the bottom, on a ring (2.4 = 40 % up the 3rd), or in the top. */
export type Position =
  | { kind: 'bottom'; fraction: number }
  | { kind: 'rings'; rings: number }
  | { kind: 'top'; fraction: number }
  | { kind: 'empty' };

export function position(parts: Part[], level: number): Position {
  const rings = parts.filter((p) => p.kind === 'ring');
  const bottom = parts.find((p) => p.kind === 'bottom');
  const top = parts.find((p) => p.kind === 'top');
  if (level <= 0 || !parts.length) return { kind: 'empty' };
  if (bottom && level < bottom.z1) return { kind: 'bottom', fraction: level / bottom.z1 };
  if (top && level > top.z0) return { kind: 'top', fraction: Math.min((level - top.z0) / (top.z1 - top.z0), 1) };
  if (!rings.length) return { kind: 'empty' };
  const ringHeight = rings[0].z1 - rings[0].z0;
  return { kind: 'rings', rings: Math.min((level - rings[0].z0) / ringHeight, rings.length) };
}

/**
 * Points along the right-hand wall of a part, from zFrom up to zTo, as [x, z] with x the half-width.
 * Domes are sampled; frustums only need their two ends.
 */
export function wallPoints(part: Part, zFrom = part.z0, zTo = part.z1): Array<[number, number]> {
  const from = Math.max(zFrom, part.z0);
  const to = Math.min(zTo, part.z1);
  if (to <= from) return [];
  if (part.profile !== 'dome') return [from, to].map((z) => [widthAt(part, z) / 2, z]);
  // Even steps around the ellipse, not in height: the curve turns fastest near the crown.
  const h = part.z1 - part.z0;
  const a0 = Math.asin((from - part.z0) / h);
  const a1 = Math.asin((to - part.z0) / h);
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= 16; i++) {
    const a = a0 + ((a1 - a0) * i) / 16;
    points.push([(part.w0 / 2) * Math.cos(a), part.z0 + h * Math.sin(a)]);
  }
  return points;
}
