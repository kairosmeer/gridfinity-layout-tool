/**
 * Floor drainage/ventilation pattern (#2816). The holes pass through the floor
 * slab AND the feet, staying inside each foot's flat underside so the
 * baseplate-mating taper is never cut.
 */

import { SliderInput } from '@/design-system';
import { FLOOR_PATTERN_TYPES } from '@/features/bin-designer/types';
import { FeatureToggle } from '../FeatureToggle';
import { FeatureTip } from '../../FeatureTip';
import { Hint } from '../shared';
import { PatternSelector } from '../WallsSection/PatternSelector';
import { useFloorPatternSection } from './useFloorPatternSection';

export function FloorPatternSection() {
  const { t, state, handlers } = useFloorPatternSection();

  return (
    <FeatureToggle
      label={t('binDesigner.base.floorPattern')}
      checked={state.enabled}
      onChange={handlers.toggle}
      disabledReason={state.disabledReason}
      badge={<FeatureTip tip="drainageHoles" feature={t('binDesigner.base.floorPattern')} />}
      primaryControls={
        <>
          <PatternSelector
            id="floor-pattern-selector"
            labelKey="binDesigner.base.floorPattern.shape"
            patterns={FLOOR_PATTERN_TYPES}
            selectedPattern={state.type}
            onChange={handlers.setType}
          />
          <SliderInput
            label={t('binDesigner.walls.pattern.scale')}
            value={state.scalePercent}
            onChange={handlers.setScale}
            min={0}
            max={100}
            step={5}
            unit="%"
            info={t('binDesigner.walls.pattern.scaleHint')}
          />
          <Hint>
            {state.doesNotFit
              ? t('binDesigner.base.floorPattern.tooSmall')
              : t('binDesigner.base.floorPattern.hint')}
          </Hint>
        </>
      }
    />
  );
}
