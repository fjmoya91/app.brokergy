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
// Y el alta directa (24/10/2026): el formulario crea la cuenta (por email, sin
// copiar el teléfono; con Google, con el email de la sesión), /enlace y
// /enlace/canjear (entrar sin contraseña) y POST /api/certapp/alta.
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
const FB_SUYA = 'f0000000-0000-4000-8000-000000000001';   // una incidencia del certificador
const ROLES = { 'tok-admin': 'ADMIN', 'tok-trab': 'TRABAJADOR', 'tok-partner': 'INSTALADOR' };
const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
let ultimoToken = null;

// Estado del caso en curso: la obra (con lo que cambie el caso), lo que devuelven
// las RPC y el registro de lo que se ha pedido a la «BD».
let caida = false;
let obraCaso = {};
let rpcCaso = {};
let fbCaso = {};
let ctaCaso = {};
let ops = [];

const movBase = () => [
    { id: 2, created_at: hace(1), cuenta_id: CUENTA.id, obra_id: OBRA_SUYA, tipo: 'GASTO', creditos: -1, saldo_despues: 2, importe_eur: null,
        concepto: 'Certificado pedido', por: 'certificador', factura_id: null,
        obra: { id: OBRA_SUYA, numero_expediente: '2026EXT_1', direccion: 'CL MAYOR 1', municipio: 'TOLEDO' } },
    { id: 1, created_at: hace(3), cuenta_id: CUENTA.id, obra_id: null, tipo: 'ALTA', creditos: 3, saldo_despues: 3, importe_eur: null,
        concepto: 'Certificados de regalo de la beta', por: 'fran@brokergy.es', factura_id: null, obra: null },
];

