/**
 * "Fit contents" in the layout's Tools panel: type an item's measurements and
 * read off the smallest bin that holds it.
 *
 * A layout bin has no wall thickness of its own, so it is measured as a plain
 * one-compartment bin at the layout's pitch, with the wall thickness set in
 * Physical units. The solver is the designer's own and reads every candidate
 * through `binInteriorDimensions`, so this suggestion cannot disagree with the
 * inside size shown in Bin properties.
 *
 * With one bin selected the size is applied to it. Otherwise the size becomes a
 * new bin in the stash, ready to drag onto the grid.
 *
 * Built for measuring a pile of items in a row: Tab walks length → width →
 * height → button, Enter in any field submits, and a successful add or apply
 * clears the fields and puts the cursor back in the first one.
 */

import { useCallback, useRef, useState } from 'react';
import type { FocusEvent, SubmitEvent } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { STAGING_ID } from '@/core/constants';
import { gridUnits, heightUnits } from '@/core/types';
import type { BinUpdates } from '@/core/types';
import { isErr } from '@/core/result';
import { useLayoutStore, useSelectionStore, useSettingsStore, useToastStore } from '@/core/store';
import { useHalfGridModeStore } from '@/core/store/halfGridMode';
import { useMutations } from '@/shared/contexts';
import { Button, Input } from '@/design-system';
import { LabelInfo } from '@/shared/components/InfoDot';
import { PanelSection } from '@/shared/components/PanelSection';
import { showErrorToast } from '@/shared/hooks/useResultToast';
import { useTranslation } from '@/i18n';
import { fitContents, formatCompactMm, plainBinParams } from '@/features/bin-designer';

/** Parsed millimetres, or NaN while the field is blank. */
function parseMm(text: string): number {
  return Number.parseFloat(text);
}

