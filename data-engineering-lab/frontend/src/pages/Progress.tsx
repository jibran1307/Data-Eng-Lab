import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button, Card, EmptyState, PageHeader, PageSkeleton, ProgressBar, Stat, Tabs } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { DAY, dayKey, useStore } from '../lib/store'
import { dueRevisions, moduleProficiency, moduleProgress, pct, recommend, streak, TOPIC_LABEL, topicAccuracy, upcomingRevisions, weakTopics, reviewLesson } from '../lib/engine'
import type { LessonIndex, ModuleMeta, Project, PyExercise, SqlExercise } from '../lib/types'
import { useToast } from '../lib/theme'
import { projectProgress } from './Projects'

const RADAR_LABEL: Record<string, string> = { sql: 'SQL', python: 'Python', fundamentals: 'Fundamentals', warehousing: 'Warehousing', etl: 'ETL / ELT', spark: 'Spark', orchestration: 'Orchestration', azure: 'Azure', streaming: 'Streaming', tools: 'Tools' }

const tip = { contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' } }

function Planner({ lessons }: { lessons: LessonIndex[] }) {
  const { state, update, log } = useStore()
  const toast = useToast()
  const today = Math.round(state.studyMinutes[dayKey()] ?? 0)
  const [now] = useState(() => Date.now())
  const wkStart = now - 6 * DAY
  const weekLessons = Object.values(state.completed).filter((t) => t >= wkStart).length
  const weekMin = Array.from({ length: 7 }, (_, i) => state.studyMinutes[dayKey(now - i * DAY)] ?? 0).reduce((a, b) => a + b, 0)
  const due = dueRevisions(state)
  const upcoming = upcomingRevisions(state).slice(0, 8)
  const title = (id: string) => lessons.find((l) => l.id === id)?.title ?? id
  const set = (patch: Partial<typeof state.settings>) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } }))
  const [h, setH] = useState('')

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Daily target</h2>
        <div className="mb-1 flex justify-between text-sm"><span>{today} of {state.settings.dailyTargetMin} min today</span><span className="text-muted">{pct(today, state.settings.dailyTargetMin)}%</span></div>
        <ProgressBar value={pct(today, state.settings.dailyTargetMin)} />
        <label className="mt-4 flex items-center gap-3 text-sm">Daily target (minutes)
          <input type="number" min={10} max={600} step={5} value={state.settings.dailyTargetMin} onChange={(e) => set({ dailyTargetMin: Math.max(10, Math.min(600, Number(e.target.value) || 60)) })} className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1" /></label>
        <div className="mt-4 flex gap-2 text-sm"><input value={h} onChange={(e) => setH(e.target.value)} type="number" min={1} max={600} placeholder="Log study minutes" className="w-40 rounded-lg border border-line bg-surface2 px-2 py-1" />
          <Button size="sm" onClick={() => { const n = Number(h); if (n > 0 && n <= 600) { update((s) => ({ ...s, studyMinutes: { ...s.studyMinutes, [dayKey()]: (s.studyMinutes[dayKey()] ?? 0) + n } })); log('study', `Logged ${n} minutes of study`); setH(''); toast(`Logged ${n} minutes`) } else toast('Enter minutes between 1 and 600', 'error') }}>Add</Button></div>
        <p className="mt-2 text-xs text-muted">Time spent inside lessons, labs and interviews is tracked automatically while the tab is visible.</p>
      </Card>
      <Card className="p-5">
        <h2 className="mb-3 font-semibold">Weekly goal</h2>
        <div className="mb-1 flex justify-between text-sm"><span>{weekLessons} of {state.settings.weeklyGoalLessons} lessons this week</span><span className="text-muted">{Math.round(weekMin / 6) / 10} h studied</span></div>
        <ProgressBar value={pct(weekLessons, state.settings.weeklyGoalLessons)} />
        <label className="mt-4 flex items-center gap-3 text-sm">Lessons per week
          <input type="number" min={1} max={50} value={state.settings.weeklyGoalLessons} onChange={(e) => set({ weeklyGoalLessons: Math.max(1, Math.min(50, Number(e.target.value) || 5)) })} className="w-24 rounded-lg border border-line bg-surface2 px-2 py-1" /></label>
      </Card>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Revision queue</h2>
        <p className="mb-3 text-xs text-muted">Spaced repetition: intervals {state.settings.revisionIntervals.join(', ')} days. Change them in Settings.</p>
        {due.length === 0 ? <p className="text-sm text-muted">Nothing due. Completing lessons schedules revisions automatically.</p> : (
          <ul className="space-y-2">{due.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-sm"><Link to={`/learn/${r.id}?revise=1`} className="min-w-0 flex-1 truncate hover:text-accent">{title(r.id)}</Link>
              <Button size="sm" onClick={() => { update((s) => ({ ...s, revisions: reviewLesson(s, r.id, true) })); log('revision', `Revised: ${title(r.id)}`); toast('Revision recorded') }}>Remembered</Button></li>))}</ul>)}
      </Card>
      <Card className="p-5"><h2 className="mb-3 font-semibold">Upcoming revisions</h2>
        {upcoming.length === 0 ? <p className="text-sm text-muted">No upcoming revisions yet.</p> : <ul className="space-y-1 text-sm">{upcoming.map((r) => <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{title(r.id)}</span><span className="shrink-0 text-xs text-muted">{new Date(r.due).toLocaleDateString()} - stage {r.stage + 1}</span></li>)}</ul>}</Card>
    </div>
  )
}

