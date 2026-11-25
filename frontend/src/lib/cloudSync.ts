/**
 * Cloud persistence: maps the app's `AppState` to Supabase tables (see supabase/migrations) and back.
 *
 * Pages keep using `useStore().update(...)` unchanged. After every change the store computes the table rows for the
 * new state and sends only the rows that differ from what is already in the cloud (upsert by primary key, so
 * repeated saves never create duplicates; rows that disappeared are deleted).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Theme } from './theme'
import type { ActiveAssessment, ActiveInterview, ActivityItem, AppState, AssessmentResult, BankQuestion, InterviewResult, Settings } from './types'

export type Row = Record<string, unknown>
export type TableName =
  | 'profiles' | 'lesson_progress' | 'exercise_progress' | 'project_progress' | 'scenario_progress' | 'drafts'
  | 'assessment_attempts' | 'interview_attempts' | 'custom_questions' | 'study_days' | 'user_kv'
export type Tables = Record<TableName, Map<string, Row>>

/** Column that, together with `user_id`, identifies a row. `profiles` has only `user_id`. */
const PK: Record<TableName, string | null> = {
  profiles: null, lesson_progress: 'lesson_id', exercise_progress: 'exercise_id', project_progress: 'project_id',
  scenario_progress: 'scenario_id', drafts: 'draft_key', assessment_attempts: 'attempt_id', interview_attempts: 'attempt_id',
  custom_questions: 'question_id', study_days: 'day', user_kv: 'kv_key',
}
export const TABLE_NAMES = Object.keys(PK) as TableName[]

const MAX_TEXT = 200_000
const cap = (s: string) => (s.length > MAX_TEXT ? s.slice(0, MAX_TEXT) : s)
const iso = (ms: number | undefined | null) => (typeof ms === 'number' && Number.isFinite(ms) ? new Date(ms).toISOString() : null)
const ms = (v: unknown): number => { const t = typeof v === 'string' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0 }
const num = (v: unknown, d = 0): number => { const n = typeof v === 'number' ? v : Number(v); return Number.isFinite(n) ? n : d }
const isEmpty = (v: unknown) => v == null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

export const emptyTables = (): Tables =>
  Object.fromEntries(TABLE_NAMES.map((t) => [t, new Map<string, Row>()])) as unknown as Tables

