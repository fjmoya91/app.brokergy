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

    return mcp;
}

// ─── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
app.use(express.json());

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
// Protocolo MCP 2025-03-26: StreamableHTTP usa POST para todo y GET para SSE
const sessions = new Map(); // sessionId → { transport, server }

// POST /sse — inicializar o reanudar sesión (protocolo nuevo)
app.post('/sse', requireApiKey, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];

    if (sessionId && sessions.has(sessionId)) {
        // Sesión existente: reutilizar transport
        const { transport } = sessions.get(sessionId);
        await transport.handleRequest(req, res, req.body);
        return;
    }

    // Nueva sesión
    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
    });

    const server = createMcpServer();
    await server.connect(transport);

    transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid) sessions.delete(sid);
    };

    // Guardar sesión al asignarle ID
    const origInit = transport._sessionId;
    await transport.handleRequest(req, res, req.body);

    // Guardar después de que se asigne el sessionId
    if (transport.sessionId) {
        sessions.set(transport.sessionId, { transport, server });
    }
});

// GET /sse — stream SSE (el cliente escucha mensajes del servidor)
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
