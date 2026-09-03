/**
 * Ninguna página del CIFO puede desbordar su hoja.
 *
 * En el VISOR no se nota: `.doc-page` es `min-height: 1123px` sin tope, así que
 * la caja crece y todo se ve. En el PDF la hoja son 297mm fijos, el pie va
 * `position:absolute; bottom:10mm` y `page-break-after:always` corta por el
 * borde — lo que sobra se parte a mitad de fila y el pie se imprime en la hoja
 * equivocada. Medido en 26RES060_146 (3 bombas en cascada): la página 2 pedía
 * más de lo que cabe y el listado "DONDE" salía cortado por el punto 7.
 *
 * Lo que engorda la página 2 es la CASCADA: una fila más ("Nº de equipos
 * instalados") y, sobre todo, los nº de serie, que se listan TODOS uno por
 * línea ("Ud. 1: …") en calefacción y otra vez en ACS.
 *
 *   node scripts/check_cifo_paginas.mjs
 *
 * No necesita red: las tipografías del documento (Instrument Sans) se sirven
 * desde `frontend/public/fonts` interceptando las peticiones. Con la de
 * respaldo el documento mediría de menos y daría por bueno algo que en
 * producción se corta.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { deriveCifoData, buildCifoHtml } from '../../frontend/src/features/expedientes/logic/cifoDoc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const APP_URL = 'https://app.brokergy.es';

const SERIE = ['340G501550428080100004', '340G501550428110100043', '340H555110531030100009',
    '340H555110531030100011', '340H555110531030100012'];

/** Bloque de aerotermia con N unidades en cascada. */
const aero = (n, scop = 6.63) => ({
    aerotermia_db_id: 1, marca: 'SIME', modelo: 'SHP MPRO 012',
    modelo_ud_exterior: 'SHP MPRO 012', numero_serie: SERIE[0],
    scop, scop_propio: scop, metodo_scop: 'ficha', potencia: 12,
    equipos_extra: Array.from({ length: n - 1 }, (_, i) => ({
        aerotermia_db_id: 1, marca: 'SIME', modelo: 'SHP MPRO 012',
        modelo_ud_exterior: 'SHP MPRO 012', numero_serie: SERIE[i + 1],
        scop, potencia: 12,
    })),
});

const base = (numero_expediente = '26RES060_146') => ({
    numero_expediente,
    clientes: {
        nombre_razon_social: 'MARÍA DE LOS DESAMPARADOS', apellidos: 'FERNÁNDEZ-GUTIÉRREZ DE LA HOZ',
        dni: '05123456X', direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA, 128, 3º IZQ',
        codigo_postal: '13700', municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        tlf: '623926179',
    },
    prescriptores: {
        razon_social: 'INSTALACIONES DEL CAMPO DE CALATRAVA S.L.', cif: 'B13123123',
        direccion: 'POLÍGONO INDUSTRIAL LA VEGA, PARCELA 27', codigo_postal: '13700',
        municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ',
        // El DNI del representante ahora se imprime en el recuadro de firma
        // (junto al nombre): tiene que estar en el fixture para que este
        // medidor ejerza de verdad ese añadido, no solo el caso sin DNI.
        nif_responsable: '12345678X',
    },
    instalacion: {
        coord_x: '512345.67', coord_y: '4321098.76', ref_catastral: '1234567VK1213S0001AB',
        municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real', ccaa: 'Castilla-La Mancha',
        caldera_antigua_cal: {
            marca: 'THERMITAL', modelo: 'SUPER EFFE 29 VS + ACUMULADRO SUPERE 170 (X2)',
            numero_serie: '00007256490 ; 00242280845', rendimiento_id: 'gas_post98_auto',
        },
        caldera_antigua_acs: {
            marca: 'THERMITAL', modelo: 'SUPER EFFE 29 VS + ACUMULADRO SUPERE 170 (X2)',
            numero_serie: '00232698878 ; 00232698876',
        },
        tipo_emisor: 'radiadores_convencionales',
        aerotermia_cal: aero(1),
        misma_aerotermia_acs: false,
        aerotermia_acs: { aerotermia_db_id: 445, marca: 'SIME', modelo: 'ECOMAXI VB 300',
            numero_serie: '26030000261032001003000047', scop: 3.72, metodo_scop: 'ficha' },
    },
    cee: {
        cee_inicial: { demandaCalefaccion: 212.85, superficieHabitable: 815, demandaACS: 5.89 },
        cee_final: { demandaCalefaccion: 212.85, superficieHabitable: 815, demandaACS: 5.89 },
        num_rooms: 4,
    },
    documentacion: {
        fecha_inicio_cifo: '2026-05-04', fecha_fin_cifo: '2026-06-18',
        facturas: [{ numero_factura: 'F-2026/0412' }],
    },
    oportunidades: { datos_calculo: { zona: 'D3', inputs: { caePriceClient: 95 } } },
});

