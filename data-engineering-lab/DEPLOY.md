# Hosting Data Engineering Lab for free

The hosted version is a **static, browser-only build**. There is no server to attack and no shared database.

| Part | In the hosted build |
| --- | --- |
| Lessons, exercises, questions | Static JSON files generated from the Python content (`scripts/export_static.py`) |
| SQL Playground | DuckDB-WASM, running in the visitor's browser |
| Python Playground | Pyodide (Python + pandas + numpy) in a Web Worker, 20 second timeout |
| Progress, notes, history | The visitor's own browser (`localStorage`). Each visitor has a private copy |
| Export / import / backups | Work as before; backups are kept in the browser (latest 5) |

Why not host the FastAPI backend? It runs visitors' Python on your server and keeps one shared database. That is fine on your own laptop but unsafe on a public URL, and free hosts wipe local files on restart. The static build avoids all three problems.

Trade-offs to know about:

- The first SQL query downloads about 36 MB (DuckDB engine, compressed in transit by the CDN) and the first Python run about 10 MB (Pyodide), plus about 7 MB more the first time pandas and numpy are used. These come from the jsDelivr CDN and are cached by the browser afterwards. A visitor therefore needs internet at least once. The local version in this repo stays fully offline.
- Progress lives in one browser. Clearing site data erases it, so use **Settings, Export progress** to keep a copy or move between devices.
- AI evaluation is not available (it needs a server). Scoring is the same transparent rubric.

## Option A: GitHub Pages (workflow included)

1. Create a GitHub repository and push this project (`main` branch).
   ```bash
   cd data-engineering-lab
   git init -b main
   git add .
   git commit -m "Data Engineering Lab"
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```
2. In the repository open **Settings, Pages** and set **Source** to **GitHub Actions**.
3. The workflow `.github/workflows/deploy-pages.yml` exports the content, runs the tests, builds and publishes. After about 2 minutes your site is at `https://<you>.github.io/<repo>/`.

Share that URL. Every push to `main` redeploys.

## Option B: Cloudflare Pages or Netlify

Build locally, then upload the folder, or connect the repository.

```bash
./run.sh static          # writes frontend/dist-static
```

- **Netlify**: drag `frontend/dist-static` onto https://app.netlify.com/drop
- **Cloudflare Pages**: Workers & Pages, Create, Pages, Upload assets, choose `frontend/dist-static`

Or connect the Git repository with build command `pip install -r backend/requirements.txt && python scripts/export_static.py && cd frontend && npm ci && npm run build:static` and output directory `frontend/dist-static`.

`frontend/public/_headers` is copied into the build and gives these hosts a strict Content-Security-Policy (scripts only from the site and jsDelivr, no framing, no inline scripts). GitHub Pages ignores that file, which is fine.

## Test the static build locally first

```bash
./run.sh static
cd frontend
npm run preview:static                  # http://127.0.0.1:4173/Data-Engineering-Lab/  (sub-path, like GitHub Pages, with the CSP applied)
npm run e2e:static                      # real Chrome end-to-end run (see below)
```

`e2e:static` drives Google Chrome through the built site: navigation, theme persistence, lesson progress, every one of the 36 SQL and 25 Python exercise solutions, timeouts, export and backup, and mobile layout. It expects Chrome at `/Applications/Google Chrome.app` (edit the path at the top of `frontend/e2e/static-e2e.mjs` on other systems).

## After editing content

Lessons, exercises and questions are authored in `backend/app/content/`. Regenerate the static files with `python scripts/export_static.py` (or `./run.sh static`). A backend test fails if the exported files are out of date, and the GitHub workflow regenerates them on every deploy.
