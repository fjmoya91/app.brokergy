// La sesión de la cuenta de CLAUDE (robot.claude@app.brokergy.es, rol ADMIN, sin
// contraseña utilizable): la abre el servidor con la clave de servicio canjeando
// un enlace mágico que él mismo genera (no se manda ningún email), y se CIERRA al
// terminar. Es la «llave de Claude» de scripts/claude_propuesta.js (regla 103),
// sacada aquí para que la usen también las herramientas de la skill
// `justificar-expediente` (scripts/justificar.js).
const path = require('path');
const { createClient } = require(path.join(__dirname, '../node_modules/@supabase/supabase-js'));

const EMAIL = 'robot.claude@app.brokergy.es';

function clienteServicio() {
    return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Clave de localStorage en la que el frontend guarda la sesión de Supabase. */
function claveSesionNavegador() {
    return `sb-${new URL(process.env.SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
}

async function abrirSesionRobot() {
    const sb = clienteServicio();
    const { data: u } = await sb.from('usuarios').select('activo').eq('email', EMAIL).maybeSingle();
    if (!u) throw new Error('No existe la cuenta de Claude: `node scripts/claude_propuesta.js alta`.');
    if (u.activo === false) throw new Error('La cuenta de Claude está desactivada (`claude_propuesta.js alta` la reactiva).');
    const { data: link, error } = await sb.auth.admin.generateLink({ type: 'magiclink', email: EMAIL });
    if (error) throw new Error(`No se pudo abrir la sesión: ${error.message}`);
    const anon = createClient(process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } });
    const { data: ses, error: e2 } = await anon.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
    if (e2 || !ses?.session) throw new Error(`No se pudo abrir la sesión: ${e2?.message || 'sin sesión'}`);
    return ses.session;
}

async function cerrarSesionRobot(sesion) {
    if (!sesion?.access_token) return;
    try { await clienteServicio().auth.admin.signOut(sesion.access_token, 'global'); } catch { /* ya caducada */ }
}

module.exports = { EMAIL, abrirSesionRobot, cerrarSesionRobot, claveSesionNavegador };
