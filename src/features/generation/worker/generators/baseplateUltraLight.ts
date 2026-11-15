/**
 * Ultra light plate (eco level 'ultra'), after TUDC's Ultra light grid.
 *
 * Only a zone round each grid node keeps the socket profile: 20 mm square up
 * to the top of the profile's vertical band, narrowing to 13 mm at the top, and
 * there only as a thin shell beside each pocket. The pocket's bottom lip is
 * opened up to that vertical band, so the shells stand straight on the bed.
 * Between the zones each inner grid line drops to a low rib that forks into the
 * two shells beside it (TUDC's Y connector); under each inner node a low X
 * brace ties the four corner shells together in the first layers. An outer
 * edge keeps a low rim that ramps up into the zones, where it stands full
 * height. The top of the plate is cut down by {@link ULTRA_TOP_CUT_MM}, where
 * the shells would otherwise run together into solid joints.
 *
 * Built per cell: the cell's pitch square with its pocket, less a cutter that
 * is the square less what stays. Within its pitch square a point is nearest
 * that cell's own pocket, so "beside a pocket" is "beside this pocket", and
 * every full cell of a plate shares one part; the parts are then fused. Each
 * part a node or a grid line shares is kept by both cells, so neighbours agree
 * on it.
 */

import {
  box,
  clone,
  cut,
  cutAll,
  draw,
  drawRoundedRectangle,
  fuseAll,
  intersect,
  rotate,
  translate,
  unwrap,
} from 'brepjs';
import type { Shape3D, Sketch } from 'brepjs';
import type { BaseplateEdges, ResolvedBaseplateParams } from '@/shared/types/bin';
import { edgeCarriesSlot, hasAllEdgeSlots } from '@/shared/types/bin';
import {
  COPLANAR_MARGIN,
  forEachCell,
  PLATE_BIG_TAPER,
  PLATE_SMALL_TAPER,
  pocketCornerRadius,
  safeSectionRect,
} from './generatorTypes';
import { getPocketTemplate } from './baseplatePockets';
import { buildCacheKey, quantize } from './cacheKeyUtils';
import { ultraCellPartCache } from './baseplateCaches';

/** Shell, rib, rim and brace width: two perimeters of a 0.4–0.45 mm line. */
export const ULTRA_WALL_MM = 0.9;
/** Rib and rim height above the plate bottom (TUDC: 40 % of its 4.5 mm grid). */
export const ULTRA_RIB_HEIGHT_MM = 1.8;
/** Taken off the top of the plate (TUDC: 5.0 mm grid down to 3.9 mm). */
export const ULTRA_TOP_CUT_MM = 1.1;
/** Height of the X brace under each inner node: the first layers only. */
export const ULTRA_BRACE_HEIGHT_MM = 0.5;
/** Half the side of the zone round each node, at its base and at the top. */
export const ULTRA_ZONE_HALF_MM = 10;
const ZONE_TOP_HALF_MM = 6.5;
const ZONE_RADIUS_MM = 1.6;
/** Gap between a zone and the rib end, which the Y connector bridges. */
const RIB_END_CLEARANCE_MM = 5;
/**
 * Y connector: stem into the rib, stem length, branch reach and spread. The
 * branches end 0.6 mm inside the zone (TUDC's 5.2 mm reach stops 0.2 mm in), so
 * each branch has a real overlap with its shell.
 */
const Y_STEM_OVERLAP_MM = 1.6;
const Y_STEM_MM = 2;
const Y_REACH_MM = 5.6;
const Y_SPREAD_MM = 1.8;
/** Length over which an outer rim climbs into a zone. */
const RIM_RAMP_MM = 2;
/** Shortest rib worth the Y connectors; a shorter gap keeps the shells running. */
const MIN_RIB_MM = 1;
/** Half the width of the shell band kept along a grid line too short for a rib. */
const BRIDGE_HALF_MM = 3;
/**
 * Solid kept round a connector node: along the edge, past a paired tongue and
 * groove 4 mm either side of the node with their 1.9 mm half heads; and in
 * from the edge, past the 1.5 mm reach of a groove with wall to spare.
 */
const CONNECTOR_KEEP_ALONG_MM = 7;
const CONNECTOR_KEEP_DEPTH_MM = 4.5;

