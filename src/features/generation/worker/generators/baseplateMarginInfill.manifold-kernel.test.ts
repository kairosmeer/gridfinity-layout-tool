// @vitest-environment node
/**
 * Manifold-KERNEL (draft preview) ribbed margins. A ribbed plate previews on
 * the Manifold draft alone, so the draft must cut the same cells the exact
 * build does.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import type { ResolvedBaseplateParams } from '@/shared/types/bin';
import { initManifoldKernel } from './__kernel-tests__/kernelInit';
import { assertStructurallyValid, meshVolume } from './__kernel-tests__/meshAssertions';
import { generateBaseplate } from './baseplateGenerator';
import { generateMargin } from './baseplateMargin';

beforeAll(async () => {
  await initManifoldKernel();
}, 30_000);

const plate = (overrides: Partial<ResolvedBaseplateParams> = {}): ResolvedBaseplateParams => ({
  width: 2,
  depth: 2,
  gridUnitMm: 42,
  magnetHoles: false,
  magnetDiameter: 6.5,
  magnetDepth: 2.4,
  paddingLeft: 15,
  paddingRight: 15,
  paddingFront: 15,
  paddingBack: 15,
  fractionalEdgeX: 'end',
  fractionalEdgeY: 'end',
  lightweight: true,
  ...overrides,
});

describe('ribbed margins on the draft kernel', () => {
  it('opens the padding in the draft preview', () => {
    const solid = generateBaseplate(plate(), () => {}, false);
    const ribbed = generateBaseplate(plate({ marginInfill: 'ribbed' }), () => {}, false);
    assertStructurallyValid(ribbed, 'ribbed draft');
    expect(meshVolume(ribbed)).toBeLessThan(meshVolume(solid) * 0.75);
  }, 60_000);

  it('cuts the gaps between pads in the draft preview', () => {
    const long = plate({
      width: 8,
      paddingFront: 3.5,
      paddingBack: 3.5,
      paddingLeft: 7,
      paddingRight: 5,
    });
    const ribbed = generateBaseplate({ ...long, marginInfill: 'ribbed' }, () => {}, false);
    const pads = generateBaseplate({ ...long, marginInfill: 'pads' }, () => {}, false);
    assertStructurallyValid(pads, 'pads draft');
    expect(meshVolume(pads)).toBeLessThan(meshVolume(ribbed));
  }, 60_000);

  it('opens a detached rail in the draft preview', () => {
    const params = plate({
      paddingLeft: 0,
      paddingRight: 0,
      paddingBack: 0,
      detachMargins: true,
      marginInfill: 'ribbed',
    });
    const rail = {
      id: 'margin-front-a',
      side: 'front' as const,
      role: 'long' as const,
      col: 0,
      row: 0,
      lengthMm: 84,
      bandThicknessMm: 15,
      ownedCorners: [],
      worldOffsetMm: { x: 0, y: -42 - 7.5 },
      seamConnector: { cellUnits: 2, centerOffsetMm: 0, fractionalEdge: 'end' as const },
      overTile: false,
      overTileHalfGrid: false,
      overTileHalfGridSolidLeftover: false,
    };
    const ribbed = generateMargin(params, rail, false);
    const solid = generateMargin({ ...params, marginInfill: undefined }, rail, false);
    assertStructurallyValid(ribbed, 'ribbed rail draft');
    expect(meshVolume(ribbed)).toBeLessThan(meshVolume(solid) * 0.6);
  }, 60_000);
});
