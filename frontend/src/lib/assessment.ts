import type { AssessmentResult, McqItem } from './types'
import { defaultRng, type Rng } from './interview'

export interface AssessmentConfig { kind: 'quiz' | 'timed' | 'full'; topic: string; level: string; count: number }

export const KINDS = {
  quiz: { label: 'Topic quiz', count: 10, perQuestionSec: 0 },
  timed: { label: 'Timed assessment', count: 15, perQuestionSec: 60 },
  full: { label: 'Full-length assessment', count: 40, perQuestionSec: 60 },
} as const

/**
 * Pick questions: filter by topic/level, never repeat the previous test's questions while alternatives exist,
 * prefer least-seen questions, then shuffle.
 */
export function pickAssessment(bank: McqItem[], cfg: AssessmentConfig, seen: Record<string, number>, lastIds: string[], rng: Rng = defaultRng): McqItem[] {
  let pool = bank.filter((q) => (cfg.topic === 'all' || q.topic === cfg.topic) && (cfg.level === 'all' || q.level === cfg.level))
  const last = new Set(lastIds)
  const fresh = pool.filter((q) => !last.has(q.id))
  if (fresh.length >= Math.min(cfg.count, pool.length)) pool = fresh
  const keyed = pool.map((q) => ({ q, k: (seen[q.id] ?? 0) * 10 + rng() * 9 })).sort((a, b) => a.k - b.k)
  const chosen = keyed.slice(0, cfg.count).map((x) => x.q)
  for (let i = chosen.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [chosen[i], chosen[j]] = [chosen[j], chosen[i]] }
  // shuffle options too, keeping the correct answer index in sync
  return chosen.map((q) => {
    const order = q.options.map((_, i) => i)
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [order[i], order[j]] = [order[j], order[i]] }
    return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(q.answer) }
  })
}

export function scoreAssessment(items: McqItem[], chosen: (number | null)[]): AssessmentResult['items'] & {} {
  return items.map((q, i) => ({ qid: q.id, topic: q.topic, correct: chosen[i] === q.answer, chosen: chosen[i] ?? null }))
}

export const percent = (items: { correct: boolean }[]) => (items.length ? Math.round((items.filter((i) => i.correct).length / items.length) * 100) : 0)
