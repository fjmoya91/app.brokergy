#!/usr/bin/env node
/**
 * El `.cex` generado desde una OPORTUNIDAD, y lo que pasa con él al aceptarla.
 *
 *   node implementation/backend/scripts/test_cex_oportunidad.js
 *
 * Con Drive SIMULADO: no escribe en ninguna carpeta real. Lo que se comprueba
 * es el nombre del fichero, que el expediente encuentre el inicial de la
 * oportunidad para hacer el final, y que al regenerar el inicial el de la
 * oportunidad acabe en OLD en vez de quedarse al lado.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const driveService = require('../services/driveService');
const ceeUploadService = require('../services/ceeUploadService');
const cex = require('../services/ceeEnvolventeCex');

let fallos = 0;
const comprueba = (que, real, esperado) => {
    const ok = JSON.stringify(real) === JSON.stringify(esperado);
    if (!ok) { fallos++; console.log(`  MAL  ${que}\n       esperado ${JSON.stringify(esperado)}\n       salió    ${JSON.stringify(real)}`); }
    else console.log(`  ok   ${que}`);
};

// ── Drive de mentira: una carpeta por fase, con sus ficheros ────────────────
const carpetas = { 'CEE INICIAL': [], 'CEE FINAL': [], OLD: [] };
let n = 0;
const buscar = (id) => Object.entries(carpetas)
    .flatMap(([c, l]) => l.map(f => ({ ...f, carpeta: c }))).find(f => f.id === id);
ceeUploadService.ensureCeeSectionFolder = async (_raiz, seccion) =>
    ({ id: seccion === 'cee_final' ? 'CEE FINAL' : 'CEE INICIAL', link: 'https://drive/x' });
driveService.findFileByName = async (carpeta, nombre) =>
    (carpetas[carpeta] || []).find(f => f.name === nombre)?.id || null;
driveService.listFiles = async (carpeta) => (carpetas[carpeta] || []).map(f => ({ ...f }));
driveService.saveFileToFolder = async (carpeta, nombre, _t, buffer) => {
    const f = { id: `f${++n}`, name: nombre, bytes: buffer };
    carpetas[carpeta].push(f);
    return { id: f.id, link: `https://drive/${f.id}` };
};
driveService.archiveExistingToOld = async (carpeta, id, nombre) => {
    carpetas[carpeta] = carpetas[carpeta].filter(f => f.id !== id);
    const nuevo = nombre.replace(/\.cex$/, '_OLD.cex');
    carpetas.OLD.push({ id, name: nuevo });
    return nuevo;
};
driveService.getFileContent = async (id) => buscar(id)?.bytes || null;

(async () => {
    const oportunidad = { es_oportunidad: true, numero_expediente: '26RES060_OP235' };
    const expediente = { numero_expediente: '26RES060_223' };
    const ctxOp = { expediente: oportunidad, driveFolderId: 'RAIZ' };
    const ctxEx = { expediente, driveFolderId: 'RAIZ' };

    console.log('\n1. La oportunidad genera su inicial, con SU número');
    const g1 = await cex.guardarEnDrive(ctxOp, Buffer.from('op-inicial'), 'inicial');
    comprueba('se guarda', g1.ok, true);
    comprueba('con el número de la oportunidad', g1.nombre,
              '26RES060_OP235 - CEE INICIAL_REVISAR.cex');

    console.log('\n2. Ya aceptada, el expediente hace el FINAL sobre ese inicial');
    const partida = await cex.leerCexDeFase(ctxEx, 'inicial');
    comprueba('lo encuentra aunque lleve otro número', partida?.nombre,
              '26RES060_OP235 - CEE INICIAL_REVISAR.cex');
    comprueba('y son sus bytes', partida?.bytes?.toString(), 'op-inicial');

    console.log('\n3. El expediente regenera el inicial: el de la oportunidad pasa a OLD');
    const g2 = await cex.guardarEnDrive(ctxEx, Buffer.from('ex-inicial'), 'inicial');
    comprueba('se guarda con el número del expediente', g2.nombre,
              '26RES060_223 - CEE INICIAL_REVISAR.cex');
    comprueba('queda UNO solo en la carpeta',
              carpetas['CEE INICIAL'].map(f => f.name), ['26RES060_223 - CEE INICIAL_REVISAR.cex']);
    comprueba('el de la oportunidad, archivado (nunca borrado)',
              carpetas.OLD.map(f => f.name), ['26RES060_OP235 - CEE INICIAL_REVISAR_OLD.cex']);
    comprueba('y se dice', g2.archivados_otros, ['26RES060_OP235 - CEE INICIAL_REVISAR.cex']);

    const partida2 = await cex.leerCexDeFase(ctxEx, 'inicial');
    comprueba('el final ya se hace sobre el del expediente', partida2?.bytes?.toString(), 'ex-inicial');

    console.log('\n4. El .cex del TÉCNICO no se toca nunca');
    carpetas['CEE INICIAL'].push({ id: 'tec', name: '26RES060_223 - CEE INICIAL.cex' });
    await cex.guardarEnDrive(ctxEx, Buffer.from('ex-inicial-2'), 'inicial');
    comprueba('sigue en su sitio',
              carpetas['CEE INICIAL'].some(f => f.name === '26RES060_223 - CEE INICIAL.cex'), true);

    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo en orden');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
