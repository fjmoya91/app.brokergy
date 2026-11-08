/**
 * El Convenio de Cesión TIENE que caber en dos páginas.
 *
 * Las páginas son cajas de 1122px con `overflow:hidden`: lo que no cabe no
 * descoloca nada, DESAPARECE — y encima los hijos de `.conv-body` son flex-items
 * que se encogen, así que el `scrollHeight` del contenedor no lo delata. Por eso
 * aquí la altura real se mide clonando el cuerpo fuera del flex.
 *
 * Se comprueban los dos textos (obra prevista / ejecutada), con y sin IBAN, las
 * cuatro fichas y un cliente-empresa con la dirección más larga que hemos visto:
 * lo que decide el corte es cuántas LÍNEAS ocupa cada párrafo.
 *
 *   node scripts/check_anexo_cesion_2pag.mjs
 *
 * Requiere red: la tipografía Inter llega por @import y con la de respaldo el
 * documento mide de menos (mediría bien algo que en producción se corta).
 */
import puppeteer from 'puppeteer';
import { buildAnexoCesionHtml } from '../../frontend/src/features/expedientes/utils/docGenerators.js';
import { paginaFirmasConvenio } from '../../frontend/src/features/expedientes/logic/signBoxes.js';

const stress = {
    numero_expediente: '26RES080_123',
    clientes: {
        nombre_razon_social: 'MARÍA DE LOS DESAMPARADOS', apellidos: 'FERNÁNDEZ-GUTIÉRREZ DE LA HOZ',
        dni_nie: '05123456X', direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA DEL ROSARIO, 128, 3º IZQ',
        codigo_postal: '13700', municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        tlf: '623926179', email: 'maria.desamparados.fernandez@correoelectronicolargo.es',
        numero_cuenta: 'ES91 2100 0418 4502 0005 1332',
    },
    instalacion: {
        coord_x: '512345.67', coord_y: '4321098.76', ref_catastral: '1234567VK1213S0001AB',
        municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real', ccaa: 'Castilla-La Mancha',
    },
    oportunidades: { datos_calculo: { inputs: { caePriceClient: 95 } } },
    documentacion: {},
};
const real = {
    ...stress,
    clientes: { ...stress.clientes, nombre_razon_social: 'JUAN', apellidos: 'GARCÍA PÉREZ',
        direccion: 'CL DON SERGIO 15', municipio: 'Tomelloso', email: 'juangarcia@gmail.com' },
    instalacion: { ...stress.instalacion, municipio: 'Tomelloso' },
};
const sinIban = (e) => ({ ...e, clientes: { ...e.clientes, numero_cuenta: '' } });
const empresa = (e) => ({ ...e, clientes: { ...e.clientes, es_empresa: true,
    representante_nombre: 'FRANCISCO JAVIER', representante_apellidos: 'MOYA LÓPEZ DE LA TORRE',
    representante_dni: '06282551D' } });
// Particular REPRESENTADO por poder notarial: el párrafo del Cedente crece una línea y pico.
const representado = (e) => ({ ...e, clientes: { ...e.clientes, representado: true,
    representante_nombre: 'FRANCISCO JAVIER', representante_apellidos: 'MOYA LÓPEZ DE LA TORRE',
    representante_dni: '06282551D', representacion_tipo: 'NOTARIAL', representacion_fecha: '2019-03-14',
    representacion_protocolo: '1.234' } });
const ficha = (e, f) => ({ ...e, numero_expediente: `26${f}_9` });
const fm = (e, f = 'RES060', vulnerable = false) => ({ ...e, numero_expediente: `26${f}FM_9`,
    documentacion: { ...(e.documentacion || {}), via_fm: { vulnerable } } });
// VARIOS cedentes (copropietarios que pagan la obra): el convenio pasa a TRES
// hojas — la tercera, de firmas con casillas fijas. Nombres largos a propósito.
const varios = (e, n, { cuentas = false } = {}) => ({ ...e, clientes: { ...e.clientes, copropietarios:
    Array.from({ length: n - 1 }, (_, i) => ({ id: `c${i}`, cedente: true, nombre: 'MARÍA DE LAS MERCEDES', apellidos: `FERNÁNDEZ-CABALLERO DE LA HOZ ${i}`,
        dni: '05123456X', cuota_pct: null, iban: cuentas ? 'ES7620770024003102575766' : '' })) } });

