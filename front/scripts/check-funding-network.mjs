// Read-only probe: never loads a secret, signs, creates offers, or submits transactions.
import fs from 'node:fs'
import { Asset, Client, Networks, rpc } from 'lease-vault-client'
const deployment = JSON.parse(fs.readFileSync(new URL('../../deployments/testnet.json', import.meta.url), 'utf8'))
const issuer = deployment.usdcClassic.split(':')[1]
if (deployment.networkPassphrase !== Networks.TESTNET) throw new Error('Probe is testnet-only.')
if (new Asset('USDC', issuer).contractId(Networks.TESTNET) !== deployment.usdc) throw new Error('Issuer/SAC mismatch.')
const server = new rpc.Server(deployment.rpcUrl)
server.httpClient.defaults.timeout = 12000
const client = new Client({ rpcUrl: deployment.rpcUrl, contractId: deployment.leaseVault, networkPassphrase: Networks.TESTNET, publicKey: deployment.accounts.coordinator, server })
const network = await server.getNetwork()
const config = (await client.get_config()).result
if (network.passphrase !== Networks.TESTNET || config.token !== deployment.usdc) throw new Error('Network/contract token mismatch.')
console.log('Verified testnet contract token:', config.token)
console.log('Verified issuer/SAC mapping:', issuer)
for (const amount of ['1800', '2700']) {
  const query = new URLSearchParams({ source_assets: 'native', destination_asset_type: 'credit_alphanum4', destination_asset_code: 'USDC', destination_asset_issuer: issuer, destination_amount: amount })
  const response = await fetch(`https://horizon-testnet.stellar.org/paths/strict-receive?${query}`, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`Horizon ${response.status}`)
  const result = await response.json()
  console.log(`XLM routes delivering ${amount} configured test USDC:`, result._embedded.records.length)
}
console.log('Read-only verification complete. No swap or escrow funding transaction was executed.')