/** Which sides of a cell lie on the plate's outer grid edge. */
export interface UltraOuterSides {
  readonly left: boolean;
  readonly right: boolean;
  readonly front: boolean;
  readonly back: boolean;
}

export interface UltraCellCutterInput {
  readonly cellW: number;
  readonly cellD: number;
  /** Plate height; the plate spans Z = -totalHeight to 0. */
  readonly totalHeight: number;
  readonly profileHeight: number;
  readonly outer: UltraOuterSides;
  /** Outer sides that carry connectors at their grid nodes, kept solid there. */
  readonly connectorSides: UltraOuterSides;
}

const cellKey = (input: UltraCellCutterInput): string =>
  buildCacheKey(
    'ultra-part-v1',
    quantize(input.cellW),
    quantize(input.cellD),
    quantize(input.totalHeight),
    quantize(input.profileHeight),
    ...[input.outer, input.connectorSides].flatMap((s) => [s.left, s.right, s.front, s.back])
  );

/**
 * One cell's share of the ultra light grid, centered on the origin: the cell's
 * pitch square with its pocket, less the cutter. Cached per kind of cell; the
 * caller owns the clone.
 */
function getUltraCellPart(input: UltraCellCutterInput): Shape3D {
  const key = cellKey(input);
  let part = ultraCellPartCache.get(key);
  if (part === undefined) {
    const { cellW, cellD, totalHeight, profileHeight } = input;
    const square = box(cellW, cellD, totalHeight, { at: [0, 0, -totalHeight / 2] });
    const pocket = getPocketTemplate(cellW, cellD, true, 0, profileHeight);
    const cell = unwrap(cut(square, pocket));
    square.delete();
    pocket.delete();
    const cutter = buildUltraCellCutter(input);
    part = unwrap(cut(cell, cutter));
    cell.delete();
    cutter.delete();
    ultraCellPartCache.set(key, part);
  }
  return unwrap(clone(part));
}

interface PlacedCell {
  readonly input: UltraCellCutterInput;
  readonly x: number;
  readonly y: number;
}

/** Copies of `shapes` fused into one solid; consumes them. */
function fuseConsuming(shapes: Shape3D[]): Shape3D {
  if (shapes.length === 1) return shapes[0];
  const fused = unwrap(fuseAll(shapes));
  for (const shape of shapes) shape.delete();
  return fused;
}

/**
 * One row of the grid, centered on y = 0. A plate's inner rows are alike, so
 * a row is fused once per kind and copied, and an edit that keeps the width
 * (depth, padding front and back) reuses every row.
 */
function getUltraRow(cells: readonly PlacedCell[]): Shape3D {
  const key = buildCacheKey(
    'ultra-row-v1',
    ...cells.flatMap((cell) => [cellKey(cell.input), quantize(cell.x)])
  );
  let row = ultraCellPartCache.get(key);
  if (row === undefined) {
    row = fuseConsuming(
      cells.map((cell) => {
        const part = getUltraCellPart(cell.input);
        const placed = translate(part, [cell.x, 0, 0]);
        part.delete();
        return placed;
      })
    );
    ultraCellPartCache.set(key, row);
  }
  return unwrap(clone(row));
}

/**
 * The ultra light grid: every cell's share, fused. Building each kind of cell
 * once and fusing the copies is several times faster than cutting the same
 * cells out of a pocketed slab, where every cutter meets the whole plate; and
 * fusing row by row lets alike rows share one fuse.
 * The plate spans Z = -totalHeight to 0, the grid centered on the origin.
 */
