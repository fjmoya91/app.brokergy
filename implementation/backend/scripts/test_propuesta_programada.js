/**
 * El ciclo entero de un envío PROGRAMADO, sin tocar nada de verdad.
 *
 *   alta → barrido → claim atómico → versión → email + WhatsApp → sellado →
 *   ENVIADA → nota → aviso al staff → se borra el HTML de la fila.
 *
 * Supabase, axios, WhatsApp y el email van simulados: se inyectan en la caché
 * de `require` ANTES de cargar el servicio. Así se puede comprobar lo que de
 * verdad importa y no se puede mirar en producción sin mandarle una propuesta a
 * un cliente real:
 *
 *   · que el CLAIM es atómico (dos despachadores = un solo envío),
 *   · que SIN PDF no sale absolutamente nada,
 *   · que el mensaje que viaja es el que se guardó, no uno recompuesto,
 *   · que el correo de una empresa sale UNA vez con copia real,
 *   · que al terminar la fila se queda sin las dos columnas de ~350 KB.
 *
 *   node implementation/backend/scripts/test_propuesta_programada.js
 */
const path = require('path');

const BACKEND = path.join(__dirname, '..');
// Un `./services/x` se resuelve contra el fichero que lo pide, así que aquí se
// compone a mano; lo de `node_modules` (axios) sí se busca desde el backend.
const resolver = (m) => m.startsWith('.')
    ? path.join(BACKEND, `${m.slice(2)}.js`)
    : require.resolve(m, { paths: [BACKEND] });
const inyectar = (m, exports) => {
    const f = resolver(m);
    require.cache[f] = { id: f, filename: f, loaded: true, exports, children: [], paths: [] };
};

let fallos = 0;
const ok = (cond, txt) => { console.log(`${cond ? '  ✓' : '  ✗'} ${txt}`); if (!cond) fallos++; };

// ── Supabase simulado: una sola tabla en memoria ─────────────────────────────
const tabla = [];
const clonar = (r) => JSON.parse(JSON.stringify(r));

class Q {
    constructor() { this.filtros = []; this.modo = 'select'; this._limit = null; this._single = null; this._payload = null; this._cols = null; }
    // La lista de columnas se respeta: es justo lo que hay que comprobar —
    // `html_pdf`/`html_email` no pueden salir en una respuesta.
    select(cols) { if (cols && cols !== '*') this._cols = cols.split(',').map(s => s.trim()); return this; }
    insert(obj) { this.modo = 'insert'; this._payload = obj; return this; }
    update(obj) { this.modo = 'update'; this._payload = obj; return this; }
    eq(c, v) { this.filtros.push([c, 'eq', v]); return this; }
    lte(c, v) { this.filtros.push([c, 'lte', v]); return this; }
    order() { return this; }
    limit(n) { this._limit = n; return this; }
    maybeSingle() { this._single = 'maybe'; return this; }
    single() { this._single = 'one'; return this; }
    then(res, rej) { return Promise.resolve().then(() => this._run()).then(res, rej); }
    _casa(r) {
        return this.filtros.every(([c, op, v]) => op === 'eq' ? r[c] === v : new Date(r[c]) <= new Date(v));
    }
    _run() {
        let filas = tabla.filter(r => this._casa(r));
        if (this.modo === 'insert') {
            const fila = { id: `prog-${tabla.length + 1}`, estado: 'PENDIENTE', created_at: new Date().toISOString(), ...this._payload };
            tabla.push(fila);
            filas = [fila];
        } else if (this.modo === 'update') {
            filas.forEach(r => Object.assign(r, this._payload));
        }
        if (this._limit) filas = filas.slice(0, this._limit);
        const proy = (r) => {
            const c = clonar(r);
            if (!this._cols) return c;
            return Object.fromEntries(this._cols.filter(k => k in c).map(k => [k, c[k]]));
        };
        const data = this._single ? (filas[0] ? proy(filas[0]) : null) : filas.map(proy);
        if (this._single === 'one' && !filas.length) return { data: null, error: { message: 'no rows' } };
        return { data, error: null };
    }
}
inyectar('./services/supabaseClient', { from: () => new Q() });

