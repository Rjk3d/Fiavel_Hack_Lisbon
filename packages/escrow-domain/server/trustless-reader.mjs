// Server-only Core API V2 reader. No financial writes or wallet material.
export function createTrustlessWorkServerReader(apiKey, fetchImpl = fetch) {
  if (!apiKey) throw new Error('TW_API_KEY is not configured on the server.')
  return async contractId => {
    if (!/^C[A-Z2-7]{55}$/.test(contractId)) throw new Error('Invalid escrow contract identifier.')
    const response = await fetchImpl(`https://beta.api.trustlesswork.com/escrow/single-release/v2/${contractId}`, { method: 'GET', redirect: 'error', headers: { 'x-api-key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) })
    if (!response.ok) throw new Error(`Trustless Work unavailable (${response.status}); the original provider remains selected.`)
    const text = await response.text()
    if (text.length > 100000) throw new Error('Provider response exceeded limit.')
    return JSON.parse(text)
  }
}
