import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSignature, Sparkles, Timer } from 'lucide-react'
import type { Terms } from 'lease-vault-client'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Dialog'
import { useLive } from '../../state/live'
import { toUnits, usdc } from '../../stellar/format'
import { cx } from '../../lib/cx'
import { mediatorRegistry, type MediatorRegistry } from '../../stellar/vault'
import { short } from '../../stellar/config'
import deployment from '@deployments/testnet.json'

/** Durations in seconds. Demo mode compresses a month into a minute so a full lease plays out live. */
const MODES = {
  demo: { label: 'Demo · 1 month = 1 minute', period: 60n, grace: 10n, move_in_window: 900n, claim_window: 60n, response_window: 60n, arbitration_window: 120n },
  real: { label: 'Real · 30-day months', period: 30n * 86400n, grace: 5n * 86400n, move_in_window: 14n * 86400n, claim_window: 14n * 86400n, response_window: 7n * 86400n, arbitration_window: 21n * 86400n },
}

export function NewLeaseDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const live = useLive()
  const navigate = useNavigate()
  const [home, setHome] = useState('Rua de Arroios 74, 2.º Esq.')
  const [rent, setRent] = useState('100')
  const [deposit, setDeposit] = useState('200')
  const [months, setMonths] = useState('3')
  const [mode, setMode] = useState<keyof typeof MODES>('demo')
  const [yieldOffered, setYield] = useState(true)
  const [arbiter, setArbiter] = useState(live.wallets.arbiter.address)
  const [registry, setRegistry] = useState<MediatorRegistry | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  // The contract only accepts an approved mediator: offer those, never a free field.
  useEffect(() => {
    if (!open) return
    let alive = true
    mediatorRegistry().then((r) => {
      if (!alive) return
      setRegistry(r)
      if (r?.arbiters.length && !r.arbiters.includes(arbiter)) setArbiter(r.arbiters[0])
    })
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const mediatorName = (a: string) =>
    a === deployment.accounts.arbiter
      ? `Fiável mediator · ${short(a)}`
      : a === live.wallets.arbiter.address
        ? `Your arbiter wallet · ${short(a)}`
        : `Mediator · ${short(a)}`

  async function submit() {
    setError(null)
    let terms: Terms
    try {
      const m = MODES[mode]
      terms = {
        rent: toUnits(rent),
        deposit: toUnits(deposit),
        months: Number(months),
        period: m.period,
        grace: m.grace,
        move_in_window: m.move_in_window,
        claim_window: m.claim_window,
        response_window: m.response_window,
        arbitration_window: m.arbitration_window,
        arbiter: arbiter.trim(),
        yield_offered: yieldOffered,
        buffer_bps: 500,
        tenant_share_bps: 7000,
        landlord_share_bps: 2000,
      }
    } catch {
      setError('Check the amounts.')
      return
    }
    if (terms.rent <= 0n || terms.deposit < terms.rent) return setError('The guarantee must be at least one month of rent.')
    if (!Number.isInteger(terms.months) || terms.months < 1 || terms.months > 24) return setError('Between 1 and 24 months.')
    if (!/^G[A-Z2-7]{55}$/.test(terms.arbiter)) return setError('The arbiter must be a Stellar account (G…).')
    if (registry && !registry.arbiters.includes(terms.arbiter)) return setError('Pick an approved mediator from the registry.')
    const out = await live.run('create_lease', { landlord: live.wallet.address, terms }, 'Lease offer created')
    if (!out) return
    const id = out.result as bigint
    live.setMeta(id, { home })
    onClose()
    navigate(`/app/leases/${id}`)
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      wide
      title="New lease"
      description="The terms go on-chain. The tenant accepts them by funding."
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!!live.busy} icon={<FileSignature size={16} />}>
            {live.busy ? 'Signing and submitting…' : 'Create on Stellar'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Home (stays off-chain)" wide>
          <Input value={home} onChange={setHome} />
        </Field>
        <Field label="Monthly rent (USDC)">
          <Input value={rent} onChange={setRent} inputMode="decimal" />
        </Field>
        <Field label="Guarantee (USDC, ≥ 1 month)">
          <Input value={deposit} onChange={setDeposit} inputMode="decimal" />
        </Field>
        <Field label="Months">
          <Input value={months} onChange={setMonths} inputMode="numeric" />
        </Field>
        <Field label="Arbiter (approved mediator)">
          {registry ? (
            <select
              value={arbiter}
              onChange={(e) => setArbiter(e.target.value)}
              className="h-11 w-full rounded-2xl border border-line bg-canvas px-4 text-[14px] outline-none focus:border-brand/40"
            >
              {registry.arbiters.map((a) => (
                <option key={a} value={a}>
                  {mediatorName(a)}
                </option>
              ))}
            </select>
          ) : (
            <Input value={arbiter} onChange={setArbiter} mono />
          )}
          {registry && (
            <span className="mt-1.5 block text-[12px] text-ink-muted">
              Only mediators in the contract's registry can arbitrate: you cannot name someone yourself.
              {registry.open && !registry.arbiters.includes(live.wallets.arbiter.address)
                ? ' On testnet, switch to the Arbiter role to join it.'
                : ''}
            </span>
          )}
        </Field>
      </div>

      <p className="mb-2 mt-5 text-[13px] font-semibold">
        <Timer size={14} className="mr-1 inline" /> Time scale
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {(Object.keys(MODES) as (keyof typeof MODES)[]).map((k) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={cx('rounded-2xl border px-4 py-3 text-left text-[14px] transition', mode === k ? 'border-brand bg-brand-tint font-semibold text-brand' : 'border-line hover:border-brand/30')}
          >
            {MODES[k].label}
          </button>
        ))}
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-2xl bg-canvas px-4 py-3">
        <input type="checkbox" className="mt-1" checked={yieldOffered} onChange={(e) => setYield(e.target.checked)} />
        <span className="text-[14px]">
          <span className="inline-flex items-center gap-1.5 font-semibold">
            <Sparkles size={14} className="text-brand" /> Offer the yield option (Blend)
          </span>
          <span className="mt-0.5 block text-ink-muted">
            If the tenant accepts, the guarantee minus one month is lent on Blend. One month and a 5 % tenant buffer stay in the contract, you are
            paid first, and any gain is shared 70 % tenant, 20 % you, 10 % arbitration fund.
          </span>
        </span>
      </label>

      {(() => {
        try {
          const r = toUnits(rent)
          const d = toUnits(deposit)
          return (
            <p className="mt-4 text-[13px] text-ink-muted">
              The tenant will lock {usdc(r + d + (yieldOffered ? d / 20n : 0n))} now ({usdc(r)} first rent + {usdc(d)} guarantee
              {yieldOffered ? ` + up to ${usdc(d / 20n)} buffer` : ''}).
            </p>
          )
        } catch {
          return null
        }
      })()}

      {error && <p className="mt-4 rounded-2xl bg-danger-tint px-4 py-3 text-[14px] font-medium text-danger">{error}</p>}
    </Dialog>
  )
}

function Field({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <label className={cx('block', wide && 'sm:col-span-2')}>
      <span className="mb-1.5 block text-[13px] font-semibold">{label}</span>
      {children}
    </label>
  )
}

function Input({ value, onChange, inputMode, mono }: { value: string; onChange: (v: string) => void; inputMode?: 'decimal' | 'numeric'; mono?: boolean }) {
  return (
    <input
      value={value}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={cx('h-11 w-full rounded-2xl border border-line bg-canvas px-4 text-[15px] outline-none focus:border-brand/40', mono && 'font-mono text-[12px]')}
    />
  )
}
