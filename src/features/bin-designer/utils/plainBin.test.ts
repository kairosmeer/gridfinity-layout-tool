import { describe, it, expect } from 'vitest';
import { plainBinInterior, plainBinParams } from './plainBin';

const base = {
  width: 2,
  depth: 2,
  height: 3,
  gridUnitMm: 42,
  heightUnitMm: 7,
  wallThicknessMm: 1.2,
} as const;

describe('plainBinParams', () => {
  it('measures the same cavity the designer reports for a default bin', () => {
    expect(plainBinInterior(base)).toEqual({
      widthMm: 81.1,
      depthMm: 81.1,
      heightMm: 14,
    });
  });

  it('grows with the footprint and uses the assumed wall thickness', () => {
    const interior = plainBinInterior({
      ...base,
      width: 3,
      depth: 2,
      height: 7,
      wallThicknessMm: 0.8,
    });

    expect(interior?.widthMm).toBeCloseTo(123.9, 5);
    expect(interior?.depthMm).toBeCloseTo(81.9, 5);
    expect(interior?.heightMm).toBe(42);
  });

  it('uses the depth-axis pitch on a non-square grid', () => {
    const interior = plainBinInterior({ ...base, gridUnitMmY: 22 });

    expect(interior?.widthMm).toBeCloseTo(81.1, 5);
    expect(interior?.depthMm).toBeCloseTo(41.1, 5);
  });

  it('leaves the Y pitch absent on a square grid', () => {
    expect('gridUnitMmY' in plainBinParams(base)).toBe(false);
  });

  it('refuses a wall thickness that cannot enclose a cavity', () => {
    expect(plainBinInterior({ ...base, wallThicknessMm: 0 })).toBeNull();
    expect(plainBinInterior({ ...base, wallThicknessMm: Number.NaN })).toBeNull();
  });

  it('measures a half-unit footprint', () => {
    const interior = plainBinInterior({ ...base, width: 2.5, wallThicknessMm: 0.8 });

    expect(interior?.widthMm).toBeCloseTo(102.9, 5);
  });
});
