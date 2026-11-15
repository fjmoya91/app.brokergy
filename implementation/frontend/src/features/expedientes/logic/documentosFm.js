// ============================================================================
// documentosFm.js — los documentos de FIRMA que pide la VÍA DEL FACTOR
// MULTIPLICADOR (Resolución de 3 de noviembre de 2026 de la DGPLACE,
// BOE-A-2026-23367, en vigor el 08/11/2026) y que hasta ahora solo se podían
// SUBIR. Los genera la app con los datos del expediente:
//
//   · ANEXO A — la declaración de ayudas que SUSTITUYE al Anexo I en los
//     26RES060FM_N / 26RES093FM_N (apartado Quinto de la Resolución). Texto y
//     casillas LITERALES del BOE (págs. 150131-150132). No hay impreso rellenable
//     del MITECO (comprobado el 07/11/2026: su catálogo solo publica el Anexo I),
//     así que se maqueta. Viaja por el MISMO hueco que el Anexo I (`anexo_i_*`):
//     se firma en el mismo enlace, se valida y va al lote igual. Un Anexo I ya
//     firmado sigue valiendo (Fran, 07/11/2026): solo los documentos NUEVOS.
//   · Declaración responsable del INSTALADOR con la tipología (punto 1).
//   · Documento INFORMADO del punto 13 (zona D/E y CEE F o G).
//   · Oferta del contrato de MANTENIMIENTO de 2 años, aceptada o desistida (punto 8).
//   · ANEXO B — justificación de consumidor vulnerable (fichas -S, puntos 2-3),
//     literal del BOE (pág. 150133).
//
// Hojas A4 de ALTO FIJO (794 × 1122 px con `overflow:hidden`) y la casilla de
// firma en una posición FIJA (FIRMA_FM, signBoxes.js): lo que no cabe no
// descoloca nada, DESAPARECE — por eso cada documento se mide con
// `backend/scripts/check_documentos_fm.mjs` con los datos más largos.
// Tipografía auto-alojada (regla 25.b).
//
// Módulo ESM PURO (sin React): lo usan el panel de la vía FM, el popup de envío
// de los anexos y el script de medición.
// Detalle: docs/conocimiento/expedientes/la-via-del-factor-multiplicador-en-el-expediente.md
// ============================================================================

import { deriveAnexoI, buildInstalacionAddress, empresasActuacion, domicilioEmpresa } from '../utils/docGenerators.js';
import { buildFontFaces, FUENTE_INTER } from './fuentesDoc.js';
import { cedentesDe } from './cedentes.js';
import { fichaOficialDeExpediente, esNumeroFm } from './viaFm.js';
import { FIRMA_FM, PAGINAS_ANEXO_A } from './signBoxes.js';
import { firmanteCifo } from './instaladorPendientes.js';
import { formatMarcas, formatModelos } from './aerotermiaUnits.js';

const APP_URL = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_APP_URL)
    || (typeof process !== 'undefined' && process.env && (process.env.APP_URL || process.env.FRONTEND_URL))
    || 'https://app.brokergy.es';

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PUNTOS = '..............................';
const val = (v, hueco = PUNTOS) => (String(v ?? '').trim() ? esc(v) : hueco);
const cb = (v) => (v ? 'X' : '');

/** ¿El Anexo I de este expediente es ya el ANEXO A? Solo en la vía FM. */
export const usaAnexoA = (expediente) => esNumeroFm(expediente?.numero_expediente);

