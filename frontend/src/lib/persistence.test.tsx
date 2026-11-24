import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Welcome from '../components/Welcome'
import SavedAnswer, { submissionEntries } from '../components/SavedAnswer'
import { defaultState, normalise, StoreProvider, useDraft, useStore } from './store'

// Node 25 ships an experimental global `localStorage` that shadows jsdom's; use a deterministic in-memory store.
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  }
}
beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('upgrading from an older save', () => {
  it('keeps every existing field and adds the new ones with safe defaults', () => {
    // A state exactly as saved by the previous version: no profile, drafts, submissions or active sessions.
    const old = {
      v: 1, completed: { 'sql-basics': 1700000000000 }, bookmarks: ['a'], notes: { a: 'my note' }, quiz: {},
      exercises: { 'sql-01': { solved: true, attempts: 3, correct: 1, ts: 5 } }, projects: { p1: { s1: true } }, scenarios: {},
      assessments: [{ id: 'as-1', score: 80 }], assessmentSeen: {}, lastAssessmentQs: [], interviews: [], askedQs: { q1: 1 }, mixSignatures: [],
      customQuestions: [], activity: [], studyMinutes: { '2025-01-01': 42 }, revisions: {},
      settings: { dailyTargetMin: 90, weeklyGoalLessons: 5, revisionIntervals: [1, 3], interviewHistoryWindow: 2 }, startedAt: 123,
    }
    const s = normalise(old)
    expect(s.completed).toEqual(old.completed)
    expect(s.exercises['sql-01']).toEqual(old.exercises['sql-01'])
    expect(s.notes).toEqual({ a: 'my note' })
    expect(s.projects).toEqual(old.projects)
    expect(s.assessments).toHaveLength(1)
    expect(s.studyMinutes['2025-01-01']).toBe(42)
    expect(s.settings.dailyTargetMin).toBe(90)
    expect(s.startedAt).toBe(123)
    expect(s.profile).toEqual({ name: '' })
    expect(s.drafts).toEqual({})
    expect(s.submissions).toEqual({})
    expect(s.activeAssessment).toBeNull()
    expect(s.activeInterview).toBeNull()
  })

  it('loads an old browser save through the real provider without losing progress', async () => {
    localStorage.setItem('delab.state', JSON.stringify({ ...defaultState(), completed: { x: 1 }, profile: undefined, drafts: undefined }))
    function Probe() { const { state, ready } = useStore(); return <div>{ready ? `done:${Object.keys(state.completed).join(',')}:${state.profile.name === '' ? 'noname' : 'named'}` : 'loading'}</div> }
    render(<StoreProvider><Probe /></StoreProvider>)
    expect(await screen.findByText('done:x:noname')).toBeTruthy()
  })
})

describe('Welcome', () => {
  function Harness() { const { state } = useStore(); return <><Welcome /><span>name:{state.profile.name || 'none'}</span></> }
  it('asks for a name, rejects blanks, saves it and then goes away', async () => {
    render(<StoreProvider><Harness /></StoreProvider>)
    const input = await screen.findByLabelText('Your name')
    expect((screen.getByText('Get started') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '   ' } })
    expect((screen.getByText('Get started') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(input, { target: { value: '  Jibran   Khan ' } })
    fireEvent.click(screen.getByText('Get started'))
    expect(await screen.findByText('name:Jibran Khan')).toBeTruthy()
    expect(screen.queryByLabelText('Your name')).toBeNull()
  })
  it('does not ask again when a name already exists', async () => {
    localStorage.setItem('delab.state', JSON.stringify({ ...defaultState(), profile: { name: 'Sam' } }))
    render(<StoreProvider><Harness /></StoreProvider>)
    expect(await screen.findByText('name:Sam')).toBeTruthy()
    expect(screen.queryByLabelText('Your name')).toBeNull()
  })
})

describe('useDraft', () => {
  function Editor({ k }: { k: string }) {
    const [v, set] = useDraft(k, 'starter')
    return <textarea aria-label="ed" value={v} onChange={(e) => set(e.target.value)} />
  }
  function Toggle() { const [on, setOn] = useState(true); return <><button onClick={() => setOn(!on)}>toggle</button>{on && <Editor k="sql:free" />}</> }
  function Page({ show, k = 'sql:free' }: { show: boolean; k?: string }) { return <StoreProvider>{show && <Editor k={k} />}</StoreProvider> }

  it('starts from the fallback, then restores typed text after leaving and returning', async () => {
    const view = render(<StoreProvider><Toggle /></StoreProvider>)
    const ed = (await screen.findByLabelText('ed')) as HTMLTextAreaElement
    expect(ed.value).toBe('starter')
    fireEvent.change(ed, { target: { value: 'SELECT 42;' } })
    fireEvent.click(screen.getByText('toggle')) // unmount the editor (navigate away)
    expect(screen.queryByLabelText('ed')).toBeNull()
    fireEvent.click(screen.getByText('toggle')) // come back
    expect(((await screen.findByLabelText('ed')) as HTMLTextAreaElement).value).toBe('SELECT 42;')
    view.unmount()
  })

  it('keeps separate text per key and persists to localStorage', async () => {
    vi.useFakeTimers()
    const { rerender } = render(<Page show k="sql:a" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    fireEvent.change(screen.getByLabelText('ed'), { target: { value: 'A text' } })
    rerender(<Page show k="sql:b" />)
    expect((screen.getByLabelText('ed') as HTMLTextAreaElement).value).toBe('starter')
    fireEvent.change(screen.getByLabelText('ed'), { target: { value: 'B text' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1500) })
    const saved = JSON.parse(localStorage.getItem('delab.state') ?? '{}')
    expect(saved.drafts).toMatchObject({ 'sql:a': 'A text', 'sql:b': 'B text' })
    rerender(<Page show k="sql:a" />)
    expect((screen.getByLabelText('ed') as HTMLTextAreaElement).value).toBe('A text')
  })
})

describe('SavedAnswer', () => {
  it('lists submitted code and loads it back', () => {
    const onLoad = vi.fn()
    const entries = submissionEntries({ code: 'SELECT 1', ts: 1, passed: false, solved: { code: 'SELECT 2', ts: 0 } })
    expect(entries.map((e) => e.label)).toEqual(['Last submission', 'Last passing solution'])
    render(<SavedAnswer entries={entries} onLoad={onLoad} />)
    expect(screen.getByText('SELECT 1')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Load into editor')[1])
    expect(onLoad).toHaveBeenCalledWith('SELECT 2')
  })
  it('shows only one entry when the last submission is the passing one, and nothing when there is none', () => {
    expect(submissionEntries({ code: 'x', ts: 1, passed: true, solved: { code: 'x', ts: 1 } })).toHaveLength(1)
    expect(submissionEntries(undefined)).toEqual([])
  })
})
