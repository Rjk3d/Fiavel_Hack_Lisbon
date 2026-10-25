import { lazy, Suspense, type ReactNode } from 'react'
import { Route, Routes } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { AuthProvider, RequireChoice } from './state/auth'
import { WelcomePage } from './pages/WelcomePage'
import { Skeleton } from './components/ui/misc'

// The landing page stays light: the Stellar SDK and the app screens load with /app.
const LiveApp = lazy(() => import('./LiveApp'))
const page = <K extends string>(load: () => Promise<Record<K, () => ReactNode>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const LiveOverview = page(() => import('./pages/live/LeasePages'), 'LiveOverview')
const LiveLeases = page(() => import('./pages/live/LeasePages'), 'LiveLeases')
const LiveLeaseDetailPage = page(() => import('./pages/live/LeasePages'), 'LiveLeaseDetailPage')
const JoinPage = page(() => import('./pages/live/LeasePages'), 'JoinPage')
const LivePayments = page(() => import('./pages/live/MoneyPages'), 'LivePayments')
const LiveDeposit = page(() => import('./pages/live/MoneyPages'), 'LiveDeposit')
const LiveActivity = page(() => import('./pages/live/MoneyPages'), 'LiveActivity')
const LiveAssistant = page(() => import('./pages/live/AssistantPage'), 'LiveAssistant')
const InventoryEditorPage = page(() => import('./pages/live/InventoryPages'), 'InventoryEditorPage')
const InventoryComparePage = page(() => import('./pages/live/InventoryPages'), 'InventoryComparePage')

const loading = (
  <div className="mx-auto max-w-[1180px] p-6">
    <Skeleton className="h-[420px]" />
  </div>
)

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={loading}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route
            path="/app"
            element={
              <RequireChoice>
                <LiveApp />
              </RequireChoice>
            }
          >
            <Route index element={<LiveOverview />} />
            <Route path="lease" element={<LiveLeases />} />
            <Route path="leases/:id" element={<LiveLeaseDetailPage />} />
            <Route path="leases/:id/inventory/compare" element={<InventoryComparePage />} />
            <Route path="leases/:id/inventory/:kind" element={<InventoryEditorPage />} />
            <Route path="join/:id" element={<JoinPage />} />
            <Route path="payments" element={<LivePayments />} />
            <Route path="deposit" element={<LiveDeposit />} />
            <Route path="assistant" element={<LiveAssistant />} />
            <Route path="activity" element={<LiveActivity />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
          <Route path="*" element={<LandingPage />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  )
}
