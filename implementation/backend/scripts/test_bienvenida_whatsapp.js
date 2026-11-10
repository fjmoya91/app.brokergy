/**
 * Prueba de la BIENVENIDA de WhatsApp (services/bienvenidaWhatsapp.js +
 * utils/bienvenidaWhatsapp.js), sin WhatsApp ni base de datos: las dos van simuladas.
 *   node implementation/backend/scripts/test_bienvenida_whatsapp.js
 */
process.env.WA_BIENVENIDA_ENABLED = 'true';
process.env.WA_BIENVENIDA_MODO = 'copia';
process.env.WA_BIENVENIDA_PRUEBA = '';
process.env.WA_BIENVENIDA_VIDEO_URL = 'https://brokergy.es/video/ayudas.mp4';
process.env.FRONTEND_URL = 'https://app.brokergy.es';

const assert = require('assert');
const U = require('../utils/bienvenidaWhatsapp');
const B = require('../services/bienvenidaWhatsapp');

let fallos = 0;
let pruebas = 0;
async function prueba(nombre, fn) {
    pruebas++;
    try { await fn(); console.log(`  ✓ ${nombre}`); } catch (e) { fallos++; console.log(`  ✗ ${nombre}\n      ${e.message}`); }
}

// ─── Una BD de juguete con lo que usa el servicio ────────────────────────────
function bdFalsa(tablas) {
    const T = (n) => (tablas[n] = tablas[n] || []);
    let seq = 1;
    const consulta = (nombre) => {
        const q = { filtros: [], orden: null, lim: null, op: 'select', head: false, count: false, datos: null, devolver: false, uno: false };
        const casa = (f) => T(nombre).filter(r => q.filtros.every(fl => fl(r)));
        const ejecutar = () => {
            if (tablas.__error && tablas.__error.includes(nombre)) return { data: null, error: { message: 'BD caída' } };
            if (q.op === 'insert') {
                const fila = { id: seq++, created_at: new Date().toISOString(), ...q.datos };
                if (nombre === 'wa_bienvenidas' && T(nombre).some(r => r.tel9 === fila.tel9)) return { error: { message: 'duplicate key value violates unique constraint' } };
                T(nombre).push(fila);
                return { data: [fila], error: null };
            }
            if (q.op === 'update') {
                const fs = casa();
                fs.forEach(r => Object.assign(r, q.datos));
                return { data: q.devolver ? fs.map(r => ({ id: r.id })) : null, error: null };
            }
            if (q.op === 'delete') {
                tablas[nombre] = T(nombre).filter(r => !q.filtros.every(fl => fl(r)));
                return { data: null, error: null };
            }
            let fs = casa();
            if (q.orden) fs = [...fs].sort((a, b) => String(a[q.orden]).localeCompare(String(b[q.orden])) * (q.asc ? 1 : -1));
            if (q.lim) fs = fs.slice(0, q.lim);
            if (q.head) return { count: casa().length, data: null, error: null };
            if (q.uno) return { data: fs[0] || null, error: null };
            return { data: fs, error: null };
        };
        const api = {
            select(_c, o = {}) { if (q.op === 'update') q.devolver = true; else { q.head = !!o.head; } return api; },
            insert(d) { q.op = 'insert'; q.datos = d; return api; },
            update(d) { q.op = 'update'; q.datos = d; return api; },
            delete() { q.op = 'delete'; return api; },
            eq(c, v) { q.filtros.push(r => r[c] === v); return api; },
            lte(c, v) { q.filtros.push(r => String(r[c]) <= v); return api; },
            gte(c, v) { q.filtros.push(r => r[c] && String(r[c]) >= v); return api; },
            like(c, v) { const suf = v.replace(/^%/, ''); q.filtros.push(r => String(r[c] || '').endsWith(suf)); return api; },
            order(c, o = {}) { q.orden = c; q.asc = o.ascending !== false; return api; },
            limit(n) { q.lim = n; return api; },
            maybeSingle() { q.uno = true; return api; },
            then(res, rej) { return Promise.resolve(ejecutar()).then(res, rej); },
        };
        return api;
    };
    return { from: consulta, tablas };
}

