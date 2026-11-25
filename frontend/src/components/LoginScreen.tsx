import { useState } from 'react'
import { Activity, CloudOff } from 'lucide-react'
import { Button } from './ui'
import { useAuth } from '../lib/auth'
import { useStore } from '../lib/store'

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6">{children}</div>
    </div>
  )
}

const GoogleMark = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7c-.5-1.5-.8-3-.8-4.7s.3-3.2.8-4.7l-7.9-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
)

/** Shown to visitors who are not signed in. Personal learning data is only loaded after Google sign-in. */
export function LoginScreen() {
  const { signInWithGoogle, error } = useAuth()
  const [busy, setBusy] = useState(false)
  return (
    <Shell>
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-white dark:text-[#0f1115]"><Activity size={18} /></div>
      <h1 className="text-lg font-semibold tracking-tight">Data Engineering Lab</h1>
      <p className="mt-1 text-sm text-muted">Sign in with Google to keep your progress, notes and practice history in the cloud, the same on every browser and device.</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      <Button variant="primary" className="mt-5 w-full justify-center" disabled={busy}
        onClick={async () => { setBusy(true); try { await signInWithGoogle() } finally { setBusy(false) } }}>
        <GoogleMark />{busy ? 'Redirecting to Google...' : 'Continue with Google'}
      </Button>
      <p className="mt-3 text-xs text-muted">Only your name and email are read from your Google account. Your data is private to you.</p>
    </Shell>
  )
}

/** Shown when the signed-in user's records could not be fetched. Nothing is saved while this is showing, so no data is overwritten. */
export function LoadFailed() {
  const { retryLoad } = useStore()
  const { signOut } = useAuth()
  return (
    <Shell>
      <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-lg bg-surface2 text-bad"><CloudOff size={18} /></div>
      <h1 className="text-lg font-semibold tracking-tight">Could not load your progress</h1>
      <p className="mt-1 text-sm text-muted">Check your internet connection and try again. Your saved data is safe and nothing has been changed.</p>
      <div className="mt-5 flex gap-2">
        <Button variant="primary" onClick={retryLoad}>Try again</Button>
        <Button onClick={() => void signOut()}>Sign out</Button>
      </div>
    </Shell>
  )
}
