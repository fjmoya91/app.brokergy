// ============================================================
// fichaTer100Html.js — Generador del HTML de la Ficha TER100 (PDF)
//
// La FICHA OFICIAL del programa (la que firma el representante del solicitante y
// viaja al Sujeto Obligado). Es una RÉPLICA de `plantillas/Ficha TER100.pdf`:
// mismos saltos de página, mismos textos y notas al pie, subtítulos centrados en
// cursiva y fórmulas centradas con la fracción apilada.
//
// Hermana de fichaRes060Html.js / fichaRes093Html.js / fichaRes080Html.js: mismo
// contrato (expediente + opts con el representante que firma, que sale del Sujeto
// Obligado del lote) y misma geometría de página, medida sobre las dos plantillas
// con PyMuPDF y verificada idéntica en ambas:
//   · A4 (595,2 × 842 pt) · Arial 12pt · interlineado 20,7 pt (= 1,725)
//   · margen izq. 85,1 pt (113 px) · borde der. 520,8 pt (99 px de margen)
//   · notas al pie a 8 pt, precedidas de una raya de 144 pt (192 px)
//
// SALTOS DE PÁGINA (los de la plantilla real, no se pueden mover: el verificador
// compara la ficha con el modelo oficial):
//   1. Cabecera + ámbito + requisitos + "En calefacción" + intro de la fórmula
//   2. Fórmula AE_C + sus variables + tabla de resultado + "En ACS" + fórmula
//      AE_ACS + inicio de sus variables (F_P)
//   3. Resto de variables de ACS + tabla de resultado + "En CAP" + fórmula AE_CAP
//      + inicio de sus variables
//   4. Fin de variables CAP + tabla de resultado + apartado 4 (resultado total,
//      fechas, representante) + apartado 5 con el punto 1
//   5. Puntos 2 a 6 de la documentación
//
// La diferencia de fondo con RES060: la ficha del terciario no da un único
// AE_TOTAL, sino TRES apartados de cálculo con su propia fórmula y su propia tabla
// de resultado (calefacción · ACS · calentamiento de piscina), y el total del
// apartado 4 es la suma de los que apliquen. Los sumandos fuera del alcance de la
// actuación se imprimen como "no aplica", no como 0: el verificador tiene que ver
// que la actuación no alcanzaba ese servicio, no que el cálculo dio cero.
//
// Los números salen de logic/ter100.js (la misma derivación que el CIFO y el panel
// económico), así que ficha y certificado nunca pueden contradecirse.
//
// Imports CON extensión: además de Vite, este módulo tiene que poder cargarse por
// import() dinámico desde Node (igual que cifoDoc.js) si algún día la ficha se
// genera server-side. Node ESM no resuelve rutas sin extensión.
// ============================================================
import { deriveTer100Vars, TER100_VIDA_UTIL } from './ter100.js';
import { calcCifo } from './calcCifo.js';

// Márgenes medidos sobre `plantillas/Ficha TER100.pdf` con PyMuPDF y convertidos a
// px (96dpi): borde sup. de la tabla en y=70,9pt → 94px · texto de 85,1 a 520,8pt
// → 113px izq. y 99px der. · margen inf. 0,49cm → 19px. El ancho de texto
// resultante (582px) es el que hace que las líneas rompan donde rompen en el
// original: si se cambia, los párrafos y las notas al pie dejan de coincidir.
const PAGE_PADDING = '94px 99px 19px 113px';

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

