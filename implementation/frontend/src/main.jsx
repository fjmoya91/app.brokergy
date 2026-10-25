import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext'
import { ModalProvider } from './context/ModalContext'
import { ThemeProvider } from './context/ThemeContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { initNativeBridge } from './native/nativeBridge'

// REGLA — el CRM solo arranca en SU página. La app de certificadores
// (certificadores.html, `<html data-app="certificadores">`) abre la envolvente del
// CRM, y Rollup deja piezas que comparten en ESTE trozo de entrada: al cargarlas,
// este fichero se ejecuta también allí. Sin la guarda montaba el CRM encima del
// #root de la app y la envolvente reventaba con «removeChild» (25/10/2026).
// docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
const esSuPagina = document.documentElement.dataset.app !== 'certificadores'

// Repara descargas/enlaces dentro de la app nativa (Capacitor). Inerte en web/PWA.
if (esSuPagina) initNativeBridge()

if (esSuPagina) createRoot(document.getElementById('root')).render(
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
