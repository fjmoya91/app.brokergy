/**
 * La GUÍA de la deducción del IRPF (logic/guiaIrpf.js): qué deducción elige,
 * cuánto estima y que el documento cabe en UNA página.
 *
 *   node scripts/test_guia_irpf.mjs            # lógica + medición con Puppeteer
 *   node scripts/test_guia_irpf.mjs --sin-pdf  # solo la lógica
 *
 * La hoja es una caja de 297 mm con `overflow:hidden`: lo que no cabe no salta a
 * otra página, DESAPARECE bajo la banda del pie. Por eso se mide la altura
 * NATURAL del contenido (la hoja con `height:auto`) y se compara con la de la
 * hoja, igual que `check_anexo_cesion_2pag.mjs`. Las tipografías se sirven
 * desde `frontend/public/fonts`: con la de respaldo mediría de menos.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
    componerGuia, buildGuiaIrpfHtml, calendarioDeduccion, elegirModalidad,
    tipoViviendaDeCee, mensajeGuiaIrpf, facturaConIva, comprobarDemanda,
    textoGuiaEnEntrega, fraseEjemplo, IMPORTE_EJEMPLO, tipoAutomatico, asuntoGuiaIrpf, esCorreccion, descripcionTipo,
} from '../../frontend/src/features/expedientes/logic/guiaIrpf.js';
import { leerDatosIrpfDeTexto } from '../../frontend/src/features/calculator/logic/xmlCeeParser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
let fallos = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { fallos++; console.log(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} → ${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` (esperado ${JSON.stringify(b)})`}`);

console.log('\n1 · Tipo de vivienda del <TipoDeEdificio>');
eq(tipoViviendaDeCee('ViviendaUnifamiliar'), 'unifamiliar', 'ViviendaUnifamiliar');
eq(tipoViviendaDeCee('VIVIENDAUNIFAMILIAR'), 'unifamiliar', 'en MAYÚSCULAS (BD)');
eq(tipoViviendaDeCee('ViviendaIndividualEnBloque'), 'piso', 'piso en bloque');
eq(tipoViviendaDeCee('BloqueCompleto'), 'bloque', 'bloque completo');
eq(tipoViviendaDeCee('EdificioUsoTerciario'), 'terciario', 'terciario');
eq(tipoViviendaDeCee(''), null, 'vacío');

console.log('\n2 · Calendario de la deducción (manual: 12.000 € → 3.000 + 3.000 + 1.200)');
const c60 = calendarioDeduccion({ modalidad: '60', base: 12000, anio: 2025 });
eq(c60.anios.map(a => [a.anio, a.importe]), [[2025, 3000], [2026, 3000], [2027, 1200]], '60 % de 12.000');
eq(c60.porPropietario, 7200, 'total 7.200');
eq(calendarioDeduccion({ modalidad: '60', base: 40000, anio: 2026 }).porPropietario, 9000, '60 %: tope de 9.000 (base 15.000)');
eq(calendarioDeduccion({ modalidad: '60', base: 40000, anio: 2026 }).anios.length, 3, '60 %: 15.000 son tres años de 5.000');
eq(calendarioDeduccion({ modalidad: '40', base: 20000, anio: 2026 }).porPropietario, 3000, '40 %: tope de 3.000 (base 7.500), sin arrastre');
eq(calendarioDeduccion({ modalidad: '40', base: 20000, anio: 2026 }).anios.length, 1, '40 %: un solo año');
eq(calendarioDeduccion({ modalidad: '20', base: 3000, anio: 2026 }).porPropietario, 600, '20 % de 3.000');
const dos = calendarioDeduccion({ modalidad: '60', base: 20000, anio: 2026, propietarios: 2 });
eq([dos.basePorPropietario, dos.porPropietario, dos.total], [10000, 6000, 12000], '60 % con 2 propietarios: cada uno sobre su mitad');

console.log('\n3 · Qué deducción');
const irpfOk = { estado: 'ok', cumple: true };
const irpfNo = { estado: 'ok', cumple: false, avisos: [] };
eq(elegirModalidad({ tipo: 'unifamiliar', irpf: irpfOk }).modalidad, '60', 'unifamiliar que cumple → 60');
eq(elegirModalidad({ tipo: 'piso', irpf: irpfOk }).modalidad, '40', 'piso que cumple → 40');
eq(elegirModalidad({ tipo: 'bloque', irpf: irpfOk }).modalidad, '60', 'edificio completo → 60');
eq(elegirModalidad({ tipo: 'unifamiliar', irpf: irpfNo, demanda: { estado: 'ok', cumple: true, ahorroPct: 12 } }).modalidad, '20', 'no cumple EPNR pero sí demanda → 20');
eq(elegirModalidad({ tipo: 'unifamiliar', irpf: irpfNo, demanda: { estado: 'ok', cumple: false, ahorroPct: 3 } }).modalidad, null, 'no cumple nada → sin guía');
eq(elegirModalidad({ tipo: 'terciario', irpf: irpfOk }).modalidad, null, 'terciario → sin guía');
eq(elegirModalidad({ tipo: null, irpf: irpfOk }).modalidad, null, 'sin tipo → hay que elegirlo');
eq(comprobarDemanda({ demandaCalefaccion: 100, demandaRefrigeracion: 10 }, { demandaCalefaccion: 95, demandaRefrigeracion: 7 }).cumple, true, 'demanda 110 → 102 (−7,3 %) cumple');

console.log('\n4 · IVA');
eq(facturaConIva({ importe_con_iva: 12100 }), { importe: 12100, ivaEstimado: false }, 'con IVA declarado');
eq(facturaConIva({ importe_sin_iva: 10000 }), { importe: 12100, ivaEstimado: true }, 'solo la base: 21 % supuesto y marcado');

console.log('\n5 · Lector del .xml sin DOM (en MAYÚSCULAS, como en BD)');
const xml = `<?XML VERSION="1.0"?><DATOSENERGETICOSDELEDIFICIO><DATOSDELCERTIFICADOR><NIF>1</NIF><FECHA>30/09/2026</FECHA></DATOSDELCERTIFICADOR>
<IDENTIFICACIONEDIFICIO><TIPODEEDIFICIO>VIVIENDAUNIFAMILIAR</TIPODEEDIFICIO><REFERENCIACATASTRAL>1234567VJ1234N0001AB</REFERENCIACATASTRAL></IDENTIFICACIONEDIFICIO>
<DATOSGENERALESYGEOMETRIA><SUPERFICIEHABITABLE>123.4</SUPERFICIEHABITABLE></DATOSGENERALESYGEOMETRIA>
<DEMANDA><EDIFICIOOBJETO><CONJUNTA08>99999999.99</CONJUNTA08><GLOBAL>188.67</GLOBAL><REFRIGERACION>10.98</REFRIGERACION><CALEFACCION>150.76</CALEFACCION></EDIFICIOOBJETO></DEMANDA>
<CONSUMO><FACTORESDEPASO><FINALAPRIMARIANORENOVABLE><GLOBAL>9.9</GLOBAL></FINALAPRIMARIANORENOVABLE></FACTORESDEPASO><ENERGIAPRIMARIANORENOVABLE><ACS>52.62</ACS><GLOBAL>104.04</GLOBAL></ENERGIAPRIMARIANORENOVABLE></CONSUMO>
<CALIFICACION><ENERGIAPRIMARIANORENOVABLE><GLOBAL>C</GLOBAL><ESCALAGLOBAL><A>54.2</A></ESCALAGLOBAL></ENERGIAPRIMARIANORENOVABLE></CALIFICACION></DATOSENERGETICOSDELEDIFICIO>`;
const leido = leerDatosIrpfDeTexto(xml);
eq([leido.epnrConsumo, leido.epnrLetra, leido.demandaCalefaccion, leido.demandaRefrigeracion, leido.tipoEdificio, leido.fechaFirma, leido.superficieHabitable],
    [104.04, 'C', 150.76, 10.98, 'VIVIENDAUNIFAMILIAR', '2026-09-30', 123.4], 'consumo, letra, demanda, tipo, fecha y superficie');

// ─── Casos de la guía ────────────────────────────────────────────────────────
const cee = (epnr, letra, fecha, extra = {}) => ({
    epnrConsumo: epnr, epnrLetra: letra, fechaFirma: fecha, superficieHabitable: 123.45,
    tipoEdificio: 'ViviendaUnifamiliar', demandaCalefaccion: 150.76, demandaRefrigeracion: 10.98, ...extra,
});
const base = {
    numeroExpediente: '26RES093_11', negocio: 'cae',
    titular: { nombre: 'MARÍA DE LOS DESAMPARADOS FERNÁNDEZ-GUTIÉRREZ DE LA HOZ', nif: '05123456X' },
    vivienda: { direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA DEL ROSARIO 128, 13700 VILLANUEVA DE LOS INFANTES (CIUDAD REAL)', refCatastral: '1234567VK1213S0001AB', provincia: 'Ciudad Real' },
    anterior: { cee: cee(325.4, 'E', '2026-03-01'), rotulo: 'CEE inicial' },
    posterior: { cee: cee(104.04, 'C', '2026-09-30'), rotulo: 'CEE final' },
    facturas: [
        { id: 'a', numero: '26/000417', fecha: '2026-05-29', emisor: 'INSTALACIONES Y CLIMATIZACIÓN DEL CAMPO DE MONTIEL SL', nif: 'B13456789', importe_con_iva: 9680 },
        { id: 'b', numero: '26/000618', fecha: '2026-09-11', emisor: 'INSTALACIONES Y CLIMATIZACIÓN DEL CAMPO DE MONTIEL SL', nif: 'B13456789', importe_sin_iva: 2500 },
        { id: 'c', numero: 'F-2026-0091', fecha: '2026-06-15', emisor: 'CARPINTERÍA METÁLICA HERMANOS LÓPEZ-SERRANO SL', nif: 'B45123456', importe_con_iva: 6534.5 },
        { id: 'd', numero: 'F-2026-0092', fecha: '2026-07-02', emisor: 'CARPINTERÍA METÁLICA HERMANOS LÓPEZ-SERRANO SL', nif: 'B45123456', importe_con_iva: 1210 },
        { id: 'e', numero: 'FV-559', fecha: '2026-08-20', emisor: 'SOLAR LA MANCHA SL', nif: 'B13999999', importe_con_iva: 5445 },
    ],
    obras: [{ nif: 'B13456789', nombre: 'INSTALACIONES Y CLIMATIZACIÓN DEL CAMPO DE MONTIEL SL' }],
    propietarios: 2,
    hoy: '2026-10-01',
};

console.log('\n6 · La guía completa');
const g = componerGuia(base);
eq(g.modalidad, '60', 'unifamiliar −68 % → 60 %');
eq(g.total, 25894.5, 'total con IVA (2.500 de base → 3.025 supuesto)');
eq(g.anio, 2026, 'Renta 2026');
eq(g.calendario.anios.map(a => a.importe), [3000, 3000, 1768.35], 'por propietario: 12.947,25 → 3.000 + 3.000 + 1.768,35');
ok(g.avisos.some(a => /IVA SUPUESTO/.test(a)), 'avisa del IVA supuesto');
eq(g.obras.map(o => o.nif), ['B13456789', 'B45123456'], 'los dos NIF de quien hizo la obra (de las facturas)');
const piso = componerGuia({ ...base, tipoManual: 'piso', propietarios: 1 });
eq([piso.modalidad, piso.calendario.porPropietario], ['40', 3000], 'como piso → 40 %, 3.000 €');
ok(!g.ejemplo, 'con facturas de la obra: caso real, sin ejemplo');
const sinFact = componerGuia({ ...base, facturas: [], obras: [] });
ok(sinFact.calendario.porPropietario === 0, 'sin facturas: ninguna estimación sobre lo que haya');
ok(!sinFact.avisos.some(a => /factura/i.test(a)), 'sin facturas: NO es un aviso (en un CEE directo es lo normal)');

console.log('\n6.b · Sin facturas de la obra: EJEMPLO de ' + IMPORTE_EJEMPLO + ' €');
eq(sinFact.ejemplo.calendario.anios.map(a => [a.anio, a.importe]), [[2026, 3000], [2027, 2400]], '60 % de 9.000 → 3.000 + 2.400 (Renta 2026 y 2027)');
eq(sinFact.ejemplo.calendario.porPropietario, 5400, 'ejemplo 60 %: 5.400 €, de UNA persona aunque haya 2 propietarios');
const certSolo = componerGuia({ ...base, propietarios: 1, obras: [], facturas: [{ id: 'ing', numero: '26ING_78', fecha: '2026-09-30', emisor: 'BROKERGY', nif: 'B19350222', importe_con_iva: 161.59, certificado: true }] });
ok(certSolo.soloCertificados && certSolo.ejemplo?.importe === IMPORTE_EJEMPLO, 'solo la factura de los certificados (CEE directo) → ejemplo');
eq(componerGuia({ ...base, tipoManual: 'piso', facturas: [] }).ejemplo.calendario.porPropietario, 3000, 'ejemplo 40 %: 9.000 topados a 7.500 → 3.000 €');
const sinFecha = componerGuia({ ...base, facturas: [], posterior: { cee: cee(104.04, 'C', null), rotulo: 'CEE final' } });
ok(!sinFecha.ejemplo || sinFecha.ejemplo.calendario.porPropietario === 5400, 'sin fecha del certificado el ejemplo se cuenta igual («Año 1»)');
ok(/ejemplo\*: con una obra de 9\.000 € \(IVA incluido\) te deducirías 5\.400 €/.test(fraseEjemplo(certSolo)) && /\*60 %\*/.test(fraseEjemplo(certSolo)), 'frase del ejemplo para los mensajes');
eq(fraseEjemplo(g), null, 'con facturas de la obra no hay frase de ejemplo');
ok(/ejemplo/.test(mensajeGuiaIrpf(certSolo, { nombre: 'LAURA', certificados: 1 })), 'el mensaje de la guía menciona el ejemplo');
const entregaTxt = textoGuiaEnEntrega(certSolo, { unico: true });
ok(/tu certificado, frente al que tenías de antes de la obra, acredita/.test(entregaTxt) && /deducción del 60 %/.test(entregaTxt) && /ejemplo/.test(entregaTxt) && /certificado que tenías de antes/.test(entregaTxt), 'párrafo de la ENTREGA (encargo único): acredita, 60 %, ejemplo y el CEE de antes');
ok(/tus certificados acreditan/.test(textoGuiaEnEntrega(g)) && !/ejemplo/.test(textoGuiaEnEntrega(g)), 'párrafo de la ENTREGA (doble, con facturas): plural y sin ejemplo');
const htmlEj = buildGuiaIrpfHtml(certSolo, { appUrl: 'https://x' });
ok(/Ejemplo · obra de 9\.000 €/.test(htmlEj) && /5\.400 €/.test(htmlEj) && !/96,95/.test(htmlEj), 'el PDF rotula el ejemplo y no enseña la «estimación» de 96 € sobre la factura de los certificados');
const unico = componerGuia({ ...base, propietarios: 1, facturas: [] });
ok(/dos certificados/.test(mensajeGuiaIrpf(unico, { nombre: 'MARÍA', certificados: 2 })) && /¡Hola María!/.test(mensajeGuiaIrpf(unico, { nombre: 'MARÍA' })), 'mensaje: saludo y certificados');
ok(/certificado que tenías de antes/.test(mensajeGuiaIrpf(unico, { certificados: 1 })), 'mensaje con UN certificado: le recuerda el suyo de antes');
const veinte = componerGuia({ ...base, anterior: { cee: cee(200, 'E', '2026-03-01', { demandaCalefaccion: 160 }) }, posterior: { cee: cee(180, 'E', '2026-09-30', { demandaCalefaccion: 140 }) } });
eq(veinte.modalidad, '20', 'EPNR −10 % pero demanda −12 % → 20 %');

