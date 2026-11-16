/**
 * Raised compartment floors: a solid slab under a compartment that lifts its
 * floor toward the rim, so a short item in a deep bin sits where a hand can
 * reach it while its neighbours keep the full depth.
 *
 * Built as one box per cell of the compartment, grown a fraction into the
 * walls and dividers around it and into the floor below, so every fuse
 * overlaps real volume rather than meeting on a face; a compartment of any
 * outline is then its cells fused together. A compartment with a tilted
 * divider is skipped: its cavity is a trapezoid the cell boxes would cross.
 *
 * A compartment with a holder has its slab cut into pockets fitted to the
 * item (`planHolders`), each the full height of the raise, so the pocket
 * floor is the bin's own floor and no tool face lies on it.
 */

import {
  box,
  clone,
  cutAll,
  cylinder,
  drawPolysides,
  drawRoundedRectangle,
  fuseAll,
  intersect,
  translate,
  unwrap,
  withScope,
} from 'brepjs';
import type { DisposalScope, Shape3D, ValidSolid } from 'brepjs';
import type { BinParams } from '@/shared/types/bin';
import { isNestingBase } from '@/shared/types/bin';
import type { FeatureBuilder } from './pipeline/featureBuilder';
import { FeatureTag } from './featureTags';
import { buildCacheKey, compactKey, quantize, stableSerialize } from './cacheKeyUtils';
import { resolveFloorRaises } from './floorRaisePlan';
import { sketch } from './meshUtils';
import { BOX_CORNER_RADIUS } from './generatorConstants';
import { planHolders } from '@/shared/utils/holderPockets';
import type { HolderPlan, HolderPocket } from '@/shared/utils/holderPockets';
import { interiorFilletRadiusMm } from '@/shared/utils/interiorFillet';

/** Growth (mm) into the surrounding walls, dividers and floor. */
const FUSE_OVERLAP_MM = 0.2;

/** How far (mm) a pocket tool reaches past the slab, below and above. */
const POCKET_OVERSHOOT_MM = 0.5;

/** Slab (mm) a lying trough keeps under its round bottom, off the bin floor. */
const TROUGH_FLOOR_MM = 0.8;

export function hasAnyFloorRaise(params: BinParams): boolean {
  return (params.compartments.floorRaises ?? []).some((r) => typeof r === 'number' && r > 0);
}

/**
 * Every raised slab fused into one solid, in cavity-centred coordinates with
 * the box bottom at Z=0. Caller owns the result.
 */
export function buildFloorRaises(
  params: BinParams,
  innerW: number,
  innerD: number,
  floorZ: number,
  interiorHeight: number
): Shape3D | null {
  const raises = resolveFloorRaises(params, floorZ, interiorHeight);
  if (raises.size === 0) return null;

  return withScope((scope: DisposalScope): Shape3D | null => {
    const { cols, rows, cells, thickness } = params.compartments;
    const cellW = innerW / cols;
    const cellD = innerD / rows;
    const half = thickness / 2;
    const idAt = (col: number, row: number): number => cells[row * cols + col];
    const z0 = floorZ - Math.min(FUSE_OVERLAP_MM, floorZ / 2);
    const slabs: Shape3D[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const id = idAt(col, row);
        const raise = raises.get(id);
        if (raise === undefined) continue;
        // Half a divider in where a different compartment is next door, then
        // out by the overlap on every side.
        const x0 =
          -innerW / 2 +
          col * cellW +
          (col > 0 && idAt(col - 1, row) !== id ? half : 0) -
          FUSE_OVERLAP_MM;
        const x1 =
          -innerW / 2 +
          (col + 1) * cellW -
          (col < cols - 1 && idAt(col + 1, row) !== id ? half : 0) +
          FUSE_OVERLAP_MM;
        const y0 =
          -innerD / 2 +
          row * cellD +
          (row > 0 && idAt(col, row - 1) !== id ? half : 0) -
          FUSE_OVERLAP_MM;
        const y1 =
          -innerD / 2 +
          (row + 1) * cellD -
          (row < rows - 1 && idAt(col, row + 1) !== id ? half : 0) +
          FUSE_OVERLAP_MM;
        const height = floorZ + raise - z0;
        slabs.push(
          scope.register(
            box(x1 - x0, y1 - y0, height, {
              at: [(x0 + x1) / 2, (y0 + y1) / 2, z0 + height / 2],
            })
          )
        );
      }
    }
    if (slabs.length === 0) return null;
    const joined =
      slabs.length === 1 ? slabs[0] : scope.register(unwrap(fuseAll(slabs as ValidSolid[])));
    // The cell boxes are square, the cavity's outer corners round: grown into
    // the walls, a corner box would poke out through the bin's rounded skin.
    // Clip to the cavity outline, grown by the same overlap.
    const radius = Math.max(BOX_CORNER_RADIUS - params.wallThickness, 0) + FUSE_OVERLAP_MM;
    const outline = scope.register(
      drawRoundedRectangle(
        innerW + 2 * FUSE_OVERLAP_MM,
        innerD + 2 * FUSE_OVERLAP_MM,
        Math.min(radius, Math.min(innerW, innerD) / 2)
      )
        .sketchOnPlane('XY', z0 - 1)
        .extrude(interiorHeight + 2)
    );
    const fused = scope.register(unwrap(intersect(joined as ValidSolid, outline as ValidSolid)));

    const holders = planHolders(params, innerW, innerD, raises);
    const tools: Shape3D[] = [];
    for (const [id, plan] of holders) {
      const top = floorZ + (raises.get(id) ?? 0);
      for (const tool of pocketTools(plan, floorZ, z0 - POCKET_OVERSHOOT_MM, top)) {
        tools.push(scope.register(tool));
      }
    }
    if (tools.length === 0) return unwrap(clone(fused));
    const cut = unwrap(cutAll(fused, tools as ValidSolid[]));
    return cut === fused ? unwrap(clone(cut)) : cut;
  });
}

