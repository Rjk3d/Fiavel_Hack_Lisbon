import { Client, scValToNative, xdr } from 'lease-vault-client'
import replay from '../replay-lease0.json'
import { NETWORK } from '../../../front/src/stellar/config'

/**
 * States of LeaseVault v5 lease #0 computed by the real contract code (../replay/src/main.rs),
 * decoded with the app's own generated client, the way it decodes RPC answers.
 * The step shown is ?step=<label> in the URL.
 */
const spec = new Client({ contractId: NETWORK.leaseVault, networkPassphrase: NETWORK.passphrase, rpcUrl: NETWORK.rpcUrl }).spec

type Step = (typeof replay.steps)[number]
const alias = replay.alias as Record<string, string>

/** Host-generated addresses → the app's local test wallets (and the deploy's mediator). */
function unalias<T>(v: T): T {
  if (typeof v === 'string') return (alias[v] ?? v) as T
  if (Array.isArray(v)) return v.map(unalias) as T
  if (v instanceof Uint8Array || typeof v !== 'object' || v === null || typeof v === 'bigint') return v
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, unalias(x)])) as T
}

export function step(): Step {
  const want = new URLSearchParams(location.search).get('step') ?? 'rent_paid'
  return replay.steps.find((s) => s.label === want) ?? replay.steps[replay.steps.length - 1]
}

export function read<T>(fn: string, b64?: string): T {
  const s = step() as unknown as Record<string, string>
  return unalias(spec.funcResToNative(fn, b64 ?? s[fn]) as T)
}

export function events() {
  const s = step()
  const upto = replay.steps.indexOf(s)
  // Each event belongs to the first step whose export contains it: that step's tx and time.
  return s.events.map((b64, i) => {
    const owner = replay.steps.find((x, k) => k <= upto && x.events.length > i)!
    const ev = xdr.ContractEvent.fromXDR(b64, 'base64')
    const body = ev.body().v0()
    const topics = body.topics()
    const value = scValToNative(body.data())
    return {
      key: `${owner.tx}-${i}`,
      name: String(scValToNative(topics[0])),
      leaseId: BigInt(scValToNative(topics[1]) as bigint),
      at: new Date(owner.time * 1000).toISOString(),
      tx: owner.tx,
      data: unalias((typeof value === 'object' && value !== null ? value : { value }) as Record<string, unknown>),
      actor: topics[2] ? unalias(String(scValToNative(topics[2]))) : undefined,
    }
  })
}

export const balanceOf = (role: 'tenant' | 'landlord' | 'arbiter') => BigInt((step().balance as Record<string, string>)[role])
export const t0 = replay.t0
