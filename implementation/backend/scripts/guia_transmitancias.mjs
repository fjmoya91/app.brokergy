// ============================================================================
// guia_transmitancias.mjs — el PDF de la GUÍA DE TRANSMITANCIAS de BROKERGY.
//
//   node implementation/backend/scripts/guia_transmitancias.mjs [--salida=<ruta.pdf>]
//
// Desde el 08/10/2026 la Guía son los valores que CE3X 3.2 pone con «Estimados
// según antigüedad y zona climática», introducidos como «Conocidas» (decisión de
// Fran). Las cifras salen de la MISMA tabla que usan el `.cex` y la calculadora
// (frontend/.../calculator/logic/transmitanciasCe3x.js): el PDF no puede decir
// otra cosa que el código. Para cambiar un valor se cambia la tabla —que sale
// del oráculo de CE3X— y se vuelve a generar esto; nunca se edita el PDF.
//
// Sin `--salida`, deja `Guia_Transmitancias_CE3X_BROKERGY.pdf` en el directorio
// actual. Usa el Chrome local (pdfService.htmlToPdf). No toca Drive ni la BD.
// Ver docs/conocimiento/envolvente-ce3x/los-valores-por-defecto-de-ce3x-3-2-por-epoca-y-zona.md
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const T = await import(pathToFileURL(path.join(aqui,
    '../../frontend/src/features/calculator/logic/transmitanciasCe3x.js')).href);

const SALIDA = (process.argv.find(a => a.startsWith('--salida=')) || '').slice(9)
    || path.resolve('Guia_Transmitancias_CE3X_BROKERGY.pdf');
const VERSION = '08/10/2026';
const ANTERIOR = '17/03/2026';

// ─── La marca (como el croquis del CEE: kit de plantillas/marca) ─────────────
const MARCA_DIR = path.join(aqui, '..', 'plantillas', 'marca');
const b64 = (f) => fs.readFileSync(path.join(MARCA_DIR, f)).toString('base64');
const fuente = (fam, peso, f) => `@font-face{font-family:'${fam}';font-weight:${peso};font-style:normal;`
    + `src:url(data:font/woff;base64,${b64(f)}) format('woff');}`;
const FUENTES = [fuente('Montserrat', 600, 'Montserrat-SemiBold.woff'),
    fuente('Montserrat', 700, 'Montserrat-Bold.woff'),
    fuente('DM Sans', 400, 'DMSans-Regular.woff'),
    fuente('DM Sans', 500, 'DMSans-Medium.woff'),
    fuente('DM Sans', 700, 'DMSans-Bold.woff')].join('\n');
const LOGO = `data:image/png;base64,${b64('logo_horizontal_negro.png')}`;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const coma = (n) => Number(n).toFixed(2).replace('.', ',');

// ─── Los datos, de la tabla ──────────────────────────────────────────────────
const FILAS = ['fachada_aire', 'cubierta_plana', 'cubierta_inclinada', 'suelo_aire', 'suelo_terreno',
    'muro_terreno', 'cubierta_terreno', 'particion_vertical', 'particion_inferior', 'camara_sanitaria',
    'particion_bajo_cubierta', 'particion_superior_otro'];
const NOMBRE = {
    ...T.NOMBRE_CERRAMIENTO_CE3X,
    cubierta_plana: 'Cubierta plana (en contacto con el aire)',
    cubierta_inclinada: 'Cubierta inclinada (en contacto con el aire)',
    particion_inferior: 'Partición inferior: garaje o local',
    camara_sanitaria: 'Partición inferior: cámara sanitaria',
    particion_bajo_cubierta: 'Partición superior: bajo cubierta inclinada',
    particion_superior_otro: 'Partición superior: otro',
    particion_vertical: 'Partición vertical con espacio no habitable',
};
const TAB = T.TABLA_CE3X;
const ZONAS_NBE = ['V', 'X', 'Y', 'Z'];           // V = W en todos los cerramientos
const LETRAS = ['A', 'B', 'C', 'D', 'E'];

