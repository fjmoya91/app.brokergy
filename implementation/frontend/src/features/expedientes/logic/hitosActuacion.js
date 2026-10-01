// ============================================================================
// HITOS DE LA ACTUACIÓN — las fechas que cuentan la historia de la obra.
// ----------------------------------------------------------------------------
// El CIFO declara un inicio y un fin de actuación, y el verificador los cruza con
// todo lo demás que tiene delante: las facturas y los dos certificados de
// eficiencia energética. Cuando no cuadran —una factura de entrega de material
// meses antes de que existiera el CEE inicial— abre un requerimiento, aunque la
// obra se hiciera en su orden. Este módulo reúne esas fechas en un solo sitio
// para que el propio CIFO las enseñe juntas y, si hace falta, las aclare.
//
// Lo usan TRES superficies y no pueden decir cosas distintas:
//   · el bloque «Hitos de la actuación» del CIFO (cifoDoc.js),
//   · el popup donde se marcan las facturas y se escribe la aclaración,
//   · la ruta que pide a la IA una redacción (backend, por import() ESM).
//
// REGLA — solo se AFIRMA lo que dicen los datos. Cada fecha sale de un documento
// (una factura, el Certificado RITE, el propio .xml del CEE) y la aclaración
// sugerida solo encadena relaciones que se pueden comprobar con esas fechas: si
// la firma del CEE inicial es posterior al inicio, la frase «con posterioridad al
// certificado» no se escribe. Un certificado firmado por el instalador no puede
// llevar una afirmación nuestra que los propios papeles del expediente desmientan.
//
// REGLA — lo que no consta no se imprime. Sin CEE final todavía, su línea no
// aparece: «pendiente» en un certificado firmado dice más de lo que sabemos.
//
// Módulo JS PURO (sin React ni DOM): lo importa también el backend.
// ============================================================================
import { calcCifo, motivoNoInicio, MOTIVOS_NO_INICIO } from './calcCifo.js';

export { MOTIVOS_NO_INICIO, motivoNoInicio };

/** Tope de la aclaración: cabe en la hoja de la instalación del CIFO sin desbordarla. */
export const ACLARACION_MAX = 420;

const iso = (v) => (/^\d{4}-\d{2}-\d{2}/.test(String(v || '')) ? String(v).slice(0, 10) : null);
export const fechaEs = (v) => (iso(v) ? iso(v).split('-').reverse().join('/') : null);

// Fecha de visita o de firma del CEE de esa fase. Misma cascada que
// `backend/utils/ceeFechas.js`: la rejilla del módulo CEE (que alguien puede haber
// corregido a mano) → lo leído del .xml → el espejo en `documentacion`.
function fechaCee(exp, campo, fase) {
    const cee = exp?.cee || {};
    const doc = exp?.documentacion || {};
    const delXml = campo === 'firma' ? 'fechaFirma' : 'fechaVisita';
    return iso(cee[`fecha_${campo}_cee_${fase}`])
        || iso(cee[`cee_${fase}`]?.[delXml])
        || iso(doc[`fecha_${campo}_cee_${fase}`]);
}

/** El texto de la aclaración guardado en el expediente ('' si no hay). */
export const textoAclaracion = (doc) => String(doc?.hitos_actuacion?.aclaracion || '').trim();

/**
 * @param {object} expediente  fila de `expedientes` (usa documentacion y cee)
 */
