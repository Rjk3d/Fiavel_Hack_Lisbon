import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { EscrowBinding, EscrowState } from '../../packages/escrow-domain/src/domain.js'
import { TrustlessWorkAdapter } from '../../packages/escrow-domain/src/trustless-work.js'
import { getProviderEscrowContext } from '../src/escrow-context.js'

test('provider-neutral assistant tool is read-only and checks participant/provider binding', async () => {
  const binding = { provider: 'trustless_work', asset: { contractId: 'test-only-token', decimals: 7 }, capabilities: {}, network: 'test-only-network' } as EscrowBinding
  const state: EscrowState = { binding, status: 'disputed', heldAmount: '18000000000', provenance: 'provider-api', fundedVerified: false, reportedStatus: 'disputed', roles: { receiver: 'tenant', landlord: 'landlord', arbitrators: ['arbiter'], approvers: ['tenant'], releaseSigners: [] }, limitations: ['No independent RPC funding proof.'] }
  const provider = new TrustlessWorkAdapter()
  provider.getEscrow = async () => state
  const context = await getProviderEscrowContext(provider, binding, 'tenant')
  assert.equal(context.financialAuthority, 'none')
  assert.equal(context.fundedVerified, false)
  assert.equal(context.status, 'disputed')
  await assert.rejects(getProviderEscrowContext(provider, binding, 'another-tenant'), /unavailable/)
  const mismatched = Object.assign(Object.create(provider) as TrustlessWorkAdapter, { id: 'leasevault' })
  await assert.rejects(getProviderEscrowContext(mismatched, binding, 'tenant'), /original provider/)
})
