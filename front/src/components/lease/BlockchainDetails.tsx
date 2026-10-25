import { useState } from 'react'
import { ChevronDown, ExternalLink, Link2 } from 'lucide-react'
import { chainConfig, explorerTxUrl } from '../../lib/config'
import { cx } from '../../lib/cx'

/**
 * Technical details accordion. It never invents anything: the contract id and the
 * transaction hash only appear when configured, and the explorer link only from a
 * well-formed hash on the configured network.
 */
export function BlockchainDetails() {
  const [open, setOpen] = useState(false)
  const tx = explorerTxUrl(chainConfig)
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-canvas"
      >
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-tint text-brand">
          <Link2 size={17} />
        </span>
        <span className="flex-1">
          <span className="block text-[15px] font-semibold">Blockchain information</span>
          <span className="block text-[13px] text-ink-muted">Technical details for the curious</span>
        </span>
        <ChevronDown size={18} className={cx('text-ink-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="animate-fade border-t border-line px-5 py-4 text-[14px]">
          <dl className="space-y-3">
            <Row label="Network" value={chainConfig.network} />
            {chainConfig.contractId && <Row label="Contract" value={chainConfig.contractId} mono />}
            {chainConfig.lastTxHash && <Row label="Last transaction" value={chainConfig.lastTxHash} mono />}
          </dl>
          {!chainConfig.contractId && !chainConfig.lastTxHash && (
            <p className="mt-4 rounded-2xl bg-canvas px-4 py-3 text-[13px] leading-[19px] text-ink-muted">
              Blockchain verification will appear here when connected. No contract is deployed and no transaction has been
              submitted for this demo lease.
            </p>
          )}
          {tx && (
            <a href={tx} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 font-semibold text-brand hover:underline">
              View on Stellar Expert <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-ink-muted">{label}</dt>
      <dd className={cx('break-all font-medium sm:text-right', mono && 'font-mono text-[12px]')}>{value}</dd>
    </div>
  )
}
