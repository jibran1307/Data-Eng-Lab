import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import type { AppState } from './types'

export const LS_KEY = 'delab.state'
export const DAY = 86_400_000

export function defaultState(): AppState {
  return {
    v: 1, completed: {}, bookmarks: [], notes: {}, quiz: {}, exercises: {}, projects: {}, scenarios: {},
    assessments: [], assessmentSeen: {}, lastAssessmentQs: [], interviews: [], askedQs: {}, mixSignatures: [],
    customQuestions: [], activity: [], studyMinutes: {}, revisions: {},
    settings: { dailyTargetMin: 60, weeklyGoalLessons: 5, revisionIntervals: [1, 3, 7, 16, 35], interviewHistoryWindow: 1 },
    startedAt: Date.now(),
  }
}

export const dayKey = (ts = Date.now()) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Merge a stored object with defaults so older/partial saves never crash the UI. */
export function normalise(raw: unknown): AppState {
  const base = defaultState()
  if (!raw || typeof raw !== 'object') return base
  const r = raw as Partial<AppState>
  return { ...base, ...r, settings: { ...base.settings, ...(r.settings ?? {}) }, v: 1 }
}

interface Ctx {
  state: AppState
  ready: boolean
  update: (fn: (s: AppState) => AppState) => void
  log: (type: string, label: string) => void
  addStudy: (minutes: number) => void
  replace: (s: AppState) => void
}
const StoreCtx = createContext<Ctx | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(defaultState)
  const [ready, setReady] = useState(false)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      let loaded: unknown = null
      try {
        const all = await api.get<Record<string, unknown>>('/api/state')
        loaded = all.app ?? null
      } catch { /* backend offline: fall back to local cache */ }
      if (!loaded) {
        try { loaded = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null') } catch { loaded = null }
      }
      if (!cancelled) { setState(normalise(loaded)); setReady(true) }
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!ready || !dirty.current) return
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch { /* quota */ }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api.put('/api/state/app', { value: state }).catch(() => { /* retried on next change; LS holds a copy */ })
    }, 350)
  }, [state, ready])

  const update = useCallback((fn: (s: AppState) => AppState) => {
    dirty.current = true
    setState((s) => fn(s))
  }, [])

  const log = useCallback((type: string, label: string) => {
    update((s) => ({ ...s, activity: [{ ts: Date.now(), type, label }, ...s.activity].slice(0, 300) }))
  }, [update])

  const addStudy = useCallback((minutes: number) => {
    if (minutes <= 0) return
    update((s) => {
      const k = dayKey()
      return { ...s, studyMinutes: { ...s.studyMinutes, [k]: Math.round(((s.studyMinutes[k] ?? 0) + minutes) * 10) / 10 } }
    })
  }, [update])

  const replace = useCallback((s: AppState) => { dirty.current = true; setState(normalise(s)) }, [])

  const value = useMemo(() => ({ state, ready, update, log, addStudy, replace }), [state, ready, update, log, addStudy, replace])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): Ctx {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

/** Records study time while a page is visible and mounted. Flushes every minute and on unmount. */
export function useStudyTimer(active = true) {
  const { addStudy } = useStore()
  useEffect(() => {
    if (!active) return
    let last = Date.now()
    const flush = () => {
      const now = Date.now()
      if (document.visibilityState === 'visible') addStudy((now - last) / 60000)
      last = now
    }
    const id = window.setInterval(flush, 60000)
    return () => { window.clearInterval(id); flush() }
  }, [active, addStudy])
}