export function buildUltraGrid(
  params: ResolvedBaseplateParams,
  totalHeight: number,
  profileHeight: number
): Shape3D {
  const pitchX = params.gridUnitMm;
  const pitchY = params.gridUnitMmY ?? pitchX;
  const halfW = (params.width * pitchX) / 2;
  const halfD = (params.depth * pitchY) / 2;
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-6;
  const allEdgeSlots = hasAllEdgeSlots(params);
  const carries = (side: keyof BaseplateEdges, paddingMm: number): boolean =>
    params.connectorNubs === true &&
    edgeCarriesSlot(params.edges?.[side] ?? 'exterior', allEdgeSlots, paddingMm);
  const connectorEdges = {
    left: carries('left', params.paddingLeft),
    right: carries('right', params.paddingRight),
    front: carries('front', params.paddingFront),
    back: carries('back', params.paddingBack),
  };
  const rows = new Map<number, PlacedCell[]>();
  forEachCell(
    params.width,
    params.depth,
    (cell) => {
      const cellW = cell.widthUnits * pitchX;
      const cellD = cell.depthUnits * pitchY;
      const outer = {
        left: near(cell.centerX - cellW / 2, -halfW),
        right: near(cell.centerX + cellW / 2, halfW),
        front: near(cell.centerY - cellD / 2, -halfD),
        back: near(cell.centerY + cellD / 2, halfD),
      };
      const rowY = quantize(cell.centerY);
      const row = rows.get(rowY) ?? [];
      row.push({
        input: {
          cellW,
          cellD,
          totalHeight,
          profileHeight,
          outer,
          connectorSides: {
            left: outer.left && connectorEdges.left,
            right: outer.right && connectorEdges.right,
            front: outer.front && connectorEdges.front,
            back: outer.back && connectorEdges.back,
          },
        },
        x: cell.centerX,
        y: cell.centerY,
      });
      rows.set(rowY, row);
    },
    {
      fractionalEdgeX: params.fractionalEdgeX,
      fractionalEdgeY: params.fractionalEdgeY,
      gridUnitMm: { x: pitchX, y: pitchY },
    }
  );
  return fuseConsuming(
    [...rows.values()].map((cells) => {
      cells.sort((a, b) => a.x - b.x);
      const row = getUltraRow(cells);
      const placed = translate(row, [0, cells[0].y, 0]);
      row.delete();
      return placed;
    })
  );
}
/**
 * A wall `width` wide standing on `z0`, from (x0, y0) to (x1, y1), `h0` tall
 * at its start and `h1` at its end: ribs, ramps, Y branches and braces.
 */
