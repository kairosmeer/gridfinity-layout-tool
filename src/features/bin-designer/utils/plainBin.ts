/**
 * A plain bin at a given footprint.
 *
 * A layout bin knows its rectangle and height, but not its cavity: that lives
 * in a saved design, and an unlinked bin has none. `plainBinParams` fills the
 * neutral defaults in so `binInteriorDimensions` can measure what a plain
 * one-compartment bin of that size would hold. Reading the layout's inside
 * size through the same function the designer uses keeps the two readouts from
 * drifting, and means the wall-thickness assumption is the only input the
 * layout has to supply.
 */

import { DEFAULT_BIN_PARAMS } from '../constants';
import type { BinParams } from '../types';
import { binInteriorDimensions, type InteriorDimensions } from './interiorDimensions';

/** The size and physical units a layout bin carries. */
export interface PlainBinSize {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly gridUnitMm: number;
  /** Depth-axis pitch for a non-square grid; omitted = square. */
  readonly gridUnitMmY?: number;
  readonly heightUnitMm: number;
}

export interface PlainBinInput extends PlainBinSize {
  /** Wall thickness to assume, in mm. */
  readonly wallThicknessMm: number;
}

/**
 * Neutral BinParams for a bin that only exists as a layout rectangle.
 * Keeping `gridUnitMmY` out when it is unset avoids giving a square bin an
 * explicit `undefined` pitch, which some params consumers test with `in`.
 */
export function plainBinParams(input: PlainBinInput): BinParams {
  const { width, depth, height, gridUnitMm, gridUnitMmY, heightUnitMm, wallThicknessMm } = input;
  return {
    ...DEFAULT_BIN_PARAMS,
    width,
    depth,
    height,
    gridUnitMm,
    heightUnitMm,
    wallThickness: wallThicknessMm,
    ...(gridUnitMmY !== undefined ? { gridUnitMmY } : {}),
  };
}

/**
 * Cavity of a plain bin this size, or null when the size cannot hold one (a
 * zero or negative wall, a footprint too small to enclose anything).
 */
export function plainBinInterior(input: PlainBinInput): InteriorDimensions | null {
  if (!(Number.isFinite(input.wallThicknessMm) && input.wallThicknessMm > 0)) return null;
  return binInteriorDimensions(plainBinParams(input));
}
