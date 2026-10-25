/**
 * Ninguna hoja del PDF de una FACTURA puede pasar de sus 297 mm.
 *
 * `buildFacturaCeeHtml` reparte las líneas en hojas con altos ESTIMADOS
 * (caracteres por línea). La hoja es `min-height:297mm`: lo que no cabe no se
 * recorta, EMPUJA el pie a una hoja que nadie ha previsto (una hoja con medio
 * pie y la numeración «Página 1 de 1» mintiendo). Aquí se mide de verdad, con
 * la tipografía del documento (Manrope + Archivo) servida desde
 * `frontend/public/fonts`, sobre facturas de 1 a 60 líneas en cada variante que
 * emite la pestaña Facturación: la réplica del CEE directo, la serie FML (sin
 * marca, con IRPF), suplidos con el QR de VERI*FACTU, rectificativas y el peor
 * caso que deja guardar el servidor.
 *
 *   node scripts/check_factura_paginas.mjs
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { buildFacturaCeeHtml } from '../../frontend/src/features/cee-directo/logic/facturaCee.js';
import { sanearLineas, MAX_OBSERVACIONES } from '../../frontend/src/features/facturacion/logic/presupuesto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '../../frontend/public');
const APP_URL = 'https://app.brokergy.es';
const ANCHO_A4 = 794;

const CLIENTE = {
    razon_social: 'INSTALACIONES Y MANTENIMIENTOS DEL SURESTE MANCHEGO SOCIEDAD LIMITADA',
    cif: 'B00000000', direccion: 'Calle de la Ronda de los Molinos Viejos 123, 2º izquierda',
    cp: '02001', municipio: 'Albacete', provincia: 'Albacete', email: 'cliente@example.com', tlf: '600000000',
};
// Un emisor sin marca con la dirección larga (la columna se estrecha con el QR).
const EMISOR_FML = {
    razonSocial: 'NOMBRE APELLIDO APELLIDO', direccion: 'Calle de la Ronda de los Molinos Viejos 123, 2º izquierda',
    cp: '13600', municipio: 'Alcázar de San Juan', provincia: 'Ciudad Real', cif: '00000000T', tlf: '600000000',
    email: 'profesional@example.com', banco: 'BANCO', iban: 'ES00 0000 0000 0000 0000 0000', persona_fisica: true, marca: false,
};

const CEE = (i) => (i % 2 === 0
    ? { articulo_id: '1', descripcion: 'Realización de Certificado de Eficiencia Energética Inicial y Final', uds: 1, precio: 220, ivaPct: 21 }
    : { articulo_id: '7', descripcion: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla La Mancha *', uds: 2, precio: 16.39, ivaPct: 0 });
const LARGA = (i) => ({
    descripcion: `Prestación de servicios de ingeniería – septiembre 2026, dirección técnica de obra y coordinación (${i + 1})`,
    detalle: 'Nave industrial de 1.200 m² en el polígono de Campollano, calle E, parcela 14.\nIncluye memoria técnica, certificado de instalación eléctrica y tramitación ante la distribuidora.',
    uds: 1, precio: 2250, ivaPct: 21,
});
const SUPLIDO = () => ({ descripcion: 'Tasa Certificado de Eficiencia Energética de Edificios Castilla-La Mancha', uds: 1, precio: 16.39, ivaPct: 0, suplido: true });
const CORTA = (i) => ({ descripcion: `Partida ${i + 1}`, uds: 1, precio: 100, ivaPct: 21 });
const MEZCLA = (i) => (i % 3 === 0 ? LARGA(i) : i % 3 === 1 ? SUPLIDO(i) : CORTA(i));
const NEGATIVA = (i) => ({ ...LARGA(i), uds: -1 });
const AL_TOPE = (i) => sanearLineas([{
    descripcion: `${i + 1} `.padEnd(400, 'Legalización instalación fotovoltaica nave '),
    detalle: Array.from({ length: 12 }, () => 'Memoria técnica, certificado y tramitación de la instalación').join('\n'),
    uds: 1, precio: 99999.99, ivaPct: 21,
}])[0];

const OBS_FML = 'Factura emitida conforme al art. 6.1.l del RD 1619/2012: la fecha de operación es distinta de la de expedición.\nServicios prestados por socio administrador en el ámbito de su actividad profesional.';
const OBS_TOPE = 'Observación larga de la factura, con condiciones particulares de la obra. '.repeat(40).slice(0, MAX_OBSERVACIONES);
const MOTIVO = 'Error en el importe de la base imponible: se facturó la dirección de obra completa cuando solo se prestó la mitad del servicio acordado en el presupuesto aceptado.';

const qrDataUri = await QRCode.toDataURL(
    'https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR?nif=B00000000&numserie=26ING_100&fecha=24-10-2026&importe=1234.56',
    { errorCorrectionLevel: 'M', margin: 2, width: 300 });
const QR = { dataUri: qrDataUri, leyenda: 'VERI*FACTU' };

const BASE = { numero: '26ING_100', fecha: '24/10/2026', vencimiento: '23/11/2026', cliente: CLIENTE, expediente: '2026CEE_64' };
const estilos = [
    ['réplica CEE (sin opciones)', CEE, { observaciones: 'Por políticas de empresa, hasta que no sea abonada la presente factura, no se entregarán los Certificados de Eficiencia Energética.' }],
    ['FML: sin marca, IRPF, fecha op.', LARGA, { emisor: EMISOR_FML, irpfPct: 15, fechaOperacion: 'septiembre 2026', observaciones: OBS_FML, expediente: '' }],
    ['mezcla con suplidos + QR', MEZCLA, { qr: QR, fechaOperacion: 'septiembre 2026' }],
    ['rectificativa + QR + IRPF', NEGATIVA, { emisor: EMISOR_FML, irpfPct: 15, qr: QR, numero: 'R-26FML_1', rectifica: { numero: '26FML_19', fecha: '30/09/2026', motivo: MOTIVO }, observaciones: OBS_FML, vencimiento: '' }],
    ['al tope + todo', AL_TOPE, { qr: QR, emisor: EMISOR_FML, irpfPct: 15, fechaOperacion: 'septiembre 2026', rectifica: { numero: '26ING_99', fecha: '01/10/2026', motivo: MOTIVO }, observaciones: OBS_TOPE }],
    ['cortas (sin opciones)', CORTA, {}],
    ['borrador', CORTA, { borrador: true, numero: '' }],
];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: ANCHO_A4, height: 1123 });
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
        const payload = { ...BASE, lineas: Array.from({ length: n }, (_, i) => linea(i)), ...extra };
        await page.setContent(buildFacturaCeeHtml(payload, { appUrl: APP_URL }), { waitUntil: 'load' });
        if (medidos === 0) {
            await page.evaluate(async () => {
                for (const w of [400, 500, 600, 700, 800]) await document.fonts.load(`${w} 12px 'Manrope'`);
                for (const w of [600, 700, 800]) await document.fonts.load(`${w} 12px 'Archivo'`);
                await document.fonts.ready;
            });
            if (!await page.evaluate(() => document.fonts.check("12px 'Manrope'") && document.fonts.check("700 12px 'Archivo'"))) {
                console.error('⚠️  Manrope/Archivo no han cargado: la medición no vale.');
                await browser.close();
                process.exit(2);
            }
        } else {
            await page.evaluate(() => document.fonts.ready);
        }
        medidos++;
        const holguras = await page.evaluate(() => {
            const HOJA = Math.round(297 * 96 / 25.4);
            return [...document.querySelectorAll('.sheet')].map(s => {
                const clon = s.cloneNode(true);
                Object.assign(clon.style, { position: 'absolute', top: '-20000px', left: '0',
                    width: `${s.offsetWidth}px`, height: 'auto', minHeight: '0', overflow: 'visible' });
                document.body.appendChild(clon);
                const alto = clon.getBoundingClientRect().height;
                clon.remove();
                return Math.round(HOJA - alto);
            });
        });
        if (holguras.some(h => h < 0)) {
            malos++;
            console.log(`❌ ${nombre} · ${n} líneas: ${holguras.map((h, i) => `h${i + 1}:${h < 0 ? `DESBORDA ${-h}` : `+${h}`}`).join('  ')}`);
        }
        resumen.push({ n, hojas: holguras.length, min: Math.min(...holguras) });
    }
    const peor = resumen.reduce((a, b) => (b.min < a.min ? b : a));
    const cambios = resumen.filter((r, i) => i === 0 || r.hojas !== resumen[i - 1].hojas).map(r => `${r.n}→${r.hojas}h`);
    const saltos = cambios.length > 6 ? `${cambios.slice(0, 5).join(' ')} … 60→${resumen.at(-1).hojas}h` : cambios.join(' ');
    console.log(`${peor.min < 0 ? '❌' : '  '} ${nombre.padEnd(34)} hojas: ${saltos.padEnd(34)} holgura mínima ${peor.min} px (con ${peor.n})`);
}

await browser.close();
if (malos) { console.error(`\n${malos} caso(s) desbordan la hoja.`); process.exit(1); }
console.log(`\nNinguna hoja desborda (${medidos} facturas medidas).`);
