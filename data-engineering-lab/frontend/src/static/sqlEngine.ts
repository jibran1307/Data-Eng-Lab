/**
 * Browser SQL engine (DuckDB-WASM). Mirrors backend/app/sql_lab.py so the static build behaves the same:
 * seeded sample database, 500-row cap, 10 s timeout, order-insensitive exercise validation.
 *
 * Every lab database is an attached in-memory catalog (`lab`), so reset / validation can create clean copies
 * without re-instantiating the WASM module. All operations are serialised through one queue because the
 * connection has a single "current database".
 */
import * as duckdb from '@duckdb/duckdb-wasm'
import type { SqlResult, SqlValidation } from '../lib/api'

const MAX_ROWS = 500
const MAX_CHARS = 20_000
const TIMEOUT_MS = 10_000
const LAB = 'lab'

type Conn = duckdb.AsyncDuckDBConnection
interface Engine { conn: Conn; seed: string }

let booting: Promise<Engine> | null = null
let queue: Promise<unknown> = Promise.resolve()

const dataUrl = (name: string) => `${import.meta.env.BASE_URL}static-data/${name}`

async function boot(): Promise<Engine> {
  const bundle = await duckdb.selectBundle(duckdb.getJsDelivrBundles())
  // Cross-origin worker scripts must be wrapped in a same-origin blob.
  const workerUrl = URL.createObjectURL(new Blob([`importScripts("${bundle.mainWorker}");`], { type: 'text/javascript' }))
  const worker = new Worker(workerUrl)
  const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker)
  await db.instantiate(bundle.mainModule, bundle.pthreadWorker)
  URL.revokeObjectURL(workerUrl)
  const conn = await db.connect()
  const res = await fetch(dataUrl('datasets.sql'))
  if (!res.ok) throw new Error('Could not load sample datasets')
  const engine = { conn, seed: await res.text() }
  await freshCatalog(engine, LAB)
  return engine
}

function engine(): Promise<Engine> {
  if (!booting) booting = boot().catch((e) => { booting = null; throw e })
  return booting
}

/** Run `fn` after all previously queued SQL work has finished. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

async function freshCatalog(e: Engine, name: string, setup?: string | null) {
  await e.conn.query('USE memory')
  await e.conn.query(`DETACH DATABASE IF EXISTS ${name}`)
  await e.conn.query(`ATTACH ':memory:' AS ${name}`)
  await e.conn.query(`USE ${name}`)
  await e.conn.query(e.seed)
  if (setup) await e.conn.query(setup)
}

async function dropCatalog(e: Engine, name: string) {
  try { await e.conn.query('USE memory'); await e.conn.query(`DETACH DATABASE IF EXISTS ${name}`) } catch { /* best effort */ }
}

// ---------------------------------------------------------------- value conversion
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
function isoDate(ms: number) { return new Date(ms).toISOString().slice(0, 10) }
function isoTimestamp(ms: number) {
  const d = new Date(ms)
  const base = `${isoDate(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  return d.getUTCMilliseconds() ? `${base}.${pad(d.getUTCMilliseconds(), 3)}` : base
}
function safeNumber(n: bigint): number | string {
  return n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString()
}
function plain(v: unknown): unknown {
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return safeNumber(v)
  if (typeof v === 'number') return Number.isNaN(v) ? null : Math.round(v * 1e6) / 1e6
  if (Array.isArray(v)) return v.map(plain)
  if (typeof v === 'object') {
    const o = v as { toJSON?: () => unknown }
    if (typeof o.toJSON === 'function') return plain(o.toJSON())
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, plain(x)]))
  }
  return v
}

// Arrow type ids used by DuckDB-WASM
const T = { Binary: 4, Date: 8, Time: 9, Timestamp: 10, Interval: 11, Decimal: 7 }

function convert(v: unknown, type: { typeId: number; scale?: number }): unknown {
  if (v === null || v === undefined) return null
  switch (type.typeId) {
    case T.Date: return typeof v === 'number' ? isoDate(v) : plain(v)
    case T.Timestamp: return typeof v === 'number' ? isoTimestamp(v) : plain(v)
    case T.Time: {
      const micro = typeof v === 'bigint' ? v : BigInt(Math.trunc(Number(v)))
      const s = Number(micro / 1_000_000n)
      return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`
    }
    case T.Decimal: {
      const raw = String(v)
      const scale = type.scale ?? 0
      const n = Number(raw) / 10 ** scale
      return Number.isSafeInteger(Math.trunc(n)) ? Math.round(n * 1e6) / 1e6 : raw
    }
    case T.Interval: {
      const a = v as ArrayLike<number>
      return `${a[0]} months ${a[1]} days`
    }
    case T.Binary: return Array.from(v as Uint8Array).map((b) => b.toString(16).padStart(2, '0')).join('')
    default: return plain(v)
  }
}

const NO_RESULT = /^\s*(create|insert|update|delete|drop|alter|use|attach|detach|set|begin|commit|rollback|copy|truncate|install|load|checkpoint|vacuum|analyze|reset|comment)\b/i

