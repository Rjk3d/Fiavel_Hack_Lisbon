// Optional team sign-in for the app (guests can use everything on testnet).
//
// The password is never stored in clear: only a PBKDF2-SHA256 hash and its salt.
// Override them with VITE_ADMIN_USER / VITE_ADMIN_SALT / VITE_ADMIN_HASH / VITE_ADMIN_ITERATIONS
// (generate with `node scripts/hash-password.mjs "<password>"`).
//
// Signing in is optional: guests use the same testnet app. A team session only
// unlocks demo tools. This is a client-side check, not access control: a static
// site cannot enforce that, and nothing here protects real funds or data.

const env = import.meta.env as Record<string, string | undefined>

export const adminCredential = {
  user: env.VITE_ADMIN_USER ?? 'fiavel-admin',
  salt: env.VITE_ADMIN_SALT ?? '1d65489333b1eef1bb10f4717e290df0',
  hash: env.VITE_ADMIN_HASH ?? '62fe912a60b8fc2346e647e748a5972af0b518dfbac32e21210d7a07251ef15f',
  iterations: Number(env.VITE_ADMIN_ITERATIONS ?? 210_000),
}

const SESSION_KEY = 'fiavel.session'
const SESSION_HOURS = 8

const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, '0')).join('')
const fromHex = (value: string) => new Uint8Array(value.match(/../g)!.map(h => parseInt(h, 16)))

async function derive(password: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(adminCredential.salt), iterations: adminCredential.iterations }, key, 256)
  return hex(bits)
}

/** Constant-time comparison of two hex strings of equal length. */
function same(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function verifyAdmin(user: string, password: string): Promise<boolean> {
  const hash = await derive(password)
  return same(user.trim().toLowerCase(), adminCredential.user.toLowerCase()) && same(hash, adminCredential.hash)
}

export interface Session { kind: 'team' | 'guest'; user: string; expiresAt: number }

export function readSession(): Session | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null') as Session | null
    return s && s.expiresAt > Date.now() ? s : null
  } catch {
    return null
  }
}

export function writeSession(kind: Session['kind'], user: string): Session {
  const s: Session = { kind, user, expiresAt: Date.now() + SESSION_HOURS * 3_600_000 }
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)) } catch { /* Session then lasts for this page only. */ }
  return s
}

export function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY) } catch { /* Nothing stored. */ }
}
