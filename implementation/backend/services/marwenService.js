// ============================================================
// marwenService.js — Integración con la plataforma del VERIFICADOR (Grupo Marwen / beCAE)
//
// Permite enviar un LOTE de actuaciones como "Solicitud de Verificación
// Estandarizada" directamente por API, en vez de (o además de) por email/PDF.
//
// Docs: https://pruebascae.marwen.es/docs  (OpenAPI en /swagger/openapi.json) y la
// «Guía de integración API CAE» v1.6.0 que mandó Marwen el 11/11/2026
// (docs/conocimiento/lotes/la-api-de-marwen-v1-6.md).
//   POST /api/v1/solicitud/estandarizada   → crear solicitud (X-API-KEY)
//   GET  /api/provincias/all                → catálogo de provincias  { data:[{id,nombre}] }
//   GET  /api/localidades/{provinciaId}     → catálogo de localidades { localidades:[{id,nombre}] }
//   GET/POST /api/solicitud/{n}/documentos  → listar / subir (solicitud firmada, adjuntos, oferta firmada)
//   GET  /api/solicitud/{n}/documentos/{id} → descargar
//   GET  /api/solicitud/{n}/estado · /api/expediente/{n}/estado · …/pedido/{pedido}/estado
//   GET  /api/expediente/{n}/inexactitudes  → con LÍMITE de consultas (429 + Retry-After)
//
// CLAVE del mapeo geográfico (lo "complejo" del usuario):
//   • PROVINCIA: el `id` de Marwen ES el código INE de provincia (Toledo=45,
//     Ciudad Real=13, …). Lo resolvemos con geoCcaa.provinciaNombreACod() y
//     verificamos contra el catálogo.
//   • LOCALIDAD: el `id` de Marwen es un id interno suyo (Tomelloso=2037),
//     NO el código INE de municipio. Hay que resolverlo por NOMBRE normalizado
//     dentro del catálogo de la provincia.
//
// Auth: cabecera `X-API-KEY`. La key pertenece a un Sujeto Obligado / oficina
// técnica concreta (la del lote). Base URL y key vienen de .env
// (MARWEN_API_URL, MARWEN_API_KEY) para poder apuntar a pruebas o producción.
// ============================================================

const axios = require('axios');
const http = require('http');
const https = require('https');
const geoCcaa = require('./geoCcaa');

const BASE_URL = (process.env.MARWEN_API_URL || 'https://pruebascae.marwen.es').replace(/\/+$/, '');
const API_KEY = process.env.MARWEN_API_KEY || '';
// UA de navegador: el front de Marwen está tras un WAF que rechaza UAs "raros"
// (igual que el Catastro). Un Chrome genérico pasa sin problemas.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function isConfigured() {
    return !!API_KEY;
}

// Un agente por llamada que APUNTA si la conexión TCP llegó a abrirse. Es lo que
// separa "Marwen no responde" (no conectó: no ha podido recibir NADA, así que no
// hay solicitud creada) de "Marwen no ha contestado a tiempo" (conectó y se le
// mandó la petición: la solicitud PUDO crearse). Con solo el "timeout of 30000ms
// exceeded" de axios no hay forma de saberlo, y reintentar en el segundo caso
// puede duplicar la solicitud en el verificador.
// Medido el 15/10/2026: cae.marwen.es y pruebascae.marwen.es no aceptaban
// conexiones ni desde el VPS ni desde la oficina (www.marwen.es daba 503), y la
// pantalla solo decía "timeout of 30000ms exceeded".
function agenteVigilado(estado) {
    const agente = BASE_URL.startsWith('http:') ? new http.Agent() : new https.Agent();
    const crear = agente.createConnection.bind(agente);
    agente.createConnection = (...args) => {
        const s = crear(...args);
        if (s && typeof s.once === 'function') s.once('connect', () => { estado.conectado = true; });
        return s;
    };
    return agente;
}

function client(estado = {}) {
    if (!API_KEY) throw new Error('MARWEN_API_KEY no está configurada en el backend (.env)');
    const agente = agenteVigilado(estado);
    return axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        httpAgent: agente,
        httpsAgent: agente,
        headers: {
            'X-API-KEY': API_KEY,
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
        },
    });
}

const HOST = (() => { try { return new URL(BASE_URL).host; } catch { return BASE_URL; } })();

