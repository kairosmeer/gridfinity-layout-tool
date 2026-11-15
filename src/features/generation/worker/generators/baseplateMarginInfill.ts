import { drawRectangle, drawRoundedRectangle, translate } from 'brepjs';
import type { Shape3D } from 'brepjs';
import type { MarginInfillCell } from '@/shared/generation/marginInfill';

/**
 * Through-cutters for the openings of a ribbed or padded margin. The solid they
 * cut has its top face at Z = 0 and extends down to -`totalHeight` (the frame
 * both the plate and the detached rails are built in before they are lifted).
 * A radius of 0 marks a gap between pads, cut square.
 */
export function buildMarginInfillCutters(
  cells: readonly MarginInfillCell[],
  totalHeight: number
): Shape3D[] {
  return cells.map((cell) => {
    const radius = Math.min(cell.radius, Math.min(cell.width, cell.depth) / 2 - 0.05);
    const profile =
      radius > 0.01
        ? drawRoundedRectangle(cell.width, cell.depth, radius)
        : drawRectangle(cell.width, cell.depth);
    const cutter = (
      profile.sketchOnPlane('XY', 0.2) as { extrude: (h: number) => Shape3D }
    ).extrude(-(totalHeight + 0.4));
    const positioned = translate(cutter, [cell.x, cell.y, 0]);
    cutter.delete();
    return positioned;
  });
}
