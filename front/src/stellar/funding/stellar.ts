import { Account, Address, Asset, Client, Contract, Networks, Operation, Transaction, TransactionBuilder, nativeToScVal, rpc, type Lease } from 'lease-vault-client'
import { NETWORK } from '../config'
import type { Wallet } from '../wallets'
import { createProviderFundingEngine } from '../../escrow/funding'
import { createEscrowRegistry, legacyBinding } from '../../escrow/runtime'
import { snapshotOf } from '../vault'
import { browserAttemptStore } from './storage'
import { assetKey, assertCanFund, decimal, FUND_FEE_CAP, scopeKey, totalFor, units, type AssetId, type Attempt, type FundingPorts, type Path, type Quote, type Scope, type TxReference, type WalletState } from './domain'

export const escrowUSDC: AssetId = { code: NETWORK.usdcCode, issuer: NETWORK.usdcIssuer }
const sdkAsset = (asset: AssetId) => assetKey(asset) === 'native' ? Asset.native() : new Asset(asset.code, asset.issuer!)
interface BalanceLine { asset_type: string; asset_code?: string; asset_issuer?: string; balance: string; selling_liabilities?: string; buying_liabilities?: string; limit?: string; is_authorized?: boolean }
interface AccountData { sequence: string; subentry_count: number; num_sponsoring?: number; num_sponsored?: number; balances: BalanceLine[] }
interface Ledger { closed_at: string; base_reserve_in_stroops: number }
interface RawPath { source_asset_type: string; source_asset_code?: string; source_asset_issuer?: string; source_amount: string; destination_asset_type: string; destination_asset_code: string; destination_asset_issuer: string; destination_amount: string; path: { asset_type: string; asset_code?: string; asset_issuer?: string }[] }
const decodeAsset = (asset: { asset_type: string; asset_code?: string; asset_issuer?: string }): AssetId => asset.asset_type === 'native' ? { code: 'XLM' } : { code: asset.asset_code!, issuer: asset.asset_issuer! }

