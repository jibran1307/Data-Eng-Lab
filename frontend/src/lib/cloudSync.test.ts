import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { emptyTables, pushDiff, stateToTables, tablesToState, TABLE_NAMES, type Row, type TableName } from './cloudSync'
import { defaultState, normalise } from './store'
import { redirectUrl } from './supabase'
import type { AppState } from './types'

const UID = '11111111-1111-1111-1111-111111111111'

function richState(): AppState {
  const s = defaultState()
  s.profile = { name: 'Jibran' }
  s.startedAt = 1_700_000_000_000
  s.settings = { ...s.settings, dailyTargetMin: 90 }
  s.completed = { 'l-1': 1_700_000_100_000 }
  s.bookmarks = ['l-1', 'l-2']
  s.notes = { 'l-2': 'remember window functions' }
  s.quiz = { 'l-1': { score: 3, total: 4, ts: 1_700_000_200_000 } }
  s.revisions = { 'l-1': { stage: 1, due: 1_700_086_400_000, last: 1_700_000_100_000 } }
  s.exercises = { 'sql-01': { solved: true, attempts: 3, correct: 1, ts: 1_700_000_300_000 }, 'py-01': { solved: false, attempts: 1, correct: 0, ts: 1_700_000_400_000 } }
  s.submissions = {
    'sql-01': { code: 'SELECT 2', ts: 1_700_000_300_000, passed: true, solved: { code: 'SELECT 2', ts: 1_700_000_300_000 } },
    'py-01': { code: 'print(1)', ts: 1_700_000_400_000, passed: false },
  }
  s.projects = { p1: { s1: true, s2: false } }
  s.scenarios = { sc1: { best: 80, attempts: [{ score: 60, ts: 1 }, { score: 80, ts: 2 }], last: { answer: 'my answer', score: 80, ts: 1_700_000_500_000 } } }
  s.drafts = { 'sql:free': 'SELECT 1', 'py:py-01': 'print(2)' }
  s.assessments = [{ id: 'as-2', ts: 1_700_000_900_000, kind: 'quiz', level: 'all', durationSec: 60, timed: false, items: [], score: 90 }, { id: 'as-1', ts: 1_700_000_600_000, kind: 'quiz', level: 'all', durationSec: 60, timed: false, items: [], score: 70 }]
  s.interviews = [{ id: 'iv-1', ts: 1_700_000_700_000, type: 'mixed', level: 'intermediate', durationMin: 15, usedSec: 300, perQuestion: [], overall: 77, dims: {}, mix: {} }]
  s.customQuestions = [
    { id: 'cq-a', topic: 'sql', type: 'concept', level: 'beginner', q: 'A?', answer: 'a', keywords: [['a']], custom: true },
    { id: 'cq-b', topic: 'etl', type: 'concept', level: 'beginner', q: 'B?', answer: 'b', keywords: [['b']], custom: true },
  ]
  s.studyMinutes = { '2025-01-01': 42.5 }
  s.activity = [{ ts: 5, type: 'sql', label: 'Solved' }]
  s.askedQs = { q1: 2 }
  s.assessmentSeen = { m1: 1 }
  s.lastAssessmentQs = ['m1']
  s.mixSignatures = ['sig']
  return s
}

/** Simulates what PostgREST returns after rows were upserted: the same columns, as plain arrays per table. */
function asDbRows(t: ReturnType<typeof stateToTables>) {
  return Object.fromEntries(TABLE_NAMES.map((n) => [n, [...t[n].values()].map((r) => JSON.parse(JSON.stringify(r)) as Row)])) as Record<TableName, Row[]>
}

describe('state <-> tables mapping', () => {
  it('round-trips a full state through the table rows without losing anything', () => {
    const s = richState()
    const { state, theme, hasProfile } = tablesToState(asDbRows(stateToTables(s, 'light', UID)), defaultState())
    expect(hasProfile).toBe(true)
    expect(theme).toBe('light')
    expect(normalise(state)).toEqual(normalise(s))
  })

  it('stamps every row with the owning user id', () => {
    const t = stateToTables(richState(), 'dark', UID)
    for (const n of TABLE_NAMES) for (const row of t[n].values()) expect(row.user_id).toBe(UID)
  })

  it('creates no rows for a brand-new user other than the profile', () => {
    const t = stateToTables(defaultState(), 'dark', UID)
    for (const n of TABLE_NAMES) expect(t[n].size).toBe(n === 'profiles' ? 1 : 0)
  })

  it('reports a user without a profile row as new, with default progress', () => {
    const empty = Object.fromEntries(TABLE_NAMES.map((n) => [n, []])) as unknown as Record<TableName, Row[]>
    const r = tablesToState(empty, defaultState())
    expect(r.hasProfile).toBe(false)
    expect(r.state.completed).toEqual({})
    expect(r.state.profile.name).toBe('')
  })
})

