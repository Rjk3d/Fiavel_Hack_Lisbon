import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { JoinPage, LiveLeaseDetailPage, LiveLeases, LiveOverview } from './pages/live/LeasePages'
import { LiveActivity, LiveDeposit, LivePayments } from './pages/live/MoneyPages'
import { LiveAssistant } from './pages/live/AssistantPage'
import { LiveProvider } from './state/live'
import { AuthProvider, RequireChoice } from './state/auth'
import { WelcomePage } from './pages/WelcomePage'

export default function App() {
  return (
    <AuthProvider>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/welcome" element={<WelcomePage />} />
      <Route
        path="/app"
        element={
          <RequireChoice>
            <LiveProvider>
              <AppShell />
            </LiveProvider>
          </RequireChoice>
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
    </AuthProvider>
  )
}
