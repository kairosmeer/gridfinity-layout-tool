import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { STAGING_ID } from '@/core/constants';
import {
  binId,
  categoryId,
  gridUnits,
  heightUnits,
  layerId,
  mm,
  type Bin,
  type BinId,
} from '@/core/types';
import { useLayoutStore, useSelectionStore, useSettingsStore } from '@/core/store';
import { createTestLayout, resetAllStores } from '@/test/testUtils';
import { FitContentsSection } from './FitContentsSection';

const LAYER = layerId('layer1');
const BIN = binId('bin1');

function makeBin(overrides: Partial<Bin> = {}): Bin {
  return {
    id: BIN,
    layerId: LAYER,
    x: gridUnits(0),
    y: gridUnits(0),
    width: gridUnits(2),
    depth: gridUnits(2),
    height: heightUnits(3),
    category: categoryId('cat1'),
    label: '',
    notes: '',
    ...overrides,
  };
}

function setup(
  options: {
    bin?: Bin;
    selected?: BinId[];
    layout?: Parameters<typeof createTestLayout>[0];
    wallThicknessMm?: number;
  } = {}
) {
  resetAllStores();
  useLayoutStore.setState({
    layout: createTestLayout({
      bins: options.bin === undefined ? [makeBin()] : [options.bin],
      ...options.layout,
    }),
  });
  useSelectionStore.setState({
    selectedBinIds: options.selected ?? [BIN],
    activeLayerId: LAYER,
    activeCategoryId: categoryId('cat1'),
  });
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      wallThicknessMm: options.wallThicknessMm ?? 0.8,
    },
  }));
}

function typeItem(length: string, width: string, height?: string) {
  fireEvent.change(screen.getByLabelText('Item length (mm)'), { target: { value: length } });
  fireEvent.change(screen.getByLabelText('Item width (mm)'), { target: { value: width } });
  if (height !== undefined) {
    fireEvent.change(screen.getByLabelText('Item height (mm)'), { target: { value: height } });
  }
}

describe('FitContentsSection', () => {
  beforeEach(() => {
    setup();
  });

  it('suggests the smallest bin for the measured item', () => {
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    expect(screen.getByText('Smallest bin 3 × 2 × 7u')).toBeInTheDocument();
    expect(screen.getByText('Inside 123.9 × 81.9 × 42 mm')).toBeInTheDocument();
  });

  it('applies the suggested size to the selected bin', () => {
    render(<FitContentsSection />);
    typeItem('100', '75', '40');
    fireEvent.click(screen.getByText('Apply size'));

    expect(useLayoutStore.getState().layout.bins[0]).toMatchObject({
      width: 3,
      depth: 2,
      height: 7,
    });
  });

  it('keeps the selected bin height when no item height is typed', () => {
    setup({ bin: makeBin({ height: heightUnits(5) }) });
    render(<FitContentsSection />);
    typeItem('100', '75');

    expect(screen.getByText('Smallest bin 3 × 2 × 5u')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Apply size'));
    expect(useLayoutStore.getState().layout.bins[0]).toMatchObject({
      width: 3,
      depth: 2,
      height: 5,
    });
  });

  it('disables Apply when the bin is already the suggested size', () => {
    setup({ bin: makeBin({ width: gridUnits(3), depth: gridUnits(2), height: heightUnits(7) }) });
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    expect(screen.getByText('Apply size').closest('button')).toBeDisabled();
  });

  it('has nothing to apply until both floor measurements are entered', () => {
    render(<FitContentsSection />);
    fireEvent.change(screen.getByLabelText('Item length (mm)'), { target: { value: '100' } });

    expect(screen.queryByText('Apply size')).not.toBeInTheDocument();
    expect(screen.queryByText('Add to stash')).not.toBeInTheDocument();
  });

  it('adds the suggested size to the stash when nothing is selected', () => {
    setup({ selected: [] });
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    fireEvent.click(screen.getByText('Add to stash'));

    const bins = useLayoutStore.getState().layout.bins;
    expect(bins).toHaveLength(2);
    expect(bins[1]).toMatchObject({
      layerId: STAGING_ID,
      width: 3,
      depth: 2,
      height: 7,
    });
  });

  it('explains when the item is too large for any bin', () => {
    render(<FitContentsSection />);
    typeItem('700', '10');

    expect(
      screen.getByText('Too big for the largest bin. Try smaller contents.')
    ).toBeInTheDocument();
    expect(screen.queryByText('Apply size')).not.toBeInTheDocument();
  });

  it('says when the suggestion turns the item', () => {
    setup({
      layout: { gridUnitMm: mm(80), gridUnitMmY: mm(20) },
    });
    render(<FitContentsSection />);
    typeItem('85', '45');

    expect(screen.getByText('Smallest bin 1 × 5 × 3u')).toBeInTheDocument();
    expect(screen.getByText('Turns the item 90° to fit.')).toBeInTheDocument();
  });

  it('clears the fields and refocuses length after adding to the stash', () => {
    setup({ selected: [] });
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    fireEvent.click(screen.getByText('Add to stash'));

    expect(screen.getByLabelText('Item length (mm)')).toHaveValue(null);
    expect(screen.getByLabelText('Item width (mm)')).toHaveValue(null);
    expect(screen.getByLabelText('Item height (mm)')).toHaveValue(null);
    expect(screen.getByLabelText('Item length (mm)')).toHaveFocus();
  });

  it('clears the fields after applying the size', () => {
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    fireEvent.click(screen.getByText('Apply size'));

    expect(screen.getByLabelText('Item length (mm)')).toHaveValue(null);
    expect(screen.getByLabelText('Item length (mm)')).toHaveFocus();
  });

  it('adds to the stash when Enter is pressed in a field', () => {
    setup({ selected: [] });
    render(<FitContentsSection />);
    typeItem('100', '75', '40');

    fireEvent.submit(screen.getByLabelText('Item height (mm)'));

    expect(useLayoutStore.getState().layout.bins).toHaveLength(2);
  });

  it('keeps the height info dot out of the Tab order', () => {
    render(<FitContentsSection />);

    expect(screen.getByRole('button', { name: /Item height/ })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByLabelText('Item height (mm)')).toHaveAccessibleDescription(/current height/);
  });
});
