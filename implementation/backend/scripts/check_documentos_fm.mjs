/**
 * Los documentos de firma de la VÍA DEL FACTOR MULTIPLICADOR caben en sus hojas.
 *
 *   node scripts/check_documentos_fm.mjs
 *
 * Anexo A (dos hojas por cedente), declaración del instalador (tipología),
 * documento informado F/G, oferta de mantenimiento y Anexo B: hojas de 1122 px
 * con `overflow:hidden` y la casilla de firma en una posición FIJA (FIRMA_FM, la
 * misma que estampan Autofirma y la firma a mano). Lo que no cabe no descoloca
 * nada, DESAPARECE, así que aquí se mide con los datos más largos:
 *   · el texto de cada hoja no baja hasta la casilla de firma (ni hasta el pie);
 *   · el «Fdo.:» de debajo de la casilla no pisa el pie;
 *   · cada documento tiene las hojas que debe (el Anexo A, 2 × cedentes: con
 *     ese número decide `anexoISignBox` que es un Anexo A y dónde se firma).
 *
 * Requiere red: Inter llega por @font-face desde la app y con la de respaldo el
 * documento mide de menos (mediría bien algo que en producción se corta).
 *
 *   node scripts/check_documentos_fm.mjs --capturas=<carpeta>   (un PNG por caso, para mirarlos)
 */
import puppeteer from 'puppeteer';
import {
    buildAnexoAHtml, buildDeclaracionTipologiaHtml, buildInformadoFgHtml,
    buildOfertaMantenimientoHtml, buildAnexoBHtml,
} from '../../frontend/src/features/expedientes/logic/documentosFm.js';
import { FIRMA_FM, PAGINAS_ANEXO_A, anexoISignBox, anexoISignBoxCedente, cajaFirmaFmPt } from '../../frontend/src/features/expedientes/logic/signBoxes.js';

const CAPTURAS = (process.argv.find(a => a.startsWith('--capturas=')) || '').slice('--capturas='.length) || null;
const LARGO ='MARÍA DE LOS DESAMPARADOS FERNÁNDEZ-GUTIÉRREZ DE LA HOZ Y RODRÍGUEZ';
const stress = {
    numero_expediente: '26RES093FM_123',
    clientes: {
        nombre_razon_social: 'MARÍA DE LOS DESAMPARADOS', apellidos: 'FERNÁNDEZ-GUTIÉRREZ DE LA HOZ Y RODRÍGUEZ',
        dni: '05123456X', dni_nie: '05123456X',
        direccion: 'CALLE DE LA VIRGEN DE LA CANDELARIA DEL ROSARIO, 128, ESCALERA B, 3º IZQ',
        codigo_postal: '13700', municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        tlf: '623926179', email: 'maria.desamparados.fernandez@correoelectronicolargo.es',
    },
    instalacion: {
        ref_catastral: '1234567VK1213S0001AB', municipio: 'Villanueva de los Infantes', provincia: 'Ciudad Real',
        ccaa: 'Castilla-La Mancha', cambio_acs: true,
        aerotermia_cal: {
            marca: 'MITSUBISHI ELECTRIC', modelo: 'ECODAN PUHZ-SHW112YAA + ERST30D-VM2ED', numero_serie: '8ZU01234567890',
            equipos_extra: [{ marca: 'MITSUBISHI ELECTRIC', modelo: 'ECODAN PUHZ-SHW112YAA', numero_serie: '8ZU01234567891' }],
        },
        aerotermia_acs: { marca: 'MITSUBISHI ELECTRIC', modelo: 'ERST30D-VM2ED', numero_serie: '1ZW00987654321' },
    },
    oportunidades: { datos_calculo: { zona: 'D3' } },
    documentacion: {
        via_fm: { vulnerable: true, mantenimiento: 'acepta', mantenimiento_importe: '185,00 €/año (IVA incluido)', anexo_b_casilla: 'severo' },
        subvenciones: {
            solicitada: true,
            ayuda: {
                catalogo_id: '', denominacion: 'PROGRAMA DE INCENTIVOS LIGADOS AL AUTOCONSUMO Y ALMACENAMIENTO Y A LA IMPLANTACIÓN DE SISTEMAS TÉRMICOS RENOVABLES EN EL SECTOR RESIDENCIAL',
                organo: 'AGENCIA DE TRANSFORMACIÓN DIGITAL Y EFICIENCIA ENERGÉTICA DE CASTILLA-LA MANCHA',
                disposicion: 'Real Decreto 477/2021, de 29 de junio, y Orden 87/2021 de la Consejería de Desarrollo Sostenible',
                anio: '2025', num_expediente: 'PRTR-RES-2025-001234-CLM', estado: 'PENDIENTE',
                fecha_solicitud: '2025-06-14', fecha_resolucion: '2025-10-30', cuantia_eur: 18800,
            },
        },
    },
    prescriptores: {
        razon_social: 'INSTALACIONES TÉRMICAS Y ENERGÉTICAS DEL CAMPO DE MONTIEL Y LA MANCHA, S.L.', cif: 'B13456789',
        numero_carnet_rite: 'CLM-13/RITE/2019/000123', direccion: 'POLÍGONO INDUSTRIAL LOS LLANOS, CALLE C, NAVE 14',
        codigo_postal: '13300', municipio: 'Valdepeñas', provincia: 'Ciudad Real',
        representante_distinto: true,
        representante_nombre: 'FRANCISCO JAVIER', representante_apellidos: 'MOYA LÓPEZ DE LA TORRE DE LOS CABALLEROS', representante_dni: '06282551D',
    },
};
const real = {
    ...stress, numero_expediente: '26RES060FM_9',
    clientes: { nombre_razon_social: 'JUAN', apellidos: 'GARCÍA PÉREZ', dni: '06000000T', direccion: 'CL DON SERGIO 15',
        codigo_postal: '13700', municipio: 'Tomelloso', tlf: '600000000', email: 'juangarcia@gmail.com' },
    instalacion: { ...stress.instalacion, municipio: 'Tomelloso',
        aerotermia_cal: { marca: 'PANASONIC', modelo: 'WH-MDC09J3E5', numero_serie: 'A1234' }, aerotermia_acs: null, cambio_acs: false },
    documentacion: { via_fm: {} },
};
// Particular REPRESENTADO por poder notarial: el apartado 3 del Anexo A va lleno.
const representado = (e) => ({ ...e, clientes: { ...e.clientes, representado: true,
    representante_nombre: 'FRANCISCO JAVIER', representante_apellidos: 'MOYA LÓPEZ DE LA TORRE DE LOS CABALLEROS',
    representante_dni: '06282551D', representacion_tipo: 'NOTARIAL', representacion_fecha: '2019-03-14',
    representacion_protocolo: '1.234' } });