export default function Progress() {
  const { state } = useStore()
  const [lessons, setLessons] = useState<LessonIndex[] | null>(null)
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const [sqlx, setSqlx] = useState<SqlExercise[]>([])
  const [pyx, setPyx] = useState<PyExercise[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [tab, setTab] = useState<'overview' | 'planner' | 'history'>('overview')
  const [err, setErr] = useState('')
  useEffect(() => {
    Promise.all([cached<LessonIndex[]>('/api/content/lessons'), cached<ModuleMeta[]>('/api/content/modules'), cached<SqlExercise[]>('/api/sql/exercises'), cached<PyExercise[]>('/api/python/exercises'), cached<Project[]>('/api/content/projects')])
      .then(([l, m, s, p, pr]) => { setLessons(l); setMods(m); setSqlx(s); setPyx(p); setProjects(pr) }).catch(() => setErr(`Could not load analytics data. ${LOAD_HINT}`))
  }, [])

  const [now] = useState(() => Date.now())
  const data = useMemo(() => {
    if (!lessons) return null
    const solvedIn = (list: { id: string }[]) => list.filter((e) => state.exercises[e.id]?.solved).length
    const acc = (prefix: string) => { let a = 0, c = 0; Object.entries(state.exercises).forEach(([id, e]) => { if (id.startsWith(prefix)) { a += e.attempts; c += e.correct } }); return a ? pct(c, a) : null }
    const rows = mods.map((m) => ({
      id: m.id, name: m.title, prog: moduleProgress(state, lessons, m.id),
      prof: moduleProficiency(state, lessons, m.id, m.id === 'sql' ? { solved: solvedIn(sqlx), total: sqlx.length } : m.id === 'python' ? { solved: solvedIn(pyx), total: pyx.length } : undefined),
    }))
    const week = Array.from({ length: 14 }, (_, i) => { const t = now - (13 - i) * DAY; return { d: new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), min: Math.round(state.studyMinutes[dayKey(t)] ?? 0) } })
    const totalMin = Object.values(state.studyMinutes).reduce((a, b) => a + b, 0)
    return { rows, week, sqlAcc: acc('sql-'), pyAcc: acc('py-'), totalMin, sqlSolved: solvedIn(sqlx), pySolved: solvedIn(pyx) }
  }, [lessons, mods, sqlx, pyx, state, now])

  if (err) return <EmptyState title="Analytics unavailable" hint={err} />
  if (!lessons || !data) return <PageSkeleton />
  const weak = weakTopics(state)
  const acc = topicAccuracy(state)
  const recs = recommend(state, lessons, mods)
  const done = lessons.filter((l) => state.completed[l.id]).length
  const assessTrend = [...state.assessments].reverse().map((a, i) => ({ n: i + 1, score: a.score }))
  const ivTrend = [...state.interviews].reverse().map((a, i) => ({ n: i + 1, score: a.overall }))
  const projDone = projects.filter((p) => projectProgress(p, state.projects[p.id]).pct === 100).length

  return (
    <div>
      <PageHeader title="Progress & Analytics" subtitle="What you have done, how well you are doing, and what to do next."
        actions={<Tabs value={tab} onChange={setTab} tabs={[{ id: 'overview', label: 'Overview' }, { id: 'planner', label: 'Planner & revision' }, { id: 'history', label: 'History' }]} />} />

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Lessons completed" value={`${done}/${lessons.length}`} sub={`${pct(done, lessons.length)}% of curriculum`} />
            <Stat label="Study time" value={`${Math.round((data.totalMin / 60) * 10) / 10} h`} sub={`${streak(state)} day streak`} />
            <Stat label="SQL accuracy" value={data.sqlAcc === null ? '-' : `${data.sqlAcc}%`} sub={`${data.sqlSolved}/${sqlx.length} solved`} />
            <Stat label="Python accuracy" value={data.pyAcc === null ? '-' : `${data.pyAcc}%`} sub={`${data.pySolved}/${pyx.length} solved`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="mb-3 font-semibold">Module completion</h2><div className="space-y-3">{data.rows.map((r) => <div key={r.id}><div className="mb-1 flex justify-between text-sm"><span className="truncate pr-2">{r.name}</span><span className="text-muted">{r.prog.done}/{r.prog.total}</span></div><ProgressBar value={r.prog.pct} /></div>)}</div></Card>
            <Card className="p-5"><h2 className="mb-3 font-semibold">Topic proficiency</h2><div className="h-72"><ResponsiveContainer width="100%" height="100%"><RadarChart data={data.rows.map((r) => ({ name: RADAR_LABEL[r.id] ?? r.name, v: r.prof }))}><PolarGrid stroke="var(--line)" /><PolarAngleAxis dataKey="name" tick={{ fill: 'var(--muted)', fontSize: 10 }} /><Radar dataKey="v" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.25} /><Tooltip {...tip} /></RadarChart></ResponsiveContainer></div></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="mb-3 font-semibold">Study time, last 14 days (minutes)</h2><div className="h-52"><ResponsiveContainer width="100%" height="100%"><BarChart data={data.week} margin={{ left: -20 }}><CartesianGrid vertical={false} /><XAxis dataKey="d" tickLine={false} axisLine={false} interval={1} /><YAxis tickLine={false} axisLine={false} /><Tooltip {...tip} cursor={{ fill: 'var(--surface2)' }} /><Bar dataKey="min" fill="var(--accent)" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></Card>
            <Card className="p-5"><h2 className="mb-3 font-semibold">Assessment and interview scores</h2>
              {assessTrend.length + ivTrend.length === 0 ? <EmptyState title="No scores yet" hint="Take an assessment or a mock interview to see trends." /> : (
                <div className="h-52"><ResponsiveContainer width="100%" height="100%"><LineChart margin={{ left: -20 }}><CartesianGrid vertical={false} /><XAxis dataKey="n" type="number" allowDecimals={false} domain={[1, 'dataMax']} tickLine={false} axisLine={false} /><YAxis domain={[0, 100]} tickLine={false} axisLine={false} /><Tooltip {...tip} />
                  <Line data={assessTrend} dataKey="score" name="Assessment" stroke="var(--accent)" strokeWidth={2} /><Line data={ivTrend} dataKey="score" name="Interview" stroke="var(--ok)" strokeWidth={2} /></LineChart></ResponsiveContainer></div>)}
              <div className="mt-2 flex gap-3 text-xs text-muted"><span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-accent" />Assessment</span><span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-ok" />Interview</span></div></Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="p-5"><h2 className="mb-3 font-semibold">Weak areas</h2>
              {acc.length === 0 ? <p className="text-sm text-muted">Appears after assessments or interviews.</p> : <div className="space-y-2">{acc.slice(0, 6).map((t) => <div key={t.topic}><div className="mb-1 flex justify-between text-sm"><span>{TOPIC_LABEL[t.topic] ?? t.topic}</span><span className={t.acc < 65 ? 'text-bad' : 'text-muted'}>{t.acc}%</span></div><ProgressBar value={t.acc} /></div>)}</div>}
              {weak.length > 0 && <p className="mt-3 text-xs text-muted">Below 65% with at least 3 answers: {weak.map((w) => TOPIC_LABEL[w.topic] ?? w.topic).join(', ')}.</p>}</Card>
            <Card className="p-5"><h2 className="mb-3 font-semibold">Recommendations</h2>
              {recs.length === 0 ? <p className="text-sm text-muted">Nothing urgent. Try a harder mock interview.</p> : <ul className="space-y-2">{recs.slice(0, 5).map((r) => <li key={r.id}><Link to={r.to} className="block rounded-lg px-2 py-1.5 hover:bg-surface2"><div className="text-sm font-medium">{r.title}</div><div className="text-xs text-muted">{r.reason}</div></Link></li>)}</ul>}
              <div className="mt-3 text-xs text-muted">Projects completed: {projDone}/{projects.length}</div></Card>
          </div>
        </div>)}

      {tab === 'planner' && <Planner lessons={lessons} />}

      {tab === 'history' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-5"><h2 className="mb-3 font-semibold">Revision history</h2>
            {state.activity.filter((a) => a.type === 'revision').length === 0 ? <p className="text-sm text-muted">No revisions recorded yet.</p> : <ul className="space-y-1 text-sm">{state.activity.filter((a) => a.type === 'revision').slice(0, 15).map((a, i) => <li key={i} className="flex justify-between gap-2"><span className="truncate">{a.label}</span><span className="shrink-0 text-xs text-muted">{new Date(a.ts).toLocaleDateString()}</span></li>)}</ul>}</Card>
          <Card className="p-5"><h2 className="mb-3 font-semibold">Activity log</h2>
            {state.activity.length === 0 ? <p className="text-sm text-muted">Nothing yet.</p> : <ul className="max-h-96 space-y-1 overflow-auto text-sm">{state.activity.slice(0, 50).map((a, i) => <li key={i} className="flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2"><Badge>{a.type}</Badge><span className="truncate">{a.label}</span></span><span className="shrink-0 text-xs text-muted">{new Date(a.ts).toLocaleDateString()}</span></li>)}</ul>}</Card>
        </div>)}
    </div>
  )
}
