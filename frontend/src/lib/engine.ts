import { DAY, dayKey } from './store'
import type { AppState, LessonIndex, ModuleMeta } from './types'

/** Interview/question topics -> curriculum module used for analytics. */
export const TOPIC_MODULE: Record<string, string> = {
  sql: 'sql', python: 'python', fundamentals: 'fundamentals', warehousing: 'warehousing', etl: 'etl',
  spark: 'spark', orchestration: 'orchestration', azure: 'azure', streaming: 'streaming', tools: 'tools',
  modeling: 'warehousing', scenario: 'etl', design: 'fundamentals', troubleshooting: 'etl',
}
export const TOPIC_LABEL: Record<string, string> = {
  sql: 'SQL', python: 'Python', fundamentals: 'DE Fundamentals', warehousing: 'Data Warehousing', etl: 'ETL / ELT',
  spark: 'PySpark', orchestration: 'Airflow', azure: 'Azure', streaming: 'Kafka / Streaming', tools: 'Tools & Practices',
  modeling: 'Data Modeling', scenario: 'Real-world Scenarios', design: 'System Design', troubleshooting: 'Troubleshooting',
}
export const modOf = (topic: string) => TOPIC_MODULE[topic] ?? topic

export const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100))

export function moduleProgress(state: AppState, lessons: LessonIndex[], moduleId: string) {
  const ls = lessons.filter((l) => l.module === moduleId)
  const done = ls.filter((l) => state.completed[l.id]).length
  return { done, total: ls.length, pct: pct(done, ls.length) }
}

export function isUnlocked(state: AppState, l: LessonIndex): { ok: boolean; missing: string[] } {
  const missing = l.prereqs.filter((p) => !state.completed[p])
  return { ok: missing.length === 0, missing }
}

/** Accuracy signals per curriculum module (0-100 or null when no data). */
export function moduleSignals(state: AppState, lessons: LessonIndex[], moduleId: string) {
  const lessonPct = moduleProgress(state, lessons, moduleId)
  const ids = new Set(lessons.filter((l) => l.module === moduleId).map((l) => l.id))
  let q = 0, qt = 0
  for (const [id, r] of Object.entries(state.quiz)) if (ids.has(id)) { q += r.score; qt += r.total }
  let c = 0, t = 0
  for (const a of state.assessments) for (const it of a.items) if (modOf(it.topic) === moduleId) { t++; if (it.correct) c++ }
  let is = 0, in_ = 0
  for (const iv of state.interviews) for (const p of iv.perQuestion) if (!p.skipped && modOf(p.topic) === moduleId) { is += p.score; in_++ }
  return {
    lesson: lessonPct.total ? lessonPct.pct : null,
    quiz: qt ? pct(q, qt) : null,
    assessment: t ? pct(c, t) : null,
    interview: in_ ? Math.round(is / in_) : null,
  }
}

/** Proficiency blends completion with demonstrated performance. */
export function moduleProficiency(state: AppState, lessons: LessonIndex[], moduleId: string, exerciseSolved?: { solved: number; total: number }): number {
  const s = moduleSignals(state, lessons, moduleId)
  const parts: [number, number][] = []
  if (s.lesson !== null) parts.push([s.lesson, 0.3])
  if (s.quiz !== null) parts.push([s.quiz, 0.2])
  if (s.assessment !== null) parts.push([s.assessment, 0.2])
  if (s.interview !== null) parts.push([s.interview, 0.15])
  if (exerciseSolved && exerciseSolved.total) parts.push([pct(exerciseSolved.solved, exerciseSolved.total), 0.3])
  const w = parts.reduce((a, [, x]) => a + x, 0)
  return w ? Math.round(parts.reduce((a, [v, x]) => a + v * x, 0) / w) : 0
}

// ---------------------------------------------------------------- spaced repetition
export function scheduleRevision(state: AppState, lessonId: string, now = Date.now()): AppState['revisions'] {
  const iv = state.settings.revisionIntervals
  return { ...state.revisions, [lessonId]: { stage: 0, due: now + (iv[0] ?? 1) * DAY, last: now } }
}

/** `remembered=false` resets to stage 0 (see it again tomorrow); true advances the interval. */
export function reviewLesson(state: AppState, lessonId: string, remembered: boolean, now = Date.now()): AppState['revisions'] {
  const iv = state.settings.revisionIntervals
  const cur = state.revisions[lessonId] ?? { stage: 0, due: now, last: now }
  const stage = remembered ? Math.min(cur.stage + 1, iv.length - 1) : 0
  return { ...state.revisions, [lessonId]: { stage, due: now + (iv[stage] ?? 1) * DAY, last: now } }
}

