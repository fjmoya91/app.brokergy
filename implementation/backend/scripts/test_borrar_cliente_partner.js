// El PARTNER borra un cliente SUYO sin nada colgado; nada más (23/11/2026, RCA: tres «Gregoria» repetidos).
//   node scripts/test_borrar_cliente_partner.js   (desde implementation/backend)
// Ruta REAL `DELETE /api/clientes/:id` con Supabase SIMULADO. Ver la regla 102 y el doc del presupuesto.
const path = require('path');
const B = path.join(__dirname, '..');
Object.assign(process.env, { WHATSAPP_ENABLED: 'false', INTERNAL_API_KEY: 'clave-de-prueba-123' });
let DB;
const base0 = () => ({
  usuarios: [
    { auth_user_id: 'a-tok-admin', id_usuario: 'u-admin', activo: true, roles: { nombre_rol: 'ADMIN' } },
    { auth_user_id: 'a-tok-partner', id_usuario: 'u-partner', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-trabajador', id_usuario: 'u-trab', activo: true, roles: { nombre_rol: 'TRABAJADOR' } },
  ],
  prescriptores: [
    { id_empresa: 'p-1', representante_legal_id: 'u-partner', razon_social: 'PARTNER UNO', acronimo: 'P1' },
  ],
  clientes: [
    { id_cliente: 'c-libre', prescriptor_id: 'p-1', id_usuario: null },
    { id_cliente: 'c-con-op', prescriptor_id: 'p-1', id_usuario: null },
    { id_cliente: 'c-con-pres', prescriptor_id: 'p-1', id_usuario: null },
    { id_cliente: 'c-cuenta', prescriptor_id: 'p-1', id_usuario: 'u-cliente' },
    { id_cliente: 'c-ajeno', prescriptor_id: 'p-2', id_usuario: null },
  ],
  oportunidades: [{ id: 'op-1', cliente_id: 'c-con-op' }],
  instalador_presupuestos: [{ id: 'pr-1', cliente_id: 'c-con-pres' }],
});
let FALLA = null; // tabla cuya consulta devuelve error
const BORRADOS = [];
function qb(table) {
  const st = { filters: [], op: 'select', head: false };
  const filas = () => (DB[table] || []).filter(r => st.filters.every(f => f(r)));
  const res = () => {
    if (FALLA === table) return { data: null, error: { message: 'caída' }, count: null };
    if (st.op === 'delete') { const ids = filas().map(r => r.id_cliente || r.id); DB[table] = DB[table].filter(r => !ids.includes(r.id_cliente || r.id)); BORRADOS.push(...ids); return { data: null, error: null }; }
    const rs = filas();
    return st.head ? { data: null, error: null, count: rs.length } : { data: rs, error: null, count: rs.length };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(res()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => { const r = res(); return Promise.resolve(r.error ? r : { data: (r.data || [])[0] || null, error: null }); };
    if (k === 'select') return (_s, o) => { if (o?.head) st.head = true; return b; };
    if (k === 'eq') return (c, v) => { st.filters.push(r => String(r[c]) === String(v)); return b; };
    if (k === 'delete') return () => { st.op = 'delete'; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) },
  from: qb, rpc: () => Promise.resolve({ data: null, error: null }) };
const r0 = require.resolve(path.join(B, 'services/supabaseClient.js'));
require.cache[r0] = { id: r0, filename: r0, loaded: true, exports: fakeSb };
const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/clientes', require(path.join(B, 'routes/clientes')));

const srv = app.listen(0, async () => {
  const url = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const t = async (nombre, quien, id, esperado, { borrado = esperado === 200, code } = {}) => {
    n++; DB = base0(); BORRADOS.length = 0;
    const h = quien === 'anónimo' ? {} : { Authorization: 'Bearer tok-' + quien };
    const r = await fetch(`${url}/api/clientes/${id}`, { method: 'DELETE', headers: h });
    const js = await r.json().catch(() => ({}));
    const mal = [];
    if (r.status !== esperado) mal.push(`→ ${r.status}, esperaba ${esperado}`);
    if (borrado !== BORRADOS.includes(id)) mal.push(borrado ? 'no se borró' : 'SE BORRÓ');
    if (code && js.code !== code) mal.push(`code=${js.code}`);
    if (mal.length) fallos++;
    console.log(`${mal.length ? '✗' : '✓'} ${nombre}${mal.length ? '  ' + mal.join(' · ') : ''}`);
  };
  await t('partner borra su cliente sin nada colgado', 'partner', 'c-libre', 200);
  await t('partner: cliente de otro → 404', 'partner', 'c-ajeno', 404);
  await t('partner: cliente que no existe → 404', 'partner', 'c-nada', 404);
  await t('partner: con oportunidad → 409', 'partner', 'c-con-op', 409, { code: 'CLIENTE_CON_OBRAS' });
  await t('partner: con presupuesto → 409', 'partner', 'c-con-pres', 409, { code: 'CLIENTE_CON_OBRAS' });
  await t('partner: con cuenta en la app → 409', 'partner', 'c-cuenta', 409, { code: 'CLIENTE_CON_CUENTA' });
  FALLA = 'oportunidades';
  await t('partner: si no se puede contar, no se borra', 'partner', 'c-libre', 409, { code: 'CLIENTE_CON_OBRAS' });
  FALLA = 'clientes';
  await t('partner: BD caída al leer el cliente → 503', 'partner', 'c-libre', 503);
  FALLA = null;
  await t('trabajador (staff no admin) → 403', 'trabajador', 'c-libre', 403);
  await t('anónimo → 401', 'anónimo', 'c-libre', 401);
  await t('admin borra, como siempre', 'admin', 'c-con-op', 200);
  console.log(`\n${n - fallos}/${n} correctas`);
  process.exitCode = fallos ? 1 : 0; srv.closeAllConnections?.(); srv.close();
});
