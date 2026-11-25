import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { useAuth, profileOf } from './auth'
import { emptyTables, loadRows, pushDiff, stateToTables, tablesToState, type Tables } from './cloudSync'
import { supabase } from './supabase'
import { useTheme, useToast } from './theme'
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
    profile: { name: '' }, drafts: {}, submissions: {}, activeAssessment: null, activeInterview: null,
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
  return { ...base, ...r, settings: { ...base.settings, ...(r.settings ?? {}) }, profile: { ...base.profile, ...(r.profile ?? {}) }, v: 1 }
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

interface Ctx {
  state: AppState
  ready: boolean
  /** Set when the signed-in user's data could not be loaded. Nothing is saved until a reload succeeds. */
  loadError: boolean
  saveStatus: SaveStatus
  update: (fn: (s: AppState) => AppState) => void
  log: (type: string, label: string) => void
  addStudy: (minutes: number) => void
  replace: (s: AppState) => void
  /** Cloud mode: write any pending changes now (used before sign-out). Resolves true when everything is saved. */
  saveNow: () => Promise<boolean>
  /** Cloud mode: try loading the user's data again after a failed load. */
  retryLoad: () => void
}
const StoreCtx = createContext<Ctx | null>(null)

const SAVE_DELAY = 600
const RETRY_DELAY = 8000

export function StoreProvider({ children }: { children: ReactNode }) {
  const { enabled: cloud, user } = useAuth()
  const { theme, setTheme } = useTheme()
  const toast = useToast()
  const uid = user?.id ?? null
  const [state, setState] = useState<AppState>(defaultState)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [attempt, setAttempt] = useState(0)
  const dirty = useRef(false)
  const timer = useRef<number | undefined>(undefined)
  // Cloud sync bookkeeping: what the database currently holds, and whether a push is running.
  const snapshot = useRef<Tables>(emptyTables())
  const loadedFor = useRef<string | null>(null)
  const pushing = useRef<Promise<boolean> | null>(null)
  const latest = useRef({ state, theme, user })
  useEffect(() => { latest.current = { state, theme, user } })
  const errorShown = useRef(false)
  const pushRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true))

  // A different account (or a retry) starts from a blank, not-ready store, so one user's data is never shown to another.
  const loadKey = cloud ? `${uid ?? ''}:${attempt}` : ''
  const [seenKey, setSeenKey] = useState(loadKey)
  if (seenKey !== loadKey) {
    setSeenKey(loadKey)
    setState(defaultState()); setReady(false); setLoadError(false); setSaveStatus('idle')
  }

  // ---- local backend / browser storage (no Supabase configured)
  useEffect(() => {
    if (cloud) return
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
  }, [cloud])

  useEffect(() => {
    if (cloud || !ready || !dirty.current) return
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)) } catch { /* quota */ }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      api.put('/api/state/app', { value: state }).catch(() => { /* retried on next change; LS holds a copy */ })
    }, 350)
  }, [state, ready, cloud])

  // ---- Supabase: load the signed-in user's records
  useEffect(() => {
    if (!cloud) return
    let cancelled = false
    window.clearTimeout(timer.current)
    loadedFor.current = null
    dirty.current = false
    snapshot.current = emptyTables()
    errorShown.current = false
    if (!uid || !supabase) return
    try { localStorage.removeItem(LS_KEY) } catch { /* the cloud is the only source of truth for progress */ }
    ;(async () => {
      try {
        const rows = await loadRows(supabase)
        if (cancelled) return
        const res = tablesToState(rows, defaultState())
        let next = res.state
        if (res.theme) setTheme(res.theme)
        const th = res.theme ?? latest.current.theme
        if (res.hasProfile) {
          snapshot.current = stateToTables(next, th, uid)
        } else {
          // First sign-in: start clean, greet with the Google name, and create the profile row.
          const g = profileOf(latest.current.user).name
          if (g) next = { ...next, profile: { ...next.profile, name: g.slice(0, 40) } }
          dirty.current = true
        }
        loadedFor.current = uid
        setState(normalise(next)); setReady(true)
      } catch {
        if (!cancelled) setLoadError(true)
      }
    })()
    return () => { cancelled = true }
  }, [cloud, uid, attempt, setTheme])

  const push = useCallback((): Promise<boolean> => {
    if (!supabase || !uid || loadedFor.current !== uid) return Promise.resolve(true)
    if (pushing.current) return pushing.current.then(() => pushRef.current())
    const { state: s, theme: th } = latest.current
    const next = stateToTables(s, th, uid)
    setSaveStatus('saving')
    const run = pushDiff(supabase, uid, snapshot.current, next).then((r) => {
      pushing.current = null
      if (loadedFor.current !== uid) return true
      snapshot.current = r.snapshot
      setSaveStatus(r.ok ? 'saved' : 'error')
      if (r.ok) errorShown.current = false
      else {
        if (!errorShown.current) { errorShown.current = true; toast('Could not save your latest changes. Retrying shortly.', 'error') }
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => { void pushRef.current() }, RETRY_DELAY)
      }
      return r.ok
    })
    pushing.current = run
    return run
  }, [uid, toast])
  useEffect(() => { pushRef.current = push }, [push])

  useEffect(() => {
    if (!cloud || !ready || !uid) return
    // A theme change on its own is also worth saving.
    const savedTheme = snapshot.current.profiles.get(uid)?.theme
    if (savedTheme !== undefined && theme !== savedTheme) dirty.current = true
    if (!dirty.current) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { void push() }, SAVE_DELAY)
    return () => window.clearTimeout(timer.current)
  }, [state, theme, ready, cloud, uid, push])

  // Save as soon as the tab is hidden or closed so recent edits are not lost.
  useEffect(() => {
    if (!cloud) return
    const flush = () => { if (document.visibilityState === 'hidden' && dirty.current) void push() }
    document.addEventListener('visibilitychange', flush)
    window.addEventListener('pagehide', flush)
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush) }
  }, [cloud, push])

  const saveNow = useCallback(async () => {
    window.clearTimeout(timer.current)
    return cloud && dirty.current ? push() : true
  }, [cloud, push])
  const retryLoad = useCallback(() => setAttempt((a) => a + 1), [])

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

  const value = useMemo(
    () => ({ state, ready, loadError, saveStatus, update, log, addStudy, replace, saveNow, retryLoad }),
    [state, ready, loadError, saveStatus, update, log, addStudy, replace, saveNow, retryLoad],
  )
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