// ── axios simulado: apunta las llamadas internas ─────────────────────────────
const llamadas = [];
let fallaVersion = false;
const axiosFake = {
    post: async (url, body) => {
        llamadas.push({ m: 'POST', url, body });
        if (url.includes('/propuesta/version')) {
            if (fallaVersion) { const e = new Error('Puppeteer se cayó'); e.response = { data: { message: 'Puppeteer se cayó' } }; throw e; }
            return { data: { version: 3, pdfBase64: 'UERG', fileName: 'Propuesta_26RES060_OP212_v3.pdf', cambios: 'inversión 12.400 € → 11.900 €' } };
        }
        return { data: { ok: true } };
    },
    patch: async (url, body) => { llamadas.push({ m: 'PATCH', url, body }); return { data: { ok: true } }; },
};
inyectar('axios', axiosFake);

// ── WhatsApp y email simulados ───────────────────────────────────────────────
const wa = [];
let waCaido = false;
inyectar('./services/whatsappService', {
    sendMedia: async (phone, media, opts) => {
        if (waCaido) throw new Error('Cliente WhatsApp no listo (estado: DISCONNECTED)');
        wa.push({ phone, filename: media.filename, caption: opts.caption });
        return { ok: true };
    },
    sendText: async (phone, texto) => { wa.push({ aviso: true, phone, texto }); return { ok: true }; },
});
const correos = [];
inyectar('./services/emailService', {
    sendMail: async (o) => { correos.push(o); return { ok: true }; },
    getFallbackSender: () => 'avisos@brokergy.es',
});

process.env.PROPUESTA_PROGRAMADA_ENABLED = 'true';
process.env.INTERNAL_API_KEY = 'clave-de-prueba';
const prog = require('../services/propuestaProgramada');

// ── El plan, tal y como lo compone el popup ──────────────────────────────────
const PLAN = {
    numexpte: '26RES060_OP212',
    versionImpresa: 3,
    canales: ['email', 'whatsapp'],
    nota: 'Hay que justificar con fotos que es una vivienda.',
    usuario: 'ADMINISTRADOR',
    destinatarios: [{ modo: 'CLIENTE', label: 'AMARÍA', email: 'amaria@ejemplo.es', telefono: '696386448' }],
    grupos: [{
        modo: 'CLIENTE',
        email: {
            to: 'amaria@ejemplo.es', cc: ['gestion@ejemplo.es'], label: 'AMARÍA',
            userName: 'Amaría', summaryData: { id: '26RES060_OP212' },
            mensaje: '¡Hola Amaría!\n\nTal y como acordamos…',
        },
        whatsapps: [{ label: 'AMARÍA', phone: '696386448', mensaje: '¡Hola Amaría!\n\nTal y como acordamos…' }],
    }],
    result: { financials: { caeBonus: 7922 } },
    inputs: { investment: 11900 },
};

const OPORTUNIDAD = { id: 'uuid-op-1', id_oportunidad: '26RES060_OP212' };
const dentroDeUnRato = () => new Date(Date.now() + 5 * 60000).toISOString();
const haceUnRato = () => new Date(Date.now() - 60000).toISOString();

const limpiar = () => { tabla.length = 0; llamadas.length = 0; wa.length = 0; correos.length = 0; fallaVersion = false; waCaido = false; };

