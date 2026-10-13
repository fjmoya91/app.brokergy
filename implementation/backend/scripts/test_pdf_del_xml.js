#!/usr/bin/env node
// test_pdf_del_xml.js — lo que decide el vigilante del PDF del CEE (scripts/pdf_del_xml.js):
// en qué carpetas actúa y cuándo un PDF ya está al día. No llama a xml2cert.
//   node scripts/test_pdf_del_xml.js
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { enCarpetaDeCee, pdfAlDia, normal, ignorada, escribirPdf } = require('./pdf_del_xml');

let ok = 0;
const caso = (nombre, fn) => { fn(); ok++; console.log(`✓ ${nombre}`); };
const R = 'C:\\Users\\Usuario\\Mi unidad\\01. RD 36-2023 (CAES)\\05. PRODUCCIÓN\\01. BROKERGY-APP EXPEDIENTES';

caso('actúa en la carpeta de cada fase del CEE (expediente y CEE directo)', () => {
    for (const r of [
        `${R}\\04. EN CURSO\\26RES060_188 - OLAYO SANTOS ALFARO\\1. CEE\\CEE INICIAL\\26RES060_188 - CEE INICIAL.xml`,
        `${R}\\04. EN CURSO\\26RES080_92 - X\\1. CEE\\CEE FINAL\\26RES080_92 – CEE FINAL.xml`,
        'C:\\Users\\Usuario\\Mi unidad\\26. CERTIF. EFICIENCIA ENER\\1. PRODUCCION\\2026CEE_62 - DEMO SOLERA CB\\1. CEE\\2026CEE_62 – CEE.xml',
        'C:\\Users\\Usuario\\Mi unidad\\26. CERTIF. EFICIENCIA ENER\\1. PRODUCCION\\2026CEE_57 - MARIA SERRANO NAVARRO\\2. CEE FINAL\\2026CEE_57 – CEE FINAL.xml',
        'C:\\Users\\Usuario\\Mi unidad\\26. CERTIF. EFICIENCIA ENER\\1. PRODUCCION\\2026CEE_61 - JOSÉ ÁNGEL\\1. CEE INICIAL\\2026CEE_61 - CEE INICIAL.xml',
    ]) assert.ok(enCarpetaDeCee(r), r);
});

caso('NO actúa en lotes, requerimientos, documentos para CEE ni subcarpetas (medido el 12/10/2026)', () => {
    for (const r of [
        `${R}\\07. ENVIADOS A VERIFICAR\\LOTE-2026-007 - ENVIO GESTOR\\E1\\E1-4-6 - 26RES060_152 - CEE INICIAL_XML.xml`,
        `${R}\\10. REQUERIMIENTOS\\25RES060_84 - SANTIAGO RUBIO MADRID\\E5\\E5-3-8 - 25RES060_84 - CEE FINAL_XML.xml`,
        `${R}\\01. OPORTUNIDADES\\26RES060_OP289 - MARIA DEL CARMEN\\12. DOCUMENTOS PARA CEE\\DOC_CEE_EXISTENTE_4.xml`,
        `${R}\\05. DOC. COMPLETA\\26RES060_167 - ÁNGEL NAVAS CRESPO\\10. EXPEDIENTE CAE\\26RES060_167 - CEE Final XML.xml`,
        `${R}\\04. EN CURSO\\26RES080_78 - X\\1. CEE\\CEE INICIAL\\26RES080_78 - CEE INICIAL_CON MEDIDA_REVISAR\\a.xml`,
        `${R}\\04. EN CURSO\\26RES080_92 - X\\1. CEE\\CEE INICIAL\\CEE PREVISTO (MEDIDA INTEGRAL)\\INTEGRAL.xml`,
        `${R}\\04. EN CURSO\\26RES060_188 - X\\1. CEE\\CEE INICIAL\\OLD\\26RES060_188 - CEE INICIAL.xml`,
    ]) assert.ok(!enCarpetaDeCee(r), r);
    assert.ok(ignorada('a\\OLD\\b.xml') && ignorada('.tmp.drivedownload\\x.xml') && !ignorada('a\\CEE INICIAL\\b.xml'));
});

