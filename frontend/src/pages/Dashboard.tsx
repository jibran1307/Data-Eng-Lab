import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowRight, Flame, Lightbulb, RotateCcw } from 'lucide-react'
import { Badge, Card, EmptyState, PageHeader, PageSkeleton, ProgressBar, Stat } from '../components/ui'
import { STATIC_MODE, cached } from '../lib/api'
import { useStore } from '../lib/store'
import { dueRevisions, moduleProficiency, moduleProgress, pct, recommend, streak, TOPIC_LABEL, upcomingRevisions, weakTopics, weeklyActivity } from '../lib/engine'
import type { LessonIndex, ModuleMeta, PyExercise, Project, SqlExercise } from '../lib/types'

export default function Dashboard() {
  const { state } = useStore()
  const [lessons, setLessons] = useState<LessonIndex[] | null>(null)
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const [sqlx, setSqlx] = useState<SqlExercise[]>([])
  const [pyx, setPyx] = useState<PyExercise[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([
      cached<LessonIndex[]>('/api/content/lessons'), cached<ModuleMeta[]>('/api/content/modules'),
      cached<SqlExercise[]>('/api/sql/exercises'), cached<PyExercise[]>('/api/python/exercises'), cached<Project[]>('/api/content/projects'),
    ]).then(([l, m, s, p, pr]) => { setLessons(l); setMods(m); setSqlx(s); setPyx(p); setProjects(pr) })
      .catch(() => setErr(STATIC_MODE ? 'Could not load the course content. Check your connection and reload.' : 'Could not reach the backend. Start it with the run script (see README).'))
  }, [])

  const solved = (prefix: string) => Object.entries(state.exercises).filter(([id, e]) => id.startsWith(prefix) && e.solved).length
  const sqlSolved = solved('sql-'), pySolved = solved('py-')
  const sqlProf = useMemo(() => pct(sqlSolved, sqlx.length), [sqlSolved, sqlx.length])
  const pyProf = useMemo(() => pct(pySolved, pyx.length), [pySolved, pyx.length])

  if (err) return <EmptyState title="Backend unavailable" hint={err} />
  if (!lessons) return <PageSkeleton />

  const done = lessons.filter((l) => state.completed[l.id]).length
  const overall = pct(done, lessons.length)
  const profFor = (id: string) => moduleProficiency(state, lessons, id,
    id === 'sql' ? { solved: sqlSolved, total: sqlx.length } : id === 'python' ? { solved: pySolved, total: pyx.length } : undefined)
  const deProf = Math.round(['fundamentals', 'warehousing', 'etl'].reduce((a, id) => a + profFor(id), 0) / 3)
  const projDone = projects.filter((p) => { const m = state.projects[p.id] ?? {}; const total = p.milestones.flatMap((x) => x.steps).length; return total > 0 && Object.values(m).filter(Boolean).length >= total }).length
  const lastAssess = state.assessments[0]
  const weak = weakTopics(state)
  const recs = recommend(state, lessons, mods).slice(0, 4)
  const week = weeklyActivity(state)
  const SHORT: Record<string, string> = { sql: 'SQL', python: 'Python', fundamentals: 'DE Fundamentals', warehousing: 'Warehousing', etl: 'ETL / ELT', spark: 'Spark', orchestration: 'Orchestration', azure: 'Azure', streaming: 'Streaming', tools: 'Tools' }
  const skills = mods.map((m) => ({ name: SHORT[m.id] ?? m.title, value: profFor(m.id) }))
  const cont = lessons.filter((l) => state.notes[l.id] && !state.completed[l.id]).slice(0, 2)
    .concat(lessons.filter((l) => !state.completed[l.id] && l.prereqs.every((p) => state.completed[p])).slice(0, 1)).slice(0, 3)
  const due = dueRevisions(state), upcoming = upcomingRevisions(state).slice(0, 4)
  const titleOf = (id: string) => lessons.find((l) => l.id === id)?.title ?? id

  return (
    <div>
      <PageHeader title="Welcome back" subtitle={STATIC_MODE ? "Your personal data engineering lab. Progress is saved in this browser only; use Settings to export a copy." : "Your personal data engineering lab. Everything you do here is saved locally on this machine."} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4 sm:col-span-2 xl:col-span-1">
          <div className="text-xs text-muted">Overall progress</div>
          <div className="mt-1 text-3xl font-semibold tracking-tight">{overall}%</div>
          <ProgressBar value={overall} className="mt-3" />
          <div className="mt-2 text-xs text-muted">{done} completed - {lessons.length - done} pending</div>
        </Card>
        <Stat label="Learning streak" value={<span className="flex items-center gap-1.5"><Flame size={20} className="text-warn" />{streak(state)} day{streak(state) === 1 ? '' : 's'}</span>} sub="Any study activity counts" />
        <Stat label="Exercises solved" value={sqlSolved + pySolved} sub={`${sqlSolved} SQL - ${pySolved} Python`} />
        <Stat label="Projects / interviews" value={`${projDone} / ${state.interviews.length}`} sub={lastAssess ? `Last assessment: ${lastAssess.score}%` : 'No assessments yet'} />
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {[['SQL proficiency', sqlProf], ['Python proficiency', pyProf], ['DE concepts proficiency', deProf]].map(([l, v]) => (
          <Card key={l as string} className="p-4">
            <div className="flex items-center justify-between text-sm"><span className="text-muted">{l}</span><span className="font-medium">{v}%</span></div>
            <ProgressBar value={v as number} className="mt-2.5" />
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-3">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Weekly study activity</h2><span className="text-xs text-muted">minutes per day</span></div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={week} margin={{ left: -20, right: 8, top: 8 }}>
                <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} /><stop offset="100%" stopColor="var(--accent)" stopOpacity={0} /></linearGradient></defs>
                <CartesianGrid vertical={false} /><XAxis dataKey="day" tickLine={false} axisLine={false} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} />
                <Area type="monotone" dataKey="minutes" stroke="var(--accent)" strokeWidth={2} fill="url(#g)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-3 font-semibold">Skill proficiency</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={skills} layout="vertical" margin={{ left: 0, right: 8 }}>
                <CartesianGrid horizontal={false} /><XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="name" width={104} tickLine={false} axisLine={false} interval={0} style={{ fontSize: 11 }} />
                <Tooltip cursor={{ fill: 'var(--surface2)' }} contentStyle={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 8, color: 'var(--fg)' }} />
                <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} barSize={9} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><Lightbulb size={16} className="text-accent" /><h2 className="font-semibold">Recommended next steps</h2></div>
          {recs.length === 0 ? <EmptyState title="You are all caught up" hint="Take an assessment or a mock interview to find new gaps." /> : (
            <ul className="space-y-1.5">
              {recs.map((r) => (
                <li key={r.id}><Link to={r.to} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface2">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{r.title}</div><div className="truncate text-xs text-muted">{r.reason}</div></div>
                  <ArrowRight size={14} className="shrink-0 text-muted" /></Link></li>
              ))}
            </ul>)}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Continue learning</h2>
          {cont.length === 0 ? <EmptyState title="Nothing in progress" hint="Open the Learning Path to start your first lesson." action={<Link to="/learn" className="text-sm text-accent">Open Learning Path</Link>} /> : (
            <ul className="space-y-1.5">
              {cont.map((l) => (
                <li key={l.id}><Link to={`/learn/${l.id}`} className="flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 hover:bg-surface2">
                  <div className="min-w-0"><div className="truncate text-sm font-medium">{l.title}</div><div className="text-xs text-muted">{l.minutes} min - {l.level}</div></div>
                  <ArrowRight size={14} className="shrink-0 text-muted" /></Link></li>
              ))}
            </ul>)}
        </Card>
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Weak areas</h2>
          {weak.length === 0 ? <p className="text-sm text-muted">No weak areas detected yet. Weak areas appear after you complete assessments or mock interviews.</p> : (
            <div className="flex flex-wrap gap-2">{weak.map((w) => <Badge key={w.topic} tone="bad">{TOPIC_LABEL[w.topic] ?? w.topic} - {w.acc}%</Badge>)}</div>)}
        </Card>
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2"><RotateCcw size={15} className="text-accent" /><h2 className="font-semibold">Revision</h2></div>
          {due.length + upcoming.length === 0 ? <p className="text-sm text-muted">Completing a lesson schedules spaced revisions automatically.</p> : (
            <ul className="space-y-1 text-sm">
              {due.slice(0, 4).map((r) => <li key={r.id} className="flex items-center justify-between"><Link className="truncate hover:text-accent" to={`/learn/${r.id}?revise=1`}>{titleOf(r.id)}</Link><Badge tone="warn">due</Badge></li>)}
              {upcoming.map((r) => <li key={r.id} className="flex items-center justify-between text-muted"><span className="truncate">{titleOf(r.id)}</span><span className="text-xs">{new Date(r.due).toLocaleDateString()}</span></li>)}
            </ul>)}
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <h2 className="mb-3 font-semibold">Recent activity</h2>
        {state.activity.length === 0 ? <p className="text-sm text-muted">Your activity will appear here.</p> : (
          <ul className="divide-y divide-line text-sm">
            {state.activity.slice(0, 6).map((a, i) => <li key={i} className="flex items-center justify-between gap-3 py-2"><span className="truncate">{a.label}</span><span className="shrink-0 text-xs text-muted">{new Date(a.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></li>)}
          </ul>)}
      </Card>
      <div className="hidden">{mods.map((m) => moduleProgress(state, lessons, m.id).pct)}</div>
    </div>
  )
}
