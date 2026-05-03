/**
 * create_whatsapp_queue.js
 * Ejecutar una única vez: node scripts/create_whatsapp_queue.js
 * Crea la tabla whatsapp_queue en Supabase para la cola persistente de mensajes.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const SQL = `
CREATE TABLE IF NOT EXISTS whatsapp_queue (
    id          BIGSERIAL PRIMARY KEY,
    phone       TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at     TIMESTAMPTZ,
    error       TEXT,
    retries     INT NOT NULL DEFAULT 0
);

-- Índice para consultas de mensajes pendientes ordenados por creación
CREATE INDEX IF NOT EXISTS idx_whatsapp_queue_status ON whatsapp_queue(status, created_at ASC);

-- Habilitar RLS: sin políticas = acceso denegado para anon/authenticated.
-- El backend usa service_role_key, que bypasea RLS automáticamente.
ALTER TABLE whatsapp_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_queue FORCE ROW LEVEL SECURITY;
`;

async function main() {
    console.log('Creando tabla whatsapp_queue en Supabase...');
    const { error } = await supabase.rpc('exec_sql', { sql: SQL }).catch(() => ({ error: 'rpc_not_available' }));

    if (error === 'rpc_not_available' || error) {
        // Fallback: usar el cliente HTTP directamente con la Management API
        console.log('RPC no disponible. Intentando via Management API...');
        const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
                'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            },
            body: JSON.stringify({ sql: SQL }),
        });
        if (!res.ok) {
            const txt = await res.text();
            console.error('Error al ejecutar SQL:', txt);
            console.log('\n--- SQL A EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR ---');
            console.log(SQL);
            console.log('-----------------------------------------------------------');
            process.exit(1);
        }
    }

    console.log('✅ Tabla whatsapp_queue creada correctamente.');
}

main().catch(e => {
    console.error('Error inesperado:', e.message);
    console.log('\n--- SQL A EJECUTAR MANUALMENTE EN SUPABASE SQL EDITOR ---');
    console.log(SQL);
    console.log('-----------------------------------------------------------');
    process.exit(1);
});
