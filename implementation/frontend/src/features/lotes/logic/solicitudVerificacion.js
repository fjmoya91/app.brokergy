// ============================================================
// solicitudVerificacion.js — "Formulario Solicitud Verificación Estandarizada"
// (a nivel de LOTE, dirigido al VERIFICADOR).
//
// Documento que el Sujeto Obligado / solicitante presenta al organismo de
// verificación con el grupo de actuaciones del lote. Estructura calcada del
// modelo oficial de referencia.
// ============================================================
import { buildInstalacionAddress } from '../../expedientes/utils/docGenerators';
import { computeExpedienteFinancials } from '../../expedientes/logic/expedienteFinancials';
import { fichaDe, FICHA_TITULO } from './anexoListado';

// Datos por defecto del solicitante / contacto (editables en el popup).
export const SOLICITUD_DEFAULTS = {
    contacto: {
        persona: 'Francisco Javier Moya López',
        email: 'franciscojavier.moya@brokergy.es',
        telefono: '623926179',
    },
    intermediaria: 'Soluciones Sostenibles para Eficiencia Energética, SL',
    cnae: '4322',
};

// Vida útil por defecto según ficha: RES080 = 25 años, resto = 15 años.
export function vidaUtilDefaultSolicitud(ficha) {
    return ficha === 'RES080' ? 25 : 15;
}

