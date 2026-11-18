/**
 * Browser Python engine: runs learner code in a Pyodide Web Worker (see public/pyodide-worker.js).
 * The worker is terminated and recreated on timeout, so infinite loops can never freeze the page.
 */
import type { PyResult } from '../lib/api'
import { setEngineStatus } from './status'

const TIMEOUT_MS = 20_000
const FIRST_LOAD_GRACE_MS = 120_000 // runtime + pandas download on a slow connection
const MAX_OUT = 20_000
const MAX_CODE = 50_000

interface Job { onReady?: () => void; resolve: (r: { stdout: string; stderr: string; status: { passed: boolean | null; message: string } }) => void; reject: (e: Error) => void }

let worker: Worker | null = null
let warmed = false
let nextId = 1
const jobs = new Map<number, Job>()
let files: Promise<Record<string, string>> | null = null
let queue: Promise<unknown> = Promise.resolve()

const asset = (name: string) => `${import.meta.env.BASE_URL}${name}`

function getFiles() {
  if (!files) files = fetch(asset('static-data/py-files.json')).then((r) => { if (!r.ok) throw new Error('data files unavailable'); return r.json() as Promise<Record<string, string>> }).catch((e) => { files = null; throw e })
  return files
}

function spawn(): Worker {
  const w = new Worker(asset('pyodide-worker.js'), { type: 'module' })
  w.onmessage = (ev: MessageEvent) => {
    const m = ev.data
    if (m.type === 'status') { setEngineStatus('python', m.state, m.detail); if (m.state === 'ready') jobs.get(m.id)?.onReady?.() }
    else if (m.type === 'done') { jobs.get(m.id)?.resolve(m.result); jobs.delete(m.id) }
    else if (m.type === 'failed') { jobs.get(m.id)?.reject(new Error(m.error)); jobs.delete(m.id) }
  }
  w.onerror = () => { for (const [id, j] of jobs) { j.reject(new Error('The Python engine failed to start. Check your connection and try again.')); jobs.delete(id) }; worker = null; warmed = false; setEngineStatus('python', 'error') }
  return w
}

function kill() { worker?.terminate(); worker = null; warmed = false }

/** `loadMs` covers downloading the runtime/packages; `runMs` starts once the worker reports it is ready to execute. */
function call(payload: Record<string, unknown>, loadMs: number, runMs?: number): Promise<{ stdout: string; stderr: string; status: { passed: boolean | null; message: string } }> {
  worker ??= spawn()
  const id = nextId++
  return new Promise((resolve, reject) => {
    let timer = 0
    const arm = (ms: number) => { window.clearTimeout(timer); timer = window.setTimeout(() => { jobs.delete(id); kill(); setEngineStatus('python', 'idle'); reject(new Error('timeout')) }, ms) }
    arm(loadMs)
    jobs.set(id, {
      onReady: runMs ? () => arm(runMs) : undefined,
      resolve: (r) => { window.clearTimeout(timer); resolve(r) },
      reject: (e) => { window.clearTimeout(timer); reject(e) },
    })
    worker!.postMessage({ id, ...payload })
  })
}

const trim = (t: string) => (t.length > MAX_OUT ? t.slice(0, MAX_OUT) + `\n... output truncated (${t.length} chars total)` : t)

async function exec(code: string, tests: string | null): Promise<PyResult> {
  if (!code || !code.trim()) return { error: 'Code is empty.' }
  if (code.length > MAX_CODE) return { error: 'Code too long (max 50,000 characters).' }
  const data = await getFiles()
  try {
    // Runtime download gets a long budget; the 20 s limit applies only to the learner's code (timer starts when the worker is ready).
    if (!warmed) { await call({ kind: 'warmup' }, FIRST_LOAD_GRACE_MS); warmed = true }
    const r = await call({ kind: 'run', code, tests, files: data }, FIRST_LOAD_GRACE_MS, TIMEOUT_MS)
    const res: PyResult = { stdout: trim(r.stdout), stderr: trim(r.stderr), timed_out: false }
    if (tests !== null) { res.passed = !!r.status.passed; res.feedback = r.status.message || 'Tests did not run.' }
    return res
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === 'timeout') {
      const res: PyResult = { stdout: '', stderr: `TimeoutError: execution exceeded the time limit and was stopped.`, timed_out: true }
      if (tests !== null) { res.passed = false; res.feedback = 'Execution timed out.' }
      return res
    }
    return { error: msg.includes('failed to start') ? msg : 'The Python engine could not run this code. Check your connection and try again.' }
  }
}

/** Serialise runs: one worker, one job at a time. */
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn)
  queue = next.catch(() => undefined)
  return next
}

export const runPython = (code: string) => serial(() => exec(code, null))
export const validatePython = (code: string, tests: string) => serial(() => exec(code, tests))
export function warmPython(): void { void serial(async () => { try { worker ??= spawn(); await call({ kind: 'warmup' }, FIRST_LOAD_GRACE_MS); warmed = true } catch { /* surfaced on first run */ } }) }