// Comprobaciones de lo que el texto AFIRMA, para que no se quede viejo en silencio.
for (const f of FILAS) {
    if (TAB[f].nbe.V.join() !== TAB[f].nbe.W.join()) throw new Error(`${f}: V ≠ W, la tabla del PDF las junta`);
    if (TAB[f].cte2006.alpha.join() !== TAB[f].cte2006.A.join()) throw new Error(`${f}: α ≠ A en 2007-2013`);
}
const masa = (f) => {
    const a = TAB[f].anterior[1];
    const resto = new Set([...Object.values(TAB[f].nbe), ...Object.values(TAB[f].cte2006),
        ...Object.values(TAB[f].cte2013)].map(v => v[1]));
    if (resto.size !== 1) throw new Error(`${f}: la masa cambia después de 1980`);
    const r = [...resto][0];
    return a === r ? `${r}` : `${a} · ${r}`;
};

const filaNbe = (f) => `<tr><td class="c">${esc(NOMBRE[f])}</td>`
    + `<td class="n ant">${coma(TAB[f].anterior[0])}</td>`
    + ZONAS_NBE.map(z => `<td class="n">${coma(TAB[f].nbe[z][0])}</td>`).join('')
    + `<td class="n m">${masa(f)}</td></tr>`;
const filaCte = (f) => `<tr><td class="c">${esc(NOMBRE[f])}</td>`
    + LETRAS.map(l => `<td class="n">${coma(TAB[f].cte2006[l][0])}</td>`).join('')
    + `<td class="n sep">${coma(TAB[f].cte2013.alpha[0])}</td>`
    + LETRAS.map(l => `<td class="n">${coma(TAB[f].cte2013[l][0])}</td>`).join('') + '</tr>';

const ANIOS = {
    Anterior: 'hasta 1979', 'NBE-CT-79': '1980 – 1997', 'NBE-CT-79_aPartir1998': '1998 – 2006',
    'C.T.E.': '2007 – 2013', 'CTE 2013': '2014 – 2020', Apartir2020: 'desde 2021',
    Otros: 'después de 2020, a elegir',
};
const EPOCA = { anterior: 'Antes de 1980', nbe: '1980 – 2007 · por zona NBE', cte2006: '2007 – 2013 · por zona HE-1',
    cte2013: 'Desde 2014 · por zona HE-1' };
const filasPeriodo = T.PERIODOS_CE3X.map(p => `<tr><td><b>${esc(p.etiqueta)}</b></td><td>${esc(ANIOS[p.valor])}</td>`
    + `<td>${esc(EPOCA[p.epoca])}</td></tr>`).join('');

const HE1 = ['α1-α4', 'A1', 'A2', 'B1', 'B2', 'A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3', 'E1'];
const porNbe = {};
for (const z of HE1) {
    const k = T.zonaNbe(z === 'α1-α4' ? 'alpha1' : z);
    (porNbe[k] ||= []).push(z);
}
const filasNbe = ['V', 'W', 'X', 'Y', 'Z'].map(k => `<tr><td><b>${k}</b></td><td>${esc((porNbe[k] || []).join(' · '))}</td></tr>`).join('');

// El ejemplo: una vivienda de 2003 en E1 con la localidad «Otro».
const ej = (c) => coma(T.uCe3x(c, { anio: 2003, zona: 'E1' }).u);
const ejD = (c) => coma(T.uCe3x(c, { anio: 2003, zona: 'D3' }).u);

