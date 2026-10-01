// La PÁGINA DEL ENCARGO del certificador: lo puro (`services/encargoTecnico.js`)
// y la línea que la anuncia en los mensajes (`logic/certMessages.js`).
//
//   node implementation/backend/scripts/test_encargo_tecnico.mjs
//
// Sin BD, sin Drive y sin enviar nada. La carga contra un expediente real se
// prueba aparte (ver CLAUDE.md, "La página del encargo").

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'clave-de-prueba';
const enc = require('../services/encargoTecnico.js');
const { buildCertEncargoMessage, buildCertMessage, TEXTO_ENLACE_ENCARGO } =
    await import('../../frontend/src/features/expedientes/logic/certMessages.js');

let fallos = 0;
async function prueba(nombre, fn) {
    try { await fn(); console.log(`  ✓ ${nombre}`); }
    catch (e) { fallos++; console.log(`  ✗ ${nombre}\n    ${e.message}`); }
}
console.log('encargoTecnico');

const ID = '98f6dc92-dfc1-4554-8469-2179bffa4891';

await prueba('el enlace es del TÉCNICO: con otro técnico, otra firma, y la de uno no vale para el otro', () => {
    const a = enc.firmaEncargo({ negocio: 'cae', id: ID, fase: 'inicial', certId: 'LANUZA' });
    const b = enc.firmaEncargo({ negocio: 'cae', id: ID, fase: 'inicial', certId: 'MONCAYO' });
    assert.notEqual(a, b);
    assert.equal(enc.firmaValida({ negocio: 'cae', id: ID, fase: 'inicial', certId: 'LANUZA' }, a), true);
    assert.equal(enc.firmaValida({ negocio: 'cae', id: ID, fase: 'inicial', certId: 'MONCAYO' }, a), false);
    // Ni la de otra fase, ni la del otro negocio, ni sin técnico.
    assert.equal(enc.firmaValida({ negocio: 'cae', id: ID, fase: 'final', certId: 'LANUZA' }, a), false);
    assert.equal(enc.firmaValida({ negocio: 'cee', id: ID, fase: 'inicial', certId: 'LANUZA' }, a), false);
    assert.equal(enc.firmaValida({ negocio: 'cae', id: ID, fase: 'inicial', certId: null }, a), false);
    assert.equal(enc.firmaValida({ negocio: 'cae', id: ID, fase: 'inicial', certId: 'LANUZA' }, 'x'), false);
});

await prueba('el enlace lleva la fase y, en un CEE directo, su origen; sin técnico no hay enlace', () => {
    const u = new URL(enc.enlaceEncargo({ negocio: 'cee', id: ID, fase: 'final', certId: 'X', base: 'https://app.brokergy.es' }));
    assert.equal(u.pathname, `/encargo/${ID}`);
    assert.equal(u.searchParams.get('phase'), 'final');
    assert.equal(u.searchParams.get('origen'), 'cee');
    assert.match(u.searchParams.get('token'), /^[0-9a-f]{40}$/);
    assert.equal(new URL(enc.enlaceEncargo({ negocio: 'cae', id: ID, fase: 'INITIAL', certId: 'X' })).searchParams.get('phase'), 'inicial');
    assert.equal(enc.enlaceEncargo({ negocio: 'cae', id: ID, fase: 'inicial', certId: null }), null);
});

await prueba('en el WhatsApp, la página va EN LUGAR del enlace a la app (y no se repite)', () => {
    const url = 'https://app.brokergy.es/encargo/abc?token=t&phase=inicial';
    const conApp = '¡Hola Luis!\n\nTe hemos asignado…\n\n🔗 Abre el expediente directamente en la app:\nhttps://app.brokergy.es/?exp=abc\n\n📁 Carpeta:\nhttps://drive/x';
    const r = enc.conEnlaceEncargo(conApp, url);
    assert.ok(!r.includes('?exp=abc'));
    assert.ok(r.includes(`${enc.TEXTO_ENLACE}\n${url}`));
    assert.ok(r.includes('📁 Carpeta'));
    assert.equal(enc.conEnlaceEncargo(r, url), r);                        // ya lo lleva
    const sinApp = 'Hola\n\n*BROKERGY · Ingeniería Energética*';
    assert.equal(enc.conEnlaceEncargo(sinApp, url), `Hola\n\n${enc.TEXTO_ENLACE}\n${url}\n\n*BROKERGY · Ingeniería Energética*`);
    assert.equal(enc.conEnlaceEncargo('Hola', null), 'Hola');
});