// ─── WhatsApp de juguete ─────────────────────────────────────────────────────
function waFalso({ videoFalla = false } = {}) {
    const enviados = [];
    return {
        enviados,
        onMessage() {}, onMensajePropio() {},
        async sendText(phone, message) { enviados.push({ tipo: 'texto', phone, message }); return { ok: true, queued: true, id: enviados.length }; },
        async sendMedia(phone, media, opts) {
            if (videoFalla) throw new Error('Evaluation failed: video');
            enviados.push({ tipo: 'media', phone, mimetype: media.mimetype, opts });
            return { ok: true };
        },
    };
}

const CHAT_NUEVO = { hayChat: true, numero: '34611222333', enAgenda: false, esEmpresa: false, pushname: 'Ana', mensajes: 2, propios: 0, primeroSeg: 0, etiquetas: 0 };
const MEDIODIA = Date.parse('2026-11-10T11:00:00Z');   // 12:00 en Madrid

function montar({ tablas = {}, chats = {}, ws = waFalso(), ahora = MEDIODIA } = {}) {
    B._reiniciar();
    const bd = bdFalsa({ clientes: [], prescriptores: [], usuarios: [], certapp_cuentas: [], instalador_solicitudes: [], whatsapp_contactos_descartados: [], whatsapp_queue: [], wa_bienvenidas: [], ...tablas });
    const d = B._deps;
    d.supabase = bd;
    d.ws = ws;
    d.leerChat = async (id) => {
        const c = chats[id];
        if (c instanceof Error) throw c;
        // Como LEER_CHAT: un @c.us trae su número en el propio id.
        const numero = id.endsWith('@c.us') ? id.split('@')[0] : (c || CHAT_NUEVO).numero;
        return { ...(c || CHAT_NUEVO), numero, primeroSeg: (c || CHAT_NUEVO).primeroSeg || Math.floor(ahora / 1000) - 60 };
    };
    d.resolverLid = async () => null;
    d.bajarVideo = async () => ({ url: 'x', bytes: 4_900_000, base64: 'AAAA' });
    d.esperarCola = async () => 'SENT';
    d.ahora = () => ahora;
    return { bd, ws };
}

