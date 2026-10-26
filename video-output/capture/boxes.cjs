// Measures where the film's subjects sit in each screenshot (CSS px, page coordinates).
const { chromium } = require('playwright')
const fs = require('node:fs')
const path = require('node:path')
const { shot } = require('./shoot-app.cjs')
const shots = require('./shots.cjs')
const WANT = {
  'overview-tenant': ['Your guarantee is protected', 'Next rent', 'Recent activity', 'What you can do', 'Tenant Guardian'],
  'lease-landlord': ['Deadlines', 'Terms on-chain', 'Invest the guarantee', 'Parties & reputation', 'Months', 'History', 'On Stellar', 'Guarantee held for you'],
  'lease-tenant': ['Deadlines', 'Months', 'History', 'Guarantee held for you'],
  'lease-disputed-tenant': ['Damage claim', 'Guarantee held for you', 'What you can do'],
  'activity-settled': ['Everything that happened', 'Settled · lease #0', 'Guarantee funded · lease #0'],
  'join-terms': ['What you agree to', 'Yield option', 'Lock 310.00 USDC and accept the Blend yield option', 'The landlord offered the yield option', 'Tenant Guardian explains'],
  'assistant-q1': ['When is my next rent due?', 'Lease active: 2 of 3 months settled.', 'Review & sign'],
  'assistant-q2': ['When do I get my deposit back?', 'After 3 months, either party ends the lease'],
  'assistant-q3': ['What happens if a claim is raised?', 'A damage claim states an amount'],
  'assistant-landlord-unpaid': ['Seize the whole guarantee now', 'The guarantee cannot be claimed during the lease'],
  'rate-dialog': ['Rate your landlord (1 to 5)'],
  'fund-yield-dialog': ['Pay with supported crypto', 'Total escrow funding'],
}
;(async () => {
  const b = await chromium.launch()
  const out = {}
  for (const [name, texts] of Object.entries(WANT)) {
    const opts = { ...shots[name] }
    const act0 = opts.act
    opts.act = async (page) => {
      if (act0) await act0(page)
      out[name] = await page.evaluate((texts) => {
        const r = {}
        for (const t of texts) {
          const el = [...document.querySelectorAll('h1,h2,h3,p,span,button,label,div,li')].find((e) => e.textContent.trim().startsWith(t) && e.children.length <= 3)
          if (!el) { r[t] = null; continue }
          const own = el.getBoundingClientRect()
          const card = el.closest('section,[role=dialog],dialog,li') || el
          const c = card.getBoundingClientRect()
          const sy = window.scrollY
          r[t] = { el: [own.x, own.y + sy, own.width, own.height].map(Math.round), card: [c.x, c.y + sy, c.width, c.height].map(Math.round) }
        }
        return r
      }, texts)
    }
    await shot(b, `_box-${name}`, opts)
    fs.rmSync(path.join(__dirname, '..', 'assets', 'screens', `_box-${name}.png`))
  }
  fs.writeFileSync(path.join(__dirname, 'boxes.json'), JSON.stringify(out, null, 1))
  await b.close()
})()
