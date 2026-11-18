/**
 * Dynamic mock-interview engine (pure functions - fully unit-tested).
 *
 * Guarantees:
 *  1. A fresh *mix* (how many questions per topic) every time: recent mix signatures are avoided.
 *  2. Questions are drawn from the least-recently-asked end of each topic pool: unseen questions first,
 *     then the oldest-asked. Questions from the previous N interviews are excluded while alternatives exist.
 *  3. Scenario templates expand into practically unlimited unique variants (ids are `tpl:<template>:<hash>`).
 */
import type { BankQuestion, InterviewResult, QType } from './types'

export type Rng = () => number
export const defaultRng: Rng = Math.random

/** Small seeded PRNG so tests are deterministic. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface InterviewType { id: string; label: string; description: string; weights: Record<string, number> }

export const INTERVIEW_TYPES: InterviewType[] = [
  { id: 'sql', label: 'SQL Technical Interview', description: 'Query writing, window functions, optimisation and SQL data modelling.', weights: { sql: 8, modeling: 1, warehousing: 1 } },
  { id: 'python', label: 'Python Technical Interview', description: 'Python fundamentals, data structures, pandas and ETL scripting.', weights: { python: 9, etl: 1, troubleshooting: 1 } },
  { id: 'fundamentals', label: 'Data Engineering Fundamentals', description: 'Core concepts: pipelines, storage, modelling, reliability.', weights: { fundamentals: 6, modeling: 2, warehousing: 2, tools: 1 } },
  { id: 'azure', label: 'Azure Data Engineer Interview', description: 'ADLS, ADF, Databricks, Synapse/Fabric, security.', weights: { azure: 8, scenario: 1, design: 1, sql: 1 } },
  { id: 'pyspark', label: 'PySpark Interview', description: 'Spark architecture, shuffles, joins, tuning and PySpark coding.', weights: { spark: 8, python: 1, troubleshooting: 1 } },
  { id: 'etl', label: 'ETL and Pipeline Interview', description: 'Incremental loads, idempotency, CDC, orchestration, failure handling.', weights: { etl: 6, orchestration: 2, python: 1, sql: 1, troubleshooting: 1 } },
  { id: 'full', label: 'Full Data Engineer Interview', description: 'Broad loop across SQL, Python, pipelines, Spark, cloud and design.', weights: { sql: 3, python: 2, etl: 2, spark: 2, azure: 1, warehousing: 1, fundamentals: 1, scenario: 1, design: 1 } },
  { id: 'scenario', label: 'Scenario-Based Interview', description: 'Production incidents and judgement calls.', weights: { scenario: 5, troubleshooting: 4, etl: 1, spark: 1 } },
  { id: 'design', label: 'System Design Interview', description: 'Design end-to-end platforms and justify trade-offs.', weights: { design: 6, warehousing: 1, streaming: 1, azure: 1, modeling: 1 } },
  { id: 'mixed', label: 'Mixed Technical Interview', description: 'Everything: kafka, airflow, tools and more, randomly mixed.', weights: { sql: 2, python: 2, fundamentals: 1, etl: 1, warehousing: 1, spark: 1, orchestration: 1, azure: 1, streaming: 1, tools: 1, modeling: 1, scenario: 1, design: 1, troubleshooting: 1 } },
]

export const DIFFICULTIES = [
  { id: 'beginner', label: 'Beginner' }, { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' }, { id: 'expert', label: 'Experienced Professional' },
] as const
export type Difficulty = (typeof DIFFICULTIES)[number]['id']

/** Which question levels are acceptable for a chosen difficulty, with preference weights. */
export const LEVEL_PREF: Record<Difficulty, Record<string, number>> = {
  beginner: { beginner: 1, intermediate: 0.25 },
  intermediate: { beginner: 0.2, intermediate: 1, advanced: 0.3 },
  advanced: { intermediate: 0.3, advanced: 1, expert: 0.4 },
  expert: { advanced: 0.5, expert: 1 },
}

export interface InterviewConfig {
  type: string; difficulty: Difficulty; durationMin: 15 | 30 | 45; count: number; topics: string[]
}

export const TOPIC_KEYS = ['sql', 'python', 'fundamentals', 'etl', 'warehousing', 'spark', 'orchestration', 'azure', 'streaming', 'modeling', 'scenario', 'design', 'troubleshooting', 'tools']

// ---------------------------------------------------------------- templates
export interface Template {
  id: string; topic: string; type: QType; level: BankQuestion['level']
  q: string; slots: Record<string, string[]>; answer: string; keywords: string[][]; hints?: string[]
}