// ── Estilo común ────────────────────────────────────────────────────────────
const CSS = `
${buildFontFaces(APP_URL, FUENTE_INTER)}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { background: #fff; }
.fm-wrap { font-family: 'Inter', Arial, sans-serif; width: 794px; margin: 0 auto; color: #111; -webkit-font-smoothing: antialiased; }
.fm-page { width: 794px; height: 1122px; position: relative; overflow: hidden; background: #fff; page-break-after: always; break-after: page; }
.fm-page:last-child { page-break-after: auto; break-after: auto; }
.fm-cuerpo { padding: 46px 64px 0; }
.fm-cab { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-size: 9px; color: #666; letter-spacing: .4px; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 6px; margin-bottom: 18px; }
.fm-cab b { color: #222; font-weight: 700; }
.fm-titulo { font-size: 13px; font-weight: 800; text-align: center; line-height: 1.4; text-transform: uppercase; margin-bottom: 6px; }
.fm-sub { font-size: 11.5px; text-align: center; line-height: 1.45; margin-bottom: 16px; color: #222; }
.fm-sec { font-size: 11.5px; font-weight: 700; margin: 14px 0 7px; }
.fm-p { font-size: 11.5px; line-height: 1.5; text-align: justify; margin-bottom: 8px; }
.fm-p b { font-weight: 700; }
.fm-tabla { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 6px; }
.fm-tabla td { border: 1px solid #333; padding: 5px 8px; font-size: 11px; line-height: 1.35; vertical-align: middle; word-wrap: break-word; overflow-wrap: anywhere; }
.fm-tabla td.lbl { background: #f2f2f2; width: 38%; }
.fm-tabla td.nif { background: #f2f2f2; width: 11%; text-align: center; }
.fm-tabla td.nifv { width: 17%; }
.fm-fn { font-size: 8.5px; line-height: 1.35; color: #333; margin: 2px 0 8px; text-align: justify; }
.fm-check { display: flex; gap: 9px; align-items: flex-start; font-size: 11.5px; line-height: 1.45; margin: 6px 0; text-align: justify; }
.fm-check.sub { margin-left: 28px; }
.fm-box { width: 13px; height: 13px; border: 1px solid #111; flex-shrink: 0; margin-top: 2px; font-size: 10px; font-weight: 800; display: flex; align-items: center; justify-content: center; line-height: 1; }
.fm-declara { font-size: 12px; font-weight: 800; text-align: center; letter-spacing: .8px; margin: 12px 0 8px; }
.fm-firma { position: absolute; left: ${FIRMA_FM.left}px; top: ${FIRMA_FM.top}px; width: ${FIRMA_FM.width}px; height: ${FIRMA_FM.height}px; border: 1px dashed #9a9a9a; border-radius: 4px; }
.fm-fdo { position: absolute; left: ${FIRMA_FM.left}px; top: ${FIRMA_FM.top + FIRMA_FM.height + 8}px; width: ${FIRMA_FM.width}px; font-size: 11px; line-height: 1.4; }
.fm-fdo small { display: block; font-size: 9px; color: #444; margin-top: 2px; }
.fm-pie { position: absolute; left: 64px; right: 64px; bottom: 22px; display: flex; justify-content: space-between; font-size: 8.5px; color: #888; border-top: 1px solid #eee; padding-top: 5px; }
`;

const documento = (paginas, titulo) => `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${esc(titulo)}</title>`
    + `<style>${CSS}@page{size:A4;margin:0;}</style></head><body><div class="fm-wrap">${paginas.join('')}</div></body></html>`;

const pagina = ({ cab, cuerpo, firma = null, pie }) => `
<div class="fm-page">
  <div class="fm-cuerpo">
    <div class="fm-cab">${cab}</div>
    ${cuerpo}
  </div>
  ${firma ? `<div class="fm-firma"></div><div class="fm-fdo">${firma}</div>` : ''}
  <div class="fm-pie">${pie}</div>
</div>`;

const fechaLarga = (d = new Date()) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

// ── Lo común a los cuatro documentos de una hoja ─────────────────────────────
/**
 * Los datos que comparten: la ficha oficial, la vivienda, el titular (o su
 * representante), el equipo y la empresa habilitada. `ctx` es el contexto de la
 * vía que devuelve `GET /api/expedientes/:id/via-fm` (tipología, zona, letra del
 * CEE); `datos` es `documentacion.via_fm`.
 */
export function datosDocumentoFm(expediente, ctx = {}, datos = null) {
    const exp = expediente || {};
    // Las series, en UNA línea: «Uds. exteriores (2): 1: X, 2: Y · Equipo ACS: Z».
    const d = deriveAnexoI(exp, null, {}, { dash: '', sep: '\n', cedente: 0 });
    const serieEnLinea = (l) => String(l).replace(/:\n/g, ': ').replace(/\n/g, ', ');
    // La ficha con los datos de AHORA: marcar «vulnerable» en el panel cambia la
    // ficha a -S antes de que el autoguardado llegue a la BD.
    const viaAhora = { ...(exp.documentacion?.via_fm || {}), ...(datos || {}) };
    const ficha = fichaOficialDeExpediente({ ...exp, documentacion: { ...(exp.documentacion || {}), via_fm: viaAhora } })
        || ctx.fichaOficial || { codigo: 'RES060_FM', titulo: '' };
    const dir = buildInstalacionAddress(exp);
    const inst = exp.instalacion || {};
    const empresas = empresasActuacion(exp);
    const hab = empresas.habilitada || {};
    const firmanteInst = firmanteCifo(hab);
    const equipo = [formatMarcas(inst.aerotermia_cal, ''), formatModelos(inst.aerotermia_cal, '')].filter(Boolean).join(' ');
    return {
        numero: exp.numero_expediente || '',
        ficha,
        via: datos || exp.documentacion?.via_fm || {},
        ctx,
        direccion: (dir.full || '').toUpperCase(),
        refCatastral: dir.refCatastral || '',
        municipioInstalacion: (dir.municipio || '').toUpperCase(),
        titular: {
            nombre: d.nombrePropietario, nif: d.nif, domicilio: d.domicilio, telefono: d.telefono, email: d.email,
            firmante: d.firmante, representa: d.hayRepresentante && d.nombreRepresentante ? d.nombrePropietario : '',
            municipioFirma: d.municipioFirma,
        },
        equipo,
        series: d.serialsLineas.map(serieEnLinea).join(' · '),
        empresa: {
            nombre: hab.razon_social || hab.nombre || '',
            nif: hab.cif || hab.nif || '',
            rite: hab.numero_carnet_rite || '',
            domicilio: domicilioEmpresa(hab),
            municipio: (hab.municipio || '').toUpperCase(),
            telefono: hab.telefono || hab.tlf || '',
            email: hab.email || '',
            firmante: firmanteInst.nombre || '',
            firmanteDni: firmanteInst.dni || '',
            autonomo: !!hab.es_autonomo,
        },
        fecha: fechaLarga(),
    };
}

