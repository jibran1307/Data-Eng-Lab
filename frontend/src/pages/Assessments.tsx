import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Line, LineChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Clock, Play } from 'lucide-react'
import { Badge, Button, Card, EmptyState, PageHeader, PageSkeleton, ProgressBar, Select, Tabs, cx } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { TOPIC_LABEL } from '../lib/engine'
import { KINDS, percent, pickAssessment, scoreAssessment, type AssessmentConfig } from '../lib/assessment'
import type { AssessmentResult, McqItem } from '../lib/types'

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

function Runner({ items, cfg, init, onProgress, onDone }: {
  items: McqItem[]; cfg: AssessmentConfig; init: { chosen: (number | null)[]; i: number; startedAt: number }
  onProgress: (chosen: (number | null)[], i: number) => void; onDone: (chosen: (number | null)[], sec: number) => void
}) {
  const [i, setI] = useState(init.i)
  const [chosen, setChosen] = useState<(number | null)[]>(init.chosen)
  const perQ = KINDS[cfg.kind].perQuestionSec
  const timed = perQ > 0
  const total = items.length * perQ
  const remaining = () => Math.max(0, total - Math.floor((Date.now() - init.startedAt) / 1000))
  const [left, setLeft] = useState(remaining)
  const done = useRef(false)
  const ref = useRef(chosen)
  const onDoneRef = useRef(onDone)
  useEffect(() => { ref.current = chosen; onDoneRef.current = onDone })
  const finish = useCallback(() => { if (done.current) return; done.current = true; onDoneRef.current(ref.current, Math.round((Date.now() - init.startedAt) / 1000)) }, [init.startedAt])
  useEffect(() => {
    if (!timed) return
    const tick = () => { const l = Math.max(0, total - Math.floor((Date.now() - init.startedAt) / 1000)); setLeft(l); if (l <= 0) { window.clearInterval(id); finish() } }
    const id = window.setInterval(tick, 1000)
    tick()
    return () => window.clearInterval(id)
  }, [timed, total, init.startedAt, finish])
  const go = (ni: number) => { setI(ni); onProgress(chosen, ni) }
  const pick = (j: number) => { const nc = chosen.map((x, k) => (k === i ? j : x)); setChosen(nc); onProgress(nc, i) }
  const q = items[i]
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between text-sm"><span className="text-muted">Question {i + 1} of {items.length}</span>{timed && <span className={cx('flex items-center gap-1.5 font-mono', left < 60 && 'text-bad')}><Clock size={14} />{fmt(left)}</span>}</div>
      <ProgressBar value={(chosen.filter((c) => c !== null).length / items.length) * 100} />
      <Card className="p-5">
        <div className="mb-2 flex gap-2"><Badge tone="accent">{TOPIC_LABEL[q.topic] ?? q.topic}</Badge><Badge>{q.level}</Badge></div>
        <p className="mb-4 text-base">{q.q}</p>
        <div className="space-y-2">{q.options.map((o, j) => (
          <button key={j} onClick={() => pick(j)}
            className={cx('flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm', chosen[i] === j ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface2')}>
            <span className="w-4 text-xs text-muted">{String.fromCharCode(65 + j)}</span><span>{o}</span></button>))}</div>
      </Card>
      <div className="flex items-center gap-2">
        <Button disabled={i === 0} onClick={() => go(i - 1)}>Previous</Button>
        {i + 1 < items.length ? <Button variant="primary" onClick={() => go(i + 1)}>Next</Button> : <Button variant="primary" onClick={finish}>Submit assessment</Button>}
        {i + 1 < items.length && <Button variant="ghost" className="ml-auto" onClick={finish}>Submit now</Button>}
      </div>
      <p className="text-xs text-muted">Your answers are saved as you go. If you leave this page you can pick the test up where you stopped{timed ? '; the timer keeps running' : ''}.</p>
    </div>
  )
}

function Review({ result, items }: { result: AssessmentResult; items: McqItem[] }) {
  const byTopic = useMemo(() => {
    const m: Record<string, { right: number; total: number }> = {}
    result.items.forEach((it) => { const x = (m[it.topic] ??= { right: 0, total: 0 }); x.total++; if (it.correct) x.right++ })
    return Object.entries(m).map(([topic, x]) => ({ topic, pct: Math.round((x.right / x.total) * 100), ...x })).sort((a, b) => a.pct - b.pct)
  }, [result])
  const weak = byTopic.filter((x) => x.pct < 70)
  return (
    <div className="space-y-4">
      <Card className="p-6 text-center"><div className="text-6xl font-semibold tracking-tight">{result.score}%</div><div className="mt-1 text-sm text-muted">{result.items.filter((i) => i.correct).length} of {result.items.length} correct</div></Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">By topic</h2><div className="space-y-2">{byTopic.map((x) => <div key={x.topic}><div className="mb-1 flex justify-between text-sm"><span>{TOPIC_LABEL[x.topic] ?? x.topic}</span><span className="text-muted">{x.right}/{x.total}</span></div><ProgressBar value={x.pct} /></div>)}</div>
        {weak.length > 0 && <p className="mt-4 text-sm"><b>Recommended revision:</b> {weak.map((w, i) => <span key={w.topic}>{i > 0 && ', '}<Link className="text-accent underline" to="/learn">{TOPIC_LABEL[w.topic] ?? w.topic}</Link></span>)}.</p>}</Card>
      {items.map((q, i) => {
        const it = result.items[i]
        return (
          <Card key={q.id} className={cx('p-4', it.correct ? 'border-ok/30' : 'border-bad/30')}>
            <div className="mb-1 flex items-center gap-2"><Badge tone={it.correct ? 'ok' : 'bad'}>{it.correct ? 'correct' : it.chosen === null ? 'unanswered' : 'incorrect'}</Badge><Badge>{TOPIC_LABEL[q.topic] ?? q.topic}</Badge></div>
            <p className="text-sm font-medium">{i + 1}. {q.q}</p>
            <ul className="mt-2 space-y-1 text-sm">{q.options.map((o, j) => <li key={j} className={cx('rounded px-2 py-1', j === q.answer && 'bg-ok/10 text-ok', j === it.chosen && j !== q.answer && 'bg-bad/10 text-bad')}>{String.fromCharCode(65 + j)}. {o}</li>)}</ul>
            {!it.correct && <p className="mt-2 rounded-lg bg-surface2 p-3 text-sm text-muted"><b className="text-fg">Why: </b>{q.why}</p>}
          </Card>)
      })}
    </div>
  )
}

export default function Assessments() {
  const { state, update, log } = useStore()
  const [bank, setBank] = useState<McqItem[] | null>(null)
  const [tab, setTab] = useState<'new' | 'history'>('new')
  const [cfg, setCfg] = useState<AssessmentConfig>({ kind: 'quiz', topic: 'all', level: 'all', count: 10 })
  const [review, setReview] = useState<{ result: AssessmentResult; items: McqItem[] } | null>(null)
  const [err, setErr] = useState('')
  const [msg, setMsg] = useState('')
  useEffect(() => { cached<McqItem[]>('/api/content/mcq').then(setBank).catch(() => setErr(`Could not load questions. ${LOAD_HINT}`)) }, [])

  const active = state.activeAssessment
  const run = useMemo(() => {
    if (!active || !bank) return null
    const items = active.ids.map((id) => bank.find((q) => q.id === id)).filter((q): q is McqItem => !!q)
    return items.length === active.ids.length ? { items, cfg: active.cfg, active } : null
  }, [active, bank])
  useStudyTimer(!!run)

  const topics = useMemo(() => [...new Set((bank ?? []).map((q) => q.topic))], [bank])
  const start = () => {
    if (!bank) return
    const c = { ...cfg, count: KINDS[cfg.kind].count }
    const items = pickAssessment(bank, c, state.assessmentSeen, state.lastAssessmentQs)
    if (!items.length) { setMsg('No questions match this selection. Choose another topic or level.'); return }
    setMsg('')
    update((s) => { const seen = { ...s.assessmentSeen }; items.forEach((q) => { seen[q.id] = (seen[q.id] ?? 0) + 1 }); return { ...s, assessmentSeen: seen, lastAssessmentQs: items.map((q) => q.id), activeAssessment: { ids: items.map((q) => q.id), cfg: c, chosen: items.map(() => null), i: 0, startedAt: Date.now() } } })
  }
  const done = useCallback((chosen: (number | null)[], sec: number) => {
    if (!run) return
    const items = scoreAssessment(run.items, chosen)
    const result: AssessmentResult = { id: `as-${Date.now()}`, ts: Date.now(), kind: run.cfg.kind, level: run.cfg.level, durationSec: sec, timed: KINDS[run.cfg.kind].perQuestionSec > 0, items, score: percent(items) }
    update((s) => ({ ...s, assessments: [result, ...s.assessments].slice(0, 200), activeAssessment: null }))
    log('assessment', `${KINDS[run.cfg.kind].label} (${run.cfg.topic === 'all' ? 'all topics' : TOPIC_LABEL[run.cfg.topic] ?? run.cfg.topic}): ${result.score}%`)
    setReview({ result, items: run.items })
  }, [run, update, log])

  if (err) return <EmptyState title="Assessments unavailable" hint={err} />
  if (!bank) return <PageSkeleton />
  if (run) return <Runner key={run.active.startedAt} items={run.items} cfg={run.cfg} init={run.active}
    onProgress={(chosen, i) => update((s) => (s.activeAssessment ? { ...s, activeAssessment: { ...s.activeAssessment, chosen, i } } : s))} onDone={done} />
  if (review) return <div className="mx-auto max-w-3xl"><PageHeader title="Assessment results" actions={<Button onClick={() => setReview(null)}>Back</Button>} /><Review {...review} /></div>

  const chart = [...state.assessments].reverse().map((a, i) => ({ n: i + 1, score: a.score }))
  return (
    <div>
      <PageHeader title="Assessments" subtitle={`${bank.length} questions across ${topics.length} topics. Questions are randomised and the previous test's questions are excluded.`}
        actions={<Tabs tabs={[{ id: 'new', label: 'Take a test' }, { id: 'history', label: `History (${state.assessments.length})` }]} value={tab} onChange={setTab} />} />
      {tab === 'new' && (
        <Card className="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => (
              <button key={k} onClick={() => setCfg({ ...cfg, kind: k })} className={cx('rounded-xl border p-4 text-left', cfg.kind === k ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface2')}>
                <div className="font-medium">{KINDS[k].label}</div><div className="mt-1 text-xs text-muted">{KINDS[k].count} questions{KINDS[k].perQuestionSec ? ` - ${KINDS[k].count * KINDS[k].perQuestionSec / 60} minute limit` : ' - untimed'}</div></button>))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Select label="Topic" value={cfg.topic} onChange={(v) => setCfg({ ...cfg, topic: v })} options={[{ value: 'all', label: 'All topics' }, ...topics.map((t) => ({ value: t, label: TOPIC_LABEL[t] ?? t }))]} />
            <Select label="Level" value={cfg.level} onChange={(v) => setCfg({ ...cfg, level: v })} options={[{ value: 'all', label: 'All levels' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
            <Button variant="primary" onClick={start}><Play size={14} />Start</Button>
          </div>
          {msg && <p className="mt-3 text-sm text-bad">{msg}</p>}
          <p className="mt-4 text-xs text-muted">SQL and Python coding challenges, debugging tasks and scenario questions live in the Exercises, Scenario Practice and Mock Interviews sections; results from all of them feed your weak-area analysis.</p>
        </Card>)}
      {tab === 'history' && (state.assessments.length === 0 ? <EmptyState title="No assessments taken yet" hint="Your scores and trend chart will appear here." /> : (
        <div className="space-y-4">
          <Card className="p-5"><h2 className="mb-3 font-semibold">Score trend</h2><div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart data={chart} margin={{ left: -20, right: 8 }}><CartesianGrid vertical={false} /><XAxis dataKey="n" tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} /><Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8 }} /><Line dataKey="score" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Card>
          <Card><ul className="divide-y divide-line">{state.assessments.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"><span className="min-w-0 flex-1"><b>{KINDS[a.kind as keyof typeof KINDS]?.label ?? a.kind}</b><span className="ml-2 text-xs text-muted">{new Date(a.ts).toLocaleString()} - {a.items.length} questions - {fmt(a.durationSec)}</span></span>
              <Badge tone={a.score >= 70 ? 'ok' : a.score >= 50 ? 'warn' : 'bad'}>{a.score}%</Badge></li>))}</ul></Card>
        </div>))}
    </div>
  )
}
