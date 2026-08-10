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
import { buildInstalacionAddress, empresaInstaladora } from '../utils/docGenerators.js';
import { calcCifo } from './calcCifo.js';
import { formatMarcas, formatModelos, formatSeries, countUnidades, tipoEquipoNuevo, tipoEquipoNuevoLabel, esTermoElectrico, datosAcumulador, EQUIPO_NUEVO } from './aerotermiaUnits.js';
import { resolveDacs, ACS_METHOD } from './demandaAcs.js';
import { deriveTer100Vars, esTer100, TER100_NOMBRE_ACTUACION, TER100_FICHA_COMPLETA } from './ter100.js';

// Unidades terminales. Las tres primeras son de AGUA: la temperatura de impulsión
// es la que decide qué SCOP de la ficha se aplica (35/45/55 °C).
// SPLITS y CONDUCTOS son AIRE-AIRE (expedientes RES080, donde la actuación puede
// ser una bomba de calor aire-aire): no hay temperatura de impulsión de agua, la
// ficha da un único SCOP y no se interpola. Por eso `temp: null` + `aire: true`.
export const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
    { value: 'splits',                  label: 'Splits (aire-aire)',              temp: null, aire: true },
    { value: 'conductos',               label: 'Conductos (aire-aire)',           temp: null, aire: true },
];

// Emisores que NO son de agua: el SCOP de la ficha es único (no hay 35/55).
export function esEmisorAire(val) {
    return !!EMITTER_OPTIONS.find(o => o.value === val)?.aire;
}

export function getEmitterTemp(val) {
    if (val === 'suelo_radiante') return 35;
    if (val === 'radiadores_baja_temp') return 45;
    if (val === 'radiadores_convencionales') return 55;
    // Aire-aire: no aplica temperatura de impulsión. Se devuelve 35 para que el
    // lookup del SCOP no rompa (en aire-aire la ficha lleva el mismo SCOP en
    // ambas columnas), pero el texto del certificado usa `emitterScopContext`.
    return 35;
}

// Coletilla que acompaña al η_s en la justificación del SCOP de calefacción:
// en emisores de agua es la temperatura de impulsión; en aire-aire, la unidad terminal.
export function emitterScopContext(val) {
    if (esEmisorAire(val)) {
        const label = EMITTER_OPTIONS.find(o => o.value === val)?.label || 'aire-aire';
        return `, unidad terminal ${label.toLowerCase()}`;
    }
    return `, impulsión ${getEmitterTemp(val)}°C`;
}

