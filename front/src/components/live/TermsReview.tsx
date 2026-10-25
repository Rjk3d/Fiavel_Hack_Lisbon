import { useEffect, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Gavel, ShieldAlert } from 'lucide-react'
import { riskFlags, type ArbiterRecord } from '@agents/rules'
import { FactRows } from '../ui/misc'
import { ReputationBadge } from './reputation'
import { arbiterRecordOf } from '../../stellar/vault'
import { explorerAccount, short } from '../../stellar/config'
import { duration, usdc } from '../../stellar/format'
import { cx } from '../../lib/cx'
import type { LeaseView } from '../../state/live'

/**
 * Everything a tenant accepts by funding, in one place: every term the contract
 * enforces, who decides disputes and how they decided before, the landlord's
 * reputation, and the red flags the rule engine finds in these terms.
 */
export function TermsReview({ view, accepted, onAccept }: { view: LeaseView; accepted: boolean; onAccept: (v: boolean) => void }) {
  const l = view.snap.lease
  const t = l.terms
  const [record, setRecord] = useState<ArbiterRecord | null | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void arbiterRecordOf(t.arbiter).then((r) => alive && setRecord(r))
    return () => {
      alive = false
    }
  }, [t.arbiter])

  const flags = riskFlags(l, record ?? undefined)
  const dangers = flags.filter((f) => f.level === 'danger').length
  const fundShare = (10_000 - t.tenant_share_bps - t.landlord_share_bps) / 100

  return (
    <section className="card overflow-hidden">
      <div className="p-5 sm:p-6">
        <p className="text-[16px] font-semibold">What you agree to</p>
        <p className="mt-0.5 text-[13px] text-ink-muted">Read from the contract. Nobody can change these terms after you fund.</p>

        <div className="mt-4">
          <FactRows
            rows={[
              { label: 'Rent', value: `${usdc(t.rent)} every ${duration(t.period)}` },
              { label: 'Length', value: `${t.months} months` },
              { label: 'Guarantee', value: usdc(t.deposit) },
              { label: 'Grace before an unpaid month is taken', value: duration(t.grace) },
              { label: 'Time to fund and move in', value: duration(t.move_in_window) },
              { label: 'Landlord can claim damage for', value: `${duration(t.claim_window)} after the end` },
              { label: 'You have to answer a claim within', value: duration(t.response_window) },
              { label: 'Arbiter decides within', value: `${duration(t.arbitration_window)}, then the tenant's offer applies` },
              {
                label: 'Yield option',
                value: t.yield_offered
                  ? `Offered · ${t.buffer_bps / 100} % buffer · gain ${t.tenant_share_bps / 100} / ${t.landlord_share_bps / 100} / ${fundShare} %`
                  : 'Not offered',
              },
            ]}
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Party title="Landlord" address={l.landlord}>
            <ReputationBadge address={l.landlord} compact />
          </Party>
          <Party title="Arbiter" address={t.arbiter} icon={<Gavel size={14} />}>
            <span className="text-[12px] text-ink-muted">{arbiterLine(record)}</span>
          </Party>
        </div>
      </div>

      <div className={cx('border-t px-5 py-4 sm:px-6', dangers ? 'border-danger/20 bg-danger-tint/60' : flags.length ? 'border-warning/20 bg-warning-tint/60' : 'border-line bg-success-tint/50')}>
        {flags.length === 0 ? (
          <p className="flex items-center gap-2 text-[14px] font-semibold text-success">
            <CheckCircle2 size={17} /> No red flag in these terms.
          </p>
        ) : (
          <ul className="space-y-2">
            {flags.map((f) => (
              <li key={f.text} className={cx('flex gap-2 text-[14px] leading-[20px]', f.level === 'danger' ? 'text-danger' : 'text-warning')}>
                {f.level === 'danger' ? <ShieldAlert size={17} className="mt-0.5 shrink-0" /> : <AlertTriangle size={17} className="mt-0.5 shrink-0" />}
                <span className="font-medium">{f.text}</span>
              </li>
            ))}
          </ul>
        )}
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px]">
          <input id="terms-accept" type="checkbox" className="mt-1 h-4 w-4 accent-[#6338B8]" checked={accepted} onChange={(e) => onAccept(e.target.checked)} />
          <span>
            I have read these terms{flags.length ? ' and the points above' : ''}. Funding locks them on-chain.
          </span>
        </label>
      </div>
    </section>
  )
}

function arbiterLine(r: ArbiterRecord | null | undefined): string {
  if (r === undefined) return 'Reading decisions…'
  if (r === null) return 'Decision record needs LeaseVault v4'
  if (r.cases === 0) return 'No dispute decided yet'
  const share = r.claimed > 0n ? Number((r.to_landlord * 1000n) / r.claimed) / 10 : 0
  return `${r.cases} dispute${r.cases > 1 ? 's' : ''} · landlords got ${share} % of what they claimed`
}

function Party({ title, address, icon, children }: { title: string; address: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-canvas px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold">
          {icon}
          {title}
        </span>
        <a href={explorerAccount(address)} target="_blank" rel="noreferrer" className="font-mono text-[12px] text-ink-muted hover:text-brand">
          {short(address)}
        </a>
      </div>
      <div className="mt-1">{children}</div>
    </div>
  )
}
