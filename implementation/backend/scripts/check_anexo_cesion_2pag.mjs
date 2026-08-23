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
const ficha = (e, f) => ({ ...e, numero_expediente: `26${f}_9` });

const R  = { savingsKwh: 12345.6, caeBonus: 1172, caeMaintenanceCost: 0 };
const RC = { ...R, caeMaintenanceCost: 150 };   // con coste de gestión: un párrafo más

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
];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
let malos = 0;
for (const [nombre, exp, res, previo] of casos) {
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
    const mal = holguras.length !== 2 || holguras.some(h => h < 0);
    if (mal) malos++;
    console.log(`${mal ? '❌' : '  '} ${nombre.padEnd(26)} págs=${holguras.length} ` +
        holguras.map((h, i) => `p${i + 1}: ${h < 0 ? `SE CORTA ${-h}px` : `holgura ${h}px`}`).join(' | '));
}
await browser.close();
if (malos) { console.error(`\n${malos} caso(s) no caben en dos páginas.`); process.exit(1); }
console.log('\nTodo cabe en dos páginas.');
