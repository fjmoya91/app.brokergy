#!/usr/bin/env node
// test_agente_ia.js — lo que decide el AGENTE IA, sin BD y sin enviar nada.
//
//   node implementation/backend/scripts/test_agente_ia.js
//
// Vigila las reglas de services/agenteIa.js (ver «El AGENTE IA, un certificador
// más» en CLAUDE.md): a quién se le queda el expediente, que la fase nunca va
// hacia atrás, qué dice el aviso, y que el agente NUNCA sale como técnico en el
// .cex (tecnicoCe3x, en el frontend).
const assert = require('assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const a = require('../services/agenteIa');

let n = 0;
const ok = (nombre, fn) => { fn(); n += 1; console.log(`  ✓ ${nombre}`); };

(async () => {
    console.log('\nAGENTE IA · decisiones');

    ok('sin técnico → se le pone al agente', () => {
        assert.deepEqual(a.decidirCertificador(null, 'AG'), { asignar: true, delAgente: true, humano: null });
    });
    ok('ya es el agente → se queda, sin reasignar', () => {
        assert.deepEqual(a.decidirCertificador('AG', 'AG'), { asignar: false, delAgente: true, humano: null });
    });
    ok('un técnico de verdad → NO se le quita (el agente le prepara el borrador)', () => {
        const d = a.decidirCertificador('RAQUEL', 'AG');
        assert.equal(d.asignar, false); assert.equal(d.delAgente, false); assert.equal(d.humano, 'RAQUEL');
    });
    ok('…salvo que se pida reasignar', () => {
        const d = a.decidirCertificador('RAQUEL', 'AG', { reasignar: true });
        assert.equal(d.asignar, true); assert.equal(d.delAgente, true); assert.equal(d.anterior, 'RAQUEL');
    });
    ok('sin ficha del agente no se asigna nada', () => {
        assert.equal(a.decidirCertificador(null, null).asignar, false);
    });

    console.log('\nAGENTE IA · la fase nunca va hacia atrás');
    ok('empieza: sin encargar / encargado → EN_TRABAJO', () => {
        assert.equal(a.siguienteSubestado(null, 'empieza'), 'EN_TRABAJO');
        assert.equal(a.siguienteSubestado('PTE_ENVIO_CERT', 'empieza'), 'EN_TRABAJO');
        assert.equal(a.siguienteSubestado('ASIGNADO', 'empieza'), 'EN_TRABAJO');
    });
    ok('empieza sobre algo ya entregado o revisado → no se toca', () => {
        assert.equal(a.siguienteSubestado('EN_TRABAJO', 'empieza'), null);
        assert.equal(a.siguienteSubestado('PTE_REVISION', 'empieza'), null);
        assert.equal(a.siguienteSubestado('REVISADO', 'empieza'), null);
    });
    ok('termina → PTE_REVISION, pero no rebaja un REVISADO', () => {
        assert.equal(a.siguienteSubestado('EN_TRABAJO', 'termina'), 'PTE_REVISION');
        assert.equal(a.siguienteSubestado('ASIGNADO', 'termina'), 'PTE_REVISION');
        assert.equal(a.siguienteSubestado('PTE_REVISION', 'termina'), null);
        assert.equal(a.siguienteSubestado('REVISADO', 'termina'), null);
    });
    ok('registrado es terminal (por subestado o por fecha de registro)', () => {
        assert.equal(a.siguienteSubestado('REGISTRADO', 'termina'), null);
        assert.equal(a.siguienteSubestado('EN_TRABAJO', 'termina', { registrada: true }), null);
    });
    ok('estado global de cada paso', () => {
        assert.equal(a.estadoGlobalDe('empieza', 'inicial'), 'EN CERTIFICADOR CEE INICIAL');
        assert.equal(a.estadoGlobalDe('termina', 'final'), 'PENDIENTE REVISIÓN (FINAL)');
        assert.equal(a.normFase('FINAL'), 'final');
        assert.equal(a.normFase(undefined), 'inicial');
    });
    ok('los estados existen en el ciclo de vida del CAE (si no, avanzarEstado los ignora)', () => {
        const { rankEstado } = require('../utils/expedienteEstados');
        for (const paso of ['empieza', 'termina']) {
            for (const f of ['inicial', 'final']) {
                assert.ok(rankEstado(a.estadoGlobalDe(paso, f)) >= 0, a.estadoGlobalDe(paso, f));
            }
        }
    });

    console.log('\nAGENTE IA · el aviso');
    const m = a.componerAviso({
        numero: '26RES060_186', cliente: 'ISAAC PLIEGO', faseLabel: 'CEE INICIAL',
        fichero: '26RES060_186 - CEE INICIAL_REVISAR.cex',
        enlaces: { app: 'https://app/?exp=1', carpeta: 'https://drive/c', fichero: 'https://drive/f', envolvente: 'https://app/envolvente/1' },
        pendientes: a.pendientesPorDefecto('inicial'),
        avisos: ['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'],
    });
    ok('dice qué expediente, qué fase y qué fichero', () => {
        assert.match(m.whatsapp, /CEE INICIAL LISTO · AGENTE IA/);
        assert.match(m.whatsapp, /26RES060_186/);
        assert.match(m.whatsapp, /CEE INICIAL_REVISAR\.cex/);
        assert.match(m.whatsapp, /PENDIENTE DE REVISIÓN/);
        assert.match(m.asunto, /Agente IA.*26RES060_186/);
    });
    ok('lleva los enlaces y lo que queda por hacer (incluido asignar el técnico)', () => {
        assert.match(m.whatsapp, /https:\/\/drive\/c/);
        assert.match(m.whatsapp, /envolvente/);
        assert.match(m.whatsapp, /asigna el técnico que lo firma/);
        assert.match(m.html, /Abrir el \.cex/);
    });
    ok('resume los avisos (4 y «… N más»), no los vuelca enteros', () => {
        assert.match(m.whatsapp, /⚠ cuatro/);
        assert.doesNotMatch(m.whatsapp, /⚠ cinco/);
        assert.match(m.whatsapp, /y 2 avisos más/);
    });
    ok('con un técnico asignado dice que NO cambia de fase', () => {
        const h = a.componerAviso({ numero: 'X', faseLabel: 'CEE FINAL', delAgente: false, tecnicoHumano: 'RAQUEL MONCAYO',
                                    pendientes: a.pendientesPorDefecto('final', { delAgente: false }) });
        assert.match(h.whatsapp, /sigue siendo \*RAQUEL MONCAYO\*/);
        assert.doesNotMatch(h.whatsapp, /PENDIENTE DE REVISIÓN/);
        assert.doesNotMatch(h.whatsapp, /asigna el técnico/);
    });
    ok('una versión nueva se marca como actualizada', () => {
        const r = a.componerAviso({ numero: 'X', faseLabel: 'CEE INICIAL', reenvio: true, pendientes: [] });
        assert.match(r.whatsapp, /\(actualizado\)/);
        assert.match(r.asunto, /actualizado/);
    });
    ok('el HTML escapa lo que viene de fuera', () => {
        const r = a.componerAviso({ numero: '<b>', cliente: 'A & B', faseLabel: 'CEE', pendientes: ['<script>'] });
        assert.doesNotMatch(r.html, /<script>/);
        assert.match(r.html, /A &amp; B/);
    });

    console.log('\nAGENTE IA · la carpeta LOCAL del CEE');
    const cl = require('../utils/carpetaLocalEnlace');
    ok('el enlace firma id + carpeta, y abre ESA carpeta', () => {
        const url = cl.enlaceCarpetaLocal({ id: 'EXP1', carpeta: 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWx', origen: 'cae' });
        const u = new URL(url);
        assert.match(u.pathname, /\/api\/expedientes\/EXP1\/open-local-folder$/);
        assert.equal(u.searchParams.get('folder'), '1AbCdEfGhIjKlMnOpQrStUvWx');
        assert.equal(u.searchParams.get('origen'), null);
        assert.ok(cl.firmaCarpetaValida('EXP1', u.searchParams.get('token'), '1AbCdEfGhIjKlMnOpQrStUvWx'));
    });
    ok('no se le puede cambiar la carpeta ni el expediente al enlace', () => {
        const t = cl.firmaCarpeta('EXP1', 'CARPETA_BUENA_1234567890');
        assert.equal(cl.firmaCarpetaValida('EXP1', t, 'OTRA_CARPETA_1234567890'), false);
        assert.equal(cl.firmaCarpetaValida('EXP2', t, 'CARPETA_BUENA_1234567890'), false);
        assert.equal(cl.firmaCarpetaValida('EXP1', t, null), false);
    });
    ok('los enlaces a la RAÍZ ya enviados siguen valiendo', () => {
        assert.ok(cl.firmaCarpetaValida('EXP1', cl.firmaCarpeta('EXP1'), null));
    });
    ok('origen solo elige de una lista cerrada a dónde se vuelve', () => {
        assert.match(cl.enlaceVolver('X', 'cee'), /\?cee=X$/);
        assert.match(cl.enlaceVolver('X', 'op'), /\?op=X$/);
        assert.match(cl.enlaceVolver('X', 'javascript:alert(1)'), /\?exp=X$/);
        assert.equal(cl.enlaceCarpetaLocal({ id: 'X', carpeta: 'no es una carpeta' }), null);
    });
    ok('el aviso lleva la carpeta local como acción principal', () => {
        const r = a.componerAviso({ numero: '26RES080_89', faseLabel: 'CEE INICIAL', pendientes: [],
            enlaces: { app: 'https://app/?exp=1', carpeta: 'https://drive/c', local: 'https://app/api/expedientes/1/open-local-folder?token=t' } });
        assert.match(r.whatsapp, /Carpeta local \(PC\): https:\/\/app\/api\/expedientes\/1\/open-local-folder/);
        assert.match(r.html, /Abrir la carpeta local del CEE INICIAL/);
        assert.ok(r.html.indexOf('carpeta local') < r.html.indexOf('Abrir en la app'));
    });

    console.log('\nAGENTE IA · el .cex no lo lleva como técnico');
    const ficha = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src',
        'features', 'cee-envolvente', 'logic', 'fichaCe3x.js')).href);
    ok('tecnicoCe3x(agente) → null', () => {
        assert.equal(ficha.tecnicoCe3x({ razon_social: 'AGENTE IA', es_agente_ia: true }), null);
    });
    ok('tecnicoCe3x(técnico de verdad) → sus datos', () => {
        const t = ficha.tecnicoCe3x({ razon_social: 'RAQUEL MONCAYO TERRIZA', cif: '71355161F', es_autonomo: true });
        assert.equal(t.nombre, 'RAQUEL MONCAYO TERRIZA');
    });

    const front = await import(pathToFileURL(path.join(__dirname, '..', '..', 'frontend', 'src',
        'utils', 'agenteIa.js')).href);
    ok('frontend: esAgenteIa por la MARCA, no por el nombre', () => {
        assert.equal(front.esAgenteIa({ razon_social: 'AGENTE IA' }), false);
        assert.equal(front.esAgenteIa({ razon_social: 'otro nombre', es_agente_ia: true }), true);
        assert.equal(front.fraseParaClaude('26RES060_186'), 'Genera el CEE inicial de 26RES060_186');
    });

    console.log(`\n${n} comprobaciones OK`);
    process.exit(0);
})().catch((e) => { console.error(`\n✗ ${e.message}`); process.exit(1); });
