import { AppShell } from './components/layout/AppShell'
import { LiveProvider } from './state/live'

/** The connected app (Stellar SDK, wallets, contract client), loaded only when /app is opened. */
export default function LiveApp() {
  return (
    <LiveProvider>
      <AppShell />
    </LiveProvider>
  )
}
