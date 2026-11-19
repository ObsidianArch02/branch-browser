import type { ButtonHTMLAttributes, ReactNode } from 'react';

export function IconButton({ label, children, active, className = '', ...props }: { label: string; children: ReactNode; active?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} type="button" aria-label={label} data-tooltip={label} aria-pressed={active} className={`icon-button ${active ? 'is-active' : ''} ${className}`}>{children}</button>;
}
