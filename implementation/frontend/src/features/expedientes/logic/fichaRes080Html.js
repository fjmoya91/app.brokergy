// ============================================================
// fichaRes080Html.js — Generador del HTML de la Ficha RES080 (PDF)
//
// Extraído de FichaRes080Modal para poder generarla por expediente sin abrir el
// modal (envío por LOTE al Sujeto Obligado). El representante que firma se inyecta
// por opts (sale del Sujeto Obligado del lote del expediente).
//
// Autocontenido: calcula `results` por dentro con calculateRes080(...) a partir de
// expediente.cee, igual que la rama RES080 de computeExpedienteFinancials.
// ============================================================
import { calculateRes080 } from '../../calculator/logic/calculation';
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

export function buildFichaRes080Html(expediente, opts = {}) {
    const doc = expediente.documentacion || {};
    const cee = expediente.cee || {};

    // ── results vía calculateRes080 (misma rama que computeExpedienteFinancials) ──
    let results = {};
    if (cee.cee_inicial && cee.cee_final) {
        results = calculateRes080({
            xmlInicial: cee.cee_inicial,
            xmlFinal: cee.cee_final,
            combAcsInicial: cee.comb_acs_inicial,
            combAcsFinal: cee.comb_acs_final,
            combCalefaccionInicial: cee.comb_cal_inicial,
            combCalefaccionFinal: cee.comb_cal_final,
            combRefrigeracionInicial: cee.comb_ref_inicial,
            combRefrigeracionFinal: cee.comb_ref_final,
            superficieCustom: cee.superficie_custom
        }) || {};
    }

    // ── EFi / EFf / AETOTAL desde results (calculateRes080) ──
    const fmt = (val) => val !== null && val !== undefined
        ? Math.round(val).toLocaleString('es-ES')
        : '—';

    const eFiStr     = fmt(results?.totalEnergiaInicialAno);
    const eFfStr     = fmt(results?.totalEnergiaFinalAno);
    const aeTotalStr = fmt(results?.ahorroEnergiaFinalTotal || results?.savingsKwh);

    const formatFecha = (isoDate) => {
        if (!isoDate) return '—';
        const d = new Date(isoDate + 'T00:00:00');
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
    };
    // Recalculado en vivo (igual que DocumentacionModule): el campo persistido
    // documentacion.fecha_inicio_cifo/fecha_fin_cifo puede quedar desfasado.
    const cifoDates = calcCifo(doc);
    const fechaInicio = formatFecha(doc.fecha_inicio_res080 || cifoDates.inicio || doc.fecha_inicio_cifo);
    const fechaFin    = formatFecha(doc.fecha_fin_res080    || cifoDates.fin    || doc.fecha_fin_cifo);

    const REPRESENTANTE_NOMBRE = opts.representanteNombre || REPRESENTANTE_DEFAULT.nombre;
    const REPRESENTANTE_NIF    = opts.representanteNif || REPRESENTANTE_DEFAULT.nif;

    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${PDF_CSS}</style>
</head><body>

<!-- PAGE 1 -->
<div class="doc-page">
<table style="margin-bottom:16px">
<tbody>
<tr style="background-color:#f2f2f2"><td style="width:15%">Ficha</td><td><strong>RES080: Rehabilitación profunda de edificios de viviendas</strong></td></tr>
<tr><td>Código</td><td>RES080</td></tr>
<tr><td>Versión</td><td>V1.1</td></tr>
<tr><td>Sector</td><td>Residencial</td></tr>
</tbody>
</table>

<div class="sec">1. ÁMBITO DE APLICACIÓN</div>
<div class="p">Rehabilitación profunda de edificios existentes de uso residencial privado<sup>1</sup>.</div>

<div class="sec">2. REQUISITOS</div>
<div class="p">La rehabilitación debe afectar simultáneamente a la envolvente y al menos a una de las instalaciones térmicas: calefacción, agua caliente sanitaria (ACS), refrigeración, climatización y/o iluminación.</div>

<div class="sec">3. CÁLCULO DEL AHORRO DE ENERGÍA</div>
<div class="p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula" style="text-align:center; margin-left:0">AE<sub>TOTAL</sub> = F<sub>P</sub> · (EF<sub>i</sub> – EF<sub>f</sub>)</div>

<div class="p">Donde:</div>
<table style="border:none; margin-bottom:12px">
<tbody>
<tr><td style="width:13%;text-align:left;border:none">F<sub>P</sub></td><td style="text-align:left;border:none">Factor de ponderación<sup>2</sup></td><td style="width:16%;text-align:left;border:none">1</td></tr>
<tr><td style="text-align:left;border:none">EF<sub>i</sub></td><td style="text-align:left;border:none">Consumo de energía final anual del edificio antes de la actuación</td><td style="text-align:left;border:none">kWh/año</td></tr>
<tr><td style="text-align:left;border:none">EF<sub>f</sub></td><td style="text-align:left;border:none">Consumo de energía final anual del edificio después de la actuación</td><td style="text-align:left;border:none">kWh/año</td></tr>
<tr><td style="text-align:left;border:none">AE<sub>TOTAL</sub></td><td style="text-align:left;border:none">Ahorro anual de energía final total</td><td style="text-align:left;border:none">kWh/año</td></tr>
</tbody>
</table>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>1</sup> "Uso residencial privado" según el Anejo A "Terminología" del CTE DB HE (Documento Básico de Ahorro de Energía).</div>
<div class="fn"><sup>2</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
</div>

<!-- PAGE 2 -->
<div class="doc-page">
<div class="sec">4. RESULTADO DEL CÁLCULO</div>

<div class="calc-table-group" style="width: 100%; display: flex; justify-content: space-between">
    <table class="calc-table" style="width: 20%">
        <thead><tr><th>F<sub>P</sub></th></tr></thead>
        <tbody><tr><td>1</td></tr></tbody>
    </table>
    <table class="calc-table" style="width: 26%">
        <thead><tr><th>EF<sub>i</sub></th></tr></thead>
        <tbody><tr><td>${eFiStr}</td></tr></tbody>
    </table>
    <table class="calc-table" style="width: 26%">
        <thead><tr><th>EF<sub>f</sub></th></tr></thead>
        <tbody><tr><td>${eFfStr}</td></tr></tbody>
    </table>
    <table class="calc-table" style="width: 18%">
        <thead><tr><th>AE<sub>TOTAL</sub></th></tr></thead>
        <tbody><tr><td>${aeTotalStr}</td></tr></tbody>
    </table>
    <table class="calc-table" style="width: 8%">
        <thead><tr><th><em>D<sub>i</sub></em></th></tr></thead>
        <tbody><tr><td>15/25</td></tr></tbody>
    </table>
</div>

<table style="border:none; margin-bottom:12px"><tbody>
<tr class="grey-row" style="border:none">
    <td style="width:8%; border:none"><em>D<sub>i</sub></em></td>
    <td style="border:none"><em>Duración indicativa de la actuación<sup>3</sup></em></td>
    <td style="text-align:left; width:12%; border:none"><em>años</em></td>
</tr>
</tbody></table>

<table style="margin-bottom:20px"><tbody>
<tr><td class="lbl" style="width:38%">Fecha inicio actuación</td><td>${fechaInicio}</td></tr>
<tr><td class="lbl">Fecha fin actuación</td><td>${fechaFin}</td></tr>
</tbody></table>

<table style="margin-bottom:24px"><tbody>
<tr><td style="width:38%;background-color:#f2f2f2">Representante del solicitante</td><td>${REPRESENTANTE_NOMBRE}</td></tr>
<tr><td style="background-color:#f2f2f2">NIF/NIE</td><td>${REPRESENTANTE_NIF}</td></tr>
<tr><td style="background-color:#f2f2f2">Firma electrónica</td><td></td></tr>
</tbody></table>

<div class="sec">5. DOCUMENTACIÓN PARA JUSTIFICAR LOS AHORROS DE LA ACTUACIÓN Y SU REALIZACIÓN.</div>

<div class="p" style="text-indent:28px">1. Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
<div class="p" style="text-indent:28px">2. Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación de ahorro de energía según el modelo del Anexo I de esta ficha.</div>
<div class="p" style="text-indent:28px">3. Facturas justificativas de la inversión realizada<sup>4</sup> que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
<div class="p" style="text-indent:28px">4. Informe fotográfico del inmueble antes y después de la actuación con identificación de la superficie e instalaciones afectadas por la actuación.</div>
<div class="p" style="text-indent:28px">5. Certificado suscrito por el director o responsable de la obra, incluyendo:</div>
<div class="p" style="text-indent:56px">a) Enumeración y descripción de los elementos o equipos afectados.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>3</sup> Según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética, o en su defecto, a criterio de la persona técnica responsable. Valor requerido para fines administrativos (no utilizado en el cálculo del ahorro de energía).</div>
<div class="fn"><sup>4</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
</div>

<!-- PAGE 3 -->
<div class="doc-page">
<div class="p" style="text-indent:56px">b) Certificado/s de fin de obra o de puesta en funcionamiento de los elementos y/o las instalaciones térmicas afectadas.</div>
<div class="p" style="text-indent:56px">c) Los valores de las variables de la fórmula del cálculo de ahorro energético del apartado 3.</div>
<div class="p" style="text-indent:28px">6. Copia de la comunicación de puesta en funcionamiento de la instalación térmica sustituida ante el registro habilitado por el órgano competente de la comunidad autónoma.</div>
<div class="p" style="text-indent:28px">7. Certificado de eficiencia energética del edificio<sup>5</sup>, correspondiente al estado previo al inicio de la rehabilitación, con el justificante de registro.</div>
<div class="p" style="text-indent:28px">8. Certificado de eficiencia energética del edificio, emitido tras la actuación ejecutada, con justificante de registro, realizada con la misma herramienta informática que la utilizada para el certificado de eficiencia energética previo.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>5</sup> Para la elaboración del certificado se debe emplear una herramienta informática de las registradas como documentos reconocidos para la certificación de la eficiencia energética de los edificios.</div>
</div>

</body></html>`;
}
