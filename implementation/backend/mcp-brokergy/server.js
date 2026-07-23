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
        resuelta_por: inc.resuelta_por || null
    };
}

// ─── Factoría: crea un McpServer con todas las herramientas registradas ───────
// Se llama una vez por sesión (el StreamableHTTPServerTransport es por sesión)
function createMcpServer() {
    const mcp = new McpServer({ name: 'brokergy-expedientes', version: '1.0.0' });

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
        'Marca una incidencia como SUBSANADA (corregida) — equivale al botón "OK" de la app. Úsalo cuando, al volver a revisar un expediente, compruebes que un problema registrado antes ya está resuelto. Deja constancia de quién y cuándo. La incidencia deja de contar como pendiente (ya no sale en rojo/ámbar).',
        {
            numero: z.string().describe('Número del expediente, ej: 26RES060_118'),
            incidencia: z.string().describe('Referencia a la incidencia: su nº en la lista (1, 2, ...), su id, o un fragmento único de su texto. Usa listar_incidencias si no lo tienes.')
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

            if (r.inc.estado === 'SUBSANADA') {
                return ok({ ok: true, expediente: exp.numero_expediente, message: `La incidencia ya estaba subsanada.`, incidencia: incView(r.inc, r.index) });
            }
            r.inc.estado = 'SUBSANADA';
            r.inc.resuelta_at = new Date().toISOString();
            r.inc.resuelta_por = 'AGENTE IA';

            const upErr = await persistIncidencias(exp.id, docObj, incidencias);
            if (upErr) return err(upErr);

            const abiertas = incidencias.filter(i => i.estado !== 'SUBSANADA');
            return ok({
                ok: true,
                expediente: exp.numero_expediente,
                incidencia: incView(r.inc, r.index),
                total_incidencias_abiertas: abiertas.length,
                message: `Incidencia marcada como SUBSANADA en ${exp.numero_expediente}. Quedan ${abiertas.length} abierta(s).`
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
                r.inc.texto = clean;
            }
            if (severidad !== undefined) r.inc.severidad = severidad;
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
    // imposible generar). Cubre RES060 y RES093 (el RES080 es otro documento).
    mcp.tool(
        'generar_cifo',
        'Genera el CIFO (Certificado de Instalación, RES060/RES093) o el Certificado Final de Obra (RES080) de un expediente con el MISMO formato que la app, lo guarda como PDF en "6. ANEXOS CAE" y lo deja enlazado, listo para revisar/firmar. Úsalo cuando el usuario pida "genera/crea el CIFO del expediente NNN", "prepara el certificado de instalación" o "genera el RES080". El backend detecta la tipología por el número. AUTOMÁTICAMENTE adjunta y fusiona TODO lo que justifica el SCOP: la ficha técnica de la aerotermia (copiándola del catálogo si falta en el expediente) y, si el método de SCOP es EPREL, descarga y adjunta el Fiche y el Label de EPREL; además ENRIQUECE el catálogo `aerotermia` (rellena eprel/ficha_tecnica del modelo si le faltaban, para la próxima vez). Validación: si falta algo no crítico lo registra como incidencia LEVE y genera igual; si es imposible (sin demanda/superficie/SCOP/empresa/carpeta en RES060/093, o sin comparativa energética en RES080) NO genera y lo registra como GRAVE. Para regenerar sobre un certificado ya FIRMADO hay que pasar force:true.',
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
        'Consulta si se puede generar el CIFO de un expediente ANTES de generarlo: tipología (RES060/RES093/RES080), si puede generarse, qué falta que lo BLOQUEA (datos_faltan) y qué avisos LEVES hay, y si ya está generado/firmado. Úsalo para saber si conviene generar o primero completar datos.',
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