/**
 * One tool per pocket. A standing pocket runs from `bottom`, under the slab,
 * to above `top`, so the bin's own floor is its bottom. A trough's round
 * bottom stops {@link TROUGH_FLOOR_MM} above the bin floor instead, since a
 * curve resting on that face would only touch it along a line.
 */
function pocketTools(plan: HolderPlan, floorZ: number, bottom: number, top: number): Shape3D[] {
  const { item, pockets } = plan;
  const height = top + POCKET_OVERSHOOT_MM - bottom;
  const tools: Shape3D[] = [];
  for (const p of pockets) {
    switch (item.shape) {
      case 'rect':
        tools.push(box(p.w, p.d, height, { at: [p.x, p.y, bottom + height / 2] }));
        break;
      case 'round':
        tools.push(cylinder(p.w / 2, height, { at: [p.x, p.y, bottom], axis: [0, 0, 1] }));
        break;
      case 'hex': {
        // drawPolysides takes the corner radius and puts a corner at +Y, so
        // the flats face ±X and `w` is the width across them.
        const prism = sketch(drawPolysides(p.w / Math.sqrt(3), 6), 'XY', bottom).extrude(height);
        tools.push(translate(prism, [p.x, p.y, 0]));
        prism.delete();
        break;
      }
      case 'trough':
        tools.push(...troughTools(p, floorZ + TROUGH_FLOOR_MM, top + POCKET_OVERSHOOT_MM));
        break;
    }
  }
  return tools;
}

/** A round-bottomed channel the length of the pocket's longer side. */
function troughTools(pocket: HolderPocket, floorTop: number, toolTop: number): Shape3D[] {
  const alongX = pocket.w >= pocket.d;
  const length = alongX ? pocket.w : pocket.d;
  const radius = (alongX ? pocket.d : pocket.w) / 2;
  if (toolTop - POCKET_OVERSHOOT_MM <= floorTop) return [];
  const axisZ = floorTop + radius;
  const start: [number, number, number] = alongX
    ? [pocket.x - length / 2, pocket.y, axisZ]
    : [pocket.x, pocket.y - length / 2, axisZ];
  const tools: Shape3D[] = [
    cylinder(radius, length, { at: start, axis: alongX ? [1, 0, 0] : [0, 1, 0] }),
  ];
  // Straight sides from the axis up when the channel is deeper than its radius.
  if (axisZ < toolTop) {
    const h = toolTop - axisZ;
    tools.push(
      box(alongX ? length : 2 * radius, alongX ? 2 * radius : length, h, {
        at: [pocket.x, pocket.y, axisZ + h / 2],
      })
    );
  }
  return tools;
}

export const floorRaiseFeature: FeatureBuilder = {
  name: 'floorRaises',
  tag: FeatureTag.BASE,
  target: 'fuse',
  // Needs a floor to stand on and compartments to stand in: the open-floor
  // lite mode and the Nesting body both replace the floor this is measured
  // from, and slotted or solid interiors have no compartment grid.
  shouldBuild: (ctx) =>
    ctx.params.style === 'standard' &&
    !ctx.dimensions.solid &&
    !ctx.dimensions.isSlotted &&
    !ctx.dimensions.liteFloorOpen &&
    !isNestingBase(ctx.params.base) &&
    hasAnyFloorRaise(ctx.params),
  cacheKey: (ctx) => {
    const { dimensions: dim, params } = ctx;
    return compactKey(
      buildCacheKey(
        'v3',
        dim.shellKey,
        quantize(params.wallThickness),
        quantize(dim.innerW),
        quantize(dim.innerD),
        quantize(dim.floorThickness),
        quantize(dim.interiorHeight),
        quantize(params.compartments.thickness),
        params.compartments.cols,
        params.compartments.rows,
        params.compartments.cells.join(','),
        stableSerialize(params.compartments.floorRaises ?? []),
        stableSerialize(params.compartments.holders ?? []),
        quantize(interiorFilletRadiusMm(params)),
        stableSerialize(params.compartments.dividerOverrides ?? [])
      )
    );
  },
  build: (ctx) => {
    const slab = buildFloorRaises(
      ctx.params,
      ctx.dimensions.innerW,
      ctx.dimensions.innerD,
      ctx.dimensions.floorThickness,
      ctx.dimensions.interiorHeight
    );
    return slab ? [slab] : null;
  },
};
