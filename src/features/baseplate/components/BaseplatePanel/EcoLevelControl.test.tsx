import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BaseSection } from './BaseSection';
import { useLayoutStore } from '@/core/store/layout';
import { useBaseplatePageStore } from '../../store/baseplatePageStore';
import { DEFAULT_BASEPLATE_PARAMS } from '@/core/baseplateDefaults';
import type { StoredBaseplateParams } from '@/core/types';
import { resetAllStores } from '@/test/testUtils';

vi.mock('@/i18n', async () => await import('@/test/mocks/i18nEcho'));

// Rendered through BaseSection, which offers it while the eco plate is on.
describe('EcoLevelControl', () => {
  beforeEach(() => {
    resetAllStores();
    useBaseplatePageStore.getState().setTiling(null);
  });

  function plate(patch: Partial<StoredBaseplateParams>): void {
    useLayoutStore.getState().setBaseplateParams({ ...DEFAULT_BASEPLATE_PARAMS, ...patch });
  }
  const option = (name: string) => screen.getByRole('radio', { name });
  const stored = () => useLayoutStore.getState().layout.baseplateParams?.ecoLevel;

  it('is offered only while the eco plate is on', () => {
    plate({ ecoPlate: undefined });
    render(<BaseSection />);
    expect(screen.queryByRole('radiogroup', { name: 'baseplate.ecoLevel' })).toBeNull();
  });

  it('switches to ultra light and back, storing nothing for standard', () => {
    plate({ ecoPlate: true, magnetHoles: false });
    render(<BaseSection />);
    expect(option('baseplate.ecoLevel.standard')).toBeChecked();
    fireEvent.click(option('baseplate.ecoLevel.ultra'));
    expect(stored()).toBe('ultra');
    expect(screen.getByText('baseplate.ecoLevel.ultraHint')).toBeInTheDocument();
    fireEvent.click(option('baseplate.ecoLevel.standard'));
    expect(stored()).toBeUndefined();
  });

  it('says what rules ultra light out, since the plate then prints as standard eco', () => {
    plate({ ecoPlate: true, ecoLevel: 'ultra', magnetHoles: true });
    render(<BaseSection />);
    expect(screen.getByText('baseplate.ecoLevel.blocked.magnets')).toBeInTheDocument();
    expect(screen.queryByText('baseplate.ecoLevel.ultraHint')).toBeNull();
  });
});
