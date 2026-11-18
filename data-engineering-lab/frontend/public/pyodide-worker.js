// Pyodide worker for the Python lab (static build). Loaded as a module worker from /public.
// Learner code runs here, inside the browser sandbox: no access to the page, cookies or storage,
// and the host page can terminate this worker at any time (used to enforce the timeout).
const PYODIDE_VERSION = '314.0.8'
const BASE = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

let pyodidePromise = null

function post(msg) { self.postMessage(msg) }

async function getPyodide() {
  if (!pyodidePromise) {
    post({ type: 'status', state: 'loading', detail: 'Downloading the Python runtime (first use only)' })
    pyodidePromise = (async () => {
      const { loadPyodide } = await import(BASE + 'pyodide.mjs')
      const py = await loadPyodide({ indexURL: BASE })
      await py.runPythonAsync(HARNESS)
      return py
    })().catch((e) => { pyodidePromise = null; throw e })
  }
  return pyodidePromise
}

// Mirrors backend/app/sandbox_runner.py: run the learner's code, then the exercise tests in the same namespace.
const HARNESS = `
import contextlib, io, json, os, shutil, sys, tempfile, traceback

def run_job(job_json):
    job = json.loads(job_json)
    out, err = io.StringIO(), io.StringIO()
    status = {"ran": False, "passed": None, "message": ""}
    workdir = tempfile.mkdtemp(prefix="delab_")
    prev = os.getcwd()
    try:
        os.chdir(workdir)
        for name, text in job["files"].items():
            with open(name, "w", encoding="utf-8", newline="") as f:
                f.write(text)
        ns = {"__name__": "__main__"}
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            try:
                exec(compile(job["code"], "<your code>", "exec"), ns)
                status["ran"] = True
            except SystemExit:
                status["ran"] = True
            except BaseException:
                et, ev, etb = sys.exc_info()
                etb = etb.tb_next if etb is not None else None
                lines = traceback.format_exception(et, ev, etb)
                err.write("Traceback (most recent call last):\\n" + "".join(lines[1:] if etb else traceback.format_exception_only(et, ev)))
                status["message"] = "Your code raised an exception before tests could run."
                status["passed"] = False
            if status["ran"] and job.get("tests"):
                try:
                    exec(compile(job["tests"], "<tests>", "exec"), ns)
                    status["passed"] = True
                    status["message"] = "All checks passed."
                except AssertionError as exc:
                    status["passed"] = False
                    status["message"] = "Check failed: " + (str(exc) or "assertion did not hold")
                except BaseException as exc:
                    status["passed"] = False
                    status["message"] = f"Check could not run ({type(exc).__name__}: {exc}). Did you define the required names?"
    finally:
        os.chdir(prev)
        shutil.rmtree(workdir, ignore_errors=True)
    return json.dumps({"stdout": out.getvalue(), "stderr": err.getvalue(), "status": status})
`

self.onmessage = async (ev) => {
  const { id, kind } = ev.data
  try {
    const py = await getPyodide()
    if (kind === 'warmup') { post({ type: 'status', state: 'ready' }); post({ type: 'done', id, result: {} }); return }
    const { code, tests, files } = ev.data
    // Download only the packages the code actually imports (pandas, numpy, sqlite3 ...).
    const needed = [code, tests ?? ''].join('\n')
    if (/\b(pandas|numpy|sqlite3|dateutil|pytz)\b/.test(needed)) post({ type: 'status', state: 'loading', detail: 'Loading data libraries (pandas / numpy)' })
    await py.loadPackagesFromImports(needed)
    post({ type: 'status', state: 'ready', id })
    const run = py.globals.get('run_job')
    const raw = run(JSON.stringify({ code, tests: tests ?? null, files }))
    run.destroy()
    post({ type: 'done', id, result: JSON.parse(raw) })
  } catch (e) {
    post({ type: 'status', state: 'error' })
    post({ type: 'failed', id, error: String(e && e.message ? e.message : e) })
  }
}
