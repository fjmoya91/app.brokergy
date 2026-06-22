// ============================================================
// fichaRes093Html.js — Generador del HTML de la Ficha RES093 (PDF)
//
// Extraído de FichaRes093Modal para poder generarla por expediente sin abrir el
// modal (envío por LOTE al Sujeto Obligado). El representante que firma se inyecta
// por opts (sale del Sujeto Obligado del lote del expediente).
//
// Autocontenido: el ahorro (savingsKwh) se calcula con computeExpedienteFinancials
// y el resto de variables (Cb, etc.) con calculateHybridization, igual que el modal.
// ============================================================
import { BOILER_EFFICIENCIES, calculateHybridization } from '../../calculator/logic/calculation';
import { computeExpedienteFinancials } from './expedienteFinancials';

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

export function buildFichaRes093Html(expediente, opts = {}) {
    const op   = expediente.oportunidades || {};
    const inst = expediente.instalacion || {};
    const doc  = expediente.documentacion || {};
    const cee  = expediente.cee           || {};

    // ── Ahorro (savingsKwh) vía la fuente única de verdad ──
    const fin = computeExpedienteFinancials(expediente);
    const aeKwh = Math.round(fin.savingsKwh || 0).toLocaleString('es-ES');

    const ceeFinal = cee.cee_final || {};
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');

    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    const dacsStr = '2.731,40';

    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffEntry = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId);
    const etaBoiler = boilerEffEntry?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    const scopCal = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCal ? scopCal.toFixed(2).replace('.', ',') : '—';

    const tieneAcs = (inst.cambio_acs !== false) && (!!inst.aerotermia_acs?.aerotermia_db_id || !!inst.misma_aerotermia_acs);
    const scopAcsRaw = tieneAcs ? parseFloat(inst.aerotermia_acs?.scop || inst.aerotermia_cal?.scop || 0) : null;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    // ── Cb (coeficiente de cobertura por bivalencia) ──
    const opInputs = op.datos_calculo?.inputs || {};
    const q_net_heating = dcalRaw * sRaw;
    const hybridRes = calculateHybridization({
        demandAnnual: q_net_heating,
        zone: op.datos_calculo?.zona || 'D3',
        heatPumpPower: parseFloat(inst.potencia_bomba || opInputs.potenciaBomba) || 0
    });
    const cbVal = hybridRes?.cb ?? 1;
    const cbStr = cbVal.toFixed(3).replace('.', ',');

    const formatFecha = (isoDate) => {
        if (!isoDate) return '—';
        const d = new Date(isoDate + 'T00:00:00');
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
    };
    const fechaInicio = formatFecha(doc.fecha_inicio_cifo);
    const fechaFin    = formatFecha(doc.fecha_fin_cifo);

    const REPRESENTANTE_NOMBRE = opts.representanteNombre || REPRESENTANTE_DEFAULT.nombre;
    const REPRESENTANTE_NIF    = opts.representanteNif || REPRESENTANTE_DEFAULT.nif;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${PDF_CSS}</style>
</head><body>

<!-- PAGE 1 -->
<div class="doc-page">
<table style="margin-bottom:16px">
<tbody>
<tr style="background-color:#f2f2f2"><td style="width:15%">Ficha</td><td><strong>RES093: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3</strong></td></tr>
<tr><td>Código</td><td>RES093</td></tr>
<tr><td>Versión</td><td>V1.0</td></tr>
<tr><td>Sector</td><td>Residencial</td></tr>
</tbody>
</table>

<div class="sec">1. ÁMBITO DE APLICACIÓN</div>
<div class="p">Hibridación en modo paralelo de caldera/s de combustión existente/s en un edificio de uso residencial privado<sup>1</sup>, ubicado en zona climática D1, D2 o D3, con bomba de calor de accionamiento eléctrico tipo aire-aire, aire-agua o agua-agua o combinadas, para la calefacción y/o, agua caliente sanitaria (ACS).</div>
<div class="p">En esta ficha no es aplicable las bombas de calor cuyo compresor esté accionado térmicamente.</div>