function fmtDate(d) {
    if (!d) return '';
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}/${m[2].padStart(2, '0')}/${m[3]}`;
    return s;
}

// Fecha → ISO (YYYY-MM-DD), el formato que exige la API de Marwen.
function isoDate(d) {
    if (!d) return null;
    const s = String(d).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return s;
}

const nf = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Cabecera (logo de texto Brokergy) repetida en cada bloque/"página".
const HEADER = `
  <div class="hdr">
    <span class="brand">BROKERGY</span><span class="brand-sub"> · Ingeniería Energética</span>
  </div>`;

// Pie con edición del formulario y título del documento.
const FOOTER = `
  <div class="ftr">
    <div class="doc-title">FORMULARIO SOLICITUD VERIFICACIÓN ESTANDARIZADA</div>
  </div>`;

// Fila de tabla etiqueta/valor.
const row = (k, v) => `<tr><td class="k">${esc(k)}</td><td class="v">${v == null ? '' : esc(v)}</td></tr>`;

export function buildSolicitudVerificacionHtml(lote, opts = {}) {
    const l = lote || {};
    const so = l.sujeto_obligado || {};
    const exps = Array.isArray(l.expedientes) ? l.expedientes : [];

    const contacto = { ...SOLICITUD_DEFAULTS.contacto, ...(opts.contacto || {}) };
    const intermediaria = opts.intermediaria != null ? opts.intermediaria : SOLICITUD_DEFAULTS.intermediaria;
    const cnae = opts.cnae != null ? opts.cnae : SOLICITUD_DEFAULTS.cnae;
    const vidaUtilByExp = opts.vidaUtilByExp || {};

    // Dirección del solicitante (Sujeto Obligado).
    const cpMun = [so.codigo_postal, so.municipio].filter(Boolean).join(' ');
    const soDireccion = [
        so.direccion,
        cpMun,
        so.provincia ? `(${so.provincia})` : '',
    ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();

    // ---- Sección 1: información general del solicitante ----
    const seccion1 = `
      ${HEADER}
      <h2 class="sec">1 - INFORMACIÓN GENERAL DEL SOLICITANTE</h2>
      <table class="kv"><tbody>
        ${row('Código de identificación del solicitante', so.codigo_identificacion || (so.cif ? `SO-${so.cif}` : ''))}
        ${row('Razón Social', so.razon_social)}
        ${row('CIF', so.cif)}
        ${row('Dirección', soDireccion)}
        ${row('Teléfono', contacto.telefono)}
        ${row('Correo electrónico', contacto.email)}
        ${row('Persona de Contacto', contacto.persona)}
        ${row('Figura', 'obligado')}
        ${row('¿Dispone de ordenador y conexión a internet para realizar reuniones de forma telemática?', 'sí')}
        ${row('Nº de actuaciones a tramitar', String(exps.length))}
        ${row('Solicitud replicable', 'no')}
      </tbody></table>
      <p class="note">El nivel de aseguramiento establecido para el proceso de verificación es limitado.</p>
      ${FOOTER}`;

    // ---- Sección 2: actuaciones a verificar ----
    const intro = `La verificación de un grupo de actuaciones conlleva unos riesgos adicionales de manera que, si cualquiera de las actuaciones individuales resultara desfavorable, el dictamen tendrá como resultado DESFAVORABLE. En estos casos, el resto de las actuaciones del grupo podría ser objeto de una nueva solicitud separada de la verificación dirigida al mismo verificador.`;

    const actuaciones = exps.map((exp, i) => {
        const e = exp || {};
        const num = e.numero_expediente || '';
        const ficha = fichaDe(num);
        const doc = e.documentacion || {};
        const inst = e.instalacion || {};

        let addr = {};
        try { addr = buildInstalacionAddress(e) || {}; } catch { addr = {}; }

        let fin = {};
        try { fin = computeExpedienteFinancials(e) || {}; } catch { fin = {}; }
        const ahorroKwh = nf(Math.round(Number(fin.savingsKwh) || 0));

        const facturas = Array.isArray(doc.facturas) ? doc.facturas : [];
        const inversion = facturas.reduce((s, f) => s + (Number(f && f.importe_sin_iva) || 0), 0);

        const vidaUtil = (vidaUtilByExp[e.id] != null)
            ? vidaUtilByExp[e.id]
            : vidaUtilDefaultSolicitud(ficha);

        const refCat = inst.ref_catastral || addr.refCatastral || '';

        const tablaA = `
          <h3 class="act">Actuación ${i + 1}</h3>
          <table class="kv"><tbody>
            ${row('Nombre del propietario inicial del ahorro', e.cliente_nombre)}
            ${row('En caso de existir, nombre empresa intermediaria en el proceso CAE', intermediaria)}
            ${row('Nombre de la actuación', num)}
            ${row('Código y nombre de la ficha', `${ficha} - ${FICHA_TITULO[ficha] || ''}`)}
            ${row('Versión de la ficha', 'V1.1')}
            ${row('Código CNAE de la actividad principal de la instalación afectada', cnae)}
            ${row('Vida útil de la actuación (años)', String(vidaUtil))}
            ${row('Ahorro anual conseguido (kWh)', ahorroKwh)}
            ${row('Fecha inicio actuación', fmtDate(doc.fecha_inicio_cifo))}
            ${row('Fecha fin actuación', fmtDate(doc.fecha_fin_cifo))}
            ${row('Inversión de la actuación sin IVA (€)', `${nf(inversion, 2)} €`)}
            ${row('Costes operativos anuales para el mantenimiento de la actuación sin IVA (€)', '0,00')}
            ${row('¿La actuación ha solicitado o recibido apoyo de algún programa público de ayudas?', 'no')}
          </tbody></table>`;

        const tablaB = `
          <h4 class="loc">Localización de la actuación</h4>
          <table class="kv"><tbody>
            ${row('Comunidad Autónoma en la que se ejecutó la actuación', l.ccaa)}
            ${row('Dirección postal de la instalación en que se ejecutó la actuación', addr.full)}
            ${row('Coordenadas UTM', `X: ${inst.coord_x || ''}, Y: ${inst.coord_y || ''}`)}
            ${row('Referencia catastral', refCat)}
          </tbody></table>`;

        return tablaA + tablaB;
    }).join('');

    const seccion2 = `
      ${HEADER}
      <h2 class="sec">2 - ACTUACIONES A VERIFICAR</h2>
      <p class="intro">${esc(intro)}</p>
      ${actuaciones}
      ${FOOTER}`;

    // (Sección 3 "Declaración del solicitante" eliminada por requisito del usuario)

    return SOLICITUD_HTML(seccion1, seccion2);
}

// ============================================================
// buildSolicitudVerificacionPayload — payload JSON para la API de Marwen
// (POST /api/v1/solicitud/estandarizada). Usa EXACTAMENTE los mismos datos
// que el PDF, pero en la forma que espera la API:
//   step2 = una actuación por expediente · step3 = un emplazamiento por exp.
// El step1 (solicitante/SO + IDs de provincia/localidad) lo construye el BACKEND
// de forma autoritativa desde el Sujeto Obligado del lote; aquí solo aportamos
// los datos editables de contacto y la figura.
// Devuelve { contacto, figura, step2, step3 }.
// ============================================================
export function buildSolicitudVerificacionPayload(lote, opts = {}) {
    const l = lote || {};
    const exps = Array.isArray(l.expedientes) ? l.expedientes : [];

    const contacto = { ...SOLICITUD_DEFAULTS.contacto, ...(opts.contacto || {}) };
    const intermediaria = opts.intermediaria != null ? opts.intermediaria : SOLICITUD_DEFAULTS.intermediaria;
    const cnae = opts.cnae != null ? opts.cnae : SOLICITUD_DEFAULTS.cnae;
    const vidaUtilByExp = opts.vidaUtilByExp || {};

    const step2 = [];
    const step3 = [];

    exps.forEach((exp, i) => {
        const e = exp || {};
        const num = e.numero_expediente || '';
        const ficha = fichaDe(num);
        const doc = e.documentacion || {};
        const inst = e.instalacion || {};

        let addr = {};
        try { addr = buildInstalacionAddress(e) || {}; } catch { addr = {}; }
        let fin = {};
        try { fin = computeExpedienteFinancials(e) || {}; } catch { fin = {}; }

        const ahorroAnual = Math.round(Number(fin.savingsKwh) || 0);
        const facturas = Array.isArray(doc.facturas) ? doc.facturas : [];
        const inversion = facturas.reduce((s, f) => s + (Number(f && f.importe_sin_iva) || 0), 0);
        const vidaUtil = (vidaUtilByExp[e.id] != null) ? vidaUtilByExp[e.id] : vidaUtilDefaultSolicitud(ficha);
        const refCat = inst.ref_catastral || addr.refCatastral || '';

        step2.push({
            SE_propietario_inicial: e.cliente_nombre || '',
            SE_otras_empresas: intermediaria || '',
            SE_nombre_actuacion: num,
            SE_cod_ficha: ficha,
            SE_v_ficha: 'V1.1',
            SE_cnae: cnae,
            SE_vida_util: Number(vidaUtil) || 0,
            SE_ahorro_anual: ahorroAnual,
            SE_fecha_inicio: isoDate(doc.fecha_inicio_cifo),
            SE_fecha_fin: isoDate(doc.fecha_fin_cifo),
            // Importe sin IVA en formato español (máx. 2 decimales). Acepta "0", no vacío.
            SE_inversion: nf(inversion, 2),
            SE_costes_operativos: '0',
            SE_apoyo_programa: 'no',
        });

        step3.push({
            SE_comunidad_autonoma: l.ccaa || '',
            SE_direccion_instalacion: addr.full || '',
            SE_referencia_catastral: refCat,
            SE_coordenadas_utm: `X: ${inst.coord_x || ''}, Y: ${inst.coord_y || ''}`,
            numero_actuacion: i, // 0-based
        });
    });

    return { contacto, figura: 'obligado', step2, step3 };
}

function SOLICITUD_HTML(seccion1, seccion2) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10.5px; margin: 0; padding: 16px; }
      .block { page-break-after: always; }
      .block:last-child { page-break-after: auto; }
      .hdr { margin-bottom: 14px; }
      .hdr .brand { font-weight: bold; color: #FF8F00; font-size: 18px; letter-spacing: .5px; }
      .hdr .brand-sub { color: #888; font-size: 12px; }
      .ftr { margin-top: 18px; padding-top: 6px; border-top: 1px solid #999; }
      .ftr .ed { font-size: 9px; color: #666; }
      .ftr .doc-title { font-size: 9px; color: #444; text-transform: uppercase; font-weight: bold; }
      h2.sec { font-size: 12px; margin: 8px 0 10px; text-transform: uppercase; }
      h3.act { font-size: 11px; margin: 14px 0 4px; }
      h4.loc { font-size: 10.5px; margin: 8px 0 4px; font-weight: bold; }
      table.kv { width: 100%; border-collapse: collapse; margin: 0 0 6px; }
      table.kv td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; line-height: 1.3; }
      table.kv td.k { background: #f2f2f2; width: 55%; color: #222; }
      table.kv td.v { width: 45%; }
      p.note { font-size: 10px; margin: 8px 0; }
      p.intro { font-size: 10px; margin: 6px 0 10px; text-align: justify; }
      p.decl { font-size: 10.5px; margin: 6px 0; }
      ul.decl-list { font-size: 10px; margin: 4px 0 0 0; padding-left: 18px; }
      ul.decl-list li { margin: 4px 0; text-align: justify; }
      p.firma-lbl { font-size: 10.5px; margin: 26px 0 4px; font-weight: bold; }
      .firma-box { height: 70px; border: 1px solid #999; width: 50%; }
    </style></head><body>
      <div class="block">${seccion1}</div>
      <div class="block">${seccion2}</div>
    </body></html>`;
}
