import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ModalProvider } from './context/ModalContext'
import { ThemeProvider } from './context/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initNativeBridge } from './native/nativeBridge'

// Repara descargas/enlaces dentro de la app nativa (Capacitor). Inerte en web/PWA.
initNativeBridge()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* Red de seguridad de última instancia: si CUALQUIER vista revienta al
        renderizar (p.ej. el Cuadro de mando, que ahora es la pantalla de
        inicio), esto muestra "Algo ha fallado" + Reintentar en vez de dejar
        la pantalla en blanco sin ninguna pista de qué pasó. */}
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <ModalProvider>
            <App />
          </ModalProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>,
)