// ---------------------------------------------------------------- AppState -> rows
export function stateToTables(s: AppState, theme: Theme | null, userId: string): Tables {
  const t = emptyTables()
  const put = (table: TableName, key: string, row: Row) => { t[table].set(key, { user_id: userId, ...row }) }

  put('profiles', userId, { display_name: s.profile.name.slice(0, 80), theme, settings: s.settings, started_at: iso(s.startedAt) ?? new Date().toISOString() })

  const bookmarks = new Set(s.bookmarks)
  const lessonIds = new Set([...Object.keys(s.completed), ...bookmarks, ...Object.keys(s.notes), ...Object.keys(s.quiz), ...Object.keys(s.revisions)])
  for (const id of lessonIds) {
    const note = s.notes[id] ? cap(s.notes[id]) : null
    const c = s.completed[id], q = s.quiz[id], r = s.revisions[id]
    if (!c && !bookmarks.has(id) && !note && !q && !r) continue
    put('lesson_progress', id, {
      lesson_id: id, completed_at: c ? iso(c) : null, bookmarked: bookmarks.has(id), note,
      quiz_score: q?.score ?? null, quiz_total: q?.total ?? null, quiz_at: iso(q?.ts),
      rev_stage: r?.stage ?? null, rev_due: iso(r?.due), rev_last: iso(r?.last),
    })
  }

  for (const id of new Set([...Object.keys(s.exercises), ...Object.keys(s.submissions)])) {
    const e = s.exercises[id], sub = s.submissions[id]
    put('exercise_progress', id, {
      exercise_id: id, solved: e?.solved ?? false, attempts: e?.attempts ?? 0, correct: e?.correct ?? 0, last_at: iso(e?.ts),
      sub_code: sub ? cap(sub.code) : null, sub_at: iso(sub?.ts), sub_passed: sub ? sub.passed : null,
      solved_code: sub?.solved ? cap(sub.solved.code) : null, solved_at: iso(sub?.solved?.ts),
    })
  }

  for (const [id, steps] of Object.entries(s.projects)) {
    if (Object.keys(steps).length) put('project_progress', id, { project_id: id, steps })
  }

  for (const [id, sc] of Object.entries(s.scenarios)) {
    put('scenario_progress', id, {
      scenario_id: id, best: sc.best, attempts: sc.attempts, last_answer: sc.last ? cap(sc.last.answer) : null,
      last_score: sc.last?.score ?? null, last_at: iso(sc.last?.ts),
    })
  }

  for (const [key, content] of Object.entries(s.drafts)) put('drafts', key, { draft_key: key.slice(0, 150), content: cap(content) })

  for (const a of s.assessments) put('assessment_attempts', a.id, { attempt_id: a.id, taken_at: iso(a.ts) ?? new Date(0).toISOString(), score: a.score, data: a })
  for (const i of s.interviews) put('interview_attempts', i.id, { attempt_id: i.id, taken_at: iso(i.ts) ?? new Date(0).toISOString(), overall: i.overall, data: i })
  s.customQuestions.forEach((q, position) => put('custom_questions', q.id, { question_id: q.id, position, data: q }))
  for (const [day, minutes] of Object.entries(s.studyMinutes)) put('study_days', day, { day, minutes })

  const kv: Record<string, unknown> = {
    activity: s.activity, assessmentSeen: s.assessmentSeen, lastAssessmentQs: s.lastAssessmentQs, askedQs: s.askedQs,
    mixSignatures: s.mixSignatures, activeAssessment: s.activeAssessment, activeInterview: s.activeInterview,
  }
  for (const [k, v] of Object.entries(kv)) if (!isEmpty(v)) put('user_kv', k, { kv_key: k, value: v })
  return t
}

// ---------------------------------------------------------------- rows -> AppState
export function tablesToState(rows: Record<TableName, Row[]>, base: AppState): { state: AppState; theme: Theme | null; hasProfile: boolean } {
  const s = base
  const p = rows.profiles[0]
  if (p) {
    s.profile = { name: String(p.display_name ?? '') }
    s.settings = { ...s.settings, ...((p.settings ?? {}) as Partial<Settings>) }
    s.startedAt = ms(p.started_at) || s.startedAt
  }
  const theme = p?.theme === 'light' || p?.theme === 'dark' ? p.theme : null

  for (const r of rows.lesson_progress) {
    const id = String(r.lesson_id)
    if (r.completed_at) s.completed[id] = ms(r.completed_at)
    if (r.bookmarked) s.bookmarks.push(id)
    if (typeof r.note === 'string' && r.note) s.notes[id] = r.note
    if (r.quiz_score != null) s.quiz[id] = { score: num(r.quiz_score), total: num(r.quiz_total), ts: ms(r.quiz_at) }
    if (r.rev_due) s.revisions[id] = { stage: num(r.rev_stage), due: ms(r.rev_due), last: ms(r.rev_last) }
  }

  for (const r of rows.exercise_progress) {
    const id = String(r.exercise_id)
    s.exercises[id] = { solved: !!r.solved, attempts: num(r.attempts), correct: num(r.correct), ts: ms(r.last_at) }
    if (typeof r.sub_code === 'string') {
      s.submissions[id] = {
        code: r.sub_code, ts: ms(r.sub_at), passed: !!r.sub_passed,
        ...(typeof r.solved_code === 'string' ? { solved: { code: r.solved_code, ts: ms(r.solved_at) } } : {}),
      }
    }
  }

  for (const r of rows.project_progress) s.projects[String(r.project_id)] = (r.steps ?? {}) as Record<string, boolean>

  for (const r of rows.scenario_progress) {
    s.scenarios[String(r.scenario_id)] = {
      best: num(r.best), attempts: (r.attempts ?? []) as { score: number; ts: number }[],
      ...(typeof r.last_answer === 'string' ? { last: { answer: r.last_answer, score: num(r.last_score), ts: ms(r.last_at) } } : {}),
    }
  }

  for (const r of rows.drafts) s.drafts[String(r.draft_key)] = String(r.content ?? '')
  s.assessments = rows.assessment_attempts.slice().sort((a, b) => ms(b.taken_at) - ms(a.taken_at)).map((r) => r.data as AssessmentResult)
  s.interviews = rows.interview_attempts.slice().sort((a, b) => ms(b.taken_at) - ms(a.taken_at)).map((r) => r.data as InterviewResult)
  s.customQuestions = rows.custom_questions.slice().sort((a, b) => num(a.position) - num(b.position)).map((r) => r.data as BankQuestion)
  for (const r of rows.study_days) s.studyMinutes[String(r.day)] = num(r.minutes)

  for (const r of rows.user_kv) {
    const v = r.value
    switch (r.kv_key) {
      case 'activity': s.activity = v as ActivityItem[]; break
      case 'assessmentSeen': s.assessmentSeen = v as Record<string, number>; break
      case 'lastAssessmentQs': s.lastAssessmentQs = v as string[]; break
      case 'askedQs': s.askedQs = v as Record<string, number>; break
      case 'mixSignatures': s.mixSignatures = v as string[]; break
      case 'activeAssessment': s.activeAssessment = v as ActiveAssessment; break
      case 'activeInterview': s.activeInterview = v as ActiveInterview; break
    }
  }
  return { state: s, theme, hasProfile: !!p }
}

