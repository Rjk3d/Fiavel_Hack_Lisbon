import { Building2, KeyRound } from 'lucide-react'
import { useDemo } from '../../state/demo-store'
import { useToast } from '../ui/Toast'
import { userFor } from '../../lib/lease-logic'
import { cx } from '../../lib/cx'
import type { Role } from '../../lib/types'

const OPTIONS: { role: Role; label: string; icon: typeof KeyRound }[] = [
  { role: 'tenant', label: 'Tenant', icon: KeyRound },
  { role: 'landlord', label: 'Landlord', icon: Building2 },
]

/** Demo role switcher: swaps the whole app between Ana's and Manuel's view. */
export function RoleSwitcher({ full }: { full?: boolean }) {
  const { role, setRole } = useDemo()
  const toast = useToast()
  return (
    <div role="radiogroup" aria-label="Demo view" className={cx('relative inline-grid grid-cols-2 rounded-full bg-[#F1EFF6] p-1', full && 'w-full')}>
      <span
        className={cx(
          'absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-full bg-white shadow-card transition-transform duration-300 ease-out',
          role === 'landlord' ? 'translate-x-[calc(100%+0px)]' : 'translate-x-0',
        )}
        style={{ left: 4 }}
        aria-hidden
      />
      {OPTIONS.map(({ role: r, label, icon: Icon }) => (
        <button
          key={r}
          type="button"
          role="radio"
          aria-checked={role === r}
          onClick={() => {
            if (r === role) return
            setRole(r)
            toast({ title: `Viewing as ${userFor(r).name}`, body: r === 'tenant' ? 'Tenant view · Arroios lease' : 'Landlord view · 2 demo leases' })
          }}
          className={cx(
            'relative z-10 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors',
            role === r ? 'text-brand' : 'text-ink-muted hover:text-ink',
          )}
        >
          <Icon size={14} />
          {label}
        </button>
      ))}
    </div>
  )
}
