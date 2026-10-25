// ─── factura.js ──────────────────────────────────────────────────────────────
// Las FACTURAS de la pestaña Facturación (fase 2): series y emisores, totales
// con IRPF, rectificativas, estado visible, mensaje y el payload del PDF.
//
// FUENTE ÚNICA del editor (total en vivo y vista previa), del backend (lo que se
// guarda, el PDF, el registro de VERI*FACTU), del MCP y de las pruebas. Las
// LÍNEAS son las del presupuesto (`presupuesto.js`: mismas partidas, mismo
// saneado) y la cuenta de cada línea y el PDF, los de `facturaCee.js` —la
// réplica de la factura de AppSheet—, que se amplió para esto sin cambiar lo
// que sale en un CEE directo.
//
// Puro ESM y sin React: el backend lo carga por import() dinámico.
// ─────────────────────────────────────────────────────────────────────────────
import { totalesFactura, buildFacturaCeeHtml, sumarDias, hoyIso, isoAEs } from '../../cee-directo/logic/facturaCee.js';
import { sanearLineas, conceptoDeLineas, partidasDe, normalizarTexto, MAX_OBSERVACIONES } from './presupuesto.js';
import { BROKERGY_EMISOR, fmtEur } from '../../cee-directo/logic/ofertaCee.js';

export { fmtEur, hoyIso, isoAEs, sumarDias, conceptoDeLineas, normalizarTexto };
export const buildFacturaHtml = buildFacturaCeeHtml;

const num = (n) => {
    if (typeof n === 'string') n = n.replace(/\s/g, '').replace(',', '.');
    const v = Number(n);
    return Number.isFinite(v) ? v : 0;
};
const r2 = (n) => Math.round(num(n) * 100) / 100;
const txt = (v) => (v == null ? '' : String(v).trim());

/**
 * Las SERIES, una por emisor. ING es BROKERGY (la sociedad, la de siempre). FML
 * son las facturas de Fran como profesional a la sociedad: van con retención de
 * IRPF y sin la marca BROKERGY (no las emite BROKERGY). Los DATOS de cada
 * emisor viven en la tabla `facturacion_emisores`, no aquí (el repo es público).
 */
export const SERIES = {
    ING: { nombre: 'BROKERGY', descripcion: 'Facturas de la sociedad', irpfPct: 0, marca: true },
    FML: { nombre: 'Fran Moya · profesional', descripcion: 'Servicios de Fran a la sociedad, con retención de IRPF', irpfPct: 15, marca: false },
};
export const serieValida = (s) => Object.prototype.hasOwnProperty.call(SERIES, String(s || '').toUpperCase());

export const VENCIMIENTO_DIAS = 30;
export const MAX_OBS_FACTURA = MAX_OBSERVACIONES;

// Ordinarias: la serie de AppSheet («26ING_88», «26FML_19»), el correlativo no
// se reinicia en enero. Rectificativas: SU serie específica (art. 6.1.a RD
// 1619/2012), «R-26ING_1». La regex de la hoja (`^\d{2}ING_`) no la confunde con
// una ordinaria.
export const RE_ORDINARIA = /^(\d{2})([A-Z]{2,6})_(\d+)$/;
export const RE_RECTIFICATIVA = /^R-(\d{2})([A-Z]{2,6})_(\d+)$/;
export const yyDe = (fechaIso) => String(fechaIso || hoyIso()).slice(2, 4);
export const numeroRectificativa = (serie, correlativo, fechaIso) => `R-${yyDe(fechaIso)}${serie}_${correlativo}`;

/**
 * Totales de una factura. `total` es lo que se PAGA (neto + IVA − IRPF).
 * `importeTotal` es el «importe total de la factura» de VERI*FACTU y del QR:
 * base + cuota SIN suplidos y SIN retención (FAQ de desarrolladores de la AEAT,
 * nº 20 y 21: ni el suplido ni la retención van en el registro).
 */
export function calcularFactura({ lineas = [], irpfPct = 0 } = {}) {
    const t = totalesFactura(lineas, { irpfPct });
    const baseSujeta = r2(t.neto - t.suplidos);
    return { ...t, baseSujeta, importeTotal: r2(baseSujeta + t.iva) };
}

