/**
 * Where a compartment holder's pockets go. The worker cuts these and the Bento
 * dock counts them, so the number the panel shows is the number that prints.
 *
 * Coordinates are in the cavity frame (centred on the interior, Y towards the
 * back), in mm.
 */

import type { BinParams, CompartmentConfig } from '@/shared/types/bin';
import { compartmentHasTiltedEdge, isRectangularCompartment } from '@/shared/types/bin';
import { holderItemById } from '@/shared/constants/holderItems';
import type { HolderItem } from '@/shared/constants/holderItems';
import { interiorFilletRadiusMm } from '@/shared/utils/interiorFillet';

/** Least wall (mm) between a pocket and the compartment's walls. */
export const HOLDER_EDGE_MM = 1.2;

/** Most pockets one compartment takes, so a fine slot in a big bin stays buildable. */
export const MAX_HOLDER_POCKETS = 240;

export interface HolderRect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** One pocket: centre and footprint. A trough runs along its longer side. */
export interface HolderPocket {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly d: number;
}

export interface HolderPlan {
  readonly item: HolderItem;
  readonly pockets: readonly HolderPocket[];
}

/**
 * The floor of a compartment inside its walls and half dividers, or null when
 * it is not a plain rectangle (a merged outline or a tilted divider), where a
 * grid of pockets would cross a wall.
 */
export function compartmentFloorRect(
  compartments: CompartmentConfig,
  id: number,
  innerW: number,
  innerD: number
): HolderRect | null {
  const { cols, rows, cells, thickness } = compartments;
  let c0 = Infinity;
  let c1 = -Infinity;
  let r0 = Infinity;
  let r1 = -Infinity;
  cells.forEach((cell, i) => {
    if (cell !== id) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    c0 = Math.min(c0, col);
    c1 = Math.max(c1, col);
    r0 = Math.min(r0, row);
    r1 = Math.max(r1, row);
  });
  if (c0 === Infinity) return null;
  if (!isRectangularCompartment(compartments, id)) return null;
  if (compartmentHasTiltedEdge(compartments, id)) return null;
  const cellW = innerW / cols;
  const cellD = innerD / rows;
  const half = thickness / 2;
  return {
    x0: -innerW / 2 + c0 * cellW + (c0 > 0 ? half : 0),
    x1: -innerW / 2 + (c1 + 1) * cellW - (c1 < cols - 1 ? half : 0),
    y0: -innerD / 2 + r0 * cellD + (r0 > 0 ? half : 0),
    y1: -innerD / 2 + (r1 + 1) * cellD - (r1 < rows - 1 ? half : 0),
  };
}

/** Clearance kept from the walls: an interior fillet rounds the edge pockets would cut. */
export function holderEdgeMm(params: Pick<BinParams, 'interiorFilletMm'>): number {
  return HOLDER_EDGE_MM + interiorFilletRadiusMm(params);
}

/** How many of `size` fit in `span` with `gap` between them. */
function fitCount(span: number, size: number, gap: number): number {
  if (!(size > 0) || span < size) return 0;
  return Math.floor((span - size) / (size + gap) + 1e-9) + 1;
}

/**
 * Centres of `count` items of `size` across [lo, hi], `gap` apart, with the
 * room left over shared equally between the gaps and both ends.
 */
function centres(lo: number, hi: number, size: number, gap: number, count: number): number[] {
  const spare = hi - lo - count * size - (count - 1) * gap;
  const extra = Math.max(0, spare) / (count + 1);
  const out: number[] = [];
  let at = lo + extra + size / 2;
  for (let i = 0; i < count; i++) {
    out.push(at);
    at += size + gap + extra;
  }
  return out;
}

function grid(
  rect: HolderRect,
  w: number,
  d: number,
  gap: number
): { pockets: HolderPocket[]; count: number } {
  const cols = fitCount(rect.x1 - rect.x0, w, gap);
  const rows = fitCount(rect.y1 - rect.y0, d, gap);
  const count = cols * rows;
  if (count === 0) return { pockets: [], count };
  const xs = centres(rect.x0, rect.x1, w, gap, cols);
  const ys = centres(rect.y0, rect.y1, d, gap, rows);
  const pockets: HolderPocket[] = [];
  for (const y of ys) {
    for (const x of xs) pockets.push({ x, y, w, d });
  }
  return { pockets, count };
}

/**
 * Pockets for one item in a compartment floor. Slots take whichever quarter
 * turn fits more; a trough runs the length of the compartment's longer side.
 */
export function layoutHolderPockets(
  item: HolderItem,
  floor: HolderRect,
  edgeMm: number
): HolderPocket[] {
  const rect: HolderRect = {
    x0: floor.x0 + edgeMm,
    y0: floor.y0 + edgeMm,
    x1: floor.x1 - edgeMm,
    y1: floor.y1 - edgeMm,
  };
  const spanX = rect.x1 - rect.x0;
  const spanY = rect.y1 - rect.y0;
  if (spanX <= 0 || spanY <= 0) return [];

  let pockets: HolderPocket[];
  if (item.shape === 'trough') {
    // Shorter than its own width is no trough at all.
    pockets =
      spanX >= spanY
        ? spanX > item.w
          ? grid(rect, spanX, item.w, item.gapMm).pockets
          : []
        : spanY > item.w
          ? grid(rect, item.w, spanY, item.gapMm).pockets
          : [];
  } else if (item.w === item.d) {
    pockets = grid(rect, item.w, item.d, item.gapMm).pockets;
  } else {
    const upright = grid(rect, item.w, item.d, item.gapMm);
    const turned = grid(rect, item.d, item.w, item.gapMm);
    pockets = turned.count > upright.count ? turned.pockets : upright.pockets;
  }
  return pockets.length > MAX_HOLDER_POCKETS ? pockets.slice(0, MAX_HOLDER_POCKETS) : pockets;
}

/**
 * Every holder that builds, keyed by compartment id: one whose item is known,
 * whose compartment is a plain rectangle and whose floor is raised. `raises`
 * is the raise each compartment is built with, which is the pocket depth.
 */
export function planHolders(
  params: Pick<BinParams, 'compartments' | 'interiorFilletMm'>,
  innerW: number,
  innerD: number,
  raises: ReadonlyMap<number, number>
): Map<number, HolderPlan> {
  const out = new Map<number, HolderPlan>();
  const holders = params.compartments.holders;
  if (!holders) return out;
  const edge = holderEdgeMm(params);
  holders.forEach((id, compartmentId) => {
    const item = holderItemById(id);
    if (!item || !((raises.get(compartmentId) ?? 0) > 0)) return;
    const floor = compartmentFloorRect(params.compartments, compartmentId, innerW, innerD);
    if (!floor) return;
    const pockets = layoutHolderPockets(item, floor, edge);
    if (pockets.length > 0) out.set(compartmentId, { item, pockets });
  });
  return out;
}

/** Whether any compartment names a holder, built or not. */
export function hasAnyHolder(compartments: Pick<CompartmentConfig, 'holders'>): boolean {
  return (compartments.holders ?? []).some((id) => holderItemById(id) !== undefined);
}