// Error de RED (sin respuesta HTTP) → mensaje que dice de quién es el fallo.
//   code 'MARWEN_NO_RESPONDE'  → no llegó a conectar: no se ha enviado nada. 503.
//   code 'MARWEN_SIN_RESPUESTA' → conectó pero no contestó: la solicitud PUDO
//                                 crearse; hay que mirarlo antes de reintentar. 504.
function errorDeRed(err, estado, { esEnvio = false } = {}) {
    const causa = { ECONNABORTED: 'tiempo agotado', ETIMEDOUT: 'tiempo agotado', ECONNREFUSED: 'conexión rechazada',
        ECONNRESET: 'conexión cortada', ENOTFOUND: 'dirección no encontrada', EAI_AGAIN: 'dirección no encontrada',
        EHOSTUNREACH: 'servidor inalcanzable', ENETUNREACH: 'servidor inalcanzable' }[err.code]
        || (/timeout/i.test(err.message) ? 'tiempo agotado' : (err.code || err.message));
    let e;
    if (!estado.conectado) {
        e = new Error(`El servidor del verificador (${HOST}) no responde (${causa}): es un fallo de Marwen, no de la app. `
            + (esEnvio ? 'No se ha creado ninguna solicitud. ' : 'No se ha enviado nada. ')
            + 'Vuelve a intentarlo más tarde.');
        e.code = 'MARWEN_NO_RESPONDE';
        e.status = 503;
    } else if (esEnvio) {
        e = new Error(`El servidor del verificador (${HOST}) recibió la solicitud pero no ha contestado (${causa}). `
            + 'PUEDE que la solicitud se haya creado: compruébalo en beCAE antes de volver a enviarla, para no duplicarla.');
        e.code = 'MARWEN_SIN_RESPUESTA';
        e.status = 504;
    } else {
        e = new Error(`El servidor del verificador (${HOST}) no ha contestado (${causa}): es un fallo de Marwen, no de la app. No se ha enviado nada. Vuelve a intentarlo más tarde.`);
        e.code = 'MARWEN_NO_RESPONDE';
        e.status = 503;
    }
    e.causa = err.message;
    return e;
}

// GET a un catálogo, con el error de red traducido.
async function getCatalogo(ruta) {
    const estado = { conectado: false };
    try {
        const { data } = await client(estado).get(ruta);
        return data;
    } catch (err) {
        if (!err.response) throw errorDeRed(err, estado);
        throw new Error(`Marwen (${err.response.status}) al leer ${ruta}: ${err.message}`);
    }
}

// ── Caché en memoria de catálogos (cambian rarísima vez) ──────────────────────
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 h
let _provincias = null;          // { at, data: [{id, nombre}] }
const _localidades = new Map();  // provinciaId → { at, data: [{id, nombre}] }

function freshEnough(entry) {
    return entry && (Date.now() - entry.at) < CACHE_TTL_MS;
}

async function getProvincias() {
    if (freshEnough(_provincias)) return _provincias.data;
    const data = await getCatalogo('/api/provincias/all');
    const list = Array.isArray(data && data.data) ? data.data : [];
    _provincias = { at: Date.now(), data: list };
    return list;
}

async function getLocalidades(provinciaId) {
    const key = String(provinciaId);
    const cached = _localidades.get(key);
    if (freshEnough(cached)) return cached.data;
    const data = await getCatalogo(`/api/localidades/${encodeURIComponent(provinciaId)}`);
    const list = Array.isArray(data && data.localidades) ? data.localidades : [];
    _localidades.set(key, { at: Date.now(), data: list });
    return list;
}

// Variantes de nombre para casar "A Coruña" / "Coruña (A)" / "Alcúdia (l')", etc.
function nameVariants(s) {
    const base = geoCcaa.norm(s);
    const out = new Set([base]);
    // "coruna a" ↔ "a coruna": mover un artículo final (a/o/el/la/els/les/l) al principio
    const m = base.match(/^(.*)\s+(a|o|el|la|els|les|l|es|os|as)$/);
    if (m) out.add(`${m[2]} ${m[1]}`.trim());
    const m2 = base.match(/^(a|o|el|la|els|les|l|es|os|as)\s+(.*)$/);
    if (m2) out.add(`${m2[2]} ${m2[1]}`.trim());
    return out;
}

// Provincia (texto) → { id, nombre } de Marwen, o null.
async function resolveProvincia(nombre) {
    const provincias = await getProvincias();

    // 1. Vía código INE (el id de Marwen = código INE de provincia).
    const cod = geoCcaa.provinciaNombreACod(nombre); // "13", "45", …
    if (cod) {
        const byId = provincias.find(p => Number(p.id) === parseInt(cod, 10));
        if (byId) return byId;
    }
    // 2. Fallback: por nombre normalizado (con variantes de artículo).
    const variants = nameVariants(nombre);
    const byName = provincias.find(p => variants.has(geoCcaa.norm(p.nombre)));
    if (byName) return byName;

    return null;
}

