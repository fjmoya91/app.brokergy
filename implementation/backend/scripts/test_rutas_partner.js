// Un partner solo toca LO SUYO: rutas REALES con Supabase y Drive SIMULADOS.
//   node scripts/test_rutas_partner.js   (desde implementation/backend)
// Ver la regla 102 de CLAUDE.md.
const path = require('path');
const B = path.join(__dirname, '..');
Object.assign(process.env, { WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false', INTERNAL_API_KEY: 'clave-de-prueba-123' });
const DB = {
  usuarios: [
    { auth_user_id: 'a-tok-admin', id_usuario: 'u-admin', activo: true, roles: { nombre_rol: 'ADMIN' } },
    { auth_user_id: 'a-tok-partner', id_usuario: 'u-partner', activo: true, roles: { nombre_rol: 'DISTRIBUIDOR' } },
  ],
  prescriptores: [
    { id_empresa: 'p-1', representante_legal_id: 'u-partner', razon_social: 'PARTNER UNO', acronimo: 'P1' },
    { id_empresa: 'p-2', representante_legal_id: 'u-otro', razon_social: 'PARTNER DOS', acronimo: 'P2' },
    { id_empresa: 'inst-red', razon_social: 'INSTALADOR DE SU RED', acronimo: 'RED' },
    { id_empresa: 'inst-ajeno', razon_social: 'INSTALADOR AJENO', acronimo: 'AJ' },
  ],
  oportunidades: [
    { id: '11111111-1111-1111-1111-111111111111', id_oportunidad: '26RES060_OP900', ref_catastral: 'RC-A', creador_id: 'u-partner', prescriptor_id: 'p-1', prescriptor: 'P1', cliente_id: 'c-suyo', instalador_asociado_id: null,
      datos_calculo: { estado: 'PTE ENVIAR', drive_folder_id: 'drive-A', historial: [] } },
    { id: '22222222-2222-2222-2222-222222222222', id_oportunidad: '26RES060_OP901', ref_catastral: 'RC-B', creador_id: 'u-otro', prescriptor_id: 'p-2', prescriptor: 'P2', cliente_id: 'c-ajeno', instalador_asociado_id: null,
      datos_calculo: { estado: 'PTE ENVIAR', drive_folder_id: 'drive-B', historial: [] } },
  ],
  clientes: [
    { id_cliente: 'c-suyo', prescriptor_id: 'p-1', id_usuario: 'u-partner', nombre_razon_social: 'SUYO' },
    { id_cliente: 'c-ajeno', prescriptor_id: 'p-2', id_usuario: 'u-otro', nombre_razon_social: 'AJENO' },
  ],
  distribuidor_instalador: [{ distribuidor_id: 'p-1', instalador_id: 'inst-red' }],
  expedientes: [],
};
const ESCRITURAS = [];
const get = (row, col) => {
  if (col.includes('->')) { const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]); }
  return row[col];
};
function qb(table) {
  const st = { filters: [], op: 'select', payload: null, limit: null, select: null };
  const run = () => {
    let rows = (DB[table] || []).slice();
    for (const f of st.filters) rows = rows.filter(f);
    if (st.op === 'insert') { const rec = { id: 'nuevo-uuid', ...([].concat(st.payload)[0]) }; ESCRITURAS.push({ table, op: 'insert', rec }); return [rec]; }
    if (st.op === 'update') { ESCRITURAS.push({ table, op: 'update', payload: st.payload, filas: rows.map(r => r.id_oportunidad || r.id) }); return rows.map(r => ({ ...r, ...st.payload })); }
    if (st.select) rows = rows.map(r => { const o = { ...r }; for (const part of st.select.split(',').map(s => s.trim())) { const m = part.match(/^(\w+):(.+)$/); if (m) o[m[1]] = get(r, m[2]); } return o; });
    if (st.limit) rows = rows.slice(0, st.limit);
    return rows;
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve({ data: run(), error: null }).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve({ data: run()[0] || null, error: null });
    if (k === 'select') return (s) => { if (st.op === 'select') st.select = s; return b; };
    if (k === 'eq') return (c, v) => { st.filters.push(r => String(get(r, c)) === String(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filters.push(r => vs.includes(get(r, c))); return b; };
    if (k === 'or') return (e) => {
      const ps = e.split(',').map(p => p.match(/^([\w>-]+)\.eq\.(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, '')]);
      st.filters.push(r => ps.some(([c, v]) => String(get(r, c)) === v)); return b;
    };
    if (k === 'insert') return (p) => { st.op = 'insert'; st.payload = p; return b; };
    if (k === 'update') return (p) => { st.op = 'update'; st.payload = p; return b; };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) },
  from: qb, rpc: () => Promise.resolve({ data: null, error: null }), storage: { from: () => qb('st') } };
const fakeDrive = new Proxy({
  findSubfolderByName: async (carpeta, nombre) => (nombre === '0. PRESUPUESTO' ? 'pres-' + carpeta : null),
  getOrCreateSubfolder: async (carpeta) => 'pres-' + carpeta,
  getFileMetadata: async (fileId) => ({ id: fileId, parents: [fileId.startsWith('f-A') ? 'pres-drive-A' : 'pres-drive-B'] }),
  getFileContent: async () => Buffer.from('PDF'),
  deleteFile: async () => true,
  listFiles: async (carpeta) => [{ id: 'listado-de-' + carpeta }],
  setupOpportunityFolder: async () => ({ id: 'drive-nueva', link: 'https://drive/nueva' }),
}, { get: (t, k) => (k in t ? t[k] : async () => null) });
for (const [mod, exp] of [['services/supabaseClient.js', fakeSb], ['services/driveService.js', fakeDrive]]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}
const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json({ limit: '5mb' }));
app.use('/api/oportunidades', require(path.join(B, 'routes/oportunidades')));

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const t = async (quien, m, ruta, esperado, body, extra) => {
    n++; const h = { 'Content-Type': 'application/json' };
    if (quien !== 'anónimo') h.Authorization = 'Bearer tok-' + quien;
    ESCRITURAS.length = 0;
    const r = await fetch(base + ruta, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
    const txt = await r.text(); let js = null; try { js = JSON.parse(txt); } catch { /* binario */ }
    let ok = r.status === esperado; let nota = '';
    if (ok && extra) { const e = extra(js, ESCRITURAS); ok = e === true; if (!ok) nota = '  ' + e; }
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${quien.padEnd(8)} ${m.padEnd(6)} ${ruta.padEnd(56)} → ${r.status}${ok ? '' : ' (esperaba ' + esperado + ')' + nota}`);
  };
  console.log('— Ver');
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP900', 200);
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP901', 404);
  await t('partner', 'GET', '/api/oportunidades/RC-B', 404);
  await t('partner', 'GET', '/api/oportunidades/RC-A', 200);
  await t('admin', 'GET', '/api/oportunidades/26RES060_OP901', 200);
  await t('partner', 'GET', '/api/oportunidades/22222222-2222-2222-2222-222222222222/docs', 404);
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP901/propuesta/versiones', 404);
  console.log('— Cambiar de partner');
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP900/asignar', 403, { prescriptor_id: 'p-2' });
  await t('admin', 'PATCH', '/api/oportunidades/26RES060_OP901/asignar', 200, { prescriptor_id: 'p-1', prescriptor_name: 'P1' });
  console.log('— Cliente, código y estado');
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP901/vincular-cliente', 404, { cliente_id: 'c-suyo' });
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP900/vincular-cliente', 404, { cliente_id: 'c-ajeno' });
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP900/cod-cliente', 200, { cod_cliente_interno: 'X1' });
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP901/cod-cliente', 404, { cod_cliente_interno: 'X1' });
  await t('partner', 'PATCH', '/api/oportunidades/26RES060_OP901/estado', 404, { nuevo_estado: 'ENVIADA' });
  console.log('— Anexos (Drive)');
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP900/anexos?driveFolderId=drive-B', 200, null,
    (js) => js?.[0]?.id === 'listado-de-pres-drive-A' || 'listó ' + js?.[0]?.id);
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP900/anexos/f-A-1', 200);
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP900/anexos/f-B-DNI', 404);
  await t('partner', 'DELETE', '/api/oportunidades/26RES060_OP900/anexos/f-B-DNI', 404);
  await t('partner', 'DELETE', '/api/oportunidades/26RES060_OP900/anexos/f-A-1', 200);
  await t('partner', 'GET', '/api/oportunidades/26RES060_OP901/anexos/f-B-DNI', 404);
  await t('admin', 'GET', '/api/oportunidades/26RES060_OP901/anexos/f-B-DNI', 200);
  await t('admin', 'GET', '/api/oportunidades/26RES060_OP901/anexos', 200, null,
    (js) => js?.[0]?.id === 'listado-de-pres-drive-B' || 'listó ' + js?.[0]?.id);
  console.log('— Guardar desde la calculadora (POST /)');
  const sim = { datos_calculo: { inputs: {}, result: {} } };
  await t('partner', 'POST', '/api/oportunidades', 404, { ...sim, id_oportunidad: '26RES060_OP901', ref_catastral: 'RC-B' });
  await t('partner', 'POST', '/api/oportunidades', 201,
    { ...sim, ref_catastral: 'RC-B', prescriptor_id: 'p-2', creador_id: 'u-otro', prescriptor: 'P2', cliente_id: 'c-ajeno', instalador_asociado_id: 'inst-ajeno' },
    (js, W) => {
      const upd = W.find(w => w.op === 'update' && w.table === 'oportunidades'); if (upd) return 'SOBRESCRIBIÓ ' + upd.filas;
      const ins = W.find(w => w.op === 'insert' && w.table === 'oportunidades'); if (!ins) return 'no insertó';
      const r = ins.rec; const mal = [];
      if (r.prescriptor_id !== 'p-1') mal.push('prescriptor_id=' + r.prescriptor_id);
      if (r.creador_id !== 'u-partner') mal.push('creador_id=' + r.creador_id);
      if (r.cliente_id !== null) mal.push('cliente_id=' + r.cliente_id);
      if (r.instalador_asociado_id !== null) mal.push('instalador=' + r.instalador_asociado_id);
      if (r.prescriptor !== 'P1') mal.push('prescriptor=' + r.prescriptor);
      if (r.id_oportunidad === '26RES060_OP901') mal.push('reutilizó el nº de la ajena');
      return mal.length ? mal.join(' ') : true;
    });
  await t('partner', 'POST', '/api/oportunidades', 201,
    { ...sim, id_oportunidad: '26RES060_OP900', ref_catastral: 'RC-A', prescriptor_id: 'p-2', creador_id: 'u-otro', prescriptor: 'P2', cliente_id: 'c-suyo', instalador_asociado_id: 'inst-red' },
    (js, W) => {
      const upd = W.find(w => w.op === 'update' && w.table === 'oportunidades'); if (!upd) return 'no actualizó';
      if (String(upd.filas) !== '26RES060_OP900') return 'actualizó ' + upd.filas;
      const p = upd.payload; const mal = [];
      if (p.prescriptor_id !== 'p-1') mal.push('prescriptor_id=' + p.prescriptor_id);
      if (p.creador_id !== 'u-partner') mal.push('creador_id=' + p.creador_id);
      if (p.cliente_id !== 'c-suyo') mal.push('cliente_id=' + p.cliente_id);
      if (p.instalador_asociado_id !== 'inst-red') mal.push('instalador=' + p.instalador_asociado_id);
      if (p.prescriptor !== 'P1') mal.push('prescriptor=' + p.prescriptor);
      return mal.length ? mal.join(' ') : true;
    });
  await t('admin', 'POST', '/api/oportunidades', 201,
    { ...sim, id_oportunidad: '26RES060_OP901', ref_catastral: 'RC-B', prescriptor_id: 'p-1', prescriptor: 'P1' },
    (js, W) => {
      const upd = W.find(w => w.op === 'update' && w.table === 'oportunidades');
      return (upd && upd.payload.prescriptor_id === 'p-1') || 'el admin no pudo reasignar';
    });
  console.log(`\n${n - fallos}/${n} correctas`);
  srv.close(); process.exit(fallos ? 1 : 0);
});
