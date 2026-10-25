import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { randomBytes } from '@noble/ciphers/utils.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { Address, Keypair } from 'lease-vault-client'

/**
 * End-to-end encrypted messages between the two parties of a lease.
 *
 * Each party already has a Stellar (ed25519) key. Both keys are converted to
 * x25519, so tenant and landlord derive the same shared secret without
 * exchanging anything: the other party's public key is its address on the
 * lease. The key is bound to the lease id and the sender's address is
 * authenticated, so a message cannot be moved to another lease or passed off
 * as the other party's. The contract only ever sees the ciphertext.
 *
 * Payload on-chain: version (1 byte) || nonce (24) || ciphertext + tag (16).
 */
const VERSION = 1
const NONCE = 24
const OVERHEAD = 1 + NONCE + 16
/** Contract limit on a payload (MAX_MESSAGE in lib.rs). */
export const MAX_PAYLOAD = 1_024
export const MAX_TEXT_BYTES = MAX_PAYLOAD - OVERHEAD

const enc = new TextEncoder()
const dec = new TextDecoder()

function leaseKey(me: Keypair, other: string, leaseId: bigint): Uint8Array {
  const secret = ed25519.utils.toMontgomerySecret(me.rawSecretKey())
  const theirs = ed25519.utils.toMontgomery(Keypair.fromPublicKey(other).rawPublicKey())
  const shared = x25519.getSharedSecret(secret, theirs)
  return hkdf(sha256, shared, enc.encode(`fiavel/lease/${leaseId}`), enc.encode('fiavel chat v1'), 32)
}

const aad = (leaseId: bigint, from: string) => enc.encode(`${leaseId}:${from}`)

/** Size of a text once encrypted; above MAX_PAYLOAD the contract rejects it. */
export const payloadSize = (text: string) => enc.encode(text).length + OVERHEAD

/** Encrypts `text` from `me` to `other` on lease `leaseId`. */
export function seal(text: string, me: Keypair, other: string, leaseId: bigint): Uint8Array {
  const body = enc.encode(text)
  if (body.length === 0 || body.length > MAX_TEXT_BYTES) throw new Error(`A message is 1 to ${MAX_TEXT_BYTES} bytes.`)
  const nonce = randomBytes(NONCE)
  const box = xchacha20poly1305(leaseKey(me, other, leaseId), nonce, aad(leaseId, me.publicKey())).encrypt(body)
  const out = new Uint8Array(OVERHEAD + body.length)
  out[0] = VERSION
  out.set(nonce, 1)
  out.set(box, 1 + NONCE)
  return out
}

/**
 * Decrypts a message of lease `leaseId` sent by `from`. `me` is either party
 * and `other` the opposite one (the shared key is the same both ways).
 * Returns null when it cannot be read: not a party, or altered.
 */
export function open(payload: Uint8Array, from: string, me: Keypair, other: string, leaseId: bigint): string | null {
  if (payload.length <= OVERHEAD || payload[0] !== VERSION) return null
  try {
    const nonce = payload.subarray(1, 1 + NONCE)
    const body = xchacha20poly1305(leaseKey(me, other, leaseId), nonce, aad(leaseId, from)).decrypt(payload.subarray(1 + NONCE))
    return dec.decode(body)
  } catch {
    return null
  }
}

export const ZERO_HASH = new Uint8Array(32)

/** Same chaining as thread_hash in the contract. */
export function threadHash(prev: Uint8Array, from: string, seq: number, payload: Uint8Array): Uint8Array {
  const sender = new Address(from).toScVal().toXDR()
  const data = new Uint8Array(32 + sender.length + 4 + payload.length)
  data.set(prev, 0)
  data.set(sender, 32)
  new DataView(data.buffer).setUint32(32 + sender.length, seq)
  data.set(payload, 32 + sender.length + 4)
  return sha256(data)
}

export interface SentMessage {
  from: string
  seq: number
  payload: Uint8Array
  /** Hash of the thread after this message, as published by the contract. */
  thread: Uint8Array
}

/**
 * Recomputes the chain from the first message. Returns how many messages in a
 * row match the contract, from seq 0; fewer than `messages.length` means one
 * is missing (e.g. older than what the RPC keeps) or does not match.
 */
export function verifiedCount(messages: SentMessage[]): number {
  let prev = ZERO_HASH
  let n = 0
  for (const m of [...messages].sort((a, b) => a.seq - b.seq)) {
    if (m.seq !== n) break
    const next = threadHash(prev, m.from, m.seq, m.payload)
    if (!equal(next, m.thread)) break
    prev = next
    n++
  }
  return n
}

export const equal = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i])
