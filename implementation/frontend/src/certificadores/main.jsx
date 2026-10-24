// ─── main.jsx — entrada de la app de certificadores (cee.brokergy.es) ────────
// Segunda entrada de Vite (certificadores.html). NO monta nada del CRM: ni su
// AuthContext ni su App/DashboardLayout. index.css se carga solo por Tailwind y
// los tokens que usan las piezas reutilizadas (Catastro, mapa, envolvente).
// ─────────────────────────────────────────────────────────────────────────────
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { CertappAuthProvider } from './auth/CertappAuth';
import App from './App';
import { leerFlagDemoDeLaUrl } from './dev/flag';

function arrancar() {
    createRoot(document.getElementById('root')).render(
        <StrictMode>
            <ErrorBoundary>
                <CertappAuthProvider>
                    <App />
                </CertappAuthProvider>
            </ErrorBoundary>
        </StrictMode>,
    );
}

// Demo con datos simulados (solo desarrollo, `?demo=1`): en el build de
// producción `import.meta.env.DEV` es false y esta rama —con su import— desaparece.
if (import.meta.env.DEV && leerFlagDemoDeLaUrl()) {
    import('./dev/demo.js').then((m) => { m.instalarDemo(); arrancar(); });
} else {
    arrancar();
}
