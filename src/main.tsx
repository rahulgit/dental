// First, so window.__DENTALCARE__ and logging exist before anything else runs.
import './lib/debug'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { logger } from './lib/debug'

const log = logger('App')
window.addEventListener('error', (e) => log.error(`Uncaught error: ${e.message}`, e.error))
window.addEventListener('unhandledrejection', (e) => log.error('Unhandled promise rejection', e.reason))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
