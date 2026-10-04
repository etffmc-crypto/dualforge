import type { PropsWithChildren } from 'react';
export function Card({ title, children, className = '' }: PropsWithChildren<{ title?: string; className?: string }>) {
  return <section className={`card ${className}`}>{title && <h3 className="card-title">{title}</h3>}{children}</section>;
}
