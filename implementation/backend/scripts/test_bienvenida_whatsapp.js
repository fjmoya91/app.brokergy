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
            // Los botones de brokergy.es que no son de un cliente (10/11/2026)
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
    // ─── El ESCAPARATE (10/11/2026): la ficha de un instalador de brokergy.es ───
    console.log('El escaparate');
    const MSG_ESC = 'Hola, he visto a Gonzagarri S.L en brokergy.es y me gustaría que me hiciera la obra. ¿Me calculáis la ayuda? Mi casa está en Argamasilla de Alba. Me gustaria recibir presupuesto';
    const GONZAGARRI = {
        id_empresa: 'p-gonza', acronimo: null, razon_social: 'GONZAGARRI S.L', tlf: '657816520',
        tlf_contacto: '623378009', nombre_contacto: 'PACO', tlf_responsable: '657816520', nombre_responsable: 'ALONSO',
        contacto_notificaciones_activas: true,
        contactos_notificacion: [{ tlf: '623378009', nombre: 'PACO', roles: ['comercial', 'tecnico'] }],
    };
    const OTRO = { id_empresa: 'p-otro', acronimo: 'ISM', razon_social: 'INSTALACIONES SERRANO MORA SL', tlf: '926111222', contactos_notificacion: [] };
    process.env.ASISTENTE_WHATSAPP_GRUPO = '120363000000000000@g.us';

    await prueba('se lee el nombre del instalador, el municipio y si pide presupuesto', () => {
        assert.deepStrictEqual(U.deEscaparate(MSG_ESC), { nombre: 'Gonzagarri S.L', municipio: 'Argamasilla de Alba', presupuesto: true });
        const sinCasa = U.deEscaparate('Hola, he visto a ISM en brokergy.es y me gustaría que me hiciera la obra. ¿Me calculáis la ayuda? Mi casa está en ');
        assert.strictEqual(sinCasa.nombre, 'ISM'); assert.strictEqual(sinCasa.municipio, null); assert.strictEqual(sinCasa.presupuesto, false);
        assert.strictEqual(U.deEscaparate('Hola, quiero saber qué ayuda le corresponde a mi obra'), null);
    });
    await prueba('la forma jurídica no cuenta para casar ni se le dice al cliente', () => {
        assert.strictEqual(U.sinFormaJuridica('GONZAGARRI S.L'), 'GONZAGARRI');
        assert.strictEqual(U.sinFormaJuridica('Calefacciones Miguel Gonzalez, S.L.U.'), 'Calefacciones Miguel Gonzalez');
        assert.strictEqual(U.sinFormaJuridica('Instalaciones Plaza SL'), 'Instalaciones Plaza');
        assert.strictEqual(U.sinFormaJuridica('ISM'), 'ISM');
        assert.strictEqual(U.claveNombre('Gonzagarri S.L'), U.claveNombre('GONZAGARRI S.L'));
    });
    await prueba('el instalador es UNA ficha: por su nombre de la web (acrónimo o razón social); ninguna o varias → no', () => {
        assert.strictEqual(U.elegirInstalador('Gonzagarri S.L', [GONZAGARRI, OTRO]).partner.id_empresa, 'p-gonza');
        assert.strictEqual(U.elegirInstalador('ISM', [GONZAGARRI, OTRO]).partner.id_empresa, 'p-otro');
        assert.strictEqual(U.elegirInstalador('Fontanería López', [GONZAGARRI, OTRO]).ok, false);
        // La web acorta el nombre de algún autónomo: vale el comienzo, si es de una sola ficha y largo.
        const JOSE = { id_empresa: 'p-jose', acronimo: null, razon_social: 'JOSÉ ÁLVAREZ ALMARCHA' };
        assert.strictEqual(U.elegirInstalador('JOSÉ ÁLVAREZ', [GONZAGARRI, JOSE]).partner?.id_empresa, 'p-jose');
        assert.strictEqual(U.elegirInstalador('JOSÉ ÁLVAREZ', [JOSE, { ...JOSE, id_empresa: 'p-jose-2', razon_social: 'JOSE ALVAREZ PEREZ' }]).ok, false);
        assert.strictEqual(U.elegirInstalador('GONZA', [GONZAGARRI]).ok, false, 'un comienzo corto no vale');
        const dos = U.elegirInstalador('Gonzagarri', [GONZAGARRI, { ...GONZAGARRI, id_empresa: 'p-gonza-2' }]);
        assert.strictEqual(dos.ok, false); assert.ok(/2 fichas/.test(dos.motivo), dos.motivo);
    });
    await prueba('se avisa al contacto COMERCIAL del instalador, con su nombre; nunca a un fijo', () => {
        assert.deepStrictEqual(U.contactoAviso(GONZAGARRI), { tel9: '623378009', nombre: 'Paco' });
        assert.deepStrictEqual(U.contactoAviso({ ...GONZAGARRI, contactos_notificacion: [{ tlf: '600111222', nombre: 'Luis', roles: ['tecnico'] }, { tlf: '611000111', nombre: 'Ana', roles: ['comercial'] }] }), { tel9: '611000111', nombre: 'Ana' });
        assert.deepStrictEqual(U.contactoAviso({ ...GONZAGARRI, contactos_notificacion: [] }), { tel9: '623378009', nombre: 'Paco' });
        assert.strictEqual(U.contactoAviso(OTRO), null, 'un fijo no recibe WhatsApp');
    });
    await prueba('pasa los MISMOS filtros que la bienvenida: nuevo → sí (con el escaparate); en la agenda, «Hola Fran» o en la app → no', () => {
        const d = dice(MSG_ESC);
        assert.strictEqual(d.ok, true, d.motivo); assert.strictEqual(d.escaparate.nombre, 'Gonzagarri S.L');
        assert.strictEqual(U.decidir({ chat: { ...base, enAgenda: true }, texto: MSG_ESC, ahoraMs: ahora }).ok, false);
        assert.strictEqual(dice(`Hola Fran, ${MSG_ESC}`).ok, false);
        assert.strictEqual(U.decidir({ chat: base, conocido: 'cliente', texto: MSG_ESC, ahoraMs: ahora }).ok, false);
    });
    await prueba('los textos: al cliente, su instalador sin «S.L» y el enlace con su fila; al instalador, quién es y su teléfono; sin emojis', () => {
        const c = U.textoEscaparateCliente({ instalador: 'Gonzagarri S.L', enlace: U.enlaceEscaparate('https://app.brokergy.es/', 7) });
        assert.ok(c.includes('Le hemos pasado tu contacto a Gonzagarri para que te llamen'), c);
        assert.ok(c.includes('https://app.brokergy.es/calcula-tu-ayuda?ref=esc-7') && !/S\.L/.test(c));
        const a = U.textoAvisoInstalador({ contacto: 'Paco', municipio: 'Argamasilla de Alba', presupuesto: true, nombreCliente: 'Natalia', tel9: '605292429' });
        assert.ok(a.startsWith('Hola Paco, nos ha entrado por la web una petición para vosotros: un cliente de Argamasilla de Alba'), a);
        assert.ok(a.includes('Pide presupuesto.') && a.includes('Natalia, 605 29 24 29'));
        assert.ok(!/Pide presupuesto/.test(U.textoAvisoInstalador({ contacto: null, municipio: null, presupuesto: false, tel9: '605292429' })));
        for (const t of [c, a]) assert.ok(!/\p{Extended_Pictographic}/u.test(t), 'lleva emojis');
    });

    // El servicio: la ráfaga trae el texto, así que se entra por el listener.
    const rafagaEsc = async (texto = MSG_ESC, tel = '34605292429') => {
        const viejo = B.CFG.ventanaMs;
        B.CFG.ventanaMs = 20;
        B._alMensajeEntrante({ from: `${tel}@c.us`, type: 'chat', body: texto });
        await new Promise(r => setTimeout(r, 90));
        B.CFG.ventanaMs = viejo;
    };
    await prueba('se apunta como ESCAPARATE: con su instalador, a quién avisar y el enlace con su fila', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        delete process.env.WA_ESCAPARATE_MODO;
        const { bd } = montar({ tablas: { prescriptores: [GONZAGARRI, OTRO] } });
        await rafagaEsc();
        const f = bd.tablas.wa_bienvenidas[0];
        assert.ok(f, 'no se ha apuntado');
        assert.strictEqual(f.tipo, 'escaparate'); assert.strictEqual(f.partner_id, 'p-gonza');
        assert.strictEqual(f.modo, 'copia', 'el escaparate va con su propio modo, en copia por defecto');
        assert.strictEqual(f.aviso.tel9, '623378009'); assert.strictEqual(f.aviso.instalador, 'GONZAGARRI S.L');
        assert.ok(f.texto.includes(`ref=esc-${f.id}`), f.texto);
    });
    await prueba('en COPIA (aunque la bienvenida esté en real): ni al cliente ni al instalador; a Fran, los dos textos', async () => {
        process.env.WA_BIENVENIDA_MODO = 'real';
        delete process.env.WA_ESCAPARATE_MODO;
        const { bd, ws } = montar({ tablas: { prescriptores: [GONZAGARRI] } });
        await rafagaEsc();
        await B.vuelta();
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'COPIA');
        assert.deepStrictEqual(ws.enviados.map(e => e.phone), ['120363000000000000@g.us'], JSON.stringify(ws.enviados.map(e => e.phone)));
        const m = ws.enviados[0].message;
        assert.ok(/ESCAPARATE \(copia/.test(m) && m.includes('Hola Paco') && m.includes('Le hemos pasado tu contacto a Gonzagarri'), m);
    });
    await prueba('en REAL: primero el aviso al instalador, después el texto y el vídeo al cliente, y una línea a Fran', async () => {
        process.env.WA_ESCAPARATE_MODO = 'real';
        const { bd, ws } = montar({ tablas: { prescriptores: [GONZAGARRI] } });
        await rafagaEsc();
        await B.vuelta();
        const f = bd.tablas.wa_bienvenidas[0];
        assert.strictEqual(f.estado, 'ENVIADA', f.motivo);
        assert.deepStrictEqual(ws.enviados.map(e => `${e.tipo}:${e.phone}`),
            ['texto:34623378009', 'texto:34605292429', 'media:34605292429', 'texto:120363000000000000@g.us']);
        assert.strictEqual(f.aviso.estado, 'ENVIADO');
        assert.ok(/a nombre de GONZAGARRI S.L/.test(ws.enviados[3].message), ws.enviados[3].message);
        delete process.env.WA_ESCAPARATE_MODO;
    });
    await prueba('si el aviso al instalador no sale, al cliente NO se le escribe (sería mentira) y se le dice a Fran', async () => {
        process.env.WA_ESCAPARATE_MODO = 'real';
        const { bd, ws } = montar({ tablas: { prescriptores: [GONZAGARRI] } });
        B._deps.esperarCola = async () => 'PENDING';
        await rafagaEsc();
        await B.vuelta();
        assert.strictEqual(bd.tablas.wa_bienvenidas[0].estado, 'ERROR');
        assert.deepStrictEqual(ws.enviados.map(e => e.phone), ['34623378009', '120363000000000000@g.us']);
        delete process.env.WA_ESCAPARATE_MODO;
    });
    await prueba('si el nombre no casa con UNA ficha: no se apunta, no se escribe a nadie y se le dice a Fran (una vez)', async () => {
        process.env.WA_ESCAPARATE_MODO = 'real';
        const { bd, ws } = montar({ tablas: { prescriptores: [OTRO] } });
        await rafagaEsc();
        assert.strictEqual(bd.tablas.wa_bienvenidas.length, 0);
        assert.deepStrictEqual(ws.enviados.map(e => e.phone), ['120363000000000000@g.us']);
        assert.ok(/no casa con ninguna ficha/.test(ws.enviados[0].message), ws.enviados[0].message);
        delete process.env.WA_ESCAPARATE_MODO;
    });
    await prueba('el formulario: el lead nace a nombre del instalador por su ref=esc-<fila> o por su teléfono; si no, de nadie', async () => {
        const reciente = new Date(MEDIODIA - 3600_000).toISOString();
        const { bd } = montar({ tablas: {
            prescriptores: [GONZAGARRI],
            wa_bienvenidas: [{ id: 41, tel9: '605292429', partner_id: 'p-gonza', created_at: reciente }, { id: 42, tel9: '611222333', partner_id: null, created_at: reciente }],
        } });
        assert.deepStrictEqual(await B.partnerDelLead({ ref: 'esc-41', tlf: '+34 699 000 000' }), { id_empresa: 'p-gonza', nombre: 'GONZAGARRI', fila: 41 });
        assert.strictEqual((await B.partnerDelLead({ ref: 'wa', tlf: '605 29 24 29' }))?.id_empresa, 'p-gonza');
        assert.strictEqual(await B.partnerDelLead({ ref: 'esc-42', tlf: '611222333' }), null);
        assert.strictEqual(await B.partnerDelLead({ ref: null, tlf: null }), null);
        bd.tablas.__error = ['wa_bienvenidas'];
        assert.strictEqual(await B.partnerDelLead({ ref: 'esc-41' }), null, 'con la BD caída no lanza: el alta sigue');
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
