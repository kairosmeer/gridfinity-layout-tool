import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { designId } from '@/core/types';
import { useLinkedDesignInterior } from '../../hooks/useLinkedDesignInterior';
import { BinInteriorSize } from './BinInteriorSize';

vi.mock('../../hooks/useLinkedDesignInterior', () => ({
  useLinkedDesignInterior: vi.fn(),
}));

const DESIGN = designId('design-1');

/** The placed bin: 3 wide, 2 deep, 7u tall. */
const BIN = { width: 3, depth: 2, height: 7 } as const;

const UNITS = { gridUnitMm: 42, heightUnitMm: 7 } as const;

function renderSize(
  overrides: Partial<{
    linkedDesignId: typeof DESIGN | undefined;
    binSize: { width: number; depth: number; height: number };
    wallThicknessMm: number;
  }> = {}
) {
  return render(
    <BinInteriorSize
      linkedDesignId={'linkedDesignId' in overrides ? overrides.linkedDesignId : DESIGN}
      binSize={overrides.binSize ?? BIN}
      units={UNITS}
      wallThicknessMm={overrides.wallThicknessMm ?? 1.2}
    />
  );
}

describe('BinInteriorSize', () => {
  beforeEach(() => {
    vi.mocked(useLinkedDesignInterior).mockReturnValue(null);
  });

  it('shows nothing for a linked design with no measurable cavity', () => {
    const { container } = renderSize();

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the exact inside size when the bin is the design’s own size', () => {
    vi.mocked(useLinkedDesignInterior).mockReturnValue({
      interior: { widthMm: 123.9, depthMm: 81.9, heightMm: 42 },
      design: { width: 3, depth: 2, height: 7 },
    });

    renderSize();

    expect(screen.getByText('123.9 × 81.9 × 42 mm')).toBeInTheDocument();
    expect(screen.getByText('Inside')).toBeInTheDocument();
  });

  it('swaps width and depth when the bin is the design turned 90°', () => {
    vi.mocked(useLinkedDesignInterior).mockReturnValue({
      interior: { widthMm: 123.9, depthMm: 81.9, heightMm: 42 },
      design: { width: 3, depth: 2, height: 7 },
    });

    renderSize({ binSize: { width: 2, depth: 3, height: 7 } });

    expect(screen.getByText('81.9 × 123.9 × 42 mm')).toBeInTheDocument();
  });

  it('estimates from the footprint once the bin is resized away from its design', () => {
    vi.mocked(useLinkedDesignInterior).mockReturnValue({
      interior: { widthMm: 81.1, depthMm: 81.1, heightMm: 14 },
      design: { width: 2, depth: 2, height: 3 },
    });

    renderSize();

    expect(screen.getByText('≈ 123.1 × 81.1 × 42 mm')).toBeInTheDocument();
  });

  it('estimates an unlinked bin from its footprint and the assumed wall', () => {
    renderSize({
      linkedDesignId: undefined,
      binSize: { width: 2, depth: 2, height: 3 },
    });

    expect(useLinkedDesignInterior).toHaveBeenCalledWith(undefined);
    expect(screen.getByText('≈ 81.1 × 81.1 × 14 mm')).toBeInTheDocument();
  });

  it('uses the depth-axis pitch on a non-square grid', () => {
    render(
      <BinInteriorSize
        linkedDesignId={undefined}
        binSize={{ width: 2, depth: 2, height: 3 }}
        units={{ gridUnitMm: 42, gridUnitMmY: 22, heightUnitMm: 7 }}
        wallThicknessMm={1.2}
      />
    );

    expect(screen.getByText('≈ 81.1 × 41.1 × 14 mm')).toBeInTheDocument();
  });

  it('reads the hook for the bin it was given', () => {
    renderSize();

    expect(useLinkedDesignInterior).toHaveBeenCalledWith(DESIGN);
  });
});