export function FitContentsSection() {
  const t = useTranslation();
  const { addBin, updateBin } = useMutations();
  const addToast = useToastStore((state) => state.addToast);

  const { gridUnitMm, gridUnitMmY, heightUnitMm, bins, layers } = useLayoutStore(
    useShallow((state) => ({
      gridUnitMm: state.layout.gridUnitMm,
      gridUnitMmY: state.layout.gridUnitMmY,
      heightUnitMm: state.layout.heightUnitMm,
      bins: state.layout.bins,
      layers: state.layout.layers,
    }))
  );
  const { selectedBinIds, activeLayerId, activeCategoryId } = useSelectionStore(
    useShallow((state) => ({
      selectedBinIds: state.selectedBinIds,
      activeLayerId: state.activeLayerId,
      activeCategoryId: state.activeCategoryId,
    }))
  );
  const wallThicknessMm = useSettingsStore((state) => state.settings.wallThicknessMm);
  const halfGridMode = useHalfGridModeStore((state) => state.halfGridMode);

  const [lengthText, setLengthText] = useState('');
  const [widthText, setWidthText] = useState('');
  const [heightText, setHeightText] = useState('');
  const lengthRef = useRef<HTMLInputElement>(null);

  const selectedBin =
    selectedBinIds.length === 1 ? bins.find((bin) => bin.id === selectedBinIds[0]) : undefined;
  const activeLayer = layers.find((layer) => layer.id === activeLayerId);

  // No selection: the new bin takes the active layer's height, so leaving the
  // height field blank adds the size a new bin would get anyway.
  const baseHeight = selectedBin?.height ?? activeLayer?.height ?? heightUnits(3);

  const params = plainBinParams({
    width: selectedBin?.width ?? 1,
    depth: selectedBin?.depth ?? 1,
    height: baseHeight,
    gridUnitMm,
    gridUnitMmY,
    heightUnitMm,
    wallThicknessMm,
  });

  const lengthMm = parseMm(lengthText);
  const widthMm = parseMm(widthText);
  const heightMm = parseMm(heightText);
  const wantsHeight = Number.isFinite(heightMm) && heightMm > 0;

  const result = fitContents(
    params,
    { lengthMm, widthMm, heightMm: wantsHeight ? heightMm : undefined },
    halfGridMode
  );
  const fit = result.kind === 'fits' ? result.fit : null;

  const changed =
    fit !== null &&
    selectedBin !== undefined &&
    (fit.width !== selectedBin.width ||
      fit.depth !== selectedBin.depth ||
      fit.height !== selectedBin.height);

  // Ready for the next item: blank fields, cursor back in the first one.
  const resetForNextItem = useCallback(() => {
    setLengthText('');
    setWidthText('');
    setHeightText('');
    lengthRef.current?.focus();
  }, []);

  const handleApply = useCallback(() => {
    if (!fit || !selectedBin) return;
    const updates: BinUpdates = {};
    if (fit.width !== selectedBin.width) updates.width = gridUnits(fit.width);
    if (fit.depth !== selectedBin.depth) updates.depth = gridUnits(fit.depth);
    if (fit.height !== selectedBin.height) updates.height = heightUnits(fit.height);
    if (Object.keys(updates).length === 0) return;
    const outcome = updateBin(selectedBin.id, updates);
    if (isErr(outcome)) {
      showErrorToast(outcome.error);
      return;
    }
    resetForNextItem();
  }, [fit, selectedBin, updateBin, resetForNextItem]);

  const handleAddToStash = useCallback(() => {
    if (!fit) return;
    const outcome = addBin({
      layerId: STAGING_ID,
      x: gridUnits(0),
      y: gridUnits(0),
      width: gridUnits(fit.width),
      depth: gridUnits(fit.depth),
      height: heightUnits(fit.height),
      category: activeCategoryId,
      label: '',
      notes: '',
    });
    if (isErr(outcome)) {
      showErrorToast(outcome.error);
      return;
    }
    addToast(t('toast.binAddedToStash', { width: fit.width, depth: fit.depth }), 'success');
    resetForNextItem();
  }, [fit, addBin, activeCategoryId, addToast, t, resetForNextItem]);

  // Enter in any field does what the button below does.
  const handleSubmit = useCallback(
    (event: SubmitEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (selectedBin) handleApply();
      else handleAddToStash();
    },
    [selectedBin, handleApply, handleAddToStash]
  );

  // Tabbing back into a filled field replaces its value instead of appending.
  const selectOnFocus = (event: FocusEvent<HTMLInputElement>) => event.target.select();

  return (
    <PanelSection className="text-xs text-content-secondary">
      <form onSubmit={handleSubmit} noValidate className="space-y-2">
        <p className="text-content-tertiary">{t('sidebar.fitContentsHint')}</p>

        <div className="grid grid-cols-3 gap-1.5">
          <div>
            <label className="block text-content-tertiary mb-1" htmlFor="fitContentsLength">
              {t('sidebar.fitContents.length')}
            </label>
            <Input
              ref={lengthRef}
              id="fitContentsLength"
              size="sm"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={lengthText}
              onChange={(e) => setLengthText(e.target.value)}
              onFocus={selectOnFocus}
              aria-label={t('sidebar.fitContents.length')}
            />
          </div>
          <div>
            <label className="block text-content-tertiary mb-1" htmlFor="fitContentsWidth">
              {t('sidebar.fitContents.width')}
            </label>
            <Input
              id="fitContentsWidth"
              size="sm"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={widthText}
              onChange={(e) => setWidthText(e.target.value)}
              onFocus={selectOnFocus}
              aria-label={t('sidebar.fitContents.width')}
            />
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <label className="text-content-tertiary" htmlFor="fitContentsHeight">
                {t('sidebar.fitContents.height')}
              </label>
              {/* Out of the Tab order so Tab runs length → width → height → button;
                the field itself carries the explanation for keyboard users. */}
              <LabelInfo label={t('sidebar.fitContents.height')} skipTab>
                {t('sidebar.fitContents.heightDetail')}
              </LabelInfo>
            </div>
            <Input
              id="fitContentsHeight"
              size="sm"
              type="number"
              inputMode="decimal"
              min={0}
              step={0.1}
              value={heightText}
              onChange={(e) => setHeightText(e.target.value)}
              onFocus={selectOnFocus}
              aria-label={t('sidebar.fitContents.height')}
              aria-describedby="fitContentsHeightDetail"
            />
            <span id="fitContentsHeightDetail" className="sr-only">
              {t('sidebar.fitContents.heightDetail')}
            </span>
          </div>
        </div>

        <div aria-live="polite" className="space-y-0.5">
          {fit && (
            <>
              <p className="tabular-nums text-content-secondary">
                {t('sidebar.fitContents.result', {
                  width: formatCompactMm(fit.width),
                  depth: formatCompactMm(fit.depth),
                  height: fit.height,
                })}
              </p>
              <p className="tabular-nums text-content-tertiary">
                {t('sidebar.fitContents.inside', {
                  width: formatCompactMm(fit.interior.widthMm),
                  depth: formatCompactMm(fit.interior.depthMm),
                  height: formatCompactMm(fit.interior.heightMm),
                })}
              </p>
              {fit.turned && (
                <p className="text-content-tertiary">{t('sidebar.fitContents.turned')}</p>
              )}
            </>
          )}
          {result.kind === 'too-large' && (
            <p className="text-warning">{t('sidebar.fitContents.tooLarge')}</p>
          )}
        </div>

        {fit &&
          (selectedBin ? (
            <Button type="submit" variant="secondary" size="sm" fullWidth disabled={!changed}>
              {t('sidebar.fitContents.apply')}
            </Button>
          ) : (
            <Button type="submit" variant="secondary" size="sm" fullWidth>
              {t('sidebar.fitContentsAddToStash')}
            </Button>
          ))}
      </form>
    </PanelSection>
  );
}
