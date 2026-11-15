import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DimensionsSection } from './DimensionsSection';
import { useLayoutStore } from '@/core/store/layout';
import { DEFAULT_BASEPLATE_PARAMS } from '@/core/baseplateDefaults';
import type { StoredBaseplateParams } from '@/core/types';
import { mm } from '@/core/types';
import { resetAllStores } from '@/test/testUtils';

vi.mock('@/i18n', async () => await import('@/test/mocks/i18nEcho'));

// Rendered through DimensionsSection, which decides when the control is offered.
describe('MarginInfillControl', () => {
  beforeEach(() => {
    resetAllStores();
  });

  function padded(patch: Partial<StoredBaseplateParams> = {}): void {
    const current = useLayoutStore.getState().layout.baseplateParams ?? DEFAULT_BASEPLATE_PARAMS;
    useLayoutStore.getState().setBaseplateParams({
      ...current,
      paddingLeft: mm(7),
      paddingRight: mm(5),
      paddingFront: mm(3.5),
      paddingBack: mm(3.5),
      ...patch,
    });
  }
  const option = (name: string) => screen.getByRole('radio', { name });
  const stored = () => useLayoutStore.getState().layout.baseplateParams?.marginInfill;

  it('switches between solid, ribbed and pads, storing nothing for solid', () => {
    padded();
    render(<DimensionsSection />);
    fireEvent.click(option('baseplate.marginFill.ribbed'));
    expect(stored()).toBe('ribbed');
    expect(screen.getByText('baseplate.marginFill.ribbedHint')).toBeInTheDocument();
    fireEvent.click(option('baseplate.marginFill.pads'));
    expect(stored()).toBe('pads');
    expect(screen.getByText('baseplate.marginFill.padsHint')).toBeInTheDocument();
    fireEvent.click(option('baseplate.marginFill.solid'));
    expect(stored()).toBeUndefined();
  });

  it('is not offered without padding', () => {
    render(<DimensionsSection />);
    expect(screen.queryByRole('radiogroup', { name: 'baseplate.marginFill' })).toBeNull();
  });

  it('locks the fills while over-tile already fills the margin', () => {
    padded({ overTile: true });
    render(<DimensionsSection />);
    expect(option('baseplate.marginFill.ribbed')).toBeDisabled();
    expect(option('baseplate.marginFill.pads')).toBeDisabled();
  });

  it('keeps a fill chosen before over-tile switchable back to solid, and says why', () => {
    padded({ overTile: true, marginInfill: 'pads' });
    render(<DimensionsSection />);
    expect(screen.getByText('baseplate.marginFill.overTile')).toBeInTheDocument();
    fireEvent.click(option('baseplate.marginFill.solid'));
    expect(stored()).toBeUndefined();
  });

  it('offers pads but not ribs when every edge is too narrow for ribs', () => {
    padded({ paddingLeft: mm(2), paddingRight: mm(2), paddingFront: mm(2), paddingBack: mm(2) });
    render(<DimensionsSection />);
    expect(option('baseplate.marginFill.ribbed')).toBeDisabled();
    expect(option('baseplate.marginFill.pads')).toBeEnabled();
  });
});
