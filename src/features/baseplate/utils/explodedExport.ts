/**
 * One-file export of a multi-part baseplate, laid out as an exploded view.
 *
 * Every body piece sits at its assembled spot with a gap between columns and
 * rows, detached rails step outward from their side, and connector keys line
 * up in front. No two parts touch, so a slicer's "split to objects" turns an
 * STL into the separate parts; a 3MF carries each part as its own object.
 */

import { buildSTLBuffer, export3MFMultiObject } from '@/shared/generation/export';
import type { ThreeMFPrintSettings } from '@/shared/generation/export';
import type { MarginPiece, ResolvedBaseplateParams } from '@/shared/types/bin';
import type { GenerationBridge } from '@/shared/generation/bridge';
import { parseSTLBinary } from '@/shared/generation/stlParser';
import { buildThreeMFPrintSettings } from '@/shared/generation/stlTo3mf';
import type { SlicerSettings } from '@/shared/generation/stlTo3mf';
import { isErr, getUserMessage } from '@/core/result';
import { EXPLODE_GAP_MM } from '../constants';
import { buildExportCacheKey, getOrExport } from './exportCache';
import type { BaseplatePiece, BaseplateTiling } from '../types/tiling';
import { computePiecePlacement } from '../components/BaseplatePreview/pieceLayout';
import { MARGIN_OUTWARD_GAP_MM, SIDE_NORMAL } from '../components/BaseplatePreview/railPosition';

export interface Soup {
  readonly vertices: Float32Array;
  readonly normals: Float32Array;
}

export type ExplodedPiece = Pick<
  BaseplatePiece,
  | 'label'
  | 'col'
  | 'row'
  | 'gridOffsetX'
  | 'gridOffsetY'
  | 'widthUnits'
  | 'depthUnits'
  | 'placementRotationDeg'
>;

export interface ExplodedExportInput {
  readonly plates: readonly { readonly piece: ExplodedPiece; readonly soup: Soup }[];
  readonly rails: readonly { readonly margin: MarginPiece; readonly soup: Soup }[];
  readonly key?: { readonly soup: Soup; readonly count: number };
  readonly totalWidthUnits: number;
  readonly totalDepthUnits: number;
  readonly gridUnitMm: number;
  readonly gridUnitMmY: number;
}

export interface ExplodedPart {
  readonly name: string;
  readonly soup: Soup;
}

/** Smallest clearance between two parts' footprints, in mm. */
const MIN_CLEARANCE_MM = 2;
/** How much the gaps grow per try when parts still touch (a long tongue). */
const GAP_STEP_MM = 4;
const MAX_TRIES = 25;
const KEY_SPACING_MM = 4;

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
}

function bounds(vertices: Float32Array): Box {
  const box: Box = {
    minX: Infinity,
    maxX: -Infinity,
    minY: Infinity,
    maxY: -Infinity,
    minZ: Infinity,
  };
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i];
    const y = vertices[i + 1];
    const z = vertices[i + 2];
    if (x < box.minX) box.minX = x;
    if (x > box.maxX) box.maxX = x;
    if (y < box.minY) box.minY = y;
    if (y > box.maxY) box.maxY = y;
    if (z < box.minZ) box.minZ = z;
  }
  return box;
}

/** A copy turned 180° about Z (when asked) and moved by dx, dy, dz. */
function place(soup: Soup, dx: number, dy: number, dz: number, turn: boolean): Soup {
  const vertices = new Float32Array(soup.vertices.length);
  const normals = new Float32Array(soup.normals.length);
  const s = turn ? -1 : 1;
  for (let i = 0; i < vertices.length; i += 3) {
    vertices[i] = s * soup.vertices[i] + dx;
    vertices[i + 1] = s * soup.vertices[i + 1] + dy;
    vertices[i + 2] = soup.vertices[i + 2] + dz;
    normals[i] = s * soup.normals[i];
    normals[i + 1] = s * soup.normals[i + 1];
    normals[i + 2] = soup.normals[i + 2];
  }
  return { vertices, normals };
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.minX < b.maxX + MIN_CLEARANCE_MM &&
    b.minX < a.maxX + MIN_CLEARANCE_MM &&
    a.minY < b.maxY + MIN_CLEARANCE_MM &&
    b.minY < a.maxY + MIN_CLEARANCE_MM
  );
}

