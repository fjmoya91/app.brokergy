/**
 * ============================================================
 * BROKERGY MCP SERVER — Consultas de Expedientes para Claude
 * ============================================================
 *
 * Protocolo: MCP 2025-03-26 (StreamableHTTP — POST + GET en /sse)
 * Claude.ai y la app móvil de Claude se conectan aquí.
 *
 * Endpoint en producción: https://app.brokergy.es/mcp/sse?key=<MCP_API_KEY>
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── Helpers ──────────────────────────────────────────────────────────────────
// v_expedientes_pendientes — columnas reales verificadas
const PENDING_FIELDS = [
    'numero_expediente', 'estado_actual', 'dias_en_estado_actual',
    'responsable_bloqueo', 'campos_pendientes',
    'num_facturas', 'docs_generados_total', 'docs_firmados_total', 'docs_enviados_total',
    'seguimiento_cee_inicial', 'seguimiento_cee_final', 'anomalias_docs',
    'cliente_nombre', 'cliente_municipio', 'cliente_provincia',
    'partner_nombre', 'partner_acronimo'
].join(', ');

// v_expedientes_lifecycle — columnas reales verificadas
const LIFECYCLE_FIELDS = [
    'numero_expediente', 'cliente_id', 'estado_actual', 'dias_en_estado_actual',
    'responsable_bloqueo', 'campos_pendientes', 'seguimiento_cee_inicial', 'seguimiento_cee_final',
    'cee_ini_visita_ok', 'cee_ini_firma_ok', 'cee_ini_registro_ok',
    'cee_fin_visita_ok', 'cee_fin_firma_ok', 'cee_fin_registro_ok',
    'num_facturas', 'cert_inst_pruebas_ok', 'cert_inst_firma_ok',
    'anexo_i_generado', 'anexo_i_enviado', 'anexo_i_firmado',
    'cesion_generada', 'cesion_enviada', 'cesion_firmada',
    'ficha_res_generada', 'ficha_res_enviada', 'ficha_res_firmada',
    'cifo_generado', 'cifo_enviado', 'cifo_firmado',
    'rite_aportado',
    'foto_generada', 'foto_enviada', 'foto_firmada',
    'historial_json'
].join(', ');

function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function err(msg) {
    return { content: [{ type: 'text', text: `Error: ${msg}` }] };
}

// ─── Helpers de incidencias ────────────────────────────────────────────────────
// Busca un expediente por número en la TABLA base (necesitamos leer/escribir
// documentacion, no la vista). Devuelve { exp } | { error } | { ambiguous }.
// DOS PASOS a propósito. El `ilike '%…%'` no puede usar índice, así que recorre la
// tabla entera; si además se pide `documentacion` en ese mismo select, Postgres tiene
// que descomprimir esa columna de TODAS las filas solo para descartarlas. Con eso
// llegó a haber 66 MB de JSONB, y cada alta de incidencia de las skills disparaba ese
// trabajo — parte de lo que tumbó la BD el 21/07/2026. Resolvemos primero el número
// (columnas ligeras) y solo después leemos `documentacion` de la fila ya identificada.
async function findExpediente(numero) {
    const { data: matches, error } = await supabase
        .from('expedientes')
        .select('id, numero_expediente')
        .ilike('numero_expediente', `%${(numero || '').replace(/\s/g, '')}%`);
    if (error) return { error: error.message };
    if (!matches || matches.length === 0) {
        return { notFound: `No se encontró ningún expediente que coincida con "${numero}".` };
    }
    if (matches.length > 1) {
        return {
            ambiguous: matches.map(m => m.numero_expediente),
            message: `Hay ${matches.length} expedientes que coinciden con "${numero}". Indica el número completo.`
        };
    }
    const { data: exp, error: fullErr } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, documentacion')
        .eq('id', matches[0].id)
        .single();
    if (fullErr) return { error: fullErr.message };
    return { exp };
}

// Persiste el array de incidencias en documentacion.incidencias[] del expediente.
async function persistIncidencias(expId, docObj, incidencias) {
    docObj.incidencias = incidencias;
    const { error } = await supabase
        .from('expedientes')
        .update({ documentacion: docObj, updated_at: new Date().toISOString() })
        .eq('id', expId);
    return error ? error.message : null;
}

// Localiza UNA incidencia dentro de un expediente a partir de una referencia
// flexible que el agente puede dar de tres formas:
//   1. el id interno exacto (ej: "1718000000000_inc")
//   2. un número de índice 1-based tal como sale en listar_incidencias
//   3. un fragmento de texto (case-insensitive) que identifique inequívocamente una
// Devuelve { inc, index } | { error } (mensaje listo para el usuario).
function resolveIncidencia(incidencias, ref) {
    if (!incidencias || incidencias.length === 0) {
        return { error: 'Este expediente no tiene ninguna incidencia registrada.' };
    }
    const raw = String(ref ?? '').trim();
    if (!raw) return { error: 'Debes indicar qué incidencia (id, número de la lista, o un fragmento del texto).' };

    // 1) id exacto
    let idx = incidencias.findIndex(i => i.id === raw);
    if (idx !== -1) return { inc: incidencias[idx], index: idx };

    // 2) índice 1-based (solo si es un entero puro dentro de rango)
    if (/^\d+$/.test(raw)) {
        const n = parseInt(raw, 10);
        if (n >= 1 && n <= incidencias.length) {
            return { inc: incidencias[n - 1], index: n - 1 };
        }
    }

    // 3) fragmento de texto — debe identificar exactamente una
    const needle = raw.toLowerCase();
    const hits = [];
    incidencias.forEach((i, k) => {
        if ((i.texto || '').toLowerCase().includes(needle)) hits.push(k);
    });
    if (hits.length === 1) return { inc: incidencias[hits[0]], index: hits[0] };
    if (hits.length > 1) {
        return {
            error: `El texto "${ref}" coincide con ${hits.length} incidencias. ` +
                `Sé más específico o usa el nº de la lista (listar_incidencias).`
        };
    }
    return {
        error: `No encontré ninguna incidencia que coincida con "${ref}". ` +
            `Usa listar_incidencias para ver las que hay y sus números.`
    };
}

// Llama al backend interno (misma red Docker) con la clave compartida x-internal-key.
// Devuelve { status, okHttp, data } o { httpError } si no se pudo contactar.
async function backendFetch(method, path, body) {
    const base = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000';
    const key = process.env.INTERNAL_API_KEY;
    if (!key) return { httpError: 'INTERNAL_API_KEY no está configurada en el servidor MCP (añádela al .env).' };
    let resp, data;
    try {
        resp = await fetch(`${base}${path}`, {
            method,
            headers: { 'x-internal-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
        });
        data = await resp.json().catch(() => ({}));
    } catch (e) {
        return { httpError: `No se pudo contactar con el backend: ${e.message}` };
    }
    return { status: resp.status, okHttp: resp.ok, data };
}

// Enmascara un teléfono dejando visible el primer dígito y los tres últimos.
// El agente NUNCA ve el número completo (evita que pueda dictar números arbitrarios).
function maskPhone(tlf) {
    if (!tlf) return null;
    const s = String(tlf).replace(/\s+/g, '');
    if (s.length <= 4) return s;
    return `${s[0]}····${s.slice(-3)}`;
}

// ─── Helpers de PRESUPUESTOS (facturación) ────────────────────────────────────
// Los presupuestos van por el BACKEND (/api/facturacion, staffOClaveInterna): el
// MCP no calcula importes ni compone mensajes. Solo traduce lo DICTADO («un CEE y
// la legalización de placas en nave industrial») a artículos del catálogo, y
// enseña lo que devuelve el backend con teléfono y email ENMASCARADOS.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Sin tildes y en minúscula, a los DOS lados de la comparación (los buscadores del
// CRM son insensibles a tildes: «perez» encuentra «PÉREZ»).
function sinTildes(s) {
    return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const PALABRAS_VACIAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'e', 'un', 'una', 'unos', 'unas',
    'para', 'por', 'con', 'a', 'al', 'o', 'u', 'su', 'sus', 'le', 'lo']);

// Lo que se dicta no es lo que pone el catálogo: «placas» es «FV», «CEE» es
// «Certificado de Eficiencia Energética». Cada término cuenta también como sus
// alternativas (búsqueda por subcadena dentro del nombre ya sin tildes).
const SINONIMOS = {
    placas: ['fv', 'fotovoltaic', 'solar', 'paneles'],
    paneles: ['fv', 'fotovoltaic', 'solar', 'placas'],
    solar: ['fv', 'fotovoltaic', 'placas'],
    fv: ['fotovoltaic', 'placas', 'solar'],
    fotovoltaica: ['fv', 'placas', 'solar'],
    fotovoltaico: ['fv', 'placas', 'solar'],
    cee: ['certificado de eficiencia', 'certificado energetico', 'eficiencia energetica'],
    certificado: ['cee'],
    legalizar: ['legaliz'],
    legalizacion: ['legaliz'],
    casa: ['vivienda', 'unifamiliar', 'chalet'],
    chalet: ['unifamiliar'],
};

function terminos(texto) {
    return sinTildes(texto).split(/[^a-z0-9]+/).filter(t => t && !PALABRAS_VACIAS.has(t));
}

function formasDe(termino) {
    const out = new Set([termino]);
    if (termino.length > 4 && termino.endsWith('es')) out.add(termino.slice(0, -2));
    if (termino.length > 3 && termino.endsWith('s')) out.add(termino.slice(0, -1));
    // Género: «energético» tiene que encontrar «energética».
    for (const f of [...out]) if (f.length > 5 && /[aeo]$/.test(f)) out.add(f.slice(0, -1));
    for (const f of [...out]) for (const s of (SINONIMOS[f] || [])) out.add(s);
    return [...out];
}

// ¿Aparece el término (o una de sus formas) en el texto, ya sin tildes?
function casa(termino, pajar) {
    return formasDe(termino).some(f => pajar.includes(f));
}

// Nombre + familia + siglas («Certificado de Eficiencia Energética» → «cee»).
function pajarArticulo(a) {
    const nombre = sinTildes(a.nombre);
    const siglas = nombre.split(/[^a-z0-9]+/).filter(p => p && !PALABRAS_VACIAS.has(p)).map(p => p[0]).join('');
    return ` ${nombre} ${sinTildes(a.familia)} ${siglas} `;
}

// La respuesta de un listado del backend puede venir como array o envuelta.
function listaDe(data, clave) {
    if (Array.isArray(data)) return data;
    for (const k of [clave, 'items', 'data', 'rows']) if (Array.isArray(data?.[k])) return data[k];
    return [];
}

function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function maskEmail(email) {
    if (!email) return null;
    const [u, d] = String(email).trim().split('@');
    if (!d) return '····';
    return `${(u || '')[0] || ''}····@${d}`;
}

function maskDni(dni) {
    if (!dni) return null;
    const s = String(dni).replace(/\s+/g, '');
    return s.length <= 4 ? '····' : `····${s.slice(-4)}`;
}

// Mensaje de error de una llamada al backend, con el caso de "la ruta no existe"
// (backend sin desplegar la facturación) dicho claro.
function errorBackend(r, que = 'la operación') {
    if (r.httpError) return r.httpError;
    if (r.status === 404 && !r.data?.error && !r.data?.message) {
        return `El backend no tiene la ruta de ${que} (404). ¿Falta desplegar la facturación en el backend?`;
    }
    if (r.status === 503) return r.data?.error || 'La base de datos no responde ahora mismo (503). Prueba en un momento.';
    return r.data?.error || r.data?.message || `Error ${r.status} en ${que}.`;
}

// Destino de un presupuesto, SIEMPRE enmascarado. El backend ya manda
// `tlf_enmascarado`; si por error viniera un número entero, se enmascara aquí.
function destinoEnmascarado(d = {}) {
    const crudo = d.tlf_enmascarado || d.tlf || d.telefono || null;
    const tel = crudo && /\d{6,}/.test(String(crudo).replace(/[\s·.-]/g, '')) ? maskPhone(crudo) : crudo;
    return {
        nombre: d.nombre || null,
        telefono: tel || null,
        email: maskEmail(d.email),
        alcanzable_whatsapp: !!crudo,
        email_disponible: !!d.email,
    };
}

function vistaArticulo(a, porId) {
    const genera = a.genera || null;
    return {
        id: a.id,
        nombre: a.nombre,
        familia: a.familia || null,
        precio_sin_iva: numOrNull(a.precio),
        iva_pct: numOrNull(a.iva_pct ?? a.ivaPct),
        suplido: !!a.suplido,
        variantes: (Array.isArray(a.variantes) ? a.variantes : []).map(v => ({
            id: v.id, nombre: v.nombre, precio_sin_iva: numOrNull(v.precio)
        })),
        arrastra: (Array.isArray(a.arrastra) ? a.arrastra : []).map(x => {
            const t = porId?.get(x.articulo_id);
            return {
                articulo_id: x.articulo_id,
                nombre: x.nombre || t?.nombre || null,
                uds: numOrNull(x.uds) ?? 1,
                precio_sin_iva: numOrNull(x.precio ?? t?.precio),
                suplido: t ? !!t.suplido : (x.suplido ?? null),
            };
        }),
        abre_expediente_cee: genera === 'CEE_UNICO' ? 'Sí: un CEE'
            : genera === 'CEE_DOBLE' ? 'Sí: CEE inicial + final' : 'No',
    };
}

function opcionArticulo(a) {
    return {
        id: a.id, nombre: a.nombre, familia: a.familia || null, precio_sin_iva: numOrNull(a.precio),
        variantes: (Array.isArray(a.variantes) ? a.variantes : []).map(v => ({ id: v.id, nombre: v.nombre, precio_sin_iva: numOrNull(v.precio) })),
    };
}

/**
 * Resuelve el artículo dicho (id, ID de AppSheet o texto) contra el catálogo.
 * Devuelve { articulo, sobrantes } | { ambiguo, opciones } | { noEncontrado, opciones }.
 * `sobrantes` son los términos del texto que NO están en el nombre del artículo
 * («nave industrial» en «legalización de placas en nave industrial»): sirven para
 * deducir la variante. Nunca elige entre empatados: devuelve las opciones.
 */
function resolverArticulo(catalogo, ref) {
    const raw = String(ref ?? '').trim();
    const porId = catalogo.find(a => a.id === raw || (a.appsheet_id && String(a.appsheet_id) === raw));
    if (porId) return { articulo: porId, sobrantes: [] };

    const q = sinTildes(raw);
    const exactos = catalogo.filter(a => sinTildes(a.nombre) === q);
    if (exactos.length === 1) return { articulo: exactos[0], sobrantes: [] };

    const ts = terminos(raw);
    if (!ts.length) return { noEncontrado: true, opciones: [] };
    const puntuados = catalogo.map(a => {
        const pajar = pajarArticulo(a);
        const pajarVar = (Array.isArray(a.variantes) ? a.variantes : []).map(v => ` ${sinTildes(v.nombre)} `).join('|');
        const enBase = ts.filter(t => casa(t, pajar));
        const enVariante = ts.filter(t => !casa(t, pajar) && casa(t, pajarVar));
        return { a, enBase: enBase.length, cubre: enBase.length + enVariante.length, sobrantes: ts.filter(t => !casa(t, pajar)) };
    });
    let completos = puntuados.filter(p => p.enBase > 0 && p.cubre === ts.length);
    // «un CEE» también está en el nombre de su TASA de registro; las tasas
    // (suplidos) las arrastra el backend solo, así que en un empate solo cuentan
    // si se ha dicho «tasa» o «suplido».
    const pideSuplido = ts.some(t => /^(tasa|tasas|suplido|suplidos)$/.test(t));
    if (!pideSuplido && completos.some(p => !p.a.suplido)) completos = completos.filter(p => !p.a.suplido);
    if (completos.length) {
        const max = Math.max(...completos.map(p => p.enBase));
        const mejores = completos.filter(p => p.enBase === max);
        if (mejores.length === 1) return { articulo: mejores[0].a, sobrantes: mejores[0].sobrantes };
        return { ambiguo: true, opciones: mejores.map(p => opcionArticulo(p.a)) };
    }
    const parecidos = puntuados.filter(p => p.enBase > 0)
        .sort((x, y) => y.cubre - x.cubre || y.enBase - x.enBase).slice(0, 8);
    return { noEncontrado: true, opciones: parecidos.map(p => opcionArticulo(p.a)) };
}

/**
 * La variante de un artículo: la dicha (id o nombre) o, si no se dijo, la que
 * señalen sin duda los términos sobrantes del texto del artículo. Si el artículo
 * tiene varias variantes y no se puede saber cuál, devuelve las opciones.
 */