const cabecera = (D, que) => `<span>${esc(que)}</span><span>Expediente <b>${esc(D.numero)}</b> · Ficha <b>${esc(D.ficha.codigo)}</b></span>`;
const pieDe = (D, n, total) => `<span>${esc(D.ficha.codigo)} · ${esc(D.numero)}</span><span>Página ${n} de ${total}</span>`;
const filaFicha = (D) => `<tr><td class="lbl">Código y nombre de la ficha</td><td>${esc(D.ficha.codigo)}: ${esc(D.ficha.titulo)}</td></tr>`;
const firmaTitular = (D, rotulo) => `Fdo.: <b>${val(D.titular.firmante)}</b>${D.titular.representa ? `<small>En representación de ${esc(D.titular.representa)}</small>` : ''}<small>${rotulo}</small>`;

// ── 1 · ANEXO A ─────────────────────────────────────────────────────────────
/**
 * Las DOS hojas del Anexo A del cedente `cedente` (0 = el titular). Mismos datos
 * que el Anexo I (`deriveAnexoI`: ayudas de la pestaña Subvenciones, series,
 * representación), con el código y el nombre de la ficha FM. El Anexo A no lleva
 * la tabla del beneficiario ni el apartado del bono social: el BOE los quitó.
 */
function paginasAnexoA(expediente, states, cedente, n) {
    const d = deriveAnexoI(expediente, null, states, { dash: '', sep: '<br>', cedente });
    const ficha = fichaOficialDeExpediente(expediente) || { codigo: 'RES060_FM', titulo: '' };
    const D = { numero: d.numexpte, ficha };
    const rep = d.hayRepresentante;
    const quien = n > 1 ? ` · ${cedente + 1} de ${n}` : '';
    const cab = cabecera(D, `Anexo A${quien}`);
    const ayuda = (f) => esc(d.ayudaFields?.[f] || '');
    const filasAyuda = [
        ['denominacion', 'Denominación del programa de ayuda'], ['entidad', 'Entidad u órgano gestor'], ['anio', 'Año'],
        ['disposicion', 'Disposición reguladora'], ['num_expediente', 'Número de expediente'], ['estado', 'Estado de la concesión'],
        ['fecha_solicitud', 'Fecha de solicitud'], ['fecha_resolucion', 'Fecha de la resolución de concesión'],
        ['cuantia', 'Cuantía de la ayuda obtenida o esperada'],
    ].map(([f, r]) => `<tr><td class="lbl">${r}:</td><td>${ayuda(f)}</td></tr>`).join('');
    const p1 = `
    <div class="fm-titulo">Anexo A</div>
    <div class="fm-sub">Declaración responsable formalizada por el propietario inicial del ahorro referida a la solicitud y/u obtención de ayudas o subvenciones públicas para la misma actuación de ahorro de energía (hasta ahora llamado anexo I)</div>
    <div class="fm-sec">1. Identificación de la actuación de ahorro de energía</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Nombre de la actuación</td><td>${esc(d.nombreActuacion)}</td></tr>
      <tr><td class="lbl">Código y nombre de la ficha</td><td>${esc(ficha.codigo)}: ${esc(ficha.titulo)}</td></tr>
      <tr><td class="lbl">Comunidad autónoma en la que se ejecutó la actuación:<sup>(1)</sup></td><td>${esc(d.ccaa)}</td></tr>
      <tr><td class="lbl">Dirección postal de la instalación en que se ejecutó la actuación:</td><td>${esc(d.dirActuacion)}</td></tr>
      <tr><td class="lbl">Referencia catastral de la localización de la actuación:</td><td>${esc(d.refCatastral)}</td></tr>
      <tr><td class="lbl">En su caso, número de serie de los equipos:</td><td>${d.serialsLineas.map(esc).join('<br>').replace(/&lt;br&gt;/g, '<br>')}</td></tr>
    </table>
    <div class="fm-fn">(1) En el caso de que la actuación exceda el ámbito territorial de una comunidad autónoma, indicar en este apartado: «Excede el ámbito territorial de una comunidad autónoma».</div>
    <div class="fm-sec">2. Identificación del propietario inicial del ahorro</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Propietario inicial del ahorro:<sup>(2)</sup> (Nombre y apellidos / Razón social)</td><td>${esc(d.nombrePropietario)}</td><td class="nif">NIF/NIE</td><td class="nifv">${esc(d.nif)}</td></tr>
      <tr><td class="lbl">Domicilio:</td><td colspan="3">${esc(d.domicilio)}</td></tr>
      <tr><td class="lbl">Teléfono:</td><td colspan="3">${esc(d.telefono)}</td></tr>
      <tr><td class="lbl">Correo electrónico:</td><td colspan="3">${esc(d.email)}</td></tr>
    </table>
    <div class="fm-fn">(2) Persona física o jurídica que lleva a cabo la inversión de la actuación en eficiencia energética.</div>
    <div class="fm-sec">3. Identificación del representante del propietario inicial del ahorro (a indicar únicamente en caso de representación)</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Representante: (Nombre y apellidos / Razón social)</td><td>${rep ? esc(d.nombreRepresentante) : ''}</td><td class="nif">NIF/NIE</td><td class="nifv">${rep ? esc(d.dniRepresentante) : ''}</td></tr>
      <tr><td class="lbl">Domicilio:</td><td colspan="3">${rep ? esc(d.domicilioRepresentante) : ''}</td></tr>
      <tr><td class="lbl">Teléfono:</td><td colspan="3">${rep ? esc(d.tlfRepresentante) : ''}</td></tr>
      <tr><td class="lbl">Correo electrónico:</td><td colspan="3">${rep ? esc(d.emailRepresentante) : ''}</td></tr>
    </table>
    <p class="fm-p" style="margin-top:8px">Ostentando poderes suficientes según:</p>
    <div class="fm-check"><div class="fm-box">${cb(rep && d.poderNotarial)}</div><span>Poder Notarial de fecha ${rep && d.poderFecha ? `<b>${esc(d.poderFecha)}</b>` : PUNTOS} y número de protocolo ${rep && d.poderProtocolo ? `<b>${esc(d.poderProtocolo)}</b>` : PUNTOS}. Se adjunta copia a la presente.</span></div>
    <div class="fm-check"><div class="fm-box">${cb(rep && d.otroDoc)}</div><span>Otro documento (identificar título y fecha de formalización): ${rep && d.otroDocumento ? `<b>${esc(d.otroDocumento)}</b>` : PUNTOS}. Se adjunta copia a la presente.</span></div>`;
    const p2 = `
    <p class="fm-p">Manifestando que dichos poderes no se encuentran revocados, modificados ni limitados.</p>
    <p class="fm-p" style="margin-top:10px">En relación con la actuación arriba indicada, el abajo firmante:</p>
    <div class="fm-declara">DECLARA RESPONSABLEMENTE</div>
    <div class="fm-check"><div class="fm-box">${cb(d.noSolicitado)}</div><span>NO SE HA SOLICITADO a otros organismos o administraciones internacionales, nacionales, autonómicas o locales, una ayuda o subvención para la misma actuación.</span></div>
    <div class="fm-check"><div class="fm-box">${cb(d.seSolicitado)}</div><span>SE HA SOLICITADO a otros organismos o administraciones internacionales, nacionales, autonómicas o locales, una ayuda o subvención para la misma actuación, y en ese caso:</span></div>
    <div class="fm-check sub"><div class="fm-box">${cb(d.ayudaOptions?.[0])}</div><span>Se ha obtenido dicha ayuda o subvención para la misma actuación.</span></div>
    <div class="fm-check sub"><div class="fm-box">${cb(d.ayudaOptions?.[1])}</div><span>No se ha obtenido dicha ayuda o subvención para la misma actuación.</span></div>
    <div class="fm-check sub"><div class="fm-box">${cb(d.ayudaOptions?.[2])}</div><span>Está pendiente de resolución dicha ayuda o subvención solicitada para la misma actuación.</span></div>
    <p class="fm-p" style="margin-top:10px">En todo caso, se deberán indicar los siguientes datos para cada ayuda o subvención. Se repetirá la tabla para cada programa de ayuda distinto:</p>
    <table class="fm-tabla">${filasAyuda}</table>
    <p class="fm-p" style="margin-top:10px">Asimismo, se COMPROMETE a comunicar cualquier modificación o variación de las circunstancias anteriores en un plazo máximo de cinco días al sujeto obligado o sujeto delegado con el que haya formalizado el convenio CAE.</p>
    <p class="fm-p">Y para que así conste, firma la presente en <b>${val(d.municipioFirma)}</b>, a <b>${esc(d.fechaFirma)}</b>.</p>`;
    const firma = `Fdo.: <b>${val(d.firmante)}</b>${rep && d.nombreRepresentante ? `<small>En representación de ${esc(d.nombrePropietario)}</small>` : ''}<small>(Firma del propietario inicial del ahorro o representante del mismo)</small>`;
    return [
        pagina({ cab, cuerpo: p1, pie: pieDe(D, 1, PAGINAS_ANEXO_A) }),
        pagina({ cab, cuerpo: p2, firma, pie: pieDe(D, 2, PAGINAS_ANEXO_A) }),
    ];
}

