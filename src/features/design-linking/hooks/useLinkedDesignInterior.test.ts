import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { ok, err, storageNotFound } from '@/core/result';
import { DEFAULT_BIN_PARAMS } from '@/features/bin-designer/constants';
import { designId } from '@/core/types';
import type { CustomBinRef } from '@/features/bin-designer';
import { loadDesign } from '@/features/bin-designer/storage/DesignerStorage';
import { useLinkedDesign } from './useLinkedDesign';
import { clearLinkedDesignInteriorCache, useLinkedDesignInterior } from './useLinkedDesignInterior';

vi.mock('@/features/bin-designer/storage/DesignerStorage', () => ({
  loadDesign: vi.fn(),
}));

vi.mock('./useLinkedDesign', () => ({
  useLinkedDesign: vi.fn(),
}));

const DESIGN = designId('design-1');

function designRef(updatedAt = '2026-01-01T00:00:00.000Z'): CustomBinRef {
  return { id: DESIGN, name: 'Pens', width: 2, depth: 2, height: 3, updatedAt };
}

function linkTo(ref: CustomBinRef | null) {
  vi.mocked(useLinkedDesign).mockReturnValue({
    linkedDesign: ref,
    isStale: ref === null,
    hasLink: ref !== null,
  });
}

describe('useLinkedDesignInterior', () => {
  beforeEach(() => {
    clearLinkedDesignInteriorCache();
    vi.mocked(loadDesign).mockReset();
    linkTo(designRef());
  });

  it('returns null for an unlinked bin without reading storage', () => {
    linkTo(null);
    const { result } = renderHook(() => useLinkedDesignInterior(undefined));

    expect(result.current).toBeNull();
    expect(loadDesign).not.toHaveBeenCalled();
  });

  it('reads the linked design and reports its inside size', async () => {
    vi.mocked(loadDesign).mockResolvedValue(
      ok({ id: DESIGN, name: 'Pens', params: { ...DEFAULT_BIN_PARAMS } }) as never
    );

    const { result } = renderHook(() => useLinkedDesignInterior(DESIGN));

    await waitFor(() => expect(result.current).not.toBeNull());
    expect(result.current?.interior.widthMm).toBeCloseTo(81.1, 6);
    expect(result.current?.interior.depthMm).toBeCloseTo(81.1, 6);
    expect(result.current?.interior.heightMm).toBeCloseTo(14, 6);
    // The design's own size travels with the reading so the caller can tell
    // whether it still describes the placed bin.
    expect(result.current?.design).toEqual({ width: 2, depth: 2, height: 3 });
  });

  it('shares one read between renders of the same design version', async () => {
    vi.mocked(loadDesign).mockResolvedValue(
      ok({ id: DESIGN, name: 'Pens', params: { ...DEFAULT_BIN_PARAMS } }) as never
    );

    const first = renderHook(() => useLinkedDesignInterior(DESIGN));
    const second = renderHook(() => useLinkedDesignInterior(DESIGN));

    await waitFor(() => expect(first.result.current).not.toBeNull());
    await waitFor(() => expect(second.result.current).not.toBeNull());
    expect(loadDesign).toHaveBeenCalledTimes(1);
  });

  it('re-reads when the design was saved again', async () => {
    vi.mocked(loadDesign)
      .mockResolvedValueOnce(
        ok({ id: DESIGN, name: 'Pens', params: { ...DEFAULT_BIN_PARAMS } }) as never
      )
      .mockResolvedValueOnce(
        ok({
          id: DESIGN,
          name: 'Pens',
          params: { ...DEFAULT_BIN_PARAMS, width: 3 },
        }) as never
      );

    const { result, rerender } = renderHook(() => useLinkedDesignInterior(DESIGN));
    await waitFor(() => expect(result.current?.interior.widthMm).toBeCloseTo(81.1, 6));

    linkTo(designRef('2026-02-01T00:00:00.000Z'));
    rerender();

    // 3 × 42 − 0.5 tolerance − 2 × 1.2 walls.
    await waitFor(() => expect(result.current?.interior.widthMm).toBeCloseTo(123.1, 6));
    expect(loadDesign).toHaveBeenCalledTimes(2);
  });

  it('shows nothing for a design with no bin params', async () => {
    vi.mocked(loadDesign).mockResolvedValue(ok({ id: DESIGN, name: 'Box' }) as never);

    const { result } = renderHook(() => useLinkedDesignInterior(DESIGN));

    await waitFor(() => expect(loadDesign).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('shows nothing when the design cannot be read', async () => {
    vi.mocked(loadDesign).mockResolvedValue(err(storageNotFound('missing')));

    const { result } = renderHook(() => useLinkedDesignInterior(DESIGN));

    await waitFor(() => expect(loadDesign).toHaveBeenCalled());
    expect(result.current).toBeNull();
  });

  it('drops the cached reading when cleared', async () => {
    vi.mocked(loadDesign).mockResolvedValue(
      ok({ id: DESIGN, name: 'Pens', params: { ...DEFAULT_BIN_PARAMS } }) as never
    );

    const first = renderHook(() => useLinkedDesignInterior(DESIGN));
    await waitFor(() => expect(first.result.current).not.toBeNull());
    first.unmount();

    clearLinkedDesignInteriorCache();

    const second = renderHook(() => useLinkedDesignInterior(DESIGN));
    await waitFor(() => expect(second.result.current).not.toBeNull());
    expect(loadDesign).toHaveBeenCalledTimes(2);
  });
});
