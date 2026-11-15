// @vitest-environment node
/**
 * Ribbed drawer margins on the real BREP build: the padding opens into cells
 * behind a full-height rim and ribs, on the plate and on a detached rail.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { ResolvedBaseplateParams, MarginPiece } from '@/shared/types/bin';
import { initTestKernel } from '@/test/initTestKernel';
import {
  assertStructurallyValid,
  assertWatertight,
  boundingBox,
  isSolidThrough,
  meshVolume,
} from './__kernel-tests__/meshAssertions';
import type { MeshData } from '../../bridge/types';
import { mm } from '@/core/types';
import { planBaseplateScrewHoles, screwPlacementFor } from '@/shared/generation/screwHolePlacement';
import { resolveScrewHeadDiameter } from '@/shared/generation/screwHolePlan';

type GenerateFn = (
  params: ResolvedBaseplateParams,
  onProgress: (stage: string, progress: number) => void,
  forExport: boolean
) => MeshData;
type GenerateMarginFn = (
  params: ResolvedBaseplateParams,
  margin: MarginPiece,
  forExport: boolean
) => MeshData;

let generateBaseplate: GenerateFn;
let generateMargin: GenerateMarginFn;

beforeAll(async () => {
  await initTestKernel();
  generateBaseplate = (await import('./baseplateGenerator')).generateBaseplate;
  generateMargin = (await import('./baseplateMargin')).generateMargin;
}, 60000);

const noop = (): void => {};
const PAD = 20;

/** Solid from the bottom face to the top face along a vertical line. */
function fullHeight(result: MeshData, x: number, y: number): boolean {
  const box = boundingBox(result.vertices);
  return isSolidThrough(result, x, y, box.minZ + 0.05, box.maxZ - 0.05);
}

const plate = (overrides: Partial<ResolvedBaseplateParams> = {}): ResolvedBaseplateParams => ({
  width: 3,
  depth: 3,
  gridUnitMm: 42,
  magnetHoles: false,
  magnetDiameter: 6.5,
  magnetDepth: 2.4,
  paddingLeft: PAD,
  paddingRight: PAD,
  paddingFront: PAD,
  paddingBack: PAD,
  fractionalEdgeX: 'end',
  fractionalEdgeY: 'end',
  lightweight: true,
  ...overrides,
});

