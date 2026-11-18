import { describe, expect, it } from 'vitest'
import { dueRevisions, isUnlocked, moduleProgress, reviewLesson, scheduleRevision, streak, topicAccuracy, upcomingRevisions, weakTopics, recommend } from './engine'
import { dayKey, DAY, defaultState } from './store'
import type { LessonIndex, ModuleMeta } from './types'

const NOW = new Date('2026-03-10T12:00:00').getTime()
const lesson = (id: string, module: string, prereqs: string[] = []): LessonIndex =>
  ({ id, module, title: id, minutes: 10, level: 'beginner', prereqs, summary: '', exercises: [], quiz_count: 1, interview_count: 1 })
const lessons = [lesson('a', 'sql'), lesson('b', 'sql', ['a']), lesson('c', 'python')]
const modules = [{ id: 'sql', title: 'SQL' }, { id: 'python', title: 'Python' }] as unknown as ModuleMeta[]

describe('progress and prerequisites', () => {
  it('computes module progress', () => {
    const s = { ...defaultState(), completed: { a: NOW } }
    expect(moduleProgress(s, lessons, 'sql')).toMatchObject({ done: 1, total: 2 })
  })
  it('locks lessons until prerequisites are complete', () => {
    const s = defaultState()
    expect(isUnlocked(s, lessons[1])).toEqual({ ok: false, missing: ['a'] })
    expect(isUnlocked({ ...s, completed: { a: 1 } }, lessons[1]).ok).toBe(true)
  })
})

describe('spaced repetition', () => {
  it('schedules the first review after the first interval', () => {
    const r = scheduleRevision(defaultState(), 'a', NOW)
    expect(r.a.due).toBe(NOW + DAY)
  })
  it('advances the interval when remembered and resets when forgotten', () => {
    let s = { ...defaultState(), revisions: scheduleRevision(defaultState(), 'a', NOW) }
    s = { ...s, revisions: reviewLesson(s, 'a', true, NOW) }
    expect(s.revisions.a.due).toBe(NOW + 3 * DAY)
    s = { ...s, revisions: reviewLesson(s, 'a', true, NOW) }
    expect(s.revisions.a.stage).toBe(2)
    s = { ...s, revisions: reviewLesson(s, 'a', false, NOW) }
    expect(s.revisions.a.stage).toBe(0)
    expect(s.revisions.a.due).toBe(NOW + DAY)
  })
  it('caps the stage at the last interval', () => {
    let s = defaultState()
    s = { ...s, revisions: scheduleRevision(s, 'a', NOW) }
    for (let i = 0; i < 12; i++) s = { ...s, revisions: reviewLesson(s, 'a', true, NOW) }
    expect(s.revisions.a.stage).toBe(s.settings.revisionIntervals.length - 1)
  })
  it('separates due and upcoming revisions', () => {
    const s = { ...defaultState(), revisions: { a: { stage: 0, due: NOW - 1, last: 0 }, b: { stage: 0, due: NOW + DAY, last: 0 } } }
    expect(dueRevisions(s, NOW).map((r) => r.id)).toEqual(['a'])
    expect(upcomingRevisions(s, NOW).map((r) => r.id)).toEqual(['b'])
  })
})

describe('streak', () => {
  it('counts consecutive days including a grace for today', () => {
    const s = { ...defaultState(), studyMinutes: { [dayKey(NOW - DAY)]: 10, [dayKey(NOW - 2 * DAY)]: 5 } }
    expect(streak(s, NOW)).toBe(2)
  })
  it('breaks on a gap', () => {
    const s = { ...defaultState(), studyMinutes: { [dayKey(NOW)]: 10, [dayKey(NOW - 3 * DAY)]: 5 } }
    expect(streak(s, NOW)).toBe(1)
  })
  it('is zero with no activity', () => { expect(streak(defaultState(), NOW)).toBe(0) })
})

describe('weak topics and recommendations', () => {
  const sqlWrong = Array.from({ length: 5 }, (_, i) => ({ qid: 'q' + i, topic: 'sql', correct: false, chosen: 0 }))
  const state = { ...defaultState(), assessments: [{ id: 'x', ts: NOW, kind: 'quiz', level: 'all', durationSec: 1, timed: false, items: sqlWrong, score: 0 }] }
  it('detects weak topics from assessments', () => {
    expect(topicAccuracy(state)[0]).toMatchObject({ topic: 'sql', acc: 0 })
    expect(weakTopics(state).map((t) => t.topic)).toContain('sql')
  })
  it('needs enough samples before flagging', () => {
    expect(weakTopics(defaultState())).toEqual([])
  })
  it('recommends something for a brand-new learner and surfaces due revisions', () => {
    expect(recommend(defaultState(), lessons, modules, NOW).length).toBeGreaterThan(0)
    const due = { ...defaultState(), completed: { a: 1 }, revisions: { a: { stage: 0, due: NOW - 1, last: 0 } } }
    expect(recommend(due, lessons, modules, NOW).some((r) => r.kind === 'revise')).toBe(true)
  })
})
