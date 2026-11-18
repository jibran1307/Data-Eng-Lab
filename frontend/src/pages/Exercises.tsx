import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import { Card, EmptyState, LevelBadge, PageHeader, PageSkeleton, ProgressBar, Tabs } from '../components/ui'
import { LOAD_HINT, cached } from '../lib/api'
import { useStore } from '../lib/store'
import { pct } from '../lib/engine'
import type { PyExercise, SqlExercise } from '../lib/types'

export default function Exercises() {
  const { state } = useStore()
  const [sqlx, setSqlx] = useState<SqlExercise[] | null>(null)
  const [pyx, setPyx] = useState<PyExercise[] | null>(null)
  const [tab, setTab] = useState<'sql' | 'python'>('sql')
  const [err, setErr] = useState('')
  useEffect(() => {
    Promise.all([cached<SqlExercise[]>('/api/sql/exercises'), cached<PyExercise[]>('/api/python/exercises')])
      .then(([s, p]) => { setSqlx(s); setPyx(p) }).catch(() => setErr(`Could not load exercises. ${LOAD_HINT}`))
  }, [])
  if (err) return <EmptyState title="Exercises unavailable" hint={err} />
  if (!sqlx || !pyx) return <PageSkeleton />

  const items = (tab === 'sql' ? sqlx : pyx) as (SqlExercise | PyExercise)[]
  const cats = [...new Set(items.map((e) => e.category))]
  const stats = (list: { id: string }[]) => {
    const solved = list.filter((e) => state.exercises[e.id]?.solved).length
    const att = list.reduce((a, e) => a + (state.exercises[e.id]?.attempts ?? 0), 0)
    const cor = list.reduce((a, e) => a + (state.exercises[e.id]?.correct ?? 0), 0)
    return { solved, total: list.length, acc: att ? pct(cor, att) : null }
  }
  const s = stats(items)
  return (
    <div>
      <PageHeader title="Exercises" subtitle="Every exercise runs against real data with automatic validation. Open one to code it in the matching playground."
        actions={<Tabs tabs={[{ id: 'sql', label: `SQL (${sqlx.length})` }, { id: 'python', label: `Python (${pyx.length})` }]} value={tab} onChange={setTab} />} />
      <Card className="mb-5 grid gap-4 p-5 sm:grid-cols-3">
        <div><div className="text-xs text-muted">Solved</div><div className="text-2xl font-semibold">{s.solved}/{s.total}</div><ProgressBar className="mt-2" value={pct(s.solved, s.total)} /></div>
        <div><div className="text-xs text-muted">Accuracy (correct submissions)</div><div className="text-2xl font-semibold">{s.acc === null ? '-' : `${s.acc}%`}</div></div>
        <div><div className="text-xs text-muted">Categories</div><div className="text-2xl font-semibold">{cats.length}</div></div>
      </Card>
      <div className="space-y-5">
        {cats.map((c) => {
          const list = items.filter((e) => e.category === c)
          const cs = stats(list)
          return (
            <Card key={c}>
              <div className="flex items-center justify-between border-b border-line px-5 py-3"><h2 className="font-semibold">{c}</h2><span className="text-xs text-muted">{cs.solved}/{cs.total} solved</span></div>
              <ul className="divide-y divide-line">
                {list.map((e) => (
                  <li key={e.id}><Link to={`/${tab}?ex=${e.id}`} className="flex items-center gap-3 px-5 py-2.5 hover:bg-surface2">
                    {state.exercises[e.id]?.solved ? <CheckCircle2 size={16} className="text-ok" /> : <span className="h-4 w-4 rounded-full border border-line" />}
                    <span className="min-w-0 flex-1 truncate text-sm">{e.title}</span>
                    {state.exercises[e.id] && <span className="text-xs text-muted">{state.exercises[e.id].correct}/{state.exercises[e.id].attempts}</span>}
                    <LevelBadge level={e.level} /><ArrowRight size={14} className="text-muted" /></Link></li>
                ))}
              </ul>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
