import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Check, Copy, Inbox } from 'lucide-react'
import type { Level } from '../lib/types'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

export function Card({ children, className, ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div {...rest} className={cx('card rounded-xl border border-line bg-surface', className)}>{children}</div>
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export function Button({ variant = 'secondary', size = 'md', className, ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md' }) {
  const v = {
    primary: 'bg-accent text-white hover:bg-accent-hover border-transparent dark:text-[#0f1115]',
    secondary: 'bg-surface hover:bg-surface2 border-line text-fg',
    ghost: 'bg-transparent hover:bg-surface2 border-transparent text-muted hover:text-fg',
    danger: 'bg-transparent hover:bg-bad/10 border-bad/40 text-bad',
  }[variant]
  return (
    <button {...p} className={cx(
      'inline-flex items-center justify-center gap-1.5 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-1.5 text-sm', v, className)} />
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'bad'; className?: string }) {
  const t = {
    neutral: 'bg-surface2 text-muted', accent: 'bg-accent-soft text-accent',
    ok: 'bg-ok/10 text-ok', warn: 'bg-warn/10 text-warn', bad: 'bg-bad/10 text-bad',
  }[tone]
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-medium', t, className)}>{children}</span>
}

export const levelTone = (l: string): 'ok' | 'warn' | 'bad' | 'accent' =>
  l === 'beginner' ? 'ok' : l === 'intermediate' ? 'warn' : l === 'advanced' ? 'bad' : 'accent'
export const LevelBadge = ({ level }: { level: Level | string }) => <Badge tone={levelTone(level)}>{level}</Badge>

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded-full bg-surface2', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent transition-all duration-300" style={{ width: `${v}%` }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line px-6 py-10 text-center">
      <Inbox size={22} className="text-muted" />
      <div className="font-medium">{title}</div>
      {hint && <div className="max-w-sm text-sm text-muted">{hint}</div>}
      {action}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) { return <div className={cx('skeleton', className)} /> }

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      <Skeleton className="h-64" />
    </div>
  )
}

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      aria-label="Copy code"
      className={cx('inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[11px] text-muted hover:text-fg', className)}
      onClick={async () => {
        try { await navigator.clipboard.writeText(text) } catch {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove()
        }
        setDone(true); window.setTimeout(() => setDone(false), 1400)
      }}>
      {done ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
    </button>
  )
}

export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-line bg-surface p-5" onMouseDown={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-lg font-semibold">{title}</h3>
        <div className="text-sm">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-surface2 p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('rounded-md px-3 py-1 text-sm transition-colors', value === t.id ? 'bg-surface font-medium text-fg shadow-sm' : 'text-muted hover:text-fg')}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label?: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm">
      {label && <span className="text-muted">{label}</span>}
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-fg">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </Card>
  )
}
