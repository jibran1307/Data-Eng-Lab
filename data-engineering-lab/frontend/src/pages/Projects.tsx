import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, Clock } from 'lucide-react'
import { CodeBlock } from '../components/Markdown'
import Markdown from '../components/Markdown'
import { Badge, Button, Card, EmptyState, LevelBadge, PageHeader, PageSkeleton, ProgressBar, Tabs } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import { pct } from '../lib/engine'
import type { Project } from '../lib/types'

const stepsOf = (p: Project) => p.milestones.flatMap((m) => m.steps)

export function projectProgress(p: Project, done: Record<string, boolean> | undefined) {
  const all = stepsOf(p)
  const n = all.filter((s) => done?.[s.id]).length
  return { n, total: all.length, pct: pct(n, all.length) }
}

function Detail({ project }: { project: Project }) {
  const { state, update, log } = useStore()
  const toast = useToast()
  const nav = useNavigate()
  const [tab, setTab] = useState<'overview' | 'steps' | 'validate' | 'errors' | 'interview'>('overview')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const done = state.projects[project.id] ?? {}
  const prog = projectProgress(project, done)
  useStudyTimer(true)

  const toggle = (sid: string, label: string) => {
    const now = !done[sid]
    update((s) => ({ ...s, projects: { ...s.projects, [project.id]: { ...(s.projects[project.id] ?? {}), [sid]: now } } }))
    if (now) {
      const after = prog.n + 1
      log('project', `${project.title}: ${label}`)
      if (after === prog.total) toast('Project complete. Well done!')
    }
  }
  const toggleCheck = (i: number) => toggle(`check-${i}`, `Validated: ${project.checklist[i]}`)

  const checkDone = project.checklist.filter((_, i) => done[`check-${i}`]).length

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-3" onClick={() => nav('/projects')}><ArrowLeft size={14} />All projects</Button>
      <PageHeader title={project.title} subtitle={project.tagline} actions={<><LevelBadge level={project.level} /><Badge><Clock size={11} />{project.hours}h</Badge></>} />
      <Card className="mb-5 p-4"><div className="mb-1.5 flex justify-between text-sm"><span>{prog.n}/{prog.total} steps complete</span><span className="text-muted">{prog.pct}%</span></div><ProgressBar value={prog.pct} /></Card>
      <div className="mb-5"><Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' }, { id: 'steps', label: 'Implementation' }, { id: 'validate', label: `Validation (${checkDone}/${project.checklist.length})` },
        { id: 'errors', label: 'Common errors' }, { id: 'interview', label: 'Interview discussion' }]} /></div>

      {tab === 'overview' && (
        <div className="space-y-4">
          <Card className="p-5"><h2 className="mb-2 font-semibold">Business requirement</h2><Markdown>{project.requirement}</Markdown></Card>
          <Card className="p-5"><h2 className="mb-2 font-semibold">Problem statement</h2><Markdown>{project.problem}</Markdown></Card>
          <Card className="p-5"><h2 className="mb-2 font-semibold">Architecture</h2><pre className="overflow-x-auto rounded-lg bg-code p-4 font-mono text-xs leading-5">{project.architecture}</pre></Card>
          <Card className="p-5"><h2 className="mb-2 font-semibold">Dataset</h2><Markdown>{project.dataset}</Markdown></Card>
          <Card className="p-5"><h2 className="mb-2 font-semibold">Expected output</h2><Markdown>{project.expected}</Markdown></Card>
          <div className="flex flex-wrap gap-2 text-xs text-muted">Related modules: {project.modules.map((m) => <Link key={m} to="/learn" className="rounded bg-surface2 px-2 py-0.5 hover:text-fg">{m}</Link>)}</div>
        </div>
      )}

      {tab === 'steps' && (
        <div className="space-y-4">
          {project.milestones.map((m, mi) => {
            const n = m.steps.filter((s) => done[s.id]).length
            return (
              <Card key={m.id}>
                <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-semibold">Milestone {mi + 1}: {m.title}</h2>
                  <Badge tone={n === m.steps.length ? 'ok' : 'neutral'}>{n}/{m.steps.length}</Badge></div>
                <ul className="divide-y divide-line">
                  {m.steps.map((s) => (
                    <li key={s.id} className="px-5 py-3">
                      <div className="flex items-start gap-3">
                        <input type="checkbox" aria-label={`Mark step complete: ${s.title}`} checked={!!done[s.id]} onChange={() => toggle(s.id, s.title)} className="mt-1 h-4 w-4 accent-[var(--accent)]" />
                        <div className="min-w-0 flex-1">
                          <button className="flex items-center gap-1 text-left text-sm font-medium" onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))}>
                            {open[s.id] ? <ChevronDown size={15} /> : <ChevronRight size={15} />}<span className={done[s.id] ? 'text-muted line-through' : ''}>{s.title}</span></button>
                          {open[s.id] && <div className="mt-2"><Markdown>{s.detail}</Markdown>{s.code && <CodeBlock code={s.code} lang={s.lang ?? 'python'} />}</div>}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )
          })}
        </div>
      )}

      {tab === 'validate' && (
        <Card className="p-5">
          <p className="mb-3 text-sm text-muted">Tick each item once you have verified it on your own output. Be honest: this is your own quality gate.</p>
          <ul className="space-y-2">{project.checklist.map((c, i) => (
            <li key={i}><label className="flex cursor-pointer items-start gap-3 text-sm"><input type="checkbox" checked={!!done[`check-${i}`]} onChange={() => toggleCheck(i)} className="mt-1 h-4 w-4 accent-[var(--accent)]" /><span>{c}</span></label></li>))}</ul>
        </Card>
      )}

      {tab === 'errors' && (
        <div className="space-y-3">{project.errors.map((e, i) => (
          <Card key={i} className="p-4"><div className="font-mono text-sm text-bad">{e.err}</div><div className="mt-1.5 text-sm">{e.fix}</div></Card>))}</div>
      )}

      {tab === 'interview' && (
        <Card className="p-5"><p className="mb-3 text-sm text-muted">Practise explaining these out loud as if a hiring manager asked you about this project.</p>
          <ol className="list-decimal space-y-2 pl-5 text-sm">{project.discussion.map((q, i) => <li key={i}>{q}</li>)}</ol></Card>
      )}
    </div>
  )
}

