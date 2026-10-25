import { useEffect, useState, type ReactNode } from 'react'
import { AlertCircle, FileCheck2, Paperclip } from 'lucide-react'
import { Dialog } from '../ui/Dialog'
import { Button } from '../ui/Button'
import { FactRows } from '../ui/misc'
import { useDemo } from '../../state/demo-store'
import { useToast } from '../ui/Toast'
import { claimDeadline, leasesFor, propertyOf, tenantOf } from '../../lib/lease-logic'
import { formatDate, formatEUR } from '../../lib/formatters'
import { cx } from '../../lib/cx'
import type { ClaimCategory } from '../../lib/types'

const CATEGORIES: { value: ClaimCategory; label: string }[] = [
  { value: 'damage', label: 'Damage beyond normal wear' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'missing_items', label: 'Missing items' },
  { value: 'unpaid_rent', label: 'Unpaid rent' },
  { value: 'other', label: 'Other' },
]

const EVIDENCE = ['Check-in report & photos', 'Dated move-out photos', 'Repair invoice or quote', 'Messages with the tenant']

interface Form {
  leaseId: string
  category: ClaimCategory | ''
  amount: string
  description: string
  evidence: string[]
}

/** Claim preparation: form with validation → review → demo-only draft. Never moves funds. */
export function ClaimDialog({ leaseId, onClose }: { leaseId: string | null; onClose: () => void }) {
  const demo = useDemo()
  const toast = useToast()
  const leases = leasesFor(demo)
  const [step, setStep] = useState<'form' | 'review' | 'done'>('form')
  const [form, setForm] = useState<Form>({ leaseId: '', category: '', amount: '', description: '', evidence: [] })
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    if (leaseId) {
      setStep('form')
      setTouched(false)
      setForm({ leaseId, category: '', amount: '', description: '', evidence: [] })
    }
  }, [leaseId])

  if (!leaseId) return null
  const lease = leases.find((l) => l.id === form.leaseId) ?? leases[0]
  const amount = Number(form.amount.replace(',', '.'))

  const errors: Partial<Record<keyof Form, string>> = {}
  if (!form.category) errors.category = 'Choose what the claim is for.'
  if (!form.amount || !Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount above €0.'
  else if (amount > lease.deposit) errors.amount = `A claim can't exceed the ${formatEUR(lease.deposit)} deposit.`
  if (form.description.trim().length < 20) errors.description = 'Describe the issue in at least 20 characters.'
  if (!form.evidence.length) errors.evidence = 'Select at least one piece of evidence you will attach.'
  const valid = Object.keys(errors).length === 0
  const show = (k: keyof Form) => touched && errors[k]

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const cat = CATEGORIES.find((c) => c.value === form.category)?.label

  const save = () => {
    demo.saveClaimDraft({
      leaseId: lease.id,
      category: form.category as ClaimCategory,
      amount,
      description: form.description.trim(),
      evidence: form.evidence,
    })
    setStep('done')
    toast({ title: 'Claim draft saved', body: 'Demo only — not sent to the tenant.', tone: 'demo' })
  }

  return (
    <Dialog
      open
      wide
      onClose={onClose}
      title={step === 'done' ? 'Draft saved' : step === 'review' ? 'Review your claim' : 'Prepare a deposit claim'}
      description={
        step === 'form'
          ? `Claims are possible until ${formatDate(claimDeadline(lease))} and are capped at the deposit.`
          : step === 'review'
            ? 'Check everything before saving the draft.'
            : undefined
      }
      footer={
        step === 'form' ? (
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="lg"
              className="flex-[1.4]"
              onClick={() => {
                setTouched(true)
                if (valid) setStep('review')
              }}
            >
              Continue to review
            </Button>
          </div>
        ) : step === 'review' ? (
          <div className="flex gap-3">
            <Button variant="secondary" size="lg" className="flex-1" onClick={() => setStep('form')}>
              Edit
            </Button>
            <Button size="lg" className="flex-[1.4]" onClick={save}>
              Save demo draft
            </Button>
          </div>
        ) : (
          <Button variant="dark" size="lg" className="w-full" onClick={onClose}>
            Done
          </Button>
        )
      }
    >
      {step === 'form' && (
        <form className="space-y-5" onSubmit={(e) => e.preventDefault()} noValidate>
          <Field label="Lease" htmlFor="claim-lease">
            <select id="claim-lease" value={form.leaseId} onChange={(e) => set('leaseId', e.target.value)} className={input()}>
              {leases.map((l) => (
                <option key={l.id} value={l.id}>
                  {propertyOf(l).neighbourhood} · {tenantOf(l).name} · deposit {formatEUR(l.deposit)}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Claim type" htmlFor="claim-cat" error={show('category')}>
              <select
                id="claim-cat"
                value={form.category}
                onChange={(e) => set('category', e.target.value as ClaimCategory)}
                className={input(!!show('category'))}
                aria-invalid={!!show('category')}
              >
                <option value="">Select…</option>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (€)" htmlFor="claim-amt" error={show('amount')}>
              <input
                id="claim-amt"
                inputMode="decimal"
                placeholder="e.g. 180"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value.replace(/[^\d.,]/g, ''))}
                className={input(!!show('amount'))}
                aria-invalid={!!show('amount')}
              />
            </Field>
          </div>

          <Field label="What happened?" htmlFor="claim-desc" error={show('description')} hint={`${form.description.trim().length}/20 min.`}>
            <textarea
              id="claim-desc"
              rows={4}
              placeholder="e.g. Burn mark on the kitchen worktop, not present in the check-in photos."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={cx(input(!!show('description')), 'h-auto py-3 leading-[22px]')}
              aria-invalid={!!show('description')}
            />
          </Field>

          <fieldset>
            <legend className="mb-2 text-[14px] font-semibold">Evidence you'll attach</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {EVIDENCE.map((e) => {
                const on = form.evidence.includes(e)
                return (
                  <label
                    key={e}
                    className={cx(
                      'flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[14px] transition',
                      on ? 'border-brand bg-brand-tint' : 'border-line hover:border-brand/30',
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => set('evidence', on ? form.evidence.filter((x) => x !== e) : [...form.evidence, e])}
                      className="h-4 w-4 accent-[#6338B8]"
                    />
                    {e}
                  </label>
                )
              })}
            </div>
            {show('evidence') && <ErrorText>{errors.evidence}</ErrorText>}
            <p className="mt-3 flex items-center gap-2 text-[12px] text-ink-muted">
              <Paperclip size={14} /> File uploads are disabled in this prototype: no storage is connected yet.
            </p>
          </fieldset>
        </form>
      )}

      {step === 'review' && (
        <>
          <div className="rounded-xl3 bg-canvas p-5">
            <p className="label">Amount claimed</p>
            <p className="tnum mt-1 text-[36px] font-semibold tracking-[-0.03em]">{formatEUR(amount)}</p>
            <p className="text-[13px] text-ink-muted">
              of a {formatEUR(lease.deposit)} deposit · {formatEUR(lease.deposit - amount)} would be released to {tenantOf(lease).firstName}
            </p>
          </div>
          <FactRows
            rows={[
              { label: 'Lease', value: `${propertyOf(lease).neighbourhood} · ${tenantOf(lease).name}` },
              { label: 'Type', value: cat },
              { label: 'Evidence', value: `${form.evidence.length} item${form.evidence.length > 1 ? 's' : ''}` },
              { label: 'Tenant response window', value: `${lease.responseWindowDays} days` },
            ]}
          />
          <p className="mt-2 rounded-2xl border border-line p-4 text-[14px] leading-[21px]">“{form.description.trim()}”</p>
          <p className="mt-4 flex gap-2 text-[13px] leading-[19px] text-ink-muted">
            <AlertCircle size={16} className="mt-0.5 shrink-0 text-warning" />
            Saving keeps a draft in this demo only. It is not sent to {tenantOf(lease).firstName} and no deposit funds are moved.
          </p>
        </>
      )}

      {step === 'done' && (
        <div className="py-4 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-brand-tint text-brand">
            <FileCheck2 size={30} />
          </span>
          <p className="mt-4 text-[15px] leading-[23px]">
            Your {formatEUR(amount)} claim draft for {propertyOf(lease).neighbourhood} is saved in the demo.
          </p>
          <p className="mx-auto mt-2 max-w-[40ch] text-[13px] leading-[19px] text-ink-muted">
            Nothing was submitted. In the live product you'd submit it before {formatDate(claimDeadline(lease))}, then{' '}
            {tenantOf(lease).firstName} would have {lease.responseWindowDays} days to respond.
          </p>
        </div>
      )}
    </Dialog>
  )
}

const input = (err?: boolean) =>
  cx(
    'h-12 w-full rounded-2xl border bg-white px-4 text-[15px] outline-none transition placeholder:text-[#A9A6B6]',
    'focus:border-brand focus:ring-4 focus:ring-brand/10',
    err ? 'border-danger' : 'border-line',
  )

function Field({ label, htmlFor, error, hint, children }: { label: string; htmlFor: string; error?: string | false; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex justify-between">
        <label htmlFor={htmlFor} className="text-[14px] font-semibold">
          {label}
        </label>
        {hint && <span className="text-[12px] text-ink-muted">{hint}</span>}
      </div>
      {children}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  )
}

const ErrorText = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] text-danger" role="alert">
    <AlertCircle size={14} /> {children}
  </p>
)
