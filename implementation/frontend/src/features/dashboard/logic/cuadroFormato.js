// Utilidades de presentación del cuadro de mando de dirección (sin JSX, para que
// los ficheros de componentes solo exporten componentes). Ninguna cuenta de dinero:
// eso lo hace el servidor (services/cuadroDireccion.js).
import { energiaCorta } from './dashboardAgg.js';

/** 0,446 → «44,6 %». */
export const pct = (v, dec = 1) => (v == null || isNaN(v) ? '—' : `${(v * 100).toFixed(dec).replace('.', ',')} %`);
/** 37.740 MWh → «37,7 GWh». */
export const energia = (mwh) => { const e = energiaCorta(mwh); return `${e.valor} ${e.unidad}`; };
/** Enlace a otra pestaña del CRM; se abre SIEMPRE en pestaña nueva (el cuadro se queda como estaba). */
export const enlace = (q) => `${window.location.origin}/${String(q || '').startsWith('?') ? q : `?${q || ''}`}`;

function enlaceDeFiltro(filtro) {
    if (!filtro) return '?tab=facturacion';
    if (filtro.vista === 'lotes') return '?tab=lotes';
    if (filtro.vista === 'facturas') return `?tab=facturacion&sub=facturas${filtro.estado === 'VENCIDA' ? '&f=vencidas' : ''}`;
    if (filtro.vista === 'gastos' || filtro.vista === 'trimestres') return `?tab=facturacion&sub=trimestres${filtro.t ? `&t=${filtro.t}` : ''}`;
    if (filtro.vista === 'presupuestos') return '?tab=facturacion&sub=presupuestos';
    return '?tab=facturacion';
}

/**
 * «Requiere tu atención»: lo del negocio + lo de finanzas + los avisos de Facturación,
 * sin repetir y con lo urgente delante. «Bonos cobrados sin transferir» ya lo dice
 * el negocio por lote: si está, no se repite el de finanzas.
 */
export function juntarAtencion(n, f) {
    const items = [...(n?.atencion || [])];
    const claves = new Set(items.map(a => a.clave));
    for (const a of f?.avisos || []) {
        if (a.clave === 'bonos_cobrados' && claves.has('bonos_por_pagar')) continue;
        items.push(a);
    }
    const yaGastos = items.some(a => a.clave === 'gastos_sin_leer');
    for (const a of f?.avisosContabilidad || []) {
        // «N gastos del trimestre sin leer» ya va dentro de los del año.
        if (yaGastos && a.filtro?.vista === 'gastos' && a.filtro?.estado === 'SIN_LEER') continue;
        items.push({ tono: a.tono, texto: a.texto, link: enlaceDeFiltro(a.filtro), clave: `conta:${a.texto}` });
    }
    const peso = { vence: 0, ambar: 1, gris: 2 };
    return items
        .map(a => ({ ...a, tono: a.tono === 'rojo' || a.tono === 'vence' ? 'vence' : a.tono === 'ambar' ? 'ambar' : 'gris' }))
        .sort((a, b) => (peso[a.tono] ?? 3) - (peso[b.tono] ?? 3));
}
