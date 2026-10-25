import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ExternalLink, Menu, X } from 'lucide-react'
import { NAV } from './nav'
import { Avatar, Logo } from '../ui/misc'
import { Pill } from '../ui/Pill'
import { useLive, ROLE_LABEL, ROLE_PERSON } from '../../state/live'
import { LiveRoleSwitcher, WalletCard, networkLine } from '../live/cards'
import { explorerAccount } from '../../stellar/config'
import { cx } from '../../lib/cx'
import { ErrorBoundary } from '../ui/ErrorBoundary'

export function AppShell() {
  const { pathname } = useLocation()
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    setDrawer(false)
    window.scrollTo(0, 0)
  }, [pathname])

  return (
    <div className="min-h-dvh bg-canvas">
      <Sidebar />
      <div className="md:pl-[84px] lg:pl-[264px]">
        <TopBar onMenu={() => setDrawer(true)} />
        <main className="mx-auto w-full max-w-[1180px] px-4 pb-[calc(104px+env(safe-area-inset-bottom))] pt-5 sm:px-6 md:pb-12 lg:px-10 lg:pt-8">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      {drawer && <MobileDrawer onClose={() => setDrawer(false)} />}
    </div>
  )
}

function Sidebar() {
  const { role } = useLive()
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col border-r border-line bg-white md:flex lg:w-[264px]">
      <Link to="/" className="flex h-[72px] items-center justify-center px-6 lg:justify-start" aria-label="Fiável home">
        <span className="lg:hidden">
          <Logo compact />
        </span>
        <span className="hidden lg:inline">
          <Logo />
        </span>
      </Link>
      <nav className="flex-1 space-y-1 px-3 pt-4 lg:px-4" aria-label="App">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={label(role)}
            className={({ isActive }) =>
              cx(
                'group flex h-12 items-center justify-center gap-3 rounded-2xl px-3 text-[15px] font-medium transition lg:justify-start lg:px-4',
                isActive ? 'bg-brand-tint text-brand' : 'text-ink-muted hover:bg-canvas hover:text-ink',
              )
            }
          >
            <Icon size={20} className="shrink-0" />
            <span className="hidden lg:inline">{label(role)}</span>
          </NavLink>
        ))}
      </nav>
      <div className="hidden space-y-3 p-4 lg:block">
        <div>
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Acting as</p>
          <LiveRoleSwitcher full />
        </div>
        <WalletCard />
        <p className="px-1 text-[11px] leading-[16px] text-ink-muted">{networkLine}. Test assets only.</p>
      </div>
    </aside>
  )
}

function TopBar({ onMenu }: { onMenu: () => void }) {
  const { role } = useLive()
  return (
    <header className="sticky top-0 z-20 border-b border-line/70 bg-canvas/85 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-3 px-4 sm:px-6 lg:h-[72px] lg:px-10">
        <button
          onClick={onMenu}
          className="-ml-2 grid h-10 w-10 place-items-center rounded-full text-ink hover:bg-white md:hidden"
          aria-label="Open menu"
        >
          <Menu size={21} />
        </button>
        <Link to="/" className="md:hidden" aria-label="Fiável home">
          <Logo />
        </Link>
        <Pill tone="brand" className="hidden sm:inline-flex" dot>
          Stellar Testnet · live
        </Pill>
        <div className="flex-1" />
        <div className="hidden sm:block lg:hidden">
          <LiveRoleSwitcher />
        </div>
        <span className="hidden text-[13px] text-ink-muted lg:inline">{ROLE_LABEL[role]} view</span>
        <NavLink
          to="/app/activity"
          className={({ isActive }) =>
            cx('relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-white', isActive ? 'text-brand' : 'text-ink')
          }
          aria-label="Activity"
        >
          <Bell size={19} />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand ring-2 ring-canvas" />
        </NavLink>
        <ProfileMenu />
      </div>
    </header>
  )
}

function ProfileMenu() {
  const { role, wallet } = useLive()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const me = ROLE_PERSON[role]

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full p-0.5 transition hover:bg-white"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${me.name}`}
      >
        <Avatar initials={me.initials} size={36} tone={role === 'tenant' ? 'brand' : role === 'landlord' ? 'ink' : 'soft'} />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-12 z-40 w-[260px] animate-rise rounded-xl2 border border-line bg-white p-2 shadow-lift">
          <div className="px-3 pb-3 pt-2">
            <p className="font-semibold">{me.name}</p>
            <p className="text-[13px] text-ink-muted">{me.note}</p>
          </div>
          <div className="h-px bg-line" />
          <MenuItem
            icon={<ExternalLink size={16} />}
            onClick={() => {
              setOpen(false)
              window.open(explorerAccount(wallet.address), '_blank', 'noreferrer')
            }}
          >
            Wallet on Stellar Expert
          </MenuItem>
          <MenuItem
            icon={<ExternalLink size={16} />}
            onClick={() => {
              setOpen(false)
              navigate('/')
            }}
          >
            Back to website
          </MenuItem>
        </div>
      )}
    </div>
  )
}

function MenuItem({ icon, children, onClick, disabled }: { icon: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] transition hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="text-ink-muted">{icon}</span>
      {children}
    </button>
  )
}

function BottomNav() {
  const { role } = useLive()
  return (
    <nav
      aria-label="App"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      <div className="mx-auto grid max-w-[520px] grid-cols-5">
        {NAV.filter((n) => n.mobile).map(({ to, short, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx('flex h-[64px] flex-col items-center justify-center gap-1 text-[11px] font-semibold transition', isActive ? 'text-brand' : 'text-ink-muted')
            }
          >
            {({ isActive }) => (
              <>
                <span className={cx('grid h-8 w-12 place-items-center rounded-full transition', isActive && 'bg-brand-tint')}>
                  <Icon size={20} />
                </span>
                {short(role)}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

function MobileDrawer({ onClose }: { onClose: () => void }) {
  const { role } = useLive()
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', k)
      document.body.style.overflow = ''
    }
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-ink/35 animate-fade" onClick={onClose} />
      <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-[340px] flex-col bg-white p-5 shadow-lift animate-slideInLeft">
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full hover:bg-canvas" aria-label="Close menu" autoFocus>
            <X size={20} />
          </button>
        </div>
        <div className="mt-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-ink-muted">Acting as</p>
          <LiveRoleSwitcher full />
        </div>
        <nav className="mt-6 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx('flex h-12 items-center gap-3 rounded-2xl px-4 text-[15px] font-medium', isActive ? 'bg-brand-tint text-brand' : 'text-ink')
              }
            >
              <Icon size={20} />
              {label(role)}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto">
          <WalletCard />
        </div>
      </div>
    </div>
  )
}
