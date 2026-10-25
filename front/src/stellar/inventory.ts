import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * Room-by-room inventory (état des lieux) with photos.
 *
 * The contract only stores 32 bytes: the hash of the whole inventory. That
 * hash commits to every room, note, listed defect and photo (each photo by
 * its own SHA-256), so whoever holds the inventory file can prove it is the
 * one both parties signed, and nobody can swap a photo afterwards. Photos
 * stay on the device (IndexedDB) and travel as a file between the parties;
 * they only go to the AI when a party asks for an analysis.
 */

export type Severity = 'minor' | 'moderate' | 'major'

export interface Photo {
  /** SHA-256 of the JPEG bytes, hex. */
  sha256: string
  /** JPEG, base64 without the data: prefix (resized in the browser). */
  data: string
}

export interface Defect {
  item: string
  description: string
  severity: Severity
  /** 1-based photo of the room, 0 when none. */
  photo: number
  source: 'ai' | 'party'
}

export interface Room {
  name: string
  notes: string
  photos: Photo[]
  defects: Defect[]
}

export interface Inventory {
  version: 1
  kind: 'entry' | 'exit'
  contract: string
  leaseId: string
  rooms: Room[]
  /** Address of the party who wrote it. */
  author: string
  /** Unix seconds. */
  createdAt: number
  /** Set when an AI analysis was used for at least one room. */
  aiModel?: string
}

export const ROOM_PRESETS = ['Entrance', 'Living room', 'Kitchen', 'Bedroom', 'Bathroom', 'Balcony'] as const
export const MAX_PHOTOS = 6

const enc = new TextEncoder()

export const hexHash = (bytes: Uint8Array) => bytesToHex(sha256(bytes))
export const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))

/**
 * The exact bytes that are hashed. Built field by field, in a fixed order, so
 * the hash does not depend on how a JSON engine orders keys. Photo data is
 * replaced by its hash.
 */
export function canonical(inv: Inventory): string {
  return JSON.stringify([
    'fiavel-inventory',
    inv.version,
    inv.kind,
    inv.contract,
    inv.leaseId,
    inv.author,
    inv.createdAt,
    inv.aiModel ?? null,
    inv.rooms.map((r) => [
      r.name,
      r.notes,
      r.photos.map((p) => p.sha256),
      r.defects.map((d) => [d.item, d.description, d.severity, d.photo, d.source]),
    ]),
  ])
}

/** The hash signed on-chain (entry_hash / exit_hash). */
export const inventoryHash = (inv: Inventory): string => hexHash(enc.encode(canonical(inv)))

/** Checks every photo against its hash. Returns the rooms whose photos do not match. */
export function brokenPhotos(inv: Inventory): string[] {
  return inv.rooms.filter((r) => r.photos.some((p) => hexHash(b64ToBytes(p.data)) !== p.sha256)).map((r) => r.name)
}

// ── Comparison report (move-out) ─────────────────────────────────────────

export type ChangeKind = 'new_damage' | 'wear' | 'pre_existing' | 'cleaning' | 'missing_item' | 'unclear'

export interface Change {
  item: string
  description: string
  kind: ChangeKind
  severity: Severity
  confidence: 'low' | 'medium' | 'high'
  entry_photo: number | null
  exit_photo: number | null
}

export interface RoomReport {
  name: string
  changes: Change[]
  notComparable: string[]
  summary: string
}

export interface Flag {
  room: string
  level: 'warning' | 'info'
  text: string
}

/**
 * Checks done by code, not by the AI: rooms documented on only one side, and
 * move-out photos that are byte-for-byte move-in photos (reused, so they
 * prove nothing about the state at move-out).
 */
export function flags(entry: Inventory, exit: Inventory): Flag[] {
  const out: Flag[] = []
  const exitRooms = new Map(exit.rooms.map((r) => [r.name.toLowerCase(), r]))
  const entryRooms = new Map(entry.rooms.map((r) => [r.name.toLowerCase(), r]))
  const entryPhotos = new Set(entry.rooms.flatMap((r) => r.photos.map((p) => p.sha256)))
  for (const r of entry.rooms) {
    const x = exitRooms.get(r.name.toLowerCase())
    if (!x || x.photos.length === 0) out.push({ room: r.name, level: 'warning', text: 'Documented at move-in, no move-out photos.' })
  }
  for (const r of exit.rooms) {
    if (!entryRooms.has(r.name.toLowerCase())) out.push({ room: r.name, level: 'warning', text: 'Not in the move-in inventory: nothing to compare with.' })
    const reused = r.photos.filter((p) => entryPhotos.has(p.sha256)).length
    if (reused) out.push({ room: r.name, level: 'warning', text: `${reused} move-out photo(s) are identical to move-in photos.` })
  }
  return out
}