function resolverVariante(articulo, ref, sobrantes = []) {
    const vars = Array.isArray(articulo.variantes) ? articulo.variantes : [];
    const raw = String(ref ?? '').trim();
    const opciones = vars.map(v => ({ id: v.id, nombre: v.nombre, precio_sin_iva: numOrNull(v.precio) }));
    if (!vars.length) {
        if (raw) return { error: `«${articulo.nombre}» no tiene variantes: quita «${raw}» (si es una aclaración, ponla en «detalle»).` };
        return { variante: null };
    }
    const pajarDe = v => ` ${sinTildes(v.nombre)} `;
    if (raw) {
        const porId = vars.find(v => String(v.id) === raw);
        if (porId) return { variante: porId };
        const exactas = vars.filter(v => sinTildes(v.nombre) === sinTildes(raw));
        if (exactas.length === 1) return { variante: exactas[0] };
        const ts = terminos(raw);
        const hits = ts.length ? vars.filter(v => ts.every(t => casa(t, pajarDe(v)))) : [];
        if (hits.length === 1) return { variante: hits[0] };
        return {
            error: hits.length > 1
                ? `«${raw}» encaja con varias variantes de «${articulo.nombre}».`
                : `«${articulo.nombre}» no tiene ninguna variante «${raw}».`,
            opciones
        };
    }
    if (sobrantes.length) {
        const hits = vars.filter(v => sobrantes.every(t => casa(t, pajarDe(v))));
        if (hits.length === 1) return { variante: hits[0] };
    }
    if (vars.length === 1) return { variante: vars[0] };
    return { error: `«${articulo.nombre}» tiene variantes con precio distinto: hay que decir cuál.`, opciones };
}

// Columnas LIGERAS de `clientes` (nada de JSONB: regla 22).
const CLIENTE_FIELDS = 'id_cliente, nombre_razon_social, apellidos, dni, tlf, email, municipio, provincia, prescriptor_id, prescriptores (razon_social, acronimo)';