const MAX_DRAFT = 50_000

/**
 * Editor text that survives navigation and restarts. Keeps a local copy for instant typing and writes it to
 * the persisted store shortly after you stop typing, when the key changes, and on unmount.
 */
export function useDraft(key: string, fallback: string): [string, (v: string) => void] {
  const { state, update } = useStore()
  const [cur, setCur] = useState(() => ({ key, value: state.drafts[key] ?? fallback }))
  let value = cur.value
  if (cur.key !== key) { value = state.drafts[key] ?? fallback; setCur({ key, value }) }
  const pending = useRef<{ key: string; value: string } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  const flush = useCallback(() => {
    window.clearTimeout(timer.current)
    const p = pending.current
    if (!p) return
    pending.current = null
    update((s) => ({ ...s, drafts: { ...s.drafts, [p.key]: p.value.slice(0, MAX_DRAFT) } }))
  }, [update])
  useEffect(() => flush, [key, flush])

  const set = useCallback((v: string) => {
    setCur({ key, value: v })
    pending.current = { key, value: v }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(flush, 300)
  }, [key, flush])
  return [value, set]
}

/** Calls `save(value)` shortly after `value` stops changing, and once more on unmount if anything is unsaved. */
export function useAutosave<T>(value: T, save: (v: T) => void, ms = 300) {
  const latest = useRef(value)
  const saved = useRef(value)
  const saveRef = useRef(save)
  useEffect(() => { saveRef.current = save })
  useEffect(() => {
    latest.current = value
    if (Object.is(saved.current, value)) return
    const id = window.setTimeout(() => { saved.current = value; saveRef.current(value) }, ms)
    return () => window.clearTimeout(id)
  }, [value, ms])
  useEffect(() => () => {
    if (!Object.is(saved.current, latest.current)) { saved.current = latest.current; saveRef.current(latest.current) }
  }, [])
}
