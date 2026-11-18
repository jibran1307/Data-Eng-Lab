import { describe, expect, it } from 'vitest'
import { expandTemplate, INTERVIEW_TYPES, mixSignature, mulberry32, parseImportedQuestions, pickInterview, randomMix, recentQuestionIds, buildReport, templateVariantCount, type InterviewConfig } from './interview'
import { TEMPLATES } from './templates'
import type { BankQuestion, InterviewResult } from './types'

const TOPICS = ['sql', 'python', 'etl', 'spark', 'azure', 'scenario']
const bank: BankQuestion[] = TOPICS.flatMap((t) =>
  Array.from({ length: 30 }, (_, i): BankQuestion => ({
    id: `${t}-${i}`, topic: t, type: 'concept', level: (['beginner', 'intermediate', 'advanced', 'expert'] as const)[i % 4],
    q: `Question ${t} ${i}`, answer: 'answer', keywords: [['answer']],
  })))

const cfg = (over: Partial<InterviewConfig> = {}): InterviewConfig => ({ type: 'mixed', difficulty: 'intermediate', durationMin: 30, count: 10, topics: TOPICS, ...over })

describe('mixSignature / randomMix', () => {
  it('is order-independent and ignores zero counts', () => {
    expect(mixSignature({ sql: 2, python: 1, etl: 0 })).toBe(mixSignature({ python: 1, sql: 2 }))
  })
  it('distributes exactly `count` questions within availability', () => {
    const mix = randomMix(10, { sql: 3, python: 2, etl: 1 }, { sql: 4, python: 4, etl: 4 }, mulberry32(1))
    expect(Object.values(mix).reduce((a, b) => a + b, 0)).toBe(10)
    Object.values(mix).forEach((n) => expect(n).toBeLessThanOrEqual(4))
  })
})

describe('pickInterview', () => {
  it('returns the requested number of unique questions', () => {
    const r = pickInterview({ bank, templates: [], cfg: cfg(), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(7) })
    expect(r.questions).toHaveLength(10)
    expect(new Set(r.questions.map((q) => q.id)).size).toBe(10)
  })

  it('generates many different question mixes across runs', () => {
    const sigs = new Set<string>()
    for (let s = 0; s < 30; s++) sigs.add(pickInterview({ bank, templates: [], cfg: cfg(), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(s) }).signature)
    expect(sigs.size).toBeGreaterThan(15)
  })

  it('never repeats a recent mix signature when alternatives exist', () => {
    let recent: string[] = []
    for (let s = 0; s < 25; s++) {
      const r = pickInterview({ bank, templates: [], cfg: cfg(), asked: {}, recentIds: [], recentMixes: recent, rng: mulberry32(100 + s) })
      expect(recent).not.toContain(r.signature)
      recent = [r.signature, ...recent].slice(0, 10)
    }
  })

  it('avoids questions from the previous interview', () => {
    const first = pickInterview({ bank, templates: [], cfg: cfg(), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(3) })
    const asked: Record<string, number> = {}
    first.questions.forEach((q, i) => { asked[q.id] = 1000 + i })
    const second = pickInterview({ bank, templates: [], cfg: cfg(), asked, recentIds: first.questions.map((q) => q.id), recentMixes: [first.signature], rng: mulberry32(4) })
    const overlap = second.questions.filter((q) => first.questions.some((f) => f.id === q.id))
    expect(overlap).toHaveLength(0)
  })

  it('cycles through the whole pool before repeating (unseen first)', () => {
    const seen = new Set<string>()
    const asked: Record<string, number> = {}
    let t = 1_700_000_000_000
    const pool = bank.filter((q) => q.topic === 'sql' && q.level !== 'expert').length // 'expert' is out of scope at intermediate difficulty
    const rounds = Math.floor(pool / 5)
    let recent: string[] = []
    for (let i = 0; i < rounds; i++) {
      const r = pickInterview({ bank, templates: [], cfg: cfg({ topics: ['sql'], count: 5, difficulty: 'intermediate' }), asked, recentIds: recent, recentMixes: [], rng: mulberry32(i) })
      r.questions.forEach((q) => { expect(seen.has(q.id)).toBe(false); seen.add(q.id); asked[q.id] = t++ })
      recent = r.questions.map((q) => q.id)
    }
  })

  it('respects topic selection and the interview type weights', () => {
    const r = pickInterview({ bank, templates: [], cfg: cfg({ topics: ['spark'], count: 6 }), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(9) })
    expect(r.questions.every((q) => q.topic === 'spark')).toBe(true)
    expect(INTERVIEW_TYPES).toHaveLength(10)
  })

  it('caps the count at what is available', () => {
    const small = bank.filter((q) => q.topic === 'sql').slice(0, 3)
    const r = pickInterview({ bank: small, templates: [], cfg: cfg({ topics: ['sql'], count: 20, difficulty: 'expert' }), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(1) })
    expect(r.questions.length).toBeLessThanOrEqual(3)
  })

  it('includes template-generated variants that differ between runs', () => {
    const tpl = TEMPLATES.filter((t) => t.topic === 'scenario')
    const ids = new Set<string>()
    for (let s = 0; s < 20; s++) {
      const r = pickInterview({ bank: [], templates: tpl, cfg: cfg({ topics: ['scenario'], count: 1, difficulty: 'intermediate' }), asked: {}, recentIds: [], recentMixes: [], rng: mulberry32(s) })
      r.questions.forEach((q) => ids.add(q.id))
    }
    expect(ids.size).toBeGreaterThan(5)
  })
})

