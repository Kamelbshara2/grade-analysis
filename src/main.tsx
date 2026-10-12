import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { setLanguage, getCurrentLanguage } from './i18n/translations'

// Initialize language direction
setLanguage(getCurrentLanguage())

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
