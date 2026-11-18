#!/usr/bin/env bash
# Data Engineering Lab launcher. Usage: ./run.sh [setup|start|dev|test|static]
# Everything binds to 127.0.0.1 only.
set -euo pipefail
cd "$(dirname "$0")"
PORT="${DE_LAB_PORT:-8765}"

setup() {
  [ -d backend/.venv ] || python3 -m venv backend/.venv
  backend/.venv/bin/python -m pip install --quiet --upgrade pip
  backend/.venv/bin/python -m pip install --quiet -r backend/requirements.txt
  (cd frontend && npm install --no-audit --no-fund)
}
build() { (cd frontend && npm run build); }

case "${1:-start}" in
  setup) setup ;;
  start)
    [ -d backend/.venv ] && [ -d frontend/node_modules ] || setup
    [ -d frontend/dist ] || build
    echo "Data Engineering Lab: http://127.0.0.1:${PORT}"
    exec backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$PORT"
    ;;
  dev)
    [ -d backend/.venv ] && [ -d frontend/node_modules ] || setup
    backend/.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port "$PORT" --reload &
    API=$!
    trap 'kill $API 2>/dev/null' EXIT
    echo "Frontend (hot reload): http://127.0.0.1:5173"
    (cd frontend && npm run dev)
    ;;
  test)
    (cd backend && .venv/bin/python -m pytest -q)
    (cd frontend && npm run typecheck && npm run lint && npm test)
    ;;
  static)
    # Browser-only build for free static hosting (GitHub Pages, Cloudflare Pages, Netlify). Output: frontend/dist-static
    [ -d backend/.venv ] && [ -d frontend/node_modules ] || setup
    backend/.venv/bin/python scripts/export_static.py >/dev/null
    (cd frontend && npm run build:static)
    echo "Static site ready in frontend/dist-static (preview: cd frontend && npm run preview:static, then open http://127.0.0.1:4173/Data-Engineering-Lab/)"
    ;;
  *) echo "Usage: $0 [setup|start|dev|test|static]"; exit 1 ;;
esac