export function hash(s: string): string {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(36)
}

export function expandTemplate(t: Template, rng: Rng): BankQuestion {
  const picks: Record<string, string> = {}
  for (const [k, vals] of Object.entries(t.slots)) picks[k] = vals[Math.floor(rng() * vals.length)]
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => picks[k] ?? `{${k}}`)
  const q = fill(t.q)
  return { id: `tpl:${t.id}:${hash(q)}`, topic: t.topic, type: t.type, level: t.level, q, answer: fill(t.answer), keywords: t.keywords, hints: t.hints?.map(fill), variantOf: t.id }
}

export function templateVariantCount(t: Template): number {
  return Object.values(t.slots).reduce((a, v) => a * v.length, 1)
}

// ---------------------------------------------------------------- mix generation
export function mixSignature(mix: Record<string, number>): string {
  return Object.entries(mix).filter(([, n]) => n > 0).sort(([a], [b]) => a.localeCompare(b)).map(([k, n]) => `${k}:${n}`).join('|')
}

function weightedPick<T extends string>(weights: Record<T, number>, rng: Rng): T {
  const entries = Object.entries(weights) as [T, number][]
  const total = entries.reduce((a, [, w]) => a + w, 0)
  let r = rng() * total
  for (const [k, w] of entries) { r -= w; if (r <= 0) return k }
  return entries[entries.length - 1][0]
}

/** Randomly distribute `count` questions over topics (respecting per-topic availability). */
export function randomMix(count: number, weights: Record<string, number>, available: Record<string, number>, rng: Rng): Record<string, number> {
  const w: Record<string, number> = {}
  for (const [t, x] of Object.entries(weights)) if ((available[t] ?? 0) > 0) w[t] = x * (0.35 + rng() * 1.3) // jitter: weights are a tendency, not a recipe
  const mix: Record<string, number> = {}
  let left = count
  while (left > 0 && Object.keys(w).length) {
    const t = weightedPick(w, rng)
    mix[t] = (mix[t] ?? 0) + 1
    left--
    if (mix[t] >= (available[t] ?? 0)) delete w[t]
  }
  return mix
}

export interface PickInput {
  bank: BankQuestion[]; templates: Template[]; cfg: InterviewConfig
  asked: Record<string, number>          // qid -> last asked timestamp
  recentIds: string[]                    // questions from last N interviews (hard-avoid while alternatives exist)
  recentMixes: string[]                  // recent mix signatures
  rng?: Rng
}
export interface PickResult { questions: BankQuestion[]; mix: Record<string, number>; signature: string; mixRetries: number }

export function pickInterview(inp: PickInput): PickResult {
  const rng = inp.rng ?? defaultRng
  const type = INTERVIEW_TYPES.find((t) => t.id === inp.cfg.type) ?? INTERVIEW_TYPES[INTERVIEW_TYPES.length - 1]
  const prefs = LEVEL_PREF[inp.cfg.difficulty]
  const topics = inp.cfg.topics.length ? inp.cfg.topics : Object.keys(type.weights)
  const weights: Record<string, number> = {}
  for (const t of topics) weights[t] = type.weights[t] ?? 1

  const inScope = (q: { topic: string; level: string }) => topics.includes(q.topic) && prefs[q.level] !== undefined
  const pool = inp.bank.filter(inScope)
  const tplPool = inp.templates.filter(inScope)
  const available: Record<string, number> = {}
  for (const q of pool) available[q.topic] = (available[q.topic] ?? 0) + 1
  for (const t of tplPool) available[t.topic] = (available[t.topic] ?? 0) + 1

  const total = Math.min(inp.cfg.count, Object.values(available).reduce((a, b) => a + b, 0))
  let mix = randomMix(total, weights, available, rng)
  let sig = mixSignature(mix)
  let retries = 0
  while (inp.recentMixes.includes(sig) && retries < 40) { mix = randomMix(total, weights, available, rng); sig = mixSignature(mix); retries++ }

  const recent = new Set(inp.recentIds)
  const chosen: BankQuestion[] = []
  const usedIds = new Set<string>()
  for (const [topic, n] of Object.entries(mix)) {
    // Candidates: bank questions + one fresh variant per template in this topic
    const cands: { q: BankQuestion; level: string }[] = pool.filter((q) => q.topic === topic).map((q) => ({ q, level: q.level }))
    for (const t of tplPool.filter((x) => x.topic === topic)) cands.push({ q: expandTemplate(t, rng), level: t.level })
    const scored = cands.map(({ q, level }) => {
      const last = inp.asked[q.id] ?? 0                         // 0 => never asked
      const penalty = recent.has(q.id) ? 1e15 : 0                // avoid immediate repetition
      return { q, key: penalty + last + rng() * 1e3 - (prefs[level] ?? 0.1) * 5e3 } // lower is better; tiny jitter randomises ties
    }).sort((a, b) => a.key - b.key)
    let taken = 0
    for (const s of scored) {
      if (taken >= n) break
      if (usedIds.has(s.q.id)) continue
      usedIds.add(s.q.id); chosen.push(s.q); taken++
    }
  }
  // shuffle presentation order so topics interleave
  for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]] }
  const finalMix: Record<string, number> = {}
  chosen.forEach((q) => { finalMix[q.topic] = (finalMix[q.topic] ?? 0) + 1 })
  return { questions: chosen, mix: finalMix, signature: mixSignature(finalMix), mixRetries: retries }
}

