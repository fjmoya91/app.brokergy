// BANCO DE PRUEBAS LOCAL de la pestaña Facturación (solo en desarrollo: no entra en el build).
// Pinta FacturacionView sin sesión: un ADMIN de mentira en el contexto y la clave interna
// (VITE_FX_DEMO_KEY, que pone en el entorno la configuración «fx-demo-5186» de launch.json
// leyéndola del .env del backend; no se escribe en ningún fichero) en las cabeceras.
// Local = datos de PRODUCCIÓN: aquí TODA escritura se corta en el navegador salvo lo que
// es en seco (PERMITIDOS). ?rol=TRABAJADOR para ver la pestaña como trabajador.
/* eslint-disable react-refresh/only-export-components -- es un punto de entrada, no un módulo */
import React from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import './index.css';
import { AuthContext } from './context/AuthContext';
import { ModalProvider } from './context/ModalContext';
import { ThemeProvider } from './context/ThemeContext';
import { FacturacionView } from './features/facturacion/views/FacturacionView';

const CLAVE = import.meta.env.VITE_FX_DEMO_KEY || '';
const PERMITIDOS = [/[?&]seco=1/, /\/preview/i, /\/vista-previa/i, /\/preparar/i];
const permitido = (metodo, url) => metodo === 'GET' || PERMITIDOS.some(r => r.test(url || ''));

axios.interceptors.request.use(cfg => {
    const metodo = String(cfg.method || 'get').toUpperCase();
    if (!permitido(metodo, cfg.url)) {
        console.warn(`[fx-demo] BLOQUEADO ${metodo} ${cfg.url}`);
        return Promise.reject(Object.assign(new Error(`Banco de pruebas: ${metodo} ${cfg.url} bloqueado (local = producción)`), {
            response: { status: 418, data: { error: 'Banco de pruebas: las escrituras están bloqueadas' } },
        }));
    }
    cfg.headers = { ...(cfg.headers || {}), 'x-internal-key': CLAVE };
    return cfg;
});
const fetchOriginal = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const metodo = String(init.method || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if (!permitido(metodo, url)) {
        console.warn(`[fx-demo] BLOQUEADO ${metodo} ${url}`);
        return Promise.resolve(new Response(JSON.stringify({ error: 'Banco de pruebas: las escrituras están bloqueadas' }), { status: 418 }));
    }
    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    if (url.startsWith('/api')) headers.set('x-internal-key', CLAVE);
    return fetchOriginal(input, { ...init, headers });
};

const rol = new URLSearchParams(window.location.search).get('rol') === 'TRABAJADOR' ? 'TRABAJADOR' : 'ADMIN';
const user = { id: 'demo', rol, id_rol: rol === 'ADMIN' ? 1 : 8, nombre: 'DEMO', email: 'demo@local' };

// El armazón del CRM: menú lateral oscuro y <main> que scrollea, para ver la costura.
function Armazon() {
    const [plegado, setPlegado] = React.useState(false);
    return (
        <AuthContext.Provider value={{ user, session: null, loading: false, profileError: null }}>
            <div className="flex h-screen bg-bkg-deep text-white">
                <aside className={`hidden md:flex flex-col shrink-0 bg-bkg-deep border-r border-white/10 ${plegado ? 'w-20' : 'w-[280px]'}`}>
                    <button className="m-3 text-xs text-white/60" onClick={() => setPlegado(p => !p)}>{plegado ? '»' : '« plegar'}</button>
                    {!plegado && <div className="px-4 text-sm text-white/70 space-y-2"><div>Oportunidades</div><div>Expedientes</div><div className="text-white font-bold">Facturación</div></div>}
                </aside>
                <main className="flex-1 overflow-y-auto relative">
                    <div className="md:hidden sticky top-0 h-14 z-30 bg-bkg-deep border-b border-white/10 flex items-center px-4 text-sm">BROKERGY · demo</div>
                    <FacturacionView onNavigate={() => {}} />
                </main>
            </div>
        </AuthContext.Provider>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <ThemeProvider><ModalProvider><Armazon /></ModalProvider></ThemeProvider>
);
