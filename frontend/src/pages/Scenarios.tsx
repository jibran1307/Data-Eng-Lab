import { useEffect, useState } from 'react'
import { CheckCircle2, Lightbulb, Send, XCircle } from 'lucide-react'
import Markdown from '../components/Markdown'
import { Badge, Button, Card, EmptyState, LevelBadge, PageHeader, PageSkeleton, ProgressBar, cx } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import { evaluateAnswer } from '../lib/evaluate'
import type { Scenario } from '../lib/types'

interface Verdict { score: number; rows: { name: string; weight: number; hit: boolean; tip: string }[] }

function grade(sc: Scenario, answer: string): Verdict {
  const rows = sc.rubric.map((r) => {
    const ev = evaluateAnswer(answer, r.keywords, { minWords: 1 })
    return { name: r.name, weight: r.weight, hit: ev.score >= 50, tip: r.tip }
  })
  const total = rows.reduce((a, r) => a + r.weight, 0)
  const got = rows.reduce((a, r) => a + (r.hit ? r.weight : 0), 0)
  const words = answer.trim().split(/\s+/).filter(Boolean).length
  const depth = Math.min(1, 0.6 + 0.4 * (words / 60))
  return { score: Math.round((got / total) * 100 * depth), rows }
}

export default function Scenarios() {
  const { state, update, log } = useStore()
  const toast = useToast()
  const [list, setList] = useState<Scenario[] | null>(null)
  const [sel, setSel] = useState<string>('')
  const [answer, setAnswer] = useState('')
  const [hints, setHints] = useState(0)
  const [verdict, setVerdict] = useState<Verdict | null>(null)
  const [err, setErr] = useState('')
  useStudyTimer(true)

  useEffect(() => { cached<Scenario[]>('/api/content/scenarios').then((s) => { setList(s); setSel(s[0]?.id ?? '') }).catch(() => setErr(`Could not load scenarios. ${LOAD_HINT}`)) }, [])
  const pick = (id: string) => { setSel(id); setAnswer(''); setHints(0); setVerdict(null) }

  if (err) return <EmptyState title="Scenarios unavailable" hint={err} />
  if (!list) return <PageSkeleton />
  const sc = list.find((s) => s.id === sel)
  if (!sc) return <EmptyState title="No scenarios" />

  const submit = () => {
    if (answer.trim().length < 20) { toast('Write a fuller answer first (at least a couple of sentences).', 'error'); return }
    const v = grade(sc, answer)
    setVerdict(v)
    update((s) => {
      const p = s.scenarios[sc.id] ?? { best: 0, attempts: [] }
      return { ...s, scenarios: { ...s.scenarios, [sc.id]: { best: Math.max(p.best, v.score), attempts: [...p.attempts, { score: v.score, ts: Date.now() }].slice(-20) } } }
    })
    log('scenario', `Scenario "${sc.title}" scored ${v.score}%`)
  }

  return (
    <div>
      <PageHeader title="Scenario Practice" subtitle="Real production problems. Write your own solution first, then compare it against the rubric and the reference approach." />
      <div className="grid gap-5 lg:grid-cols-[280px_minmax(0,1fr)]">
        <Card className="max-h-[75vh] self-start overflow-y-auto">
          {list.map((s) => {
            const best = state.scenarios[s.id]?.best
            return (
              <button key={s.id} onClick={() => pick(s.id)} className={cx('flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface2', sel === s.id && 'bg-accent-soft')}>
                <span className="min-w-0 flex-1"><span className="block text-sm">{s.title}</span><span className="text-xs text-muted">{s.topic}</span></span>
                {best !== undefined ? <Badge tone={best >= 70 ? 'ok' : 'warn'}>{best}%</Badge> : <LevelBadge level={s.level} />}
              </button>
            )
          })}
        </Card>

        <div className="min-w-0 space-y-4">
          <Card className="p-5">
            <div className="mb-2 flex items-center gap-2"><h2 className="text-lg font-semibold">{sc.title}</h2><LevelBadge level={sc.level} /></div>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Business problem</h3>
            <Markdown>{sc.business}</Markdown>
            <h3 className="mt-3 text-xs font-medium uppercase tracking-wide text-muted">Your task</h3>
            <p className="mt-1 text-sm">{sc.task}</p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-2 font-semibold">Your proposed solution</h3>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={9} placeholder="Describe your approach: what you would check first, what you would build, how you would verify and prevent recurrence..."
              className="w-full resize-y rounded-lg border border-line bg-surface2 p-3 text-sm focus:border-accent focus:outline-none" />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="primary" onClick={submit}><Send size={14} />Evaluate my answer</Button>
              <Button onClick={() => setHints((h) => Math.min(h + 1, sc.hints.length))} disabled={hints >= sc.hints.length}><Lightbulb size={14} />Hint {hints}/{sc.hints.length}</Button>
              <span className="ml-auto text-xs text-muted">{answer.trim().split(/\s+/).filter(Boolean).length} words</span>
            </div>
            {hints > 0 && <ol className="mt-3 list-decimal space-y-1 rounded-lg bg-surface2 p-3 pl-7 text-sm">{sc.hints.slice(0, hints).map((h, i) => <li key={i}>{h}</li>)}</ol>}
          </Card>

          {verdict && (
            <Card className="p-5">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Rubric evaluation</h3><span className="text-2xl font-semibold">{verdict.score}%</span></div>
              <ProgressBar value={verdict.score} className="mb-4" />
              <ul className="space-y-2">
                {verdict.rows.map((r) => (
                  <li key={r.name} className="flex items-start gap-2 text-sm">
                    {r.hit ? <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-ok" /> : <XCircle size={16} className="mt-0.5 shrink-0 text-bad" />}
                    <div><span className="font-medium">{r.name}</span> <span className="text-xs text-muted">(weight {r.weight})</span>{!r.hit && <div className="text-muted">{r.tip}</div>}</div>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">This is a keyword-based rubric check, not AI grading. Compare your reasoning with the reference below; a good answer can use different words.</p>
            </Card>
          )}

          {verdict && (
            <>
              <Card className="p-5"><h3 className="mb-1 font-semibold">Reference approach</h3><Markdown>{sc.reference}</Markdown></Card>
              <Card className="p-5"><h3 className="mb-1 font-semibold">How this works in a real organisation</h3><Markdown>{sc.realworld}</Markdown></Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
