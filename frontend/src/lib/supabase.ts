import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

/**
 * True when Supabase is configured at build time. Without it the app behaves exactly as before
 * (local backend / browser storage, no sign-in), which keeps `npm test` and offline use working.
 * Only the publishable (anon) key belongs in the frontend; access is enforced by Row Level Security.
 */
export const CLOUD = Boolean(url && key)

export const supabase: SupabaseClient | null = CLOUD
  ? createClient(url as string, key as string, {
      // PKCE returns `?code=...` in the query string, which does not collide with the hash-based router.
      auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

/**
 * Where Google should send the user back to. Never just `location.origin`: on GitHub Pages that would drop the
 * project path. The static build uses relative assets (`./`) and a hash router, so the current directory is the app
 * root (https://<user>.github.io/Data-Eng-Lab/); the dev/local build uses the Vite base path (http://localhost:5173/).
 * Hash route, query string and any `index.html` are dropped. Both URLs must be in Supabase > Authentication > URL Configuration.
 */
export function redirectUrl(loc: Pick<Location, 'origin' | 'pathname'> = window.location, base: string = import.meta.env.BASE_URL): string {
  const dir = base.startsWith('/') ? base : loc.pathname.replace(/[^/]*$/, '')
  return loc.origin + dir
}
