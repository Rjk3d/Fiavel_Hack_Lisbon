// Deterministic local test keys for the replay (never funded, never used on a network).
import { createHash } from 'node:crypto'
import { Keypair } from '@stellar/stellar-sdk'
const kp = (label) => Keypair.fromRawEd25519Seed(createHash('sha256').update(`fiavel-film-${label}`).digest())
const out = Object.fromEntries(['tenant', 'landlord', 'arbiter'].map((r) => [r, { address: kp(r).publicKey() }]))
console.log(JSON.stringify(out, null, 2))
