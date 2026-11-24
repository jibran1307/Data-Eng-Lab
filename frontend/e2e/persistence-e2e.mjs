// Real-browser test for: name prompt, editor drafts surviving navigation, saved submissions, resumable tests,
// and upgrading an old save without losing progress. Usage: node e2e/persistence-e2e.mjs <baseUrl>
import { chromium } from 'playwright-core'
import { readFileSync } from 'node:fs'

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/Data-Engineering-Lab/'
const DATA = new URL('../public/static-data/', import.meta.url)
const sqlSolutions = JSON.parse(readFileSync(new URL('sql-solutions.json', DATA), 'utf8'))
const pySolutions = JSON.parse(readFileSync(new URL('py-solutions.json', DATA), 'utf8'))
const sqlId = Object.keys(sqlSolutions)[0], pyId = Object.keys(pySolutions)[0]

let failures = 0
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++ }
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['clipboard-read', 'clipboard-write'] })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

async function typeInEditor(code) {
  await page.evaluate((c) => navigator.clipboard.writeText(c), code)
  await page.locator('.monaco-editor').first().click()
  await page.keyboard.press('Meta+A'); await page.keyboard.press('Backspace'); await page.keyboard.press('Meta+V')
  await page.waitForTimeout(500)
}
const editorText = () => page.evaluate(() => [...document.querySelectorAll('.monaco-editor .view-line')].map((l) => l.textContent).join('\n').replace(/\u00a0/g, ' '))
const nav = (label) => page.getByRole('navigation', { name: 'Main navigation' }).getByText(label, { exact: true }).click()
const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('delab.state') ?? '{}'))

// ---------------------------------------------------------------- upgrade: an OLD save (no profile/drafts/submissions)
await page.goto(BASE)
await page.evaluate(() => localStorage.setItem('delab.state', JSON.stringify({
  v: 1, completed: { 'sql-basics': 1700000000000 }, bookmarks: [], notes: { 'sql-basics': 'old note' }, quiz: {},
  exercises: { 'sql-01': { solved: true, attempts: 2, correct: 1, ts: 1 } }, projects: {}, scenarios: {}, assessments: [{ id: 'as-old', ts: 1, kind: 'quiz', level: 'all', durationSec: 5, timed: false, items: [], score: 80 }],
  assessmentSeen: {}, lastAssessmentQs: [], interviews: [], askedQs: {}, mixSignatures: [], customQuestions: [], activity: [], studyMinutes: { '2025-01-01': 42 }, revisions: {},
  settings: { dailyTargetMin: 90, weeklyGoalLessons: 5, revisionIntervals: [1, 3, 7, 16, 35], interviewHistoryWindow: 1 }, startedAt: 111,
})))
await page.reload()
await page.getByLabel('Your name').waitFor()
ok(true, 'an upgraded user with no name is asked for one')
const before = await state()
ok(before.completed?.['sql-basics'] === 1700000000000 && before.exercises?.['sql-01']?.solved === true && before.assessments?.length === 1 && before.studyMinutes?.['2025-01-01'] === 42, 'old progress is still present on first load after the update')
await page.getByLabel('Your name').fill('Jibran'); await page.getByRole('button', { name: 'Get started' }).click()
await page.getByText('Welcome back, Jibran').first().waitFor()
await page.waitForTimeout(700)
const after = await state()
ok(after.profile?.name === 'Jibran' && after.completed?.['sql-basics'] === 1700000000000 && after.notes?.['sql-basics'] === 'old note' && after.exercises?.['sql-01']?.attempts === 2 && after.startedAt === 111, 'name saved and every old field is untouched')
await page.reload(); await page.getByText('Welcome back, Jibran').first().waitFor()
ok((await page.getByLabel('Your name').count()) === 0, 'name is remembered after reload (no second prompt)')

// ---------------------------------------------------------------- SQL: free playground draft survives navigation + reload
await page.goto(BASE + '#/sql'); await page.waitForSelector('.monaco-editor', { timeout: 60000 })
await typeInEditor('SELECT 12345 AS my_scratch_value')
await nav('Learning Path'); await page.waitForTimeout(600)
await nav('SQL Playground'); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(800)
ok((await editorText()).includes('12345'), 'SQL playground code is still there after visiting another page')
await page.reload(); await page.waitForSelector('.monaco-editor', { timeout: 60000 }); await page.waitForTimeout(1000)
ok((await editorText()).includes('12345'), 'SQL playground code survives a full reload')

// ---------------------------------------------------------------- SQL exercise: submitted code is shown again later
await page.goto(`${BASE}#/sql?ex=${sqlId}`); await page.waitForSelector('.monaco-editor', { timeout: 60000 }); await page.waitForTimeout(300)
await typeInEditor(sqlSolutions[sqlId].solution)
await page.getByRole('button', { name: /submit answer/i }).first().click()
await page.getByText(/Correct - result matches/i).first().waitFor({ timeout: 90000 })
await nav('Exercises'); await page.waitForTimeout(500)
await page.goto(`${BASE}#/sql?ex=${sqlId}`); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(800)
const key = sqlSolutions[sqlId].solution.trim().split('\n')[0].slice(0, 25)
ok((await editorText()).includes(key), 'a submitted SQL exercise reopens with the submitted code in the editor')
ok((await page.getByText('Saved code').count()) > 0 && (await page.locator('main').innerText()).includes('Last submission'), 'the submitted code is listed under "Saved code"')
ok((await state()).submissions?.[sqlId]?.passed === true, 'the submission is stored in the progress data')
// editing must not destroy the saved submission
await typeInEditor('SELECT 1 -- work in progress'); await nav('Settings'); await page.waitForTimeout(400)
await page.goto(`${BASE}#/sql?ex=${sqlId}`); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(800)
ok((await editorText()).includes('work in progress') && (await page.locator('main').innerText()).includes(key), 'unsaved edits are kept and the last submission stays available')
await page.getByRole('button', { name: 'Load into editor' }).first().click(); await page.waitForTimeout(500)
ok((await editorText()).includes(key), '"Load into editor" restores the submitted code')

