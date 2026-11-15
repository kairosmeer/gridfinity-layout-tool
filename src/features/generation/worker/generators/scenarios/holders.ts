/**
 * Compartment holders: a raised compartment floor cut into pockets fitted to
 * an item. Probed at the planned pocket centres, so a pocket that landed
 * somewhere else, or did not cut, cannot pass on volume alone.
 */
import { expect } from 'vitest';
import { defineScenario } from '../__kernel-tests__/scenarioTypes';
import type { ScenarioCase } from '../__kernel-tests__/scenarioTypes';
import { columnCrossings, meshVolume } from '../__kernel-tests__/meshAssertions';
import { deriveDimensions } from '../pipeline/context';
import { resolveFloorRaises } from '../floorRaisePlan';
import { planHolders } from '@/shared/utils/holderPockets';
import type { HolderPocket } from '@/shared/utils/holderPockets';
import type { BinParams } from '@/shared/types/bin';
import type { MeshData } from '@/features/generation/bridge/types';

const TWO_ACROSS = { cols: 2, rows: 1, cells: [0, 1], thickness: 1.2 };

function pocketsOf(params: BinParams, id: number): readonly HolderPocket[] {
  const dim = deriveDimensions(params, false);
  const raises = resolveFloorRaises(params, dim.floorThickness, dim.interiorHeight);
  return planHolders(params, dim.innerW, dim.innerD, raises).get(id)?.pockets ?? [];
}

/** Highest solid surface at a cavity-frame point. */
function topAt(mesh: MeshData, params: BinParams, x: number, y: number): number {
  const dim = deriveDimensions(params, false);
  return Math.max(...columnCrossings(mesh, dim.innerOffsetX + x, dim.innerOffsetY + y));
}

function floorTop(params: BinParams): number {
  const dim = deriveDimensions(params, false);
  return dim.baseOffsetZ + dim.floorThickness;
}

const raisedAa = {
  width: 2,
  depth: 1,
  height: 6,
  compartments: { ...TWO_ACROSS, floorRaises: [15, null] },
};

export const holders: ScenarioCase[] = [
  defineScenario('holders', 'AA batteries stand in round pockets down to the bin floor', {
    params: {
      ...raisedAa,
      compartments: { ...raisedAa.compartments, holders: ['aa', null] },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const pockets = pocketsOf(params, 0);
      expect(pockets.length).toBeGreaterThanOrEqual(2);
      for (const p of pockets) {
        expect(topAt(mesh, params, p.x, p.y)).toBeCloseTo(floorTop(params), 1);
      }
      // Between two pockets the slab still stands at its full height.
      const [a, b] = pockets;
      expect(topAt(mesh, params, (a.x + b.x) / 2, (a.y + b.y) / 2)).toBeCloseTo(
        floorTop(params) + 15,
        1
      );
    },
    compareWith: {
      params: raisedAa,
      assert: (holder, slab) => {
        // Every pocket is a 15 mm cylinder of the AA's diameter.
        const removed = meshVolume(slab) - meshVolume(holder);
        const count = Math.floor(removed / (Math.PI * 7.5 * 7.5 * 15) + 0.5);
        expect(count).toBeGreaterThanOrEqual(2);
        expect(removed).toBeGreaterThan(count * Math.PI * 7.5 * 7.5 * 15 * 0.97);
      },
    },
  }),
  defineScenario('holders', 'SD cards stand in slots', {
    params: {
      width: 2,
      depth: 2,
      height: 6,
      compartments: { ...TWO_ACROSS, floorRaises: [12, null], holders: ['sdCard', null] },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const pockets = pocketsOf(params, 0);
      expect(pockets.length).toBeGreaterThan(5);
      for (const p of pockets.slice(0, 3)) {
        expect(topAt(mesh, params, p.x, p.y)).toBeCloseTo(floorTop(params), 1);
      }
    },
  }),
  defineScenario('holders', 'hex bits stand in hexagonal sockets', {
    params: {
      width: 2,
      depth: 1,
      height: 5,
      compartments: { ...TWO_ACROSS, floorRaises: [10, null], holders: ['hexBit', null] },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const [p] = pocketsOf(params, 0);
      expect(topAt(mesh, params, p.x, p.y)).toBeCloseTo(floorTop(params), 1);
    },
  }),
  defineScenario('holders', 'pens lie in round-bottomed troughs that keep a floor', {
    params: {
      width: 3,
      depth: 1,
      height: 4,
      compartments: { ...TWO_ACROSS, floorRaises: [6, null], holders: ['pen', null] },
    },
    assert: 'structural',
    customAssert: (mesh, params) => {
      const pockets = pocketsOf(params, 0);
      expect(pockets.length).toBeGreaterThanOrEqual(2);
      // Each trough runs along the compartment's longer side (here X).
      expect(pockets[0].w).toBeGreaterThan(pockets[0].d);
      expect(topAt(mesh, params, pockets[0].x, pockets[0].y)).toBeCloseTo(
        floorTop(params) + 0.8,
        1
      );
    },
  }),
  defineScenario('holders', 'a holder compartment takes no finger scoop', {
    params: {
      width: 2,
      depth: 1,
      height: 6,
      compartments: {
        cols: 1,
        rows: 1,
        cells: [0],
        thickness: 1.2,
        floorRaises: [15],
        holders: ['aa'],
      },
      scoop: { enabled: true, radius: 'auto' },
    },
    assert: 'structural',
    compareWith: {
      params: {
        width: 2,
        depth: 1,
        height: 6,
        compartments: {
          cols: 1,
          rows: 1,
          cells: [0],
          thickness: 1.2,
          floorRaises: [15],
          holders: ['aa'],
        },
      },
      assert: (scooped, plain) => {
        expect(meshVolume(scooped)).toBeCloseTo(meshVolume(plain), 0);
      },
    },
  }),
];
