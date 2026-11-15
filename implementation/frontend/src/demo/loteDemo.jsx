// BANCO DE PRUEBAS LOCAL de la ficha del lote (solo en desarrollo: no entra en el build).
// Abre LoteDetailModal sobre un fondo oscuro de CRM con un usuario de mentira. El
// backend del banco solo responde GET y corta lo demás. ?lote=LOTE-2026-019&rol=TRABAJADOR
/* eslint-disable react-refresh/only-export-components -- es un punto de entrada, no un módulo */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import '../index.css';
import { AuthContext } from '../context/AuthContext';
import { ModalProvider } from '../context/ModalContext';
import { ThemeProvider } from '../context/ThemeContext';
import { LoteDetailModal } from '../features/lotes/components/LoteDetailModal';

// Doble candado: el backend del banco ya corta las escrituras, y aquí tampoco salen.
axios.interceptors.request.use(cfg => {
    const metodo = String(cfg.method || 'get').toUpperCase();
    if (metodo !== 'GET' || /\/marwen/.test(cfg.url || '')) {
        console.warn(`[lote-demo] BLOQUEADO ${metodo} ${cfg.url}`);
        return Promise.reject(Object.assign(new Error(`Banco: ${metodo} bloqueado`), { response: { status: 418, data: { error: 'Banco de pruebas: escrituras bloqueadas' } } }));
    }
    return cfg;
});

const qs = new URLSearchParams(window.location.search);
const rol = qs.get('rol') === 'TRABAJADOR' ? 'TRABAJADOR' : 'ADMIN';
const user = { id: 'demo', rol, id_rol: rol === 'ADMIN' ? 1 : 8, nombre: 'DEMO', email: 'demo@local' };

function Demo() {
    const [id, setId] = React.useState(null);
    const [error, setError] = React.useState(null);
    React.useEffect(() => {
        const codigo = qs.get('lote') || 'LOTE-2026-019';
        axios.get('/api/lotes').then(({ data }) => {
            const lista = Array.isArray(data) ? data : (data?.data || []);
            const l = lista.find(x => x.codigo === codigo);
            if (l) setId(l.id); else setError(`No encuentro ${codigo}`);
        }).catch(e => setError(e.message));
    }, []);
    return (
        <AuthContext.Provider value={{ user, session: null, loading: false, profileError: null }}>
            <div className="min-h-screen bg-bkg-deep text-white p-6 text-sm">
                CRM (fondo) · {error || (id ? 'ficha abierta' : 'cargando…')}
                {id && <LoteDetailModal loteId={id} onClose={() => setId(null)} onChanged={() => {}} onNavigateExpediente={() => {}} />}
            </div>
        </AuthContext.Provider>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ThemeProvider><ModalProvider><Demo /></ModalProvider></ThemeProvider>
);
