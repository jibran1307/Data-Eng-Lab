/**
 * Transparent, rubric-based answer evaluation.
 *
 * Each question carries `keywords`: a list of concept groups. A group is satisfied when ANY of its
 * synonyms appears in the answer (case-insensitive, punctuation-insensitive). The score is the weighted
 * fraction of satisfied groups, with a small depth factor so one-word answers cannot score 100.
 * No AI is involved; the report lists exactly which concepts were found or missed.
 */
export interface Evaluation { score: number; matched: string[]; missed: string[]; depthNote: string }

const norm = (s: string) => s.toLowerCase().replace(/[_-]/g, ' ').replace(/[^a-z0-9 +*#()=<>.]/g, ' ').replace(/\s+/g, ' ').trim()

export function evaluateAnswer(answer: string, keywords: string[][], opts: { minWords?: number } = {}): Evaluation {
  const text = ' ' + norm(answer) + ' '
  const words = answer.trim().split(/\s+/).filter(Boolean).length
  if (!answer.trim() || keywords.length === 0) {
    return { score: 0, matched: [], missed: keywords.map((g) => g[0]), depthNote: answer.trim() ? '' : 'No answer was provided.' }
  }
  const matched: string[] = []
  const missed: string[] = []
  for (const group of keywords) {
    const hit = group.some((k) => text.includes(norm(k)) && norm(k).length > 0)
    ;(hit ? matched : missed).push(group[0])
  }
  const coverage = matched.length / keywords.length
  const minWords = opts.minWords ?? Math.min(25, Math.max(5, keywords.length * 4))
  const depth = Math.min(1, 0.55 + 0.45 * (words / minWords))
  const score = Math.round(coverage * 100 * depth)
  const depthNote = depth < 1 ? `Answer is brief (${words} words); explaining the "why" and giving an example would earn more credit.` : ''
  return { score: Math.min(100, score), matched, missed, depthNote }
}

export const gradeLabel = (s: number) => (s >= 85 ? 'Excellent' : s >= 70 ? 'Strong' : s >= 50 ? 'Developing' : 'Needs work')
