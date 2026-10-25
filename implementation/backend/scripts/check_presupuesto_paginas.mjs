/**
 * Ninguna hoja del PDF de un PRESUPUESTO puede desbordar sus 297 mm.
 *
 * `buildOfertaCeeHtml` reparte las partidas en hojas con altos ESTIMADOS
 * (caracteres por línea), y cada `.sheet` es `height:297mm; overflow:hidden`:
 * lo que no cabe no salta de hoja, se RECORTA en silencio —una partida o el
 * total a medias— y en el visor no se nota. Aquí se mide de verdad, con la
 * tipografía del documento (Manrope + Archivo) servida desde
 * `frontend/public/fonts`, sobre presupuestos de 1 a 60 partidas: conceptos
 * cortos, conceptos largos con detalle de varias líneas, suplidos y
 * observaciones largas.
 *
 *   node scripts/check_presupuesto_paginas.mjs
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import { buildOfertaCeeHtml } from '../../frontend/src/features/cee-directo/logic/ofertaCee.js';
import { sanearLineas, MAX_OBSERVACIONES } from '../../frontend/src/features/facturacion/logic/presupuesto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const APP_URL = 'https://app.brokergy.es';
const ANCHO_A4 = 794;   // px a 96 dpi: el ancho al que maqueta page.pdf({ format: 'A4' })

const CLIENTE = {
    nombre_razon_social: 'INSTALACIONES Y MANTENIMIENTOS DEL SURESTE MANCHEGO SOCIEDAD LIMITADA',
    dni: 'B00000000', direccion: 'Calle de la Ronda de los Molinos Viejos 123, 2º izquierda',
    codigo_postal: '02001', municipio: 'Albacete', provincia: 'Albacete', email: 'cliente@example.com', tlf: '600000000',
};

const CORTA = (i) => ({ descripcion: `Partida ${i + 1}`, uds: 1, precio: 100, ivaPct: 21 });
const LARGA = (i) => ({
    descripcion: `Legalización de instalación solar fotovoltaica de autoconsumo con excedentes acogida a compensación simplificada (${i + 1})`,
    detalle: 'Nave industrial de 1.200 m² en el polígono de Campollano, calle E, parcela 14.\nIncluye memoria técnica, certificado de instalación eléctrica y tramitación ante la distribuidora.',
    uds: 2, precio: 1234.56, dtoPct: 10, ivaPct: 21,
});
const SUPLIDO = (i) => ({ descripcion: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha', uds: 1, precio: 16.39, ivaPct: 0, suplido: true });
const MEZCLA = (i) => (i % 3 === 0 ? LARGA(i) : i % 3 === 1 ? SUPLIDO(i) : CORTA(i));

const OBS_LARGAS = Array.from({ length: 6 }, () =>
    'Los trabajos se realizarán en un plazo máximo de treinta días desde la aceptación y la entrega de la documentación por parte del cliente, que deberá facilitar el acceso a la instalación.').join('\n');

// El PEOR caso que deja guardar el servidor: concepto y detalle al tope de
// `sanearLineas` (300 / 600, aquí sin espacios largos donde partir) y las
// observaciones al de MAX_OBSERVACIONES. Una partida y las observaciones no se
// parten entre hojas, así que cada una tiene que caber entera en una.
const AL_TOPE = (i) => sanearLineas([{
    descripcion: `${i + 1} `.padEnd(400, 'Legalización instalación fotovoltaica nave '),
    detalle: Array.from({ length: 12 }, () => 'Memoria técnica, certificado y tramitación de la instalación').join('\n'),
    uds: 1, precio: 99999.99, ivaPct: 21,
}])[0];
const OBS_TOPE = 'Observación larga del presupuesto, con condiciones particulares de la obra. '.repeat(40).slice(0, MAX_OBSERVACIONES);

const estilos = [
    ['cortas', CORTA, {}],
    ['largas con detalle', LARGA, {}],
    ['mezcla con suplidos', MEZCLA, {}],
    ['largas + observaciones largas', LARGA, { observaciones: OBS_LARGAS }],
    ['al tope (300/600 + obs. 2000)', AL_TOPE, { observaciones: OBS_TOPE }],
];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: ANCHO_A4, height: 1123 });

// Las tipografías salen del repo, no de la red (con la de respaldo el texto
// mediría de menos y daría por bueno algo que en producción se corta).
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

let malos = 0;
let medidos = 0;

for (const [nombre, linea, extra] of estilos) {
    const resumen = [];
    for (let n = 1; n <= 60; n++) {
        const o = { numero: 'P-26ING_140', lineas: Array.from({ length: n }, (_, i) => linea(i)), ...extra };
        await page.setContent(buildOfertaCeeHtml(o, { cliente: CLIENTE, firmaUrl: 'https://app.brokergy.es/aceptar-cee/x', appUrl: APP_URL }), { waitUntil: 'load' });
        if (medidos === 0) {
            await page.evaluate(async () => {
                for (const w of [400, 500, 600, 700, 800]) await document.fonts.load(`${w} 12px 'Manrope'`);
                for (const w of [600, 700, 800]) await document.fonts.load(`${w} 12px 'Archivo'`);
                await document.fonts.ready;
            });
            if (!await page.evaluate(() => document.fonts.check("12px 'Manrope'") && document.fonts.check("700 12px 'Archivo'"))) {
                console.error("⚠️  Manrope/Archivo no han cargado: la medición no vale.");
                await browser.close();
                process.exit(2);
            }
        } else {
            await page.evaluate(() => document.fonts.ready);
        }
        medidos++;
        // Alto REAL del contenido de cada hoja: se clona con alto libre. El pie
        // va con `margin-top:auto`, que en alto libre no reserva nada de más.
        const hojas = await page.evaluate(() => {
            const HOJA = Math.round(297 * 96 / 25.4);   // 1123 px
            return [...document.querySelectorAll('.sheet')].map(s => {
                const clon = s.cloneNode(true);
                Object.assign(clon.style, { position: 'absolute', top: '-20000px', left: '0',
                    width: `${s.offsetWidth}px`, height: 'auto', overflow: 'visible' });
                document.body.appendChild(clon);
                const alto = clon.getBoundingClientRect().height;
                clon.remove();
                // Lo primero que lleva la hoja tras su cabecera (una partida o un
                // bloque del final): si cabía en el hueco de la anterior, el salto sobraba.
                const fila = s.querySelector('tbody tr');
                const primero = fila ? fila.getBoundingClientRect().height : (s.children[2]?.getBoundingClientRect().height ?? 0);
                return { holgura: Math.round(HOJA - alto), primero: Math.round(primero) };
            });
        });
        const holguras = hojas.map(h => h.holgura);
        // Un salto EVITABLE: lo primero de la hoja siguiente cabía en esta, incluso
        // con el pie grande (33 px más que el de las hojas intermedias).
        const evitables = hojas.slice(0, -1).filter((h, i) => hojas[i + 1].primero + 33 + 20 < h.holgura).length;
        const mal = holguras.some(h => h < 0);
        if (mal) {
            malos++;
            console.log(`❌ ${nombre} · ${n} partidas: ${holguras.map((h, i) => `h${i + 1}:${h < 0 ? `DESBORDA ${-h}` : `+${h}`}`).join('  ')}`);
        }
        resumen.push({ n, hojas: holguras.length, min: Math.min(...holguras), evitables });
    }
    // Una línea por estilo: cuántas hojas salen y la holgura más justa.
    const peor = resumen.reduce((a, b) => (b.min < a.min ? b : a));
    const cambios = resumen.filter((r, i) => i === 0 || r.hojas !== resumen[i - 1].hojas).map(r => `${r.n}→${r.hojas}h`);
    const saltos = cambios.length > 6 ? `${cambios.slice(0, 5).join(' ')} … 60→${resumen.at(-1).hojas}h` : cambios.join(' ');
    const conHueco = resumen.filter(r => r.evitables).map(r => r.n);
    console.log(`${peor.min < 0 ? '❌' : '  '} ${nombre.padEnd(30)} hojas: ${saltos.padEnd(34)} holgura mínima ${peor.min} px (con ${peor.n})`
        + (conHueco.length ? `  · salto evitable con ${conHueco.length > 8 ? `${conHueco.slice(0, 8).join(', ')}…` : conHueco.join(', ')}` : ''));
}

// Lo que se pide de verdad tiene que salir en UNA hoja (25/10/2026, Fran: con
// cuatro partidas la aceptación se iba sola a la segunda): CEE + su tasa +
// legalización + su tasa, con un cliente de los normales; y con observaciones
// cortas, como en el borrador de Fran (sin ficha de cliente todavía). Con ficha
// completa Y observaciones no cabe por ~20 px: ahí el salto es de verdad.
const CLIENTE_NORMAL = {
    nombre_razon_social: 'María', apellidos: 'Fernández López', dni: '00000000T',
    direccion: 'Calle Mayor 12, 1º B', codigo_postal: '13700', municipio: 'Tomelloso', provincia: 'Ciudad Real',
    email: 'cliente@example.com', tlf: '600000000',
};
const CUATRO = [
    { descripcion: 'Certificado de Eficiencia Energética, incluida su presentación en Industria', uds: 1, precio: 150, ivaPct: 21 },
    { descripcion: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha', uds: 1, precio: 16.39, ivaPct: 0, suplido: true },
    { descripcion: 'Legalización de instalación de aerotermia', uds: 1, precio: 190, ivaPct: 21 },
    { descripcion: 'Tasa Legalización Instalación térmica Castilla-La Mancha', uds: 1, precio: 11.97, ivaPct: 0, suplido: true },
];
for (const [nombre, cliente, extra] of [['4 partidas', CLIENTE_NORMAL, {}],
    ['4 partidas + observaciones (sin ficha de cliente)', {}, { observaciones: 'La visita se concertará con el cliente.\nPlazo de entrega: 10 días.' }]]) {
    await page.setContent(buildOfertaCeeHtml({ numero: 'P-26ING_140', lineas: CUATRO, ...extra }, { cliente, firmaUrl: 'https://app.brokergy.es/aceptar-cee/x', appUrl: APP_URL }), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    const n = await page.evaluate(() => document.querySelectorAll('.sheet').length);
    if (n !== 1) { malos++; console.log(`❌ ${nombre}: ${n} hojas (tiene que caber en una)`); } else console.log(`   ${nombre}: 1 hoja`);
}

await browser.close();
if (malos) { console.error(`\n${malos} caso(s) desbordan la hoja o saltan sin necesidad.`); process.exit(1); }
console.log(`\nNinguna hoja desborda (${medidos} presupuestos medidos).`);
