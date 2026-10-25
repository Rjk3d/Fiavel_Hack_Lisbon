import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cx } from '../../lib/cx'

/**
 * Accessible modal: centered dialog on desktop, bottom sheet on mobile.
 * `side` turns it into a right-hand drawer on desktop (detail panels).
 * Escape and backdrop click close it; focus moves in and returns on close.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  side = false,
  children,
  footer,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  side?: boolean
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  // Keep the latest onClose without re-running the focus effect on every render.
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current()
      if (e.key === 'Tab' && panel.current) {
        const f = panel.current.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])',
        )
        if (!f.length) return
        const first = f[0]
        const last = f[f.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    requestAnimationFrame(() => panel.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      prev?.focus?.()
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className={cx('fixed inset-0 z-50 flex', side ? 'items-end sm:items-stretch sm:justify-end' : 'items-end sm:items-center sm:justify-center sm:p-6')}>
      <div className="absolute inset-0 bg-ink/35 backdrop-blur-[2px] animate-fade" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-t`}
        aria-describedby={description ? `${id}-d` : undefined}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92dvh] w-full flex-col bg-white shadow-lift outline-none',
          'rounded-t-xl3 animate-slideUp',
          side
            ? 'sm:max-h-none sm:h-full sm:max-w-[480px] sm:rounded-none sm:rounded-l-xl3 sm:animate-slideIn'
            : cx('sm:rounded-xl3 sm:animate-rise', wide ? 'sm:max-w-[640px]' : 'sm:max-w-[480px]'),
        )}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line sm:hidden" aria-hidden />
        <header className="flex items-start gap-4 px-6 pb-3 pt-4 sm:pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={`${id}-t`} className="text-[20px] font-semibold tracking-[-0.01em]">
              {title}
            </h2>
            {description && (
              <p id={`${id}-d`} className="mt-1 text-[14px] leading-[21px] text-ink-muted">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="-mr-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-muted transition hover:bg-brand-tint hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer && <footer className="border-t border-line px-6 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