/** El Anexo A entero: dos hojas por cedente, cada uno con SU firma (como el Anexo I). */
export function buildAnexoAHtml(expediente, states = {}) {
    const n = cedentesDe(expediente?.clientes).length;
    const paginas = Array.from({ length: n }, (_, i) => paginasAnexoA(expediente, states, i, n)).flat();
    return documento(paginas, `${expediente?.numero_expediente || ''} - Anexo A`);
}

/**
 * Lo que se manda a `/api/pdf/generate` y a `save-to-drive` para el «Anexo I» de
 * un expediente: en la vía FM, el Anexo A (HTML); fuera de ella, el impreso
 * oficial del Anexo I (`formulario`, como siempre). Una sola decisión para los
 * tres sitios que lo generan (popup de envío, popup del Anexo I y el de la Cesión).
 */
export function fuenteAnexoIoA(expediente, states = {}, formularioAnexoI) {
    if (usaAnexoA(expediente)) return { html: buildAnexoAHtml(expediente, states) };
    return { formulario: formularioAnexoI() };
}

/** Nombre del documento en pantalla y en Drive: «Anexo A» en la vía FM. */
export const nombreAnexoIoA = (expediente) => (usaAnexoA(expediente) ? 'Anexo A' : 'Anexo I');

// ── 2 · Declaración del INSTALADOR: tipología (punto 1) ─────────────────────
const TIPOLOGIAS_DECL = [
    ['unifamiliar', 'a) Edificio unifamiliar.'],
    ['piso', 'b) Piso con sistema individual de calefacción y ACS.'],
    ['bloque', 'c) Edificio con sistema centralizado de calefacción y ACS.'],
];

