import { useDesignerStore } from '@/features/bin-designer/store';
import { binHasText } from '@/features/bin-designer/utils/binText';
import { PanelSection } from '@/shared/components/PanelSection';
import { TypeSection } from '../../TypeSection';
import { ColorsSection } from '../../ColorsSection';
import { WallSurfaceSection } from '../../WallsSection';

/** Appearance: typography, colors, wall patterns and text. The floor is on the Interior page. */
export function StylePage() {
  const hasText = useDesignerStore((s) => binHasText(s.params));
  return (
    <div className="divide-y divide-stroke-subtle/50">
      {hasText && (
        <PanelSection helpTarget="bd-type">
          <TypeSection />
        </PanelSection>
      )}
      <PanelSection helpTarget="bd-colors">
        <ColorsSection />
      </PanelSection>
      <PanelSection helpTarget="bd-wall-style">
        <WallSurfaceSection />
      </PanelSection>
    </div>
  );
}
