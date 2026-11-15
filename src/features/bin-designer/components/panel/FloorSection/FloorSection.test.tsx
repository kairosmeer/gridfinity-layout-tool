import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useDesignerStore } from '@/features/bin-designer/store';
import { DEFAULT_BIN_PARAMS, DEFAULT_UI_STATE } from '@/features/bin-designer/constants';
import { trackEvent } from '@/shared/analytics/posthog';
import en from '@/i18n/locales/en';
import { FloorSection } from './FloorSection';

vi.mock('@/shared/analytics/posthog', () => ({ trackEvent: vi.fn() }));

const tile = (name: string): HTMLElement => screen.getByRole('radio', { name: new RegExp(name) });

describe('FloorSection', () => {
  beforeEach(() => {
    useDesignerStore.setState({ params: { ...DEFAULT_BIN_PARAMS }, ui: { ...DEFAULT_UI_STATE } });
    vi.mocked(trackEvent).mockClear();
  });

  it('offers both floor types with the flat one chosen', () => {
    render(<FloorSection />);
    expect(tile(en['binDesigner.floor.type.flat'])).toHaveAttribute('aria-checked', 'true');
    expect(tile(en['binDesigner.floor.type.followsFeet'])).toHaveAttribute('aria-checked', 'false');
  });

  it('shows what the floor that follows the feet saves against the flat floor', () => {
    render(<FloorSection />);
    expect(tile(en['binDesigner.floor.type.followsFeet']).textContent).toMatch(/−\d+ g/);
  });

  it('lets the floor follow the feet and records the switch', () => {
    render(<FloorSection />);
    fireEvent.click(tile(en['binDesigner.floor.type.followsFeet']));
    expect(useDesignerStore.getState().params.base.lightweight).toBe(true);
    expect(trackEvent).toHaveBeenCalledWith('designer_floor_type_changed', {
      from: 'flat',
      to: 'followsFeet',
    });
  });

  it('greys out Follows feet under a scoop and keeps the hollow from below open', () => {
    useDesignerStore.setState({
      params: { ...DEFAULT_BIN_PARAMS, scoop: { ...DEFAULT_BIN_PARAMS.scoop, enabled: true } },
    });
    render(<FloorSection />);
    expect(tile(en['binDesigner.floor.type.followsFeet'])).toBeDisabled();
    const hollow = screen.getByRole('switch', { name: en['binDesigner.floor.hollowBelow'] });
    fireEvent.click(hollow);
    const { base, scoop } = useDesignerStore.getState().params;
    expect(base.lightweight).toBe(true);
    expect(base.lightweightMode).toBe('underside');
    expect(scoop.enabled).toBe(true);
  });

  it('holds the scoop, fillet, drainage and floor text in one place', () => {
    const { container } = render(<FloorSection />);
    for (const target of ['bd-scoop', 'bd-interior-fillet', 'bd-floor-pattern']) {
      expect(container.querySelector(`[data-help-target="${target}"]`), target).not.toBeNull();
    }
    expect(
      screen.getByRole('switch', { name: en['binDesigner.floor.text.heading'] })
    ).toBeVisible();
  });

  it('plays a clip of the floor that follows the feet from the dot beside its caption', () => {
    useDesignerStore.setState({
      params: { ...DEFAULT_BIN_PARAMS, base: { ...DEFAULT_BIN_PARAMS.base, lightweight: true } },
    });
    render(<FloorSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Watch a clip: Follows feet' }));
    expect(screen.getByText(en['binDesigner.featureTip.lightweightFloor'])).toBeInTheDocument();
  });

  it('says a spacer has no floor instead of offering one', () => {
    useDesignerStore.setState({
      params: { ...DEFAULT_BIN_PARAMS, base: { ...DEFAULT_BIN_PARAMS.base, spacer: true } },
    });
    render(<FloorSection />);
    expect(screen.getByText(en['binDesigner.floor.noFloor'])).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
  });

  it('still hollows a base-only bin from below', () => {
    useDesignerStore.setState({
      params: { ...DEFAULT_BIN_PARAMS, base: { ...DEFAULT_BIN_PARAMS.base, tile: true } },
    });
    render(<FloorSection />);
    expect(screen.getByRole('switch', { name: en['binDesigner.floor.hollowBelow'] })).toBeEnabled();
  });
});