export function buildDeclaracionTipologiaHtml(expediente, ctx = {}, datos = null) {
    const D = datosDocumentoFm(expediente, ctx, datos);
    const clase = ctx.tipologia?.clase || null;
    const E = D.empresa;
    const enNombre = E.autonomo ? '' : `, en nombre y representación de la empresa instaladora <b>${val(E.nombre)}</b>`;
    const cuerpo = `
    <div class="fm-titulo">Declaración responsable de la empresa instaladora<br>sobre la tipología del edificio</div>
    <div class="fm-sec">1. Identificación de la actuación</div>
    <table class="fm-tabla">
      ${filaFicha(D)}
      <tr><td class="lbl">Dirección postal de la instalación y referencia catastral</td><td>${val(D.direccion, '')}${D.refCatastral ? `<br>RC: ${esc(D.refCatastral)}` : ''}</td></tr>
      <tr><td class="lbl">Titular de la vivienda</td><td>${val(D.titular.nombre, '')}</td></tr>
      <tr><td class="lbl">Bomba de calor instalada</td><td>${val(D.equipo, '')}</td></tr>
    </table>
    <div class="fm-sec">2. Identificación de la empresa instaladora</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Razón social</td><td>${val(E.nombre, '')}</td><td class="nif">NIF</td><td class="nifv">${val(E.nif, '')}</td></tr>
      <tr><td class="lbl">Nº en el registro de empresas instaladoras (RITE)</td><td colspan="3">${val(E.rite, '')}</td></tr>
      <tr><td class="lbl">Domicilio</td><td colspan="3">${val(E.domicilio, '')}</td></tr>
    </table>
    <p class="fm-p" style="margin-top:12px">${val(E.firmante)}, con DNI ${val(E.firmanteDni)}${enNombre}, en relación con la actuación arriba identificada,</p>
    <div class="fm-declara">DECLARA RESPONSABLEMENTE</div>
    <p class="fm-p">Que la actuación se ha realizado sobre la siguiente tipología de edificio (punto 1 de la ficha):</p>
    ${TIPOLOGIAS_DECL.map(([k, t]) => `<div class="fm-check"><div class="fm-box">${cb(clase === k)}</div><span>${t}</span></div>`).join('')}
    <p class="fm-p" style="margin-top:8px">Y que la actuación no ha modificado la tipología de la instalación térmica existente, manteniéndose la configuración centralizada o individual del sistema de calefacción y de agua caliente sanitaria.</p>
    <p class="fm-p">Y para que así conste, firma la presente en <b>${val(E.municipio || D.municipioInstalacion)}</b>, a <b>${esc(D.fecha)}</b>.</p>`;
    const firma = `Fdo.: <b>${val(E.firmante)}</b>${E.nombre && !E.autonomo ? `<small>En representación de ${esc(E.nombre)}</small>` : ''}<small>(Firma de la empresa instaladora)</small>`;
    return documento([pagina({ cab: cabecera(D, 'Declaración responsable · tipología'), cuerpo, firma, pie: pieDe(D, 1, 1) })], `${D.numero} - Declaracion tipologia`);
}