describe('templates', () => {
  it('every template has valid slots and multiplies into many variants', () => {
    expect(TEMPLATES.length).toBeGreaterThanOrEqual(6)
    for (const t of TEMPLATES) {
      const names = [...t.q.matchAll(/\{(\w+)\}/g)].map((m) => m[1])
      names.forEach((n) => expect(t.slots[n], `${t.id}:${n}`).toBeDefined())
      expect(templateVariantCount(t)).toBeGreaterThanOrEqual(20)
      const q = expandTemplate(t, mulberry32(1))
      expect(q.q).not.toMatch(/\{\w+\}/)
      expect(q.id.startsWith('tpl:')).toBe(true)
    }
  })
  it('total variant space is large', () => {
    expect(TEMPLATES.reduce((a, t) => a + templateVariantCount(t), 0)).toBeGreaterThan(1000)
  })
})

describe('parseImportedQuestions', () => {
  it('accepts valid items, generates keywords and rejects bad ones', () => {
    const { ok, errors } = parseImportedQuestions([
      { q: 'Explain what idempotency means in a pipeline.', answer: 'Running twice gives the same result using upserts and deterministic keys.', topic: 'etl' },
      { q: 'short', answer: 'x', topic: 'etl' },
      { q: 'Valid length question but bad topic', answer: 'x', topic: 'nope' },
    ])
    expect(ok).toHaveLength(1)
    expect(ok[0].custom).toBe(true)
    expect(ok[0].keywords.length).toBeGreaterThan(0)
    expect(errors).toHaveLength(2)
  })
  it('accepts the {questions: []} wrapper and rejects non-arrays', () => {
    expect(parseImportedQuestions({ questions: [] }).errors).toHaveLength(0)
    expect(parseImportedQuestions({ foo: 1 }).errors).toHaveLength(1)
  })
  it('gives stable ids so re-importing does not create duplicates', () => {
    const item = { q: 'What is a surrogate key and why use one?', answer: 'A warehouse-generated integer key.', topic: 'warehousing' }
    expect(parseImportedQuestions([item]).ok[0].id).toBe(parseImportedQuestions([item]).ok[0].id)
  })
})

describe('report + history helpers', () => {
  const per = (score: number, qtype: InterviewResult['perQuestion'][number]['qtype'], skipped = false) =>
    ({ qid: 'x' + score, topic: 'sql', qtype, answer: '', score, matched: [], missed: [], skipped, q: '', expected: '' })
  it('averages scores and counts skipped as zero', () => {
    const r = buildReport([per(100, 'concept'), per(50, 'sql'), per(80, 'scenario', true)])
    expect(r.overall).toBe(50)
    expect(r.dims.conceptual).toBe(100)
    expect(r.dims.practical).toBe(50)
    expect(r.dims.problem).toBe(0)
  })
  it('handles empty input', () => { expect(buildReport([]).overall).toBe(0) })
  it('recentQuestionIds takes the most recent N interviews', () => {
    const h = [{ perQuestion: [{ qid: 'a' }] }, { perQuestion: [{ qid: 'b' }] }] as unknown as InterviewResult[]
    expect(recentQuestionIds(h, 1)).toEqual(['a'])
    expect(recentQuestionIds(h, 2)).toEqual(['a', 'b'])
  })
})
