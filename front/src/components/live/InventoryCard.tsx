import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Buffer } from 'buffer'
import { Camera, CheckCircle2, FileDown, FileUp, ScanSearch, TriangleAlert } from 'lucide-react'
import { ButtonLink } from '../ui/Button'
import { Pill } from '../ui/Pill'
import { SectionHeader } from '../ui/misc'
import { useLive, type LeaseView } from '../../state/live'
import { claimKey, downloadInventory, importInventory, onChainHash, readJson, useInventories, type ClaimDraft, type Kind, type Saved } from './inventory-shared'

const count = (s: Saved) => {
  const r = s.inventory.rooms
  return `${r.length} room(s) · ${r.reduce((n, x) => n + x.photos.length, 0)} photo(s) · ${r.reduce((n, x) => n + x.defects.length, 0)} defect(s)`
}

/** Status of the move-in and move-out inventories of a lease, on-chain and on this device. */
export function InventoryCard({ view }: { view: LeaseView }) {
  const live = useLive()
  const inv = useInventories(view)
  const party = live.role !== 'arbiter' && live.roleOf(view)
  const status = view.snap.lease.status.tag
  const claim = view.snap.claim
  const draft = readJson<ClaimDraft>(claimKey(view.id))
  const claimHash = claim ? Buffer.from(claim.evidence).toString('hex') : null

  const canStart: Record<Kind, boolean> = {
    entry: party && (status === 'Created' || status === 'Funded'),
    exit: party && (status === 'Active' || status === 'Ended'),
  }

  return (
    <section className="card p-5 sm:p-6">
      <SectionHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            Inventory <Pill tone="brand">AI-assisted · photos stay on your device</Pill>
          </span>
        }
        sub="Room-by-room photos and defects, signed by both parties. Only their hash goes on-chain."
      />
      <div className="space-y-3">
        {(['entry', 'exit'] as Kind[]).map((k) => (
          <Row key={k} view={view} kind={k} saved={k === 'entry' ? inv.entry : inv.exit} canStart={canStart[k]} onImported={() => void inv.refresh()} />
        ))}
      </div>
      {inv.entry && inv.exit && (
        <div className="mt-4">
          <ButtonLink size="sm" to={`/app/leases/${view.id}/inventory/compare`}>
            <ScanSearch size={14} className="mr-1.5" /> Compare move-in and move-out
          </ButtonLink>
        </div>
      )}
      {claimHash && (
        <p className={`mt-4 flex items-start gap-2 text-[13px] ${draft?.evidence === claimHash ? 'text-success' : 'text-ink-muted'}`}>
          {draft?.evidence === claimHash ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
          <span>
            {draft?.evidence === claimHash
              ? `The damage claim's evidence matches the comparison report: ${draft.items.map((i) => `${i.room}: ${i.item}`).join('; ')}${draft.note ? ` · ${draft.note}` : ''}.`
              : 'The damage claim cites evidence that is not on this device: ask the landlord for the comparison report.'}
          </span>
        </p>
      )}
    </section>
  )
}

function Row({ view, kind, saved, canStart, onImported }: { view: LeaseView; kind: Kind; saved?: Saved; canStart: boolean; onImported: () => void }) {
  const chain = onChainHash(view, kind)
  const signedHere = !!chain && saved?.hash === chain
  const label = kind === 'entry' ? 'Move-in' : 'Move-out'
  let text: string
  if (signedHere) text = `Signed on-chain · ${count(saved!)} on this device`
  else if (chain) text = 'Signed on-chain · photos not on this device'
  else if (saved) text = `Saved, not signed yet · ${count(saved)}`
  else text = 'Not done yet'
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-canvas px-4 py-3 text-[14px]">
      <span className="w-[76px] font-semibold">{label}</span>
      <span className={`min-w-0 flex-1 ${signedHere ? 'text-success' : 'text-ink-muted'}`}>{text}</span>
      <span className="flex flex-wrap gap-2">
        {(saved || chain) && (
          <Link to={`/app/leases/${view.id}/inventory/${kind}`} className="text-[13px] font-semibold text-brand hover:underline">
            {chain || !canStart ? 'View' : 'Edit'}
          </Link>
        )}
        {!saved && !chain && canStart && (
          <Link to={`/app/leases/${view.id}/inventory/${kind}`} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
            <Camera size={14} /> Start
          </Link>
        )}
        {saved && (
          <button onClick={() => downloadInventory(saved)} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
            <FileDown size={14} /> File
          </button>
        )}
        {chain && !signedHere && <ImportLink view={view} onDone={onImported} />}
      </span>
    </div>
  )
}

