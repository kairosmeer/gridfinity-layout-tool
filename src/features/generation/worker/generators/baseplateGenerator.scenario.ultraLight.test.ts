// @vitest-environment node
/**
 * Ultra light plate on the real BREP build: thin shells of the socket profile
 * round each grid node, low ribs between, and well under the eco plate's
 * material.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { ResolvedBaseplateParams } from '@/shared/types/bin';
import { initTestKernel } from '@/test/initTestKernel';
import {
  assertStructurallyValid,
  assertWatertight,
  boundingBox,
  isSolidThrough,
  meshVolume,
  verticalSolidSpans,
} from './__kernel-tests__/meshAssertions';
import type { MeshData } from '../../bridge/types';
import {
  ULTRA_BRACE_HEIGHT_MM,
  ULTRA_RIB_HEIGHT_MM,
  ULTRA_TOP_CUT_MM,
} from './baseplateUltraLight';

type GenerateFn = (
  params: ResolvedBaseplateParams,
  onProgress: (stage: string, progress: number) => void,
  forExport: boolean
) => MeshData;

let generateBaseplate: GenerateFn;

beforeAll(async () => {
  await initTestKernel();
  generateBaseplate = (await import('./baseplateGenerator')).generateBaseplate;
}, 60000);

const noop = (): void => {};

const plate = (overrides: Partial<ResolvedBaseplateParams> = {}): ResolvedBaseplateParams => ({
  width: 3,
  depth: 3,
  gridUnitMm: 42,
  magnetHoles: false,
  magnetDiameter: 6.5,
  magnetDepth: 2.4,
  paddingLeft: 0,
  paddingRight: 0,
  paddingFront: 0,
  paddingBack: 0,
  fractionalEdgeX: 'end',
  fractionalEdgeY: 'end',
  ecoPlate: true,
  ...overrides,
});

const highest = (mesh: MeshData, x: number, y: number): number =>
  Math.max(...verticalSolidSpans(mesh, x, y).map(([, top]) => top));

describe('ultra light plate', () => {
  it('needs at most 60 % of a low-profile eco plate and stays one closed solid', () => {
    const lowEco = generateBaseplate(plate({ lowProfileBase: true }), noop, true);
    const eco = generateBaseplate(plate(), noop, true);
    const ultra = generateBaseplate(plate({ ecoLevel: 'ultra' }), noop, true);
    assertStructurallyValid(ultra, 'ultra');
    assertWatertight(ultra, 'ultra');
    expect(meshVolume(ultra)).toBeLessThan(0.6 * meshVolume(lowEco));

    // Same footprint and bottom; the top is cut down, where bins never rest.
    const a = boundingBox(eco.vertices);
    const b = boundingBox(ultra.vertices);
    expect(b.minX).toBeCloseTo(a.minX, 3);
    expect(b.maxX).toBeCloseTo(a.maxX, 3);
    expect(b.minY).toBeCloseTo(a.minY, 3);
    expect(b.maxY).toBeCloseTo(a.maxY, 3);
    expect(b.minZ).toBeCloseTo(a.minZ, 3);
    expect(b.maxZ).toBeCloseTo(a.maxZ - ULTRA_TOP_CUT_MM, 3);
  }, 120000);

  it('keeps a shell of the socket round a node, a low rib between and an X brace under it', () => {
    const eco = generateBaseplate(plate(), noop, true);
    const ultra = generateBaseplate(plate({ ecoLevel: 'ultra' }), noop, true);
    const box = boundingBox(ultra.vertices);
    // In the shell beside a pocket, 6 mm from the inner node at (21, 21): the
    // pocket's taper lands where the eco plate puts it.
    for (const [x, y] of [
      [19.3, 15],
      [15, 22.7],
      [22.7, 27],
    ] as const) {
      expect(highest(ultra, x, y), `${x}, ${y}`).toBeCloseTo(highest(eco, x, y), 2);
    }
    // Between the shell and the grid line the bottom is open.
    expect(isSolidThrough(ultra, 20.5, 15, box.minZ + 0.05, box.minZ + 1)).toBe(false);
    // Midway between two nodes the grid line is a rib, and the outer edge a rim.
    expect(highest(ultra, 21, 0)).toBeLessThanOrEqual(box.minZ + ULTRA_RIB_HEIGHT_MM + 0.01);
    expect(highest(ultra, 0, -63 + 0.3)).toBeLessThanOrEqual(box.minZ + ULTRA_RIB_HEIGHT_MM + 0.01);
    // Under the node, only the first layers of the X brace.
    const node = highest(ultra, 21.2, 21.2);
    expect(node).toBeGreaterThan(box.minZ + ULTRA_BRACE_HEIGHT_MM - 0.05);
    expect(node).toBeLessThan(box.minZ + ULTRA_BRACE_HEIGHT_MM + 0.05);
  }, 120000);

  it('keeps the plate solid round a seam connector', () => {
    const piece = plate({
      width: 2,
      depth: 2,
      ecoLevel: 'ultra',
      connectorNubs: true,
      connectorStyle: 'dovetail',
      edges: { left: 'exterior', right: 'join', front: 'exterior', back: 'exterior' },
    });
    const ultra = generateBaseplate(piece, noop, true);
    assertWatertight(ultra, 'ultra with connectors');
    const box = boundingBox(ultra.vertices);
    // Beside the connector at the seam node (42, 0), clear of the pockets.
    expect(isSolidThrough(ultra, 39.8, 0, box.minZ + 0.05, box.maxZ - 0.05)).toBe(true);
    // The exterior edge opposite keeps only its rim between the nodes.
    expect(highest(ultra, -41.5, 21)).toBeLessThanOrEqual(box.minZ + ULTRA_RIB_HEIGHT_MM + 0.01);
  }, 120000);
});
