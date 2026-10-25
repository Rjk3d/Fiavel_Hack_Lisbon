import { useCallback, useEffect, useState } from 'react'
import { Buffer } from 'buffer'
import { X } from 'lucide-react'
import { NETWORK } from '../../stellar/config'
import { fromFile, inventoriesOf, photoUrl, saveInventory, toFile, type ChangeKind, type Inventory, type Photo, type Report, type Severity } from '../../stellar/inventory'
import type { LeaseView } from '../../state/live'
import { cx } from '../../lib/cx'

export type Kind = 'entry' | 'exit'
export interface Saved {
  hash: string
  inventory: Inventory
}

export const KIND_LABEL: Record<Kind, string> = { entry: 'Move-in inventory', exit: 'Move-out inventory' }

/** Hash recorded on-chain for this kind, hex, or null. */
export function onChainHash(view: LeaseView, kind: Kind): string | null {
  const h = kind === 'entry' ? view.snap.lease.entry_hash : view.snap.lease.exit_hash
  return h ? Buffer.from(h).toString('hex') : null
}

/** Inventories of a lease kept on this device, and the one matching the on-chain hash. */
export function useInventories(view: LeaseView) {
  const [all, setAll] = useState<Saved[] | null>(null)
  const id = view.id.toString()
  const refresh = useCallback(() => inventoriesOf(NETWORK.leaseVault, id).then(setAll), [id])
  useEffect(() => {
    void refresh()
  }, [refresh])
  const pick = (kind: Kind): Saved | undefined => {
    const list = (all ?? []).filter((s) => s.inventory.kind === kind)
    const chain = onChainHash(view, kind)
    return chain ? list.find((s) => s.hash === chain) : list[0]
  }
  return { loaded: all !== null, all: all ?? [], entry: pick('entry'), exit: pick('exit'), refresh }
}

export function downloadInventory(s: Saved) {
  const blob = new Blob([JSON.stringify(toFile(s.inventory))], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `fiavel-lease-${s.inventory.leaseId}-${s.inventory.kind}-${s.hash.slice(0, 8)}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1_000)
}

/** Imports a file from the other party: rejected unless every hash checks out and it is for this lease. */
export async function importInventory(file: File, view: LeaseView): Promise<Saved> {
  const { inventory, hash } = fromFile(await file.text())
  if (inventory.contract !== NETWORK.leaseVault || inventory.leaseId !== view.id.toString()) throw new Error(`This file is for another lease (#${inventory.leaseId}).`)
  await saveInventory(inventory)
  return { hash, inventory }
}

export const SEVERITY_TONE: Record<Severity, 'neutral' | 'warning' | 'danger'> = { minor: 'neutral', moderate: 'warning', major: 'danger' }

export const CHANGE_LABEL: Record<ChangeKind, [string, 'danger' | 'neutral' | 'brand' | 'warning']> = {
  new_damage: ['New damage', 'danger'],
  missing_item: ['Missing item', 'danger'],
  cleaning: ['Cleaning', 'warning'],
  unclear: ['Unclear', 'neutral'],
  wear: ['Normal wear', 'neutral'],
  pre_existing: ['Already at move-in', 'brand'],
}

export function Thumb({ photo, n, onRemove, highlight, size = 88 }: { photo: Photo; n: number; onRemove?: () => void; highlight?: boolean; size?: number }) {
  return (
    <figure className={cx('relative shrink-0 overflow-hidden rounded-xl bg-canvas ring-1', highlight ? 'ring-2 ring-brand' : 'ring-line')} style={{ width: size, height: size }}>
      <a href={photoUrl(photo)} target="_blank" rel="noreferrer">
        <img src={photoUrl(photo)} alt={`Photo ${n}`} className="h-full w-full object-cover" loading="lazy" />
      </a>
      <figcaption className="absolute left-1 top-1 rounded-md bg-ink/70 px-1.5 text-[11px] font-semibold text-white">{n}</figcaption>
      {onRemove && (
        <button onClick={onRemove} className="absolute right-1 top-1 rounded-full bg-white/90 p-0.5 text-ink hover:text-danger" aria-label={`Remove photo ${n}`}>
          <X size={13} />
        </button>
      )}
    </figure>
  )
}

export interface ClaimDraft {
  evidence: string
  items: { room: string; item: string; description: string }[]
  note: string
  /** The report the evidence hash was computed from. */
  report: Report
}

export const claimKey = (id: bigint | string) => `fiavel.claim.${NETWORK.leaseVault}.${id}`

export function readJson<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? 'null') as T | null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* not persisted */
  }
}
