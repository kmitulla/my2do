import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { registerSW } from 'virtual:pwa-register'

// Service Worker: precached die App-Shell für Offline-Betrieb.
// autoUpdate lädt bei neuer Version automatisch neu; das stündliche
// update() deckt lange offene installierte PWAs ab.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (registration) setInterval(() => registration.update(), 60 * 60 * 1000)
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
