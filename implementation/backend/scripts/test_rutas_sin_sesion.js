// Sin sesión no se entra: rutas REALES con Supabase SIMULADO (no toca producción).
//   node scripts/test_rutas_sin_sesion.js   (desde implementation/backend)
// Anónimo y clave interna equivocada → 401; partner y certificador no envían emails
// ni WhatsApp → 403; equipo interno y clave interna pasan. Ver la regla 102 de CLAUDE.md.
const path = require('path');
const B = path.join(__dirname, '..');
Object.assign(process.env, { WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false', INTERNAL_API_KEY: 'clave-de-prueba-123' });
const ROLES = { 'tok-admin': 'ADMIN', 'tok-trab': 'TRABAJADOR', 'tok-partner': 'INSTALADOR', 'tok-cert': 'CERTIFICADOR' };
let ultimoToken = null;
function qb(table) {
  const res = () => {
    if (table === 'usuarios') return { data: { id_usuario: 'u-1', id_rol: 1, activo: true, roles: { nombre_rol: ROLES[ultimoToken] } }, error: null };
    if (table === 'prescriptores' && ultimoToken === 'tok-partner') return { data: { id_empresa: 'p-1', razon_social: 'X' }, error: null };
    return { data: null, error: null };
  };
  const p = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve({ data: [], error: null }).then(ok, ko);
    if (k === 'maybeSingle' || k === 'single') return () => Promise.resolve(res());
    return () => p;
  } });
  return p;
}
const fake = { auth: { getUser: async (t) => { ultimoToken = t; return ROLES[t] ? { data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }; } },
  from: (t) => qb(t), rpc: () => qb('rpc'), storage: { from: () => qb('st') } };
const sc = require.resolve(path.join(B, 'services/supabaseClient.js'));
require.cache[sc] = { id: sc, filename: sc, loaded: true, exports: fake };
const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/oportunidades', require(path.join(B, 'routes/oportunidades')));
app.use('/api/pdf', require(path.join(B, 'routes/pdf')));
app.use('/api/whatsapp', require(path.join(B, 'routes/whatsapp')));
app.use('/api/expedientes', require(path.join(B, 'routes/expedientes')));
const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  const casos = [];
  const q = (quien, metodo, ruta, esperado, body) => casos.push({ quien, metodo, ruta, esperado, body });
  const RUTAS_ANON = [
    ['GET', '/api/oportunidades'], ['GET', '/api/oportunidades/26RES060_OP217'], ['POST', '/api/oportunidades'],
    ['PATCH', '/api/oportunidades/X/asignar'], ['PATCH', '/api/oportunidades/X/cod-cliente'], ['PATCH', '/api/oportunidades/X/vincular-cliente'],
    ['PUT', '/api/oportunidades/X/historial/1'], ['GET', '/api/oportunidades/X/anexos'], ['GET', '/api/oportunidades/X/anexos/f'],
    ['POST', '/api/oportunidades/X/anexos'], ['DELETE', '/api/oportunidades/X/anexos/f'],
    ['POST', '/api/pdf/generate'], ['POST', '/api/pdf/save-to-drive'], ['POST', '/api/pdf/send-proposal'], ['POST', '/api/pdf/send-annex'], ['POST', '/api/pdf/send-cifo'],
    ['GET', '/api/whatsapp/status'], ['POST', '/api/whatsapp/send-text'], ['POST', '/api/whatsapp/send-media'],
  ];
  for (const [m, r] of RUTAS_ANON) q('anónimo', m, r, 401, {});
  for (const [m, r] of RUTAS_ANON.filter(([, r]) => /pdf\/send|whatsapp\/send/.test(r))) q('clave MAL', m, r, 401, {});
  for (const r of ['/api/pdf/send-proposal', '/api/pdf/send-annex', '/api/pdf/send-cifo', '/api/whatsapp/send-text', '/api/whatsapp/send-media'])
    for (const t of ['tok-partner', 'tok-cert']) q(t, 'POST', r, 403, {});
  q('tok-admin', 'POST', '/api/pdf/send-proposal', 400, {});
  q('tok-trab', 'POST', '/api/pdf/send-proposal', 400, {});
  q('clave OK', 'POST', '/api/pdf/send-proposal', 400, {});
  q('clave OK', 'POST', '/api/whatsapp/send-text', 'no 401/403', {});
  q('tok-trab', 'POST', '/api/whatsapp/send-text', 'no 401/403', {});
  q('tok-admin', 'GET', '/api/oportunidades', 200);
  q('tok-partner', 'GET', '/api/oportunidades', 200);
  q('tok-partner', 'POST', '/api/oportunidades', 400, {});
  q('anónimo', 'GET', '/api/expedientes/X/fichas-tecnicas/cal', 401);
  q('anónimo', 'GET', '/api/expedientes/X/anexos-cifo/abc/content', 401);
  q('tok-partner', 'GET', '/api/expedientes/X/fichas-tecnicas/cal', 403);
  q('anónimo', 'POST', '/api/expedientes/X/cert-ack', 400, {});
  q('anónimo', 'GET', '/api/expedientes/X/approve-cee-from-email', 'no 401/403');
  let fallos = 0;
  for (const c of casos) {
    const h = { 'Content-Type': 'application/json' };
    if (c.quien.startsWith('tok-')) h.Authorization = 'Bearer ' + c.quien;
    if (c.quien === 'clave OK') h['x-internal-key'] = 'clave-de-prueba-123';
    if (c.quien === 'clave MAL') h['x-internal-key'] = 'otra-clave-0000000';
    const r = await fetch(base + c.ruta, { method: c.metodo, headers: h, body: c.body && c.metodo !== 'GET' ? JSON.stringify(c.body) : undefined });
    const ok = c.esperado === 'no 401/403' ? ![401, 403].includes(r.status) : r.status === c.esperado;
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${c.quien.padEnd(11)} ${c.metodo.padEnd(6)} ${c.ruta.padEnd(40)} → ${r.status}${ok ? '' : '  (esperaba ' + c.esperado + ')'}`);
  }
  console.log(`\n${casos.length - fallos}/${casos.length} correctas`);
  srv.close(); process.exit(fallos ? 1 : 0);
});
