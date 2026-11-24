// Real-browser end-to-end test of the static build (no backend). Usage: node e2e/static-e2e.mjs <baseUrl>
// Requires Google Chrome; drives the app through the same code path a visitor uses.
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/Data-Engineering-Lab/'
const DATA = new URL('../public/static-data/', import.meta.url)
const sqlSolutions = JSON.parse(readFileSync(new URL('sql-solutions.json', DATA), 'utf8'))
const pySolutions = JSON.parse(readFileSync(new URL('py-solutions.json', DATA), 'utf8'))
const pyList = JSON.parse(readFileSync(new URL('py-exercises.json', DATA), 'utf8'))

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++ }

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'], acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('requestfailed', (r) => { if (!/favicon/.test(r.url())) errors.push('requestfailed ' + r.url()) })
page.on('response', (r) => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push(`HTTP ${r.status()} ${r.url()}`) })

// ---------------------------------------------------------------- shell, theme, navigation
await page.goto(BASE)
await page.getByLabel('Your name').fill('Test Learner'); await page.getByRole('button', { name: 'Get started' }).click()
await page.getByRole('navigation', { name: 'Main navigation' }).waitFor()
await page.getByText('Welcome back, Test Learner').first().waitFor({ timeout: 15000 })
ok(true, 'first launch asks for a name and greets the user by it')
ok(await page.evaluate(() => document.documentElement.classList.contains('dark')), 'dark theme is the default')
const navLabels = ['Dashboard', 'Learning Path', 'SQL Playground', 'Python Playground', 'Hands-on Projects', 'Exercises', 'Mock Interviews', 'Scenario Practice', 'Assessments', 'Progress & Analytics', 'Settings']
for (const l of navLabels) ok(await page.getByRole('navigation', { name: 'Main navigation' }).getByText(l, { exact: true }).count() === 1, `sidebar item: ${l}`)

await page.getByRole('button', { name: /switch to (light|dark) mode/i }).first().click()
ok(await page.evaluate(() => !document.documentElement.classList.contains('dark')), 'toggle switches to light')
ok(await page.evaluate(() => localStorage.getItem('delab.theme')) === 'light', 'light theme saved to localStorage')
await page.reload(); await page.getByRole('navigation', { name: 'Main navigation' }).waitFor()
ok(await page.evaluate(() => !document.documentElement.classList.contains('dark')), 'light theme persists after reload')
await page.getByRole('button', { name: /switch to (light|dark) mode/i }).first().click()

for (const [label, expect] of [['Learning Path', /Learning Path/i], ['Hands-on Projects', /Project/i], ['Exercises', /Exercise/i], ['Mock Interviews', /Interview/i], ['Scenario Practice', /Scenario/i], ['Assessments', /Assessment/i], ['Progress & Analytics', /Progress|Analytics/i], ['Settings', /Settings/i]]) {
  await page.getByRole('navigation', { name: 'Main navigation' }).getByText(label, { exact: true }).click()
  await page.waitForTimeout(1500)
  const txt = await page.locator('main').innerText()
  ok(expect.test(txt) && !/could not|unavailable/i.test(txt), `page renders: ${label}`)
}

// ---------------------------------------------------------------- lesson + persistence
await page.goto(BASE + '#/learn'); await page.waitForTimeout(800)
await page.locator('main a[href*="#/learn/"]').first().click(); await page.waitForTimeout(800)
ok((await page.locator('main').innerText()).length > 1500, 'a lesson loads from static JSON')
await page.getByRole('button', { name: /mark (as )?complete/i }).first().click()
await page.waitForTimeout(700)
const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('delab.state') ?? '{}'))
ok(Object.keys(saved.completed ?? {}).length === 1, 'completing a lesson is saved in localStorage')
await page.reload(); await page.waitForTimeout(800)
ok(Object.keys((await page.evaluate(() => JSON.parse(localStorage.getItem('delab.state') ?? '{}'))).completed ?? {}).length === 1, 'progress survives reload')

// ---------------------------------------------------------------- SQL lab through the real UI
await page.goto(BASE + '#/sql'); await page.getByText('SQL Playground').first().waitFor()
await page.waitForSelector('.monaco-editor', { timeout: 60000 })
// Monaco is bundled (not on window), so type via keyboard instead
async function typeInEditor(code) {
  // Paste instead of typing: Monaco auto-closes brackets and auto-indents typed text, which would alter the code.
  await page.evaluate((c) => navigator.clipboard.writeText(c), code)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace')
  await page.keyboard.press('Meta+V')
}
await typeInEditor('SELECT name, signup_date, country FROM customers ORDER BY customer_id LIMIT 3')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click()
await page.getByText('Alice Johnson').first().waitFor({ timeout: 90000 })
ok(await page.getByText('2023-01-15').first().isVisible(), 'SQL runs in DuckDB-WASM; dates render as ISO strings')
await typeInEditor('SELEC broken')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click()
await page.waitForTimeout(1200)
ok(/syntax error|parser/i.test(await page.locator('main').innerText()), 'SQL errors are shown clearly')
await typeInEditor('CREATE TABLE my_scratch(a INT); INSERT INTO my_scratch VALUES (1),(2),(3);')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click(); await page.waitForTimeout(1200)
await typeInEditor('SELECT count(*) AS n FROM my_scratch')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click(); await page.waitForTimeout(1200)
ok(await page.getByText('3', { exact: true }).first().isVisible(), 'user can create tables and insert data')
await page.getByRole('button', { name: /reset database/i }).first().click(); await page.waitForTimeout(1500)
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click(); await page.waitForTimeout(1200)
ok(/does not exist|not found|catalog error/i.test(await page.locator('main').innerText()), 'reset restores the original sample database')

