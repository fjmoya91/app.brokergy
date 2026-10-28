// ─── certapp/documentos.js — el apartado «Documentos» de una obra ────────────
// Fran (26/10/2026): «un apartado para ver los documentos, un visor de PDF… que
// el mismo visor donde aparezca el certificado ya me permita darle a firmar… y
// subir el .cex nuevo o la última versión… que pueda tener acceso directamente
// el certificador e incluso nosotros como admin».
//
// Lo que hay en «1. CEE» de la obra, ordenado para leerlo:
//   · lo ACTUAL de cada clase (certificado, firmado, xml, cex, croquis) con el
//     MISMO criterio que la entrega (`entrega.elegirFicheros`: el más reciente;
//     el firmado, solo si es posterior al PDF);
//   · las VERSIONES ANTERIORES: lo que queda en «1. CEE» y no manda, más «OLD»;
//   · los .cex que ha subido el certificador, en CUARENTENA (ver abajo);
//   · lo que devuelve el Registro (Fran, 28/10/2026: «que se suba el justificante de
//     presentación y la etiqueta… y un apartado de otros para la tasa, la
//     resolución»): el JUSTIFICANTE y la ETIQUETA en la raíz de «1. CEE», y lo demás
//     en su subcarpeta CARPETA_OTROS. Lo sube services/certapp/presentacion.js.
// Cada fichero lleva su descarga firmada (`docs.urlFichero`, 12 h); el visor de la
// app la pide como bytes (el `sandbox` de /fichero no deja a Chrome pintar el PDF
// en una pestaña: ERR_BLOCKED_BY_CLIENT, medido con la 2026EXT_1). El admin
// recibe además el enlace de Drive de cada uno (`drive`); el certificador, nunca.
//
// REGLA — el .cex del certificador va a CUARENTENA: subcarpeta CARPETA_CUARENTENA
// de «1. CEE» y nombre `….cex.cuarentena`. Un .cex es un pickle que CE3X, el motor
// y el PC abren ejecutando lo que lleva; así ni `elegirFicheros` (solo mira la
// raíz de «1. CEE» y `.cex$`), ni el PC, ni un doble clic en el espejo de Drive lo
// abren. Se le devuelve como descarga con su nombre `.cex` (`nombreDescarga`).
// ─────────────────────────────────────────────────────────────────────────────
const drive = require('./drive');
const docs = require('./docs');
const { nombreDescarga } = require('./tipos');
const { elegirFicheros } = require('./entrega');

const CARPETA_OLD = 'OLD';
const CARPETA_CUARENTENA = 'CEX DEL CERTIFICADOR (NO ABRIR)';
const CARPETA_OTROS = 'OTROS';
const SUFIJO_CUARENTENA = '.cuarentena';
const MAX_CUARENTENA = 20;
const ES_CARPETA = 'application/vnd.google-apps.folder';

const N = (f) => String(f?.name || '').toUpperCase();
const ext = (f) => (N(f).match(/\.([A-Z0-9]+)$/) || [])[1] || '';

/** De qué clase es un fichero de «1. CEE» (null: no se enseña). */
function claseDe(f) {
    const n = N(f);
    if (n.endsWith('.CEX.CUARENTENA')) return 'cex';
    const e = ext(f);
    if (e === 'XML') return 'xml';
    if (e === 'CEX') return 'cex';
    if (e !== 'PDF') return null;
    if (/_FDO(_OLD\d*)?\.PDF$/.test(n)) return 'firmado';
    // Antes que «CEE»: un justificante o una etiqueta no son el certificado.
    if (/JUSTIFICANTE/.test(n)) return 'justificante';
    if (/ETIQUETA/.test(n)) return 'etiqueta';
    if (/CROQUIS/.test(n)) return 'croquis';
    if (/CEE/.test(n)) return 'certificado';
    return null;
}

/** Quién lo dejó, por el nombre (sin el _OLD que le pone el archivo). */
function autorDe(f) {
    const n = N(f).replace(/_OLD\d*(\.[A-Z0-9.]+)$/, '$1');
    if (n.endsWith('.CEX.CUARENTENA') || /_FDO\.PDF$/.test(n) || / - CEE\.(XML|PDF)$/.test(n)
        || /JUSTIFICANTE|ETIQUETA/.test(n)) return 'certificador';
    if (/_REVISAR\.|CROQUIS/.test(n)) return 'IA';
    return 'BROKERGY';
}

function aDoc(obra, f, { admin, actual = false }) {
    const clase = claseDe(f);
    return {
        id: f.id,
        clase,
        nombre: nombreDescarga(f.name),
        fecha: f.modifiedTime || null,
        bytes: f.size != null ? Number(f.size) : null,
        autor: autorDe(f),
        actual,
        pdf: ext(f) === 'PDF',
        url: docs.urlFichero(obra.id, f.id),
        ...(admin ? { drive: f.webViewLink || null } : {}),
    };
}

const masReciente = (a, b) => (Date.parse(b.fecha || '') || 0) - (Date.parse(a.fecha || '') || 0);

