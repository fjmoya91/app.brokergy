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
        id: 'EMITIDO', titulo: 'CAE emitidos', sub: 'en su cuenta del Registro, por liquidar', tono: 'emerald',
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

export const ESTADOS_LIQUIDACION = ['SOLICITADA', 'LIQUIDADA'];

/**
 * Limpia la configuración entera de un S.O.: `{ anios: { '2026': {...} },
 * asignacion: { loteId: '2025' | 'NO' }, liquidacion: { loteId: { estado, fecha } } }`. `asignacion` solo guarda las
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
    // La LIQUIDACIÓN de cada lote emitido (20/11/2026): la pide el S.O. al MITECO y
    // nos lo dice él; el certificado solo lo cuenta en agregado. Solo las marcadas.
    const liquidacion = {};
    for (const [id, v] of Object.entries(raw?.liquidacion || {})) {
        const estado = String(v?.estado || '').trim().toUpperCase();
        if (!ESTADOS_LIQUIDACION.includes(estado)) continue;
        liquidacion[id] = { estado, fecha: fechaIso(v.fecha), por: (v.por || '').toString().trim() || null };
    }
    return {
        anios, asignacion, liquidacion,
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

/**
 * Lo que le cuesta al S.O. el lote, SIN IVA: lo que nos paga (la base de nuestra
 * factura si ya está emitida; si no, la oferta pactada × sus MWh) y la verificación,
 * que contrata él. null si no se sabe lo nuestro.
 */
export function costeDelLoteParaSo(lote, kwh) {
    const f = lote?.factura_so;
    let brokergy = null;
    if (f?.numero && numDecimal(f.base) > 0) brokergy = numDecimal(f.base);
    else if (lote?.oferta_lote != null && lote.oferta_lote !== '' && kwh > 0) brokergy = Number(lote.oferta_lote) * kwh / 1000;
    if (!(brokergy > 0)) return null;
    return { brokergy, verif: numDecimal(lote?.coste_verificacion) || 0 };
}

/**
 * A CUÁNTO LE SALE EL CAE al S.O. con nosotros, en €/MWh (05/11/2026, Fran: «a
 * cuánto está pagando el CAE, coste de verificación + compra a mí»), y lo que se
 * ahorra frente a la equivalencia financiera. Solo con los lotes que ya tienen la
 * verificación FACTURADA: sin ella el €/MWh saldría más bajo de lo que le cuesta.
 */