export function hitosActuacion(expediente) {
    const doc = expediente?.documentacion || {};
    const cifo = calcCifo(doc);
    const inicio = iso(cifo.inicio);
    const fin = iso(cifo.fin);
    const pruebas = iso(doc.fecha_pruebas_cert_instalacion);

    const facturas = (doc.facturas || [])
        .map((f, idx) => ({
            idx,
            numero: String(f?.numero_factura || '').trim() || null,
            fecha: iso(f?.fecha_factura),
            motivo: motivoNoInicio(f),
            driveId: f?.drive_id || null,
        }))
        .filter(f => f.fecha)
        .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.idx - b.idx));

    const inicioManual = !!doc.fecha_inicio_cifo_manual;
    const finManual = !!doc.fecha_fin_cifo_manual;

    // De dónde sale cada fecha. Se enseña en el popup: "el inicio es el 11/09" no
    // basta para decidir si está bien; "el inicio es la factura 26/000618" sí.
    const origen = (fecha, manual, esInicio) => {
        if (!fecha) return null;
        if (manual) return { tipo: 'manual' };
        const candidatas = esInicio ? facturas.filter(f => !f.motivo) : facturas;
        const f = candidatas.find(x => x.fecha === fecha);
        if (f) return { tipo: 'factura', numero: f.numero };
        if (pruebas === fecha) return { tipo: 'pruebas' };
        return { tipo: 'otro' };
    };

    return {
        inicio, fin, pruebas,
        inicioManual, finManual,
        inicioDe: origen(inicio, inicioManual, true),
        finDe: origen(fin, finManual, false),
        facturas,
        primera: facturas[0] || null,
        // La última solo es OTRA factura si hay más de una: con una sola, primera y
        // última son la misma y el bloque la imprime una vez.
        ultima: facturas.length > 1 ? facturas[facturas.length - 1] : null,
        // Las facturas que el CIFO tiene que EXPLICAR: emitidas antes del inicio
        // que declara. Solo existen si alguien ha marcado una factura como entrega
        // de material / anticipo, o ha fijado el inicio a mano.
        anteriores: inicio ? facturas.filter(f => f.fecha < inicio) : [],
        ceeInicial: { visita: fechaCee(expediente, 'visita', 'inicial'), firma: fechaCee(expediente, 'firma', 'inicial') },
        ceeFinal: { visita: fechaCee(expediente, 'visita', 'final'), firma: fechaCee(expediente, 'firma', 'final') },
        aclaracion: textoAclaracion(doc),
    };
}

// "nº 26/000417, de fecha 29/05/2026," · "nº A (29/05/2026) y nº B (02/06/2026)"
// Con una sola factura la fecha es un inciso y se cierra con coma: «La factura
// nº X, de fecha Y, corresponde…».
function listaFacturas(fs) {
    if (fs.length === 1) {
        const f = fs[0];
        return f.numero ? `nº ${f.numero}, de fecha ${fechaEs(f.fecha)},` : `de fecha ${fechaEs(f.fecha)}`;
    }
    const partes = fs.map(f => `${f.numero ? `nº ${f.numero}` : 'sin número'} (${fechaEs(f.fecha)})`);
    return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}

const QUE_ES = {
    MATERIAL: { uno: 'corresponde a la entrega de material', varios: 'corresponden a la entrega de material' },
    ANTICIPO: { uno: 'corresponde a un anticipo a cuenta', varios: 'corresponden a anticipos a cuenta' },
};

/**
 * Una redacción PROPUESTA para la aclaración, compuesta solo con los datos.
 * Devuelve '' cuando no hay nada que aclarar (ninguna factura anterior al inicio).
 *
 * No afirma cuándo empezó la obra por su cuenta: repite la fecha de inicio que ya
 * declara el propio CIFO y, si los datos lo permiten, la sitúa respecto al CEE
 * inicial. Lo que el certificado de partida NO respalda, no se dice.
 */
export function aclaracionSugerida(h) {
    if (!h?.anteriores?.length || !h.inicio) return '';
    const frases = [];

    for (const motivo of ['MATERIAL', 'ANTICIPO']) {
        const fs = h.anteriores.filter(f => f.motivo === motivo);
        if (!fs.length) continue;
        const uno = fs.length === 1;
        frases.push(`${uno ? 'La factura' : 'Las facturas'} ${listaFacturas(fs)} ${QUE_ES[motivo][uno ? 'uno' : 'varios']} `
            + `y no ${uno ? 'supone' : 'suponen'} el inicio de la ejecución de la actuación.`);
    }
    // Anteriores al inicio SIN motivo marcado: solo pasa con el inicio fijado a
    // mano. No se les atribuye una naturaleza que nadie ha declarado; se dice lo
    // que es cierto de cualquier factura.
    const sinMotivo = h.anteriores.filter(f => !f.motivo);
    if (sinMotivo.length) {
        const uno = sinMotivo.length === 1;
        frases.push(`${uno ? 'La factura' : 'Las facturas'} ${listaFacturas(sinMotivo)} ${uno ? 'es anterior' : 'son anteriores'} `
            + 'a la fecha de inicio declarada: la fecha de emisión de una factura no coincide necesariamente con la de ejecución de los trabajos.');
    }

    // El inicio, situado respecto al CEE inicial SOLO si los datos lo respaldan.
    const { visita, firma } = h.ceeInicial || {};
    let tras = '';
    if (firma && firma <= h.inicio) {
        tras = (visita && visita !== firma && visita <= h.inicio)
            ? `, con posterioridad a la visita del técnico certificador (${fechaEs(visita)}) y a la firma del certificado de eficiencia energética inicial (${fechaEs(firma)})`
            : `, con posterioridad a la firma del certificado de eficiencia energética inicial (${fechaEs(firma)})`;
    }
    frases.push(`La ejecución de la actuación se inicia el ${fechaEs(h.inicio)}${tras}.`);

    return frases.join(' ');
}

