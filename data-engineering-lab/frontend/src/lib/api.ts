const BASE = ''

/** True in the browser-only build (GitHub Pages etc.): no backend, SQL/Python run in the browser. */
export const STATIC_MODE = import.meta.env.VITE_STATIC === 'true'

/** Shown when content fails to load; the advice differs between the local app and the hosted static build. */
export const LOAD_HINT = STATIC_MODE ? 'Check your internet connection and reload the page.' : 'Is the backend running?'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  if (STATIC_MODE) {
    const { staticRequest } = await import('../static/staticApi')
    return (await staticRequest(init?.method ?? 'GET', path, init?.body ? JSON.parse(init.body as string) : undefined)) as T
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30000)
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
    if (!res.ok) throw new Error(`Request failed (${res.status})`)
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: <T,>(p: string) => req<T>(p),
  post: <T,>(p: string, body?: unknown) => req<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T,>(p: string, body?: unknown) => req<T>(p, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  del: <T,>(p: string) => req<T>(p, { method: 'DELETE' }),
}

export interface SqlResult {
  columns?: string[]; rows?: unknown[][]; row_count?: number; truncated?: boolean
  error?: string; message?: string
}
export interface SqlValidation {
  passed: boolean; feedback?: string; error?: string; expected?: SqlResult; actual?: SqlResult
}
export interface PyResult {
  stdout?: string; stderr?: string; timed_out?: boolean; error?: string; passed?: boolean; feedback?: string
}

/** Cache of immutable content endpoints so pages share one fetch. */
const cache = new Map<string, Promise<unknown>>()
export function cached<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = api.get<T>(path).catch((e) => { cache.delete(path); throw e })
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}
