// ─────────────────────────────────────────────────────────────────────────────
// La OBLIGACIÓN del Sujeto Obligado y cómo vamos con ella — la «Vista S.O.» de
// la pestaña Lotes (Fran, 28/10/2026: «como si yo fuera Interalco»).
//
// Del Anexo II de la Orden de obligaciones sale la CUOTA anual de ahorro de cada
// S.O. (INTERALCO 2026: 20,03 GWh) y la parte que tiene que pagar SÍ o SÍ al
// Fondo Nacional (el 8 %); el resto (18,43 GWh) lo puede cubrir con CAE. De eso,
// una parte ya la tiene comprada a OTROS agentes (dato que nos da él: 9 GWh) y
// otra se la llevamos NOSOTROS en lotes. Lo que queda es lo que le falta, y es
// lo que le podemos ofrecer con lo que tenemos sin lotear.
//
// Módulo PURO: lo usan la pantalla y el backend (que normaliza con él lo que
// guarda, como `tarifasVerificacion.js`). Con dos copias, lo tecleado se
// guardaría de una forma y se leería de otra.
// ─────────────────────────────────────────────────────────────────────────────
import { computeLoteEco, EQUIVALENCIA_FINANCIERA } from './loteEco.js';

// Cuota que, como mínimo, se paga al FNEE (art. 71 de la Ley 18/2014 tras el
// RD 36/2023: en 2026 el 8 %). Se puede cambiar por año en la ficha.
export const PCT_FONDO_DEFECTO = 8;

// En qué punto está cada lote MIRADO DESDE EL S.O. Las etapas no son los 14
// estados del lote: al S.O. le importa si el CAE ya está en su cuenta, si está
// en manos de la Administración, del verificador, o si todavía hay papeleo suyo.
export const ETAPAS_SO = [
    {
        id: 'EMITIDO', titulo: 'CAE emitidos', sub: 'ya en su cuenta del registro', tono: 'emerald',
        estados: ['CAE EMITIDO – PTE PAGO BROKERGY', 'PTE. PAGO BROKERGY A CLIENTE', 'FINALIZADO'],
    },
    {
        id: 'MINISTERIO', titulo: 'En la Administración', sub: 'solicitud de emisión presentada (o por presentar)', tono: 'cyan',
        estados: ['PTE. SUBIDA MITECO', 'SUBIDO A MITECO', 'REQUERIMIENTO G.A.'],
    },
    {
        id: 'VERIFICACION', titulo: 'En verificación', sub: 'en manos del verificador', tono: 'blue',
        estados: ['ENVIADO A VERIFICADOR', 'REQUERIMIENTO VERIFICADOR', 'VERIFICADO'],
    },
    {
        id: 'PREPARACION', titulo: 'En preparación', sub: 'firmas y oferta del verificador', tono: 'amber',
        estados: ['BORRADOR', 'SOLICITADO PRESUPUESTO A VERIFICADOR', 'PTE. FIRMA S.O.', 'PTE. OFERTA VERIFICADOR', 'PTE. FIRMA OFERTA S.O.'],
    },
];

// Lo que tenemos SIN lotear, por cercanía al CAE (lo clasifica el backend).
export const ETAPAS_DISPONIBLE = [
    { id: 'LISTO', titulo: 'Listo para lotear', sub: 'documentación completa' },
    { id: 'CERRANDO', titulo: 'Obra terminada', sub: 'CEE final y papeles' },
    { id: 'OBRA', titulo: 'En obra', sub: 'pendiente de fin de obra' },
    { id: 'ANTES', titulo: 'Antes de la obra', sub: 'CEE inicial y revisión' },
];

