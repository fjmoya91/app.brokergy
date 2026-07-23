// ============================================================================
// cifoDoc.js — FUENTE ÚNICA del Certificado CIFO (RES060 / RES093).
// ----------------------------------------------------------------------------
// Módulo JS PURO (sin React, sin DOM, sin axios). Extraído de
// CertificadoCifoModal.jsx para que el MISMO código produzca el PDF por dos
// caminos que DEBEN salir idénticos:
//   1) El modal del frontend (preview + botón "Descargar/Guardar en Drive").
//   2) La generación AUTOMÁTICA server-side (backend cifoService.js, endpoint
//      /api/expedientes/:id/cifo/generar y la skill de Cowork), que importa
//      este fichero por import() dinámico ESM (igual que expedienteFinancialsNode
//      importa calculation.js). Node puede importarlo porque es matemática/HTML
//      puro sin dependencias de navegador.
//
// ⚠️ Si tocas el DISEÑO (CSS/builders) o la DERIVACIÓN de datos, este es el
// único sitio: ambos caminos quedan sincronizados por construcción. No dupliques
// esta lógica en el modal ni en el backend.
//
// APP_URL entra como parámetro (no import.meta.env / window) para que el backend
// inyecte su propio origen absoluto (Puppeteer renderiza con setContent → base
// about:blank, las rutas relativas no cargan).
// ============================================================================
import { BOILER_EFFICIENCIES, calculateHybridization, resolveHybridInputs, HYBRID_METHODS } from '../../calculator/logic/calculation.js';
import { buildInstalacionAddress } from '../utils/docGenerators.js';
import { calcCifo } from './calcCifo.js';
import { formatMarcas, formatModelos, formatSeries, countUnidades } from './aerotermiaUnits.js';

export const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
];

export function getEmitterTemp(val) {
    if (val === 'suelo_radiante') return 35;
    if (val === 'radiadores_baja_temp') return 45;
    if (val === 'radiadores_convencionales') return 55;
    return 35;
}