export function precioCaeParaSo(filas, equivalencia) {
    const con = (filas || []).filter(f => f.coste && f.coste.verif > 0 && f.kwh > 0);
    if (!con.length) return null;
    const mwh = con.reduce((a, f) => a + f.kwh / 1000, 0);
    const coste = con.reduce((a, f) => a + f.coste.brokergy + f.coste.verif, 0);
    const costeMwh = coste / mwh;
    return {
        costeCaeMwh: costeMwh,
        costeCaeGwh: mwh / 1000,
        costeCaeLotes: con.length,
        ahorroCaeEur: equivalencia > 0 ? (equivalencia - costeMwh) * mwh : null,
    };
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
export function computeVistaSo({ lotes = [], soId, anio, config, disponible = null, registro = null, hoy = new Date() }) {
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
        const caeLeido = (l?.documentos_so || []).find(d => d?.key === 'certificado_cae')?.cae || null;
        const fila = {
            // Para cruzarlo con el Registro Nacional de CAE (`cruzarRegistro`).
            refEmision: caeLeido?.referencia || null, caeInicial: caeLeido?.cae_inicial || null,
            caeFinal: caeLeido?.cae_final || null,
            fechaResolucion: fechaIso(caeLeido?.fecha_resolucion),
            resolucionSubidaAt: (l?.documentos_so || []).find(d => d?.key === 'certificado_cae')?.uploaded_at || null,
            registroMiteco: l.registro_miteco || null,
            // El día que se subió el justificante del MITECO: el de la presentación.
            fechaPresentacion: fechaIso((l?.documentos_so || []).find(d => d?.key === 'justificante_miteco')?.uploaded_at),
            liquidacion: cfg.liquidacion[l.id] || null,
            id: l.id, codigo: l.codigo, estado: l.estado, etapa: etapaDelLote(l),
            kwh, fuente, anio: cuentaPara, anioAuto: auto, manual,
            nExpedientes: l.num_expedientes ?? (l.expedientes_eco || l.expedientes || []).length,
            requerimiento: /REQUERIMIENTO/.test(l.estado || ''),
            oferta: l.oferta_lote != null && l.oferta_lote !== '' ? Number(l.oferta_lote) : null,
            // Lo que le cuesta al S.O. Solo para el €/MWh agregado: `vistaParaElSo`
            // no deja pasar el de cada lote.
            coste: costeDelLoteParaSo(l, kwh),
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
            // A cuánto le sale el CAE con nosotros (compra + verificación), €/MWh.
            ...(precioCaeParaSo(Object.values(etapas).flatMap(e => e.lotes), eq) || {}),
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

    // Lo que dice el MITECO de su cuenta: qué está inscrito, qué falta por resolver y
    // qué ha liquidado. Marca cada lote con dónde está (`fila.registro`).
    const registroCae = registro
        ? cruzarRegistro(registro, [...Object.values(etapas).flatMap(e => e.lotes), ...fuera], Number(anio), cuenta)
        : null;

    // Dónde está cada lote en UNA palabra, para la tabla (después del cruce: lo usa).
    for (const f of [...Object.values(etapas).flatMap(e => e.lotes), ...fuera]) f.situacion = situacionDelLote(f);

    return { anio: Number(anio), obligacion: cuenta, etapas: ETAPAS_SO.map(e => etapas[e.id]), brokergyGwh, fuera, oferta, registro: registroCae };
}

// ─── La TABLA: dónde está cada lote, a golpe de vista (20/11/2026) ──────────────
// Fran: «un botón para verlo en modo tabla, tipo el Excel que tienen con el estado
// de los expedientes: emitidos pendientes de liquidar, cuando se solicite la
// liquidación que aparezca así, los que están en verificador, pendientes de ser
// resueltos…». Una situación por lote, en el orden del camino: del papeleo al
// liquidado. La de un lote emitido la dice, por este orden, la liquidación que nos
// ha dicho el S.O. y luego su cuenta del Registro.
export const SITUACIONES = [
    { id: 'PREPARACION', txt: 'En preparación', ayuda: 'Firmas y oferta del verificador', tono: 'amber' },
    { id: 'VERIFICADOR', txt: 'En el verificador', ayuda: 'Verificándose', tono: 'blue' },
    { id: 'REQ_VERIFICADOR', txt: 'En el verificador · requerimiento', ayuda: 'Contestando las inexactitudes del verificador', tono: 'blue' },
    { id: 'POR_PRESENTAR', txt: 'Verificado · por presentar al MITECO', ayuda: 'Dictamen favorable: falta presentar la solicitud de emisión', tono: 'cyan' },
    { id: 'PTE_RESOLUCION', txt: 'En el MITECO · pendiente de resolución', ayuda: 'Solicitud de emisión presentada, sin resolver', tono: 'cyan' },
    { id: 'REQ_GESTOR', txt: 'En el MITECO · requerimiento del Gestor', ayuda: 'Contestando un requerimiento del Gestor Autonómico', tono: 'cyan' },
    { id: 'PTE_LIQUIDAR', txt: 'Emitido · pendiente de liquidar', ayuda: 'En su cuenta del Registro: cuenta para la obligación cuando lo liquide', tono: 'emerald' },
    { id: 'NO_CONSTA', txt: 'Emitido · no figura en su cuenta', ayuda: 'Lo damos por emitido y no está entre lo inscrito sin liquidar: ¿ya liquidado?', tono: 'ambar' },
    { id: 'LIQ_SOLICITADA', txt: 'Liquidación solicitada', ayuda: 'El S.O. ha pedido al MITECO liquidarlo', tono: 'lima' },
    { id: 'LIQUIDADO', txt: 'Liquidado', ayuda: 'Ya cuenta para su obligación', tono: 'verde' },
];
const ORDEN_SITUACION = Object.fromEntries(SITUACIONES.map((s, i) => [s.id, i]));

/** La situación de UNA fila de `computeVistaSo` (con `registro` ya cruzado, si lo hay). */
export function situacionDelLote(f) {
    const e = f?.estado || '';
    if (f?.etapa === 'EMITIDO') {
        if (f.liquidacion?.estado === 'LIQUIDADA') return 'LIQUIDADO';
        if (f.liquidacion?.estado === 'SOLICITADA') return 'LIQ_SOLICITADA';
        return f.registro?.situacion === 'NO_CONSTA' ? 'NO_CONSTA' : 'PTE_LIQUIDAR';
    }
    if (f?.etapa === 'MINISTERIO') {
        if (e === 'REQUERIMIENTO G.A.') return 'REQ_GESTOR';
        // Con nº de registro (o ya subido) está presentado; si no, por presentar.
        return f.registroMiteco || e === 'SUBIDO A MITECO' || ['PTE_RESOLUCION', 'PRESENTADO'].includes(f.registro?.situacion)
            ? 'PTE_RESOLUCION' : 'POR_PRESENTAR';
    }
    if (f?.etapa === 'VERIFICACION') {
        if (e === 'VERIFICADO') return 'POR_PRESENTAR';
        return e === 'REQUERIMIENTO VERIFICADOR' ? 'REQ_VERIFICADOR' : 'VERIFICADOR';
    }
    return 'PREPARACION';
}

/**
 * Las filas de la tabla, en el orden del camino (lo más atrás primero, como se
 * explica), y el resumen por situación con su nº de lotes y kWh. `lotes` son los de
 * las etapas (internos o los de `vistaParaElSo`); un lote vacío no entra.
 */
export function tablaDelSo(etapas = []) {
    const filas = etapas.flatMap(e => e.lotes || [])
        .filter(l => l && (l.nExpedientes == null || l.nExpedientes > 0))
        .map(l => ({ ...l, situacion: l.situacion || situacionDelLote(l) }))
        .sort((a, b) => (ORDEN_SITUACION[a.situacion] ?? 99) - (ORDEN_SITUACION[b.situacion] ?? 99)
            || String(a.codigo).localeCompare(String(b.codigo), 'es'));
    const resumen = SITUACIONES.map(s => {
        const xs = filas.filter(f => f.situacion === s.id);
        return { ...s, n: xs.length, kwh: xs.reduce((a, f) => a + (Number(f.kwh) || 0), 0) };
    }).filter(s => s.n > 0);
    return { filas, resumen, totalKwh: filas.reduce((a, f) => a + (Number(f.kwh) || 0), 0) };
}

// ─── El REGISTRO NACIONAL DE CAE: lo que de verdad tiene en su cuenta ───────────
// (Fran, 19/11/2026, con el certificado del MITECO a INTERALCO del 18/11/2026). Que
// un lote tenga la resolución FAVORABLE es el final para nosotros, pero no para el
// S.O.: el CAE entra en SU cuenta del Registro y solo cuenta para su obligación
// cuando ÉL lo LIQUIDA. El certificado trae tres cosas: los tramos inscritos a su
// nombre SIN liquidar (el Excel: vencimiento, códigos, total y expediente de
// emisión), las solicitudes de emisión aún sin resolver (nº E_CAE y REGAGE) y si ha
// liquidado algo contra el año. Se guarda tal cual lo dice el MITECO, y aquí se
// cruza con nuestros lotes: un tramo es NUESTRO si su expediente de emisión es el de
// la resolución del lote (o su primer código CAE); a falta de eso, si un lote
// emitido sin casar tiene EXACTAMENTE esos CAE. Una solicitud es nuestra si su
// REGAGE es el nº de registro del lote.

function fechaIso(v) {
    if (!v) return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
}

/** El vencimiento va en el propio código: CAE_008657599241_311228 → 31/12/2028. */
export function venceDeCodigo(codigo) {
    const m = String(codigo || '').match(/_(\d{2})(\d{2})(\d{2})\s*$/);
    if (!m) return null;
    const [, d, mes, a] = m;
    if (Number(mes) < 1 || Number(mes) > 12 || Number(d) < 1 || Number(d) > 31) return null;
    return `20${a}-${mes}-${d}`;
}

/** Limpia lo guardado del certificado. Un tramo sin total o sin vencimiento no entra. */
export function normalizarRegistro(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const tramos = (raw.tramos || []).map(t => ({
        vence: fechaIso(t.vence),
        inicial: String(t.inicial || '').trim() || null,
        final: String(t.final || '').trim() || null,
        total: Math.round(numDecimal(t.total) || 0),
        expediente: String(t.expediente || '').trim().toUpperCase() || null,
    })).filter(t => t.total > 0 && t.vence);
    if (!tramos.length) return null;
    const pendientes = (raw.pendientes || []).map(p => ({
        expediente: String(p.expediente || '').trim().toUpperCase() || null,
        registro: String(p.registro || '').trim() || null,
    })).filter(p => p.expediente || p.registro);
    const liq = raw.liquidado && /^\d{4}$/.test(String(raw.liquidado.anio)) ? {
        anio: Number(raw.liquidado.anio),
        kwh: numDecimal(raw.liquidado.kwh),
    } : null;
    return {
        fecha_certificado: fechaIso(raw.fecha_certificado),
        fecha_datos: fechaIso(raw.fecha_datos),
        fecha_pendientes: fechaIso(raw.fecha_pendientes),
        registro_solicitud: (raw.registro_solicitud || '').toString().trim() || null,
        csv: (raw.csv || '').toString().trim() || null,
        firmante: (raw.firmante || '').toString().trim() || null,
        tramos, pendientes, liquidado: liq,
        ficheros: raw.ficheros || null,
        actualizado_at: raw.actualizado_at || null,
        actualizado_por: raw.actualizado_por || null,
    };
}

/**
 * El certificado frente a nuestros lotes. `filas` son las de `computeVistaSo`
 * (todas, también las de otro año); a cada una le pone `registro` con su situación:
 * EN_SU_CUENTA (inscrito, sin liquidar) · PTE_RESOLUCION (solicitud presentada sin
 * resolver) · PRESENTADO (con nº de registro, pero aún no figuraba en el
 * certificado) · NO_CONSTA (lo damos por emitido y no está en su cuenta: o ya lo
 * liquidó o algo no cuadra).
 */
export function cruzarRegistro(raw, filas = [], anio, cuenta = null) {
    const reg = normalizarRegistro(raw);
    if (!reg) return null;
    const anioReg = Number((reg.fecha_datos || reg.fecha_certificado || '').slice(0, 4)) || null;

    // 1) Por el expediente de emisión o el primer código; 2) por la cifra exacta.
    const casado = new Map(); // índice del tramo → fila
    const filaDe = new Map(); // id de la fila → índice del tramo
    reg.tramos.forEach((t, i) => {
        const f = filas.find(x => !filaDe.has(x.id) && ((t.expediente && x.refEmision && x.refEmision.toUpperCase() === t.expediente)
            || (t.inicial && x.caeInicial && x.caeInicial === t.inicial)));
        if (f) { casado.set(i, { fila: f, por: 'EXPEDIENTE' }); filaDe.set(f.id, i); }
    });
    reg.tramos.forEach((t, i) => {
        if (casado.has(i)) return;
        const f = filas.find(x => !filaDe.has(x.id) && x.etapa === 'EMITIDO' && Math.round(x.kwh) === t.total);
        if (f) { casado.set(i, { fila: f, por: 'CIFRA' }); filaDe.set(f.id, i); }
    });

    const tramos = reg.tramos.map((t, i) => {
        const c = casado.get(i);
        return { ...t, lote: c ? c.fila.codigo : null, por: c ? c.por : null };
    });

    // 3) Una resolución que subimos DESPUÉS del certificado (Fran, 19/11/2026: «que se
    // actualice cuando subimos una resolución nueva»): el MITECO la inscribe en su cuenta
    // al resolver, así que entra como un tramo más —con su expediente, sus códigos y el
    // vencimiento que lleva el propio código—, marcado `nuevo` hasta el próximo certificado.
    // Una resuelta ANTES del certificado que no figura sigue siendo NO_CONSTA.
    const corte = reg.fecha_certificado;
    const esPosterior = (f) => {
        const fecha = f.fechaResolucion || fechaIso(f.resolucionSubidaAt);
        return !!(corte && fecha && fecha >= corte);
    };
    for (const f of filas) {
        if (filaDe.has(f.id) || f.etapa !== 'EMITIDO' || !(f.kwh > 0) || !esPosterior(f)) continue;
        const vence = venceDeCodigo(f.caeInicial) || venceDeCodigo(f.caeFinal);
        if (!vence) continue;
        filaDe.set(f.id, tramos.length);
        tramos.push({
            vence, inicial: f.caeInicial, final: f.caeFinal, total: Math.round(f.kwh),
            expediente: f.refEmision ? f.refEmision.toUpperCase() : null,
            lote: f.codigo, por: 'RESOLUCION', nuevo: true, fechaResolucion: f.fechaResolucion,
        });
    }

    const may = (s) => String(s || '').toUpperCase();
    // Una solicitud que ya tiene su resolución deja de estar pendiente.
    const resueltos = new Set(filas.filter(f => filaDe.has(f.id) && f.registroMiteco).map(f => may(f.registroMiteco)));
    const pendientes = reg.pendientes.filter(p => !(p.registro && resueltos.has(may(p.registro)))).map(p => {
        const f = p.registro ? filas.find(x => x.registroMiteco && may(x.registroMiteco) === may(p.registro)) : null;
        return { ...p, lote: f ? f.codigo : null, kwh: f ? f.kwh : null };
    });
    const pendDe = new Map(pendientes.filter(p => p.registro).map(p => [may(p.registro), p]));

    for (const f of filas) {
        const i = filaDe.get(f.id);
        if (i != null) {
            const t = tramos[i];
            f.registro = { situacion: 'EN_SU_CUENTA', expediente: t.expediente, vence: t.vence, nuevo: !!t.nuevo };
        } else if (f.registroMiteco && pendDe.has(may(f.registroMiteco))) {
            f.registro = { situacion: 'PTE_RESOLUCION', expediente: pendDe.get(may(f.registroMiteco)).expediente };
        } else if (f.etapa === 'MINISTERIO' && f.registroMiteco) {
            f.registro = { situacion: 'PRESENTADO' };
        } else if (f.etapa === 'EMITIDO') {
            f.registro = { situacion: 'NO_CONSTA' };
        } else f.registro = null;
    }

    const suma = (xs, k = 'total') => xs.reduce((s, x) => s + (Number(x[k]) || 0), 0);
    const nuestros = tramos.filter(t => t.lote);
    const porAnio = new Map();
    for (const t of tramos) {
        const a = Number(t.vence.slice(0, 4));
        const g = porAnio.get(a) || { anio: a, kwh: 0, brokergyKwh: 0, n: 0 };
        g.kwh += t.total; g.n++; if (t.lote) g.brokergyKwh += t.total;
        porAnio.set(a, g);
    }
    const totalKwh = suma(tramos);
    const brokergyKwh = suma(nuestros);
    const vence = porAnio.get(Number(anio)) || { anio: Number(anio), kwh: 0, brokergyKwh: 0, n: 0 };
    const liquidadoKwh = reg.liquidado && reg.liquidado.anio === Number(anio) ? reg.liquidado.kwh : null;
    const cubribleKwh = cuenta ? cuenta.cubribleGwh * 1e6 : null;

    return {
        fechaCertificado: reg.fecha_certificado, fechaDatos: reg.fecha_datos, fechaPendientes: reg.fecha_pendientes,
        registroSolicitud: reg.registro_solicitud, csv: reg.csv, anioRegistro: anioReg,
        tramos, nTramos: tramos.length, totalKwh,
        brokergyKwh, nBrokergy: nuestros.length,
        // Lo resuelto después del certificado, que ya contamos en su cuenta.
        nuevos: tramos.filter(t => t.nuevo).map(t => ({ codigo: t.lote, kwh: t.total, fechaResolucion: t.fechaResolucion || null })),
        nuevosKwh: suma(tramos.filter(t => t.nuevo)),
        otrosKwh: totalKwh - brokergyKwh, nOtros: tramos.length - nuestros.length,
        // Lo que él dice que compró a otros frente a lo que hay de otros en su cuenta.
        otrosDeclaradoKwh: cuenta ? cuenta.otros_gwh * 1e6 : null,
        porVencimiento: [...porAnio.values()].sort((a, b) => a.anio - b.anio),
        // Lo que caduca el 31/12 del año que se mira: o se liquida contra él, o se pierde.
        venceKwh: vence.kwh, venceBrokergyKwh: vence.brokergyKwh, nVence: vence.n,
        liquidadoKwh,
        // Lo inscrito llega para cubrir lo que puede cubrir con CAE: le basta con liquidarlo.
        pctCubribleEnCuenta: cubribleKwh > 0 ? Math.min(100, totalKwh / cubribleKwh * 100) : null,
        pendientes, pendientesKwh: suma(pendientes.filter(p => p.kwh != null), 'kwh'),
        // Solo los que cuentan para el año que se mira: uno de otro año que no está
        // en su cuenta lo normal es que ya lo liquidara.
        presentados: filas.filter(f => f.anio === Number(anio) && f.registro?.situacion === 'PRESENTADO').map(f => ({ codigo: f.codigo, kwh: f.kwh })),
        // Uno que nos ha dicho que LIQUIDÓ no está en su cuenta porque ya no tiene que estar.
        noConstan: filas.filter(f => f.anio === Number(anio) && f.registro?.situacion === 'NO_CONSTA' && f.liquidacion?.estado !== 'LIQUIDADA').map(f => ({ codigo: f.codigo, kwh: f.kwh })),
    };
}

/**
 * Con QUÉ se cubre lo que le falta, y qué hay que cerrar para llegar (03/11/2026,
 * Fran: «para intentar cubrir todas las obligaciones que me pide Interalco»).
 * Cuenta primero TODO lo listo para lotear; si no llega, los expedientes con la
 * obra terminada (CERRANDO) sin incidencias graves, de más a menos MWh, hasta
 * cubrirlo: esos son los que hay que terminar.
 * En DOC. COMPLETA manda el ESTADO, no las incidencias (Fran, 03/11/2026: «si
 * tienen DOC. COMPLETA marcado, deberían estar listos para presentar»): una grave
 * que siga abierta ahí suele estar resuelta y sin cerrar, y solo se avisa
 * (`listosConGraves`). En lo que aún se está cerrando, la grave SÍ lo aparta.
 * `oferta` es la de `computeVistaSo`; sus expedientes traen `incidencias`.
 */
export function planParaCubrir(oferta, faltaGwh) {
    const fila = (id) => (oferta?.filas || []).find(f => f.id === id)?.expedientes || [];
    const graves = (x) => Number(x?.incidencias?.graves) || 0;
    const porMwh = (a, b) => (b.kwh || 0) - (a.kwh || 0);
    const listos = [...fila('LISTO')].sort(porMwh);
    const listosConGraves = listos.filter(graves);
    const cerrando = fila('CERRANDO').filter(x => !graves(x)).sort(porMwh);
    const conGraves = fila('CERRANDO').filter(graves).sort(porMwh);

    const faltaKwh = Math.max(0, (Number(faltaGwh) || 0) * 1e6);
    const kwhListos = listos.reduce((s, x) => s + (x.kwh || 0), 0);
    let acum = kwhListos;
    const aCerrar = [];
    for (const x of cerrando) {
        if (acum >= faltaKwh) break;
        aCerrar.push(x);
        acum += x.kwh || 0;
    }
    return {
        faltaKwh, listos, listosConGraves, cerrando, conGraves, kwhListos,
        aCerrar: new Set(aCerrar.map(x => x.numero)),
        nACerrar: aCerrar.length,
        kwhAlcanzado: acum,
        // Con todo lo listo y TODO lo que cierra sin graves, ¿llega?
        alcanza: kwhListos + cerrando.reduce((s, x) => s + (x.kwh || 0), 0) >= faltaKwh,
        bastaConLoListo: kwhListos >= faltaKwh,
    };
}

/** Los años que tiene sentido elegir: los configurados, el actual y el de los lotes. */
export function aniosElegibles(config, lotes = [], soId, hoy = new Date()) {
    const s = new Set(Object.keys(normalizarObligacion(config || {}).anios).map(Number));
    s.add(hoy.getFullYear());
    for (const l of lotes) if (String(l?.sujeto_obligado_id) === String(soId)) s.add(anioDelLote(l, hoy));
    return [...s].sort((a, b) => b - a);
}
