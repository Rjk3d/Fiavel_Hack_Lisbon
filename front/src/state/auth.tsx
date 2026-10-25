import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { clearSession, readSession, verifyAdmin, writeSession, type Session } from '../lib/auth'

/**
 * Optional sign-in. Entering the app asks once: sign in as the team, or continue
 * as a guest. Both get the full testnet app; the team session adds demo tools.
 */
interface AuthValue {
  session: Session | null
  isTeam: boolean
  signIn: (user: string, password: string) => Promise<boolean>
  continueAsGuest: () => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)

  // A session ends on its own after its lifetime.
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => {
      clearSession()
      setSession(null)
    }, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session])

  const value: AuthValue = {
    session,
    isTeam: session?.kind === 'team',
    signIn: async (user, password) => {
      const ok = await verifyAdmin(user, password)
      if (ok) setSession(writeSession('team', user.trim()))
      return ok
    },
    continueAsGuest: () => setSession(writeSession('guest', 'guest')),
    signOut: () => {
      clearSession()
      setSession(null)
    },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** Shows the welcome screen once per tab session, then lets everyone in. */
export function RequireChoice({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/welcome" replace state={{ from: location.pathname + location.search }} />
  return children
}
