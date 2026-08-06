import { useState } from 'react';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// Abre la carpeta del lote en el EXPLORADOR DE WINDOWS (el espejo local de Google
// Drive para escritorio), igual que el botón del expediente y el del cliente.
//
// Los navegadores bloquean `file://` desde la web, así que se pide al backend la
// ruta de Windows y se lanza por el protocolo propio `brokergylocal:`, que hay
// que registrar una vez por PC (`tools/windows/brokergylocal_setup.reg`).
//
// Detalles que NO son obvios y no se deben "simplificar":
//   · La ruta viaja en base64url CONSERVANDO el padding `=`.
//   · Sin `//` tras el esquema: con `//` el navegador minúscula el "host" y
//     rompe el base64, que es sensible a mayúsculas.
//   · Además se copia al portapapeles: si el PC no tiene el protocolo instalado,
//     al menos se puede pegar en el Explorador.
// ─────────────────────────────────────────────────────────────────────────────

export function BotonCarpetaLocal({ loteId, disabled = false, onError, className = '', compacto = false }) {
    const [busy, setBusy] = useState(false);

    const abrir = async (e) => {
        // La tarjeta del lote es clicable entera: este botón no debe abrir el modal.
        e.stopPropagation();
        e.preventDefault();
        if (!loteId || busy) return;
        setBusy(true);
        try {
            const { data } = await axios.get(`/api/lotes/${loteId}/local-path`);
            const path = data?.path;
            if (!path) throw new Error('No se pudo obtener la ruta local.');
            try { await navigator.clipboard.writeText(path); } catch (_) { /* contexto no seguro */ }
            const b64url = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            const msg = err?.response?.data?.error || err.message || 'No se pudo abrir la carpeta local.';
            if (onError) onError(msg); else console.error('[carpeta local]', msg);
        } finally {
            setBusy(false);
        }
    };

    return (
        <button type="button" onClick={abrir} disabled={disabled || busy}
            title="Abrir la carpeta del lote en el Explorador de Windows (se copia también la ruta)"
            className={`shrink-0 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 transition-all ${compacto ? 'p-1.5' : 'px-2.5 py-1.5'} ${className}`}>
            {busy ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
            ) : (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
            )}
        </button>
    );
}

export default BotonCarpetaLocal;
