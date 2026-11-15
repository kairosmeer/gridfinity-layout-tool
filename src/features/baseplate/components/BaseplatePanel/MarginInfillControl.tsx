import type { MarginInfill, StoredBaseplateParams } from '@/core/types';
import { useTranslation } from '@/i18n';
import { SegmentedControl } from '@/design-system';
import { LabelInfo } from '@/shared/components/InfoDot';
import { marginBandRibs } from '@/shared/generation/marginInfill';
import { updateBaseplateParam as updateParam } from './panelState';

/**
 * How the drawer-fit padding is filled: solid, ribbed, or ribbed pads with
 * nothing between them. Stored undefined for the default solid fill, like the
 * other optional plate flags. Inert under over-tile, which turns the margin
 * into grid, so the other choices lock until over-tile is off; a choice already
 * made stays selected and can still be set back to solid.
 */
export function MarginInfillControl({
  baseplateParams,
}: {
  baseplateParams: StoredBaseplateParams;
}) {
  const t = useTranslation();
  const value: MarginInfill = baseplateParams.marginInfill ?? 'solid';
  const overTile = baseplateParams.overTile === true;
  const canRib = [
    baseplateParams.paddingLeft,
    baseplateParams.paddingRight,
    baseplateParams.paddingFront,
    baseplateParams.paddingBack,
  ].some((padding) => marginBandRibs(padding));
  const overTileNote = t('baseplate.marginFill.overTile');
  const narrowNote = t('baseplate.marginFill.tooNarrow');

  const note = overTile
    ? value === 'solid'
      ? undefined
      : overTileNote
    : value === 'ribbed'
      ? canRib
        ? t('baseplate.marginFill.ribbedHint')
        : narrowNote
      : value === 'pads'
        ? t('baseplate.marginFill.padsHint')
        : undefined;

  return (
    <div className="space-y-1.5">
      <span className="flex items-center gap-1 text-xs text-content-secondary">
        {t('baseplate.marginFill')}
        <LabelInfo label={t('baseplate.marginFill')}>{t('baseplate.marginFill.detail')}</LabelInfo>
      </span>
      <SegmentedControl
        aria-label={t('baseplate.marginFill')}
        size="sm"
        fullWidth
        options={[
          { value: 'solid', label: t('baseplate.marginFill.solid') },
          {
            value: 'ribbed',
            label: t('baseplate.marginFill.ribbed'),
            disabled: value !== 'ribbed' && (overTile || !canRib),
            title: overTile ? overTileNote : !canRib ? narrowNote : undefined,
          },
          {
            value: 'pads',
            label: t('baseplate.marginFill.pads'),
            disabled: value !== 'pads' && overTile,
            title: overTile ? overTileNote : undefined,
          },
        ]}
        value={value}
        onChange={(next) => updateParam('marginInfill', next === 'solid' ? undefined : next)}
      />
      {note !== undefined && (
        <p className="text-label leading-relaxed text-content-tertiary">{note}</p>
      )}
    </div>
  );
}
