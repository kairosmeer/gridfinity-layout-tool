/**
 * Raised floor: the cavity floor filled up across the whole bin. It is built
 * as a thicker floor slab, so every feature standing on the floor (scoops,
 * fillets, Bento raises, drainage holes) reads the raised top from the same
 * `resolveBinFloorMm`. Measured by column probe, so a fill that landed under
 * the floor or a feature left at the old height cannot pass on volume alone.
 */
import { expect } from 'vitest';
import { defineScenario } from '../__kernel-tests__/scenarioTypes';
import type { ScenarioCase } from '../__kernel-tests__/scenarioTypes';
import { columnCrossings, meshVolume } from '../__kernel-tests__/meshAssertions';
import { deriveDimensions } from '../pipeline/context';
import type { BinParams } from '@/shared/types/bin';
import { DEFAULT_BIN_PARAMS } from '@/shared/constants/bin';
import type { MeshData } from '@/features/generation/bridge/types';
import { resolveBaseFloorMm } from '@/shared/utils/slotMath';

const TWO_ACROSS = { cols: 2, rows: 1, cells: [0, 1], thickness: 1.2 };

/** Highest solid surface under a compartment's centre. */
function floorTopAt(mesh: MeshData, params: BinParams, col = 0, row = 0): number {
  const dim = deriveDimensions(params, false);
  const { cols, rows } = params.compartments;
  const x = dim.innerOffsetX - dim.innerW / 2 + (col + 0.5) * (dim.innerW / cols);
  const y = dim.innerOffsetY - dim.innerD / 2 + (row + 0.5) * (dim.innerD / rows);
  return Math.max(...columnCrossings(mesh, x, y));
}

/** Top of the floor slab before any raise. */
function baseFloorTop(params: BinParams): number {
  return deriveDimensions(params, false).baseOffsetZ + resolveBaseFloorMm(params);
}

export const raisedFloor: ScenarioCase[] = [
  defineScenario('raised floor', 'fills the whole cavity floor by its height', {
    params: { width: 2, depth: 2, height: 6, floorRaiseMm: 8 },
    assert: 'structural',
    customAssert: (mesh, params) => {
      expect(floorTopAt(mesh, params)).toBeCloseTo(baseFloorTop(params) + 8, 1);
    },
    compareWith: {
      params: { width: 2, depth: 2, height: 6 },
      assert: (raised, plain) => {
        // The cavity's footprint, eight deep, less its rounded corners.
        const side = 2 * 42 - 0.5 - 2 * 1.2;
        const added = meshVolume(raised) - meshVolume(plain);
        expect(added).toBeGreaterThan(side * side * 8 * 0.95);
        expect(added).toBeLessThan(side * side * 8 * 1.02);
      },
    },
  }),
  defineScenario('raised floor', 'a Bento raise adds on top of it', {
    params: {
      width: 2,
      depth: 1,
      height: 6,
      floorRaiseMm: 6,
      compartments: { ...TWO_ACROSS, floorRaises: [5, null] },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const base = baseFloorTop(params);
      expect(floorTopAt(mesh, params, 0, 0)).toBeCloseTo(base + 6 + 5, 1);
      expect(floorTopAt(mesh, params, 1, 0)).toBeCloseTo(base + 6, 1);
    },
  }),
  defineScenario('raised floor', 'a finger scoop climbs from the raised top', {
    params: {
      width: 2,
      depth: 1,
      height: 6,
      floorRaiseMm: 8,
      scoop: { enabled: true, radius: 'auto' },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      // The ramp reaches only the front wall, so the centre reads the fill.
      expect(floorTopAt(mesh, params)).toBeCloseTo(baseFloorTop(params) + 8, 1);
    },
    compareWith: {
      params: { width: 2, depth: 1, height: 6, floorRaiseMm: 8 },
      assert: (withScoop, fillOnly) => {
        expect(meshVolume(withScoop)).toBeGreaterThan(meshVolume(fillOnly) * 1.001);
      },
    },
  }),
  defineScenario('raised floor', 'an interior fillet rounds into the raised top', {
    params: { width: 2, depth: 1, height: 6, floorRaiseMm: 6, interiorFilletMm: 3 },
    assert: 'structural',
    customAssert: (mesh, params) => {
      expect(floorTopAt(mesh, params)).toBeCloseTo(baseFloorTop(params) + 6, 1);
    },
  }),
  defineScenario('raised floor', 'drainage holes pass through the fill', {
    params: {
      width: 2,
      depth: 2,
      height: 6,
      floorRaiseMm: 6,
      floorPattern: { enabled: true, pattern: 'round', scale: 0.5 },
    },
    assert: 'structural',
    compareWith: {
      params: { width: 2, depth: 2, height: 6, floorRaiseMm: 6 },
      assert: (drained, solid) => {
        expect(meshVolume(drained)).toBeLessThan(meshVolume(solid) * 0.99);
      },
    },
  }),
  defineScenario('raised floor', 'keeps a hollow underside under the fill', {
    params: {
      width: 2,
      depth: 2,
      height: 6,
      floorRaiseMm: 6,
      base: { ...DEFAULT_BIN_PARAMS.base, lightweight: true, lightweightMode: 'underside' },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      expect(floorTopAt(mesh, params)).toBeCloseTo(baseFloorTop(params) + 6, 1);
    },
  }),
  defineScenario('raised floor', 'raises a flat-base floor too', {
    params: {
      width: 2,
      depth: 1,
      height: 4,
      floorRaiseMm: 5,
      base: { ...DEFAULT_BIN_PARAMS.base, style: 'flat' },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      expect(floorTopAt(mesh, params)).toBeCloseTo(baseFloorTop(params) + 5, 1);
    },
  }),
  defineScenario('raised floor', 'a fill taller than the cavity is clamped, never a block', {
    params: { width: 2, depth: 1, height: 3, floorRaiseMm: 100 },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const dim = deriveDimensions(params, false);
      const top = floorTopAt(mesh, params);
      expect(top).toBeGreaterThan(baseFloorTop(params) + 1);
      expect(top).toBeLessThan(dim.baseOffsetZ + dim.wallHeight - 2);
    },
  }),
  defineScenario('raised floor', 'is ignored on a floor that follows the feet', {
    params: {
      width: 2,
      depth: 1,
      height: 4,
      floorRaiseMm: 6,
      base: { ...DEFAULT_BIN_PARAMS.base, lightweight: true },
    },
    assert: 'structural',
    compareWith: {
      params: {
        width: 2,
        depth: 1,
        height: 4,
        base: { ...DEFAULT_BIN_PARAMS.base, lightweight: true },
      },
      assert: (withRaise, without) => {
        expect(meshVolume(withRaise)).toBeCloseTo(meshVolume(without), 0);
      },
    },
  }),
];