// ── 3 · Documento INFORMADO (punto 13: zona D/E y CEE F o G) ────────────────
export function buildInformadoFgHtml(expediente, ctx = {}, datos = null) {
    const D = datosDocumentoFm(expediente, ctx, datos);
    const zona = ctx.zona || '';
    const letra = ctx.letraFg || '';
    const cuerpo = `
    <div class="fm-titulo">Documento informativo sobre las prestaciones<br>de la bomba de calor</div>
    <div class="fm-sub">Ficha ${esc(D.ficha.codigo)} · punto 13: edificios o pisos en las zonas climáticas D y E con certificado de eficiencia energética de calificación F o G</div>
    <div class="fm-sec">1. Identificación de la vivienda y del propietario</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Propietario (Nombre y apellidos / Razón social)</td><td>${val(D.titular.nombre, '')}</td><td class="nif">NIF/NIE</td><td class="nifv">${val(D.titular.nif, '')}</td></tr>
      <tr><td class="lbl">Dirección postal de la vivienda</td><td colspan="3">${val(D.direccion, '')}</td></tr>
      <tr><td class="lbl">Referencia catastral</td><td colspan="3">${val(D.refCatastral, '')}</td></tr>
      <tr><td class="lbl">Zona climática</td><td colspan="3">${val(zona, '')}</td></tr>
      <tr><td class="lbl">Calificación energética del certificado de eficiencia energética</td><td colspan="3">${letra ? esc(letra) : 'F o G'}</td></tr>
      <tr><td class="lbl">Bomba de calor instalada</td><td colspan="3">${val(D.equipo, '')}</td></tr>
    </table>
    <div class="fm-declara" style="margin-top:18px">DECLARACIÓN</div>
    <p class="fm-p">El abajo firmante, propietario de la vivienda arriba identificada, situada en la zona climática <b>${val(zona, 'D o E')}</b> y que dispone de un certificado de eficiencia energética con calificación <b>${letra ? esc(letra) : 'F o G'}</b>, declara que <b>ha sido informado</b> de que, debido al deficiente aislamiento térmico de la vivienda, <b>la bomba de calor podría no alcanzar las prestaciones energéticas, económicas y de confort esperables y previstas</b>.</p>
    <p class="fm-p">Y para que así conste, firma la presente en <b>${val(D.titular.municipioFirma)}</b>, a <b>${esc(D.fecha)}</b>.</p>`;
    return documento([pagina({ cab: cabecera(D, 'Documento informativo · punto 13'), cuerpo, firma: firmaTitular(D, '(Firma del propietario)'), pie: pieDe(D, 1, 1) })], `${D.numero} - Informado bomba de calor`);
}

// ── 4 · Oferta del contrato de MANTENIMIENTO (punto 8) ──────────────────────
/**
 * La ficha pide «copia de la oferta del contrato de mantenimiento de la nueva
 * instalación térmica emitida por la empresa habilitada, con firma de aceptación
 * o el desistimiento por parte del propietario, por un período de al menos 2
 * años desde la fecha de puesta en servicio». La EMITE la empresa habilitada (la
 * misma que firma el RITE) y la FIRMA el propietario, marcando una de las dos
 * casillas. La casilla se decide en el panel (`via_fm.mantenimiento`): firmando
 * en digital no se puede marcar nada; sin decidir, las dos van en blanco y solo
 * vale firmada en papel. El importe, si se sabe (`mantenimiento_importe`).
 */
