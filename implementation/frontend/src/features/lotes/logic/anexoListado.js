// ============================================================
// anexoListado.js — "Anexo I · Listado Cesión de Ahorros" (a nivel de LOTE)
//
// Documento que el PROVEEDOR (Brokergy) firma cediendo al Sujeto Obligado los
// ahorros de TODAS las actuaciones del lote. Una fila por expediente.
// Estructura calcada del Excel/PDF de referencia de INTERALCO.
// ============================================================
import { buildInstalacionAddress } from '../../expedientes/utils/docGenerators';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { calcCifo } from '../../expedientes/logic/calcCifo';
import { getFicha } from '../../expedientes/logic/expedienteTaxonomia';
import { RES080_VIDA_UTIL } from '../../expedientes/logic/fichaRes080Html.js';
import { inversionCae } from '../../expedientes/logic/facturasCae.js';
import { fichaOficialDeExpediente } from '../../expedientes/logic/viaFm.js';
import { anexoListadoHtml } from './anexoListadoHtml.js';

// Fecha del convenio de compraventa con el S.O. (fija; editable en el popup).
export const CONVENIO_FECHA_DEFAULT = '27/02/2026';

export const FICHA_TITULO = {
    RES060: 'Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.',
    RES080: 'Rehabilitación profunda de edificios de viviendas',
    RES093: 'Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3',
    TER100: 'Sustitución de caldera de combustión existente por bomba de calor de accionamiento eléctrico.',
    TER173: 'Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios no residenciales ubicados en la zona climática D1, D2 o D3',
};

// La ficha se resuelve con el criterio ÚNICO del frontend (expedienteTaxonomia):
// aquí había una cadena de `includes` propia y, al entrar la TER173, se habría
// quedado atrás sin fallar — devolviendo RES060 para un terciario.
export const fichaDe = (numero) => getFicha({ numero_expediente: numero });

// RES080 imprime 25 años fijos: el MISMO valor que su ficha (RES080_VIDA_UTIL),
// o el Anexo I y la ficha firmada dirían cosas distintas.
const vidaUtilDe = (ficha) => (ficha === 'RES080' ? RES080_VIDA_UTIL : 15);

function fmtDate(d) {
    if (!d) return '';
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    return s;
}

// Una fila por expediente del lote.
export function buildAnexoListadoRows(lote) {
    const exps = (lote && lote.expedientes) || [];
    const precio = (lote && lote.oferta_lote != null && lote.oferta_lote !== '') ? Number(lote.oferta_lote) : null;
    return exps.map((e, i) => {
        const ficha = fichaDe(e.numero_expediente);
        let addr = {};
        try { addr = buildInstalacionAddress(e) || {}; } catch { addr = {}; }
        const inst = e.instalacion || {};
        const doc = e.documentacion || {};
        const fin = computeExpedienteFinancials(e);
        // La INVERSIÓN va SIEMPRE sobre factura: lo que COMPUTA para el CAE de cada
        // factura (base sin IVA menos lo no subvencionable, logic/facturasCae.js).
        const inversion = inversionCae(e.documentacion && e.documentacion.facturas);
        const utm = (inst.coord_x || inst.coord_y) ? `X: ${inst.coord_x || ''}, Y: ${inst.coord_y || ''}` : '';
        return {
            n: i + 1,
            codigo: e.numero_expediente || '',
            direccion: addr.full || e.cliente_direccion || '',
            refCatastral: addr.refCatastral || inst.ref_catastral || '',
            utm,
            fechaInicio: fmtDate(calcCifo(doc).inicio || doc.fecha_inicio_cifo),
            fechaFin: fmtDate(calcCifo(doc).fin || doc.fecha_fin_cifo),
            // Vía del factor multiplicador: su ficha y su título (RES060_FM…).
            ficha: fichaOficialDeExpediente(e)?.codigo || ficha,
            titulo: fichaOficialDeExpediente(e)?.titulo || FICHA_TITULO[ficha] || '',
            inversion,
            vidaUtil: vidaUtilDe(ficha),
            ahorroKwh: Math.round(fin.savingsKwh || 0),
            precio,
        };
    });
}

export function buildAnexoListadoTotals(rows) {
    const ahorroKwh = rows.reduce((s, r) => s + (r.ahorroKwh || 0), 0);
    return {
        numActuaciones: rows.length,
        ahorroKwh,
        ahorroMwh: ahorroKwh / 1000,
        ahorroGwh: ahorroKwh / 1e6,
    };
}

// HTML del documento (para /api/pdf/generate y para la previsualización en pantalla).
export function buildAnexoListadoHtml(lote, opts = {}) {
    const rows = buildAnexoListadoRows(lote);
    const tot = buildAnexoListadoTotals(rows);
    const soNombre = (lote && lote.sujeto_obligado && (lote.sujeto_obligado.razon_social || lote.sujeto_obligado.acronimo)) || 'SUJETO OBLIGADO';
    const convenio = opts.convenioFecha || CONVENIO_FECHA_DEFAULT;
    const mes = opts.mes || '';
    const anio = (lote && lote.anio_actuacion) || '';
    const ccaa = (lote && lote.ccaa) || '';

    return anexoListadoHtml({ rows, tot, soNombre, convenio, mes, anio, ccaa });
}
