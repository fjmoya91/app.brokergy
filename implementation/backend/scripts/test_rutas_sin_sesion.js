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
    if (table === 'usuarios' && ultimoToken === 'tok-ext') return { data: null, error: null };   // certificador de la app: sin perfil
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
const fake = { auth: { getUser: async (t) => { ultimoToken = t; return (ROLES[t] || t === 'tok-ext') ? { data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null } : { data: { user: null }, error: { message: 'bad' } }; } },
  from: (t) => qb(t), rpc: () => qb('rpc'), storage: { from: () => qb('st') } };
const sc = require.resolve(path.join(B, 'services/supabaseClient.js'));
require.cache[sc] = { id: sc, filename: sc, loaded: true, exports: fake };
const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/oportunidades', require(path.join(B, 'routes/oportunidades')));
app.use('/api/pdf', require(path.join(B, 'routes/pdf')));
app.use('/api/whatsapp', require(path.join(B, 'routes/whatsapp')));
app.use('/api/expedientes', require(path.join(B, 'routes/expedientes')));
app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));
app.use('/api/escaparate-revision', require(path.join(B, 'routes/escaparateRevision')));
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
    // App del instalador (fase 1): sus obras, solo con sesión y en la beta.
    ['GET', '/api/instalador-app/obras'], ['GET', '/api/instalador-app/obras/26RES060_OP217'],
    // Fase 2: lo que hace dentro de la obra (presupuesto, factura, CIFO, RITE, fotos y papeles).
    ...[['GET', '/presupuesto'], ['GET', '/presupuesto/abcdefghij123'], ['POST', '/presupuesto'], ['GET', '/factura'], ['GET', '/factura/word'],
      ['POST', '/factura/vista-previa'], ['POST', '/factura/generar'], ['POST', '/factura/subir'], ['GET', '/factura/fichero/abcdef012345'],
      ['GET', '/instalador'], ['GET', '/cifo/pdf'], ['POST', '/cifo'], ['POST', '/rite'], ['GET', '/fm-declaracion/pdf'], ['POST', '/fm-declaracion'],
    ].map(([m, r]) => [m, `/api/instalador-app/obras/26RES060_OP217${r}`]),
    ...[['GET', ''], ['POST', '/fin-obra'], ['PATCH', '/ventanas'], ['POST', '/FOTO_EQUIPO'], ['POST', '/FOTO_EQUIPO/batch'],
      ['POST', '/FOTO_EQUIPO/merge-pdf'], ['DELETE', '/FOTO_EQUIPO?driveId=abcdefghij123'],
    ].map(([m, r]) => [m, `/api/instalador-app/docs/26RES060_OP217${r}`]),
    // Fase 3: «Tu página web» y la revisión del equipo interno.
    ...[['GET', ''], ['GET', '/obras'], ['POST', '/fotos'], ['POST', '/fotos/subir'], ['DELETE', '/fotos/00000000-0000-4000-8000-000000000000'], ['PUT', '/textos'],
    ].map(([m, r]) => [m, `/api/instalador-app/escaparate${r}`]),
    ...[['GET', '/contador'], ['GET', '/instalador/00000000-0000-4000-8000-000000000000'],
      ['POST', '/fotos/00000000-0000-4000-8000-000000000000/aprobar'], ['POST', '/fotos/00000000-0000-4000-8000-000000000000/rechazar'],
      ['POST', '/textos/00000000-0000-4000-8000-000000000000/aprobar'], ['POST', '/textos/00000000-0000-4000-8000-000000000000/rechazar'],
    ].map(([m, r]) => [m, `/api/escaparate-revision${r}`]),
  ];
  // Las miniaturas y ficheros de la app van SIN sesión, con LLAVE: sin ella, 403 (ver test_app_instalador.js).
  q('anónimo', 'GET', '/api/instalador-app/thumb/26RES060_OP217/abcdefghij123', 403, {});
  q('anónimo', 'GET', '/api/instalador-app/fichero/26RES060_OP217/abcdefghij123?token=tok-de-subida', 403, {});
  q('anónimo', 'GET', '/api/instalador-app/escaparate/foto/00000000-0000-4000-8000-000000000000', 403, {});
  // La cola de revisión es del equipo interno; aprobar y rechazar, solo ADMIN.
  for (const t of ['tok-partner', 'tok-cert']) q(t, 'GET', '/api/escaparate-revision/contador', 403);
  for (const t of ['tok-partner', 'tok-cert', 'tok-trab']) {
    q(t, 'POST', '/api/escaparate-revision/fotos/00000000-0000-4000-8000-000000000000/aprobar', 403, {});
    q(t, 'POST', '/api/escaparate-revision/textos/00000000-0000-4000-8000-000000000000/rechazar', 403, { motivo: 'no vale nada' });
  }
  q('tok-trab', 'GET', '/api/escaparate-revision/contador', 200);
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
  // Una sesión de Supabase SIN fila en `usuarios` (certificador de cee.brokergy.es) no entra al CRM.
  q('tok-ext', 'GET', '/api/oportunidades', 403);
  q('tok-ext', 'POST', '/api/oportunidades', 403, {});
  q('tok-ext', 'GET', '/api/expedientes/X/fichas-tecnicas/cal', 403);
  q('tok-ext', 'POST', '/api/whatsapp/send-text', 403, {});
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