/* Tablas con recuadro (cabecera, resultado, fechas, representante) */
table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 12pt; }
td, th { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; line-height: 1.3; }
th { font-weight: normal; text-align: center; font-size: 12pt; padding: 3px; }
td.lbl { background-color: #f2f2f2; }
/* Solo la tabla de cabecera: sus etiquetas van a 10pt en la plantilla. */
table.head td.lbl { font-size: 10pt; }

/* Bloques "Donde:" — tablas SIN recuadro, alineadas a la izquierda. */
table.vars { margin-bottom: 12px; }
table.vars td { border: none; text-align: left; vertical-align: top; padding: 3px 4px; line-height: 1.15; }
table.vars.small { font-size: 10pt; }

/* Tablas de resultado del cálculo: se agrupan en fila, con hueco entre ellas. */
.calc-group { display: flex; gap: 0; margin-bottom: 12px; align-items: flex-start; }
.calc-table { border-collapse: collapse; font-size: 12pt; margin-bottom: 0; }
.calc-table th, .calc-table td { border: 1px solid #000; padding: 3px 2px; text-align: center; font-weight: normal; line-height: 1.3; }
.calc-table th { background-color: #f2f2f2; }
.calc-gap { flex: none; }

/* Fila gris de la vida útil D_i: sin recuadro, sombreada. */
.grey-row td { background-color: #d9d9d9; border: none; }

.sec { font-size: 12pt; font-weight: normal; text-align: center; margin: 16px 0 10px; }
/* Subtítulos de cada servicio ("En calefacción"…): CENTRADOS y en CURSIVA. */
.svc { font-size: 12pt; font-style: italic; text-align: center; margin: 18px 0 10px; }
.p { font-size: 12pt; line-height: 1.725; margin-bottom: 6px; text-align: justify; }
/* Sangrías de párrafo de la plantilla: 18pt (24px) y 36pt (48px). */
.p-in1 { padding-left: 24px; }
.p-in2 { padding-left: 48px; }
.p-num { text-indent: 24px; }
.donde { font-size: 12pt; line-height: 1.725; margin-bottom: 8px; }
.donde-in1 { padding-left: 24px; }

/* Fórmulas: centradas, con la fracción apilada y paréntesis estirados. */
.formula { font-size: 12pt; text-align: center; margin: 16px 0 14px; line-height: 1.2; }
.frac { display: inline-block; vertical-align: middle; text-align: center; margin: 0 2px; }
.frac .num { display: block; border-bottom: 1px solid #000; padding: 0 5px; }
.frac .den { display: block; padding: 0 5px; }
.paren { display: inline-block; transform: scaleY(2.2); margin: 0; }

.doc-hr { border: none; border-top: 1px solid #000; width: 192px; margin: 10px 0 3px 0; }
.fn { font-size: 8pt; line-height: 1.5; margin-top: 1px; text-align: justify; }
.spacer { flex: 1; }
`;

// Representante por defecto (compatibilidad). En producción se inyecta el del S.O.
const REPRESENTANTE_DEFAULT = { nombre: 'Pedro José López Montero', nif: '06239730-Z' };

const NO_APLICA = 'no aplica';

const dec2 = (v) => (Number(v) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ent = (v) => Math.round(Number(v) || 0).toLocaleString('es-ES');
const coma2 = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');

const formatFecha = (isoDate) => {
    if (!isoDate) return '—';
    const d = new Date(isoDate + 'T00:00:00');
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).replace('.', '');
};

/** Fracción apilada (numerador sobre denominador con raya), como en la plantilla. */
const frac = (num, den) => `<span class="frac"><span class="num">${num}</span><span class="den">${den}</span></span>`;
const parenOpen = '<span class="paren">(</span>';
const parenClose = '<span class="paren">)</span>';

/**
 * Variables ya formateadas para la ficha. Se expone aparte de la plantilla para
 * que el modal pueda enseñar las mismas cifras en su cabecera sin recalcularlas.
 */
export function deriveFichaTer100(expediente) {
    const exp = expediente || {};
    const doc = exp.documentacion || {};
    const ter = deriveTer100Vars(exp);

    // Mismos fallbacks de fecha que el CIFO, para que ambos documentos coincidan.
    const fechas = calcCifo(doc);

    return {
        ter,
        eta: coma2(ter.boilerEff),
        // Fuera del alcance → "no aplica" (no 0): la ficha debe dejar ver el alcance.
        dcal: ter.alcance.calefaccion ? coma2(ter.dcalRaw) : NO_APLICA,
        s: ter.alcance.calefaccion ? coma2(ter.sRaw) : NO_APLICA,
        dacs: ter.alcance.acs ? dec2(ter.dacsRaw) : NO_APLICA,
        dcap: ter.alcance.piscina ? dec2(ter.dcap) : NO_APLICA,
        scopCal: ter.alcance.calefaccion ? (ter.scopCal ? coma2(ter.scopCal) : '—') : NO_APLICA,
        scopAcs: ter.alcance.acs ? (ter.scopAcs ? coma2(ter.scopAcs) : '—') : NO_APLICA,
        scopPool: ter.alcance.piscina ? (ter.scopPool ? coma2(ter.scopPool) : '—') : NO_APLICA,
        aeCal: ter.alcance.calefaccion ? ent(ter.savings.aeCal) : NO_APLICA,
        aeAcs: ter.alcance.acs ? ent(ter.savings.aeAcs) : NO_APLICA,
        aeCap: ter.alcance.piscina ? ent(ter.savings.aeCap) : NO_APLICA,
        aeTotal: ent(ter.savingsKwh),
        vidaUtil: TER100_VIDA_UTIL,
        fechaInicio: formatFecha(fechas.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial),
        fechaFin: formatFecha(fechas.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final),
    };
}

/**
 * Cuerpo del documento (las 5 páginas, sin <html>/<head>). Lo usa el modal para
 * previsualizar exactamente el mismo contenido que sale en el PDF.
 */
export function buildFichaTer100Body(expediente, opts = {}) {
    const d = deriveFichaTer100(expediente);
    const rep = opts.representanteNombre || REPRESENTANTE_DEFAULT.nombre;
    const repNif = opts.representanteNif || REPRESENTANTE_DEFAULT.nif;

    return `
<!-- ══════════ PÁGINA 1 · Ámbito, requisitos y fórmula en calefacción ══════════ -->
<div class="doc-page">
<table class="head" style="margin-bottom:16px">
<tbody>
<tr><td class="lbl" style="width:22%">Ficha</td><td class="lbl"><strong>TER100: Sustitución de caldera de combustión existente por bomba de calor de accionamiento eléctrico.</strong></td></tr>
<tr><td class="lbl">Código</td><td>TER100</td></tr>
<tr><td class="lbl">Versión</td><td>V1.1</td></tr>
<tr><td class="lbl">Sector</td><td>Terciario</td></tr>
</tbody>
</table>

<div class="sec">1.&nbsp; ÁMBITO DE APLICACIÓN</div>
<div class="p">Sustitución total de caldera de combustión de una instalación térmica (calefacción y/o agua caliente sanitaria y/o calentamiento de agua de piscina o similares) en un edificio del sector terciario (hoteles, restaurantes, hospitales, centros educativos, bibliotecas, centros culturales, oficinas, centros comerciales, etc.) por una bomba de calor de accionamiento eléctrico tipo aire-aire, aire-agua, salmuera-agua, agua-agua o combinadas, no afectando la actuación a los elementos terminales que configuran la instalación térmica en calefacción o refrigeración.</div>
<div class="p">Esta ficha no es aplicable a las bombas de calor cuyo compresor esté accionado térmicamente.</div>

<div class="sec">2.&nbsp; REQUISITOS</div>
<div class="p">Esta ficha no establece requisitos específicos, lo que en ningún caso exonera del cumplimiento de los requisitos de obligado cumplimiento establecidos en la normativa vigente: Reglamento de Instalaciones Térmicas en los Edificios (RITE), Reglamento europeo sobre los gases fluorados<sup>1</sup> u otras disposiciones en este ámbito de aplicación.</div>

<div class="sec">3.&nbsp; CÁLCULO DEL AHORRO DE ENERGÍA</div>
<div class="svc">En calefacción</div>
<div class="p">El ahorro de energía se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>1</sup> Reglamento (UE) n.º 517/2014 del Parlamento Europeo y del Consejo, de 16 de abril de 2014 sobre los gases fluorados de efecto invernadero y por el que se deroga el Reglamento (CE) n.º 842/2006.</div>
</div>

<!-- ══════════ PÁGINA 2 · Variables de calefacción y fórmula de ACS ══════════ -->
<div class="doc-page">
<div class="formula">AE<sub>C</sub> = ${parenOpen}${frac('1', 'η<sub>i</sub>')} - ${frac('1', 'SCOP')}${parenClose}&middot; D<sub>C</sub> &middot; S &middot; F<sub>P</sub></div>

<div class="donde">Donde:</div>
<table class="vars" style="margin-top:26px">
<tbody>
<tr><td style="width:15%">η<sub>i</sub></td><td>Rendimiento del equipo sustituido según ficha técnica<sup>2</sup> referido a PCI<sup>3, 4</sup></td><td style="width:17%">(tanto por uno)</td></tr>
<tr><td>SCOP</td><td>Coeficiente de rendimiento estacional de la bomba de calor en calefacción<sup>5</sup> según ficha técnica</td><td>W/W</td></tr>
<tr><td>D<sub>c</sub></td><td>Demanda de energía en calefacción del edificio según certificado de eficiencia energética antes de la actuación<sup>6</sup></td><td>kWh/año·m<sup>2</sup></td></tr>
<tr><td>S</td><td>Superficie útil habitable del edificio</td><td>m<sup>2</sup></td></tr>
<tr><td colspan="3">&nbsp;</td></tr>
<tr><td>AE<sub>C</sub></td><td>Ahorro anual de energía final en calefacción</td><td>kWh/año</td></tr>
</tbody>
</table>

<div class="calc-group">
    <table class="calc-table" style="width:80.5%">
        <thead><tr><th style="width:20%">η<sub>i</sub></th><th style="width:20%">SCOP</th><th style="width:20%">D<sub>C</sub></th><th style="width:20%">S</th><th style="width:20%">F<sub>p</sub></th></tr></thead>
        <tbody><tr><td>${d.eta}</td><td>${d.scopCal}</td><td>${d.dcal}</td><td>${d.s}</td><td>1</td></tr></tbody>
    </table>
    <div class="calc-gap" style="width:1.5%"></div>
    <table class="calc-table" style="width:18%">
        <thead><tr><th>AE<sub>C</sub></th></tr></thead>
        <tbody><tr><td>${d.aeCal}</td></tr></tbody>
    </table>
</div>

<div class="svc">En agua caliente sanitaria (ACS)</div>
<div class="p">El ahorro de energía en ACS se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula">AE<sub>ACS</sub> = ${parenOpen}${frac('1', 'η<sub>i</sub>')} - ${frac('1', 'SCOP<sub>dhw</sub>')}${parenClose}&middot; D<sub>ACS</sub> &middot; F<sub>P</sub></div>

<div class="donde">Donde:</div>
<table class="vars">
<tbody>
<tr><td style="width:18.5%">F<sub>P</sub></td><td>Factor de ponderación<sup>7</sup></td><td style="width:14%">1</td></tr>
</tbody>
</table>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>2</sup> Ver anexo VIII.</div>
<div class="fn"><sup>3</sup> Para la conversión de PCI a PCS se usará la formula (PCS = PCI x F<sub>conv</sub>). Para gas natural se utilizará el factor de conversión de F<sub>conv</sub> = 1,106, para gasóleo F<sub>conv</sub> = 1,059, para propano F<sub>conv</sub>= 1,087 y para butano F<sub>conv</sub>= 1,083, según Tabla CB-01 Poderes caloríficos de los combustibles del documento “Diseño de centrales de calor eficientes”.<br>https://www.idae.es/uploads/documentos/documentos_11_Guia_tecnica_de_diseno_de_centrales_de_calor_eficientes_e53f312e.pdf</div>
<div class="fn"><sup>4</sup> O alternativamente el valor de la última inspección.</div>
<div class="fn"><sup>5</sup> Ver Anexos II y III. En caso de secuencia de varias bombas de calor, el SCOP utilizado en esta expresión será el ponderado, en el caso de ser de diferentes características.</div>
<div class="fn"><sup>6</sup> Demanda de proyecto o alternativamente el certificado de eficiencia energética del edificio.</div>
<div class="fn"><sup>7</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
</div>

<!-- ══════════ PÁGINA 3 · Variables de ACS y fórmula de piscina ══════════ -->
<div class="doc-page">
<table class="vars">
<tbody>
<tr><td style="width:18.5%">η<sub>i</sub></td><td>Rendimiento de la caldera sustituida según ficha técnica<sup>2</sup> referido a PCI<sup>3, 4</sup></td><td style="width:14%">(tanto por uno)</td></tr>
<tr><td>SCOP<sub>dhw</sub></td><td>Coeficiente de rendimiento estacional<sup>8</sup> de la bomba de calor en agua caliente sanitaria según ficha técnica<sup>9</sup></td><td>W/W</td></tr>
<tr><td>D<sub>ACS</sub></td><td>Demanda anual de energía en ACS<sup>10</sup></td><td>kWh/año</td></tr>
<tr><td>AE<sub>ACS</sub></td><td>Ahorro anual de energía final en ACS</td><td>kWh/año</td></tr>
</tbody>
</table>

<div class="calc-group">
    <table class="calc-table" style="width:64.7%">
        <thead><tr><th style="width:25%">F<sub>P</sub></th><th style="width:24.8%">η<sub>i</sub></th><th style="width:27.7%">SCOP<sub>dhw</sub></th><th style="width:22.5%">D<sub>ACS</sub></th></tr></thead>
        <tbody><tr><td>1</td><td>${d.eta}</td><td>${d.scopAcs}</td><td>${d.dacs}</td></tr></tbody>
    </table>
    <div class="calc-gap" style="width:3.2%"></div>
    <table class="calc-table" style="width:16%">
        <thead><tr><th>AE<sub>ACS</sub></th></tr></thead>
        <tbody><tr><td>${d.aeAcs}</td></tr></tbody>
    </table>
</div>

<div class="svc">En calentamiento de piscina (CAP)</div>
<div class="p p-in2">El ahorro de energía en el calentamiento de agua de piscina se medirá en términos de energía final, expresada en kWh/año, de acuerdo con la siguiente fórmula:</div>
<div class="formula" style="font-style:italic">AE<sub>CAP</sub>= ${parenOpen}${frac('1', 'η<sub>i</sub>')}-${frac('1', 'SCOP<sub>PWH</sub>')}${parenClose} &middot; D<sub>CAP</sub>&middot; F<sub>P</sub></div>

<div class="donde donde-in1">Donde:</div>
<table class="vars small">
<tbody>
<tr><td style="width:14%">η<sub>i</sub></td><td>Rendimiento de la caldera sustituida según ficha técnica<sup>2</sup> referido<sup>3, 4</sup> a PCS</td><td style="width:17%">(tanto por uno)</td></tr>
<tr><td>SCOP<sub>pwh</sub></td><td>Coeficiente de rendimiento estacional<sup>11</sup> de la bomba de calor para el calentamiento de piscinas (CAP)</td><td></td></tr>
<tr><td>D<sub>CAP</sub></td><td>Demanda anual de energía térmica para el calentamiento de agua de piscinas (CAP)<sup>12</sup></td><td>kWh/año</td></tr>
<tr><td>F<sub>p</sub></td><td>Factor de ponderación<sup>13</sup></td><td></td></tr>
</tbody>
</table>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>8</sup> Ver Anexo VII de condiciones generales para cálculo del coeficiente de eficiencia estacional sobre energía final, en lo relativo al calentamiento de ACS.</div>
<div class="fn"><sup>9</sup> Ver Anexo II.</div>
<div class="fn"><sup>10</sup> Ver Anexo V. Demanda anual de ACS.</div>
<div class="fn"><sup>11</sup> Ver Anexo VII de condiciones generales para cálculo del coeficiente de eficiencia estacional en lo relativo al calentamiento de agua de piscinas (CAP).</div>
<div class="fn"><sup>12</sup> Según datos de la instalación existente o según la metodología de cálculo indicada en el Pliego de Condiciones Técnicas de Instalaciones de Baja Temperatura, Anexo III, de IDAE.<br>https://www.idae.es/uploads/documentos/documentos_5654_ST_Pliego_de_Condiciones_Tecnicas_Baja_Temperatura_09_082ee24a.pdf</div>
<div class="fn"><sup>13</sup> Factor de ponderación para ajustar el valor de la demanda de energía estimado por métodos reconocidos al valor del consumo real de energía final.</div>
</div>

<!-- ══════════ PÁGINA 4 · Resultado del cálculo, fechas y firma ══════════ -->
<div class="doc-page">
<table class="vars small">
<tbody>
<tr><td style="width:14%">AE<sub>CAP</sub></td><td>Ahorro anual de energía final en el calentamiento de agua caliente de piscina (CAP)</td><td style="width:17%">kWh/año</td></tr>
</tbody>
</table>

<div class="calc-group">
    <table class="calc-table" style="width:64.7%">
        <thead><tr><th style="width:25%">F<sub>P</sub></th><th style="width:24.8%">η<sub>i</sub></th><th style="width:27.7%">SCOP<sub>pwh</sub></th><th style="width:22.5%">D<sub>CAP</sub></th></tr></thead>
        <tbody><tr><td>1</td><td>${d.eta}</td><td>${d.scopPool}</td><td>${d.dcap}</td></tr></tbody>
    </table>
    <div class="calc-gap" style="width:3.2%"></div>
    <table class="calc-table" style="width:16%">
        <thead><tr><th>AE<sub>CAP</sub></th></tr></thead>
        <tbody><tr><td>${d.aeCap}</td></tr></tbody>
    </table>
</div>

<div class="sec">4.&nbsp; RESULTADO DEL CÁLCULO</div>
<div class="p p-in1">El ahorro anual de energía total será la suma de los ahorros de energía final en calefacción, agua caliente sanitaria y/o calentamiento de piscina.</div>

<table class="vars">
<tbody>
<tr><td style="width:14%">AE<sub>C</sub></td><td>Ahorro anual de energía final en calefacción</td><td style="width:17%">kWh/año</td></tr>
<tr><td>AE<sub>ACS</sub></td><td>Ahorro anual de energía final en calentamiento de agua sanitaria (ACS)</td><td>kWh/año</td></tr>
<tr><td>AE<sub>CAP</sub></td><td>Ahorro anual de energía final en el calentamiento de agua caliente de piscina (CAP)</td><td>kWh/año</td></tr>
<tr><td>AE<sub>Total</sub></td><td>Ahorro anual de energía final total</td><td>kWh/año</td></tr>
</tbody>
</table>

<div class="calc-group">
    <table class="calc-table" style="width:65.1%">
        <thead><tr><th style="width:33.4%">AE<sub>C</sub></th><th style="width:33.3%">AE<sub>ACS</sub></th><th style="width:33.3%">AE<sub>CAP</sub></th></tr></thead>
        <tbody><tr><td>${d.aeCal}</td><td>${d.aeAcs}</td><td>${d.aeCap}</td></tr></tbody>
    </table>
    <div class="calc-gap" style="width:2.4%"></div>
    <table class="calc-table" style="width:24.2%">
        <thead><tr><th>AE<sub>TOTAL</sub></th></tr></thead>
        <tbody><tr><td>${d.aeTotal}</td></tr></tbody>
    </table>
    <div class="calc-gap" style="width:2.5%"></div>
    <table class="calc-table" style="width:5.8%">
        <thead><tr><th><em>D<sub>i</sub></em></th></tr></thead>
        <tbody><tr><td>${d.vidaUtil}</td></tr></tbody>
    </table>
</div>

<table class="vars" style="margin-bottom:12px"><tbody>
<tr class="grey-row">
    <td style="width:14%"><em>D<sub>i</sub></em></td>
    <td>Duración indicativa de la actuación</td>
    <td style="width:17%">años</td>
</tr>
</tbody></table>

<table><tbody>
<tr><td class="lbl" style="width:40%">Fecha inicio actuación</td><td>${d.fechaInicio}</td></tr>
<tr><td class="lbl">Fecha fin actuación</td><td>${d.fechaFin}</td></tr>
</tbody></table>

<table><tbody>
<tr><td class="lbl" style="width:33.3%">Representante del solicitante</td><td>${rep}</td></tr>
<tr><td class="lbl">NIF/NIE</td><td>${repNif}</td></tr>
<tr><td class="lbl">Firma electrónica</td><td></td></tr>
</tbody></table>

<div class="sec">5.&nbsp; DOCUMENTACIÓN PARA JUSTIFICAR LOS AHORROS DE LA ACTUACIÓN Y SU REALIZACIÓN</div>
<div class="p p-num">1.&nbsp; Ficha cumplimentada y firmada por el representante legal del solicitante de la emisión de CAE.</div>
</div>

<!-- ══════════ PÁGINA 5 · Resto de la documentación justificativa ══════════ -->
<div class="doc-page">
<div class="p p-num">2.&nbsp; Declaración responsable formalizada por el propietario inicial del ahorro de energía final referida a la solicitud y/u obtención de ayudas públicas para la misma actuación según el modelo del Anexo I de esta ficha.</div>
<div class="p p-num">3.&nbsp; Facturas justificativas<sup>14</sup> de la inversión realizada que incluyan una descripción detallada de los elementos principales (por ejemplo, aquellos de cuya ficha técnica se toman datos para calcular el ahorro).</div>
<div class="p p-num">4.&nbsp; Informe fotográfico de la instalación térmica antes y después de la instalación de la bomba de calor.</div>
<div class="p p-num">5.&nbsp; Certificado de la instalación de la empresa instaladora donde se detallen los valores de las variables de la fórmula de cálculo de ahorro de energía del apartado 3.</div>
<div class="p p-num">6.&nbsp; Cuando sea preceptivo deberá aportarse la copia de la comunicación de la puesta en servicio presentada en el registro habilitado por el órgano competente de la comunidad autónoma.</div>

<div class="spacer"></div>
<hr class="doc-hr">
<div class="fn"><sup>14</sup> Todas las facturas deben contener, como mínimo, los datos y requisitos exigidos por la Agencia Tributaria.</div>
</div>`;
}

/** CSS del documento — lo necesita el modal para previsualizar con el mismo aspecto. */
export function fichaTer100Css() {
    return PDF_CSS;
}

/** Documento completo listo para /api/pdf/generate y /api/pdf/save-to-drive. */
export function buildFichaTer100Html(expediente, opts = {}) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>${PDF_CSS}</style>
</head><body>${buildFichaTer100Body(expediente, opts)}</body></html>`;
}
