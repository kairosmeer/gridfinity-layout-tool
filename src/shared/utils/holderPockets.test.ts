import { describe, expect, it } from 'vitest';
import { HOLDER_ITEMS, holderItemById } from '@/shared/constants/holderItems';
import type { HolderItem } from '@/shared/constants/holderItems';
import {
  HOLDER_EDGE_MM,
  MAX_HOLDER_POCKETS,
  compartmentFloorRect,
  layoutHolderPockets,
  planHolders,
} from './holderPockets';

const item = (id: string): HolderItem => {
  const found = holderItemById(id);
  if (!found) throw new Error(id);
  return found;
};

const floor = (w: number, d: number) => ({ x0: -w / 2, y0: -d / 2, x1: w / 2, y1: d / 2 });

describe('holder catalog', () => {
  it('has unique ids and sizes that make a pocket', () => {
    expect(new Set(HOLDER_ITEMS.map((i) => i.id)).size).toBe(HOLDER_ITEMS.length);
    for (const i of HOLDER_ITEMS) {
      expect(i.w, i.id).toBeGreaterThan(0);
      expect(i.d, i.id).toBeGreaterThanOrEqual(0);
      expect(i.depthMm, i.id).toBeGreaterThan(0);
    }
  });

  it('ignores ids it does not know', () => {
    expect(holderItemById('flux')).toBeUndefined();
    expect(holderItemById(null)).toBeUndefined();
  });
});

describe('layoutHolderPockets', () => {
  it('keeps every pocket inside the walls and apart by the item gap', () => {
    const aa = item('aa');
    const pockets = layoutHolderPockets(aa, floor(80, 40), HOLDER_EDGE_MM);
    expect(pockets).toHaveLength(4 * 2);
    for (const p of pockets) {
      expect(p.x - p.w / 2).toBeGreaterThanOrEqual(-40 + HOLDER_EDGE_MM - 1e-9);
      expect(p.x + p.w / 2).toBeLessThanOrEqual(40 - HOLDER_EDGE_MM + 1e-9);
    }
    const row = pockets.filter((p) => p.y === pockets[0].y).map((p) => p.x);
    expect(row[1] - row[0] - aa.w).toBeGreaterThanOrEqual(aa.gapMm);
  });

  it('turns a slot a quarter when that fits more', () => {
    const sd = item('sdCard');
    // 24.6 wide slots fit one across 30 mm, but the turned 2.8 mm ones fit many.
    const pockets = layoutHolderPockets(sd, floor(30, 80), 0);
    expect(pockets[0].w).toBeCloseTo(sd.d);
    expect(pockets.length).toBeGreaterThan(5);
  });

  it('runs a trough the length of the longer side', () => {
    const pen = item('pen');
    const pockets = layoutHolderPockets(pen, floor(120, 40), HOLDER_EDGE_MM);
    expect(pockets).toHaveLength(2);
    expect(pockets[0].w).toBeCloseTo(120 - 2 * HOLDER_EDGE_MM);
    expect(pockets[0].d).toBe(pen.w);
  });

  it('fits nothing in a compartment smaller than one pocket', () => {
    expect(layoutHolderPockets(item('d'), floor(30, 30), HOLDER_EDGE_MM)).toEqual([]);
  });

  it('stops at the pocket cap', () => {
    const pockets = layoutHolderPockets(item('microSdCard'), floor(400, 400), 0);
    expect(pockets).toHaveLength(MAX_HOLDER_POCKETS);
  });
});

describe('compartmentFloorRect', () => {
  const grid = { cols: 2, rows: 1, cells: [0, 1], thickness: 1.2 };

  it('stops at half a divider where a neighbour is', () => {
    expect(compartmentFloorRect(grid, 0, 80, 40)).toEqual({ x0: -40, x1: -0.6, y0: -20, y1: 20 });
  });

  it('refuses a merged outline', () => {
    const l = { cols: 2, rows: 2, cells: [0, 0, 0, 1], thickness: 1.2 };
    expect(compartmentFloorRect(l, 0, 80, 80)).toBeNull();
  });
});

describe('planHolders', () => {
  const compartments = {
    cols: 2,
    rows: 1,
    cells: [0, 1],
    thickness: 1.2,
    holders: ['aa', 'flux'],
  };

  it('plans only known items on a raised floor', () => {
    const plans = planHolders({ compartments }, 80, 40, new Map([[0, 15]]));
    expect([...plans.keys()]).toEqual([0]);
    expect(planHolders({ compartments }, 80, 40, new Map()).size).toBe(0);
  });

  it('keeps clear of an interior fillet', () => {
    const plain = planHolders({ compartments }, 80, 40, new Map([[0, 15]])).get(0);
    const filleted = planHolders(
      { compartments, interiorFilletMm: 6 },
      80,
      40,
      new Map([[0, 15]])
    ).get(0);
    expect(filleted?.pockets.length ?? 0).toBeLessThanOrEqual(plain?.pockets.length ?? 0);
  });
});
