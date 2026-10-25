import { useEffect, useState } from 'react'
import { Star } from 'lucide-react'
import { reputationOf, type Reputation } from '../../stellar/vault'
import { cx } from '../../lib/cx'
import { useLive, type LeaseView } from '../../state/live'
import { short } from '../../stellar/config'

/** Stars for a score out of 5 (fractions shown as a partial star). */
export function Stars({ value, size = 16 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const fill = Math.max(0, Math.min(1, value - (n - 1)))
        return (
          <span key={n} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} className="absolute inset-0 text-line" />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star size={size} className="fill-brand text-brand" />
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** Reputation of an address, read from LeaseVault. Re-read when new events arrive. */
export function useReputation(address: string | undefined): Reputation | null | undefined {
  const { events } = useLive()
  const [rep, setRep] = useState<Reputation | null | undefined>(undefined)
  const ratingEvents = events.filter((e) => e.name === 'rated').length
  useEffect(() => {
    if (!address) return
    let alive = true
    void reputationOf(address).then((r) => alive && setRep(r))
    return () => {
      alive = false
    }
  }, [address, ratingEvents])
  return rep
}

export function ReputationBadge({ address, compact }: { address: string | undefined; compact?: boolean }) {
  const rep = useReputation(address)
  if (rep === undefined) return <span className="text-[12px] text-ink-muted">Reading reputation…</span>
  if (rep === null) return <span className="text-[12px] text-ink-muted">Ratings unavailable (needs LeaseVault v2 and network)</span>
  if (!rep.count || rep.average === null) return <span className="text-[12px] text-ink-muted">No ratings yet</span>
  return (
    <span className={cx('inline-flex items-center gap-2', compact ? 'text-[12px]' : 'text-[13px]')}>
      <Stars value={rep.average} size={compact ? 13 : 15} />
      <span className="tnum font-semibold">{rep.average.toFixed(1)}</span>
      <span className="text-ink-muted">
        · {rep.count} lease{rep.count > 1 ? 's' : ''}
      </span>
    </span>
  )
}

/** Both parties of a lease, their on-chain reputation, and the scores given on this lease. */
export function PartiesCard({ view }: { view: LeaseView }) {
  const l = view.snap.lease
  const r = view.snap.ratings
  const rows = [
    { role: 'Landlord', address: l.landlord, received: r?.by_tenant },
    { role: 'Tenant', address: l.tenant, received: r?.by_landlord },
  ]
  return (
    <section className="card p-5 sm:p-6">
      <p className="text-[16px] font-semibold">Parties & reputation</p>
      <p className="mt-0.5 text-[13px] text-ink-muted">Scores can only come from the other party of a real lease, once it is over.</p>
      <ul className="mt-4 space-y-3">
        {rows.map((p) => (
          <li key={p.role} className="rounded-2xl bg-canvas px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] font-semibold">{p.role}</span>
              <span className="font-mono text-[12px] text-ink-muted">{p.address ? short(p.address) : 'not joined yet'}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
              {p.address ? <ReputationBadge address={p.address} /> : <span className="text-[12px] text-ink-muted">—</span>}
              {p.received !== undefined && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold">
                  This lease: <Stars value={p.received} size={12} />
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
