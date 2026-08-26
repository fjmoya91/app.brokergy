/**
 * Ninguna página del Certificado RES080 puede desbordar su hoja.
 *
 * Mismo problema —y misma trampa— que el CIFO (ver check_cifo_paginas.mjs): en
 * el VISOR `.doc-page` es `min-height:297mm` SIN tope, así que la caja crece y
 * todo se ve; en el PDF la hoja son 297mm fijos y `page-break-after:always`
 * corta por el borde, partiendo una tabla a mitad de fila y mandando el pie a la
 * hoja siguiente. Mirar la vista previa NO es comprobarlo.
 *
 * La hoja que más se mueve es la de la instalación térmica: la engordan la
 * CASCADA (un nº de serie por unidad, en calefacción y otra vez en ACS) y, desde
 * 2026-08-26, el apartado de las DOS empresas cuando quien factura no es quien
 * firma ante Industria.
 *
 *   node scripts/check_res080_paginas.mjs
 *
 * No necesita red: las tipografías (Instrument Sans) se sirven desde
 * `frontend/public/fonts` interceptando las peticiones. Con la de respaldo
 * mediría de menos y daría por bueno algo que en producción se corta.
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { deriveRes080Data, buildRes080Html } from '../../frontend/src/features/expedientes/logic/res080Doc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const APP_URL = 'https://app.brokergy.es';

const SERIE = ['340G501550428080100004', '340G501550428110100043', '340H555110531030100009',
    '340H555110531030100011', '340H555110531030100012'];

const aero = (n, scop = 4.12) => ({
    aerotermia_db_id: 1, marca: 'DAIKIN', modelo: 'ALTHERMA 3 H HT EPRA14DW1',
    modelo_ud_exterior: 'EPRA14DW1', numero_serie: SERIE[0],
    scop, scop_propio: scop, metodo_scop: 'ficha', potencia: 14,
    equipos_extra: Array.from({ length: n - 1 }, (_, i) => ({
        aerotermia_db_id: 1, marca: 'DAIKIN', modelo: 'ALTHERMA 3 H HT EPRA14DW1',
        modelo_ud_exterior: 'EPRA14DW1', numero_serie: SERIE[i + 1], scop, potencia: 14,
    })),
});

const base = () => ({
    numero_expediente: '26RES080_62',
    clientes: {
        nombre_razon_social: 'MARÍA DE LOS DESAMPARADOS', apellidos: 'FERNÁNDEZ-GUTIÉRREZ DE LA HOZ',
        dni: '05123456X', direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA, 128, 3º IZQ',
        codigo_postal: '13700', municipio: 'Tomelloso', provincia: 'Ciudad Real', tlf: '623926179',
    },
    prescriptores: {
        id_empresa: 'aaaa-1111', razon_social: 'FELIX DIAZ GALVEZ', cif: '03892673S',
        tiene_carnet_rite: true, numero_carnet_rite: '08-B-D20-13018993',
        direccion: 'CALLE MAYOR, 12', codigo_postal: '45600', municipio: 'Talavera de la Reina',
        provincia: 'Toledo', nombre_responsable: 'FELIX', apellidos_responsable: 'DIAZ GALVEZ',
    },
    instalacion: {
        coord_x: '512345.67', coord_y: '4321098.76', ref_catastral: '1234567VK1213S0001AB',
        municipio: 'Tomelloso', provincia: 'Ciudad Real', ccaa: 'Castilla-La Mancha',
        caldera_antigua_cal: {
            marca: 'ROCA', modelo: 'VICTORIA 20/20 F', numero_serie: '00007256490',
            rendimiento_id: 'gas_post98_auto',
        },
        caldera_antigua_acs: { marca: 'ROCA', modelo: 'VICTORIA 20/20 F', numero_serie: '00007256490' },
        tipo_emisor: 'radiadores_convencionales',
        aerotermia_cal: aero(1), misma_aerotermia_acs: true,
    },
    cee: {
        cee_inicial: { demandaCalefaccion: 118.4, superficieHabitable: 132, demandaACS: 12.1 },
        cee_final: { demandaCalefaccion: 74.2, superficieHabitable: 132, demandaACS: 12.1 },
    },
    documentacion: {
        fecha_inicio_res080: '2026-05-04', fecha_fin_res080: '2026-06-18',
        envolvente: {
            actua_cerramientos: true, sustituye_ventanas: true,
            aislamiento_muros: true, aislamiento_cubierta: true,
        },
    },
    oportunidades: { datos_calculo: { zona: 'D3', inputs: { caePriceClient: 95 } } },
});

/** El que ejecuta y factura no está habilitado y firma otra empresa por él. */
const conDelegacion = (e, { largos = false } = {}) => {
    e.prescriptores = { ...e.prescriptores, tiene_carnet_rite: false, numero_carnet_rite: null };
    e.prescriptores_firmante = largos ? {
        id_empresa: 'bbbb-2222', tiene_carnet_rite: true,
        razon_social: 'MONTAJES E INSTALACIONES TÉRMICAS DEL GUADIANA SOCIEDAD LIMITADA UNIPERSONAL',
        cif: 'B45998877', numero_carnet_rite: '08-B-D20-46001724',
        direccion: 'CALLE DE LA INDUSTRIA Y EL COMERCIO, 118, POLÍGONO SANTA MARÍA DE BENQUERENCIA',
        codigo_postal: '45007', municipio: 'Toledo', provincia: 'Toledo',
    } : {
        id_empresa: 'bbbb-2222', tiene_carnet_rite: true,
        razon_social: 'OSCAR REDONDO MARTIN', cif: '52977772D',
        numero_carnet_rite: '08-B-D20-46001724', provincia: 'Toledo',
    };
    return e;
};

