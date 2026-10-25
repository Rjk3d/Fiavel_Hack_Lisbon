import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Camera, CheckCircle2, FileDown, FileUp, Inbox, Languages, Plus, ScanSearch, Sparkles, Trash2, TriangleAlert } from 'lucide-react'
import { Button, ButtonLink } from '../../components/ui/Button'
import { EmptyState, PageHeader, Skeleton } from '../../components/ui/misc'
import { Pill } from '../../components/ui/Pill'
import {
  CHANGE_LABEL,
  KIND_LABEL,
  SEVERITY_TONE,
  Thumb,
  downloadInventory,
  importInventory,
  onChainHash,
  useInventories,
  claimKey,
  readJson as read,
  writeJson as write,
  type ClaimDraft,
  type Kind,
  type Saved,
} from '../../components/live/inventory-shared'
import { useLive, type LeaseView } from '../../state/live'
import { NETWORK } from '../../stellar/config'
import {
  MAX_PHOTOS,
  ROOM_PRESETS,
  claimEvidence,
  flags,
  pairs,
  preparePhoto,
  saveInventory,
  type Change,
  type Defect,
  type Inventory,
  type Report,
  type Room,
  type RoomReport,
  type Severity,
} from '../../stellar/inventory'
import { browserLang, type AssistLang } from '../../lib/assistant'
import { AI_MODEL, INVENTORY_AI_ERROR, compareRoom, describeRoom } from '../../lib/inventory-ai'
import { cx } from '../../lib/cx'

const LANG_NAME: Record<AssistLang, string> = { en: 'English', fr: 'Français', pt: 'Português' }
const DEFAULT_ROOMS = ['Entrance', 'Living room', 'Kitchen', 'Bedroom', 'Bathroom']

function useLeaseView(): { view?: LeaseView; ready: boolean; id: string } {
  const { id = '0' } = useParams()
  const live = useLive()
  return { view: live.leases.find((v) => v.id.toString() === id), ready: live.ready, id }
}

function Shell({ id, children }: { id: string; children: ReactNode }) {
  return (
    <>
      <Link to={`/app/leases/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-[14px] font-semibold text-brand hover:underline">
        <ArrowLeft size={16} /> Lease #{id}
      </Link>
      {children}
    </>
  )
}

function NotLinked({ id }: { id: string }) {
  return (
    <section className="card">
      <EmptyState icon={<Inbox size={22} />} title={`Lease #${id} is not linked to these wallets`} body="Switch to the tenant or the landlord of this lease." />
    </section>
  )
}

function LangPicker({ lang, onChange }: { lang: AssistLang; onChange: (l: AssistLang) => void }) {
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
      <Languages size={14} />
      <select value={lang} onChange={(e) => onChange(e.target.value as AssistLang)} className="rounded-lg border border-line bg-white px-2 py-1 text-[12px]" aria-label="AI language">
        {(Object.keys(LANG_NAME) as AssistLang[]).map((k) => (
          <option key={k} value={k}>
            {LANG_NAME[k]}
          </option>
        ))}
      </select>
    </label>
  )
}

function ImportButton({ view, onDone, label = 'Import a file' }: { view: LeaseView; onDone: (s: Saved) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="inline-flex flex-col">
      <Button size="sm" variant="secondary" icon={<FileUp size={14} />} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (!f) return
          setError(null)
          try {
            onDone(await importInventory(f, view))
          } catch (err) {
            setError(err instanceof Error ? err.message : 'This file cannot be read.')
          }
        }}
      />
      {error && <span className="mt-1 text-[12px] text-danger">{error}</span>}
    </span>
  )
}

const AI_NOTE =
  'Photos stay on this device. "Analyse with AI" sends the photos of that room to Fiável\'s server and the Claude API, once. The AI lists what it sees; it never prices damage or decides anything. You review and edit every line before saving.'

// ── Room-by-room inventory ─────────────────────────────────────────────────

export function InventoryEditorPage() {
  const { kind } = useParams()
  const { view, ready, id } = useLeaseView()
  if (kind !== 'entry' && kind !== 'exit') return <NotLinked id={id} />
  return <Shell id={id}>{!ready ? <Skeleton className="h-[420px]" /> : !view ? <NotLinked id={id} /> : <Editor view={view} kind={kind} />}</Shell>
}