(async () => {
    console.log('El texto y el enlace');
    await prueba('el enlace va al formulario con ref=wa y sin ningún dato personal', () => {
        assert.strictEqual(U.enlaceFormulario('https://app.brokergy.es/'), 'https://app.brokergy.es/calcula-tu-ayuda?ref=wa');
    });
    await prueba('el texto lleva el enlace, las dos ayudas y la alternativa; sin emojis', () => {
        const t = U.textoBienvenida();
        assert.ok(t.includes('https://app.brokergy.es/calcula-tu-ayuda?ref=wa'));
        assert.ok(/bono CAE/.test(t) && /Renta/.test(t) && /placa de características/.test(t));
        assert.ok(/estando en casa/.test(t) && /«Usar mi ubicación»/.test(t) && /vivienda correcta/.test(t), 'falta lo de hacerlo en casa con la ubicación');
        assert.ok(!/\p{Extended_Pictographic}/u.test(t), 'lleva emojis');
        assert.ok(!/soy |somos brokergy|te escribe/i.test(t), 'se presenta');
        assert.ok(U.PIE_VIDEO.length < 100 && !U.PIE_VIDEO.includes('\n'), 'el pie del vídeo no cabe como pie');
    });
    await prueba('solo móviles españoles', () => {
        assert.ok(U.esMovilEspanol('34611222333') && U.esMovilEspanol('711222333'));
        assert.ok(!U.esMovilEspanol('34926111222') && !U.esMovilEspanol('447700900123') && !U.esMovilEspanol(''));
    });

    console.log('A quién NO');
    const ahora = MEDIODIA;
    const base = { ...CHAT_NUEVO, primeroSeg: Math.floor(ahora / 1000) - 60 };
    const no = (extra, conocido, patron) => {
        const d = U.decidir({ chat: { ...base, ...extra }, conocido, ahoraMs: ahora });
        assert.strictEqual(d.ok, false, `debería ser NO: ${JSON.stringify(extra)} ${conocido || ''}`);
        assert.ok(patron.test(d.motivo), d.motivo);
    };
    await prueba('nuevo de verdad → sí', () => assert.strictEqual(U.decidir({ chat: base, ahoraMs: ahora }).ok, true));
    await prueba('en la app → no', () => no({}, 'cliente', /app \(cliente\)/));
    await prueba('en la agenda → no', () => no({ enAgenda: true }, null, /agenda/));
    await prueba('cuenta de empresa → no', () => no({ esEmpresa: true }, null, /empresa/));
    await prueba('ya le hemos escrito → no', () => no({ propios: 1 }, null, /escrito/));
    await prueba('chat con etiquetas → no', () => no({ etiquetas: 1 }, null, /etiquetas/));
    await prueba('mensajes de hace días → no', () => no({ primeroSeg: Math.floor(ahora / 1000) - 3 * 86400 }, null, /anteriores/));
    await prueba('sin número → no (no se puede comprobar)', () => no({ numero: null }, null, /número/));
    await prueba('fijo o extranjero → no', () => no({ numero: '34926111222' }, null, /móvil español/));
    // El caso del modo copia (10/11/2026): un número que no estaba en ningún sitio, pero había llamado.
    const dice = (texto) => U.decidir({ chat: base, texto, ahoraMs: ahora });
    await prueba('«Hola Fran, … te llamé ayer» → no (ya ha hablado con nosotros)', () => {
        const d = dice('Hola Fran, soy Santiago Carmena, te llamé ayer. Te mando la documentación');
        assert.strictEqual(d.ok, false); assert.ok(/ya ha hablado/.test(d.motivo), d.motivo);
    });
    await prueba('una conversación de antes o «de parte de» alguien → no', () => {
        for (const t of ['Buenas, lo que hablamos por teléfono', 'Os llamé el lunes por lo de la aerotermia',
            'Hola, vengo de parte de Instalaciones Pérez', 'Me ha pasado tu número mi vecino',
            'Te mando lo que me pediste', 'Como te comenté, la caldera es de gasoil', 'Buenos días FRANCISCO',
            // Los botones de brokergy.es que no son de un cliente que pregunta (10/11/2026)
            'Hola, he visto a Gonzagarri S.L en brokergy.es y me gustaría que me hiciera la obra. ¿Me calculáis la ayuda? Mi casa está en Argamasilla de Alba.',
            'Hola, soy instalador y quiero trabajar con BROKERGY', 'Hola, soy distribuidor y quiero hablar de mi red de instaladores']) {
            assert.strictEqual(dice(t).ok, false, t);
        }
    });
    await prueba('quien pregunta sin conocernos → sí (y «francés» no es Fran)', () => {
        for (const t of ['Hola, quería información sobre las ayudas para cambiar la caldera',
            '¿Cuánto me dan por poner aerotermia?', 'Tengo una caldera francesa de gasóleo', '',
            'Hola, quiero saber qué ayuda le corresponde a mi obra']) {
            assert.strictEqual(dice(t).ok, true, t);
        }
    });
    await prueba('el de prueba pasa aunque esté en la app y en la agenda', () => {
        assert.strictEqual(U.decidir({ chat: { ...base, enAgenda: true }, conocido: 'usuario de la app', prueba: true, ahoraMs: ahora }).ok, true);
    });

    console.log('El horario: la franja de la casa (regla 205, de 7 a 21 h, todos los días: contesta a quien ha escrito)');
    await prueba('el tope del día empieza a medianoche de Madrid', () => {
        assert.strictEqual(U.inicioDiaMadrid(new Date(MEDIODIA)).toISOString(), '2026-11-09T23:00:00.000Z');
        assert.strictEqual(U.inicioDiaMadrid(new Date('2026-07-15T10:00:00Z')).toISOString(), '2026-07-14T22:00:00.000Z');
    });

    console.log('El servicio');
    await prueba('nuevo → se apunta PENDIENTE y, en modo copia, la vuelta no manda nada', async () => {
        process.env.WA_BIENVENIDA_MODO = 'copia';
        const { bd, ws } = montar();
        const r = await B._evaluar('34611222333@c.us');
        assert.strictEqual(r.ok, true, r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 1);
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'PENDIENTE');
        await B.vuelta();
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'COPIA');
        assert.strictEqual(ws.enviados.length, 0, 'en modo copia ha salido algo');
    });
    await prueba('en real: primero el texto y después el VÍDEO (no como documento), con su pie', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const { bd, ws } = montar();
        await B._evaluar('34611222333@c.us');
        await B.vuelta();
        const f = bd.tablas.wa_bienvenidas[0];
        assert.strictEqual(f.estado, 'ENVIADA', f.motivo);
        assert.strictEqual(f.video, 'enviado');
        assert.deepStrictEqual(ws.enviados.map(e => e.tipo), ['texto', 'media']);
        assert.strictEqual(ws.enviados[0].phone, '34611222333');
        assert.ok(ws.enviados[0].message.includes('calcula-tu-ayuda?ref=wa'));
        assert.strictEqual(ws.enviados[1].mimetype, 'video/mp4');
        assert.strictEqual(ws.enviados[1].opts.asDocument, false);
        assert.strictEqual(ws.enviados[1].opts.caption, U.PIE_VIDEO);
    });
    await prueba('si el vídeo no sale, va su ENLACE detrás del texto', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const { bd, ws } = montar({ ws: waFalso({ videoFalla: true }) });
        await B._evaluar('34611222333@c.us');
        await B.vuelta();
        const f = bd.tablas.wa_bienvenidas[0];
        assert.strictEqual(f.estado, 'ENVIADA');
        assert.ok(/^enlace/.test(f.video), f.video);
        assert.strictEqual(ws.enviados.length, 2);
        assert.ok(ws.enviados[1].message.endsWith('https://brokergy.es/video/ayudas.mp4'));
    });
    await prueba('si el texto sigue en la cola, el vídeo NO se manda (llegaría antes)', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const { bd, ws } = montar();
        B._deps.esperarCola = async () => 'PENDING';
        await B._evaluar('34611222333@c.us');
        await B.vuelta();
        assert.deepStrictEqual(ws.enviados.map(e => e.tipo), ['texto']);
        assert.ok(/cola/.test(bd.tablas.wa_bienvenidas[0].video));
    });
    await prueba('un cliente de la app → no se apunta', async () => {
        const { bd } = montar({ tablas: { clientes: [{ tlf: '+34 611 222 333', copropietarios: [] }] } });
        const r = await B._evaluar('34611222333@c.us');
        assert.strictEqual(r.ok, false);
        assert.ok(/cliente/.test(r.motivo), r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
    });
    await prueba('un copropietario, un partner o alguien a quien ya escribió la app → no', async () => {
        for (const tablas of [
            { clientes: [{ tlf: '600000000', copropietarios: [{ tlf: '611222333' }] }] },
            { prescriptores: [{ tlf: '900', contactos_notificacion: [{ tlf: '34611222333' }] }] },
            { whatsapp_queue: [{ id: 9, phone: '34611222333' }] },
        ]) {
            const { bd } = montar({ tablas });
            const r = await B._evaluar('34611222333@c.us');
            assert.strictEqual(r.ok, false, JSON.stringify(tablas));
            assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
        }
    });
    await prueba('el móvil de Fran (chat del asistente) y el de administración → no', async () => {
        process.env.ASISTENTE_WHATSAPP_TEL = '34699888777';
        const { bd } = montar();
        const r = await B._evaluar('34699888777@c.us');
        assert.strictEqual(r.ok, false);
        assert.ok(/casa/.test(r.motivo), r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
        delete process.env.ASISTENTE_WHATSAPP_TEL;
    });
    await prueba('con la BD caída NO se escribe (no es «es nuevo»), y se reintenta con el siguiente mensaje', async () => {
        const { bd } = montar({ tablas: { __error: ['clientes'] } });
        const r = await B._evaluar('34611222333@c.us');
        assert.strictEqual(r.ok, false);
        assert.ok(/no se ha podido comprobar/.test(r.motivo), r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
        delete bd.tablas.__error;
        assert.strictEqual((await B._evaluar('34611222333@c.us')).ok, true, 'no se reintenta');
    });
    await prueba('con el chat sin leer (WhatsApp atascado) NO se escribe', async () => {
        const { bd } = montar({ chats: { '34611222333@c.us': new Error('Timeout en leer el chat (20s)') } });
        const r = await B._evaluar('34611222333@c.us');
        assert.strictEqual(r.ok, false);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
    });
    await prueba('una sola bienvenida por teléfono, para siempre', async () => {
        const { bd } = montar();
        assert.strictEqual((await B._evaluar('34611222333@c.us')).ok, true);
        B._reiniciar();
        B._deps.supabase = bd;
        const r = await B._evaluar('34611222333@c.us');
        assert.strictEqual(r.ok, false);
        assert.ok(/ya se le dio/.test(r.motivo), r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 1);
    });
    await prueba('un @lid se comprueba por SU número (el que da WhatsApp Web)', async () => {
        const { bd } = montar({
            tablas: { clientes: [{ tlf: '611222333' }] },
            chats: { '123456789012@lid': { ...CHAT_NUEVO, numero: '34611222333' } },
        });
        const r = await B._evaluar('123456789012@lid');
        assert.strictEqual(r.ok, false);
        assert.ok(/cliente/.test(r.motivo), r.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
    });
    await prueba('si le contesta una persona de la casa antes de salir → DESCARTADA, no sale nada', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const { bd, ws } = montar();
        await B._evaluar('34611222333@c.us');
        B._alMensajePropio({ msg: { to: '34611222333@c.us' }, delSistema: false });
        await B.vuelta();
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'DESCARTADA');
        assert.strictEqual(ws.enviados.length, 0);
    });
    await prueba('y si al releer el chat ya hay un mensaje nuestro → DESCARTADA', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const chats = {};
        const { bd, ws } = montar({ chats });
        await B._evaluar('34611222333@c.us');
        chats['34611222333@c.us'] = { ...CHAT_NUEVO, propios: 1 };
        await B.vuelta();
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'DESCARTADA');
        assert.strictEqual(ws.enviados.length, 0);
    });
    await prueba('a las 23:30 se apunta para mañana a las 7:00 (la franja de la casa) y la vuelta no la manda', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const noche = Date.parse('2026-11-10T22:30:00Z');
        const { bd, ws } = montar({ ahora: noche });
        await B._evaluar('34611222333@c.us');
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].enviar_at, '2026-11-11T06:00:00.000Z');
        await B.vuelta();
        assert.strictEqual(ws.enviados.length, 0);
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'PENDIENTE');
    });
    await prueba('el tope de la hora para la vuelta', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        const hace = new Date(MEDIODIA - 10 * 60_000).toISOString();
        const enviadas = Array.from({ length: 10 }, (_, i) => ({ id: 100 + i, tel9: `60000000${i}`, estado: 'ENVIADA', enviado_at: hace }));
        const { bd, ws } = montar({ tablas: { wa_bienvenidas: enviadas } });
        await B._evaluar('34611222333@c.us');
        const r = await B.vuelta();
        assert.strictEqual(ws.enviados.length, 0);
        assert.ok(r.hecho.some(h => h.accion === 'tope'), JSON.stringify(r));
        assert.strictEqual(bd.tablas.wa_bienvenidas.find(f => f.tel9 === '611222333').estado, 'PENDIENTE');
    });
    await prueba('en prueba solo se atiende a los teléfonos de prueba, aunque ya nos conozcan', async () => {
        process.env.WA_BIENVENIDA_PRUEBA = '611222333';
        const { bd } = montar({ tablas: { usuarios: [{ tlf: '611222333' }] }, chats: { '34611222333@c.us': { ...CHAT_NUEVO, enAgenda: true, propios: 3 } } });
        assert.strictEqual((await B._evaluar('34611222333@c.us')).ok, true);
        const otro = await B._evaluar('34622333444@c.us');
        assert.strictEqual(otro.ok, false);
        assert.ok(/prueba/.test(otro.motivo), otro.motivo);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 1);
        process.env.WA_BIENVENIDA_PRUEBA = '';
    });
    await prueba('la ráfaga: tres mensajes seguidos se evalúan UNA vez; lo propio, los grupos y las tarjetas, nunca', async () => {
        process.env.WA_BIENVENIDA_MODO = 'copia';
        const { bd } = montar();
        let lecturas = 0;
        const leer = B._deps.leerChat;
        B._deps.leerChat = async (id) => { lecturas++; return leer(id); };
        const viejo = B.CFG.ventanaMs;
        B.CFG.ventanaMs = 30;
        const m = (extra) => B._alMensajeEntrante({ from: '34611222333@c.us', type: 'chat', body: 'Hola', ...extra });
        m(); m({ body: 'quería información de las ayudas' }); m({ type: 'image', body: '' });
        B._alMensajeEntrante({ from: '34611222333@c.us', fromMe: true, type: 'chat', body: 'x' });
        B._alMensajeEntrante({ from: '1203630@g.us', type: 'chat', body: 'grupo' });
        B._alMensajeEntrante({ from: '34655666777@c.us', type: 'vcard', body: 'BEGIN:VCARD' });
        await new Promise(r => setTimeout(r, 120));
        B.CFG.ventanaMs = viejo;
        assert.strictEqual(lecturas, 1, `lecturas: ${lecturas}`);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 1);
        assert.ok(/Hola \(\+2\)/.test(bd.tablas.wa_bienvenidas[0].primer_mensaje), bd.tablas.wa_bienvenidas[0].primer_mensaje);
    });
    await prueba('la ráfaga junta lo que dice: un documento con «Hola Fran» en el pie no se apunta', async () => {
        process.env.WA_BIENVENIDA_MODO = 'copia';
        const { bd } = montar();
        const viejo = B.CFG.ventanaMs;
        B.CFG.ventanaMs = 30;
        B._alMensajeEntrante({ from: '34611222333@c.us', type: 'chat', body: 'Buenas tardes' });
        B._alMensajeEntrante({ from: '34611222333@c.us', type: 'document', body: 'Hola Fran, te llamé ayer. Te mando la documentación' });
        await new Promise(r => setTimeout(r, 120));
        B.CFG.ventanaMs = viejo;
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
    });
    await prueba('apagada no hace nada', async () => {
        process.env.WA_BIENVENIDA_ENABLED = 'false';
        const { bd } = montar();
        assert.strictEqual((await B._evaluar('34611222333@c.us')).ok, false);
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
        process.env.WA_BIENVENIDA_ENABLED = 'true';
    });

    console.log(`\n${pruebas - fallos}/${pruebas} bien`);
    process.exit(fallos ? 1 : 0);
})();