console.log('\n6.c · El tipo de vivienda lo manda el CATASTRO (como en la oportunidad)');
eq(tipoAutomatico({ tipoCee: 'unifamiliar', participacion: '16,00' }), { tipo: 'piso', origen: 'catastro', participacion: 16 }, 'certificado unifamiliar + participación 16 % → piso (2026CEE_60)');
eq(tipoAutomatico({ tipoCee: 'unifamiliar', participacion: '100,00' }).tipo, 'unifamiliar', 'participación 100 % → manda el certificado');
eq(tipoAutomatico({ tipoCee: null, participacion: null, tipoSimulacion: 'piso' }).tipo, 'piso', 'sin Catastro ni certificado → la simulación');
eq(tipoAutomatico({ tipoCee: 'unifamiliar', participacion: 100, tipoSimulacion: 'piso' }).tipo, 'piso', 'la simulación calculó piso → piso (mismo criterio que calculateFinancials)');
eq(tipoAutomatico({ tipoCee: 'bloque', participacion: 16 }).tipo, 'bloque', 'un edificio completo que declara el certificado se respeta');
const pisoCat = componerGuia({ ...base, propietarios: 1, participacion: '16,00', facturas: [], obras: [] });
eq([pisoCat.tipo, pisoCat.tipoOrigen, pisoCat.modalidad, pisoCat.ejemplo.calendario.porPropietario], ['piso', 'catastro', '40', 3000], 'la guía de 2026CEE_60 sale al 40 % (ejemplo: 3.000 €)');
ok(pisoCat.avisos.some(a => /certificado dice «Vivienda unifamiliar», pero en el Catastro/.test(a)), 'avisa de que el certificado dice otra cosa');
eq(componerGuia({ ...base, propietarios: 1, participacion: '16,00', tipoManual: 'unifamiliar', facturas: [] }).modalidad, '60', 'lo elegido a mano sigue mandando');
const previa = { modalidad: '60', at: '2026-10-01T16:03:43.921Z' };
ok(esCorreccion(pisoCat, previa) && !esCorreccion(pisoCat, { modalidad: '40' }) && !esCorreccion(pisoCat, null), 'corrección solo si cambia el porcentaje');
const msgCorr = mensajeGuiaIrpf(pisoCat, { nombre: 'LAURA', certificados: 1, previa });
ok(/\*corregida\*/.test(msgCorr) && /el 01\/10\/2026 te indicábamos la deducción del 60 %/.test(msgCorr) && /\*40 %\*/.test(msgCorr) && /participación del 16,00 %/.test(msgCorr) && /descarta la anterior/.test(msgCorr), 'el mensaje de corrección dice qué decía la anterior, cuál vale y por qué');
ok(/en hilera, forma parte de una finca en régimen de división horizontal/.test(msgCorr) && !/dividido en pisos/.test(msgCorr), 'certificado unifamiliar + división horizontal: se le dice EN HILERA, no «piso» (2026CEE_60)');
eq(descripcionTipo({ tipo: 'piso', tipoCee: 'unifamiliar' }), 'Vivienda unifamiliar en hilera (división horizontal)', 'descripción: unifamiliar en hilera');
eq(descripcionTipo({ tipo: 'piso', tipoCee: 'piso' }), 'Piso (división horizontal)', 'descripción: piso');
ok(/es un piso dentro de un edificio/.test(mensajeGuiaIrpf(componerGuia({ ...base, propietarios: 1, participacion: 16, facturas: [], anterior: { cee: cee(325.4, 'E', '2026-03-01', { tipoEdificio: 'ViviendaIndividualEnBloque' }) }, posterior: { cee: cee(104.04, 'C', '2026-09-30', { tipoEdificio: 'ViviendaIndividualEnBloque' }) } }), { previa })), 'un piso de verdad se dice piso');
ok(/Vivienda unifamiliar en hilera/.test(buildGuiaIrpfHtml(pisoCat, { appUrl: 'https://x' })), 'el PDF pone «Vivienda unifamiliar en hilera» en el tipo');
ok(/CORREGIDA/.test(asuntoGuiaIrpf(pisoCat, { previa })) && !/CORREGIDA/.test(asuntoGuiaIrpf(pisoCat)), 'asunto de corrección');

