import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { analyze, type Insight, type Snapshot } from '@agents/rules'
import { useToast } from '../components/ui/Toast'
import { NETWORK, explorerTx } from '../stellar/config'
import { balances as loadBalances, fund as fundWallet, loadWallet, ROLES, type Balances, type LiveRole, type Wallet } from '../stellar/wallets'
import { contractEvents, getLease, invoke, leaseCount, plainError, snapshotOf, type ChainEvent } from '../stellar/vault'

/**
 * Live state: three testnet wallets (one per role), every lease that involves them,
 * and the contract events. Screens read from here and act through `run`, which signs
 * with the current role's wallet and submits to Stellar Testnet.
 */

export interface LeaseMeta {
  /** Off-chain label of the home, entered by the landlord. */
  home: string
}

export interface LeaseView {
  id: bigint
  snap: Snapshot
  insight: Insight
  meta: LeaseMeta
}

export interface TxRecord {
  hash: string
  label: string
  leaseId?: string
  role: LiveRole
  at: number
}

interface Live {
  role: LiveRole
  setRole: (r: LiveRole) => void
  wallets: Record<LiveRole, Wallet>
  wallet: Wallet
  balances: Partial<Record<LiveRole, Balances>>
  funding: LiveRole | null
  fundStep: string
  fund: (role?: LiveRole) => Promise<void>
  leases: LeaseView[]
  mine: LeaseView[]
  events: ChainEvent[]
  txs: TxRecord[]
  now: number
  ready: boolean
  error: string | null
  busy: string | null
  refresh: () => Promise<void>
  run: (fn: string, args: Record<string, unknown>, label: string, leaseId?: bigint) => Promise<{ hash: string; result: unknown } | null>
  watch: (id: bigint, meta?: Partial<LeaseMeta>) => void
  setMeta: (id: bigint, meta: LeaseMeta) => void
  roleOf: (lease: LeaseView, role?: LiveRole) => boolean
}

const Ctx = createContext<Live | null>(null)
const store = (k: string) => `fiavel.${NETWORK.leaseVault}.${k}`

function read<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(store(k))
    return v ? (JSON.parse(v) as T) : fallback
  } catch {
    return fallback
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(store(k), JSON.stringify(v))
  } catch {
    /* not persisted */
  }
}

const DEFAULT_META: LeaseMeta = { home: 'Rental home' }

