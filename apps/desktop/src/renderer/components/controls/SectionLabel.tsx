import type { PropsWithChildren } from 'react';

/** Section heading with the 3px accent bar on the left. */
export function SectionLabel({ children }: PropsWithChildren) {
  return <h4 className="section-label">{children}</h4>;
}