// Localidad (texto) dentro de una provincia → { id, nombre } de Marwen, o null.
async function resolveLocalidad(provinciaId, municipio) {
    const localidades = await getLocalidades(provinciaId);
    const variants = nameVariants(municipio);

    // Exacta (con variantes de artículo)
    let hit = localidades.find(l => variants.has(geoCcaa.norm(l.nombre)));
    if (hit) return hit;

    // Laxa: el nombre del catálogo empieza por el municipio buscado (o viceversa).
    const target = geoCcaa.norm(municipio);
    if (target) {
        hit = localidades.find(l => {
            const n = geoCcaa.norm(l.nombre);
            return n.startsWith(target + ' ') || target.startsWith(n + ' ');
        });
        if (hit) return hit;
    }
    return null;
}

// Resuelve provincia + localidad de un solicitante. Devuelve
// { provincia:{id,nombre}|null, localidad:{id,nombre}|null, warnings:[] }.
async function resolveGeoSolicitante({ provincia, municipio }) {
    const warnings = [];
    let prov = null, loc = null;

    if (!provincia) {
        warnings.push('El Sujeto Obligado no tiene PROVINCIA → no se puede resolver el ID de provincia de Marwen.');
    } else {
        prov = await resolveProvincia(provincia);
        if (!prov) warnings.push(`No se encontró la provincia "${provincia}" en el catálogo de Marwen.`);
    }

    if (prov) {
        if (!municipio) {
            warnings.push('El Sujeto Obligado no tiene MUNICIPIO → no se puede resolver el ID de localidad de Marwen.');
        } else {
            loc = await resolveLocalidad(prov.id, municipio);
            if (!loc) warnings.push(`No se encontró el municipio "${municipio}" dentro de "${prov.nombre}" en el catálogo de Marwen.`);
        }
    }

    return { provincia: prov, localidad: loc, warnings };
}

// El 400 de Marwen NO es una cadena: es un ARBOL de arrays y objetos, y las
// etiquetas que dicen DÓNDE está el fallo son las CLAVES ("Errores actuación 5").
// Interpolarlo daba literalmente "Marwen (400): [object Object]" — un error que
// no dice nada y que obliga a rebuscar en los logs del servidor.
//
//   { message: "Error al guardar la solicitud",
//     error: [ { "Errores actuación 5": [ "…formato de 'SE_fecha_inicio'…",
//                                         { message: "La fecha de inicio…" } ] } ] }
//     →  Errores actuación 5: …formato de 'SE_fecha_inicio' debe ser yyyy-mm-dd
//        Errores actuación 5: La fecha de inicio no puede ser posterior a la de fin
//
// Se arrastra la clave hasta cada hoja: sin ella, "debe ser yyyy-mm-dd" no dice
// de qué actuación habla, que es la mitad de la información.
function textosDeError(nodo, prefijo = '', out = []) {
    if (nodo == null) return out;
    if (typeof nodo === 'string' || typeof nodo === 'number') {
        const s = String(nodo).trim();
        if (s) out.push(prefijo ? `${prefijo}: ${s}` : s);
        return out;
    }
    if (Array.isArray(nodo)) {
        nodo.forEach(n => textosDeError(n, prefijo, out));
        return out;
    }
    if (typeof nodo === 'object') {
        for (const [k, v] of Object.entries(nodo)) {
            // Los índices de array y los envoltorios genéricos no cualifican nada.
            const generica = /^\d+$/.test(k) || ['message', 'error', 'errors', 'msg', 'detail'].includes(k);
            const sub = generica ? prefijo : (prefijo ? `${prefijo} · ${k}` : k);
            textosDeError(v, sub, out);
        }
        return out;
    }
    return out;
}

// Aplana la respuesta de error de Marwen a líneas legibles (sin duplicados).
function formatMarwenError(data) {
    const detalles = [...new Set(textosDeError(data.error != null ? data.error : data.errors))];
    const cabecera = typeof data.message === 'string' ? data.message.trim() : '';
    if (detalles.length) return { texto: [cabecera, ...detalles].filter(Boolean).join('\n'), detalles };
    return { texto: cabecera || JSON.stringify(data), detalles: cabecera ? [cabecera] : [] };
}