const R  = { savingsKwh: 12345.6, caeBonus: 1172, caeMaintenanceCost: 0 };
const RC = { ...R, caeMaintenanceCost: 150 };   // con coste de gestión: un párrafo más
// Vía FM: las DOS cifras (la FM principal y la general subsidiaria), con cifras de
// seis dígitos para que la tabla de la Tercera mida en su peor caso.
const RFM = { ...RC, savingsKwh: 123456.7, caeBonus: 117284, res060fc: { cae: 246913.4 }, financialsRes060FC: { caeBonus: 234568 } };
const conPrecioFm = (e) => ({ ...e, oportunidades: { datos_calculo: { inputs: { ...e.oportunidades.datos_calculo.inputs, cae_client_rate_fm: 105 } } } });

const casos = [
    ['ejecutada · real',        real,                      R,  false],
    ['ejecutada · sin IBAN',    sinIban(stress),           R,  false],
    ['ejecutada · peor caso',   ficha(empresa(stress), 'TER100'), RC, false],
    ['prevista · real',         real,                      R,  true],
    ['prevista · real sin IBAN',sinIban(real),             R,  true],
    ['prevista · RES060',       ficha(empresa(stress), 'RES060'), RC, true],
    ['prevista · RES080',       ficha(empresa(stress), 'RES080'), RC, true],
    ['prevista · RES093',       ficha(empresa(stress), 'RES093'), RC, true],
    ['prevista · TER100',       ficha(empresa(stress), 'TER100'), RC, true],
    ['ejecutada · representado',ficha(representado(stress), 'TER100'), RC, false],
    ['prevista · representado', ficha(representado(stress), 'RES080'), RC, true],
    ['2 cedentes · real',       varios(real, 2),           R,  true,  3],
    ['2 cedentes · peor caso',  varios(ficha(empresa(stress), 'RES080'), 2, { cuentas: true }), RC, false, 3],
    // Hasta TRES cedentes la Tercera sube a la hoja 1 (`terceraEnHoja1`); con cuatro, no.
    ['3 cedentes · peor caso',  varios(ficha(empresa(stress), 'RES080'), 3, { cuentas: true }), RC, true, 3],
    ['4 cedentes · peor caso',  varios(ficha(empresa(stress), 'RES080'), 4, { cuentas: true }), RC, true, 3],
    ['5 cedentes · peor caso',  varios(ficha(stress, 'RES080'), 5, { cuentas: true }), RC, true, 3],
    ['5 cedentes · sin IBAN',   varios(sinIban(stress), 5), RC, true, 3],
    // Vía del FACTOR MULTIPLICADOR (26RES060FM_N): SIEMPRE tres hojas (la tercera de
    // firmas), porque cubre las DOS fichas —la FM principal y la general subsidiaria,
    // con su tabla— y lleva el consentimiento del IRPF (punto 12) como «Cuarto» del
    // EXPONEN (en la hoja de firmas pisaría las casillas, que van en posición fija).
    ['FM · ejecutada peor caso', fm(empresa(stress)), RFM, false, 3],
    ['FM · prevista peor caso',  fm(empresa(stress)), RFM, true, 3],
    ['FM · precio FM propio',    conPrecioFm(fm(empresa(stress))), RFM, true, 3],
    ['FM · representado',        fm(representado(stress)), RFM, true, 3],
    ['FM · hibridación -S',      fm(empresa(stress), 'RES093', true), RFM, true, 3],
    ['FM · con requerimiento',   fm(empresa(stress)), { ...RFM, viaUnica: true }, true, 3],
    // Con VARIOS cedentes la tabla no cabe ni en tres: CUATRO hojas, las firmas en la 4.
    ['FM · 2 cedentes peor caso', varios(fm(empresa(stress)), 2, { cuentas: true }), RFM, true, 4],
    ['FM · 3 cedentes peor caso', varios(fm(stress), 3, { cuentas: true }), RFM, true, 4],
    ['FM · 5 cedentes sin IBAN',  varios(fm(stress), 5), RFM, true, 4],
    ['FM · 5 cedentes',          varios(fm(stress), 5, { cuentas: true }), RFM, true, 4],
    ['FM · 5 cedentes requerim.', varios(fm(stress), 5, { cuentas: true }), { ...RFM, viaUnica: true }, true, 3],
];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
let malos = 0;
for (const [nombre, exp, res, previo, paginas = 2] of casos) {
    await page.setContent(buildAnexoCesionHtml(exp, res, { previo }), { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.load('11px Inter'); await document.fonts.ready; });
    if (!await page.evaluate(() => document.fonts.check('11px Inter'))) {
        console.error('⚠️  La tipografía Inter no ha cargado: la medición no vale. Revisa la conexión.');
        await browser.close();
        process.exit(2);
    }
    const holguras = await page.evaluate(() => [...document.querySelectorAll('.conv-page')].map(p => {
        const body = p.querySelector('.conv-body');
        const clon = body.cloneNode(true);
        Object.assign(clon.style, { position: 'absolute', top: '-10000px', left: '0',
            width: `${body.offsetWidth}px`, height: 'auto', flex: 'none', overflow: 'visible' });
        p.appendChild(clon);   // DENTRO de .conv-wrap: fuera hereda otra tipografía
        const alto = clon.scrollHeight;
        clon.remove();
        return Math.round(body.clientHeight - alto);
    }));
    // En la hoja de firmas las casillas van fuera del flujo: se comprueba que la
    // última (con su nombre debajo) no pise el pie.
    const pisaPie = await page.evaluate(() => {
        const hoja = document.querySelector('.conv-page-firmas');
        if (!hoja) return 0;
        const pie = hoja.querySelector('.conv-footer').getBoundingClientRect().top;
        const fondo = Math.max(...[...hoja.querySelectorAll('.conv-firma-abs')].map(c => c.getBoundingClientRect().bottom + 30));
        return Math.round(fondo - pie);
    });
    // Y que el TEXTO de la hoja de firmas (Notificaciones, y en la vía FM la Undécima
    // del consentimiento) no baje hasta la primera casilla, que va en posición fija.
    const pisaCasillas = await page.evaluate(() => {
        const hoja = document.querySelector('.conv-page-firmas');
        if (!hoja) return 0;
        const casilla = Math.min(...[...hoja.querySelectorAll('.conv-firma-abs')].map(c => c.getBoundingClientRect().top));
        // (el relleno `.conv-firmas-pie` va DEBAJO de las casillas a propósito: no cuenta)
        const ultimo = [...hoja.querySelector('.conv-body').children].filter(c => !c.classList.contains('conv-firmas-pie')).pop();
        return Math.round(ultimo.getBoundingClientRect().bottom + 8 - casilla);
    });
    // Y que la hoja de firmas sea la que la FIRMA va a buscar (signBoxes): con 3 o 4
    // hojas, la casilla se calcula, no se mide; si no coinciden, la rúbrica cae fuera.
    const hojaFirmas = await page.evaluate(() => [...document.querySelectorAll('.conv-page')].findIndex(p => p.classList.contains('conv-page-firmas')) + 1);
    const firmasDescuadradas = hojaFirmas > 0 && hojaFirmas !== paginaFirmasConvenio(holguras.length);
    if (firmasDescuadradas) console.log(`   ↳ las firmas van en la hoja ${hojaFirmas} y la firma las busca en la ${paginaFirmasConvenio(holguras.length)}`);
    const mal = holguras.length !== paginas || holguras.some(h => h < 0) || pisaPie > 0 || pisaCasillas > 0 || firmasDescuadradas;
    if (pisaPie > 0) console.log(`   ↳ las firmas pisan el pie ${pisaPie}px`);
    if (pisaCasillas > 0) console.log(`   ↳ el texto de la hoja de firmas pisa las casillas ${pisaCasillas}px`);
    if (mal) malos++;
    console.log(`${mal ? '❌' : '  '} ${nombre.padEnd(26)} págs=${holguras.length} ` +
        holguras.map((h, i) => `p${i + 1}: ${h < 0 ? `SE CORTA ${-h}px` : `holgura ${h}px`}`).join(' | ') +
        (hojaFirmas > 0 ? ` · texto a ${-pisaCasillas}px de las casillas` : ''));
}
await browser.close();
if (malos) { console.error(`\n${malos} caso(s) no caben en sus páginas.`); process.exit(1); }
console.log('\nTodo cabe: dos páginas con un cedente; tres (firmas aparte) con varios o en la vía FM; cuatro en la FM con varios.');
