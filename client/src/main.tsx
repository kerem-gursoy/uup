import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { applyDocumentLanguage } from './i18n'

// Before the first render: index.html is a static file and ships one fixed title
// and lang attribute, which cannot be right for both languages.
applyDocumentLanguage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
