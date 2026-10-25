// Los parámetros de la URL de la pestaña Facturación. La cabecera, el cuadro de mando y los
// listados se hablan por aquí (un KPI que se pulsa deja el listado filtrado), y así cualquier
// vista se puede pegar como enlace en un WhatsApp.
//   sub    hoy | presupuestos | facturas | trimestres | articulos
//   f      el chip del listado. Facturas: por-emitir | por-cobrar | vencidas | cobradas |
//          rectificativas | todas · Presupuestos: en-curso | esperando | por-facturar | cerrados | todos
//   serie  ING | FML (facturas)
//   t      el trimestre de Trimestres, AAAA-Tn
//   nuevo  presupuesto | ING | FML → el listado abre su editor en blanco y quita el parámetro
//   abrir  <id> → el listado abre ese presupuesto o esa factura y quita el parámetro
import { useEffect, useState } from 'react';

const EVENTO = 'fx-url';

export function leerParams() {
    try { return Object.fromEntries(new URLSearchParams(window.location.search)); } catch { return {}; }
}

/** Cambia (o quita, con null o '') parámetros sin recargar, y avisa a quien escuche. */
export function ponerParams(cambios) {
    const url = new URL(window.location);
    for (const [k, v] of Object.entries(cambios || {})) {
        if (v == null || v === '') url.searchParams.delete(k);
        else url.searchParams.set(k, String(v));
    }
    window.history.replaceState(window.history.state, '', url);
    window.dispatchEvent(new Event(EVENTO));
}

/** [params, ponerParams]: se repinta cuando cualquiera cambia la URL de la pestaña. */
export function useParamsFacturacion() {
    const [p, setP] = useState(leerParams);
    useEffect(() => {
        const f = () => setP(leerParams());
        window.addEventListener(EVENTO, f);
        window.addEventListener('popstate', f);
        return () => { window.removeEventListener(EVENTO, f); window.removeEventListener('popstate', f); };
    }, []);
    return [p, ponerParams];
}