// ---------------------------------------------------------------- report
export const DIM_LABELS: Record<string, string> = {
  technical: 'Technical accuracy', conceptual: 'Conceptual understanding', problem: 'Problem-solving ability', practical: 'Practical knowledge',
}
const DIM_TYPES: Record<string, QType[]> = {
  conceptual: ['concept'], problem: ['scenario', 'troubleshoot', 'design'], practical: ['sql', 'python'],
}

export function buildReport(per: InterviewResult['perQuestion']): { overall: number; dims: Record<string, number> } {
  if (!per.length) return { overall: 0, dims: { technical: 0, conceptual: 0, problem: 0, practical: 0 } }
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : -1)
  const overall = avg(per.map((p) => (p.skipped ? 0 : p.score)))
  const dims: Record<string, number> = { technical: overall }
  for (const [d, types] of Object.entries(DIM_TYPES)) {
    const v = avg(per.filter((p) => types.includes(p.qtype)).map((p) => (p.skipped ? 0 : p.score)))
    dims[d] = v < 0 ? overall : v
  }
  return { overall, dims }
}

export function recentQuestionIds(history: InterviewResult[], window: number): string[] {
  return history.slice(0, Math.max(0, window)).flatMap((h) => h.perQuestion.map((p) => p.qid))
}

/** Validate user-supplied questions (JSON import / add form). Returns normalised questions + error list. */
export function parseImportedQuestions(raw: unknown): { ok: BankQuestion[]; errors: string[] } {
  const errors: string[] = []
  const ok: BankQuestion[] = []
  const arr = Array.isArray(raw) ? raw : (raw as { questions?: unknown })?.questions
  if (!Array.isArray(arr)) return { ok, errors: ['Expected a JSON array of questions (or {"questions": [...]})'] }
  const types: QType[] = ['concept', 'sql', 'python', 'scenario', 'design', 'troubleshoot']
  const levels = ['beginner', 'intermediate', 'advanced', 'expert']
  arr.forEach((r, i) => {
    const q = r as Partial<BankQuestion>
    const where = `Item ${i + 1}`
    if (typeof q?.q !== 'string' || q.q.trim().length < 10) return void errors.push(`${where}: "q" must be a string of at least 10 characters`)
    if (typeof q.answer !== 'string' || !q.answer.trim()) return void errors.push(`${where}: "answer" is required`)
    if (typeof q.topic !== 'string' || !TOPIC_KEYS.includes(q.topic)) return void errors.push(`${where}: "topic" must be one of ${TOPIC_KEYS.join(', ')}`)
    const type = (q.type && types.includes(q.type) ? q.type : 'concept') as QType
    const level = (q.level && levels.includes(q.level) ? q.level : 'intermediate') as BankQuestion['level']
    let kw: string[][] = []
    if (Array.isArray(q.keywords)) kw = q.keywords.map((g) => (Array.isArray(g) ? g.map(String) : [String(g)])).filter((g) => g.length && g[0])
    if (!kw.length) kw = q.answer.toLowerCase().match(/[a-z][a-z0-9_]{5,}/g)?.filter((w, idx, a) => a.indexOf(w) === idx).slice(0, 6).map((w) => [w]) ?? []
    ok.push({ id: `custom:${hash(q.q.trim())}`, topic: q.topic, type, level, q: q.q.trim(), answer: q.answer.trim(), keywords: kw, hints: Array.isArray(q.hints) ? q.hints.map(String) : undefined, custom: true })
  })
  return { ok, errors }
}
