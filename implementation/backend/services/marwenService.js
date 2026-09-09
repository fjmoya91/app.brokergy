// ============================================================
// marwenService.js — Integración con la plataforma del VERIFICADOR (Grupo Marwen / beCAE)
//
// Permite enviar un LOTE de actuaciones como "Solicitud de Verificación
// Estandarizada" directamente por API, en vez de (o además de) por email/PDF.
//
// Docs: https://pruebascae.marwen.es/docs  (OpenAPI en /swagger/openapi.json)
//   POST /api/v1/solicitud/estandarizada   → crear solicitud (X-API-KEY)
//   GET  /api/provincias/all                → catálogo de provincias  { data:[{id,nombre}] }
//   GET  /api/localidades/{provinciaId}     → catálogo de localidades { localidades:[{id,nombre}] }
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
const geoCcaa = require('./geoCcaa');

const BASE_URL = (process.env.MARWEN_API_URL || 'https://pruebascae.marwen.es').replace(/\/+$/, '');
const API_KEY = process.env.MARWEN_API_KEY || '';
// UA de navegador: el front de Marwen está tras un WAF que rechaza UAs "raros"
// (igual que el Catastro). Un Chrome genérico pasa sin problemas.
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function isConfigured() {
    return !!API_KEY;
}

function client() {
    if (!API_KEY) throw new Error('MARWEN_API_KEY no está configurada en el backend (.env)');
    return axios.create({
        baseURL: BASE_URL,
        timeout: 30000,
        headers: {
            'X-API-KEY': API_KEY,
            'Accept': 'application/json',
            'User-Agent': USER_AGENT,
        },
    });
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
    const { data } = await client().get('/api/provincias/all');
    const list = Array.isArray(data && data.data) ? data.data : [];
    _provincias = { at: Date.now(), data: list };
    return list;
}

async function getLocalidades(provinciaId) {
    const key = String(provinciaId);
    const cached = _localidades.get(key);
    if (freshEnough(cached)) return cached.data;
    const { data } = await client().get(`/api/localidades/${encodeURIComponent(provinciaId)}`);
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

// Envía la solicitud estandarizada. Devuelve los datos de la respuesta (201) o
// lanza Error con el mensaje devuelto por Marwen (400/401/422…).
async function enviarSolicitudEstandarizada(payload) {
    try {
        const { data } = await client().post('/api/v1/solicitud/estandarizada', payload, {
            headers: { 'Content-Type': 'application/json' },
        });
        return data; // { message, num_solicitud, tipo_solicitud }
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
        throw new Error(`No se pudo contactar con Marwen: ${err.message}`);
    }
}

module.exports = {
    BASE_URL,
    isConfigured,
    formatMarwenError,
    getProvincias,
    getLocalidades,
    resolveProvincia,
    resolveLocalidad,
    resolveGeoSolicitante,
    enviarSolicitudEstandarizada,
};
