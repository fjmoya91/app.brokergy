/**
 * test_solo_asignar_cert — "Solo asignar" NO es un encargo enviado.
 *
 * El 25-26/09/2026 se asignaron 26RES060_199 y _200 a Raquel Moncayo con "Solo
 * asignar": ni email ni WhatsApp ni una línea de historial, y aun así la ruta los
 * marcó ASIGNADO + "EN CERTIFICADOR CEE INICIAL". El parte diario los contó como
 * "encargado, sin arrancar" y nadie se enteró de que el técnico no sabía nada.
 *
 * Se carga el router REAL de expedientes con Supabase, Drive, email, WhatsApp y
 * el sincronizador de carpetas sustituidos por dobles: nada habla con producción.
 *
 *   node implementation/backend/scripts/test_solo_asignar_cert.js
 */

const path = require('path');
const http = require('http');

process.env.INTERNAL_API_KEY = 'clave-test';

// ── Estado de los dobles ────────────────────────────────────────────────────
const CERT_EXTERNO = { id_empresa: 'C-RAQUEL', razon_social: 'RAQUEL MONCAYO TERRIZA', nombre_responsable: 'RAQUEL', email: 'raquel@test', tlf: '600000000', cif: '71355161F', es_autonomo: true };
const CERT_AGENTE = { id_empresa: 'C-AGENTE', razon_social: 'AGENTE IA', es_agente_ia: true, es_autonomo: false };
const CERT_CASA = { id_empresa: 'C-FRAN', razon_social: 'FRANCISCO JAVIER MOYA LÓPEZ', nombre_responsable: 'FRANCISCO JAVIER', email: 'fran@test', tlf: '611111111', cif: '06282551D', empresa_cif: 'B19350222', es_autonomo: true };

let exp;
const updates = [];
const emails = [];
const whatsapps = [];

function expNuevo(extra = {}) {
    return {
        id: 'EXP1', numero_expediente: '26RES060_999', estado: 'PTE. CEE INICIAL',
        cliente_id: 'CLI1', oportunidad_id: 'OP1',
        cee: {}, seguimiento: { cee_inicial: 'PTE_ENVIO_CERT', cee_final: 'PTE_ENVIO_CERT' },
        documentacion: { historial: [] }, instalacion: {},
        ...extra,
    };
}

function builder(tabla) {
    const q = { tabla, filtros: {}, patch: null };
    const b = {
        select() { return b; },
        eq(k, v) { q.filtros[k] = v; return b; },
        update(p) { q.patch = p; return b; },
        async single() { return resolver(); },
        async maybeSingle() { return resolver(); },
        then(ok, ko) { return Promise.resolve(resolver()).then(ok, ko); },
    };
    function resolver() {
        if (q.patch) {
            updates.push({ tabla, patch: q.patch });
            if (tabla === 'expedientes') exp = { ...exp, ...q.patch };
            return { data: null, error: null };
        }
        if (tabla === 'expedientes') return { data: exp, error: null };
        if (tabla === 'prescriptores') return { data: [CERT_EXTERNO, CERT_CASA, CERT_AGENTE].find(c => c.id_empresa === q.filtros.id_empresa) || null, error: null };
        if (tabla === 'clientes') return { data: { id_cliente: 'CLI1', nombre_razon_social: 'CLIENTE', apellidos: 'PRUEBA' }, error: null };
        if (tabla === 'oportunidades') return { data: { id: 'OP1', ficha: 'RES060', datos_calculo: { drive_folder_id: 'ROOT' } }, error: null };
        return { data: null, error: null };
    }
    return b;
}
const supabaseDoble = { from: (t) => builder(t), rpc: async () => ({ error: null }) };
const driveDoble = new Proxy({
    async getOrCreateSubfolder() { return 'CEEFOLDER'; },
    async getWebViewLink() { return 'https://drive/cee'; },
    async grantPermissionToEmail() { return true; },
}, { get: (t, k) => t[k] || (async () => null) });
const emailDoble = new Proxy({}, { get: (_, k) => async (params) => { emails.push({ fn: k, to: params?.to }); return true; } });
const waDoble = new Proxy({
    async sendText(tel, msg) { whatsapps.push({ tel, msg }); return { ok: true, state: 'READY' }; },
    getStatus() { return { state: 'READY' }; },
}, { get: (t, k) => t[k] || (() => null) });