export function dueRevisions(state: AppState, now = Date.now()) {
  return Object.entries(state.revisions).filter(([, r]) => r.due <= now).sort((a, b) => a[1].due - b[1].due).map(([id, r]) => ({ id, ...r }))
}
export function upcomingRevisions(state: AppState, now = Date.now()) {
  return Object.entries(state.revisions).filter(([, r]) => r.due > now).sort((a, b) => a[1].due - b[1].due).map(([id, r]) => ({ id, ...r }))
}

// ---------------------------------------------------------------- streak & activity
export function streak(state: AppState, now = Date.now()): number {
  const days = new Set<string>()
  state.activity.forEach((a) => days.add(dayKey(a.ts)))
  Object.entries(state.studyMinutes).forEach(([k, m]) => { if (m >= 1) days.add(k) })
  let n = 0
  let t = now
  if (!days.has(dayKey(t))) t -= DAY // today not yet studied: streak still alive from yesterday
  while (days.has(dayKey(t))) { n++; t -= DAY }
  return n
}

export function weeklyActivity(state: AppState, now = Date.now()) {
  const out: { day: string; minutes: number; events: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const t = now - i * DAY
    const k = dayKey(t)
    out.push({
      day: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }),
      minutes: Math.round(state.studyMinutes[k] ?? 0),
      events: state.activity.filter((a) => dayKey(a.ts) === k).length,
    })
  }
  return out
}

// ---------------------------------------------------------------- weakness + recommendations
export interface TopicStat { topic: string; correct: number; total: number; acc: number }

export function topicAccuracy(state: AppState): TopicStat[] {
  const m = new Map<string, { c: number; t: number }>()
  const add = (topic: string, ok: number, n = 1) => { const x = m.get(topic) ?? { c: 0, t: 0 }; x.c += ok; x.t += n; m.set(topic, x) }
  for (const a of state.assessments) for (const it of a.items) add(modOf(it.topic), it.correct ? 1 : 0)
  for (const iv of state.interviews) for (const p of iv.perQuestion) if (!p.skipped) add(modOf(p.topic), p.score / 100)
  return [...m.entries()].map(([topic, x]) => ({ topic, correct: x.c, total: x.t, acc: pct(x.c, x.t) })).sort((a, b) => a.acc - b.acc)
}

export const weakTopics = (state: AppState, minSamples = 3, threshold = 65) =>
  topicAccuracy(state).filter((t) => t.total >= minSamples && t.acc < threshold)

export interface Recommendation { id: string; title: string; reason: string; to: string; kind: 'prereq' | 'weak' | 'revise' | 'next' | 'start' }

export function recommend(state: AppState, lessons: LessonIndex[], modules: ModuleMeta[], now = Date.now()): Recommendation[] {
  const recs: Recommendation[] = []
  const byId = new Map(lessons.map((l) => [l.id, l]))
  const nextOf = (moduleId: string) => lessons.find((l) => l.module === moduleId && !state.completed[l.id] && isUnlocked(state, l).ok)
  const title = (id: string) => byId.get(id)?.title ?? id

  // 1. incomplete prerequisites of bookmarked/in-progress material
  const inProgress = Object.keys(state.notes).concat(state.bookmarks).map((id) => byId.get(id)).filter((l): l is LessonIndex => !!l && !state.completed[l.id])
  for (const l of inProgress) {
    const miss = isUnlocked(state, l).missing[0]
    if (miss) recs.push({ id: 'pre-' + miss, title: title(miss), reason: `Prerequisite for "${l.title}"`, to: `/learn/${miss}`, kind: 'prereq' })
  }
  // 2 + 3. weak topics from assessments / interviews
  for (const w of weakTopics(state)) {
    const mod = modules.find((m) => m.id === w.topic)
    const done = lessons.filter((l) => l.module === w.topic && state.completed[l.id])
    const target = done[0]?.id ?? nextOf(w.topic)?.id
    if (target) recs.push({ id: 'weak-' + w.topic, title: `Revise ${mod?.title ?? TOPIC_LABEL[w.topic] ?? w.topic}`, reason: `Only ${w.acc}% accuracy across ${Math.round(w.total)} recent answers`, to: `/learn/${target}`, kind: 'weak' })
  }
  // 4. due revisions
  for (const r of dueRevisions(state, now).slice(0, 3)) recs.push({ id: 'rev-' + r.id, title: title(r.id), reason: 'Scheduled revision is due', to: `/learn/${r.id}?revise=1`, kind: 'revise' })
  // 5. next in curriculum order
  const first = lessons.find((l) => !state.completed[l.id] && isUnlocked(state, l).ok)
  if (first) recs.push({ id: 'next-' + first.id, title: first.title, reason: Object.keys(state.completed).length ? 'Next lesson on your path' : 'Start here', to: `/learn/${first.id}`, kind: Object.keys(state.completed).length ? 'next' : 'start' })

  const seen = new Set<string>()
  return recs.filter((r) => (seen.has(r.to) ? false : (seen.add(r.to), true)))
}
