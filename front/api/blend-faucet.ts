// Vercel function: relays Blend's testnet faucet, which only answers requests
// from its own origin. Returns the faucet's transaction (to be co-signed by
// the wallet in the browser). Testnet assets only.

const FAUCET = 'https://ewqw4hx7oa.execute-api.us-east-1.amazonaws.com/getAssets'

export default async function handler(req: { url?: string }, res: { status: (n: number) => { send: (b: string) => void } }) {
  const userId = new URL(req.url ?? '', 'http://localhost').searchParams.get('userId') ?? ''
  if (!/^G[A-Z2-7]{55}$/.test(userId)) return res.status(400).send('userId must be a Stellar account')
  const r = await fetch(`${FAUCET}?userId=${userId}`, { headers: { Origin: 'https://testnet.blend.capital' } })
  return res.status(r.status).send(await r.text())
}
