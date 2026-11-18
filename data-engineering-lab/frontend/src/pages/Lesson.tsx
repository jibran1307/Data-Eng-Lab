import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Bookmark, BookmarkCheck, CheckCircle2, ChevronDown, ChevronRight, Lock, RotateCcw } from 'lucide-react'
import Markdown, { extractToc } from '../components/Markdown'
import { Badge, Button, Card, EmptyState, LevelBadge, PageSkeleton, ProgressBar, cx } from '../components/ui'
import { api, cached } from '../lib/api'
import { useStore, useStudyTimer } from '../lib/store'
import { useToast } from '../lib/theme'
import { isUnlocked, reviewLesson, scheduleRevision } from '../lib/engine'
import type { Lesson as LessonT, LessonIndex, ModuleMeta } from '../lib/types'

function KnowledgeCheck({ lesson }: { lesson: LessonT }) {
  const { update, log, state } = useStore()
  const toast = useToast()
  const [picked, setPicked] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)
  const prev = state.quiz[lesson.id]
  if (!lesson.quiz.length) return null
  const score = lesson.quiz.filter((q, i) => picked[i] === q.answer).length
  const submit = () => {
    setSubmitted(true)
    update((s) => ({ ...s, quiz: { ...s.quiz, [lesson.id]: { score, total: lesson.quiz.length, ts: Date.now() } } }))
    log('quiz', `Knowledge check: ${lesson.title} (${score}/${lesson.quiz.length})`)
    toast(`Knowledge check: ${score}/${lesson.quiz.length}`, score === lesson.quiz.length ? 'success' : 'info')
  }
  return (
    <Card className="mt-8 p-5" id="knowledge-check">
      <div className="mb-1 flex items-center justify-between"><h2 className="text-lg font-semibold">Knowledge check</h2>
        {prev && <Badge tone="accent">Last: {prev.score}/{prev.total}</Badge>}</div>
      <p className="mb-4 text-sm text-muted">Answer from memory first. Explanations appear after you submit.</p>
      <div className="space-y-5">
        {lesson.quiz.map((q, i) => (
          <div key={i}>
            <div className="mb-2 text-sm font-medium">{i + 1}. {q.q}</div>
            <div className="space-y-1.5">
              {q.options.map((o, j) => {
                const chosen = picked[i] === j
                const right = submitted && j === q.answer
                const wrong = submitted && chosen && j !== q.answer
                return (
                  <button key={j} disabled={submitted} onClick={() => setPicked((p) => ({ ...p, [i]: j }))}
                    className={cx('flex w-full items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      right ? 'border-ok bg-ok/10' : wrong ? 'border-bad bg-bad/10' : chosen ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface2')}>
                    <span className="mt-0.5 w-4 text-xs text-muted">{String.fromCharCode(65 + j)}</span><span>{o}</span>
                  </button>
                )
              })}
            </div>
            {submitted && <p className="mt-2 rounded-lg bg-surface2 p-3 text-sm text-muted"><span className="font-medium text-fg">{picked[i] === q.answer ? 'Correct. ' : 'Not quite. '}</span>{q.why}</p>}
          </div>
        ))}
      </div>
      <div className="mt-5 flex items-center gap-3">
        {!submitted ? <Button variant="primary" disabled={Object.keys(picked).length < lesson.quiz.length} onClick={submit}>Submit answers</Button>
          : <><span className="text-sm font-medium">Score: {score}/{lesson.quiz.length}</span><Button onClick={() => { setSubmitted(false); setPicked({}) }}>Try again</Button></>}
      </div>
    </Card>
  )
}

