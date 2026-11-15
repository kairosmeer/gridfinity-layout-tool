/**
 * Floor: one choice of what the floor IS, then the features that stand on it.
 *
 * The type decides what the rest can be: a floor that follows the feet has no
 * flat surface for a scoop, a fillet, drainage holes or a raised compartment,
 * and the engine reports that on each row below rather than hiding it. A body
 * without an inside floor (spacer, base only) says so in one line.
 */

import type { ReactNode } from 'react';
import { SliderInput } from '@/design-system';
import { isPartialMask } from '@/shared/utils/cellMask';
import { useDesignerStore } from '@/features/bin-designer/store';
import { jumpToDesignerControl } from '@/features/bin-designer/settingsManifest';
import { FeatureGate } from '../FeatureGate';
import { FeatureToggle } from '../FeatureToggle';
import { FeatureTip } from '../../FeatureTip';
import { DependencyHint, ModeTiles, OptionNotes, SubHeader } from '../shared';
import { UnavailableFamily } from '../BaseSection/BaseSection';
import { ScoopSection } from '../ScoopSection';
import { InteriorFilletSection } from '../InteriorFilletSection';
import { FloorTextSection } from '../FloorTextSection';
import { FloorPatternSection } from './FloorPatternSection';
import { FlatFloorIcon, FollowsFeetFloorIcon, RaisedFloorIcon } from './icons';
import { useFloorSection } from './useFloorSection';
import type { FloorType } from './floorType';

const ICON = {
  flat: <FlatFloorIcon />,
  followsFeet: <FollowsFeetFloorIcon />,
  raised: <RaisedFloorIcon />,
} as const satisfies Record<FloorType, ReactNode>;

export function FloorSection() {
  const { t, state, handlers } = useFloorSection();
  const isCustomShape = useDesignerStore((s) => isPartialMask(s.params.cellMask));
  const heading = t('binDesigner.floor.heading');

  const grams = (type: FloorType): string | undefined => {
    const delta = state.grams?.[type] ?? 0;
    if (delta === 0) return undefined;
    return t(delta < 0 ? 'binDesigner.floor.gramsSaved' : 'binDesigner.floor.gramsAdded', {
      grams: Math.abs(delta),
    });
  };

  const hollowToggle = (
    <FeatureToggle
      label={t('binDesigner.floor.hollowBelow')}
      checked={state.hollow}
      onChange={handlers.toggleHollowBelow}
      disabledReason={state.hollowReason}
      info={t('binDesigner.floor.hollowBelowDetail')}
    />
  );

  if (state.noFloor) {
    // A base-only bin is all floor slab, but its feet can still be hollowed
    // from below, the one relief that keeps the slab whole.
    return (
      <div className="space-y-2">
        <UnavailableFamily title={heading} reason={t('binDesigner.floor.noFloor')} />
        {state.tile && hollowToggle}
      </div>
    );
  }

  const customShapeReason = t('binDesigner.shape.custom.unavailable');

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <SubHeader
          info={
            <OptionNotes
              options={[
                {
                  label: t('binDesigner.floor.type.flat'),
                  note: t('binDesigner.floor.type.flat.note'),
                },
                {
                  label: t('binDesigner.floor.type.followsFeet'),
                  note: t('binDesigner.floor.type.followsFeet.note'),
                },
                {
                  label: t('binDesigner.floor.type.raised'),
                  note: t('binDesigner.floor.type.raised.note'),
                },
              ]}
            />
          }
        >
          {heading}
        </SubHeader>
        <ModeTiles
          ariaLabel={t('binDesigner.floor.type')}
          value={state.floorType}
          onChange={handlers.setFloorType}
          options={state.options.map(({ type, disabledReason }) => ({
            value: type,
            icon: ICON[type],
            label: t(`binDesigner.floor.type.${type}`),
            caption: t(`binDesigner.floor.type.${type}.caption`),
            detail: grams(type),
            disabledReason,
            tip:
              type === 'followsFeet' ? (
                <FeatureTip
                  tip="lightweightFloor"
                  feature={t('binDesigner.floor.type.followsFeet')}
                />
              ) : undefined,
          }))}
        >
          {state.floorType === 'raised' && (
            <SliderInput
              label={t('binDesigner.floor.raiseHeight')}
              value={state.raiseMm}
              onChange={handlers.setRaise}
              min={state.raiseStep}
              max={Math.max(state.raiseStep, state.raiseMax)}
              step={state.raiseStep}
              unit="mm"
            />
          )}
          {state.floorType !== 'followsFeet' && hollowToggle}
        </ModeTiles>
      </div>

      <div data-help-target="bd-scoop">
        {isCustomShape && (
          <DependencyHint
            reason={customShapeReason}
            actionLabel={t('binDesigner.dependency.editFootprint')}
            onAction={() => jumpToDesignerControl('bd-shape')}
          />
        )}
        <FeatureGate disabled={isCustomShape} reason={customShapeReason}>
          <ScoopSection />
        </FeatureGate>
      </div>
      <div data-help-target="bd-interior-fillet">
        <InteriorFilletSection />
      </div>
      <div data-help-target="bd-floor-pattern">
        <FloorPatternSection />
      </div>
      <FloorTextSection />
    </div>
  );
}