/** Desglose por tipo de IVA de lo que NO es suplido (lo que va al registro de VERI*FACTU). */
export function desgloseIva(lineas = []) {
    const { lineas: ls } = totalesFactura(lineas);
    const porTipo = new Map();
    for (const l of ls) {
        if (l.suplido) continue;
        const k = r2(l.ivaPct);
        const d = porTipo.get(k) || { tipo: k, base: 0, cuota: 0 };
        d.base = r2(d.base + l.subtotal);
        d.cuota = r2(d.cuota + l.iva);
        porTipo.set(k, d);
    }
    return [...porTipo.values()];
}

// ── NIF ───────────────────────────────────────────────────────────────────────

const LETRAS_DNI = 'TRWAGMYFPDXBNJZSQVHLCKE';
/**
 * ¿Es un NIF español con su control bien? DNI, NIE o CIF. No bloquea (un
 * cliente extranjero no lo tiene): se AVISA. Lo que no puede faltar es que haya
 * uno.
 */
export function validarNif(v) {
    const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (/^\d{8}[A-Z]$/.test(s)) return { valido: LETRAS_DNI[Number(s.slice(0, 8)) % 23] === s[8], tipo: 'DNI', nif: s };
    if (/^[XYZ]\d{7}[A-Z]$/.test(s)) {
        const n = Number(String('XYZ'.indexOf(s[0])) + s.slice(1, 8));
        return { valido: LETRAS_DNI[n % 23] === s[8], tipo: 'NIE', nif: s };
    }
    if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(s)) {
        const d = s.slice(1, 8).split('').map(Number);
        let suma = 0;
        d.forEach((x, i) => { if (i % 2 === 1) suma += x; else { const y = x * 2; suma += Math.floor(y / 10) + (y % 10); } });
        const c = (10 - (suma % 10)) % 10;
        const ctrl = s[8];
        const ok = /[PQRSNW]/.test(s[0]) ? ctrl === 'JABCDEFGHI'[c]
            : /[ABEH]/.test(s[0]) ? ctrl === String(c)
                : ctrl === String(c) || ctrl === 'JABCDEFGHI'[c];
        return { valido: ok, tipo: 'CIF', nif: s };
    }
    return { valido: false, tipo: null, nif: s };
}

// ── Lo que se guarda ─────────────────────────────────────────────────────────

/** Los datos fiscales del cliente tal como se FOTOGRAFÍAN en la factura. */
export function sanearCliente(c = {}) {
    const nif = txt(c.cif || c.nif || c.dni).toUpperCase();
    const v = validarNif(nif);
    return {
        razon_social: txt(c.razon_social || c.nombre).toUpperCase().slice(0, 200),
        cif: nif.slice(0, 20),
        direccion: txt(c.direccion).slice(0, 200),
        cp: txt(c.cp || c.codigo_postal).slice(0, 10),
        municipio: txt(c.municipio).slice(0, 100),
        provincia: txt(c.provincia).slice(0, 100),
        tlf: txt(c.tlf || c.telefono).slice(0, 30),
        email: txt(c.email).slice(0, 200),
        es_empresa: c.es_empresa != null ? !!c.es_empresa : v.tipo === 'CIF',
        persona_fisica: v.tipo === 'DNI' || v.tipo === 'NIE',
    };
}

const fechaValida = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) ? String(s) : null);

/**
 * Lo que manda el editor o el MCP, tal como se GUARDA en un borrador. Las cifras
 * las recalcula siempre el servidor desde las líneas: nunca se fía de las del
 * navegador.
 */
export function sanearFactura(b = {}) {
    const serie = serieValida(b.serie) ? String(b.serie).toUpperCase() : 'ING';
    const irpfPct = b.irpf_pct != null && b.irpf_pct !== '' ? Math.min(100, Math.max(0, num(b.irpf_pct))) : SERIES[serie].irpfPct;
    const lineas = sanearLineas(b.lineas);
    const fecha = fechaValida(b.fecha);
    return {
        serie,
        cliente: sanearCliente(b.cliente || {}),
        lineas,
        irpf_pct: irpfPct,
        fecha,
        vencimiento: fechaValida(b.vencimiento) || (fecha ? sumarDias(fecha, VENCIMIENTO_DIAS) : null),
        fecha_operacion: txt(b.fecha_operacion).slice(0, 60) || null,
        observaciones: b.observaciones == null ? null : String(b.observaciones).slice(0, MAX_OBS_FACTURA),
        expediente: txt(b.expediente).slice(0, 40) || null,
    };
}

