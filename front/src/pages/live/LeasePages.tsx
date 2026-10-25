import { useEffect, useState } from 'react'
import { Buffer } from 'buffer'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Clock3, ExternalLink, FileWarning, Inbox, Plus, Scale, Sparkles } from 'lucide-react'
import { explainRule } from '@agents/explain'
import { ActionPanel } from '../../components/live/ActionPanel'
import { GuaranteeHero, InviteBox, LeaseRow, NextRentCard, NoFunds } from '../../components/live/cards'
import { NewLeaseDialog } from '../../components/live/NewLeaseDialog'
import { InvestCard } from '../../components/live/invest'
import { TermsReview } from '../../components/live/TermsReview'
import { PartiesCard } from '../../components/live/reputation'
import { LeaseChat } from '../../components/live/LeaseChat'
import { InventoryCard } from '../../components/live/InventoryCard'
import { MONTH_PILL, months, statusOf, toActivity } from '../../components/live/lease-view'
import { ActivityList } from '../../components/dashboard/ActivityList'
import { AIInsightCard } from '../../components/ai/AIInsightCard'
import { Button, ButtonLink } from '../../components/ui/Button'
import { EmptyState, FactRows, PageHeader, SectionHeader, Skeleton } from '../../components/ui/misc'
import { Pill } from '../../components/ui/Pill'
import { useLive, ROLE_LABEL, ROLE_PERSON, type LeaseView } from '../../state/live'
import { NETWORK, explorerAccount, explorerContract, explorerTx, short } from '../../stellar/config'
import { getLease } from '../../stellar/vault'
import { clock, duration, relative, usdc } from '../../stellar/format'