/** Minimal stand-in for the Supabase client that records calls. */
function fakeDb(failTable?: string) {
  const calls: { op: 'upsert' | 'delete'; table: string; rows?: Row[]; keys?: unknown[]; onConflict?: string }[] = []
  const db = {
    from: (table: string) => ({
      upsert: async (rows: Row[], opts: { onConflict: string }) => {
        if (table === failTable) return { error: { code: '42501' } }
        calls.push({ op: 'upsert', table, rows, onConflict: opts.onConflict }); return { error: null }
      },
      delete: () => ({
        eq: () => ({
          in: async (_col: string, keys: unknown[]) => {
            if (table === failTable) return { error: { code: '42501' } }
            calls.push({ op: 'delete', table, keys }); return { error: null }
          },
        }),
      }),
    }),
  } as unknown as SupabaseClient
  return { db, calls }
}

describe('pushDiff', () => {
  it('uploads everything the first time, upserting on the composite key', async () => {
    const { db, calls } = fakeDb()
    const next = stateToTables(richState(), 'dark', UID)
    const r = await pushDiff(db, UID, emptyTables(), next)
    expect(r.ok).toBe(true)
    const lessons = calls.find((c) => c.table === 'lesson_progress')
    expect(lessons?.onConflict).toBe('user_id,lesson_id')
    expect(calls.find((c) => c.table === 'profiles')?.onConflict).toBe('user_id')
    expect(r.snapshot).toBe(r.snapshot)
    expect(r.snapshot.lesson_progress.size).toBe(2)
  })

  it('sends nothing when nothing changed, so repeated saves cannot create duplicates', async () => {
    const { db, calls } = fakeDb()
    const t = stateToTables(richState(), 'dark', UID)
    const r = await pushDiff(db, UID, t, stateToTables(richState(), 'dark', UID))
    expect(r.ok).toBe(true)
    expect(calls).toEqual([])
  })

  it('upserts only the changed row', async () => {
    const { db, calls } = fakeDb()
    const before = stateToTables(richState(), 'dark', UID)
    const s = richState()
    s.exercises['sql-01'] = { ...s.exercises['sql-01'], attempts: 4 }
    await pushDiff(db, UID, before, stateToTables(s, 'dark', UID))
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ op: 'upsert', table: 'exercise_progress' })
    expect(calls[0].rows).toHaveLength(1)
  })

  it('deletes rows that no longer exist (un-completing a lesson, clearing history)', async () => {
    const { db, calls } = fakeDb()
    const before = stateToTables(richState(), 'dark', UID)
    const s = richState()
    s.completed = {}; s.revisions = {}; s.quiz = {}; s.bookmarks = ['l-2']
    s.interviews = []
    await pushDiff(db, UID, before, stateToTables(s, 'dark', UID))
    expect(calls).toContainEqual({ op: 'delete', table: 'interview_attempts', keys: ['iv-1'] })
    // l-1 has nothing left to remember so its row is removed; l-2 (note + bookmark) is unchanged and not re-sent.
    expect(calls).toContainEqual({ op: 'delete', table: 'lesson_progress', keys: ['l-1'] })
    expect(calls.some((c) => c.op === 'upsert' && c.table === 'lesson_progress')).toBe(false)
  })

  it('keeps the old snapshot for a table that failed so it is retried, and reports it', async () => {
    const { db } = fakeDb('exercise_progress')
    const before = stateToTables(defaultState(), 'dark', UID)
    const next = stateToTables(richState(), 'dark', UID)
    const r = await pushDiff(db, UID, before, next)
    expect(r.ok).toBe(false)
    expect(r.failed).toEqual(['exercise_progress'])
    expect(r.snapshot.exercise_progress.size).toBe(0)
    expect(r.snapshot.lesson_progress.size).toBe(2)
  })
})

describe('redirectUrl', () => {
  it('returns the GitHub Pages project path, not just the origin', () => {
    expect(redirectUrl({ origin: 'https://jibran1307.github.io', pathname: '/Data-Eng-Lab/' }, './')).toBe('https://jibran1307.github.io/Data-Eng-Lab/')
    expect(redirectUrl({ origin: 'https://jibran1307.github.io', pathname: '/Data-Eng-Lab/index.html' }, './')).toBe('https://jibran1307.github.io/Data-Eng-Lab/')
  })
  it('returns the local dev root', () => {
    expect(redirectUrl({ origin: 'http://localhost:5173', pathname: '/' }, '/')).toBe('http://localhost:5173/')
  })
})