function shifted(box: Box, dx: number, dy: number, turn: boolean): Box {
  const x0 = turn ? -box.maxX : box.minX;
  const x1 = turn ? -box.minX : box.maxX;
  const y0 = turn ? -box.maxY : box.minY;
  const y1 = turn ? -box.minY : box.maxY;
  return { minX: x0 + dx, maxX: x1 + dx, minY: y0 + dy, maxY: y1 + dy, minZ: box.minZ };
}

/**
 * The parts at their exploded spots, each resting on Z = 0. The gaps start at
 * the preview's and widen until no two footprints come within
 * {@link MIN_CLEARANCE_MM}: tongues and rail grooves reach into the gap.
 */
export function layoutExplodedParts(input: ExplodedExportInput): ExplodedPart[] {
  const { plates, rails, key, gridUnitMm, gridUnitMmY } = input;
  const opts = {
    totalWidthMm: input.totalWidthUnits * gridUnitMm,
    totalDepthMm: input.totalDepthUnits * gridUnitMmY,
    gridUnitMm,
    gridUnitMmY,
    splitViewMode: 'assembled' as const,
  };
  const plateBoxes = plates.map((p) => bounds(p.soup.vertices));
  const railBoxes = rails.map((r) => bounds(r.soup.vertices));

  const spots = (gap: number, outward: number) => {
    const plateSpots = plates.map(({ piece }, i) => {
      const at = computePiecePlacement(
        {
          offsetX: piece.gridOffsetX,
          offsetY: piece.gridOffsetY,
          widthUnits: piece.widthUnits,
          depthUnits: piece.depthUnits,
          col: piece.col,
          row: piece.row,
        },
        opts
      );
      const turn = piece.placementRotationDeg === 180;
      const x = at.x + piece.col * gap;
      const y = at.y + piece.row * gap;
      return { x, y, turn, box: shifted(plateBoxes[i], x, y, turn) };
    });
    const railSpots = rails.map(({ margin }, i) => {
      const [nx, ny] = SIDE_NORMAL[margin.side];
      const x = margin.worldOffsetMm.x + margin.col * gap + nx * outward;
      const y = margin.worldOffsetMm.y + margin.row * gap + ny * outward;
      return { x, y, turn: false, box: shifted(railBoxes[i], x, y, false) };
    });
    return [...plateSpots, ...railSpots];
  };

  let gap = EXPLODE_GAP_MM;
  let outward = MARGIN_OUTWARD_GAP_MM;
  let placed = spots(gap, outward);
  for (let tries = 0; tries < MAX_TRIES; tries++) {
    const clash = placed.some((a, i) => placed.some((b, j) => j > i && overlaps(a.box, b.box)));
    if (!clash) break;
    gap += GAP_STEP_MM;
    outward += GAP_STEP_MM;
    placed = spots(gap, outward);
  }

  const sources = [
    ...plates.map((p) => ({ name: p.piece.label, soup: p.soup })),
    ...rails.map((r) => ({ name: r.margin.id, soup: r.soup })),
  ];
  const parts: ExplodedPart[] = sources.map((source, i) => {
    const spot = placed[i];
    return {
      name: source.name,
      soup: place(source.soup, spot.x, spot.y, -spot.box.minZ, spot.turn),
    };
  });

  if (key && key.count > 0) {
    // A row of keys in front of the plate, wrapping at its width.
    const keyBox = bounds(key.soup.vertices);
    const keyW = keyBox.maxX - keyBox.minX;
    const keyD = keyBox.maxY - keyBox.minY;
    const minX = Math.min(...placed.map((p) => p.box.minX));
    const maxX = Math.max(...placed.map((p) => p.box.maxX));
    const frontY = Math.min(...placed.map((p) => p.box.minY));
    const perRow = Math.max(
      1,
      Math.floor((maxX - minX + KEY_SPACING_MM) / (keyW + KEY_SPACING_MM))
    );
    for (let k = 0; k < key.count; k++) {
      const col = k % perRow;
      const row = Math.floor(k / perRow);
      const x = minX + col * (keyW + KEY_SPACING_MM) - keyBox.minX;
      const y = frontY - EXPLODE_GAP_MM - (row + 1) * keyD - row * KEY_SPACING_MM - keyBox.minY;
      parts.push({ name: `key_${k + 1}`, soup: place(key.soup, x, y, -keyBox.minZ, false) });
    }
  }
  return parts;
}

