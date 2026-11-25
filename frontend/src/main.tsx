import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { ThemeProvider, ToastProvider } from './lib/theme'
import { AuthProvider } from './lib/auth'
import { StoreProvider } from './lib/store'
import { STATIC_MODE } from './lib/api'

// Static hosts (GitHub Pages) cannot rewrite deep links to index.html, so the static build routes via the URL hash.
const Router = STATIC_MODE ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <StoreProvider>
            <Router>
              <App />
            </Router>
          </StoreProvider>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  </StrictMode>,
)
