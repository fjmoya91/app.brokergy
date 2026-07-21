// ============================================================================
// res080Doc.js — FUENTE ÚNICA del Certificado RES080 (Certificado Final de Obra CAE).
// ----------------------------------------------------------------------------
// Módulo JS PURO (sin React, sin DOM directo). Extraído de CertificadoRes080Modal.jsx
// para que el MISMO código produzca el PDF por dos caminos idénticos: el modal del
// frontend y la generación server-side (backend cifoService, por import() dinámico).
// Mismo patrón que cifoDoc.js. No dupliques la maquetación fuera de aquí.
//
// El RES080 tiene campos de texto EDITABLES en el modal (descripciones, director,
// aislamiento, ventanas nuevas…). Se siembran desde documentacion.envolvente +
// defaults de plantilla (RES080_FIELD_DEFAULTS). Las ediciones libres del usuario no
// se persisten, así que el backend reproduce la LÍNEA BASE (lo que el modal muestra
// sin editar): fields = {...defaults, ...initialFields(env)}.
//
// El parseo de huecos/opacos desde XML crudo usa DOMParser en el navegador, que NO
// existe en Node. Por eso `parseHuecosFromXml` se INYECTA: el modal pasa su versión
// DOMParser; el backend, una con xml2js. Si no se pasa y el cee ya trae los arrays
// huecos/opacos, no hace falta.
// ============================================================================
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation.js';
import { buildInstalacionAddress } from '../utils/docGenerators.js';
import { calcCifo } from './calcCifo.js';
import { EMITTER_OPTIONS, getEmitterTemp } from './cifoDoc.js';
import { formatMarcas, formatModelos, formatSeries, countUnidades } from './aerotermiaUnits.js';

const DOC_WIDTH = '794px';

const FONT_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONT_LATINEXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