describe('ribbed drawer margins', () => {
  it('removes most of the padding and keeps the plate height and footprint', () => {
    const solid = generateBaseplate(plate(), noop, true);
    const ribbed = generateBaseplate(plate({ marginInfill: 'ribbed' }), noop, true);
    const bare = generateBaseplate(
      plate({ paddingLeft: 0, paddingRight: 0, paddingFront: 0, paddingBack: 0 }),
      noop,
      true
    );
    assertStructurallyValid(ribbed, 'ribbed margin');
    assertWatertight(ribbed, 'ribbed margin');

    const padding = meshVolume(solid) - meshVolume(bare);
    const removed = meshVolume(solid) - meshVolume(ribbed);
    expect(removed / padding).toBeGreaterThan(0.6);

    const a = boundingBox(solid.vertices);
    const b = boundingBox(ribbed.vertices);
    expect(b.maxZ).toBeCloseTo(a.maxZ, 3);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxX - a.minX, 3);
    expect(b.maxY - b.minY).toBeCloseTo(a.maxY - a.minY, 3);
  });

  it('keeps the rim and the ribs on the grid lines at full height', () => {
    const ribbed = generateBaseplate(plate({ marginInfill: 'ribbed' }), noop, true);
    const halfW = 63;
    // Rim, 0.6 mm in from the left edge, beside the middle cell.
    expect(fullHeight(ribbed, -halfW - PAD + 0.6, 10)).toBe(true);
    // Rib on the grid line y = 21 inside the left band.
    expect(fullHeight(ribbed, -halfW - PAD / 2, 21)).toBe(true);
    // Open cell between them.
    expect(fullHeight(ribbed, -halfW - PAD / 2, 10)).toBe(false);
  });

  it('composes with an eco plate', () => {
    const both = generateBaseplate(plate({ marginInfill: 'ribbed', ecoPlate: true }), noop, true);
    assertStructurallyValid(both, 'ribbed + eco');
    assertWatertight(both, 'ribbed + eco');
    const eco = generateBaseplate(plate({ ecoPlate: true }), noop, true);
    const ribbed = generateBaseplate(plate({ marginInfill: 'ribbed' }), noop, true);
    expect(meshVolume(both)).toBeLessThan(meshVolume(eco));
    // The joint reliefs inside the grid still save their share on top.
    expect(meshVolume(ribbed) - meshVolume(both)).toBeGreaterThan(2000);
  });

  it('ribs and pads a narrow margin like TUDC', () => {
    // A drawer whose leftover leaves 7, 5, 3.5 and 3.5 mm of margin.
    const narrow = plate({
      width: 8,
      depth: 2,
      paddingLeft: 7,
      paddingRight: 5,
      paddingFront: 3.5,
      paddingBack: 3.5,
    });
    const solid = generateBaseplate(narrow, noop, true);
    const ribbed = generateBaseplate({ ...narrow, marginInfill: 'ribbed' }, noop, true);
    const pads = generateBaseplate({ ...narrow, marginInfill: 'pads' }, noop, true);
    for (const [label, result] of [
      ['narrow ribbed', ribbed],
      ['narrow pads', pads],
    ] as const) {
      assertStructurallyValid(result, label);
      assertWatertight(result, label);
    }
    expect(meshVolume(ribbed)).toBeLessThan(meshVolume(solid));
    expect(meshVolume(pads)).toBeLessThan(meshVolume(ribbed));

    // The pads at the corners keep the footprint the drawer needs.
    const a = boundingBox(solid.vertices);
    const b = boundingBox(pads.vertices);
    expect(b.maxX - b.minX).toBeCloseTo(a.maxX - a.minX, 3);
    expect(b.maxY - b.minY).toBeCloseTo(a.maxY - a.minY, 3);
    // Front margin: open between the pads, solid rim on a pad.
    const frontMargin = -42 - 3.5 + 0.6;
    expect(fullHeight(pads, -80, frontMargin)).toBe(false);
    expect(fullHeight(pads, -160, frontMargin)).toBe(true);
  });

  it('keeps a solid boss round a screw seated in the margin', () => {
    const screws = { enabled: true, diameter: mm(3.4), headStyle: 'countersink' as const };
    const params = plate({ marginInfill: 'ribbed', screwHoles: screws, screwPadThicknessMm: 0 });
    const holes = planBaseplateScrewHoles(screws, params, screwPlacementFor(screws, params));
    const margin = holes.filter((h) => h.site === 'margin');
    expect(margin.length).toBeGreaterThan(0);
    const result = generateBaseplate(params, noop, true);
    assertStructurallyValid(result, 'ribbed + margin screws');
    assertWatertight(result, 'ribbed + margin screws');
    const head = resolveScrewHeadDiameter(screws.headStyle, undefined) / 2;
    for (const hole of margin) {
      // Just outside the countersink, toward the plate's centre and its edge.
      for (const [dx, dy] of [
        [head + 0.6, 0],
        [-(head + 0.6), 0],
        [0, head + 0.6],
        [0, -(head + 0.6)],
      ]) {
        expect(fullHeight(result, hole.x + dx, hole.y + dy), `${hole.x},${hole.y}`).toBe(true);
      }
    }
  });

  it('opens a detached rail but keeps its seam face for the groove', () => {
    const params = plate({
      paddingLeft: 0,
      paddingRight: 0,
      paddingBack: 0,
      detachMargins: true,
      detachMarginConnector: true,
      connectorStyle: 'puzzle',
      marginInfill: 'ribbed',
    });
    const rail: MarginPiece = {
      id: 'margin-front-a',
      side: 'front',
      role: 'long',
      col: 0,
      row: 0,
      lengthMm: 126,
      bandThicknessMm: PAD,
      ownedCorners: [],
      worldOffsetMm: { x: 0, y: -63 - PAD / 2 },
      seamConnector: { cellUnits: 3, centerOffsetMm: 0, fractionalEdge: 'end' },
      overTile: false,
      overTileHalfGrid: false,
      overTileHalfGridSolidLeftover: false,
    };
    const ribbed = generateMargin(params, rail, true);
    const solid = generateMargin({ ...params, marginInfill: undefined }, rail, true);
    assertStructurallyValid(ribbed, 'ribbed rail');
    assertWatertight(ribbed, 'ribbed rail');
    expect(meshVolume(ribbed)).toBeLessThan(meshVolume(solid) * 0.6);
    // Front rail: the seam face is +railD/2. Between grooves it stays solid.
    expect(fullHeight(ribbed, 21, PAD / 2 - 0.5)).toBe(true);
  });
});
