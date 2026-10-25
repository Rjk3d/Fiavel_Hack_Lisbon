import { useMemo, useState, type ReactNode } from 'react'
import { Buffer } from 'buffer'
import {
  ArrowDownToLine,
  BadgeCheck,
  Ban,
  CircleDollarSign,
  Clock3,
  FileSignature,
  FileWarning,
  Gavel,
  Handshake,
  KeyRound,
  LogOut,
  Scale,
  ShieldCheck,
  Sprout,
  Star,
  ThumbsUp,
  Timer,
  Undo2,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { actionsFor, bufferToLock, damageClaimable, type Action, type ContractFn } from '@agents/rules'
import { checkAction } from '@agents/guards'
import { explainRule, type RuleId } from '@agents/explain'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { FactRows } from '../ui/misc'
import { useLive, type LeaseView } from '../../state/live'
import { NETWORK } from '../../stellar/config'
import { toUnits, usdc } from '../../stellar/format'
import { sha256 } from '../../stellar/vault'
import { cx } from '../../lib/cx'

const ICON: Record<ContractFn, LucideIcon> = {
  fund: ShieldCheck,
  confirm_move_in: KeyRound,
  refund_no_keys: Undo2,
  pay_rent: CircleDollarSign,
  claim_unpaid: Clock3,
  end_lease: LogOut,
  claim_damage: FileWarning,
  respond: Handshake,
  accept_counter: BadgeCheck,
  execute_claim: Gavel,
  resolve: Scale,
  expire_dispute: Timer,
  release: ShieldCheck,
  exit_blend: ArrowDownToLine,
  propose_yield: Sprout,
  approve_yield: ThumbsUp,
  cancel_yield: XCircle,
  rate: Star,
}

/** The rule each action is about, shown in its dialog. */
const RULE: Partial<Record<ContractFn, RuleId>> = {
  fund: 'first_rent',
  confirm_move_in: 'first_rent',
  refund_no_keys: 'no_keys',
  pay_rent: 'monthly_rent',
  claim_unpaid: 'unpaid_rent',
  end_lease: 'end_of_lease',
  claim_damage: 'damage_claim',
  respond: 'tenant_response',
  accept_counter: 'arbitration',
  execute_claim: 'tenant_response',
  resolve: 'arbitration',
  expire_dispute: 'arbitration',
  release: 'end_of_lease',
  exit_blend: 'yield_exit',
  propose_yield: 'invest_during_lease',
  approve_yield: 'invest_during_lease',
  cancel_yield: 'invest_during_lease',
  rate: 'rating',
}

/** What the current role can do on this lease right now, and what it cannot yet. */
export function ActionPanel({ view, compact }: { view: LeaseView; compact?: boolean }) {
  const live = useLive()
  const [open, setOpen] = useState<Action | null>(null)
  const role = live.role
  const actions = actionsFor(view.insight, role)
  const blocked = view.insight.blocked.filter((b) => b.role === role)

  return (
    <section className={cx('card', compact ? 'p-5' : 'p-5 sm:p-6')}>
      <p className="label">What you can do</p>
      {actions.length === 0 ? (
        <p className="mt-2 text-[14px] text-ink-muted">Nothing to do on your side right now.</p>
      ) : (
        <div className="mt-3 grid gap-2">
          {actions.map((a, i) => {
            const Icon = ICON[a.fn]
            return (
              <button
                key={i}
                onClick={() => setOpen(a)}
                disabled={!!live.busy}
                className="group flex items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 text-left transition hover:border-brand/30 hover:bg-brand-tint/50 disabled:opacity-50"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-tint text-brand">
                  <Icon size={17} />
                </span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold">{a.label}</span>
                {a.role === 'anyone' && <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-muted">public</span>}
              </button>
            )
          })}
        </div>
      )}
      {blocked.length > 0 && (
        <div className="mt-4 space-y-2">
          {blocked.map((b, i) => (
            <div key={i} className="flex gap-3 rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-[19px]">
              <Ban size={16} className="mt-0.5 shrink-0 text-ink-muted" />
              <div>
                <p className="font-semibold text-ink">{b.label}</p>
                <p className="text-ink-muted">{b.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {open && <ActionDialog view={view} action={open} onClose={() => setOpen(null)} />}
    </section>
  )
}

/** One contract call: inputs, the rule it follows, the guard check, then signature. */
export function ActionDialog({ view, action, onClose }: { view: LeaseView; action: Action; onClose: () => void }) {
  const live = useLive()
  const { lease, claim } = view.snap
  const t = lease.terms
  const me = live.wallet.address
  const [notes, setNotes] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [amount, setAmount] = useState(() => {
    if (action.fn === 'claim_damage') return ''
    if (action.fn === 'respond') return claim ? (Number(claim.amount) / 1e7 / 2).toFixed(2) : ''
    if (action.fn === 'resolve') return claim ? (Number(claim.amount) / 1e7 / 2).toFixed(2) : ''
    return ''
  })
  const [useExisting, setUseExisting] = useState(!!lease.entry_hash)
  // Invest during the lease: amount kept liquid and yield split (percent).
  const [keep, setKeep] = useState(() => (Number(t.rent) / 1e7).toFixed(2))
  const [tenantPct, setTenantPct] = useState('70')
  const [landlordPct, setLandlordPct] = useState('20')
  const [score, setScore] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const id = view.id

  const accepting = action.fn === 'respond' && action.args?.offer !== undefined

  const facts = useMemo(() => factsFor(action, view), [action, view])

  async function inventoryHash(): Promise<Buffer> {
    const parts = [notes, ...(await Promise.all(files.map((f) => f.arrayBuffer().then((b) => Buffer.from(b).toString('base64')))))]
    return Buffer.from(await sha256(parts.join('|')))
  }

  async function submit() {
    setError(null)
    let args: Record<string, unknown> = { id }
    let guardArgs: Record<string, unknown> = {}
    try {
      switch (action.fn) {
        case 'fund':
          args = { id, tenant: me, accept_yield: Boolean(action.args?.accept_yield) }
          break
        case 'confirm_move_in': {
          const h = useExisting && lease.entry_hash ? Buffer.from(lease.entry_hash) : await inventoryHash()
          args = { id, who: me, entry_hash: h }
          guardArgs = { entry_hash: h }
          break
        }
        case 'end_lease':
          args = { id, who: me, exit_hash: notes || files.length ? await inventoryHash() : undefined }
          break
        case 'claim_damage': {
          const a = toUnits(amount || '0')
          const evidence = await inventoryHash()
          args = { id, amount: a, evidence }
          guardArgs = { amount: a, evidence }
          break
        }
        case 'respond': {
          const offer = accepting ? (action.args!.offer as bigint) : toUnits(amount || '0')
          args = { id, offer }
          guardArgs = { offer }
          break
        }
        case 'resolve': {
          const toLandlord = toUnits(amount || '0')
          args = { id, to_landlord: toLandlord }
          guardArgs = { to_landlord: toLandlord }
          break
        }
        case 'exit_blend':
          args = { id, caller: me }
          break
        case 'propose_yield': {
          const k = toUnits(keep || '0')
          const ts = Math.round(Number(tenantPct) * 100)
          const ls = Math.round(Number(landlordPct) * 100)
          if (!Number.isFinite(ts) || !Number.isFinite(ls)) throw new Error('shares')
          args = { id, who: me, keep: k, tenant_share_bps: ts, landlord_share_bps: ls }
          guardArgs = { keep: k, tenant_share_bps: ts, landlord_share_bps: ls }
          break
        }
        case 'approve_yield':
        case 'cancel_yield':
          args = { id, who: me }
          break
        case 'rate':
          args = { id, who: me, score }
          guardArgs = { score }
          break
      }
    } catch {
      setError('Check the amount.')
      return
    }
    // First lock: the same guard the agents use. The contract re-checks everything.
    const guard = checkAction(view.snap, action.role === 'anyone' ? live.role : action.role, action.fn, guardArgs)
    if (!guard.ok) {
      setError(guard.reason)
      return
    }
    const hash = await live.run(action.fn, args, action.label, id)
    if (hash) onClose()
  }

  const rule = RULE[action.fn]
  const needsInventory = action.fn === 'confirm_move_in' || action.fn === 'end_lease' || action.fn === 'claim_damage'

  return (
    <Dialog
      open
      onClose={onClose}
      title={action.label}
      description={`Lease #${id} · ${view.meta.home}`}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!!live.busy || (action.fn === 'rate' && score === 0)} icon={<FileSignature size={16} />}>
            {live.busy ? 'Signing and submitting…' : 'Sign and submit'}
          </Button>
        </div>
      }
    >
      {facts.length > 0 && <FactRows rows={facts} />}

      {needsInventory && (
        <div className="mt-4 space-y-3">
          {action.fn === 'confirm_move_in' && lease.entry_hash && (
            <label className="flex items-start gap-3 rounded-2xl bg-brand-tint/60 px-4 py-3 text-[14px]">
              <input type="checkbox" className="mt-1" checked={useExisting} onChange={(e) => setUseExisting(e.target.checked)} />
              <span>
                <span className="font-semibold">Co-sign the inventory the other party signed</span>
                <span className="mt-0.5 block break-all font-mono text-[12px] text-ink-muted">{Buffer.from(lease.entry_hash).toString('hex')}</span>
              </span>
            </label>
          )}
          {!(action.fn === 'confirm_move_in' && useExisting) && (
            <>
              <Field label={action.fn === 'claim_damage' ? 'What happened (evidence summary)' : 'Inventory notes'}>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder={action.fn === 'claim_damage' ? 'Broken wardrobe door, invoice attached' : 'Walls clean, 4 photos, keys ×2'}
                  className="w-full rounded-2xl border border-line bg-canvas px-4 py-3 text-[14px] outline-none focus:border-brand/40"
                />
              </Field>
              <Field label="Photos or documents (hashed in your browser, never uploaded)">
                <input type="file" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} className="text-[13px]" />
              </Field>
              <p className="text-[12px] leading-[17px] text-ink-muted">
                Only the SHA-256 hash goes on-chain. Keep the originals: they are the evidence the hash proves.
              </p>
            </>
          )}
        </div>
      )}

      {(action.fn === 'claim_damage' || (action.fn === 'respond' && !accepting) || action.fn === 'resolve') && (
        <div className="mt-4">
          <Field
            label={
              action.fn === 'claim_damage'
                ? `Amount claimed (max ${usdc(damageClaimable(view.snap))})`
                : action.fn === 'respond'
                  ? `Your offer (claim: ${usdc(claim!.amount)})`
                  : `To the landlord (out of ${usdc(claim!.amount)})`
            }
          >
            <input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[16px] font-semibold outline-none focus:border-brand/40"
            />
          </Field>
          {action.fn === 'resolve' && claim && amount && (
            <p className="mt-2 text-[13px] text-ink-muted">
              Tenant gets {usdc(claim.amount - safeUnits(amount))}.{' '}
              {safeUnits(amount) * 2n < claim.amount ? `The ${usdc(claim.bond)} bond goes to the arbitration fund.` : 'The bond goes back to the landlord.'}
            </p>
          )}
          {action.fn === 'claim_damage' && (
            <p className="mt-2 text-[13px] text-ink-muted">
              You post a {usdc(NETWORK.disputeBond)} bond. Everything above your claim goes back to the tenant at once.
            </p>
          )}
        </div>
      )}

      {action.fn === 'propose_yield' && (
        <InvestForm
          liquid={lease.liquid}
          rent={t.rent}
          buffer={bufferToLock(lease)}
          keep={keep}
          setKeep={setKeep}
          tenantPct={tenantPct}
          setTenantPct={setTenantPct}
          landlordPct={landlordPct}
          setLandlordPct={setLandlordPct}
        />
      )}

      {action.fn === 'rate' && (
        <div className="mt-2">
          <p className="text-[14px] text-ink-muted">
            {live.role === 'tenant' ? 'How was your landlord during this lease?' : 'How was your tenant during this lease?'} Your score is public,
            signed by your wallet, and can only be given once.
          </p>
          <StarPicker value={score} onChange={setScore} />
        </div>
      )}

      {rule && (
        <p className="mt-4 rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-[19px] text-ink-muted">
          <span className="font-semibold text-ink">The rule · </span>
          {explainRule(action.fn === 'fund' && t.yield_offered && action.args?.accept_yield ? 'yield' : rule, { lease, disputeBond: NETWORK.disputeBond })}
        </p>
      )}

      {error && <p className="mt-4 rounded-2xl bg-danger-tint px-4 py-3 text-[14px] font-medium text-danger">{error}</p>}
    </Dialog>
  )
}

function safeUnits(v: string) {
  try {
    return toUnits(v)
  } catch {
    return 0n
  }
}

function factsFor(action: Action, view: LeaseView): { label: ReactNode; value: ReactNode }[] {
  const { lease, claim, guaranteeValue } = view.snap
  const t = lease.terms
  switch (action.fn) {
    case 'fund': {
      const buffer = action.args?.accept_yield ? (t.deposit * BigInt(t.buffer_bps)) / 10_000n : 0n
      return [
        { label: 'First rent (released at move-in)', value: usdc(t.rent) },
        { label: 'Guarantee', value: usdc(t.deposit) },
        ...(buffer ? [{ label: `Buffer (${t.buffer_bps / 100} %)`, value: usdc(buffer) }, { label: 'Lent on Blend', value: usdc(t.deposit - t.rent) }] : []),
        { label: 'Total locked now', value: usdc(t.rent + t.deposit + buffer) },
      ]
    }
    case 'pay_rent':
      return [
        { label: 'Month', value: `${lease.months_settled + 1} of ${t.months}` },
        { label: 'Amount', value: usdc(t.rent) },
      ]
    case 'claim_unpaid':
      return [
        { label: 'Month', value: `${lease.months_settled + 1} of ${t.months}` },
        { label: 'To the landlord, from the guarantee', value: usdc(t.rent) },
      ]
    case 'release': {
      const left = damageClaimable(view.snap)
      const owed = guaranteeValue - left
      return [
        ...(owed > 0n ? [{ label: 'Unpaid months, to the landlord', value: usdc(owed) }] : []),
        { label: 'Back to the tenant', value: usdc(left) },
      ]
    }
    case 'expire_dispute':
      return claim
        ? [
            { label: 'Claimed', value: usdc(claim.amount) },
            { label: 'Tenant offer', value: usdc(claim.offer ?? 0n) },
            { label: 'To the landlord (halfway)', value: usdc((claim.amount + (claim.offer ?? 0n)) / 2n) },
            { label: 'Dispute bond', value: 'Back to the landlord' },
          ]
        : []
    case 'refund_no_keys':
      return [{ label: 'Back to the tenant', value: usdc(lease.rent_escrow + guaranteeValue) }]
    case 'execute_claim':
    case 'accept_counter':
      return claim
        ? [
            { label: 'Claimed', value: usdc(claim.amount) },
            ...(claim.offer != null ? [{ label: 'Tenant offer', value: usdc(claim.offer) }] : []),
          ]
        : []
    case 'respond':
      return claim ? [{ label: 'Claimed by the landlord', value: usdc(claim.amount) }] : []
    case 'approve_yield':
    case 'cancel_yield': {
      const p = view.snap.proposal
      if (!p) return []
      const fund = 10_000 - p.tenant_share_bps - p.landlord_share_bps
      return [
        { label: 'Stays in the contract', value: usdc(p.keep) },
        { label: 'Lent on Blend', value: usdc(lease.liquid - p.keep) },
        { label: 'Tenant buffer', value: `${usdc(p.buffer)}${p.tenant_ok ? ' · locked' : ''}` },
        { label: 'Gain shared', value: `${p.tenant_share_bps / 100} % tenant · ${p.landlord_share_bps / 100} % landlord · ${fund / 100} % fund` },
        { label: 'Approvals', value: `Tenant ${p.tenant_ok ? '✓' : '…'} · Landlord ${p.landlord_ok ? '✓' : '…'}` },
      ]
    }
    case 'exit_blend':
      return [
        { label: 'On Blend now', value: usdc(guaranteeValue - lease.liquid, { decimals: 4 }) },
        { label: 'Principal placed', value: usdc(lease.placed) },
      ]
    default:
      return []
  }
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink">{label}</span>
      {children}
    </label>
  )
}

/** Proposal inputs: how much stays liquid, how the gain is split, and the result. */
function InvestForm(p: {
  liquid: bigint
  rent: bigint
  buffer: bigint
  keep: string
  setKeep: (v: string) => void
  tenantPct: string
  setTenantPct: (v: string) => void
  landlordPct: string
  setLandlordPct: (v: string) => void
}) {
  const keepUnits = safeUnits(p.keep)
  const placed = p.liquid - keepUnits
  const fund = 100 - (Number(p.tenantPct) || 0) - (Number(p.landlordPct) || 0)
  const keptShare = p.liquid > 0n ? Math.min(100, Math.max(0, Number((keepUnits * 1000n) / p.liquid) / 10)) : 100
  return (
    <div className="mt-4 space-y-4">
      <Field label={`Keep in the contract (at least one month: ${usdc(p.rent)})`}>
        <input
          inputMode="decimal"
          value={p.keep}
          onChange={(e) => p.setKeep(e.target.value)}
          className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[16px] font-semibold outline-none focus:border-brand/40"
        />
      </Field>
      <div>
        <div className="flex h-3 overflow-hidden rounded-full bg-brand-tint" aria-hidden>
          <div className="bg-ink/80" style={{ width: `${keptShare}%` }} />
          <div className="flex-1 bg-brand" />
        </div>
        <div className="mt-2 flex justify-between text-[12px] text-ink-muted">
          <span>Kept: {usdc(keepUnits > 0n ? keepUnits : 0n)}</span>
          <span>Invested: {usdc(placed > 0n ? placed : 0n)}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Tenant %">
          <input inputMode="decimal" value={p.tenantPct} onChange={(e) => p.setTenantPct(e.target.value)} className="h-11 w-full rounded-2xl border border-line bg-canvas px-3 text-[15px] outline-none focus:border-brand/40" />
        </Field>
        <Field label="Landlord %">
          <input inputMode="decimal" value={p.landlordPct} onChange={(e) => p.setLandlordPct(e.target.value)} className="h-11 w-full rounded-2xl border border-line bg-canvas px-3 text-[15px] outline-none focus:border-brand/40" />
        </Field>
        <div>
          <span className="mb-1.5 block text-[13px] font-semibold text-ink">Fund %</span>
          <p className={cx('flex h-11 items-center rounded-2xl px-3 text-[15px]', fund < 0 ? 'bg-danger-tint text-danger' : 'bg-canvas text-ink-muted')}>{fund}</p>
        </div>
      </div>
      <p className="text-[12px] leading-[17px] text-ink-muted">
        Nothing moves until the other party approves.{' '}
        {p.buffer > 0n
          ? `On approval the tenant locks a ${usdc(p.buffer)} buffer that absorbs a Blend loss first; withdrawing the proposal gives it back.`
          : "The tenant's buffer is already in the contract from earlier: nothing more is locked."}
      </p>
    </div>
  )
}

function StarPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0)
  const words = ['', 'Poor', 'Below expectations', 'Fine', 'Good', 'Excellent']
  const shown = hover || value
  return (
    <div className="mt-4">
      <div role="radiogroup" aria-label="Rating" className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} out of 5`}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="grid h-12 w-12 place-items-center rounded-2xl transition hover:bg-brand-tint"
          >
            <Star size={30} className={n <= shown ? 'fill-brand text-brand' : 'text-line'} />
          </button>
        ))}
      </div>
      <p className="mt-2 h-5 text-[14px] font-semibold text-brand">{words[shown]}</p>
    </div>
  )
}
