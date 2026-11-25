import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle, X } from 'lucide-react'

export type Theme = 'dark' | 'light'
const THEME_KEY = 'delab.theme'

function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark' } catch { return 'dark' }
}

interface ThemeCtx { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }
const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => {}, setTheme: () => {} })

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem(THEME_KEY, theme) } catch { /* ignore */ }
  }, [theme])
  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), [])
  const v = useMemo(() => ({ theme, toggle, setTheme }), [theme, toggle])
  return <ThemeContext.Provider value={v}>{children}</ThemeContext.Provider>
}
export const useTheme = () => useContext(ThemeContext)

// ---------------------------------------------------------------- toasts
type ToastKind = 'success' | 'error' | 'info'
interface Toast { id: number; kind: ToastKind; text: string }
interface ToastCtx { toast: (text: string, kind?: ToastKind) => void }
const ToastContext = createContext<ToastCtx>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = Date.now() + Math.random()
    setItems((t) => [...t, { id, kind, text }].slice(-4))
    window.setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])
  const v = useMemo(() => ({ toast }), [toast])
  const icon = { success: <CheckCircle2 size={16} className="text-ok" />, error: <XCircle size={16} className="text-bad" />, info: <Info size={16} className="text-accent" /> }
  return (
    <ToastContext.Provider value={v}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2" role="status" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="toast-in flex min-w-64 max-w-sm items-start gap-2.5 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm shadow-lg">
            <span className="mt-0.5">{icon[t.kind]}</span>
            <span className="flex-1">{t.text}</span>
            <button aria-label="Dismiss" className="text-muted hover:text-fg" onClick={() => setItems((x) => x.filter((i) => i.id !== t.id))}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
export const useToast = () => useContext(ToastContext).toast
