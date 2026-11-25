import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { CLOUD, redirectUrl, supabase } from './supabase'

/** Google/Supabase report a cancelled or failed login through `error_description` in the query or hash. Read it before the client cleans the URL. */
function readUrlError(): string | null {
  if (!CLOUD || typeof window === 'undefined') return null
  const q = new URLSearchParams(window.location.search)
  const h = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const code = q.get('error') ?? h.get('error')
  if (!code) return null
  return code === 'access_denied' ? 'Sign-in was cancelled.' : 'Sign-in failed. Please try again.'
}
const URL_ERROR = readUrlError()

interface AuthCtx {
  /** False when Supabase is not configured: the app then runs without accounts. */
  enabled: boolean
  user: User | null
  /** True until the stored session has been checked, so a signed-in user never flashes the login screen. */
  loading: boolean
  error: string | null
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthCtx>({
  enabled: false, user: null, loading: false, error: null, signInWithGoogle: async () => {}, signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(CLOUD)
  const [error, setError] = useState<string | null>(URL_ERROR)

  useEffect(() => {
    if (!supabase) return
    if (URL_ERROR) window.history.replaceState(null, '', window.location.pathname)
    let active = true
    supabase.auth.getSession().then(({ data, error: e }) => {
      if (!active) return
      if (e) setError('Could not restore your session. Please sign in again.')
      setUser(data.session?.user ?? null)
      setLoading(false)
    }).catch(() => { if (active) { setError('Could not reach the sign-in service. Check your connection.'); setLoading(false) } })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setLoading(false)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) return
    setError(null)
    const { error: e } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: redirectUrl(), queryParams: { prompt: 'select_account' } },
    })
    if (e) setError('Could not start Google sign-in. Please try again.')
  }, [])

  const signOut = useCallback(async () => {
    if (!supabase) return
    const { error: e } = await supabase.auth.signOut()
    if (e) setError('Sign-out failed. Please try again.')
    setUser(null)
  }, [])

  const value = useMemo(() => ({ enabled: CLOUD, user, loading, error, signInWithGoogle, signOut }), [user, loading, error, signInWithGoogle, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)

/** Name/email shown in the UI for a signed-in Google account. */
export function profileOf(user: User | null): { name: string; email: string } {
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
  const email = user?.email ?? ''
  const name = String(meta.full_name ?? meta.name ?? '').trim() || email.split('@')[0]
  return { name, email }
}