// ── API beCAE v1.6.0 (guía de Marwen del 11/11/2026) ─────────────────────────
// Desde la 1.6.0 TODAS las respuestas van envueltas: `{ success, message, data }`.
// Antes, la creación devolvía `{ message, num_solicitud, tipo_solicitud }` en la
// raíz; ahora el número va en `data.num_solicitud`. Se aceptan los DOS formatos:
// leer solo el nuevo dejaría el lote sin su nº de solicitud si Marwen volviera
// atrás, y leer solo el viejo es lo que rompió la 1.6.0 (el `num_solicitud` de la
// raíz llega undefined y el lote se quedaba "Enviada por API · nº —").
function datosDe(body) {
    if (body && typeof body === 'object' && 'success' in body && 'data' in body) return body.data;
    return body;
}

// Respuesta de la creación de la solicitud, en un formato ÚNICO.
function normalizarCreacion(body) {
    const d = datosDe(body) || {};
    return {
        message: (body && body.message) || null,
        num_solicitud: d.num_solicitud || (body && body.num_solicitud) || null,
        tipo_solicitud: d.tipo_solicitud || (body && body.tipo_solicitud) || null,
    };
}

// Error HTTP de Marwen → Error con su mensaje legible y lo que hay que hacer.
//   404: no existe o no es nuestro (Marwen no distingue, a propósito).
//   429: límite de consultas de inexactitudes; trae `retryAfter` en segundos.
function errorHttp(r, ruta) {
    const body = r.data;
    let texto;
    if (body && typeof body === 'object') texto = formatMarwenError(body).texto;
    else texto = String(body || '').slice(0, 300) || `HTTP ${r.status}`;
    const e = new Error(`Marwen (${r.status}) en ${ruta}: ${texto}`);
    e.status = r.status;
    e.marwen = (body && typeof body === 'object') ? body : null;
    if (body && typeof body === 'object') e.detalles = formatMarwenError(body).detalles;
    if (r.status === 404) e.code = 'MARWEN_NO_EXISTE';
    if (r.status === 429) {
        const ra = Number((r.headers || {})['retry-after']);
        e.code = 'MARWEN_LIMITE';
        e.retryAfter = Number.isFinite(ra) ? ra : null;
        e.message = `Marwen limita las consultas de inexactitudes: hay que esperar ${e.retryAfter != null ? `${e.retryAfter} s` : 'un rato'} antes de volver a consultarlas.`;
    }
    return e;
}

// Llamada genérica con el error de red y el HTTP ya traducidos. `esEnvio` = la
// llamada CREA o SUBE algo (un 504 puede haberlo dejado hecho).
async function llamar(method, ruta, { data, headers, responseType, timeout, esEnvio = false } = {}) {
    const estado = { conectado: false };
    try {
        const r = await client(estado).request({
            method, url: ruta, data, headers, responseType,
            ...(timeout ? { timeout } : {}),
            maxBodyLength: Infinity, maxContentLength: Infinity,
        });
        return r;
    } catch (err) {
        if (err.response) {
            // Una descarga binaria que falla trae el JSON del error como buffer.
            if (Buffer.isBuffer(err.response.data)) {
                try { err.response.data = JSON.parse(err.response.data.toString('utf8')); } catch (_) { /* texto */ }
            }
            throw errorHttp(err.response, ruta);
        }
        throw errorDeRed(err, estado, { esEnvio });
    }
}

const seg = (s) => encodeURIComponent(String(s || '').trim());

// Envía la solicitud estandarizada. Devuelve `{ message, num_solicitud,
// tipo_solicitud }` (normalizado) o lanza Error con el mensaje de Marwen.
async function enviarSolicitudEstandarizada(payload) {
    const estado = { conectado: false };
    try {
        const { data } = await client(estado).post('/api/v1/solicitud/estandarizada', payload, {
            headers: { 'Content-Type': 'application/json' },
        });
        return normalizarCreacion(data);
    } catch (err) {
        const r = err.response;
        if (r && r.data) {
            const { texto, detalles } = formatMarwenError(r.data);
            const e = new Error(`Marwen (${r.status}): ${texto}`);
            e.marwen = r.data;
            e.detalles = detalles;
            e.status = r.status;
            throw e;
        }
        throw errorDeRed(err, estado, { esEnvio: true });
    }
}