(async () => {
    // ── 1. La fecha ──────────────────────────────────────────────────────────
    console.log('\n1) La hora elegida');
    ok(prog.validarFecha(dentroDeUnRato()).ok, 'dentro de cinco minutos vale');
    ok(!prog.validarFecha(haceUnRato()).ok, 'una hora que ya pasó NO vale');
    ok(!prog.validarFecha('mañana por la tarde').ok, 'una cadena que no es fecha NO vale');
    ok(!prog.validarFecha(new Date(Date.now() + 200 * 864e5).toISOString()).ok, `a más de ${prog.MAX_DIAS} días NO vale`);
    ok(!prog.validarFecha(new Date(Date.now() + 10000).toISOString()).ok, 'dentro de diez segundos NO vale (el barrido no llega)');

    // ── 2. Alta ──────────────────────────────────────────────────────────────
    console.log('\n2) Alta');
    limpiar();
    const fila = await prog.crear({
        oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: PLAN,
        htmlPdf: '<html>propuesta</html>', htmlEmail: '<html>correo</html>', usuario: 'ADMINISTRADOR',
    });
    ok(fila.estado === 'PENDIENTE', 'nace PENDIENTE');
    ok(fila.html_pdf === undefined, 'la respuesta NO devuelve el HTML (son ~350 KB por columna)');
    ok((await prog.listar('uuid-op-1')).length === 1, 'sale en el listado de la oportunidad');

    let lanzo = false;
    try { await prog.crear({ oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: { grupos: [] }, htmlPdf: '<html/>' }); }
    catch { lanzo = true; }
    ok(lanzo, 'un plan SIN destinatarios se rechaza');

    // ── 3. Todavía no le toca ────────────────────────────────────────────────
    console.log('\n3) Antes de su hora');
    await prog.despachar();
    ok(llamadas.length === 0, 'el barrido no la toca antes de su hora');
    ok(tabla[0].estado === 'PENDIENTE', 'sigue PENDIENTE');

    // ── 4. Le toca: sale ─────────────────────────────────────────────────────
    console.log('\n4) A su hora');
    tabla[0].enviar_at = haceUnRato();
    await prog.despachar();

    const post = llamadas.filter(l => l.m === 'POST');
    const version = post.find(l => l.url.includes('/propuesta/version'));
    ok(!!version, 'registra la versión (rasteriza y archiva el PDF) ANTES de enviar');
    ok(version.body.html === '<html>propuesta</html>', 'manda el documento QUE SE REVISÓ, no uno nuevo');
    ok(version.body.versionImpresa === 3, 'con la marca de versión que lleva impresa el PDF');

    const correo = post.find(l => l.url.includes('/pdf/send-proposal'));
    ok(!!correo, 'el email sale por la MISMA ruta que el envío a mano');
    ok(correo.body.pdfBase64 === 'UERG', 'con el PDF ya archivado como adjunto (no rasteriza otro)');
    ok(correo.body.to === 'amaria@ejemplo.es' && correo.body.cc.length === 1, 'UN correo por empresa, con copia real');
    ok(correo.body.customMessage.startsWith('¡Hola Amaría!'), 'con el mensaje guardado, no uno recompuesto');
    ok(correo.body.summaryData.version === 3, 'y el nº de versión que acaba de salir');

    ok(wa.filter(w => !w.aviso).length === 1, 'el WhatsApp sale una vez');
    ok(wa[0].filename === 'Propuesta_26RES060_OP212_v3.pdf', 'con el nombre de la versión archivada');

    const sellado = llamadas.find(l => l.m === 'PATCH' && l.url.includes('/propuesta/version/3'));
    ok(!!sellado && sellado.body.envios.length === 2, 'sella a quién llegó y por dónde (email + WhatsApp)');
    ok(sellado.body.envios.every(e => e.status === 'ok'), 'los dos canales en OK');

    const estado = llamadas.find(l => l.m === 'PATCH' && l.url.endsWith('/estado'));
    ok(!!estado && estado.body.nuevo_estado === 'ENVIADA', 'pasa a ENVIADA por la ruta (que mueve la carpeta de Drive)');
    ok(estado.body.usuario === 'ADMINISTRADOR', 'a nombre de quien lo programó, no de "Sistema"');

    ok(post.some(l => l.url.endsWith('/comentarios')), 'la nota adicional va al historial');

    ok(tabla[0].estado === 'ENVIADA', 'la fila queda ENVIADA');
    ok(tabla[0].version === 3 && tabla[0].resultado.length === 2, 'con su versión y su resultado por canal');
    ok(tabla[0].html_pdf === null && tabla[0].html_email === null, 'y SIN el HTML: ya está archivado en Drive');
    ok(wa.some(w => w.aviso) && correos.length === 1, 'avisa al staff: salió con nadie delante');

    // ── 5. No se manda dos veces ─────────────────────────────────────────────
    console.log('\n5) No se manda dos veces');
    const antes = llamadas.length;
    await prog.despachar();
    ok(llamadas.length === antes, 'un segundo barrido no la vuelve a enviar');

    console.log('\n   … y con DOS despachadores a la vez (VPS + portátil):');
    limpiar();
    await prog.crear({ oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: PLAN, htmlPdf: '<html>p</html>', usuario: 'ADMIN' });
    tabla[0].enviar_at = haceUnRato();
    await Promise.all([prog.despachar(), prog.despachar()]);
    ok(wa.filter(w => !w.aviso).length === 1, 'el claim atómico deja UN solo envío');

    // ── 6. Sin PDF no sale nada ──────────────────────────────────────────────
    console.log('\n6) Si el PDF no se puede preparar');
    limpiar();
    fallaVersion = true;
    await prog.crear({ oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: PLAN, htmlPdf: '<html>p</html>', usuario: 'ADMIN' });
    tabla[0].enviar_at = haceUnRato();
    await prog.despachar();
    ok(!llamadas.some(l => l.url.includes('send-proposal')), 'NO se manda el email');
    ok(wa.filter(w => !w.aviso).length === 0, 'NO se manda el WhatsApp');
    ok(tabla[0].estado === 'ERROR' && /Puppeteer/.test(tabla[0].error), 'queda en ERROR con el motivo');
    ok(wa.some(w => w.aviso) && correos.length === 1, 'y se avisa al staff, que no estaba delante');

    // ── 7. WhatsApp caído: sale lo que puede y se dice ───────────────────────
    console.log('\n7) Con WhatsApp desconectado');
    limpiar();
    waCaido = true;
    await prog.crear({ oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: PLAN, htmlPdf: '<html>p</html>', usuario: 'ADMIN' });
    tabla[0].enviar_at = haceUnRato();
    await prog.despachar();
    ok(llamadas.some(l => l.url.includes('send-proposal')), 'el email sí sale');
    ok(tabla[0].estado === 'ENVIADA', 'la programada consta ENVIADA (llegó por un canal)');
    ok(tabla[0].resultado.some(r => r.channel === 'whatsapp' && r.status === 'fail'), 'el fallo de WhatsApp queda registrado');
    ok(correos[0].subject.includes('A MEDIAS'), 'el aviso al staff dice que salió a medias');

    // ── 8. Cancelar ──────────────────────────────────────────────────────────
    console.log('\n8) Cancelar');
    limpiar();
    const f = await prog.crear({ oportunidad: OPORTUNIDAD, enviarAt: dentroDeUnRato(), plan: PLAN, htmlPdf: '<html>p</html>', usuario: 'ADMIN' });
    const cancelada = await prog.cancelar(f.id, { usuario: 'ADMINISTRADOR' });
    ok(cancelada?.estado === 'CANCELADA', 'se cancela mientras está PENDIENTE');
    ok(tabla[0].html_pdf === null, 'y suelta el HTML');
    ok((await prog.cancelar(f.id, {})) === null, 'cancelar dos veces no hace nada (no estaba pendiente)');
    await prog.despachar();
    ok(wa.filter(w => !w.aviso).length === 0, 'una cancelada no se envía');

    tabla[0].estado = 'ENVIANDO';
    ok((await prog.cancelar(f.id, {})) === null, 'una que ya está ENVIANDO no se puede cancelar');

    console.log(`\n${fallos ? `❌ ${fallos} comprobación(es) fallidas` : '✅ Todo correcto'}\n`);
    process.exit(fallos ? 1 : 0);
})();
