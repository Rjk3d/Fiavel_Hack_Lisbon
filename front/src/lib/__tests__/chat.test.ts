import { describe, expect, it } from 'vitest'
import { Keypair } from 'lease-vault-client'
import { MAX_PAYLOAD, MAX_TEXT_BYTES, ZERO_HASH, open, payloadSize, seal, threadHash, verifiedCount, type SentMessage } from '../../stellar/chat'

const tenant = Keypair.random()
const landlord = Keypair.random()
const stranger = Keypair.random()
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('encrypted lease messages', () => {
  it('both parties read a message, nobody else does', () => {
    const p = seal('Olá, a renda chega amanhã.', tenant, landlord.publicKey(), 7n)
    expect(open(p, tenant.publicKey(), landlord, tenant.publicKey(), 7n)).toBe('Olá, a renda chega amanhã.')
    // The sender can read its own message again (same shared key both ways).
    expect(open(p, tenant.publicKey(), tenant, landlord.publicKey(), 7n)).toBe('Olá, a renda chega amanhã.')
    expect(open(p, tenant.publicKey(), stranger, tenant.publicKey(), 7n)).toBeNull()
    expect(new TextDecoder().decode(p)).not.toContain('renda')
  })

  it('a message cannot be moved to another lease, reattributed or altered', () => {
    const p = seal('I accept 75 USDC.', landlord, tenant.publicKey(), 3n)
    expect(open(p, landlord.publicKey(), tenant, landlord.publicKey(), 4n)).toBeNull()
    expect(open(p, tenant.publicKey(), tenant, landlord.publicKey(), 3n)).toBeNull()
    const altered = p.slice()
    altered[altered.length - 1] ^= 1
    expect(open(altered, landlord.publicKey(), tenant, landlord.publicKey(), 3n)).toBeNull()
  })

  it('stays within the contract limit', () => {
    expect(seal('x'.repeat(MAX_TEXT_BYTES), tenant, landlord.publicKey(), 1n).length).toBe(MAX_PAYLOAD)
    expect(payloadSize('x'.repeat(MAX_TEXT_BYTES))).toBe(MAX_PAYLOAD)
    expect(() => seal('x'.repeat(MAX_TEXT_BYTES + 1), tenant, landlord.publicKey(), 1n)).toThrow()
    expect(() => seal('', tenant, landlord.publicKey(), 1n)).toThrow()
  })
})

describe('thread hash', () => {
  it('matches the contract (thread_hash_matches_the_app in test.rs)', () => {
    const h = threadHash(ZERO_HASH, 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', 0, new Uint8Array([1, 2, 3]))
    expect(hex(h)).toBe('e4cefdd803d0695ce1673234549e0dd18b54b9c86318bc2f1fc08d7d724942ff')
  })

  it('counts the messages that chain from the start', () => {
    const msgs: SentMessage[] = []
    let prev = ZERO_HASH
    for (const [i, kp] of [tenant, landlord, tenant].entries()) {
      const payload = seal(`m${i}`, kp, (kp === tenant ? landlord : tenant).publicKey(), 1n)
      prev = threadHash(prev, kp.publicKey(), i, payload)
      msgs.push({ from: kp.publicKey(), seq: i, payload, thread: prev })
    }
    expect(verifiedCount(msgs)).toBe(3)
    expect(verifiedCount([msgs[2], msgs[0], msgs[1]])).toBe(3)
    expect(verifiedCount(msgs.slice(1))).toBe(0)
    const forged = msgs.map((m) => ({ ...m }))
    forged[1] = { ...forged[1], from: tenant.publicKey() }
    expect(verifiedCount(forged)).toBe(1)
  })
})
