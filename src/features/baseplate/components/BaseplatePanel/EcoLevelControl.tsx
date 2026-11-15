import type { EcoLevel, StoredBaseplateParams } from '@/core/types';
import { useTranslation } from '@/i18n';
import { SegmentedControl } from '@/design-system';
import { Hint } from '@/shared/components/PanelText';
import { ultraLightBlocker } from '@/shared/generation/ecoPlate';
import { updateBaseplateParam as updateParam } from './panelState';

/**
 * How far the eco plate goes: standard reliefs, or the ultra light plate.
 * Stored undefined for standard. Ultra stays selectable when something on the
 * plate rules it out, and then says what, because the plate quietly prints as
 * the standard eco plate until that is changed.
 */
export function EcoLevelControl({
  baseplateParams,
  outline,
  stacking,
}: {
  baseplateParams: StoredBaseplateParams;
  outline: boolean;
  stacking: boolean;
}) {
  const t = useTranslation();
  const value: EcoLevel = baseplateParams.ecoLevel ?? 'standard';
  const blocker =
    value === 'ultra' ? ultraLightBlocker(baseplateParams, { outline, stacking }) : null;

  return (
    <div className="space-y-1.5">
      <SegmentedControl
        aria-label={t('baseplate.ecoLevel')}
        size="sm"
        fullWidth
        options={[
          { value: 'standard', label: t('baseplate.ecoLevel.standard') },
          { value: 'ultra', label: t('baseplate.ecoLevel.ultra') },
        ]}
        value={value}
        onChange={(next) => updateParam('ecoLevel', next === 'standard' ? undefined : next)}
      />
      {blocker !== null ? (
        <p className="text-label leading-relaxed text-warning">
          {t(`baseplate.ecoLevel.blocked.${blocker}`)}
        </p>
      ) : value === 'ultra' ? (
        <Hint info={t('baseplate.ecoLevel.ultraHintDetail')}>
          {t('baseplate.ecoLevel.ultraHint')}
        </Hint>
      ) : (
        <Hint>{t('baseplate.ecoLevel.standardHint')}</Hint>
      )}
    </div>
  );
}
