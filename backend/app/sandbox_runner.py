"""Child-process runner for the Python lab. NOT imported by the server.

Protocol: argv[1] = path to a JSON job file {"code": str, "tests": str|None, "result": path}
User code runs first with stdout/stderr passing through. If `tests` is supplied it is
executed afterwards in the same namespace; the outcome is written to the result file.
"""
import json
import resource
import socket
import sys
import traceback

job = json.load(open(sys.argv[1], encoding="utf-8"))

# --- Resource limits (best effort; RLIMIT_AS is not enforced on macOS) ---
try:
    resource.setrlimit(resource.RLIMIT_CPU, (job.get("cpu", 8), job.get("cpu", 8)))
    resource.setrlimit(resource.RLIMIT_FSIZE, (20_000_000, 20_000_000))
    resource.setrlimit(resource.RLIMIT_NPROC, (64, 64)) if hasattr(resource, "RLIMIT_NPROC") else None
    if sys.platform.startswith("linux"):
        resource.setrlimit(resource.RLIMIT_AS, (1_500_000_000, 1_500_000_000))
except (ValueError, OSError):
    pass


# --- Disable networking: exercises must be offline and deterministic ---
def _blocked(*_a, **_k):
    raise PermissionError("Network access is disabled in the practice sandbox. Use the provided local files.")


socket.socket.connect = _blocked  # type: ignore[assignment]
socket.create_connection = _blocked  # type: ignore[assignment]
socket.getaddrinfo = _blocked  # type: ignore[assignment]

ns: dict = {"__name__": "__main__"}
status = {"ran": False, "passed": None, "message": ""}

try:
    exec(compile(job["code"], "<your code>", "exec"), ns)
    status["ran"] = True
except SystemExit:
    status["ran"] = True
except BaseException:  # noqa: BLE001 - we want every failure surfaced to the learner
    et, ev, etb = sys.exc_info()
    etb = etb.tb_next if etb is not None else None  # drop the runner's own exec() frame
    sys.stderr.write("Traceback (most recent call last):\n" + "".join(traceback.format_exception(et, ev, etb)[1:] if etb else traceback.format_exception_only(et, ev)))
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
    except BaseException as exc:  # noqa: BLE001
        status["passed"] = False
        status["message"] = f"Check could not run ({type(exc).__name__}: {exc}). Did you define the required names?"

json.dump(status, open(job["result"], "w", encoding="utf-8"))
sys.stdout.flush()
