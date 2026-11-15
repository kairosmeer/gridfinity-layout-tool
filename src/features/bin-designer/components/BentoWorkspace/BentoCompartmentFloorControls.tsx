/**
 * Floor raise for the Bento compartment inspector: lifts one compartment's
 * floor on a solid slab. The ceiling follows the bin so the slider cannot ask
 * for a shallower pocket than the generator will build.
 */

import { useShallow } from 'zustand/react/shallow';
import { useTranslation } from '@/i18n';
import { SliderInput } from '@/design-system';
import { LabelInfo } from '@/shared/components/InfoDot';
import { Hint } from '@/shared/components/PanelText';
import { getFeatureStatus } from '@/shared/constraints';
import { useDesignerStore } from '@/features/bin-designer/store';
import { maxCompartmentFloorRaiseMm } from '@/features/bin-designer/utils/compartmentFloorRaise';

export interface BentoCompartmentFloorControlsProps {
  readonly compartmentId: number;
}

export function BentoCompartmentFloorControls({
  compartmentId,
}: BentoCompartmentFloorControlsProps) {
  const t = useTranslation();
  const { raise, maxRaise, blockedReason, setCompartmentFloorRaise } = useDesignerStore(
    useShallow((s) => {
      const status = getFeatureStatus(s.params, 'compartmentFloorRaises');
      return {
        raise: s.params.compartments.floorRaises?.[compartmentId] ?? 0,
        maxRaise: maxCompartmentFloorRaiseMm(s.params),
        // The engine's reason when the floor cannot take a raise (one that
        // follows the feet). The worker skips it there, so the slider must not
        // offer one that would silently not build.
        blockedReason: status.available ? undefined : status.reason,
        setCompartmentFloorRaise: s.setCompartmentFloorRaise,
      };
    })
  );
  if (blockedReason !== undefined) return <Hint>{t(blockedReason)}</Hint>;
  if (maxRaise <= 0) return null;

  return (
    <SliderInput
      label={t('binDesigner.bento.floorRaise')}
      value={Math.min(raise, maxRaise)}
      onChange={(mm) => setCompartmentFloorRaise(compartmentId, mm)}
      min={0}
      max={maxRaise}
      step={1}
      unit="mm"
      labelAddon={
        <LabelInfo label={t('binDesigner.bento.floorRaise')}>
          {t('binDesigner.bento.floorRaiseDetail')}
        </LabelInfo>
      }
    />
  );
}
