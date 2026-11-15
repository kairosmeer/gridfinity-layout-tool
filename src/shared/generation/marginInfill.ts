/**
 * Drawer-fit margins that save filament. The padding around the grid is either
 * ribbed (an outer rim plus cross ribs, open between them) or cut down to pads
 * (ribbed pieces at the ends of every edge and in the middle of long ones, with
 * nothing in between, as TUDC's "smart spacers" do). The plan is kernel-free so
 * it can be unit-tested and shared by the plate and the detached margin rails.
 *
 * Frame: the grid is centred on the origin (as in the plate generator), the
 * padding bands lie outside ±gridW/2 and ±gridD/2.
 *
 * Every opening is a vertical through-cut, and the rim and ribs keep the full
 * plate height: bins that extend over the margin rest on them. Cells open right
 * up to the grid edge, like TUDC's spacers: the pocket wall there is the same
 * one an unpadded plate ends on, so a wall beside it only cost width.
 *
 * On an eco plate the cells run into the reliefs eco notches into the padding.
 * Eco already gives up the wall there, as it does on every grid joint.
 */

import type { ResolvedBaseplateParams } from '@/shared/types/bin';
import { plateCornerRadii } from './baseplateFrame';
import type { EcoKeepOut } from './ecoPlate';

/** Outer rim along the drawer wall: three 0.4 mm lines. */
export const MARGIN_RIM_MM = 1.2;
/** Cross ribs between cells. */
export const MARGIN_RIB_MM = 1.2;
/** Solid kept on a detached rail's seam face, past its groove reserve. */
export const RAIL_SEAM_WALL_MM = 1.2;
/** Narrowest opening across a band; a narrower band stays solid. */
export const MARGIN_MIN_OPEN_MM = 2;
/** Shortest opening along a band. */
export const MARGIN_MIN_CELL_MM = 4;
/** Rounding of a cell's corners. */
export const MARGIN_CELL_RADIUS_MM = 1;
/** Longest stretch of an edge left without a pad, in grid units. */
export const MARGIN_MAX_GAP_UNITS = 3;

export interface MarginInfillCell {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  /** 0 for a gap between pads, which is cut square and past the plate edge. */
  readonly radius: number;
}

type MarginParams = Pick<
  ResolvedBaseplateParams,
  | 'width'
  | 'depth'
  | 'gridUnitMm'
  | 'gridUnitMmY'
  | 'paddingLeft'
  | 'paddingRight'
  | 'paddingFront'
  | 'paddingBack'
  | 'cornerRadius'
  | 'cornerRadii'
  | 'outline'
>;

