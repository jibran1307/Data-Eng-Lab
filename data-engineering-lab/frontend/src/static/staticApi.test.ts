import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Node 25's experimental global localStorage shadows jsdom's; use a deterministic in-memory store.
function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() { return m.size }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k),
  }
}

// The engines need a browser (WASM + workers); the router under test only touches them for SQL/Python calls.
vi.mock('./sqlEngine', () => ({ expectedSql: vi.fn(), resetSql: vi.fn(async () => ({ ok: true })), runSql: vi.fn(async () => ({ columns: ['x'], rows: [[1]] })), sqlSchema: vi.fn(async () => []), validateSql: vi.fn(async () => ({ passed: true })) }))
vi.mock('./pythonEngine', () => ({ runPython: vi.fn(async () => ({ stdout: '4\n' })), validatePython: vi.fn(async () => ({ passed: true })) }))

import { staticRequest } from './staticApi'

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()) })
afterEach(() => { vi.unstubAllGlobals() })

describe('static API (browser-only build)', () => {
  it('stores progress per visitor in localStorage and reads it back', async () => {
    expect(await staticRequest('GET', '/api/state')).toEqual({})
    await staticRequest('PUT', '/api/state/app', { value: { completed: { a: 1 } } })
    expect(await staticRequest('GET', '/api/state')).toEqual({ app: { completed: { a: 1 } } })
  })

  it('resets progress', async () => {
    await staticRequest('PUT', '/api/state/app', { value: { v: 1 } })
    await staticRequest('DELETE', '/api/state')
    expect(await staticRequest('GET', '/api/state')).toEqual({})
  })

  it('creates, lists and restores browser backups, keeping only the latest five', async () => {
    await staticRequest('PUT', '/api/state/app', { value: { n: 1 } })
    const { name } = (await staticRequest('POST', '/api/backup')) as { name: string }
    expect(name).toMatch(/^backup-\d{8}-\d{6}\.json$/)
    await staticRequest('PUT', '/api/state/app', { value: { n: 2 } })
    await staticRequest('POST', '/api/backup/restore', { name })
    expect(await staticRequest('GET', '/api/state')).toEqual({ app: { n: 1 } })
    for (let i = 0; i < 7; i++) await staticRequest('POST', '/api/backup')
    expect(((await staticRequest('GET', '/api/backup')) as unknown[]).length).toBe(5)
  })

  it('rejects restoring an unknown backup and unknown routes', async () => {
    await expect(staticRequest('POST', '/api/backup/restore', { name: 'backup-20200101-000000.json' })).rejects.toThrow('404')
    await expect(staticRequest('GET', '/api/nope')).rejects.toThrow('404')
  })

  it('reports that no AI provider is configured', async () => {
    expect(await staticRequest('GET', '/api/ai/status')).toEqual({ configured: false })
  })

  it('routes SQL and Python calls to the in-browser engines', async () => {
    expect(await staticRequest('POST', '/api/sql/run', { sql: 'SELECT 1' })).toEqual({ columns: ['x'], rows: [[1]] })
    expect(await staticRequest('POST', '/api/python/run', { code: 'print(2+2)' })).toEqual({ stdout: '4\n' })
  })
})
