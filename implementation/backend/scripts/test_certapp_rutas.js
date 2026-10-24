// App de certificadores — quién entra a qué: rutas REALES con Supabase SIMULADO
// (no toca producción, no sube nada a Drive, no manda nada).
//   node scripts/test_certapp_rutas.js   (desde implementation/backend)
// Anónimo → 401 · usuario del CRM sin cuenta de la app → 403 · certificador con
// una obra AJENA → 404 (también antes de recibir ficheros) · certificador en el
// admin → 403 · BD caída → 503 · lo público valida su token. Regla 102 y
// docs/conocimiento/certificadores-app/00-la-app-de-certificadores.md
//
// Y lo de la revisión de seguridad (24/10/2026): tipo por los bytes y cabeceras
// de /fichero (#1), obra congelada y revisiones (#2-B), IP de verdad y
// form_token (#3), la beta no pisa (#4), firmas y portal (#6), crédito por obra (#8).
const path = require('path');
const { Readable } = require('stream');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
    WHATSAPP_ENABLED: 'false', CERTAPP_AVISOS_ENABLED: 'false', CERTAPP_IA_AUTO: 'false',
    CERTAPP_ASISTENTE_ENABLED: 'false', TURNSTILE_ENABLED: 'false', CERTAPP_DRIVE_ROOT_ID: '',
    CERTAPP_TOKEN_SECRET: 'secreto-de-prueba-0123456789abcdef0123456789abcdef', CERTAPP_REVISIONES_MAX: '2',
    CERTAPP_PORTAL_DIAS: '30',
});

const CUENTA = { id: 'c0000000-0000-4000-8000-000000000001', auth_user_id: 'a-tok-ext', email: 'ext@prueba.es', estado: 'ACTIVA', creditos: 2, prefs: {} };
const OBRA_SUYA = 'b0000000-0000-4000-8000-000000000001';
const OBRA_AJENA = 'b0000000-0000-4000-8000-000000000002';
const TOKEN_PORTAL = 'tok-portal-0123456789abcdef';
const ROLES = { 'tok-admin': 'ADMIN', 'tok-trab': 'TRABAJADOR', 'tok-partner': 'INSTALADOR' };
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
let ultimoToken = null;

// Estado del caso en curso: la obra (con lo que cambie el caso), lo que devuelven
// las RPC y el registro de lo que se ha pedido a la «BD».
let caida = false;
let obraCaso = {};
let rpcCaso = {};
let ops = [];

const obraBase = () => ({
    id: OBRA_SUYA, cuenta_id: CUENTA.id, numero_expediente: '2026EXT_1', estado: 'BORRADOR', titular: {}, cuestionario: {},
    documentacion: {}, portal_token: TOKEN_PORTAL, portal_token_at: hace(1), revisiones: 0, credito_consumido: false, ...obraCaso,
});
const RPC_DEF = { certapp_beta_apuntar: true, certapp_consumir_credito_obra: 1, certapp_devolver_credito_obra: 2 };

/** ¿Cumple la fila los filtros de la consulta? (`.eq('estado','BORRADOR')` en un update condicional) */
const cuadra = (fila, filtros) => Object.entries(filtros).every(([k, v]) => (fila[k] ?? null) === (v ?? null));

function respuesta(op, unico) {
    const { tabla, filtros } = op;
    if (caida && tabla.startsWith('certapp_')) return { data: null, error: { message: 'connection refused (simulada)' } };
    if (tabla === 'usuarios') {
        return ROLES[ultimoToken]
            ? { data: { id_usuario: 'u-1', id_rol: 1, activo: true, roles: { nombre_rol: ROLES[ultimoToken] } }, error: null }
            : { data: null, error: null };   // el certificador externo NO es un `usuarios`
    }
    if (tabla === 'certapp_cuentas') {
        const c = filtros.auth_user_id === CUENTA.auth_user_id || filtros.id === CUENTA.id || filtros.email === CUENTA.email ? CUENTA : null;
        return { data: unico ? c : (c ? [c] : []), error: null };
    }
    if (tabla === 'certapp_obras') {
        // La obra SUYA solo aparece si se pide con su cuenta (obraDeLaCuenta) o por id,
        // y si cuadran los demás filtros (los updates condicionales).
        const o = obraBase();
        let obra = filtros.id === OBRA_SUYA && cuadra(o, filtros) ? o : null;
        if (obra && op.tipo === 'update') obra = { ...obra, ...op.payload };
        return { data: unico ? obra : (obra ? [obra] : []), error: null };
    }
    return { data: unico ? null : [], error: null, count: 0 };
}