/**
 * Qué fechas y números de factura puede citar una aclaración. La ruta que pide la
 * redacción a la IA lo usa para rechazar un texto que cite una fecha o una factura
 * que el expediente no tiene: la máquina redacta, pero no aporta datos.
 */
export function datosCitables(h) {
    const fechas = new Set();
    const add = (v) => { const e = fechaEs(v); if (e) fechas.add(e); };
    add(h?.inicio); add(h?.fin); add(h?.pruebas);
    (h?.facturas || []).forEach(f => add(f.fecha));
    add(h?.ceeInicial?.visita); add(h?.ceeInicial?.firma);
    add(h?.ceeFinal?.visita); add(h?.ceeFinal?.firma);
    const facturas = new Set((h?.facturas || []).map(f => f.numero).filter(Boolean));
    return { fechas, facturas };
}

// ─── El bloque impreso ───────────────────────────────────────────────────────
// Lo imprimen el CIFO (cifoDoc.js), el Certificado RES080 (res080Doc.js) y la
// copia de éste que vive en CertificadoRes080Modal.jsx. Tres documentos con la
// MISMA tabla: si cada uno la dibujara a su manera, el verificador vería las
// mismas fechas contadas de dos formas según la ficha.
const escHtml = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * El bloque «Hitos de la actuación» en HTML.
 *
 * Ordenado como el PROCESO, no por fecha: CEE inicial → facturas (primera y
 * última) → actuación (inicio · pruebas del RITE · fin) → CEE final. Cada fila
 * tiene tres columnas iguales para que las fechas queden alineadas y se lean de
 * un vistazo. Ordenar por fecha haría saltar al principio justo la factura de
 * material anterior al CEE, que es lo que la aclaración explica.
 *
 * REGLA — lo que NO consta NO se imprime (decisión del usuario, 2026-10-01): sin
 * fechas del CEE final, su fila no sale; y la fecha suelta que falte en una fila
 * deja la casilla vacía. Lo que falta se AVISA antes de generar (`avisosHitos`),
 * no se rellena con «—» en un documento firmado. Lo que no se imprime nunca es
 * el REGISTRO de los CEE: la regla de la casa es que el certificado existe desde
 * su FIRMA, y el registro es un trámite ajeno.
 *
 * @param {object} p
 * @param {object} p.hitos          resultado de hitosActuacion()
 * @param {Function} p.sectionTitle el título de sección del documento que llama
 * @param {string} [p.inicioTxt]    la fecha de inicio TAL CUAL la imprime ese
 *   documento (el RES080 la deja editar en su vista previa): el bloque no puede
 *   decir otra fecha que la de la hoja 1.
 * @param {string} [p.finTxt]       ídem para el fin
 * @param {string} [p.mt]           margen superior del título
 * @returns {string} '' si no hay ni una fecha que contar
 */
