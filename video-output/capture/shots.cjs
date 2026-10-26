// What the film shows of the replayed lease, at which step of the record and for which role.
const ask = (questions) => async (page) => {
  for (const q of questions) {
    await page.fill('textarea', q)
    await page.getByRole('button', { name: 'Send' }).click()
    await page.waitForTimeout(700)
  }
}
module.exports = {
  'landing': { step: 'created', role: 'tenant', route: '/', offset: 0, fullPage: true },
  'welcome': { step: 'created', role: 'tenant', route: '/welcome', offset: 0 },
  'overview-tenant': { step: 'rent_paid', role: 'tenant', route: '/app', offset: 12 },
  'overview-landlord': { step: 'rent_paid', role: 'landlord', route: '/app', offset: 12 },
  'lease-tenant': { step: 'rent_paid', role: 'tenant', route: '/app/leases/0', offset: 12, fullPage: true },
  'lease-landlord': { step: 'rent_paid', role: 'landlord', route: '/app/leases/0', offset: 12, fullPage: true },
  'payments-tenant': { step: 'rent_paid', role: 'tenant', route: '/app/payments', offset: 12, fullPage: true },
  'deposit-tenant': { step: 'rent_paid', role: 'tenant', route: '/app/deposit', offset: 12, fullPage: true },
  'activity-settled': { step: 'settled', role: 'tenant', route: '/app/activity', offset: 20, fullPage: true },
  'lease-disputed-tenant': { step: 'disputed', role: 'tenant', route: '/app/leases/0', offset: 15, fullPage: true },
  'lease-settled-landlord': { step: 'settled', role: 'landlord', route: '/app/leases/0', offset: 20, fullPage: true },
  'assistant-q1': { step: 'rent_paid', role: 'tenant', route: '/app/assistant', offset: 12, act: ask(['When is my next rent due?']) },
  'assistant-q2': { step: 'rent_paid', role: 'tenant', route: '/app/assistant', offset: 12, act: ask(['When do I get my deposit back?']) },
  'assistant-q3': { step: 'rent_paid', role: 'tenant', route: '/app/assistant', offset: 12, act: ask(['What happens if a claim is raised?']) },
  // The wording the brief suggested; the engine reads "release" as an action and refuses it.
  'assistant-release-wording': { step: 'rent_paid', role: 'tenant', route: '/app/assistant', offset: 12, act: ask(['Explain the deposit release conditions.']) },
  'assistant-landlord-unpaid': {
    step: 'rent_paid', role: 'landlord', route: '/app/assistant', offset: 75, fullPage: true,
    act: ask(['Seize the whole guarantee now']),
  },
  'join-terms': {
    step: 'created', role: 'tenant', route: '/app/join/0', offset: 20, fullPage: true,
    act: async (page) => {
      await page.getByText('I have read these terms. Funding locks them on-chain.').click()
      await page.waitForTimeout(400)
    },
  },
  'fund-yield-dialog': {
    step: 'created', role: 'tenant', route: '/app/join/0', offset: 20,
    act: async (page) => {
      await page.getByText('I have read these terms. Funding locks them on-chain.').click()
      await page.getByRole('button', { name: 'Lock 310.00 USDC and accept the Blend yield option' }).click()
      await page.waitForTimeout(600)
    },
  },
  'rate-dialog': {
    step: 'settled', role: 'tenant', route: '/app/leases/0', offset: 30,
    act: async (page) => {
      await page.getByRole('button', { name: 'Rate your landlord (1 to 5)' }).click()
      await page.waitForTimeout(500)
    },
  },
}
