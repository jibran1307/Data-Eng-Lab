import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Clock, Download, Lightbulb, Play, Plus, SkipForward, Trash2, Upload } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import Markdown from '../components/Markdown'
import { Badge, Button, Card, EmptyState, LevelBadge, Modal, PageHeader, PageSkeleton, ProgressBar, Select, Tabs, cx } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import { evaluateAnswer, gradeLabel } from '../lib/evaluate'
import { TOPIC_LABEL } from '../lib/engine'
import {
  buildReport, DIFFICULTIES, DIM_LABELS, INTERVIEW_TYPES, parseImportedQuestions, pickInterview, recentQuestionIds, TOPIC_KEYS,
  type Difficulty, type InterviewConfig,
} from '../lib/interview'
import { TEMPLATES } from '../lib/templates'
import type { BankQuestion, InterviewResult } from '../lib/types'

type Phase = 'setup' | 'run' | 'report'
type Answer = { text: string; skipped: boolean }
const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`

function Setup({ bank, onStart }: { bank: BankQuestion[]; onStart: (cfg: InterviewConfig) => void }) {
  const [type, setType] = useState('full')
  const [difficulty, setDifficulty] = useState<Difficulty>('intermediate')
  const [duration, setDuration] = useState<15 | 30 | 45>(30)
  const [count, setCount] = useState(8)
  const [topics, setTopics] = useState<string[]>([])
  const t = INTERVIEW_TYPES.find((x) => x.id === type)!
  const counts = useMemo(() => { const m: Record<string, number> = {}; bank.forEach((q) => { m[q.topic] = (m[q.topic] ?? 0) + 1 }); TEMPLATES.forEach((x) => { m[x.topic] = (m[x.topic] ?? 0) + 1 }); return m }, [bank])
  const scope = topics.length ? topics : Object.keys(t.weights)
  return (
    <Card className="p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-4">
          <label className="block text-sm"><span className="mb-1 block font-medium">Interview type</span>
            <select className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm" value={type} onChange={(e) => { setType(e.target.value); setTopics([]) }}>
              {INTERVIEW_TYPES.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</select>
            <span className="mt-1 block text-xs text-muted">{t.description}</span></label>
          <div className="text-sm"><span className="mb-1 block font-medium">Difficulty</span>
            <Tabs tabs={DIFFICULTIES.map((d) => ({ id: d.id, label: d.label }))} value={difficulty} onChange={setDifficulty} /></div>
          <div className="text-sm"><span className="mb-1 block font-medium">Duration</span>
            <Tabs tabs={[{ id: '15', label: '15 min' }, { id: '30', label: '30 min' }, { id: '45', label: '45 min' }]} value={String(duration)} onChange={(v) => setDuration(Number(v) as 15 | 30 | 45)} /></div>
          <label className="block text-sm"><span className="mb-1 block font-medium">Number of questions: {count}</span>
            <input type="range" min={3} max={15} value={count} onChange={(e) => setCount(Number(e.target.value))} className="w-full accent-[var(--accent)]" /></label>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Topics <span className="font-normal text-muted">(none selected = the interview type default)</span></div>
          <div className="flex flex-wrap gap-1.5">
            {TOPIC_KEYS.map((k) => {
              const on = topics.includes(k)
              return <button key={k} onClick={() => setTopics((p) => (on ? p.filter((x) => x !== k) : [...p, k]))}
                className={cx('rounded-md border px-2.5 py-1 text-xs', on ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:text-fg', !on && !topics.length && k in t.weights && 'border-accent/30')}>
                {TOPIC_LABEL[k] ?? k} <span className="opacity-60">{counts[k] ?? 0}</span></button>
            })}
          </div>
          <p className="mt-3 text-xs text-muted">Every start draws a fresh mix from {bank.length} bank questions plus {TEMPLATES.length} scenario templates that generate unique variants. Scope: {scope.map((s) => TOPIC_LABEL[s] ?? s).join(', ')}.</p>
        </div>
      </div>
      <div className="mt-5"><Button variant="primary" onClick={() => onStart({ type, difficulty, durationMin: duration, count, topics })}><Play size={14} />Start interview</Button></div>
    </Card>
  )
}

function Session({ questions, cfg, onFinish }: { questions: BankQuestion[]; cfg: InterviewConfig; onFinish: (a: Record<string, Answer>, usedSec: number) => void }) {
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<Record<string, Answer>>({})
  const [hints, setHints] = useState(0)
  const [left, setLeft] = useState(cfg.durationMin * 60)
  const start = useRef(0)
  useEffect(() => { start.current = Date.now() }, [])
  const finished = useRef(false)
  const q = questions[i]
  const cur = answers[q.id]?.text ?? ''
  const coding = q.type === 'sql' || q.type === 'python'

  const finish = useCallback((a: Record<string, Answer>) => {
    if (finished.current) return
    finished.current = true
    onFinish(a, Math.round((Date.now() - start.current) / 1000))
  }, [onFinish])
  const ansRef = useRef(answers)
  useEffect(() => { ansRef.current = answers }, [answers])
  useEffect(() => {
    const id = window.setInterval(() => setLeft((l) => { if (l <= 1) { window.clearInterval(id); window.setTimeout(() => finish(ansRef.current), 0); return 0 } return l - 1 }), 1000)
    return () => window.clearInterval(id)
  }, [finish])

  const go = (skip: boolean) => {
    const next = { ...answers, [q.id]: { text: skip ? '' : cur, skipped: skip } }
    setAnswers(next); setHints(0)
    if (i + 1 >= questions.length) finish(next); else setI(i + 1)
  }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">Question {i + 1} of {questions.length}</span>
        <span className={cx('flex items-center gap-1.5 font-mono', left < 120 && 'text-bad')}><Clock size={14} />{fmt(left)}</span>
      </div>
      <ProgressBar value={((i) / questions.length) * 100} />
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap gap-2"><Badge tone="accent">{TOPIC_LABEL[q.topic] ?? q.topic}</Badge><Badge>{q.type}</Badge><LevelBadge level={q.level === 'expert' ? 'advanced' : q.level} /></div>
        <p className="text-base leading-relaxed">{q.q}</p>
        {hints > 0 && q.hints && <ul className="mt-3 list-disc space-y-1 rounded-lg bg-surface2 p-3 pl-6 text-sm">{q.hints.slice(0, hints).map((h, k) => <li key={k}>{h}</li>)}</ul>}
      </Card>
      {coding ? <CodeEditor key={q.id} value={cur} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: { text: v, skipped: false } }))} language={q.type === 'sql' ? 'sql' : 'python'} height={240} />
        : <textarea key={q.id} value={cur} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value, skipped: false } }))} rows={9} placeholder="Type your answer as you would explain it in an interview..."
          className="w-full resize-y rounded-lg border border-line bg-surface p-3 text-sm focus:border-accent focus:outline-none" />}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => go(false)}>{i + 1 >= questions.length ? 'Finish interview' : 'Next question'}</Button>
        <Button onClick={() => go(true)}><SkipForward size={14} />Skip</Button>
        {q.hints && q.hints.length > 0 && <Button onClick={() => setHints((h) => Math.min(h + 1, q.hints!.length))} disabled={hints >= q.hints.length}><Lightbulb size={14} />Hint</Button>}
        <Button variant="ghost" className="ml-auto" onClick={() => finish({ ...answers, [q.id]: { text: cur, skipped: false } })}>End now</Button>
      </div>
    </div>
  )
}

function Report({ r, onAgain }: { r: InterviewResult; onAgain: () => void }) {
  const weak = useMemo(() => {
    const m: Record<string, number[]> = {}
    r.perQuestion.forEach((p) => { (m[p.topic] ??= []).push(p.skipped ? 0 : p.score) })
    return Object.entries(m).map(([t, v]) => ({ t, avg: Math.round(v.reduce((a, b) => a + b, 0) / v.length) })).sort((a, b) => a.avg - b.avg)
  }, [r])
  return (
    <div className="space-y-4">
      <Card className="grid gap-6 p-6 md:grid-cols-[200px_1fr]">
        <div className="text-center"><div className="text-6xl font-semibold tracking-tight">{r.overall}</div><div className="text-sm text-muted">out of 100</div><Badge className="mt-2" tone={r.overall >= 70 ? 'ok' : r.overall >= 50 ? 'warn' : 'bad'}>{gradeLabel(r.overall)}</Badge></div>
        <div className="space-y-3">
          {Object.entries(r.dims).map(([k, v]) => <div key={k}><div className="mb-1 flex justify-between text-sm"><span>{DIM_LABELS[k] ?? k}</span><span className="text-muted">{v}</span></div><ProgressBar value={v} /></div>)}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-2 font-semibold">Areas of weakness and revision</h2>
        <div className="flex flex-wrap gap-2">{weak.filter((w) => w.avg < 70).length === 0 ? <span className="text-sm text-muted">No clear weak topics in this interview. Raise the difficulty for a tougher test.</span> :
          weak.filter((w) => w.avg < 70).map((w) => <Link key={w.t} to="/learn"><Badge tone="bad">{TOPIC_LABEL[w.t] ?? w.t}: {w.avg}%</Badge></Link>)}</div>
        <p className="mt-3 text-xs text-muted">Scoring is a transparent rubric: each question lists key concepts; credit is the share of concepts your answer covers, scaled for depth. It is not AI evaluation.</p>
      </Card>
      {r.perQuestion.map((p, i) => (
        <Card key={p.qid} className="p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2"><span className="text-xs text-muted">Q{i + 1}</span><Badge tone="accent">{TOPIC_LABEL[p.topic] ?? p.topic}</Badge>{p.skipped ? <Badge tone="warn">skipped</Badge> : <Badge tone={p.score >= 70 ? 'ok' : p.score >= 50 ? 'warn' : 'bad'}>{p.score}%</Badge>}</div>
          <p className="text-sm font-medium">{p.q}</p>
          {!p.skipped && <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-surface2 p-3 font-mono text-xs">{p.answer || '(empty)'}</pre>}
          {!p.skipped && <div className="mt-2 flex flex-wrap gap-1.5 text-xs">{p.matched.map((m) => <Badge key={m} tone="ok">covered: {m}</Badge>)}{p.missed.map((m) => <Badge key={m} tone="bad">missing: {m}</Badge>)}</div>}
          <details className="mt-3"><summary className="cursor-pointer text-sm text-accent">Expected answer</summary><div className="mt-2 text-sm text-muted"><Markdown>{p.expected}</Markdown></div></details>
        </Card>
      ))}
      <Button variant="primary" onClick={onAgain}>Take another interview</Button>
    </div>
  )
}

function BankManager({ bank }: { bank: BankQuestion[] }) {
  const { state, update } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ q: '', answer: '', topic: 'sql', level: 'intermediate', type: 'concept', keywords: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const add = () => {
    const { ok, errors } = parseImportedQuestions([{ ...form, keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean).map((k) => [k]) }])
    if (errors.length) { toast(errors[0], 'error'); return }
    update((s) => ({ ...s, customQuestions: [...s.customQuestions.filter((c) => c.id !== ok[0].id), ...ok] }))
    toast('Question added to your bank'); setOpen(false); setForm({ ...form, q: '', answer: '', keywords: '' })
  }
  const importFile = async (f: File) => {
    try {
      const { ok, errors } = parseImportedQuestions(JSON.parse(await f.text()))
      if (ok.length) update((s) => { const ids = new Set(ok.map((q) => q.id)); return { ...s, customQuestions: [...s.customQuestions.filter((c) => !ids.has(c.id)), ...ok] } })
      toast(`Imported ${ok.length} question${ok.length === 1 ? '' : 's'}${errors.length ? `, ${errors.length} skipped (${errors[0]})` : ''}`, ok.length ? 'success' : 'error')
    } catch { toast('That file is not valid JSON', 'error') }
  }
  const sample = JSON.stringify([{ q: 'Explain the difference between a clustered and non-clustered index.', answer: 'A clustered index defines the physical order of rows...', topic: 'sql', level: 'intermediate', type: 'concept', keywords: [['clustered'], ['non-clustered', 'nonclustered'], ['physical order']] }], null, 2)

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="font-semibold">Question bank</h2><p className="text-xs text-muted">{bank.length} built-in + {state.customQuestions.length} custom questions, plus {TEMPLATES.length} templates generating unlimited variants.</p></div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setOpen(true)}><Plus size={13} />Add question</Button>
          <Button size="sm" onClick={() => fileRef.current?.click()}><Upload size={13} />Import JSON</Button>
          <Button size="sm" onClick={() => { const b = new Blob([sample], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'question-template.json'; a.click() }}><Download size={13} />Template</Button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = '' }} />
        </div>
      </div>
      {state.customQuestions.length > 0 && (
        <ul className="divide-y divide-line text-sm">{state.customQuestions.map((c) => (
          <li key={c.id} className="flex items-center gap-2 py-2"><Badge>{TOPIC_LABEL[c.topic] ?? c.topic}</Badge><span className="min-w-0 flex-1 truncate">{c.q}</span>
            <button aria-label="Delete question" className="text-muted hover:text-bad" onClick={() => update((s) => ({ ...s, customQuestions: s.customQuestions.filter((x) => x.id !== c.id) }))}><Trash2 size={14} /></button></li>))}</ul>)}
      <Modal open={open} onClose={() => setOpen(false)} title="Add a question" footer={<><Button onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={add}>Add</Button></>}>
        <div className="space-y-3">
          <label className="block"><span className="text-xs text-muted">Question</span><textarea className="mt-1 w-full rounded-lg border border-line bg-surface2 p-2 text-sm" rows={3} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted">Model answer</span><textarea className="mt-1 w-full rounded-lg border border-line bg-surface2 p-2 text-sm" rows={4} value={form.answer} onChange={(e) => setForm({ ...form, answer: e.target.value })} /></label>
          <label className="block"><span className="text-xs text-muted">Key concepts, comma separated (used for scoring)</span><input className="mt-1 w-full rounded-lg border border-line bg-surface2 p-2 text-sm" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} /></label>
          <div className="flex flex-wrap gap-3">
            <Select label="Topic" value={form.topic} onChange={(v) => setForm({ ...form, topic: v })} options={TOPIC_KEYS.map((k) => ({ value: k, label: TOPIC_LABEL[k] ?? k }))} />
            <Select label="Level" value={form.level} onChange={(v) => setForm({ ...form, level: v })} options={['beginner', 'intermediate', 'advanced', 'expert'].map((v) => ({ value: v, label: v }))} />
            <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })} options={['concept', 'sql', 'python', 'scenario', 'design', 'troubleshoot'].map((v) => ({ value: v, label: v }))} />
          </div>
        </div>
      </Modal>
    </Card>
  )
}

export default function Interviews() {
  const { state, update, log } = useStore()
  const toast = useToast()
  const [bank, setBank] = useState<BankQuestion[] | null>(null)
  const [phase, setPhase] = useState<Phase>('setup')
  const [session, setSession] = useState<{ qs: BankQuestion[]; cfg: InterviewConfig } | null>(null)
  const [report, setReport] = useState<InterviewResult | null>(null)
  const [tab, setTab] = useState<'new' | 'history' | 'bank'>('new')
  const [confirm, setConfirm] = useState(false)
  const [err, setErr] = useState('')
  useStudyTimer(phase === 'run')

  useEffect(() => { cached<BankQuestion[]>('/api/content/questions').then(setBank).catch(() => setErr(`Could not load the question bank. ${LOAD_HINT}`)) }, [])
  const fullBank = useMemo(() => (bank ? [...bank, ...state.customQuestions] : []), [bank, state.customQuestions])

  const start = (cfg: InterviewConfig) => {
    const res = pickInterview({ bank: fullBank, templates: TEMPLATES, cfg, asked: state.askedQs, recentIds: recentQuestionIds(state.interviews, state.settings.interviewHistoryWindow), recentMixes: state.mixSignatures.slice(0, 8) })
    if (!res.questions.length) { toast('No questions match this configuration. Try more topics or another difficulty.', 'error'); return }
    update((s) => {
      const asked = { ...s.askedQs }
      res.questions.forEach((q) => { asked[q.id] = Date.now() })
      return { ...s, askedQs: asked, mixSignatures: [res.signature, ...s.mixSignatures].slice(0, 50) }
    })
    setSession({ qs: res.questions, cfg }); setPhase('run')
  }

  const finish = useCallback((answers: Record<string, Answer>, usedSec: number) => {
    if (!session) return
    const per: InterviewResult['perQuestion'] = session.qs.map((q) => {
      const a = answers[q.id] ?? { text: '', skipped: true }
      const ev = a.skipped ? { score: 0, matched: [], missed: q.keywords.map((g) => g[0]) } : evaluateAnswer(a.text, q.keywords)
      return { qid: q.id, topic: q.topic, qtype: q.type, answer: a.text, score: ev.score, matched: ev.matched, missed: ev.missed, skipped: a.skipped || !a.text.trim(), q: q.q, expected: q.answer }
    })
    const { overall, dims } = buildReport(per)
    const mix: Record<string, number> = {}; session.qs.forEach((q) => { mix[q.topic] = (mix[q.topic] ?? 0) + 1 })
    const r: InterviewResult = { id: `iv-${Date.now()}`, ts: Date.now(), type: session.cfg.type, level: session.cfg.difficulty, durationMin: session.cfg.durationMin, usedSec, perQuestion: per, overall, dims, mix }
    update((s) => ({ ...s, interviews: [r, ...s.interviews].slice(0, 100) }))
    log('interview', `Mock interview (${INTERVIEW_TYPES.find((t) => t.id === session.cfg.type)?.label}) scored ${overall}/100`)
    setReport(r); setPhase('report')
  }, [session, update, log])

  if (err) return <EmptyState title="Mock interviews unavailable" hint={err} />
  if (!bank) return <PageSkeleton />

  if (phase === 'run' && session) return <Session questions={session.qs} cfg={session.cfg} onFinish={finish} />
  if (phase === 'report' && report) return <div className="mx-auto max-w-3xl"><PageHeader title="Interview report" subtitle={`${INTERVIEW_TYPES.find((t) => t.id === report.type)?.label} - ${report.level}`} /><Report r={report} onAgain={() => { setPhase('setup'); setTab('new') }} /></div>

  return (
    <div>
      <PageHeader title="Mock Interviews" subtitle="Each interview draws a new mix of questions. Recently asked questions are avoided until the pool is exhausted."
        actions={<Tabs tabs={[{ id: 'new', label: 'New interview' }, { id: 'history', label: `History (${state.interviews.length})` }, { id: 'bank', label: 'Question bank' }]} value={tab} onChange={setTab} />} />
      {tab === 'new' && <Setup bank={fullBank} onStart={start} />}
      {tab === 'history' && (
        <div className="space-y-3">
          {state.interviews.length === 0 ? <EmptyState title="No interviews yet" hint="Complete a mock interview and it will appear here with its full report." /> :
            state.interviews.map((h) => (
              <Card key={h.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1"><div className="text-sm font-medium">{INTERVIEW_TYPES.find((t) => t.id === h.type)?.label ?? h.type}</div>
                  <div className="text-xs text-muted">{new Date(h.ts).toLocaleString()} - {h.level} - {h.perQuestion.length} questions - mix: {Object.entries(h.mix).map(([k, n]) => `${n} ${TOPIC_LABEL[k] ?? k}`).join(', ')}</div></div>
                <Badge tone={h.overall >= 70 ? 'ok' : h.overall >= 50 ? 'warn' : 'bad'}>{h.overall}/100</Badge>
                <Button size="sm" onClick={() => { setReport(h); setPhase('report') }}>View report</Button>
              </Card>))}
          {(state.interviews.length > 0 || Object.keys(state.askedQs).length > 0) && <Button variant="danger" size="sm" onClick={() => setConfirm(true)}><Trash2 size={13} />Reset interview history</Button>}
        </div>
      )}
      {tab === 'bank' && <BankManager bank={bank} />}
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Reset interview history?" footer={<><Button onClick={() => setConfirm(false)}>Cancel</Button>
        <Button variant="danger" onClick={() => { update((s) => ({ ...s, interviews: [], askedQs: {}, mixSignatures: [] })); setConfirm(false); toast('Interview history cleared', 'info') }}>Reset</Button></>}>
        This removes past interview reports and the record of which questions were asked, so every question becomes eligible again. Custom questions are kept.</Modal>
    </div>
  )
}