export default function Projects() {
  const { id } = useParams()
  const { state } = useStore()
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [err, setErr] = useState('')
  useEffect(() => { cached<Project[]>('/api/content/projects').then(setProjects).catch(() => setErr(`Could not load projects. ${LOAD_HINT}`)) }, [])
  const current = useMemo(() => projects?.find((p) => p.id === id), [projects, id])
  if (err) return <EmptyState title="Projects unavailable" hint={err} />
  if (!projects) return <PageSkeleton />
  if (id) return current ? <Detail key={current.id} project={current} /> : <EmptyState title="Project not found" action={<Link to="/projects" className="text-sm text-accent">All projects</Link>} />
  const completed = projects.filter((p) => projectProgress(p, state.projects[p.id]).pct === 100).length
  return (
    <div>
      <PageHeader title="Hands-on Projects" subtitle={`${completed} of ${projects.length} complete. Each project has a business brief, architecture, milestones, a validation checklist and interview prompts.`} />
      <div className="grid gap-4 md:grid-cols-2">
        {projects.map((p, i) => {
          const g = projectProgress(p, state.projects[p.id])
          return (
            <Link key={p.id} to={`/projects/${p.id}`}>
              <Card className="h-full p-5 transition-colors hover:border-accent">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs text-muted">Project {i + 1}</span><div className="flex items-center gap-2"><LevelBadge level={p.level} />{g.pct === 100 && <CheckCircle2 size={16} className="text-ok" />}</div></div>
                <h2 className="font-semibold tracking-tight">{p.title}</h2>
                <p className="mt-1 text-sm text-muted">{p.tagline}</p>
                <div className="mt-4 flex items-center gap-3"><ProgressBar value={g.pct} /><span className="shrink-0 text-xs text-muted">{g.n}/{g.total}</span></div>
              </Card>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
