import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core'
import './index.css'
import App from './App.jsx'

// Volledig scherm (0.9.2): met viewport-fit=cover (index.html) tekent de app
// tot achter de statusbalk en de camera-uitsparing. Daar ligt de donkerblauwe
// strook uit App.css onder, dus de statusbalk krijgt lichte pictogrammen
// (stijl DARK = voor een donkere achtergrond). Alleen op het toestel.
if (Capacitor.isNativePlatform()) {
  SystemBars.setStyle({ style: SystemBarsStyle.Dark, bar: SystemBarType.StatusBar }).catch((err) =>
    console.warn('WikiPoi statusbalkstijl mislukt:', err)
  )
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
