// Captures screenshots of key pages in both themes + mobile into e2e/shots/ (git-ignored).
import { chromium } from 'playwright-core'
const BASE = process.argv[2] ?? 'http://127.0.0.1:4173/Data-Engineering-Lab/'
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const shots = [['dashboard', ''], ['learn', '#/learn'], ['interviews', '#/interviews'], ['progress', '#/progress']]
for (const theme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await ctx.addInitScript((t) => localStorage.setItem('delab.theme', t), theme)
  const page = await ctx.newPage()
  for (const [name, hash] of shots) {
    await page.goto(BASE + hash); await page.waitForTimeout(1500)
    await page.screenshot({ path: `e2e/shots/${name}-${theme}.png` })
  }
  await ctx.close()
}
const m = await browser.newContext({ viewport: { width: 390, height: 800 } })
const mp = await m.newPage(); await mp.goto(BASE); await mp.waitForTimeout(1500)
await mp.screenshot({ path: 'e2e/shots/mobile-dashboard.png' })
await browser.close()
