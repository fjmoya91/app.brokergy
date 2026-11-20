// ─────────────────────────────────────────────────────────────────────────────
// El envío al SUJETO OBLIGADO para que firme (fase 2): el Anexo I del lote, una
// ficha RES por expediente y la solicitud del verificador.
//
// Fuente ÚNICA de QUÉ se manda y con QUÉ texto. La usan:
//   · el popup «Enviar al S.O.» de AnexoListadoModal.jsx (a mano), y
//   · el envío automático cuando la solicitud llega de beCAE
//     (backend/services/ofertaVerificadorAuto.js, regla 222).
// Si el texto o los documentos se escribieran dos veces, el automático acabaría
// mandando otra cosa que el botón: es lo que Fran pidió que NO pasara («tiene que
// ser el mismo mensaje», 17/11/2026).
//
// Sin React ni navegador: el backend la importa con import() (rutas con `.js`).
// ─────────────────────────────────────────────────────────────────────────────
import { buildAnexoListadoHtml, buildAnexoListadoRows, buildAnexoListadoTotals, CONVENIO_FECHA_DEFAULT, fichaDe } from './anexoListado.js';
import { fichaFormulario } from '../../expedientes/logic/fichasFormulario.js';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials.js';
import { SIGN_BOXES, fichaSignBox } from '../../expedientes/logic/signBoxes.js';

export const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const mesDe = (fecha = new Date()) => MESES[fecha.getMonth()];
export { CONVENIO_FECHA_DEFAULT };

// Textos ancla para pre-situar el recuadro de firma (Autofirma) en la firma en cadena del S.O.
export const ANEXO_ANCHOR = ['fdo', 'firma', 'representante legal', 'el cedente'];
export const FICHA_ANCHOR = ['fdo', 'firma', 'representante'];

export const totalesAnexo = (lote) => buildAnexoListadoTotals(buildAnexoListadoRows(lote));

/** El correo que acompaña al Anexo I, las fichas y la solicitud. */
export function mensajeEnvioSo(lote, totals = totalesAnexo(lote)) {
    return `Estimados,\n\nAdjuntamos el Anexo I (Listado de Cesión de Ahorros) del lote ${lote.codigo || ''}, que recoge ${totals.numActuaciones} actuaciones con un ahorro total de ${totals.ahorroMwh.toLocaleString('es-ES', { maximumFractionDigits: 1 })} MWh/año (${totals.ahorroGwh.toLocaleString('es-ES', { maximumFractionDigits: 2 })} GWh/año), junto con las fichas técnicas RES de cada actuación y la solicitud de verificación.\n\nRogamos procedan a su firma con el certificado electrónico del representante legal. Pueden firmar todo en cadena desde el enlace que incluimos más abajo (Autofirma), sin descargar ni volver a subir nada. Quedamos a su disposición para cualquier aclaración.\n\nUn saludo,\nBROKERGY · Ingeniería Energética`;
}

/**
 * Los documentos a adjuntar: Anexo I (listado) + una ficha por expediente.
 * `proveedorSigned` = el Anexo I ya firmado por Brokergy (PROVEEDOR): si viene, se
 * manda ESE PDF para que el S.O. solo añada su firma; si no, se genera del HTML.
 */
export function docsEnvioSo(lote, { html, mes = mesDe(), convenioFecha = CONVENIO_FECHA_DEFAULT, repNombre, repNif, proveedorSigned = null } = {}) {
    const htmlAnexo = html || buildAnexoListadoHtml(lote, { mes, convenioFecha });
    const rep = { representanteNombre: repNombre, representanteNif: repNif };
    const docs = [{ html: htmlAnexo, pdfBase64: proveedorSigned, fileName: `${lote.codigo || 'LOTE'} - Anexo I Listado Cesion`, label: 'Anexo I', tipo: 'anexo_i_listado', expediente_id: null, anchor: ANEXO_ANCHOR, fixedBox: SIGN_BOXES.anexo_i_listado, repNombre, repNif }];
    for (const e of (lote.expedientes || [])) {
        const f = fichaDe(e.numero_expediente);
        const formulario = fichaFormulario(f, e, { ...rep, results: computeExpedienteFinancials(e) });
        docs.push({ formulario, fileName: `${e.numero_expediente} - Ficha ${f}`, label: `Ficha ${f}`, tipo: 'ficha_res', expediente_id: e.id, anchor: FICHA_ANCHOR, fixedBox: fichaSignBox(f), repNombre, repNif });
    }
    return docs;
}
