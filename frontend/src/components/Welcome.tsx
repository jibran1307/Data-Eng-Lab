import { useState } from 'react'
import { Activity } from 'lucide-react'
import { Button } from './ui'
import { useStore } from '../lib/store'

export const cleanName = (raw: string) => raw.replace(/\s+/g, ' ').trim().slice(0, 40)
export const initialsOf = (name: string) => {
  const parts = name.split(' ').filter(Boolean)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || 'DE'
}

/** Shown once on first launch, until a name has been saved. */
export default function Welcome() {
  const { state, update } = useStore()
  const [name, setName] = useState('')
  if (state.profile.name) return null
  const ok = cleanName(name).length > 0
  const save = () => { if (ok) update((s) => ({ ...s, profile: { ...s.profile, name: cleanName(name) } })) }
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-bg/80 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Welcome">
      <form className="w-full max-w-sm rounded-xl border border-line bg-surface p-6" onSubmit={(e) => { e.preventDefault(); save() }}>
        <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white dark:text-[#0f1115]"><Activity size={18} /></div>
        <h2 className="text-lg font-semibold tracking-tight">Welcome to Data Engineering Lab</h2>
        <p className="mt-1 text-sm text-muted">What should we call you? Your name is only used to personalise this app and stays in your own browser or machine.</p>
        <label className="mt-4 block text-sm"><span className="mb-1 block font-medium">Your name</span>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoComplete="given-name" placeholder="e.g. Jibran"
            className="w-full rounded-lg border border-line bg-surface2 px-3 py-2 text-sm focus:border-accent focus:outline-none" /></label>
        <Button type="submit" variant="primary" className="mt-4 w-full justify-center" disabled={!ok}>Get started</Button>
      </form>
    </div>
  )
}
