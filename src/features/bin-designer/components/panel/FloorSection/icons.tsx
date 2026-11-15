/** Floor-type tile icons: a bin in section, its floor drawn heavier. */

import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
}

function Section({ size = 20, className = '', children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 4v14M20 4v14" />
      {children}
    </svg>
  );
}

export function FlatFloorIcon(props: IconProps) {
  return (
    <Section {...props}>
      <path d="M4 18h16M7 21h4M13 21h4" />
    </Section>
  );
}

export function FollowsFeetFloorIcon(props: IconProps) {
  return (
    <Section {...props}>
      <path d="M4 18h2l1 3h4l1-3h0l1 3h4l1-3h2" />
    </Section>
  );
}

export function RaisedFloorIcon(props: IconProps) {
  return (
    <Section {...props}>
      <path d="M4 18h16M4 12h16M8 15h2M14 15h2" />
    </Section>
  );
}
