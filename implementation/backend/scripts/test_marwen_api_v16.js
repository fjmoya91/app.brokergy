// Pruebas de la API beCAE v1.6.0 (marwenService + inexactitudes por API).
//
//   node scripts/test_marwen_api_v16.js            → solo pruebas locales (no llama a Marwen)
//   node scripts/test_marwen_api_v16.js --vivo LOTE-2026-016
//        → además LEE de Marwen el estado y los documentos de ese lote (solo GET;
//          no gasta consultas de inexactitudes, que tienen límite).
//
// La subida (multipart) se prueba contra un servidor LOCAL que hace de beCAE: nada
// sale de la máquina. Ver docs/conocimiento/lotes/la-api-de-marwen-v1-6.md.
const path = require('path');
const http = require('http');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

let fallos = 0;
const ok = (msg, cond) => { console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`); if (!cond) fallos++; };

async function locales() {
    // El servidor falso se levanta ANTES de cargar el servicio (lee la URL al cargar).
    const recibido = {};
    const srv = http.createServer((req, res) => {
        const trozos = [];
        req.on('data', c => trozos.push(c));
        req.on('end', () => {
            recibido.url = req.url; recibido.method = req.method;
            recibido.ct = req.headers['content-type'] || '';
            recibido.key = req.headers['x-api-key'];
            recibido.body = Buffer.concat(trozos).toString('latin1');
            res.setHeader('Content-Type', 'application/json');
            if (req.url.endsWith('/estado')) {
                return res.end(JSON.stringify({ success: true, data: { numero_solicitud: 'T0001-S01', num_pedido: 'LOTE-X', estado_solicitud: 'Ofertado' } }));
            }
            if (req.url.includes('/inexactitudes')) {
                res.statusCode = 429; res.setHeader('Retry-After', '37');
                return res.end(JSON.stringify({ success: false, message: 'Too Many Requests' }));
            }
            res.end(JSON.stringify({ success: true, message: 'Documentos subidos', estado_solicitud: 'Pendiente recibir oferta', num_solicitud: 'T0001-S01', documentos_descartados: [] }));
        });
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    process.env.MARWEN_API_URL = `http://127.0.0.1:${srv.address().port}`;
    process.env.MARWEN_API_KEY = 'clave-de-prueba';
    delete require.cache[require.resolve('../services/marwenService')];
    const m = require('../services/marwenService');

    console.log('\n── Formato de la respuesta al crear (1.6.0 y anterior) ──');
    const nuevo = m.normalizarCreacion({ success: true, message: 'Solicitud creada correctamente.', data: { num_solicitud: 'T0008-S02', tipo_solicitud: 'estandarizada' } });
    ok('1.6.0: el nº sale de data.num_solicitud', nuevo.num_solicitud === 'T0008-S02' && nuevo.tipo_solicitud === 'estandarizada');
    const viejo = m.normalizarCreacion({ message: 'success', num_solicitud: 'T0015-S01', tipo_solicitud: 'estandarizada' });
    ok('anterior: el nº de la raíz sigue valiendo', viejo.num_solicitud === 'T0015-S01');

    console.log('\n── Inexactitudes de la API → forma del informe ──');
    const items = m.aItemsDeInforme([
        { numero: '3', clasificacion: 'imp', descripcion: 'No se aporta la etiqueta del equipo.', estado: 'abierto', actuaciones: [1, 2], acciones_correctivas: 'Aportar la etiqueta.' },
        { numero: '3-R2', clasificacion: 'nim', descripcion: 'Falta la fecha.', estado: 'cerrado', actuaciones: [4] },
        { numero: '5', clasificacion: 'imp', descripcion: '', estado: 'abierto', actuaciones: [] },
    ]);
    ok('se descarta la que no trae descripción', items.length === 2);
    ok('nº simple → número; con -R → texto', items[0].n === 3 && items[1].n === '3-R2');
    ok('actuaciones [1,2] → "1,2"', items[0].actuaciones === '1,2');
    ok('imp → Importante (GRAVE), nim → No importante (LEVE)', items[0].clasificacion === 'Importante' && items[1].clasificacion === 'No importante');
    ok('cerrado → Cerrada', items[1].estado === 'Cerrada');
    ok('la acción correctiva va en el hecho', /Acción correctiva: Aportar la etiqueta/.test(items[0].hecho));

    console.log('\n── Las incidencias con nº «3-R2» no se duplican ──');
    const { planIncidencias } = require('../services/inexactitudesLote');
    const lote = { id: 'L1', codigo: 'LOTE-X' };
    const abierta = [{ ...items[1], estado: 'Abierta' }];
    const p1 = planIncidencias({ incidencias: [], inexs: abierta, lote, docKey: 'informe_inexactitudes_1', ronda: 1, desde: null, label: 'informe 1' });
    const p2 = planIncidencias({ incidencias: p1.incidencias, inexs: abierta, lote, docKey: 'informe_inexactitudes_1', ronda: 1, desde: null, label: 'informe 1' });
    ok('la primera vez se crea', p1.nuevas === 1);
    ok('la segunda vez no se duplica', p2.nuevas === 0 && p2.incidencias.length === 1);
    const p3 = planIncidencias({ incidencias: p1.incidencias, inexs: [items[1]], lote, docKey: 'informe_inexactitudes_1', ronda: 1, desde: null, label: 'beCAE' });
    ok('cerrada en beCAE → se subsana sola', p3.cerradas === 1 && p3.incidencias[0].estado === 'SUBSANADA');
    const pNum = planIncidencias({ incidencias: [{ inexactitud: { lote_id: 'L1', n: 3, ronda: 1 }, estado: 'ABIERTA', comentarios: [] }],
        inexs: [items[0]], lote, docKey: 'informe_inexactitudes_1', ronda: 1, desde: null, label: 'beCAE' });
    ok('la nº 3 leída del PDF (número) casa con la "3" de la API', pNum.nuevas === 0 && pNum.iguales === 1);

    console.log('\n── Estado y subida (contra el beCAE falso) ──');
    const e = await m.estadoSolicitud('T0001-S01');
    ok('estado: se desenvuelve `data`', e.estado_solicitud === 'Ofertado');
    ok('estado: va con X-API-KEY', recibido.key === 'clave-de-prueba');
    const r = await m.subirDocumentos('T0001-S01', 'documento_adjunto', [
        { nombre: 'LOTE-X - E1 - 26RES060_1.zip', buffer: Buffer.from('PK\u0003\u0004zip'), contentType: 'application/zip' },
        { nombre: 'LOTE-X - E2 - 26RES060_2.zip', buffer: Buffer.from('PK\u0003\u0004zip2'), contentType: 'application/zip' },
    ]);
    ok('subida: POST a /api/solicitud/{n}/documentos', recibido.method === 'POST' && recibido.url === '/api/solicitud/T0001-S01/documentos');
    ok('subida: multipart/form-data', /^multipart\/form-data; boundary=/.test(recibido.ct));
    ok('subida: campo `tipo` = documento_adjunto', /name="tipo"\r\n\r\ndocumento_adjunto/.test(recibido.body));
    ok('subida: los dos ficheros en `archivo[]`', (recibido.body.match(/name="archivo\[\]"; filename="LOTE-X - E\d - 26RES060_\d\.zip"/g) || []).length === 2);
    ok('subida: devuelve el estado de la solicitud', r.estado_solicitud === 'Pendiente recibir oferta' && r.success);
    let tipoMalo = null;
    try { await m.subirDocumentos('T0001-S01', 'oferta', [{ nombre: 'x.pdf', buffer: Buffer.from('x') }]); } catch (err) { tipoMalo = err; }
    ok('subida: un tipo que no se sube (oferta) se rechaza sin llamar', !!tipoMalo);

    console.log('\n── Límite de consultas de inexactitudes (429) ──');
    let e429 = null;
    try { await m.inexactitudes('CAE-1'); } catch (err) { e429 = err; }
    ok('429 → MARWEN_LIMITE con Retry-After', e429 && e429.code === 'MARWEN_LIMITE' && e429.retryAfter === 37);
    recibido.url = null;
    let e429b = null;
    try { await m.inexactitudes('CAE-1'); } catch (err) { e429b = err; }
    ok('durante la espera NO se vuelve a llamar a Marwen', e429b && e429b.code === 'MARWEN_LIMITE' && recibido.url === null);

    srv.close();
}