export function LiveProvider({ children }: { children: ReactNode }) {
  const toast = useToast()
  const wallets = useMemo(() => Object.fromEntries(ROLES.map((r) => [r, loadWallet(r)])) as Record<LiveRole, Wallet>, [])
  const [role, setRoleState] = useState<LiveRole>(() => read<LiveRole>('role', 'tenant'))
  const [bal, setBal] = useState<Partial<Record<LiveRole, Balances>>>({})
  const [funding, setFunding] = useState<LiveRole | null>(null)
  const [fundStep, setFundStep] = useState('')
  const [leases, setLeases] = useState<LeaseView[]>([])
  const [events, setEvents] = useState<ChainEvent[]>([])
  const [txs, setTxs] = useState<TxRecord[]>(() => read<TxRecord[]>('txs', []))
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000))
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const watched = useRef<Set<string>>(new Set(read<string[]>('watched', [])))
  const metas = useRef<Record<string, LeaseMeta>>(read('meta', {}))

  const setRole = useCallback((r: LiveRole) => {
    setRoleState(r)
    write('role', r)
  }, [])

  const refreshBalances = useCallback(async () => {
    const entries = await Promise.all(ROLES.map(async (r) => [r, await loadBalances(wallets[r].address)] as const))
    setBal(Object.fromEntries(entries))
  }, [wallets])

  const refreshLeases = useCallback(async () => {
    const ours = new Set(ROLES.map((r) => wallets[r].address))
    const count = await leaseCount()
    const all = await Promise.all(Array.from({ length: count }, (_, i) => getLease(BigInt(i)).then((l) => [BigInt(i), l] as const)))
    const relevant = all.filter(
      ([id, l]) => ours.has(l.landlord) || (l.tenant && ours.has(l.tenant)) || ours.has(l.terms.arbiter) || watched.current.has(id.toString()),
    )
    const views = await Promise.all(
      relevant.map(async ([id, l]) => {
        const snap = await snapshotOf(id, l)
        return { id, snap, insight: analyze(snap), meta: metas.current[id.toString()] ?? DEFAULT_META }
      }),
    )
    setLeases(views.sort((a, b) => Number(b.id - a.id)))
  }, [wallets])

  const refreshEvents = useCallback(async () => {
    setEvents(await contractEvents())
  }, [])

  const refresh = useCallback(async () => {
    try {
      await Promise.all([refreshLeases(), refreshBalances()])
      setError(null)
    } catch (e) {
      setError(plainError(e))
    } finally {
      setReady(true)
    }
  }, [refreshLeases, refreshBalances])

  // Clock for countdowns, and polling of the chain.
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000)
    return () => clearInterval(t)
  }, [])
  useEffect(() => {
    void refresh()
    void refreshEvents().catch(() => {})
    const a = setInterval(() => void refreshLeases().catch(() => {}), 5000)
    const b = setInterval(() => void refreshEvents().catch(() => {}), 10000)
    const c = setInterval(() => void refreshBalances().catch(() => {}), 15000)
    return () => [a, b, c].forEach(clearInterval)
  }, [refresh, refreshEvents, refreshLeases, refreshBalances])

  // Keep the rule engine's clock current between polls.
  const live = useMemo(
    () =>
      leases.map((v) => {
        const snap = { ...v.snap, now }
        return { ...v, snap, insight: analyze(snap) }
      }),
    [leases, now],
  )

  const fund = useCallback(
    async (r: LiveRole = role) => {
      setFunding(r)
      try {
        await fundWallet(wallets[r], setFundStep)
        await refreshBalances()
        toast({ title: 'Test funds received', body: `${r[0].toUpperCase() + r.slice(1)} wallet funded with test XLM and USDC.` })
      } catch (e) {
        toast({ title: 'Funding failed', body: plainError(e) })
      } finally {
        setFunding(null)
        setFundStep('')
      }
    },
    [role, wallets, refreshBalances, toast],
  )

  const run = useCallback<Live['run']>(
    async (fn, args, label, leaseId) => {
      setBusy(label)
      try {
        const out = await invoke(wallets[role], fn, args)
        const { hash } = out
        const rec: TxRecord = { hash, label, leaseId: leaseId?.toString(), role, at: Math.floor(Date.now() / 1000) }
        setTxs((all) => {
          const next = [rec, ...all].slice(0, 100)
          write('txs', next)
          return next
        })
        toast({ title: label, body: 'Confirmed on Stellar Testnet.', href: explorerTx(hash) })
        await Promise.all([refreshLeases(), refreshBalances()])
        void refreshEvents().catch(() => {})
        return out
      } catch (e) {
        toast({ title: 'Rejected', body: plainError(e) })
        return null
      } finally {
        setBusy(null)
      }
    },
    [role, wallets, toast, refreshLeases, refreshBalances, refreshEvents],
  )

  const watch = useCallback<Live['watch']>(
    (id, meta) => {
      watched.current.add(id.toString())
      write('watched', [...watched.current])
      if (meta?.home) {
        metas.current[id.toString()] = { ...DEFAULT_META, ...metas.current[id.toString()], ...meta }
        write('meta', metas.current)
      }
      void refreshLeases().catch(() => {})
    },
    [refreshLeases],
  )

  const setMeta = useCallback<Live['setMeta']>((id, meta) => {
    metas.current[id.toString()] = meta
    write('meta', metas.current)
  }, [])

  const roleOf = useCallback<Live['roleOf']>(
    (l, r = role) => {
      const a = wallets[r].address
      if (r === 'landlord') return l.snap.lease.landlord === a
      if (r === 'tenant') return l.snap.lease.tenant === a || (!l.snap.lease.tenant && watched.current.has(l.id.toString()))
      return l.snap.lease.terms.arbiter === a
    },
    [role, wallets],
  )

  const mine = useMemo(() => live.filter((l) => roleOf(l)), [live, roleOf])

  const value: Live = {
    role,
    setRole,
    wallets,
    wallet: wallets[role],
    balances: bal,
    funding,
    fundStep,
    fund,
    leases: live,
    mine,
    events,
    txs,
    now,
    ready,
    error,
    busy,
    refresh,
    run,
    watch,
    setMeta,
    roleOf,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useLive() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useLive must be used inside <LiveProvider>')
  return v
}

export const ROLE_LABEL: Record<LiveRole, string> = { tenant: 'Tenant', landlord: 'Landlord', arbiter: 'Arbiter' }
export const ROLE_PERSON: Record<LiveRole, { name: string; initials: string; note: string }> = {
  tenant: { name: 'Ana Costa', initials: 'AC', note: "Master's student from São Paulo" },
  landlord: { name: 'Manuel Ferreira', initials: 'MF', note: 'Small landlord in Arroios' },
  arbiter: { name: 'Mediator', initials: 'AR', note: 'Approved mediator named in the lease' },
}
