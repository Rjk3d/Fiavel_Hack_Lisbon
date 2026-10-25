import { useEffect, useId, useRef, type ReactNode } from 'react'
import { ArrowUpRight, Check, House, ShieldCheck, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { primaryLease } from '../lib/demo-data'
import { money } from '../lib/formatters'
export function Brand() { return <Link className="brand" to="/" aria-label="Fiável home"><span className="brand-mark"><House size={22}/></span>fiável<span className="brand-dot">.</span></Link> }
export function Badge({ children, tone = '' }: { children: ReactNode; tone?: string }) { return <span className={`badge ${tone}`}>{children}</span> }
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) { return <section className={`card ${className}`}>{children}</section> }
export function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) { return <div className="page-heading"><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div> }
export function Lifecycle() { return <ol className="lifecycle">{['Lease created', 'Deposit funded', 'Lease active', 'Deposit release'].map((label, i) => <li className={i < 2 ? 'complete' : i === 2 ? 'current' : ''} key={label}><span>{i < 2 ? <Check size={14}/> : i + 1}</span><small>{label}</small></li>)}</ol> }
export function DepositHero({ compact = false }: { compact?: boolean }) { return <section className={`deposit-hero ${compact ? 'compact' : ''}`}><div className="hero-card-top"><span><ShieldCheck size={18}/> PROTECTED DEPOSIT · DEMO</span><Badge>Active lease</Badge></div><p>Your deposit is protected</p><div className="deposit-number">{money(primaryLease.deposit)}<span>EUR</span></div><div className="hero-card-bottom"><div><strong>{primaryLease.district}</strong><small>Recorded as held in fictional demo data</small></div><Link to="/app/lease" className="white-link">View lease <ArrowUpRight size={16}/></Link></div><div className="orbit orbit-one"/><div className="orbit orbit-two"/></section> }
export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId()
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close() }, [])
  return <dialog ref={ref} aria-labelledby={titleId} className="modal" onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose() }}><div className="section-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X/></button></div>{children}</dialog>
}
export function BlockchainDetails() { return <details className="technical"><summary>Blockchain & technical details</summary><p>Network: Stellar Testnet — demo configuration.</p><p>Blockchain verification will appear here when connected.</p><p>No wallet, deployed contract, or transaction is configured. Displayed euro amounts are fictional application records.</p></details> }
