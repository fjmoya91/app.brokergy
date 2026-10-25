// ─── certapp/obras.js — las obras de un certificador (certapp_obras) ─────────
// Cada obra es un CEE suelto de alcance único, con la MISMA forma que
// `cee_directos` en lo que leen la envolvente y el generador (origen `ext`).
//
// REGLA — los listados no traen JSONB (regla 22): solo escalares.
// REGLA — lo que llega del navegador pasa por una lista blanca: el titular
// saneado campo a campo y el cuestionario por `sanearCuestionario` (la misma
// función que el navegador). Estado, créditos, carpeta y token: solo el servidor.
// REGLA — en cuanto la obra deja de estar en BORRADOR (pedida: el crédito ya se
// ha gastado), el inmueble —la referencia catastral y lo que sale del Catastro—,
// el titular y el cuestionario quedan CONGELADOS (409 OBRA_CERRADA): si no, con
// un crédito se cambiaba la vivienda, se pedía «revisar de nuevo» y salía el CEE
// de OTRA casa gratis.
// REGLA — el enlace del PROPIETARIO caduca (CERTAPP_PORTAL_DIAS, 30 días desde
// que se crea o se rota: `portal_token_at`) y se puede ROTAR (el viejo deja de
// valer en el acto).
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const climateService = require('../climateService');
const drive = require('./drive');
const { cuestionario: logica } = require('./logica');
const { fallo, errorBd, texto, textoLargo, numero, nuevoToken, evento, esEmail, numEnv, certappUrl } = require('./comun');
const { limpiarRc } = require('./catastro');

const COLUMNAS_LISTA = 'id, numero_expediente, nombre, direccion, municipio, provincia, ref_catastral, estado, '
    + 'proposito, en_vivienda, created_at, updated_at, pedido_at, listo_at, entregado_at, validado_at';

async function listar(cuentaId) {
    const { data, error } = await supabase.from('certapp_obras').select(COLUMNAS_LISTA)
        .eq('cuenta_id', cuentaId).neq('estado', 'ARCHIVADA')
        .order('created_at', { ascending: false }).limit(500);
    if (error) throw errorBd(error, 'listar obras');
    return data || [];
}

/** La fila entera (detalle de UNA obra). null si no existe. */
async function cargar(id) {
    const { data, error } = await supabase.from('certapp_obras').select('*').eq('id', id).maybeSingle();
    if (error) throw errorBd(error, 'cargar obra');
    return data || null;
}

/**
 * El historial. BD caída → 503 (regla 38: nunca una lista vacía con 200).
 * El certificador ve tipo, texto y `por`; el ADMIN además quién fue de
 * BROKERGY (`por_detalle`) y el motivo interno (`nota_interna`).
 */
async function eventos(obraId, limite = 50, { admin = false } = {}) {
    const cols = admin ? 'id, created_at, tipo, texto, por, por_detalle, nota_interna' : 'id, created_at, tipo, texto, por';
    const { data, error } = await supabase.from('certapp_eventos').select(cols)
        .eq('obra_id', obraId).order('created_at', { ascending: false }).limit(limite);
    if (error) throw errorBd(error, 'eventos');
    return data || [];
}

/** 409 OBRA_CERRADA si la obra ya no está en BORRADOR (ver la REGLA de arriba). */
function exigirBorrador(obra) {
    if (obra.estado === 'ARCHIVADA') throw fallo(409, 'Esta obra está archivada.', 'ARCHIVADA');
    if (obra.estado !== 'BORRADOR') {
        throw fallo(409, 'El certificado ya está pedido: la vivienda, el titular y el cuestionario ya no se cambian. '
            + 'Si hay que corregir algo, hazlo en la envolvente y pide revisarlo, o escríbenos.', 'OBRA_CERRADA');
    }
}

// ── El enlace del propietario (vista CLIENTE) ──────────────────────────────
const diasPortal = () => numEnv('CERTAPP_PORTAL_DIAS', 30);

/** Cuándo caduca el enlace del propietario (Date), o null si no hay. */
function portalCaducaAt(obra) {
    if (!obra?.portal_token || !obra?.portal_token_at) return null;
    const t = Date.parse(obra.portal_token_at);
    return Number.isFinite(t) ? new Date(t + diasPortal() * 86400000) : null;
}
const portalVigente = (obra, ahora = Date.now()) => { const c = portalCaducaAt(obra); return !!c && c.getTime() > ahora; };
const urlPortal = (obra) => `${certappUrl()}/subir/${obra.id}?token=${encodeURIComponent(obra.portal_token)}`;

/**
 * Token nuevo para el enlace del propietario (el anterior deja de valer).
 * `soloSiEs`: rota solo si el token sigue siendo ese (dos peticiones a la vez
 * no se pisan: la segunda se queda con el que puso la primera).
 */