/** Las cifras de la fila (para el listado: no lee el JSONB de las líneas). */
export function derivados(f = {}) {
    const t = calcularFactura({ lineas: f.lineas || [], irpfPct: f.irpf_pct });
    return {
        neto: t.neto, iva: t.iva, irpf: t.irpf, descuento: t.descuento, total: t.total,
        concepto: conceptoDeLineas(f.lineas || []) || null,
        cliente_nombre: f.cliente?.razon_social || null,
        cliente_nif: f.cliente?.cif || null,
    };
}

/**
 * Lo que impide EMITIR (una factura emitida no se borra ni se cambia: se
 * rectifica). Devuelve { errores, avisos }.
 */
export function revisarParaEmitir(f = {}) {
    const errores = [], avisos = [];
    const c = f.cliente || {};
    if (!txt(c.razon_social)) errores.push('Falta el nombre o la razón social del cliente.');
    if (!txt(c.cif)) errores.push('Falta el NIF/CIF del cliente: una factura completa no puede salir sin él.');
    else if (!validarNif(c.cif).valido) avisos.push(`El NIF «${c.cif}» no cuadra (letra o dígito de control). Revísalo si es español.`);
    if (!txt(c.direccion) || !txt(c.municipio)) avisos.push('Falta el domicilio del cliente: la factura completa lo lleva (art. 6.1.e RD 1619/2012).');
    const ls = f.lineas || [];
    if (!ls.length) errores.push('La factura no tiene ninguna partida.');
    if (ls.length && ls.every(l => l.suplido)) errores.push('Una factura solo con suplidos no es una factura (no hay operación sujeta).');
    const t = calcularFactura({ lineas: ls, irpfPct: f.irpf_pct });
    if (f.tipo === 'F1' || !f.tipo) {
        if (!(t.total > 0)) errores.push('La factura no tiene importe.');
    } else if (!txt(f.motivo_rectificacion)) {
        errores.push('Una rectificativa tiene que decir por qué rectifica.');
    }
    if (!fechaValida(f.fecha)) errores.push('Falta la fecha de la factura.');
    if (ls.some(l => !l.suplido && r2(l.ivaPct) === 0)) {
        avisos.push('Hay una partida al 0 % de IVA que no es suplido: si es una exención, el motivo tiene que constar en la factura.');
    }
    return { errores, avisos };
}

// ── Rectificativas ───────────────────────────────────────────────────────────

/**
 * Las líneas de una rectificativa que ANULA la factura entera: las mismas, en
 * negativo (las unidades, no el precio: así se lee «−1 × 150,00 €»). Para una
 * rectificación parcial se editan después.
 */
export function lineasRectificativa(lineas = []) {
    return sanearLineas((lineas || []).map(l => ({ ...l, key: undefined, uds: -Math.abs(num(l.uds) || 1) })));
}

// ── Estado visible ───────────────────────────────────────────────────────────

/** El estado que se ENSEÑA: una emitida sin cobrar se lee «pendiente» o «vencida». */
export function estadoVisible(f = {}, hoy = hoyIso()) {
    if (f.estado === 'BORRADOR') return { clave: 'BORRADOR', texto: 'Borrador', tono: 'gris' };
    if (f.estado === 'PAGADA') return { clave: 'PAGADA', texto: 'Cobrada', tono: 'verde' };
    if (f.estado === 'RECTIFICADA') return { clave: 'RECTIFICADA', texto: 'Rectificada', tono: 'gris' };
    if (num(f.total) <= 0) return { clave: 'EMITIDA', texto: 'Emitida', tono: 'azul' };
    if (f.vencimiento && f.vencimiento < hoy) return { clave: 'VENCIDA', texto: 'Vencida', tono: 'ambar' };
    return { clave: 'PENDIENTE', texto: 'Pendiente de cobro', tono: 'azul' };
}

// ── Duplicar ─────────────────────────────────────────────────────────────────

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/**
 * «… – septiembre 2026» → «… – octubre 2026». Para repetir la factura del mes
 * (la de FML es una al mes con el mismo concepto): duplicar avanza el mes del
 * concepto y de la fecha de operación. Lo que no lleva un mes no cambia.
 */
export function avanzarMes(texto) {
    return String(texto ?? '').replace(/\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(\s+(?:de\s+)?)(\d{4})\b/gi, (m, mes, sep, anio) => {
        const i = MESES.indexOf(mes.toLowerCase());
        const sig = MESES[(i + 1) % 12];
        const y = i === 11 ? Number(anio) + 1 : Number(anio);
        const conMayus = mes[0] === mes[0].toUpperCase() ? sig[0].toUpperCase() + sig.slice(1) : sig;
        return `${conMayus}${sep}${y}`;
    });
}

