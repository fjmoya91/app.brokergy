/**
 * ============================================================
 * BROKERGY MCP SERVER — Consultas de Expedientes para Claude
 * ============================================================
 *
 * Servidor MCP remoto (HTTP + SSE) que expone las vistas de ciclo
 * de vida de expedientes como herramientas para un Claude Project.
 *
 * Deploy en VPS:
 *   cd mcp-brokergy && npm install && node server.js
 *
 * Nginx (añadir al config del VPS):
 *   location /mcp/ {
 *       proxy_pass http://localhost:3001/;
 *       proxy_http_version 1.1;
 *       proxy_set_header Connection '';          # SSE requiere keep-alive
 *       proxy_set_header Host $host;
 *       proxy_buffering off;                     # SSE requiere sin buffer
 *       proxy_cache off;
 *       proxy_read_timeout 3600s;
 *   }
 *
 * Conectar en claude.ai → Settings → Integrations → Add MCP Server:
 *   URL: https://app.brokergy.es/mcp/sse
 *   Header: x-api-key: <valor de MCP_API_KEY en .env>
 *
 * Variables de entorno necesarias (.env del backend o variables propias):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   MCP_API_KEY          ← clave secreta para proteger el endpoint
 *   MCP_PORT             ← puerto local (default: 3001)
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// ─── Supabase ─────────────────────────────────────────────────────────────────
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── MCP Server ───────────────────────────────────────────────────────────────
const mcp = new McpServer({
    name: 'brokergy-expedientes',
    version: '1.0.0',
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const LIFECYCLE_FIELDS = [
    'numero_expediente', 'cliente_id', 'estado_actual', 'dias_en_estado_actual',
    'responsable_bloqueo', 'campos_pendientes', 'seguimiento_cee_inicial', 'seguimiento_cee_final',
    'cee_ini_visita_ok', 'cee_ini_firma_ok', 'cee_ini_registro_ok',
    'cee_fin_visita_ok', 'cee_fin_firma_ok', 'cee_fin_registro_ok',
    'anexo_i_generado', 'anexo_i_enviado', 'anexo_i_firmado',
    'cesion_generada', 'cesion_enviada', 'cesion_firmada',
    'ficha_res060_generada', 'cert_cifo_generado', 'cert_cifo_enviado', 'cert_cifo_firmado',
    'cert_rite_subido', 'facturas_ok', 'anomalias_docs'
].join(', ');

const PENDING_FIELDS = [
    'numero_expediente', 'cliente_nombre', 'partner_nombre', 'partner_acronimo',
    'estado_actual', 'responsable_bloqueo', 'dias_en_estado_actual', 'campos_pendientes',
    'docs_generados_total', 'docs_firmados_total', 'docs_enviados_total', 'anomalias_docs'
].join(', ');

function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function err(msg) {
    return { content: [{ type: 'text', text: `Error: ${msg}` }] };
}

// ─── Tool 1: Detalle de un expediente por número ──────────────────────────────
mcp.tool(
    'get_expediente',
    'Obtiene el estado completo del ciclo de vida de un expediente. Úsalo cuando el usuario pregunte por un número concreto (ej: 26RES060_118).',
    { numero: z.string().describe('Número del expediente, ej: 26RES060_118 o 26RES080_05') },
    async ({ numero }) => {
        const { data, error } = await supabase
            .from('v_expedientes_lifecycle')
            .select(LIFECYCLE_FIELDS)
            .ilike('numero_expediente', `%${numero.replace(/\s/g, '')}%`)
            .maybeSingle();

        if (error) return err(error.message);
        if (!data) return ok({ found: false, message: `No se encontró ningún expediente con el número "${numero}".` });
        return ok({ found: true, expediente: data });
    }
);

// ─── Tool 2: Buscar por nombre de cliente ─────────────────────────────────────
mcp.tool(
    'search_by_client',
    'Busca expedientes por nombre o apellidos del cliente. Úsalo cuando el usuario diga "el expediente de García" o "los expedientes de María".',
    { nombre: z.string().describe('Nombre, apellido o parte del nombre del cliente') },
    async ({ nombre }) => {
        // Busca en v_expedientes_pendientes (tiene cliente_nombre ya unido)
        const { data: pendientes, error: ep } = await supabase
            .from('v_expedientes_pendientes')
            .select(PENDING_FIELDS)
            .ilike('cliente_nombre', `%${nombre}%`);

        if (ep) return err(ep.message);

        // También buscar en expedientes finalizados via clientes
        const { data: clientes, error: ec } = await supabase
            .from('clientes')
            .select('id_cliente, nombre_razon_social, apellidos, municipio')
            .or(`nombre_razon_social.ilike.%${nombre}%,apellidos.ilike.%${nombre}%`);

        if (ec) return ok({ pendientes: pendientes || [] });

        // Para finalizados: buscar en lifecycle por cliente_id
        const clienteIds = (clientes || []).map(c => c.id_cliente);
        const pendientesIds = new Set((pendientes || []).map(e => e.cliente_nombre));

        let finalizados = [];
        if (clienteIds.length > 0) {
            const { data: fin } = await supabase
                .from('v_expedientes_lifecycle')
                .select('numero_expediente, estado_actual, dias_en_estado_actual, cliente_id')
                .in('cliente_id', clienteIds)
                .eq('estado_actual', 'FINALIZADO');
            finalizados = fin || [];
        }

        return ok({
            pendientes: pendientes || [],
            finalizados,
            clientes_encontrados: clientes || []
        });
    }
);

// ─── Tool 3: Listar expedientes pendientes ────────────────────────────────────
mcp.tool(
    'list_pending',
    'Lista los expedientes activos (no finalizados), con filtros opcionales. Úsalo para "¿qué tengo pendiente?", "¿qué le falta al certificador?" o "¿cuáles llevan más de X días?"',
    {
        responsable: z.enum(['BROKERGY', 'CERTIFICADOR', 'INSTALADOR', 'CLIENTE'])
            .optional()
            .describe('Filtrar por quién bloquea el avance ahora mismo'),
        dias_minimos: z.number().optional()
            .describe('Solo mostrar expedientes con más de N días en el estado actual'),
        estado: z.string().optional()
            .describe('Filtrar por estado exacto, ej: "PTE. FIN OBRA"'),
        limit: z.number().optional()
            .describe('Máximo de resultados a devolver (default: 30)')
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

// ─── Tool 4: Resumen ejecutivo ────────────────────────────────────────────────
mcp.tool(
    'get_summary',
    'Devuelve un resumen del estado global de todos los expedientes activos: cuántos hay, en qué estado, quién bloquea más, cuántos están atascados. Úsalo para preguntas tipo "¿cómo vamos?" o "dame un resumen".',
    {},
    async () => {
        const { data, error } = await supabase
            .from('v_expedientes_pendientes')
            .select('estado_actual, responsable_bloqueo, dias_en_estado_actual, numero_expediente');

        if (error) return err(error.message);

        const total = data?.length || 0;
        const porEstado = {};
        const porResponsable = {};
        const atascados = { mas15: [], mas30: [] };

        (data || []).forEach(exp => {
            porEstado[exp.estado_actual] = (porEstado[exp.estado_actual] || 0) + 1;
            porResponsable[exp.responsable_bloqueo] = (porResponsable[exp.responsable_bloqueo] || 0) + 1;
            if (exp.dias_en_estado_actual > 30) atascados.mas30.push(exp.numero_expediente);
            else if (exp.dias_en_estado_actual > 15) atascados.mas15.push(exp.numero_expediente);
        });

        return ok({
            total_activos: total,
            por_estado: porEstado,
            por_responsable: porResponsable,
            atascados_mas_15_dias: atascados.mas15,
            atascados_mas_30_dias: atascados.mas30
        });
    }
);

// ─── Tool 5: Búsqueda por partner / prescriptor ───────────────────────────────
mcp.tool(
    'list_by_partner',
    'Lista los expedientes de un partner o prescriptor concreto (empresa instaladora o certificadora). Úsalo cuando el usuario pregunte por "los expedientes de Villarejo" o "¿qué tiene Electro X?"',
    { partner: z.string().describe('Nombre o acrónimo del partner/prescriptor') },
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

// ─── Express + SSE transport ──────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Health check público
app.get('/health', (_, res) => res.json({ ok: true, service: 'brokergy-mcp', ts: new Date().toISOString() }));

// Middleware de autenticación por API key
function requireApiKey(req, res, next) {
    const expected = process.env.MCP_API_KEY;
    if (!expected) return next(); // sin clave configurada → abierto (no recomendado en prod)

    const provided = req.headers['x-api-key'] || req.query.key;
    if (provided !== expected) {
        return res.status(401).json({ error: 'Unauthorized — API key inválida' });
    }
    next();
}

// Mapa de transportes SSE activos (sessionId → transport)
const transports = new Map();

// Endpoint SSE — claude.ai se conecta aquí
app.get('/sse', requireApiKey, async (req, res) => {
    const transport = new SSEServerTransport('/messages', res);
    transports.set(transport.sessionId, transport);

    res.on('close', () => {
        transports.delete(transport.sessionId);
    });

    await mcp.connect(transport);
});

// Endpoint POST para mensajes MCP entrantes
app.post('/messages', requireApiKey, async (req, res) => {
    const { sessionId } = req.query;
    const transport = transports.get(sessionId);
    if (!transport) return res.status(404).json({ error: 'Sesión no encontrada. Reconecta.' });
    await transport.handlePostMessage(req, res);
});

// ─── Arrancar ─────────────────────────────────────────────────────────────────
const PORT = process.env.MCP_PORT || 3001;
app.listen(PORT, () => {
    console.log(`🔗 Brokergy MCP Server corriendo en puerto ${PORT}`);
    console.log(`   Endpoint SSE: http://localhost:${PORT}/sse`);
    console.log(`   Health:       http://localhost:${PORT}/health`);
    console.log(`   API Key:      ${process.env.MCP_API_KEY ? '✅ configurada' : '⚠️  NO configurada (inseguro)'}`);
});