await prueba('la plantilla del popup dice lo MISMO que el servidor (mismo texto)', () => {
    assert.equal(TEXTO_ENLACE_ENCARGO, enc.TEXTO_ENLACE);
    const url = 'https://app.brokergy.es/encargo/abc?token=t&phase=inicial';
    const m = buildCertEncargoMessage('inicial', 'LUIS', 'CLIENTE', '26RES060_1', 'https://drive/x', 'abc', '', { encargoLink: url });
    assert.ok(m.includes(url) && !m.includes('?exp=abc'));
    // Sin enlace, lo de siempre.
    assert.ok(buildCertEncargoMessage('inicial', 'LUIS', 'CLIENTE', '26RES060_1', null, 'abc', '').includes('?exp=abc'));
    const rec = buildCertMessage({ espera: 'emision', tono: 'reminder', fase: 'inicial', certName: 'LUIS',
                                   numExp: '26RES060_1', expedienteId: 'abc', ctx: { encargoLink: url } });
    assert.ok(rec.includes(url));
});

await prueba('qué le toca AHORA sale del subestado de su fase', () => {
    assert.equal(enc.pasoDe('ASIGNADO', { ackPendiente: true }).clave, 'aceptar');
    assert.equal(enc.pasoDe('EN_TRABAJO').clave, 'visita');
    assert.equal(enc.pasoDe('PTE_REVISION', { ackPendiente: true }).clave, 'revision');  // ya entregó: el acuse sobra
    assert.equal(enc.pasoDe('REVISADO').clave, 'presentar');
    assert.equal(enc.pasoDe('registrado').clave, 'registrado');
    // Un migrado con el subestado parado en ASIGNADO pero el justificante subido: registrado.
    assert.equal(enc.pasoDe('ASIGNADO', { ackPendiente: true, registrado: true }).clave, 'registrado');
});

await prueba('el domicilio del cliente solo sale si no es la misma dirección que la vivienda', () => {
    assert.equal(enc.domicilioAparte('CL SOL 20, 13700, TOMELLOSO (CIUDAD REAL)', 'CL SOL 20, 13700, TOMELLOSO'), null);
    assert.equal(enc.domicilioAparte('Cl. Sol, 20', 'CL SOL 20'), null);
    assert.equal(enc.domicilioAparte('CL MAYOR 3, MADRID', 'CL SOL 20, TOMELLOSO'), 'CL MAYOR 3, MADRID');
    assert.equal(enc.domicilioAparte('', 'CL SOL 20'), null);
});

await prueba('el equipo de ACS solo sale aparte si es OTRA máquina (no por el flag)', () => {
    const cal = { marca: 'DAIKIN', modelo: 'ERLA11DAV3', aerotermia_db_id: 94 };
    assert.equal(enc.acsEsOtroEquipo({ misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: { ...cal } }), false);
    assert.equal(enc.acsEsOtroEquipo({ misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: { marca: 'ARISTON', modelo: 'NUOS', aerotermia_db_id: 7 } }), true);
    assert.equal(enc.acsEsOtroEquipo({ misma_aerotermia_acs: true, aerotermia_cal: cal, aerotermia_acs: { marca: 'X', modelo: 'Y' } }), false);
    assert.equal(enc.acsEsOtroEquipo({ misma_aerotermia_acs: false, aerotermia_cal: cal, aerotermia_acs: {} }), false);
});

await prueba('el OBJETIVO del certificado es el MISMO que el del email (demanda y superficie; ahorro en RES080)', () => {
    const { objetivosEncargo } = require('../utils/objetivoEncargo.js');
    const op = { ficha: 'RES060', datos_calculo: { result: { q_net: 142.37, Q_net: 17084.4 }, inputs: { superficieCalefactable: '120' } } };
    const email = objetivosEncargo(op);
    const pagina = enc.objetivoParaTecnico(op);
    assert.equal(pagina.demanda, Math.round(email.demandaPerM2 * 10) / 10);
    assert.equal(pagina.superficie, email.superficieRef);
    assert.equal(pagina.reforma, false);
    assert.equal(pagina.ahorro, null);
    // Sin q_net, sale del total entre la superficie (igual que el email).
    assert.equal(enc.objetivoParaTecnico({ datos_calculo: { result: { Q_net: 12000 }, inputs: { surface: 100 } } }).demanda, 120);
    // RES080: manda el ahorro; la superficie mínima no se pide.
    const r = enc.objetivoParaTecnico({ ficha: 'RES080', datos_calculo: { result: { q_net: 90, res080: { ahorroEnergiaFinalTotal: 8123.6 } }, inputs: { surface: 110 } } });
    assert.deepEqual(r, { reforma: true, demanda: 90, superficie: null, ahorro: 8124 });
    // Sin simulación, no hay objetivo que enseñar.
    assert.equal(enc.objetivoParaTecnico(null), null);
    assert.equal(enc.objetivoParaTecnico({ ficha: 'RES060', datos_calculo: {} }), null);
    // Y ni un importe: solo esas cifras.
    assert.deepEqual(Object.keys(pagina).sort(), ['ahorro', 'demanda', 'reforma', 'superficie']);
});