function qb(tabla) {
    const op = { tabla, tipo: 'select', filtros: {}, payload: null, cols: null };
    ops.push(op);
    const p = new Proxy({}, {
        get(_, k) {
            if (k === 'then') return (ok, ko) => Promise.resolve(respuesta(op, false)).then(ok, ko);
            if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve(respuesta(op, true));
            if (k === 'eq' || k === 'is') return (col, val) => { op.filtros[col] = val; return p; };
            if (['update', 'insert', 'upsert', 'delete'].includes(k)) return (payload) => { op.tipo = k; op.payload = payload ?? null; return p; };
            if (k === 'select') return (cols) => { if (op.tipo === 'select') op.cols = cols; return p; };
            return () => p;
        },
    });
    return p;
}
function rpc(nombre, args) {
    ops.push({ tabla: 'rpc', tipo: nombre, payload: args });
    const v = nombre in rpcCaso ? rpcCaso[nombre] : RPC_DEF[nombre];
    const r = caida ? { data: null, error: { message: 'connection refused (simulada)' } } : { data: typeof v === 'function' ? v(args) : (v ?? null), error: null };
    const p = new Proxy({}, {
        get(_, k) {
            if (k === 'then') return (ok, ko) => Promise.resolve(r).then(ok, ko);
            return () => p;
        },
    });
    return p;
}
const fake = {
    auth: {
        getUser: async (t) => {
            ultimoToken = t;
            if (ROLES[t] || t === 'tok-ext') return { data: { user: { id: `a-${t}`, email: `${t}@x.es`, app_metadata: {} } }, error: null };
            return { data: { user: null }, error: { message: 'token malo' } };
        },
        admin: {},
    },
    from: (t) => qb(t),
    rpc,
    storage: { from: () => qb('st') },
};
const sc = require.resolve(path.join(B, 'services/supabaseClient.js'));
require.cache[sc] = { id: sc, filename: sc, loaded: true, exports: fake };

// Drive simulado para /fichero y /thumb: lo que «hay» en Drive.
const driveCert = require(path.join(B, 'services/certapp/drive'));
const FICHEROS = {
    'fich-svg-000001': { mimeType: 'image/svg+xml', name: 'malo.svg', contenido: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.domain)</script></svg>' },
    'fich-html-00001': { mimeType: 'text/html', name: 'malo.html', contenido: '<script>alert(1)</script>' },
    'fich-pdf-000001': { mimeType: 'application/pdf', name: 'CEE.pdf', contenido: '%PDF-1.4\n%prueba' },
    'fich-cex-000001': { mimeType: 'application/octet-stream', name: '2026EXT_1 - CEE.cex', contenido: "S'CE3Xv3.2 Residencial'\np0\n." },
};
driveCert.abrirFichero = async (id) => {
    const f = FICHEROS[id];
    if (!f) return null;
    const buf = Buffer.from(f.contenido);
    return { meta: { mimeType: f.mimeType, name: f.name, size: buf.length }, stream: Readable.from([buf]) };
};
const JPG = Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.alloc(60, 0)]);
driveCert.miniatura = async (id) => ({
    'mini-svg-000001': { buf: Buffer.from('<svg/>'), type: 'image/svg+xml' },
    'mini-jpg-000001': { buf: JPG, type: 'image/jpeg' },
}[id] || null);

const tokens = require(path.join(B, 'services/certapp/tokens'));
const express = require(path.join(B, 'node_modules/express'));
const app = express();
app.use(express.json());
app.use('/api/public/certapp', require(path.join(B, 'routes/certappPublic')));
app.use('/api/certapp', require(path.join(B, 'routes/certapp')));
app.use('/api/certapp-admin', require(path.join(B, 'routes/certappAdmin')));

