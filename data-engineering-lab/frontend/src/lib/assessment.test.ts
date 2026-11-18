import { describe, expect, it } from 'vitest'
import { pickAssessment, percent, scoreAssessment } from './assessment'
import { mulberry32 } from './interview'
import type { McqItem } from './types'

const bank: McqItem[] = Array.from({ length: 60 }, (_, i) => ({
  id: `q${i}`, q: `Q${i}`, options: ['A', 'B', 'C', 'D'], answer: i % 4, why: 'because', level: 'beginner', topic: i % 2 ? 'sql' : 'python',
}))
const cfg = { kind: 'quiz' as const, topic: 'all', level: 'all', count: 10 }

describe('pickAssessment', () => {
  it('returns unique questions filtered by topic', () => {
    const items = pickAssessment(bank, { ...cfg, topic: 'sql' }, {}, [], mulberry32(1))
    expect(items).toHaveLength(10)
    expect(items.every((q) => q.topic === 'sql')).toBe(true)
    expect(new Set(items.map((q) => q.id)).size).toBe(10)
  })
  it('does not repeat questions from the previous test when alternatives exist', () => {
    const first = pickAssessment(bank, cfg, {}, [], mulberry32(2))
    const second = pickAssessment(bank, cfg, {}, first.map((q) => q.id), mulberry32(3))
    expect(second.filter((q) => first.some((f) => f.id === q.id))).toHaveLength(0)
  })
  it('prefers questions seen least often', () => {
    const seen: Record<string, number> = {}
    bank.slice(0, 50).forEach((q) => { seen[q.id] = 3 })
    const items = pickAssessment(bank, cfg, seen, [], mulberry32(4))
    expect(items.every((q) => Number(q.id.slice(1)) >= 50)).toBe(true)
  })
  it('keeps the correct answer in sync after shuffling options', () => {
    const items = pickAssessment(bank, cfg, {}, [], mulberry32(5))
    for (const q of items) {
      const original = bank.find((b) => b.id === q.id)!
      expect(q.options[q.answer]).toBe(original.options[original.answer])
    }
  })
})

describe('scoring', () => {
  const items = bank.slice(0, 4)
  it('scores correct, wrong and unanswered', () => {
    const res = scoreAssessment(items, [items[0].answer, (items[1].answer + 1) % 4, null, items[3].answer])
    expect(res.map((r) => r.correct)).toEqual([true, false, false, true])
    expect(percent(res)).toBe(50)
  })
  it('handles an empty test', () => { expect(percent([])).toBe(0) })
})