await prueba('las coordenadas UTM (huso 30) llevan a su sitio; un dato raro, a la dirección', () => {
    const sol = enc.utmALatLon(440300, 4474200);                 // Puerta del Sol
    assert.ok(Math.abs(sol.lat - 40.4169) < 0.002 && Math.abs(sol.lon + 3.7035) < 0.002);
    assert.equal(enc.utmALatLon('', ''), null);
    assert.equal(enc.utmALatLon(12, 34), null);
    const c = enc.comoLlegar({ direccion: 'CL SOL 20, TOMELLOSO', coord_x: 489734, coord_y: 4383301, rc: '9835137VJ8893N0001EJ' });
    assert.ok(c.conCoordenadas && c.mapa.includes('39.599'));
    assert.ok(c.catastro.includes('rc1=9835137&rc2=VJ8893N'));
    const d = enc.comoLlegar({ direccion: 'CL SOL 20, TOMELLOSO' });
    assert.ok(!d.conCoordenadas && d.mapa.includes(encodeURIComponent('CL SOL 20')));
    assert.equal(d.catastro, null);
});

await prueba('de las fotos, las de SU fase; nunca facturas, presupuestos ni el cajón de «otros»', () => {
    const it = (id, mime = 'image/jpeg') => ({ driveId: `drive${id}xxxxxxxx`, name: `f${id}.jpg`, mimeType: mime });
    const slots = [
        { key: 'FOTO_FACHADA_PRINCIPAL', fase: 'ANTES', label: 'Fachada', required: true, items: [it(1)] },
        { key: 'FOTO_PATIOS_INTERIORES', fase: 'ANTES', label: 'Patios', required: false, items: [] },
        { key: 'FOTO_CALDERA_ANTES', fase: 'ANTES', label: 'Caldera', required: true, items: [] },
        { key: 'DOC_PRESUPUESTO', fase: 'ANTES', label: 'Presupuesto', items: [it(2, 'application/pdf')] },
        { key: 'DOC_FACTURAS', fase: 'DESPUES', label: 'Facturas', items: [it(3, 'application/pdf')] },
        { key: 'OTROS_EXISTENTES', fase: 'ANTES', label: 'Otros', items: [it(4)] },
        { key: 'OTROS_DESPUES', fase: 'DESPUES', label: 'Otros', items: [it(5)] },
        { key: 'FOTO_UNIDAD_EXTERIOR', fase: 'DESPUES', label: 'Ud. exterior', items: [it(6)] },
        { key: 'VIDEO_VIVIENDA', fase: 'ANTES', label: 'Vídeo', items: [it(7, 'video/mp4')] },
    ];
    const ini = enc.materialDeFase(slots, 'inicial');
    assert.deepEqual(ini.map(s => s.clave), ['FOTO_FACHADA_PRINCIPAL', 'FOTO_CALDERA_ANTES', 'VIDEO_VIVIENDA']);
    assert.equal(ini.find(s => s.clave === 'FOTO_CALDERA_ANTES').falta, true);
    assert.equal(ini.find(s => s.clave === 'VIDEO_VIVIENDA').ficheros[0].tipo, 'video');
    const fin = enc.materialDeFase(slots, 'final');
    assert.deepEqual(fin.map(s => s.clave), ['FOTO_UNIDAD_EXTERIOR']);
    // Con otro criterio de «falta» (el del CEE inicial), manda ese.
    const otro = enc.materialDeFase(slots, 'inicial', (s) => s.key === 'FOTO_PATIOS_INTERIORES');
    assert.deepEqual(otro.map(s => s.clave), ['FOTO_FACHADA_PRINCIPAL', 'FOTO_PATIOS_INTERIORES', 'VIDEO_VIVIENDA']);
});

console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien.');
process.exit(fallos ? 1 : 0);
