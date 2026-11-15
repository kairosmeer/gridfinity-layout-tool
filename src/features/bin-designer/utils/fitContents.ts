/**
 * "Fit contents": the smallest bin that holds an item measured with a ruler.
 *
 * The typed length/width/height are real measurements, so each candidate size
 * is measured through the same `binInteriorDimensions` the Dimensions panel
 * reads. Wall thickness, per-side overhang narrowing, pull-tab walls, the base
 * profile and a non-square grid pitch therefore cannot drift out of sync with
 * a hand-inverted formula.
 *
 * Sizes are searched in grid steps, not solved: the interior grows linearly
 * enough that stepping from the smallest legal size is cheap and cannot miss
 * the true minimum the way a rounded division can. The item is tried both ways
 * round and the smaller footprint wins, so a 100 × 75 mm item lands on 3 × 2
 * rather than a cell-larger bin on a drawer axis that has the room.
 *
 * Height is optional: leave it out and the bin keeps the height it has. When a
 * height is given, the same search picks the shortest standard height unit
 * count whose cavity reaches it.
 */

import { DESIGNER_CONSTRAINTS, minHeightUnits } from '../constants';
import type { BinParams } from '../types';
import { binInteriorDimensions, type InteriorDimensions } from './interiorDimensions';

const EPSILON = 1e-6;

const MAX_DIMENSION = DESIGNER_CONSTRAINTS.MAX_DIMENSION;
const MAX_HEIGHT = DESIGNER_CONSTRAINTS.MAX_HEIGHT;

/** The room an item needs, in millimetres. */
export interface ContentsSize {
  /** Longest side of the item, along X when the bin does not turn it. */
  readonly lengthMm: number;
  /** Other floor side of the item, along Y when the bin does not turn it. */
  readonly widthMm: number;
  /** Item height; omit (or 0) to leave the bin's height alone. */
  readonly heightMm?: number;
}

/** A bin size that holds the contents. */
export interface ContentsFit {
  /** Grid units, width (X). */
  readonly width: number;
  /** Grid units, depth (Y). */
  readonly depth: number;
  /** Height units. Unchanged from the design when no height was typed. */
  readonly height: number;
  /** The cavity that size gives, from `binInteriorDimensions`. */
  readonly interior: InteriorDimensions;
  /** True when the item was turned 90° to reach the smaller footprint. */
  readonly turned: boolean;
}

export type ContentsFitResult =
  | { readonly kind: 'fits'; readonly fit: ContentsFit }
  | { readonly kind: 'too-large' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'no-cavity' };

function isPositive(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * First step from `from` whose measured interior reaches `targetMm`, or null
 * when the ceiling is passed first. Null measurements (a height too short to
 * build a wall, say) are skipped rather than treated as zero.
 */
function unitsFit(
  from: number,
  max: number,
  step: number,
  targetMm: number,
  measure: (units: number) => number | null
): number | null {
  for (let units = from; units <= max + EPSILON; units = Math.round((units + step) * 10) / 10) {
    const mm = measure(units);
    if (mm !== null && mm >= targetMm - EPSILON) return units;
  }
  return null;
}

interface Footprint {
  readonly width: number;
  readonly depth: number;
}

/**
 * Smallest width × depth whose cavity reaches both measurements, keeping every
 * other parameter of the design. Null when either axis needs more than
 * `MAX_DIMENSION`.
 */
function fitFootprint(
  params: BinParams,
  targetWidthMm: number,
  targetDepthMm: number,
  step: number
): Footprint | null {
  const width = unitsFit(step, MAX_DIMENSION, step, targetWidthMm, (units) => {
    const interior = binInteriorDimensions({ ...params, width: units });
    return interior ? interior.widthMm : null;
  });
  if (width === null) return null;

  const depth = unitsFit(step, MAX_DIMENSION, step, targetDepthMm, (units) => {
    const interior = binInteriorDimensions({ ...params, width, depth: units });
    return interior ? interior.depthMm : null;
  });
  if (depth === null) return null;

  return { width, depth };
}

/**
 * The smallest bin for the measured contents, or why there isn't one.
 *
 * `no-cavity` covers every design the Dimensions panel also refuses to give an
 * Inside size for: a solid block, a base-only plate, a floorless spacer or
 * lightweight floor, and a masked footprint. Growing cannot create a cavity
 * out of those, so the caller hides the control rather than offering a size
 * nothing can hold.
 */
export function fitContents(
  params: BinParams,
  contents: ContentsSize,
  halfGridMode: boolean
): ContentsFitResult {
  if (!isPositive(contents.lengthMm) || !isPositive(contents.widthMm)) {
    return { kind: 'invalid' };
  }
  if (binInteriorDimensions(params) === null) return { kind: 'no-cavity' };

  const step = halfGridMode ? DESIGNER_CONSTRAINTS.MIN_DIMENSION : 1;

  const straight = fitFootprint(params, contents.lengthMm, contents.widthMm, step);
  const turnedOver =
    contents.lengthMm === contents.widthMm
      ? null
      : fitFootprint(params, contents.widthMm, contents.lengthMm, step);

  let footprint: Footprint;
  let turned = false;
  if (straight === null && turnedOver === null) return { kind: 'too-large' };
  if (straight === null) {
    footprint = turnedOver as Footprint;
    turned = true;
  } else if (turnedOver === null) {
    footprint = straight;
  } else {
    // Fewer cells wins; a tie keeps the item on the axes it was typed for.
    const straightCells = straight.width * straight.depth;
    const turnedCells = turnedOver.width * turnedOver.depth;
    if (turnedCells < straightCells) {
      footprint = turnedOver;
      turned = true;
    } else {
      footprint = straight;
    }
  }

  let height = params.height;
  if (isPositive(contents.heightMm)) {
    const found = unitsFit(
      minHeightUnits(params.base, params.heightUnitMm),
      MAX_HEIGHT,
      DESIGNER_CONSTRAINTS.HEIGHT_STEP,
      contents.heightMm,
      (units) => {
        const interior = binInteriorDimensions({ ...params, height: units });
        return interior ? interior.heightMm : null;
      }
    );
    if (found === null) return { kind: 'too-large' };
    height = found;
  }

  const sized: BinParams = { ...params, width: footprint.width, depth: footprint.depth, height };
  const interior = binInteriorDimensions(sized);
  if (interior === null) return { kind: 'no-cavity' };
  // The per-axis search already guarantees these; re-check the combined size so
  // a future cross-axis coupling (a base mouth, say) fails loudly instead of
  // handing back a bin the item does not fit.
  const targetW = turned ? contents.widthMm : contents.lengthMm;
  const targetD = turned ? contents.lengthMm : contents.widthMm;
  if (interior.widthMm + EPSILON < targetW || interior.depthMm + EPSILON < targetD) {
    return { kind: 'too-large' };
  }
  if (isPositive(contents.heightMm) && interior.heightMm + EPSILON < contents.heightMm) {
    return { kind: 'too-large' };
  }

  return { kind: 'fits', fit: { ...footprint, height, interior, turned } };
}