function buildFontFaces(appUrl) {
    const fams = [
        ['Archivo', 'Archivo', [400, 500, 600, 700, 800, 900]],
        ['Instrument Sans', 'InstrumentSans', [400, 500, 600, 700]],
    ];
    let out = '';
    for (const [name, slug, weights] of fams) {
        for (const w of weights) {
            for (const [sub, range] of [['latin', FONT_LATIN], ['latinext', FONT_LATINEXT]]) {
                out += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:swap;src:url('${appUrl}/fonts/${slug}-${w}-${sub}.woff2') format('woff2');unicode-range:${range};}`;
            }
        }
    }
    return out;
}

const DESIGN_SHARED = `
    * { box-sizing: border-box; }
    .doc-page { font-family: 'Instrument Sans', Arial, sans-serif; font-size: 12.5px; color: #1A1A1A; background: #fff; text-align: left; }
    .doc-page h1, .doc-page h2, .doc-page h3 { font-family: 'Archivo', sans-serif; margin: 0; }
    .doc-page table { break-inside: avoid; }
    .doc-page tr { break-inside: avoid; }
    .cmp { table-layout: fixed; }
    .cmp td, .cmp th { border-bottom: 1px solid #ECECE4; }
    .cmp tr:last-child td { border-bottom: none; }
    .just tr:last-child td { border-bottom: none; }
    .doc-foot { margin-top: auto; padding-top: 10px; border-top: 1px solid #ECECE4; display: flex; justify-content: space-between; font-size: 10.5px; color: #9A9A92; font-weight: 500; }
`;

export function buildRes080DocCss(appUrl) {
    return `
    ${buildFontFaces(appUrl)}
    ${DESIGN_SHARED}
    html, body { margin: 0; }
    .doc-wrap { background: #4a4a46; width: ${DOC_WIDTH}; padding: 20px 0; margin: 0 auto; }
    .doc-page {
        width: ${DOC_WIDTH};
        min-height: 1123px;
        padding: 11mm 14mm 12mm;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 18px rgba(20,20,19,.16);
        position: relative;
    }
    .doc-page:last-child { margin-bottom: 0; }
    .doc-editable {
        outline: none;
        background: #fffde7;
        cursor: text;
        min-height: 1rem;
        padding: 0 3px;
        border-radius: 3px;
        display: inline-block;
        min-width: 20px;
    }
    .doc-editable:focus { background: #fff9c4; box-shadow: inset 0 0 0 1px #F18A00; }
    @media print {
        .doc-wrap { background: #fff !important; padding: 0 !important; }
        .doc-page { margin: 0 !important; box-shadow: none !important; }
        .doc-editable { background: transparent !important; box-shadow: none !important; }
    }
`;
}

export function buildRes080PdfCss(appUrl) {
    return `
    ${buildFontFaces(appUrl)}
    ${DESIGN_SHARED}
    @page { size: 210mm 297mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-page {
        width: 210mm;
        min-height: 297mm;
        padding: 11mm 14mm 12mm;
        page-break-after: always;
        break-after: page;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .doc-page:last-child { page-break-after: auto; break-after: auto; }
`;
}

// Defaults de plantilla (los del editableRef del modal). fields = {...defaults, ...initialFields}.
export const RES080_FIELD_DEFAULTS = {
    nombre_actuacion: '',
    descripcion_actuacion: 'Rehabilitación profunda de la envolvente térmica y sustitución de instalaciones térmicas por equipos de alta eficiencia energética.',
    descripcion_termica: 'Sustitución de sistema de calefacción y ACS existente por bomba de calor aerotérmica de alta eficiencia.',
    descripcion_ventanas: 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',
    fecha_inicio: '',
    fecha_fin: '',
    director_nombre: 'Francisco Javier Moya López',
    director_entidad: 'Soluciones Sostenibles para Eficiencia Energética, SL',
    director_titulacion: 'Graduado en ingeniería industrial',
    director_email: 'franciscojavier.moya@brokergy.es',
    director_tlf: '695615330',
    empresa_responsable: '',
    marco_nuevo_material: 'PVC',
    marco_nuevo_marca: 'CORTIZO',
    marco_nuevo_modelo: 'A 70',
    marco_nuevo_uf: '1,3',
    cristal_nuevo_u: '1.3',
    cristal_nuevo_marca: 'GUARDIAN',
    cristal_nuevo_modelo: 'SUN',
    cristal_nuevo_composicion: '4/16/4 Bajo emisivo',
    cristal_nuevo_ug: '1,1',
    cristal_nuevo_g: '0,43',
    permeabilidad_nueva: '3',
};

const toDdMmYyyy = (val) => {
    if (!val) return '';
    const s = String(val).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
    return s;
};
const numStr = (v) => (v === null || v === undefined || v === '') ? '' : String(v).replace('.', ',');

// ============================================================================
// deriveRes080Data — de (expediente, results) a fields + variables del PDF.
// `results` es el objeto de calculateRes080 (details, ahorroEnergiaFinalTotal,
// totalEnergia*). `parseHuecosFromXml(xmlStr)` es opcional (DOMParser/xml2js).
// ============================================================================
export function deriveRes080Data({ expediente, results, parseHuecosFromXml }) {
    const exp = expediente || {};
    const op = exp.oportunidades || {};
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const cee = exp.cee || {};
    const env = doc.envolvente || {};
    const cli = exp.clientes || exp.cliente || {};
    const loc = exp.ubicacion || {};
    const pres = exp.prescriptores || {};
    const tieneAcs = inst.cambio_acs !== false;

    // ── fields (línea base: defaults + initialFields sembrados de env) ──
    const empName = pres.razon_social || pres.nombre || op.datos_calculo?.inputs?.partner_name || '';
    const empCif = pres.cif || pres.nif || op.datos_calculo?.inputs?.partner_cif || '';
    const empAddr = pres.direccion
        ? `${pres.direccion}, ${pres.codigo_postal || pres.cp || ''} ${pres.municipio || ''} (${pres.provincia || ''})`.replace(/,  \(\)/, '').replace(/^, /, '')
        : (op.datos_calculo?.inputs?.partner_address || '');
    const cifoDates = calcCifo(doc);
    const D = RES080_FIELD_DEFAULTS;
    const initialFields = {
        nombre_actuacion: `${exp.numero_expediente}: Rehabilitación profunda de edificios de viviendas generadora de ahorros energéticos`,
        fecha_inicio: toDdMmYyyy(doc.fecha_inicio_res080 || cifoDates.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial),
        fecha_fin: toDdMmYyyy(doc.fecha_fin_res080 || cifoDates.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final),
        descripcion_ventanas: env.descripcion_ventanas || D.descripcion_ventanas || 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',
        descripcion_termica: doc.descripcion_termica || (inst.cambio_acs === false
            ? 'Sustitución del sistema de calefacción existente por bomba de calor aerotérmica de alta eficiencia. La instalación de ACS existente se mantiene sin cambios.'
            : D.descripcion_termica),
        descripcion_envolvente: env.descripcion_cerramientos || D.descripcion_envolvente || 'Se ha llevado a cabo la rehabilitación energética...',
        aislamiento_muros_sn: env.aislamiento_muros === true ? 'SÍ' : 'NO',
        aislamiento_muros_tipo: env.aislamiento_muros_tipo || D.aislamiento_muros_tipo || '—',
        aislamiento_muros_mat: env.aislamiento_muros_material || D.aislamiento_muros_mat || '—',
        aislamiento_muros_esp: env.aislamiento_muros_espesor ? `${env.aislamiento_muros_espesor} cm` : (D.aislamiento_muros_esp || '—'),
        aislamiento_muros_cond: env.aislamiento_muros_conductividad ? env.aislamiento_muros_conductividad.toString().replace('.', ',') : (D.aislamiento_muros_cond || '—'),
        aislamiento_cubierta_sn: env.aislamiento_cubierta === true ? 'SÍ' : 'NO',
        aislamiento_cubierta_tipo: env.aislamiento_cubierta_tipo || D.aislamiento_cubierta_tipo || '—',
        aislamiento_cubierta_mat: env.aislamiento_cubierta_material || D.aislamiento_cubierta_mat || '—',
        aislamiento_cubierta_esp: env.aislamiento_cubierta_espesor ? `${env.aislamiento_cubierta_espesor} cm` : (D.aislamiento_cubierta_esp || '—'),
        aislamiento_cubierta_cond: env.aislamiento_cubierta_conductividad ? env.aislamiento_cubierta_conductividad.toString().replace('.', ',') : (D.aislamiento_cubierta_cond || '—'),
        envolvente_observaciones: env.envolvente_observaciones || D.envolvente_observaciones || '- La duración indicativa de la actuación (Di) es de 25 años...',
        marco_nuevo_material: env.marco_nuevo_material || D.marco_nuevo_material,
        marco_nuevo_marca: env.marco_nuevo_marca || D.marco_nuevo_marca,
        marco_nuevo_modelo: env.marco_nuevo_modelo || D.marco_nuevo_modelo,
        marco_nuevo_uf: numStr(env.marco_nuevo_transmitancia) || D.marco_nuevo_uf,
        cristal_nuevo_marca: env.cristal_nuevo_marca || D.cristal_nuevo_marca,
        cristal_nuevo_modelo: env.cristal_nuevo_modelo || D.cristal_nuevo_modelo,
        cristal_nuevo_composicion: env.cristal_nuevo_composicion || D.cristal_nuevo_composicion,
        cristal_nuevo_ug: numStr(env.cristal_nuevo_transmitancia) || D.cristal_nuevo_ug,
        cristal_nuevo_g: numStr(env.cristal_nuevo_factor_solar) || D.cristal_nuevo_g,
        permeabilidad_nueva: numStr(env.permeabilidad_nueva) || D.permeabilidad_nueva,
        empresa_responsable: empName.toUpperCase(),
        empresa_cif: empCif.toUpperCase(),
        empresa_domicilio: empAddr.toUpperCase(),
    };
    const fields = { ...D, ...initialFields };

    // ── Identificación / cliente ──
    const numExpte = exp.numero_expediente || '—';
    const instAddr = buildInstalacionAddress(exp);
    const locCA = (instAddr.ccaa || '—').toUpperCase();
    const locDir = instAddr.full || '—';
    const locCat = instAddr.refCatastral || '—';
    const utmX = inst.coord_x || loc.coord_x || '—';
    const utmY = inst.coord_y || loc.coord_y || '—';
    const clientFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
    const clientDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;

    // ── Energía / ahorro ──
    const aeTotal = Math.round(results?.ahorroEnergiaFinalTotal || 0);
    const ef_i = Math.round(results?.totalEnergiaInicialAno || 0);
    const ef_f = Math.round(results?.totalEnergiaFinalAno || 0);

    // ── Equipos ──
    const calExBrand = inst.caldera_antigua_cal?.marca || '—';
    const calExMod = inst.caldera_antigua_cal?.modelo || '—';
    const calExSerie = inst.caldera_antigua_cal?.numero_serie || '—';
    const calExTipoEq = inst.caldera_antigua_cal?.tipo_equipo || 'Caldera';
    const calEffEntry = BOILER_EFFICIENCIES.find(b => b.id === (inst.caldera_antigua_cal?.rendimiento_id || 'default')) || BOILER_EFFICIENCIES[0];
    const calExFuel = calEffEntry.id === 'electric' ? 'Electricidad'
        : calEffEntry.id !== 'default' ? calEffEntry.label.split(',')[0].trim()
        : (inst.caldera_antigua_cal?.combustible || '—');
    // Equipo(s) nuevo(s): puede haber varios en CASCADA. Modelo agrupado ("(×3)"),
    // números de serie listados TODOS. Ver logic/aerotermiaUnits.js.
    const calNuBrand = formatMarcas(inst.aerotermia_cal);
    const calNuMod = formatModelos(inst.aerotermia_cal);
    const calNuScop = inst.aerotermia_cal?.scop || '—';
    const calNuSerieOut = formatSeries(inst.aerotermia_cal);
    const calNuUds = countUnidades(inst.aerotermia_cal);

    const acsExBrand = inst.caldera_antigua_acs?.marca || calExBrand;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || calExSerie;
    const acsExTipoEq = inst.caldera_antigua_acs?.tipo_equipo || calExTipoEq;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === (inst.caldera_antigua_acs?.rendimiento_id || inst.caldera_antigua_cal?.rendimiento_id || 'default')) || calEffEntry;
    const acsExFuel = acsEffEntry.id === 'electric' ? 'Electricidad'
        : acsEffEntry.id !== 'default' ? acsEffEntry.label.split(',')[0].trim()
        : (inst.caldera_antigua_acs?.combustible || calExFuel);
    const acsSeActua = inst.cambio_acs !== false;
    const sameAero = !!inst.misma_aerotermia_acs;
    const acsNuBrand = sameAero ? calNuBrand : formatMarcas(inst.aerotermia_acs);
    const acsNuMod = sameAero ? calNuMod : formatModelos(inst.aerotermia_acs);
    const acsNuScop = sameAero ? calNuScop : (inst.aerotermia_acs?.scop || '—');
    const acsNuSerie = sameAero
        ? (calNuUds > 1 ? 'Mismas unidades' : 'Misma unidad')
        : formatSeries(inst.aerotermia_acs);
    const acsNuUds = sameAero ? calNuUds : countUnidades(inst.aerotermia_acs);

    // ── SCOP ──
    const zoneStr = (op.datos_calculo?.zona || 'D3').toUpperCase();
    const zoneLabel = ['A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3'].includes(zoneStr)
        ? 'Cálido' : (zoneStr === 'E1' ? 'Medio' : 'Cálido');
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';
    const scopAcsRaw = tieneAcs ? parseFloat(sameAero ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';
    const emiLabel = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';
    const metodoCal = inst.aerotermia_cal?.metodo_scop || 'ficha';
    const metodoAcs = inst.aerotermia_acs?.metodo_scop || 'ficha';

    // ── Huecos / opacos (arrays del cee; si no, parser inyectado) ──
    const parseX = (xml) => (typeof parseHuecosFromXml === 'function' ? (parseHuecosFromXml(xml) || []) : []);
    const huecosInit = cee.cee_inicial?.huecos || [];
    const huecosFin = cee.cee_final?.huecos || [];
    const opacosInit = cee.cee_inicial?.opacos || parseX(cee.xml_inicial).filter(e => e.tipo !== 'Hueco');
    const opacosFin = cee.cee_final?.opacos || parseX(cee.xml_final).filter(e => e.tipo !== 'Hueco');
    const hInitArr = huecosInit.length > 0 ? huecosInit : parseX(cee.xml_inicial).filter(e => e.tipo === 'Hueco');
    const hFinArr = huecosFin.length > 0 ? huecosFin : parseX(cee.xml_final).filter(e => e.tipo === 'Hueco');

    const matchByName = (arr, ref) => arr.find(x => {
        const a = (x.nombre || '').trim().toLowerCase();
        const b = (ref.nombre || '').trim().toLowerCase();
        return b === a || b.startsWith(a) || a.startsWith(b);
    });
    const changedHuecos = hFinArr.filter(hFin => {
        const orig = hInitArr.find(hIni => {
            const a = (hIni.nombre || '').trim().toLowerCase();
            const b = (hFin.nombre || '').trim().toLowerCase();
            const sameName = b === a || b.startsWith(a) || a.startsWith(b);
            return sameName && Math.abs(hIni.transmitancia - hFin.transmitancia) > 0.01;
        });
        return !!orig;
    }).map(hFin => ({ initial: matchByName(hInitArr, hFin), final: hFin }));
    const changedOpacos = opacosFin.filter(oFin => {
        const orig = opacosInit.find(oIni => {
            const a = (oIni.nombre || '').trim().toLowerCase();
            const b = (oFin.nombre || '').trim().toLowerCase();
            const sameName = b === a || b.startsWith(a) || a.startsWith(b);
            return sameName && Math.abs(oIni.transmitancia - oFin.transmitancia) > 0.01;
        });
        return !!orig;
    }).map(oFin => ({ initial: matchByName(opacosInit, oFin), final: oFin }));
    const seSustituyen = changedHuecos.length > 0 || env.sustituye_ventanas === true;

    return {
        fields, env, inst, cli, results,
        numExpte, locCA, locDir, locCat, utmX, utmY, clientFull, clientDir,
        aeTotal, ef_i, ef_f,
        calExBrand, calExMod, calExSerie, calExTipoEq, calExFuel, calNuBrand, calNuMod, calNuScop, calNuSerieOut, calNuUds,
        acsSeActua, acsExBrand, acsExMod, acsExSerie, acsExTipoEq, acsExFuel, acsNuBrand, acsNuMod, acsNuScop, acsNuSerie, acsNuUds,
        sameAero, tieneAcs,
        zoneStr, zoneLabel, scopCalRaw, scopCalStr, scopAcsRaw, scopAcsStr, emiLabel, metodoCal, metodoAcs,
        changedHuecos, changedOpacos, seSustituyen,
    };
}

const formatNum = (val) => {
    if (!val && val !== 0) return '0';
    return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
};

// ============================================================================
// buildRes080Html — documento HTML completo. `isForPdf` true (backend) → sin
// contenteditable. `attachments`: slots de anexos con { id, label, file:{driveId} }.
// ============================================================================
export function buildRes080Html({ data, appUrl, attachments = [], isForPdf = true, withAnnexPreview = false }) {
    const APP_URL = appUrl || '';
    const {
        fields, env, inst, cli, results,
        numExpte, locCA, locDir, locCat, utmX, utmY, clientFull, clientDir,
        aeTotal, ef_i, ef_f,
        calExBrand, calExMod, calExSerie, calExTipoEq, calExFuel, calNuBrand, calNuMod, calNuScop, calNuSerieOut, calNuUds,
        acsSeActua, acsExBrand, acsExMod, acsExSerie, acsExTipoEq, acsExFuel, acsNuBrand, acsNuMod, acsNuScop, acsNuSerie, acsNuUds,
        sameAero, tieneAcs,
        zoneStr, zoneLabel, scopCalRaw, scopCalStr, scopAcsRaw, scopAcsStr, emiLabel, metodoCal, metodoAcs,
        changedHuecos, changedOpacos, seSustituyen,
    } = data;

    const ed = (f) => fields[f] || '';
    const eb = (f) => isForPdf ? ed(f) : `<div contenteditable="true" class="doc-editable" data-field="${f}">${ed(f)}</div>`;
    const formatN = (v) => v ? v.toString().replace('.', ',') : '—';

    const pages = [];

    const pageHeader = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1A1A1A;border-radius:14px;">
            <div style="display:flex;align-items:center;gap:12px;">
                <img src="${APP_URL}/logo_brokergy_white.png" alt="Brokergy" style="height:19px;">
                <span style="font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:2.5px;color:#93C01F;border-left:1px solid rgba(255,255,255,.28);padding-left:12px;">CERTIFICADO CAE · RES080</span>
            </div>
            <span style="font-family:'Archivo';font-weight:600;font-size:11px;letter-spacing:1px;color:#93C01F;">Expte: ${numExpte}</span>
        </div>`;
    const sectionTitle = (t, mt = '13px') => `
        <div style="display:flex;align-items:center;gap:11px;margin:${mt} 0 8px;">
            <span style="width:9px;height:24px;border-radius:5px;background:linear-gradient(#F18A00,#93C01F);"></span>
            <h3 style="font-weight:800;font-size:14px;letter-spacing:.5px;text-transform:uppercase;">${t}</h3>
        </div>`;
    const subLabel = (t, color = '#6E6E66', mt = '18px') => `<h3 style="font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin:${mt} 0 8px;">${t}</h3>`;
    const footer = `<div class="doc-foot"><span>BROKERGY · Ingeniería Energética · www.brokergy.es</span><span>PAGE_X_OF_Y · Expte ${numExpte}</span></div>`;
    const obsBox = (inner, mt = '16px') => `
        <div style="margin-top:${mt};padding:14px 18px;background:#FBF6EE;border:1px solid #F1E4CF;border-radius:14px;font-size:10.5px;line-height:1.5;color:#6b5a3e;">
            <div style="font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;color:#B5730A;text-transform:uppercase;margin-bottom:6px;">Observaciones</div>
            ${inner}
        </div>`;
    const rowsBox = (inner) => `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">${inner}</div>`;
    const kv = (label, value, last = false) => `<div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${label}</div><div style="padding:7px 16px;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${value}</div></div>`;
    const cmpHead = (col1 = 'Comparativa', ex = 'Existente', nu = 'Nueva') => `<thead><tr>
        <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">${col1}</th>
        <th style="text-align:left;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${ex}</th>
        <th style="text-align:left;padding:8px 16px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${nu}</th>
    </tr></thead>`;
    const cmpRow = (label, ex, nu) => `<tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">${label}</td><td style="padding:6px 16px;color:#7a7a72;">${ex}</td><td style="padding:6px 16px;background:#F3F8E6;font-weight:700;">${nu}</td></tr>`;
    const cmpGroup = (t) => `<tr><td colspan="3" style="padding:7px 16px;background:#EFEFE8;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">${t}</td></tr>`;
    const cmpBox = (headHtml, bodyRows) => `<div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;"><table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">${headHtml}<tbody>${bodyRows}</tbody></table></div>`;

    // PÁGINA 0: PORTADA
    pages.push(`
        <div class="doc-page" style="padding:0;display:block;background:#111110;overflow:hidden;">
            <img src="${APP_URL}/assets/pegatina-reforma.png" alt="Reforma" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(3px);transform:scale(1.06);">
            <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(15,15,14,.72) 0%, rgba(15,15,14,.30) 34%, rgba(15,15,14,.55) 66%, rgba(12,12,11,.94) 100%);"></div>

            <div style="position:absolute;top:11mm;left:0;right:0;z-index:3;display:flex;justify-content:center;">
                <div style="background:#fff;border-radius:22px;padding:14px 30px;box-shadow:0 10px 34px rgba(0,0,0,.34);position:relative;">
                    <div style="position:absolute;inset:-4px;border-radius:26px;background:linear-gradient(90deg,#F18A00,#B7C63A 55%,#93C01F);z-index:-1;"></div>
                    <img src="${APP_URL}/logo_brokergy_doc.png" alt="Brokergy" style="height:40px;display:block;">
                </div>
            </div>

            <div style="position:absolute;top:96mm;left:0;right:0;z-index:3;padding:0 20mm;">
                <div style="display:inline-flex;align-items:center;gap:9px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.16);padding:6px 16px;border-radius:999px;margin-bottom:20px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#93C01F;"></span>
                    <span style="font-family:'Archivo';font-weight:700;font-size:12px;letter-spacing:4px;color:#fff;">CERTIFICADO CAE · RES080</span>
                </div>
                <h1 style="font-weight:900;font-size:74px;line-height:.92;letter-spacing:-1.5px;color:#fff;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,.5);max-width:12ch;">Certificado <span style="color:#F18A00;">final</span> de <span style="color:#93C01F;">obra</span></h1>
                <p style="font-family:'Archivo';font-weight:600;font-size:20px;color:#EDEDE8;margin:20px 0 0;max-width:24ch;text-shadow:0 2px 14px rgba(0,0,0,.6);">Rehabilitación profunda de edificios de viviendas</p>
                <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">
                    <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:#fff;padding:6px 16px;border-radius:10px;">Expte: ${numExpte}</span>
                    <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:linear-gradient(90deg,#F5A21E,#A9C63A);padding:6px 16px;border-radius:10px;">RES080 · Rehabilitación profunda</span>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;z-index:3;">
                <div style="padding:0 20mm 22px;">
                    <div style="display:inline-flex;align-items:center;gap:20px;background:rgba(12,12,11,.78);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px 26px;">
                        <div>
                            <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2.5px;color:#93C01F;text-transform:uppercase;">Ahorro anual certificado</div>
                            <div style="font-family:'Archivo';font-weight:900;font-size:40px;line-height:1;color:#fff;margin-top:4px;">${formatNum(aeTotal)} <span style="font-size:18px;font-weight:700;color:#F18A00;">kWh/año</span></div>
                        </div>
                        <div style="width:1px;height:44px;background:rgba(255,255,255,.2);"></div>
                        <div style="font-family:'Archivo';font-weight:800;font-size:26px;color:#fff;">${formatNum(aeTotal)} <span style="font-size:13px;font-weight:700;color:#B9B9B4;">CAEs</span></div>
                    </div>
                </div>
                <div style="background:#0C0C0B;padding:16px 20mm;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:3px solid;border-image:linear-gradient(90deg,#F18A00,#93C01F) 1;">
                    <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">BROKERGY <span style="color:#93C01F;font-weight:600;font-size:13px;">· Ingeniería Energética</span></div>
                    <div style="display:flex;gap:22px;font-size:12.5px;color:#EDEDE8;font-weight:500;">
                        <span><b style="color:#F18A00;">Tel</b>&nbsp; 623 926 179</span>
                        <span><b style="color:#F18A00;">Web</b>&nbsp; www.brokergy.es</span>
                        <span><b style="color:#F18A00;">Email</b>&nbsp; info@brokergy.es</span>
                    </div>
                </div>
            </div>
        </div>
    `);

    // PÁGINA 1: DATOS GENERALES
    pages.push(`
        <div class="doc-page">
            ${pageHeader}
            <h2 style="font-weight:800;font-size:19px;letter-spacing:-.3px;margin:12px 0 3px;">Certificado de obra de rehabilitación energética</h2>
            <p style="margin:0;font-size:13px;color:#6E6E66;font-weight:500;">Ficha RES080 · Rehabilitación profunda de edificios de viviendas</p>

            ${sectionTitle('Identificación de la actuación de ahorro')}
            ${rowsBox(`
                ${kv('Nombre de la actuación', eb('nombre_actuacion'))}
                ${kv('Código y nombre de la ficha', 'RES080: Rehabilitación profunda de edificios de viviendas')}
                ${kv('Comunidad autónoma', locCA)}
                ${kv('Dirección postal', locDir)}
                ${kv('Referencia catastral', locCat)}
                ${kv('Coordenadas UTM', `X: ${utmX} · Y: ${utmY}`)}
                ${kv('Breve descripción', eb('descripcion_actuacion'), true)}
            `)}

            ${sectionTitle('Propietario inicial del ahorro')}
            ${rowsBox(`
                ${kv('Propietario / Razón social', clientFull)}
                ${kv('Domicilio', clientDir)}
                <div style="display:grid;grid-template-columns:34% 32% 34%;border-bottom:1px solid #ECECE4;">
                    <div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">NIF / NIE</div>
                    <div style="padding:7px 16px;font-weight:600;">${cli.nif || cli.dni || '—'}</div>
                    <div style="padding:7px 16px;font-weight:600;"><span style="color:#6E6E66;">Tel&nbsp;</span>${cli.tlf || cli.telefono || '—'}</div>
                </div>
                ${kv('Correo electrónico', cli.email || '—', true)}
            `)}

            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:13px;">
                <div>
                    ${sectionTitle('Hitos', '0px')}
                    <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">
                        <div style="display:grid;grid-template-columns:52% 48%;border-bottom:1px solid #ECECE4;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de inicio</div><div style="padding:6px 16px;font-weight:700;">${eb('fecha_inicio')}</div></div>
                        <div style="display:grid;grid-template-columns:52% 48%;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de fin</div><div style="padding:6px 16px;font-weight:700;">${eb('fecha_fin')}</div></div>
                    </div>
                    <p style="margin:10px 2px 0;font-size:12px;color:#6E6E66;">En Tomelloso, a fecha de firma electrónica.</p>
                    <p style="margin:2px 2px 0;font-size:12.5px;color:#1A1A1A;font-weight:700;">Fdo.: ${ed('director_nombre')}</p>
                </div>
                <div>
                    ${sectionTitle('Director redactor', '0px')}
                    <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12px;">
                        <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Nombre</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_nombre')}</div></div>
                        <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Entidad</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_entidad')}</div></div>
                        <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Titulación</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_titulacion')}</div></div>
                        <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Contacto</div><div style="padding:9px 14px;font-weight:600;">${eb('director_email')} · ${eb('director_tlf')}</div></div>
                    </div>
                </div>
            </div>

            ${sectionTitle('Cálculo del ahorro de energía final total')}
            <div style="border-radius:20px;background:linear-gradient(135deg,#1A1A1A,#242422);color:#fff;padding:15px 22px;overflow:hidden;">
                <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
                    <div>
                        <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2px;color:#93C01F;text-transform:uppercase;">AE<sub>TOTAL</sub> = FP · (EF<sub>i</sub> − EF<sub>f</sub>)</div>
                        <div style="display:flex;gap:26px;margin-top:14px;">
                            <div><div style="font-size:11px;color:#B9B9B4;">Consumo inicial · EF<sub>i</sub></div><div style="font-family:'Archivo';font-weight:800;font-size:22px;">${formatNum(ef_i)} <span style="font-size:12px;font-weight:600;color:#B9B9B4;">kWh/año</span></div></div>
                            <div style="align-self:center;color:#F18A00;font-size:22px;font-weight:800;">→</div>
                            <div><div style="font-size:11px;color:#B9B9B4;">Consumo final · EF<sub>f</sub></div><div style="font-family:'Archivo';font-weight:800;font-size:22px;color:#93C01F;">${formatNum(ef_f)} <span style="font-size:12px;font-weight:600;color:#B9B9B4;">kWh/año</span></div></div>
                        </div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:11px;color:#B9B9B4;text-transform:uppercase;letter-spacing:1px;">Ahorro anual total</div>
                        <div style="font-family:'Archivo';font-weight:900;font-size:46px;line-height:1;color:#F18A00;">${formatNum(aeTotal)}</div>
                        <div style="font-size:13px;color:#fff;font-weight:600;">kWh/año</div>
                    </div>
                </div>
            </div>
            ${footer}
        </div>
    `);

    // PÁGINA 2: INSTALACIÓN TÉRMICA
    pages.push(`
        <div class="doc-page">
            ${pageHeader}
            ${sectionTitle('Actuación sobre la instalación térmica', '20px')}
            <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_termica')}</p>

            ${subLabel('Instalación de calefacción')}
            ${cmpBox(cmpHead(), `
                ${cmpRow('Tipo de equipo', calExTipoEq, calNuUds > 1 ? 'Bombas de calor en cascada (aerotermia)' : 'Bomba de calor (aerotermia)')}
                ${cmpRow('Marca', calExBrand, calNuBrand)}
                ${cmpRow('Modelo', calExMod, calNuMod)}
                ${calNuUds > 1 ? cmpRow('Nº de equipos instalados', '—', String(calNuUds)) : ''}
                ${cmpRow('Combustible', calExFuel, 'Electricidad')}
                ${cmpRow(calNuUds > 1 ? 'Nº serie unidades exteriores' : 'Nº serie unidad exterior', calExSerie, calNuSerieOut)}
                ${cmpRow('SCOP / Rendimiento', 'Según CEE inicial <sup>(1)</sup>', `${calNuScop} <sup>(2)</sup>`)}
            `)}

            ${subLabel('Agua caliente sanitaria (ACS)', '#6E6E66', '20px')}
            ${acsSeActua
                ? cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de equipo', acsExTipoEq, acsNuUds > 1 ? 'Bombas de calor en cascada' : 'Bomba de calor')}
                    ${cmpRow('Marca', acsExBrand, acsNuBrand)}
                    ${cmpRow('Modelo', acsExMod, acsNuMod)}
                    ${acsNuUds > 1 ? cmpRow('Nº de equipos instalados', '—', String(acsNuUds)) : ''}
                    ${cmpRow('Combustible', acsExFuel, 'Electricidad')}
                    ${cmpRow(acsNuUds > 1 ? 'Nº serie equipos ACS' : 'Nº serie equipo ACS', acsExSerie, acsNuSerie)}
                    ${cmpRow('SCOP / Rendimiento', 'Según CEE inicial <sup>(1)</sup>', `${acsNuScop} <sup>(3)</sup>`)}
                `)
                : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:28px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`}

            ${subLabel('Empresa instaladora', '#6E6E66', '20px')}
            ${rowsBox(`
                ${kv('Nombre o razón social', eb('empresa_responsable'))}
                ${kv('CIF / NIF', eb('empresa_cif'))}
                ${kv('Domicilio', eb('empresa_domicilio'), true)}
            `)}

            ${obsBox(`
                <p style="margin:0 0 5px;"><b>(1)</b> El rendimiento estacional de la caldera existente es el que consta en el Certificado de Eficiencia Energética Inicial, determinado por el programa oficial CE3X en función de su tipología, antigüedad y aislamiento.</p>
                <p style="margin:0 0 5px;"><b>(2)</b> Según ficha técnica del fabricante y/o cálculos realizados según anexos III y IV de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</p>
                ${acsSeActua ? `<p style="margin:0 0 5px;"><b>(3)</b> Según ficha técnica del fabricante y/o cálculos realizados según anexos III, V y VI de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</p>` : ''}
                <p style="margin:0;">La duración indicativa de la actuación (Di) es de 15 años según Recomendación (UE) 2019/1658. Se adjuntan las fichas técnicas de los nuevos equipos instalados.</p>
            `)}
            ${footer}
        </div>
    `);

    const thDark = (t, align = 'left', w = '') => `<th style="text-align:${align};padding:6px 10px;background:#33332F;color:#fff;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:.5px;text-transform:uppercase;${w}">${t}</th>`;
    const thGreen = (t, align = 'left', w = '') => `<th style="text-align:${align};padding:6px 10px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:10px;letter-spacing:.5px;text-transform:uppercase;${w}">${t}</th>`;
    const tdC = (v, extra = '') => `<td style="padding:6px 10px;text-align:center;${extra}">${v}</td>`;
    const tdG = (v, extra = '') => `<td style="padding:6px 10px;text-align:center;background:#F8FBEF;${extra}">${v}</td>`;

    // PÁGINA 3: ENVOLVENTE TÉRMICA (OPACOS) — solo si se actúa
    if (env.actua_cerramientos === true) {
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Actuación sobre los cerramientos opacos', '20px')}
                <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_envolvente')}</p>

                ${subLabel('Datos del aislamiento térmico')}
                <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                    <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">
                        <thead><tr>
                            <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">Elemento</th>
                            <th style="text-align:center;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Muros</th>
                            <th style="text-align:center;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Cubierta</th>
                        </tr></thead>
                        <tbody>
                            <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">¿Se añade aislamiento térmico?</td>${tdC(eb('aislamiento_muros_sn'), 'font-weight:700;')}${tdC(eb('aislamiento_cubierta_sn'), 'font-weight:700;')}</tr>
                            <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Tipo de aislamiento</td>${tdC(eb('aislamiento_muros_tipo'))}${tdC(eb('aislamiento_cubierta_tipo'))}</tr>
                            <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Material del aislamiento</td>${tdC(eb('aislamiento_muros_mat'))}${tdC(eb('aislamiento_cubierta_mat'))}</tr>
                            <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Espesor del aislamiento [cm]</td>${tdC(eb('aislamiento_muros_esp'))}${tdC(eb('aislamiento_cubierta_esp'))}</tr>
                            <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Conductividad térmica λ [W/mK]</td>${tdC(eb('aislamiento_muros_cond'))}${tdC(eb('aislamiento_cubierta_cond'))}</tr>
                        </tbody>
                    </table>
                </div>

                ${subLabel('Cerramientos antes de la rehabilitación')}
                <div style="border-radius:14px;overflow:hidden;border:1px solid #E9E9E1;">
                    <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead><tr>${thDark('Cerramiento')}${thDark('Nombre')}${thDark('Orient.', 'center')}${thDark('U (W/m²K)', 'center')}${thDark('Sup. (m²)', 'center')}</tr></thead>
                        <tbody>
                            ${changedOpacos.map(o => `<tr><td style="padding:6px 10px;font-weight:600;">${o.initial?.tipo || '—'}</td><td style="padding:6px 10px;">${o.initial?.nombre || '—'}</td>${tdC(o.initial?.orientacion || '—')}${tdC(formatN(o.initial?.transmitancia), 'color:#c0392b;font-weight:700;')}${tdC(formatN(o.initial?.superficie))}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>

                ${subLabel('Cerramientos después de la rehabilitación', '#4d6a12', '16px')}
                <div style="border-radius:14px;overflow:hidden;border:1px solid #D5E6A8;">
                    <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                        <thead><tr>${thGreen('Cerramiento')}${thGreen('Nombre')}${thGreen('Orient.', 'center')}${thGreen('U (W/m²K)', 'center')}${thGreen('Sup. (m²)', 'center')}</tr></thead>
                        <tbody>
                            ${changedOpacos.map(o => `<tr><td style="padding:6px 10px;font-weight:600;background:#F8FBEF;">${o.final?.tipo || '—'}</td><td style="padding:6px 10px;background:#F8FBEF;">${o.final?.nombre || '—'}</td>${tdG(o.final?.orientacion || '—')}${tdG(formatN(o.final?.transmitancia), 'color:#4d6a12;font-weight:800;')}${tdG(formatN(o.final?.superficie))}</tr>`).join('')}
                        </tbody>
                    </table>
                </div>

                ${obsBox(`<p style="margin:0;">${eb('envolvente_observaciones')}</p>`)}
                ${footer}
            </div>
        `);
    }

    // PÁGINA 4: VENTANAS — solo si se actúa
    if (env.sustituye_ventanas === true) {
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Actuación sobre las ventanas', '20px')}
                <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_ventanas')}</p>
                <div style="display:flex;gap:10px;margin:12px 0 4px 20px;flex-wrap:wrap;">
                    <span style="display:inline-flex;align-items:center;gap:8px;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:999px;padding:7px 15px;font-size:12px;font-weight:700;color:#4d6a12;">Se sustituyen las ventanas · ${seSustituyen ? 'SÍ' : 'NO'}</span>
                    <span style="display:inline-flex;align-items:center;gap:8px;background:#1A1A1A;border-radius:999px;padding:7px 15px;font-size:12px;font-weight:700;color:#fff;">Nº ventanas sustituidas · ${env.num_ventanas || changedHuecos.length}</span>
                </div>
                ${seSustituyen ? `
                    ${subLabel('Huecos antes de la rehabilitación')}
                    <div style="border-radius:14px;overflow:hidden;border:1px solid #E9E9E1;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead><tr>${thDark('Cerramiento')}${thDark('Nombre')}${thDark('Orient.', 'center')}${thDark('U (W/m²K)', 'center')}${thDark('Sup. (m²)', 'center')}${thDark('F. solar', 'center')}${thDark('Perm.', 'center')}</tr></thead>
                            <tbody>
                                ${changedHuecos.map(h => `<tr><td style="padding:6px 10px;font-weight:600;">Hueco</td><td style="padding:6px 10px;">${h.initial?.nombre || '—'}</td>${tdC(h.initial?.orientacion || '—')}${tdC(formatN(h.initial?.transmitancia), 'color:#c0392b;font-weight:700;')}${tdC(formatN(h.initial?.superficie))}${tdC(formatN(h.initial?.factorSolar))}${tdC('100', 'color:#c0392b;font-weight:700;')}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${subLabel('Huecos después de la rehabilitación', '#4d6a12', '16px')}
                    <div style="border-radius:14px;overflow:hidden;border:1px solid #D5E6A8;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead><tr>${thGreen('Cerramiento')}${thGreen('Nombre')}${thGreen('Orient.', 'center')}${thGreen('U (W/m²K)', 'center')}${thGreen('Sup. (m²)', 'center')}${thGreen('F. solar', 'center')}${thGreen('Perm.', 'center')}</tr></thead>
                            <tbody>
                                ${changedHuecos.map(h => `<tr><td style="padding:6px 10px;font-weight:600;background:#F8FBEF;">Hueco</td><td style="padding:6px 10px;background:#F8FBEF;">${h.final?.nombre || '—'}</td>${tdG(h.final?.orientacion || '—')}${tdG(formatN(h.final?.transmitancia), 'color:#4d6a12;font-weight:800;')}${tdG(formatN(h.final?.superficie))}${tdG(formatN(h.final?.factorSolar))}${tdG('3', 'color:#4d6a12;font-weight:800;')}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${subLabel('Características de las ventanas')}
                    ${cmpBox(cmpHead('Comparativa', 'Existentes', 'Nuevas'), `
                        ${cmpGroup('Marco')}
                        ${cmpRow('Material del marco', env.marco_existente_material || '—', eb('marco_nuevo_material'))}
                        ${cmpRow('Marca del marco', 'Desconocida', eb('marco_nuevo_marca'))}
                        ${cmpRow('Modelo del marco', 'Desconocida', eb('marco_nuevo_modelo'))}
                        ${cmpRow('Transmitancia del marco U<sub>f</sub> (W/m²K)', '—', eb('marco_nuevo_uf'))}
                        ${cmpGroup('Vidrio')}
                        ${cmpRow('Composición del cristal', env.cristal_existente_composicion || 'Desconocida', eb('cristal_nuevo_composicion'))}
                        ${cmpRow('Marca del cristal', 'Desconocida', eb('cristal_nuevo_marca'))}
                        ${cmpRow('Modelo del cristal', 'Desconocida', eb('cristal_nuevo_modelo'))}
                        ${cmpRow('Transmitancia del cristal U<sub>g</sub> (W/m²K)', '—', eb('cristal_nuevo_ug'))}
                        ${cmpRow('Factor solar (g)', '—', eb('cristal_nuevo_g'))}
                        ${cmpGroup('Conjunto')}
                        ${cmpRow('Permeabilidad al aire (m³/h·m²)', env.permeabilidad_existente ?? '—', eb('permeabilidad_nueva'))}
                    `)}
                ` : `<div style="margin:40px 0;text-align:center;color:#9A9A92;">No hay sustitución de ventanas.</div>`}
                ${obsBox(`<p style="margin:0;">La duración indicativa de la actuación (Di) es de 25 años según Recomendación (UE) 2019/1658. Se adjunta ficha técnica completa del marco y del cristal en anexos.</p>`, '14px')}
                ${footer}
            </div>
        `);
    }

    // PÁGINA: JUSTIFICACIÓN DEL CÁLCULO DE AHORRO (solo si hay results.details)
    if (results && results.details) {
        const d = results.details;
        const fN = (v, dec = 2) => v !== null && v !== undefined
            ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
            : '—';
        const fI = (v) => v !== null && v !== undefined ? Math.round(Number(v)).toLocaleString('es-ES') : '—';
        const aeTot = results.ahorroEnergiaFinalTotal || 0;
        const aeMwh = (aeTot / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const jCell = (v, final = false) => `<td style="padding:8px 12px;text-align:center;border-bottom:1px solid #ECECE4;${final ? 'background:#F3F8E6;font-weight:700;' : 'color:#7a7a72;'}">${v}</td>`;
        const jLabel = (t) => `<td style="padding:6px 16px;color:#4a4a44;border-bottom:1px solid #ECECE4;">${t}</td>`;
        const renderCategory = (label, dd) => `
            <tr><td colspan="3" style="padding:7px 16px;background:#EFEFE8;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">${label}</td></tr>
            <tr>${jLabel('Tipo de combustible')}${jCell(dd.fuelIni || '—')}${jCell(dd.fuelFin || '—', true)}</tr>
            <tr>${jLabel('Factor de paso')}${jCell(fN(dd.factorIni, 3))}${jCell(fN(dd.factorFin, 3), true)}</tr>
            <tr>${jLabel('Emisiones CO₂ (kgCO₂/m²·año)')}${jCell(fN(dd.emissionsIni))}${jCell(fN(dd.emissionsFin), true)}</tr>
            <tr>${jLabel('Consumo energía final (kWh/m²·año)')}${jCell(fN(dd.energyIni))}${jCell(fN(dd.energyFin), true)}</tr>`;

        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Justificación del cálculo de ahorro inicial y final', '20px')}
                <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                    <table class="just" style="width:100%;border-collapse:collapse;font-size:12px;">
                        <thead><tr>
                            <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:52%;">Parámetro energético</th>
                            <th style="text-align:center;padding:8px 12px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;text-transform:uppercase;">Inicial</th>
                            <th style="text-align:center;padding:8px 12px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;text-transform:uppercase;">Final</th>
                        </tr></thead>
                        <tbody>
                            ${d.acs ? renderCategory('Agua caliente sanitaria (ACS)', d.acs) : ''}
                            ${d.cal ? renderCategory('Calefacción', d.cal) : ''}
                            ${d.ref ? renderCategory('Refrigeración', d.ref) : ''}
                            <tr><td style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;">Consumo total de energía final (kWh/m²·año)</td><td style="padding:8px 12px;text-align:center;background:#1A1A1A;color:#C9C9C4;font-weight:700;">${fN(results.totalEnergiaInicialM2)}</td><td style="padding:8px 12px;text-align:center;background:#0f0f0e;color:#93C01F;font-family:'Archivo';font-weight:800;">${fN(results.totalEnergiaFinalM2)}</td></tr>
                            <tr><td style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;border-top:1px solid #333;">Consumo total de energía final (kWh/año)</td><td style="padding:8px 12px;text-align:center;background:#1A1A1A;color:#C9C9C4;font-weight:700;border-top:1px solid #333;">${fI(results.totalEnergiaInicialAno)}</td><td style="padding:8px 12px;text-align:center;background:#0f0f0e;color:#93C01F;font-family:'Archivo';font-weight:800;border-top:1px solid #333;">${fI(results.totalEnergiaFinalAno)}</td></tr>
                        </tbody>
                    </table>
                </div>

                <div style="margin-top:16px;border-radius:20px;background:linear-gradient(120deg,#F18A00,#A9C63A);padding:3px;">
                    <div style="border-radius:17px;background:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                        <div style="font-family:'Archivo';font-weight:800;font-size:15px;letter-spacing:.3px;text-transform:uppercase;color:#1A1A1A;">Ahorro de energía final</div>
                        <div style="font-family:'Archivo';font-weight:900;font-size:40px;line-height:1;color:#1A1A1A;">${aeMwh} <span style="font-size:16px;color:#B5730A;">MWh/año</span></div>
                    </div>
                </div>
                <p style="margin:12px 2px 0;font-size:11px;color:#6E6E66;">Este desglose corresponde a la comparativa técnica entre los certificados energéticos (XML) aportados para la situación inicial y la propuesta de reforma.</p>
                ${footer}
            </div>
        `);
    }

    // PÁGINA: JUSTIFICACIÓN DEL SCOP (calefacción + ACS)
    const scopBox = (headTitle, formula, rowsHtml) => `
        <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;margin-top:12px;">
            <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                <tr><td colspan="3" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">${headTitle}</td></tr>
                <tr><td colspan="3" style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;padding:8px;color:#1A1A1A;">${formula}</td></tr>
                <tr>
                    <td style="width:15%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Variable</td>
                    <td style="padding:6px 12px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Descripción</td>
                    <td style="width:14%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Valor</td>
                </tr>
                ${rowsHtml}
            </tbody></table>
        </div>`;
    const svRow = (v, desc, val) => `<tr><td style="text-align:center;font-weight:700;padding:6px 10px;">${v}</td><td style="padding:6px 12px;color:#4a4a44;">${desc}</td><td style="text-align:center;padding:6px 10px;font-weight:700;">${val}</td></tr>`;
    const scopResult = (calcText, scopVal) => `<tr><td colspan="2" style="padding:8px 12px;font-weight:700;color:#1A1A1A;">${calcText}</td><td style="text-align:center;font-family:'Archivo';font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${scopVal}</td></tr>`;
    const scopCallout = (html) => `<div style="margin-top:12px;padding:14px 18px;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:14px;font-size:12.5px;font-weight:700;color:#1A1A1A;line-height:1.5;">${html}</div>`;
    const renderEprelJustification = (isAcs = false) => {
        const label = isAcs ? 'ACS' : 'Calefacción';
        const etaVar = isAcs ? 'η<sub>wh</sub>' : 'η<sub>s,h</sub>';
        const scopRaw = isAcs ? scopAcsRaw : scopCalRaw;
        const scopStr = isAcs ? scopAcsStr : scopCalStr;
        const etaValue = Math.round((scopRaw * 40) - 3);
        const totalPercentage = (scopRaw * 100).toFixed(0);
        const eprelUrl = isAcs ? inst.aerotermia_acs?.url_eprel : inst.aerotermia_cal?.url_eprel;
        const fichaEprel = eprelUrl
            ? `<a href="${eprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
            : 'Ficha EPREL';
        return scopBox(
            `Justificación del SCOP en ${label} — Anexo IV ficha RES060`,
            `SCOP = CC · (${etaVar} + F(1) + F(2))`,
            `${svRow('CC', 'Coeficiente de conversión', '2,5')}
             ${svRow(etaVar, `Eficiencia energética estacional de ${label.toLowerCase()} (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()}${isAcs ? ' y perfil ACS' : `, impulsión ${getEmitterTemp(inst.tipo_emisor)}°C`})`, `${etaValue}%`)}
             ${svRow('F(1)', 'Factor de corrección por tecnología (bombas de calor aerotérmicas)', '3%')}
             ${svRow('F(2)', 'Factor de corrección por clima (bombas de calor aerotérmicas)', '0%')}
             ${scopResult(`Cálculo: SCOP = 2,5 · (${etaValue}% + 3% + 0%) = ${totalPercentage}% &nbsp;→&nbsp; SCOP en ${label}`, scopStr)}`
        );
    };
    const renderAcsScopJustification = () => {
        const FC_TABLE = { A3: 1.246, A4: 1.251, B3: 1.223, B4: 1.228, C1: 1.154, C2: 1.165, C3: 1.175, C4: 1.181, D1: 1.093, D2: 1.103, D3: 1.113, E1: 1.056 };
        const acsEprelUrl = sameAero ? inst.aerotermia_cal?.url_eprel : inst.aerotermia_acs?.url_eprel;
        const acsFtUrl = sameAero ? inst.aerotermia_cal?.url_ficha : inst.aerotermia_acs?.url_ficha;
        if (metodoAcs === 'conjunto') {
            const etaWh = (scopAcsRaw / 2.5 * 100).toFixed(1).replace('.', ',');
            const fichaEprel = acsEprelUrl ? `<a href="${acsEprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>` : 'Ficha EPREL';
            return scopBox(
                'Justificación del SCOP en ACS — Anexo IV ficha RES060 (depósito ACS en conjunto con la BdC)',
                `SCOP<sub>dhw</sub> = CC · η<sub>wh</sub>`,
                `${svRow('CC', 'Coeficiente de conversión', '2,5')}
                 ${svRow('η<sub>wh</sub>', `Eficiencia energética de caldeo de agua (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()} y perfil ACS)`, `${etaWh}%`)}
                 ${scopResult(`Cálculo: SCOP<sub>dhw</sub> = 2,5 · ${etaWh}% &nbsp;→&nbsp; SCOP en ACS`, scopAcsStr)}`
            );
        }
        if (metodoAcs === 'independiente') {
            const fc = FC_TABLE[zoneStr] ?? FC_TABLE['D3'];
            const fcStr = fc.toFixed(3).replace('.', ',');
            const copCalc = (scopAcsRaw / fc).toFixed(2).replace('.', ',');
            const ftLink = acsFtUrl ? `<li style="margin-top:3px;">Ficha técnica: <a href="${acsFtUrl}" style="color:#0000EE;text-decoration:underline;">Acceder a la ficha técnica del fabricante</a></li>` : '';
            return `
                <div style="margin-top:12px;padding:16px 20px;border:1px solid #E9E9E1;border-radius:16px;font-size:12.5px;line-height:1.5;color:#4a4a44;">
                    <div style="font-family:'Archivo';font-weight:800;font-size:13px;text-transform:uppercase;color:#1A1A1A;margin-bottom:8px;">Cálculo del SCOP en ACS</div>
                    <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Fórmula aplicada</div>
                    <p style="margin:0 0 6px;">Según el Anexo VI de la ficha RES060 (Caso 3: bomba de calor aerotérmica con depósito de ACS no suministrado como conjunto), para la zona climática ${zoneStr}:</p>
                    <div style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;margin:10px 0;color:#1A1A1A;">SCOP<sub>dhw</sub> = COP · F<sub>c</sub></div>
                    <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Donde</div>
                    <ul style="list-style:none;margin:0 0 10px;padding-left:0;">
                        <li>· COP: coeficiente de rendimiento según ficha técnica y placa de características del equipo</li>
                        <li style="margin-top:3px;">· F<sub>c</sub>: factor de corrección para la zona climática ${zoneStr} (clima ${zoneLabel.toLowerCase()})</li>
                        ${ftLink}
                    </ul>
                    <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Valores utilizados</div>
                    <ul style="list-style:none;margin:0 0 10px;padding-left:0;">
                        <li>· COP = ${copCalc} (según ficha técnica del fabricante)</li>
                        <li style="margin-top:3px;">· F<sub>c</sub> = ${fcStr} (para zona climática ${zoneStr})</li>
                    </ul>
                    <div style="display:flex;justify-content:space-between;align-items:center;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:12px;padding:10px 16px;margin-top:10px;">
                        <span style="font-weight:700;color:#1A1A1A;">SCOP<sub>dhw</sub> = ${copCalc} × ${fcStr} = ${scopAcsStr}</span>
                        <span style="font-family:'Archivo';font-weight:900;font-size:18px;color:#4d6a12;">${scopAcsStr}</span>
                    </div>
                </div>`;
        }
        return scopCallout(`SCOP en ACS = ${scopAcsStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`);
    };
    const scopCond = (label, value) => `<div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">${label}</span><span style="font-weight:700;">${value}</span></div>`;
    pages.push(`
        <div class="doc-page">
            ${pageHeader}
            ${sectionTitle('Anexos · Rendimiento estacional (SCOP)', '20px')}

            ${subLabel('SCOP de la bomba de calor en calefacción', '#6E6E66', '4px')}
            <div style="border:1px solid #E9E9E1;border-radius:16px;padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
                ${scopCond('Ubicación de la instalación', `Zona climática ${zoneStr} (DB-HE CTE)`)}
                ${scopCond('Condiciones en calefacción', zoneLabel)}
                ${scopCond('Tipo de bomba de calor', 'Aerotérmica')}
                ${scopCond('Sistema de distribución', emiLabel)}
            </div>
            ${metodoCal === 'eprel'
                ? renderEprelJustification(false)
                : scopCallout(`SCOP en Calefacción = ${scopCalStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`)
            }

            ${subLabel('SCOP de la bomba de calor para ACS (agua caliente sanitaria)', '#6E6E66', '20px')}
            ${tieneAcs ? renderAcsScopJustification() : scopCallout('SCOP en ACS = no aplica.')}
            ${footer}
        </div>
    `);

    // SEPARADOR ANEXOS
    const annexList = attachments.filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || tieneAcs));
    if (annexList.length > 0) {
        const items = annexList.map((a, i) => `
            <div style="display:flex;align-items:center;gap:16px;border:1px solid #E9E9E1;border-radius:16px;padding:14px 18px;background:#fff;">
                <span style="flex:none;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-family:'Archivo';font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
                <div style="font-weight:700;font-size:13.5px;">${a.label}</div>
            </div>
        `).join('');
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Anexos · Documentación adjunta', '20px')}
                <p style="margin:0 0 16px 20px;font-size:12.5px;color:#4a4a44;">Se adjunta al presente certificado la siguiente documentación técnica justificativa.</p>
                <div style="display:grid;gap:10px;">${items}</div>
                <div style="margin-top:22px;background:linear-gradient(120deg,#1A1A1A,#242422);border-radius:20px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
                    <div>
                        <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">BROKERGY <span style="color:#93C01F;font-weight:600;font-size:13px;">· Ingeniería Energética</span></div>
                        <div style="font-size:12px;color:#B9B9B4;margin-top:4px;">Tel 623 926 179 · www.brokergy.es · info@brokergy.es</div>
                    </div>
                    <img src="${APP_URL}/logo-brokergy-circular.png" alt="Brokergy" style="height:56px;">
                </div>
                ${footer}
            </div>
        `);

        if (withAnnexPreview) {
            annexList.forEach(a => {
                (a.file.previewPages || []).forEach(src => {
                    pages.push(`
                        <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                            <img src="${src}" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                    `);
                });
            });
        }
    }

    const total = pages.length - 1;
    const body = pages.map((p, idx) => idx === 0 ? p : p.replace(/PAGE_X_OF_Y/g, `Página ${idx} | ${total}`)).join('');
    const css = isForPdf ? buildRes080PdfCss(APP_URL) : buildRes080DocCss(APP_URL);
    const wrapOpen = isForPdf ? '' : '<div class="doc-wrap">';
    const wrapClose = isForPdf ? '' : '</div>';
    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${css}</style></head><body>${wrapOpen}${body}${wrapClose}</body></html>`;
}