function Editor({ view, kind }: { view: LeaseView; kind: Kind }) {
  const live = useLive()
  const inv = useInventories(view)
  const party = live.role !== 'arbiter' && live.roleOf(view)
  const signed = onChainHash(view, kind)
  const signedCopy = signed ? inv.all.find((s) => s.hash === signed) : undefined

  const [rooms, setRooms] = useState<Room[] | null>(null)
  const [usedAi, setUsedAi] = useState(false)
  const [lang, setLang] = useState<AssistLang>(browserLang)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!inv.loaded || rooms) return
    const draft = inv.all.find((s) => s.inventory.kind === kind && s.inventory.author === live.wallet.address)
    if (draft) {
      setRooms(structuredClone(draft.inventory.rooms))
      setUsedAi(!!draft.inventory.aiModel)
    } else if (kind === 'exit' && inv.entry) setRooms(inv.entry.inventory.rooms.map((r) => ({ name: r.name, notes: '', photos: [], defects: [] })))
    else setRooms(DEFAULT_ROOMS.map((name) => ({ name, notes: '', photos: [], defects: [] })))
  }, [inv.loaded, inv.all, inv.entry, kind, rooms, live.wallet.address])

  const header = (
    <PageHeader
      eyebrow={`Lease #${view.id} · ${view.meta.home}`}
      title={KIND_LABEL[kind]}
      sub={
        kind === 'entry'
          ? 'Room by room, before the keys are handed over. What is written here protects the tenant at move-out.'
          : 'The same rooms, at move-out. It is compared with the move-in inventory both parties signed.'
      }
    />
  )

  // Already signed on-chain: show what was signed, never edit it.
  if (signed)
    return (
      <div className="space-y-6">
        {header}
        {signedCopy ? (
          <SignedInventory saved={signedCopy} />
        ) : (
          <section className="card p-5 sm:p-6">
            <p className="text-[14px]">
              A {kind === 'entry' ? 'move-in' : 'move-out'} inventory is signed on-chain (<span className="font-mono text-[12px]">{signed.slice(0, 16)}…</span>), but its photos are not on
              this device. Ask the other party for the file: it is accepted only if it matches this hash.
            </p>
            <div className="mt-3">
              <ImportButton view={view} onDone={() => void inv.refresh()} />
            </div>
          </section>
        )}
      </div>
    )

  if (!party) return <NotLinked id={view.id.toString()} />
  if (!rooms) return <Skeleton className="h-[420px]" />

  if (saved)
    return (
      <div className="space-y-6">
        {header}
        <section className="card border-success/30 p-5 sm:p-6">
          <p className="inline-flex items-center gap-2 text-[16px] font-semibold text-success">
            <CheckCircle2 size={18} /> Inventory saved on this device
          </p>
          <p className="mt-2 text-[14px] text-ink-muted">
            Its fingerprint is <span className="break-all font-mono text-[12px] text-ink">{saved.hash}</span>. It covers every room, note, defect and photo: changing any of them changes it.
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-5 text-[14px]">
            <li>Send the file to the other party (any channel): they can check it matches before signing.</li>
            <li>
              Sign it: open the lease and use <b>{kind === 'entry' ? 'Confirm move-in' : 'End the lease'}</b>; this inventory is filled in.
            </li>
          </ol>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => downloadInventory(saved)}>
              Download the file
            </Button>
            <ButtonLink size="sm" to={`/app/leases/${view.id}`}>
              Back to the lease
            </ButtonLink>
            <Button size="sm" variant="ghost" onClick={() => setSaved(null)}>
              Keep editing
            </Button>
          </div>
        </section>
      </div>
    )

  const update = (i: number, r: Room) => setRooms((all) => all!.map((x, j) => (j === i ? r : x)))
  const withPhotos = rooms.filter((r) => r.photos.length > 0)
  const unnamed = rooms.some((r) => !r.name.trim())
  const duplicate = new Set(rooms.map((r) => r.name.trim().toLowerCase())).size !== rooms.length

  async function save() {
    setSaving(true)
    const inventory: Inventory = {
      version: 1,
      kind,
      contract: NETWORK.leaseVault,
      leaseId: view.id.toString(),
      rooms: withPhotos.map((r) => ({ ...r, name: r.name.trim() })),
      author: live.wallet.address,
      createdAt: Math.floor(Date.now() / 1000),
      aiModel: usedAi ? AI_MODEL : undefined,
    }
    const hash = await saveInventory(inventory)
    await inv.refresh()
    setSaving(false)
    setSaved({ hash, inventory })
  }

  return (
    <div className="space-y-6">
      {header}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-brand-tint/50 px-4 py-3 text-[13px] leading-[19px] text-ink-muted">
        <span className="flex-1">{AI_NOTE}</span>
        <LangPicker lang={lang} onChange={setLang} />
      </div>
      {rooms.map((r, i) => (
        <RoomEditor key={i} room={r} kind={kind} lang={lang} onChange={(x) => update(i, x)} onRemove={() => setRooms(rooms.filter((_, j) => j !== i))} onAi={() => setUsedAi(true)} />
      ))}
      <div className="flex flex-wrap gap-2">
        {ROOM_PRESETS.filter((p) => !rooms.some((r) => r.name.toLowerCase() === p.toLowerCase())).map((p) => (
          <Button key={p} size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setRooms([...rooms, { name: p, notes: '', photos: [], defects: [] }])}>
            {p}
          </Button>
        ))}
        <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setRooms([...rooms, { name: '', notes: '', photos: [], defects: [] }])}>
          Other room
        </Button>
      </div>
      <section className="card flex flex-wrap items-center gap-3 p-5 sm:p-6">
        <p className="flex-1 text-[14px] text-ink-muted">
          {withPhotos.length} room(s) with photos · {withPhotos.reduce((n, r) => n + r.photos.length, 0)} photo(s) · {withPhotos.reduce((n, r) => n + r.defects.length, 0)} defect(s) listed.
          {rooms.length > withPhotos.length && ' Rooms without photos are left out.'}
          {(unnamed || duplicate) && <span className="block text-danger">Give every room a different name.</span>}
        </p>
        <Button onClick={save} disabled={saving || withPhotos.length === 0 || unnamed || duplicate} icon={<CheckCircle2 size={16} />}>
          {saving ? 'Saving…' : 'Save the inventory'}
        </Button>
      </section>
    </div>
  )
}