export function LiveOverview() {
  const live = useLive()
  const [creating, setCreating] = useState(false)
  const person = ROLE_PERSON[live.role]
  const view = live.mine[0]
  const recent = live.events
    .filter((e) => live.mine.some((m) => m.id === e.leaseId))
    .slice(-4)
    .reverse()
    .map(toActivity)

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[38px]">Hello, {person.name.split(' ')[0]}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">
            {live.role === 'tenant'
              ? "Here's where things stand with your rental."
              : live.role === 'landlord'
                ? 'Your leases and the guarantees held for you.'
                : 'Disputes where you are the named mediator.'}
          </p>
        </div>
        {live.role === 'landlord' && (
          <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
            New lease
          </Button>
        )}
      </header>

      <NoFunds />
      {!live.ready || (live.connection === 'offline' && !live.mine.length) ? (
        <Skeleton className="h-[320px]" />
      ) : live.role === 'arbiter' ? (
        <ArbiterOverview />
      ) : !view ? (
        <section className="card">
          <EmptyState
            icon={<Inbox size={22} />}
            title="No lease yet"
            body={
              live.role === 'tenant'
                ? 'Open the invite link your landlord sent you. In this demo: switch to Landlord, create a lease, then open its invite.'
                : 'Create your first lease: the terms go on-chain and you get an invite link for the tenant.'
            }
            action={live.role === 'landlord' ? <Button onClick={() => setCreating(true)}>Create a lease</Button> : undefined}
          />
        </section>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <GuaranteeHero view={view} landlordView={live.role === 'landlord'} />
            <ActionPanel view={view} compact />
          </div>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
            <div className="space-y-6">
              <NextRentCard view={view} />
              <AIInsightCard
                role={live.role === 'landlord' ? 'landlord' : 'tenant'}
                message={view.insight.headline}
                prompts={[
                  { label: 'What can I do now?', q: 'What can I do now?' },
                  { label: live.role === 'tenant' ? 'When do I get my guarantee back?' : 'What if the rent is late?', q: live.role === 'tenant' ? 'When do I get my deposit back?' : 'What if the rent is late?' },
                ]}
              />
            </div>
            <section className="card p-5 sm:p-6">
              <SectionHeader
                title="Recent activity"
                sub="Read from the contract's events"
                action={
                  <Link to="/app/activity" className="text-[13px] font-semibold text-brand hover:underline">
                    See all
                  </Link>
                }
              />
              {recent.length ? <ActivityList events={recent} compact /> : <p className="text-[14px] text-ink-muted">No events yet.</p>}
            </section>
          </div>
          {live.role === 'landlord' && live.mine.length > 1 && (
            <section>
              <SectionHeader title="All your leases" />
              <div className="space-y-3">
                {live.mine.slice(1).map((v) => (
                  <LeaseRow key={v.id.toString()} view={v} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <NewLeaseDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}

function ArbiterOverview() {
  const live = useLive()
  const disputes = live.mine.filter((v) => v.snap.lease.status.tag === 'Disputed')
  const others = live.mine.filter((v) => v.snap.lease.status.tag !== 'Disputed')
  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6">
        <SectionHeader title="Disputes to resolve" sub="You can only split the disputed amount between the two parties." />
        {disputes.length ? (
          <div className="space-y-3">
            {disputes.map((v) => (
              <LeaseRow key={v.id.toString()} view={v} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<Scale size={22} />} title="No open dispute" body="When a tenant counters a damage claim, it appears here." />
        )}
      </section>
      {others.length > 0 && (
        <section>
          <SectionHeader title="Leases naming you as arbiter" />
          <div className="space-y-3">
            {others.map((v) => (
              <LeaseRow key={v.id.toString()} view={v} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

export function LiveLeases() {
  const live = useLive()
  const [creating, setCreating] = useState(false)
  if (live.role === 'tenant' && live.mine.length === 1) return <LiveLeaseDetail id={live.mine[0].id} />
  return (
    <>
      <PageHeader
        eyebrow={ROLE_LABEL[live.role]}
        title={live.role === 'landlord' ? 'Your leases' : live.role === 'arbiter' ? 'Leases you arbitrate' : 'Your leases'}
        sub="Every lease here lives in the LeaseVault contract on Stellar Testnet."
        right={
          live.role === 'landlord' ? (
            <Button icon={<Plus size={16} />} onClick={() => setCreating(true)}>
              New lease
            </Button>
          ) : undefined
        }
      />
      {live.mine.length ? (
        <div className="space-y-3">
          {live.mine.map((v) => (
            <LeaseRow key={v.id.toString()} view={v} />
          ))}
        </div>
      ) : (
        <section className="card">
          <EmptyState icon={<Inbox size={22} />} title="No lease yet" body={live.role === 'landlord' ? 'Create one to get an invite link.' : 'Open an invite link to join a lease.'} />
        </section>
      )}
      <NewLeaseDialog open={creating} onClose={() => setCreating(false)} />
    </>
  )
}

export function LiveLeaseDetailPage() {
  const { id } = useParams()
  const live = useLive()
  return (
    <>
      <Link to="/app/lease" className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline">
        <ArrowLeft size={16} /> All leases
      </Link>
      {live.ready ? <LiveLeaseDetail id={BigInt(id ?? '0')} /> : <Skeleton className="h-[400px]" />}
    </>
  )
}

export function LiveLeaseDetail({ id }: { id: bigint }) {
  const live = useLive()
  const view = live.leases.find((v) => v.id === id)
  if (!view)
    return (
      <section className="card">
        <EmptyState
          icon={<Inbox size={22} />}
          title={`Lease #${id} is not linked to these wallets`}
          body="Open its invite link, or switch to the role that is party to it."
          action={<ButtonLink to="/app/lease">Back to leases</ButtonLink>}
        />
      </section>
    )
  return <LeaseDetailBody view={view} />
}

function LeaseDetailBody({ view }: { view: LeaseView }) {
  const live = useLive()
  const l = view.snap.lease
  const t = l.terms
  const [label, tone] = statusOf(view)
  // Messages have their own card; the history keeps money and lease steps.
  const history = live.events.filter((e) => e.leaseId === view.id && e.name !== 'message_sent').reverse().map(toActivity)
  const rows = months(view, live.events, live.now)
  const claim = view.snap.claim

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`Lease #${view.id} · ${ROLE_LABEL[live.role]} view${live.roleOf(view) ? '' : ' (not a party)'}`}
        title={view.meta.home}
        sub={view.insight.headline}
        right={
          <div className="self-start sm:self-auto">
            <Pill tone={tone} dot>
              {label}
            </Pill>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <GuaranteeHero view={view} landlordView={live.role === 'landlord'} />
        <ActionPanel view={view} />
      </div>

      {l.status.tag === 'Created' && live.roleOf(view, 'landlord') && <InviteBox view={view} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-5 sm:p-6">
          <SectionHeader title="Deadlines" sub="Counted by the contract from the ledger clock" />
          {view.insight.deadlines.length ? (
            <ul className="space-y-2">
              {view.insight.deadlines.map((d) => (
                <li key={d.label} className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-[14px]">
                  <Clock3 size={16} className={d.at > live.now ? 'text-brand' : 'text-ink-muted'} />
                  <span className="flex-1">{d.label}</span>
                  <span className="tnum font-semibold">{relative(d.at, live.now)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[14px] text-ink-muted">No deadline ahead.</p>
          )}
          {view.insight.facts.length > 0 && (
            <ul className="mt-4 space-y-1.5 text-[13px] leading-[19px] text-ink-muted">
              {view.insight.facts.map((f) => (
                <li key={f}>· {f}</li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-5 sm:p-6">
          <SectionHeader title="Terms on-chain" />
          <FactRows
            rows={[
              { label: 'Rent', value: `${usdc(t.rent)} every ${duration(t.period)}` },
              { label: 'Months', value: `${l.months_settled} of ${t.months} settled` },
              { label: 'Guarantee', value: usdc(t.deposit) },
              { label: 'Grace period', value: duration(t.grace) },
              { label: 'Claim window / response', value: `${duration(t.claim_window)} / ${duration(t.response_window)}` },
              { label: 'Arbiter decides within', value: `${duration(t.arbitration_window)}, then halfway by default` },
              { label: 'Yield option', value: t.yield_offered ? (l.yield_active ? 'Active on Blend' : 'Offered') : 'Not offered' },
            ]}
          />
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <InvestCard view={view} />
        <PartiesCard view={view} />
      </div>

      <InventoryCard view={view} />

      <LeaseChat view={view} />

      {claim && (
        <section className="card border-warning/30 p-5 sm:p-6">
          <SectionHeader title={<span className="inline-flex items-center gap-2"><FileWarning size={18} className="text-warning" /> Damage claim</span>} />
          <FactRows
            rows={[
              { label: 'Claimed', value: usdc(claim.amount) },
              { label: 'Tenant offer', value: claim.offer != null ? usdc(claim.offer) : 'No answer yet' },
              { label: 'Dispute bond', value: usdc(claim.bond) },
              { label: 'Filed', value: clock(Number(claim.filed_at)) },
              { label: 'Evidence hash', value: <span className="font-mono text-[11px]">{Buffer.from(claim.evidence).toString('hex').slice(0, 24)}…</span> },
            ]}
          />
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section className="card p-5 sm:p-6">
          <SectionHeader title="Months" />
          <ul className="divide-y divide-line">
            {rows.map((m) => (
              <li key={m.index} className="flex items-center gap-3 py-3 text-[14px]">
                <span className="flex-1 font-medium">{m.label}</span>
                <span className="text-[12px] text-ink-muted">{m.due ? clock(m.due) : '—'}</span>
                <Pill tone={MONTH_PILL[m.state][1]}>{MONTH_PILL[m.state][0]}</Pill>
                {m.tx && (
                  <a href={explorerTx(m.tx)} target="_blank" rel="noreferrer" className="text-ink-muted hover:text-brand" aria-label="Transaction">
                    <ExternalLink size={14} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-5 sm:p-6">
          <SectionHeader title="History" sub="Contract events" />
          {history.length ? <ActivityList events={history} compact /> : <p className="text-[14px] text-ink-muted">No events yet.</p>}
        </section>
      </div>

      <ChainDetails view={view} />
    </div>
  )
}

function ChainDetails({ view }: { view: LeaseView }) {
  const l = view.snap.lease
  const link = (label: string, href: string, value: string) => ({
    label,
    value: (
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[12px] text-brand hover:underline">
        {value} <ExternalLink size={12} />
      </a>
    ),
  })
  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader title="On Stellar" sub="Everything above is read from these accounts and contracts" />
      <FactRows
        rows={[
          link('LeaseVault contract', explorerContract(NETWORK.leaseVault), short(NETWORK.leaseVault)),
          link('Landlord', explorerAccount(l.landlord), short(l.landlord)),
          ...(l.tenant ? [link('Tenant', explorerAccount(l.tenant), short(l.tenant))] : []),
          link('Arbiter', explorerAccount(l.terms.arbiter), short(l.terms.arbiter)),
          link('USDC (test)', explorerContract(NETWORK.usdc), short(NETWORK.usdc)),
          ...(l.terms.yield_offered ? [link('Blend pool', explorerContract(NETWORK.blendPool), short(NETWORK.blendPool))] : []),
        ]}
      />
    </section>
  )
}

/** Invite link: the tenant reads the terms with the Tenant Guardian, then funds. */
export function JoinPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const live = useLive()
  const leaseId = BigInt(id ?? '0')
  const [missing, setMissing] = useState(false)
  const [accepted, setAccepted] = useState(false)

  useEffect(() => {
    if (live.role !== 'tenant') live.setRole('tenant')
    getLease(leaseId)
      .then(() => live.watch(leaseId, { home: params.get('home') ?? undefined }))
      .catch(() => setMissing(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const view = live.leases.find((v) => v.id === leaseId)
  if (missing)
    return (
      <section className="card">
        <EmptyState icon={<Inbox size={22} />} title="Invite not found" body={`Lease #${id} does not exist on this contract.`} />
      </section>
    )
  if (!view) return <Skeleton className="h-[420px]" />
  if (view.snap.lease.status.tag !== 'Created') {
    return <Navigate to={`/app/leases/${leaseId}`} replace />
  }
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`Invitation · lease #${leaseId}`} title={view.meta.home} sub="Read the terms. When you fund, you accept them: they are enforced by the contract, not by either of you." />
      <NoFunds />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card p-5 sm:p-6">
          <SectionHeader title={<span className="inline-flex items-center gap-2"><Sparkles size={18} className="text-brand" /> Tenant Guardian explains</span>} />
          <div className="space-y-3 text-[14px] leading-[22px]">
            {(['first_rent', 'monthly_rent', 'unpaid_rent', 'end_of_lease', 'damage_claim', 'yield'] as const).map((r) => (
              <p key={r} className="rounded-2xl bg-canvas px-4 py-3">
                {explainRule(r, { lease: view.snap.lease, disputeBond: NETWORK.disputeBond })}
              </p>
            ))}
          </div>
        </section>
        <div className="space-y-6">
          <TermsReview view={view} accepted={accepted} onAccept={setAccepted} />
          {accepted ? (
            <ActionPanel view={view} />
          ) : (
            <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-muted">
              Tick the box above to see the funding options.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
