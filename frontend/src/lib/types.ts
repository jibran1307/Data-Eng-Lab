import type { AssessmentConfig } from './assessment'
import type { InterviewConfig } from './interview'

export type Level = 'beginner' | 'intermediate' | 'advanced'

export interface ModuleMeta { id: string; title: string; number: number; color: string; description: string }

export interface McqItem {
  id: string; q: string; options: string[]; answer: number; why: string; level: Level; topic: string; lesson?: string
}
export interface InterviewQA { q: string; a: string }
export interface LessonIndex {
  id: string; module: string; title: string; minutes: number; level: Level; prereqs: string[]
  summary: string; exercises: string[]; quiz_count: number; interview_count: number
}
export interface Lesson extends Omit<LessonIndex, 'quiz_count' | 'interview_count'> {
  body: string; quiz: Omit<McqItem, 'id' | 'topic'>[]; interview: InterviewQA[]
}

export interface SqlExercise {
  id: string; title: string; category: string; level: Level; prompt: string; tables: string[]
  hints: string[]; ordered?: boolean; starter?: string; topic: string
}
export interface PyExercise {
  id: string; title: string; category: string; level: Level; prompt: string
  hints: string[]; starter: string; expected: string; topic: string
}

export interface ProjectStep { id: string; title: string; detail: string; code?: string; lang?: string }
export interface Milestone { id: string; title: string; steps: ProjectStep[] }
export interface Project {
  id: string; title: string; level: Level; hours: number; tagline: string
  requirement: string; problem: string; dataset: string; architecture: string
  milestones: Milestone[]; expected: string; checklist: string[]; errors: { err: string; fix: string }[]
  discussion: string[]; modules: string[]
}

export interface Scenario {
  id: string; title: string; topic: string; level: Level; business: string; task: string
  hints: string[]; reference: string; rubric: { name: string; weight: number; keywords: string[][]; tip: string }[]
  realworld: string
}

export type QType = 'concept' | 'sql' | 'python' | 'scenario' | 'design' | 'troubleshoot'
export interface BankQuestion {
  id: string; topic: string; type: QType; level: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  q: string; answer: string; keywords: string[][]; hints?: string[]; custom?: boolean
  variantOf?: string
}

export interface ActivityItem { ts: number; type: string; label: string }
export interface AssessmentResult {
  id: string; ts: number; kind: string; level: string; durationSec: number; timed: boolean
  items: { qid: string; topic: string; correct: boolean; chosen: number | null }[]
  score: number
}
export interface InterviewResult {
  id: string; ts: number; type: string; level: string; durationMin: number; usedSec: number
  perQuestion: { qid: string; topic: string; qtype: QType; answer: string; score: number; matched: string[]; missed: string[]; skipped: boolean; q: string; expected: string }[]
  overall: number; dims: Record<string, number>; mix: Record<string, number>
}

export interface Settings {
  dailyTargetMin: number; weeklyGoalLessons: number
  revisionIntervals: number[]; interviewHistoryWindow: number
}

export interface AppState {
  v: 1
  completed: Record<string, number>
  bookmarks: string[]
  notes: Record<string, string>
  quiz: Record<string, { score: number; total: number; ts: number }>
  exercises: Record<string, { solved: boolean; attempts: number; correct: number; ts: number }>
  projects: Record<string, Record<string, boolean>>
  scenarios: Record<string, { best: number; attempts: { score: number; ts: number }[]; last?: { answer: string; score: number; ts: number } }>
  assessments: AssessmentResult[]
  assessmentSeen: Record<string, number>
  lastAssessmentQs: string[]
  interviews: InterviewResult[]
  askedQs: Record<string, number>
  mixSignatures: string[]
  customQuestions: BankQuestion[]
  activity: ActivityItem[]
  studyMinutes: Record<string, number>
  revisions: Record<string, { stage: number; due: number; last: number }>
  settings: Settings
  startedAt: number
  profile: { name: string }
  /** Unsubmitted editor/textarea text, keyed like `sql:free`, `sql:<exerciseId>`, `py:<exerciseId>`, `scn:<scenarioId>`. */
  drafts: Record<string, string>
  /** Last submission per exercise; `solved` is the most recent passing submission. */
  submissions: Record<string, Submission>
  activeAssessment: ActiveAssessment | null
  activeInterview: ActiveInterview | null
}

export interface Submission { code: string; ts: number; passed: boolean; solved?: { code: string; ts: number } }
export interface ActiveAssessment { ids: string[]; cfg: AssessmentConfig; chosen: (number | null)[]; i: number; startedAt: number }
export interface InterviewAnswer { text: string; skipped: boolean }
export interface ActiveInterview {
  qs: BankQuestion[]; cfg: InterviewConfig; answers: Record<string, InterviewAnswer>; i: number; hints: number; startedAt: number
}