const empresa = (e) => ({ ...e, clientes: { ...e.clientes, es_empresa: true, nombre_razon_social: 'PROMOCIONES Y RESIDENCIAS DEL CAMPO DE CALATRAVA', apellidos: 'S.L.',
    representante_nombre: 'FRANCISCO JAVIER', representante_apellidos: 'MOYA LÓPEZ DE LA TORRE', representante_dni: '06282551D' } });
const varios = (e, n) => ({ ...e, clientes: { ...e.clientes, copropietarios:
    Array.from({ length: n - 1 }, (_, i) => ({ id: `c${i}`, cedente: true, nombre: 'MARÍA DE LAS MERCEDES',
        apellidos: `FERNÁNDEZ-CABALLERO DE LA HOZ ${i}`, dni: '05123456X', cuota_pct: null })) } });
const otraVulnerable = (e) => ({ ...e, documentacion: { ...e.documentacion, via_fm: { ...e.documentacion.via_fm,
    vulnerable_persona: { nombre: LARGO, nif: 'X1234567L', domicilio: 'CALLE DE LA VIRGEN DE LA CANDELARIA DEL ROSARIO, 128, ESCALERA B, 3º IZQ, 13700 VILLANUEVA DE LOS INFANTES', telefono: '623926179', email: 'inquilina.vulnerable@correoelectronicolargo.es' } } } });

const ctx = { tipologia: { clase: 'bloque', label: 'Edificio con sistema centralizado de calefacción y ACS', fm: 3 }, zona: 'D3', letraFg: 'G' };

const casos = [
    // [nombre, html, hojas esperadas]
    ['Anexo A · real',                 buildAnexoAHtml(real), 2],
    ['Anexo A · peor caso',            buildAnexoAHtml(stress), 2],
    ['Anexo A · representado',         buildAnexoAHtml(representado(stress)), 2],
    ['Anexo A · empresa',              buildAnexoAHtml(empresa(stress)), 2],
    ['Anexo A · 3 cedentes',           buildAnexoAHtml(varios(representado(stress), 3)), 6],
    ['Tipología · real',               buildDeclaracionTipologiaHtml(real, { tipologia: { clase: 'unifamiliar' } }), 1],
    ['Tipología · peor caso',          buildDeclaracionTipologiaHtml(stress, ctx), 1],
    ['Informado F/G · real',           buildInformadoFgHtml(real, { zona: 'E1' }), 1],
    ['Informado F/G · peor caso',      buildInformadoFgHtml(representado(stress), ctx), 1],
    ['Mantenimiento · sin decidir',    buildOfertaMantenimientoHtml(real, {}), 1],
    ['Mantenimiento · peor caso',      buildOfertaMantenimientoHtml(representado(stress), ctx), 1],
    ['Anexo B · titular',              buildAnexoBHtml(real, {}), 1],
    ['Anexo B · otra persona',         buildAnexoBHtml(otraVulnerable(stress), ctx), 1],
];

