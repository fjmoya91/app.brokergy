// Pruebas del MOTOR DE CE3X EN EL SERVIDOR (2026-11-23, servicio ce3x-engine): con CE3X_URL los
// trabajos FIJOS (calificar_ext, calificar_op) van a la cola con destino SERVIDOR y los coge la vuelta
// del propio VPS (PC_NOMBRE=SERVIDOR), que no da latido y no coge nada más. Y `cexAPdf` manda el
// oráculo al servicio y deja en la carpeta lo que devuelve. Cola de usar y tirar, un ce3x-engine de
// mentira: no toca la BD, ni el WhatsApp, ni CE3X.
//   node implementation/backend/scripts/test_ce3x_servidor.js
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');

let ok = 0, ko = 0;
const prueba = (nombre, cond, extra = '') => {
    if (cond) { ok++; console.log(`  ✓ ${nombre}`); }
    else { ko++; console.log(`  ✗ ${nombre}${extra ? `\n      ${extra}` : ''}`); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ce3x-servidor-'));
const COLA = path.join(tmp, 'cola');
const TRABAJOS = path.join(tmp, 'trabajos');
fs.mkdirSync(COLA);
const ahora = Math.floor(Date.now() / 1000);
const ponerCola = l => fs.writeFileSync(path.join(COLA, 'tareas_pc.json'), JSON.stringify(l));

// La vuelta EN SECO (no escribe nada) como la lanzaría el vigía, o como la de un PC.
function vuelta(pcNombre, conUrl = true) {
    const env = { ...process.env, ASISTENTE_COLA_DIR: COLA, PC_TRABAJOS_DIR: TRABAJOS, PC_NOMBRE: pcNombre };
    if (conUrl) env.CE3X_URL = 'http://127.0.0.1:9'; else delete env.CE3X_URL;
    const r = spawnSync(process.execPath, [path.join(__dirname, 'asistente_pc.js'), 'vuelta', '--seco'], { env, encoding: 'utf8' });
    return `${r.stdout}${r.stderr}`;
}

console.log('La cola: quién coge qué');
ponerCola([
    { id: 'pres-1', tipo: 'presentar', numero: '26RES060_1', estado: 'pendiente', creado_at: ahora },
    { id: 'calext-2026EXT_9-1', tipo: 'calificar_ext', numero: '2026EXT_9', destino: 'SERVIDOR', estado: 'pendiente', creado_at: ahora },
]);
let s = vuelta('SERVIDOR');
prueba('el SERVIDOR coge la calificación fija', /Lanzaría calext-2026EXT_9-1/.test(s), s);
prueba('y no la presentación (sin destino = cualquiera, pero no él)', !/pres-1/.test(s), s);
s = vuelta('OFICINA', false);
prueba('un PC no coge lo que va al SERVIDOR', /Lanzaría pres-1/.test(s) && !/calext/.test(s), s);
ponerCola([{ id: 'pres-1', tipo: 'presentar', numero: '26RES060_1', estado: 'pendiente', creado_at: ahora }]);
s = vuelta('SERVIDOR');
prueba('con solo una presentación en cola, el SERVIDOR no lanza nada', !/Lanzaría/.test(s), s);
ponerCola([{ id: 'ce3x-cee_final-26RES060_1-1', tipo: 'ce3x', trabajo: 'cee_final', numero: '26RES060_1', estado: 'pendiente', creado_at: ahora }]);
s = vuelta('SERVIDOR');
prueba('ni un trabajo ce3x con Claude (el CEE final)', !/Lanzaría/.test(s), s);
prueba('el SERVIDOR no deja latido', !fs.readdirSync(COLA).some(f => /^pc_latido/.test(f)), fs.readdirSync(COLA).join(', '));

console.log('\nEncolar: el destino');
{
    const env = { ...process.env, ASISTENTE_COLA_DIR: COLA, PC_TRABAJOS_DIR: TRABAJOS, CE3X_URL: 'http://127.0.0.1:9', PC_CE3X: 'OFICINA' };
    const r = spawnSync(process.execPath, ['-e', `const pc=require(${JSON.stringify(path.join(__dirname, 'asistente_pc.js'))});
        pc.encolarCalificarExt({ numero: '2026EXT_7' }); pc.encolarCalificarOp({ numero: '26RES060_OP7' });`], { env, encoding: 'utf8' });
    const cola = JSON.parse(fs.readFileSync(path.join(COLA, 'tareas_pc.json'), 'utf8'));
    const ext = cola.find(t => t.numero === '2026EXT_7');
    const op = cola.find(t => t.numero === '26RES060_OP7');
    prueba('con CE3X_URL, calificar_ext va al SERVIDOR (aunque haya PC_CE3X)', ext?.destino === 'SERVIDOR', r.stderr || JSON.stringify(ext));
    prueba('y calificar_op también', op?.destino === 'SERVIDOR', JSON.stringify(op));
    const env2 = { ...env }; delete env2.CE3X_URL;
    spawnSync(process.execPath, ['-e', `require(${JSON.stringify(path.join(__dirname, 'asistente_pc.js'))}).encolarCalificarExt({ numero: '2026EXT_8' });`], { env: env2, encoding: 'utf8' });
    const sin = JSON.parse(fs.readFileSync(path.join(COLA, 'tareas_pc.json'), 'utf8')).find(t => t.numero === '2026EXT_8');
    prueba('sin CE3X_URL, al PC de siempre (PC_CE3X)', sin?.destino === 'OFICINA', JSON.stringify(sin));
}

console.log('\ncexAPdf con CE3X_URL (un ce3x-engine de mentira)');
(async () => {
    let recibido = null;
    let responder = () => ({ s: { ok: true, emisiones: 40.03 }, ficheros: { 'cee.xml': Buffer.from('<xml/>').toString('base64'), '../fuera.txt': 'eA==' } });
    const srv = http.createServer((req, res) => {
        let b = '';
        req.on('data', c => { b += c; });
        req.on('end', () => {
            recibido = JSON.parse(b);
            const r = responder();
            res.writeHead(r.status || 200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(r));
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.CE3X_URL = `http://127.0.0.1:${srv.address().port}/`;
    const cexAPdf = require('../services/cee/cexAPdf');
    const dir = fs.mkdtempSync(path.join(tmp, 'trabajo-'));
    fs.writeFileSync(path.join(dir, 'cee.cex'), 'CEX');
    // correrOraculo no se exporta: se llega por el require interno con el mismo CE3X_URL.
    const mod = require.cache[require.resolve('../services/cee/cexAPdf')];
    const correr = mod && mod.exports._correrOraculo;
    prueba('cexAPdf exporta _correrOraculo para la prueba', typeof correr === 'function');
    if (typeof correr === 'function') {
        const r = await correr(dir, 'cex_a_xml.py', { CASO: path.join(dir, 'cee.cex'), XML: path.join(dir, 'cee.xml'), AJUSTAR_AUTOCONSUMO: '1', NADA: null });
        prueba('devuelve el resultado.json del servicio', r.s?.emisiones === 40.03, JSON.stringify(r));
        prueba('manda el script y las rutas de la carpeta como {DIR}', recibido?.script === 'cex_a_xml.py'
            && recibido.env.CASO === '{DIR}\\cee.cex' && recibido.env.XML === '{DIR}\\cee.xml' && recibido.env.AJUSTAR_AUTOCONSUMO === '1' && !('NADA' in recibido.env), JSON.stringify(recibido?.env));
        prueba('con los ficheros de la carpeta', Buffer.from(recibido?.ficheros?.['cee.cex'] || '', 'base64').toString() === 'CEX');
        prueba('deja en la carpeta lo que devuelve', fs.readFileSync(path.join(dir, 'cee.xml'), 'utf8') === '<xml/>');
        prueba('y nada fuera de ella (nombre raro)', !fs.existsSync(path.join(tmp, 'fuera.txt')));
        responder = () => ({ s: { error: 'NO_ABRE' } });
        const r2 = await correr(dir, 'cex_a_xml.py', {});
        prueba('NO_ABRE → fallo con su texto', /no abre el fichero \(servidor\)/.test(r2.fallo || ''), JSON.stringify(r2));
        responder = () => ({ status: 503, ocupado: true });
        const r3 = await correr(dir, 'cex_a_xml.py', {});
        prueba('ocupado (503) → noResponde, no un .cex malo', r3.noResponde && /ocupado/.test(r3.fallo), JSON.stringify(r3));
        srv.close();
        const r4 = await correr(dir, 'cex_a_xml.py', {});
        prueba('caído → noResponde', r4.noResponde === true, JSON.stringify(r4));
    } else srv.close();
    const d = cexAPdf.disponible();
    prueba('disponible() con CE3X_URL dice «servidor» o el motivo del PDF', d.via === 'servidor' || (d.ok === false && !!d.motivo), JSON.stringify(d));

    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(`\n${ok} bien, ${ko} mal`);
    process.exitCode = ko ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