const req = (rel) => require.resolve(path.join(__dirname, '..', rel));
const doble = (rel, exports) => { require.cache[req(rel)] = { id: rel, filename: rel, loaded: true, exports }; };
doble('services/supabaseClient.js', supabaseDoble);
doble('services/driveService.js', driveDoble);
doble('services/emailService.js', emailDoble);
doble('services/whatsappService.js', waDoble);
doble('services/expedienteFolderSync.js', { syncExpedienteFolderAsync() {}, syncExpedienteFolder: async () => {} });

const express = require('express');
const router = require('../routes/expedientes');

let fallos = 0;
function ok(cond, txt, detalle) {
    if (cond) { console.log(`  ✓ ${txt}`); return; }
    fallos++;
    console.log(`  ✗ ${txt}${detalle ? `\n      ${detalle}` : ''}`);
}

async function main() {
    const app = express();
    app.use(express.json());
    app.use('/api/expedientes', router);
    const server = http.createServer(app);
    await new Promise(r => server.listen(0, r));
    const port = server.address().port;
    // http.request sin agente y no fetch: el pool keep-alive de fetch deja sockets
    // vivos y process.exit revienta libuv en Windows (UV_HANDLE_CLOSING).
    const post = (body) => new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const rq = http.request({
            host: '127.0.0.1', port, method: 'POST', agent: false,
            path: '/api/expedientes/EXP1/notify-certificador',
            headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), 'x-internal-key': 'clave-test' },
        }, (rs) => {
            let d = '';
            rs.on('data', c => { d += c; });
            rs.on('end', () => { try { resolve({ status: rs.statusCode, data: JSON.parse(d) }); } catch (e) { reject(e); } });
        });
        rq.on('error', reject);
        rq.end(payload);
    });
    const reset = (extra) => { exp = expNuevo(extra); updates.length = 0; emails.length = 0; whatsapps.length = 0; };
    const ultimoHist = () => (exp.documentacion?.historial || []).slice(-1)[0] || null;

    try {
        console.log('\n1. "Solo asignar" a un técnico EXTERNO → encargo PENDIENTE');
        reset();
        let r = await post({ certificador_id: 'C-RAQUEL', sendEmail: false, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        ok(r.status === 200, 'responde 200', JSON.stringify(r.data));
        ok(emails.length === 0 && whatsapps.length === 0, 'no sale NADA por ningún canal');
        ok(exp.cee.certificador_id === 'C-RAQUEL', 'el técnico queda guardado');
        ok(exp.seguimiento.cee_inicial === 'PTE_ENVIO_CERT', 'la fase SIGUE en PTE_ENVIO_CERT (no ASIGNADO)', exp.seguimiento.cee_inicial);
        ok(exp.estado === 'PTE. CEE INICIAL', 'el estado NO avanza a EN CERTIFICADOR', exp.estado);
        ok(!exp.cee.ack_token, 'no se genera token de acuse (no hay enlace que mandar)');
        ok(r.data.encargoPendiente === true && r.data.asignadoSinAviso === true, 'la respuesta dice que el encargo queda pendiente');
        ok(/SIN AVISAR/.test(ultimoHist()?.texto || ''), 'queda rastro en el historial', ultimoHist()?.texto);

        console.log('\n2. "Asignar y notificar" → encargo ENVIADO (como siempre)');
        reset();
        r = await post({ certificador_id: 'C-RAQUEL', sendEmail: true, sendWhatsApp: true, phase: 'initial', template: 'standard' });
        ok(r.status === 200, 'responde 200');
        ok(emails.length === 1 && emails[0].to === 'raquel@test', 'sale el email al técnico');
        ok(whatsapps.length === 1, 'sale el WhatsApp al técnico');
        ok(exp.seguimiento.cee_inicial === 'ASIGNADO', 'la fase pasa a ASIGNADO', exp.seguimiento.cee_inicial);
        ok(exp.estado === 'EN CERTIFICADOR CEE INICIAL', 'el estado avanza a EN CERTIFICADOR CEE INICIAL', exp.estado);
        ok(!!exp.cee.ack_token, 'se genera el token de acuse');
        ok(!!exp.seguimiento.cee_inicial_last_contacto_at, 'se sella el último contacto');
        ok(ultimoHist()?.tipo === 'notificacion_certificador', 'historial de notificación como siempre');
        ok(r.data.encargoPendiente === false, 'la respuesta NO lo da por pendiente');

        console.log('\n3. "Solo asignar" al certificador de la CASA → cuenta como encargado');
        reset();
        r = await post({ certificador_id: 'C-FRAN', sendEmail: false, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        ok(emails.length === 0 && whatsapps.length === 0, 'no sale nada (no hay que escribirse a uno mismo)');
        ok(exp.seguimiento.cee_inicial === 'ASIGNADO', 'la fase pasa a ASIGNADO', exp.seguimiento.cee_inicial);
        ok(exp.estado === 'EN CERTIFICADOR CEE INICIAL', 'el estado avanza', exp.estado);
        ok(r.data.encargoPendiente === false, 'no queda pendiente');
        ok(/Brokergy/.test(ultimoHist()?.texto || ''), 'historial: asignado sin aviso por ser de la casa', ultimoHist()?.texto);

        console.log('\n4. "Solo asignar" sin seguimiento previo → no se escribe el relleno PTE_EMITIR');
        reset({ seguimiento: null });
        r = await post({ certificador_id: 'C-RAQUEL', sendEmail: false, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        const escribioSeg = updates.some(u => u.tabla === 'expedientes' && 'seguimiento' in u.patch);
        ok(!escribioSeg, 'no se toca `seguimiento` (el parte lo seguiría viendo como "sin encargar")');

        console.log('\n5. Un encargo YA ENVIADO no pierde su enlace de acuse por un "solo asignar" posterior');
        reset({ cee: { certificador_id: 'C-RAQUEL', ack_token: 'TOKEN-VIEJO' }, seguimiento: { cee_inicial: 'ASIGNADO' }, estado: 'EN CERTIFICADOR CEE INICIAL' });
        r = await post({ certificador_id: 'C-RAQUEL', sendEmail: false, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        ok(exp.cee.ack_token === 'TOKEN-VIEJO', 'el token del encargo enviado sigue vivo', exp.cee.ack_token);
        ok(exp.estado === 'EN CERTIFICADOR CEE INICIAL', 'el estado no retrocede', exp.estado);

        console.log('\n6. Encargar al AGENTE IA → cuenta como encargado (como el de la casa)');
        reset();
        r = await post({ certificador_id: 'C-AGENTE', sendEmail: false, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        ok(r.status === 200, 'responde 200', JSON.stringify(r.data));
        ok(emails.length === 0 && whatsapps.length === 0, 'no sale nada (no hay a quién escribirle)');
        ok(exp.cee.certificador_id === 'C-AGENTE', 'el agente queda en la barra de certificadores');
        ok(exp.seguimiento.cee_inicial === 'ASIGNADO', 'la fase pasa a ASIGNADO (encargado)', exp.seguimiento.cee_inicial);
        ok(exp.estado === 'EN CERTIFICADOR CEE INICIAL', 'el estado avanza', exp.estado);
        ok(r.data.encargoPendiente === false, 'no queda «pendiente de enviar»');
        ok(/AGENTE IA/.test(ultimoHist()?.texto || ''), 'historial: encargado al Agente IA', ultimoHist()?.texto);

        console.log('\n7. Al AGENTE IA no se le escribe: pedir canales → 400');
        reset();
        r = await post({ certificador_id: 'C-AGENTE', sendEmail: true, sendWhatsApp: false, phase: 'initial', template: 'standard' });
        ok(r.status === 400, 'responde 400', r.status);
        ok(emails.length === 0, 'no sale nada');
    } finally {
        // Sin cerrar antes las conexiones keep-alive de fetch, salir con
        // process.exit revienta libuv en Windows (UV_HANDLE_CLOSING).
        server.closeAllConnections?.();
        await new Promise(r => server.close(r));
    }

    console.log(fallos ? `\n✗ ${fallos} comprobación(es) fallida(s)` : '\n✓ Todo en orden');
    process.exit(fallos ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
