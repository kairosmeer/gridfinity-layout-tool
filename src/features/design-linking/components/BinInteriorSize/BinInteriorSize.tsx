/**
 * The inside size of a bin, shown under its outside size in the layout
 * inspector.
 *
 * A bin linked to a saved design is measured exactly, from that design's own
 * params — but only while the two still share a size: a bin resized away from
 * its design is awaiting a sync, and the design's cavity is no longer this
 * bin's. A footprint that only matches turned means the preview draws the
 * design rotated, so the cavity's width and depth swap with it.
 *
 * An unlinked bin has no saved params to read, so it is measured as a plain
 * one-compartment bin at its footprint, with the wall thickness set in Tools →
 * Physical units. That reading is marked approximate. A linked design whose
 * own cavity cannot be measured shows nothing rather than a guess.
 */

import type { DesignId } from '@/core/types';
import {
  formatCompactMm,
  plainBinInterior,
  type InteriorDimensions,
} from '@/features/bin-designer';
import { LabelInfo } from '@/shared/components/InfoDot';
import { useTranslation } from '@/i18n';
import { dimensionsFitAllowingRotation, dimensionsMatch } from '../../domain';
import { useLinkedDesignInterior } from '../../hooks/useLinkedDesignInterior';

/** Physical units of the layout the bin sits in. */
export interface BinInteriorUnits {
  readonly gridUnitMm: number;
  /** Depth-axis pitch for a non-square grid; omitted = square. */
  readonly gridUnitMmY?: number;
  readonly heightUnitMm: number;
}

interface BinInteriorSizeProps {
  readonly linkedDesignId: DesignId | undefined;
  /** The placed bin's size in grid and height units. */
  readonly binSize: {
    readonly width: number;
    readonly depth: number;
    readonly height: number;
  };
  readonly units: BinInteriorUnits;
  /** Wall thickness assumed for a bin with no linked design. */
  readonly wallThicknessMm: number;
}

interface Reading {
  readonly interior: InteriorDimensions;
  readonly estimated: boolean;
  /** The design is drawn a quarter turn from the bin, so its axes swap. */
  readonly turned: boolean;
}

/** Precedes a size derived from the footprint and the assumed wall. */
const APPROXIMATE_PREFIX = '\u2248 ';

export function BinInteriorSize({
  linkedDesignId,
  binSize,
  units,
  wallThicknessMm,
}: BinInteriorSizeProps) {
  const t = useTranslation();
  const reading = useLinkedDesignInterior(linkedDesignId);

  let shown: Reading | null;
  if (linkedDesignId) {
    // No reading means loading, a deleted design, or one with no cavity to
    // measure. None of those is a size this bin has, so show nothing.
    if (!reading) return null;
    shown = dimensionsFitAllowingRotation(reading.design, binSize)
      ? {
          interior: reading.interior,
          estimated: false,
          turned: !dimensionsMatch(reading.design, binSize),
        }
      : estimate(binSize, units, wallThicknessMm);
  } else {
    shown = estimate(binSize, units, wallThicknessMm);
  }

  if (!shown) return null;

  const widthMm = shown.turned ? shown.interior.depthMm : shown.interior.widthMm;
  const depthMm = shown.turned ? shown.interior.widthMm : shown.interior.depthMm;

  return (
    <p className="flex items-center gap-1.5 text-xs text-content-tertiary">
      <span>{t('binDesigner.interiorDimensions')}</span>
      <span className="tabular-nums">
        {shown.estimated ? APPROXIMATE_PREFIX : ''}
        {formatCompactMm(widthMm)} × {formatCompactMm(depthMm)} ×{' '}
        {formatCompactMm(shown.interior.heightMm)} mm
      </span>
      {shown.estimated && (
        <LabelInfo label={t('binDesigner.interiorDimensions')}>
          {t('inspector.insideEstimatedHint', { wall: formatCompactMm(wallThicknessMm) })}
        </LabelInfo>
      )}
    </p>
  );
}

/** Cavity of a plain bin at the placed footprint, or null when unmeasurable. */
function estimate(
  binSize: BinInteriorSizeProps['binSize'],
  units: BinInteriorUnits,
  wallThicknessMm: number
): Reading | null {
  const interior = plainBinInterior({ ...binSize, ...units, wallThicknessMm });
  return interior ? { interior, estimated: true, turned: false } : null;
}