function InterviewQs({ items }: { items: LessonT['interview'] }) {
  const [open, setOpen] = useState<number | null>(null)
  if (!items.length) return null
  return (
    <Card className="mt-6 p-5">
      <h2 className="mb-1 text-lg font-semibold">Interview questions</h2>
      <p className="mb-3 text-sm text-muted">Try answering aloud before revealing the model answer.</p>
      <ul className="divide-y divide-line">
        {items.map((it, i) => (
          <li key={i} className="py-2">
            <button className="flex w-full items-start gap-2 text-left text-sm font-medium" onClick={() => setOpen(open === i ? null : i)}>
              {open === i ? <ChevronDown size={16} className="mt-0.5 shrink-0" /> : <ChevronRight size={16} className="mt-0.5 shrink-0" />}{it.q}
            </button>
            {open === i && <div className="mt-2 pl-6 text-sm text-muted"><Markdown>{it.a}</Markdown></div>}
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function Lesson() {
  const { id = '' } = useParams()
  const [sp] = useSearchParams()
  const nav = useNavigate()
  const toast = useToast()
  const { state, update, log } = useStore()
  const [loaded, setLoaded] = useState<LessonT | null>(null)
  const [errId, setErrId] = useState('')
  const [index, setIndex] = useState<LessonIndex[]>([])
  const [mods, setMods] = useState<ModuleMeta[]>([])
  const lesson = loaded && loaded.id === id ? loaded : null
  const err = errId === id ? 'This lesson could not be loaded.' : ''
  const [note, setNote] = useState(() => state.notes[id] ?? '')
  const [noteFor, setNoteFor] = useState(id)
  if (noteFor !== id) { setNoteFor(id); setNote(state.notes[id] ?? '') }
  useStudyTimer(true)

  useEffect(() => {
    Promise.all([api.get<LessonT>(`/api/content/lessons/${encodeURIComponent(id)}`), cached<LessonIndex[]>('/api/content/lessons'), cached<ModuleMeta[]>('/api/content/modules')])
      .then(([l, ix, m]) => { setLoaded(l); setIndex(ix); setMods(m) }).catch(() => setErrId(id))
    window.scrollTo?.(0, 0)
  }, [id])
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((state.notes[id] ?? '') !== note) update((s) => ({ ...s, notes: { ...s.notes, [id]: note } }))
    }, 600)
    return () => window.clearTimeout(t)
  }, [note, id]) // eslint-disable-line react-hooks/exhaustive-deps

  const toc = useMemo(() => (lesson ? extractToc(lesson.body) : []), [lesson])
  if (err) return <EmptyState title="Lesson not found" hint={err} action={<Link className="text-sm text-accent" to="/learn">Back to Learning Path</Link>} />
  if (!lesson) return <PageSkeleton />

  const siblings = index.filter((l) => l.module === lesson.module)
  const pos = index.findIndex((l) => l.id === lesson.id)
  const prev = index[pos - 1], next = index[pos + 1]
  const idx = index[pos]
  const unlocked = idx ? isUnlocked(state, idx) : { ok: true, missing: [] as string[] }
  const done = !!state.completed[lesson.id]
  const mod = mods.find((m) => m.id === lesson.module)
  const bookmarked = state.bookmarks.includes(lesson.id)
  const revising = sp.get('revise') === '1' && !!state.revisions[lesson.id]
  const titleOf = (x: string) => index.find((l) => l.id === x)?.title ?? x

  const toggleComplete = () => {
    if (done) {
      update((s) => { const c = { ...s.completed }; delete c[lesson.id]; const r = { ...s.revisions }; delete r[lesson.id]; return { ...s, completed: c, revisions: r } })
      toast('Marked as not complete', 'info')
    } else {
      update((s) => ({ ...s, completed: { ...s.completed, [lesson.id]: Date.now() }, revisions: scheduleRevision(s, lesson.id) }))
      log('lesson', `Completed lesson: ${lesson.title}`)
      toast('Lesson completed. A revision is scheduled for tomorrow.')
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[240px_minmax(0,1fr)_200px]">
      <aside className="hidden xl:block">
        <div className="sticky top-4 max-h-[calc(100vh-110px)] overflow-y-auto pr-2">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{mod?.title}</div>
          <ul className="space-y-0.5">
            {siblings.map((l) => (
              <li key={l.id}><Link to={`/learn/${l.id}`} className={cx('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', l.id === lesson.id ? 'bg-accent-soft font-medium text-accent' : 'text-muted hover:bg-surface2 hover:text-fg')}>
                {state.completed[l.id] ? <CheckCircle2 size={13} className="shrink-0 text-ok" /> : <span className="h-[13px] w-[13px] shrink-0 rounded-full border border-line" />}<span className="truncate">{l.title}</span></Link></li>
            ))}
          </ul>
        </div>
      </aside>

      <article className="min-w-0">
        <div className="mb-1 flex flex-wrap items-center gap-2"><LevelBadge level={lesson.level} /><span className="text-xs text-muted">{lesson.minutes} min read</span>{done && <Badge tone="ok">completed</Badge>}</div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-3xl font-semibold tracking-tight">{lesson.title}</h1>
          <button aria-label={bookmarked ? 'Remove bookmark' : 'Bookmark lesson'} title="Bookmark" className="mt-2 text-muted hover:text-accent"
            onClick={() => update((s) => ({ ...s, bookmarks: bookmarked ? s.bookmarks.filter((b) => b !== lesson.id) : [...s.bookmarks, lesson.id] }))}>
            {bookmarked ? <BookmarkCheck className="text-accent" /> : <Bookmark />}</button>
        </div>
        <p className="mt-1 text-muted">{lesson.summary}</p>

        {!unlocked.ok && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
            <Lock size={16} className="mt-0.5 shrink-0 text-warn" />
            <div>Recommended prerequisites not completed yet: {unlocked.missing.map((m, i) => <span key={m}>{i > 0 && ', '}<Link className="text-accent underline" to={`/learn/${m}`}>{titleOf(m)}</Link></span>)}. You can still read this lesson.</div>
          </div>
        )}
        {revising && (
          <Card className="mt-4 flex flex-wrap items-center justify-between gap-3 border-accent/40 p-4">
            <div className="text-sm"><b>Revision time.</b> Skim the lesson and the knowledge check, then rate how well you remember it.</div>
            <div className="flex gap-2">
              <Button onClick={() => { update((s) => ({ ...s, revisions: reviewLesson(s, lesson.id, false) })); log('revision', `Revised (needs work): ${lesson.title}`); toast('Scheduled again for tomorrow', 'info'); nav('/') }}><RotateCcw size={14} />Needs review</Button>
              <Button variant="primary" onClick={() => { update((s) => ({ ...s, revisions: reviewLesson(s, lesson.id, true) })); log('revision', `Revised: ${lesson.title}`); toast('Nice. The next revision interval was extended.'); nav('/') }}>I remember it</Button>
            </div>
          </Card>
        )}

        <div className="mt-6"><Markdown>{lesson.body}</Markdown></div>

        {lesson.exercises.length > 0 && (
          <Card className="mt-8 p-5">
            <h2 className="mb-2 text-lg font-semibold">Practice related exercises</h2>
            <div className="flex flex-wrap gap-2">
              {lesson.exercises.map((e) => <Link key={e} to={`${e.startsWith('sql') ? '/sql' : '/python'}?ex=${e}`} className="rounded-lg border border-line px-3 py-1.5 text-sm hover:bg-surface2">{e}</Link>)}
            </div>
          </Card>
        )}

        <KnowledgeCheck key={lesson.id} lesson={lesson} />
        <InterviewQs items={lesson.interview} />

        <Card className="mt-6 p-5">
          <h2 className="mb-2 text-lg font-semibold">My notes</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={5} placeholder="Write what you want to remember. Notes save automatically."
            className="w-full resize-y rounded-lg border border-line bg-surface2 p-3 text-sm focus:border-accent focus:outline-none" />
        </Card>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
          {prev ? <Button onClick={() => nav(`/learn/${prev.id}`)}><ArrowLeft size={14} />{prev.title.slice(0, 28)}</Button> : <span />}
          <Button variant={done ? 'secondary' : 'primary'} onClick={toggleComplete}><CheckCircle2 size={15} />{done ? 'Completed - undo' : 'Mark as complete'}</Button>
          {next ? <Button onClick={() => nav(`/learn/${next.id}`)}>{next.title.slice(0, 28)}<ArrowRight size={14} /></Button> : <span />}
        </div>
      </article>

      <aside className="hidden xl:block">
        <div className="sticky top-4">
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">On this page</div>
          <ul className="space-y-1 border-l border-line text-sm">
            {toc.map((t) => <li key={t.id}><a href={`#${t.id}`} className={cx('block py-0.5 text-muted hover:text-fg', t.level === 3 ? 'pl-6' : 'pl-3')}
              onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth' }) }}>{t.text}</a></li>)}
            <li><a href="#knowledge-check" className="block py-0.5 pl-3 text-muted hover:text-fg" onClick={(e) => { e.preventDefault(); document.getElementById('knowledge-check')?.scrollIntoView({ behavior: 'smooth' }) }}>Knowledge check</a></li>
          </ul>
          <div className="mt-6"><div className="mb-1 text-xs text-muted">Module progress</div>
            <ProgressBar value={siblings.length ? (siblings.filter((l) => state.completed[l.id]).length / siblings.length) * 100 : 0} /></div>
        </div>
      </aside>
    </div>
  )
}
