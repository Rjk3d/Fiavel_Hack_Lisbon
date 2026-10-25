import { Route, Routes } from 'react-router-dom'
import { AppShell } from './components/layout/AppShell'
import { FlowsProvider } from './state/flows'
import { LandingPage } from './pages/LandingPage'
import { PaymentsPage } from './pages/PaymentsPage'
import { DepositPage } from './pages/DepositPage'
import { ActivityPage, AssistantPage, LeaseDetailPage, LeasePage, NotFoundPage, OverviewPage } from './pages/AppPages'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/app"
        element={
          <FlowsProvider>
            <AppShell />
          </FlowsProvider>
        }
      >
        <Route index element={<OverviewPage />} />
        <Route path="lease" element={<LeasePage />} />
        <Route path="leases/:id" element={<LeaseDetailPage />} />
        <Route path="payments" element={<PaymentsPage />} />
        <Route path="deposit" element={<DepositPage />} />
        <Route path="assistant" element={<AssistantPage />} />
        <Route path="activity" element={<ActivityPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<LandingPage />} />
    </Routes>
  )
}