// ---------------------------------------------------------------- Python: same behaviour
await page.goto(`${BASE}#/python?ex=${pyId}`); await page.waitForSelector('.monaco-editor', { timeout: 60000 }); await page.waitForTimeout(300)
await typeInEditor(pySolutions[pyId].solution)
await page.getByRole('button', { name: /submit (answer|&amp; check|& check)/i }).first().click()
await page.getByText(/All checks passed/i).first().waitFor({ timeout: 180000 })
await nav('Dashboard'); await page.waitForTimeout(400)
await page.goto(`${BASE}#/python?ex=${pyId}`); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(800)
const pyKey = pySolutions[pyId].solution.trim().split('\n').find((l) => l.trim().length > 6).trim().slice(0, 20)
ok((await editorText()).includes(pyKey), 'a submitted Python exercise reopens with the submitted code')
await page.goto(BASE + '#/python'); await page.waitForSelector('.monaco-editor'); await typeInEditor('print("python scratch 987")')
await nav('Settings'); await nav('Python Playground'); await page.waitForSelector('.monaco-editor'); await page.waitForTimeout(800)
ok((await editorText()).includes('python scratch 987'), 'Python playground code survives navigation')

// ---------------------------------------------------------------- Scenario answer
await page.goto(BASE + '#/scenarios'); await page.getByPlaceholder(/Describe your approach/).waitFor()
const ans = 'I would make the load idempotent using a MERGE on a business key and a watermark, validate row counts, and retry safely after partial failure with a checkpoint.'
await page.getByPlaceholder(/Describe your approach/).fill(ans); await page.getByRole('button', { name: /evaluate my answer/i }).click(); await page.waitForTimeout(500)
await nav('Settings'); await nav('Scenario Practice'); await page.getByPlaceholder(/Describe your approach/).waitFor()
ok((await page.getByPlaceholder(/Describe your approach/).inputValue()) === ans, 'a submitted scenario answer is still in the box when you come back')
ok((await page.locator('main').innerText()).includes('Last submitted answer'), 'the scenario answer is also listed as a saved answer')

// ---------------------------------------------------------------- Assessment resumes
await page.goto(BASE + '#/assessments'); await page.getByRole('button', { name: /^Start/ }).click()
await page.getByText(/Question 1 of/).waitFor()
await page.locator('button:has(span.w-4)').nth(1).click(); await page.getByRole('button', { name: 'Next', exact: true }).click(); await page.waitForTimeout(500)
await nav('Dashboard'); await nav('Assessments'); await page.waitForTimeout(500)
ok(await page.getByText(/Question 2 of/).isVisible(), 'a test in progress resumes on the same question after leaving the page')
await page.getByRole('button', { name: 'Previous', exact: true }).click()
ok(await page.locator('button.border-accent').count() === 1, 'the answer chosen before leaving is still selected')
await page.getByRole('button', { name: /submit now/i }).click(); await page.getByText(/of \d+ correct/).waitFor()
ok((await state()).activeAssessment === null, 'finishing a test clears the in-progress record')

// ---------------------------------------------------------------- Interview resumes
await page.goto(BASE + '#/interviews'); await page.getByRole('button', { name: /start interview/i }).click()
await page.getByText(/Question 1 of/).waitFor()
const ta = page.locator('textarea:not(.ime-text-area)')
if (await ta.count()) await ta.fill('my interview draft answer about idempotent merge')
else { await typeInEditor('SELECT 777 AS interview_draft') }
await page.waitForTimeout(700)
await nav('Dashboard'); await page.waitForTimeout(300); await nav('Mock Interviews'); await page.waitForTimeout(800)
ok(await page.getByText(/Question 1 of/).isVisible(), 'an interview in progress is still open after leaving the page')
const resumed = (await ta.count()) ? await ta.inputValue() : await editorText()
ok(/idempotent merge|777/.test(resumed), 'the interview answer typed before leaving is still there')
await page.getByRole('button', { name: /end now/i }).click(); await page.getByText(/out of 100/).waitFor()
ok((await state()).activeInterview === null, 'finishing an interview clears the in-progress record')

// ---------------------------------------------------------------- Settings: reset keeps name
await page.goto(BASE + '#/settings'); await page.getByRole('button', { name: /reset all progress/i }).click()
await page.getByRole('button', { name: /yes, reset everything/i }).click(); await page.waitForTimeout(800)
const reset = await state()
ok(Object.keys(reset.completed ?? {}).length === 0 && Object.keys(reset.drafts ?? {}).length === 0, 'reset clears progress and saved drafts')
await page.reload(); await page.getByRole('navigation', { name: 'Main navigation' }).waitFor()
ok((await page.getByLabel('Your name').count()) === 0, 'reset keeps your name (no second prompt)')

ok(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`)
await browser.close()
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll persistence checks passed')
process.exit(failures ? 1 : 0)
