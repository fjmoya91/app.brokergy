/**
 * Las hojas del Anexo I son de ALTO FIJO (1123px) y el visor no lo delata:
 * `.doc-page` es `min-height` sin tope, así que la caja crece y en pantalla se ve
 * todo. En el PDF la hoja son 297mm y `page-break-after:always` corta por el
 * borde: lo que sobra se parte a mitad de tabla y aparece una hoja de más.
 *
 * Se comprueba ahora porque la tabla de datos de la ayuda (apartado de la
 * declaración responsable) ANTES SALÍA VACÍA —nueve filas de una línea— y desde
 * la pestaña Subvenciones se rellena de verdad: la denominación del programa del
 * RD 477/2021 son 232 caracteres, que a 12pt ocupan cuatro líneas.
 *
 *   node scripts/check_anexo_i_paginas.mjs
 *
 * Se miden los casos que más crecen: el programa de denominación más larga del
 * catálogo, cliente-empresa (que añade el bloque del representante) y las cuatro
 * fichas. Tras tocar el Anexo I o el catálogo de subvenciones, pasarlo.
 */
import puppeteer from 'puppeteer';
import { buildAnexoIHtml } from '../../frontend/src/features/expedientes/utils/docGenerators.js';
import { CATALOGO_SUBVENCIONES } from '../../frontend/src/features/expedientes/logic/subvenciones.js';

const ALTO_HOJA = 1123;

const base = {
    numero_expediente: '26RES080_123',
    oportunidades: { ficha: 'RES080', datos_calculo: { inputs: {} } },
    clientes: {
        nombre_razon_social: 'MARÍA DE LOS DESAMPARADOS', apellidos: 'FERNÁNDEZ-GUTIÉRREZ DE LA HOZ',
        dni: '05123456X', direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA DEL ROSARIO, 128, 3º IZQ',
        codigo_postal: '13700', municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        tlf: '623926179', email: 'maria.desamparados.fernandez@correoelectronicolargo.es',
    },
    instalacion: { ref_catastral: '1234567VK1213S0001AB', aerotermia_cal: { numero_serie: '5620506077' } },
    documentacion: {},
};

const conAyuda = (catalogo_id) => ({
    ...base,
    documentacion: {
        subvenciones: {
            bono_social: { percibe: true, tipos: ['electrico_vulnerable', 'termico'] },
            solicitada: true,
            ayuda: {
                catalogo_id,
                num_expediente: 'PR3-13-2024-00144',
                estado: 'PENDIENTE',
                fecha_solicitud: '2024-08-10',
                fecha_resolucion: '2026-01-31',
                cuantia_eur: '18800',
                fondo_nacional: 'no',
            },
        },
    },
});
// Cliente-empresa: el peor caso REAL de la base, entero y coherente — razón
// social, dirección y correo de la misma empresa (medido el 08/09/2026 sobre los
// cinco expedientes con `es_empresa`; el nombre más largo es "CONSTRUCCIONES
// MARIANO 1999, SL", 31 caracteres).
//
// No se inflan los tres campos a la vez con textos inventados: la hoja 1 va
// justa —se pasa combinando una razón social de ~31 caracteres con una dirección
// y un correo largos, o con una razón social de más de 60— y un caso imposible
// solo consigue que el medidor falle siempre y se deje de mirar. Si algún día se
// da de alta una empresa así, lo que hay que apretar es la hoja 1.
const empresa = (e) => ({ ...e, clientes: { ...e.clientes, es_empresa: true,
    nombre_razon_social: 'CONSTRUCCIONES MARIANO 1999, SL',
    direccion: 'C/ CARRERA DE SAN JERONIMO. 73',
    email: 'gerencia@construccionesmariano.es',
    representante_nombre: 'JOSE MANUEL', representante_apellidos: 'CHAVES MONTERO',
    representante_dni: '05671039K' } });
const ficha = (e, f) => ({ ...e, numero_expediente: `26${f}_9`, oportunidades: { ...e.oportunidades, ficha: f } });

// El programa cuyo texto ocupa más líneas es el que decide si la tabla cabe.
const masLargo = CATALOGO_SUBVENCIONES.reduce((a, b) => (b.denominacion.length > a.denominacion.length ? b : a));

const casos = [
    ['sin declarar nada (tabla vacía)', base],
    ['ayuda MITMA (RD 853/2021)',       conAyuda('RD853_2021')],
    ['ayuda de texto más largo',        conAyuda(masLargo.id)],
    ['texto más largo + empresa',       empresa(conAyuda(masLargo.id))],
    ['RES060 · texto más largo',        ficha(empresa(conAyuda(masLargo.id)), 'RES060')],
    ['RES093 · texto más largo',        ficha(empresa(conAyuda(masLargo.id)), 'RES093')],
    ['TER100 · texto más largo',        ficha(empresa(conAyuda(masLargo.id)), 'TER100')],
];

const R = { savingsKwh: 196802, caeBonus: 13185.73 };

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1300 });
let malos = 0;
console.log(`Programa de denominación más larga del catálogo: ${masLargo.id} (${masLargo.denominacion.length} caracteres)\n`);
for (const [nombre, exp] of casos) {
    await page.setContent(buildAnexoIHtml(exp, R, {}, true), { waitUntil: 'load' });
    // Alto REAL del contenido de cada hoja: `min-height` deja crecer la caja, así
    // que un scrollHeight mayor que la hoja es exactamente lo que se corta en PDF.
    const alturas = await page.evaluate((alto) => [...document.querySelectorAll('.doc-page')]
        .map(p => Math.round(alto - p.scrollHeight)), ALTO_HOJA);
    const mal = alturas.some(h => h < 0);
    if (mal) malos++;
    console.log(`${mal ? '❌' : '  '} ${nombre.padEnd(32)} hojas=${alturas.length} ` +
        alturas.map((h, i) => `p${i + 1}: ${h < 0 ? `SE PASA ${-h}px` : `+${h}px`}`).join(' | '));
}
await browser.close();
if (malos) { console.error(`\n${malos} caso(s) desbordan su hoja.`); process.exit(1); }
console.log('\nTodas las hojas caben.');