async function rotarPortal(obra, { soloSiEs } = {}) {
    let q = supabase.from('certapp_obras').update({ portal_token: nuevoToken(), portal_token_at: new Date().toISOString() }).eq('id', obra.id);
    if (soloSiEs !== undefined) q = soloSiEs ? q.eq('portal_token', soloSiEs) : q.is('portal_token', null);
    const { data, error } = await q.select('*');
    if (error) throw errorBd(error, 'rotar el enlace del propietario');
    if (data?.length) return data[0];
    const fresca = await cargar(obra.id);
    if (!fresca) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    return fresca;
}

/** El enlace vigente; si no hay o ha caducado, uno nuevo. → `{ url, caduca_at, obra }` */
async function enlacePortal(obra) {
    let o = obra;
    if (!portalVigente(o)) o = await rotarPortal(o, { soloSiEs: o.portal_token || null });
    if (!portalVigente(o)) o = await rotarPortal(o);   // carrera rara: se fuerza
    return { url: urlPortal(o), caduca_at: portalCaducaAt(o).toISOString(), obra: o };
}

// ── El titular (el cliente del certificador) ────────────────────────────────
const TITULAR = {
    nombre: 120, apellidos: 160, nif: 20, email: 160, telefono: 30, direccion: 200,
    municipio: 80, provincia: 60, codigo_postal: 10, representante: 160, representante_nif: 20,
};
function sanearTitular(raw) {
    if (!raw || typeof raw !== 'object') return {};
    const t = {};
    for (const [k, max] of Object.entries(TITULAR)) {
        let v = texto(raw[k], max);
        if (v && ['nif', 'representante_nif'].includes(k)) v = v.toUpperCase().replace(/[\s.-]/g, '');
        if (v && k === 'email') v = esEmail(v.toLowerCase()) ? v.toLowerCase() : null;
        if (v != null) t[k] = v;
    }
    if (raw.es_empresa === true || raw.es_empresa === false) t.es_empresa = raw.es_empresa;
    return t;
}
const nombreDeTitular = (t) => [t?.nombre, t?.apellidos].filter(Boolean).join(' ').trim() || null;

/** Lo que se le enseña al certificador de su obra (sin token, carpeta ni el `cee` interno). */
function obraParaCertificador(obra) {
    if (!obra) return null;
    // eslint-disable-next-line no-unused-vars
    const { portal_token, portal_token_at, drive_folder_id, drive_folder_link, cee, seguimiento, documentacion, cuenta_id, ...resto } = obra;
    // Lo que el barrido del navegador necesita contar; sin el enlace de Drive
    // (las miniaturas y descargas van por GET /obras/:id/docs, firmadas).
    const uploads = {};
    for (const [slot, lista] of Object.entries(documentacion?.reforma_uploads || {})) {
        uploads[slot] = (Array.isArray(lista) ? lista : []).map(e => ({
            driveId: e?.driveId || null, nombre: e?.nombre || e?.name || null, mime: e?.mime || e?.mimeType || null,
            subido_at: e?.subido_at || e?.at || null, por: e?.por || e?.subido_por || null,
        }));
    }
    return { ...resto, documentacion: { reforma_uploads: uploads } };
}

/** Lo que ve el ADMIN: todo salvo el XML crudo y cosas pesadas del `cee`. */
function obraParaAdmin(obra) {
    if (!obra) return null;
    const cee = {};
    for (const [k, v] of Object.entries(obra.cee || {})) {
        if (/^xml/i.test(k) || (typeof v === 'string' && v.length > 5000)) continue;
        cee[k] = v;
    }
    return { ...obra, cee };
}

/**
 * Alta de una obra. Crea la carpeta de Drive (sin bloquear: si falla, la obra
 * existe igual y la carpeta se crea en la primera subida).
 */
async function crear(cuenta, body = {}) {
    const rc = body.ref_catastral ? limpiarRc(body.ref_catastral) : null;
    if (rc && ![14, 18, 20].includes(rc.length)) throw fallo(400, 'La referencia catastral tiene 20 caracteres.', 'RC_FORMATO');
    const titular = sanearTitular(body.titular);
    const fila = {
        cuenta_id: cuenta.id,
        nombre: nombreDeTitular(titular) || texto(body.nombre, 120) || rc || null,
        ref_catastral: rc,
        titular,
        en_vivienda: body.en_vivienda === true ? true : body.en_vivienda === false ? false : null,
        estado: 'BORRADOR',
        portal_token: nuevoToken(),
        portal_token_at: new Date().toISOString(),
    };
    const { data: obra, error } = await supabase.from('certapp_obras').insert(fila).select('*').single();
    if (error) throw errorBd(error, 'crear obra');
    await evento(obra.id, cuenta.id, 'ALTA', 'Obra creada', 'certificador');
    const carpeta = await drive.asegurarCarpetaObra(obra, cuenta);
    return { obra, drive: { ok: carpeta.ok, motivo: carpeta.motivo || null } };
}

const COLS_TEXTO = { direccion: 200, ccaa: 60, provincia: 60, municipio: 80, codigo_postal: 10, uso: 80 };