const fbBase = () => ({
    id: FB_SUYA, created_at: hace(1), cuenta_id: CUENTA.id, obra_id: OBRA_SUYA, tipo: 'ERROR', texto: 'La fachada trasera sale al norte',
    pantalla: '/obra/x', user_agent: 'ua', estado: 'NUEVA', respuesta: null, respuesta_at: null, respuesta_por: null,
    obra: { numero_expediente: '2026EXT_1' }, cuenta: { id: CUENTA.id, email: CUENTA.email }, ...fbCaso,
});

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
        // Un alta: devuelve lo insertado (con su id), como la BD.
        if (op.tipo === 'insert') {
            const nueva = { id: 'c0000000-0000-4000-8000-0000000000aa', creditos: 0, ...op.payload };
            return { data: unico ? nueva : [nueva], error: null };
        }
        const suya = filtros.auth_user_id === CUENTA.auth_user_id || filtros.id === CUENTA.id || filtros.email === CUENTA.email;
        // Un update condicionado al saldo (`.eq('creditos', n)`) solo cuadra con el saldo de la cuenta;
        // `cta.carrera`: entre la lectura y el update ha gastado uno (el update no encuentra la fila).
        let c = suya && (!('creditos' in filtros) || filtros.creditos === CUENTA.creditos) ? CUENTA : null;
        if (c && op.tipo === 'update') c = ctaCaso.carrera && 'creditos' in filtros ? null : { ...c, ...op.payload };
        return { data: unico ? c : (c ? [c] : []), error: null };
    }
    if (tabla === 'certapp_movimientos') {
        // Los de la cuenta (con `por`, que la API NO debe devolver); ninguna COMPRA en la beta.
        if (op.tipo === 'insert') return { data: unico ? { id: 99, ...op.payload } : [{ id: 99, ...op.payload }], error: null };
        const filas = filtros.cuenta_id === CUENTA.id && !filtros.tipo ? movBase() : [];
        return { data: unico ? (filas[0] || null) : filas, error: null };
    }
    if (tabla === 'certapp_obras') {
        // La obra SUYA solo aparece si se pide con su cuenta (obraDeLaCuenta) o por id,
        // y si cuadran los demás filtros (los updates condicionales).
        const o = obraBase();
        let obra = filtros.id === OBRA_SUYA && cuadra(o, filtros) ? o : null;
        if (obra && op.tipo === 'update') obra = { ...obra, ...op.payload };
        return { data: unico ? obra : (obra ? [obra] : []), error: null };
    }
    if (tabla === 'certapp_feedback') {
        // La incidencia FB_SUYA: por id (admin) o en el listado SOLO si se pide con su cuenta.
        const f = fbBase();
        let filas;
        if (op.tipo === 'insert') filas = [{ ...f, id: 'f0000000-0000-4000-8000-0000000000ff', estado: 'NUEVA', ...op.payload }];
        else if (filtros.id !== undefined) filas = filtros.id === FB_SUYA ? [op.tipo === 'update' ? { ...f, ...op.payload } : f] : [];
        else filas = filtros.cuenta_id === CUENTA.id && (!('obra_id' in filtros) || filtros.obra_id === f.obra_id) ? [f] : [];
        return { data: unico ? (filas[0] || null) : filas, error: null };
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
            // tok-google: sesión de Google SIN cuenta en la app · tok-sinconf: con el email sin confirmar
            if (ROLES[t] || ['tok-ext', 'tok-google', 'tok-sinconf'].includes(t)) return { data: { user: { id: `a-${t}`, email: `${t}@x.es`, app_metadata: {} } }, error: null };
            return { data: { user: null }, error: { message: 'token malo' } };
        },
        admin: {
            createUser: async (p) => { ops.push({ tabla: 'auth', tipo: 'createUser', payload: p }); return { data: { user: { id: `a-nuevo-${p.email}` } }, error: null }; },
            getUserById: async (id) => {
                ops.push({ tabla: 'auth', tipo: 'getUserById', payload: id });
                const email = id === CUENTA.auth_user_id ? CUENTA.email : `${String(id).replace(/^a-/, '')}@x.es`;
                return { data: { user: { id, email, email_confirmed_at: id === 'a-tok-sinconf' ? null : hace(1), app_metadata: { provider: 'google', providers: ['google'] } } }, error: null };
            },
            generateLink: async (p) => { ops.push({ tabla: 'auth', tipo: 'generateLink', payload: p }); return { data: { properties: { hashed_token: 'hash-de-prueba' } }, error: null }; },
            deleteUser: async () => ({ error: null }),
            listUsers: async () => ({ data: { users: [] }, error: null }),
        },
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
app.use('/api/certapp/alta', require(path.join(B, 'routes/certappAlta')));
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
        ['POST', `/obras/${OBRA_SUYA}/revisar-de-nuevo`], ['POST', '/feedback'], ['GET', '/feedback'], ['GET', '/movimientos'], ['POST', '/asistente'], ['GET', '/asistente/cupo'],
        ['POST', `/obras/${OBRA_SUYA}/visto-ia`], ['GET', '/municipios?prov=13'],
        ['GET', `/obras/${OBRA_SUYA}/cee/para-firmar`], ['POST', `/obras/${OBRA_SUYA}/cee/firmado`], ['POST', `/obras/${OBRA_SUYA}/cee/definitivo`],
    ];
    const DEL_ADMIN = [
        ['GET', '/resumen'], ['GET', '/beta'], ['GET', `/beta/${OBRA_SUYA}`], ['PATCH', `/beta/${OBRA_SUYA}`], ['POST', `/beta/${OBRA_SUYA}/invitar`],
        ['GET', '/cuentas'], ['POST', '/cuentas'], ['PATCH', `/cuentas/${CUENTA.id}`], ['GET', '/obras'], ['GET', `/obras/${OBRA_SUYA}`],
        ['POST', `/obras/${OBRA_SUYA}/pedir-ia`], ['POST', `/obras/${OBRA_SUYA}/entregar`], ['POST', `/obras/${OBRA_SUYA}/devolver-credito`],
        ['POST', `/obras/${OBRA_SUYA}/enlace-cliente/rotar`], ['GET', '/feedback'], ['PATCH', `/feedback/${OBRA_SUYA}`], ['PUT', `/feedback/${FB_SUYA}`],
        ['POST', '/interno/calificada'],
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
    // «Lo que ha visto la IA» (25/10/2026): obra ajena 404; pedida, 409 (antes de mirar nada)
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/visto-ia`, 404, {});
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/visto-ia`, 409, {}, { obra: { estado: 'EN_PREPARACION' }, cuerpo: (j) => j.code === 'OBRA_CERRADA' });
    q('tok-ext', 'GET', '/api/certapp/municipios?prov=99', 400, null, { cuerpo: (j) => j.code === 'PROVINCIA_INVALIDA' });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_SUYA}/barrido`, 200, null, { cuerpo: (j) => j.listo === false && Array.isArray(j.bloqueantes) });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/generar`, 422, {}, { cuerpo: (j) => j.code === 'BARRIDO' && j.barrido?.bloqueantes?.length > 0 });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/generar`, 409, {}, { obra: { estado: 'EN_PREPARACION' }, cuerpo: (j) => j.code === 'YA_PEDIDO' });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/validar`, 409, {});
    // Firma y definitivo (25/10/2026): obra ajena 404 (también antes de recibir el fichero); sin entregar, 409
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_AJENA}/cee/para-firmar`, 404);
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/cee/firmado`, 404, null, { multipart: true });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_AJENA}/cee/definitivo`, 404, null, { multipart: true });
    q('tok-ext', 'GET', `/api/certapp/obras/${OBRA_SUYA}/cee/para-firmar`, 409, null, { cuerpo: (j) => j.code === 'ESTADO_NO_FIRMABLE' });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/cee/firmado`, 409, {}, { cuerpo: (j) => j.code === 'ESTADO_NO_FIRMABLE' });
    q('tok-ext', 'POST', `/api/certapp/obras/${OBRA_SUYA}/cee/definitivo`, 409, {}, { cuerpo: (j) => j.code === 'ESTADO_NO_FIRMABLE' });
    q('tok-trab', 'POST', '/api/certapp-admin/interno/calificada', 403, { numero: '2026EXT_1' });
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

    // Incidencias (24/10/2026): el certificador ve SOLO las suyas, sin lo interno; una obra ajena es 404
    const SIN_INTERNO = (i) => i && !('respuesta_por' in i) && !('user_agent' in i) && !('pantalla' in i) && !('cuenta_id' in i) && !('cuenta' in i);
    const consultaFb = (ctx) => opsDe(ctx, 'certapp_feedback', 'select')[0] || {};
    q('tok-ext', 'GET', '/api/certapp/feedback', 200, null, {
        cuerpo: (j, ctx) => j.incidencias?.length === 1 && j.incidencias[0].numero_expediente === '2026EXT_1' && SIN_INTERNO(j.incidencias[0])
            && consultaFb(ctx).filtros?.cuenta_id === CUENTA.id && !/respuesta_por|user_agent|pantalla/.test(consultaFb(ctx).cols || ''),
    });
    q('tok-ext', 'GET', `/api/certapp/feedback?obra_id=${OBRA_SUYA}`, 200, null, {
        cuerpo: (j, ctx) => j.incidencias?.length === 1 && consultaFb(ctx).filtros?.obra_id === OBRA_SUYA && consultaFb(ctx).filtros?.cuenta_id === CUENTA.id,
    });
    q('tok-ext', 'GET', `/api/certapp/feedback?obra_id=${OBRA_AJENA}`, 404, null, { cuerpo: (j, ctx) => j.code === 'OBRA_NO_ENCONTRADA' && !opsDe(ctx, 'certapp_feedback').length });
    q('tok-ext', 'GET', '/api/certapp/feedback?obra_id=no-es-un-uuid', 404);
    q('tok-ext', 'GET', '/api/certapp/feedback', 503, null, { caida: true });
    q('tok-ext', 'POST', '/api/certapp/feedback', 201, { tipo: 'error', texto: 'La orientación sale mal', obra_id: OBRA_SUYA }, {
        cuerpo: (j, ctx) => {
            const ins = opsDe(ctx, 'certapp_feedback', 'insert')[0]?.payload || {};
            return ins.cuenta_id === CUENTA.id && ins.obra_id === OBRA_SUYA && ins.tipo === 'ERROR'
                && j.incidencia?.numero_expediente === '2026EXT_1' && j.incidencia.estado === 'NUEVA' && SIN_INTERNO(j.incidencia);
        },
    });
    q('tok-ext', 'POST', '/api/certapp/feedback', 400, { texto: '   ' }, { cuerpo: (j) => j.code === 'FALTA_TEXTO' });
    // El equipo responde: respuesta_at/por, NUEVA → VISTA y email al certificador (en seco aquí)
    const updFb = (ctx) => opsDe(ctx, 'certapp_feedback', 'update')[0]?.payload;
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${FB_SUYA}`, 200, { respuesta: 'Corregido: ya sale al sur.' }, {
        cuerpo: (j, ctx) => {
            const u = updFb(ctx) || {};
            return u.respuesta === 'Corregido: ya sale al sur.' && u.respuesta_at && u.respuesta_por && u.estado === 'VISTA'
                && j.feedback?.respuesta === 'Corregido: ya sale al sur.' && j.aviso?.seco === true;
        },
    });
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${FB_SUYA}`, 200, { respuesta: 'Resuelto', estado: 'HECHA', avisar: false }, {
        cuerpo: (j, ctx) => updFb(ctx)?.estado === 'HECHA' && j.aviso === null,
    });
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${FB_SUYA}`, 200, { respuesta: 'Ya está' }, {
        fb: { respuesta: 'Ya está', estado: 'HECHA' }, cuerpo: (j, ctx) => !updFb(ctx) && j.aviso === null,   // lo mismo: ni se escribe ni se avisa
    });
    q('tok-admin', 'PATCH', `/api/certapp-admin/feedback/${FB_SUYA}`, 200, { estado: 'descartada' }, { cuerpo: (j, ctx) => updFb(ctx)?.estado === 'DESCARTADA' && !('respuesta' in updFb(ctx)) && j.aviso === null });
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${FB_SUYA}`, 400, { estado: 'RARO' }, { cuerpo: (j) => j.code === 'ESTADO_INVALIDO' });
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${FB_SUYA}`, 400, {}, { cuerpo: (j) => j.code === 'SIN_CAMBIOS' });
    q('tok-admin', 'PUT', `/api/certapp-admin/feedback/${OBRA_AJENA}`, 404, { respuesta: 'x' });

    // Mis gastos (24/10/2026): SOLO los de su cuenta, sin `por`; las cifras del saldo de la cuenta
    const movs = (ctx) => opsDe(ctx, 'certapp_movimientos', 'select');
    q('tok-ext', 'GET', '/api/certapp/movimientos', 200, null, {
        cuerpo: (j, ctx) => {
            const r = j.resumen || {};
            const [g, a] = j.movimientos || [];
            return r.disponibles === 2 && r.usados === 0 && r.recibidos_gratis === 2 && r.gastado_eur === 0 && r.compras_abiertas === false
                && j.movimientos.length === 2 && g.tipo === 'GASTO' && g.creditos === -1 && g.obra?.numero_expediente === '2026EXT_1'
                && g.obra.direccion === 'CL MAYOR 1' && a.obra === null && j.movimientos.every(m => !('por' in m) && !('cuenta_id' in m))
                && movs(ctx).length === 2 && movs(ctx).every(o => o.filtros.cuenta_id === CUENTA.id && !/\bpor\b/.test(o.cols || ''));
        },
    });
    q('tok-ext', 'GET', '/api/certapp/movimientos', 503, null, { caida: true });
    q('tok-trab', 'GET', '/api/certapp/movimientos', 403);
    // El admin cambia los créditos a mano → AJUSTE por la diferencia, con el saldo leído como condición
    const insMov = (ctx) => opsDe(ctx, 'certapp_movimientos', 'insert')[0]?.payload;
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${CUENTA.id}`, 200, { creditos: 5 }, {
        cuerpo: (j, ctx) => {
            const m = insMov(ctx) || {};
            const u = opsDe(ctx, 'certapp_cuentas', 'update')[0] || {};
            return u.filtros?.creditos === 2 && u.payload?.creditos === 5 && m.tipo === 'AJUSTE' && m.creditos === 3 && m.saldo_despues === 5
                && m.cuenta_id === CUENTA.id && /3 certificados/.test(m.concepto) && m.por && j.movimiento?.creditos === 3;
        },
    });
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${CUENTA.id}`, 200, { creditos: 1, concepto: 'Uno de más por error' }, {
        cuerpo: (j, ctx) => insMov(ctx)?.creditos === -1 && insMov(ctx)?.concepto === 'Uno de más por error' && j.movimiento?.creditos === -1,
    });
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${CUENTA.id}`, 200, { creditos: 2 }, { cuerpo: (j, ctx) => !insMov(ctx) && j.movimiento === null });
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${CUENTA.id}`, 200, { estado: 'bloqueada' }, {
        cuerpo: (j, ctx) => !insMov(ctx) && !opsDe(ctx, 'certapp_cuentas', 'update')[0]?.filtros?.creditos && j.movimiento === null,
    });
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${CUENTA.id}`, 409, { creditos: 7 }, {
        cta: { carrera: true }, cuerpo: (j, ctx) => j.code === 'CREDITOS_CAMBIADOS' && !insMov(ctx),
    });
    q('tok-admin', 'PATCH', `/api/certapp-admin/cuentas/${OBRA_AJENA}`, 404, { creditos: 3 }, { cuerpo: (j, ctx) => !insMov(ctx) });

    // Lo público valida lo suyo
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, { web: 'soy-un-bot', nombre: 'x', email: 'x@y.es' }, { cuerpo: (j) => j.ok === true });
    q('anónimo', 'GET', '/api/public/certapp/beta/token', 200, null, { cuerpo: (j) => /^\d+\.[0-9a-f]{16}\.[0-9a-f]{32}$/.test(j.token || '') });
    // #3 — form_token: sin él, recién pedido (bot), caducado o inventado → 400 FORM_TOKEN
    const ANA = { nombre: 'Ana', email: 'ana@y.es', consentimiento: true, acepta_condiciones: true };
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, ANA, { cuerpo: (j, ctx) => j.code === 'FORM_TOKEN' && j.motivo === 'formato' && !llamada(ctx, 'certapp_beta_apuntar') });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: tokens.firmarFormulario() }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'pronto' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: tokens.firmarFormulario(Date.now() - 3 * 3600_000) }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'caducado' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ ...ANA, form_token: FORM_OK().replace(/[0-9a-f]{32}$/, 'f'.repeat(32)) }), { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'firma' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ nombre: 'Ana', email: 'no-es-email', consentimiento: true, form_token: FORM_OK() }), { cuerpo: (j) => j.code === 'EMAIL_INVALIDO' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ nombre: 'Ana', email: 'ana@y.es', form_token: FORM_OK() }), { cuerpo: (j) => j.code === 'FALTA_CONSENTIMIENTO' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, () => ({ nombre: 'Ana', email: 'ana@y.es', consentimiento: true, form_token: FORM_OK() }), { cuerpo: (j, ctx) => j.code === 'FALTA_CONDICIONES' && !llamada(ctx, 'certapp_beta_apuntar') });
    // #3/#4 — alta nueva y solicitud existente: la MISMA respuesta, y la existente no se pisa desde aquí
    const FORM_UNO = FORM_OK();
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, { ...ANA, nombre: 'Ana <a href="https://malo.es">pincha</a>', telefono: '600111222', form_token: FORM_UNO, web: '' }, {
        rpc: { certapp_beta_apuntar: true }, texto: '{"ok":true}',
        cuerpo: (j, ctx) => {
            const f = llamada(ctx, 'certapp_beta_apuntar')?.payload?.p_fila || {};
            // Alta directa: la cuenta PENDIENTE con 1 certificado, las condiciones y SIN el teléfono
            // del formulario (queda por confirmar); el usuario de Auth con ese email; el ALTA en «Mis gastos».
            const c = opsDe(ctx, 'certapp_cuentas', 'insert')[0]?.payload || {};
            const auth = opsDe(ctx, 'auth', 'createUser')[0]?.payload || {};
            const mov = opsDe(ctx, 'certapp_movimientos', 'insert')[0]?.payload || {};
            return f.email === 'ana@y.es' && !/[<>:/]/.test(f.nombre) && !('form_token' in (f.respuestas || {})) && !('web' in (f.respuestas || {}))
                && auth.email === 'ana@y.es' && c.email === 'ana@y.es' && c.estado === 'PENDIENTE' && c.creditos === 1 && c.telefono === null
                && c.prefs?.telefono_por_confirmar === '600111222' && c.prefs?.condiciones?.version && c.prefs?.alta?.via === 'email'
                && mov.tipo === 'ALTA' && mov.creditos === 1;
        },
    });
    q('anónimo', 'POST', '/api/public/certapp/beta', 400, { ...ANA, form_token: FORM_UNO }, { cuerpo: (j) => j.code === 'FORM_TOKEN' && j.motivo === 'usado' });
    q('anónimo', 'POST', '/api/public/certapp/beta', 200, () => ({ ...ANA, email: CUENTA.email, nombre: 'Suplantador', telefono: '699999999', form_token: FORM_OK() }), {
        rpc: { certapp_beta_apuntar: false }, texto: '{"ok":true}',
        // ya tenía solicitud y cuenta: la misma respuesta, sin tocar su cuenta ni su solicitud ni crear usuario
        cuerpo: (j, ctx) => llamada(ctx, 'certapp_beta_apuntar') && !opsDe(ctx, 'certapp_beta_solicitudes').some(o => o.tipo !== 'select')
            && !opsDe(ctx, 'certapp_cuentas').some(o => o.tipo !== 'select') && !opsDe(ctx, 'auth', 'createUser').length,
    });
    // #3 — X-Forwarded-For inventado no salta el límite (6 envíos/hora por IP): manda la IP de verdad
    for (let i = 1; i <= 7; i++) {
        q('anónimo', 'POST', '/api/public/certapp/beta', i <= 6 ? 400 : 429, ANA, { sinRealIp: true, headers: { 'X-Forwarded-For': `203.0.113.${i}` } });
    }

    // Entrar sin contraseña: /enlace responde siempre lo mismo; /enlace/canjear solo con un token `e` bueno
    q('anónimo', 'POST', '/api/public/certapp/enlace', 200, { email: 'no-existe@y.es' }, { texto: '{"ok":true}' });
    q('anónimo', 'POST', '/api/public/certapp/enlace', 200, { email: CUENTA.email }, { texto: '{"ok":true}' });
    q('anónimo', 'POST', '/api/public/certapp/enlace/canjear', 200, () => ({ token: tokens.firmarCuenta('e', CUENTA.id, CUENTA.prefs?.pwd_nonce) }), {
        cuerpo: (j, ctx) => j.token_hash === 'hash-de-prueba' && j.email === CUENTA.email
            && opsDe(ctx, 'auth', 'generateLink')[0]?.payload?.type === 'magiclink'
            && opsDe(ctx, 'certapp_cuentas', 'update').some(o => o.payload?.prefs?.pwd_nonce),   // se rota: un solo uso
    });
    q('anónimo', 'POST', '/api/public/certapp/enlace/canjear', 400, () => ({ token: tokens.firmarCuenta('a', CUENTA.id, CUENTA.prefs?.pwd_nonce) }), {
        cuerpo: (j, ctx) => j.code === 'TOKEN_INVALIDO' && !opsDe(ctx, 'auth', 'generateLink').length,   // el de activar no abre sesión
    });
    q('anónimo', 'POST', '/api/public/certapp/enlace/canjear', 410, () => ({ token: tokens.firmarCuenta('e', CUENTA.id, CUENTA.prefs?.pwd_nonce, -60_000) }), { cuerpo: (j) => j.code === 'TOKEN_CADUCADO' });
    q('anónimo', 'POST', '/api/public/certapp/enlace/canjear', 400, { token: 'basura' }, { cuerpo: (j) => j.code === 'TOKEN_INVALIDO' });
    q('anónimo', 'GET', `/api/public/certapp/activar/${tokens.firmarCuenta('e', CUENTA.id, CUENTA.prefs?.pwd_nonce)}`, 400, null, { cuerpo: (j) => j.code === 'TOKEN_INVALIDO' });

    // Alta con la sesión de Google (POST /api/certapp/alta)
    const FORM_GOOGLE = { nombre: 'Marta Ruiz', email: 'otro@malo.es', telefono: '600333444', consentimiento: true, acepta_condiciones: true, perfil: 'AUTONOMO', comunidades: ['CASTILLA-LA MANCHA'] };
    q('anónimo', 'POST', '/api/certapp/alta', 401, FORM_GOOGLE);
    q('tok-malo', 'POST', '/api/certapp/alta', 401, FORM_GOOGLE);
    q('tok-ext', 'POST', '/api/certapp/alta', 200, FORM_GOOGLE, {
        cuerpo: (j, ctx) => j.nueva === false && j.cuenta?.id === CUENTA.id && !llamada(ctx, 'certapp_beta_apuntar'),   // ya tiene cuenta: nada
    });
    q('tok-google', 'POST', '/api/certapp/alta', 400, { ...FORM_GOOGLE, acepta_condiciones: false }, { cuerpo: (j, ctx) => j.code === 'FALTA_CONDICIONES' && !opsDe(ctx, 'certapp_cuentas', 'insert').length });
    q('tok-google', 'POST', '/api/certapp/alta', 201, FORM_GOOGLE, {
        cuerpo: (j, ctx) => {
            const c = opsDe(ctx, 'certapp_cuentas', 'insert')[0]?.payload || {};
            const f = llamada(ctx, 'certapp_beta_apuntar')?.payload?.p_fila || {};
            // El email es el de la sesión (no el del formulario), ACTIVA, con el teléfono y 1 certificado
            return j.nueva === true && j.cuenta?.email === 'tok-google@x.es' && f.email === 'tok-google@x.es'
                && c.auth_user_id === 'a-tok-google' && c.estado === 'ACTIVA' && c.creditos === 1 && c.telefono === '600333444'
                && c.prefs?.alta?.via === 'google' && c.prefs?.perfil?.comunidades?.[0] === 'CASTILLA-LA MANCHA'
                && !opsDe(ctx, 'auth', 'createUser').length && !('prefs' in j.cuenta);
        },
    });
    q('tok-sinconf', 'POST', '/api/certapp/alta', 403, FORM_GOOGLE, { cuerpo: (j, ctx) => j.code === 'EMAIL_SIN_CONFIRMAR' && !opsDe(ctx, 'certapp_cuentas', 'insert').length });

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
        fbCaso = c.fb || {};
        ctaCaso = c.cta || {};
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
