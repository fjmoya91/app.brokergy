// ============================================================
// fichaRes060Html.js — Generador del HTML de la Ficha RES060 (PDF)
//
// Extraído de FichaRes060Modal para poder generarla por expediente sin abrir el
// modal (envío por LOTE al Sujeto Obligado). El representante que firma se inyecta
// por opts (Slice 4: sale del Sujeto Obligado del lote del expediente).
// ============================================================
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';
import { calcCifo } from './calcCifo';

const PAGE_PADDING = '93px 95px 19px 113px';

const PDF_CSS = `
body { margin: 0; padding: 0; }
.doc-page {
    font-family: 'Arial MT', Arial, Helvetica, sans-serif;
    font-size: 12pt;
    color: #000;
    background: white;
    width: 794px;
    height: 1122px;
    padding: ${PAGE_PADDING};
    box-sizing: border-box;
    page-break-after: always;
    display: flex;
    flex-direction: column;
}
.doc-page:last-child { page-break-after: avoid; }
@page { size: A4; margin: 0; }
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12pt; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; line-height: 1.3; }
th { font-weight: normal; text-align: center; font-size: 11pt; padding: 2px 3px; }
td.lbl { background-color: #f2f2f2; }
.sec { font-size:12pt; font-weight:normal; text-align:center; margin:16px 0 10px; }
.p { font-size:12pt; line-height:1.45; margin-bottom:6px; text-align:justify; }
.formula { font-size:12pt; margin:10px 0 10px 20px; line-height:1.6; }
.doc-hr { border:none; border-top:1px solid #000; width:200px; margin:10px 0 3px 0; }
.fn { font-size:8pt; line-height:1.3; margin-top:1px; text-align:justify; }
.spacer { flex:1; }
.calc-table-group { display: flex; gap: 12px; margin-bottom: 12px; justify-content: space-between; align-items: flex-start; }
.calc-table { border-collapse: collapse; font-size: 11pt; }
.calc-table th, .calc-table td { border: 1px solid #000; padding: 4px 2px; text-align: center; font-weight: normal; }
.calc-table th { background-color: #f2f2f2; }
.grey-row td { background-color:#d9d9d9; font-style:italic; font-weight: normal !important; }
`;

// Representante por defecto (compatibilidad). En producción se inyecta el del S.O.
const REPRESENTANTE_DEFAULT = { nombre: 'Pedro José López Montero', nif: '06239730-Z' };

export function buildFichaRes060Html(expediente, results = {}, opts = {}) {
    const inst = expediente.instalacion || {};
    const doc = expediente.documentacion || {};
    const cee = expediente.cee || {};
    const ceeFinal = cee.cee_final || {};

    const aeKwh = Math.round(results?.savingsKwh || 0).toLocaleString('es-ES');
    const dcal = (parseFloat(ceeFinal.demandaCalefaccion) || 0).toFixed(2).replace('.', ',');
    const superficieAcs = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = superficieAcs.toFixed(2).replace('.', ',');

    // Demanda de ACS — DEBE coincidir con la del Certificado CIFO (CertificadoCifoModal.jsx).
    // Misma lógica: por defecto modo 'xml' (demandaACS · superficie); en modo CTE, fórmula por personas.
    const acsMode = cee.acs_method || 'xml';
    const numPeopleAcs = (parseInt(cee.num_rooms) || 4) + 1;
    let dacsValue = 0;
    if (acsMode === 'xml') {
        dacsValue = (parseFloat(ceeFinal.demandaACS) || 0) * superficieAcs;
    } else {
        dacsValue = 28 * numPeopleAcs * 0.001162 * 365 * 46;
    }
    const dacsStr = dacsValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const etaBoiler = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId)?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    const scopCal = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCal ? scopCal.toFixed(2).replace('.', ',') : '—';

    // SCOP_dhw — DEBE coincidir con el Certificado CIFO (CertificadoCifoModal.jsx):
    // tieneAcs = solo el toggle cambio_acs; el SCOP se toma de la aerotermia de
    // calefacción si es la misma, o de la de ACS en caso contrario.
    const tieneAcs = inst.cambio_acs !== false;
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    const formatFecha = (isoDate) => {
        if (!isoDate) return '—';
        const d = new Date(isoDate + 'T00:00:00');
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
    };
    // Recalculado en vivo (igual que DocumentacionModule): el campo persistido
    // documentacion.fecha_inicio_cifo/fecha_fin_cifo puede quedar desfasado.
    const cifoDates060 = calcCifo(doc);
    // Mismos fallbacks que el CIFO (CertificadoCifoModal.jsx) para que la fecha coincida.
    const fechaInicio = formatFecha(cifoDates060.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial);
    const fechaFin = formatFecha(cifoDates060.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final);

    const REPRESENTANTE_NOMBRE = opts.representanteNombre || REPRESENTANTE_DEFAULT.nombre;
    const REPRESENTANTE_NIF = opts.representanteNif || REPRESENTANTE_DEFAULT.nif;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${PDF_CSS}</style>
</head><body>

