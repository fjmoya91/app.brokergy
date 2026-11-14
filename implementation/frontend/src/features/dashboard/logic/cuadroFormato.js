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

const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const rangoT = (ts) => (ts.length > 1 ? `${ts[0]}–${ts[ts.length - 1]}` : ts[0]);

/**
 * De dónde sale la estructura del año, en una línea:
 * «T1–T3 del libro de la gestoría · T4 en curso, estimado». Con `corta`, para el hero.
 */
export function fuenteEstructura(g, { corta = false } = {}) {
    const qs = g?.trimestres || [];
    const libro = qs.filter(q => q.fuente === 'LIBRO').map(q => q.t.slice(-2));
    const drive = qs.filter(q => q.fuente === 'DRIVE' && !q.enCurso).map(q => q.t.slice(-2));
    const enCurso = qs.find(q => q.enCurso);
    const partes = [];
    if (libro.length) partes.push(corta ? `libro ${rangoT(libro)}` : `${rangoT(libro)} del libro de la gestoría`);
    if (drive.length) partes.push(corta ? `Drive ${rangoT(drive)}` : `${rangoT(drive)} leído en Drive`);
    if (enCurso) partes.push(`${enCurso.t.slice(-2)}${corta ? '' : ' en curso,'} ${g.estimado ? 'estimado' : 'leído en Drive'}`);
    return partes.length ? partes.join(corta ? ' + ' : ' · ') : 'gastos de Drive leídos';
}

/** «oct–nov» de una lista de meses (1–12). */
export const mesesTexto = (ms = []) => (ms.length ? (ms.length > 1 ? `${MES_CORTO[ms[0] - 1]}–${MES_CORTO[ms[ms.length - 1] - 1]}` : MES_CORTO[ms[0] - 1]) : '');

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