export function formatDateSpanish(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

// ─── Fuentes del diseño (Archivo + Instrument Sans), auto-alojadas en /public/fonts.
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

// CSS de PANTALLA (preview del modal). El modal lo inyecta en un <style> aparte.
export function buildDocCss(appUrl) {
    return `
    ${buildFontFaces(appUrl)}
    ${DESIGN_SHARED}
    html, body { margin: 0; }
    .doc-wrap { background: #4a4a46; width: 794px; padding: 20px 0; margin: 0 auto; }
    .doc-page {
        width: 794px;
        min-height: 1123px;
        padding: 15mm 14mm 12mm;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 18px rgba(20,20,19,.16);
        position: relative;
    }
    .doc-page:last-child { margin-bottom: 0; }
    @media print {
        .doc-wrap { background: #fff !important; padding: 0 !important; }
        .doc-page { margin: 0 !important; box-shadow: none !important; }
    }
`;
}

// CSS de IMPRESIÓN (el que viaja embebido en el HTML → Puppeteer).
export function buildPdfCss(appUrl) {
    return `
    ${buildFontFaces(appUrl)}
    ${DESIGN_SHARED}
    @page { size: 210mm 297mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-page {
        width: 210mm;
        min-height: 297mm;
        padding: 15mm 14mm 18mm;
        page-break-after: always;
        break-after: page;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .doc-page:last-child { page-break-after: auto; break-after: auto; }
    .doc-page > .doc-foot {
        position: absolute;
        left: 14mm;
        right: 14mm;
        bottom: 10mm;
        margin-top: 0;
    }
`;
}

// ============================================================================
// DERIVACIÓN — de (expediente, results) a todas las variables del PDF.
// Espejo EXACTO del bloque de derivación del modal, con UNA corrección de
// coherencia: la base de CEE cae a `cee_inicial` cuando `cee_final` no es válido
// (mismo criterio que calcResults en ExpedienteDetailView). Antes el modal leía
// SOLO cee_final, imprimiendo D_CAL/S = 0 en expedientes cuya demanda vive en el
// inicial (migrados o pre-CEE-final). Con esto ambos caminos salen coherentes.
// ============================================================================
export function deriveCifoData({ expediente, results }) {
    const exp = expediente || {};
    const op = exp.oportunidades || {};
    const opInputs = op.datos_calculo || {};
    const inst = exp.instalacion || {};
    const doc = exp.documentacion || {};
    const cee = exp.cee || {};
    const loc = exp.ubicacion || {};
    const cli = exp.clientes || exp.cliente || {};
    const pres = exp.prescriptores || {};

    const zoneStr = (op.datos_calculo?.zona || 'D3').toUpperCase();
    const zoneLabel = [
        'A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3'
    ].includes(zoneStr) ? 'Cálido' : (zoneStr === 'E1' ? 'Medio' : 'Cálido');

    const numexpte = exp.numero_expediente || '';
    const facturasList = (doc.facturas || []).map(f => f.numero_factura).filter(Boolean).join(', ') || '—';

    const cifoDatesCert = calcCifo(doc);
    const fechaInicio = formatDateSpanish(cifoDatesCert.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial);
    const fechaFin = formatDateSpanish(cifoDatesCert.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final);

    const aeKwh = Math.round(results?.savingsKwh || 0).toLocaleString('es-ES');
    const beneficioStr = Math.round((results?.savingsKwh || 0) * (results?.price_kwh || 0.10)).toLocaleString('es-ES');

    // CEE base: final si es válido; si no, inicial (coherente con calcResults).
    const ceeFinalValido = cee.cee_final && parseFloat(cee.cee_final.demandaCalefaccion) > 0;
    const ceeFinal = ceeFinalValido ? cee.cee_final : (cee.cee_inicial || cee.cee_final || {});
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');
    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    const acsMode = cee.acs_method || 'xml';
    const numRooms = parseInt(cee.num_rooms) || 4;
    const numPeople = numRooms + 1;

    let dacsValue = 0;
    if (acsMode === 'xml') {
        const dacsKwhM2 = parseFloat(ceeFinal.demandaACS) || 0;
        const superficie = parseFloat(ceeFinal.superficieHabitable) || 0;
        dacsValue = dacsKwhM2 * superficie;
    } else {
        dacsValue = 28 * numPeople * 0.001162 * 365 * 46;
    }
    const dacsStr = dacsValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const instAddr = buildInstalacionAddress(exp);
    const locFullDir = instAddr.full || '—';
    const PROV_CCAA = {
        '04':'Andalucía','11':'Andalucía','14':'Andalucía','18':'Andalucía',
        '21':'Andalucía','23':'Andalucía','29':'Andalucía','41':'Andalucía',
        '22':'Aragón','44':'Aragón','50':'Aragón','33':'Asturias','07':'Islas Baleares',
        '35':'Canarias','38':'Canarias','39':'Cantabria','02':'Castilla-La Mancha',
        '13':'Castilla-La Mancha','16':'Castilla-La Mancha','19':'Castilla-La Mancha',
        '45':'Castilla-La Mancha','05':'Castilla y León','09':'Castilla y León',
        '24':'Castilla y León','34':'Castilla y León','37':'Castilla y León',
        '40':'Castilla y León','42':'Castilla y León','47':'Castilla y León',
        '49':'Castilla y León','08':'Cataluña','17':'Cataluña','25':'Cataluña',
        '43':'Cataluña','51':'Ceuta', '03':'Comunidad Valenciana','12':'Comunidad Valenciana',
        '46':'Comunidad Valenciana','06':'Extremadura','10':'Extremadura','15':'Galicia',
        '27':'Galicia','32':'Galicia','36':'Galicia','26':'La Rioja','28':'Comunidad de Madrid',
        '52':'Melilla','30':'Región de Murcia','31':'Navarra','01':'País Vasco','20':'País Vasco','48':'País Vasco',
    };

    const cp = instAddr.cp || opInputs.ccaa_cp || opInputs.cp || '';
    const provCode = cp ? String(cp).substring(0, 2).padStart(2, '0') : '';

    const locCA = (
        instAddr.ccaa ||
        (provCode ? PROV_CCAA[provCode] : '') ||
        '—'
    ).toUpperCase();
    const locRefCat = instAddr.refCatastral || '—';
    const locUtmX = inst.coord_x || loc.coord_x || opInputs.coordX || opInputs.coord_x || '—';
    const locUtmY = inst.coord_y || loc.coord_y || opInputs.coordY || opInputs.coord_y || '—';

    const cliNombre = (cli.nombre_razon_social || cli.nombre || '—') + (cli.apellidos ? ` ${cli.apellidos}` : '');
    const cliNif = cli.nif || cli.dni || '—';
    const cliDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
    const cliTlf = cli.tlf || cli.telefono || opInputs?.phone || '—';

    const calExMarca = inst.caldera_antigua_cal?.marca || '—';
    const calExMod = inst.caldera_antigua_cal?.modelo || '—';
    const calExSerie = inst.caldera_antigua_cal?.numero_serie || '—';
    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffEntry = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId);

    const calExTipo = boilerEffEntry?.label || '—';
    const calExComb = calExTipo.split(',')[0] || '—';

    const etaBoiler = boilerEffEntry?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    // Equipo(s) nuevo(s) de calefacción. Puede haber varios en CASCADA: el modelo
    // se agrupa ("MODELO (×3)") para no repetir filas idénticas, pero los números
    // de serie se listan TODOS — cada equipo instalado debe quedar identificado.
    const calNuMarca = formatMarcas(inst.aerotermia_cal);
    const calNuMod = formatModelos(inst.aerotermia_cal);
    const calNuSerieEx = formatSeries(inst.aerotermia_cal);
    const calNuUds = countUnidades(inst.aerotermia_cal);
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';

    const tieneAcs = inst.cambio_acs !== false;
    const acsExMarca = inst.caldera_antigua_acs?.marca || calExMarca;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || inst.caldera_antigua_acs?.n_serie || '—';

    const acsEffId = inst.caldera_antigua_acs?.rendimiento_id || boilerEffId;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === acsEffId);
    const acsExTipo = acsEffEntry?.label || calExTipo;
    const acsExComb = acsExTipo.split(',')[0] || '—';

    const acsNuMarca = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMarca : formatMarcas(inst.aerotermia_acs)) : '—';
    const acsNuMod = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMod : formatModelos(inst.aerotermia_acs)) : '—';
    const acsNuSerieEx = tieneAcs ? (inst.misma_aerotermia_acs ? calNuSerieEx : formatSeries(inst.aerotermia_acs)) : '—';
    const acsNuUds = tieneAcs ? (inst.misma_aerotermia_acs ? calNuUds : countUnidades(inst.aerotermia_acs)) : 0;
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    const acsAero = inst.misma_aerotermia_acs ? inst.aerotermia_cal : inst.aerotermia_acs;
    const acsEsAcumulador = tieneAcs && !!acsAero?.es_acumulador;

    const aeRaw = results?.savingsKwh || 0;
    const aeKwhVal = aeRaw ? Math.round(aeRaw).toLocaleString('es-ES') : '—';

    const empNombre = pres.razon_social || pres.nombre || '—';
    const empCif    = pres.cif || '—';
    const empDir    = pres.direccion || '—';
    const empCp     = pres.codigo_postal || '—';
    const empMun    = pres.municipio || '—';
    const empProv   = pres.provincia || '—';
    const empCargo  = pres.es_autonomo ? 'Trabajador autónomo' : 'Representante legal';
    const empEmail  = pres.email || '';
    const empTlf    = pres.tlf || '';
    const empResponsable = [pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ') || empNombre;
    const emiLabel  = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';
    const metodoCal = inst.aerotermia_cal?.metodo_scop || 'ficha';
    const metodoAcs = inst.aerotermia_acs?.metodo_scop || 'ficha';

    const isHybrid = numexpte.includes('RES093');
    let cbStr = '—', pDesignKwStr = '—', coveragePct = 0, coveragePctStr = '—';
    let thZone = 0, pbdcKw = 0, pbdcKwStr = '—', demandaAnualKwhStr = '—', appliedCovStr = '—';
    // Método de cálculo de la cobertura: 'demanda' (P_diseño) o 'caldera' (P nominal caldera).
    let hybridMethod = HYBRID_METHODS.DEMANDA, pCalderaKwStr = '—', refPowerKwStr = '—';
    if (isHybrid) {
        const demandaAnual = dcalRaw * sRaw;
        const hybridIn = resolveHybridInputs(inst, opInputs);
        hybridMethod = hybridIn.method;
        pbdcKw = hybridIn.heatPumpPower;
        const hybridData = calculateHybridization({ demandAnnual: demandaAnual, zone: zoneStr, ...hybridIn });
        cbStr = hybridData?.cb != null ? ((hybridData.cb * 100).toFixed(2).replace('.', ',') + '%') : '—';
        const pDesignRaw = hybridData?.pDesign || 0;
        pDesignKwStr = pDesignRaw.toFixed(2).replace('.', ',');
        pCalderaKwStr = (hybridData?.boilerPower || 0).toFixed(2).replace('.', ',');
        // Denominador realmente aplicado en la cobertura (P_diseño o P_caldera).
        const refPowerRaw = hybridData?.refPower || 0;
        refPowerKwStr = refPowerRaw.toFixed(2).replace('.', ',');
        const rawCoveragePct = refPowerRaw > 0 ? (pbdcKw / refPowerRaw) * 100 : 0;
        coveragePct = rawCoveragePct;
        coveragePctStr = rawCoveragePct.toFixed(0);
        thZone = hybridData?.th || 0;
        pbdcKwStr = pbdcKw.toFixed(2).replace('.', ',');
        demandaAnualKwhStr = demandaAnual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        appliedCovStr = (coveragePct >= 95 ? 95 : coveragePct).toFixed(0);
    }

    return {
        // objetos crudos usados directamente en el HTML
        inst, cli, ceeFinal,
        // identificación / cabecera
        isHybrid, numexpte, zoneStr, zoneLabel,
        // variables de la fórmula
        dcal, dcalRaw, sStr, sRaw, dacsStr, acsMode, numRooms, numPeople,
        etaStr, scopCalStr, scopCalRaw, scopAcsStr, scopAcsRaw,
        aeKwh, aeKwhVal, beneficioStr,
        // localización / propietario
        locCA, locFullDir, locRefCat, locUtmX, locUtmY, facturasList,
        cliNombre, cliDir, cliNif, cliTlf,
        fechaInicio, fechaFin,
        // calefacción
        calExTipo, calExMarca, calExMod, calExComb, calExSerie,
        calNuMarca, calNuMod, calNuSerieEx, calNuUds,
        // ACS
        tieneAcs, acsExTipo, acsExMarca, acsExMod, acsExComb, acsExSerie,
        acsEsAcumulador, acsNuMarca, acsNuMod, acsNuSerieEx, acsNuUds,
        // método SCOP / emisor
        metodoCal, metodoAcs, emiLabel,
        // empresa instaladora
        empNombre, empCif, empDir, empCp, empMun, empProv, empCargo, empEmail, empTlf, empResponsable,
        // hibridación (RES093)
        cbStr, pDesignKwStr, coveragePct, coveragePctStr, thZone, pbdcKw, pbdcKwStr, demandaAnualKwhStr, appliedCovStr,
        hybridMethod, pCalderaKwStr, refPowerKwStr,
    };
}

