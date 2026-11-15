import { describe, expect, it } from 'vitest';
import { DEFAULT_BIN_PARAMS } from '@/features/bin-designer/constants';
import type { BinParams } from '@/features/bin-designer/types';
import { finalizeBaseParams } from '../BaseSection/finalizeBaseParams';
import {
  applyFloorType,
  applyHollowBelow,
  deriveFloorType,
  floorTypeStatus,
  hollowBelow,
  hollowBelowStatus,
} from './floorType';

const bin = (patch: Partial<BinParams> = {}, base: Partial<BinParams['base']> = {}): BinParams => ({
  ...DEFAULT_BIN_PARAMS,
  ...patch,
  base: { ...DEFAULT_BIN_PARAMS.base, ...base },
});

describe('floor type', () => {
  it('reads each type off the params', () => {
    expect(deriveFloorType(bin())).toBe('flat');
    expect(deriveFloorType(bin({}, { lightweight: true }))).toBe('followsFeet');
    expect(deriveFloorType(bin({}, { lightweight: true, lightweightMode: 'underside' }))).toBe(
      'flat'
    );
  });

  it('switches between both types and leaves no residue on the way back', () => {
    const start = bin();
    const follows = finalizeBaseParams(applyFloorType(start, 'followsFeet'));
    expect(follows.base.lightweight).toBe(true);
    // Absent is the default mode, so nothing is written for it.
    expect('lightweightMode' in follows.base).toBe(false);

    const back = finalizeBaseParams(applyFloorType(follows, 'flat'));
    expect(deriveFloorType(back)).toBe('flat');
    expect(back.base.lightweight).toBe(false);
  });

  it('blocks Follows feet while a scoop is on, with the reason', () => {
    const scooped = bin({ scoop: { ...DEFAULT_BIN_PARAMS.scoop, enabled: true } });
    const status = floorTypeStatus(scooped, 'followsFeet');
    expect(status?.available).toBe(false);
    expect(status?.reason).toBe('binDesigner.scoopDisablesLightweight');
    expect(applyFloorType(scooped, 'followsFeet')).toBe(scooped);
  });

  it('hollows the feet from below under a scoop, keeping the scoop', () => {
    const scooped = bin({ scoop: { ...DEFAULT_BIN_PARAMS.scoop, enabled: true } });
    expect(hollowBelowStatus(scooped).available).toBe(true);
    const hollowed = applyHollowBelow(scooped, true);
    expect(hollowBelow(hollowed)).toBe(true);
    expect(hollowed.scoop.enabled).toBe(true);
    expect(deriveFloorType(hollowed)).toBe('flat');
  });

  it('drops the mode when the hollow is filled back in', () => {
    const off = applyHollowBelow(applyHollowBelow(bin(), true), false);
    expect(off.base.lightweight).toBe(false);
    expect('lightweightMode' in off.base).toBe(false);
  });

  it('lets leftover cutouts stand after leaving solid mode, and clears them', () => {
    const leftover = bin({ cutouts: [{ id: 'c1' } as never] });
    expect(floorTypeStatus(leftover, 'followsFeet')?.available).toBe(true);
    expect(applyFloorType(leftover, 'followsFeet').cutouts).toEqual([]);
  });

  it('refuses Follows feet and the hollow on a flat base', () => {
    const flat = bin({}, { style: 'flat' });
    expect(floorTypeStatus(flat, 'followsFeet')?.available).toBe(false);
    expect(hollowBelowStatus(flat).available).toBe(false);
  });

  it('blocks Follows feet under raised Bento compartments', () => {
    const raisedCompartment = bin({
      compartments: { ...DEFAULT_BIN_PARAMS.compartments, floorRaises: [6] },
    });
    expect(floorTypeStatus(raisedCompartment, 'followsFeet')?.reason).toBe(
      'binDesigner.compartmentFloorRaisesDisableLightweight'
    );
  });
});
