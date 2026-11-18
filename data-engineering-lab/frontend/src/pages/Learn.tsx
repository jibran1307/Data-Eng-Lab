import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bookmark, CheckCircle2, Clock, Lock } from 'lucide-react'
import { Badge, Card, EmptyState, LevelBadge, PageHeader, PageSkeleton, ProgressBar, Select } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore } from '../lib/store'
import { isUnlocked, moduleProgress } from '../lib/engine'
import type { LessonIndex, ModuleMeta } from '../lib/types'

export default function Learn() {
  const { state } = useStore()
  const [lessons, setLessons] = useState<LessonIndex[] | null>(null)
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const [filter, setFilter] = useState('all')
  const [err, setErr] = useState('')

  useEffect(() => {
    Promise.all([cached<LessonIndex[]>('/api/content/lessons'), cached<ModuleMeta[]>('/api/content/modules')])
      .then(([l, m]) => { setLessons(l); setMods(m) }).catch(() => setErr(`Could not load the curriculum. ${LOAD_HINT}`))
  }, [])

  const visible = useMemo(() => mods.filter((m) => filter === 'all' || m.id === filter), [mods, filter])
  if (err) return <EmptyState title="Curriculum unavailable" hint={err} />
  if (!lessons) return <PageSkeleton />

  const done = lessons.filter((l) => state.completed[l.id]).length
  return (
    <div>
      <PageHeader title="Learning Path" subtitle={`${done} of ${lessons.length} lessons completed. Lessons unlock as you finish their prerequisites, so foundations come first.`}
        actions={<Select value={filter} onChange={setFilter} options={[{ value: 'all', label: 'All modules' }, ...mods.map((m) => ({ value: m.id, label: `${m.number}. ${m.title}` }))]} />} />
      <div className="space-y-6">
        {visible.map((m) => {
          const p = moduleProgress(state, lessons, m.id)
          const ls = lessons.filter((l) => l.module === m.id)
          return (
            <Card key={m.id} className="overflow-hidden">
              <div className="border-b border-line p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted">Module {m.number}</div>
                    <h2 className="text-lg font-semibold tracking-tight">{m.title}</h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted">{m.description}</p>
                  </div>
                  <div className="w-40"><div className="mb-1 flex justify-between text-xs text-muted"><span>{p.done}/{p.total}</span><span>{p.pct}%</span></div><ProgressBar value={p.pct} /></div>
                </div>
              </div>
              {ls.length === 0 ? <div className="p-5"><EmptyState title="No lessons yet" /></div> : (
                <ul className="divide-y divide-line">
                  {ls.map((l, i) => {
                    const u = isUnlocked(state, l)
                    return (
                      <li key={l.id}>
                        <Link to={`/learn/${l.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-surface2">
                          <span className="w-5 text-xs text-muted">{i + 1}</span>
                          {state.completed[l.id] ? <CheckCircle2 size={17} className="shrink-0 text-ok" /> : u.ok ? <span className="h-[17px] w-[17px] shrink-0 rounded-full border border-line" /> : <Lock size={15} className="shrink-0 text-muted" />}
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">{l.title}</div>
                            <div className="truncate text-xs text-muted">{l.summary}</div>
                          </div>
                          {state.bookmarks.includes(l.id) && <Bookmark size={14} className="shrink-0 fill-accent text-accent" />}
                          <span className="hidden items-center gap-1 text-xs text-muted sm:flex"><Clock size={12} />{l.minutes}m</span>
                          <span className="hidden sm:block"><LevelBadge level={l.level} /></span>
                          {!u.ok && <Badge tone="warn">needs prerequisites</Badge>}
                        </Link>
                      </li>
                    )
                  })}
                </ul>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
