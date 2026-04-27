/* BACKUP STABLE CertificadoCifoModal before multi-page attachments integration */
import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';

const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
];

const PAGE_PADDING = '93px 95px 19px 113px';

const DOC_CSS = `
    .doc-wrap { background: #e8e8e8; width: 794px; }
    .doc-page {
        font-family: 'Arial MT', Arial, Helvetica, sans-serif;
        font-size: 11pt;
        color: #000;
        background: white;
        width: 794px;
        min-height: 1123px;
        padding: ${PAGE_PADDING};
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin-bottom: 12px;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
    }
    .doc-page:last-child { page-break-after: avoid; }
    .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 10pt;
        table-layout: fixed;
    }
    .doc-table td, .doc-table th {
        border: 1px solid #000;
        padding: 4px 6px;
        vertical-align: middle;
        line-height: 1.3;
        word-wrap: break-word;
    }
    .doc-table th {
        font-weight: bold;
        text-align: left;
    }
    .lbl { background-color: #f2a640; color: #fff; font-weight: bold; }
    .heading { background-color: #000; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10pt; padding: 4px; }
    .subheading { font-weight: bold; font-size: 12pt; text-align: center; text-decoration: underline; margin-bottom: 16px; margin-top: 10px; }
    .section-title { font-weight: bold; margin-bottom: 6px; margin-top: 16px; font-size: 11pt; }
    .doc-p { margin-bottom: 8px; line-height: 1.4; text-align: justify; }
    ul { margin: 0 0 10px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    .formula { margin: 10px 0 10px 20px; font-size: 11pt; }
`;

const PDF_CSS = `
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
    .doc-page {
        font-family: 'Arial MT', Arial, sans-serif;
        font-size: 10.5pt;
        color: #1a1a1a;
        width: 210mm;
        min-height: 297mm;
        padding: 50px 70px;
        box-sizing: border-box;
        page-break-after: always;
        position: relative;
        overflow: hidden;
    }
    .doc-page:last-child { page-break-after: avoid; }
    
    .subheading { 
        font-weight: bold; 
        font-size: 14pt; 
        text-align: center; 
        text-decoration: underline; 
        margin-bottom: 24px; 
        text-transform: uppercase;
        color: #000;
    }
    
    .doc-table { 
        width: 100%; 
        border-collapse: collapse; 
        margin-bottom: 18px; 
        table-layout: fixed;
    }
    .doc-table td, .doc-table th { 
        border: 1px solid #000; 
        padding: 6px 8px; 
        vertical-align: middle; 
        word-wrap: break-word;
    }
    .heading { 
        background-color: #000; 
        color: #fff; 
        font-weight: bold; 
        text-align: center; 
        text-transform: uppercase; 
        font-size: 9.5pt; 
        letter-spacing: 0.5px;
        padding: 6px 8px;
    }
    .doc-table .lbl { 
        background-color: #ee8f1f; 
        color: #fff; 
        font-weight: bold; 
        font-size: 9.5pt;
    }
    
    .section-title { 
        font-weight: bold; 
        margin-top: 20px; 
        margin-bottom: 10px; 
        font-size: 11pt; 
        text-transform: uppercase;
        border-bottom: 1px solid #eee;
        padding-bottom: 4px;
    }
    .doc-p { 
        margin-bottom: 10px; 
        line-height: 1.5; 
        text-align: justify; 
    }
    ul { margin: 0 0 15px 20px; padding: 0; }
    li { margin-bottom: 6px; }
    
    .var-table th {
        background: #ee8f1f;
        color: white;
        font-size: 9pt;
        text-align: center;
        padding: 4px 2px;
    }
    .var-table td {
        text-align: center;
        font-size: 10pt;
    }
    .donde-table td {
        border: none;
        padding: 4px 8px;
        font-size: 9.5pt;
        vertical-align: top;
    }
`;