/** Cascada de N unidades en calefacción (y opcionalmente el mismo equipo para ACS). */
const cascada = (n, { mismaAcs = false } = {}) => {
    const e = base();
    e.instalacion.aerotermia_cal = aero(n);
    e.instalacion.misma_aerotermia_acs = mismaAcs;
    return e;
};

/**
 * El instalador que factura no está habilitado en Industria y firma otra por él:
 * la hoja 1 imprime entonces las DOS empresas (tabla + nota de responsabilidad)
 * en vez del bloque de una sola. Es lo que más engorda esa hoja, así que se mide
 * con la razón social y el domicilio más largos que hemos visto.
 */
const conDelegacion = (e, { largos = false } = {}) => {
    e.prescriptores = { ...e.prescriptores, id_empresa: 'aaaa-1111', tiene_carnet_rite: false };
    e.prescriptores_firmante = largos ? {
        id_empresa: 'bbbb-2222', tiene_carnet_rite: true,
        razon_social: 'MONTAJES E INSTALACIONES TÉRMICAS DEL GUADIANA SOCIEDAD LIMITADA UNIPERSONAL',
        cif: 'B45998877', numero_carnet_rite: '08-B-D20-46001724',
        direccion: 'CALLE DE LA INDUSTRIA Y EL COMERCIO, 118, POLÍGONO SANTA MARÍA DE BENQUERENCIA',
        codigo_postal: '45007', municipio: 'Toledo', provincia: 'Toledo',
        // El firmante de la delegada es quien imprime nombre+DNI en la firma
        // (empresaInstaladora → prescriptores_firmante): sin esto el peor caso
        // no ejercía de verdad el DNI nuevo.
        nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ DE LA TORRE',
        nif_responsable: '12345678X',
    } : {
        id_empresa: 'bbbb-2222', tiene_carnet_rite: true,
        razon_social: 'OSCAR REDONDO MARTIN', cif: '52977772D',
        numero_carnet_rite: '08-B-D20-46001724', provincia: 'Toledo',
    };
    return e;
};

