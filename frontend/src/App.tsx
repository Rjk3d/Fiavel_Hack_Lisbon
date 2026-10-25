import { BrowserRouter, Link, Route, Routes } from 'react-router-dom'
import { DemoProvider } from './app/demo-context'
import { AppLayout } from './app/layout'
import { Landing } from './pages/landing'
import { Dashboard } from './pages/dashboard'
import { ActivityPage, ClaimsPage, DepositPage, LeasePage, PaymentsPage } from './pages/rental'
import { AssistantPage } from './pages/assistant'
import { AuthProvider, RequireAuth } from './app/auth'
import { LoginPage } from './pages/login'
export default function App() {
  return <BrowserRouter><AuthProvider><DemoProvider><Routes><Route path="/" element={<Landing/>}/><Route path="/login" element={<LoginPage/>}/><Route path="/app" element={<RequireAuth><AppLayout/></RequireAuth>}><Route index element={<Dashboard/>}/><Route path="lease" element={<LeasePage/>}/><Route path="payments" element={<PaymentsPage/>}/><Route path="deposit" element={<DepositPage/>}/><Route path="assistant" element={<AssistantPage/>}/><Route path="activity" element={<ActivityPage/>}/><Route path="disputes" element={<ClaimsPage/>}/></Route><Route path="*" element={<main className="not-found"><h1>This space hasn’t been built yet.</h1><Link className="button" to="/app">Back to your rental</Link></main>}/></Routes></DemoProvider></AuthProvider></BrowserRouter>
}