// ── Estados ──────────────────────────────────────────────────────────────────
// Solicitud: Pendiente documentación · Pendiente recibir oferta · Ofertado ·
// Aceptada (en la práctica llega «Oferta aceptada») · Solicitud rechazada.
async function estadoSolicitud(numSolicitud) {
    const r = await llamar('get', `/api/solicitud/${seg(numSolicitud)}/estado`);
    return datosDe(r.data); // { numero_solicitud, num_pedido, estado_solicitud }
}
// Expediente: Aceptado · Previo · En ejecución · En resolución · Reestudio
// documental · Pendiente IDV + Dictamen · HDTED · Finalizado.
async function estadoExpediente(numExpediente) {
    const r = await llamar('get', `/api/expediente/${seg(numExpediente)}/estado`);
    return datosDe(r.data); // { num_expediente, num_pedido, estado }
}
// Por nº de PEDIDO (en beCAE el pedido de nuestros lotes es su código,
// «LOTE-2026-016»). Devuelven SIEMPRE una lista, vacía si no hay nada.
async function estadosPorPedido(numPedido) {
    const [s, e] = await Promise.all([
        llamar('get', `/api/solicitud/pedido/${seg(numPedido)}/estado`),
        llamar('get', `/api/expediente/pedido/${seg(numPedido)}/estado`),
    ]);
    const lista = (x) => { const d = datosDe(x.data); return Array.isArray(d) ? d : (d ? [d] : []); };
    return { solicitudes: lista(s), expedientes: lista(e) };
}

// ── Inexactitudes ────────────────────────────────────────────────────────────
// Tienen LÍMITE de consultas por clave (compartido con la de por pedido): un 429
// dice cuántos segundos esperar. Se recuerda en memoria para no volver a llamar
// antes de tiempo, y la última respuesta se guarda 2 minutos (dos pantallas que
// se abren a la vez no gastan dos consultas).
const _inex = new Map();        // numExpediente → { at, data }
let _inexBloqueadoHasta = 0;
async function inexactitudes(numExpediente, { forzar = false } = {}) {
    const k = String(numExpediente || '').trim().toUpperCase();
    const c = _inex.get(k);
    if (!forzar && c && Date.now() - c.at < 2 * 60 * 1000) return c.data;
    if (Date.now() < _inexBloqueadoHasta) {
        const e = new Error(`Marwen limita las consultas de inexactitudes: hay que esperar ${Math.ceil((_inexBloqueadoHasta - Date.now()) / 1000)} s antes de volver a consultarlas.`);
        e.status = 429; e.code = 'MARWEN_LIMITE'; e.retryAfter = Math.ceil((_inexBloqueadoHasta - Date.now()) / 1000);
        throw e;
    }
    try {
        const r = await llamar('get', `/api/expediente/${seg(k)}/inexactitudes`);
        const d = datosDe(r.data);
        const data = Array.isArray(d) ? d : [];
        _inex.set(k, { at: Date.now(), data });
        return data;
    } catch (e) {
        if (e.code === 'MARWEN_LIMITE') _inexBloqueadoHasta = Date.now() + (e.retryAfter || 60) * 1000;
        throw e;
    }
}

// Inexactitud de la API → la forma que produce la lectura del PDF del informe
// (loteOcrService.leerInformeInexactitudes), para registrarlas por el MISMO camino:
//   numero "3" / "3-R2" · clasificacion imp|nim · estado abierto|cerrado ·
//   actuaciones [8, 9, 12] · descripcion · acciones_correctivas · observaciones.
function aItemsDeInforme(lista) {
    return (lista || []).map((x, i) => {
        const num = String(x.numero == null ? i + 1 : x.numero).trim();
        const hecho = [
            String(x.descripcion || '').trim(),
            x.acciones_correctivas ? `Acción correctiva: ${String(x.acciones_correctivas).trim()}` : '',
        ].filter(Boolean).join('\n');
        return {
            // Un nº simple se queda en número (como el leído del PDF): la identidad
            // de la incidencia es (lote, nº). Los de un requerimiento del gestor
            // («3-R2») son otra inexactitud y se guardan con su sufijo.
            n: /^\d+$/.test(num) ? Number(num) : num,
            clasificacion: x.clasificacion === 'nim' ? 'No importante'
                : x.clasificacion === 'imp' ? 'Importante' : (x.clasificacion || null),
            estado: x.estado === 'cerrado' ? 'Cerrada' : x.estado === 'abierto' ? 'Abierta' : (x.estado || null),
            actuaciones: Array.isArray(x.actuaciones) ? x.actuaciones.join(',') : (x.actuaciones == null ? null : String(x.actuaciones)),
            hecho,
            observaciones: x.observaciones || null,
            fecha_subsanacion: x.fecha_subsanacion || null,
        };
    }).filter(x => x.hecho);
}

