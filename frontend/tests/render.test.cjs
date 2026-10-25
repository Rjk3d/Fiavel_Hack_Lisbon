const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
// Compile TSX for server rendering only; this is not browser interaction testing.
for (const extension of ['.ts', '.tsx']) require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText, filename)
const React = require('react')
const { renderToStaticMarkup } = require('react-dom/server')
const { MemoryRouter } = require('react-router-dom')
const { DemoContext } = require('../src/app/use-demo.ts')
const { AssistantConversation } = require('../src/components/assistant-conversation.tsx')
const { writeSession, clearSession } = require('../src/lib/ai/session.ts')
const { composeReply } = require('../src/lib/ai/reply.ts')
const { buildContext } = require('../src/lib/ai/context.ts')
const data = require('../src/lib/demo-data.ts')

function render(role = 'tenant', route = '/app/assistant') {
  const value = { role, setRole() {}, claims: [], paid: [], events: [], addClaim() {}, recordPayment() {} }
  return renderToStaticMarkup(React.createElement(MemoryRouter, { initialEntries: [route] }, React.createElement(DemoContext.Provider, { value }, React.createElement(AssistantConversation))))
}
test('tenant component renders accessible input, demo label and authorized lease only', () => {
  const html = render()
  assert.match(html, /Tenant Guardian/); assert.match(html, /Contextual demo/)
  assert.match(html, /htmlFor="question"|for="question"/); assert.match(html, /maxLength="2000"/)
  assert.match(html, /role="log"/); assert.match(html, /aria-live="polite"/)
  assert.match(html, /Arroios/); assert.ok(!html.includes('Alvalade')); assert.ok(!html.includes('Leo Martins'))
  assert.match(html, /no live model/); assert.match(html, /clears on reload/)
})
test('landlord component exposes both authorized leases and correct identity', () => {
  const html = render('landlord', '/app/assistant?id=lease-alvalade')
  assert.match(html, /Landlord Assistant/); assert.match(html, /Arroios/); assert.match(html, /Alvalade/)
  assert.match(html, /Hi Manuel/)
})
test('forbidden selected lease renders unavailable state and disabled send control', () => {
  const html = render('tenant', '/app/assistant?id=lease-alvalade')
  assert.match(html, /This lease is unavailable/); assert.match(html, /disabled="" aria-label="Send question"/)
  assert.ok(!html.includes('Leo Martins'))
})
test('prefilled user input is escaped and remains unsent', () => {
  const html = render('tenant', `/app/assistant?q=${encodeURIComponent('<script>alert(1)</script>')}`)
  assert.ok(!html.includes('<script>')); assert.match(html, /&lt;script&gt;/)
  assert.ok(!html.includes('message user'))
})
test('private draft renders review affordance without a send or funds action', () => {
  const c = buildContext(data.tenant, { leases: data.leases, payments: data.transactions, claims: [], evidence: [], simulatedPaymentIds: [], asOf: data.scenarioDate, source: 'demo' })
  const reply = composeReply({ question: 'Draft a response to a €150 claim', context: c, history: [], language: 'en' })
  writeSession('ana:tenant:lease-arroios', { messages: [{ id: 'response', from: 'agent', text: reply.text, reply }], input: '' })
  try {
    const html = render(); assert.match(html, /Private draft · not sent/); assert.match(html, /Review and edit draft/)
    assert.ok(!html.includes('Send draft')); assert.ok(!html.includes('Release funds'))
    assert.match(html, /claims-evidence/)
  } finally { clearSession('ana:tenant:lease-arroios') }
})