/** PUT parcial con lista blanca. Solo en BORRADOR (después, 409 OBRA_CERRADA). */
async function actualizar(obra, body = {}) {
    exigirBorrador(obra);
    const { sanearCuestionario, PROPOSITO_VALUES } = await logica();
    const patch = {};

    if ('titular' in body) {
        patch.titular = sanearTitular(body.titular);
        const n = nombreDeTitular(patch.titular);
        if (n) patch.nombre = n;
    }
    for (const [k, max] of Object.entries(COLS_TEXTO)) if (k in body) patch[k] = texto(body[k], max);
    if ('ref_catastral' in body) {
        const rc = body.ref_catastral ? limpiarRc(body.ref_catastral) : null;
        if (rc && ![14, 18, 20].includes(rc.length)) throw fallo(400, 'La referencia catastral tiene 20 caracteres.', 'RC_FORMATO');
        patch.ref_catastral = rc;
    }
    for (const k of ['superficie_catastro', 'lat', 'lng']) if (k in body) patch[k] = numero(body[k]);
    if ('anio_construccion' in body) {
        const a = numero(body.anio_construccion);
        patch.anio_construccion = a && a > 1000 && a < 2200 ? Math.round(a) : null;
    }
    if ('en_vivienda' in body) patch.en_vivienda = body.en_vivienda === true ? true : body.en_vivienda === false ? false : null;
    if ('proposito' in body) {
        if (body.proposito && !PROPOSITO_VALUES.includes(body.proposito)) throw fallo(400, 'Propósito desconocido.', 'PROPOSITO_INVALIDO');
        patch.proposito = body.proposito || null;
    }
    if ('cuestionario' in body) {
        patch.cuestionario = sanearCuestionario(body.cuestionario || {});
        // Para qué pueden ser varios (cuestionario.propositos): la columna lleva
        // el PRIMERO, que es lo que leen los listados y los avisos.
        if (patch.cuestionario.propositos?.length) patch.proposito = patch.cuestionario.propositos[0];
    }

    // La zona climática sale SIEMPRE de la dirección (como en los CEE directos):
    // a null si no se resuelve; una heredada de otro sitio es peor que ninguna.
    if ('municipio' in patch || 'provincia' in patch) {
        const muni = 'municipio' in patch ? patch.municipio : obra.municipio;
        const prov = 'provincia' in patch ? patch.provincia : obra.provincia;
        const info = muni ? climateService.getClimateByNames(prov, muni) : null;
        patch.zona_climatica = info?.climateZone ?? null;
        patch.altitud = info?.altitude ?? null;
    } else if ('zona_climatica' in body) {
        const z = texto(body.zona_climatica, 4);
        // α1–α4 (Canarias), A1…E1. Sin toUpperCase: la α mayúscula es otra letra.
        patch.zona_climatica = z && /^(α|[A-E])[1-4]$/i.test(z) ? z.replace(/^[a-e]/, c => c.toUpperCase()) : null;
    }

    if (!Object.keys(patch).length) throw fallo(400, 'No hay nada que guardar.', 'SIN_CAMBIOS');
    // Condicionado al estado: si entre la lectura y aquí se ha pedido, no se escribe.
    const { data, error } = await supabase.from('certapp_obras').update(patch).eq('id', obra.id).eq('estado', 'BORRADOR').select('*');
    if (error) throw errorBd(error, 'actualizar obra');
    if (!data?.length) exigirBorrador({ estado: 'EN_PREPARACION' });
    return data[0];
}

/** Rellena el inmueble con lo que dice el Catastro (POST /obras/:id/catastro). Solo en BORRADOR. */
async function aplicarCatastro(obra, patchCatastro) {
    exigirBorrador(obra);
    const patch = { ...patchCatastro };
    if (!obra.nombre || obra.nombre === obra.ref_catastral) patch.nombre = nombreDeTitular(obra.titular) || patch.direccion || patch.ref_catastral;
    // Condicionado al estado: un «Generar» entre medias no deja cambiar la casa ya pedida.
    const { data, error } = await supabase.from('certapp_obras').update(patch).eq('id', obra.id).eq('estado', 'BORRADOR').select('*');
    if (error) throw errorBd(error, 'guardar catastro');
    if (!data?.length) exigirBorrador({ estado: 'EN_PREPARACION' });
    return data[0];
}

/** Cambia el estado con sus fechas. */
async function cambiarEstado(obraId, estado, extra = {}) {
    const { data, error } = await supabase.from('certapp_obras').update({ estado, ...extra }).eq('id', obraId).select('*').single();
    if (error) throw errorBd(error, `estado ${estado}`);
    return data;
}

module.exports = {
    COLUMNAS_LISTA, listar, cargar, eventos, crear, actualizar, aplicarCatastro, cambiarEstado, exigirBorrador,
    portalCaducaAt, portalVigente, urlPortal, rotarPortal, enlacePortal, diasPortal,
    obraParaCertificador, obraParaAdmin, sanearTitular, nombreDeTitular,
};