// ── Documentos de la SOLICITUD ───────────────────────────────────────────────
// Tipos: solicitud (sin firmar, la genera beCAE al descargarla) · solicitud_firmada
// · documento_adjunto · oferta (de Marwen) · oferta_firmada (subirla = ACEPTARLA).
async function documentos(numSolicitud) {
    const r = await llamar('get', `/api/solicitud/${seg(numSolicitud)}/documentos`);
    const d = datosDe(r.data);
    return Array.isArray(d) ? d : []; // [{ id, name, type }]
}

function nombreDeDisposition(cd) {
    const s = String(cd || '');
    const m5987 = s.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
    if (m5987) { try { return decodeURIComponent(m5987[1].trim().replace(/^"|"$/g, '')); } catch (_) { /* sigue */ } }
    const m = s.match(/filename\s*=\s*"?([^";]+)"?/i);
    return m ? m[1].trim() : null;
}

async function descargarDocumento(numSolicitud, documentoId) {
    const r = await llamar('get', `/api/solicitud/${seg(numSolicitud)}/documentos/${seg(documentoId)}`,
        { responseType: 'arraybuffer', timeout: 120000 });
    return {
        buffer: Buffer.from(r.data),
        nombre: nombreDeDisposition(r.headers['content-disposition']),
        contentType: r.headers['content-type'] || 'application/octet-stream',
    };
}

const TIPOS_SUBIDA = ['solicitud_firmada', 'documento_adjunto', 'oferta_firmada'];
const TIPO_MIME = { pdf: 'application/pdf', zip: 'application/zip', rar: 'application/vnd.rar' };

/**
 * Sube ficheros a la solicitud: UN tipo por petición, ficheros en `archivo[]`.
 * Devuelve `{ success, message, estado_solicitud, num_solicitud,
 * documentos_descartados }`. OJO: subir la `oferta_firmada` ACEPTA la oferta, y
 * si es la primera del cliente la solicitud se RENUMERA (llega en num_solicitud).
 * @param {Array<{ nombre: string, buffer: Buffer, contentType?: string }>} ficheros
 */
async function subirDocumentos(numSolicitud, tipo, ficheros) {
    if (!TIPOS_SUBIDA.includes(tipo)) throw new Error(`Tipo de documento no válido para subir a Marwen: ${tipo}`);
    if (!Array.isArray(ficheros) || !ficheros.length) throw new Error('No hay ficheros que subir');
    const form = new FormData();
    form.append('tipo', tipo);
    for (const f of ficheros) {
        const ext = String(f.nombre || '').split('.').pop().toLowerCase();
        form.append('archivo[]', new Blob([f.buffer], { type: f.contentType || TIPO_MIME[ext] || 'application/octet-stream' }), f.nombre);
    }
    const r = await llamar('post', `/api/solicitud/${seg(numSolicitud)}/documentos`,
        { data: form, timeout: 10 * 60 * 1000, esEnvio: true });
    const b = r.data || {};
    const d = (b && typeof b.data === 'object' && b.data) || {};
    return {
        success: b.success !== false,
        message: b.message || null,
        estado_solicitud: b.estado_solicitud || d.estado_solicitud || null,
        num_solicitud: b.num_solicitud || d.num_solicitud || null,
        documentos_descartados: b.documentos_descartados || d.documentos_descartados || [],
    };
}

// Solo `documento_adjunto`, y solo sin oferta. Definitivo.
async function eliminarAdjunto(numSolicitud, documentoId) {
    const r = await llamar('delete', `/api/solicitud/${seg(numSolicitud)}/documentos/adjuntos/${seg(documentoId)}`, { esEnvio: true });
    const b = r.data || {};
    return { success: b.success !== false, message: b.message || null, estado_solicitud: b.estado_solicitud || null };
}

module.exports = {
    BASE_URL,
    isConfigured,
    formatMarwenError,
    errorDeRed,
    getProvincias,
    getLocalidades,
    resolveProvincia,
    resolveLocalidad,
    resolveGeoSolicitante,
    enviarSolicitudEstandarizada,
    // v1.6.0
    datosDe,
    normalizarCreacion,
    estadoSolicitud,
    estadoExpediente,
    estadosPorPedido,
    inexactitudes,
    aItemsDeInforme,
    documentos,
    descargarDocumento,
    subirDocumentos,
    eliminarAdjunto,
    TIPOS_SUBIDA,
};