export function hitosBoxHtml({ hitos, sectionTitle, inicioTxt, finTxt, mt = '16px' }) {
    if (!hitos) return '';
    // La hoja 1 del RES080 escribe «02-02-2026»: es la misma fecha, pero dentro del
    // bloque todas van con barras o se lee como dos formatos distintos.
    const conBarras = (t) => String(t || '').trim().replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$1/$2/$3');
    const inicio = conBarras(inicioTxt) || fechaEs(hitos.inicio);
    const fin = conBarras(finTxt) || fechaEs(hitos.fin);
    const pruebas = fechaEs(hitos.pruebas);
    const ini = hitos.ceeInicial || {};
    const fn = hitos.ceeFinal || {};

    // Una casilla: rótulo pequeño + fecha, y debajo (opcional) el detalle — el nº
    // de la factura y si es una entrega de material. Sin fecha, casilla vacía.
    const casilla = (rotulo, fecha, detalle = '') => fecha
        ? `<div style="padding:4px 10px 4px 0;"><span style="color:#8A8A82;font-weight:600;">${rotulo}</span> <span style="font-weight:700;">${fecha}</span>${detalle ? `<div style="font-size:10px;color:#8A8A82;font-weight:600;line-height:1.3;">${detalle}</div>` : ''}</div>`
        : '<div></div>';
    const detalleFactura = (f) => [
        f.numero ? `nº ${escHtml(f.numero)}` : '',
        f.motivo ? `<span style="color:#9A6B12;font-weight:700;">${MOTIVOS_NO_INICIO[f.motivo].corto}</span>` : '',
    ].filter(Boolean).join(' · ');

    const filas = [];
    if (ini.visita || ini.firma) {
        filas.push(['CEE inicial', [casilla('Visita del técnico', fechaEs(ini.visita)), casilla('Firma', fechaEs(ini.firma))]]);
    }
    if (hitos.primera) {
        filas.push([hitos.ultima ? 'Facturas' : 'Factura', [
            casilla(hitos.ultima ? 'Primera' : 'Fecha', fechaEs(hitos.primera.fecha), detalleFactura(hitos.primera)),
            hitos.ultima ? casilla('Última', fechaEs(hitos.ultima.fecha), detalleFactura(hitos.ultima)) : '<div></div>',
        ]]);
    }
    if (inicio || pruebas || fin) {
        filas.push(['Actuación', [casilla('Inicio', inicio), casilla('Pruebas RITE', pruebas), casilla('Fin', fin)]]);
    }
    if (fn.visita || fn.firma) {
        filas.push(['CEE final', [casilla('Visita del técnico', fechaEs(fn.visita)), casilla('Firma', fechaEs(fn.firma))]]);
    }
    if (!filas.length) return '';

    // Etiqueta 18% + tres columnas iguales: las fechas quedan alineadas fila a
    // fila. Estas hojas son de alto FIJO y las miden check_cifo_paginas.mjs y
    // check_res080_paginas.mjs.
    const fila = (label, celdas, last) => {
        const borde = last ? '' : 'border-bottom:1px solid #ECECE4;';
        const tres = [...celdas, '<div></div>', '<div></div>'].slice(0, 3).join('');
        return `<div style="display:grid;grid-template-columns:18% 82%;"><div style="padding:4px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;${borde}">${label}</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;padding:0 0 0 14px;${borde}">${tres}</div></div>`;
    };
    const aclaracion = hitos.aclaracion
        ? `<div style="padding:6px 16px;background:#FBF6EE;border-top:1px solid #F1E4CF;font-size:10.5px;line-height:1.45;color:#5b4a2e;"><b style="color:#1A1A1A;font-weight:700;">Aclaración sobre las fechas.</b> ${escHtml(hitos.aclaracion)}</div>`
        : '';
    return `
        ${sectionTitle('Hitos de la actuación', mt)}
        <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12px;">
            ${filas.map(([l, c], i) => fila(l, c, i === filas.length - 1)).join('')}
            ${aclaracion}
        </div>`;
}

/**
 * Lo que FALTA en los hitos, para la puerta de «Generar»: el documento no lo
 * imprime (ni con «—»), así que se dice antes, y se puede generar igual.
 * Mismo formato que `avisosCeeDocumento` (ceeFases.js), con el que se junta.
 */
export function avisosHitos(expediente) {
    const h = hitosActuacion(expediente);
    const out = [];
    const cee = (c, fase) => {
        if (!c.visita && !c.firma) {
            out.push({ id: `hitos_sin_cee_${fase}`, nivel: 'warn',
                texto: `El CEE ${fase} aún no tiene fecha de visita del técnico ni de firma: en «Hitos de la actuación» no saldrá su fila. Se toman de la rejilla del CEE o de su .xml.` });
        } else if (!c.visita || !c.firma) {
            out.push({ id: `hitos_cee_${fase}_incompleto`, nivel: 'warn',
                texto: `Al CEE ${fase} le falta la fecha de ${!c.visita ? 'visita del técnico' : 'firma'}: en «Hitos de la actuación» esa casilla saldrá vacía.` });
        }
    };
    cee(h.ceeInicial, 'inicial');
    cee(h.ceeFinal, 'final');
    if (!h.pruebas) {
        out.push({ id: 'hitos_sin_pruebas', nivel: 'warn',
            texto: 'No consta la fecha de pruebas del Certificado RITE: en «Hitos de la actuación» esa casilla saldrá vacía.' });
    }
    return out;
}

/** Las fechas dd/mm/aaaa que cita un texto y que NO están entre las citables. */
export function fechasAjenas(texto, h) {
    const { fechas } = datosCitables(h);
    const citadas = String(texto || '').match(/\b\d{2}\/\d{2}\/\d{4}\b/g) || [];
    return [...new Set(citadas)].filter(d => !fechas.has(d));
}
