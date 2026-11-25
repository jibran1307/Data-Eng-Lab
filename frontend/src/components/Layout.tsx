import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Activity, BarChart3, BookOpen, Briefcase, ChevronLeft, ChevronRight, ClipboardCheck, Cloud, CloudOff, Code2, Database,
  FlaskConical, LayoutDashboard, LogOut, Menu, MessagesSquare, Moon, Search, Settings as SettingsIcon, Sun, Terminal, X, Waypoints,
} from 'lucide-react'
import { useTheme, useToast } from '../lib/theme'
import { profileOf, useAuth } from '../lib/auth'
import { cached } from '../lib/api'
import type { LessonIndex } from '../lib/types'
import { cx } from './ui'
import { initialsOf } from './Welcome'
import { useStore } from '../lib/store'

export const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/learn', label: 'Learning Path', icon: BookOpen },
  { to: '/sql', label: 'SQL Playground', icon: Database },
  { to: '/python', label: 'Python Playground', icon: Terminal },
  { to: '/projects', label: 'Hands-on Projects', icon: FlaskConical },
  { to: '/exercises', label: 'Exercises', icon: Code2 },
  { to: '/interviews', label: 'Mock Interviews', icon: MessagesSquare },
  { to: '/scenarios', label: 'Scenario Practice', icon: Waypoints },
  { to: '/assessments', label: 'Assessments', icon: ClipboardCheck },
  { to: '/progress', label: 'Progress & Analytics', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
] as const

const TITLES: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.to, n.label]))

