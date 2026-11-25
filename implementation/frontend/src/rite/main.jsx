// ─── main.jsx — entrada de la app RITE (rite.brokergy.es, regla 245) ────────
// Tercera entrada de Vite (rite.html). NO monta nada del CRM. index.css se carga
// por los tokens y la letra que usan las piezas de src/certificadores/ui.
// ─────────────────────────────────────────────────────────────────────────────
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { RiteAuthProvider } from './auth/RiteAuth';
import App from './App';

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <ErrorBoundary>
            <RiteAuthProvider>
                <App />
            </RiteAuthProvider>
        </ErrorBoundary>
    </StrictMode>,
);