// ---------------------------------------------------------------- every SQL exercise, validated by the real engine
// Use the UI path for validation: open each exercise via ?ex= and press Submit.
let sqlPass = 0
const sqlIds = Object.keys(sqlSolutions)
for (const id of sqlIds) {
  await page.goto(`${BASE}#/sql?ex=${id}`)
  await page.waitForSelector('.monaco-editor', { timeout: 60000 })
  await page.waitForTimeout(250)
  await typeInEditor(sqlSolutions[id].solution)
  await page.getByRole('button', { name: /submit answer/i }).first().click()
  try { await page.getByText(/Correct - result matches/i).first().waitFor({ timeout: 20000 }); sqlPass++ }
  catch { console.log('   SQL exercise failed in browser:', id, (await page.locator('main').innerText()).slice(-300).replace(/\n/g, ' ')) }
}
ok(sqlPass === sqlIds.length, `all SQL exercise solutions validate in DuckDB-WASM (${sqlPass}/${sqlIds.length})`)

// wrong answer must be rejected
await page.goto(`${BASE}#/sql?ex=${sqlIds[0]}`); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(250)
await typeInEditor('SELECT 1 AS nothing')
await page.getByRole('button', { name: /submit answer/i }).first().click(); await page.waitForTimeout(2500)
ok(!/Correct - result matches/i.test(await page.locator('main').innerText()), 'a wrong SQL answer is rejected')
// solution is hidden until requested
ok(!(await page.locator('main').innerText()).includes(sqlSolutions[sqlIds[0]].solution.trim().slice(0, 40)), 'SQL solution is hidden until requested')

// ---------------------------------------------------------------- Python lab (Pyodide) through the real UI
await page.goto(BASE + '#/python'); await page.waitForSelector('.monaco-editor', { timeout: 60000 })
await typeInEditor('import pandas as pd\nprint(pd.DataFrame({"a":[1,2,3]}).sum().iloc[0])\nprint(open("sales.csv").read().splitlines()[0])')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click()
await page.getByText('order_id,customer,product').first().waitFor({ timeout: 180000 })
ok(true, 'Python runs in Pyodide with pandas and the preloaded data files')
await typeInEditor('x = 1 / 0')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click(); await page.waitForTimeout(2500)
ok(/ZeroDivisionError/.test(await page.locator('main').innerText()), 'Python tracebacks are displayed')
await typeInEditor('import time\nwhile True:\n    pass')
const t0 = Date.now()
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click()
await page.getByText(/exceeded the time limit|timed out/i).first().waitFor({ timeout: 60000 })
ok(Date.now() - t0 < 45000, `infinite loop is stopped by the timeout (${Math.round((Date.now() - t0) / 1000)}s)`)
await typeInEditor('print("worker recovered")')
await page.getByRole('button', { name: /^Run(\s|$)/ }).first().click()
await page.getByText('worker recovered').first().waitFor({ timeout: 120000 })
ok(true, 'engine recovers after a timeout')

let pyPass = 0
const pyIds = pyList.map((e) => e.id)
for (const id of pyIds) {
  await page.goto(`${BASE}#/python?ex=${id}`)
  await page.waitForSelector('.monaco-editor', { timeout: 60000 }); await page.waitForTimeout(250)
  await typeInEditor(pySolutions[id].solution)
  await page.getByRole('button', { name: /submit (answer|&amp; check|& check)/i }).first().click()
  try { await page.getByText(/All checks passed/i).first().waitFor({ timeout: 90000 }); pyPass++ }
  catch { console.log('   Python exercise failed in browser:', id, (await page.locator('main').innerText()).slice(-300).replace(/\n/g, ' ')) }
}
ok(pyPass === pyIds.length, `all Python exercise solutions pass in Pyodide (${pyPass}/${pyIds.length})`)

// ---------------------------------------------------------------- settings: export / backup / reset
await page.goto(BASE + '#/settings'); await page.waitForTimeout(800)
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /export progress/i }).click()])
const exported = JSON.parse(readFileSync(await dl.path(), 'utf8'))
ok(exported && typeof exported === 'object', 'progress export downloads a JSON file')
await page.getByRole('button', { name: /create backup/i }).click(); await page.waitForTimeout(600)
ok(/backup-\d{8}-\d{6}\.json/.test(await page.locator('main').innerText()), 'browser backup is created and listed')

// ---------------------------------------------------------------- mobile layout
await page.setViewportSize({ width: 390, height: 800 }); await page.goto(BASE); await page.waitForTimeout(800)
ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), 'no horizontal overflow at 390px (mobile)')
ok(await page.getByRole('button', { name: /open menu/i }).isVisible(), 'mobile shows the menu button')

ok(errors.length === 0, `no page errors or failed requests${errors.length ? ': ' + errors.slice(0, 5).join(' | ') : ''}`)
await browser.close()
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll browser checks passed')
process.exit(failures ? 1 : 0)