export function formatDateSpanish(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

// ─── Fuente del diseño (Instrument Sans), auto-alojada en /public/fonts.
// TODO el CIFO va en la MISMA familia: el documento no mezcla tipografías,
// la jerarquía la marcan el peso, el tamaño y el color.
const FONT_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONT_LATINEXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

function buildFontFaces(appUrl) {
    const fams = [
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
    .doc-page h1, .doc-page h2, .doc-page h3 { margin: 0; }
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
    // Empresa instaladora del certificado: el instalador habilitado que firma si
    // el asignado no lo está (ver `empresaInstaladora`).
    const pres = empresaInstaladora(exp);

    const zoneStr = (op.datos_calculo?.zona || 'D3').toUpperCase();
    const zoneLabel = [
        'A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3'
    ].includes(zoneStr) ? 'Cálido' : (zoneStr === 'E1' ? 'Medio' : 'Cálido');

    const numexpte = exp.numero_expediente || '';
    const facturasList = (doc.facturas || []).map(f => f.numero_factura).filter(Boolean).join(', ') || '—';

    const cifoDatesCert = calcCifo(doc);
    const fechaInicio = formatDateSpanish(cifoDatesCert.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial);
    const fechaFin = formatDateSpanish(cifoDatesCert.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final);

    // Ahorro AE_TOTAL. En TER100 se sustituye más abajo por la suma del desglose
    // (AE_C + AE_ACS + AE_CAP), para que el total del certificado no pueda diferir de
    // sus sumandos aunque el llamante pase un `results` desfasado.
    let savingsKwhDoc = results?.savingsKwh || 0;

    // CEE base: final si es válido; si no, inicial (coherente con calcResults).
    const ceeFinalValido = cee.cee_final && parseFloat(cee.cee_final.demandaCalefaccion) > 0;
    const ceeFinal = ceeFinalValido ? cee.cee_final : (cee.cee_inicial || cee.cee_final || {});
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');
    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    // Demanda de ACS: fuente única en logic/demandaAcs.js (xml del CEE · CTE · manual).
    const acsResolved = resolveDacs(cee, ceeFinal);
    const acsMode = acsResolved.mode;
    const numRooms = parseInt(cee.num_rooms) || 4;
    const numPeople = acsResolved.personas;
    const dacsValue = acsResolved.value;
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

    // El ACS solo COMPUTA en la ficha si se actúa sobre él CON UNA BOMBA DE CALOR.
    // Un termo eléctrico (efecto Joule, rendimiento 1) no es actuación elegible:
    // queda fuera de la fórmula (D_ACS no suma) y se declara aparte, como
    // información de la instalación. Ver logic/aerotermiaUnits.js.
    const acsAero = inst.misma_aerotermia_acs ? inst.aerotermia_cal : inst.aerotermia_acs;
    const acsTermoDeclarado = esTermoElectrico(acsAero) || esTermoElectrico(inst.aerotermia_acs);
    const tieneAcs = inst.cambio_acs !== false && !acsTermoDeclarado;
    const acsExMarca = inst.caldera_antigua_acs?.marca || calExMarca;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || inst.caldera_antigua_acs?.n_serie || '—';

    const acsEffId = inst.caldera_antigua_acs?.rendimiento_id || boilerEffId;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === acsEffId);
    const acsExTipo = acsEffEntry?.label || calExTipo;
    const acsExComb = acsExTipo.split(',')[0] || '—';

    const acsEsAcumulador = tieneAcs && tipoEquipoNuevo(acsAero) === EQUIPO_NUEVO.ACUMULADOR;
    // El acumulador no es un equipo del catálogo: marca, modelo y nº de serie son
    // los del DEPÓSITO y se escriben a mano. Se imprimen si están; si no, el
    // certificado no los inventa (nº de serie → "No aplica", que es la casilla
    // oficial cuando el equipo no tiene serie propia). Ver aerotermiaUnits.js.
    const acum = acsEsAcumulador ? datosAcumulador(acsAero) : null;

    const acsNuMarca = acum ? (acum.marca || '—')
        : tieneAcs ? (inst.misma_aerotermia_acs ? calNuMarca : formatMarcas(inst.aerotermia_acs)) : '—';
    const acsNuMod = acum ? (acum.modelo || '—')
        : tieneAcs ? (inst.misma_aerotermia_acs ? calNuMod : formatModelos(inst.aerotermia_acs)) : '—';
    const acsNuSerieEx = acum ? (acum.serie || 'No aplica')
        : tieneAcs ? (inst.misma_aerotermia_acs ? calNuSerieEx : formatSeries(inst.aerotermia_acs)) : '—';
    const acsNuUds = acum ? 1
        : tieneAcs ? (inst.misma_aerotermia_acs ? calNuUds : countUnidades(inst.aerotermia_acs)) : 0;
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    // Nunca es true a la vez que `tieneAcs` (un termo saca el ACS de la fórmula);
    // se conserva por claridad en las plantillas.
    const acsEsTermo = tieneAcs && esTermoElectrico(acsAero);
    const acsNuTipo = tieneAcs ? tipoEquipoNuevoLabel(acsAero) : '—';

    // ACS FUERA DEL ALCANCE CAE: el ACS no computa en la fórmula, pero la
    // producción de agua caliente sí cambia — un termo eléctrico. Se refleja como
    // información de la instalación, nunca como ahorro.
    const acsTermoFuera = acsTermoDeclarado ? (esTermoElectrico(inst.aerotermia_acs) ? inst.aerotermia_acs : acsAero) : null;
    const acsFueraMarca = acsTermoFuera ? (acsTermoFuera.marca || '—') : '—';
    const acsFueraMod = acsTermoFuera ? (acsTermoFuera.modelo || '—') : '—';
    const acsFueraSerie = acsTermoFuera ? (acsTermoFuera.numero_serie || '—') : '—';

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

    // ─── TER100 (sector terciario) ────────────────────────────────────────────
    // La misma actuación que RES060 pero con el ahorro desglosado en tres sumandos
    // (calefacción · ACS · calentamiento de piscina) y con la calefacción como
    // alcance OPCIONAL. El desglose se toma de logic/ter100.js para que el
    // certificado y el panel económico impriman exactamente los mismos números.
    const isTer100 = esTer100(exp);
    // El alcance sobre calefacción solo es una pregunta en TER100; en RES060/RES093
    // la actuación ES el cambio de la caldera de calefacción.
    const tieneCalefaccion = !isTer100 || inst.cambio_calefaccion !== false;

    const piscinaObj = inst.piscina || {};
    const tienePiscina = isTer100 && piscinaObj.activa === true;
    const dcapRaw = tienePiscina ? (parseFloat(piscinaObj.demanda_kwh) || 0) : 0;
    const dcapStr = tienePiscina
        ? dcapRaw.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : 'no aplica';
    const scopPoolRaw = tienePiscina ? (parseFloat(piscinaObj.scop) || 0) : 0;
    const scopPoolStr = tienePiscina ? (scopPoolRaw ? scopPoolRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';
    const pisEquipo = piscinaObj.equipo || {};
    const pisNuMarca = pisEquipo.marca || '—';
    const pisNuMod = pisEquipo.modelo || '—';
    const pisNuSerie = pisEquipo.numero_serie || '—';

    // Desglose AE_C / AE_ACS / AE_CAP (solo TER100). El AE_TOTAL se recalcula aquí a
    // partir del MISMO desglose en vez de usar el `results.savingsKwh` que llega por
    // parámetro: si el llamante pasara un ahorro desfasado, el certificado saldría
    // con un total que no es la suma de sus tres sumandos — justo lo que el
    // verificador comprueba primero.
    let aeCalStr = '—', aeAcsStr = '—', aeCapStr = '—', ter100SavingsKwh = null;
    if (isTer100) {
        const ter = deriveTer100Vars(exp);
        const fmt = (v) => Math.round(v || 0).toLocaleString('es-ES');
        aeCalStr = tieneCalefaccion ? fmt(ter.savings.aeCal) : 'no aplica';
        aeAcsStr = tieneAcs ? fmt(ter.savings.aeAcs) : 'no aplica';
        aeCapStr = tienePiscina ? fmt(ter.savings.aeCap) : 'no aplica';
        ter100SavingsKwh = ter.savingsKwh;
        savingsKwhDoc = ter.savingsKwh;
    }

    const aeKwh = Math.round(savingsKwhDoc).toLocaleString('es-ES');
    const aeKwhVal = savingsKwhDoc ? Math.round(savingsKwhDoc).toLocaleString('es-ES') : '—';
    const beneficioStr = Math.round(savingsKwhDoc * (results?.price_kwh || 0.10)).toLocaleString('es-ES');

    const isHybrid = numexpte.includes('RES093');
    let cbStr = '—', pDesignKwStr = '—', coveragePct = 0, coveragePctStr = '—';
    let thZone = 0, pbdcKw = 0, pbdcKwStr = '—', demandaAnualKwhStr = '—', appliedCovStr = '—';
    // Método de cálculo de la cobertura: 'demanda' (P_diseño) o 'caldera' (P nominal caldera).
    let hybridMethod = HYBRID_METHODS.DEMANDA, pCalderaKwStr = '—', refPowerKwStr = '—';
    // Horas anuales equivalentes en modo activo (H_HE) y comprobación de coherencia
    // de la carga de diseño en potencia específica (W/m²).
    let pDesignWStr = '—', pEspecificaStr = '—', pEspecificaNum = 0;
    // Temporada de referencia del SCOP aplicado: manda sobre las horas equivalentes.
    let climateSeason = 'medio';
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
        thZone = hybridData?.hHE || 0;
        climateSeason = hybridData?.climateSeason || climateSeason;
        pbdcKwStr = pbdcKw.toFixed(2).replace('.', ',');
        demandaAnualKwhStr = demandaAnual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        appliedCovStr = (coveragePct >= 95 ? 95 : coveragePct).toFixed(0);
        pDesignWStr = Math.round(pDesignRaw * 1000).toLocaleString('es-ES');
        pEspecificaNum = sRaw > 0 ? (pDesignRaw * 1000) / sRaw : 0;
        pEspecificaStr = pEspecificaNum > 0 ? pEspecificaNum.toFixed(1).replace('.', ',') : '—';
    }

    return {
        // objetos crudos usados directamente en el HTML
        inst, cli, ceeFinal,
        // identificación / cabecera
        isHybrid, isTer100, numexpte, zoneStr, zoneLabel,
        // variables de la fórmula
        dcal, dcalRaw, sStr, sRaw, dacsStr, acsMode, numRooms, numPeople,
        etaStr, scopCalStr, scopCalRaw, scopAcsStr, scopAcsRaw,
        aeKwh, aeKwhVal, beneficioStr, savingsKwhDoc, ter100SavingsKwh,
        // localización / propietario
        locCA, locFullDir, locRefCat, locUtmX, locUtmY, facturasList,
        cliNombre, cliDir, cliNif, cliTlf,
        fechaInicio, fechaFin,
        // calefacción
        tieneCalefaccion,
        calExTipo, calExMarca, calExMod, calExComb, calExSerie,
        calNuMarca, calNuMod, calNuSerieEx, calNuUds,
        // piscina (TER100)
        tienePiscina, dcapRaw, dcapStr, scopPoolRaw, scopPoolStr,
        pisNuMarca, pisNuMod, pisNuSerie,
        // desglose del ahorro (TER100)
        aeCalStr, aeAcsStr, aeCapStr,
        // ACS
        tieneAcs, acsExTipo, acsExMarca, acsExMod, acsExComb, acsExSerie,
        acsEsAcumulador, acsEsTermo, acsNuTipo, acsNuMarca, acsNuMod, acsNuSerieEx, acsNuUds,
        acsTermoFuera, acsFueraMarca, acsFueraMod, acsFueraSerie,
        // método SCOP / emisor
        metodoCal, metodoAcs, emiLabel,
        // empresa instaladora
        empNombre, empCif, empDir, empCp, empMun, empProv, empCargo, empEmail, empTlf, empResponsable,
        // hibridación (RES093)
        cbStr, pDesignKwStr, coveragePct, coveragePctStr, thZone, pbdcKw, pbdcKwStr, demandaAnualKwhStr, appliedCovStr,
        hybridMethod, pCalderaKwStr, refPowerKwStr, pDesignWStr, pEspecificaStr, pEspecificaNum, climateSeason,
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
        isHybrid, isTer100, numexpte, zoneStr, zoneLabel,
        dcal, sStr, dacsStr, acsMode, numRooms, numPeople,
        etaStr, scopCalStr, scopCalRaw, scopAcsStr, scopAcsRaw,
        aeKwh, aeKwhVal,
        locCA, locFullDir, locRefCat, locUtmX, locUtmY, facturasList,
        cliNombre, cliDir, cliNif, cliTlf,
        fechaInicio, fechaFin,
        tieneCalefaccion,
        calExTipo, calExMarca, calExMod, calExComb, calExSerie,
        calNuMarca, calNuMod, calNuSerieEx, calNuUds,
        tienePiscina, dcapStr, scopPoolStr, pisNuMarca, pisNuMod, pisNuSerie,
        aeCalStr, aeAcsStr, aeCapStr,
        tieneAcs, acsExTipo, acsExMarca, acsExMod, acsExComb, acsExSerie,
        acsEsAcumulador, acsEsTermo, acsNuTipo, acsNuMarca, acsNuMod, acsNuSerieEx, acsNuUds,
        acsTermoFuera, acsFueraMarca, acsFueraMod, acsFueraSerie,
        metodoCal, metodoAcs, emiLabel,
        empNombre, empCif, empDir, empCp, empMun, empProv, empCargo, empEmail, empTlf, empResponsable,
        cbStr, pDesignKwStr, coveragePct, coveragePctStr, thZone, pbdcKwStr, demandaAnualKwhStr, appliedCovStr,
        hybridMethod, pCalderaKwStr, refPowerKwStr, pDesignWStr, pEspecificaStr, pEspecificaNum, climateSeason,
    } = data;

    const pages = [];
    const cifoLabel = isHybrid ? 'RES093' : isTer100 ? 'TER100' : 'RES060';
    const actuacionNombre = isHybrid
        ? 'Hibridación de combustión con bomba de calor de accionamiento eléctrico'
        : isTer100
        ? TER100_NOMBRE_ACTUACION
        : 'Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)';
    const fichaNombreCompleto = isHybrid
        ? 'RES093: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3'
        : isTer100
        ? TER100_FICHA_COMPLETA
        : 'RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas';

    // Cabecera y pie van en la MISMA tipografía que el cuerpo del documento
    // ('Instrument Sans', heredada de .doc-page): no llevan font-family propia.
    const pageHeader = `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1A1A1A;border-radius:14px;">
            <span style="font-weight:700;font-size:10.5px;letter-spacing:.6px;color:#93C01F;">CERTIFICADO CIFO · ${cifoLabel}</span>
            <span style="font-weight:600;font-size:11px;color:#93C01F;">Expte: ${numexpte}</span>
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
        <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">${col1}</th>
        <th style="text-align:left;padding:8px 16px;background:#33332F;color:#C9C9C4;font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${ex}</th>
        <th style="text-align:left;padding:8px 16px;background:#93C01F;color:#1A1A1A;font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${nu}</th>
    </tr></thead>`;
    const cmpRow = (label, ex, nu) => `<tr><td style="padding:5px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">${label}</td><td style="padding:5px 16px;color:#7a7a72;">${ex}</td><td style="padding:5px 16px;background:#F3F8E6;font-weight:700;">${nu}</td></tr>`;
    const cmpBox = (headHtml, bodyRows) => `<div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;"><table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">${headHtml}<tbody>${bodyRows}</tbody></table></div>`;
    const scopBox = (headTitle, formula, rowsHtml) => `
        <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;margin-top:12px;">
            <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                <tr><td colspan="3" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">${headTitle}</td></tr>
                <tr><td colspan="3" style="text-align:center;font-weight:800;font-size:15px;background:#FBF6EE;padding:8px;color:#1A1A1A;">${formula}</td></tr>
                <tr>
                    <td style="width:15%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Variable</td>
                    <td style="padding:6px 12px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Descripción</td>
                    <td style="width:14%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Valor</td>
                </tr>
                ${rowsHtml}
            </tbody></table>
        </div>`;
    const svRow = (v, desc, val) => `<tr><td style="text-align:center;font-weight:700;padding:6px 10px;">${v}</td><td style="padding:6px 12px;color:#4a4a44;">${desc}</td><td style="text-align:center;padding:6px 10px;font-weight:700;">${val}</td></tr>`;
    const scopResult = (calcText, scopVal) => `<tr><td colspan="2" style="padding:8px 12px;font-weight:700;color:#1A1A1A;">${calcText}</td><td style="text-align:center;font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${scopVal}</td></tr>`;
    const scopCallout = (html) => `<div style="margin-top:12px;padding:14px 18px;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:14px;font-size:12.5px;font-weight:700;color:#1A1A1A;line-height:1.5;">${html}</div>`;

    // Si la calefacción está fuera del alcance (solo posible en TER100), D_CAL y S se
    // imprimen como "no aplica": son datos reales del edificio, pero dejarlos con su
    // valor invitaría a multiplicarlos y a obtener un AE_C que no forma parte de la
    // actuación. Mismo criterio que la Ficha TER100.
    const dcalCell = tieneCalefaccion ? dcal : 'no aplica';
    const sCell = tieneCalefaccion ? sStr : 'no aplica';

    const varCols = [
        { th: 'F<sub>P</sub>', td: '1' },
        { th: 'D<sub>CAL</sub>', td: dcalCell },
        { th: 'S', td: sCell },
        { th: 'D<sub>ACS</sub>', td: dacsStr },
        // La demanda de piscina solo se lista si la actuación la incluye (TER100).
        ...(tienePiscina ? [{ th: 'D<sub>CAP</sub>', td: dcapStr }] : []),
        { th: 'η<sub>i</sub>', td: etaStr },
        { th: 'SCOP<sub>bdc</sub>', td: scopCalStr },
        { th: 'SCOP<sub>dhw</sub>', td: scopAcsStr },
        ...(tienePiscina ? [{ th: 'SCOP<sub>pwh</sub>', td: scopPoolStr }] : []),
        ...(isHybrid ? [{ th: 'C<sub>b</sub>', td: cbStr, hi: true }] : []),
        { th: 'AE<sub>TOTAL</sub>', td: aeKwhVal, hi: true },
        { th: 'D<sub>i</sub>', td: '15' },
    ];

    // TER100 desglosa el ahorro por servicio (apartado 4 de la ficha): AE_TOTAL es la
    // suma de los sumandos que apliquen, y el verificador espera ver los tres.
    const desgloseTer100Box = !isTer100 ? '' : `
        ${subLabel('Desglose del ahorro por servicio · apartado 4 de la ficha TER100', '#6E6E66', '12px')}
        <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>
                    ${['AE<sub>C</sub><br><span style="font-weight:500;font-size:8.5px;">Calefacción</span>',
                       'AE<sub>ACS</sub><br><span style="font-weight:500;font-size:8.5px;">Agua caliente sanitaria</span>',
                       'AE<sub>CAP</sub><br><span style="font-weight:500;font-size:8.5px;">Calentamiento de piscina</span>',
                       'AE<sub>TOTAL</sub><br><span style="font-weight:500;font-size:8.5px;">kWh/año</span>']
                        .map(t => `<th style="padding:7px 4px;background:#1A1A1A;color:#fff;font-weight:700;font-size:9.5px;text-align:center;line-height:1.35;">${t}</th>`).join('')}
                </tr></thead>
                <tbody><tr>
                    ${[[aeCalStr, false], [aeAcsStr, false], [aeCapStr, false], [aeKwhVal, true]]
                        .map(([v, hi]) => `<td style="padding:9px 4px;text-align:center;font-weight:${hi ? 800 : 600};font-size:${hi ? '13px' : '12px'};background:${hi ? '#F3F8E6' : '#FAFAF6'};color:${hi ? '#4d6a12' : '#1A1A1A'};">${v}</td>`).join('')}
                </tr></tbody>
            </table>
        </div>`;
    const varTableBox = `
        <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
            <table style="width:100%;border-collapse:collapse;">
                <thead><tr>${varCols.map(c => `<th style="padding:8px 4px;background:#1A1A1A;color:#fff;font-weight:700;font-size:9.5px;text-align:center;">${c.th}</th>`).join('')}</tr></thead>
                <tbody><tr>${varCols.map(c => `<td style="padding:8px 4px;text-align:center;font-weight:${c.hi ? 800 : 600};font-size:${c.hi ? '12px' : '11px'};background:${c.hi ? '#F3F8E6' : '#FAFAF6'};color:${c.hi ? '#4d6a12' : '#1A1A1A'};">${c.td}</td>`).join('')}</tr></tbody>
            </table>
        </div>`;

    const donde = (() => {
        const items = [
            { sym: 'F<sub>P</sub>', desc: 'Factor de ponderación', val: '1' },
            { sym: 'D<sub>CAL</sub>', desc: isTer100 ? 'Demanda de energía en calefacción del edificio' : 'Demanda de energía en calefacción del edificio/vivienda', val: tieneCalefaccion ? `${dcal} kWh/m²·año` : 'no aplica' },
            { sym: 'S', desc: isTer100 ? 'Superficie útil habitable del edificio' : 'Superficie útil habitable del edificio o vivienda', val: tieneCalefaccion ? `${sStr} m²` : 'no aplica' },
            { sym: 'D<sub>ACS</sub>', desc: 'Demanda de energía en agua caliente sanitaria', val: `${dacsStr} kWh/año` },
            ...(tienePiscina ? [{ sym: 'D<sub>CAP</sub>', desc: 'Demanda anual de energía térmica para el calentamiento de agua de piscina', val: `${dcapStr} kWh/año` }] : []),
            { sym: 'η<sub>i</sub>', desc: 'Rendimiento de caldera de combustión(PCS)', val: etaStr },
            { sym: 'SCOP<sub>bdc</sub>', desc: 'Rendimiento estacional bomba calor calefacción', val: scopCalStr },
            { sym: 'SCOP<sub>dhw</sub>', desc: acsEsTermo ? 'Rendimiento del equipo de ACS (efecto Joule)' : 'Rendimiento estacional bomba calor ACS', val: scopAcsStr },
            ...(tienePiscina ? [{ sym: 'SCOP<sub>pwh</sub>', desc: 'Rendimiento estacional de la bomba de calor en calentamiento de piscina', val: scopPoolStr }] : []),
            ...(isHybrid ? [{ sym: 'C<sub>b</sub>', desc: 'Coeficiente de cobertura por bivalencia en paralelo', val: cbStr }] : []),
            { sym: 'D<sub>i</sub>', desc: 'Vida útil de la actuación de eficiencia energética', val: '15 años' },
        ];
        // La numeración se calcula, no se escribe: con D_CAP y SCOP_pwh entrando y
        // saliendo según el alcance, los índices fijos se descuadraban.
        return items.map((it, i) => ({ ...it, n: i + 1 }));
    })();
    const dondeBox = `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;">${donde.map((d, i) => `
        <div style="display:flex;align-items:center;gap:14px;padding:5px 16px;${i === donde.length - 1 ? '' : 'border-bottom:1px solid #ECECE4;'}">
            <span style="flex:none;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;">${d.n}</span>
            <span style="flex:none;width:56px;font-weight:700;font-size:12px;color:#1A1A1A;">${d.sym}</span>
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
                    <span style="font-weight:700;font-size:12px;letter-spacing:4px;color:#fff;">CERTIFICADO CIFO · ${cifoLabel}</span>
                </div>
                <h1 style="font-weight:900;font-size:62px;line-height:.98;letter-spacing:-1.5px;color:#fff;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,.5);max-width:14ch;">Certificado de <span style="color:#F18A00;">instalación</span></h1>
                <p style="font-weight:600;font-size:18px;color:#EDEDE8;margin:20px 0 0;max-width:30ch;text-shadow:0 2px 14px rgba(0,0,0,.6);">${actuacionNombre}</p>
                <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">
                    <span style="font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:#fff;padding:6px 16px;border-radius:10px;">Expte: ${numexpte}</span>
                    <span style="font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:linear-gradient(90deg,#F5A21E,#A9C63A);padding:6px 16px;border-radius:10px;">${cifoLabel}</span>
                </div>
            </div>

            <div style="position:absolute;bottom:0;left:0;right:0;z-index:3;">
                <div style="padding:0 20mm 22px;">
                    <div style="display:inline-flex;align-items:center;gap:20px;background:rgba(12,12,11,.78);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px 26px;">
                        <div>
                            <div style="font-weight:700;font-size:11px;letter-spacing:2.5px;color:#93C01F;text-transform:uppercase;">Ahorro anual certificado</div>
                            <div style="font-weight:900;font-size:36px;line-height:1;color:#fff;margin-top:4px;">${aeKwh} <span style="font-size:16px;font-weight:700;color:#F18A00;">kWh/año</span></div>
                        </div>
                        <div style="width:1px;height:44px;background:rgba(255,255,255,.2);"></div>
                        <div style="font-weight:800;font-size:24px;color:#fff;">${aeKwh} <span style="font-size:13px;font-weight:700;color:#B9B9B4;">CAEs</span></div>
                    </div>
                </div>
                <div style="background:#0C0C0B;padding:16px 20mm;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:3px solid;border-image:linear-gradient(90deg,#F18A00,#93C01F) 1;">
                    <div style="font-weight:800;font-size:16px;color:#fff;">${empNombre} <span style="color:#93C01F;font-weight:600;font-size:13px;">· Empresa instaladora</span></div>
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
                <div style="font-weight:800;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">Espacio reservado para firma electrónica</div>
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
            ${tieneCalefaccion
                ? cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de caldera', calExTipo, calNuUds > 1 ? 'Bombas de calor en cascada' : 'Bomba de calor')}
                    ${cmpRow('Marca', calExMarca, calNuMarca)}
                    ${cmpRow('Modelo', calExMod, calNuMod)}
                    ${calNuUds > 1 ? cmpRow('Nº de equipos instalados', '—', String(calNuUds)) : ''}
                    ${cmpRow('Fuente de energía', calExComb, 'Electricidad')}
                    ${cmpRow(calNuUds > 1 ? 'Nº serie unidades exteriores' : 'Nº serie unidad exterior', calExSerie, calNuSerieEx)}
                    ${cmpRow(calNuUds > 1 ? 'SCOP<sub>bdc</sub> aplicado (menor) / Rendimiento' : 'SCOP<sub>bdc</sub> / Rendimiento', etaStr, scopCalStr)}
                `)
                // TER100: la sustitución puede alcanzar solo el ACS y/o la piscina. La
                // caldera existente se declara igual (de ella sale η_i), pero AE_C = 0.
                : `${cmpBox(cmpHead('Comparativa', 'Existente', 'Sin actuación'), `
                    ${cmpRow('Tipo de caldera', calExTipo, 'Se mantiene')}
                    ${cmpRow('Marca', calExMarca, 'Se mantiene')}
                    ${cmpRow('Modelo', calExMod, 'Se mantiene')}
                    ${cmpRow('Fuente de energía', calExComb, calExComb)}
                    ${cmpRow('Rendimiento η<sub>i</sub>', etaStr, etaStr)}
                `)}
                <div style="margin-top:8px;border:1px solid #E9E9E1;border-radius:14px;padding:12px 16px;font-size:11.5px;color:#6E6E66;line-height:1.5;">
                    <b style="color:#1A1A1A;">La actuación no alcanza la calefacción.</b> El servicio de calefacción se mantiene con el generador existente: <b style="color:#1A1A1A;">AE<sub>C</sub> no computa en el cálculo del ahorro</b> y la demanda de calefacción no se incluye en la fórmula. El rendimiento η<sub>i</sub> de la caldera existente sí se declara porque es el que aplica a los servicios sustituidos.
                </div>`
            }

            ${sectionTitle('Datos de la instalación de agua caliente sanitaria (ACS)', '14px')}
            ${tieneAcs
                ? cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de equipo', acsExTipo, acsNuTipo)}
                    ${cmpRow('Marca', acsExMarca, acsNuMarca)}
                    ${cmpRow('Modelo', acsExMod, acsNuMod)}
                    ${acsNuUds > 1 && !acsEsAcumulador && !acsEsTermo ? cmpRow('Nº de equipos instalados', '—', String(acsNuUds)) : ''}
                    ${cmpRow('Fuente de energía', acsExComb, 'Electricidad')}
                    ${cmpRow(acsNuUds > 1 ? 'Nº serie equipos ACS' : 'Nº serie equipo ACS', acsExSerie, acsNuSerieEx)}
                    ${cmpRow(acsNuUds > 1 ? 'SCOP<sub>dhw</sub> aplicado (menor) / Rendimiento' : 'SCOP<sub>dhw</sub> / Rendimiento', etaStr, scopAcsStr)}
                `)
                : acsTermoFuera
                // ACS FUERA DEL ALCANCE CAE: no computa en la fórmula (D_ACS = 0),
                // pero la producción de ACS cambia a un equipo de efecto Joule.
                // Se declara como información de la instalación, con la advertencia.
                ? `${cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de equipo', acsExTipo, 'Termo eléctrico (efecto Joule)')}
                    ${cmpRow('Marca', acsExMarca, acsFueraMarca)}
                    ${cmpRow('Modelo', acsExMod, acsFueraMod)}
                    ${cmpRow('Fuente de energía', acsExComb, 'Electricidad')}
                    ${cmpRow('Nº serie equipo ACS', acsExSerie, acsFueraSerie)}
                    ${cmpRow('Rendimiento', etaStr, '1,00')}
                `)}
                <div style="margin-top:8px;border:1px solid #E9E9E1;border-radius:14px;padding:12px 16px;font-size:11.5px;color:#6E6E66;line-height:1.5;">
                    <b style="color:#1A1A1A;">El ACS queda fuera del alcance de la actuación.</b> La producción de agua caliente sanitaria se resuelve con un equipo de efecto Joule (rendimiento = 1), que no es una bomba de calor: <b style="color:#1A1A1A;">no computa en el cálculo del ahorro de energía</b> y la demanda de ACS (D<sub>ACS</sub>) no se incluye en la fórmula. Se declara únicamente como información de la instalación resultante.
                </div>`
                : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`
            }

            ${tienePiscina ? `
            ${sectionTitle('Datos de la instalación de calentamiento de agua de piscina', '14px')}
            ${cmpBox(cmpHead(), `
                ${cmpRow('Tipo de equipo', calExTipo, 'Bomba de calor para calentamiento de piscina')}
                ${cmpRow('Marca', calExMarca, pisNuMarca)}
                ${cmpRow('Modelo', calExMod, pisNuMod)}
                ${cmpRow('Fuente de energía', calExComb, 'Electricidad')}
                ${cmpRow('Nº serie equipo de piscina', calExSerie, pisNuSerie)}
                ${cmpRow('SCOP<sub>pwh</sub> / Rendimiento', etaStr, scopPoolStr)}
            `)}` : ''}

            ${subLabel('Valores de las variables para el ahorro de energía', '#6E6E66', '12px')}
            ${varTableBox}
            ${desgloseTer100Box}

            ${subLabel('Donde', '#6E6E66', '12px')}
            ${dondeBox}
            ${footer}
        </div>
    `);

    // Anexo I — Justificación de las variables (puntos 1-5)
    // La justificación de D_ACS por el CTE lleva dos tablas: con ella el Anexo I no
    // cabe en la misma página que la justificación de los SCOP. El modo MANUAL es un
    // párrafo, así que no obliga a partir.
    const acsDemandHeavy = tieneAcs && acsMode === ACS_METHOD.CTE;
    const anexoIBlock = `
        ${sectionTitle(`Anexo I · Justificación de las variables — apartado 3 de la ficha ${cifoLabel}`, '20px')}

        ${subLabel('1. Factor de ponderación F<sub>P</sub>')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">Este valor es 1, tal y como indica la ficha ${cifoLabel}.</p>

        ${subLabel('2. Justificación de D<sub>CAL</sub>', '#6E6E66', '16px')}
        ${tieneCalefaccion
            ? `<p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">El valor de la demanda de calefacción se ha determinado directamente a partir del Certificado de Eficiencia Energética del Edificio, tal como se establece en la ficha ${cifoLabel}. Dicho certificado ha sido elaborado y firmado por un técnico competente, de acuerdo con lo dispuesto en el RD 390/2021, de 1 de junio.</p>`
            : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre la calefacción · No aplica<div style="margin-top:6px;font-weight:400;font-size:11.5px;line-height:1.5;">El servicio de calefacción se mantiene con el generador existente: AE<sub>C</sub> = 0 y la demanda de calefacción no se incluye en la fórmula del ahorro.</div></div>`}

        ${subLabel('3. Justificación de la superficie S', '#6E6E66', '16px')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">La superficie se ha obtenido directamente del Certificado de Eficiencia Energética adjunto a este expediente CAE.</p>

        ${subLabel('4. Justificación de la demanda de ACS D<sub>ACS</sub>', '#6E6E66', '16px')}
        ${!tieneAcs
            ? `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica${acsTermoFuera ? `<div style="margin-top:6px;font-weight:400;font-size:11.5px;line-height:1.5;">El ACS pasa a producirse con un termo eléctrico (efecto Joule, rendimiento = 1), fuera del alcance de la actuación: D<sub>ACS</sub> = 0 en la fórmula del ahorro.</div>` : ''}</div>`
            : acsMode === ACS_METHOD.MANUAL
            // Sector terciario: la demanda de ACS de un hotel, una residencia o un
            // gimnasio va por plaza/servicio (Anexo V de la ficha) o la fija el
            // proyecto, así que se aporta como dato del expediente, no por fórmula.
            ? `<p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;line-height:1.6;">La demanda anual de agua caliente sanitaria del edificio es de <b style="color:#1A1A1A;">${dacsStr} kWh/año</b>, determinada conforme al Anexo V de la ficha ${cifoLabel} (demanda anual de ACS) a partir del uso y de la ocupación reales del edificio recogidos en el proyecto de la instalación térmica, que se aporta como documentación justificativa del expediente CAE.</p>`
            : acsMode === ACS_METHOD.XML
            ? `<p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;line-height:1.6;">La demanda de ACS ha sido calculada según el archivo .xml del certificado de eficiencia energética cuyo valor es <b style="color:#1A1A1A;">${parseFloat(ceeFinal.demandaACS || 0).toFixed(2).replace('.', ',')} kWh/m²·año</b>, que multiplicado por la superficie habitable (<b style="color:#1A1A1A;">${parseFloat(ceeFinal.superficieHabitable || 0).toFixed(2).replace('.', ',')} m²</b>) da como resultado <b style="color:#1A1A1A;">${dacsStr} kWh/año</b>.</p>`
            : `
            <p style="margin:0 0 10px;font-size:12.5px;color:#4a4a44;">Según el Anejo F del documento de Ahorro de Energía HE, del Código Técnico de la Edificación (año 2022):</p>
            <div style="text-align:center;margin:10px 0;font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;">D<sub>ACS</sub> = D<sub>L/D</sub> · N<sub>P</sub> · C<sub>e</sub> · 365 · ΔT</div>
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

        ${tienePiscina ? `
        ${subLabel('5. Justificación de la demanda de piscina D<sub>CAP</sub>', '#6E6E66', '16px')}
        <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;line-height:1.6;">La demanda anual de energía térmica para el calentamiento del agua de la piscina es de <b style="color:#1A1A1A;">${dcapStr} kWh/año</b>, obtenida de los datos de la instalación existente, conforme admite la ficha ${cifoLabel}, o en su defecto según la metodología de cálculo del Anexo III del <i>Pliego de Condiciones Técnicas de Instalaciones de Baja Temperatura</i> del IDAE.</p>
        ` : ''}

        ${subLabel(`${tienePiscina ? 6 : 5}. Justificación rendimiento de caldera de combustión η<sub>i</sub>`, '#6E6E66', '16px')}
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
        // El anexo donde la ficha define el cálculo del SCOP cambia con la ficha:
        // RES060 → Anexo IV · RES093 → Anexo II · TER100 → Anexos II y III.
        const anexoRef = isTer100
            ? `Anexos II y III de la ficha ${cifoLabel}`
            : `Anexo ${isHybrid ? 'II' : 'IV'} de la ficha ${cifoLabel}`;
        return scopBox(
            `Justificación del SCOP en ${label} — ${anexoRef}`,
            `SCOP = CC · (${etaVar} + F(1) + F(2))`,
            `${svRow('CC', 'Coeficiente de conversión', '2,5')}
             ${svRow(etaVar, `Eficiencia energética estacional de ${label.toLowerCase()} (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()}${isAcs ? ' y perfil ACS' : emitterScopContext(inst.tipo_emisor)})`, `${etaValue}%`)}
             ${svRow('F(1)', 'Factor de corrección por tecnología (bombas de calor aerotérmicas)', '3%')}
             ${svRow('F(2)', 'Factor de corrección por clima (bombas de calor aerotérmicas)', '0%')}
             ${scopResult(`Cálculo: SCOP = 2,5 · (${etaValue}% + 3% + 0%) = ${totalPercentage}% &nbsp;→&nbsp; SCOP en ${label}`, scopStr)}`
        );
    };

    const renderAcsScopJustification = () => {
        // Termo eléctrico: efecto Joule → rendimiento 1 por definición. No hay SCOP
        // que justificar ni ficha técnica que aportar.
        if (acsEsTermo) {
            return scopCallout('Rendimiento del equipo de ACS = 1,00. El agua caliente sanitaria se produce por efecto Joule (resistencia eléctrica), cuyo rendimiento es la unidad por definición: no procede el cálculo de un SCOP estacional.');
        }
        const FC_TABLE = { A3: 1.246, A4: 1.251, B3: 1.223, B4: 1.228, C1: 1.154, C2: 1.165, C3: 1.175, C4: 1.181, D1: 1.093, D2: 1.103, D3: 1.113, E1: 1.056 };
        const acsEprelUrl = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_eprel : inst.aerotermia_acs?.url_eprel;
        const acsFtUrl   = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_ficha  : inst.aerotermia_acs?.url_ficha;

        if (metodoAcs === 'conjunto') {
            const etaWh = (scopAcsRaw / 2.5 * 100).toFixed(1).replace('.', ',');
            const fichaEprel = acsEprelUrl
                ? `<a href="${acsEprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                : 'Ficha EPREL';
            return scopBox(
                `Justificación del SCOP en ACS — ${isTer100 ? 'Anexo II ficha TER100' : 'Anexo IV ficha RES060'} (depósito ACS en conjunto con la BdC)`,
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
                    <div style="font-weight:800;font-size:13px;text-transform:uppercase;color:#1A1A1A;margin-bottom:8px;">Cálculo del SCOP en ACS</div>
                    <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Fórmula aplicada</div>
                    <p style="margin:0 0 6px;">Según el ${isTer100 ? 'Anexo VII de la ficha TER100 (condiciones generales para el cálculo del coeficiente de eficiencia estacional en el calentamiento de ACS)' : 'Anexo VI de la ficha RES060 (Caso 3: bomba de calor aerotérmica con depósito de ACS no suministrado como conjunto)'}, para la zona climática ${zoneStr}:</p>
                    <div style="text-align:center;font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;margin:10px 0;color:#1A1A1A;">SCOP<sub>dhw</sub> = COP · F<sub>c</sub></div>
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
                        <span style="font-weight:900;font-size:18px;color:#4d6a12;">${scopAcsStr}</span>
                    </div>
                </div>`;
        }

        return scopCallout(`SCOP en ACS = ${scopAcsStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`);
    };

    // La numeración de los apartados se calcula: en TER100 puede haber un apartado
    // extra (D_CAP) antes y otro después (SCOP_pwh), y los índices fijos se descuadran.
    const nEta = tienePiscina ? 6 : 5;
    const nScopCal = nEta + 1;
    const nScopAcs = nEta + 2;
    const nScopPool = nEta + 3;

    const scopJustBlock = `
        ${subLabel(`${nScopCal}. Coeficiente de rendimiento estacional de la bomba de calor en calefacción SCOP<sub>bdc</sub>`, '#6E6E66', '20px')}
        ${!tieneCalefaccion
            ? scopCallout('SCOP en Calefacción = no aplica. La calefacción queda fuera del alcance de la actuación: el generador existente se mantiene y AE<sub>C</sub> no computa en el ahorro.')
            : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Ubicación de la instalación</span><span style="font-weight:700;">Zona climática ${zoneStr} (DB-HE CTE)</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Condiciones en calefacción</span><span style="font-weight:700;">${zoneLabel}</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Tipo de bomba de calor</span><span style="font-weight:700;">Aerotérmica</span></div>
            <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Sistema de distribución</span><span style="font-weight:700;">${emiLabel}</span></div>
        </div>
        ${metodoCal === 'eprel'
            ? renderEprelJustification(false)
            : scopCallout(`SCOP en Calefacción = ${scopCalStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`)
        }`}

        ${subLabel(`${nScopAcs}. Rendimiento estacional SCOP<sub>dhw</sub>`, '#6E6E66', '20px')}
        ${tieneAcs
            ? renderAcsScopJustification()
            : acsTermoFuera
            ? scopCallout('SCOP en ACS = no aplica. El ACS queda fuera del alcance de la actuación: se produce con un termo eléctrico (efecto Joule, rendimiento = 1), que no computa en el ahorro.')
            : scopCallout('SCOP en ACS = no aplica.')}

        ${tienePiscina ? `
        ${subLabel(`${nScopPool}. Rendimiento estacional en calentamiento de piscina SCOP<sub>pwh</sub>`, '#6E6E66', '20px')}
        ${scopCallout(`SCOP<sub>pwh</sub> = ${scopPoolStr}. Coeficiente de eficiencia estacional para el calentamiento de agua de piscina, determinado conforme al Anexo VII de la ficha ${cifoLabel} (condiciones generales para el cálculo del coeficiente de eficiencia estacional sobre energía final) a partir de la ficha técnica del fabricante del equipo${pisNuMarca !== '—' ? ` <b>${pisNuMarca}${pisNuMod !== '—' ? ` ${pisNuMod}` : ''}</b>` : ''}, que se entrega como anexo al expediente CAE.`)}
        ` : ''}
    `;

    const scopHeavy = metodoCal === 'eprel'
        || (tieneAcs && (metodoAcs === 'conjunto' || metodoAcs === 'independiente'));
    // Con piscina hay un apartado extra en cada bloque (D_CAP y SCOP_pwh): se parte.
    const splitAnexoScop = acsDemandHeavy || scopHeavy || tienePiscina;
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

        // La cobertura admite dos determinaciones: por CARGA DE DISEÑO PARA CALEFACCIÓN
        // (P_designh = Q_H / H_HE, procedimiento del Reglamento (UE) 813/2013) o por
        // POTENCIA NOMINAL DE LA CALDERA existente. El desarrollo es muy distinto:
        // el primero necesita justificar de dónde salen las horas equivalentes y ocupa
        // dos páginas; el segundo cabe en una. Por eso se arman por separado.
        const esPorCaldera = hybridMethod === HYBRID_METHODS.CALDERA;

        const formulaBox = (html) => `<div style="text-align:center;margin:6px 0;font-weight:800;font-size:13px;background:#FBF6EE;border-radius:10px;padding:8px;">${html}</div>`;
        const quoteBox = (html) => `<div style="margin:8px 0 2px;padding:10px 16px;border-left:3px solid #93C01F;background:#F7F7F1;border-radius:0 10px 10px 0;font-size:11.5px;line-height:1.55;color:#4a4a44;font-style:italic;">${html}</div>`;
        const cite = (t) => `<p style="margin:0 0 8px;font-size:9.5px;color:#8a8a80;">${t}</p>`;
        const par = (html) => `<p style="margin:0 0 6px;font-size:12px;line-height:1.55;color:#4a4a44;">${html}</p>`;
        // Enlace al texto oficial. El verificador tiene que poder abrir la norma desde
        // el propio certificado: en PDF el <a> es clicable, y la URL se imprime aparte
        // en la lista de referencias para que también sirva en papel.
        const link = (url, txt) => `<a href="${url}" style="color:#4d6a12;text-decoration:underline;">${txt}</a>`;
        // Boletín Oficial del Estado — recopilación del DOUE L 239 de 6.9.2013, donde
        // se publicaron los dos reglamentos (811/2013 en L 239/1-82, 813/2013 en
        // L 239/136-161). Verificado sobre el propio PDF: la letra c) del Anexo III
        // del 813/2013 está en la pág. L 239/153 y la del Anexo VII del 811/2013 en
        // la pág. L 239/72.
        const URL_813 = 'https://www.boe.es/doue/2013/239/L00136-00161.pdf';
        const URL_811 = 'https://www.boe.es/doue/2013/239/L00001-00082.pdf';

        // Condiciones en las que se declara el SCOP adoptado. Tienen que ser las de la
        // MISMA temporada de referencia que las horas equivalentes (clima medio): un
        // SCOP de una temporada con las horas de otra no es defendible.
        const esCalido = climateSeason === 'calido';
        const tempLabel = esCalido ? 'condiciones climáticas más cálidas' : 'condiciones climáticas medias';
        const emiTemp = getEmitterTemp(inst.tipo_emisor);
        const parAgua = emiTemp === 35 ? '30/35' : emiTemp === 55 ? '47/55' : `${emiTemp - 5}/${emiTemp}`;
        const condScop = esEmisorAire(inst.tipo_emisor)
            ? tempLabel
            : `${tempLabel}; temperatura de agua entrada/salida ${parAgua} °C`;
        const fuenteScop = metodoCal === 'eprel'
            ? 'el registro EPREL del equipo declara'
            : 'la ficha técnica del fabricante declara';
        const condPotencia = esEmisorAire(inst.tipo_emisor) ? 'UNE-EN 14511' : `UNE-EN 14511, A7/W${emiTemp}`;
        // "2.066" con separador de millar: es-ES no agrupa los números de 4 cifras.
        const hHEStr = String(thZone).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        // La comprobación de coherencia solo AFIRMA algo cuando el resultado cae en el
        // rango propio de vivienda existente. Fuera de él se da el dato y nada más:
        // un certificado no puede sostener una conclusión que sus propios números
        // desmienten — es lo primero que el verificador cruza.
        const coherenciaTxt = pEspecificaNum >= 40 && pEspecificaNum <= 130
            ? `, orden de magnitud propio de una vivienda existente sin actuación sobre la envolvente, lo que confirma la representatividad del resultado`
            : '';

        const cbTable = `
                <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                    <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                        <tr><td colspan="2" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">Coeficiente de cobertura por bivalencia — valor aplicado</td></tr>
                        <tr><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">${esPorCaldera ? 'Cobertura potencia térmica BdC sobre caldera existente' : 'Cobertura de la BdC sobre la carga de diseño para calefacción'}</td><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">C<sub>b</sub></td></tr>
                        <tr><td style="text-align:center;font-weight:800;font-size:15px;background:#FBF6EE;padding:10px;">${appliedCovStr}%${coveragePct >= 95 ? ' · valor aplicado' : ''}</td><td style="text-align:center;font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${cbStr}</td></tr>
                    </tbody></table>
                </div>`;

        if (esPorCaldera) {
            pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${subLabel('8. Coeficiente de cobertura por bivalencia C<sub>b</sub>', '#6E6E66', '20px')}
                ${par('La ficha técnica RES093 establece que el ahorro de energía se pondera mediante el coeficiente de cobertura por bivalencia (C<sub>b</sub>), que refleja la fracción de la demanda de energía térmica anual cubierta por la bomba de calor cuando ésta opera combinada con el generador auxiliar de combustión (caldera) formando un sistema híbrido. En esta actuación dicha fracción se determina por la relación entre la potencia térmica de la bomba de calor instalada y la potencia nominal de la caldera existente, obteniéndose el valor de C<sub>b</sub> de la tabla del Anexo III de la ficha RES093:')}

                ${subLabel('Paso 1 — Potencia nominal de la caldera existente (P<sub>caldera</sub>)', '#6E6E66', '16px')}
                ${par('La caldera de combustión existente permanece en la instalación como generador auxiliar del sistema híbrido. Su potencia nominal, según la placa de características del equipo, es:')}
                ${formulaBox(`P<sub>caldera</sub> = <span style="color:#4d6a12;">${pCalderaKwStr} kW</span>`)}

                ${subLabel('Paso 2 — Porcentaje de cobertura de la bomba de calor', '#6E6E66', '16px')}
                ${par('El porcentaje de cobertura expresa la fracción de la potencia térmica del generador sustituido que aporta la bomba de calor instalada:')}
                ${formulaBox(`% cobertura = ${pbdcKwStr} kW / ${pCalderaKwStr} kW = <span style="color:#4d6a12;">${coveragePctStr}%</span>`)}
                ${cappedNote}

                ${subLabel('Paso 3 — Valor de C<sub>b</sub> aplicado', '#6E6E66', '16px')}
                ${par(`Aplicando el ${appliedCovStr}% en la tabla del Anexo III de la ficha RES093:`)}
                ${cbTable}
                ${footer}
            </div>
        `);
        } else {
            // Determinación por CARGA DE DISEÑO. El procedimiento se apoya en el
            // Reglamento (UE) 813/2013 (Q_H = P_designh × H_HE), que es la norma de
            // aplicación directa y el marco al que remiten las propias fichas: las
            // "horas equivalentes por zona climática" de las fichas RES220/RES230 que
            // se usaban antes no son la H_HE de este procedimiento.
            pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${subLabel('8. Coeficiente de cobertura por bivalencia C<sub>b</sub>', '#6E6E66', '20px')}
                ${par('La ficha RES093 <b>[R4]</b> establece que el ahorro de energía se pondera mediante el coeficiente de cobertura por bivalencia (C<sub>b</sub>), definido como <i>«el porcentaje de la demanda de energía térmica anual cubierta por bombas de calor cuando está combinada con generadores auxiliares (calderas) formando un sistema híbrido»</i>. Su valor se obtiene de la tabla del <b>Anexo III</b> de la ficha, cuya variable de entrada es el <i>«porcentaje de potencia térmica nominal de bomba de calor sobre la potencia térmica total necesaria en proyecto»</i>, interpolando linealmente entre los valores más próximos de la tabla.')}
                ${par(`Para determinar la <b>potencia térmica total necesaria en proyecto</b> se aplica el procedimiento establecido en el <b>${link(URL_813, 'Reglamento (UE) n.º 813/2013')} [R1]</b>, norma de aplicación directa que define tanto la carga de diseño para calefacción como las horas anuales equivalentes en modo activo, y que constituye el marco al que remiten expresamente el Anexo II de la propia ficha RES093 <b>[R4]</b> y el Anexo V de la ficha RES060 <b>[R5]</b>.`)}

                ${subLabel('Paso 1 — Horas anuales equivalentes en modo activo (H<sub>HE</sub>)', '#6E6E66', '18px')}
                ${par(`El ${link(URL_813, 'Reglamento (UE) n.º 813/2013')} <b>[R1]</b>, <b>Anexo III, punto 4, letra c)</b>, establece literalmente:`)}
                ${quoteBox('«La demanda anual de calor de referencia Q<sub>H</sub> será la carga de diseño para calefacción P<sub>designh</sub> multiplicada por las horas anuales equivalentes en modo activo H<sub>HE</sub> de 2 066.»')}
                ${cite(`— Reglamento (UE) n.º 813/2013, Anexo III, punto 4, letra c) — ${link(URL_813, 'DOUE L 239 de 6.9.2013, pág. L 239/153')} [R1]`)}
                ${par(`El ${link(URL_811, 'Reglamento Delegado (UE) n.º 811/2013')} <b>[R2]</b>, Anexo VII, punto 4, letra c) (pág. L 239/72), recoge la misma relación para las tres temporadas de calefacción de referencia, con valores de H<sub>HE</sub> de <b>2.066 h</b> (condiciones medias), <b>2.465 h</b> (más frías) y <b>1.336 h</b> (más cálidas).`)}
                ${esCalido
                    ? par(`Se aplica la temporada de <b>condiciones climáticas más cálidas</b>: es la temporada en la que ${fuenteScop} el SCOP = ${scopCalStr} adoptado en el apartado ${nScopCal} de este anexo (<i>${condScop}</i>) y la que corresponde a la zona climática <b>${zoneStr}</b> en la que se ubica la instalación. El rendimiento estacional y las horas anuales equivalentes son parámetros de una <b>misma</b> temporada de calefacción de referencia y se toman conjuntamente: determinar la carga de diseño con las horas de una temporada distinta de aquella en la que se declara el SCOP dejaría de comparar en igualdad de condiciones.`)
                    : par(`Se aplica la temporada de <b>condiciones climáticas medias</b>, que es la que el propio Anexo III del Reglamento (UE) n.º 813/2013 <b>[R1]</b> fija para el cálculo del rendimiento estacional (cuadro 5) y en la que ${fuenteScop} el SCOP = ${scopCalStr} adoptado en el apartado ${nScopCal} de este anexo (<i>${condScop}</i>), condición mínima que exige a su vez el Anexo V de la ficha RES060 <b>[R5]</b>. No se dispone del rendimiento estacional del equipo para condiciones más cálidas, de modo que la carga de diseño se determina con las horas equivalentes de esa <b>misma</b> temporada: rendimiento estacional y carga de diseño quedan así establecidos en igualdad de condiciones.`)}
                ${formulaBox(`H<sub>HE</sub> = <span style="color:#4d6a12;">${hHEStr} h/año</span>`)}

                ${subLabel('Paso 2 — Demanda anual de calor (Q<sub>H</sub>)', '#6E6E66', '18px')}
                ${par('La demanda anual de calor es la demanda de calefacción del edificio por la superficie útil habitable calefactada, ambas tomadas del certificado de eficiencia energética registrado que impone la ficha RES093 <b>[R4]</b> como fuente de la demanda:')}
                ${formulaBox(`Q<sub>H</sub> = D<sub>CAL</sub> × S = ${dcal} kWh/m²·año × ${sStr} m² = <span style="color:#4d6a12;">${demandaAnualKwhStr} kWh/año</span>`)}
                ${footer}
            </div>
        `);

            pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${subLabel('8. Coeficiente de cobertura por bivalencia C<sub>b</sub> <span style="text-transform:none;letter-spacing:0;font-weight:400;">(continuación)</span>', '#6E6E66', '20px')}

                ${subLabel('Paso 3 — Carga de diseño para calefacción (P<sub>designh</sub>)', '#6E6E66', '16px')}
                ${par('Despejando de la relación establecida en el paso 1:')}
                ${formulaBox(`P<sub>designh</sub> = Q<sub>H</sub> / H<sub>HE</sub> = ${demandaAnualKwhStr} kWh / ${hHEStr} h = <span style="color:#4d6a12;">${pDesignKwStr} kW</span>`)}
                ${par(`<b>Comprobación de coherencia.</b> La potencia específica resultante es ${pDesignWStr} W / ${sStr} m² = <b>${pEspecificaStr} W/m²</b>${coherenciaTxt}.`)}

                ${subLabel('Paso 4 — Porcentaje de cobertura de la bomba de calor', '#6E6E66', '16px')}
                ${par(`Potencia térmica nominal de la bomba de calor en las condiciones que exige el Anexo III de la ficha RES093 —${condPotencia} <b>[R3]</b>—, según la ficha técnica del fabricante: <b>${pbdcKwStr} kW</b>.`)}
                ${formulaBox(`% cobertura = ${pbdcKwStr} kW / ${pDesignKwStr} kW = <span style="color:#4d6a12;">${coveragePctStr}%</span>`)}
                ${cappedNote}

                ${subLabel('Paso 5 — Valor de C<sub>b</sub> aplicado', '#6E6E66', '16px')}
                ${par(`Aplicando el ${appliedCovStr}% en la tabla del Anexo III de la ficha RES093, con interpolación lineal entre los valores más próximos:`)}
                ${cbTable}

                ${obsBox(`
                    <b style="font-size:11px;">Referencias</b>
                    <div style="margin-top:6px;">
                        <b>[R1]</b> Reglamento (UE) n.º 813/2013 de la Comisión, de 2 de agosto de 2013, por el que se desarrolla la Directiva 2009/125/CE del Parlamento Europeo y del Consejo respecto de los requisitos de diseño ecológico aplicables a los aparatos de calefacción y a los calefactores combinados — DOUE L 239 de 6.9.2013, págs. L 239/136 a L 239/161 (la letra c) citada, en la pág. L 239/153).<br>
                        <span style="font-size:9px;">Texto oficial: ${link(URL_813, URL_813)}</span><br>
                        <b>[R2]</b> Reglamento Delegado (UE) n.º 811/2013 de la Comisión, de 18 de febrero de 2013, por el que se complementa la Directiva 2010/30/UE en lo relativo al etiquetado energético de los aparatos de calefacción — DOUE L 239 de 6.9.2013, págs. L 239/1 a L 239/82 (la letra c) citada, en la pág. L 239/72).<br>
                        <span style="font-size:9px;">Texto oficial: ${link(URL_811, URL_811)}</span><br>
                        <b>[R3]</b> UNE-EN 14511 (condiciones de ensayo de potencia térmica) y UNE-EN 14825 (condiciones de cálculo del rendimiento estacional SCOP por temporada de calefacción).<br>
                        <b>[R4]</b> Ficha RES093 del Anexo I de la Orden TED/845/2023, de 18 de julio, actualizado por la Resolución de 3 de julio de 2024 de la Dirección General de Planificación y Coordinación Energética.<br>
                        <b>[R5]</b> Ficha RES060, misma fuente que [R4].
                    </div>
                `, '14px')}
                ${footer}
            </div>
        `);
        }
    }

    // SEPARADOR ANEXOS — solo si hay al menos un anexo con driveId.
    const annexList = attachments.filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || (tieneAcs && !acsEsTermo)));
    if (annexList.length > 0) {
        const items = annexList.map((a, i) => `
            <div style="display:flex;align-items:center;gap:16px;border:1px solid #E9E9E1;border-radius:16px;padding:14px 18px;background:#fff;">
                <span style="flex:none;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
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