// La casilla de la firma, en puntos PDF, es la que el documento DIBUJA: si no, la
// firma digital y la manuscrita caerían fuera del recuadro.
let malos = 0;
const caja = cajaFirmaFmPt(1);
const esperado = {
    llx: Math.round(FIRMA_FM.left * 0.75 + 2), urx: Math.round((FIRMA_FM.left + FIRMA_FM.width) * 0.75 - 2),
};
if (caja.llx !== esperado.llx || caja.urx !== esperado.urx || caja.lly >= caja.ury) {
    console.log('❌ cajaFirmaFmPt no coincide con FIRMA_FM', caja); malos++;
}
if (anexoISignBox({ numPaginas: PAGINAS_ANEXO_A }).page !== 2) { console.log('❌ anexoISignBox: el Anexo A se firma en su hoja 2'); malos++; }
// Con 3 cedentes el Anexo A son 6 hojas y el segundo firma en la 4.
if (anexoISignBoxCedente(1, 3)({ numPaginas: 6 })?.page !== 4) { console.log('❌ anexoISignBoxCedente: el 2º de 3 firma el Anexo A en la hoja 4'); malos++; }
// Y el Anexo I de siempre no cambia: 4 hojas el oficial, 3 la maqueta.
if (anexoISignBox({ numPaginas: 4 }).page === 2 || anexoISignBox({ numPaginas: 3 }).page === 2) { console.log('❌ anexoISignBox confunde el Anexo I con el Anexo A'); malos++; }

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 900, height: 1200 });
for (const [nombre, html, hojas] of casos) {
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(async () => { await document.fonts.load('11px Inter'); await document.fonts.load('bold 11px Inter'); await document.fonts.ready; });
    if (!await page.evaluate(() => document.fonts.check('11px Inter'))) {
        console.error('⚠️  La tipografía Inter no ha cargado: la medición no vale. Revisa la conexión.');
        await browser.close();
        process.exit(2);
    }
    const medidas = await page.evaluate(() => [...document.querySelectorAll('.fm-page')].map(p => {
        const top = p.getBoundingClientRect().top;
        const cuerpo = p.querySelector('.fm-cuerpo');
        const ultimo = [...cuerpo.children].pop();
        const fondoTexto = ultimo.getBoundingClientRect().bottom - top;
        const pie = p.querySelector('.fm-pie').getBoundingClientRect().top - top;
        const firma = p.querySelector('.fm-firma');
        const fdo = p.querySelector('.fm-fdo');
        const tope = firma ? firma.getBoundingClientRect().top - top : pie;
        return {
            alto: Math.round(p.getBoundingClientRect().height),
            holgura: Math.round(tope - 10 - fondoTexto),
            fdoPie: fdo ? Math.round(pie - 4 - (fdo.getBoundingClientRect().bottom - top)) : null,
            conFirma: !!firma,
        };
    }));
    if (CAPTURAS) {
        await page.setViewport({ width: 794, height: 1122 * medidas.length });
        await page.screenshot({ path: `${CAPTURAS}/${nombre.replace(/[^a-z0-9]+/gi, '_')}.png`, fullPage: true });
        await page.setViewport({ width: 900, height: 1200 });
    }
    const firmas = medidas.filter(m => m.conFirma).length;
    const firmasEsperadas = nombre.startsWith('Anexo A') ? hojas / PAGINAS_ANEXO_A : 1;
    const mal = medidas.length !== hojas || firmas !== firmasEsperadas
        || medidas.some(m => m.alto !== 1122 || m.holgura < 0 || (m.fdoPie !== null && m.fdoPie < 0));
    if (mal) malos++;
    console.log(`${mal ? '❌' : '  '} ${nombre.padEnd(30)} hojas=${medidas.length}/${hojas} firmas=${firmas} `
        + medidas.map((m, i) => `h${i + 1}: ${m.holgura < 0 ? `SE CORTA ${-m.holgura}px` : `holgura ${m.holgura}px`}`
            + (m.fdoPie !== null ? ` (fdo ${m.fdoPie < 0 ? `PISA el pie ${-m.fdoPie}px` : `ok ${m.fdoPie}px`})` : '')).join(' | '));
}
await browser.close();
if (malos) { console.error(`\n${malos} caso(s) no caben o no firman donde deben.`); process.exit(1); }
console.log('\nTodo cabe: el Anexo A en dos hojas por cedente y los otros cuatro en una, con la firma en su casilla.');
