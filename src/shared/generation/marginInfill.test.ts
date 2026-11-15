import { describe, it, expect } from 'vitest';
import type { ResolvedBaseplateParams } from '@/shared/types/bin';
import {
  marginInfillCells,
  marginBandRibs,
  railInfillCells,
  MARGIN_RIM_MM,
  MARGIN_RIB_MM,
  MARGIN_MIN_OPEN_MM,
  MARGIN_MAX_GAP_UNITS,
  RAIL_SEAM_WALL_MM,
  type MarginInfillCell,
} from './marginInfill';

const plate = (overrides: Partial<ResolvedBaseplateParams> = {}): ResolvedBaseplateParams => ({
  width: 3,
  depth: 2,
  gridUnitMm: 42,
  magnetHoles: false,
  magnetDiameter: 6.5,
  magnetDepth: 2,
  paddingLeft: 20,
  paddingRight: 20,
  paddingFront: 20,
  paddingBack: 20,
  fractionalEdgeX: 'end',
  fractionalEdgeY: 'end',
  cornerRadius: 0,
  ...overrides,
});

const bounds = (c: MarginInfillCell) => ({
  x0: c.x - c.width / 2,
  x1: c.x + c.width / 2,
  y0: c.y - c.depth / 2,
  y1: c.y + c.depth / 2,
});
const openings = (cells: MarginInfillCell[]) => cells.filter((c) => c.radius > 0);
const gaps = (cells: MarginInfillCell[]) => cells.filter((c) => c.radius === 0);

const EPS = 1e-6;
const HALF_W = 63;
const HALF_D = 42;

describe('marginBandRibs', () => {
  it('needs room for the rim and one opening', () => {
    const min = MARGIN_RIM_MM + MARGIN_MIN_OPEN_MM;
    expect(marginBandRibs(min)).toBe(true);
    expect(marginBandRibs(min - 0.1)).toBe(false);
    expect(marginBandRibs(min, 1)).toBe(false);
  });
});

describe('marginInfillCells, ribbed', () => {
  it('keeps every cell inside its band, inside the rim and out of the grid', () => {
    const cells = marginInfillCells(plate());
    expect(cells.length).toBeGreaterThan(0);
    expect(gaps(cells)).toEqual([]);
    for (const cell of cells) {
      const b = bounds(cell);
      expect(b.x0).toBeGreaterThanOrEqual(-HALF_W - 20 + MARGIN_RIM_MM - EPS);
      expect(b.x1).toBeLessThanOrEqual(HALF_W + 20 - MARGIN_RIM_MM + EPS);
      expect(b.y0).toBeGreaterThanOrEqual(-HALF_D - 20 + MARGIN_RIM_MM - EPS);
      expect(b.y1).toBeLessThanOrEqual(HALF_D + 20 - MARGIN_RIM_MM + EPS);
      const intoGridX = Math.min(b.x1, HALF_W) - Math.max(b.x0, -HALF_W);
      const intoGridY = Math.min(b.y1, HALF_D) - Math.max(b.y0, -HALF_D);
      expect(intoGridX <= EPS || intoGridY <= EPS).toBe(true);
    }
  });

  it('opens the cells right up to the grid edge', () => {
    const left = marginInfillCells(plate()).filter((c) => c.x < -HALF_W && Math.abs(c.y) < HALF_D);
    expect(left.length).toBeGreaterThan(0);
    for (const cell of left) expect(bounds(cell).x1).toBeCloseTo(-HALF_W, 6);
  });

  it('leaves at least a rib between neighbouring cells', () => {
    const cells = marginInfillCells(plate()).map(bounds);
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i];
        const b = cells[j];
        const gapX = Math.max(b.x0 - a.x1, a.x0 - b.x1);
        const gapY = Math.max(b.y0 - a.y1, a.y0 - b.y1);
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(MARGIN_RIB_MM - EPS);
      }
    }
  });

  it('puts a rib on every half-unit line along the grid', () => {
    const params = plate({ paddingLeft: 0, paddingRight: 0, paddingBack: 0 });
    const xs = marginInfillCells(params)
      .map((c) => c.x)
      .sort((a, b) => a - b);
    // Six half units across a 3-unit grid; with no side padding the band runs
    // to the plate's own rim.
    expect(xs).toHaveLength(6);
    expect(xs[0]).toBeCloseTo((-HALF_W + MARGIN_RIM_MM + (-42 - MARGIN_RIB_MM / 2)) / 2, 5);
  });

  it('ribs a 3.5 mm margin, and leaves a 3 mm one solid', () => {
    const narrow = { paddingLeft: 3.5, paddingRight: 3, paddingFront: 0, paddingBack: 0 };
    const cells = marginInfillCells(plate(narrow));
    expect(cells.some((c) => c.x < -HALF_W)).toBe(true);
    expect(cells.some((c) => c.x > HALF_W)).toBe(false);
    for (const c of cells) expect(c.width).toBeCloseTo(3.5 - MARGIN_RIM_MM, 6);
  });

  it('opens nothing without padding', () => {
    const none = { paddingLeft: 0, paddingRight: 0, paddingFront: 0, paddingBack: 0 };
    expect(marginInfillCells(plate(none))).toEqual([]);
    expect(marginInfillCells(plate(none), { pads: true })).toEqual([]);
  });

  it('keeps a screw seat solid', () => {
    const keepOut = { x: -HALF_W - 10, y: 0, radius: 6 };
    const cells = marginInfillCells(plate(), { keepOuts: [keepOut] });
    for (const cell of cells) {
      const b = bounds(cell);
      const dx = Math.max(b.x0 - keepOut.x, 0, keepOut.x - b.x1);
      const dy = Math.max(b.y0 - keepOut.y, 0, keepOut.y - b.y1);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(keepOut.radius - EPS);
    }
  });

  it('rounds corner cells concentric with a rounded plate corner', () => {
    const cells = marginInfillCells(plate({ cornerRadius: 8 }));
    const corner = cells.find((c) => c.x < -HALF_W && c.y < -HALF_D);
    expect(corner?.radius).toBeCloseTo(8 - MARGIN_RIM_MM, 5);
    const middle = cells.find((c) => c.x < -HALF_W && Math.abs(c.y) < 21);
    expect(middle?.radius).toBe(1);
  });

  it('keeps the seam end of a split piece solid', () => {
    // A piece whose right edge is a join has no padding there, so the front
    // band stops at the rim it would have, never at the piece edge.
    const cells = marginInfillCells(plate({ paddingRight: 0 }));
    for (const cell of cells) {
      expect(bounds(cell).x1).toBeLessThanOrEqual(HALF_W - MARGIN_RIM_MM + EPS);
    }
  });
});

