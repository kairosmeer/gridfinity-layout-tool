import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BentoCompartmentFloorControls } from './BentoCompartmentFloorControls';
import { useDesignerStore } from '@/features/bin-designer/store/designer';

vi.mock('@/i18n', async () => await import('@/test/mocks/i18nEcho'));

describe('BentoCompartmentFloorControls', () => {
  beforeEach(() => {
    useDesignerStore.setState(useDesignerStore.getInitialState());
    useDesignerStore.getState().setCompartmentGrid(2, 1);
  });

  it('writes the raise for its own compartment', () => {
    render(<BentoCompartmentFloorControls compartmentId={1} />);
    fireEvent.change(screen.getByRole('slider', { name: 'binDesigner.bento.floorRaise' }), {
      target: { value: '9' },
    });
    expect(useDesignerStore.getState().params.compartments.floorRaises).toEqual([null, 9]);
  });

  it('caps the slider at what the bin can hold', () => {
    render(<BentoCompartmentFloorControls compartmentId={0} />);
    const max = Number(
      screen.getByRole('slider', { name: 'binDesigner.bento.floorRaise' }).getAttribute('max')
    );
    const { height, heightUnitMm } = useDesignerStore.getState().params;
    expect(max).toBeGreaterThan(0);
    expect(max).toBeLessThan(height * heightUnitMm);
  });

  it('renders nothing when the bin has no pocket to spare', () => {
    useDesignerStore.getState().setParam('height', 1);
    const { container } = render(<BentoCompartmentFloorControls compartmentId={0} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('fills the compartment with pockets for a picked item and counts them', () => {
    useDesignerStore.getState().setParam('height', 6);
    render(<BentoCompartmentFloorControls compartmentId={0} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'binDesigner.bento.holder.label' }), {
      target: { value: 'aa' },
    });
    const { compartments } = useDesignerStore.getState().params;
    expect(compartments.holders).toEqual(['aa']);
    expect(compartments.floorRaises).toEqual([15]);
    expect(screen.getByText(/binDesigner\.bento\.holder\.count/)).toBeInTheDocument();
    expect(
      screen.getByRole('slider', { name: 'binDesigner.bento.holder.depth' })
    ).toBeInTheDocument();
  });

  it('offers no items in a merged outline', () => {
    useDesignerStore.getState().setCompartmentGrid(2, 2);
    useDesignerStore.getState().mergeCells([0, 1]);
    useDesignerStore.setState((s) => ({
      params: { ...s.params, compartments: { ...s.params.compartments, cells: [0, 0, 0, 1] } },
    }));
    render(<BentoCompartmentFloorControls compartmentId={0} />);
    expect(screen.getByRole('combobox', { name: 'binDesigner.bento.holder.label' })).toBeDisabled();
    expect(screen.getByText('binDesigner.bento.holder.needsRectangle')).toBeInTheDocument();
  });
});