export function buildOfertaMantenimientoHtml(expediente, ctx = {}, datos = null) {
    const D = datosDocumentoFm(expediente, ctx, datos);
    const E = D.empresa;
    const decision = D.via.mantenimiento || null;   // 'acepta' | 'desiste' | null
    const importe = String(D.via.mantenimiento_importe || '').trim();
    const cuerpo = `
    <div class="fm-titulo">Oferta de contrato de mantenimiento<br>de la instalación térmica</div>
    <div class="fm-sub">Ficha ${esc(D.ficha.codigo)} · punto 8 · período de al menos 2 años desde la puesta en servicio</div>
    <div class="fm-sec">1. Empresa habilitada que emite la oferta</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Razón social</td><td>${val(E.nombre, '')}</td><td class="nif">NIF</td><td class="nifv">${val(E.nif, '')}</td></tr>
      <tr><td class="lbl">Nº en el registro de empresas instaladoras (RITE)</td><td colspan="3">${val(E.rite, '')}</td></tr>
      <tr><td class="lbl">Domicilio</td><td colspan="3">${val(E.domicilio, '')}</td></tr>
    </table>
    <div class="fm-sec">2. Propietario e instalación</div>
    <table class="fm-tabla">
      <tr><td class="lbl">Propietario (Nombre y apellidos / Razón social)</td><td>${val(D.titular.nombre, '')}</td><td class="nif">NIF/NIE</td><td class="nifv">${val(D.titular.nif, '')}</td></tr>
      <tr><td class="lbl">Dirección de la instalación</td><td colspan="3">${val(D.direccion, '')}</td></tr>
      <tr><td class="lbl">Instalación térmica nueva</td><td colspan="3">Bomba de calor ${val(D.equipo, '')}${D.series ? ` · Nº de serie: ${esc(D.series)}` : ''}</td></tr>
    </table>
    <div class="fm-sec">3. Oferta</div>
    <p class="fm-p">${val(E.nombre)} ofrece al propietario el <b>mantenimiento de la nueva instalación térmica</b>, con las operaciones y la periodicidad del programa de mantenimiento preventivo que establece el Reglamento de Instalaciones Térmicas en los Edificios (RITE, IT 3) para una instalación de sus características, <b>durante un período de al menos 2 años desde la fecha de su puesta en servicio</b>.</p>
    <p class="fm-p">Importe: <b>${importe ? esc(importe) : '................ €/año'}</b>${importe ? '' : ' (IVA incluido)'}.</p>
    <div class="fm-sec">4. Decisión del propietario (márquese una)</div>
    <div class="fm-check"><div class="fm-box">${cb(decision === 'acepta')}</div><span><b>ACEPTA</b> la presente oferta de contrato de mantenimiento.</span></div>
    <div class="fm-check"><div class="fm-box">${cb(decision === 'desiste')}</div><span><b>DESISTE</b> de la presente oferta: no contrata el mantenimiento ofrecido.</span></div>
    <p class="fm-p" style="margin-top:10px">Y para que así conste, firma la presente en <b>${val(D.titular.municipioFirma)}</b>, a <b>${esc(D.fecha)}</b>.</p>`;
    return documento([pagina({ cab: cabecera(D, 'Oferta de mantenimiento · punto 8'), cuerpo, firma: firmaTitular(D, '(Firma de aceptación o desistimiento del propietario)'), pie: pieDe(D, 1, 1) })], `${D.numero} - Oferta mantenimiento`);
}

// ── 5 · ANEXO B (consumidor vulnerable) ─────────────────────────────────────
const CASILLAS_ANEXO_B = [
    ['renta', 'Es familia numerosa que cumple los requisitos de renta del Real Decreto 897/2017, de 6 de octubre para consumidor vulnerable.'],
    ['severo', 'Es familia numerosa que cumple los requisitos de renta del Real Decreto 897/2017, de 6 de octubre para consumidor vulnerable severo.'],
    ['no_fn', 'No es familia numerosa.'],
];

/**
 * Lo firma el CONSUMIDOR VULNERABLE: por defecto el titular; si es otra persona
 * (el inquilino que tiene el bono social), sus datos en `via_fm.vulnerable_persona`.
 * La casilla, de `via_fm.anexo_b_casilla` (sin decidir, en blanco: solo papel).
 */
