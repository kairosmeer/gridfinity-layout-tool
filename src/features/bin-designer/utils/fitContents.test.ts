/**
 * "Fit contents" is a search over real cavity measurements, so these tests pin
 * both ends: the sizes it returns for measured items, and the fact that each
 * returned size really holds the item through `binInteriorDimensions` — the
 * same math the Dimensions panel reads.
 */

import { describe, it, expect } from 'vitest';
import { DEFAULT_BIN_PARAMS } from '../constants';
import type { BaseConfig, BinParams } from '../types';
import { buildFullMask } from '@/shared/utils/cellMask';
import { binInteriorDimensions } from './interiorDimensions';
import { fitContents } from './fitContents';

function withBase(base: Partial<BaseConfig>, rest: Partial<BinParams> = {}): BinParams {
  return { ...DEFAULT_BIN_PARAMS, ...rest, base: { ...DEFAULT_BIN_PARAMS.base, ...base } };
}

/** The measured item from the feature request: 100 × 75 × 40 mm. */
const BOX = { lengthMm: 100, widthMm: 75, heightMm: 40 } as const;

describe('fitContents', () => {
  it('picks the smallest whole-grid bin for 100 × 75 × 40 mm at 0.8 mm walls', () => {
    const params: BinParams = { ...DEFAULT_BIN_PARAMS, wallThickness: 0.8 };
    const result = fitContents(params, BOX, false);

    expect(result.kind).toBe('fits');
    if (result.kind !== 'fits') return;
    expect(result.fit).toMatchObject({ width: 3, depth: 2, height: 7, turned: false });
    // 3 × 42 − 0.5 − 2 × 0.8 = 123.9 mm across, 2 × 42 − 0.5 − 1.6 = 81.9 mm deep.
    expect(result.fit.interior.widthMm).toBeCloseTo(123.9, 6);
    expect(result.fit.interior.depthMm).toBeCloseTo(81.9, 6);
    // 7u × 7 mm − 7 mm of socket = 42 mm of wall-to-floor room.
    expect(result.fit.interior.heightMm).toBeCloseTo(42, 6);
  });

  it('uses half steps in half-grid mode', () => {
    const params: BinParams = { ...DEFAULT_BIN_PARAMS, wallThickness: 0.8 };
    const result = fitContents(params, { lengthMm: 100, widthMm: 75 }, true);

    expect(result.kind).toBe('fits');
    if (result.kind !== 'fits') return;
    expect(result.fit).toMatchObject({ width: 2.5, depth: 2, turned: false });
    expect(result.fit.interior.widthMm).toBeCloseTo(102.9, 6);
  });

  it('leaves the height alone when the item height is omitted or zero', () => {
    const params: BinParams = { ...DEFAULT_BIN_PARAMS, height: 5 };

    for (const contents of [
      { lengthMm: 100, widthMm: 75 },
      { lengthMm: 100, widthMm: 75, heightMm: 0 },
    ]) {
      const result = fitContents(params, contents, false);
      expect(result.kind).toBe('fits');
      if (result.kind !== 'fits') continue;
      expect(result.fit.height).toBe(5);
    }
  });

  it('finds the shortest height unit count that reaches the item', () => {
    // A socketed bin's inside height is `height × 7 − 7` mm, so 2u is 7 mm.
    for (const [heightMm, height] of [
      [1, 2],
      [7, 2],
      [8, 3],
      [14, 3],
      [15, 4],
      [40, 7],
      [343, 50],
    ] as const) {
      const result = fitContents(
        DEFAULT_BIN_PARAMS,
        { lengthMm: 10, widthMm: 10, heightMm },
        false
      );
      expect(result.kind).toBe('fits');
      if (result.kind !== 'fits') continue;
      expect(result.fit.height).toBe(height);
    }
  });

  it('turns the item when a non-square grid makes that the smaller footprint', () => {
    // 80 mm × 20 mm pitch: 85 mm along X costs 2 cells, along Y it costs 5.
    const params: BinParams = { ...DEFAULT_BIN_PARAMS, gridUnitMm: 80, gridUnitMmY: 20 };
    const result = fitContents(params, { lengthMm: 85, widthMm: 45 }, false);

    expect(result.kind).toBe('fits');
    if (result.kind !== 'fits') return;
    expect(result.fit).toMatchObject({ width: 1, depth: 5, turned: true });
  });

  it('keeps the typed orientation on a tie', () => {
    const result = fitContents(DEFAULT_BIN_PARAMS, { lengthMm: 100, widthMm: 75 }, false);

    expect(result.kind).toBe('fits');
    if (result.kind !== 'fits') return;
    expect(result.fit).toMatchObject({ width: 3, depth: 2, turned: false });
  });

  it('handles a square item without searching the turned case', () => {
    const result = fitContents(DEFAULT_BIN_PARAMS, { lengthMm: 60, widthMm: 60 }, false);

    expect(result.kind).toBe('fits');
    if (result.kind !== 'fits') return;
    expect(result.fit).toMatchObject({ width: 2, depth: 2, turned: false });
  });

  it('never returns a size whose measured cavity is smaller than the item', () => {
    const params: BinParams = { ...DEFAULT_BIN_PARAMS, wallThickness: 1.2 };

    for (const [lengthMm, widthMm] of [
      [10, 10],
      [39, 39],
      [40, 40],
      [41, 41],
      [82, 40],
      [83, 41],
      [100, 75],
      [300, 150],
      [345, 345],
    ] as const) {
      const result = fitContents(params, { lengthMm, widthMm }, false);
      expect(result.kind).toBe('fits');
      if (result.kind !== 'fits') continue;

      const { interior, width, depth } = result.fit;
      const targetW = result.fit.turned ? widthMm : lengthMm;
      const targetD = result.fit.turned ? lengthMm : widthMm;
      expect(interior.widthMm).toBeGreaterThanOrEqual(targetW - 1e-6);
      expect(interior.depthMm).toBeGreaterThanOrEqual(targetD - 1e-6);
      // The reported interior is the interior of the reported size, not another.
      expect(interior).toEqual(
        binInteriorDimensions({ ...params, width, depth, height: result.fit.height })
      );
    }
  });

  it('reports too-large past the legal dimension or height ceiling', () => {
    expect(fitContents(DEFAULT_BIN_PARAMS, { lengthMm: 700, widthMm: 10 }, false)).toEqual({
      kind: 'too-large',
    });
    expect(
      fitContents(DEFAULT_BIN_PARAMS, { lengthMm: 10, widthMm: 10, heightMm: 344 }, false)
    ).toEqual({ kind: 'too-large' });
  });

  it('rejects a non-positive or non-finite measurement', () => {
    for (const contents of [
      { lengthMm: 0, widthMm: 10 },
      { lengthMm: 10, widthMm: -1 },
      { lengthMm: Number.NaN, widthMm: 10 },
      { lengthMm: Number.POSITIVE_INFINITY, widthMm: 10 },
    ]) {
      expect(fitContents(DEFAULT_BIN_PARAMS, contents, false)).toEqual({ kind: 'invalid' });
    }
  });

  it('reports no-cavity for designs with nothing to hold contents', () => {
    const designs: Array<[string, BinParams]> = [
      ['solid', withBase({ solid: true })],
      ['base-only tile', withBase({ tile: true })],
      ['floorless spacer', withBase({ spacer: true })],
      ['lightweight floor', withBase({ lightweight: true })],
      [
        'partial mask',
        {
          ...DEFAULT_BIN_PARAMS,
          width: 2,
          depth: 2,
          cellMask: {
            cols: 4,
            rows: 4,
            cells: [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] as (0 | 1)[],
          },
        },
      ],
    ];

    for (const [name, params] of designs) {
      expect({ name, result: fitContents(params, { lengthMm: 20, widthMm: 20 }, false) }).toEqual({
        name,
        result: { kind: 'no-cavity' },
      });
    }
  });

  it('accepts a fully filled mask as a cavity', () => {
    const params: BinParams = {
      ...DEFAULT_BIN_PARAMS,
      cellMask: buildFullMask(DEFAULT_BIN_PARAMS.width, DEFAULT_BIN_PARAMS.depth),
    };
    const result = fitContents(params, { lengthMm: 20, widthMm: 20 }, false);

    expect(result.kind).toBe('fits');
  });
});
