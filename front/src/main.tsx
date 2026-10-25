import '@fontsource-variable/inter'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import App from './App'
import { DemoProvider } from './state/demo-store'
import { ToastProvider } from './components/ui/Toast'

// Hosted single-page preview (no server routes): keep navigation in memory.
const Router = import.meta.env.VITE_MEMORY_ROUTER ? MemoryRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router>
      <DemoProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </DemoProvider>
    </Router>
  </StrictMode>,
)
