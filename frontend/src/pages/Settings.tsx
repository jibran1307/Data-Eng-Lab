import { useEffect, useRef, useState } from 'react'
import { Archive, Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { Button, Card, Modal, PageHeader } from '../components/ui'
import { api, STATIC_MODE } from '../lib/api'
import { defaultState, normalise, useStore } from '../lib/store'
import { useTheme, useToast } from '../lib/theme'
import { cleanName } from '../components/Welcome'

interface BackupInfo { name: string; size: number; modified: number }

export default function Settings() {
  const { state, update, replace } = useStore()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [ai, setAi] = useState<boolean | null>(null)
  const [nm, setNm] = useState(state.profile.name)
  const [iv, setIv] = useState(state.settings.revisionIntervals.join(', '))

  const loadBackups = () => api.get<BackupInfo[]>('/api/backup').then(setBackups).catch(() => setBackups([]))
  useEffect(() => { void loadBackups(); api.get<{ configured: boolean }>('/api/ai/status').then((r) => setAi(r.configured)).catch(() => setAi(null)) }, [])

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ app: 'data-engineering-lab', exportedAt: new Date().toISOString(), theme, state }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `de-lab-progress-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(a.href)
    toast('Progress exported')
  }
  const importJson = async (f: File) => {
    try {
      const parsed = JSON.parse(await f.text())
      if (parsed?.app !== 'data-engineering-lab' || typeof parsed.state !== 'object') { toast('This is not a Data Engineering Lab export file.', 'error'); return }
      const imported = normalise(parsed.state)
      replace(imported.profile.name ? imported : { ...imported, profile: state.profile }); toast('Progress imported')
    } catch { toast('Could not read that file as JSON.', 'error') }
  }
  const saveIntervals = () => {
    const nums = iv.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0 && n <= 365)
    if (!nums.length) { toast('Enter positive numbers of days, e.g. 1, 3, 7, 16, 35', 'error'); return }
    update((s) => ({ ...s, settings: { ...s.settings, revisionIntervals: nums } })); toast('Revision schedule updated')
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle={STATIC_MODE ? "Preferences, backup and data management. Your progress is stored only in this browser, so export a copy before clearing site data or switching devices." : "Preferences, backup and data management. Everything is stored locally in a SQLite file on this machine."} />
      <div className="space-y-4">
        <Card className="p-5"><h2 className="mb-1 font-semibold">Profile</h2><p className="mb-3 text-sm text-muted">Your name is used in greetings. It is stored with your progress and never sent anywhere.</p>
          <div className="flex flex-wrap items-center gap-3 text-sm"><label className="flex items-center gap-2">Name<input value={nm} maxLength={40} onChange={(e) => setNm(e.target.value)} className="w-56 rounded-lg border border-line bg-surface2 px-2 py-1" /></label>
            <Button size="sm" disabled={!cleanName(nm) || cleanName(nm) === state.profile.name} onClick={() => { update((s) => ({ ...s, profile: { ...s.profile, name: cleanName(nm) } })); toast('Name updated') }}>Save</Button></div></Card>

        <Card className="p-5"><h2 className="mb-1 font-semibold">Appearance</h2><p className="mb-3 text-sm text-muted">Currently using {theme} mode. You can also use the toggle in the top bar.</p><Button onClick={toggle}>Switch to {theme === 'dark' ? 'light' : 'dark'} mode</Button></Card>

        <Card className="p-5"><h2 className="mb-3 font-semibold">Learning preferences</h2>
          <div className="space-y-3 text-sm">
            <label className="flex flex-wrap items-center gap-3">Revision intervals (days)<input value={iv} onChange={(e) => setIv(e.target.value)} className="w-48 rounded-lg border border-line bg-surface2 px-2 py-1" /><Button size="sm" onClick={saveIntervals}>Save</Button></label>
            <label className="flex flex-wrap items-center gap-3">Avoid repeating questions from the last
              <select value={state.settings.interviewHistoryWindow} onChange={(e) => update((s) => ({ ...s, settings: { ...s.settings, interviewHistoryWindow: Number(e.target.value) } }))} className="rounded-lg border border-line bg-surface px-2 py-1">{[1, 2, 3, 5].map((n) => <option key={n} value={n}>{n} interview{n > 1 ? 's' : ''}</option>)}</select></label>
          </div>
        </Card>

        <Card className="p-5"><h2 className="mb-1 font-semibold">Export and import</h2><p className="mb-3 text-sm text-muted">Move your progress between machines or keep a copy. Includes notes, history, projects and preferences.</p>
          <div className="flex flex-wrap gap-2"><Button onClick={exportJson}><Download size={14} />Export progress (JSON)</Button><Button onClick={() => fileRef.current?.click()}><Upload size={14} />Import progress</Button>
            <input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importJson(f); e.target.value = '' }} /></div></Card>

        <Card className="p-5"><h2 className="mb-1 font-semibold">{STATIC_MODE ? "Browser backups" : "Server backups"}</h2><p className="mb-3 text-sm text-muted">{STATIC_MODE ? "Snapshots kept in this browser (latest 5). They are lost if you clear site data, so also use Export above." : <>Snapshots stored in <code>backend/data/backups</code>.</>}</p>
          <Button onClick={async () => { try { const r = await api.post<{ name: string }>('/api/backup'); toast(`Backup created: ${r.name}`); void loadBackups() } catch { toast('Backup failed', 'error') } }}><Archive size={14} />Create backup now</Button>
          {backups.length > 0 && <ul className="mt-3 divide-y divide-line text-sm">{backups.slice(0, 8).map((b) => (
            <li key={b.name} className="flex items-center justify-between gap-2 py-2"><span className="truncate font-mono text-xs">{b.name}</span>
              <Button size="sm" onClick={async () => { try { await api.post('/api/backup/restore', { name: b.name }); const all = await api.get<Record<string, unknown>>('/api/state'); replace(normalise(all.app)); toast('Backup restored') } catch { toast('Restore failed', 'error') } }}><RotateCcw size={13} />Restore</Button></li>))}</ul>}</Card>

        <Card className="p-5"><h2 className="mb-1 font-semibold">AI evaluation (optional)</h2>
          <p className="text-sm text-muted">The app is fully usable without AI. All scoring uses a transparent rubric. {STATIC_MODE ? 'This hosted version has no server, so AI evaluation is not available. Run the app locally to configure an optional provider.' : <>An external AI provider is {ai ? 'configured on the server' : 'not configured'}. To configure one later, set <code>DE_LAB_AI_BASE_URL</code>, <code>DE_LAB_AI_MODEL</code> and <code>DE_LAB_AI_API_KEY</code> as environment variables before starting the backend; keys are never stored in the database or browser.</>}</p></Card>

        <Card className="border-bad/30 p-5"><h2 className="mb-1 font-semibold text-bad">Danger zone</h2><p className="mb-3 text-sm text-muted">Permanently deletes all progress, notes, history and custom questions. Export first if unsure.</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}><Trash2 size={14} />Reset all progress</Button></Card>
      </div>
      <Modal open={confirmReset} onClose={() => setConfirmReset(false)} title="Reset all progress?" footer={<><Button onClick={() => setConfirmReset(false)}>Cancel</Button>
        <Button variant="danger" onClick={async () => { replace({ ...defaultState(), profile: state.profile }); try { await api.del('/api/state') } catch { /* local reset still applied */ } localStorage.removeItem('delab.state'); setConfirmReset(false); toast('All progress reset', 'info') }}>Yes, reset everything</Button></>}>
        This cannot be undone. Your name and theme preference are kept.</Modal>
    </div>
  )
}