/** The exploded parts as one STL (one shell per part) or one 3MF (one object per part). */
export function buildExplodedFile(
  input: ExplodedExportInput,
  format: 'stl' | '3mf',
  name: string,
  printSettings: ThreeMFPrintSettings
): Blob {
  const parts = layoutExplodedParts(input);
  if (format === '3mf') {
    return export3MFMultiObject(
      parts.map((part) => ({
        vertices: part.soup.vertices,
        normals: part.soup.normals,
        name: `${name}_${part.name}`,
      })),
      { name, printSettings }
    );
  }
  const total = parts.reduce((sum, part) => sum + part.soup.vertices.length, 0);
  const vertices = new Float32Array(total);
  const normals = new Float32Array(total);
  let at = 0;
  for (const part of parts) {
    vertices.set(part.soup.vertices, at);
    normals.set(part.soup.normals, at);
    at += part.soup.vertices.length;
  }
  return new Blob([buildSTLBuffer(vertices, normals, name)], { type: 'application/sla' });
}

/** An unsplit plate as the one piece of its exploded file. */
export function wholePlatePiece(
  tiling: Pick<BaseplateTiling, 'totalWidthUnits' | 'totalDepthUnits'>
): ExplodedPiece {
  return {
    label: 'body',
    col: 0,
    row: 0,
    gridOffsetX: 0,
    gridOffsetY: 0,
    widthUnits: tiling.totalWidthUnits,
    depthUnits: tiling.totalDepthUnits,
    placementRotationDeg: 0,
  };
}

export interface ExplodedSources {
  readonly plates: ExplodedExportInput['plates'];
  readonly margins: readonly MarginPiece[];
  readonly keyCount: number;
  readonly tiling: Pick<BaseplateTiling, 'totalWidthUnits' | 'totalDepthUnits'>;
  /** The plate's params: rails and keys are exported from them. */
  readonly params: ResolvedBaseplateParams;
  readonly nozzleMm: number;
}

function parseSoup(data: ArrayBuffer): Soup {
  const parsed = parseSTLBinary(data);
  if (isErr(parsed)) throw new Error(getUserMessage(parsed.error));
  return parsed.value;
}

/** Export the rails and keys the plate needs, then pack every part into one file. */
export async function packExplodedFile(
  bridge: Pick<GenerationBridge, 'exportMargin' | 'exportConnectorKey'>,
  src: ExplodedSources,
  format: 'stl' | '3mf',
  name: string,
  printSettings: SlicerSettings
): Promise<ArrayBuffer> {
  const { params } = src;
  const rails: { margin: MarginPiece; soup: Soup }[] = [];
  for (const margin of src.margins) {
    const r = await bridge.exportMargin(params, margin, 'stl');
    rails.push({ margin, soup: parseSoup(r.data) });
  }
  let key: ExplodedExportInput['key'];
  if (src.keyCount > 0) {
    const data = await getOrExport(
      `connkey|${buildExportCacheKey(params, 'stl', src.nozzleMm)}`,
      () => bridge.exportConnectorKey(params, 'stl').then((r) => r.data)
    );
    key = { soup: parseSoup(data), count: src.keyCount };
  }
  const blob = buildExplodedFile(
    {
      plates: src.plates,
      rails,
      key,
      totalWidthUnits: src.tiling.totalWidthUnits,
      totalDepthUnits: src.tiling.totalDepthUnits,
      gridUnitMm: params.gridUnitMm,
      gridUnitMmY: params.gridUnitMmY ?? params.gridUnitMm,
    },
    format,
    name,
    buildThreeMFPrintSettings(printSettings)
  );
  return blob.arrayBuffer();
}
