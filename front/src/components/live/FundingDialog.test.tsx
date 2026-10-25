import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import type { LeaseView } from '../../state/live'
import { FundingDialog } from './FundingDialog'

vi.mock('../../state/live', () => ({ useLive: () => ({ wallet: { address: 'G'.repeat(56), role: 'tenant' }, refresh: vi.fn() }) }))
vi.mock('../../stellar/funding/stellar', () => ({
  createFundingEngine: () => ({ ports: { scope: {} }, getPending: () => ({ stage: 'funded' }) }),
  escrowUSDC: { code: 'USDC', issuer: 'G'.repeat(56) },
}))
// Server rendering checks content and initial gating only. It does not test
// focus trapping, mobile viewport layout, wallet interactions, or effects.
vi.mock('../ui/Dialog', () => ({ Dialog: ({ title, description, children, footer }: { title: ReactNode; description: ReactNode; children: ReactNode; footer: ReactNode }) => <section role="dialog" aria-label="Payment"><h2>{title}</h2><p>{description}</p>{children}{footer}</section> }))
const view = { id: 7n, snap: { lease: { terms: { deposit: 18000000000n, rent: 9000000000n, yield_offered: true, buffer_bps: 500 } } } } as LeaseView

describe('payment review initial rendering (not browser/mobile verification)', () => {
  it('shows actual contract totals, testnet limitations and existing tenant signer', () => {
    const html = renderToStaticMarkup(<FundingDialog view={view} onClose={() => {}}/>)
    expect(html).toContain('1,800.00 USDC'); expect(html).toContain('900.00 USDC'); expect(html).toContain('2,700.00 USDC')
    expect(html).toContain('Stellar Testnet'); expect(html).toContain('not Freighter')
    expect(html).toContain('separate guarantor'); expect(html).toContain('other blockchains are unsupported')
    expect(html).toContain('never straight to the landlord')
  })
  it('never renders cached success before a live verification effect completes', () => {
    const html = renderToStaticMarkup(<FundingDialog view={view} onClose={() => {}}/>)
    expect(html).not.toContain('Escrow verified on-chain')
    expect(html).not.toContain('LeaseVault confirms the funded lease')
    expect(html).toContain('Checking network and escrow')
    expect(html).not.toContain('Sign and lock USDC')
  })
  it('discloses the accepted Blend buffer instead of pretending deposit-only funding', () => {
    const html = renderToStaticMarkup(<FundingDialog view={view} acceptYield onClose={() => {}}/>)
    expect(html).toContain('Blend buffer'); expect(html).toContain('90.00 USDC'); expect(html).toContain('2,790.00 USDC')
  })
})
