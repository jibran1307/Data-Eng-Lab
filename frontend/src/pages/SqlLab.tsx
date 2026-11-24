import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CheckCircle2, Database, Eye, Lightbulb, Play, RotateCcw, Send, Table2 } from 'lucide-react'
import CodeEditor from '../components/CodeEditor'
import ResultTable from '../components/ResultTable'
import SavedAnswer, { submissionEntries } from '../components/SavedAnswer'
import { Badge, Button, Card, EmptyState, LevelBadge, PageSkeleton, Select, cx } from '../components/ui'
import EngineBanner from '../static/EngineBanner'
import { LOAD_HINT, STATIC_MODE, api, cached, type SqlResult, type SqlValidation } from '../lib/api'
import { useDraft, useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import type { SqlExercise } from '../lib/types'

interface Schema { table: string; columns: { name: string; type: string }[] }

export default function SqlLab() {
  const [sp, setSp] = useSearchParams()
  const toast = useToast()
  const { state, update, log } = useStore()
  const [exs, setExs] = useState<SqlExercise[] | null>(null)
  const [schema, setSchema] = useState<Schema[]>([])
  const [result, setResult] = useState<SqlResult | null>(null)
  const [verdict, setVerdict] = useState<SqlValidation | null>(null)
  const [expected, setExpected] = useState<SqlResult | null>(null)
  const [solution, setSolution] = useState<{ solution: string; explain: string } | null>(null)
  const [hintN, setHintN] = useState(0)
  const [busy, setBusy] = useState(false)
  const [cat, setCat] = useState('all')
  const [lvl, setLvl] = useState('all')
  const [err, setErr] = useState('')
  useStudyTimer(true)

  const exId = sp.get('ex')
  const ex = useMemo(() => exs?.find((e) => e.id === exId) ?? null, [exs, exId])
  // Editor text is kept per exercise (and for the free playground), so it survives leaving the page and restarts.
  const starter = ex ? (state.submissions[ex.id]?.code ?? ex.starter ?? '-- Write your query here\n') : 'SELECT * FROM customers LIMIT 10;'
  const [sql, setSql] = useDraft(ex ? `sql:${ex.id}` : 'sql:free', starter)

  const loadSchema = useCallback(() => api.get<Schema[]>('/api/sql/schema').then(setSchema).catch(() => setSchema([])), [])
  useEffect(() => {
    cached<SqlExercise[]>('/api/sql/exercises').then(setExs).catch(() => setErr(`Could not load SQL exercises. ${LOAD_HINT}`))
    loadSchema()
  }, [loadSchema])

  // Reset per-exercise state when the selected exercise changes (adjust-state-during-render pattern).
  const [seenEx, setSeenEx] = useState<string | undefined>(ex?.id)
  if (seenEx !== ex?.id) {
    setSeenEx(ex?.id)
    setVerdict(null); setExpected(null); setSolution(null); setHintN(0); setResult(null)
  }

  const run = useCallback(async () => {
    setBusy(true)
    try { setResult(await api.post<SqlResult>('/api/sql/run', { sql })); loadSchema() }
    catch { setResult({ error: `Request failed. ${LOAD_HINT}` }) }
    finally { setBusy(false) }
  }, [sql, loadSchema])

  const submit = async () => {
    if (!ex) return
    setBusy(true)
    try {
      const v = await api.post<SqlValidation>('/api/sql/validate', { exercise_id: ex.id, sql })
      setVerdict(v)
      update((s) => {
        const p = s.exercises[ex.id] ?? { solved: false, attempts: 0, correct: 0, ts: 0 }
        const prev = s.submissions[ex.id]
        const now = Date.now()
        const sub = { code: sql, ts: now, passed: v.passed, solved: v.passed ? { code: sql, ts: now } : prev?.solved }
        return { ...s, exercises: { ...s.exercises, [ex.id]: { solved: p.solved || v.passed, attempts: p.attempts + 1, correct: p.correct + (v.passed ? 1 : 0), ts: now } }, submissions: { ...s.submissions, [ex.id]: sub } }
      })
      if (v.passed) { log('sql', `Solved SQL exercise: ${ex.title}`); toast('Correct. Exercise solved.') }
    } catch { toast('Validation failed to run', 'error') } finally { setBusy(false) }
  }

  const reset = async () => {
    await api.post('/api/sql/reset'); await loadSchema(); setResult(null); toast('Sample database reset to its original state', 'info')
  }
  const showExpected = async () => { if (ex) setExpected(await api.get<SqlResult>(`/api/sql/exercises/${ex.id}/expected`)) }
  const showSolution = async () => { if (ex) setSolution(await api.get(`/api/sql/exercises/${ex.id}/solution`)) }

  if (err) return <EmptyState title="SQL Lab unavailable" hint={err} />
  if (!exs) return <PageSkeleton />

  const cats = [...new Set(exs.map((e) => e.category))]
  const list = exs.filter((e) => (cat === 'all' || e.category === cat) && (lvl === 'all' || e.level === lvl))
  const solved = exs.filter((e) => state.exercises[e.id]?.solved).length

  return (
    <>
    <EngineBanner engine="sql" />
    <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
      <div className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">SQL Playground</h1>
          <p className="text-sm text-muted">{solved}/{exs.length} exercises solved. Powered by DuckDB, running {STATIC_MODE ? 'in your browser' : 'locally'}.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...cats.map((c) => ({ value: c, label: c }))]} />
          <Select value={lvl} onChange={setLvl} options={[{ value: 'all', label: 'All levels' }, { value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
        </div>
        <Card className="max-h-[60vh] overflow-y-auto">
          <button onClick={() => setSp({})} className={cx('flex w-full items-center gap-2 border-b border-line px-3 py-2.5 text-left text-sm hover:bg-surface2', !ex && 'bg-accent-soft font-medium text-accent')}><Database size={15} />Free playground</button>
          {list.length === 0 ? <div className="p-4 text-sm text-muted">No exercises match.</div> : list.map((e) => (
            <button key={e.id} onClick={() => setSp({ ex: e.id })} className={cx('flex w-full items-start gap-2 border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-surface2', ex?.id === e.id && 'bg-accent-soft')}>
              {state.exercises[e.id]?.solved ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-ok" /> : <span className="mt-0.5 h-[15px] w-[15px] shrink-0 rounded-full border border-line" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm">{e.title}</span><span className="text-xs text-muted">{e.category}</span></span>
              <LevelBadge level={e.level} />
            </button>
          ))}
        </Card>
      </div>

      <div className="min-w-0 space-y-4">
        {ex && (
          <Card className="p-5">
            <div className="mb-2 flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{ex.title}</h2><LevelBadge level={ex.level} /><Badge>{ex.category}</Badge>
              {state.exercises[ex.id] && <span className="text-xs text-muted">{state.exercises[ex.id].correct}/{state.exercises[ex.id].attempts} correct attempts</span>}</div>
            <p className="whitespace-pre-line text-sm leading-relaxed">{ex.prompt}</p>
            {ex.tables.length > 0 && <p className="mt-2 text-xs text-muted">Tables: {ex.tables.map((t) => <code key={t} className="mr-1.5 rounded bg-surface2 px-1.5 py-0.5">{t}</code>)}{ex.ordered && <Badge tone="warn" className="ml-2">row order matters</Badge>}</p>}
            {hintN > 0 && <ol className="mt-3 list-decimal space-y-1 rounded-lg bg-surface2 p-3 pl-7 text-sm">{ex.hints.slice(0, hintN).map((h, i) => <li key={i}>{h}</li>)}</ol>}
          </Card>
        )}

        <div>
          <CodeEditor value={sql} onChange={setSql} language="sql" height={ex ? 220 : 280} onRun={run} />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button variant={ex ? 'secondary' : 'primary'} onClick={run} disabled={busy}><Play size={14} />Run <span className="hidden text-xs opacity-60 sm:inline">Ctrl+Enter</span></Button>
            {ex && <Button variant="primary" onClick={submit} disabled={busy}><Send size={14} />Submit answer</Button>}
            {ex && <Button onClick={() => setHintN((n) => Math.min(n + 1, ex.hints.length))} disabled={hintN >= ex.hints.length}><Lightbulb size={14} />Hint {hintN}/{ex.hints.length}</Button>}
            {ex && <Button onClick={showExpected}><Eye size={14} />Expected output</Button>}
            {ex && <Button onClick={showSolution}>Show solution</Button>}
            <Button variant="ghost" onClick={() => setSql(ex ? (ex.starter ?? '-- Write your query here\n') : 'SELECT * FROM customers LIMIT 10;')}>Reset code</Button>
            <Button variant="ghost" className="ml-auto" onClick={reset}><RotateCcw size={14} />Reset database</Button>
          </div>
        </div>

        {ex && <SavedAnswer entries={submissionEntries(state.submissions[ex.id])} onLoad={setSql} />}
        {verdict && (
          <div className={cx('rounded-lg border p-3 text-sm', verdict.passed ? 'border-ok/40 bg-ok/10 text-ok' : 'border-bad/40 bg-bad/10 text-bad')}>
            <b>{verdict.passed ? 'Correct. ' : 'Not yet. '}</b>{verdict.error ?? verdict.feedback}
          </div>
        )}
        {result && <ResultTable result={result} title="Your result" />}
        {expected && <ResultTable result={expected} title="Expected output" />}
        {solution && (
          <Card className="p-4">
            <div className="mb-2 text-xs font-medium text-muted">Reference solution</div>
            <pre className="overflow-x-auto rounded-lg bg-code p-3 font-mono text-xs">{solution.solution}</pre>
            {solution.explain && <p className="mt-2 text-sm text-muted">{solution.explain}</p>}
            <Button size="sm" className="mt-2" onClick={() => setSql(solution.solution)}>Load into editor</Button>
          </Card>
        )}

        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium"><Table2 size={15} />Database schema</div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {schema.map((t) => (
              <div key={t.table} className="rounded-lg border border-line p-2.5">
                <button className="font-mono text-xs font-semibold text-accent hover:underline" onClick={() => setSql(`SELECT * FROM ${t.table} LIMIT 10;`)}>{t.table}</button>
                <ul className="mt-1 text-[11px] text-muted">{t.columns.map((c) => <li key={c.name} className="flex justify-between gap-2"><span className="truncate">{c.name}</span><span>{c.type.toLowerCase()}</span></li>)}</ul>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
    </>
  )
}
