import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { clearSession, readSession, verifyAdmin, writeSession, type Session } from '../lib/auth'

interface AuthValue {
  session: Session | null
  signIn: (user: string, password: string) => Promise<boolean>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(readSession)
  // Sign out automatically when the session expires.
  useEffect(() => {
    if (!session) return
    const timer = setTimeout(() => { clearSession(); setSession(null) }, Math.max(0, session.expiresAt - Date.now()))
    return () => clearTimeout(timer)
  }, [session])
  const value: AuthValue = {
    session,
    signIn: async (user, password) => {
      const ok = await verifyAdmin(user, password)
      if (ok) setSession(writeSession(user.trim()))
      return ok
    },
    signOut: () => { clearSession(); setSession(null) },
  }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

/** Sends visitors without a valid session to /login, then back to where they were going. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const location = useLocation()
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}