<!-- PAGE 1 -->
<div class="doc-page">
<table style="margin-bottom:16px">
<tbody>
<tr style="background-color:#f2f2f2"><td style="width:15%">Ficha</td><td><strong>RES060: Sustitución de caldera de combustión por una bomba de calor de accionamiento eléctrico.</strong></td></tr>
<tr><td>Código</td><td>RES060</td></tr>
<tr><td>Versión</td><td>V1.1</td></tr>
<tr><td>Sector</td><td>Residencial</td></tr>
</tbody>
</table>

<div class="sec">1. ÁMBITO DE APLICACIÓN</div>
<div class="p">Sustitución<sup>1</sup> de la caldera de combustión en un edificio de uso residencial privado<sup>2</sup> por una bomba de calor de accionamiento eléctrico tipo aire-aire, aire-agua, agua-agua, tierra-agua o tierra-aire para calefacción y/o agua caliente sanitaria (ACS). La actuación no afecta a los elementos terminales que configuran la instalación térmica.</div>
<div class="p">No son aplicables las bombas de calor cuyo compresor esté accionados térmicamente.</div>

<div class="sec">2. REQUISITOS</div>
<div class="p">Esta ficha no establece requisitos específicos, lo que en ningún caso exonera del cumplimiento de los requisitos de obligado cumplimiento establecidos en la normativa vigente: Reglamento de Instalaciones Térmicas en los Edificios (RITE), Reglamento europeo sobre los gases fluorados<sup>3</sup> u otras disposiciones en este Código Técnico de Edificación (CTE), ámbito de aplicación.</div>

<div class="sec">3. CÁLCULO DEL AHORRO DE ENERGÍA</div>
<div class="p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula">&nbsp;&nbsp;&nbsp;AE<sub>TOTAL</sub> = F<sub>P</sub> · [ (D<sub>CAL</sub> · S ) · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>bdc</sub></sub>) + D<sub>ACS</sub> · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>dhw</sub></sub>)]</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>1</sup> Ver Anexo III para aquellos casos donde la caldera de combustión se mantenga para situaciones de emergencia, fortuita o de respaldo cuando las condiciones climáticas lo requieran en las zonas climáticas D1, D2, D3 y F1</div>
<div class="fn"><sup>2</sup> "Uso residencial privado" según el Anejo A "Terminología" del CTE DB HE (Documento Básico de Ahorro de Energía).</div>
<div class="fn"><sup>3</sup> Reglamento (UE) n.° 517/2014 del Parlamento Europeo y del Consejo, de 16 de abril de 2014 sobre los gases fluorados de efecto invernadero y por el que se deroga el Reglamento (CE) n.° 842/2006.</div>
</div>

<!-- PAGE 2 -->
<div class="doc-page">
<div class="p">Donde:</div>
<table style="border:none">
<tbody>
<tr><td style="width:13%;text-align:left;border:none">F<sub>P</sub></td><td style="text-align:left;border:none">Factor de ponderación<sup>4</sup></td><td style="width:16%;text-align:left;border:none">1</td></tr>
<tr><td style="text-align:left;border:none">D<sub>cal</sub></td><td style="text-align:left;border:none">Demanda de energía en calefacción del edificio or vivienda según certificado de eficiencia energética antes de la actuación</td><td style="text-align:left;border:none">kWh/m<sup>2</sup> · año</td></tr>
<tr><td style="text-align:left;border:none">S</td><td style="text-align:left;border:none">Superficie útil habitable del edificio or vivienda</td><td style="text-align:left;border:none">m<sup>2</sup></td></tr>
<tr><td style="text-align:left;border:none">D<sub>ACS</sub></td><td style="text-align:left;border:none">Demanda de energía en agua caliente sanitaria del edificio or vivienda según certificado de eficiencia energética antes de la actuación</td><td style="text-align:left;border:none">kWh/año</td></tr>
<tr><td style="text-align:left;border:none">η<sub>i</sub></td><td style="text-align:left;border:none">Rendimiento de caldera combustible fósil<sup>5</sup> sobre energía final referido a PCS<sup>6, 7</sup></td><td style="text-align:left;border:none">0,92</td></tr>
<tr><td style="text-align:left;border:none">SCOP</td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba calor en calefacción<sup>8</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none"><em>SCOP<sub>dhw</sub></em></td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba de calor en ACS<sup>9</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none">AE<sub>TOTAL</sub></td><td style="text-align:left;border:none">Ahorro anual de energía final total</td><td style="text-align:left;border:none">kWh/año</td></tr>
</tbody>
</table>

<div class="sec">4. RESULTADO DEL CÁLCULO</div>

