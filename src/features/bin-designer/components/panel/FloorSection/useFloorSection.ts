import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useDesignerStore } from '@/features/bin-designer/store';
import { useTranslation } from '@/i18n';
import { trackEvent } from '@/shared/analytics/posthog';
import type { BinParams } from '@/features/bin-designer/types';
import { hasDetachableFeet, UNDERSIDE_FLOOR_MAX_MM } from '@/features/bin-designer/types/base';
import {
  minUndersideFloorMm,
  resolveBinFloorMm,
  undersideFloorAdjustable,
} from '@/shared/utils/slotMath';
import { estimatePrint } from '@/features/bin-designer/utils/printEstimates';
import { finalizeBaseParams } from '../BaseSection/finalizeBaseParams';
import {
  FLOOR_TYPES,
  applyFloorType,
  applyHollowBelow,
  applyUndersideFloor,
  deriveFloorType,
  floorTypeStatus,
  hollowBelow,
  hollowBelowStatus,
} from './floorType';
import type { FloorType } from './floorType';

/**
 * Grams each floor type saves (-) against a flat floor on solid
 * feet, for the same bin otherwise. Rounded to whole grams; 0 means no change.
 */
function gramsAgainstFlat(params: BinParams): Record<FloorType, number> {
  const flat = applyHollowBelow(applyFloorType(params, 'flat'), false);
  const flatGrams = estimatePrint(flat).gramsFilament;
  const delta = (type: FloorType): number => {
    const typed = applyFloorType(params, type);
    if (deriveFloorType(typed) !== type) return 0;
    return Math.round(estimatePrint(typed).gramsFilament - flatGrams);
  };
  return { flat: delta('flat'), followsFeet: delta('followsFeet') };
}

export function useFloorSection() {
  const t = useTranslation();
  const { params, setParams } = useDesignerStore(
    useShallow((s) => ({ params: s.params, setParams: s.setParams }))
  );

  const floorType = deriveFloorType(params);
  // A spacer has its floor punched through and a base-only bin is nothing but
  // floor slab, so neither has an inside floor to describe.
  const noFloor = params.base.spacer || params.base.tile === true;
  // Detachable feet supersede every way of hollowing the integral feet; the
  // engine has no rule for it because the pairing is inert, not forbidden.
  const feetSupersede = hasDetachableFeet(params.base)
    ? t('binDesigner.detachableFeet.supersedes')
    : undefined;

  const reasonFor = (type: FloorType): string | undefined => {
    if (type === floorType) return undefined;
    if (type === 'followsFeet' && feetSupersede) return feetSupersede;
    const status = floorTypeStatus(params, type);
    return status && !status.available && status.reason ? t(status.reason) : undefined;
  };

  const grams = useMemo(() => (noFloor ? null : gramsAgainstFlat(params)), [params, noFloor]);

  // Plain functions: the React Compiler memoizes them, and a manual
  // useCallback here could not be preserved through the translated reasons.
  const commit = (next: BinParams): void => setParams(finalizeBaseParams(next));

  const setFloorType = (next: FloorType): void => {
    const written = applyFloorType(params, next);
    if (written === params) return;
    trackEvent('designer_floor_type_changed', { from: floorType, to: next });
    commit(written);
  };

  const hollow = hollowBelow(params);
  const hollowStatus = hollowBelowStatus(params);
  const hollowReason =
    feetSupersede ??
    (!hollow && !hollowStatus.available && hollowStatus.reason
      ? t(hollowStatus.reason)
      : undefined);

  const toggleHollowBelow = (): void => {
    if (!hollow && hollowReason !== undefined) return;
    commit(applyHollowBelow(params, !hollow));
  };

  const floorMin = Math.min(UNDERSIDE_FLOOR_MAX_MM, minUndersideFloorMm(params.wallThickness));
  // A wall as thick as the spec floor leaves nothing to take off.
  const floorAdjustable =
    hollow && undersideFloorAdjustable(params) && floorMin < UNDERSIDE_FLOOR_MAX_MM;
  const floorMm = resolveBinFloorMm(params);
  const floorSaving = useMemo(() => {
    if (!floorAdjustable || params.base.undersideFloorMm === undefined) return null;
    const spec = applyUndersideFloor(params, UNDERSIDE_FLOOR_MAX_MM);
    const grams = Math.round(
      estimatePrint(spec).gramsFilament - estimatePrint(params).gramsFilament
    );
    const deeperMm = Math.round((resolveBinFloorMm(spec) - resolveBinFloorMm(params)) * 100) / 100;
    return deeperMm > 0 ? { grams, deeperMm } : null;
  }, [params, floorAdjustable]);

  const setUndersideFloor = (mm: number): void => {
    const next = applyUndersideFloor(params, mm);
    if (next !== params) commit(next);
  };

  return {
    t,
    state: {
      noFloor,
      tile: params.base.tile === true,
      floorType,
      options: FLOOR_TYPES.map((type) => ({ type, disabledReason: reasonFor(type) })),
      grams,
      hollow,
      hollowReason,
      undersideFloor: {
        // Shown under the toggle; a hollow bin that cannot take it says why.
        visible: hollow && params.base.tile !== true,
        adjustable: floorAdjustable,
        value: floorMm,
        min: floorMin,
        max: UNDERSIDE_FLOOR_MAX_MM,
        saving: floorSaving,
      },
    },
    handlers: { setFloorType, toggleHollowBelow, setUndersideFloor },
  };
}