function RoomEditor({ room, kind, lang, onChange, onRemove, onAi }: { room: Room; kind: Kind; lang: AssistLang; onChange: (r: Room) => void; onRemove: () => void; onAi: () => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notVisible, setNotVisible] = useState<string[]>([])
  const [analysed, setAnalysed] = useState(false)
  const [manual, setManual] = useState<{ item: string; description: string; severity: Severity }>({ item: '', description: '', severity: 'minor' })

  async function addPhotos(files: FileList | null) {
    if (!files?.length) return
    setError(null)
    setBusy('photos')
    try {
      const room0 = room
      const room1 = [...room0.photos]
      for (const f of [...files].slice(0, MAX_PHOTOS - room1.length)) {
        const p = await preparePhoto(f)
        if (!room1.some((x) => x.sha256 === p.sha256)) room1.push(p)
      }
      onChange({ ...room0, photos: room1 })
      if (files.length > MAX_PHOTOS - room0.photos.length) setError(`At most ${MAX_PHOTOS} photos per room: split large rooms in two.`)
    } catch {
      setError('This file is not a photo the browser can read.')
    } finally {
      setBusy(null)
    }
  }

  function removePhoto(i: number) {
    // Defects pointing at a later photo shift with it; at the removed one, they lose the reference.
    const n = i + 1
    onChange({
      ...room,
      photos: room.photos.filter((_, j) => j !== i),
      defects: room.defects.map((d) => ({ ...d, photo: d.photo === n ? 0 : d.photo > n ? d.photo - 1 : d.photo })),
    })
  }

  async function analyse() {
    setBusy('ai')
    setError(null)
    const out = await describeRoom(room.name || 'Room', room.notes, room.photos.map((p) => p.data), lang)
    setBusy(null)
    if (!out.ok) return setError(INVENTORY_AI_ERROR[out.error])
    onAi()
    setAnalysed(true)
    setNotVisible(out.result.not_visible)
    const ai: Defect[] = out.result.defects.map((d) => ({ ...d, source: 'ai' }))
    onChange({ ...room, defects: [...room.defects.filter((d) => d.source === 'party'), ...ai] })
  }

  return (
    <section className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <input
          value={room.name}
          onChange={(e) => onChange({ ...room, name: e.target.value.slice(0, 60) })}
          placeholder="Room name"
          aria-label="Room name"
          className="min-w-0 flex-1 rounded-xl border border-transparent bg-transparent px-2 py-1 text-[18px] font-semibold outline-none hover:border-line focus:border-brand/40"
        />
        <button onClick={onRemove} className="text-ink-muted hover:text-danger" aria-label={`Remove ${room.name || 'room'}`}>
          <Trash2 size={16} />
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {room.photos.map((p, i) => (
          <Thumb key={p.sha256} photo={p} n={i + 1} onRemove={() => removePhoto(i)} />
        ))}
        {room.photos.length < MAX_PHOTOS && (
          <button
            onClick={() => input.current?.click()}
            className="grid h-[88px] w-[88px] place-items-center rounded-xl border-2 border-dashed border-line text-ink-muted hover:border-brand/40 hover:text-brand"
            disabled={busy === 'photos'}
          >
            <span className="flex flex-col items-center gap-1 text-[11px] font-semibold">
              <Camera size={20} />
              {busy === 'photos' ? 'Adding…' : 'Add photos'}
            </span>
          </button>
        )}
        <input ref={input} type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ''))} />
      </div>

      <textarea
        value={room.notes}
        onChange={(e) => onChange({ ...room, notes: e.target.value.slice(0, 1_000) })}
        rows={2}
        placeholder={kind === 'entry' ? 'Notes: meter readings, keys, appliances, anything the photos do not show' : 'Notes at move-out'}
        className="mt-3 w-full resize-none rounded-2xl border border-line bg-canvas px-4 py-3 text-[14px] outline-none focus:border-brand/40"
      />

      {kind === 'entry' && (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="flex-1 text-[14px] font-semibold">Defects already there ({room.defects.length})</p>
            <Button size="sm" variant="secondary" icon={<ScanSearch size={14} />} onClick={analyse} disabled={!room.photos.length || !!busy}>
              {busy === 'ai' ? 'Analysing…' : analysed || room.defects.some((d) => d.source === 'ai') ? 'Analyse again' : 'Analyse with AI'}
            </Button>
          </div>
          {room.defects.length > 0 && (
            <ul className="space-y-2">
              {room.defects.map((d, i) => (
                <li key={i} className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-2.5 text-[14px]">
                  <div className="min-w-0 flex-1">
                    <p>
                      <span className="font-semibold">{d.item}</span> · {d.description}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                      <Pill tone={SEVERITY_TONE[d.severity]}>{d.severity}</Pill>
                      {d.photo > 0 && <span>photo {d.photo}</span>}
                      <span>{d.source === 'ai' ? 'found by the AI · check it' : 'added by you'}</span>
                    </p>
                  </div>
                  <button onClick={() => onChange({ ...room, defects: room.defects.filter((_, j) => j !== i) })} className="mt-1 text-ink-muted hover:text-danger" aria-label="Remove defect">
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {analysed && room.defects.length === 0 && <p className="text-[13px] text-success">The AI saw no defect in these photos. Check them yourself before saving.</p>}
          {notVisible.length > 0 && (
            <p className="rounded-2xl bg-warning-tint/60 px-4 py-2.5 text-[13px] text-ink">
              <TriangleAlert size={13} className="mr-1 inline text-warning" />
              Not visible enough to judge: {notVisible.join('; ')}. Add a photo if it matters.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={manual.item}
              onChange={(e) => setManual({ ...manual, item: e.target.value.slice(0, 80) })}
              placeholder="Item (e.g. oven door)"
              className="min-w-[140px] flex-1 rounded-xl border border-line px-3 py-2 text-[13px] outline-none focus:border-brand/40"
            />
            <input
              value={manual.description}
              onChange={(e) => setManual({ ...manual, description: e.target.value.slice(0, 200) })}
              placeholder="What is wrong"
              className="min-w-[160px] flex-[2] rounded-xl border border-line px-3 py-2 text-[13px] outline-none focus:border-brand/40"
            />
            <select value={manual.severity} onChange={(e) => setManual({ ...manual, severity: e.target.value as Severity })} className="rounded-xl border border-line bg-white px-2 py-2 text-[13px]" aria-label="Severity">
              <option value="minor">minor</option>
              <option value="moderate">moderate</option>
              <option value="major">major</option>
            </select>
            <Button
              size="sm"
              variant="ghost"
              icon={<Plus size={14} />}
              disabled={!manual.item.trim() || !manual.description.trim()}
              onClick={() => {
                onChange({ ...room, defects: [...room.defects, { ...manual, item: manual.item.trim(), description: manual.description.trim(), photo: 0, source: 'party' }] })
                setManual({ item: '', description: '', severity: 'minor' })
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[12px] text-warning">{error}</p>}
    </section>
  )
}

function SignedInventory({ saved }: { saved: Saved }) {
  const inv = saved.inventory
  return (
    <div className="space-y-6">
      <section className="card flex flex-wrap items-center gap-3 p-5 sm:p-6">
        <p className="flex-1 text-[14px]">
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <CheckCircle2 size={16} /> Matches the hash signed on-chain
          </span>
          <span className="mt-0.5 block text-ink-muted">
            Written by {inv.author.slice(0, 6)}… on {new Date(inv.createdAt * 1000).toLocaleString()}
            {inv.aiModel && ' · AI-assisted, reviewed by the author'}
          </span>
        </p>
        <Button size="sm" variant="secondary" icon={<FileDown size={14} />} onClick={() => downloadInventory(saved)}>
          Download the file
        </Button>
      </section>
      {inv.rooms.map((r) => (
        <section key={r.name} className="card p-5 sm:p-6">
          <h2 className="mb-3 text-[18px] font-semibold">{r.name}</h2>
          <div className="flex flex-wrap gap-2">
            {r.photos.map((p, i) => (
              <Thumb key={p.sha256} photo={p} n={i + 1} />
            ))}
          </div>
          {r.notes && <p className="mt-3 text-[14px] text-ink-muted">{r.notes}</p>}
          {r.defects.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-[14px]">
              {r.defects.map((d, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <Pill tone={SEVERITY_TONE[d.severity]}>{d.severity}</Pill>
                  <span>
                    <b>{d.item}</b> · {d.description}
                    {d.photo > 0 && <span className="text-ink-muted"> (photo {d.photo})</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  )
}

// ── Move-in vs move-out ─────────────────────────────────────────────────────

const CLAIMABLE = new Set<Change['kind']>(['new_damage', 'missing_item', 'cleaning', 'unclear'])

interface StoredReport {
  rooms: Record<string, RoomReport>
  createdAt: number
}

const reportKey = (id: string, e: string, x: string) => `fiavel.report.${NETWORK.leaseVault}.${id}.${e.slice(0, 16)}.${x.slice(0, 16)}`

export function InventoryComparePage() {
  const { view, ready, id } = useLeaseView()
  return <Shell id={id}>{!ready ? <Skeleton className="h-[420px]" /> : !view ? <NotLinked id={id} /> : <Compare view={view} />}</Shell>
}

function Compare({ view }: { view: LeaseView }) {
  const live = useLive()
  const inv = useInventories(view)
  const [lang, setLang] = useState<AssistLang>(browserLang)
  const { entry, exit } = inv

  const header = (
    <PageHeader
      eyebrow={`Lease #${view.id} · ${view.meta.home}`}
      title="Move-in vs move-out"
      sub="Room by room, the photos both parties signed. The AI points out what changed; the photos remain the evidence."
    />
  )

  if (!inv.loaded) return <Skeleton className="h-[420px]" />
  if (!entry || !exit)
    return (
      <div className="space-y-6">
        {header}
        <section className="card space-y-3 p-5 sm:p-6 text-[14px]">
          <p>Both inventories are needed on this device:</p>
          <ul className="space-y-1">
            <li>{entry ? '✓' : '✗'} Move-in inventory</li>
            <li>{exit ? '✓' : '✗'} Move-out inventory</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <ImportButton view={view} onDone={() => void inv.refresh()} />
            {!exit && live.roleOf(view) && live.role !== 'arbiter' && (
              <ButtonLink size="sm" to={`/app/leases/${view.id}/inventory/exit`}>
                Do the move-out inventory
              </ButtonLink>
            )}
          </div>
        </section>
      </div>
    )
  return <CompareBody view={view} entry={entry} exit={exit} lang={lang} setLang={setLang} header={header} />
}

function CompareBody({ view, entry, exit, lang, setLang, header }: { view: LeaseView; entry: Saved; exit: Saved; lang: AssistLang; setLang: (l: AssistLang) => void; header: ReactNode }) {
  const live = useLive()
  const id = view.id.toString()
  const key = reportKey(id, entry.hash, exit.hash)
  const [stored, setStored] = useState<StoredReport>(() => read<StoredReport>(key) ?? { rooms: {}, createdAt: 0 })
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [draft, setDraft] = useState<ClaimDraft | null>(() => read<ClaimDraft>(claimKey(id)))

  const roomPairs = useMemo(() => pairs(entry.inventory, exit.inventory), [entry, exit])
  const checks = useMemo(() => flags(entry.inventory, exit.inventory), [entry, exit])
  const entryOnChain = onChainHash(view, 'entry')
  const exitOnChain = onChainHash(view, 'exit')
  const isLandlord = live.role === 'landlord' && live.roleOf(view)
  const canClaim = isLandlord && view.snap.lease.status.tag === 'Ended'

  const report: Report = {
    version: 1,
    contract: NETWORK.leaseVault,
    leaseId: id,
    entryHash: entry.hash,
    exitHash: exit.hash,
    rooms: roomPairs.flatMap((p) => (stored.rooms[p.name] ? [stored.rooms[p.name]] : [])),
    flags: checks,
    aiModel: Object.keys(stored.rooms).length ? AI_MODEL : null,
    createdAt: stored.createdAt,
  }

  async function run(names: string[]) {
    setError(null)
    let next = stored
    for (const p of roomPairs.filter((x) => names.includes(x.name))) {
      setBusy(p.name)
      const out = await compareRoom({
        room: p.name,
        entryNotes: p.entry.notes,
        exitNotes: p.exit.notes,
        entryDefects: p.entry.defects.map((d) => `${d.item}: ${d.description} (${d.severity})`),
        entryPhotos: p.entry.photos.map((x) => x.data),
        exitPhotos: p.exit.photos.map((x) => x.data),
        lang,
      })
      if (!out.ok) {
        setError(`${p.name}: ${INVENTORY_AI_ERROR[out.error]}`)
        break
      }
      next = {
        rooms: { ...next.rooms, [p.name]: { name: p.name, changes: out.result.changes, notComparable: out.result.not_comparable, summary: out.result.summary } },
        createdAt: Math.floor(Date.now() / 1000),
      }
      setStored(next)
      write(key, next)
    }
    setBusy(null)
  }

  const items = [...picked].map((k) => {
    const [room, i] = k.split('|')
    const c = stored.rooms[room].changes[Number(i)]
    return { room, item: c.item, description: c.description }
  })

  function prepareClaim() {
    const d: ClaimDraft = { evidence: claimEvidence(report, items, note.trim()), items, note: note.trim(), report }
    write(claimKey(id), d)
    setDraft(d)
  }

  function downloadReport() {
    const blob = new Blob([JSON.stringify({ format: 'fiavel-inventory-report', report, claim: draft })], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `fiavel-lease-${id}-report.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1_000)
  }

  const pending = roomPairs.filter((p) => !stored.rooms[p.name]).map((p) => p.name)

  return (
    <div className="space-y-6">
      {header}

      <section className="card space-y-2 p-5 sm:p-6 text-[14px]">
        <HashLine label="Move-in inventory" local={entry.hash} chain={entryOnChain} />
        <HashLine label="Move-out inventory" local={exit.hash} chain={exitOnChain} />
        {checks.map((f, i) => (
          <p key={i} className="flex items-start gap-2 text-warning">
            <TriangleAlert size={15} className="mt-0.5 shrink-0" />
            <span>
              <b>{f.room}</b>: {f.text}
            </span>
          </p>
        ))}
        <p className="text-[12px] text-ink-muted">These checks are done by code, not by the AI.</p>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button icon={<Sparkles size={16} />} onClick={() => void run(pending.length ? pending : roomPairs.map((p) => p.name))} disabled={!!busy || roomPairs.length === 0}>
          {busy ? `Comparing ${busy}…` : pending.length ? `Compare ${pending.length} room(s) with AI` : 'Compare again'}
        </Button>
        <LangPicker lang={lang} onChange={setLang} />
        <Button variant="secondary" icon={<FileDown size={16} />} onClick={downloadReport}>
          Download the report
        </Button>
      </div>
      {error && <p className="text-[13px] text-warning">{error}</p>}
      <p className="text-[12px] leading-[18px] text-ink-muted">
        The photos of each room go to the Claude API only when you click Compare. AI observations can be wrong: check them on the photos. The amount is set by the landlord, answered by
        the tenant and, in a dispute, decided by the arbiter.
      </p>

      {roomPairs.map((p) => {
        const r = stored.rooms[p.name]
        return (
          <section key={p.name} className="card p-5 sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-[18px] font-semibold">{p.name}</h2>
              {r && (
                <Button size="sm" variant="ghost" onClick={() => void run([p.name])} disabled={!!busy}>
                  Compare again
                </Button>
              )}
            </div>
            <PhotoRow label="Move-in" photos={p.entry.photos} />
            <PhotoRow label="Move-out" photos={p.exit.photos} />
            {p.entry.defects.length > 0 && (
              <p className="mt-2 text-[13px] text-ink-muted">
                Signed at move-in: {p.entry.defects.map((d) => `${d.item} (${d.description})`).join('; ')}
              </p>
            )}
            {r ? (
              <div className="mt-4 space-y-2">
                <p className="text-[14px]">{r.summary}</p>
                {r.changes.length === 0 && <p className="text-[14px] text-success">No change seen.</p>}
                <ul className="space-y-2">
                  {r.changes.map((c, i) => {
                    const k = `${p.name}|${i}`
                    const [label, tone] = CHANGE_LABEL[c.kind]
                    return (
                      <li key={k} className="flex items-start gap-3 rounded-2xl bg-canvas px-4 py-2.5 text-[14px]">
                        {canClaim && CLAIMABLE.has(c.kind) && (
                          <input
                            type="checkbox"
                            className="mt-1"
                            aria-label={`Include ${c.item} in the claim`}
                            checked={picked.has(k)}
                            onChange={(e) => {
                              const s = new Set(picked)
                              if (e.target.checked) s.add(k)
                              else s.delete(k)
                              setPicked(s)
                            }}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p>
                            <b>{c.item}</b> · {c.description}
                          </p>
                          <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-muted">
                            <Pill tone={tone}>{label}</Pill>
                            <Pill tone={SEVERITY_TONE[c.severity]}>{c.severity}</Pill>
                            <span>confidence {c.confidence}</span>
                            {c.entry_photo && <span>move-in photo {c.entry_photo}</span>}
                            {c.exit_photo && <span>move-out photo {c.exit_photo}</span>}
                          </p>
                        </div>
                      </li>
                    )
                  })}
                </ul>
                {r.notComparable.length > 0 && <p className="text-[12px] text-ink-muted">Could not compare: {r.notComparable.join('; ')}.</p>}
              </div>
            ) : (
              <p className="mt-3 text-[13px] text-ink-muted">Not compared yet.</p>
            )}
          </section>
        )
      })}

      {canClaim && (
        <section className="card p-5 sm:p-6">
          <h2 className="text-[18px] font-semibold">Damage claim evidence</h2>
          <p className="mt-1 text-[14px] text-ink-muted">
            Tick the changes you claim for, add your invoice or quote reference, then prepare the evidence. Its hash goes on-chain with the claim; the tenant gets this report to check
            it.
          </p>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={2}
            placeholder="Invoice or quote, e.g. Painter quote #41, 80 USDC"
            className="mt-3 w-full resize-none rounded-2xl border border-line bg-canvas px-4 py-3 text-[14px] outline-none focus:border-brand/40"
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={prepareClaim} disabled={items.length === 0}>
              Prepare evidence ({items.length} item{items.length === 1 ? '' : 's'})
            </Button>
            {draft && (
              <span className="text-[13px] text-success">
                Ready: <span className="font-mono text-[12px]">{draft.evidence.slice(0, 16)}…</span> · open the lease and file the damage claim.
              </span>
            )}
          </div>
        </section>
      )}
    </div>
  )
}

function HashLine({ label, local, chain }: { label: string; local: string; chain: string | null }) {
  const ok = chain === local
  return (
    <p className={cx('flex items-start gap-2', ok ? 'text-success' : chain ? 'text-danger' : 'text-ink-muted')}>
      {ok ? <CheckCircle2 size={15} className="mt-0.5 shrink-0" /> : <TriangleAlert size={15} className="mt-0.5 shrink-0" />}
      <span>
        <b>{label}</b>:{' '}
        {ok ? 'matches the hash signed on-chain.' : chain ? 'does NOT match the hash signed on-chain: this is not the signed version.' : 'not signed on-chain yet (local version).'}
      </span>
    </p>
  )
}

function PhotoRow({ label, photos }: { label: string; photos: Room['photos'] }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="w-[70px] shrink-0 text-[12px] font-semibold text-ink-muted">{label}</span>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {photos.map((p, i) => (
          <Thumb key={p.sha256} photo={p} n={i + 1} size={72} />
        ))}
      </div>
    </div>
  )
}