function formatDateSpanish(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

export function CertificadoCifoModal({ isOpen, onClose, expediente, results }) {
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [scale, setScale] = useState(1);

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const avail = containerRef.current.clientWidth - 48;
        setScale(avail < 794 ? avail / 794 : 1);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updateScale();
        const t = setTimeout(updateScale, 80);
        window.addEventListener('resize', updateScale);
        return () => { clearTimeout(t); window.removeEventListener('resize', updateScale); };
    }, [isOpen, updateScale]);

    if (!isOpen || !expediente) return null;

    // ── DATA EXTRACTION ───────────────────────────────────────────────
    const op = expediente.oportunidades || {};
    const opInputs = op.datos_calculo || {};
    const inst = expediente.instalacion || {};
    const doc = expediente.documentacion || {};
    const cee = expediente.cee || {};
    const loc = expediente.ubicacion || {};
    const cli = expediente.clientes || expediente.cliente || {}; 
    const pres = expediente.prescriptores || {};

    const numexpte = expediente.numero_expediente || '';
    const facturasList = (doc.facturas || []).map(f => f.numero_factura).filter(Boolean).join(', ') || '—';

    const fechaInicio = formatDateSpanish(doc.fecha_inicio_cifo);
    const fechaFin = formatDateSpanish(doc.fecha_fin_cifo);

    // Métricas para Header
    const aeKwh = Math.round(results?.savingsKwh || 0).toLocaleString('es-ES');
    const beneficioStr = Math.round((results?.savingsKwh || 0) * (results?.price_kwh || 0.10)).toLocaleString('es-ES');

    // CEE Final
    const ceeFinal = cee.cee_final || {};
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');
    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    // Justificación Demand ACS
    const numRooms = parseInt(cee.num_rooms) || 4;
    const numPeople = numRooms + 1;
    const dacsValue = 28 * numPeople * 0.001162 * 365 * 46;
    const dacsStr = dacsValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Identificación Actuación (Location)
    const locFullDir = `${inst.direccion || loc.direccion || cli.direccion || ''} ${inst.num || loc.num || ''}, ${inst.codigo_postal || loc.cp || cli.codigo_postal || ''} ${inst.municipio || loc.municipio || cli.municipio || ''} (${inst.provincia || loc.provincia || cli.provincia || ''})`.trim() || '—';
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

    const cp = inst.codigo_postal || loc.cp || cli.codigo_postal || opInputs.ccaa_cp || opInputs.cp || '';
    const provCode = cp ? String(cp).substring(0, 2).padStart(2, '0') : '';

    const locCA = (
        inst.ccaa || 
        loc.ccaa || 
        cli.ccaa || 
        (provCode ? PROV_CCAA[provCode] : '') || 
        '—'
    ).toUpperCase();
    const locRefCat = inst.ref_catastral || loc.ref_catastral || opInputs.rc || '—';
    const locUtmX = inst.coord_x || loc.coord_x || opInputs.coordX || opInputs.coord_x || '—';
    const locUtmY = inst.coord_y || loc.coord_y || opInputs.coordY || opInputs.coord_y || '—';

    // Propietario (Client)
    const cliNombre = (cli.nombre_razon_social || cli.nombre || '—') + (cli.apellidos ? ` ${cli.apellidos}` : '');
    const cliNif = cli.nif || cli.dni || '—';
    const cliDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
    const cliTlf = cli.tlf || cli.telefono || opInputs?.phone || '—';

    // Caldera Antigua Calefaccion
    const calExMarca = inst.caldera_antigua_cal?.marca || '—';
    const calExMod = inst.caldera_antigua_cal?.modelo || '—';
    const calExSerie = inst.caldera_antigua_cal?.numero_serie || '—';
    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffEntry = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId);
    
    const calExTipo = boilerEffEntry?.label || '—'; 
    const calExComb = calExTipo.split(',')[0] || '—'; 
    
    const etaBoiler = boilerEffEntry?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    // Aerotermia Calefaccion (3)
    const calNuMarca = inst.aerotermia_cal?.marca || '—';
    const calNuMod = inst.aerotermia_cal?.modelo || '—';
    const calNuSerieEx = inst.aerotermia_cal?.numero_serie || inst.aerotermia_cal?.n_serie_ext || '—';
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';

    // ACS
    const tieneAcs = (inst.cambio_acs !== false) && (!!inst.aerotermia_acs?.aerotermia_db_id || !!inst.misma_aerotermia_acs);
    const acsExMarca = inst.caldera_antigua_acs?.marca || calExMarca;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || inst.caldera_antigua_acs?.n_serie || '—';
    
    const acsEffId = inst.caldera_antigua_acs?.rendimiento_id || boilerEffId;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === acsEffId);
    const acsExTipo = acsEffEntry?.label || calExTipo;
    const acsExComb = acsExTipo.split(',')[0] || '—';

    const acsNuMarca = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMarca : inst.aerotermia_acs?.marca || '—') : '—';
    const acsNuMod = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMod : inst.aerotermia_acs?.modelo || '—') : '—';
    const acsNuSerieEx = tieneAcs ? (inst.misma_aerotermia_acs ? calNuSerieEx : inst.aerotermia_acs?.numero_serie || inst.aerotermia_acs?.n_serie_ext || '—') : '—';
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    // Ahorro Total
    const aeRaw = results?.savingsKwh || 0;
    const aeKwhVal = aeRaw ? Math.round(aeRaw).toLocaleString('es-ES') : '—';

    // EMPRESA INSTALADORA
    const empNombre = pres.razon_social || pres.nombre || '—';
    const empCif    = pres.cif || '—';
    const empDir    = pres.direccion || '—';
    const empCp     = pres.codigo_postal || '—';
    const empMun    = pres.municipio || '—';
    const empProv   = pres.provincia || '—';
    const empCargo  = pres.es_autonomo ? 'Trabajador autónomo' : 'Representante legal';
    const emiLabel  = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';

    // ── HTML GENERATION ──────────────────────────────────────────────
    const buildHtml = () => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>\${PDF_CSS}</style></head><body>

    <!-- PÁGINA 1: CERTIFICADO DE INSTALACIÓN -->
    <div class="doc-page">
        <div class="subheading">CERTIFICADO DE INSTALACIÓN</div>

        <table class="doc-table">
            <tr><td colspan="2" class="heading">IDENTIFICACIÓN DE LA ACTUACIÓN DE AHORRO DE ENERGÍA</td></tr>
            <tr>
                <td class="lbl" style="width: 35%;">Nombre de la actuación</td>
                <td>Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)</td>
            </tr>
            <tr>
                <td class="lbl">Código y nombre de la ficha</td>
                <td>RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas</td>
            </tr>
            <tr>
                <td class="lbl">Comunidad autónoma de la actuación</td>
                <td>\${locCA}</td>
            </tr>
            <tr>
                <td class="lbl">Dirección postal instal.</td>
                <td>\${locFullDir}</td>
            </tr>
            <tr>
                <td class="lbl">Referencia catastral</td>
                <td>\${locRefCat}</td>
            </tr>
            <tr>
                <td class="lbl">Coordenadas UTM</td>
                <td>X: \${locUtmX} ; Y: \${locUtmY}</td>
            </tr>
            <tr>
                <td class="lbl">Facturas asociadas</td>
                <td>\${facturasList}</td>
            </tr>
        </table>

        <table class="doc-table">
            <tr><td colspan="2" class="heading">IDENTIFICACIÓN DEL PROPIETARIO INICIAL DEL AHORRO</td></tr>
            <tr>
                <td class="lbl" style="width: 35%;">Propietario / Razón Social</td>
                <td>\${cliNombre}</td>
            </tr>
            <tr>
                <td class="lbl">NIF/NIE</td>
                <td>\${cliNif}</td>
            </tr>
            <tr>
                <td class="lbl">Domicilio</td>
                <td>\${cliDir}</td>
            </tr>
            <tr>
                <td class="lbl">Teléfono</td>
                <td>\${cliTlf}</td>
            </tr>
            <tr>
                <td class="lbl">Correo electrónico</td>
                <td>\${cli.email || '—'}</td>
            </tr>
        </table>

        <table class="doc-table">
            <tr><td colspan="2" class="heading">HITOS DE LA ACTUACIÓN</td></tr>
            <tr>
                <td class="lbl" style="width: 50%;">Fecha de inicio</td>
                <td style="text-align: center;">\${fechaInicio}</td>
            </tr>
            <tr>
                <td class="lbl">Fecha de fin</td>
                <td style="text-align: center;">\${fechaFin}</td>
            </tr>
        </table>

        <table class="doc-table">
            <tr><td colspan="3" class="heading">DATOS DE LA INSTALACIÓN DE CALEFACCIÓN</td></tr>
            <tr>
                <td class="lbl" style="width: 33%; text-align: center;">COMPARATIVA</td>
                <td style="font-weight: bold; text-align: center; width: 33%">EXISTENTE</td>
                <td style="font-weight: bold; text-align: center;">NUEVA</td>
            </tr>
            <tr><td class="lbl">Tipo de caldera</td><td>\${calExTipo}</td><td>Bomba de calor</td></tr>
            <tr><td class="lbl">Marca</td><td>\${calExMarca}</td><td>\${calNuMarca}</td></tr>
            <tr><td class="lbl">Modelo</td><td>\${calExMod}</td><td>\${calNuMod}</td></tr>
            <tr><td class="lbl">Fuente de energía</td><td>\${calExComb}</td><td>Electricidad</td></tr>
            <tr><td class="lbl">Nº serie unidad exterior</td><td>\${calExSerie}</td><td>\${calNuSerieEx}</td></tr>
            <tr><td class="lbl">SCOPbdc / Rendimiento</td><td style="text-align: center;">\${etaStr}</td><td style="text-align: center;">\${scopCalStr}</td></tr>
        </table>
    </div>

    <!-- PÁGINA 2: ACS Y VARIABLES DE CÁLCULO -->
    <div class="doc-page">
        <table class="doc-table">
            <tr><td colspan="3" class="heading">DATOS DE LA INSTALACIÓN AGUA CALIENTE SANITARIA (ACS)</td></tr>
            <tr>
                <td class="lbl" style="width: 33%; text-align: center;">COMPARATIVA</td>
                <td style="font-weight: bold; text-align: center; width: 33%">EXISTENTE</td>
                <td style="font-weight: bold; text-align: center;">NUEVA</td>
            </tr>
            <tr><td class="lbl">Tipo de caldera</td><td>\${acsExTipo}</td><td>\${tieneAcs ? 'Bomba de calor' : 'no aplica'}</td></tr>
            <tr><td class="lbl">Marca</td><td>\${acsExMarca}</td><td>\${tieneAcs ? acsNuMarca : '—'}</td></tr>
            <tr><td class="lbl">Modelo</td><td>\${acsExMod}</td><td>\${tieneAcs ? acsNuMod : '—'}</td></tr>
            <tr><td class="lbl">Fuente de energía</td><td>\${acsExComb}</td><td>\${tieneAcs ? 'Electricidad' : '—'}</td></tr>
            <tr><td class="lbl">Nº serie equipo ACS</td><td>\${acsExSerie}</td><td>\${tieneAcs ? acsNuSerieEx : '—'}</td></tr>
            <tr><td class="lbl">SCOPdhw / Rendimiento</td><td style="text-align: center;">\${etaStr}</td><td style="text-align: center;">\${scopAcsStr}</td></tr>
        </table>

        <div class="heading" style="margin-bottom: 0;">Valores de las variables para el ahorro de energía</div>
        <table class="doc-table var-table">
            <tr>
                <th>F<sub>P</sub></th>
                <th>D<sub>CAL</sub></th>
                <th>S</th>
                <th>D<sub>ACS</sub></th>
                <th>η<sub>i</sub></th>
                <th>SCOP<sub>bdc</sub></th>
                <th>SCOP<sub>dhw</sub></th>
                <th>AE<sub>TOTAL</sub></th>
                <th>D<sub>i</sub></th>
            </tr>
            <tr>
                <td>1</td>
                <td>\${dcal}</td>
                <td>\${sStr}</td>
                <td>\${dacsStr}</td>
                <td>\${etaStr}</td>
                <td>\${scopCalStr}</td>
                <td>\${scopAcsStr}</td>
                <td style="font-weight: bold;">\${aeKwhVal}</td>
                <td>15</td>
            </tr>
        </table>

        <div class="doc-p" style="font-weight: bold; margin-top: 15px; margin-bottom: 5px;">Donde:</div>
        <table class="donde-table" style="width: 100%; margin-bottom: 20px;">
            <tr><td style="width: 25px;">1.</td><td style="width: 70px; font-weight: bold;">F<sub>P</sub></td><td>Factor de ponderación</td><td style="text-align: right; font-weight: bold; width: 120px;">1</td></tr>
            <tr><td>2.</td><td style="font-weight: bold;">D<sub>CAL</sub></td><td>Demanda de energía en calefacción del edificio/vivienda</td><td style="text-align: right; font-weight: bold;">\${dcal} kWh/m²·año</td></tr>
            <tr><td>3.</td><td style="font-weight: bold;">S</td><td>Superficie útil habitable del edificio o vivienda</td><td style="text-align: right; font-weight: bold;">\${sStr} m²</td></tr>
            <tr><td>4.</td><td style="font-weight: bold;">D<sub>ACS</sub></td><td>Demanda de energía en agua caliente sanitaria</td><td style="text-align: right; font-weight: bold;">\${dacsStr} kWh/año</td></tr>
            <tr><td>5.</td><td style="font-weight: bold;">η<sub>i</sub></td><td>Rendimiento de caldera combustible fósil (PCS)</td><td style="text-align: right; font-weight: bold;">\${etaStr}</td></tr>
            <tr><td>6.</td><td style="font-weight: bold;">SCOP<sub>bdc</sub></td><td>Rendimiento estacional bomba calor calefacción</td><td style="text-align: right; font-weight: bold;">\${scopCalStr}</td></tr>
            <tr><td>7.</td><td style="font-weight: bold;">SCOP<sub>dhw</sub></td><td>Rendimiento estacional bomba calor ACS</td><td style="text-align: right; font-weight: bold;">\${scopAcsStr}</td></tr>
            <tr><td>8.</td><td style="font-weight: bold;">D<sub>i</sub></td><td>Vida útil de la actuación de eficiencia energética</td><td style="text-align: right; font-weight: bold;">15 años</td></tr>
        </table>

        <table class="doc-table">
            <tr><td colspan="2" class="heading">DATOS DE LA EMPRESA INSTALADORA</td></tr>
            <tr>
                <td class="lbl" style="width: 35%;">Razón social</td>
                <td>\${empNombre}</td>
            </tr>
            <tr>
                <td class="lbl">NIF/CIF</td>
                <td>\${empCif}</td>
            </tr>
            <tr>
                <td class="lbl">Domicilio</td>
                <td>\${empDir} - \${empCp} \${empMun} (\${empProv})</td>
            </tr>
            <tr>
                <td class="lbl">Cargo firmante</td>
                <td>\${empCargo}</td>
            </tr>
            <tr>
                <td class="lbl" style="height: 100px;">Firma y sello</td>
                <td></td>
            </tr>
        </table>
    </div>

    <!-- PÁGINA 3: ANEXO I (1) -->
    <div class="doc-page">
        <div class="subheading">ANEXO I: Justificación de los valores de las variables de la fórmula de cálculo del ahorro de energía del apartado 3 de la ficha RES060.</div>
        
        <div class="section-title">1. FACTOR DE PONDERACIÓN Fp</div>
        <div class="doc-p">Este valor es 1, tal y como indica la ficha RES060.</div>

        <div class="section-title">2. JUSTIFICACIÓN DE D<sub>CAL</sub></div>
        <div class="doc-p">El valor de la demanda de calefacción se ha determinado directamente a partir del Certificado de Eficiencia Energética del Edificio, tal como se establece en la ficha RES060. Dicho certificado ha sido elaborado y firmado por un técnico competente, de acuerdo con lo dispuesto en el RD 390/2021, de 1 de junio.</div>

        <div class="section-title">3. JUSTIFICACIÓN DE LA SUPERFICIE S</div>
        <div class="doc-p">La superficie se ha obtenido directamente del Certificado de Eficiencia Energética adjunto a este expediente CAE.</div>

        <div class="section-title">4. JUSTIFICACIÓN DE LA DEMANDA DE ACS D<sub>ACS</sub></div>
        <div class="doc-p">Según el Anejo F del documento de Ahorro de energía HE, del Código Técnico de la Edificación (año 2022):</div>

        <div style="text-align: center; margin: 15px 0; font-size: 14pt;">
            <strong>D<sub>ACS</sub> = D<sub>L/D</sub> · N<sub>P</sub> · C<sub>e</sub> · 365 · ΔT</strong>
        </div>

        <div class="doc-p">Donde:</div>

        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px;">
            <table class="doc-table" style="width: 65%;">
                <tr>
                    <td style="width: 15%; font-style: italic; font-weight: bold;">D<sub>ACS</sub></td>
                    <td>Demanda de energía anual para ACS (kWh/año)</td>
                </tr>
                <tr>
                    <td style="font-style: italic; font-weight: bold;">D<sub>L/D</sub></td>
                    <td>Ver tabla c- Anejo F Demanda orientativa de ACS para residencial privado</td>
                </tr>
                <tr>
                    <td style="font-style: italic; font-weight: bold;">N<sub>P</sub></td>
                    <td>Número de personas consideradas</td>
                </tr>
                <tr>
                    <td style="font-style: italic; font-weight: bold;">C<sub>e</sub></td>
                    <td>Calor específico (agua) = 0,001162 kWh/kg · °C</td>
                </tr>
                <tr>
                    <td style="font-style: italic; font-weight: bold;">ΔT</td>
                    <td>Salto térmico con instalaciones a 60 °C de acumulación (°C) = 60 °C – 14 °C = 46 °C.</td>
                </tr>
            </table>

            <table class="doc-table" style="width: 32%;">
                <tr><td colspan="2" class="heading" style="font-size: 8pt; padding: 2px;">CÁLCULO SEGÚN CTE</td></tr>
                <tr>
                    <td style="font-size: 8.5pt;">Nº de habitaciones</td>
                    <td style="text-align: center; font-weight: bold; background: #fef3c7;">\${numRooms}</td>
                </tr>
                <tr>
                    <td style="font-size: 8.5pt;">Nº de personas</td>
                    <td style="text-align: center;">\${numPeople}</td>
                </tr>
                <tr>
                    <td style="font-size: 8.5pt;">Litros persona/día</td>
                    <td style="text-align: center;">28</td>
                </tr>
                <tr><td colspan="2" style="border: none; height: 5px;"></td></tr>
                <tr>
                    <td style="font-size: 8.5pt;">C<sub>e</sub></td>
                    <td style="text-align: center;">0,001162</td>
                </tr>
                <tr>
                    <td style="font-size: 8.5pt;">CTE</td>
                    <td style="text-align: center;">365</td>
                </tr>
                <tr>
                    <td style="font-size: 8.5pt;">ΔT</td>
                    <td style="text-align: center;">46</td>
                </tr>
                <tr style="background: #ecfccb;">
                    <td style="font-weight: bold; font-size: 9pt;">D<sub>ACS</sub></td>
                    <td style="text-align: center; font-weight: bold;">\${dacsStr}</td>
                </tr>
            </table>
        </div>

        <div class="doc-p" style="margin-top: 10px;">La estimación de la demanda diaria de Agua Caliente Sanitaria (ACS) se ha realizado conforme a los criterios y valores orientativos establecidos en el Anejo F del Documento Básico de Ahorro de Energía HE del Código Técnico de la Edificación (CTE DB-HE, versión 2022).</div>

        <div class="section-title">5. JUSTIFICACIÓN RENDIMIENTO DE CALDERA COMBUSTIBLE FÓSIL REFERIDO A PCS η<sub>i</sub></div>
        <div class="doc-p">Se ha utilizado un rendimiento estacional de <strong>\${etaStr}</strong>, al tratarse de una caldera de <strong>\${calExTipo}</strong>, siguiendo las indicaciones del Ministerio para la Transición Ecológica y el Reto Demográfico recogidas en los criterios de verificación "24/11.03: Rendimientos estacionales vs. nominales en fichas IND040, RES060, RES090-099, TER100 y TER170-179".</div>
        <div class="doc-p">Como referencia para determinar este valor, se han tomado los anexos de las fichas RES210 y TER210, correspondientes a las fichas de sustitución de caldera por bomba de calor.</div>

        <div class="section-title">6. COEFICIENTE DE RENDIMIENTO ESTACIONAL DE LA BOMBA CALOR EN CALEFACCIÓN SCOP<sub>bdc</sub></div>
        <ul>
            <li>Ubicación de la instalación: Zona climática según DB-HE CTE</li>
            <li>Tipo de bomba de calor: Aerotérmica</li>
            <li>Sistema de emisión: \${emiLabel}</li>
        </ul>
        <div class="doc-p" style="font-weight: bold; margin-top: 10px;">SCOP en Calefacción = \${scopCalStr} Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.</div>
    </div>

    <!-- PÁGINA 4: ANEXO I (2) -->
    <div class="doc-page">
        <div class="section-title">7. RENDIMIENTO ESTACIONAL SCOP<sub>dhw</sub></div>
        <div class="doc-p" style="font-weight: bold;">SCOP en ACS = \${scopAcsStr} Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.</div>
        <div class="doc-p">Según el Anexo IV/VI de la ficha RES060, para la ubicación de la instalación pertenece a la zona climática aplicable, siendo el valor obtenido en base a los consumos y rendimientos de la ficha técnica aportada por EPREL.</div>
        <br>
        <div class="doc-p" style="font-style: italic;">Se adjuntan los siguientes documentos para verificación:</div>
        <ul>
            <li>Ficha técnica del fabricante</li>
            <li>Ficha EPREL de la bomba de calor</li>
        </ul>
    </div>
    </body></html>`;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildHtml() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `\${numexpte || 'DRAFT'} - Certificado_CIFO.pdf`;
            a.click();
        } catch { alert('Error al generar el PDF.'); }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive en la oportunidad.'); return; }
        setSavingDrive(true);
        try {
            await axios.post('/api/pdf/save-to-drive', {
                html: buildHtml(),
                folderId,
                fileName: `\${numexpte || 'DRAFT'} - Certificado CIFO`,
                subfolderName: '6. ANEXOS CAE'
            });
            alert('✅ Guardado en Drive (carpeta 6. ANEXOS CAE)');
        } catch { alert('Error al guardar en Drive.'); }
        finally { setSavingDrive(false); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                {/* ── Toolbar ── */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Certificado CIFO</h2>
                            <p className="text-white/30 text-xs mt-0.5">\${numexpte} · 4 páginas</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Métricas rápidas */}
                        <div className="hidden sm:flex items-center gap-4 mr-3 pr-3 border-r border-white/10">
                            <div className="text-center">
                                <div className="text-brand font-black text-sm">\${aeKwhVal} kWh</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Ahorro</div>
                            </div>
                            <div className="text-center">
                                <div className="text-amber-400 font-black text-sm">\${beneficioStr} €</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Bono CAE</div>
                            </div>
                        </div>
                        <button onClick={handleSaveToDrive} disabled={savingDrive || generating}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 text-xs font-bold hover:text-white hover:border-white/30 transition-all disabled:opacity-30">
                            {savingDrive ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>}
                            {savingDrive ? 'Guardando...' : 'Drive'}
                        </button>
                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive} 
                                className="flex items-center gap-2 px-5 py-2 bg-brand text-white text-xs font-black rounded-xl uppercase tracking-wider hover:bg-brand/90 transition-all disabled:opacity-30">
                            {generating ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>

                {/* CONTENT PREVIEW */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left" 
                         style={{ transform: `scale(\${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
                        <div className="doc-wrap" dangerouslySetInnerHTML={{ __html: buildHtml() }} />
                    </div>
                </div>
            </div>
        </div>
    );
}

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);
