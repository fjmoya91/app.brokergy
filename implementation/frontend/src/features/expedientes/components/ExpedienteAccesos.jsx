import { useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Los tres accesos directos a un expediente: ABRIRLO en la app, su carpeta de
// DRIVE y su carpeta LOCAL. Van juntos porque son la misma pregunta ("llévame al
// expediente"), y separados porque cada uno responde a un momento distinto:
// trabajar dentro de la app, mirar un fichero desde el móvil, o arrastrarlo desde
// el Explorador.
//
// FUENTE ÚNICA de los tres: los usan la ficha del cliente (`ClienteDetailModal`)
// y el listado (`ClientesView`). Estaban duplicados, y esa es la forma de que un
// día abran carpetas distintas según por dónde entres.
//
// SOLO ADMIN — lo decide QUIEN LLAMA, no este componente: un enlace de Drive no
// se le sirve a un partner (regla 1) y los expedientes son internos.
//
// La carpeta local se abre con el protocolo propio `brokergylocal:` (hay que
// registrarlo una vez por PC con `tools/windows/brokergylocal_setup.reg`).
// Detalles que NO se deben "simplificar":
//   · La ruta viaja en base64url CONSERVANDO el padding `=`.
//   · Sin `//` tras el esquema: con `//` el navegador pone el "host" en
//     minúsculas y rompe el base64, que distingue mayúsculas.
//   · Se copia además al portapapeles: si el PC no tiene el protocolo instalado,
//     al menos se puede pegar en el Explorador.
// ─────────────────────────────────────────────────────────────────────────────

const Spinner = ({ className = 'w-4 h-4' }) => (
    <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
);

export function ExpedienteAccesos({
    expedienteId,
    numero = '',
    onAbrirApp = null,   // si no se pasa, no se pinta el botón de abrir en la app
    onError = null,
    className = '',
}) {
    const [busy, setBusy] = useState(null); // 'local' | 'drive' | null

    if (!expedienteId) return null;

    const fallo = (msg) => { if (onError) onError(msg); else console.error('[expediente]', msg); };
    const rotulo = numero ? ` ${numero}` : '';

    const abrirLocal = async (e) => {
        // En el listado, la fila entera es clicable (abre la ficha del cliente).
        e.stopPropagation();
        e.preventDefault();
        if (busy) return;
        setBusy('local');
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/local-path`);
            const path = data?.path;
            if (!path) { fallo('No se pudo obtener la ruta local.'); return; }
            try { await navigator.clipboard.writeText(path); } catch (_) { /* contexto no seguro */ }
            const b64url = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            fallo(err?.response?.data?.error || 'No se pudo abrir la carpeta local.');
        } finally {
            setBusy(null);
        }
    };

    const abrirDrive = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (busy) return;
        setBusy('drive');
        try {
            const { data } = await axios.get(`/api/expedientes/${expedienteId}/drive-link`);
            const link = data?.drive_folder_link;
            if (!link) { fallo('El expediente no tiene carpeta de Drive.'); return; }
            window.open(link, '_blank', 'noopener,noreferrer');
        } catch (err) {
            fallo(err?.response?.data?.error || 'No se pudo abrir la carpeta de Drive.');
        } finally {
            setBusy(null);
        }
    };

    const btn = 'p-2 rounded-lg border transition-all disabled:opacity-50 disabled:cursor-wait flex-shrink-0';

    return (
        <div className={`flex items-center gap-1.5 ${className}`}>
            {onAbrirApp && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); e.preventDefault(); onAbrirApp(); }}
                    title={`Abrir el expediente${rotulo} en la app`}
                    className={`${btn} bg-brand/10 border-brand/20 text-brand hover:bg-brand/20`}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                </button>
            )}
            <button
                type="button"
                onClick={abrirDrive}
                disabled={busy === 'drive'}
                title={`Abrir en Google Drive la carpeta del expediente${rotulo}`}
                className={`${btn} bg-cyan-500/10 border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20`}
            >
                {busy === 'drive' ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                    </svg>
                )}
            </button>
            <button
                type="button"
                onClick={abrirLocal}
                disabled={busy === 'local'}
                title={`Abrir la carpeta LOCAL del expediente${rotulo} en el Explorador de Windows (se copia también la ruta)`}
                className={`${btn} bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20`}
            >
                {busy === 'local' ? <Spinner /> : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13l2 2 4-4" />
                    </svg>
                )}
            </button>
        </div>
    );
}

export default ExpedienteAccesos;