const casos = [
    ['RES060 · 1 equipo (caso normal)', cascada(1)],
    ['RES060 · 2 en cascada', cascada(2)],
    ['RES060 · 3 en cascada (26RES060_146)', cascada(3)],
    ['RES060 · 3 en cascada · mismo eq. ACS', cascada(3, { mismaAcs: true })],
    ['RES060 · 4 en cascada', cascada(4)],
    ['RES060 · 5 en cascada', cascada(5)],
    ['RES060 · sin ACS', (() => { const e = cascada(3); e.instalacion.cambio_acs = false; return e; })()],
    ['RES093 · 1 equipo', (() => { const e = base('26RES093_9'); return e; })()],
    ['RES093 · 3 en cascada', (() => {
        const e = base('26RES093_9'); e.instalacion.aerotermia_cal = aero(3); return e;
    })()],
    // La hoja 1 no la engorda la cascada, sino el TEXTO LIBRE: razón social y
    // domicilio del instalador, nombre y domicilio del cliente, y el nombre
    // oficial de la ficha (el de RES093 ocupa una línea más que el de RES060).
    // Cada línea que envuelve son ~17px, así que se mide con los más largos que
    // hemos visto, no con un caso de laboratorio.
    ['RES093 · textos largos (peor caso hoja 1)', (() => {
        const e = base('26RES093_9');
        e.clientes = { ...e.clientes,
            nombre_razon_social: 'COMUNIDAD DE PROPIETARIOS EDIFICIO RESIDENCIAL LOS OLIVOS DE LA VEGA',
            apellidos: '', direccion: 'AVENIDA DE LA CONSTITUCIÓN ESPAÑOLA DE 1978, 142, PORTAL 3, 4º B',
            email: 'administracion.fincas.losolivosdelavega@correoelectronicomuylargo.es' };
        // Las claves son las que lee `empresaInstaladora` + el bloque emp* de
        // deriveCifoData: `razon_social`, no `nombre_empresa`.
        e.prescriptores = {
            razon_social: 'INSTALACIONES Y MANTENIMIENTOS ELECTROMECÁNICOS DEL CAMPO DE CALATRAVA S.L.U.',
            cif: 'B13123123', direccion: 'POLÍGONO INDUSTRIAL LA VEGA, CALLE DE LOS ARTESANOS PARCELA 27, NAVE 4',
            codigo_postal: '13700', municipio: 'Villanueva de los Infantes del Campo', provincia: 'Ciudad Real',
            nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ DE LA TORRE',
            nif_responsable: '12345678X' };
        return e;
    })()],
    // ── Dos empresas: la que ejecuta y factura + la habilitada que firma ──
    ['RES060 · 2 empresas (26RES080_62)', conDelegacion(cascada(1))],
    ['RES060 · 5 en cascada · 2 empresas', conDelegacion(cascada(5))],
    ['RES093 · textos largos · 2 empresas (peor caso hoja 1)', (() => {
        const e = base('26RES093_9');
        e.clientes = { ...e.clientes,
            nombre_razon_social: 'COMUNIDAD DE PROPIETARIOS EDIFICIO RESIDENCIAL LOS OLIVOS DE LA VEGA',
            apellidos: '', direccion: 'AVENIDA DE LA CONSTITUCIÓN ESPAÑOLA DE 1978, 142, PORTAL 3, 4º B',
            email: 'administracion.fincas.losolivosdelavega@correoelectronicomuylargo.es' };
        e.prescriptores = {
            razon_social: 'INSTALACIONES Y MANTENIMIENTOS ELECTROMECÁNICOS DEL CAMPO DE CALATRAVA S.L.U.',
            cif: 'B13123123', direccion: 'POLÍGONO INDUSTRIAL LA VEGA, CALLE DE LOS ARTESANOS PARCELA 27, NAVE 4',
            codigo_postal: '13700', municipio: 'Villanueva de los Infantes del Campo', provincia: 'Ciudad Real',
            nombre_responsable: 'FRANCISCO JAVIER', apellidos_responsable: 'MOYA LÓPEZ DE LA TORRE',
            nif_responsable: '12345678X' };
        return conDelegacion(e, { largos: true });
    })()],
    ['TER100 · 3 en cascada + piscina', (() => {
        const e = base('26TER100_9');
        e.instalacion.aerotermia_cal = aero(3);
        e.instalacion.piscina = { activa: true, demanda_kwh: 18000, scop: 4.2,
            equipo: { marca: 'SIME', modelo: 'POOL HP 90', numero_serie: 'PL0099213' } };
        e.cee.acs_method = 'manual'; e.cee.dacs_manual = 48000;
        return e;
    })()],
    // Peor caso de la hoja 2: TER100 con la cascada repetida en ACS (mismo
    // equipo para los dos servicios ⇒ los nº de serie se listan DOS veces) y
    // además la tabla de piscina. Es el techo de lo que puede crecer esa hoja.
    // Peor caso de la hoja 2 CON delegación: ahí va la nota de responsabilidad
    // de las dos empresas, debajo de la cascada repetida en ACS.
    ['TER100 · 5 en cascada · ACS mismo eq. · piscina · 2 empresas', (() => {
        const e = base('26TER100_9');
        e.instalacion.aerotermia_cal = aero(5);
        e.instalacion.misma_aerotermia_acs = true;
        e.instalacion.piscina = { activa: true, demanda_kwh: 18000, scop: 4.2,
            equipo: { marca: 'SIME', modelo: 'POOL HP 90', numero_serie: 'PL0099213' } };
        e.cee.acs_method = 'manual'; e.cee.dacs_manual = 48000;
        return conDelegacion(e, { largos: true });
    })()],
    ['TER100 · 5 en cascada · ACS mismo eq. · piscina', (() => {
        const e = base('26TER100_9');
        e.instalacion.aerotermia_cal = aero(5);
        e.instalacion.misma_aerotermia_acs = true;
        e.instalacion.piscina = { activa: true, demanda_kwh: 18000, scop: 4.2,
            equipo: { marca: 'SIME', modelo: 'POOL HP 90', numero_serie: 'PL0099213' } };
        e.cee.acs_method = 'manual'; e.cee.dacs_manual = 48000;
        return e;
    })()],
];

