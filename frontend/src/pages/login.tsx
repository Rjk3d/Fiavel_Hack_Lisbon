import { useState, type FormEvent } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, LoaderCircle, LockKeyhole } from 'lucide-react'
import { Brand } from '../components/ui'
import { useAuth } from '../app/auth'

const MAX_ATTEMPTS = 5
const LOCK_SECONDS = 30

export function LoginPage() {
  const { session, signIn } = useAuth()
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

  async function submit(event: FormEvent) {
    event.preventDefault()
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
    setFailures(next)
    setPassword('')
    if (next >= MAX_ATTEMPTS) {
      setFailures(0)
      setLockedUntil(Date.now() + LOCK_SECONDS * 1000)
      setError(`Too many attempts. Try again in ${LOCK_SECONDS} s.`)
    } else {
      setError('Username or password is incorrect.')
    }
  }

  return (
    <main className="login-page">
      <section className="card login-card">
        <Brand />
        <div className="login-heading">
          <span className="login-icon"><LockKeyhole size={20} /></span>
          <span className="eyebrow">TEAM ACCESS</span>
          <h1>Sign in to the demo workspace</h1>
          <p className="muted">Restricted to the Fiável team. Ask the team for access.</p>
        </div>
        <form onSubmit={submit} noValidate>
          <label className="field">
            Username
            <input id="login-user" autoComplete="username" autoCapitalize="none" spellCheck={false} value={user} onChange={e => setUser(e.target.value)} required />
          </label>
          <label className="field">
            Password
            <span className="password-input">
              <input id="login-password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
              <button type="button" className="icon-button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          {error && <p className="error-state" role="alert">{error}</p>}
          <button className="button login-submit" type="submit" disabled={busy}>
            {busy ? <><LoaderCircle size={17} className="spin" /> Checking…</> : 'Sign in'}
          </button>
        </form>
        <p className="login-note">Testnet demo. Fictional data, no real funds.</p>
      </section>
    </main>
  )
}