// ─── El HTML ─────────────────────────────────────────────────────────────────
const cabecera = (n) => `
  <header><img src="${LOGO}" alt="BROKERGY"><span>Guía de Transmitancias para CE3X · Documento interno — Uso técnico</span></header>
  <footer><span>© BROKERGY — Soluciones Sostenibles para Eficiencia Energética, SL · Versión ${VERSION}</span><span>Pág. ${n}</span></footer>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
${FUENTES}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'DM Sans', sans-serif; color: #1A1A1A; font-size: 9.6pt; line-height: 1.42; }
.hoja { width: 210mm; height: 297mm; padding: 22mm 16mm 18mm; position: relative; page-break-after: always; overflow: hidden; }
.hoja:last-child { page-break-after: auto; }
header { position: absolute; top: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between;
         align-items: center; border-bottom: 1.5px solid #FFA000; padding-bottom: 2.2mm; font-size: 7.6pt; color: #6B7280; }
header img { height: 7mm; }
footer { position: absolute; bottom: 8mm; left: 16mm; right: 16mm; display: flex; justify-content: space-between;
         border-top: 1px solid #E7E9EC; padding-top: 2mm; font-size: 7.2pt; color: #6B7280; }
h1 { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 19pt; margin: 4mm 0 1mm; letter-spacing: .3px; }
.sub { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 11pt; color: #FFA000; margin: 0 0 1mm; }
.ver { font-size: 8.4pt; color: #6B7280; margin: 0 0 5mm; }
h2 { font-family: 'Montserrat', sans-serif; font-weight: 700; font-size: 11.6pt; margin: 6mm 0 2mm; }
h2 span { color: #FFA000; }
h3 { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 10pt; margin: 4mm 0 1.6mm; }
p { margin: 0 0 2mm; }
.caja { border-left: 3px solid #FFA000; background: #FFF7EA; padding: 2.6mm 3.4mm; margin: 2.6mm 0 3mm; font-size: 9pt; }
.caja.lima { border-color: #B1CE34; background: #F5F9E6; }
table { width: 100%; border-collapse: collapse; margin: 1.4mm 0 2mm; font-size: 8.6pt; }
th { font-family: 'Montserrat', sans-serif; font-weight: 600; font-size: 7.8pt; background: #1A1A1A; color: #fff;
     padding: 1.5mm 1.4mm; text-align: center; }
th.izq, td.c { text-align: left; }
td { border-bottom: 1px solid #E7E9EC; padding: 1.25mm 1.4mm; }
td.n { text-align: center; font-variant-numeric: tabular-nums; }
td.ant { background: #FAFAF7; }
td.m { color: #6B7280; font-size: 8pt; }
td.sep, th.sep { border-left: 2px solid #FFA000; }
tr.grupo th { background: #FFA000; color: #1A1A1A; }
.nota { font-size: 7.8pt; color: #6B7280; margin-top: 1mm; }
ul { margin: 1mm 0 2mm; padding-left: 5mm; } li { margin: .7mm 0; }
.check li { list-style: none; margin-left: -5mm; } .check li::before { content: '☐  '; color: #FFA000; }
.dos { display: grid; grid-template-columns: 1.25fr 1fr; gap: 6mm; }
</style></head><body>

<section class="hoja">${cabecera(1)}
  <h1>GUÍA DE TRANSMITANCIAS TÉRMICAS</h1>
  <p class="sub">Cerramientos en CE3X 3.2 — modo «Conocidas»</p>
  <p class="ver">Versión ${VERSION}. Sustituye a la del ${ANTERIOR}. Documento interno BROKERGY · uso exclusivo del técnico certificador.</p>

  <h2><span>1.</span> Objetivo y criterio</h2>
  <p>Esta guía fija los valores de transmitancia térmica (U, en W/m²K) y de masa (kg/m²) que se introducen en CE3X
     para los cerramientos de un edificio existente cuando no hay documentación que acredite su solución constructiva.</p>
  <div class="caja"><b>Criterio desde el ${VERSION}:</b> cada cerramiento lleva <b>exactamente</b> los valores que el propio
     CE3X 3.2 le asigna con <b>«Estimados según antigüedad y zona climática»</b>, introducidos en modo
     <b>«Conocidas»</b>. Son los valores por defecto del documento reconocido para la época de construcción y la zona
     climática del edificio: el propio programa oficial los propone, y quien revise el certificado obtiene los mismos
     con un clic.</div>
  <p>El <code>.cex</code> que prepara BROKERGY ya los lleva escritos; elegir «Estimados según antigüedad y zona climática»
     en CE3X da las mismas cifras. Un valor distinto solo con documentación (proyecto, cata, ficha del sistema).</p>

  <h2><span>2.</span> Cómo se elige el valor</h2>
  <h3>2.1 · El periodo: la «Normativa vigente» de Datos generales</h3>
  <table><tr><th class="izq">CE3X 3.2</th><th class="izq">Año de construcción</th><th class="izq">Qué tabla se usa</th></tr>
    ${filasPeriodo}</table>
  <p class="nota">«1980 – 1998» y «1998 – 2007» dan los mismos valores, y «2014 – 2020», «Después 2020» y «Otros (post 2020)»
     también: la diferencia entre ellos no está en la envolvente. A falta de conocer la normativa vigente, cuenta la fecha
     del visado del proyecto.</p>

  <div class="dos">
  <div>
  <h3>2.2 · La zona</h3>
  <p><b>Desde 2007</b> cuenta la letra de la zona climática HE-1 del municipio (D1, D2 y D3 dan lo mismo).</p>
  <p><b>De 1980 a 2007</b> no cuenta la HE-1, sino la zona de la antigua <b>NBE-CT-79 (V, W, X, Y, Z)</b>. CE3X no la enseña
     en ninguna casilla, pero la guarda en el fichero y de ella salen sus «Estimados». Con la localidad <b>«Otro»</b>
     —la que llevan los <code>.cex</code> de BROKERGY— la deduce de la zona HE-1 como dice la tabla.</p>
  <div class="caja lima">Al cambiar la zona HE-1 en CE3X, la NBE se recalcula sola. Una localidad de su lista (una
     capital) puede dar otra: entonces mandan los «Estimados» de CE3X.</div>
  </div>
  <div>
  <h3>Zona HE-1 → zona NBE-CT-79</h3>
  <table><tr><th>NBE</th><th class="izq">Zonas HE-1 (localidad «Otro»)</th></tr>${filasNbe}</table>
  <p class="nota">Medido con CE3X 3.2 en las 52 provincias: con la localidad «Otro» no depende de la provincia.</p>
  </div>
  </div>
</section>

<section class="hoja">${cabecera(2)}
  <h2><span>3.</span> Valores de U (W/m²K) por cerramiento</h2>
  <h3>3.1 · Antes de 1980, y de 1980 a 2007 por zona NBE-CT-79</h3>
  <table>
    <tr><th class="izq" rowspan="2">Cerramiento</th><th rowspan="2">Antes<br>1980</th><th colspan="4">1980 – 2007 · zona NBE</th>
        <th rowspan="2">Masa<br>kg/m²</th></tr>
    <tr><th>V · W</th><th>X</th><th>Y</th><th>Z</th></tr>
    ${FILAS.map(filaNbe).join('')}
  </table>
  <p class="nota">Masa: «antes de 1980 · después». Las particiones son la U de la partición; CE3X le aplica después lo suyo
     (ventilación del espacio no habitable y superficies).</p>

  <h3>3.2 · 2007 – 2013 y desde 2014, por la letra de la zona HE-1</h3>
  <table>
    <tr><th class="izq" rowspan="2">Cerramiento</th><th colspan="5">2007 – 2013 (CTE 2006)</th>
        <th class="sep" colspan="6">Desde 2014 (CTE 2013 y posteriores)</th></tr>
    <tr>${LETRAS.map(l => `<th>${l}</th>`).join('')}<th class="sep">α</th>${LETRAS.map(l => `<th>${l}</th>`).join('')}</tr>
    ${FILAS.map(filaCte).join('')}
  </table>
  <p class="nota">En 2007 – 2013 las zonas α (Canarias) llevan los valores de la A. Las masas son las de la última columna de 3.1.</p>
</section>

<section class="hoja">${cabecera(3)}
  <h2><span>4.</span> Cómo se introduce en CE3X</h2>
  <ul>
    <li><b>Fachadas, cubiertas, suelos en contacto con el aire y particiones con espacio no habitable:</b> propiedades
        térmicas «Conocidas», con la U y la masa de la tabla (o «Estimados según antigüedad y zona climática», que da lo mismo).</li>
    <li><b>Suelo en contacto con el terreno:</b> «Estimados según antigüedad y zona climática». CE3X modela el terreno aparte.</li>
    <li><b>Muro en contacto con el terreno</b> (planta bajo rasante): solo admite «Estimadas» o «Estimados según antigüedad y
        zona climática»; va con la segunda.</li>
    <li><b>Medianeras</b> con otro edificio: adiabáticas, sin U. Si al otro lado hay un local o un garaje sin calefactar,
        se declaran como partición vertical.</li>
    <li><b>Puentes térmicos, huecos y ventilación:</b> esta guía no los cambia.</li>
  </ul>

  <h2><span>5.</span> Ejemplo</h2>
  <p>Vivienda unifamiliar de <b>2003</b>, zona HE-1 <b>E1</b>, localidad «Otro». Normativa vigente «1998 – 2007»; zona NBE
     <b>Z</b>. Fachada <b>${ej('fachada_aire')}</b> · cubierta plana <b>${ej('cubierta_plana')}</b> · suelo al aire
     <b>${ej('suelo_aire')}</b> · suelo contra el terreno <b>${ej('suelo_terreno')}</b> · partición vertical
     <b>${ej('particion_vertical')}</b> W/m²K. La misma vivienda en D3 (zona NBE Y): fachada ${ejD('fachada_aire')} ·
     cubierta ${ejD('cubierta_plana')} · suelo al aire ${ejD('suelo_aire')}.</p>

  <h2><span>6.</span> Errores frecuentes</h2>
  <ul>
    <li><b>Seguir con los valores de la guía anterior</b> (1,69 en muros y cubiertas de 1991 – 2007, etc.) en un certificado
        emitido desde el ${VERSION}. La revisión de BROKERGY lo avisa.</li>
    <li><b>Mirar la zona HE-1 en un edificio de 1980 – 2007:</b> ahí manda la zona NBE (en E1, una cubierta da 0,70 y no
        los 0,90 de una zona D).</li>
    <li><b>Cambiar la «Normativa vigente» sin revisar las U:</b> los valores de la tabla son los del periodo declarado.</li>
    <li><b>Un valor distinto sin justificar:</b> si hay proyecto, cata o ficha, se usa y se conserva la justificación; si no,
        el de la guía.</li>
  </ul>

  <h2><span>7.</span> Lista de verificación antes de emitir</h2>
  <ul class="check">
    <li>La «Normativa vigente» corresponde al año de construcción (o al del visado).</li>
    <li>La zona climática HE-1 es la del municipio; en 1980 – 2007, la zona NBE es la que deduce CE3X.</li>
    <li>Cada fachada, cubierta, suelo al aire y partición lleva la U y la masa de la tabla de su periodo y zona.</li>
    <li>Los suelos y muros contra el terreno van en «Estimados según antigüedad y zona climática».</li>
    <li>Las medianeras son adiabáticas salvo que den a un espacio sin calefactar.</li>
    <li>Cualquier valor distinto de la guía tiene su justificación en el expediente.</li>
  </ul>
  <div class="caja lima">Los certificados emitidos hasta el 07/10/2026 con la guía anterior siguen siendo válidos: la
     revisión los compara con la guía vigente en su fecha.</div>
  <p class="nota" style="margin-top:6mm">Origen de las cifras: el propio CE3X 3.2 (Envolvente · «Estimados según antigüedad y
     zona climática»), consultado para los 7 periodos, las 20 zonas HE-1 y las 5 zonas NBE, y comprobado en pantalla.
     Documento de uso interno. Reservado para técnicos certificadores colaboradores. Prohibida su difusión externa.</p>
</section>
</body></html>`;

const { htmlToPdf } = require('../services/pdfService');
const pdf = await htmlToPdf(html);
fs.writeFileSync(SALIDA, pdf);
if (process.argv.includes('--html')) fs.writeFileSync(SALIDA.replace(/\.pdf$/i, '.html'), html);
console.log(`Guía de Transmitancias (versión ${VERSION}) → ${SALIDA} · ${(pdf.length / 1024).toFixed(0)} KB`);
process.exit(0);
