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
            const { data: matches, error: findErr } = await supabase
                .from('expedientes')
                .select('id, numero_expediente, documentacion')
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

    // Sesión expirada (server reiniciado) + petición que NO es initialize:
    // devolver un error claro y accionable en lugar del críptico "Server not initialized".
    if (sessionId && !sessions.has(sessionId) && body?.method !== 'initialize') {
        return res.status(200).json({
            jsonrpc: '2.0',
            error: {
                code: -32001,
                message: 'La sesión MCP expiró porque el servidor se reinició. ' +
                    'Ve a claude.ai → Conectores → MCP BROKERGY → Desconectar → Conectar de nuevo.'
            },
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
