/**
 * Floor raise for the Bento compartment inspector: lifts one compartment's
 * floor on a solid slab, or turns that slab into pockets for an item. The
 * ceiling follows the bin so the slider cannot ask for a shallower pocket than
 * the generator will build.
 */

import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '@/i18n';
import { Select, SliderInput } from '@/design-system';
import type { SelectOption } from '@/design-system';
import { LabelInfo } from '@/shared/components/InfoDot';
import { FieldLabel, Hint } from '@/shared/components/PanelText';
import { getFeatureStatus } from '@/shared/constraints';
import { HOLDER_ITEMS, holderItemById } from '@/shared/constants/holderItems';
import type { HolderItemId } from '@/shared/constants/holderItems';
import {
  compartmentFloorRect,
  holderEdgeMm,
  layoutHolderPockets,
} from '@/shared/utils/holderPockets';
import { useDesignerStore } from '@/features/bin-designer/store';
import { binDimensions } from '@/features/bin-designer/utils/binDimensions';
import { maxCompartmentFloorRaiseMm } from '@/features/bin-designer/utils/compartmentFloorRaise';

const NONE = 'none';

export interface BentoCompartmentFloorControlsProps {
  readonly compartmentId: number;
}

export function BentoCompartmentFloorControls({
  compartmentId,
}: BentoCompartmentFloorControlsProps) {
  const t = useTranslation();
  const {
    raise,
    maxRaise,
    blockedReason,
    holder,
    pocketCount,
    canHold,
    setCompartmentFloorRaise,
    setCompartmentHolder,
  } = useDesignerStore(
    useShallow((s) => {
      const status = getFeatureStatus(s.params, 'compartmentFloorRaises');
      const item = holderItemById(s.params.compartments.holders?.[compartmentId]);
      const { innerW, innerD } = binDimensions(s.params);
      const floor = compartmentFloorRect(s.params.compartments, compartmentId, innerW, innerD);
      return {
        raise: s.params.compartments.floorRaises?.[compartmentId] ?? 0,
        maxRaise: maxCompartmentFloorRaiseMm(s.params),
        // The engine's reason when the floor cannot take a raise (one that
        // follows the feet). The worker skips it there, so the slider must not
        // offer one that would silently not build.
        blockedReason: status.available ? undefined : status.reason,
        holder: item?.id ?? null,
        // Null until an item is picked in a compartment that can hold one.
        pocketCount:
          floor && item ? layoutHolderPockets(item, floor, holderEdgeMm(s.params)).length : null,
        // A merged outline or a tilted wall would put pockets through a wall.
        canHold: floor !== null,
        setCompartmentFloorRaise: s.setCompartmentFloorRaise,
        setCompartmentHolder: s.setCompartmentHolder,
      };
    })
  );
  if (blockedReason !== undefined) return <Hint>{t(blockedReason)}</Hint>;
  if (maxRaise <= 0) return null;

  const options: SelectOption[] = [
    { id: NONE, name: t('binDesigner.bento.holder.none') },
    ...HOLDER_ITEMS.map((item) => ({
      id: item.id,
      name: t(`binDesigner.bento.holder.item.${item.id}`),
      group: t(`binDesigner.bento.holder.group.${item.group}`),
    })),
  ];
  const label = t('binDesigner.bento.holder.label');
  const depthLabel = holder
    ? t('binDesigner.bento.holder.depth')
    : t('binDesigner.bento.floorRaise');

  return (
    <div className="flex flex-col gap-3">
      <div>
        <FieldLabel info={t('binDesigner.bento.holder.labelDetail')}>{label}</FieldLabel>
        <Select
          size="sm"
          fullWidth
          aria-label={label}
          value={holder ?? NONE}
          options={options}
          disabled={!canHold}
          onValueChange={(value) => {
            const next = value === NONE ? null : (value as HolderItemId);
            if (next !== holder) setCompartmentHolder(compartmentId, next);
          }}
        />
        {!canHold ? (
          <Hint>{t('binDesigner.bento.holder.needsRectangle')}</Hint>
        ) : pocketCount === 0 ? (
          <Hint>{t('binDesigner.bento.holder.noRoom')}</Hint>
        ) : pocketCount !== null ? (
          <Hint>{t('binDesigner.bento.holder.count', { count: pocketCount })}</Hint>
        ) : null}
      </div>
      <SliderInput
        label={depthLabel}
        value={Math.min(raise, maxRaise)}
        onChange={(mm) => setCompartmentFloorRaise(compartmentId, mm)}
        min={0}
        max={maxRaise}
        step={1}
        unit="mm"
        labelAddon={
          <LabelInfo label={depthLabel}>
            {t(
              holder ? 'binDesigner.bento.holder.depthDetail' : 'binDesigner.bento.floorRaiseDetail'
            )}
          </LabelInfo>
        }
      />
    </div>
  );
}