// ── PDF ──────────────────────────────────────────────────────────────────────

/** El emisor como lo lee la plantilla del PDF. Sin fila en la BD, BROKERGY. */
export function emisorPdf(e = null, serie = 'ING') {
    const marca = SERIES[serie]?.marca !== false;
    if (!e) return { ...BROKERGY_EMISOR, marca };
    return {
        razonSocial: e.razon_social, direccion: e.direccion || '', cp: e.cp || '', municipio: e.municipio || '',
        provincia: e.provincia || '', cif: e.nif, tlf: e.tlf || '', email: e.email || '', banco: e.banco || '',
        iban: e.iban || '', persona_fisica: !!e.persona_fisica, marca,
    };
}

/**
 * El payload de `buildFacturaHtml` a partir de una fila de `facturas_emitidas`
 * (o de un borrador del editor). `qr` solo cuando el registro de VERI*FACTU se
 * remite: un QR con la leyenda en una factura que no se ha remitido diría algo
 * falso.
 */
export function payloadPdf(f = {}, emisor = null, { qr = null, rectificada = null } = {}) {
    return {
        numero: f.numero || '', borrador: !f.numero,
        fecha: isoAEs(f.fecha), vencimiento: num(f.total) > 0 ? isoAEs(f.vencimiento) : '',
        fechaOperacion: f.fecha_operacion || '',
        cliente: f.cliente || {}, lineas: f.lineas || [], irpfPct: f.irpf_pct || 0,
        expediente: f.expediente || '', observaciones: f.observaciones || '',
        emisor: emisorPdf(emisor, f.serie || 'ING'),
        rectifica: f.tipo && f.tipo !== 'F1'
            ? { numero: f.rectifica_numero || rectificada?.numero || '', fecha: isoAEs(rectificada?.fecha || ''), motivo: f.motivo_rectificacion || '' }
            : null,
        qr,
    };
}

/** `{nº} - {cliente}.pdf`, como AppSheet. */
export const nombrePdfFactura = (numero, razon) => `${numero || 'BORRADOR'} - ${razon || ''}`.replace(/[\\/<>:"|?*]/g, '_').trim() + '.pdf';

// ── Mensaje ──────────────────────────────────────────────────────────────────

const primerNombre = (s) => String(s || '').trim().split(/\s+/)[0] || '';
const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);

/**
 * El WhatsApp / email con el que sale la factura (con *negritas*). Dice qué se
 * factura, cuánto, cuándo vence y a qué cuenta se paga. El de los CEE directos
 * sigue siendo `mensajeFactura` de facturaCee (habla del certificado).
 */
export function mensajeFacturaGeneral({ nombre, esEmpresa = false, numero, total, vencimiento, lineas = [], emisor = null, serie = 'ING', rectifica = null } = {}) {
    const e = emisorPdf(emisor, serie);
    const saludo = nombre && !esEmpresa ? `¡Hola ${capital(primerNombre(nombre))}!` : '¡Hola!';
    const partidas = partidasDe(lineas);
    const que = partidas.length === 1 ? `por ${partidas[0].replace(/^./, c => c.toLowerCase())}` : partidas.length ? 'por estos trabajos:' : '';
    const lista = partidas.length > 1 ? partidas.slice(0, 8).map(p => `• ${p}`) : [];
    const firma = e.marca !== false ? ['Un saludo,', '*BROKERGY* · Ingeniería Energética'] : ['Un saludo,', e.razonSocial];
    if (rectifica) {
        return [
            saludo, '',
            `Te paso la factura rectificativa *${numero || ''}*, que corrige la factura *${rectifica.numero}*.`,
            rectifica.motivo ? `Motivo: ${rectifica.motivo}` : '',
            '',
            `💶 *Importe de la rectificación: ${fmtEur(total)}*`,
            '',
            'Muchas gracias.',
            ...firma,
        ].filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
    }
    return [
        saludo, '',
        `Te paso la factura *${numero || ''}* ${que}`.trim(),
        ...lista,
        '',
        `💶 *Importe: ${fmtEur(total)}*${vencimiento ? ` · vence el ${isoAEs(vencimiento)}` : ''}`,
        '',
        ...(e.iban ? ['Puedes abonarla por transferencia a esta cuenta, indicando el nº de factura en el concepto:', `🏦 ${e.banco ? `${e.banco} · ` : ''}*${e.iban}*`, ''] : []),
        'Muchas gracias.',
        ...firma,
    ].join('\n');
}