async function runOn(e: Engine, sql: string): Promise<SqlResult> {
  sql = (sql ?? '').trim()
  if (!sql) return { error: 'Query is empty.' }
  if (sql.length > MAX_CHARS) return { error: 'Query too long (max 20,000 characters).' }
  let timer: number | undefined
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        void e.conn.cancelSent().catch(() => false)
        reject(new Error('Query exceeded the 10 second limit and was cancelled.'))
      }, TIMEOUT_MS)
    })
    const table = await Promise.race([e.conn.query(sql), timeout])
    const columns = table.schema.fields.map((f) => f.name)
    if (NO_RESULT.test(sql)) {
      const count = columns.length === 1 && columns[0] === 'Count' && table.numRows === 1 ? Number(table.getChildAt(0)?.get(0)) : null
      return { columns: [], rows: [], row_count: 0, truncated: false,
        message: count !== null && Number.isFinite(count) ? `Statement executed successfully (${count} row${count === 1 ? '' : 's'} affected).` : 'Statement executed successfully.' }
    }
    const n = table.numRows
    const cols = table.schema.fields.map((f, i) => ({ type: f.type as unknown as { typeId: number; scale?: number }, vec: table.getChildAt(i)! }))
    const rows: unknown[][] = []
    for (let r = 0; r < Math.min(n, MAX_ROWS); r++) rows.push(cols.map((c) => convert(c.vec.get(r), c.type)))
    return { columns, rows, row_count: n, truncated: n > MAX_ROWS }
  } catch (err) {
    return { error: (err instanceof Error ? err.message : String(err)).trim() }
  } finally {
    window.clearTimeout(timer)
  }
}

// ---------------------------------------------------------------- public API (same shapes as the backend)
export function runSql(sql: string): Promise<SqlResult> {
  return serial(async () => { const e = await engine(); await e.conn.query(`USE ${LAB}`); return runOn(e, sql) })
}

export function resetSql(): Promise<{ ok: boolean }> {
  return serial(async () => { const e = await engine(); await freshCatalog(e, LAB); return { ok: true } })
}

export function sqlSchema(): Promise<{ table: string; columns: { name: string; type: string }[] }[]> {
  return serial(async () => {
    const e = await engine()
    await e.conn.query(`USE ${LAB}`)
    const res = await runOn(e, `SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_catalog = '${LAB}' AND table_schema = 'main' ORDER BY table_name, ordinal_position`)
    const tables = new Map<string, { name: string; type: string }[]>()
    for (const [t, c, ty] of (res.rows ?? []) as string[][]) tables.set(t, [...(tables.get(t) ?? []), { name: c, type: ty }])
    return [...tables].map(([table, columns]) => ({ table, columns }))
  })
}

/** Result of the reference solution on a clean database (the "expected output"). */
export function expectedSql(solution: string, setup?: string | null): Promise<SqlResult> {
  return serial(async () => {
    const e = await engine()
    try { await freshCatalog(e, 'ref_db', setup); return await runOn(e, solution) } finally { await dropCatalog(e, 'ref_db') }
  })
}

const norm = (rows: unknown[][]) => rows.map((r) => r.map((v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)))
const sortKey = (row: unknown[]) => row.map((v) => `${v === null ? 1 : 0}|${String(v)}`).join('\u0001')
const sortRows = (rows: unknown[][]) => [...rows].sort((a, b) => { const x = sortKey(a), y = sortKey(b); return x < y ? -1 : x > y ? 1 : 0 })

export function validateSql(userSql: string, solution: string, ordered: boolean, setup?: string | null): Promise<SqlValidation> {
  return serial(async () => {
    const e = await engine()
    let expected: SqlResult, actual: SqlResult
    try {
      await freshCatalog(e, 'ref_db', setup); expected = await runOn(e, solution)
      await freshCatalog(e, 'usr_db', setup); actual = await runOn(e, userSql)
    } finally { await dropCatalog(e, 'ref_db'); await dropCatalog(e, 'usr_db') }
    if (expected.error) return { passed: false, error: 'Reference solution failed: ' + expected.error }
    if (actual.error) return { passed: false, error: actual.error, expected }
    let exp = norm(expected.rows ?? []), act = norm(actual.rows ?? [])
    if (!ordered) { exp = sortRows(exp); act = sortRows(act) }
    const expCols = expected.columns ?? [], actCols = actual.columns ?? []
    const colsMatch = expCols.length === actCols.length
    const passed = colsMatch && JSON.stringify(exp) === JSON.stringify(act)
    let feedback = 'Correct - result matches the expected output.'
    if (!passed) {
      if (!colsMatch) feedback = `Expected ${expCols.length} columns (${expCols.join(', ')}) but got ${actCols.length}.`
      else if (exp.length !== act.length) feedback = `Expected ${exp.length} rows but got ${act.length}.`
      else feedback = 'Row count matches but some values differ' + (ordered ? ' (order matters for this exercise).' : '.')
    }
    return { passed, feedback, expected, actual }
  })
}