function Crumbs() {
  const { pathname } = useLocation()
  const parts = pathname.split('/').filter(Boolean)
  const root = '/' + (parts[0] ?? '')
  const title = TITLES[root] ?? 'Data Engineering Lab'
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
      <Briefcase size={14} className="shrink-0 text-muted" />
      <span className="text-muted">Lab</span>
      <ChevronRight size={13} className="text-muted" />
      <span className={cx('truncate font-medium', parts.length > 1 && 'text-muted')}>{title}</span>
      {parts.length > 1 && (<><ChevronRight size={13} className="text-muted" /><span className="truncate font-medium">{decodeURIComponent(parts[1])}</span></>)}
    </nav>
  )
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [lessons, setLessons] = useState<LessonIndex[]>([])
  const nav = useNavigate()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { cached<LessonIndex[]>('/api/content/lessons').then(setLessons).catch(() => setLessons([])) }, [])
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ref.current?.querySelector('input')?.focus() } }
    document.addEventListener('mousedown', h); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('keydown', k) }
  }, [])

  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    const pages = NAV.filter((n) => n.label.toLowerCase().includes(s)).map((n) => ({ key: n.to, label: n.label, sub: 'Page', to: n.to }))
    const ls = lessons.filter((l) => (l.title + ' ' + l.summary).toLowerCase().includes(s)).slice(0, 8)
      .map((l) => ({ key: l.id, label: l.title, sub: `Lesson - ${l.module}`, to: `/learn/${l.id}` }))
    return [...pages, ...ls].slice(0, 10)
  }, [q, lessons])

  return (
    <div ref={ref} className="relative hidden w-72 md:block">
      <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
      <input
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
        placeholder="Search lessons and pages" aria-label="Global search"
        className="w-full rounded-lg border border-line bg-surface2 py-1.5 pl-8 pr-12 text-sm placeholder:text-muted focus:border-accent focus:outline-none"
        onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) { nav(results[0].to); setOpen(false); setQ('') } if (e.key === 'Escape') setOpen(false) }}
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-line px-1 text-[10px] text-muted">Ctrl K</kbd>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-lg border border-line bg-surface shadow-lg">
          {results.length === 0 ? <div className="px-3 py-3 text-sm text-muted">No results</div> : results.map((r) => (
            <button key={r.key} className="flex w-full flex-col px-3 py-2 text-left hover:bg-surface2"
              onClick={() => { nav(r.to); setOpen(false); setQ('') }}>
              <span className="text-sm">{r.label}</span><span className="text-xs text-muted">{r.sub}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  return (
    <button onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted hover:bg-surface2 hover:text-fg">
      {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
    </button>
  )
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('delab.sidebar') === '1')
  const loc = useLocation()
  const nav = useNavigate()
  const { state, saveStatus, saveNow } = useStore()
  const { enabled: cloud, user, signOut } = useAuth()
  const toast = useToast()
  const [leaving, setLeaving] = useState(false)
  const name = state.profile.name
  const google = profileOf(user)
  const logOut = async () => {
    setLeaving(true)
    // Write pending changes first so nothing is lost when the session ends.
    const saved = await saveNow()
    if (!saved) toast('Some recent changes could not be saved. Staying signed in so you can retry.', 'error')
    else await signOut()
    setLeaving(false)
  }
  // Overlays are tied to the route they were opened on, so navigating closes them without an effect.
  const [mobileAt, setMobileAt] = useState<string | null>(null)
  const [menuAt, setMenuAt] = useState<string | null>(null)
  const mobile = mobileAt === loc.pathname
  const menu = menuAt === loc.pathname
  const setMobile = (v: boolean) => setMobileAt(v ? loc.pathname : null)
  const setMenu = (fn: (m: boolean) => boolean) => setMenuAt(fn(menu) ? loc.pathname : null)
  useEffect(() => { localStorage.setItem('delab.sidebar', collapsed ? '1' : '0') }, [collapsed])

  const sidebar = (compact: boolean) => (
    <>
      <div className={cx('flex h-14 items-center gap-2.5 border-b border-line px-4', compact && 'justify-center px-0')}>
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-white dark:text-[#0f1115]"><Activity size={16} /></div>
        {!compact && <span className="truncate text-sm font-semibold tracking-tight">Data Engineering Lab</span>}
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto p-2" aria-label="Main navigation">
        {NAV.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} title={compact ? label : undefined}
            className={({ isActive }) => cx('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
              compact && 'justify-center', isActive ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}>
            <Icon size={17} className="shrink-0" />{!compact && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>
    </>
  )

  return (
    <div className="flex h-full">
      <aside className={cx('hidden shrink-0 flex-col border-r border-line bg-surface lg:flex', collapsed ? 'w-16' : 'w-60')}>
        {sidebar(collapsed)}
        <button onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="m-2 flex items-center justify-center gap-2 rounded-lg py-2 text-xs text-muted hover:bg-surface2 hover:text-fg">
          {collapsed ? <ChevronRight size={15} /> : <><ChevronLeft size={15} /> Collapse</>}
        </button>
      </aside>

      {mobile && (
        <div className="fixed inset-0 z-[80] lg:hidden" onClick={() => setMobile(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <aside className="absolute left-0 top-0 flex h-full w-64 flex-col border-r border-line bg-surface" onClick={(e) => e.stopPropagation()}>
            {sidebar(false)}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur">
          <button className="lg:hidden" aria-label="Open menu" onClick={() => setMobile(true)}>{mobile ? <X size={20} /> : <Menu size={20} />}</button>
          <div className="min-w-0 flex-1"><Crumbs /></div>
          <GlobalSearch />
          {cloud && (
            <span className="hidden items-center gap-1 text-xs text-muted sm:inline-flex" role="status" aria-live="polite"
              title={saveStatus === 'error' ? 'Changes could not be saved yet. Retrying automatically.' : 'Progress is saved to your account'}>
              {saveStatus === 'error' ? <CloudOff size={14} className="text-bad" /> : <Cloud size={14} />}
              {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'error' ? 'Not saved' : 'Saved'}
            </span>
          )}
          <ThemeToggle />
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-label="Profile menu" aria-expanded={menu}
              title={name || undefined} className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{initialsOf(name)}</button>
            {menu && (
              <div className="absolute right-0 top-10 z-50 w-48 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
                <div className="border-b border-line px-3 py-2"><div className="truncate text-sm font-medium">{name || google.name || 'Learner'}</div><div className="truncate text-xs text-muted">{cloud ? google.email : 'Local learner profile'}</div></div>
                <button className="block w-full px-3 py-2 text-left text-sm hover:bg-surface2" onClick={() => nav('/settings')}>Settings</button>
                <button className="block w-full px-3 py-2 text-left text-sm hover:bg-surface2" onClick={() => nav('/progress')}>My progress</button>
                {cloud && <button className="flex w-full items-center gap-2 border-t border-line px-3 py-2 text-left text-sm hover:bg-surface2 disabled:opacity-50" disabled={leaving} onClick={() => void logOut()}><LogOut size={14} />{leaving ? 'Signing out...' : 'Sign out'}</button>}
              </div>
            )}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1280px] p-4 sm:p-6 lg:p-8"><Outlet /></div>
        </main>
      </div>
    </div>
  )
}
