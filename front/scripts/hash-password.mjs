// Generates the admin credential hash used by the login screen.
//   node scripts/hash-password.mjs "<password>"
// Paste the printed values into .env.local (VITE_ADMIN_*) or src/lib/auth.ts.
import { pbkdf2Sync, randomBytes } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "<password>"')
  process.exit(1)
}
const iterations = 210_000
const salt = randomBytes(16).toString('hex')
const hash = pbkdf2Sync(password, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex')
console.log(`VITE_ADMIN_SALT=${salt}\nVITE_ADMIN_HASH=${hash}\nVITE_ADMIN_ITERATIONS=${iterations}`)
