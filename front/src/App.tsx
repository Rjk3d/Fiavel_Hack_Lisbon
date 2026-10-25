import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { JoinPage, LiveLeaseDetailPage, LiveLeases, LiveOverview } from './pages/live/LeasePages'
import { LiveActivity, LiveDeposit, LivePayments } from './pages/live/MoneyPages'
import { LiveAssistant } from './pages/live/AssistantPage'
import { LiveProvider } from './state/live'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/app"
        element={
          <LiveProvider>
            <AppShell />
          </LiveProvider>
        }
      >
        <Route index element={<LiveOverview />} />
        <Route path="lease" element={<LiveLeases />} />
        <Route path="leases/:id" element={<LiveLeaseDetailPage />} />
        <Route path="join/:id" element={<JoinPage />} />
        <Route path="payments" element={<LivePayments />} />
        <Route path="deposit" element={<LiveDeposit />} />
        <Route path="assistant" element={<LiveAssistant />} />
        <Route path="activity" element={<LiveActivity />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<LandingPage />} />
    </Routes>
  )
}