export interface MarginInfillOptions {
  /** Round holes (screw seats) the cells must stay clear of, wall included. */
  readonly keepOuts?: readonly EcoKeepOut[];
  /** Keep only pads of the margin; the stretches between them are removed. */
  readonly pads?: boolean;
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

type Span = readonly [number, number];

/** True when a band is wide enough for a rim and an opening beside it. */
export function marginBandRibs(paddingMm: number, innerReserveMm = 0): boolean {
  return paddingMm - MARGIN_RIM_MM - innerReserveMm >= MARGIN_MIN_OPEN_MM;
}

/** One padding band, described along and across its own axis. */
interface Band {
  /** True for the left/right bands, which run along Y. */
  readonly vertical: boolean;
  /** Grid edge and plate edge on the across axis. */
  readonly inner: number;
  readonly outer: number;
  /** Extent along the band, plate edge to plate edge where it owns corners. */
  readonly from: number;
  readonly to: number;
  /** The grid's own extent along the band; pads and gaps live inside it. */
  readonly gridFrom: number;
  readonly gridTo: number;
  readonly pitch: number;
  readonly breaks: readonly number[];
}

/** The openings of a ribbed or padded margin, in the plate frame. */
export function marginInfillCells(
  params: MarginParams,
  options: MarginInfillOptions = {}
): MarginInfillCell[] {
  const pitchX = params.gridUnitMm;
  const pitchY = params.gridUnitMmY ?? pitchX;
  const halfW = (params.width * pitchX) / 2;
  const halfD = (params.depth * pitchY) / 2;
  const { paddingLeft: pL, paddingRight: pR, paddingFront: pF, paddingBack: pB } = params;
  const keepOuts = options.keepOuts ?? [];
  const yBreaks = [-halfD, ...halfUnitBreaks(params.depth, pitchY, halfD), halfD];
  const xBreaks = [-halfW, ...halfUnitBreaks(params.width, pitchX, halfW), halfW];

  // Left and right bands own the corners. Front and back bands stop a rib short
  // of a ribbed side band; beside a solid side strip they start at the grid's
  // side edge, and with no side padding at all they keep the plate's rim.
  const endFor = (sidePadding: number): number =>
    marginBandRibs(sidePadding) ? MARGIN_RIB_MM : sidePadding > 0 ? 0 : MARGIN_RIM_MM;
  const side = (sign: -1 | 1, padding: number): Band => ({
    vertical: true,
    inner: sign * halfW,
    outer: sign * (halfW + padding),
    from: -halfD - pF,
    to: halfD + pB,
    gridFrom: -halfD,
    gridTo: halfD,
    pitch: pitchY,
    breaks: yBreaks,
  });
  const frontBack = (sign: -1 | 1, padding: number): Band => ({
    vertical: false,
    inner: sign * halfD,
    outer: sign * (halfD + padding),
    from: -halfW + endFor(pL),
    to: halfW - endFor(pR),
    gridFrom: -halfW,
    gridTo: halfW,
    pitch: pitchX,
    breaks: xBreaks,
  });
  const bands: Array<[number, Band]> = [
    [pL, side(-1, pL)],
    [pR, side(1, pR)],
    [pF, frontBack(-1, pF)],
    [pB, frontBack(1, pB)],
  ];

  const rects: Rect[] = [];
  const gaps: Rect[] = [];
  for (const [padding, band] of bands) {
    if (padding <= 0) continue;
    const pads = options.pads === true ? padSpans(band, keepOuts) : [[band.from, band.to] as Span];
    if (options.pads === true) {
      for (const [s, e] of complement(pads, band.gridFrom, band.gridTo)) {
        if (e - s < MARGIN_MIN_CELL_MM) continue;
        // Square, from the grid edge to past the plate edge, so the stretch
        // between pads is gone entirely and the grid ends as an unpadded one.
        gaps.push(toRect(band, [band.inner, band.outer + Math.sign(band.outer) * 1], [s, e]));
      }
    }
    if (!marginBandRibs(padding)) continue;
    const across: Span = [band.inner, band.outer - Math.sign(band.outer) * MARGIN_RIM_MM];
    const bandFrom = band.vertical ? band.from + MARGIN_RIM_MM : band.from;
    const bandTo = band.vertical ? band.to - MARGIN_RIM_MM : band.to;
    for (const [s, e] of pads) {
      // A pad end against a gap keeps a rib, as the ends of the band keep the rim.
      const a = Math.max(s === band.from ? bandFrom : s + MARGIN_RIB_MM, bandFrom);
      const b = Math.min(e === band.to ? bandTo : e - MARGIN_RIB_MM, bandTo);
      for (const along of segments(a, b, band.breaks)) rects.push(toRect(band, across, along));
    }
  }

  const clearOfHoles = rects.flatMap((rect) => avoidKeepOuts(rect, keepOuts));

  const radii = plateCornerRadii(params);
  const cornerRadius = Math.max(radii.tl, radii.tr, radii.bl, radii.br);
  const cornerOf = (rect: Rect): { x: number; y: number } => ({
    x: halfW + (rect.x0 + rect.x1 < 0 ? pL : pR),
    y: halfD + (rect.y0 + rect.y1 < 0 ? pF : pB),
  });
  const cells: MarginInfillCell[] = [];
  for (const rect of clearOfHoles) {
    const width = rect.x1 - rect.x0;
    const depth = rect.y1 - rect.y0;
    if (Math.min(width, depth) < MARGIN_MIN_OPEN_MM) continue;
    if (Math.max(width, depth) < MARGIN_MIN_CELL_MM) continue;
    let radius = Math.min(MARGIN_CELL_RADIUS_MM, Math.min(width, depth) / 2 - 0.05);
    if (cornerRadius > MARGIN_RIM_MM && reachesCorner(rect, cornerOf(rect), cornerRadius)) {
      // Concentric with the plate's rounded corner, so the rim keeps its width
      // all the way round the arc.
      radius = Math.max(radius, cornerRadius - MARGIN_RIM_MM);
      if (radius > Math.min(width, depth) / 2 - 0.05) continue;
    }
    cells.push(centred(rect, radius));
  }
  return [...cells, ...gaps.map((rect) => centred(rect, 0))];
}

/**
 * Stretches of a band kept as pads: one grid unit at each end of the grid edge
 * (plus the corner the band owns), middle pads so no gap is longer than
 * {@link MARGIN_MAX_GAP_UNITS}, and a pad round every screw seat in the band.
 */
function padSpans(band: Band, keepOuts: readonly EcoKeepOut[]): Span[] {
  const { gridFrom, gridTo, pitch } = band;
  const spans: Span[] = [
    [band.from, gridFrom + pitch],
    [gridTo - pitch, band.to],
  ];
  const free = gridTo - gridFrom - 2 * pitch;
  if (free < pitch / 2) return [[band.from, band.to]];
  const gapCount = Math.ceil(free / (MARGIN_MAX_GAP_UNITS * pitch));
  const gap = (free - (gapCount - 1) * pitch) / gapCount;
  for (let i = 1; i < gapCount; i++) {
    const start = gridFrom + pitch + i * gap + (i - 1) * pitch;
    spans.push([start, start + pitch]);
  }
  const lo = Math.min(band.inner, band.outer);
  const hi = Math.max(band.inner, band.outer);
  for (const k of keepOuts) {
    const across = band.vertical ? k.x : k.y;
    const along = band.vertical ? k.y : k.x;
    if (across + k.radius <= lo || across - k.radius >= hi) continue;
    spans.push([along - k.radius - MARGIN_RIB_MM, along + k.radius + MARGIN_RIB_MM]);
  }
  return merge(spans.map(([s, e]) => [Math.max(s, band.from), Math.min(e, band.to)] as Span));
}

function merge(spans: readonly Span[]): Span[] {
  const sorted = [...spans].filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  for (const [s, e] of sorted) {
    const last = out.at(-1);
    if (last !== undefined && s <= last[1] + MARGIN_MIN_CELL_MM) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** The parts of [from, to] no span covers. */
function complement(spans: readonly Span[], from: number, to: number): Span[] {
  const out: Span[] = [];
  let at = from;
  for (const [s, e] of spans) {
    if (s > at) out.push([at, Math.min(s, to)]);
    at = Math.max(at, e);
  }
  if (at < to) out.push([at, to]);
  return out.filter(([s, e]) => e > s);
}

function toRect(band: Band, across: Span, along: Span): Rect {
  const [c0, c1] = [Math.min(...across), Math.max(...across)];
  return band.vertical
    ? { x0: c0, x1: c1, y0: along[0], y1: along[1] }
    : { x0: along[0], x1: along[1], y0: c0, y1: c1 };
}

function centred(rect: Rect, radius: number): MarginInfillCell {
  return {
    x: (rect.x0 + rect.x1) / 2,
    y: (rect.y0 + rect.y1) / 2,
    width: rect.x1 - rect.x0,
    depth: rect.y1 - rect.y0,
    radius,
  };
}

/**
 * The open cells of a detached margin rail, in the rail's own origin-centred
 * frame. The seam face (toward the plate) keeps a wall plus `innerReserveMm`
 * for its grooves; the drawer face and both ends keep a rim. Ribs are spread
 * evenly at about half a grid unit. A rail is always ribbed whole: as a pad
 * layout it would fall apart into separate pieces.
 */
export function railInfillCells(
  side: 'left' | 'right' | 'front' | 'back',
  railW: number,
  railD: number,
  pitchMm: number,
  cornerRadiusMm: number,
  innerReserveMm = 0
): MarginInfillCell[] {
  const horizontal = side === 'front' || side === 'back';
  const thickness = horizontal ? railD : railW;
  const length = horizontal ? railW : railD;
  const seamSolid = RAIL_SEAM_WALL_MM + innerReserveMm;
  if (!marginBandRibs(thickness, seamSolid)) return [];
  // The seam face's sign along the thickness axis, as buildMarginSeamGroove has it.
  const seamSign = side === 'front' || side === 'left' ? 1 : -1;
  const half = thickness / 2;
  const outer = -seamSign * (half - MARGIN_RIM_MM);
  const inner = seamSign * (half - seamSolid);
  const a0 = Math.min(outer, inner);
  const a1 = Math.max(outer, inner);

  const run = length - 2 * MARGIN_RIM_MM;
  const count = Math.max(1, Math.round(run / (pitchMm / 2)));
  const step = run / count;
  const cells: MarginInfillCell[] = [];
  for (let i = 0; i < count; i++) {
    const s = -run / 2 + i * step + (i === 0 ? 0 : MARGIN_RIB_MM / 2);
    const e = -run / 2 + (i + 1) * step - (i === count - 1 ? 0 : MARGIN_RIB_MM / 2);
    const along = e - s;
    const across = a1 - a0;
    if (along < MARGIN_MIN_CELL_MM || across < MARGIN_MIN_OPEN_MM) continue;
    let radius = Math.min(MARGIN_CELL_RADIUS_MM, across / 2 - 0.05);
    const atEnd = i === 0 || i === count - 1;
    if (atEnd && cornerRadiusMm > MARGIN_RIM_MM) {
      radius = Math.max(radius, cornerRadiusMm - MARGIN_RIM_MM);
      if (radius > Math.min(along, across) / 2 - 0.05) continue;
    }
    const c = (s + e) / 2;
    const m = (a0 + a1) / 2;
    cells.push(
      horizontal
        ? { x: c, y: m, width: along, depth: across, radius }
        : { x: m, y: c, width: across, depth: along, radius }
    );
  }
  return cells;
}

/** Interior half-unit lines of one axis, measured from the grid's low edge. */
function halfUnitBreaks(units: number, pitch: number, half: number): number[] {
  const breaks: number[] = [];
  const steps = Math.floor(units * 2 + 1e-6);
  for (let k = 1; k < steps; k++) breaks.push(-half + (k * pitch) / 2);
  return breaks;
}

/** Split [a, b] at every break strictly inside it, leaving half a rib each side. */
function segments(a: number, b: number, breaks: readonly number[]): Span[] {
  const inside = breaks.filter((v) => v > a + 1e-6 && v < b - 1e-6).sort((p, q) => p - q);
  const out: Span[] = [];
  let start = a;
  for (const brk of inside) {
    out.push([start, brk - MARGIN_RIB_MM / 2]);
    start = brk + MARGIN_RIB_MM / 2;
  }
  out.push([start, b]);
  return out.filter(([s, e]) => e - s >= MARGIN_MIN_CELL_MM);
}

/**
 * Remove `hole` from `rect`, returning up to four pieces. The pieces beside the
 * hole run the full length of `rect`; the ones above and below it fill the rest.
 */
function subtractRect(rect: Rect, hole: Rect): Rect[] {
  if (hole.x1 <= rect.x0 || hole.x0 >= rect.x1 || hole.y1 <= rect.y0 || hole.y0 >= rect.y1) {
    return [rect];
  }
  const out: Rect[] = [];
  const midY0 = Math.max(rect.y0, hole.y0);
  const midY1 = Math.min(rect.y1, hole.y1);
  if (hole.y0 > rect.y0) out.push({ ...rect, y1: hole.y0 });
  if (hole.y1 < rect.y1) out.push({ ...rect, y0: hole.y1 });
  if (hole.x0 > rect.x0) out.push({ x0: rect.x0, x1: hole.x0, y0: midY0, y1: midY1 });
  if (hole.x1 < rect.x1) out.push({ x0: hole.x1, x1: rect.x1, y0: midY0, y1: midY1 });
  return out;
}

/** Cut the bounding square of every keep-out disc out of the cell. */
function avoidKeepOuts(rect: Rect, keepOuts: readonly EcoKeepOut[]): Rect[] {
  let pieces: Rect[] = [rect];
  for (const k of keepOuts) {
    const hole: Rect = {
      x0: k.x - k.radius,
      x1: k.x + k.radius,
      y0: k.y - k.radius,
      y1: k.y + k.radius,
    };
    pieces = pieces.flatMap((piece) => subtractRect(piece, hole));
  }
  return pieces;
}

/** True when the rectangle reaches into a rounded plate corner's arc zone. */
function reachesCorner(rect: Rect, corner: { x: number; y: number }, radius: number): boolean {
  const zoneX = corner.x - radius;
  const zoneY = corner.y - radius;
  const farX = Math.max(Math.abs(rect.x0), Math.abs(rect.x1));
  const farY = Math.max(Math.abs(rect.y0), Math.abs(rect.y1));
  return farX > zoneX && farY > zoneY;
}