function nombreClienteDe(c) {
    return [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim();
}

function vistaCliente(c) {
    const p = c.prescriptores || null;
    return {
        id_cliente: c.id_cliente,
        nombre: nombreClienteDe(c),
        dni: maskDni(c.dni),
        telefono: maskPhone(c.tlf),
        email: maskEmail(c.email),
        alcanzable_whatsapp: !!c.tlf,
        email_disponible: !!c.email,
        municipio: c.municipio || null,
        provincia: c.provincia || null,
        partner: p ? (p.acronimo || p.razon_social || null) : null,
    };
}

/**
 * Busca clientes por nombre, apellidos, DNI, email o teléfono, sin tildes.
 * La BD prefiltra con UN término (el más largo; las vocales y la «n» como comodín
 * `_` del ilike para que «perez»/«nunez» encuentren «PÉREZ»/«NÚÑEZ») y aquí se
 * exige que estén TODOS los términos. Por teléfono: los 9 últimos dígitos.
 */
async function buscarClientes(texto, limite = 15) {
    const raw = String(texto ?? '').trim();
    if (!raw) return { error: 'Indica un nombre, DNI, email o teléfono.' };
    const digitos = raw.replace(/\D/g, '');
    const esTelefono = digitos.length >= 6 && digitos.length >= raw.replace(/[\s+().-]/g, '').length - 1;

    let query = supabase.from('clientes').select(CLIENTE_FIELDS).order('created_at', { ascending: false }).limit(1000);
    let ts = [];
    if (esTelefono) {
        const cola = digitos.slice(-9);
        query = query.or(`tlf.ilike.%${cola}%,dni.ilike.%${cola}%`);
    } else {
        ts = terminos(raw);
        if (!ts.length) return { error: 'Indica un nombre, DNI, email o teléfono.' };
        const patron = t => t.replace(/[aeioun]/g, '_');
        const fijo = t => patron(t).replace(/_/g, '').length;
        const mejor = [...ts].sort((a, b) => fijo(b) - fijo(a) || b.length - a.length)[0];
        const p = `%${patron(mejor)}%`;
        query = query.or(`nombre_razon_social.ilike.${p},apellidos.ilike.${p},dni.ilike.${p},email.ilike.${p}`);
    }
    const { data, error } = await query;
    if (error) return { error: error.message };
    let filas = data || [];
    if (!esTelefono) {
        // Sin el municipio: «Juan Pérez» no es «Antonia Ruiz Pérez» de Alcázar de San JUAN.
        filas = filas.filter(c => {
            const pajar = ` ${sinTildes([c.nombre_razon_social, c.apellidos, c.dni, c.email].filter(Boolean).join(' '))} `;
            return ts.every(t => pajar.includes(t));
        });
        // Primero el nombre exacto, luego quien empieza por lo dicho.
        const q = sinTildes(raw);
        filas.sort((x, y) => {
            const nx = sinTildes(nombreClienteDe(x)), ny = sinTildes(nombreClienteDe(y));
            return (ny === q) - (nx === q) || ny.startsWith(q) - nx.startsWith(q);
        });
    }
    return { total: filas.length, clientes: filas.slice(0, limite) };
}

// Partner/prescriptor por id, acrónimo o nombre. Solo columnas ligeras: la tabla
// entera lleva los LOGOS (8 MB) y nunca se pide con `*`.
async function resolverPrescriptor(ref) {
    const raw = String(ref ?? '').trim();
    if (!raw) return { id: null };
    if (UUID_RE.test(raw)) return { id: raw };
    const { data, error } = await supabase.from('prescriptores').select('id_empresa, razon_social, acronimo');
    if (error) return { error: error.message };
    const filas = data || [];
    const q = sinTildes(raw);
    const exactos = filas.filter(p => sinTildes(p.acronimo) === q || sinTildes(p.razon_social) === q);
    if (exactos.length === 1) return { id: exactos[0].id_empresa, nombre: exactos[0].acronimo || exactos[0].razon_social };
    const ts = terminos(raw);
    const hits = ts.length ? filas.filter(p => {
        const pajar = ` ${sinTildes(`${p.razon_social || ''} ${p.acronimo || ''}`)} `;
        return ts.every(t => pajar.includes(t));
    }) : [];
    if (hits.length === 1) return { id: hits[0].id_empresa, nombre: hits[0].acronimo || hits[0].razon_social };
    return {
        error: hits.length > 1 ? `El partner «${raw}» encaja con varios.` : `No encuentro ningún partner «${raw}».`,
        opciones: (hits.length > 1 ? hits : []).slice(0, 10).map(p => ({ id: p.id_empresa, nombre: p.razon_social, acronimo: p.acronimo }))
    };
}

function vistaPresupuesto(p = {}) {
    return {
        id: p.id,
        numero: p.numero,
        estado: p.estado,
        concepto: p.concepto || undefined,
        lineas: (Array.isArray(p.lineas) ? p.lineas : []).map(l => ({
            descripcion: l.descripcion,
            detalle: l.detalle || undefined,
            uds: numOrNull(l.uds),
            precio_sin_iva: numOrNull(l.precio),
            dto_pct: numOrNull(l.dtoPct) || 0,
            iva_pct: numOrNull(l.ivaPct),
            subtotal: numOrNull(l.subtotal),
            iva: numOrNull(l.iva),
            suplido: l.suplido ? true : undefined,
            arrastrada_de: l.arrastrada_de || undefined,
        })),
        base_imponible: numOrNull(p.neto),
        iva: numOrNull(p.iva),
        total: numOrNull(p.total),
        destino: destinoEnmascarado(p.destino || {}),
        url_aceptacion: p.url_aceptacion || undefined,
        mensaje: p.mensaje || undefined,
    };
}

/**
 * Número dictado → presupuesto (fila del listado). Acepta el nº completo
 * («P-26ING_40»), sin guion ni prefijo («26ING_40») o solo el correlativo («40»),
 * y también el id. Devuelve { pres } | { notFound } | { ambiguous } | { error }.
 */
async function resolverPresupuesto(numero) {
    const ref = String(numero ?? '').trim();
    if (!ref) return { error: 'Indica el número del presupuesto (ej: P-26ING_40).' };
    if (UUID_RE.test(ref)) return { pres: { id: ref, numero: ref } };
    const r = await backendFetch('GET', `/api/facturacion/presupuestos?q=${encodeURIComponent(ref)}&todas=1`);
    if (r.httpError || !r.okHttp) return { error: errorBackend(r, 'presupuestos') };
    const filas = listaDe(r.data, 'presupuestos');
    const norm = s => sinTildes(s).replace(/[\s_-]+/g, '');
    const q = norm(ref);
    const exactos = filas.filter(p => norm(p.numero) === q);
    if (exactos.length === 1) return { pres: exactos[0] };
    // Por el final, con frontera: «40» es P-26ING_40, no P-26ING_140.
    const finales = filas.filter(p => {
        const n = norm(p.numero);
        return n.endsWith(q) && !/\d/.test(n.charAt(n.length - q.length - 1) || '');
    });
    if (finales.length === 1) return { pres: finales[0] };
    const cand = finales.length ? finales : filas;
    if (cand.length === 0) return { notFound: `No encuentro ningún presupuesto «${ref}».` };
    return {
        ambiguous: cand.slice(0, 10).map(p => `${p.numero} · ${p.cliente_nombre || p.cliente?.nombre || ''} · ${p.estado || ''}`),
        message: `Hay ${cand.length} presupuestos que encajan con «${ref}». Indica el número completo.`
    };
}

function diasDesde(fecha) {
    if (!fecha) return null;
    const t = new Date(fecha).getTime();
    if (!Number.isFinite(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}

function normMensaje(s) {
    return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// ─── Helpers de FACTURAS ──────────────────────────────────────────────────────
// Como los presupuestos: todo por /api/facturacion/facturas (adminOClaveInterna);
// el MCP no calcula ni numera. Un BORRADOR no tiene número: se nombra por su id.

function vistaFactura(f = {}) {
    const c = f.cliente || {};
    return {
        id: f.id,
        numero: f.numero || null,
        serie: f.serie,
        tipo: f.tipo !== 'F1' ? f.tipo : undefined,
        estado: f.visible?.texto || f.estado,
        origen: f.origen && f.origen !== 'APP' ? f.origen : undefined,
        fecha: f.fecha || null,
        vencimiento: f.vencimiento || null,
        fecha_operacion: f.fecha_operacion || undefined,
        cliente: f.cliente_nombre || c.razon_social || null,
        nif: maskDni(f.cliente_nif || c.cif),
        concepto: f.concepto || undefined,
        lineas: Array.isArray(f.lineas) ? f.lineas.map(l => ({
            descripcion: l.descripcion,
            detalle: l.detalle || undefined,
            uds: numOrNull(l.uds),
            precio_sin_iva: numOrNull(l.precio),
            dto_pct: numOrNull(l.dtoPct) || 0,
            iva_pct: numOrNull(l.ivaPct),
            suplido: l.suplido ? true : undefined,
        })) : undefined,
        base_imponible: numOrNull(f.neto),
        iva: numOrNull(f.iva),
        retencion_irpf: numOrNull(f.irpf) ? -Math.abs(numOrNull(f.irpf)) : undefined,
        total_a_pagar: numOrNull(f.total),
        rectifica_a: f.rectifica_numero || undefined,
        motivo_rectificacion: f.motivo_rectificacion || undefined,
        expediente: f.expediente || undefined,
        enviada: f.enviada_at ? String(f.enviada_at).slice(0, 10) : undefined,
        cobrada: f.fecha_pago || undefined,
    };
}

/**
 * Factura dictada → fila. Acepta el id (un BORRADOR solo tiene id), el nº
 * completo («26ING_59», «R-26ING_1»), o solo el correlativo («59») si no hay duda.
 */
async function resolverFactura(ref) {
    const s = String(ref ?? '').trim();
    if (!s) return { error: 'Indica la factura: su número (ej: 26ING_59) o, si es un borrador, su id.' };
    if (UUID_RE.test(s)) return { fac: { id: s } };
    const r = await backendFetch('GET', `/api/facturacion/facturas?q=${encodeURIComponent(s)}`);
    if (r.httpError || !r.okHttp) return { error: errorBackend(r, 'facturas') };
    const filas = listaDe(r.data, 'facturas').filter(f => f.numero);
    const norm = x => sinTildes(x).replace(/[\s_-]+/g, '');
    const q = norm(s);
    const exactos = filas.filter(f => norm(f.numero) === q);
    if (exactos.length === 1) return { fac: exactos[0] };
    const finales = filas.filter(f => {
        const n = norm(f.numero);
        return n.endsWith(q) && !/\d/.test(n.charAt(n.length - q.length - 1) || '');
    });
    if (finales.length === 1) return { fac: finales[0] };
    const cand = finales.length ? finales : filas;
    if (!cand.length) return { notFound: `No encuentro ninguna factura «${s}».` };
    return {
        ambiguous: cand.slice(0, 10).map(f => `${f.numero} · ${f.cliente_nombre || ''} · ${f.visible?.texto || f.estado}`),
        message: `Hay ${cand.length} facturas que encajan con «${s}». Indica el número completo.`,
    };
}

// ── Topes de tamaño (protección de la BD) ─────────────────────────────────────
// Mismos valores que routes/expedientes.js. Las incidencias viven dentro de
// `expedientes.documentacion` (JSONB): un texto desmedido no solo engorda la fila
// (trigger de 2 MB), es que obliga a Postgres a descomprimir esa columna entera en
// cada consulta que la toque. Reglas 21 y 22 de CLAUDE.md.
const MAX_TEXTO_INCIDENCIA = 4000;
const MAX_TEXTO_COMENTARIO = 2000;
const MAX_COMENTARIOS      = 50;

// Devuelve un mensaje de error si el texto no es apto para el JSONB, o null.
function validarTextoIncidencia(texto, max, que = 'texto') {
    if (texto.length > max) {
        return `El ${que} es demasiado largo (${texto.length} caracteres, máximo ${max}). Resume: los documentos y capturas van a Drive, no dentro de la incidencia.`;
    }
    if (/;base64,|^data:[a-z]+\//i.test(texto)) {
        return `No se pueden guardar ficheros ni imágenes dentro de una incidencia. Súbelo a Drive y pon aquí el enlace.`;
    }
    return null;
}

// Añade una entrada al HILO de seguimiento de una incidencia (incidencia.comentarios[]).
// Mismo formato exacto que escribe la app (routes/expedientes.js): lo que el agente
// apunta por chat sale en el modal de la app y al revés.
// tipo: NOTA (la escribe alguien) | RESOLUCION | REAPERTURA | SEVERIDAD (las genera el sistema).
function pushComentario(inc, texto, autor, tipo = 'NOTA') {
    const entrada = {
        id: `${Date.now()}_c${Math.random().toString(36).slice(2, 7)}`,
        texto: (texto || '').trim(),
        autor: autor || 'AGENTE IA',
        tipo,
        fecha: new Date().toISOString(),
    };
    // Al llegar al tope se descarta la NOTA más antigua; las entradas de sistema
    // (RESOLUCION/REAPERTURA/SEVERIDAD) no se pierden nunca: son la traza.
    let hilo = [...(inc.comentarios || []), entrada];
    while (hilo.length > MAX_COMENTARIOS) {
        const i = hilo.findIndex(c => c.tipo === 'NOTA');
        hilo.splice(i === -1 ? 0 : i, 1);
    }
    inc.comentarios = hilo;
    return entrada;
}

// Serializa una incidencia para respuesta (añade índice legible 1-based).
function incView(inc, index) {
    return {
        n: index + 1,
        id: inc.id,
        texto: inc.texto,
        severidad: inc.severidad,
        estado: inc.estado,
        procedencia: inc.procedencia,
        fecha: inc.fecha,
        resuelta_at: inc.resuelta_at || null,
        resuelta_por: inc.resuelta_por || null,
        resolucion: inc.resolucion || null,
        comentarios: (inc.comentarios || []).map(c => ({
            tipo: c.tipo, autor: c.autor, fecha: c.fecha, texto: c.texto
        }))
    };
}

// ─── Instrucciones del servidor ───────────────────────────────────────────────
// Llegan al modelo al conectar (campo `instructions` del initialize), estén o no
// en las instrucciones del Project de claude.ai (CLAUDE_PROJECT_SYSTEM_PROMPT.md).
const INSTRUCCIONES_SERVIDOR = `Servidor de BROKERGY (CRM de rehabilitación energética, CAE y certificados energéticos). Responde siempre en castellano, breve: el usuario suele estar en el móvil.

REGLA DE ORO DE LOS ENVÍOS (enviar_whatsapp, enviar_presupuesto y enviar_factura) — no se salta nunca:
- Nada sale a un cliente o instalador sin un «sí» explícito del usuario a ESE envío concreto.
- Primero modo="borrador" (no envía). Enseñas al usuario el mensaje ENTERO, a quién va (con el teléfono/email enmascarados que te devuelve la herramienta) y, si es un presupuesto, el TOTAL con IVA y las líneas. Después preguntas si lo envías.
- Solo tras su «sí» llamas con modo="enviar". Aunque la petición diga «y mándaselo», primero se enseña el borrador y se espera el sí. Si cambias el texto, vuelves a enseñarlo.
- Los teléfonos y emails no los dictas ni los ves enteros: el backend usa los de la ficha. Nunca escribas uno en un mensaje.

PRESUPUESTOS («hazle un presupuesto a X de … y mándaselo por WhatsApp»):
1. buscar_cliente_presupuesto(X). Si hay varios, pregunta cuál. Si no existe, se crea con cliente_nuevo (nombre y teléfono que te dé el usuario).
2. crear_presupuesto con las líneas tal como se dicen (el servidor las resuelve contra el catálogo; si devuelve opciones, PREGUNTA al usuario, no elijas tú). Queda en BORRADOR, no envía nada. Las tasas que arrastra un artículo las añade el backend solo.
3. Enseña las líneas, la base, el IVA, el TOTAL, a quién va y el mensaje completo, y pregunta si lo envías (y por qué canal, si no lo dijo).
4. Con el «sí»: enviar_presupuesto(numero, canales, modo="enviar").
Para precios o qué incluye un artículo: buscar_articulos. Para el seguimiento: listar_presupuestos. Anular, rechazar o duplicar: cambiar_estado_presupuesto, confirmándolo antes con el usuario.

FACTURAS (solo las ve el ADMIN; series ING = BROKERGY y FML = Fran como profesional, con retención de IRPF):
1. Se preparan en BORRADOR: crear_factura, facturar_presupuesto (de un presupuesto aceptado) o duplicar_factura (la FML de cada mes: copia la última con el mes avanzado). Un borrador no tiene número.
2. EMITIR le da el número legal y ya no se borra ni se cambia (se rectifica). emitir_factura primero en modo="revisar": enseña al usuario a quién va, las líneas, el total, el número que tocará y los avisos, y pregunta. Solo con su «sí»: modo="emitir".
3. Enviarla es OTRO «sí», como un presupuesto: enviar_factura en borrador, se enseña el mensaje ENTERO, y con el «sí» modo="enviar".
4. Cobrada: cobro_factura. Un error en una emitida: rectificar_factura (crea la rectificativa en borrador; se emite igual que una factura). Seguimiento: listar_facturas («¿qué me deben?», «¿qué está vencido?»).`;

// ─── Factoría: crea un McpServer con todas las herramientas registradas ───────
// Se llama una vez por sesión (el StreamableHTTPServerTransport es por sesión)
function createMcpServer() {
    const mcp = new McpServer(
        { name: 'brokergy-expedientes', version: '1.0.0' },
        { instructions: INSTRUCCIONES_SERVIDOR }
    );

    // Borradores de presupuesto que el usuario YA ha visto en esta sesión:
    // id → { defecto: bool, textos: Set<mensaje normalizado> }. `enviar_presupuesto`
    // con modo="enviar" exige que ese texto se haya enseñado antes (en
    // crear_presupuesto o en el borrador). Es un tope más, no sustituye al «sí».
    const presupuestosVistos = new Map();
    const marcarVisto = (id, mensaje, esDefecto) => {
        if (!id) return;
        const v = presupuestosVistos.get(id) || { defecto: false, textos: new Set() };
        if (esDefecto) v.defecto = true;
        if (mensaje) v.textos.add(normMensaje(mensaje));
        presupuestosVistos.set(id, v);
    };
    // Lo mismo para las facturas: emitir_factura exige haber enseñado la revisión
    // (id → número que se anunció) y enviar_factura, el texto.
    const facturasRevisadas = new Map();
    const facturasVistas = new Map();
    const marcarFacturaVista = (id, mensaje, esDefecto) => {
        if (!id) return;
        const v = facturasVistas.get(id) || { defecto: false, textos: new Set() };
        if (esDefecto) v.defecto = true;
        if (mensaje) v.textos.add(normMensaje(mensaje));
        facturasVistas.set(id, v);
    };

    // ── Tool 1: Detalle de un expediente ──────────────────────────────────────
    mcp.tool(
        'get_expediente',
        'Obtiene el estado completo del ciclo de vida de un expediente. Úsalo cuando el usuario pregunte por un número concreto (ej: 26RES060_118).',
        { numero: z.string().describe('Número del expediente, ej: 26RES060_118') },
        async ({ numero }) => {
            const { data, error } = await supabase
                .from('v_expedientes_lifecycle')
                .select(LIFECYCLE_FIELDS)
                .ilike('numero_expediente', `%${numero.replace(/\s/g, '')}%`)
                .maybeSingle();
            if (error) return err(error.message);
            if (!data) return ok({ found: false, message: `No encontrado: "${numero}"` });
            return ok({ found: true, expediente: data });
        }
    );

    // ── Tool 2: Buscar por nombre de cliente ──────────────────────────────────
    mcp.tool(
        'search_by_client',
        'Busca expedientes por nombre o apellidos del cliente.',
        { nombre: z.string().describe('Nombre o apellidos del cliente') },
        async ({ nombre }) => {
            const { data, error } = await supabase
                .from('v_expedientes_pendientes')
                .select(PENDING_FIELDS)
                .ilike('cliente_nombre', `%${nombre}%`);
            if (error) return err(error.message);
            return ok({ total: (data || []).length, expedientes: data || [] });
        }
    );

    // ── Tool 3: Listar expedientes pendientes ─────────────────────────────────
    mcp.tool(
        'list_pending',
        'Lista los expedientes activos (no finalizados), con filtros opcionales. Úsalo para "¿qué tengo pendiente?", "¿qué espera el certificador?" o "¿cuáles llevan más de X días?"',
        {
            responsable: z.enum(['BROKERGY', 'CERTIFICADOR', 'INSTALADOR', 'CLIENTE'])
                .optional().describe('Filtrar por quién bloquea el avance ahora mismo'),
            dias_minimos: z.number().optional()
                .describe('Solo mostrar expedientes con más de N días en el estado actual'),
            estado: z.string().optional()
                .describe('Filtrar por estado, ej: "PTE. FIN OBRA"'),
            limit: z.number().optional().describe('Máximo de resultados (default: 30)')
        },
        async ({ responsable, dias_minimos, estado, limit = 30 }) => {
            let query = supabase
                .from('v_expedientes_pendientes')
                .select(PENDING_FIELDS)
                .order('dias_en_estado_actual', { ascending: false })
                .limit(limit);
            if (responsable) query = query.eq('responsable_bloqueo', responsable);
            if (dias_minimos != null) query = query.gte('dias_en_estado_actual', dias_minimos);
            if (estado) query = query.ilike('estado_actual', `%${estado}%`);
            const { data, error } = await query;
            if (error) return err(error.message);
            return ok({ total: (data || []).length, expedientes: data || [] });
        }
    );

    // ── Tool 3b: Qué falta, por PISTAS PARALELAS ──────────────────────────────
    // `list_pending` responde desde `responsable_bloqueo`, que es UN solo valor.
    // Pero el CEE final (certificador), los anexos de firma (cliente) y el CIFO
    // (instalador) viajan A LA VEZ: puede haber tres personas distintas con algo
    // nuestro en la mano el mismo día. Esta herramienta lee `v_expedientes_pistas`,
    // que trata cada pista por separado y con su propio reloj.
    mcp.tool(
        'que_falta',
        'Dice QUÉ FALTA en la cartera tratando las tres pistas que avanzan EN PARALELO: CEE final (certificador), anexos de firma (cliente) y CIFO (instalador). Úsalo para "¿qué falta?", "¿qué le pido hoy al instalador?", "¿qué llevo más tiempo esperando?" o "¿qué está en nuestro tejado?". Preferible a list_pending cuando la pregunta es sobre pendientes concretos y de quién dependen.',
        {
            esperando_a: z.enum(['CERTIFICADOR', 'CLIENTE', 'INSTALADOR']).optional()
                .describe('Solo expedientes donde esa parte tiene algo nuestro sin devolver'),
            dias_minimos: z.number().optional()
                .describe('Solo los que llevan más de N días esperando'),
            solo_nuestro_tejado: z.boolean().optional()
                .describe('true = solo lo que depende de BROKERGY (generar o enviar), no de terceros'),
            expediente: z.string().optional()
                .describe('Filtrar por número de expediente, ej: "26RES060_141"'),
            limit: z.number().optional().describe('Máximo de resultados (default: 40)')
        },
        async ({ esperando_a, dias_minimos, solo_nuestro_tejado, expediente, limit = 40 }) => {
            let query = supabase
                .from('v_expedientes_pistas')
                .select('*')
                .order('dias_esperando_max', { ascending: false })
                .limit(limit);
            if (esperando_a) query = query.contains('esperando_a', [esperando_a]);
            if (dias_minimos != null) query = query.gte('dias_esperando_max', dias_minimos);
            if (expediente) query = query.ilike('numero_expediente', `%${expediente}%`);
            const { data, error } = await query;
            if (error) return err(error.message);
            let filas = data || [];
            // El filtro de "nuestro tejado" es un array no vacío; PostgREST no tiene
            // un operador limpio para eso, así que se filtra aquí.
            if (solo_nuestro_tejado) filas = filas.filter(f => (f.nos_toca_a_nosotros || []).length > 0);
            return ok({
                total: filas.length,
                leyenda: {
                    SIN_EMITIR: 'ni generado',
                    SIN_ENVIAR: 'generado, sigue en nuestra mesa',
                    ESPERANDO: 'enviado — lo tiene el otro, desde hace N días',
                    OK: 'recibido / firmado / registrado',
                },
                expedientes: filas,
            });
        }
    );

    // ── Tool 4: Resumen ejecutivo ─────────────────────────────────────────────
    mcp.tool(
        'get_summary',
        'Devuelve un resumen del estado global: cuántos expedientes activos, cuántos por estado, quién bloquea más, cuántos atascados. Úsalo para "¿cómo vamos?" o "dame un resumen".',
        {},
        async () => {
            const { data, error } = await supabase
                .from('v_expedientes_pendientes')
                .select('estado_actual, responsable_bloqueo, dias_en_estado_actual, numero_expediente');
            if (error) return err(error.message);
            const total = data?.length || 0;
            const porEstado = {}, porResponsable = {};
            const atascados = { mas15: [], mas30: [] };
            (data || []).forEach(exp => {
                porEstado[exp.estado_actual] = (porEstado[exp.estado_actual] || 0) + 1;
                porResponsable[exp.responsable_bloqueo] = (porResponsable[exp.responsable_bloqueo] || 0) + 1;
                if (exp.dias_en_estado_actual > 30) atascados.mas30.push(exp.numero_expediente);
                else if (exp.dias_en_estado_actual > 15) atascados.mas15.push(exp.numero_expediente);
            });
            return ok({ total_activos: total, por_estado: porEstado, por_responsable: porResponsable, atascados_mas_15_dias: atascados.mas15, atascados_mas_30_dias: atascados.mas30 });
        }
    );

    // ── Tool 5: Por partner ───────────────────────────────────────────────────
    mcp.tool(
        'list_by_partner',
        'Lista los expedientes de un partner o prescriptor concreto.',
        { partner: z.string().describe('Nombre o acrónimo del partner') },
        async ({ partner }) => {
            const { data, error } = await supabase
                .from('v_expedientes_pendientes')
                .select(PENDING_FIELDS)
                .or(`partner_nombre.ilike.%${partner}%,partner_acronimo.ilike.%${partner}%`)
                .order('dias_en_estado_actual', { ascending: false });
            if (error) return err(error.message);
            return ok({ total: (data || []).length, expedientes: data || [] });
        }
    );

    // ── Tool 6: Registrar una incidencia (ESCRITURA) ──────────────────────────
    // Permite que el agente, tras revisar un expediente, deje registrada una
    // incidencia detectada. Se guarda en documentacion.incidencias[] del
    // expediente (mismo formato que la app), en estado ABIERTA, hasta que
    // Brokergy la marque OK/subsanada desde la aplicación.
    mcp.tool(
        'registrar_incidencia',
        'Registra una incidencia detectada en un expediente (control de calidad). Úsalo cuando, tras revisar un expediente, detectes un error o algo que haya que corregir. Queda ABIERTA hasta que Brokergy la marque como subsanada en la app. NO marca nada como resuelto, solo da de alta el problema.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            texto: z.string().describe('Descripción de la incidencia detectada (qué está mal y qué hay que corregir)'),
            severidad: z.enum(['LEVE', 'GRAVE'])
                .optional()
                .describe('GRAVE = hay que tomar acción sí o sí (bloquea/invalida el expediente). LEVE = pasable, solo una observación a tener en cuenta. Si dudas, usa GRAVE. Por defecto GRAVE.'),
            procedencia: z.enum(['REVISION_INTERNA', 'VERIFICACION', 'GESTOR_AUTONOMICO', 'AGENTE_IA'])
                .optional()
                .describe('Origen de la incidencia. Por defecto AGENTE_IA (la detectó el agente). Usa GESTOR_AUTONOMICO o VERIFICACION solo si trasladas un requerimiento de esos organismos.')
        },
        async ({ numero, texto, severidad = 'GRAVE', procedencia = 'AGENTE_IA' }) => {
            const clean = (texto || '').trim();
            if (!clean) return err('El texto de la incidencia es obligatorio.');
            const mal = validarTextoIncidencia(clean, MAX_TEXTO_INCIDENCIA, 'texto de la incidencia');
            if (mal) return err(mal);
            const sev = ['LEVE', 'GRAVE'].includes(severidad) ? severidad : 'GRAVE';

            // Buscar en la TABLA base (no en la vista) para poder leer/escribir documentacion.
            // Vía findExpediente, que lo hace en dos pasos para no des-TOASTear la tabla
            // entera en cada alta de incidencia (ver comentario del helper).
            const hallazgo = await findExpediente(numero);
            if (hallazgo.error) return err(hallazgo.error);
            if (hallazgo.notFound) return ok({ ok: false, message: hallazgo.notFound });
            if (hallazgo.ambiguous) {
                return ok({ ok: false, message: hallazgo.message, coincidencias: hallazgo.ambiguous });
            }

            const exp = hallazgo.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const incidencia = {
                id: `${Date.now()}_inc`,
                texto: clean,
                procedencia,
                severidad: sev,
                estado: 'ABIERTA',
                fecha: new Date().toISOString(),
                usuario: 'AGENTE IA',
                resuelta_at: null,
                resuelta_por: null
            };
            incidencias.push(incidencia);
            docObj.incidencias = incidencias;

            const { error: upErr } = await supabase
                .from('expedientes')
                .update({ documentacion: docObj, updated_at: new Date().toISOString() })
                .eq('id', exp.id);
            if (upErr) return err(upErr.message);

            const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia_registrada: incidencia,
                total_incidencias_abiertas: abiertas.length,
                total_graves_abiertas: abiertas.filter(i => i.severidad === 'GRAVE').length,
                message: `Incidencia ${sev} registrada en ${exp.numero_expediente}. Quedará marcada en la app (rojo si GRAVE, ámbar si LEVE) hasta que se subsane.`
            });
        }
    );

    // ── Tool 6a-bis: Alta EN BLOQUE (ESCRITURA) ───────────────────────────────
    // El caso real: llega un requerimiento del verificador (o del gestor autonómico)
    // con varias inexactitudes de un mismo expediente y hay que darlas todas de alta.
    // Existe como herramienta aparte por SALUD DE LA BD: `registrar_incidencia` hace
    // un read-modify-write completo de `documentacion`, así que N llamadas = N
    // reescrituras de la fila (y N versiones muertas que luego hay que vacuumear),
    // además del riesgo de que dos escrituras concurrentes se pisen. Aquí es
    // 1 lectura + 1 escritura pase lo que pase.
    mcp.tool(
        'registrar_incidencias',
        'Da de alta VARIAS incidencias de golpe en un mismo expediente, en una sola escritura. Úsalo siempre que tengas más de un hallazgo para el mismo expediente — típicamente al trasladar un requerimiento del verificador o del gestor autonómico con varias inexactitudes. Para un único hallazgo suelto usa registrar_incidencia.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            procedencia: z.enum(['REVISION_INTERNA', 'VERIFICACION', 'GESTOR_AUTONOMICO', 'AGENTE_IA'])
                .optional()
                .describe('Origen común de todas ellas. Usa VERIFICACION si trasladas un requerimiento del verificador y GESTOR_AUTONOMICO si viene del organismo autonómico. Por defecto AGENTE_IA.'),
            items: z.array(z.object({
                texto: z.string().describe('Qué está mal y qué hay que corregir. Una incidencia por punto del requerimiento: no juntes varios en un solo texto.'),
                severidad: z.enum(['LEVE', 'GRAVE']).optional().describe('Por defecto GRAVE.')
            })).min(1).max(25).describe('Lista de incidencias a registrar (máximo 25 por llamada).')
        },
        async ({ numero, items, procedencia = 'AGENTE_IA' }) => {
            const limpios = [];
            for (const [k, it] of (items || []).entries()) {
                const clean = (it?.texto || '').trim();
                if (!clean) return err(`El punto ${k + 1} no tiene texto.`);
                const mal = validarTextoIncidencia(clean, MAX_TEXTO_INCIDENCIA, `texto del punto ${k + 1}`);
                if (mal) return err(mal);
                limpios.push({ texto: clean, severidad: it?.severidad === 'LEVE' ? 'LEVE' : 'GRAVE' });
            }

            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const base = Date.now();
            const nuevas = limpios.map((it, k) => ({
                id: `${base + k}_inc`,
                texto: it.texto,
                procedencia,
                severidad: it.severidad,
                estado: 'ABIERTA',
                fecha: new Date().toISOString(),
                usuario: 'AGENTE IA',
                resuelta_at: null,
                resuelta_por: null,
                comentarios: []
            }));
            nuevas.forEach(n => incidencias.push(n));

            const upErr = await persistIncidencias(exp.id, docObj, incidencias);
            if (upErr) return err(upErr);

            const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
            const graves = nuevas.filter(i => i.severidad === 'GRAVE').length;
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                registradas: nuevas.length,
                graves,
                leves: nuevas.length - graves,
                total_incidencias_abiertas: abiertas.length,
                message: `${nuevas.length} incidencia(s) registradas en ${exp.numero_expediente} (${graves} graves / ${nuevas.length - graves} leves), procedencia ${procedencia}. Quedan ${abiertas.length} abiertas en total.`
            });
        }
    );

    // ── Tool 6b: Listar incidencias de un expediente (LECTURA) ────────────────
    // Necesario para poder subsanar/editar/eliminar: devuelve cada incidencia con
    // su nº (índice 1-based) y su id, que se usan como referencia en los tools de
    // escritura de abajo.
    mcp.tool(
        'listar_incidencias',
        'Lista las incidencias registradas en un expediente (abiertas y subsanadas) con su número, texto, severidad y estado. Úsalo antes de subsanar, editar o eliminar una incidencia para saber a cuál te refieres (por su nº o su id).',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            solo_abiertas: z.boolean().optional()
                .describe('Si true, devuelve solo las ABIERTAS (pendientes). Por defecto false: todas.')
        },
        async ({ numero, solo_abiertas = false }) => {
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const all = exp.documentacion?.incidencias || [];
            const list = all
                .map((inc, i) => incView(inc, i))
                .filter(v => !solo_abiertas || v.estado !== 'SUBSANADA');
            const abiertas = all.filter(i => i.estado !== 'SUBSANADA');
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                total: all.length,
                total_abiertas: abiertas.length,
                total_graves_abiertas: abiertas.filter(i => i.severidad === 'GRAVE').length,
                incidencias: list
            });
        }
    );

    // ── Tool 6c: Subsanar (dar por corregida) una incidencia (ESCRITURA) ──────
    mcp.tool(
        'subsanar_incidencia',
        'Marca una incidencia como SUBSANADA (corregida) — equivale al botón "OK" de la app. Úsalo cuando, al volver a revisar un expediente, compruebes que un problema registrado antes ya está resuelto. Hay que explicar CÓMO se ha subsanado: esa explicación queda en el hilo de la incidencia y es lo que leerá un tercero (otro compañero, el verificador) para entenderlo sin preguntar a nadie. La incidencia deja de contar como pendiente (ya no sale en rojo/ámbar).',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            incidencia: z.string().describe('Referencia a la incidencia: su nº en la lista (1, 2, ...), su id, o un fragmento único de su texto. Usa listar_incidencias si no lo tienes.'),
            resolucion: z.string().describe('CÓMO se ha subsanado, en concreto y con datos: qué se ha cambiado, qué documento se ha regenerado o subido, qué se ha comprobado. Escríbelo para que lo entienda alguien que no ha visto el expediente. Ej: "Se ha regenerado el CEE final como SOLO CALEFACCIÓN y se ha subido el .xml nuevo; comprobado que cuadra con la factura y con el RITE."')
        },
        async ({ numero, incidencia, resolucion }) => {
            const detalle = (resolucion || '').trim();
            if (!detalle) return err('Indica cómo se ha subsanado la incidencia (parámetro `resolucion`): es lo que queda registrado para que un tercero lo entienda.');
            const malDetalle = validarTextoIncidencia(detalle, MAX_TEXTO_COMENTARIO, 'texto de la resolución');
            if (malDetalle) return err(malDetalle);

            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const r = resolveIncidencia(incidencias, incidencia);
            if (r.error) return ok({ ok: false, message: r.error });

            if (r.inc.estado === 'SUBSANADA') {
                return ok({ ok: true, expediente: exp.numero_expediente, message: `La incidencia ya estaba subsanada.`, incidencia: incView(r.inc, r.index) });
            }
            r.inc.estado = 'SUBSANADA';
            r.inc.resuelta_at = new Date().toISOString();
            r.inc.resuelta_por = 'AGENTE IA';
            r.inc.resolucion = detalle;
            pushComentario(r.inc, detalle, 'AGENTE IA', 'RESOLUCION');

            const upErr = await persistIncidencias(exp.id, docObj, incidencias);
            if (upErr) return err(upErr);

            const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia: incView(r.inc, r.index),
                total_incidencias_abiertas: abiertas.length,
                message: `Incidencia marcada como SUBSANADA en ${exp.numero_expediente}, con el detalle de cómo se resolvió en su hilo. Quedan ${abiertas.length} abierta(s).`
            });
        }
    );

    // ── Tool 6d: Editar una incidencia (ESCRITURA) ────────────────────────────
    mcp.tool(
        'editar_incidencia',
        'Edita el texto, la severidad o la procedencia de una incidencia ya registrada. Úsalo para corregir o precisar una incidencia (ej: cambiar de GRAVE a LEVE, o reformular la descripción) sin crear una nueva. No cambia su estado abierta/subsanada.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            incidencia: z.string().describe('Referencia a la incidencia: su nº en la lista, su id, o un fragmento único de su texto.'),
            texto: z.string().optional().describe('Nuevo texto de la incidencia (si se quiere cambiar).'),
            severidad: z.enum(['LEVE', 'GRAVE']).optional().describe('Nueva severidad (si se quiere cambiar).'),
            procedencia: z.enum(['REVISION_INTERNA', 'VERIFICACION', 'GESTOR_AUTONOMICO', 'AGENTE_IA']).optional()
                .describe('Nueva procedencia (si se quiere cambiar).')
        },
        async ({ numero, incidencia, texto, severidad, procedencia }) => {
            if (texto === undefined && severidad === undefined && procedencia === undefined) {
                return err('Indica al menos un campo a cambiar (texto, severidad o procedencia).');
            }
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const r = resolveIncidencia(incidencias, incidencia);
            if (r.error) return ok({ ok: false, message: r.error });

            if (texto !== undefined) {
                const clean = (texto || '').trim();
                if (!clean) return err('El texto no puede quedar vacío.');
                const malTexto = validarTextoIncidencia(clean, MAX_TEXTO_INCIDENCIA, 'texto de la incidencia');
                if (malTexto) return err(malTexto);
                r.inc.texto = clean;
            }
            if (severidad !== undefined) {
                // Reclasificar deja traza en el hilo: bajar una GRAVE a LEVE es una
                // decisión que alguien tiene que poder justificar después.
                const anterior = r.inc.severidad || 'GRAVE';
                r.inc.severidad = severidad;
                if (severidad !== anterior) {
                    pushComentario(r.inc, `Reclasificada de ${anterior} a ${severidad}.`, 'AGENTE IA', 'SEVERIDAD');
                }
            }
            if (procedencia !== undefined) r.inc.procedencia = procedencia;
            r.inc.updated_at = new Date().toISOString();

            const upErr = await persistIncidencias(exp.id, docObj, incidencias);
            if (upErr) return err(upErr);

            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia: incView(r.inc, r.index),
                message: `Incidencia actualizada en ${exp.numero_expediente}.`
            });
        }
    );

    // ── Tool 6d-bis: Comentar el hilo de una incidencia (ESCRITURA) ───────────
    // Nota de seguimiento SIN cambiar el estado. Sirve para dejar constancia de lo
    // que se ha ido haciendo (gestiones, esperas, datos pedidos) antes de poder
    // darla por subsanada. Sale en el modal de Incidencias de la app, en el hilo.
    mcp.tool(
        'comentar_incidencia',
        'Añade una nota de seguimiento al hilo de una incidencia, SIN marcarla como subsanada ni cambiar nada más. Úsalo para dejar constancia de lo que se ha hecho o se está esperando (ej: "pedida la factura al instalador el 29/07, sin respuesta todavía"). La nota aparece en el hilo de la incidencia en la app, con autor y fecha. Si el problema ya está resuelto, usa subsanar_incidencia en su lugar.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            incidencia: z.string().describe('Referencia a la incidencia: su nº en la lista, su id, o un fragmento único de su texto.'),
            texto: z.string().describe('Nota de seguimiento, concreta y con fechas/datos si los hay. La leerá otra persona sin más contexto.')
        },
        async ({ numero, incidencia, texto }) => {
            const clean = (texto || '').trim();
            if (!clean) return err('El texto de la nota es obligatorio.');
            const malNota = validarTextoIncidencia(clean, MAX_TEXTO_COMENTARIO, 'texto de la nota');
            if (malNota) return err(malNota);

            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const r = resolveIncidencia(incidencias, incidencia);
            if (r.error) return ok({ ok: false, message: r.error });

            pushComentario(r.inc, clean, 'AGENTE IA', 'NOTA');

            const upErr = await persistIncidencias(exp.id, docObj, incidencias);
            if (upErr) return err(upErr);

            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia: incView(r.inc, r.index),
                message: `Nota añadida al hilo de la incidencia en ${exp.numero_expediente}. La incidencia sigue ${r.inc.estado}.`
            });
        }
    );

    // ── Tool 6d-ter: Aprender de resoluciones anteriores (LECTURA) ────────────
    // Busca en TODOS los expedientes incidencias ya subsanadas parecidas a la que
    // se tiene delante, con la explicación de cómo se resolvieron. Va contra la RPC
    // `buscar_resoluciones_incidencias` (scripts/buscar_resoluciones_incidencias.sql)
    // y NO contra un select de `documentacion`: leer ese JSONB de todas las filas
    // desde aquí es justo el patrón que tumbó la BD el 21/07/2026 (regla 22).
    mcp.tool(
        'buscar_resoluciones',
        'Busca cómo se resolvieron ANTES incidencias parecidas, en cualquier expediente. Úsalo antes de proponer una corrección o de subsanar algo: si el mismo problema ya se ha arreglado otras veces, hazlo igual en vez de improvisar. Devuelve la incidencia original, cómo se subsanó, quién y cuándo. Sin patrón devuelve las últimas resoluciones registradas.',
        {
            patron: z.string().optional()
                .describe('Texto a buscar en la incidencia o en su resolución. Usa una o dos palabras clave del problema (ej: "RITE", "incoherencia CEE", "número de serie"), no una frase larga.'),
            procedencia: z.enum(['REVISION_INTERNA', 'VERIFICACION', 'GESTOR_AUTONOMICO', 'AGENTE_IA']).optional()
                .describe('Filtra por origen. VERIFICACION = requerimientos del verificador: útil para ver cómo se contestaron requerimientos anteriores.'),
            limite: z.number().optional().describe('Máximo de resultados (por defecto 20, tope 50).')
        },
        async ({ patron, procedencia, limite = 20 }) => {
            const { data, error } = await supabase.rpc('buscar_resoluciones_incidencias', {
                p_patron: patron || null,
                p_procedencia: procedencia || null,
                p_limite: limite
            });
            if (error) {
                // La RPC puede no estar desplegada todavía en este entorno.
                if (/function .*buscar_resoluciones_incidencias.* does not exist|PGRST202|schema cache/i.test(error.message || '')) {
                    return err('Falta desplegar en Supabase la función `buscar_resoluciones_incidencias` (implementation/backend/scripts/buscar_resoluciones_incidencias.sql). Hasta entonces, usa listar_incidencias sobre un expediente concreto.');
                }
                return err(error.message);
            }
            const filas = data || [];
            return ok({
                ok: true,
                total: filas.length,
                criterio: { patron: patron || null, procedencia: procedencia || null },
                resoluciones: filas,
                message: filas.length === 0
                    ? 'No hay resoluciones registradas que encajen. Puede ser un caso nuevo, o que se subsanara sin explicar cómo.'
                    : `${filas.length} precedente(s). Reutiliza el criterio que ya se aplicó antes; si esta vez procede otra cosa, di por qué.`
            });
        }
    );

    // ── Tool 6e: Eliminar una incidencia (ESCRITURA / borrado) ────────────────
    mcp.tool(
        'eliminar_incidencia',
        'Elimina por completo una incidencia de un expediente (borrado definitivo, no queda registro). Úsalo cuando una incidencia se registró por error o ya no aplica. Si el problema SÍ existió y se resolvió, es mejor usar subsanar_incidencia (deja traza). Borrar no se puede deshacer.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            incidencia: z.string().describe('Referencia a la incidencia: su nº en la lista, su id, o un fragmento único de su texto.')
        },
        async ({ numero, incidencia }) => {
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const docObj = exp.documentacion || {};
            const incidencias = docObj.incidencias || [];
            const r = resolveIncidencia(incidencias, incidencia);
            if (r.error) return ok({ ok: false, message: r.error });

            const eliminada = incView(r.inc, r.index);
            const next = incidencias.filter((_, k) => k !== r.index);

            const upErr = await persistIncidencias(exp.id, docObj, next);
            if (upErr) return err(upErr);

            const abiertas = next.filter(i => i.estado !== 'SUBSANADA');
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia_eliminada: eliminada,
                total_incidencias_restantes: next.length,
                total_incidencias_abiertas: abiertas.length,
                message: `Incidencia eliminada de ${exp.numero_expediente}. Quedan ${next.length} incidencia(s), ${abiertas.length} abierta(s).`
            });
        }
    );

    // ── Tool 7: Generar el Anexo Fotográfico (ESCRITURA / genera PDF) ──────────
    // Delega en el backend (que tiene Drive + Puppeteer + el diseño). El MCP solo
    // resuelve el número → id y dispara la generación con la clave interna
    // compartida. NO clasifica fotos: exige que ya estén nombradas por slot.
    mcp.tool(
        'generar_anexo_fotografico',
        'Genera el Anexo Fotográfico (reportaje fotográfico de las actuaciones) de un expediente a partir de las fotos YA nombradas por slot en la carpeta de Drive "12. DOCUMENTOS PARA CEE", lo guarda como PDF en "6. ANEXOS CAE" y lo deja enlazado en el expediente, listo para revisar/firmar. Úsalo cuando el usuario pida "genera/crea el anexo fotográfico del expediente NNN". Requiere que las fotos ya estén subidas y nombradas (FOTO_CALDERA_ANTES, FOTO_PLACA_CALDERA_ANTES, FOTO_UNIDAD_EXTERIOR_1, FOTO_VENTANAS_ANTES_1, FOTO_VENTANAS_DESPUES_1, ...). Este tool NO clasifica ni renombra fotos: si faltan, primero hay que subirlas con su nombre de slot.',
        { numero: z.string().describe('Número del expediente, ej: 26RES080_51') },
        async ({ numero }) => {
            // Resolver número → id en la tabla base (como registrar_incidencia).
            const { data: matches, error: findErr } = await supabase
                .from('expedientes')
                .select('id, numero_expediente')
                .ilike('numero_expediente', `%${numero.replace(/\s/g, '')}%`);
            if (findErr) return err(findErr.message);
            if (!matches || matches.length === 0) {
                return ok({ ok: false, message: `No se encontró ningún expediente que coincida con "${numero}".` });
            }
            if (matches.length > 1) {
                return ok({
                    ok: false,
                    message: `Hay ${matches.length} expedientes que coinciden con "${numero}". Indica el número completo.`,
                    coincidencias: matches.map(m => m.numero_expediente)
                });
            }
            const exp = matches[0];

            const base = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000';
            const key = process.env.INTERNAL_API_KEY;
            if (!key) return err('INTERNAL_API_KEY no está configurada en el servidor MCP (añádela al .env).');

            let resp, data;
            try {
                resp = await fetch(`${base}/api/expedientes/${exp.id}/anexo-fotografico/generar`, {
                    method: 'POST',
                    headers: { 'x-internal-key': key, 'Content-Type': 'application/json' },
                    body: '{}',
                });
                data = await resp.json().catch(() => ({}));
            } catch (e) {
                return err(`No se pudo contactar con el backend para generar el anexo: ${e.message}`);
            }
            if (!resp.ok || !data.ok) {
                return ok({
                    ok: false,
                    expediente: exp.numero_expediente,
                    message: data.message || `Error ${resp.status} al generar el anexo fotográfico.`
                });
            }
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                link: data.link,
                fotos: data.numPhotos,
                actuaciones: data.numActuaciones,
                grupos: data.groups,
                message: `Anexo Fotográfico generado con ${data.numPhotos} foto(s) en ${data.numActuaciones} actuación(es) y guardado en "6. ANEXOS CAE". Enlazado en el expediente y listo para revisar/firmar.`
            });
        }
    );

    // ── Tool 8: Estado del Anexo Fotográfico (LECTURA) ────────────────────────
    // Devuelve qué slots de foto espera el expediente (según sus actuaciones),
    // cuáles ya tienen fotos en "12. DOCUMENTOS PARA CEE", cuáles faltan y el
    // drive_folder_id. La skill lo usa para saber con qué NOMBRE renombrar cada
    // foto y qué falta antes de generar.
    mcp.tool(
        'estado_anexo_fotografico',
        'Consulta el estado del Anexo Fotográfico de un expediente ANTES de generarlo: qué slots de foto espera (según sus actuaciones: caldera/aerotermia, ventanas, cubierta, fachada...), cuáles YA tienen foto en "12. DOCUMENTOS PARA CEE", cuáles faltan, y el drive_folder_id del expediente. Úsalo para saber con qué nombre de slot renombrar cada foto y decidir si hace falta clasificar fotos de "2. FOTOS Y VIDEOS".',
        { numero: z.string().describe('Número del expediente, ej: 26RES080_51') },
        async ({ numero }) => {
            const { data: matches, error: findErr } = await supabase
                .from('expedientes')
                .select('id, numero_expediente')
                .ilike('numero_expediente', `%${numero.replace(/\s/g, '')}%`);
            if (findErr) return err(findErr.message);
            if (!matches || matches.length === 0) {
                return ok({ ok: false, message: `No se encontró ningún expediente que coincida con "${numero}".` });
            }
            if (matches.length > 1) {
                return ok({
                    ok: false,
                    message: `Hay ${matches.length} expedientes que coinciden con "${numero}". Indica el número completo.`,
                    coincidencias: matches.map(m => m.numero_expediente)
                });
            }
            const exp = matches[0];
            const base = process.env.BACKEND_INTERNAL_URL || 'http://backend:3000';
            const key = process.env.INTERNAL_API_KEY;
            if (!key) return err('INTERNAL_API_KEY no está configurada en el servidor MCP (añádela al .env).');
            let resp, data;
            try {
                resp = await fetch(`${base}/api/expedientes/${exp.id}/anexo-fotografico/estado`, {
                    headers: { 'x-internal-key': key },
                });
                data = await resp.json().catch(() => ({}));
            } catch (e) {
                return err(`No se pudo contactar con el backend: ${e.message}`);
            }
            if (!resp.ok || !data.ok) {
                return ok({ ok: false, expediente: exp.numero_expediente, message: data.message || `Error ${resp.status}.` });
            }
            return ok(data);
        }
    );

    // ── Tool 8b: Generar el Certificado CIFO (ESCRITURA / genera PDF) ─────────
    // Delega en el backend (mismo builder que el modal de la app → PDF idéntico).
    // El backend valida, genera, fusiona las fichas técnicas, guarda en Drive y
    // enlaza el slot. Registra incidencias LEVE por lo que falte (GRAVE si es
    // imposible generar). Cubre RES060, RES093, TER100 y TER173 (el RES080 es otro documento).
    mcp.tool(
        'generar_cifo',
        'Genera el CIFO (Certificado de Instalación, RES060/RES093/TER100/TER173) o el Certificado Final de Obra (RES080) de un expediente con el MISMO formato que la app, lo guarda como PDF en "6. ANEXOS CAE" y lo deja enlazado, listo para revisar/firmar. Úsalo cuando el usuario pida "genera/crea el CIFO del expediente NNN", "prepara el certificado de instalación" o "genera el RES080". El backend detecta la tipología por el número. AUTOMÁTICAMENTE adjunta y fusiona TODO lo que justifica el SCOP: la ficha técnica de la aerotermia (copiándola del catálogo si falta en el expediente) y, si el método de SCOP es EPREL, descarga y adjunta el Fiche y el Label de EPREL; además ENRIQUECE el catálogo `aerotermia` (rellena eprel/ficha_tecnica del modelo si le faltaban, para la próxima vez). Validación: si falta algo no crítico lo registra como incidencia LEVE y genera igual; si es imposible (sin demanda/superficie/SCOP/empresa/carpeta en RES060/093, o sin comparativa energética en RES080) NO genera y lo registra como GRAVE. Para regenerar sobre un certificado ya FIRMADO hay que pasar force:true.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_165'),
            force: z.boolean().optional().describe('Regenerar aunque ya exista un CIFO firmado (invalida la firma anterior).'),
        },
        async ({ numero, force }) => {
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });
            const exp = found.exp;

            const r = await backendFetch('POST', `/api/expedientes/${exp.id}/cifo/generar`, { force: force === true });
            if (r.httpError) return err(r.httpError);
            if (!r.okHttp || !r.data?.ok) {
                return ok({
                    ok: false,
                    expediente: exp.numero_expediente,
                    message: r.data?.message || `Error ${r.status} al generar el CIFO.`,
                    bloqueantes: r.data?.blocking || undefined,
                    avisos: r.data?.warnings || undefined,
                    needsConfirm: r.data?.needsConfirm || undefined,
                });
            }
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                tipologia: r.data.tipologia,
                link: r.data.link,
                anexos: r.data.anexos,
                catalogo_actualizado: r.data.catalogo_actualizado,
                avisos: r.data.warnings,
                incidencias_leves: r.data.incidencias_leves,
                message: r.data.message,
            });
        }
    );

    // ── Tool 8c: Estado del CIFO (LECTURA) ────────────────────────────────────
    mcp.tool(
        'estado_cifo',
        'Consulta si se puede generar el CIFO de un expediente ANTES de generarlo: tipología (RES060/RES093/TER100/TER173/RES080), si puede generarse, qué falta que lo BLOQUEA (datos_faltan) y qué avisos LEVES hay, y si ya está generado/firmado. Úsalo para saber si conviene generar o primero completar datos.',
        { numero: z.string().describe('Número del expediente, ej: 26RES060_165') },
        async ({ numero }) => {
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });
            const exp = found.exp;

            const r = await backendFetch('GET', `/api/expedientes/${exp.id}/cifo/estado`);
            if (r.httpError) return err(r.httpError);
            if (!r.okHttp) return ok({ ok: false, expediente: exp.numero_expediente, message: r.data?.message || `Error ${r.status}.` });
            return ok(r.data);
        }
    );

    // ── Tool 9: Datos de contacto y qué falta (LECTURA) ───────────────────────
    // Para preparar un WhatsApp: devuelve a quién iría (cliente / instalador) con el
    // teléfono ENMASCARADO, si es alcanzable, qué documentación falta y los ENLACES
    // públicos donde subirla. El agente usa esto para redactar el mensaje. NO envía.
    mcp.tool(
        'datos_contacto_expediente',
        'Consulta a quién y qué habría que pedir en un expediente para preparar un WhatsApp/email: contacto del CLIENTE y del INSTALADOR (nombre, teléfono enmascarado, si es alcanzable), qué documentación falta de cada uno y los ENLACES públicos donde subirla. Úsalo ANTES de redactar el mensaje que le enseñas al usuario. Este tool NO envía nada.',
        { numero: z.string().describe('Número del expediente, ej: 26RES060_118') },
        async ({ numero }) => {
            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });

            const exp = found.exp;
            const r = await backendFetch('GET', `/api/expedientes/${exp.id}/solicitud-info`);
            if (r.httpError) return err(r.httpError);
            if (!r.okHttp) return ok({ ok: false, expediente: exp.numero_expediente, message: r.data?.error || `Error ${r.status}.` });

            const d = r.data;
            const cli = d.cliente || {};
            const ins = d.instalador || {};
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                obra: d.obra || null,
                cliente: {
                    nombre: cli.nombre || null,
                    telefono: maskPhone(cli.tlf),
                    alcanzable_whatsapp: !!cli.tlf,
                    email_disponible: !!cli.email,
                    pendiente: cli.acciones || [],       // cada uno con {titulo, items, url}
                    admin_pendiente: cli.adminPendiente || []
                },
                instalador: {
                    nombre: ins.nombre || null,
                    telefono: maskPhone(ins.tlf),
                    alcanzable_whatsapp: !!ins.tlf,
                    email_disponible: !!ins.email,
                    otros_contactos: Array.isArray(ins.contactos) ? Math.max(0, ins.contactos.length - 1) : 0,
                    pendiente: ins.acciones || []
                },
                nota: 'Los enlaces (url) de cada acción son públicos y pensados para incluirse en el mensaje. Para enviar, usa enviar_whatsapp con destinatario CLIENTE o INSTALADOR.'
            });
        }
    );

    // ── Tool 10: Enviar WhatsApp al cliente / instalador (ESCRITURA) ──────────
    // Envía por la sesión de WhatsApp Business del VPS (misma que la app). El agente
    // NO maneja teléfonos: solo dice el expediente y el destinatario (CLIENTE /
    // INSTALADOR); el backend resuelve el número desde la BD. Por seguridad el modo
    // por defecto es 'borrador' (no envía): solo con modo='enviar' se manda de verdad.
    mcp.tool(
        'enviar_whatsapp',
        'Envía un WhatsApp al CLIENTE o al INSTALADOR de un expediente por la sesión de WhatsApp Business de Brokergy, y lo deja registrado en el historial del expediente. SEGURIDAD: el modo por defecto es "borrador" (NO envía, solo te devuelve a quién iría y el texto para que lo confirmes). Solo cuando el usuario dé el visto bueno, vuelve a llamar con modo="enviar". El agente no maneja el número: se resuelve en el backend desde la ficha del cliente/instalador.',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            destinatario: z.enum(['CLIENTE', 'INSTALADOR']).describe('A quién se envía. El número lo resuelve el backend desde la BD.'),
            mensaje: z.string().describe('Texto del WhatsApp a enviar (ya redactado, con los enlaces de subida si aplica). Se admite *negrita* estilo WhatsApp.'),
            solicitado: z.array(z.string()).optional().describe('Lista corta de lo que se pide (ej: ["Factura de la obra","Anexo I firmado"]). Se guarda en el historial para trazabilidad.'),
            modo: z.enum(['borrador', 'enviar']).optional().describe('"borrador" (por defecto) = NO envía, solo previsualiza destinatario + mensaje. "enviar" = manda el WhatsApp de verdad. Usa "enviar" solo tras el visto bueno del usuario.')
        },
        async ({ numero, destinatario, mensaje, solicitado = [], modo = 'borrador' }) => {
            const clean = (mensaje || '').trim();
            if (!clean) return err('El mensaje no puede estar vacío.');

            const found = await findExpediente(numero);
            if (found.error) return err(found.error);
            if (found.notFound) return ok({ ok: false, message: found.notFound });
            if (found.ambiguous) return ok({ ok: false, message: found.message, coincidencias: found.ambiguous });
            const exp = found.exp;

            // Resolver el contacto para saber si es alcanzable y mostrar el teléfono enmascarado.
            const info = await backendFetch('GET', `/api/expedientes/${exp.id}/solicitud-info`);
            if (info.httpError) return err(info.httpError);
            const target = destinatario === 'CLIENTE' ? (info.data?.cliente || {}) : (info.data?.instalador || {});
            const tlf = target.tlf || null;

            if (!tlf) {
                return ok({
                    ok: false,
                    expediente: exp.numero_expediente,
                    message: `No hay teléfono del ${destinatario.toLowerCase()} en la ficha, no se puede enviar el WhatsApp. Revisa el contacto en la app.`
                });
            }

            // BORRADOR: no envía, solo devuelve la previsualización para el visto bueno.
            if (modo !== 'enviar') {
                return ok({
                    ok: true,
                    modo: 'borrador',
                    enviado: false,
                    expediente: exp.numero_expediente,
                    iria_a: { destinatario, nombre: target.nombre || null, telefono: maskPhone(tlf) },
                    mensaje: clean,
                    aviso: 'Esto es un BORRADOR, no se ha enviado nada. Enséñaselo al usuario y, si da el visto bueno, vuelve a llamar con modo="enviar".'
                });
            }

            // ENVIAR: delega en el endpoint que ya envía por WhatsApp y registra historial.
            const send = await backendFetch('POST', `/api/expedientes/${exp.id}/solicitar-faltantes`, {
                target: destinatario,
                channels: ['whatsapp'],
                mensaje: clean,
                solicitado: Array.isArray(solicitado) ? solicitado : []
            });
            if (send.httpError) return err(send.httpError);
            if (!send.okHttp || !send.data?.ok) {
                return ok({ ok: false, expediente: exp.numero_expediente, message: send.data?.error || `Error ${send.status} al enviar el WhatsApp.` });
            }
            const canales = (send.data.channels || []).join(', ');
            const encolado = canales.toLowerCase().includes('encolado');
            return ok({
                ok: true,
                modo: 'enviar',
                enviado: true,
                expediente: exp.numero_expediente,
                destinatario,
                nombre: target.nombre || null,
                telefono: maskPhone(tlf),
                canal: canales || 'WhatsApp',
                message: encolado
                    ? `Mensaje ENCOLADO (la sesión de WhatsApp no está lista ahora mismo): saldrá en cuanto reconecte. Registrado en el historial de ${exp.numero_expediente}.`
                    : `WhatsApp enviado al ${destinatario.toLowerCase()} (${target.nombre || ''}, ${maskPhone(tlf)}) y registrado en el historial de ${exp.numero_expediente}.`
            });
        }
    );

    // ══════════════════════════════════════════════════════════════════════════
    // PRESUPUESTOS — «hazle un presupuesto a Juan Pérez de un CEE y la
    // legalización de placas en nave industrial y mándaselo por WhatsApp».
    // Todo por el backend (/api/facturacion, staffOClaveInterna). Mismo patrón que
    // enviar_whatsapp: se crea en BORRADOR, se enseña y solo sale con el «sí».
    // ══════════════════════════════════════════════════════════════════════════

    // ── Tool 11: Catálogo de artículos (LECTURA) ──────────────────────────────
    mcp.tool(
        'buscar_articulos',
        'Consulta el CATÁLOGO de artículos con los que se hacen los presupuestos: nombre, familia, precio SIN IVA, % de IVA, si es suplido (tasa: sin IVA ni descuento), sus VARIANTES con su precio (ej: «Legalización FV» → vivienda unifamiliar / nave industrial), qué partidas ARRASTRA (ej: un CEE arrastra su tasa de registro) y si al aceptarse abre un expediente CEE. Sin texto devuelve todo el catálogo. Úsalo para contestar precios o antes de crear_presupuesto si dudas de qué artículo es.',
        { texto: z.string().optional().describe('Lo que se busca, sin importar tildes (ej: "CEE", "legalización placas", "nave"). Vacío = todo el catálogo.') },
        { readOnlyHint: true, openWorldHint: false },
        async ({ texto }) => {
            const r = await backendFetch('GET', '/api/facturacion/articulos');
            if (r.httpError || !r.okHttp) return err(errorBackend(r, 'artículos'));
            const catalogo = listaDe(r.data, 'articulos').filter(a => a && a.activo !== false);
            const porId = new Map(catalogo.map(a => [a.id, a]));
            let filas = catalogo;
            const ts = terminos(texto);
            if (ts.length) {
                filas = catalogo
                    .map(a => {
                        const pajar = pajarArticulo(a) + (Array.isArray(a.variantes) ? a.variantes : []).map(v => ` ${sinTildes(v.nombre)} `).join('|');
                        return { a, n: ts.filter(t => casa(t, pajar)).length };
                    })
                    .filter(x => x.n > 0)
                    .sort((x, y) => y.n - x.n)
                    .map(x => x.a);
            }
            return ok({
                ok: true,
                total: filas.length,
                nota: 'Precios SIN IVA. Las partidas de «arrastra» se añaden solas al presupuesto (salvo sin_arrastre en la línea).',
                articulos: filas.map(a => vistaArticulo(a, porId)),
            });
        }
    );

    // ── Tool 12: Buscar el cliente del presupuesto (LECTURA) ──────────────────
    // `GET /api/clientes` no sirve aquí: exige sesión (enforceAuth, no la clave
    // interna), no filtra y trae TODOS los clientes con sus relaciones. Se lee
    // `clientes` directamente, solo columnas ligeras, como el resto de lecturas del MCP.
    mcp.tool(
        'buscar_cliente_presupuesto',
        'Busca CLIENTES (fichas de la tabla clientes) por nombre y apellidos, DNI, email o teléfono, sin importar tildes, para saber a quién va un presupuesto. Devuelve su id_cliente (el que pide crear_presupuesto), nombre, DNI y teléfono ENMASCARADOS, email enmascarado, municipio y partner. Si salen varios, pregunta al usuario cuál es antes de crear nada; si no sale ninguno, el presupuesto se crea con cliente_nuevo.',
        { texto: z.string().describe('Nombre y/o apellidos, DNI, email o teléfono del cliente (ej: "Juan Pérez").') },
        { readOnlyHint: true, openWorldHint: false },
        async ({ texto }) => {
            const b = await buscarClientes(texto, 15);
            if (b.error) return err(b.error);
            return ok({
                ok: true,
                total: b.total,
                mostrados: b.clientes.length,
                clientes: b.clientes.map(vistaCliente),
                message: b.total === 0
                    ? `No hay ningún cliente que encaje con «${texto}». Si es nuevo, crear_presupuesto con cliente_nuevo (nombre y teléfono).`
                    : b.total === 1
                        ? 'Un cliente: usa su id_cliente en crear_presupuesto.'
                        : `${b.total} clientes encajan: pregunta al usuario cuál es (por municipio, DNI o partner) antes de crear el presupuesto.`
            });
        }
    );

    // ── Tool 13: Crear el presupuesto en BORRADOR (ESCRITURA, no envía) ───────
    mcp.tool(
        'crear_presupuesto',
        'Crea un PRESUPUESTO en estado BORRADOR. NO lo envía a nadie. Las líneas se dicen como las dice el usuario (artículo por id o por nombre, variante, uds, precio sin IVA, % de descuento): el servidor las resuelve contra el catálogo sin tildes y, si alguna es ambigua o no existe, NO crea nada y devuelve las opciones para que preguntes. Las partidas que arrastra un artículo (tasas) las añade el backend solo, salvo sin_arrastre:true en esa línea. Devuelve el nº, las líneas con importes, base, IVA, total, a quién iría (enmascarado) y el texto del mensaje que se enviaría: enséñaselo TODO al usuario y pregúntale si lo envías (eso es enviar_presupuesto). Ojo: escribe en la base de datos real.',
        {
            cliente_id: z.string().optional().describe('id_cliente del cliente (de buscar_cliente_presupuesto). Si se da, no se usa cliente_nuevo.'),
            cliente_nuevo: z.object({
                nombre: z.string().describe('Nombre y apellidos o razón social.'),
                telefono: z.string().optional().describe('Teléfono que da el usuario (sin él no se le puede mandar por WhatsApp).'),
                email: z.string().optional().describe('Email, si lo da el usuario.'),
            }).optional().describe('Solo si el cliente NO existe (buscar_cliente_presupuesto no lo encontró). Se da de alta una ficha rápida.'),
            forzar_cliente_nuevo: z.boolean().optional().describe('true = crear la ficha nueva aunque haya clientes con un nombre o teléfono parecido. Úsalo solo si el usuario confirma que es otra persona.'),
            lineas: z.array(z.object({
                articulo: z.string().describe('id del artículo o su nombre tal como se dice (ej: "CEE", "legalización de placas en nave industrial").'),
                variante: z.string().optional().describe('id o nombre de la variante (ej: "nave industrial"). Si no se da, se deduce del texto del artículo solo si no hay duda.'),
                uds: z.number().positive().optional().describe('Unidades. Por defecto 1.'),
                precio: z.number().nonnegative().optional().describe('Precio unitario SIN IVA. Si no se da, el del catálogo (o el de la variante).'),
                dto: z.number().min(0).max(100).optional().describe('% de descuento sobre esta línea.'),
                detalle: z.string().max(500).optional().describe('Aclaración que sale debajo del concepto (ej: "Vivienda en C/ Mayor 3").'),
                sin_arrastre: z.boolean().optional().describe('true = NO añadir las partidas que este artículo arrastra (p.ej. la tasa).'),
            })).min(1).max(30).describe('Partidas del presupuesto.'),
            inmueble: z.object({
                direccion: z.string().optional(),
                municipio: z.string().optional(),
                provincia: z.string().optional(),
                codigo_postal: z.string().optional(),
                ref_catastral: z.string().optional(),
            }).optional().describe('Inmueble del trabajo, si se conoce (el cliente lo completa al aceptar).'),
            observaciones: z.string().max(2000).optional().describe('Texto libre PARA EL CLIENTE (plazos, qué incluye, qué tiene que aportar): sale en el PDF y en la página de aceptación. Sin él no sale ningún bloque de observaciones; la política de entrega (nada hasta aceptarlo y pagarlo) la pone el PDF siempre, no se repite aquí.'),
            prescriptor: z.string().optional().describe('Partner que lo trae: id, acrónimo o nombre.'),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ cliente_id, cliente_nuevo, forzar_cliente_nuevo, lineas, inmueble, observaciones, prescriptor }) => {
            // ── Cliente ──
            let clienteBody;
            if (cliente_id) {
                if (!UUID_RE.test(String(cliente_id).trim())) {
                    return err('cliente_id tiene que ser el id_cliente que devuelve buscar_cliente_presupuesto (un UUID), no un nombre.');
                }
                clienteBody = { cliente_id: String(cliente_id).trim() };
            } else if (cliente_nuevo?.nombre?.trim()) {
                const nombre = cliente_nuevo.nombre.trim();
                const tlf = cliente_nuevo.telefono ? String(cliente_nuevo.telefono).replace(/[^\d+]/g, '') : null;
                if (tlf && tlf.replace(/\D/g, '').length < 9) return err('El teléfono del cliente nuevo tiene menos de 9 cifras: compruébalo con el usuario.');
                const email = cliente_nuevo.email ? String(cliente_nuevo.email).trim().toLowerCase() : null;
                if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('El email del cliente nuevo no parece válido: compruébalo con el usuario.');
                if (!forzar_cliente_nuevo) {
                    // Antes de dar de alta una ficha, ¿ya existe? (un duplicado deja al
                    // cliente partido en dos fichas). Se enseñan, no se casan solos: un
                    // mismo móvil figura en fichas de personas distintas.
                    const vistos = new Map();
                    const porNombre = await buscarClientes(nombre, 8);
                    if (porNombre.error) return err(porNombre.error);
                    for (const c of porNombre.clientes) vistos.set(c.id_cliente, c);
                    if (tlf) {
                        const porTlf = await buscarClientes(tlf, 8);
                        if (!porTlf.error) for (const c of porTlf.clientes) vistos.set(c.id_cliente, c);
                    }
                    if (vistos.size) {
                        return ok({
                            ok: false,
                            creado: false,
                            message: `Ya hay ${vistos.size} cliente(s) con un nombre o teléfono parecido a «${nombre}». Pregunta al usuario si es uno de ellos (y usa su id_cliente) o si es otra persona (entonces repite con forzar_cliente_nuevo: true).`,
                            posibles_clientes: [...vistos.values()].map(vistaCliente),
                        });
                    }
                }
                clienteBody = { cliente_nuevo: { nombre, tlf, email } };
            } else {
                return err('Falta el cliente: pasa cliente_id (de buscar_cliente_presupuesto) o cliente_nuevo con su nombre.');
            }

            // ── Partner ──
            let prescriptorId = null;
            if (prescriptor) {
                const rp = await resolverPrescriptor(prescriptor);
                if (rp.error) return ok({ ok: false, creado: false, message: rp.error, opciones: rp.opciones || [] });
                prescriptorId = rp.id;
            }

            // ── Líneas contra el catálogo ──
            const ra = await backendFetch('GET', '/api/facturacion/articulos');
            if (ra.httpError || !ra.okHttp) return err(errorBackend(ra, 'artículos'));
            const catalogo = listaDe(ra.data, 'articulos').filter(a => a && a.activo !== false);
            if (!catalogo.length) return err('El catálogo de artículos está vacío.');

            const cuerpoLineas = [];
            const porResolver = [];
            lineas.forEach((l, k) => {
                const n = k + 1;
                const art = resolverArticulo(catalogo, l.articulo);
                if (!art.articulo) {
                    porResolver.push({
                        linea: n, dicho: l.articulo,
                        motivo: art.ambiguo ? 'Encaja con varios artículos: pregunta cuál.' : 'No hay ningún artículo así en el catálogo.',
                        opciones: art.opciones || []
                    });
                    return;
                }
                const a = art.articulo;
                const va = resolverVariante(a, l.variante, art.sobrantes);
                if (va.error) {
                    porResolver.push({ linea: n, dicho: l.variante ? `${l.articulo} · ${l.variante}` : l.articulo, articulo: a.nombre, motivo: va.error, opciones: va.opciones || [] });
                    return;
                }
                const v = va.variante;
                const precio = l.precio ?? numOrNull(v?.precio) ?? numOrNull(a.precio);
                cuerpoLineas.push({
                    articulo_id: a.id,
                    variante_id: v ? v.id : null,
                    uds: l.uds ?? 1,
                    precio,
                    dtoPct: l.dto ?? 0,
                    detalle: l.detalle?.trim() || undefined,
                    ...(l.sin_arrastre ? { sin_arrastre: true } : {}),
                });
            });
            if (porResolver.length) {
                return ok({
                    ok: false,
                    creado: false,
                    message: 'No se ha creado nada: hay líneas que no se pueden resolver sin preguntar. Enséñale al usuario las opciones y repite con el id del artículo/variante que elija.',
                    lineas_por_resolver: porResolver,
                });
            }

            // ── Alta (BORRADOR: sin `envio`) ──
            const inm = inmueble || {};
            const body = {
                ...clienteBody,
                lineas: cuerpoLineas,
                expandir_arrastre: true,
                direccion: inm.direccion?.trim() || undefined,
                municipio: inm.municipio?.trim() || undefined,
                provincia: inm.provincia?.trim() || undefined,
                codigo_postal: inm.codigo_postal?.trim() || undefined,
                ref_catastral: inm.ref_catastral ? inm.ref_catastral.replace(/\s+/g, '').toUpperCase() : undefined,
                observaciones: observaciones?.trim() || undefined,
                prescriptor_id: prescriptorId || undefined,
            };
            const r = await backendFetch('POST', '/api/facturacion/presupuestos', body);
            if (r.httpError || !r.okHttp) {
                return ok({ ok: false, creado: false, message: errorBackend(r, 'crear el presupuesto'), opciones: r.data?.opciones || undefined });
            }
            const p = r.data?.presupuesto || r.data || {};
            marcarVisto(p.id, p.mensaje, true);
            const vista = vistaPresupuesto(p);
            return ok({
                ok: true,
                creado: true,
                enviado: false,
                ...vista,
                aviso: `Presupuesto ${p.numero || ''} creado en BORRADOR: NO se ha enviado nada. Enséñale al usuario las líneas, el total (${vista.total ?? '¿?'} € con IVA), a quién va y el mensaje ENTERO, y pregúntale si lo envías. Solo con su «sí»: enviar_presupuesto(numero, canales, modo="enviar").`
                    + (!vista.destino.alcanzable_whatsapp ? ' OJO: el cliente no tiene teléfono en la ficha, por WhatsApp no se le puede enviar.' : ''),
            });
        }
    );

    // ── Tool 14: Enviar el presupuesto (ESCRITURA con salvaguarda) ────────────
    mcp.tool(
        'enviar_presupuesto',
        'Envía un presupuesto al CLIENTE por WhatsApp y/o email (PDF + enlace de aceptación) y lo deja registrado. SEGURIDAD, igual que enviar_whatsapp: el modo por defecto es "borrador" (NO envía: devuelve el mensaje completo, el adjunto, el total y a quién iría, enmascarado). NUNCA uses modo="enviar" sin que el usuario haya visto en esta conversación ese mensaje ENTERO y el total y te haya dado un «sí» explícito a ESE envío; aunque la petición original dijera «mándaselo», primero el borrador. El teléfono y el email no se dictan: el backend usa los de la ficha del cliente.',
        {
            numero: z.string().describe('Número del presupuesto (ej: "P-26ING_40"; vale "26ING_40" o solo "40" si no hay duda).'),
            canales: z.array(z.enum(['whatsapp', 'email'])).min(1).optional().describe('Por dónde se envía. Por defecto ["whatsapp"].'),
            mensaje: z.string().max(4000).optional().describe('Texto propio del mensaje. Si no se da, el que propone el backend (el que devolvió crear_presupuesto o el borrador).'),
            modo: z.enum(['borrador', 'enviar']).optional().describe('"borrador" (por defecto) = NO envía, solo enseña. "enviar" = lo manda de verdad: solo tras el «sí» del usuario.'),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async ({ numero, canales = ['whatsapp'], mensaje, modo = 'borrador' }) => {
            const chans = [...new Set(canales)];
            const propio = mensaje && mensaje.trim() ? mensaje.trim() : null;
            const rp = await resolverPresupuesto(numero);
            if (rp.error) return err(rp.error);
            if (rp.notFound) return ok({ ok: false, message: rp.notFound });
            if (rp.ambiguous) return ok({ ok: false, message: rp.message, coincidencias: rp.ambiguous });
            const fila = rp.pres;

            // Lo que se mandaría (y a quién): siempre se pide, también para enviar,
            // para avisar si el canal no tiene destinatario.
            const rm = await backendFetch('GET', `/api/facturacion/presupuestos/${fila.id}/mensaje`);
            if (rm.httpError || !rm.okHttp) return ok({ ok: false, numero: fila.numero, message: errorBackend(rm, 'preparar el mensaje') });
            const d = rm.data || {};
            const p = d.presupuesto || d;
            const destino = destinoEnmascarado(p.destino || d.destino || {});
            const textoDefecto = p.mensaje ?? d.mensaje ?? null;
            const texto = propio || textoDefecto;
            const estado = p.estado || fila.estado || null;
            const sinDestino = chans.filter(c => (c === 'whatsapp' ? !destino.alcanzable_whatsapp : !destino.email_disponible));
            const numeroP = p.numero || fila.numero;
            const total = numOrNull(p.total ?? d.total ?? fila.total);

            if (modo !== 'enviar') {
                marcarVisto(fila.id, texto, !propio);
                return ok({
                    ok: true,
                    modo: 'borrador',
                    enviado: false,
                    numero: numeroP,
                    estado,
                    cliente: destino.nombre,
                    iria_por: chans,
                    iria_a: destino,
                    total_con_iva: total,
                    base_imponible: numOrNull(p.neto ?? d.neto ?? fila.neto),
                    iva: numOrNull(p.iva ?? d.iva ?? fila.iva),
                    adjunto: d.adjunto || p.adjunto || d.filename || d.pdf_nombre || `PDF del presupuesto ${numeroP}`,
                    url_aceptacion: p.url_aceptacion || d.url_aceptacion || d.url || undefined,
                    mensaje: texto,
                    ...(sinDestino.length ? { sin_destinatario: sinDestino.map(c => c === 'whatsapp' ? 'El cliente no tiene teléfono en la ficha: por WhatsApp no sale.' : 'El cliente no tiene email en la ficha: por email no sale.') } : {}),
                    aviso: 'BORRADOR: no se ha enviado nada. Enséñale al usuario el mensaje ENTERO, el total y a quién va, y pregúntale si lo envías. Solo con su «sí» vuelve a llamar con modo="enviar" y el MISMO texto.'
                });
            }

            // ENVIAR: solo lo que el usuario ya ha visto en esta sesión.
            const visto = presupuestosVistos.get(fila.id);
            const yaVisto = visto && (propio ? visto.textos.has(normMensaje(propio)) : (visto.defecto || (texto && visto.textos.has(normMensaje(texto)))));
            if (!yaVisto) {
                return ok({
                    ok: false,
                    enviado: false,
                    numero: numeroP,
                    message: 'No se ha enviado: este texto no se ha enseñado como borrador en esta sesión. Llama primero con modo="borrador", enséñale al usuario el mensaje entero y el total, y espera su «sí». (Si la conexión se reinició, vuelve a pedir el borrador y comprueba que es el mismo texto que aprobó.)'
                });
            }
            if (sinDestino.length === chans.length) {
                return ok({ ok: false, enviado: false, numero: numeroP, message: `No se puede enviar: ${sinDestino.map(c => c === 'whatsapp' ? 'el cliente no tiene teléfono' : 'el cliente no tiene email').join(' y ')} en su ficha. Complétalo en la app.` });
            }

            const rs = await backendFetch('POST', `/api/facturacion/presupuestos/${fila.id}/enviar`, { canales: chans, ...(propio ? { mensaje: propio } : {}) });
            const resultados = Object.fromEntries(Object.entries(rs.data?.resultados || {}).map(([k, x]) => [k, {
                ok: !!x?.ok,
                a: x?.to ? (k === 'whatsapp' ? maskPhone(x.to) : maskEmail(x.to)) : undefined,
                error: x?.error || undefined,
            }]));
            if (rs.httpError || !rs.okHttp) {
                return ok({ ok: false, enviado: false, numero: numeroP, message: errorBackend(rs, 'enviar el presupuesto'), resultados });
            }
            const canalesOk = rs.data?.canalesOk || rs.data?.canales_ok
                || Object.entries(resultados).filter(([, x]) => x.ok).map(([k]) => k);
            if (!canalesOk.length) {
                return ok({ ok: false, enviado: false, numero: numeroP, message: 'No ha salido por ningún canal.', resultados });
            }
            // Un segundo envío necesita otro borrador y otro «sí».
            presupuestosVistos.delete(fila.id);
            const fallidos = Object.entries(resultados).filter(([, x]) => !x.ok).map(([k, x]) => `${k}: ${x.error || 'falló'}`);
            return ok({
                ok: true,
                modo: 'enviar',
                enviado: true,
                numero: numeroP,
                cliente: destino.nombre,
                canales: canalesOk,
                resultados,
                total_con_iva: total,
                message: `Presupuesto ${numeroP} enviado por ${canalesOk.join(' y ')} a ${destino.nombre || 'el cliente'}${destino.telefono && canalesOk.includes('whatsapp') ? ` (${destino.telefono})` : ''}.`
                    + (fallidos.length ? ` No salió por: ${fallidos.join('; ')}.` : ''),
            });
        }
    );

    // ── Tool 15: Listado de presupuestos (LECTURA) ────────────────────────────
    mcp.tool(
        'listar_presupuestos',
        'Lista los presupuestos con su nº, cliente, concepto, total con IVA, estado y días desde el último envío. Úsalo para el seguimiento: "¿qué presupuestos tengo sin contestar?", "¿cuáles llevan más de una semana enviados?", "¿qué le mandé a García?".',
        {
            estado: z.enum(['BORRADOR', 'ENVIADA', 'ACEPTADA', 'RECHAZADA', 'ANULADA']).optional().describe('Filtrar por estado. ENVIADA = esperando respuesta del cliente.'),
            texto: z.string().optional().describe('Buscar por nº, cliente o concepto.'),
            limite: z.number().optional().describe('Máximo de resultados (por defecto 30, tope 100).'),
        },
        { readOnlyHint: true, openWorldHint: false },
        async ({ estado, texto, limite = 30 }) => {
            const qs = new URLSearchParams({ todas: '1' });
            if (estado) qs.set('estado', estado);
            if (texto && texto.trim()) qs.set('q', texto.trim());
            const r = await backendFetch('GET', `/api/facturacion/presupuestos?${qs.toString()}`);
            if (r.httpError || !r.okHttp) return err(errorBackend(r, 'presupuestos'));
            let filas = listaDe(r.data, 'presupuestos');
            if (estado) filas = filas.filter(f => String(f.estado || '').toUpperCase() === estado);
            const tope = Math.min(Math.max(1, limite || 30), 100);
            const vista = filas.slice(0, tope).map(f => {
                const envio = f.ultimo_envio?.at || f.enviado_at || f.enviada_at
                    || (Array.isArray(f.envios) && f.envios.length ? f.envios[f.envios.length - 1]?.at : null);
                return {
                    numero: f.numero,
                    cliente: f.cliente_nombre || f.cliente?.nombre || null,
                    concepto: f.concepto || (f.alcance ? `CEE ${String(f.alcance).toLowerCase()}` : null),
                    total_con_iva: numOrNull(f.total),
                    estado: f.estado,
                    creado: f.created_at ? String(f.created_at).slice(0, 10) : null,
                    dias_desde_envio: diasDesde(envio),
                };
            });
            return ok({ ok: true, total: filas.length, mostrados: vista.length, presupuestos: vista });
        }
    );

    // ── Tool 16: Anular / rechazar / duplicar (ESCRITURA) ─────────────────────
    mcp.tool(
        'cambiar_estado_presupuesto',
        'Cambia el estado de un presupuesto: "anular" (lo retira: ya no se puede aceptar), "rechazar" (el cliente ha dicho que no) o "duplicar" (crea uno NUEVO en BORRADOR con las mismas líneas, para cambiarlo o reenviarlo). Confirma con el usuario antes de anular o rechazar. Duplicar no envía nada.',
        {
            numero: z.string().describe('Número del presupuesto (ej: "P-26ING_40").'),
            accion: z.enum(['anular', 'rechazar', 'duplicar']).describe('Qué hacer con él.'),
        },
        { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        async ({ numero, accion }) => {
            const rp = await resolverPresupuesto(numero);
            if (rp.error) return err(rp.error);
            if (rp.notFound) return ok({ ok: false, message: rp.notFound });
            if (rp.ambiguous) return ok({ ok: false, message: rp.message, coincidencias: rp.ambiguous });
            const fila = rp.pres;
            const r = await backendFetch('POST', `/api/facturacion/presupuestos/${fila.id}/${accion}`, {});
            if (r.httpError || !r.okHttp) return ok({ ok: false, numero: fila.numero, message: errorBackend(r, `${accion} el presupuesto`) });
            if (accion === 'duplicar') {
                const p = r.data?.presupuesto || r.data || {};
                if (p.id && p.mensaje) marcarVisto(p.id, p.mensaje, true);
                return ok({
                    ok: true,
                    origen: fila.numero,
                    nuevo: vistaPresupuesto(p),
                    message: `Duplicado ${fila.numero} → ${p.numero || 'nuevo presupuesto'} en BORRADOR. No se ha enviado nada.`
                });
            }
            return ok({
                ok: true,
                numero: fila.numero,
                estado: r.data?.estado || r.data?.presupuesto?.estado || (accion === 'anular' ? 'ANULADA' : 'RECHAZADA'),
                message: `Presupuesto ${fila.numero} ${accion === 'anular' ? 'anulado' : 'marcado como rechazado'}.`
            });
        }
    );

    // ═════════════════════════════════════════════════════════════════════════
    // FACTURAS — «hazle la factura a X», «la de Fran de este mes», «¿qué me
    // deben?». Todo por el backend (/api/facturacion/facturas). Emitir y enviar
    // son dos «sí» distintos: el número legal no se tira y el envío sale fuera.
    // ═════════════════════════════════════════════════════════════════════════

    // Detalle + mensaje de una factura ya resuelta (para enseñarla).
    const detalleFactura = async (id) => {
        const r = await backendFetch('GET', `/api/facturacion/facturas/${id}`);
        if (r.httpError || !r.okHttp) return { error: errorBackend(r, 'la factura') };
        return { f: r.data };
    };

    // ── Tool 17: Listado de facturas (LECTURA) ────────────────────────────────
    mcp.tool(
        'listar_facturas',
        'Lista las FACTURAS con su nº, cliente, concepto, total, estado (Borrador, Pendiente, Vencida, Cobrada, Rectificada) y el resumen del periodo: facturado (base), cobrado, pendiente y vencido. Úsalo para "¿qué me deben?", "¿qué facturas están vencidas?", "¿cuánto he facturado este año?", "la última factura de Fran".',
        {
            serie: z.enum(['ING', 'FML']).optional().describe('ING = BROKERGY; FML = Fran como profesional. Sin ella, las dos.'),
            estado: z.enum(['BORRADOR', 'PENDIENTE', 'VENCIDA', 'PAGADA', 'RECTIFICADA']).optional().describe('PENDIENTE = emitida sin cobrar y sin vencer; PAGADA = cobrada.'),
            anio: z.number().int().optional().describe('Año de la fecha de la factura. Por defecto, el actual.'),
            texto: z.string().optional().describe('Buscar por nº, cliente, NIF, concepto o expediente.'),
            limite: z.number().optional().describe('Máximo de filas (por defecto 30, tope 100).'),
        },
        { readOnlyHint: true, openWorldHint: false },
        async ({ serie, estado, anio, texto, limite = 30 }) => {
            const qs = new URLSearchParams({ anio: String(anio || new Date().getFullYear()) });
            if (serie) qs.set('serie', serie);
            if (estado) qs.set('estado', estado);
            if (texto && texto.trim()) qs.set('q', texto.trim());
            const r = await backendFetch('GET', `/api/facturacion/facturas?${qs.toString()}`);
            if (r.httpError || !r.okHttp) return err(errorBackend(r, 'facturas'));
            const filas = listaDe(r.data, 'facturas');
            const tope = Math.min(Math.max(1, limite || 30), 100);
            return ok({
                ok: true,
                resumen: r.data?.resumen || null,
                total: filas.length,
                mostradas: Math.min(tope, filas.length),
                facturas: filas.slice(0, tope).map(f => ({
                    id: f.numero ? undefined : f.id,
                    numero: f.numero || '(borrador)',
                    serie: f.serie,
                    fecha: f.fecha,
                    vence: f.vencimiento,
                    cliente: f.cliente_nombre,
                    concepto: f.concepto,
                    total: numOrNull(f.total),
                    estado: f.visible?.texto || f.estado,
                    origen: f.origen !== 'APP' ? f.origen : undefined,
                })),
            });
        }
    );

    // ── Tool 18: Crear una factura en BORRADOR (ESCRITURA, ni numera ni envía) ─
    mcp.tool(
        'crear_factura',
        'Prepara una FACTURA en BORRADOR (sin número, sin enviar). Las líneas, por artículo del catálogo (como en crear_presupuesto: arrastra su tasa) o como concepto libre con su precio. Serie ING (BROKERGY, por defecto) o FML (Fran como profesional: lleva retención de IRPF). Devuelve el borrador con sus líneas y totales: enséñaselo al usuario. Para darle número: emitir_factura. Ojo: escribe en la base de datos real.',
        {
            serie: z.enum(['ING', 'FML']).optional().describe('ING (por defecto) o FML.'),
            cliente_id: z.string().optional().describe('id_cliente (de buscar_cliente_presupuesto).'),
            cliente_nuevo: z.object({
                nombre: z.string(),
                telefono: z.string().optional(),
                email: z.string().optional(),
            }).optional().describe('Solo si el cliente NO existe: ficha rápida. Sus datos fiscales (NIF, domicilio) hay que completarlos antes de emitir.'),
            cliente_fiscal: z.object({
                razon_social: z.string(),
                nif: z.string(),
                direccion: z.string().optional(),
                cp: z.string().optional(),
                municipio: z.string().optional(),
                provincia: z.string().optional(),
                email: z.string().optional(),
            }).optional().describe('A quién se factura, tecleado, si no tiene ficha de cliente (p. ej. una empresa).'),
            lineas: z.array(z.object({
                articulo: z.string().optional().describe('id o nombre del artículo del catálogo.'),
                variante: z.string().optional(),
                concepto: z.string().optional().describe('Concepto libre (sin artículo). Entonces precio es obligatorio.'),
                uds: z.number().optional().describe('Unidades. Por defecto 1.'),
                precio: z.number().optional().describe('Precio unitario SIN IVA.'),
                iva_pct: z.number().min(0).max(21).optional().describe('% de IVA de un concepto libre. Por defecto 21.'),
                dto: z.number().min(0).max(100).optional(),
                detalle: z.string().max(500).optional(),
                suplido: z.boolean().optional().describe('true = suplido (una tasa pagada por cuenta del cliente): sin IVA ni descuento.'),
                sin_arrastre: z.boolean().optional(),
            })).min(1).max(30),
            irpf_pct: z.number().min(0).max(50).optional().describe('% de retención. Por defecto el de la serie (FML 15, ING 0).'),
            fecha: z.string().optional().describe('AAAA-MM-DD. Por defecto hoy.'),
            fecha_operacion: z.string().optional().describe('Si el servicio es de otro periodo, p. ej. "octubre 2026".'),
            expediente: z.string().optional().describe('Nº de expediente u obra al que se refiere.'),
            observaciones: z.string().max(2000).optional().describe('Si no se dan, las de la serie.'),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ serie = 'ING', cliente_id, cliente_nuevo, cliente_fiscal, lineas, irpf_pct, fecha, fecha_operacion, expediente, observaciones }) => {
            let clienteBody;
            if (cliente_id) {
                if (!UUID_RE.test(String(cliente_id).trim())) return err('cliente_id tiene que ser el id_cliente (un UUID) de buscar_cliente_presupuesto.');
                clienteBody = { cliente_id: String(cliente_id).trim() };
            } else if (cliente_fiscal?.razon_social?.trim()) {
                const c = cliente_fiscal;
                clienteBody = { cliente: { razon_social: c.razon_social.trim().toUpperCase(), cif: String(c.nif || '').replace(/[\s.-]/g, '').toUpperCase(), direccion: c.direccion, cp: c.cp, municipio: c.municipio, provincia: c.provincia, email: c.email } };
            } else if (cliente_nuevo?.nombre?.trim()) {
                const tlf = cliente_nuevo.telefono ? String(cliente_nuevo.telefono).replace(/[^\d+]/g, '') : null;
                clienteBody = { cliente_nuevo: { nombre: cliente_nuevo.nombre.trim(), tlf, email: cliente_nuevo.email?.trim().toLowerCase() || null } };
            } else {
                return err('Falta a quién se factura: cliente_id, cliente_fiscal o cliente_nuevo.');
            }

            let catalogo = null;
            const cuerpoLineas = [];
            const porResolver = [];
            for (const [k, l] of lineas.entries()) {
                const n = k + 1;
                if (!l.articulo) {
                    if (!l.concepto?.trim() || l.precio == null) { porResolver.push({ linea: n, motivo: 'Una línea sin artículo necesita concepto y precio.' }); continue; }
                    cuerpoLineas.push({ descripcion: l.concepto.trim(), uds: l.uds ?? 1, precio: l.precio, ivaPct: l.suplido ? 0 : (l.iva_pct ?? 21), dtoPct: l.suplido ? 0 : (l.dto ?? 0), detalle: l.detalle?.trim() || undefined, suplido: !!l.suplido });
                    continue;
                }
                if (!catalogo) {
                    const ra = await backendFetch('GET', '/api/facturacion/articulos');
                    if (ra.httpError || !ra.okHttp) return err(errorBackend(ra, 'artículos'));
                    catalogo = listaDe(ra.data, 'articulos').filter(a => a && a.activo !== false);
                }
                const art = resolverArticulo(catalogo, l.articulo);
                if (!art.articulo) {
                    porResolver.push({ linea: n, dicho: l.articulo, motivo: art.ambiguo ? 'Encaja con varios artículos: pregunta cuál.' : 'No hay ningún artículo así en el catálogo.', opciones: art.opciones || [] });
                    continue;
                }
                const va = resolverVariante(art.articulo, l.variante, art.sobrantes);
                if (va.error) { porResolver.push({ linea: n, articulo: art.articulo.nombre, motivo: va.error, opciones: va.opciones || [] }); continue; }
                cuerpoLineas.push({
                    articulo_id: art.articulo.id, variante_id: va.variante ? va.variante.id : null, uds: l.uds ?? 1,
                    precio: l.precio ?? numOrNull(va.variante?.precio) ?? numOrNull(art.articulo.precio), dtoPct: l.dto ?? 0,
                    detalle: l.detalle?.trim() || undefined, ...(l.sin_arrastre ? { sin_arrastre: true } : {}),
                });
            }
            if (porResolver.length) {
                return ok({ ok: false, creado: false, message: 'No se ha creado nada: hay líneas que no se pueden resolver sin preguntar.', lineas_por_resolver: porResolver });
            }

            const r = await backendFetch('POST', '/api/facturacion/facturas', {
                serie, ...clienteBody, lineas: cuerpoLineas, expandir_arrastre: true,
                ...(irpf_pct != null ? { irpf_pct } : {}),
                ...(fecha ? { fecha } : {}), ...(fecha_operacion ? { fecha_operacion } : {}),
                ...(expediente ? { expediente: expediente.trim().toUpperCase() } : {}),
                ...(observaciones != null ? { observaciones } : {}),
            });
            if (r.httpError || !r.okHttp) return ok({ ok: false, creado: false, message: errorBackend(r, 'crear la factura') });
            const f = r.data?.factura || {};
            return ok({
                ok: true, creado: true, emitida: false, ...vistaFactura(f),
                revision: f.revision || undefined,
                aviso: 'Factura en BORRADOR: sin número y sin enviar. Enséñale al usuario las líneas y el total. Para darle número: emitir_factura(id, modo="revisar") y, con su «sí», modo="emitir".',
            });
        }
    );

    // ── Tool 19: Facturar un presupuesto aceptado (ESCRITURA, borrador) ───────
    mcp.tool(
        'facturar_presupuesto',
        'Prepara en BORRADOR la factura de un PRESUPUESTO (sus partidas tal cual, a su cliente). Si el presupuesto ya tiene factura, no hace otra salvo otra_mas:true (confírmalo antes con el usuario). No numera ni envía.',
        {
            numero: z.string().describe('Nº del presupuesto (ej: "P-26ING_40").'),
            otra_mas: z.boolean().optional().describe('true = hacer otra aunque ya tenga factura.'),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ numero, otra_mas }) => {
            const rp = await resolverPresupuesto(numero);
            if (rp.error) return err(rp.error);
            if (rp.notFound) return ok({ ok: false, message: rp.notFound });
            if (rp.ambiguous) return ok({ ok: false, message: rp.message, coincidencias: rp.ambiguous });
            const r = await backendFetch('POST', `/api/facturacion/facturas/desde-presupuesto/${rp.pres.id}`, { otraMas: !!otra_mas });
            if (r.status === 409) return ok({ ok: false, message: r.data?.error || 'Ese presupuesto ya tiene factura.', facturas: r.data?.facturas || [] });
            if (r.httpError || !r.okHttp) return ok({ ok: false, message: errorBackend(r, 'facturar el presupuesto') });
            const f = r.data?.factura || {};
            return ok({ ok: true, ...vistaFactura(f), revision: f.revision || undefined, aviso: `Borrador de la factura del presupuesto ${rp.pres.numero}. Sin número ni envío: emitir_factura cuando el usuario lo apruebe.` });
        }
    );

    // ── Tool 20: Duplicar una factura (ESCRITURA, borrador) ───────────────────
    mcp.tool(
        'duplicar_factura',
        'Crea un BORRADOR copia de una factura con fecha de hoy y el MES del concepto avanzado uno («septiembre 2026» → «octubre 2026»). Es la forma de hacer la FML de cada mes: duplicar_factura de la última FML (listar_facturas serie FML). No numera ni envía.',
        { factura: z.string().describe('Nº de la factura que se copia (ej: "26FML_18") o su id.') },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ factura }) => {
            const rf = await resolverFactura(factura);
            if (rf.error) return err(rf.error);
            if (rf.notFound) return ok({ ok: false, message: rf.notFound });
            if (rf.ambiguous) return ok({ ok: false, message: rf.message, coincidencias: rf.ambiguous });
            const r = await backendFetch('POST', `/api/facturacion/facturas/${rf.fac.id}/duplicar`, {});
            if (r.httpError || !r.okHttp) return ok({ ok: false, message: errorBackend(r, 'duplicar la factura') });
            const f = r.data?.factura || {};
            return ok({ ok: true, copia_de: rf.fac.numero || factura, ...vistaFactura(f), revision: f.revision || undefined, aviso: 'Borrador creado. Enséñaselo al usuario (sobre todo el concepto y la fecha de operación) y, con su «sí», emitir_factura.' });
        }
    );

    // ── Tool 21: Emitir (ESCRITURA IRREVERSIBLE: número legal) ────────────────
    mcp.tool(
        'emitir_factura',
        'EMITE un borrador: le da el NÚMERO legal de la serie, lo anota en el libro de facturas, lo encadena en VERI*FACTU y genera el PDF. Una factura emitida ya no se borra ni se cambia: se rectifica. modo="revisar" (por defecto) NO emite: devuelve la factura, el número que le tocará y los errores o avisos. Solo con el «sí» del usuario a ESA revisión: modo="emitir". No envía nada.',
        {
            factura: z.string().describe('id del borrador (el que devolvió crear_factura, duplicar_factura o facturar_presupuesto).'),
            modo: z.enum(['revisar', 'emitir']).optional(),
        },
        { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
        async ({ factura, modo = 'revisar' }) => {
            const rf = await resolverFactura(factura);
            if (rf.error) return err(rf.error);
            if (rf.notFound) return ok({ ok: false, message: rf.notFound });
            if (rf.ambiguous) return ok({ ok: false, message: rf.message, coincidencias: rf.ambiguous });
            const d = await detalleFactura(rf.fac.id);
            if (d.error) return err(d.error);
            const f = d.f;
            if (f.estado !== 'BORRADOR') return ok({ ok: false, message: `La factura ya está emitida (${f.numero}).`, factura: vistaFactura(f) });

            if (modo !== 'emitir') {
                let proximo = null;
                if (f.tipo === 'F1') {
                    const rn = await backendFetch('GET', `/api/facturacion/facturas/proximo?serie=${f.serie}`);
                    proximo = rn.okHttp ? rn.data?.numero || null : null;
                }
                facturasRevisadas.set(f.id, true);
                const errores = f.revision?.errores || [];
                return ok({
                    ok: true, modo: 'revisar', emitida: false,
                    numero_que_tocara: proximo || (f.tipo !== 'F1' ? `la siguiente rectificativa R-…${f.serie}_n` : '¿?'),
                    ...vistaFactura(f),
                    errores, avisos: f.revision?.avisos || [],
                    aviso: errores.length
                        ? 'NO se puede emitir: corrige antes los errores (en la app o rehaciendo el borrador).'
                        : 'Enséñale al usuario todo esto y dile que, emitida, no se borra ni se cambia (se rectifica). Solo con su «sí»: modo="emitir".',
                });
            }

            if (!facturasRevisadas.has(f.id)) {
                return ok({ ok: false, emitida: false, message: 'No se ha emitido: primero modo="revisar", enséñale la factura al usuario y espera su «sí».' });
            }
            const r = await backendFetch('POST', `/api/facturacion/facturas/${f.id}/emitir`, {});
            if (r.httpError || !r.okHttp) {
                return ok({ ok: false, emitida: false, message: errorBackend(r, 'emitir la factura'), errores: r.data?.errores, avisos: r.data?.avisos });
            }
            facturasRevisadas.delete(f.id);
            const e = r.data || {};
            return ok({
                ok: true, emitida: true, numero: e.numero, total_a_pagar: numOrNull(e.total), avisos: e.avisos || [],
                pdf: e.pdf ? 'Generado y archivado.' : `No se ha generado el PDF (${e.errorPdf || 'error'}): la factura SÍ está emitida; se rehace desde la app.`,
                message: `Factura ${e.numero} emitida. NO se ha enviado: si el usuario quiere mandarla, enviar_factura("${e.numero}") en borrador.`,
            });
        }
    );

    // ── Tool 22: Enviar una factura emitida (ESCRITURA con salvaguarda) ───────
    mcp.tool(
        'enviar_factura',
        'Envía una factura EMITIDA al cliente por WhatsApp y/o email con su PDF. Igual que enviar_presupuesto: modo="borrador" (por defecto) NO envía, devuelve el mensaje entero y a quién iría (enmascarado); modo="enviar" solo tras el «sí» del usuario a ESE mensaje.',
        {
            factura: z.string().describe('Nº de la factura (ej: "26ING_59").'),
            canales: z.array(z.enum(['whatsapp', 'email'])).min(1).optional().describe('Por defecto ["whatsapp"].'),
            mensaje: z.string().max(4000).optional(),
            modo: z.enum(['borrador', 'enviar']).optional(),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
        async ({ factura, canales = ['whatsapp'], mensaje, modo = 'borrador' }) => {
            const chans = [...new Set(canales)];
            const propio = mensaje && mensaje.trim() ? mensaje.trim() : null;
            const rf = await resolverFactura(factura);
            if (rf.error) return err(rf.error);
            if (rf.notFound) return ok({ ok: false, message: rf.notFound });
            if (rf.ambiguous) return ok({ ok: false, message: rf.message, coincidencias: rf.ambiguous });
            const id = rf.fac.id;
            const rm = await backendFetch('GET', `/api/facturacion/facturas/${id}/mensaje`);
            if (rm.httpError || !rm.okHttp) return ok({ ok: false, message: errorBackend(rm, 'preparar el mensaje') });
            const d = rm.data || {};
            if (d.estado === 'BORRADOR') return ok({ ok: false, message: 'Es un borrador: primero hay que emitirla (emitir_factura).' });
            const destino = destinoEnmascarado(d.destino || {});
            const texto = propio || d.mensaje || null;
            const sinDestino = chans.filter(c => (c === 'whatsapp' ? !destino.alcanzable_whatsapp : !destino.email_disponible));

            if (modo !== 'enviar') {
                marcarFacturaVista(id, texto, !propio);
                return ok({
                    ok: true, modo: 'borrador', enviado: false, numero: d.numero, total_a_pagar: numOrNull(d.total),
                    cliente: destino.nombre, iria_por: chans, iria_a: destino, adjunto: d.adjunto, mensaje: texto,
                    ...(sinDestino.length ? { sin_destinatario: sinDestino.map(c => c === 'whatsapp' ? 'No hay teléfono en la ficha: por WhatsApp no sale.' : 'No hay email en la ficha: por email no sale.') } : {}),
                    aviso: 'BORRADOR: no se ha enviado nada. Enséñale al usuario el mensaje ENTERO y a quién va, y pregúntale si lo envías.',
                });
            }

            const visto = facturasVistas.get(id);
            const yaVisto = visto && (propio ? visto.textos.has(normMensaje(propio)) : (visto.defecto || (texto && visto.textos.has(normMensaje(texto)))));
            if (!yaVisto) return ok({ ok: false, enviado: false, message: 'No se ha enviado: este texto no se ha enseñado como borrador en esta sesión. Pide primero el borrador y espera el «sí».' });
            if (sinDestino.length === chans.length) return ok({ ok: false, enviado: false, message: 'No hay destinatario para ningún canal en la ficha del cliente: complétalo en la app.' });

            const rs = await backendFetch('POST', `/api/facturacion/facturas/${id}/enviar`, { canales: chans, ...(propio ? { mensaje: propio } : {}) });
            const resultados = Object.fromEntries(Object.entries(rs.data?.resultados || {}).map(([k, x]) => [k, {
                ok: !!x?.ok, a: x?.to ? (k === 'whatsapp' ? maskPhone(x.to) : maskEmail(x.to)) : undefined, error: x?.error || undefined,
            }]));
            if (rs.httpError || !rs.okHttp) return ok({ ok: false, enviado: false, message: errorBackend(rs, 'enviar la factura'), resultados });
            const canalesOk = rs.data?.canalesOk || Object.entries(resultados).filter(([, x]) => x.ok).map(([k]) => k);
            if (!canalesOk.length) return ok({ ok: false, enviado: false, message: 'No ha salido por ningún canal.', resultados });
            facturasVistas.delete(id);
            return ok({ ok: true, enviado: true, numero: d.numero, canales: canalesOk, resultados, message: `Factura ${d.numero} enviada por ${canalesOk.join(' y ')} a ${destino.nombre || 'el cliente'}.` });
        }
    );

    // ── Tool 23: Cobro (ESCRITURA) ────────────────────────────────────────────
    mcp.tool(
        'cobro_factura',
        'Marca una factura emitida como COBRADA (o deshace el cobro). Se marca también en el libro de facturas. Las de un CEE directo o de la gestión CAE se cobran desde su expediente (lo dice el error).',
        {
            factura: z.string().describe('Nº de la factura.'),
            cobrada: z.boolean().optional().describe('true (por defecto) = cobrada; false = deshacer.'),
            fecha: z.string().optional().describe('Fecha del cobro AAAA-MM-DD. Por defecto hoy.'),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
        async ({ factura, cobrada = true, fecha }) => {
            const rf = await resolverFactura(factura);
            if (rf.error) return err(rf.error);
            if (rf.notFound) return ok({ ok: false, message: rf.notFound });
            if (rf.ambiguous) return ok({ ok: false, message: rf.message, coincidencias: rf.ambiguous });
            const r = await backendFetch('POST', `/api/facturacion/facturas/${rf.fac.id}/cobro`, { pagada: cobrada, ...(fecha ? { fecha } : {}) });
            if (r.httpError || !r.okHttp) return ok({ ok: false, message: errorBackend(r, 'marcar el cobro') });
            return ok({ ok: true, numero: rf.fac.numero, estado: r.data?.estado, fecha_pago: r.data?.fecha_pago, aviso: r.data?.avisoHoja || undefined });
        }
    );

    // ── Tool 24: Rectificar (ESCRITURA, borrador) ─────────────────────────────
    mcp.tool(
        'rectificar_factura',
        'Prepara la factura RECTIFICATIVA de una emitida, en BORRADOR (no numera ni envía). Por defecto ANULA la factura entera (sus líneas en negativo). Tipo R4 (error u otra causa, lo normal) o R1 (impago, descuento o devolución posterior, art. 80 LIVA). Confirma el motivo con el usuario. Se emite después con emitir_factura.',
        {
            factura: z.string().describe('Nº de la factura que se rectifica.'),
            motivo: z.string().min(3).max(500).describe('Por qué se rectifica (sale en la factura).'),
            tipo: z.enum(['R4', 'R1']).optional(),
        },
        { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
        async ({ factura, motivo, tipo = 'R4' }) => {
            const rf = await resolverFactura(factura);
            if (rf.error) return err(rf.error);
            if (rf.notFound) return ok({ ok: false, message: rf.notFound });
            if (rf.ambiguous) return ok({ ok: false, message: rf.message, coincidencias: rf.ambiguous });
            const r = await backendFetch('POST', `/api/facturacion/facturas/${rf.fac.id}/rectificar`, { motivo: motivo.trim(), tipo });
            if (r.httpError || !r.okHttp) return ok({ ok: false, message: errorBackend(r, 'rectificar la factura') });
            const f = r.data?.factura || {};
            return ok({ ok: true, ...vistaFactura(f), aviso: `Rectificativa de ${rf.fac.numero} en BORRADOR. Enséñasela al usuario; con su «sí», emitir_factura(id, modo="revisar") y luego "emitir".` });
        }
    );

    return mcp;
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
// NO usamos express.json() globalmente — el SDK de MCP lee el body
// directamente del stream HTTP. Si express.json() consume el stream primero,
// el SDK recibe un stream vacío y devuelve 400.

// Health check público
app.get('/health', (_, res) => res.json({ ok: true, service: 'brokergy-mcp', ts: new Date().toISOString() }));

// Auth middleware
function requireApiKey(req, res, next) {
    const expected = process.env.MCP_API_KEY;
    if (!expected) return next();
    const provided = req.headers['x-api-key']
        || req.query.key
        || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (provided !== expected) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// ─── Sesiones MCP ─────────────────────────────────────────────────────────────
// Protocolo MCP 2025-03-26: StreamableHTTP — POST para RPC, GET para SSE
const sessions = new Map(); // sessionId → { transport, server }

// Leer body crudo del stream (el SDK necesita el objeto ya parseado cuando
// nosotros consumimos el stream primero — lo pasamos como 3er arg a handleRequest)
function readBody(req) {
    return new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', chunk => raw += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(raw)); }
            catch (e) { reject(e); }
        });
        req.on('error', reject);
    });
}

// POST /sse — inicializar nueva sesión o reanudar existente
app.post('/sse', requireApiKey, async (req, res) => {
    // Leemos el body primero para poder inspeccionar el método antes de rutear.
    // Esto nos permite distinguir "sesión expirada + tools/call" de "nueva sesión".
    let body;
    try {
        body = await readBody(req);
    } catch {
        return res.status(400).json({ error: 'Invalid JSON body' });
    }

    const sessionId = req.headers['mcp-session-id'];

    // Sesión existente → reenviar al transport correcto (pasamos body ya parseado)
    if (sessionId && sessions.has(sessionId)) {
        const { transport } = sessions.get(sessionId);
        await transport.handleRequest(req, res, body);
        return;
    }

    // Sesión desconocida/expirada (p.ej. el server se reinició y perdió la sesión
    // en memoria) + petición que NO es initialize: respondemos HTTP 404, que es lo
    // que marca el spec de MCP (Streamable HTTP). Ante un 404 con Mcp-Session-Id,
    // el cliente (claude.ai / Cowork) DEBE reiniciar la sesión automáticamente
    // enviando un initialize nuevo — sin que el usuario tenga que reconectar a mano,
    // y sin que el conector se quede en "no conectado". (Devolver 200+error rompía
    // esa auto-recuperación; devolver 400 daba "Server not initialized".)
    if (sessionId && !sessions.has(sessionId) && body?.method !== 'initialize') {
        return res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: body?.id ?? null
        });
    }

    // Nueva sesión (o re-initialize tras expiración): strip del ID antiguo si lo hay
    if (sessionId) delete req.headers['mcp-session-id'];

    // onsessioninitialized guarda la sesión en el momento exacto en que el SDK
    // asigna el ID (antes de enviar la respuesta HTTP).
    let server;
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
            sessions.set(sid, { transport, server });
        }
    });

    server = createMcpServer();

    transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
    };

    await server.connect(transport);
    await transport.handleRequest(req, res, body);
});

// GET /sse — abre stream SSE para notificaciones del servidor al cliente
app.get('/sse', requireApiKey, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (!sessionId || !sessions.has(sessionId)) {
        return res.status(404).json({ error: 'Session not found. POST /sse first.' });
    }
    const { transport } = sessions.get(sessionId);
    await transport.handleRequest(req, res);
});

// DELETE /sse — cerrar sesión
app.delete('/sse', requireApiKey, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    if (sessionId && sessions.has(sessionId)) {
        sessions.delete(sessionId);
        res.status(200).json({ ok: true });
    } else {
        res.status(404).json({ error: 'Session not found' });
    }
});

// ─── Arrancar ─────────────────────────────────────────────────────────────────
const PORT = process.env.MCP_PORT || 3001;
app.listen(PORT, () => {
    console.log(`🔗 Brokergy MCP Server corriendo en puerto ${PORT}`);
    console.log(`   Endpoint: http://localhost:${PORT}/sse`);
    console.log(`   Health:   http://localhost:${PORT}/health`);
    console.log(`   API Key:  ${process.env.MCP_API_KEY ? '✅ configurada' : '⚠️  NO configurada'}`);
});