describe('marginInfillCells, pads', () => {
  const long = (overrides: Partial<ResolvedBaseplateParams> = {}) =>
    plate({
      width: 8,
      depth: 2,
      paddingLeft: 7,
      paddingRight: 5,
      paddingFront: 3.5,
      paddingBack: 3.5,
      ...overrides,
    });
  const halfW8 = 168;

  it('removes the margin between a pad at each end and the middle of a long edge', () => {
    const cells = marginInfillCells(long(), { pads: true });
    const front = gaps(cells).filter((g) => g.y < -HALF_D);
    // 8 units: 6 free between the end pads, so one middle pad and two gaps.
    expect(front).toHaveLength(2);
    for (const g of front) {
      const b = bounds(g);
      expect(b.y1).toBeCloseTo(-HALF_D, 6);
      expect(b.y0).toBeLessThan(-HALF_D - 3.5);
      expect(b.x1 - b.x0).toBeLessThanOrEqual(MARGIN_MAX_GAP_UNITS * 42 + EPS);
    }
    const [first, second] = front.map(bounds).sort((a, b) => a.x0 - b.x0);
    expect(first.x0).toBeCloseTo(-halfW8 + 42, 6);
    expect(second.x1).toBeCloseTo(halfW8 - 42, 6);
    // The middle pad is one unit long.
    expect(second.x0 - first.x1).toBeCloseTo(42, 6);
  });

  it('keeps the corners and leaves openings only inside the pads', () => {
    const cells = marginInfillCells(long(), { pads: true });
    const gapRects = gaps(cells).map(bounds);
    for (const cell of openings(cells)) {
      const b = bounds(cell);
      for (const g of gapRects) {
        const overlapX = Math.min(b.x1, g.x1) - Math.max(b.x0, g.x0);
        const overlapY = Math.min(b.y1, g.y1) - Math.max(b.y0, g.y0);
        expect(overlapX <= EPS || overlapY <= EPS).toBe(true);
      }
    }
    for (const g of gapRects) {
      expect(Math.abs(g.x0) < halfW8 + EPS || Math.abs(g.y0) < HALF_D + EPS).toBe(true);
    }
  });

  it('keeps a short edge whole', () => {
    const cells = marginInfillCells(plate({ width: 2, depth: 2 }), { pads: true });
    expect(gaps(cells)).toEqual([]);
  });

  it('still cuts the gaps where the margin is too narrow for ribs', () => {
    const cells = marginInfillCells(long({ paddingFront: 2, paddingBack: 2 }), { pads: true });
    expect(gaps(cells).some((g) => g.y < -HALF_D)).toBe(true);
    expect(openings(cells).some((c) => c.y < -HALF_D)).toBe(false);
  });

  it('keeps a pad round a screw seat in a gap', () => {
    const keepOut = { x: -40, y: -HALF_D - 1.75, radius: 5 };
    const cells = marginInfillCells(long({ paddingFront: 3.5 }), {
      pads: true,
      keepOuts: [keepOut],
    });
    for (const g of gaps(cells).map(bounds)) {
      const dx = Math.max(g.x0 - keepOut.x, 0, keepOut.x - g.x1);
      const dy = Math.max(g.y0 - keepOut.y, 0, keepOut.y - g.y1);
      expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(keepOut.radius - EPS);
    }
  });
});

describe('railInfillCells', () => {
  it('keeps the seam face solid for its grooves', () => {
    const reserve = 2.5;
    const cells = railInfillCells('left', 20, 200, 42, 0, reserve);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) {
      const b = bounds(cell);
      // Left rail: seam face at +railW/2, drawer face at -railW/2.
      expect(b.x1).toBeLessThanOrEqual(10 - RAIL_SEAM_WALL_MM - reserve + EPS);
      expect(b.x0).toBeGreaterThanOrEqual(-10 + MARGIN_RIM_MM - EPS);
      expect(b.y0).toBeGreaterThanOrEqual(-100 + MARGIN_RIM_MM - EPS);
      expect(b.y1).toBeLessThanOrEqual(100 - MARGIN_RIM_MM + EPS);
    }
  });

  it('spaces ribs about half a grid unit apart', () => {
    expect(railInfillCells('front', 210, 20, 42, 0)).toHaveLength(10);
  });

  it('opens nothing in a rail too thin to rib', () => {
    expect(railInfillCells('back', 200, 4, 42, 0)).toEqual([]);
  });
});