// ============================================================================
// buildCifoHtml — devuelve el documento HTML completo (<!DOCTYPE …>) con el CSS
// de impresión embebido. Copia fiel del buildHtml del modal; las variables de
// scope ahora vienen de `data` (deriveCifoData). `attachments` es la lista de
// slots de anexos (FT cal/acs, extras) con { id, label, file:{ driveId, previewPages } }.
// ============================================================================
export function buildCifoHtml({ data, appUrl, attachments = [], withAnnexPreview = false }) {
    const APP_URL = appUrl || '';
    const {
        inst, cli, ceeFinal,
        isHybrid, numexpte, zoneStr, zoneLabel,
        dcal, sStr, dacsStr, acsMode, numRooms, numPeople,
        etaStr, scopCalStr, scopCalRaw, scopAcsStr, scopAcsRaw,
        aeKwh, aeKwhVal,
        locCA, locFullDir, locRefCat, locUtmX, locUtmY, facturasList,
        cliNombre, cliDir, cliNif, cliTlf,
        fechaInicio, fechaFin,
        calExTipo, calExMarca, calExMod, calExComb, calExSerie,
        calNuMarca, calNuMod, calNuSerieEx, calNuUds,
        tieneAcs, acsExTipo, acsExMarca, acsExMod, acsExComb, acsExSerie,
        acsEsAcumulador, acsNuMarca, acsNuMod, acsNuSerieEx, acsNuUds,
        metodoCal, metodoAcs, emiLabel,
        empNombre, empCif, empDir, empCp, empMun, empProv, empCargo, empEmail, empTlf, empResponsable,
        cbStr, pDesignKwStr, coveragePct, coveragePctStr, thZone, pbdcKwStr, demandaAnualKwhStr, appliedCovStr,
        hybridMethod, pCalderaKwStr, refPowerKwStr,
    } = data;

    const pages = [];
    const cifoLabel = isHybrid ? 'RES093' : 'RES060';
    const actuacionNombre = isHybrid
        ? 'Hibridación de combustión con bomba de calor de accionamiento eléctrico'
        : 'Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)';
    const fichaNombreCompleto = isHybrid
        ? 'RES093: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3'
        : 'RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas';

    const pageHeader = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1A1A1A;border-radius:14px;">
            <span style="font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:2.5px;color:#93C01F;">CERTIFICADO CIFO · ${cifoLabel}</span>
            <span style="font-family:'Archivo';font-weight:600;font-size:11px;letter-spacing:1px;color:#93C01F;">Expte: ${numexpte}</span>
        </div>`;
    const sectionTitle = (t, mt = '13px') => `
        <div style="display:flex;align-items:center;gap:11px;margin:${mt} 0 8px;">
            <span style="width:9px;height:24px;border-radius:5px;background:linear-gradient(#F18A00,#93C01F);"></span>
            <h3 style="font-weight:800;font-size:14px;letter-spacing:.5px;text-transform:uppercase;">${t}</h3>
        </div>`;
    const subLabel = (t, color = '#6E6E66', mt = '18px') => `<h3 style="font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin:${mt} 0 8px;">${t}</h3>`;
    const footer = `<div class="doc-foot"><span>Certificado de Instalación · CIFO</span><span>PAGE_X_OF_Y · Expte ${numexpte}</span></div>`;
    const obsBox = (inner, mt = '16px') => `<div style="margin-top:${mt};padding:14px 18px;background:#FBF6EE;border:1px solid #F1E4CF;border-radius:14px;font-size:10.5px;line-height:1.5;color:#6b5a3e;">${inner}</div>`;
    const rowsBox = (inner) => `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">${inner}</div>`;
    const kv = (label, value, last = false) => `<div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${label}</div><div style="padding:7px 16px;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${value}</div></div>`;
    const cmpHead = (col1 = 'Comparativa', ex = 'Existente', nu = 'Nueva') => `<thead><tr>
        <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">${col1}</th>
        <th style="text-align:left;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${ex}</th>
        <th style="text-align:left;padding:8px 16px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${nu}</th>
    </tr></thead>`;
    const cmpRow = (label, ex, nu) => `<tr><td style="padding:5px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">${label}</td><td style="padding:5px 16px;color:#7a7a72;">${ex}</td><td style="padding:5px 16px;background:#F3F8E6;font-weight:700;">${nu}</td></tr>`;
    const cmpBox = (headHtml, bodyRows) => `<div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;"><table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">${headHtml}<tbody>${bodyRows}</tbody></table></div>`;
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

    const varCols = [
        { th: 'F<sub>P</sub>', td: '1' },
        { th: 'D<sub>CAL</sub>', td: dcal },
        { th: 'S', td: sStr },
        { th: 'D<sub>ACS</sub>', td: dacsStr },
        { th: 'η<sub>i</sub>', td: etaStr },
        { th: 'SCOP<sub>bdc</sub>', td: scopCalStr },
        { th: 'SCOP<sub>dhw</sub>', td: scopAcsStr },
        ...(isHybrid ? [{ th: 'C<sub>b</sub>', td: cbStr, hi: true }] : []),
        { th: 'AE<sub>TOTAL</sub>', td: aeKwhVal, hi: true },
        { th: 'D<sub>i</sub>', td: '15' },
    ];
    const varTableBox = `
        <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>${varCols.map(c => `<th style="padding:8px 4px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:9.5px;text-align:center;">${c.th}</th>`).join('')}</tr></thead>
                <tbody><tr>${varCols.map(c => `<td style="padding:8px 4px;text-align:center;font-weight:${c.hi ? 800 : 600};font-size:${c.hi ? '12px' : '11px'};background:${c.hi ? '#F3F8E6' : '#FAFAF6'};color:${c.hi ? '#4d6a12' : '#1A1A1A'};">${c.td}</td>`).join('')}</tr></tbody>
            </table>
        </div>`;

    const donde = [
        { n: 1, sym: 'F<sub>P</sub>', desc: 'Factor de ponderación', val: '1' },
        { n: 2, sym: 'D<sub>CAL</sub>', desc: 'Demanda de energía en calefacción del edificio/vivienda', val: `${dcal} kWh/m²·año` },
        { n: 3, sym: 'S', desc: 'Superficie útil habitable del edificio o vivienda', val: `${sStr} m²` },
        { n: 4, sym: 'D<sub>ACS</sub>', desc: 'Demanda de energía en agua caliente sanitaria', val: `${dacsStr} kWh/año` },
        { n: 5, sym: 'η<sub>i</sub>', desc: 'Rendimiento de caldera de combustión(PCS)', val: etaStr },
        { n: 6, sym: 'SCOP<sub>bdc</sub>', desc: 'Rendimiento estacional bomba calor calefacción', val: scopCalStr },
        { n: 7, sym: 'SCOP<sub>dhw</sub>', desc: 'Rendimiento estacional bomba calor ACS', val: scopAcsStr },
        ...(isHybrid ? [{ n: 8, sym: 'C<sub>b</sub>', desc: 'Coeficiente de cobertura por bivalencia en paralelo', val: cbStr }] : []),
        { n: isHybrid ? 9 : 8, sym: 'D<sub>i</sub>', desc: 'Vida útil de la actuación de eficiencia energética', val: '15 años' },
    ];
    const dondeBox = `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;">${donde.map((d, i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:5px 16px;${i === donde.length - 1 ? '' : 'border-bottom:1px solid #ECECE4;'}">
            <span style="flex:none;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-family:'Archivo';font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;">${d.n}</span>
            <span style="flex:none;width:56px;font-family:'Archivo';font-weight:700;font-size:12px;color:#1A1A1A;">${d.sym}</span>
            <span style="flex:1;color:#4a4a44;font-size:11.5px;">${d.desc}</span>
            <span style="flex:none;font-weight:700;font-size:12px;color:#1A1A1A;white-space:nowrap;">${d.val}</span>
        </div>`).join('')}</div>`;

    // PÁGINA 0: PORTADA
    pages.push(`
        <div class="doc-page" style="padding:0;display:block;background:#111110;overflow:hidden;">
            <img src="${APP_URL}/assets/pegatina-cifo.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(3px);transform:scale(1.06);">
            <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(15,15,14,.72) 0%, rgba(15,15,14,.30) 34%, rgba(15,15,14,.55) 66%, rgba(12,12,11,.94) 100%);"></div>

            <div style="position:absolute;top:96mm;left:0;right:0;z-index:3;padding:0 20mm;">
                <div style="display:inline-flex;align-items:center;gap:9px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.16);padding:6px 16px;border-radius:999px;margin-bottom:20px;">
                    <span style="width:8px;height:8px;border-radius:50%;background:#93C01F;"></span>
                    <span style="font-family:'Archivo';font-weight:700;font-size:12px;letter-spacing:4px;color:#fff;">CERTIFICADO CIFO · ${cifoLabel}</span>
                </div>
                <h1 style="font-weight:900;font-size:62px;line-height:.98;letter-spacing:-1.5px;color:#fff;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,.5);max-width:14ch;">Certificado de <span style="color:#F18A00;">instalación</span></h1>
                <p style="font-family:'Archivo';font-weight:600;font-size:18px;color:#EDEDE8;margin:20px 0 0;max-width:30ch;text-shadow:0 2px 14px rgba(0,0,0,.6);">${actuacionNombre}</p>
                <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">
                    <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:#fff;padding:6px 16px;border-radius:10px;">Expte: ${numexpte}</span>
                    <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:linear-gradient(90deg,#F5A21E,#A9C63A);padding:6px 16px;border-radius:10px;">${cifoLabel}</span>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;z-index:3;">
                <div style="padding:0 20mm 22px;">
                    <div style="display:inline-flex;align-items:center;gap:20px;background:rgba(12,12,11,.78);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px 26px;">
                        <div>
                            <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2.5px;color:#93C01F;text-transform:uppercase;">Ahorro anual certificado</div>
                            <div style="font-family:'Archivo';font-weight:900;font-size:36px;line-height:1;color:#fff;margin-top:4px;">${aeKwh} <span style="font-size:16px;font-weight:700;color:#F18A00;">kWh/año</span></div>
                        </div>
                        <div style="width:1px;height:44px;background:rgba(255,255,255,.2);"></div>
                        <div style="font-family:'Archivo';font-weight:800;font-size:24px;color:#fff;">${aeKwh} <span style="font-size:13px;font-weight:700;color:#B9B9B4;">CAEs</span></div>
                    </div>
                </div>
                <div style="background:#0C0C0B;padding:16px 20mm;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:3px solid;border-image:linear-gradient(90deg,#F18A00,#93C01F) 1;">
                    <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">${empNombre} <span style="color:#93C01F;font-weight:600;font-size:13px;">· Empresa instaladora</span></div>
                    <div style="display:flex;gap:22px;font-size:12.5px;color:#EDEDE8;font-weight:500;flex-wrap:wrap;">
                        ${empCif && empCif !== '—' ? `<span><b style="color:#F18A00;">CIF</b>&nbsp; ${empCif}</span>` : ''}
                        ${empTlf ? `<span><b style="color:#F18A00;">Tel</b>&nbsp; ${empTlf}</span>` : ''}
                        ${empEmail ? `<span><b style="color:#F18A00;">Email</b>&nbsp; ${empEmail}</span>` : ''}
                    </div>
                </div>
            </div>
        </div>
    `);

    // PÁGINA 1 (FIJA): Identificación + Propietario + Hitos + Empresa + Firma
    pages.push(`
        <div class="doc-page">
            ${pageHeader}
            <h2 style="font-weight:800;font-size:19px;letter-spacing:-.3px;margin:12px 0 3px;">Certificado de instalación</h2>
            <p style="margin:0;font-size:13px;color:#6E6E66;font-weight:500;">Ficha ${cifoLabel} · ${actuacionNombre}</p>

            ${sectionTitle('Identificación de la actuación de ahorro de energía')}
            ${rowsBox(`
                ${kv('Nombre de la actuación', actuacionNombre)}
                ${kv('Código y nombre de la ficha', fichaNombreCompleto)}
                ${kv('Comunidad autónoma', locCA)}
                ${kv('Dirección postal', locFullDir)}
                ${kv('Referencia catastral', locRefCat)}
                ${kv('Coordenadas UTM', `X: ${locUtmX} · Y: ${locUtmY}`)}
                ${kv('Facturas asociadas', facturasList, true)}
            `)}

            ${sectionTitle('Propietario inicial del ahorro')}
            ${rowsBox(`
                ${kv('Propietario / Razón social', cliNombre)}
                ${kv('Domicilio', cliDir)}
                <div style="display:grid;grid-template-columns:34% 32% 34%;border-bottom:1px solid #ECECE4;">
                    <div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">NIF / NIE</div>
                    <div style="padding:7px 16px;font-weight:600;">${cliNif}</div>
                    <div style="padding:7px 16px;font-weight:600;"><span style="color:#6E6E66;">Tel&nbsp;</span>${cliTlf}</div>
                </div>
                ${kv('Correo electrónico', cli.email || '—', true)}
            `)}

            ${sectionTitle('Hitos de la actuación', '12px')}
            <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">
                <div style="display:grid;grid-template-columns:34% 66%;border-bottom:1px solid #ECECE4;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de inicio</div><div style="padding:6px 16px;font-weight:700;">${fechaInicio}</div></div>
                <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de fin</div><div style="padding:6px 16px;font-weight:700;">${fechaFin}</div></div>
            </div>

            ${sectionTitle('Datos de la empresa instaladora', '12px')}
            ${rowsBox(`
                ${kv('Razón social', empNombre)}
                ${kv('NIF / CIF', empCif)}
                ${kv('Domicilio', `${empDir} · ${empCp} ${empMun} (${empProv})`)}
                ${kv('Cargo firmante', empCargo, true)}
            `)}

            ${sectionTitle('Firma y sello', '12px')}
            <div style="border:2px solid #1A1A1A;border-radius:16px;padding:12px 18px;min-height:104px;display:flex;flex-direction:column;break-inside:avoid;">
                <div style="font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">Espacio reservado para firma electrónica</div>
                <div style="flex:1;"></div>
                <div style="border-top:1px solid #ECECE4;padding-top:10px;font-size:12.5px;font-weight:700;color:#1A1A1A;">${empResponsable} <span style="font-weight:600;color:#6E6E66;">· ${empCargo}</span></div>
            </div>
            ${footer}
        </div>
    `);

    // PÁGINA 2 (VARIABLE): Calefacción + ACS + variables + Donde
    pages.push(`
        <div class="doc-page">
            ${pageHeader}
            ${sectionTitle('Datos de la instalación de calefacción', '16px')}
            ${cmpBox(cmpHead(), `
                ${cmpRow('Tipo de caldera', calExTipo, calNuUds > 1 ? 'Bombas de calor en cascada' : 'Bomba de calor')}
                ${cmpRow('Marca', calExMarca, calNuMarca)}
                ${cmpRow('Modelo', calExMod, calNuMod)}
                ${calNuUds > 1 ? cmpRow('Nº de equipos instalados', '—', String(calNuUds)) : ''}
                ${cmpRow('Fuente de energía', calExComb, 'Electricidad')}
                ${cmpRow(calNuUds > 1 ? 'Nº serie unidades exteriores' : 'Nº serie unidad exterior', calExSerie, calNuSerieEx)}
                ${cmpRow(calNuUds > 1 ? 'SCOP<sub>bdc</sub> aplicado (menor) / Rendimiento' : 'SCOP<sub>bdc</sub> / Rendimiento', etaStr, scopCalStr)}
            `)}

            ${sectionTitle('Datos de la instalación de agua caliente sanitaria (ACS)', '14px')}
            ${tieneAcs
                ? cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de equipo', acsExTipo, acsEsAcumulador ? 'Acumulador ACS' : (acsNuUds > 1 ? 'Bombas de calor en cascada' : 'Bomba de calor'))}
                    ${cmpRow('Marca', acsExMarca, acsNuMarca)}
                    ${cmpRow('Modelo', acsExMod, acsNuMod)}
                    ${acsNuUds > 1 && !acsEsAcumulador ? cmpRow('Nº de equipos instalados', '—', String(acsNuUds)) : ''}
                    ${cmpRow('Fuente de energía', acsExComb, 'Electricidad')}
                    ${cmpRow(acsNuUds > 1 ? 'Nº serie equipos ACS' : 'Nº serie equipo ACS', acsExSerie, acsEsAcumulador ? 'No aplica' : acsNuSerieEx)}
                    ${cmpRow(acsNuUds > 1 ? 'SCOP<sub>dhw</sub> aplicado (menor) / Rendimiento' : 'SCOP<sub>dhw</sub> / Rendimiento', etaStr, scopAcsStr)}
                `)
                : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`
            }

            ${subLabel('Valores de las variables para el ahorro de energía', '#6E6E66', '12px')}
            ${varTableBox}

            ${subLabel('Donde', '#6E6E66', '12px')}
            ${dondeBox}
            ${footer}
        </div>
    `);

    // Anexo I — Justificación de las variables (puntos 1-5)
    const acsDemandHeavy = tieneAcs && acsMode !== 'xml';
    const anexoIBlock = `
        ${sectionTitle(`Anexo I · Justificación de las variables — apartado 3 de la ficha ${cifoLabel}`, '20px')}

        ${subLabel('1. Factor de ponderación F<sub>P</sub>')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">Este valor es 1, tal y como indica la ficha ${cifoLabel}.</p>

        ${subLabel('2. Justificación de D<sub>CAL</sub>', '#6E6E66', '16px')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">El valor de la demanda de calefacción se ha determinado directamente a partir del Certificado de Eficiencia Energética del Edificio, tal como se establece en la ficha ${cifoLabel}. Dicho certificado ha sido elaborado y firmado por un técnico competente, de acuerdo con lo dispuesto en el RD 390/2021, de 1 de junio.</p>

        ${subLabel('3. Justificación de la superficie S', '#6E6E66', '16px')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">La superficie se ha obtenido directamente del Certificado de Eficiencia Energética adjunto a este expediente CAE.</p>

        ${subLabel('4. Justificación de la demanda de ACS D<sub>ACS</sub>', '#6E6E66', '16px')}
        ${!tieneAcs
            ? `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`
            : acsMode === 'xml'
            ? `<p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;line-height:1.6;">La demanda de ACS ha sido calculada según el archivo .xml del certificado de eficiencia energética cuyo valor es <b style="color:#1A1A1A;">${parseFloat(ceeFinal.demandaACS || 0).toFixed(2).replace('.', ',')} kWh/m²·año</b>, que multiplicado por la superficie habitable (<b style="color:#1A1A1A;">${parseFloat(ceeFinal.superficieHabitable || 0).toFixed(2).replace('.', ',')} m²</b>) da como resultado <b style="color:#1A1A1A;">${dacsStr} kWh/año</b>.</p>`
            : `
            <p style="margin:0 0 10px;font-size:12.5px;color:#4a4a44;">Según el Anejo F del documento de Ahorro de Energía HE, del Código Técnico de la Edificación (año 2022):</p>
            <div style="text-align:center;margin:10px 0;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;">D<sub>ACS</sub> = D<sub>L/D</sub> · N<sub>P</sub> · C<sub>e</sub> · 365 · ΔT</div>
            ${rowsBox(`
                ${kv('D<sub>ACS</sub>', 'Demanda de energía anual para ACS (kWh/año)')}
                ${kv('D<sub>L/D</sub>', 'Ver tabla c · Anejo F Demanda orientativa de ACS para residencial privado')}
                ${kv('N<sub>P</sub>', 'Número de personas consideradas')}
                ${kv('C<sub>e</sub>', 'Calor específico (agua) = 0,001162 kWh/kg·°C')}
                ${kv('ΔT', 'Salto térmico con instalaciones a 60°C de acumulación = 60°C − 14°C = 46°C', true)}
            `)}
            <div style="margin-top:12px;">
                ${rowsBox(`
                    ${kv('Nº de habitaciones', numRooms)}
                    ${kv('Nº de personas', numPeople)}
                    ${kv('Litros persona/día', '28')}
                    ${kv('C<sub>e</sub> · CTE · ΔT', '0,001162 · 365 · 46')}
                    ${kv('D<sub>ACS</sub> (resultado)', `<b style="color:#4d6a12;">${dacsStr} kWh/año</b>`, true)}
                `)}
            </div>
            <p style="margin:12px 0 0;font-size:11px;color:#6E6E66;">La estimación de la demanda diaria de Agua Caliente Sanitaria (ACS) se ha realizado conforme a los criterios y valores orientativos establecidos en el Anejo F del Documento Básico de Ahorro de Energía HE del Código Técnico de la Edificación (CTE DB-HE, versión 2022).</p>
            `}

        ${subLabel('5. Justificación rendimiento de caldera de combustión η<sub>i</sub>', '#6E6E66', '16px')}
        <p style="margin:0;font-size:12.5px;color:#4a4a44;">Se ha utilizado un rendimiento estacional de <b style="color:#1A1A1A;">${etaStr}</b>, al tratarse de una caldera de <b style="color:#1A1A1A;">${calExTipo}</b>, siguiendo las indicaciones del Ministerio para la Transición Ecológica y el Reto Demográfico recogidas en los criterios de verificación "24/11.03: Rendimientos estacionales vs. nominales en fichas IND040, RES060, RES090-099, TER100 y TER170-179".</p>
    `;

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
        const anexoRef = `Anexo ${isHybrid ? 'II' : 'IV'} de la ficha ${cifoLabel}`;
        return scopBox(
            `Justificación del SCOP en ${label} — ${anexoRef}`,
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
        const acsEprelUrl = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_eprel : inst.aerotermia_acs?.url_eprel;
        const acsFtUrl   = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_ficha  : inst.aerotermia_acs?.url_ficha;

        if (metodoAcs === 'conjunto') {
            const etaWh = (scopAcsRaw / 2.5 * 100).toFixed(1).replace('.', ',');
            const fichaEprel = acsEprelUrl
                ? `<a href="${acsEprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                : 'Ficha EPREL';
            return scopBox(
                `Justificación del SCOP en ACS — Anexo IV ficha RES060 (depósito ACS en conjunto con la BdC)`,
                `SCOP<sub>dhw</sub> = CC · η<sub>wh</sub>`,
                `${svRow('CC', 'Coeficiente de conversión', '2,5')}
                 ${svRow('η<sub>wh</sub>', `Eficiencia energética de caldeo de agua (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()} y perfil ACS)`, `${etaWh}%`)}
                 ${scopResult(`Cálculo: SCOP<sub>dhw</sub> = 2,5 · ${etaWh}% &nbsp;→&nbsp; SCOP en ACS`, scopAcsStr)}`
            );
        }

        if (metodoAcs === 'independiente') {
            const fc = FC_TABLE[zoneStr] ?? FC_TABLE['D3'];
            const fcStr  = fc.toFixed(3).replace('.', ',');
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

    const scopJustBlock = `
        ${subLabel('6. Coeficiente de rendimiento estacional de la bomba de calor en calefacción SCOP<sub>bdc</sub>', '#6E6E66', '20px')}
        <div style="border:1px solid #E9E9E1;border-radius:16px;padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Ubicación de la instalación</span><span style="font-weight:700;">Zona climática ${zoneStr} (DB-HE CTE)</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Condiciones en calefacción</span><span style="font-weight:700;">${zoneLabel}</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Tipo de bomba de calor</span><span style="font-weight:700;">Aerotérmica</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Sistema de distribución</span><span style="font-weight:700;">${emiLabel}</span></div>
        </div>
        ${metodoCal === 'eprel'
            ? renderEprelJustification(false)
            : scopCallout(`SCOP en Calefacción = ${scopCalStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`)
        }

        ${subLabel('7. Rendimiento estacional SCOP<sub>dhw</sub>', '#6E6E66', '20px')}
        ${tieneAcs ? renderAcsScopJustification() : scopCallout('SCOP en ACS = no aplica.')}
    `;

    const scopHeavy = metodoCal === 'eprel'
        || (tieneAcs && (metodoAcs === 'conjunto' || metodoAcs === 'independiente'));
    const splitAnexoScop = acsDemandHeavy || scopHeavy;
    if (splitAnexoScop) {
        pages.push(`<div class="doc-page">${pageHeader}${anexoIBlock}${footer}</div>`);
        pages.push(`<div class="doc-page">${pageHeader}${scopJustBlock}${footer}</div>`);
    } else {
        pages.push(`<div class="doc-page">${pageHeader}${anexoIBlock}${scopJustBlock}${footer}</div>`);
    }

    // PÁGINA (solo RES093): Coeficiente de cobertura por bivalencia
    if (isHybrid) {
        const cappedNote = coveragePct >= 95
            ? obsBox(`<p style="margin:0;"><b>Nota:</b> El porcentaje de cobertura calculado (${coveragePctStr}%) es superior al 95%. Conforme al Anexo III de la ficha RES093, el valor máximo aplicable es el 95% (límite de la tabla de bivalencia).</p>`, '10px')
            : '';

        // La cobertura admite dos determinaciones: por POTENCIA DE DISEÑO (demanda
        // anual / horas equivalentes) o por POTENCIA NOMINAL DE LA CALDERA existente.
        // El número de pasos cambia (3 frente a 4), por eso se arma el bloque aparte.
        const esPorCaldera = hybridMethod === HYBRID_METHODS.CALDERA;

        const formulaBox = (html) => `<div style="text-align:center;margin:6px 0;font-family:'Archivo';font-weight:800;font-size:13px;background:#FBF6EE;border-radius:10px;padding:8px;">${html}</div>`;

        const pasosCobertura = esPorCaldera
            ? `
                ${subLabel('Paso 1 — Potencia nominal de la caldera existente (P<sub>caldera</sub>)', '#6E6E66', '16px')}
                <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">La caldera de combustión existente permanece en la instalación como generador auxiliar del sistema híbrido. Su potencia nominal, según la placa de características del equipo, es:</p>
                ${formulaBox(`P<sub>caldera</sub> = <span style="color:#4d6a12;">${pCalderaKwStr} kW</span>`)}

                ${subLabel('Paso 2 — Porcentaje de cobertura de la bomba de calor', '#6E6E66', '16px')}
                <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">El porcentaje de cobertura expresa la fracción de la potencia térmica del generador sustituido que aporta la bomba de calor instalada:</p>
                ${formulaBox(`% cobertura = ${pbdcKwStr} kW / ${pCalderaKwStr} kW = <span style="color:#4d6a12;">${coveragePctStr}%</span>`)}
                ${cappedNote}

                ${subLabel('Paso 3 — Valor de C<sub>b</sub> aplicado', '#6E6E66', '16px')}
                <p style="margin:0 0 8px;font-size:12px;color:#4a4a44;">Aplicando el ${appliedCovStr}% en la tabla del Anexo III de la ficha RES093:</p>`
            : `
                ${subLabel('Paso 1 — Horas equivalentes de calefacción (t<sub>h</sub>)', '#6E6E66', '16px')}
                <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">Conforme a los valores recogidos en el Anexo de las fichas <b>RES220</b> y <b>RES230</b>, incluidas en la <i>Resolución de 3 de julio de 2024</i> de la Dirección General de Planificación y Coordinación Energética (por la que se actualiza el Anexo I de la <i>Orden TED/845/2023, de 18 de julio</i>), las horas equivalentes de calefacción para la zona climática <b>${zoneStr}</b> son:</p>
                <div style="text-align:center;margin:6px 0;font-family:'Archivo';font-weight:800;font-size:14px;background:#FBF6EE;border-radius:10px;padding:8px;">t<sub>h</sub> = ${thZone.toLocaleString('es-ES')} h/año</div>

                ${subLabel('Paso 2 — Potencia de diseño (P<sub>diseño</sub>)', '#6E6E66', '16px')}
                <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">La potencia de diseño se obtiene dividiendo la demanda anual de calefacción entre las horas equivalentes:</p>
                ${formulaBox(`P<sub>diseño</sub> = ${demandaAnualKwhStr} kWh / ${thZone.toLocaleString('es-ES')} h = <span style="color:#4d6a12;">${pDesignKwStr} kW</span>`)}

                ${subLabel('Paso 3 — Porcentaje de cobertura de la bomba de calor', '#6E6E66', '16px')}
                <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">El porcentaje de cobertura expresa la fracción de la potencia de diseño que cubre la bomba de calor:</p>
                ${formulaBox(`% cobertura = ${pbdcKwStr} kW / ${pDesignKwStr} kW = <span style="color:#4d6a12;">${coveragePctStr}%</span>`)}
                ${cappedNote}

                ${subLabel('Paso 4 — Valor de C<sub>b</sub> aplicado', '#6E6E66', '16px')}
                <p style="margin:0 0 8px;font-size:12px;color:#4a4a44;">Aplicando el ${appliedCovStr}% en la tabla del Anexo III de la ficha RES093:</p>`;

        const introCb = esPorCaldera
            ? 'La ficha técnica RES093 establece que el ahorro de energía se pondera mediante el coeficiente de cobertura por bivalencia (C<sub>b</sub>), que refleja la fracción de la demanda de energía térmica anual cubierta por la bomba de calor cuando ésta opera combinada con el generador auxiliar de combustión (caldera) formando un sistema híbrido. En esta actuación dicha fracción se determina por la relación entre la potencia térmica de la bomba de calor instalada y la potencia nominal de la caldera existente, obteniéndose el valor de C<sub>b</sub> de la tabla del Anexo III de la ficha RES093:'
            : 'La ficha técnica RES093 establece que el ahorro de energía se pondera mediante el coeficiente de cobertura por bivalencia (C<sub>b</sub>), que refleja la fracción de la demanda de calefacción cubierta por la bomba de calor en modo de funcionamiento bivalente paralelo. Su valor se determina conforme al Anexo III de la ficha RES093 siguiendo el procedimiento que se indica a continuación:';

        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${subLabel('8. Coeficiente de cobertura por bivalencia C<sub>b</sub>', '#6E6E66', '20px')}
                <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">${introCb}</p>
                ${pasosCobertura}
                <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                    <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                        <tr><td colspan="2" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">Coeficiente de cobertura por bivalencia — valor aplicado</td></tr>
                        <tr><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">${esPorCaldera ? 'Cobertura potencia térmica BdC sobre caldera existente' : `Cobertura potencia térmica BdC — Zona ${zoneStr}`}</td><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">C<sub>b</sub></td></tr>
                        <tr><td style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;padding:10px;">${appliedCovStr}%${coveragePct >= 95 ? ' · valor aplicado' : ''}</td><td style="text-align:center;font-family:'Archivo';font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${cbStr}</td></tr>
                    </tbody></table>
                </div>
                ${footer}
            </div>
        `);
    }

    // SEPARADOR ANEXOS — solo si hay al menos un anexo con driveId.
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
                ${footer}
            </div>
        `);

        if (withAnnexPreview) {
            annexList.forEach(a => {
                const imgs = a.file.previewPages || [];
                imgs.forEach(src => {
                    pages.push(`
                        <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                            <img src="${src}" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                    `);
                });
            });
        }
    }

    // NUMERACIÓN
    const total = pages.length - 1;
    const finalPages = pages.map((p, i) => i === 0 ? p : p.replace(/PAGE_X_OF_Y/g, `Página ${i} | ${total}`));

    return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${buildPdfCss(APP_URL)}</style></head><body>${finalPages.join('')}</body></html>`;
}
