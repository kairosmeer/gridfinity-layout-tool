import type { ReactNode } from 'react';
import { useTranslation } from '@/i18n';
import { InfoDot } from './InfoDot';

/** An info dot named for the control it explains, for a label's slot. */
export function LabelInfo({
  label,
  children,
  skipTab,
}: {
  label: string;
  children: ReactNode;
  skipTab?: boolean;
}) {
  const t = useTranslation();
  return (
    <InfoDot aria-label={t('common.aboutLabel', { label })} skipTab={skipTab}>
      {typeof children === 'string' ? <p>{children}</p> : children}
    </InfoDot>
  );
}