// En la pantalla se teclean GWh con coma («20,03»). Un punto solo es decimal
// («20.03», lo que devuelve el propio input); con coma y punto, el punto es de
// millar («1.496,94»).
const numDecimal = (v) => {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let t = String(v).trim().replace(/\s/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
};

/** Limpia la obligación de UN año. Lo que no es un número se queda en null. */
export function normalizarAnio(a = {}) {
    const pct = numDecimal(a.pct_fondo);
    const eq = numDecimal(a.equivalencia_mwh);
    return {
        obligacion_gwh: numDecimal(a.obligacion_gwh),
        pct_fondo: pct != null && pct >= 0 && pct <= 100 ? pct : PCT_FONDO_DEFECTO,
        otros_gwh: numDecimal(a.otros_gwh) ?? 0,
        equivalencia_mwh: eq != null && eq > 0 ? eq : EQUIVALENCIA_FINANCIERA,
        ventas_gwh: numDecimal(a.ventas_gwh),
        fuente: (a.fuente || '').toString().trim() || null,
        notas: (a.notas || '').toString().trim() || null,
    };
}

/**
 * Limpia la configuración entera de un S.O.: `{ anios: { '2026': {...} },
 * asignacion: { loteId: '2025' | 'NO' } }`. `asignacion` solo guarda las
 * EXCEPCIONES: un lote sin entrada cuenta para el año que dice `anioDelLote`.
 */
export function normalizarObligacion(raw = {}) {
    const anios = {};
    for (const [k, v] of Object.entries(raw?.anios || {})) {
        if (!/^\d{4}$/.test(k)) continue;
        const a = normalizarAnio(v);
        if (a.obligacion_gwh != null && a.obligacion_gwh > 0) anios[k] = a;
    }
    const asignacion = {};
    for (const [id, v] of Object.entries(raw?.asignacion || {})) {
        const s = String(v ?? '').trim().toUpperCase();
        if (s === 'NO' || /^\d{4}$/.test(s)) asignacion[id] = s;
    }
    return {
        anios, asignacion,
        actualizada_at: raw?.actualizada_at || null,
        actualizada_por: raw?.actualizada_por || null,
    };
}

export function etapaDelLote(lote) {
    const e = lote?.estado || '';
    // Con la resolución de emisión subida, el CAE está emitido aunque el estado
    // del lote no se haya movido todavía.
    if ((lote?.documentos_so || []).some(d => d?.key === 'certificado_cae' && (d.link || d.signed_link || d.cae))) return 'EMITIDO';
    const et = ETAPAS_SO.find(x => x.estados.includes(e));
    return et ? et.id : 'PREPARACION';
}

/**
 * Cuántos kWh (= CAE) le lleva el lote, de la fuente más firme que haya:
 * los CAE de la resolución de emisión → las unidades de nuestra factura → el
 * ahorro verificado de TODOS sus expedientes → el estimado.
 */
export function kwhDelLote(lote) {
    const cae = (lote?.documentos_so || []).find(d => d?.key === 'certificado_cae')?.cae;
    if (numDecimal(cae?.total) > 0) return { kwh: numDecimal(cae.total), fuente: 'EMITIDO' };
    const fu = numDecimal(lote?.factura_so?.unidades_kwh);
    if (fu > 0) return { kwh: fu, fuente: 'FACTURA' };
    const eco = computeLoteEco(lote);
    if (eco.fullyVerif && eco.ahorroKwhVerif > 0) return { kwh: eco.ahorroKwhVerif, fuente: 'VERIFICADO' };
    return { kwh: eco.ahorroKwh || 0, fuente: 'ESTIMADO' };
}

const anioDe = (txt) => {
    const m = String(txt || '').match(/(\d{4})/);
    return m ? Number(m[1]) : null;
};

/**
 * Para qué año de obligación cuenta un lote, si nadie lo ha cambiado a mano:
 * un CAE emitido, el año de su resolución (o de nuestra factura); uno sin
 * emitir, el año en curso — se emitirá, como pronto, este año.
 */
export function anioDelLote(lote, hoy = new Date()) {
    const actual = hoy.getFullYear();
    if (etapaDelLote(lote) === 'EMITIDO') {
        const cae = (lote?.documentos_so || []).find(d => d?.key === 'certificado_cae')?.cae;
        return anioDe(cae?.fecha_resolucion) || anioDe(lote?.factura_so?.fecha) || anioDe(lote?.created_at) || actual;
    }
    return Math.max(actual, anioDe(lote?.created_at) || actual);
}

/**
 * La foto de UN S.O. en UN año: su obligación, lo que ya tiene, lo que le
 * llevamos por etapas y lo que le falta. `disponible` (opcional) es la
 * respuesta de `GET /api/lotes/disponible`, para decir cuánto de lo que falta
 * podemos cubrir.
 */
export function computeVistaSo({ lotes = [], soId, anio, config, disponible = null, hoy = new Date() }) {
    const cfg = normalizarObligacion(config || {});
    const ob = cfg.anios[String(anio)] || null;

    const etapas = Object.fromEntries(ETAPAS_SO.map(e => [e.id, { ...e, kwh: 0, lotes: [] }]));
    const fuera = [];
    for (const l of lotes) {
        if (String(l?.sujeto_obligado_id || l?.sujeto_obligado?.id_empresa || '') !== String(soId)) continue;
        const manual = cfg.asignacion[l.id] || null;
        const auto = anioDelLote(l, hoy);
        const cuentaPara = manual === 'NO' ? null : (manual ? Number(manual) : auto);
        const { kwh, fuente } = kwhDelLote(l);
        const fila = {
            id: l.id, codigo: l.codigo, estado: l.estado, etapa: etapaDelLote(l),
            kwh, fuente, anio: cuentaPara, anioAuto: auto, manual,
            nExpedientes: l.num_expedientes ?? (l.expedientes_eco || l.expedientes || []).length,
            requerimiento: /REQUERIMIENTO/.test(l.estado || ''),
            oferta: l.oferta_lote != null && l.oferta_lote !== '' ? Number(l.oferta_lote) : null,
        };
        if (cuentaPara !== Number(anio)) { fuera.push(fila); continue; }
        etapas[fila.etapa].kwh += kwh;
        etapas[fila.etapa].lotes.push(fila);
    }
    for (const e of Object.values(etapas)) e.lotes.sort((a, b) => String(a.codigo).localeCompare(String(b.codigo), 'es'));

    const gwh = (kwh) => kwh / 1e6;
    const brokergyGwh = gwh(Object.values(etapas).reduce((a, e) => a + e.kwh, 0));
    const emitidoGwh = gwh(etapas.EMITIDO.kwh);

    let cuenta = null;
    if (ob) {
        const fondoGwh = ob.obligacion_gwh * ob.pct_fondo / 100;
        const cubribleGwh = ob.obligacion_gwh - fondoGwh;
        const faltaGwh = cubribleGwh - ob.otros_gwh - brokergyGwh;
        const eq = ob.equivalencia_mwh; // €/MWh = miles de €/GWh
        cuenta = {
            ...ob,
            fondoGwh, cubribleGwh,
            brokergyGwh, emitidoGwh,
            // Lo que le falta por cubrir con CAE si todo lo nuestro llega a emitirse.
            faltaGwh: Math.max(0, faltaGwh),
            sobraGwh: Math.max(0, -faltaGwh),
            // Lo que ya es SEGURO: lo comprado a otros y lo nuestro ya emitido.
            aseguradoGwh: ob.otros_gwh + emitidoGwh,
            pctAsegurado: cubribleGwh > 0 ? Math.min(100, (ob.otros_gwh + emitidoGwh) / cubribleGwh * 100) : null,
            pctCubierto: cubribleGwh > 0 ? Math.min(100, (ob.otros_gwh + brokergyGwh) / cubribleGwh * 100) : null,
            // En euros, a la equivalencia financiera: lo que pagaría al FNEE.
            obligacionEur: ob.obligacion_gwh * 1000 * eq,
            fondoEur: fondoGwh * 1000 * eq,
            cubribleEur: cubribleGwh * 1000 * eq,
            faltaEur: Math.max(0, faltaGwh) * 1000 * eq,
        };
    }

    // Lo que tenemos sin lotear frente a lo que le falta. Las etapas se acumulan
    // en orden de cercanía al CAE: «con lo listo cubres X; sumando lo que cierra
    // papeles, Y…».
    let oferta = null;
    if (disponible?.etapas) {
        let acum = 0;
        const filas = ETAPAS_DISPONIBLE.map(e => {
            const d = disponible.etapas[e.id] || { n: 0, kwh: 0, expedientes: [] };
            acum += d.kwh || 0;
            const acumGwh = gwh(acum);
            return {
                ...e, n: d.n || 0, gwh: gwh(d.kwh || 0), acumGwh,
                expedientes: d.expedientes || [],
                pctDeLoQueFalta: cuenta && cuenta.faltaGwh > 0 ? Math.min(100, acumGwh / cuenta.faltaGwh * 100) : null,
            };
        });
        oferta = { filas, totalGwh: gwh(acum) };
    }

    return { anio: Number(anio), obligacion: cuenta, etapas: ETAPAS_SO.map(e => etapas[e.id]), brokergyGwh, fuera, oferta };
}

/** Los años que tiene sentido elegir: los configurados, el actual y el de los lotes. */
export function aniosElegibles(config, lotes = [], soId, hoy = new Date()) {
    const s = new Set(Object.keys(normalizarObligacion(config || {}).anios).map(Number));
    s.add(hoy.getFullYear());
    for (const l of lotes) if (String(l?.sujeto_obligado_id) === String(soId)) s.add(anioDelLote(l, hoy));
    return [...s].sort((a, b) => b - a);
}