export async function horizonJSON<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${NETWORK.horizonUrl}${path}`, { ...options, signal: AbortSignal.timeout(12000) })
  if (!response.ok) { const error = new Error(`Stellar Horizon request failed (${response.status}). No confirmation was assumed.`) as Error & { status: number }; error.status = response.status; throw error }
  const text = await response.text()
  if (text.length > 2000000) throw new Error('Unexpectedly large network response.')
  return JSON.parse(text) as T
}

export const fundingScope = (wallet: Wallet, leaseId: bigint): Scope => ({ network: NETWORK.passphrase, vault: NETWORK.leaseVault, token: NETWORK.usdc, payer: wallet.address, leaseId: leaseId.toString() })
export function fundingPorts(wallet: Wallet, leaseId: bigint): FundingPorts {
  const scope = fundingScope(wallet, leaseId)
  const server = new rpc.Server(NETWORK.rpcUrl)
  server.httpClient.defaults.timeout = 12000
  const reader = new Client({ contractId: scope.vault, networkPassphrase: scope.network, rpcUrl: NETWORK.rpcUrl, publicKey: wallet.address, server })
  const account = () => horizonJSON<AccountData>(`/accounts/${wallet.address}`)
  const ledger = async () => (await horizonJSON<{ _embedded: { records: Ledger[] } }>('/ledgers?order=desc&limit=1'))._embedded.records[0]
  const lease = async () => (await reader.get_lease({ id: leaseId })).result
  const fundOperation = (acceptYield: boolean) => new Contract(scope.vault).call('fund', nativeToScVal(leaseId, { type: 'u64' }), Address.fromString(wallet.address).toScVal(), nativeToScVal(acceptYield))
  function reference(tx: Transaction): TxReference {
    tx.sign(wallet.sign) // Existing testnet-only wallet; explicit UI review is required before this call.
    return { hash: tx.hash().toString('hex'), xdr: tx.toXDR(), expires: Number(tx.timeBounds?.maxTime) }
  }
  function validateReference(ref: TxReference, kind: 'swap' | 'fund', attempt?: Attempt): Transaction {
    const tx = TransactionBuilder.fromXDR(ref.xdr, scope.network)
    if (!(tx instanceof Transaction) || tx.source !== scope.payer || tx.hash().toString('hex') !== ref.hash || Number(tx.timeBounds?.maxTime) !== ref.expires || tx.operations.length !== 1 || !tx.signatures.length) throw new Error('Transaction envelope does not match this payment attempt.')
    if (kind === 'fund') {
      if (!attempt) throw new Error('Missing funding attempt.')
      const actual = tx.toEnvelope().v1().tx().operations()[0].body()
      if (tx.operations[0].type !== 'invokeHostFunction' || actual.invokeHostFunctionOp().hostFunction().toXDR('base64') !== fundOperation(attempt.acceptYield).body().invokeHostFunctionOp().hostFunction().toXDR('base64') || BigInt(tx.fee) > FUND_FEE_CAP) throw new Error('Saved contract call does not match LeaseVault funding.')
    } else {
      const op = tx.operations[0]
      if (op.type !== 'pathPaymentStrictReceive' || op.destination !== scope.payer || !op.destAsset.equals(sdkAsset(escrowUSDC))) throw new Error('Conversion must receive the configured USDC into the payer’s own account.')
      if (attempt && (units(op.destAmount).toString() !== attempt.receive || assetKey({ code: op.sendAsset.code, ...(op.sendAsset.isNative() ? {} : { issuer: op.sendAsset.issuer }) }) !== assetKey(attempt.source) || units(op.sendMax).toString() !== attempt.sourceMax)) throw new Error('Saved swap differs from the approved exact receive and maximum spend.')
    }
    return tx
  }
  const ports: FundingPorts = {
    scope, targetAsset: escrowUSDC, now: Date.now, lease,
    async checkNetwork() {
      if (NETWORK.passphrase !== Networks.TESTNET || wallet.role !== 'tenant') throw new Error('This integration supports the existing tenant testnet wallet only. Mainnet and guarantor funding are disabled.')
      if (sdkAsset(escrowUSDC).contractId(scope.network) !== scope.token) throw new Error('USDC issuer/SAC mismatch in deployment configuration.')
      const [root, rpcNetwork, config] = await Promise.all([horizonJSON<{ network_passphrase: string }>('/'), server.getNetwork(), reader.get_config()])
      if (root.network_passphrase !== scope.network || rpcNetwork.passphrase !== scope.network) throw new Error('Wallet, Horizon and RPC network mismatch.')
      if (config.result.token !== scope.token) throw new Error('LeaseVault accepts a different token. Funding is blocked.')
    },
    async wallet(): Promise<WalletState> {
      const [acc, last, fees] = await Promise.all([account(), ledger(), horizonJSON<{ fee_charged: { p90: string } }>('/fee_stats')])
      const reserve = BigInt(2 + acc.subentry_count + (acc.num_sponsoring ?? 0) - (acc.num_sponsored ?? 0)) * BigInt(last.base_reserve_in_stroops)
      const fee = BigInt(fees.fee_charged.p90)
      if (fee <= 0n || fee > 1000000n) throw new Error('Classic network fees exceed the allowed 0.1 XLM limit. Try later.')
      const assets = acc.balances.filter(line => line.asset_type !== 'liquidity_pool_shares').map(line => {
        const asset = decodeAsset(line)
        const balance = units(line.balance)
        const available = balance - units(line.selling_liabilities ?? '0') - (line.asset_type === 'native' ? reserve : 0n)
        return { asset, balance, spendable: available > 0n ? available : 0n, authorized: line.asset_type === 'native' || line.is_authorized === true }
      })
      const target = acc.balances.find(line => line.asset_code === escrowUSDC.code && line.asset_issuer === escrowUSDC.issuer)
      const native = assets.find(asset => assetKey(asset.asset) === 'native')
      return { assets, usdcCapacity: target ? units(target.limit!) - units(target.balance) - units(target.buying_liabilities ?? '0') : 0n, hasUSDC: !!target, usdcAuthorized: target?.is_authorized === true, xlmSpendable: native?.spendable ?? 0n, fee, ledgerTime: Math.floor(new Date(last.closed_at).getTime() / 1000) }
    },
    async paths(input, required): Promise<Path[]> {
      const query = new URLSearchParams({ source_assets: assetKey(input), destination_asset_type: 'credit_alphanum4', destination_asset_code: escrowUSDC.code, destination_asset_issuer: escrowUSDC.issuer!, destination_amount: decimal(required) })
      const result = await horizonJSON<{ _embedded: { records: RawPath[] } }>(`/paths/strict-receive?${query}`)
      return result._embedded.records.filter(path => path.destination_asset_code === escrowUSDC.code && path.destination_asset_issuer === escrowUSDC.issuer).map(path => ({ input: path.source_asset_type === 'native' ? { code: 'XLM' } : { code: path.source_asset_code!, issuer: path.source_asset_issuer! }, inputAmount: units(path.source_amount), outputAmount: units(path.destination_amount), path: path.path.map(decodeAsset) }))
    },
    async prepareSwap(quote: Quote) {
      const acc = await account()
      const tx = new TransactionBuilder(new Account(wallet.address, acc.sequence), { fee: quote.fee.toString(), networkPassphrase: scope.network })
        .addOperation(Operation.pathPaymentStrictReceive({ sendAsset: sdkAsset(quote.input), sendMax: decimal(quote.maximum), destination: wallet.address, destAsset: sdkAsset(escrowUSDC), destAmount: decimal(quote.receive), path: quote.path.map(sdkAsset) })).setTimebounds(0, Math.floor(quote.expires / 1000)).build()
      return reference(tx)
    },
    async prepareFunding(attempt) {
      const current = await lease()
      assertCanFund(current, wallet.address, Math.floor(Date.now() / 1000))
      if (totalFor(current, attempt.acceptYield).toString() !== attempt.required) throw new Error('On-chain funding amount changed.')
      const state = await ports.wallet()
      const usdc = state.assets.find(asset => assetKey(asset.asset) === assetKey(escrowUSDC))
      if (!usdc?.authorized || usdc.spendable < BigInt(attempt.required)) throw new Error('Insufficient authorized USDC. Any converted funds remain in this wallet.')
      const acc = await account()
      const raw = new TransactionBuilder(new Account(wallet.address, acc.sequence), { fee: state.fee.toString(), networkPassphrase: scope.network }).addOperation(fundOperation(attempt.acceptYield)).setTimeout(90).build()
      const tx = await server.prepareTransaction(raw)
      if (BigInt(tx.fee) > FUND_FEE_CAP || BigInt(tx.fee) > state.xlmSpendable) throw new Error('Simulated funding fee exceeds the 10 XLM ceiling or spendable balance. USDC remains in your wallet.')
      return reference(tx)
    },
    async submit(ref, kind) {
      const saved = browserAttemptStore().load(scope)
      const tx = validateReference(ref, kind, saved ?? undefined)
      if (kind === 'swap') await horizonJSON('/transactions', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ tx: tx.toXDR() }) })
      else {
        const response = await server.sendTransaction(tx)
        if (!['PENDING', 'DUPLICATE'].includes(response.status)) throw new Error('Funding submission was not accepted; verify its hash before retrying.')
      }
    },
    async status(ref, kind, attempt) {
      validateReference(ref, kind, attempt)
      if (scopeKey(attempt.scope) !== scopeKey(scope)) throw new Error('Wrong recovery scope.')
      if (kind === 'fund') {
        const result = await server.getTransaction(ref.hash)
        if (result.status === 'SUCCESS') return { state: 'confirmed' }
        if (result.status === 'FAILED') return { state: 'failed' }
      } else {
        try {
          const result = await horizonJSON<{ successful: boolean; hash: string }>(`/transactions/${ref.hash}`)
          if (result.hash !== ref.hash) throw new Error('Unexpected transaction reference.')
          return { state: result.successful ? 'confirmed' : 'failed' }
        } catch (error) { if ((error as { status?: number }).status !== 404) throw error }
      }
      // Only expire after the chain ledger has passed the signed time bound.
      const last = await ledger()
      return { state: new Date(last.closed_at).getTime() > ref.expires * 1000 + 10000 ? 'failed' : 'pending' }
    },
    async verify(attempt) {
      const current: Lease = await lease()
      return current.status.tag === 'Funded' && current.tenant === wallet.address && current.created_at.toString() === attempt.createdAt && current.rent_escrow === current.terms.rent && current.liquid + current.placed === BigInt(attempt.required) - current.terms.rent
    },
    async fundingProof(attempt) {
      if (!attempt.fund || !await ports.verify(attempt)) return null
      const tx = await server.getTransaction(attempt.fund.hash)
      if (tx.status !== 'SUCCESS') return null
      return { source: 'rpc', contractId: scope.vault, network: scope.network, token: scope.token, amount: attempt.required, transactionHash: attempt.fund.hash, ledger: tx.ledger, successful: true }
    },
  }
  return ports
}

export function createFundingEngine(wallet: Wallet, leaseId: bigint) {
  const registry = createEscrowRegistry()
  return createProviderFundingEngine(async () => registry.bind(legacyBinding(leaseId, await snapshotOf(leaseId))), registry, fundingPorts(wallet, leaseId), browserAttemptStore())
}
