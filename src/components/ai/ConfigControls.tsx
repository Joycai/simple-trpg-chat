'use client';
import { useId, type InputHTMLAttributes, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Check } from 'lucide-react';
import { BadgeDropdown } from '@/components/shared/BadgeDropdown';
export function Field({ label, hint, trailing, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; trailing?: ReactNode }) {
  const id = useId();
  return <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={id} className="text-xs font-medium text-text-muted">{label}</label><div className="relative"><input {...props} id={id} className={`w-full min-w-0 appearance-none rounded-theme border border-input-border bg-input-bg px-3 py-2.5 text-sm text-text placeholder:text-text-dim outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50 ${trailing ? 'pr-12' : ''}`} />{trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}</div>{hint && <p className="text-xs leading-5 text-text-dim">{hint}</p>}</div>;
}
export function Choice({ label, value, options, onChange, disabled }: { label: string; value: string; options: { id: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="flex min-w-0 flex-col gap-1.5"><label htmlFor={id} className="text-xs font-medium text-text-muted">{label}</label><BadgeDropdown id={id} headerText={label} value={value} onChange={onChange} disabled={disabled} items={options.map(o => ({ ...o, badge: { letters: o.label.slice(0, 2) } }))} /></div>;
}
export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className="flex items-center gap-2 rounded-theme border border-border bg-input-bg px-3 py-2.5 text-left text-sm text-text outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50"><span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-theme border ${checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input-border'}`}>{checked && <Check className="h-3.5 w-3.5" />}</span>{label}</button>;
}
export function Action({ children, primary, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; primary?: boolean }) {
  return <button type="button" {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-theme border px-3 py-2 text-sm font-medium transition outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${primary ? 'border-primary bg-primary text-primary-foreground hover:bg-primary-hover' : 'border-border bg-surface text-text hover:bg-surface-alt'} ${props.className ?? ''}`}>{children}</button>;
}