async function vivo(codigo) {
    console.log(`\n── EN VIVO (solo lectura) · ${codigo} ──`);
    // Se recarga con la URL y la clave reales del .env.
    require('dotenv').config({ path: path.join(__dirname, '..', '.env'), override: true, quiet: true });
    delete require.cache[require.resolve('../services/marwenService')];
    const m = require('../services/marwenService');
    const p = await m.estadosPorPedido(codigo);
    console.log('   solicitudes:', JSON.stringify(p.solicitudes));
    console.log('   expedientes:', JSON.stringify(p.expedientes));
    ok('beCAE encuentra el lote por su pedido', p.solicitudes.length > 0);
    if (p.solicitudes[0]) {
        const docs = await m.documentos(p.solicitudes[0].numero_solicitud);
        console.log('   documentos:', docs.map(d => `${d.type}: ${d.name}`).join(' · '));
        ok('lista los documentos de la solicitud', Array.isArray(docs));
    }
}

(async () => {
    const i = process.argv.indexOf('--vivo');
    const codigo = i > 0 ? process.argv[i + 1] : null;
    const real = { url: process.env.MARWEN_API_URL, key: process.env.MARWEN_API_KEY };
    await locales();
    if (codigo) { process.env.MARWEN_API_URL = real.url; process.env.MARWEN_API_KEY = real.key; await vivo(codigo); }
    console.log(fallos ? `\n✗ ${fallos} fallo(s)` : '\n✓ todo bien');
    process.exit(fallos ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