<div class="sec">2. REQUISITOS</div>
<div class="p">La instalación térmica debe disponer de depósito de inercia o acumulador para el suministro de ACS y/o calefacción.</div>
<div class="p">Para poder asignar ahorros a cualquiera de los dos servicios previstos en la fórmula del apartado 3, éste debe operar en funcionamiento bivalente paralelo<sup>2</sup>.</div>

<div class="sec">3. CÁLCULO DEL AHORRO DE ENERGÍA</div>
<div class="p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula">&nbsp;&nbsp;&nbsp;AE<sub>TOTAL</sub> = F<sub>P</sub> · [ (D<sub>CAL</sub> · S ) · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP</sub>) + D<sub>ACS</sub> · (<sup>1</sup>/<sub>η<sub>i</sub></sub> - <sup>1</sup>/<sub>SCOP<sub>dhw</sub></sub>)] · C<sub>b</sub></div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>1</sup> "Uso residencial privado" según el Anejo A "Terminología" del CTE DB HE (Documento Básico de Ahorro de Energía").</div>
<div class="fn"><sup>2</sup> Es decir, la instalación hidráulica y el sistema de control deben haberse ejecutado especialmente para cada uno de los servicios para los que se consignen ahorros, buscando el aprovechamiento de los generadores con la máxima eficiencia para la/s bomba/s de calor, de tal modo que ésta/s trabaje/n de manera constante contra el punto más frío de la instalación y aportando la/s caldera/s sólo la energía necesaria para alcanzar la temperatura de consigna de impulsión, cuando sea requerida.</div>
</div>

<!-- PAGE 2 -->
<div class="doc-page">
<div class="p">Donde:</div>
<table style="border:none">
<tbody>
<tr><td style="width:13%;text-align:left;border:none">F<sub>P</sub></td><td style="text-align:left;border:none">Factor de ponderación<sup>3</sup></td><td style="width:16%;text-align:left;border:none">1</td></tr>
<tr><td style="text-align:left;border:none">D<sub>cal</sub></td><td style="text-align:left;border:none">Demanda de energía en calefacción del edificio según certificado de eficiencia energética antes de la actuación</td><td style="text-align:left;border:none">kWh/m<sup>2</sup> · año</td></tr>
<tr><td style="text-align:left;border:none">S</td><td style="text-align:left;border:none">Superficie útil habitable del edificio<sup>1</sup></td><td style="text-align:left;border:none">m<sup>2</sup></td></tr>
<tr><td style="text-align:left;border:none">D<sub>ACS</sub></td><td style="text-align:left;border:none">Demanda de energía<sup>4</sup> térmica en agua caliente sanitaria del edificio según certificado de eficiencia energética antes de la actuación o alternativamente conforme al anexo F del DB HE1 del CTE</td><td style="text-align:left;border:none">kWh/año</td></tr>
<tr><td style="text-align:left;border:none">η<sub>i</sub></td><td style="text-align:left;border:none">Rendimiento de caldera sobre energía referido<sup>5</sup> al PCS<sup>6</sup></td><td style="text-align:left;border:none">(en tanto por uno)</td></tr>
<tr><td style="text-align:left;border:none">SCOP</td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba de calor, en calefacción<sup>7</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none">SCOP<sub>dhw</sub></td><td style="text-align:left;border:none">Coeficiente de rendimiento estacional de la bomba de la bomba de calor en ACS<sup>8</sup></td><td style="text-align:left;border:none"></td></tr>
<tr><td style="text-align:left;border:none">C<sub>b</sub></td><td style="text-align:left;border:none">Coeficiente de cobertura por bivalencia<sup>9</sup> en paralelo</td><td style="text-align:left;border:none">(en tanto por uno)</td></tr>
<tr><td style="text-align:left;border:none">AE<sub>TOTAL</sub></td><td style="text-align:left;border:none">Ahorro anual de energía final total</td><td style="text-align:left;border:none">kWh/año</td></tr>
</tbody>
</table>

<div class="sec">4. RESULTADO DEL CÁLCULO</div>

<div class="calc-table-group" style="width: 100%; display: flex; justify-content: space-between">
    <table class="calc-table" style="width: 67%">
        <thead>
            <tr><th>F<sub>p</sub></th><th>D<sub>CAL</sub></th><th>S</th><th>D<sub>ACS</sub></th><th>η<sub>i</sub></th><th>SCOP</th><th>SCOP<sub>dhw</sub></th><th>C<sub>b</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>1</td><td>${dcal}</td><td>${sStr}</td><td>${dacsStr}</td><td>${etaStr}</td><td>${scopCalStr}</td><td>${scopAcsStr}</td><td>${cbStr}</td></tr>
        </tbody>
    </table>

    <table class="calc-table" style="width: 14%">
        <thead>
            <tr><th>AE<sub>TOTAL</sub></th></tr>
        </thead>
        <tbody>
            <tr><td>${aeKwh}</td></tr>
        </tbody>
    </table>

    <table class="calc-table" style="width: 7%">
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
<div class="fn"><sup>3</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
<div class="fn"><sup>4</sup> Alternativamente, en caso de sustitución parcial, por ejemplo, cuando se realiza un precalentamiento de un depósito previo al depósito de consumo, se considerará sólo la demanda de energía térmica necesaria para el precalentamiento. Esto es, el calentamiento desde la temperatura de red (DB HE4 del CTE) a la temperatura de consigna deseada en ese depósito.</div>
<div class="fn"><sup>5</sup> Para la conversión de PCI a PCS se usará la formula (PCS = PCI x F<sub>conv</sub>). Para gas natural se utilizará el factor de conversión de F<sub>conv</sub> = 1,106, para gasóleo F<sub>conv</sub> = 1,059, para propano F<sub>conv</sub>= 1,087 y para butano F<sub>conv</sub>= 1,083, según Tabla CB-01 Poderes caloríficos de los combustibles del documento "Diseño de centrales de calor eficientes". https://www.idae.es/uploads/documentos/documentos_11_Guia_tecnica_de_diseno_de_centrales_de_calor_eficientes_e53f312e.pdf</div>
<div class="fn"><sup>6</sup> O alternativamente el valor de la última inspección.</div>
<div class="fn"><sup>7</sup> Ver Anexo II. En caso de secuencia de varias bombas de calor, el SCOP utilizado en esta expresión será el ponderado, en el caso de ser de diferentes características.</div>
<div class="fn"><sup>8</sup> Ver Anexo II de condiciones generales para cálculo de la eficiencia estacional anual en lo relativo al calentamiento de ACS.</div>
<div class="fn"><sup>9</sup> El coeficiente de cobertura por bivalencia es el porcentaje de la demanda de energía térmica anual cubierta por bombas de calor cuando está combinada con generadores auxiliares (calderas) formando un sistema híbrido. Ver Anexo III. En caso de sustitución total C<sub>b</sub> = 1. El valor se expresará en tanto por uno con tres decimales.</div>
</div>

<!-- PAGE 3 -->
<div class="doc-page">
<table style="margin-bottom:20px"><tbody>
<tr><td style="width:38%;background-color:#f2f2f2">Representante del solicitante</td><td>${REPRESENTANTE_NOMBRE}</td></tr>
<tr><td style="background-color:#f2f2f2">NIF/NIE</td><td>${REPRESENTANTE_NIF}</td></tr>
<tr><td style="background-color:#f2f2f2">Firma electrónica</td><td></td></tr>
</tbody></table>

<div class="sec">5. DOCUMENTOS PARA LA JUSTIFICACIÓN DE LOS AHORROS DE LA ACTUACIÓN Y DE SU REALIZACIÓN</div>

<div class="p" style="text-indent:28px">1. Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
<div class="p" style="text-indent:28px">2. Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación de ahorro de energía según el modelo del Anexo I de esta ficha.</div>
<div class="p" style="text-indent:28px">3. Facturas justificativas de la inversión realizada<sup>11</sup> que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
<div class="p" style="text-indent:28px">4. Informe fotográfico del conjunto caldera/s y la/s bomba/s de calor antes y después de la actuación con identificación de los equipos afectados.</div>
<div class="p" style="text-indent:28px">5. Copia de la comunicación de la puesta en servicio presentada en el registro habilitado por el órgano competente de la comunidad autónoma.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>10</sup> Según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética, o en su defecto a criterio de la persona técnica responsable.</div>
<div class="fn"><sup>11</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
</div>

</body></html>`;
}
