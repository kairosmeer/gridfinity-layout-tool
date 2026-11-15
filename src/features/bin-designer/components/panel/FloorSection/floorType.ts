/**
 * The floor as one choice. Three params encode it: `base.lightweight` with its
 * mode (a floor that follows the feet, or feet hollowed from below under a flat
 * floor) and `floorRaiseMm`. Each pick is written through the constraint
 * engine, so whatever the new floor cannot carry clears exactly as the old
 * toggles cleared it.
 */

import { getFeatureStatus, resolveConstraints } from '@/shared/constraints';
import type { FeatureStatus } from '@/shared/constraints';
import type { BinParams } from '@/features/bin-designer/types';
import { DEFAULT_LIGHTWEIGHT_MODE } from '@/features/bin-designer/types/base';

export const FLOOR_TYPES = ['flat', 'followsFeet', 'raised'] as const;
export type FloorType = (typeof FLOOR_TYPES)[number];

const followsFeet = (base: BinParams['base']): boolean =>
  base.lightweight && (base.lightweightMode ?? DEFAULT_LIGHTWEIGHT_MODE) === 'interior';

export function deriveFloorType(params: BinParams): FloorType {
  if ((params.floorRaiseMm ?? 0) > 0) return 'raised';
  if (followsFeet(params.base)) return 'followsFeet';
  return 'flat';
}

/** Whether the feet are hollowed from below under a flat or raised floor. */
export function hollowBelow(params: BinParams): boolean {
  return params.base.lightweight && params.base.lightweightMode === 'underside';
}

/** The params with the current floor type taken away, before another is applied. */
function leaveFloorType(params: BinParams): BinParams {
  let next = params;
  if ((next.floorRaiseMm ?? 0) > 0) {
    next = resolveConstraints(next, { feature: 'floorRaise', enabled: false }).params;
  }
  if (followsFeet(next.base)) {
    next = resolveConstraints(next, { feature: 'base.lightweight', enabled: false }).params;
  }
  return next;
}

const withMode = (params: BinParams, mode: 'interior' | 'underside'): BinParams => ({
  ...params,
  base: { ...params.base, lightweightMode: mode },
});

/**
 * The params a floor type writes, or the input unchanged when the engine
 * refuses it. Leaving Follows feet keeps nothing of it; leaving Raised drops
 * the height, which `floorRaise`'s enable patch brings back at the default.
 */
export function applyFloorType(params: BinParams, type: FloorType): BinParams {
  if (type === deriveFloorType(params)) return params;
  const left = leaveFloorType(params);
  switch (type) {
    case 'flat':
      return left;
    case 'followsFeet': {
      const candidate = withMode(left, 'interior');
      if (!getFeatureStatus(candidate, 'base.lightweight').available) return params;
      return resolveConstraints(candidate, { feature: 'base.lightweight', enabled: true }).params;
    }
    case 'raised': {
      if (!getFeatureStatus(left, 'floorRaise').available) return params;
      return resolveConstraints(left, { feature: 'floorRaise', enabled: true }).params;
    }
  }
}

/**
 * Whether a floor type can be picked, asked as the engine would answer it
 * AFTER the current type is left. Asking of the current params would block
 * every switch between two types the engine keeps apart, such as Raised to
 * Follows feet.
 */
export function floorTypeStatus(params: BinParams, type: FloorType): FeatureStatus | null {
  const left = leaveFloorType(params);
  switch (type) {
    case 'flat':
      return null;
    case 'followsFeet':
      return getFeatureStatus(withMode(left, 'interior'), 'base.lightweight');
    case 'raised':
      return getFeatureStatus(left, 'floorRaise');
  }
}

/** Hollow the feet from below, or fill them back in. Floor type is untouched. */
export function applyHollowBelow(params: BinParams, on: boolean): BinParams {
  if (on === hollowBelow(params)) return params;
  if (!on) {
    // The mode goes with it: absent is the default, and a bin that tried the
    // relief and came back must fingerprint as one that never did.
    const { params: off } = resolveConstraints(params, {
      feature: 'base.lightweight',
      enabled: false,
    });
    const { lightweightMode: _mode, ...base } = off.base;
    return { ...off, base };
  }
  return resolveConstraints(withMode(params, 'underside'), {
    feature: 'base.lightweight',
    enabled: true,
  }).params;
}

export function hollowBelowStatus(params: BinParams): FeatureStatus {
  return getFeatureStatus(withMode(params, 'underside'), 'base.lightweight');
}