const results = { savingsKwh: 216754, caeBonus: 20591, caeMaintenanceCost: 0 };

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });

// Las tipografías y la pegatina de portada salen del repo, no de la red.
await page.setRequestInterception(true);
page.on('request', (req) => {
    const url = req.url();
    if (url.startsWith(APP_URL)) {
        const local = path.join(PUBLIC_DIR, url.slice(APP_URL.length).split('?')[0]);
        if (fs.existsSync(local) && fs.statSync(local).isFile()) {
            // El @font-face es una petición CORS: sin este header el navegador
            // descarta el fichero y cae a la tipografía de respaldo.
            return req.respond({
                status: 200,
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: fs.readFileSync(local),
            });
        }
        return req.respond({ status: 404, body: '' });
    }
    req.continue();
});

let malos = 0;

for (const [nombre, exp] of casos) {
    const data = deriveCifoData({ expediente: exp, results });
    await page.setContent(buildCifoHtml({ data, appUrl: APP_URL }), { waitUntil: 'load' });
    await page.evaluate(async () => {
        for (const w of [400, 500, 600, 700]) await document.fonts.load(`${w} 12.5px 'Instrument Sans'`);
        await document.fonts.ready;
    });
    if (!await page.evaluate(() => document.fonts.check("12.5px 'Instrument Sans'"))) {
        console.error("⚠️  'Instrument Sans' no ha cargado: la medición no vale. Revisa la conexión.");
        await browser.close();
        process.exit(2);
    }
    // Alto REAL del contenido de cada hoja. NO vale el scrollHeight de
    // `.doc-page`: con `min-height:297mm` una hoja holgada mide siempre la
    // hoja entera, así que no distingue "cabe de sobra" de "va al ras". Se
    // clona el contenido en una caja de la misma anchura pero de alto libre.
    const holguras = await page.evaluate(() => {
        const MM = 96 / 25.4;                 // px por mm a 96 dpi (Puppeteer imprime así)
        const HOJA = Math.round(297 * MM);    // 1123 px
        // La PORTADA (índice 0) se salta: es una caja `overflow:hidden` a
        // sangre con todo posicionado en absoluto, y su scrollHeight no dice
        // nada. Se miden las hojas de contenido.
        return [...document.querySelectorAll('.doc-page')].slice(1).map(p => {
            const clon = p.cloneNode(true);
            Object.assign(clon.style, { position: 'absolute', top: '-20000px', left: '0',
                width: `${p.offsetWidth}px`, minHeight: '0', height: 'auto' });
            // El pie se QUITA: en la hoja real va `position:absolute`, así que no
            // ocupa sitio en el flujo (su hueco lo reserva el padding inferior).
            clon.querySelector('.doc-foot')?.remove();
            document.body.appendChild(clon);
            const alto = clon.getBoundingClientRect().height;   // incluye los paddings
            clon.remove();
            return Math.round(HOJA - alto);
        });
    });
    const mal = holguras.some(h => h < 0);
    if (mal) malos++;
    const detalle = holguras
        .map((h, i) => `p${i + 1}:${h < 0 ? `DESBORDA ${-h}` : `+${h}`}`).join('  ');
    console.log(`${mal ? '❌' : '  '} ${nombre.padEnd(38)} ${detalle}`);
}

await browser.close();
if (malos) { console.error(`\n${malos} caso(s) desbordan la hoja.`); process.exit(1); }
console.log('\nNinguna página desborda.');
