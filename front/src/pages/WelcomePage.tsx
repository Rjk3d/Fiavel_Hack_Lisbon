import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react'
import { Logo } from '../components/ui/misc'
import { Button } from '../components/ui/Button'
import { Pill } from '../components/ui/Pill'
import { useAuth } from '../state/auth'

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 30

/** Entry screen: continue as a guest (first, for judges and visitors), or the optional team sign-in. */
export function WelcomePage() {
  const { session, signIn, continueAsGuest } = useAuth()
  const navigate = useNavigate()
  const from = (useLocation().state as { from?: string } | null)?.from ?? '/app'
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [failures, setFailures] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)

  if (session) return <Navigate to={from} replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (Date.now() < lockedUntil) {
      setError(`Too many attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)} s.`)
      return
    }
    if (!user.trim() || !password) {
      setError('Enter your username and password.')
      return
    }
    setBusy(true)
    setError('')
    const ok = await signIn(user, password)
    setBusy(false)
    if (ok) {
      navigate(from, { replace: true })
      return
    }
    const next = failures + 1
    setPassword('')
    if (next >= MAX_ATTEMPTS) {
      setFailures(0)
      setLockedUntil(Date.now() + LOCK_SECONDS * 1000)
      setError(`Too many attempts. Try again in ${LOCK_SECONDS} s.`)
    } else {
      setFailures(next)
      setError('Username or password is incorrect.')
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[radial-gradient(120%_70%_at_50%_0%,#F3EEFF_0%,#FAF9FD_60%)] px-4 py-10">
      <div className="w-full max-w-[920px]">
        <div className="mb-8 flex items-center justify-between">
          <Link to="/" aria-label="Fiável home">
            <Logo />
          </Link>
          <Pill tone="brand" dot>
            Stellar Testnet
          </Pill>
        </div>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
          <section className="brand-surface flex flex-col rounded-xl3 p-6 text-white shadow-brand sm:p-8">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15">
              <UserRound size={20} />
            </span>
            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/70">No account needed</p>
            <h1 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]">Continue as a guest</h1>
            <p className="mt-2 text-[14px] leading-[21px] text-white/75">
              The full app on Stellar Testnet: three test wallets (tenant, landlord, mediator) are created in your browser. Test assets only, no real money.
            </p>
            <ul className="mt-5 space-y-2 text-[14px] text-white/85">
              {['Real contract calls, with Stellar Expert links', 'Ratings and investments recorded on-chain', 'Nothing to install'].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <ShieldCheck size={16} className="shrink-0 text-[#D9C9FA]" /> {t}
                </li>
              ))}
            </ul>
            <div className="flex-1" />
            <button
              onClick={() => {
                continueAsGuest()
                navigate(from, { replace: true })
              }}
              className="mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-full bg-white px-7 text-[16px] font-semibold text-brand transition hover:bg-brand-tint"
            >
              Enter the app <ArrowRight size={18} />
            </button>
          </section>

          <section className="card p-6 sm:p-8">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-tint text-brand">
              <LockKeyhole size={20} />
            </span>
            <p className="eyebrow mt-5">Team access</p>
            <h2 className="mt-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]">Sign in</h2>
            <p className="mt-2 text-[14px] leading-[21px] text-ink-muted">For the Fiável team: unlocks the demo tools (fund every wallet in one click).</p>
            <form onSubmit={submit} noValidate className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold">Username</span>
                <input
                  id="login-user"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={user}
                  onChange={(e) => setUser(e.target.value)}
                  className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 text-[15px] outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[13px] font-semibold">Password</span>
                <span className="relative block">
                  <input
                    id="login-password"
                    type={show ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-12 w-full rounded-2xl border border-line bg-canvas px-4 pr-12 text-[15px] outline-none focus:border-brand/40 focus:ring-4 focus:ring-brand/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-xl text-ink-muted hover:bg-brand-tint hover:text-brand"
                  >
                    {show ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </span>
              </label>
              {error && (
                <p role="alert" className="rounded-2xl bg-danger-tint px-4 py-3 text-[14px] font-medium text-danger">
                  {error}
                </p>
              )}
              <Button type="submit" size="lg" className="w-full" disabled={busy} icon={busy ? <Loader2 size={17} className="animate-spin" /> : undefined}>
                {busy ? 'Checking…' : 'Sign in'}
              </Button>
            </form>
          </section>
        </div>
      </div>
    </main>
  )
}