<div class="calc-table-group" style="width: 100%; display: flex; justify-content: space-between">
    <table class="calc-table" style="width: 72%">
        <thead>
            <tr><th>F<sub>p</sub></th><th>D<sub>CAL</sub></th><th>S</th><th>D<sub>ACS</sub></th><th>η<sub>i</sub></th><th>SCOP</th><th>SCOP<sub>dhw</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>1</td><td>${dcal}</td><td>${sStr}</td><td>${dacsStr}</td><td>${etaStr}</td><td>${scopCalStr}</td><td>${scopAcsStr}</td></tr>
        </tbody>
    </table>

    <table class="calc-table" style="width: 16%">
        <thead>
            <tr><th>AE<sub>TOTAL</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>${aeKwh}</td></tr>
        </tbody>
    </table>

    <table class="calc-table" style="width: 8%">
        <thead>
            <tr><th><em>D<sub>i</sub></em></th></tr>
        </thead>
        <tbody>
            <tr><td>15</td></tr>
        </tbody>
    </table>
</div>

<table style="border:none; margin-bottom:12px"><tbody>
<tr class="grey-row" style="border:none">
    <td style="width:8%; border:none"><em>D<sub>i</sub></em></td>
    <td style="border:none"><em>Duración indicativa de la actuación<sup>10</sup></em></td>
    <td style="text-align:left; width:12%; border:none"><em>años</em></td>
</tr>
</tbody></table>

<table><tbody>
<tr><td class="lbl" style="width:38%">Fecha inicio actuación</td><td>${fechaInicio}</td></tr>
<tr><td class="lbl">Fecha fin actuación</td><td>${fechaFin}</td></tr>
</tbody></table>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>4</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
<div class="fn"><sup>5</sup> Apartado 4.5 del Documento básico de Ahorro de Energía del Código Técnico de la Edificación (DB HE0 CTE).</div>
<div class="fn"><sup>6</sup> Para la conversión de PCI a PCS se usará la fórmula (PCS = PCI x F<sub>conv</sub>). Para gas natural se utilizará el factor de conversión de F<sub>conv</sub>= 1,106, para gasóleo F<sub>conv</sub>= 1,059, para propano F<sub>conv</sub>= 1,087 y para butano F<sub>conv</sub>= 1,083, según Tabla CB-01 Poderes caloríficos de los combustibles del documento "Diseño de centrales de calor eficientes".<br>https://www.idae.es/uploads/documentos/documentos_11_Guia_tecnica_de_diseno_de_centrales_de_calor_eficientes_e63f312e.pdf</div>
<div class="fn"><sup>7</sup> O alternativamente el valor de la última inspección.</div>
<div class="fn"><sup>8</sup> Ver Anexos III y IV. En caso de secuencia de varias bombas de calor, el SCOP utilizado en esta expresión será el ponderado, en el caso de ser de diferentes características.</div>
<div class="fn"><sup>9</sup> Ver Anexo IV y V de condiciones generales para cálculo de la eficiencia estacional anual en lo relativo al calentamiento de ACS.</div>
<div class="fn"><sup>10</sup> Según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética, o en su defecto a criterio de la persona técnica responsable.</div>
</div>

<!-- PAGE 3 -->
<div class="doc-page">
<table style="margin-bottom:20px"><tbody>
<tr><td style="width:38%;background-color:#f2f2f2">Representante del solicitante</td><td>${REPRESENTANTE_NOMBRE}</td></tr>
<tr><td style="background-color:#f2f2f2">NIF/NIE</td><td>${REPRESENTANTE_NIF}</td></tr>
<tr><td style="background-color:#f2f2f2">Firma electrónica</td><td></td></tr>
</tbody></table>

<div class="sec">5. DOCUMENTACIÓN PARA JUSTIFICAR LOS AHORROS DE LA ACTUACIÓN Y SU REALIZACIÓN</div>

<div class="p" style="text-indent:28px">1. Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
<div class="p" style="text-indent:28px">2. Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación de ahorro de energía según el modelo del Anexo I de esta ficha.</div>
<div class="p" style="text-indent:28px">3. Facturas justificativas de la inversión realizada<sup>11</sup> que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
<div class="p" style="text-indent:28px">4. Informe fotográfico de la instalación térmica antes y después de la actuación.</div>
<div class="p" style="text-indent:28px">5. Certificado de la instalación de la empresa instaladora donde se detallen los valores de las variables de la fórmula de cálculo del ahorro de energía del apartado 3.</div>
<div class="p" style="text-indent:28px">6. Copia de la comunicación<sup>12</sup> de puesta en funcionamiento de la instalación térmica, no industrial, presentada en el registro habilitado por el órgano competente de la comunidad autónoma.</div>
<div class="p" style="text-indent:28px">7. Certificado final de eficiencia energética del edificio<sup>13</sup> con el justificante de registro. Alternativamente se admitirá el certificado correspondiente al estado previo justo antes del inicio de la actuación, con el justificante de registro, y que incluya como mejora la actuación objeto del ahorro energético.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>11</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
<div class="fn"><sup>12</sup> Si la potencia no es superior a 70 kW, podrá sustituirse la comunicación por el acta de puesta en servicio, si la instalación térmica ya está inscrita en el registro habilitado y la sustitución es total no parcial de la caldera.</div>
<div class="fn"><sup>13</sup> Para la elaboración del certificado se debe emplear una herramienta informática de las registradas como documentos reconocidos para la certificación de la eficiencia energética de los edificios.</div>
</div>

</body></html>`;
}