if (process.argv.includes('--sin-pdf')) {
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
    process.exit(fallos ? 1 : 0);
}

// ─── Medición: cabe en UNA página ────────────────────────────────────────────
console.log('\n7 · Cabe en una página (Puppeteer, tipografías reales)');
const { default: puppeteer } = await import('puppeteer');
const APP_URL = 'https://app.brokergy.test';
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1300 });
await page.setRequestInterception(true);
page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(APP_URL)) {
        const local = path.join(PUBLIC_DIR, url.slice(APP_URL.length).split('?')[0]);
        if (fs.existsSync(local) && fs.statSync(local).isFile()) {
            return req.respond({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: fs.readFileSync(local) });
        }
        return req.respond({ status: 404, body: '' });
    }
    req.continue();
});

const casos = [
    ['60 % · peor caso (5 facturas, 2 empresas, 2 propietarios)', g],
    ['40 % · piso', piso],
    ['20 % · demanda', veinte],
    ['60 % · sin facturas (ejemplo)', sinFact],
    ['40 % · hilera (2026CEE_60, ejemplo)', pisoCat],
    ['60 % · solo factura de certificados (ejemplo, CEE directo)', certSolo],
    ['40 % · piso sin facturas (ejemplo)', componerGuia({ ...base, tipoManual: 'piso', facturas: [], obras: [] })],
];
for (const [nombre, guia] of casos) {
    await page.setContent(buildGuiaIrpfHtml(guia, { appUrl: APP_URL }), { waitUntil: 'load' });
    await page.evaluate(async () => {
        for (const w of [400, 600, 700, 800]) await document.fonts.load(`${w} 11px Manrope`);
        await document.fonts.load('800 20px Archivo');
        await document.fonts.ready;
    });
    const fuente = await page.evaluate(() => document.fonts.check('700 11px Manrope') && document.fonts.check('800 20px Archivo'));
    if (!fuente) { console.error('  ⚠️  Las tipografías no han cargado: la medición no vale.'); fallos++; break; }
    const { hoja, natural } = await page.evaluate(() => {
        const s = document.querySelector('.sheet');
        const hoja = s.getBoundingClientRect().height;
        // Altura NATURAL: la hoja sin su alto fijo. El pie lleva `margin-top:auto`,
        // que con `height:auto` vale 0, así que esto es lo que ocupa de verdad.
        s.style.height = 'auto';
        const natural = s.scrollHeight;
        s.style.height = '';
        return { hoja, natural };
    });
    const holgura = Math.round(hoja - natural);
    ok(holgura >= 0, `${nombre}: holgura ${holgura} px`);
}
// Y el PDF de verdad: una sola página.
const pdf = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
const { PDFDocument } = await import('pdf-lib');
const nPag = (await PDFDocument.load(pdf)).getPageCount();
eq(nPag, 1, 'el PDF tiene una página');
if (process.argv.includes('--guardar')) {
    const out = path.join(__dirname, '../../../tmp/guia_irpf_prueba.pdf');
    await page.setContent(buildGuiaIrpfHtml(g, { appUrl: APP_URL }), { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.ready; });
    fs.writeFileSync(out, await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
    console.log(`  → ${out}`);
}
await browser.close();

console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ Todo bien');
process.exit(fallos ? 1 : 0);
