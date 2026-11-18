import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, FileText, Lightbulb, Play, Send, Terminal } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import { Badge, Button, Card, EmptyState, LevelBadge, PageSkeleton, Select, cx } from '../components/ui'
import EngineBanner from '../static/EngineBanner'
import { LOAD_HINT, STATIC_MODE, api, cached, type PyResult } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import type { PyExercise } from '../lib/types'

const FREE = '# Free playground. Files available in the working directory:\n#   sales.csv, customers_dirty.csv, orders.json, app.log\nimport csv\n\nwith open("sales.csv") as f:\n    rows = list(csv.DictReader(f))\nprint(len(rows), "rows")\nprint(rows[0])\n'

export default function PythonLab() {
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const { state, update, log } = useStore()
  const [exs, setExs] = useState<PyExercise[] | null>(null)
  const [code, setCode] = useState(FREE)
  const [out, setOut] = useState<PyResult | null>(null)
  const [verdict, setVerdict] = useState<PyResult | null>(null)
  const [solution, setSolution] = useState<{ solution: string; explain: string } | null>(null)
  const [hintN, setHintN] = useState(0)
  const [showExpected, setShowExpected] = useState(false)
  const [busy, setBusy] = useState(false)
  const [cat, setCat] = useState('all')
  const [err, setErr] = useState('')
  useStudyTimer(true)

  const exId = sp.get('ex')
  const ex = useMemo(() => exs?.find((e) => e.id === exId) ?? null, [exs, exId])

  useEffect(() => { cached<PyExercise[]>('/api/python/exercises').then(setExs).catch(() => setErr(`Could not load Python exercises. ${LOAD_HINT}`)) }, [])
  // Reset per-exercise state when the selected exercise changes (adjust-state-during-render pattern).
  const [seenEx, setSeenEx] = useState<string | undefined>(ex?.id)
  if (seenEx !== ex?.id) {
    setSeenEx(ex?.id)
    setVerdict(null); setSolution(null); setHintN(0); setOut(null); setShowExpected(false)
    setCode(ex ? ex.starter : FREE)
  }

  const run = async () => {
    setBusy(true)
    try { setOut(await api.post<PyResult>('/api/python/run', { code })) } catch { setOut({ error: `Request failed. ${LOAD_HINT}` }) } finally { setBusy(false) }
  }
  const submit = async () => {
    if (!ex) return
    setBusy(true)
    try {
      const [v, r] = await Promise.all([api.post<PyResult>('/api/python/validate', { exercise_id: ex.id, code }), api.post<PyResult>('/api/python/run', { code })])
      setVerdict(v); setOut(r)
      update((s) => {
        const p = s.exercises[ex.id] ?? { solved: false, attempts: 0, correct: 0, ts: 0 }
        return { ...s, exercises: { ...s.exercises, [ex.id]: { solved: p.solved || !!v.passed, attempts: p.attempts + 1, correct: p.correct + (v.passed ? 1 : 0), ts: Date.now() } } }
      })
      if (v.passed) { log('python', `Solved Python exercise: ${ex.title}`); toast('All checks passed. Exercise solved.') }
    } catch { toast('Validation failed to run', 'error') } finally { setBusy(false) }
  }

  if (err) return <EmptyState title="Python Lab unavailable" hint={err} />
  if (!exs) return <PageSkeleton />
  const cats = [...new Set(exs.map((e) => e.category))]
  const list = exs.filter((e) => cat === 'all' || e.category === cat)
  const solved = exs.filter((e) => state.exercises[e.id]?.solved).length

  return (
    <>
    <EngineBanner engine="python" />
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div><h1 className="text-xl font-semibold tracking-tight">Python Playground</h1>
          <p className="text-sm text-muted">{solved}/{exs.length} solved. {STATIC_MODE ? 'Code runs in your browser (Pyodide): 20 s limit, no network, nothing leaves your machine. The first run downloads the runtime.' : 'Code runs in an isolated local process: 20 s limit, no network.'}</p></div>
        <Select value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]} />
        <Card className="max-h-[60vh] overflow-y-auto">
          <button onClick={() => setSp({})} className={cx('flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left text-sm hover:bg-surface2', !ex && 'bg-accent-soft font-medium text-accent')}><Terminal size={15} />Free playground</button>
          {list.map((e) => (
            <button key={e.id} onClick={() => setSp({ ex: e.id })} className={cx('flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface2', ex?.id === e.id && 'bg-accent-soft')}>
              {state.exercises[e.id]?.solved ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <span className="mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border border-line" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{e.title}</span><span className="text-xs text-muted">{e.category}</span></span>
              <LevelBadge level={e.level} />
            </button>
          ))}
        </Card>
        <Card className="p-3 text-xs text-muted"><div className="mb-1 flex items-center gap-1.5 font-medium text-fg"><FileText size={13} />Preloaded files</div>
          <code>sales.csv</code>, <code>customers_dirty.csv</code>, <code>orders.json</code>, <code>app.log</code> are available in the working directory of every run.</Card>
      </div>

      <div className="min-w-0 space-y-4">
        {ex && (
          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{ex.title}</h2><LevelBadge level={ex.level} /><Badge>{ex.category}</Badge></div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{ex.prompt}</p>
            {hintN > 0 && <ol className="mt-3 list-decimal space-y-1 rounded-lg bg-surface2 p-3 pl-7 text-sm">{ex.hints.slice(0, hintN).map((h, i) => <li key={i}>{h}</li>)}</ol>}
            {showExpected && <pre className="mt-3 overflow-x-auto rounded-lg bg-code p-3 font-mono text-xs"><span className="text-muted"># expected behaviour{'\n'}</span>{ex.expected}</pre>}
          </Card>
        )}
        <div>
          <CodeEditor value={code} onChange={setCode} language="python" height={ex ? 280 : 340} onRun={run} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant={ex ? 'secondary' : 'primary'} onClick={run} disabled={busy}><Play size={14} />Run <span className="hidden text-xs opacity-60 sm:inline">Ctrl+Enter</span></Button>
            {ex && <Button variant="primary" onClick={submit} disabled={busy}><Send size={14} />Submit &amp; check</Button>}
            {ex && <Button onClick={() => setHintN((n) => Math.min(n + 1, ex.hints.length))} disabled={hintN >= ex.hints.length}><Lightbulb size={14} />Hint {hintN}/{ex.hints.length}</Button>}
            {ex && <Button onClick={() => setShowExpected((v) => !v)}><Eye size={14} />Expected result</Button>}
            {ex && <Button onClick={async () => setSolution(await api.get(`/api/python/exercises/${ex.id}/solution`))}>Show solution</Button>}
            <Button variant="ghost" className="ml-auto" onClick={() => setCode(ex ? ex.starter : FREE)}>Reset code</Button>
          </div>
        </div>
        {verdict && (
          <div className={cx('rounded-lg border p-3 text-sm', verdict.passed ? 'border-ok/40 bg-ok/10 text-ok' : 'border-bad/40 bg-bad/10 text-bad')}>
            <b>{verdict.passed ? 'Passed. ' : 'Not yet. '}</b>{verdict.error ?? verdict.feedback}
          </div>
        )}
        {out && (
          <Card className="overflow-hidden">
            <div className="border-b border-line px-3 py-1.5 text-xs font-medium text-muted">Output</div>
            {out.error ? <pre className="p-3 font-mono text-xs text-bad">{out.error}</pre> : (
              <div className="space-y-0">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap p-3 font-mono text-xs">{out.stdout || (out.stderr ? '' : '(no output)')}</pre>
                {out.stderr && <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-t border-line bg-bad/10 p-3 font-mono text-xs text-bad">{out.stderr}</pre>}
              </div>)}
          </Card>
        )}
        {solution && (
          <Card className="p-4">
            <div className="mb-2 text-xs font-medium text-muted">Reference solution</div>
            <pre className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-xs">{solution.solution}</pre>
            {solution.explain && <p className="mt-2 text-sm text-muted">{solution.explain}</p>}
            <Button size="sm" className="mt-2" onClick={() => setCode(solution.solution)}>Load into editor</Button>
          </Card>
        )}
      </div>
    </div>
    </>
  )
}