const cascada = (n) => { const e = base(); e.instalacion.aerotermia_cal = aero(n); return e; };

const acsPropio = (e, modelo = 'ECH2O 500 BIV') => {
    e.instalacion.misma_aerotermia_acs = false;
    e.instalacion.aerotermia_acs = {
        aerotermia_db_id: 445, marca: 'DAIKIN', modelo,
        numero_serie: '26030000261032001003000047', scop: 3.1, metodo_scop: 'ficha',
    };
    return e;
};

const casos = [
    ['1 equipo (caso normal)', cascada(1)],
    ['3 en cascada', cascada(3)],
    ['5 en cascada', cascada(5)],
    ['5 en cascada · ACS equipo propio', acsPropio(cascada(5))],
    ['sin ACS', (() => { const e = cascada(3); e.instalacion.cambio_acs = false; return e; })()],
    // ── Dos empresas: la que ejecuta y factura + la habilitada que firma ──
    ['1 equipo · 2 empresas (26RES080_62)', conDelegacion(cascada(1))],
    ['5 en cascada · 2 empresas', conDelegacion(cascada(5))],
    // Peor caso: la cascada al completo, ACS con equipo propio y las razones
    // sociales y domicilios más largos que hemos visto en las dos empresas.
    ['5 cascada · ACS propio · 2 empresas · textos largos', (() => {
        const e = acsPropio(cascada(5), 'ECH2O 500 BIV SOLAR PLUS');
        e.prescriptores = {
            ...e.prescriptores,
            razon_social: 'INSTALACIONES Y MANTENIMIENTOS ELECTROMECÁNICOS DEL CAMPO DE CALATRAVA S.L.U.',
            direccion: 'POLÍGONO INDUSTRIAL LA VEGA, CALLE DE LOS ARTESANOS PARCELA 27, NAVE 4',
            municipio: 'Villanueva de los Infantes del Campo',
        };
        return conDelegacion(e, { largos: true });
    })()],
];

const results = {
    ahorroEnergiaFinalTotal: 9840, totalEnergiaInicialAno: 21450, totalEnergiaFinalAno: 11610,
    totalEnergiaInicialM2: 162.5, totalEnergiaFinalM2: 87.9,
};

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });

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
    const data = deriveRes080Data({ expediente: exp, results });
    await page.setContent(buildRes080Html({ data, appUrl: APP_URL, isForPdf: true }), { waitUntil: 'load' });
    await page.evaluate(async () => {
        for (const w of [400, 500, 600, 700]) await document.fonts.load(`${w} 12.5px 'Instrument Sans'`);
        await document.fonts.ready;
    });
    if (!await page.evaluate(() => document.fonts.check("12.5px 'Instrument Sans'"))) {
        console.error("La tipografia Instrument Sans no ha cargado: la medicion no vale.");
        await browser.close();
        process.exit(2);
    }
    // Alto REAL del contenido de cada hoja: el scrollHeight de `.doc-page` no
    // sirve (con `min-height` una hoja holgada mide siempre la hoja entera). Se
    // clona a la misma anchura con alto libre. La PORTADA (índice 0) se salta:
    // va a sangre, con todo posicionado en absoluto.
    const holguras = await page.evaluate(() => {
        const HOJA = Math.round(297 * 96 / 25.4);   // 1123 px
        return [...document.querySelectorAll('.doc-page')].slice(1).map(p => {
            const clon = p.cloneNode(true);
            Object.assign(clon.style, {
                position: 'absolute', top: '-20000px', left: '0',
                width: `${p.offsetWidth}px`, minHeight: '0', height: 'auto',
            });
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
    console.log(`${mal ? 'X ' : '  '} ${nombre.padEnd(52)} ${detalle}`);
}

await browser.close();
if (malos) { console.error(`\n${malos} caso(s) desbordan la hoja.`); process.exit(1); }
console.log('\nNinguna página desborda.');