function wallArm(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  width: number,
  z0: number,
  h0: number,
  h1: number
): Shape3D {
  const length = Math.hypot(x1 - x0, y1 - y0);
  // Drawn on YZ (along = Y, height = Z), extruded along X for the width, then
  // turned so the run lies along X before it is aimed at its end point.
  const side = draw([0, 0]).lineTo([length, 0]).lineTo([length, h1]).lineTo([0, h0]).close();
  const slab = side.sketchOnPlane('YZ').extrude(width);
  const alongX = rotate(slab, -90, { axis: [0, 0, 1] });
  slab.delete();
  const centred = translate(alongX, [0, width / 2, z0]);
  alongX.delete();
  const aimed = rotate(centred, (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, {
    axis: [0, 0, 1],
  });
  centred.delete();
  const placed = translate(aimed, [x0, y0, 0]);
  aimed.delete();
  return placed;
}

function buildUltraCellCutter({
  cellW,
  cellD,
  totalHeight,
  profileHeight,
  outer,
  connectorSides,
}: UltraCellCutterInput): Shape3D {
  const w = ULTRA_WALL_MM;
  const m = COPLANAR_MARGIN;
  const h = totalHeight;
  const bottom = -h;
  const top = -ULTRA_TOP_CUT_MM;
  // Height above the bed of the top of the profile's vertical band: where the
  // zones start to narrow and how high the Y connectors and rim ramps reach.
  const bandTop = h - PLATE_BIG_TAPER;
  const ribH = Math.min(ULTRA_RIB_HEIGHT_MM, bandTop);
  const footBottom = bottom - m;
  const footH = (z: number): number => z - footBottom;

  // The pocket, opened straight down below its vertical band, offset outward
  // by the shell width.
  const cornerR = pocketCornerRadius(cellW, cellD);
  const section = (z: number, inset: number): Sketch => {
    const rect = safeSectionRect(cellW - 2 * inset, cellD - 2 * inset, cornerR - inset);
    return drawRoundedRectangle(rect.width, rect.depth, rect.radius).sketchOnPlane(
      'XY',
      z
    ) as Sketch;
  };
  const bandBottom = -(profileHeight - PLATE_SMALL_TAPER);
  const shellOutline = section(m, -w).loftWith(
    [
      section(0, -w),
      section(-PLATE_BIG_TAPER, PLATE_BIG_TAPER - w),
      section(bandBottom, PLATE_BIG_TAPER - w),
      section(footBottom, PLATE_BIG_TAPER - w),
    ],
    { ruled: true }
  );
  // The pocket's bottom lip goes: its opening matches the vertical band, a
  // hair wider so the cut does not share the band's faces.
  const openingInset = PLATE_BIG_TAPER - 0.025;
  const openingRect = safeSectionRect(
    cellW - 2 * openingInset,
    cellD - 2 * openingInset,
    cornerR - openingInset
  );
  const opening = (
    drawRoundedRectangle(openingRect.width, openingRect.depth, openingRect.radius).sketchOnPlane(
      'XY',
      footBottom
    ) as Sketch
  ).extrude(bandBottom - footBottom);

  type Side = {
    readonly along: 'x' | 'y';
    readonly line: number;
    readonly inward: -1 | 1;
    readonly isOuter: boolean;
    readonly length: number;
    readonly connectors: boolean;
  };
  const sides: Side[] = [
    {
      along: 'x',
      line: -cellD / 2,
      inward: 1,
      isOuter: outer.front,
      length: cellW,
      connectors: connectorSides.front,
    },
    {
      along: 'x',
      line: cellD / 2,
      inward: -1,
      isOuter: outer.back,
      length: cellW,
      connectors: connectorSides.back,
    },
    {
      along: 'y',
      line: -cellW / 2,
      inward: 1,
      isOuter: outer.left,
      length: cellD,
      connectors: connectorSides.left,
    },
    {
      along: 'y',
      line: cellW / 2,
      inward: -1,
      isOuter: outer.right,
      length: cellD,
      connectors: connectorSides.right,
    },
  ];
  /** A point `a` along a side and `b` across it, in the cell frame. */
  const xy = (s: Side, a: number, b: number): [number, number] =>
    s.along === 'x' ? [a, b] : [b, a];
  const sideBox = (
    s: Side,
    a: number,
    b: number,
    lenA: number,
    lenB: number,
    z0: number,
    z1: number
  ) => {
    const [x, y] = xy(s, a, b);
    const [sx, sy] = xy(s, lenA, lenB);
    return box(sx, sy, z1 - z0, { at: [x, y, (z0 + z1) / 2] });
  };
  const gapOf = (s: Side): number => s.length - 2 * Math.min(ULTRA_ZONE_HALF_MM, s.length / 2);
  const ribLengthOf = (s: Side): number => gapOf(s) - 2 * RIB_END_CLEARANCE_MM;

  // Zones: one per corner node, narrowing above the vertical band; and along a
  // grid line too short for a rib, a band that carries the shells across.
  const zoneSide = 2 * ULTRA_ZONE_HALF_MM;
  const zoneTop = 2 * ZONE_TOP_HALF_MM;
  const zoneSection = (z: number, size: number): Sketch =>
    drawRoundedRectangle(size, size, ZONE_RADIUS_MM).sketchOnPlane('XY', z) as Sketch;
  const zonePieces: Shape3D[] = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const zone = zoneSection(footBottom, zoneSide).loftWith(
        [zoneSection(-PLATE_BIG_TAPER, zoneSide), zoneSection(top, zoneTop)],
        { ruled: true }
      );
      zonePieces.push(translate(zone, [(sx * cellW) / 2, (sy * cellD) / 2, 0]));
      zone.delete();
    }
  }
  for (const s of sides) {
    if (s.isOuter ? gapOf(s) > 2 * RIM_RAMP_MM : ribLengthOf(s) >= MIN_RIB_MM) continue;
    zonePieces.push(sideBox(s, 0, s.line, s.length + 2 * m, 2 * BRIDGE_HALF_MM, footBottom, top));
  }
  const zones = unwrap(fuseAll(zonePieces));
  for (const piece of zonePieces) piece.delete();

  // An outer edge stands full height, 0.9 mm thick, inside the zones.
  const outerStrips = sides
    .filter((s) => s.isOuter)
    .map((s) =>
      sideBox(s, 0, s.line + (s.inward * (w - m)) / 2, s.length + 2 * m, w + m, footBottom, m)
    );
  const zoneMaterial =
    outerStrips.length > 0 ? unwrap(fuseAll([shellOutline, ...outerStrips])) : shellOutline;
  if (zoneMaterial !== shellOutline) {
    shellOutline.delete();
    for (const strip of outerStrips) strip.delete();
  }
  const inZones = unwrap(intersect(zoneMaterial, zones));
  zoneMaterial.delete();
  zones.delete();
  const shells = unwrap(cut(inZones, opening));
  inZones.delete();
  opening.delete();

  const kept: Shape3D[] = [shells];
  const arm = (s: Side, a0: number, b0: number, a1: number, b1: number, h0: number, h1: number) => {
    const [x0, y0] = xy(s, a0, b0);
    const [x1, y1] = xy(s, a1, b1);
    kept.push(wallArm(x0, y0, x1, y1, w, footBottom, footH(bottom + h0), footH(bottom + h1)));
  };

  for (const s of sides) {
    const gap = gapOf(s);
    if (s.isOuter) {
      // A low rim the length of the edge, climbing into the zones at both ends.
      const rimLine = s.line + (s.inward * w) / 2;
      kept.push(sideBox(s, 0, rimLine, s.length + 2 * m, w, footBottom, bottom + ribH));
      if (gap > 2 * RIM_RAMP_MM) {
        for (const end of [-1, 1]) {
          const zoneEdge = (end * gap) / 2;
          arm(s, zoneEdge - end * RIM_RAMP_MM, rimLine, zoneEdge + end * w, rimLine, ribH, bandTop);
        }
      }
    } else {
      const ribLength = ribLengthOf(s);
      if (ribLength >= MIN_RIB_MM) {
        arm(s, -ribLength / 2, s.line, ribLength / 2, s.line, ribH, ribH);
        for (const end of [-1, 1]) {
          // The Y: a stem climbing from the rib end, then two branches into the
          // shells either side of the grid line.
          const anchor = (end * ribLength) / 2;
          const split = anchor + end * Y_STEM_MM;
          const reach = anchor + end * Y_REACH_MM;
          arm(s, anchor - end * Y_STEM_OVERLAP_MM, s.line, split, s.line, ribH, bandTop);
          for (const spread of [-1, 1]) {
            arm(s, split, s.line, reach, s.line + spread * Y_SPREAD_MM, bandTop, bandTop);
          }
        }
      }
    }
    if (s.connectors) {
      // The connector's tongue or groove at each node needs the plate whole.
      for (const end of [-1, 1]) {
        kept.push(
          sideBox(
            s,
            (end * s.length) / 2,
            s.line + (s.inward * (CONNECTOR_KEEP_DEPTH_MM - 2 * m)) / 2,
            2 * CONNECTOR_KEEP_ALONG_MM,
            CONNECTOR_KEEP_DEPTH_MM + 2 * m,
            footBottom,
            top
          )
        );
      }
    }
  }

  // The X brace under each inner node: this cell's quarter of it runs from the
  // node toward the cell's centre into the corner of the shell.
  const braceReach = PLATE_BIG_TAPER + 0.5;
  const isOuter = { x: [outer.left, outer.right], y: [outer.front, outer.back] };
  for (const [ix, sx] of [-1, 1].entries()) {
    for (const [iy, sy] of [-1, 1].entries()) {
      if (isOuter.x[ix] || isOuter.y[iy]) continue;
      const nodeX = (sx * cellW) / 2;
      const nodeY = (sy * cellD) / 2;
      const overshoot = w / 2;
      kept.push(
        wallArm(
          nodeX + sx * overshoot,
          nodeY + sy * overshoot,
          nodeX - sx * braceReach,
          nodeY - sy * braceReach,
          w,
          footBottom,
          footH(bottom + ULTRA_BRACE_HEIGHT_MM),
          footH(bottom + ULTRA_BRACE_HEIGHT_MM)
        )
      );
    }
  }

  const square = box(cellW, cellD, h + 2 * m, { at: [0, 0, -h / 2] });
  const cutter = unwrap(cutAll(square, kept));
  square.delete();
  for (const shape of kept) shape.delete();
  return cutter;
}