export function buildAnexoBHtml(expediente, ctx = {}, datos = null) {
    const D = datosDocumentoFm(expediente, ctx, datos);
    const otra = D.via.vulnerable_persona || {};
    const p = String(otra.nombre || '').trim()
        ? { nombre: otra.nombre, nif: otra.nif, domicilio: otra.domicilio, telefono: otra.telefono, email: otra.email }
        : { nombre: D.titular.nombre, nif: D.titular.nif, domicilio: D.titular.domicilio, telefono: D.titular.telefono, email: D.titular.email };
    const casilla = D.via.anexo_b_casilla || null;
    const cuerpo = `
    <div class="fm-titulo">Anexo B</div>
    <div class="fm-sub">Justificación de ser consumidor vulnerable según la definición establecida en este anexo</div>
    <p class="fm-p">Tendrán la consideración de consumidor vulnerable, vulnerable severo o en riesgo de exclusión social los definidos en el Real Decreto 897/2017, de 6 de octubre, por el que se regula la figura del consumidor vulnerable, el bono social y otras medidas de protección para los consumidores domésticos de energía eléctrica, excluyendo aquellos beneficiarios del bono social eléctrico cuya condición derive exclusivamente de la posesión del título de familia numerosa sin cumplir los requisitos de renta previstos en dicho real decreto.</p>
    <p class="fm-p">El consumidor vulnerable que cumpla con el párrafo anterior debe completar la siguiente tabla:</p>
    <table class="fm-tabla">
      <tr><td class="lbl">Consumidor vulnerable:<br>(Nombre y apellidos)</td><td>${esc(p.nombre)}</td><td class="nif">NIF/NIE</td><td class="nifv">${esc(p.nif)}</td></tr>
      <tr><td class="lbl">Domicilio:</td><td colspan="3">${esc(p.domicilio)}</td></tr>
      <tr><td class="lbl">Teléfono:</td><td colspan="3">${esc(p.telefono)}</td></tr>
      <tr><td class="lbl">Correo electrónico:</td><td colspan="3">${esc(p.email)}</td></tr>
    </table>
    <div class="fm-declara" style="margin-top:18px">DECLARACIÓN RESPONSABLE</div>
    <p class="fm-p">El abajo firmante declara (señalar lo que proceda):</p>
    ${CASILLAS_ANEXO_B.map(([k, t]) => `<div class="fm-check"><div class="fm-box">${cb(casilla === k)}</div><span>${t}</span></div>`).join('')}
    <p class="fm-p" style="margin-top:10px">Expediente ${esc(D.numero)} · ${esc(D.ficha.codigo)} · vivienda en ${val(D.direccion, '')}.</p>`;
    const firma = `Fdo.: <b>${val(p.nombre)}</b>${p.nif ? ` · DNI ${esc(p.nif)}` : ''}<small>(DNI y Firma del consumidor vulnerable)</small>`;
    return documento([pagina({ cab: cabecera(D, 'Anexo B · consumidor vulnerable'), cuerpo, firma, pie: pieDe(D, 1, 1) })], `${D.numero} - Anexo B`);
}

// ── Índice por documento ────────────────────────────────────────────────────
/**
 * Lo que genera cada `genera` de `documentosFm` (backend/utils/viaFm.js). El
 * nombre del fichero y quién lo firma los da el backend (`GENERADOS_FM`), que es
 * el que lo guarda y lo sirve en la página de firma.
 */
export const GENERADORES_FM = {
    declaracion_instalador: buildDeclaracionTipologiaHtml,
    informado_fg: buildInformadoFgHtml,
    oferta_mantenimiento: buildOfertaMantenimientoHtml,
    anexo_b: buildAnexoBHtml,
};

/**
 * Lo que le falta a un documento para salir bien. No bloquea: lo enseña el panel
 * antes de generar (un hueco con puntos se puede completar en papel).
 */
export function avisosDocumentoFm(genera, expediente, ctx = {}, datos = null) {
    const D = datosDocumentoFm(expediente, ctx, datos);
    const a = [];
    if (genera === 'declaracion_instalador' || genera === 'oferta_mantenimiento') {
        if (!D.empresa.nombre) a.push('El expediente no tiene instalador asignado.');
        else {
            if (!D.empresa.rite) a.push(`${D.empresa.nombre} no tiene nº de registro RITE en su ficha.`);
            if (genera === 'declaracion_instalador' && (!D.empresa.firmante || !D.empresa.firmanteDni)) a.push('Falta el nombre o el DNI de quien firma por la empresa (ficha del instalador).');
        }
    }
    if (genera === 'declaracion_instalador' && !ctx.tipologia?.clase) a.push('No hay tipología: elige la del edificio arriba.');
    if (genera === 'informado_fg' && !ctx.letraFg) a.push('No se conoce la letra del CEE: el documento dirá «F o G».');
    if (genera === 'oferta_mantenimiento') {
        if (!D.via.mantenimiento) a.push('Sin decidir si acepta o desiste: las dos casillas irán en blanco y solo vale firmada en papel.');
        if (!String(D.via.mantenimiento_importe || '').trim()) a.push('Sin importe: queda una línea para completarlo a mano.');
    }
    if (genera === 'anexo_b' && !D.via.anexo_b_casilla) a.push('Sin casilla marcada: solo vale firmado en papel, marcándola a mano.');
    return a;
}