caso('la raya de la app y el guion de CE3X son el mismo nombre', () => {
    assert.strictEqual(normal('26RES060_188 – CEE INICIAL'), normal('26RES060_188 - CEE INICIAL'));
    assert.notStrictEqual(normal('26RES060_188 - CEE INICIAL'), normal('26RES060_188 - CEE FINAL'));
});

caso('al día: PDF posterior, gemelo con los mismos bytes, firmado _fdo; y no al día si el XML cambia', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfxml-'));
    try {
        const xml = Buffer.from('<DatosEnergeticosDelEdificio version="3.0"></DatosEnergeticosDelEdificio>');
        const fecha = (f, s) => fs.utimesSync(path.join(d, f), s, s);
        fs.writeFileSync(path.join(d, 'N - CEE INICIAL.xml'), xml); fecha('N - CEE INICIAL.xml', 1000);
        assert.strictEqual(pdfAlDia(path.join(d, 'N - CEE INICIAL.xml'), xml), null, 'sin PDF');
        fs.writeFileSync(path.join(d, 'N - CEE INICIAL.pdf'), 'pdf'); fecha('N - CEE INICIAL.pdf', 1010);
        assert.ok(pdfAlDia(path.join(d, 'N - CEE INICIAL.xml'), xml), 'PDF posterior');
        // la app sube el mismo XML con raya, más tarde que el PDF
        fs.writeFileSync(path.join(d, 'N – CEE INICIAL.xml'), xml); fecha('N – CEE INICIAL.xml', 2000);
        assert.match(pdfAlDia(path.join(d, 'N – CEE INICIAL.xml'), xml).porque, /mismo XML/);
        // otro contenido con raya: no está al día
        const otro = Buffer.from('<DatosEnergeticosDelEdificio version="3.0"><X/></DatosEnergeticosDelEdificio>');
        fs.writeFileSync(path.join(d, 'N – CEE INICIAL.xml'), otro); fecha('N – CEE INICIAL.xml', 2000);
        assert.strictEqual(pdfAlDia(path.join(d, 'N – CEE INICIAL.xml'), otro), null, 'XML distinto');
        // ya firmado después del XML
        fs.writeFileSync(path.join(d, 'N – CEE INICIAL_fdo.pdf'), 'pdf'); fecha('N – CEE INICIAL_fdo.pdf', 2100);
        assert.ok(pdfAlDia(path.join(d, 'N – CEE INICIAL.xml'), otro), 'firmado');
        // un PDF de OTRA fase no cuenta
        fs.writeFileSync(path.join(d, 'N - CEE FINAL.xml'), xml); fecha('N - CEE FINAL.xml', 3000);
        assert.strictEqual(pdfAlDia(path.join(d, 'N - CEE FINAL.xml'), xml), null, 'otra fase');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

caso('el PDF anterior va a OLD/ con la hora, nunca se pisa; sin anterior no crea OLD', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfxml-'));
    try {
        const destino = path.join(d, 'N - CEE INICIAL.pdf');
        assert.strictEqual(escribirPdf(destino, Buffer.from('uno')), null, 'sin anterior');
        assert.ok(!fs.existsSync(path.join(d, 'OLD')), 'no crea OLD sin anterior');
        const v1 = escribirPdf(destino, Buffer.from('dos'));
        assert.match(path.basename(v1), /^N - CEE INICIAL_\d{8}_\d{6}\.pdf$/);
        assert.strictEqual(fs.readFileSync(v1, 'utf8'), 'uno', 'el viejo, en OLD');
        assert.strictEqual(fs.readFileSync(destino, 'utf8'), 'dos', 'el nuevo, en su sitio');
        // dos en el mismo segundo: no se pisan dentro de OLD
        const v2 = escribirPdf(destino, Buffer.from('tres'));
        assert.notStrictEqual(v1, v2);
        assert.strictEqual(fs.readdirSync(path.join(d, 'OLD')).length, 2);
        // el firmado no se toca
        fs.writeFileSync(path.join(d, 'N - CEE INICIAL_fdo.pdf'), 'firmado');
        escribirPdf(destino, Buffer.from('cuatro'));
        assert.strictEqual(fs.readFileSync(path.join(d, 'N - CEE INICIAL_fdo.pdf'), 'utf8'), 'firmado');
    } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

console.log(`\n${ok} casos OK`);