// ---------------------------------------------------------------- network
const PAGE = 1000
const CHUNK = 100

async function fetchTable(db: SupabaseClient, table: TableName): Promise<Row[]> {
  const out: Row[] = []
  const order = PK[table] ?? 'user_id'
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select('*').order(order, { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw new Error(`load ${table}: ${error.code ?? 'error'}`)
    out.push(...(data as Row[]))
    if (!data || data.length < PAGE) break
  }
  return out
}

/** Reads every table for the signed-in user (row-level security restricts results to their own rows). */
export async function loadRows(db: SupabaseClient): Promise<Record<TableName, Row[]>> {
  const entries = await Promise.all(TABLE_NAMES.map(async (t) => [t, await fetchTable(db, t)] as const))
  return Object.fromEntries(entries) as Record<TableName, Row[]>
}

export interface PushResult { snapshot: Tables; ok: boolean; failed: TableName[] }

/** Sends only what differs between `prev` (what the cloud holds) and `next`. Tables that fail keep their old snapshot so they are retried. */
export async function pushDiff(db: SupabaseClient, userId: string, prev: Tables, next: Tables): Promise<PushResult> {
  const snapshot = emptyTables()
  const failed: TableName[] = []
  await Promise.all(TABLE_NAMES.map(async (table) => {
    const before = prev[table], after = next[table], pk = PK[table]
    const upserts: Row[] = []
    for (const [k, row] of after) if (JSON.stringify(before.get(k)) !== JSON.stringify(row)) upserts.push(row)
    const removed = pk ? [...before.keys()].filter((k) => !after.has(k)) : []
    try {
      for (let i = 0; i < upserts.length; i += CHUNK) {
        const { error } = await db.from(table).upsert(upserts.slice(i, i + CHUNK), { onConflict: pk ? `user_id,${pk}` : 'user_id' })
        if (error) throw new Error(`save ${table}: ${error.code ?? 'error'}`)
      }
      for (let i = 0; pk && i < removed.length; i += CHUNK) {
        const { error } = await db.from(table).delete().eq('user_id', userId).in(pk, removed.slice(i, i + CHUNK))
        if (error) throw new Error(`delete ${table}: ${error.code ?? 'error'}`)
      }
      snapshot[table] = after
    } catch {
      snapshot[table] = before
      failed.push(table)
    }
  }))
  return { snapshot, ok: failed.length === 0, failed }
}