function ImportLink({ view, onDone }: { view: LeaseView; onDone: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <>
      <button onClick={() => input.current?.click()} className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline">
        <FileUp size={14} /> Import
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          try {
            await importInventory(f, view)
            setError(null)
            onDone()
          } catch (err) {
            setError(err instanceof Error ? err.message : 'This file cannot be read.')
          }
        }}
      />
      {error && <span className="basis-full text-[12px] text-danger">{error}</span>}
    </>
  )
}

/**
 * In the signing dialogs (move-in, end of lease, damage claim): which
 * inventory or report hash goes on-chain. Reports the chosen hash (hex), or
 * null to fall back to free notes and files.
 */
export function InventoryEvidence({ view, fn, onChange }: { view: LeaseView; fn: 'confirm_move_in' | 'end_lease' | 'claim_damage'; onChange: (hash: string | null) => void }) {
  const inv = useInventories(view)
  const chain = onChainHash(view, 'entry')
  const draft = fn === 'claim_damage' ? readJson<ClaimDraft>(claimKey(view.id)) : null

  // What can be signed, and whether the user has actually seen it.
  let hash: string | null = null
  let seen = false
  let title = ''
  let detail = ''
  if (fn === 'confirm_move_in' && chain) {
    hash = chain
    seen = inv.entry?.hash === chain
    title = 'Co-sign the move-in inventory the other party signed'
    detail = seen ? count(inv.entry!) : 'You have not seen the photos behind this hash.'
  } else if (fn === 'confirm_move_in' && inv.entry) {
    hash = inv.entry.hash
    seen = true
    title = 'Sign the move-in inventory saved on this device'
    detail = count(inv.entry)
  } else if (fn === 'end_lease' && inv.exit) {
    hash = inv.exit.hash
    seen = true
    title = 'Record the move-out inventory saved on this device'
    detail = count(inv.exit)
  } else if (fn === 'claim_damage' && draft) {
    hash = draft.evidence
    seen = true
    title = 'Evidence from the comparison report'
    detail = `${draft.items.length} item(s): ${draft.items.map((i) => `${i.room}: ${i.item}`).join('; ')}`
  }

  const [use, setUse] = useState(true)
  useEffect(() => {
    if (inv.loaded) setUse(seen)
  }, [inv.loaded, seen])
  useEffect(() => {
    onChange(hash && use ? hash : null)
  }, [hash, use, onChange])

  if (!inv.loaded) return null
  const page = fn === 'claim_damage' ? 'compare' : fn === 'end_lease' ? 'exit' : 'entry'
  if (!hash)
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-3 text-[13px] text-ink-muted">
        No {fn === 'claim_damage' ? 'comparison report' : 'room-by-room inventory'} on this device.{' '}
        <Link to={`/app/leases/${view.id}/inventory/${page}`} className="font-semibold text-brand hover:underline">
          {fn === 'claim_damage' ? 'Compare move-in and move-out' : 'Do it with photos'}
        </Link>{' '}
        (recommended), or describe it below.
      </p>
    )
  return (
    <div className="space-y-2">
      <label className={`flex items-start gap-3 rounded-2xl px-4 py-3 text-[14px] ${seen ? 'bg-brand-tint/60' : 'bg-warning-tint/60'}`}>
        <input type="checkbox" className="mt-1" checked={use} onChange={(e) => setUse(e.target.checked)} />
        <span className="min-w-0">
          <span className="font-semibold">{title}</span>
          <span className={`mt-0.5 block text-[13px] ${seen ? 'text-ink-muted' : 'font-semibold text-warning'}`}>{detail}</span>
          <span className="mt-0.5 block break-all font-mono text-[11px] text-ink-muted">{hash}</span>
        </span>
      </label>
      {!seen && (
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-ink-muted">
          Ask for the inventory file and import it: it is accepted only if it matches.
          <ImportLink view={view} onDone={() => void inv.refresh()} />
        </div>
      )}
      {seen && (
        <Link to={`/app/leases/${view.id}/inventory/${page}`} className="text-[13px] font-semibold text-brand hover:underline">
          Review it
        </Link>
      )}
      {fn === 'confirm_move_in' && chain && (
        <p className="text-[12px] leading-[17px] text-ink-muted">
          Something missing or wrong? Do not sign: tell the other party in Messages. Without both signatures before the move-in deadline, everything goes back to the tenant.
        </p>
      )}
    </div>
  )
}