/** Rooms present in both inventories, matched by name. */
export function pairs(entry: Inventory, exit: Inventory): { name: string; entry: Room; exit: Room }[] {
  const byName = new Map(entry.rooms.map((r) => [r.name.toLowerCase(), r]))
  return exit.rooms.flatMap((x) => {
    const e = byName.get(x.name.toLowerCase())
    return e && e.photos.length && x.photos.length ? [{ name: x.name, entry: e, exit: x }] : []
  })
}

export interface Report {
  version: 1
  contract: string
  leaseId: string
  entryHash: string
  exitHash: string
  rooms: RoomReport[]
  flags: Flag[]
  aiModel: string | null
  createdAt: number
}

export function reportCanonical(r: Report): string {
  return JSON.stringify([
    'fiavel-inventory-report',
    r.version,
    r.contract,
    r.leaseId,
    r.entryHash,
    r.exitHash,
    r.aiModel,
    r.createdAt,
    r.rooms.map((x) => [x.name, x.summary, x.notComparable, x.changes.map((c) => [c.item, c.description, c.kind, c.severity, c.confidence, c.entry_photo, c.exit_photo])]),
    r.flags.map((f) => [f.room, f.level, f.text]),
  ])
}

/** Evidence hash of a damage claim: the claimed items and the report they come from. */
export function claimEvidence(report: Report, claimed: { room: string; item: string; description: string }[], note: string): string {
  return hexHash(enc.encode(JSON.stringify(['fiavel-claim', hexHash(enc.encode(reportCanonical(report))), claimed.map((c) => [c.room, c.item, c.description]), note])))
}

// ── Files exchanged between the parties ───────────────────────────────────

export interface InventoryFile {
  format: 'fiavel-inventory'
  inventory: Inventory
  hash: string
}

export const toFile = (inv: Inventory): InventoryFile => ({ format: 'fiavel-inventory', inventory: inv, hash: inventoryHash(inv) })

/** Reads an inventory file and proves it: hash recomputed, every photo checked. */
export function fromFile(text: string): { inventory: Inventory; hash: string } {
  const f = JSON.parse(text) as InventoryFile
  if (f?.format !== 'fiavel-inventory' || !f.inventory?.rooms) throw new Error('Not a Fiável inventory file.')
  const hash = inventoryHash(f.inventory)
  if (hash !== f.hash) throw new Error('The inventory was modified after it was saved.')
  const broken = brokenPhotos(f.inventory)
  if (broken.length) throw new Error(`Photos were modified in: ${broken.join(', ')}.`)
  return { inventory: f.inventory, hash }
}

// ── Storage on this device ────────────────────────────────────────────────

const DB = 'fiavel-inventory'
const STORE = 'inventories'

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'hash' }).createIndex('lease', 'lease')
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

interface Row {
  hash: string
  lease: string
  inventory: Inventory
}

const leaseKey = (contract: string, leaseId: string) => `${contract}:${leaseId}`

export async function saveInventory(inv: Inventory): Promise<string> {
  const hash = inventoryHash(inv)
  const d = await db()
  await new Promise<void>((resolve, reject) => {
    const tx = d.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put({ hash, lease: leaseKey(inv.contract, inv.leaseId), inventory: inv } satisfies Row)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
  return hash
}

/** Every inventory of a lease kept on this device, newest first. */
export async function inventoriesOf(contract: string, leaseId: string): Promise<{ hash: string; inventory: Inventory }[]> {
  try {
    const d = await db()
    const rows = await new Promise<Row[]>((resolve, reject) => {
      const req = d.transaction(STORE).objectStore(STORE).index('lease').getAll(leaseKey(contract, leaseId))
      req.onsuccess = () => resolve(req.result as Row[])
      req.onerror = () => reject(req.error)
    })
    return rows.map((r) => ({ hash: r.hash, inventory: r.inventory })).sort((a, b) => b.inventory.createdAt - a.inventory.createdAt)
  } catch {
    return []
  }
}

// ── Photos ────────────────────────────────────────────────────────────────

/** Resizes a photo to 1280 px on the long side, JPEG: small enough to keep and to analyse. */
export async function preparePhoto(file: Blob, maxSide = 1280): Promise<Photo> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('photo'))), 'image/jpeg', 0.78))
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { sha256: hexHash(bytes), data: btoa(bin) }
}

export const photoUrl = (p: Photo) => `data:image/jpeg;base64,${p.data}`
