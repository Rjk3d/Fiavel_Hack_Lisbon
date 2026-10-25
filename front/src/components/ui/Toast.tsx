import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, X } from 'lucide-react'

type ToastTone = 'info' | 'demo'
interface Toast {
  id: number
  title: string
  body?: string
  tone: ToastTone
}

const Ctx = createContext<(t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id))
  const push = useCallback((t: Omit<Toast, 'id' | 'tone'> & { tone?: ToastTone }) => {
    const id = Date.now() + Math.random()
    setToasts((all) => [...all.slice(-2), { tone: 'info', ...t, id }])
    setTimeout(() => dismiss(id), 4800)
  }, [])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-[380px] animate-rise items-start gap-3 rounded-xl2 bg-ink px-4 py-3 text-white shadow-lift"
          >
            {t.tone === 'demo' ? (
              <Info size={18} className="mt-0.5 shrink-0 text-brand-soft" />
            ) : (
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-soft" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[13px] leading-[18px] text-white/70">{t.body}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="-mr-1 rounded-full p-1 text-white/60 hover:text-white" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
