import { Activity, FileText, Home, ShieldCheck, Sparkles, Wallet, type LucideIcon } from 'lucide-react'
import type { LiveRole as Role } from '../../stellar/wallets'

export interface NavItem {
  to: string
  label: (r: Role) => string
  short: (r: Role) => string
  icon: LucideIcon
  end?: boolean
  mobile: boolean
}

export const NAV: NavItem[] = [
  { to: '/app', label: () => 'Overview', short: () => 'Home', icon: Home, end: true, mobile: true },
  { to: '/app/lease', label: (r) => (r === 'tenant' ? 'My lease' : 'Leases'), short: (r) => (r === 'tenant' ? 'Lease' : 'Leases'), icon: FileText, mobile: true },
  { to: '/app/payments', label: () => 'Payments', short: () => 'Payments', icon: Wallet, mobile: true },
  { to: '/app/deposit', label: (r) => (r === 'tenant' ? 'Guarantee' : 'Guarantees'), short: () => 'Guarantee', icon: ShieldCheck, mobile: true },
  { to: '/app/assistant', label: () => 'Assistant', short: () => 'Assistant', icon: Sparkles, mobile: true },
  { to: '/app/activity', label: () => 'Activity', short: () => 'Activity', icon: Activity, mobile: false },
]
