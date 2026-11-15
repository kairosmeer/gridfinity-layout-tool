import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDesignerStore } from '@/features/bin-designer/store';
import { useTranslation } from '@/i18n';
import { getFeatureStatus, resolveConstraints } from '@/shared/constraints';
import type { BinParams, FloorPatternType, WallPatternType } from '@/features/bin-designer/types';
import {
  DEFAULT_FLOOR_PATTERN_CONFIG,
  DEFAULT_PATTERN_SCALE,
  FLOOR_PATTERN_TYPES,
} from '@/features/bin-designer/types';
import { assessFloorPatternFit } from '@/features/bin-designer/utils/floorPatternFit';
import { finalizeBaseParams } from '../BaseSection/finalizeBaseParams';

/** Narrow a picker selection to the subset the floor supports. */
function isFloorPatternType(pattern: WallPatternType): pattern is FloorPatternType {
  return (FLOOR_PATTERN_TYPES as readonly WallPatternType[]).includes(pattern);
}

/** Drainage / ventilation holes through the floor slab and the feet below it. */
export function useFloorPatternSection() {
  const t = useTranslation();
  const { params, setParams, updateFloorPattern } = useDesignerStore(
    useShallow((s) => ({
      params: s.params,
      setParams: s.setParams,
      updateFloorPattern: s.updateFloorPattern,
    }))
  );

  const floorPattern = params.floorPattern ?? DEFAULT_FLOOR_PATTERN_CONFIG;
  const status = getFeatureStatus(params, 'floorPattern');
  const fit = useMemo(() => assessFloorPatternFit(params), [params]);

  const commit = useCallback(
    (resolved: BinParams) => setParams(finalizeBaseParams(resolved)),
    [setParams]
  );

  const toggle = useCallback(() => {
    if (!floorPattern.enabled && !status.available) return;
    const { params: resolved } = resolveConstraints(params, {
      feature: 'floorPattern',
      enabled: !floorPattern.enabled,
    });
    commit(resolved);
  }, [params, floorPattern.enabled, status.available, commit]);

  const setType = useCallback(
    (pattern: WallPatternType | null) => {
      // The picker's "none" entry is the off switch, so it has to route through
      // the constraint engine like the toggle rather than just clearing the type.
      if (pattern === null) {
        const { params: resolved } = resolveConstraints(params, {
          feature: 'floorPattern',
          enabled: false,
        });
        commit(resolved);
        return;
      }
      if (!isFloorPatternType(pattern)) return;
      updateFloorPattern({ pattern, enabled: true });
    },
    [params, commit, updateFloorPattern]
  );

  const setScale = useCallback(
    (percent: number) => updateFloorPattern({ scale: percent / 100 }),
    [updateFloorPattern]
  );

  return {
    t,
    state: {
      enabled: floorPattern.enabled,
      type: floorPattern.pattern,
      scalePercent: Math.round((floorPattern.scale ?? DEFAULT_PATTERN_SCALE) * 100),
      doesNotFit: floorPattern.enabled && fit === 'none',
      disabledReason: status.reason ? t(status.reason) : undefined,
    },
    handlers: { toggle, setType, setScale },
  };
}
