import { describe, expect, it } from 'vitest'
import { evaluateAnswer, gradeLabel } from './evaluate'

const kw = [['idempotent', 'idempotency'], ['upsert', 'merge'], ['primary key', 'business key']]

describe('evaluateAnswer', () => {
  it('scores a complete answer highly and lists matches', () => {
    const r = evaluateAnswer('An idempotent load uses MERGE on the business key so re-running it produces the same result without duplicates.', kw)
    expect(r.score).toBeGreaterThanOrEqual(90)
    expect(r.missed).toHaveLength(0)
  })
  it('reports missed concepts for partial answers', () => {
    const r = evaluateAnswer('Use an upsert so that the load can be re-run safely and nothing is duplicated.', kw)
    expect(r.matched).toEqual(['upsert'])
    expect(r.missed).toContain('idempotent')
    expect(r.score).toBeGreaterThan(0)
    expect(r.score).toBeLessThan(100)
  })
  it('gives zero for empty answers', () => {
    const r = evaluateAnswer('   ', kw)
    expect(r.score).toBe(0)
    expect(r.depthNote).toMatch(/No answer/)
  })
  it('does not let a bare keyword dump reach full marks', () => {
    expect(evaluateAnswer('idempotent merge primary key', kw).score).toBeLessThan(100)
  })
  it('is case- and punctuation-insensitive', () => {
    expect(evaluateAnswer('IDEMPOTENT!!! Upsert... PRIMARY-KEY handling for safe reruns of the load job.', kw).missed).toHaveLength(0)
  })
  it('maps scores to labels', () => {
    expect([gradeLabel(90), gradeLabel(75), gradeLabel(55), gradeLabel(10)]).toEqual(['Excellent', 'Strong', 'Developing', 'Needs work'])
  })
})
