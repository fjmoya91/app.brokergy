import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ModalProvider } from './context/ModalContext'
import { ThemeProvider } from './context/ThemeContext'
import { initNativeBridge } from './native/nativeBridge'

// Repara descargas/enlaces dentro de la app nativa (Capacitor). Inerte en web/PWA.
initNativeBridge()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <ModalProvider>
          <App />
        </ModalProvider>
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
