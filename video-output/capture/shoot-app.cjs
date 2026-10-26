// Screenshots of the real front/ app replaying LeaseVault v5 lease #0 (see replay-app/).
// Run: node capture/shoot-app.cjs   (replay server on :5195, from capture/replay-app/vite.config.ts)
const { chromium } = require('playwright')
const { createHash } = require('node:crypto')
const path = require('node:path')
const replay = require('./replay-lease0.json')

const OUT = path.join(__dirname, '..', 'assets', 'screens')
const BASE = 'http://127.0.0.1:5195'
const VAULT = 'CB3RTZPIIKNJFNR6S5DUY37RUPBTEWFLFCHO5Y7YORPSAC5EDFYWH3JO'
const HOME = 'Rua de Arroios 74, 2.º Esq.' // the app's default label in New lease
const seedHex = (r) => createHash('sha256').update(`fiavel-film-${r}`).digest('hex')
const stepTime = (label) => replay.steps.find((s) => s.label === label).time

async function shot(browser, name, { step, role, route, offset = 10, act, fullPage = false, width = 1920, height = 1080 }) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('ERR', name, e.message))
  await page.clock.setFixedTime(new Date((stepTime(step) + offset) * 1000))
  await page.addInitScript(
    ({ vault, role, seeds, home }) => {
      sessionStorage.setItem('fiavel.session', JSON.stringify({ kind: 'guest', user: 'guest', expiresAt: Date.now() + 36e5 }))
      localStorage.setItem(`fiavel.${vault}.role`, JSON.stringify(role))
      localStorage.setItem(`fiavel.${vault}.meta`, JSON.stringify({ 0: { home } }))
      localStorage.setItem(`fiavel.${vault}.watched`, JSON.stringify(['0']))
      for (const [r, hex] of Object.entries(seeds)) localStorage.setItem(`fiavel.wallet.${vault}.${r}`, `SEED:${hex}`)
    },
    { vault: VAULT, role, seeds: Object.fromEntries(['tenant', 'landlord', 'arbiter'].map((r) => [r, seedHex(r)])), home: HOME },
  )
  await page.goto(`${BASE}${route}${route.includes('?') ? '&' : '?'}step=${step}`)
  await page.waitForTimeout(2500)
  // The network pill would show a ledger number: the replay has none.
  await page.addStyleTag({ content: '[data-film-hide]{visibility:hidden!important}' })
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('span,div,p,button')) {
      const t = el.textContent ?? ''
      if (/ledger \d|Connecting to Testnet|Testnet unreachable/.test(t) && t.length < 60) el.setAttribute('data-film-hide', '')
    }
  })
  const hide = page.getByRole('button', { name: 'Hide this note' })
  if (await hide.count()) await hide.first().click()
  if (act) await act(page)
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage })
  console.log('shot', name)
  await ctx.close()
}

module.exports = { shot, stepTime }

if (require.main === module) {
  ;(async () => {
    const browser = await chromium.launch()
    const only = process.argv[2]
    const shots = require('./shots.cjs')
    for (const [name, opts] of Object.entries(shots)) if (!only || name.startsWith(only)) await shot(browser, name, opts)
    await browser.close()
  })()
}