/** Lo que el XML cargado dice del certificado (sin el JSONB entero). */
function resumenXml(obra) {
    const c = obra.cee?.cee_inicial || {};
    if (!c.epnrLetra && !c.emisionesLetra) return null;
    const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
        consumo: c.epnrLetra || null,
        emisiones: c.emisionesLetra || null,
        consumo_kwh_m2: num(c.epnrConsumo),
        demanda_kwh_m2: num(c.demandaGlobal),
        superficie: num(c.superficieHabitable),
        zona: c.zonaClimatica || null,
        fecha_firma: c.fechaFirma || null,
        fichero: c._fileName || null,
    };
}

/** La inscripción en el Registro, tal como la dejó el justificante (`cee.registro`). */
function resumenRegistro(obra) {
    const r = obra.cee?.registro;
    if (!r?.at) return null;
    return { at: r.at, fecha: r.fecha || null, leida: r.origen === 'justificante', numero: r.numero || null };
}

/**
 * El apartado entero.
 * @returns {Promise<{ hay: boolean, certificado, firmado, xml, cex, croquis, justificante, etiqueta,
 *   anteriores: object[], cuarentena: object[], otros: object[], firma: object|null,
 *   firma_anterior: boolean, xml_resumen: object|null, registro: object|null }>}
 */
async function listar(obra, { admin = false } = {}) {
    const f = obra.cee?.firma || null;
    const out = {
        hay: false, certificado: null, firmado: null, xml: null, cex: null, croquis: null,
        justificante: null, etiqueta: null,
        anteriores: [], cuarentena: [], otros: [],
        firma: f ? { at: f.at || null, firmante: f.firmante?.nombre || null, via: f.via || null, coincide: f.coincide ?? null } : null,
        firma_anterior: false,
        xml_resumen: resumenXml(obra),
        registro: resumenRegistro(obra),
    };
    const carpetaCee = await drive.carpetaCeeSiExiste(obra);
    if (!carpetaCee) return out;
    const lista = await drive.listar(carpetaCee);
    const ficheros = lista.filter(x => x.mimeType !== ES_CARPETA && claseDe(x));
    const elegidos = elegirFicheros(ficheros, obra.numero_expediente);
    const actuales = new Set();
    for (const k of ['certificado', 'firmado', 'xml', 'cex', 'croquis']) {
        const elegido = elegidos[k === 'certificado' ? 'pdf' : k];
        if (!elegido) continue;
        out[k] = aDoc(obra, elegido, { admin, actual: true });
        actuales.add(elegido.id);
    }
    // El justificante y la etiqueta: el más reciente de cada uno (los anteriores, a OLD).
    for (const k of ['justificante', 'etiqueta']) {
        const elegido = ficheros.filter(x => claseDe(x) === k && !/_OLD\d*\./.test(N(x)))
            .sort((a, b) => (Date.parse(b.modifiedTime || '') || 0) - (Date.parse(a.modifiedTime || '') || 0))[0];
        if (!elegido) continue;
        out[k] = aDoc(obra, elegido, { admin, actual: true });
        actuales.add(elegido.id);
    }
    const sub = (nombre) => lista.find(x => x.mimeType === ES_CARPETA && N(x) === nombre.toUpperCase());
    const old = sub(CARPETA_OLD);
    const cuarentena = sub(CARPETA_CUARENTENA);
    const otros = sub(CARPETA_OTROS);
    const [enOld, enCuarentena, enOtros] = await Promise.all([
        old ? drive.listar(old.id) : [],
        cuarentena ? drive.listar(cuarentena.id) : [],
        otros ? drive.listar(otros.id) : [],
    ]);
    out.anteriores = [...ficheros.filter(x => !actuales.has(x.id)), ...enOld.filter(x => x.mimeType !== ES_CARPETA && claseDe(x))]
        .map(x => aDoc(obra, x, { admin })).sort(masReciente);
    out.cuarentena = enCuarentena.filter(x => x.mimeType !== ES_CARPETA && claseDe(x) === 'cex')
        .map(x => aDoc(obra, x, { admin })).sort(masReciente);
    // «Otros»: todo lo de su carpeta (la tasa, las resoluciones…), sin su OLD.
    out.otros = enOtros.filter(x => x.mimeType !== ES_CARPETA)
        .map(x => ({ ...aDoc(obra, x, { admin, actual: true }), clase: 'otros', autor: 'certificador' })).sort(masReciente);
    // Firmó una versión que ya no es la actual: se dice, y vuelve el «Firmar».
    out.firma_anterior = !!out.firma && !out.firmado;
    out.hay = !!(out.certificado || out.firmado || out.xml || out.cex || out.croquis || out.justificante || out.etiqueta
        || out.anteriores.length || out.cuarentena.length || out.otros.length);
    return out;
}

module.exports = {
    listar, claseDe, autorDe, nombreDescarga, resumenXml, resumenRegistro,
    CARPETA_OLD, CARPETA_CUARENTENA, CARPETA_OTROS, SUFIJO_CUARENTENA, MAX_CUARENTENA,
};