const FORM_OK = () => tokens.firmarFormulario(Date.now() - 10_000);   // pedido hace 10 s
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(document.cookie)"><script>alert(1)</script></svg>';
const CEX = "S'CEXv2.3 Residencial'\np0\n(dp1\n.";
const opsDe = (ctx, tabla, tipo) => ctx.ops.filter(o => o.tabla === tabla && (!tipo || o.tipo === tipo));
const llamada = (ctx, nombre) => ctx.ops.find(o => o.tabla === 'rpc' && o.tipo === nombre);

const srv = app.listen(0, async () => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    const casos = [];
    const q = (quien, metodo, ruta, esperado, body, extra = {}) => casos.push({ quien, metodo, ruta, esperado, body, ...extra });

    // Todas las rutas del certificador y del admin, sin sesión → 401
    const DEL_CERTIFICADOR = [
        ['GET', '/me'], ['PUT', '/me'], ['GET', '/obras'], ['POST', '/obras'], ['GET', `/obras/${OBRA_SUYA}`], ['PUT', `/obras/${OBRA_SUYA}`],
        ['POST', `/obras/${OBRA_SUYA}/catastro`], ['GET', `/obras/${OBRA_SUYA}/docs`], ['POST', `/obras/${OBRA_SUYA}/docs/FOTO_CALDERA`],
        ['DELETE', `/obras/${OBRA_SUYA}/docs/FOTO_CALDERA/abcdefghijkl`], ['POST', `/obras/${OBRA_SUYA}/enlace-cliente`],
        ['POST', `/obras/${OBRA_SUYA}/enlace-cliente/rotar`],
        ['GET', `/obras/${OBRA_SUYA}/barrido`], ['POST', `/obras/${OBRA_SUYA}/generar`], ['POST', `/obras/${OBRA_SUYA}/validar`],
        ['POST', `/obras/${OBRA_SUYA}/revisar-de-nuevo`], ['POST', '/feedback'], ['POST', '/asistente'], ['GET', '/asistente/cupo'],
    ];
    const DEL_ADMIN = [
        ['GET', '/resumen'], ['GET', '/beta'], ['GET', `/beta/${OBRA_SUYA}`], ['PATCH', `/beta/${OBRA_SUYA}`], ['POST', `/beta/${OBRA_SUYA}/invitar`],
        ['GET', '/cuentas'], ['POST', '/cuentas'], ['PATCH', `/cuentas/${CUENTA.id}`], ['GET', '/obras'], ['GET', `/obras/${OBRA_SUYA}`],
        ['POST', `/obras/${OBRA_SUYA}/pedir-ia`], ['POST', `/obras/${OBRA_SUYA}/entregar`], ['POST', `/obras/${OBRA_SUYA}/devolver-credito`],
        ['POST', `/obras/${OBRA_SUYA}/enlace-cliente/rotar`], ['GET', '/feedback'], ['PATCH', `/feedback/${OBRA_SUYA}`],
    ];
    for (const [m, r] of DEL_CERTIFICADOR) q('anónimo', m, `/api/certapp${r}`, 401, {});
    for (const [m, r] of DEL_ADMIN) q('anónimo', m, `/api/certapp-admin${r}`, 401, {});
    q('tok-malo', 'GET', '/api/certapp/obras', 401);

    // Un usuario del CRM sin cuenta de la app no entra en la del certificador
    for (const t of ['tok-trab', 'tok-partner', 'tok-admin']) q(t, 'GET', '/api/certapp/obras', 403);
    q('tok-trab', 'GET', '/api/certapp/me', 403);
    q('tok-admin', 'GET', '/api/certapp/me', 200, null, { cuerpo: (j) => j.esAdmin === true && j.cuenta === null });

    // El certificador: lo suyo sí, lo ajeno 404, el admin 403
    q('tok-ext', 'GET', '/api/certapp/me', 200, null, { cuerpo: (j) => j.esAdmin === false && j.cuenta?.id === CUENTA.id && !('auth_user_id' in j.cuenta) && !('prefs' in j.cuenta) });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_AJENA}`, 404);
    q('tok-ext', 'PUT', `/api/certapp/obras/${OBRA_AJENA}`, 404, { titular: { nombre: 'X' } });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_AJENA}/docs`, 404);
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/generar`, 404, {});
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/enlace-cliente`, 404, {});
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/enlace-cliente/rotar`, 404, {});
    q('tok-ext', 'DELETE', `/api/certapp/obras/${OBRA_AJENA}/docs/FOTO_CALDERA/abcdefghijkl`, 404);
    q('tok-ext', 'GET', '/api/certapp/obras/no-es-un-uuid', 404);
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/docs/FOTO_CALDERA`, 404, null, { multipart: true });
    q('tok-ext', 'POST', '/api/certapp/feedback', 404, { texto: 'hola', obra_id: OBRA_AJENA });
    q('tok-ext', 'POST', '/api/certapp/asistente', 503, { mensajes: [{ role: 'user', content: 'hola' }] }, { cuerpo: (j) => j.code === 'ASISTENTE_APAGADO' });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_SUYA}/barrido`, 200, null, { cuerpo: (j) => j.listo === false && Array.isArray(j.bloqueantes) });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/generar`, 422, {}, { cuerpo: (j) => j.code === 'BARRIDO' && j.barrido?.bloqueantes?.length > 0 });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/generar`, 409, {}, { obra: { estado: 'EN_PREPARACION' }, cuerpo: (j) => j.code === 'YA_PEDIDO' });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/validar`, 409, {});
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/docs/NO_EXISTE`, 400, null, { multipart: true, cuerpo: (j) => j.code === 'SLOT_DESCONOCIDO' });
    for (const [m, r] of DEL_ADMIN) q('tok-ext', m, `/api/certapp-admin${r}`, 403, {});
    for (const t of ['tok-trab', 'tok-partner']) q(t, 'GET', '/api/certapp-admin/resumen', 403);

    // Los eventos que ve el certificador: sin quién del equipo ni la nota interna (#8)
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_SUYA}`, 200, null, {
        cuerpo: (j, ctx) => j.revisiones?.max === 2 && !('portal_token' in j.obra) && !('portal_token_at' in j.obra)
            && opsDe(ctx, 'certapp_eventos').every(o => !/nota_interna|por_detalle/.test(o.cols || '')),
    });

    // #1 — el tipo sale de los BYTES: un SVG (o HTML) con nombre y tipo de JPEG no entra
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/docs/FOTO_FACHADA_PRINCIPAL`, 400, null, {
        multipart: { nombre: 'fachada.jpg', tipo: 'image/jpeg', contenido: SVG }, cuerpo: (j) => j.code === 'TIPO_NO_ADMITIDO' && j.rechazados?.length === 1,
    });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/docs/DOC_PLANOS`, 400, null, {
        multipart: { nombre: 'plano.pdf', tipo: 'application/pdf', contenido: '<html><script>alert(1)</script></html>' }, cuerpo: (j) => j.code === 'TIPO_NO_ADMITIDO',
    });

    // #1 — /fichero: Content-Type de la lista, attachment si no es imagen/PDF, nosniff y CSP sandbox SIEMPRE
    const seguras = (h) => h.get('x-content-type-options') === 'nosniff' && /default-src 'none'/.test(h.get('content-security-policy') || '') && /sandbox/.test(h.get('content-security-policy') || '');
    const urlFichero = (id, t = tokens.firmarFichero(OBRA_SUYA, id)) => `/api/public/certapp/fichero/${OBRA_SUYA}/${id}?t=${encodeURIComponent(t)}`;
    const urlThumb = (id, t = tokens.firmarMiniatura(OBRA_SUYA, id)) => `/api/public/certapp/thumb/${OBRA_SUYA}/${id}?t=${encodeURIComponent(t)}`;
    q('anónimo', 'GET', urlFichero('fich-svg-000001'), 200, null, { cabeceras: (h) => h.get('content-type') === 'application/octet-stream' && /^attachment;/.test(h.get('content-disposition') || '') && seguras(h) });
    q('anónimo', 'GET', urlFichero('fich-html-00001'), 200, null, { cabeceras: (h) => h.get('content-type') === 'application/octet-stream' && /^attachment;/.test(h.get('content-disposition') || '') && seguras(h) });
    q('anónimo', 'GET', urlFichero('fich-cex-000001'), 200, null, { cabeceras: (h) => h.get('content-type') === 'application/octet-stream' && /^attachment;/.test(h.get('content-disposition') || '') && seguras(h) });
    q('anónimo', 'GET', urlFichero('fich-pdf-000001'), 200, null, { cabeceras: (h) => h.get('content-type') === 'application/pdf' && /^inline;/.test(h.get('content-disposition') || '') && seguras(h) });
    q('anónimo', 'GET', urlThumb('mini-jpg-000001'), 200, null, { cabeceras: (h) => h.get('content-type') === 'image/jpeg' && seguras(h) });
    q('anónimo', 'GET', urlThumb('mini-svg-000001'), 404);   // una «miniatura» que no es jpeg/png/webp no se sirve
    // #6 — la firma de la miniatura no vale para el fichero (ni al revés)
    q('anónimo', 'GET', urlFichero('fich-pdf-000001', tokens.firmarMiniatura(OBRA_SUYA, 'fich-pdf-000001')), 403, null, { cuerpo: (j) => j.code === 'ENLACE_CADUCADO' });
    q('anónimo', 'GET', urlThumb('mini-jpg-000001', tokens.firmarFichero(OBRA_SUYA, 'mini-jpg-000001')), 403);

    // #2-B — pedida la obra, la vivienda, el titular y el cuestionario se congelan
    q('tok-ext', 'PUT', `/api/certapp/obras/${OBRA_SUYA}`, 409, { titular: { nombre: 'Otro titular' } }, {
        obra: { estado: 'EN_PREPARACION' }, cuerpo: (j, ctx) => j.code === 'OBRA_CERRADA' && !opsDe(ctx, 'certapp_obras', 'update').length,
    });
    q('tok-ext', 'PUT', `/api/certapp/obras/${OBRA_SUYA}`, 409, { cuestionario: { calefaccion: 'gasoleo' } }, { obra: { estado: 'LISTO' }, cuerpo: (j) => j.code === 'OBRA_CERRADA' });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/catastro`, 409, { rc: '1234567VK1234N0001AB' }, { obra: { estado: 'VALIDADO' }, cuerpo: (j) => j.code === 'OBRA_CERRADA' });
    q('tok-ext', 'PUT', `/api/certapp/obras/${OBRA_SUYA}`, 200, { titular: { nombre: 'Ana' } }, {
        cuerpo: (j, ctx) => opsDe(ctx, 'certapp_obras', 'update').some(o => o.filtros.estado === 'BORRADOR'),   // el update es condicional
    });
    // #2-B — «revisar de nuevo»: máximo 2 por obra, y sin cambiar datos
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/revisar-de-nuevo`, 409, { nota: 'otra vez' }, {
        obra: { estado: 'LISTO', revisiones: 2 }, cuerpo: (j, ctx) => j.code === 'SIN_REVISIONES' && j.revisiones?.max === 2 && !opsDe(ctx, 'certapp_obras', 'update').length,
    });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/revisar-de-nuevo`, 200, { nota: 'he cambiado una ventana' }, {
        obra: { estado: 'VALIDADO', revisiones: 1 },
        cuerpo: (j, ctx) => {
            const u = opsDe(ctx, 'certapp_obras', 'update');
            return j.revisiones?.hechas === 2 && u.length === 1 && u[0].payload.revisiones === 2 && u[0].filtros.revisiones === 1
                && Object.keys(u[0].payload).sort().join(',') === 'estado,pedido_at,revisiones';
        },
    });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/revisar-de-nuevo`, 409, {}, { cuerpo: (j) => j.code === 'ESTADO_NO_REVISABLE' });

    // #6 — el enlace del propietario: el vigente se reutiliza; caducado o rotado, uno nuevo
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/enlace-cliente`, 200, {}, {
        cuerpo: (j, ctx) => j.url.includes(TOKEN_PORTAL) && j.caduca_at && !opsDe(ctx, 'certapp_obras', 'update').length,
    });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/enlace-cliente`, 200, {}, {
        obra: { portal_token_at: hace(40) }, cuerpo: (j) => j.url && !j.url.includes(TOKEN_PORTAL) && Date.parse(j.caduca_at) > Date.now() + 29 * 86400000,
    });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/enlace-cliente/rotar`, 200, {}, { cuerpo: (j) => j.url && !j.url.includes(TOKEN_PORTAL) && j.caduca_at });
    q('tok-admin', 'POST', `/api/certapp-admin/obras/${OBRA_SUYA}/enlace-cliente/rotar`, 200, {}, { cuerpo: (j) => j.url && !j.url.includes(TOKEN_PORTAL) });

    // #8 — devolver el crédito: ligado a la obra, una sola vez
    q('tok-admin', 'POST', `/api/certapp-admin/obras/${OBRA_SUYA}/devolver-credito`, 409, { motivo: 'la IA falló' }, {
        cuerpo: (j, ctx) => j.code === 'SIN_CREDITO_GASTADO' && !llamada(ctx, 'certapp_devolver_credito_obra'),
    });
    q('tok-admin', 'POST', `/api/certapp-admin/obras/${OBRA_SUYA}/devolver-credito`, 409, { motivo: 'doble clic' }, {
        obra: { credito_consumido: true }, rpc: { certapp_devolver_credito_obra: -2 }, cuerpo: (j) => j.code === 'SIN_CREDITO_GASTADO',
    });
    q('tok-admin', 'POST', `/api/certapp-admin/obras/${OBRA_SUYA}/devolver-credito`, 200, { motivo: 'la IA falló' }, {
        obra: { credito_consumido: true, estado: 'EN_PREPARACION' }, rpc: { certapp_devolver_credito_obra: 3 },
        cuerpo: (j, ctx) => {
            const r = llamada(ctx, 'certapp_devolver_credito_obra')?.payload || {};
            return j.creditos === 3 && r.p_obra_id === OBRA_SUYA && r.p_por === 'BROKERGY' && r.p_nota_interna === 'la IA falló' && r.p_por_detalle
                && !ctx.ops.some(o => o.tabla === 'rpc' && /^certapp_(consumir|devolver)_credito$/.test(o.tipo));
        },
    });

    // Lo público valida lo suyo
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, { web: 'soy-un-bot', nombre: 'x', email: 'x@y.es' }, { cuerpo: (j) => j.ok === true });
    q('anónimo', 'GET', '/api/public/certapp/beta/token', 200, null, { cuerpo: (j) => /^\d+\.[0-9a-f]{16}\.[0-9a-f]{32}$/.test(j.token || '') });
    // #3 — form_token: sin él, recién pedido (bot), caducado o inventado → 400 FORM_TOKEN
    const ANA = { nombre: 'Ana', email: 'ana@y.es', consentimiento: true };
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, ANA, { cuerpo: (j, ctx) => j.code === 'FORM_TOKEN' && j.motivo === 'formato' && !llamada(ctx, 'certapp_beta_apuntar') });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: tokens.firmarFormulario() }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'pronto' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: tokens.firmarFormulario(Date.now() - 3 * 3600_000) }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'caducado' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: FORM_OK().replace(/[0-9a-f]{32}$/, 'f'.repeat(32)) }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'firma' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ nombre: 'Ana', email: 'no-es-email', consentimiento: true, form_token: FORM_OK() }), { cuerpo: (j) => j.code === 'EMAIL_INVALIDO' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ nombre: 'Ana', email: 'ana@y.es', form_token: FORM_OK() }), { cuerpo: (j) => j.code === 'FALTA_CONSENTIMIENTO' });
    // #3/#4 — alta nueva y solicitud existente: la MISMA respuesta, y la existente no se pisa desde aquí
    const FORM_UNO = FORM_OK();
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, { ...ANA, nombre: 'Ana <a href="https://malo.es">pincha</a>', form_token: FORM_UNO, web: '' }, {
        rpc: { certapp_beta_apuntar: true }, texto: '{"ok":true}',
        cuerpo: (j, ctx) => {
            const f = llamada(ctx, 'certapp_beta_apuntar')?.payload?.p_fila || {};
            return f.email === 'ana@y.es' && !/[<>:/]/.test(f.nombre) && !('form_token' in (f.respuestas || {})) && !('web' in (f.respuestas || {}));
        },
    });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, { ...ANA, form_token: FORM_UNO }, { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'usado' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, () => ({ ...ANA, nombre: 'Suplantador', telefono: '699999999', form_token: FORM_OK() }), {
        rpc: { certapp_beta_apuntar: false }, texto: '{"ok":true}',
        // ya estaba: ni un insert/update directo a la tabla, ni avisos (ni siquiera se cuentan las altas)
        cuerpo: (j, ctx) => llamada(ctx, 'certapp_beta_apuntar') && !opsDe(ctx, 'certapp_beta_solicitudes').length,
    });
    // #3 — X-Forwarded-For inventado no salta el límite (6 envíos/hora por IP): manda la IP de verdad
    for (let i = 1; i <= 7; i++) {
        q('anónimo', 'POST', '/api/public/certapp/beta', i <= 6 ? 400 : 429, ANA, { sinRealIp: true, headers: { 'X-Forwarded-For': `203.0.113.${i}` } });
    }

    q('anónimo', 'POST', '/api/public/certapp/recuperar', 200, { email: 'no-existe@y.es' }, { cuerpo: (j) => j.ok === true });
    q('anónimo', 'POST', '/api/public/certapp/recuperar', 200, { email: 'basura' }, { cuerpo: (j) => j.ok === true });
    q('anónimo', 'GET', '/api/public/certapp/activar/basura', 400, null, { cuerpo: (j) => j.code === 'TOKEN_INVALIDO' });
    q('anónimo', 'POST', '/api/public/certapp/activar', 400, { token: 'basura', password: '12345678' });

    // El portal del propietario
    const PORTAL = `/api/public/certapp/subir/${OBRA_SUYA}`;
    q('anónimo', 'GET', `${PORTAL}?token=malo`, 404);
    q('anónimo', 'GET', PORTAL, 404);
    q('anónimo', 'GET', `${PORTAL}?token=${TOKEN_PORTAL}`, 200, null, {
        cuerpo: (j) => j.obra?.numero_expediente === '2026EXT_1' && Array.isArray(j.apartados) && !('portal_token' in j.obra) && Date.parse(j.obra.caduca_at) > Date.now(),
    });
    // #6 — caduca a los 30 días (y un token sin fecha no vale)
    q('anónimo', 'GET', `${PORTAL}?token=${TOKEN_PORTAL}`, 410, null, { obra: { portal_token_at: hace(31) }, cuerpo: (j) => j.code === 'ENLACE_CADUCADO' });
    q('anónimo', 'GET', `${PORTAL}?token=${TOKEN_PORTAL}`, 410, null, { obra: { portal_token_at: null }, cuerpo: (j) => j.code === 'ENLACE_CADUCADO' });
    q('anónimo', 'POST', `${PORTAL}/FOTO_FACHADA_PRINCIPAL?token=${TOKEN_PORTAL}`, 410, null, { obra: { portal_token_at: hace(31) }, multipart: true });
    // #6 — el propietario solo ve lo SUYO y los huecos que le tocan
    const SUBIDAS = {
        FOTO_FACHADA_PRINCIPAL: [
            { driveId: 'drv-cert-0000001', nombre: 'FACHADA PRINCIPAL 1.jpg', mime: 'image/jpeg', por: 'certificador' },
            { driveId: 'drv-clie-0000001', nombre: 'FACHADA PRINCIPAL 2.jpg', mime: 'image/jpeg', por: 'cliente' },
        ],
        FOTO_PLACA_CALDERA: [{ driveId: 'drv-cert-0000002', nombre: 'PLACA DE LA CALDERA 1.jpg', mime: 'image/jpeg', por: 'certificador' }],
    };
    q('anónimo', 'GET', `${PORTAL}?token=${TOKEN_PORTAL}`, 200, null, {
        obra: { cuestionario: { calefaccion: 'gas' }, documentacion: { reforma_uploads: SUBIDAS } },
        cuerpo: (j) => {
            const a = Object.fromEntries(j.apartados.map(x => [x.id, x]));
            return a.FOTO_FACHADA_PRINCIPAL?.ficheros.length === 1 && a.FOTO_FACHADA_PRINCIPAL.ficheros[0].driveId === 'drv-clie-0000001'
                && a.FOTO_PLACA_CALDERA?.cubierto === true && a.FOTO_PLACA_CALDERA.ficheros.length === 0;
        },
    });
    // #6 — no reemplaza lo del certificador; no sube a lo que no le toca; #7 — ni un .cex
    q('anónimo', 'POST', `${PORTAL}/FOTO_PLACA_CALDERA?token=${TOKEN_PORTAL}`, 409, null, {
        obra: { cuestionario: { calefaccion: 'gas' }, documentacion: { reforma_uploads: SUBIDAS } }, multipart: { nombre: 'placa.jpg', tipo: 'image/jpeg', contenido: JPG },
        cuerpo: (j) => j.code === 'YA_LO_TIENE_EL_CERTIFICADOR',
    });
    q('anónimo', 'POST', `${PORTAL}/FOTO_PLACA_CALDERA?token=${TOKEN_PORTAL}`, 400, null, {
        multipart: { nombre: 'placa.jpg', tipo: 'image/jpeg', contenido: JPG }, cuerpo: (j) => j.code === 'SLOT_NO_APLICA',
    });
    q('anónimo', 'POST', `${PORTAL}/DOC_CEE_EXISTENTE?token=${TOKEN_PORTAL}`, 400, null, {
        multipart: { nombre: 'cee.cex', tipo: 'application/octet-stream', contenido: CEX }, cuerpo: (j) => j.code === 'TIPO_NO_ADMITIDO',
    });
    q('anónimo', 'POST', `${PORTAL}/FOTO_CALDERA?token=malo`, 404, null, { multipart: true });
    q('anónimo', 'GET', `/api/public/certapp/thumb/${OBRA_SUYA}/abcdefghijkl?t=123.abc`, 403);
    q('anónimo', 'GET', `/api/public/certapp/fichero/${OBRA_SUYA}/abcdefghijkl`, 403);

    // BD caída → 503, nunca una lista vacía
    q('tok-ext', 'GET', '/api/certapp/obras', 503, null, { caida: true });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_SUYA}`, 503, null, { caida: true });
    q('tok-admin', 'GET', '/api/certapp-admin/obras', 503, null, { caida: true });
    q('anónimo', 'GET', `${PORTAL}?token=x`, 503, null, { caida: true });

    let fallos = 0;
    for (const [i, c] of casos.entries()) {
        caida = !!c.caida;
        obraCaso = c.obra || {};
        rpcCaso = c.rpc || {};
        ops = [];
        const h = { ...(c.headers || {}) };
        // Cada caso, su IP (como la pone nginx): así los límites de un caso no tocan a otro.
        if (!c.sinRealIp) h['X-Real-IP'] = `10.77.${Math.floor(i / 250)}.${(i % 250) + 1}`;
        if (c.quien.startsWith('tok-')) h.Authorization = `Bearer ${c.quien}`;
        let body;
        const cuerpoPedido = typeof c.body === 'function' ? c.body() : c.body;
        if (c.multipart) {
            const m = c.multipart === true ? { nombre: 'foto.jpg', tipo: 'image/jpeg', contenido: Buffer.alloc(1024, 1) } : c.multipart;
            const fd = new FormData();
            fd.append('files', new Blob([Buffer.isBuffer(m.contenido) ? m.contenido : Buffer.from(m.contenido)], { type: m.tipo }), m.nombre);
            body = fd;
        } else if (cuerpoPedido && c.metodo !== 'GET') {
            h['Content-Type'] = 'application/json';
            body = JSON.stringify(cuerpoPedido);
        }
        const r = await fetch(base + c.ruta, { method: c.metodo, headers: h, body });
        const txt = await r.text();
        let j = null;
        try { j = JSON.parse(txt); } catch { /* sin cuerpo JSON (un fichero) */ }
        const ctx = { ops, headers: r.headers };
        const okStatus = r.status === c.esperado;
        let okCuerpo = true;
        try {
            okCuerpo = (!c.cuerpo || (j && c.cuerpo(j, ctx))) && (!c.cabeceras || c.cabeceras(r.headers)) && (!c.texto || txt === c.texto);
        } catch (e) { okCuerpo = false; console.error(e); }
        const ok = okStatus && !!okCuerpo;
        if (!ok) fallos++;
        console.log(`${ok ? '✓' : '✗'} ${c.quien.padEnd(11)} ${c.metodo.padEnd(6)} ${c.ruta.slice(0, 78).padEnd(78)} → ${r.status}${ok ? '' : `  (esperaba ${c.esperado}${okStatus ? ', cuerpo distinto' : ''}) ${txt.slice(0, 160)}`}`);
    }
    console.log(`\n${casos.length - fallos}/${casos.length} correctas`);
    srv.close();
    process.exit(fallos ? 1 : 0);
});
