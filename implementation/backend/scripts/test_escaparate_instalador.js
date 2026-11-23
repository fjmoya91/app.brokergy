// App del INSTALADOR, fase 3 — «Tu página web» (el escaparate que propone el instalador).
// Rutas REALES (`routes/instaladorApp.js`, `routes/escaparateRevision.js` y
// `routes/publicMarketplace.js`) con Supabase, Drive y la red SIMULADOS en memoria:
// ninguna escritura sale de este proceso. Comprueba:
//   · quién entra (401 sin sesión, 403 fuera de la beta) y que cada instalador ve SOLO lo suyo;
//   · proponer fotos: solo de SUS obras y si su empresa es la INSTALADORA, solo fotos que
//     existen en la obra, con el permiso marcado (400 sin él) e idempotente;
//   · los textos: 400 con teléfono, email, web o precio; nada se publica al proponer;
//   · la revisión: la cola la ve el equipo interno, aprobar y rechazar solo ADMIN, con motivo;
//   · la API pública: solo lo PUBLICADO, solo claves de la lista blanca, solo el pueblo.
//   node scripts/test_escaparate_instalador.js   (desde implementation/backend)
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-3.md.
const path = require('path');
const B = path.join(__dirname, '..');
const P1 = '10000000-0000-4000-8000-000000000001'; // RCA (en la beta)
const P2 = '10000000-0000-4000-8000-000000000002'; // OTRO (en la beta)
const P3 = '10000000-0000-4000-8000-000000000003'; // FUERA (no está en la beta)
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false',
  ESCAPARATE_AVISOS_ENABLED: 'false', APP_INSTALADOR_BETA: `${P1}, ${P2}`, NODE_ENV: 'test',
});
delete process.env.DRIVE_FOLDER_ESCAPARATE;

const OP1 = '20000000-0000-4000-8000-000000000001'; // de RCA y la INSTALA RCA
const OP2 = '20000000-0000-4000-8000-000000000002'; // la TRAE RCA pero la instala OTRO
const OP3 = '20000000-0000-4000-8000-000000000003'; // de OTRO
const E1 = '30000000-0000-4000-8000-000000000001', E2 = '30000000-0000-4000-8000-000000000002', E3 = '30000000-0000-4000-8000-000000000003';
const F = (n) => `40000000-0000-4000-8000-00000000000${n}`;
const T = (n) => `50000000-0000-4000-8000-00000000000${n}`;
const INICIAL = () => ({
  usuarios: [
    { auth_user_id: 'a-tok-admin', id_usuario: 'u-admin', activo: true, roles: { nombre_rol: 'ADMIN' } },
    { auth_user_id: 'a-tok-trab', id_usuario: 'u-trab', activo: true, roles: { nombre_rol: 'TRABAJADOR' } },
    { auth_user_id: 'a-tok-rca', id_usuario: 'u-rca', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-otro', id_usuario: 'u-otro', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-fuera', id_usuario: 'u-fuera', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
  ],
  prescriptores: [
    { id_empresa: P1, representante_legal_id: 'u-rca', razon_social: 'RCA INSTALACIONES', acronimo: 'RCA', tipo_empresa: 'INSTALADOR', municipio: 'TOMELLOSO',
      descripcion_publica: 'Texto de antes.', especialidades: ['aerotermia', 'clave_rara'], zona_trabajo_publica: ['TOMELLOSO'], oculto_web: false },
    { id_empresa: P2, representante_legal_id: 'u-otro', razon_social: 'OTRO INSTALADOR', acronimo: 'OTRO', tipo_empresa: 'INSTALADOR', oculto_web: true },
    { id_empresa: P3, representante_legal_id: 'u-fuera', razon_social: 'FUERA', acronimo: 'FUERA', tipo_empresa: 'INSTALADOR' },
  ],
  clientes: [{ id_cliente: 'c-1', nombre_razon_social: 'CARMEN', apellidos: 'RUIZ', direccion: 'C/ OLIVO 12', municipio: 'TOMELLOSO' }],
  oportunidades: [
    { id: OP1, id_oportunidad: '26RES060_OP900', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: P1, cliente_id: 'c-1',
      datos_calculo: { estado: 'ACEPTADA', inputs: { municipio: 'TOMELLOSO', nombre: 'CARMEN' },
        reforma_uploads: {
          FOTO_CALDERA_ANTES: [{ name: 'caldera.jpg', driveId: 'drive-antes-123456' }],
          FOTO_UNIDAD_EXTERIOR: [{ name: 'unidad.jpg', driveId: 'drive-despues-1234' }, { name: 'mala.jpg', driveId: 'drive-rechazada-12', estado: 'rechazada' }],
          FACTURA: [{ name: 'factura.pdf', driveId: 'drive-factura-1234', mimeType: 'application/pdf' }],
        } } },
    { id: OP2, id_oportunidad: '26RES060_OP901', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: P1, cliente_id: 'c-1',
      datos_calculo: { estado: 'ACEPTADA', inputs: {}, reforma_uploads: { FOTO_UNIDAD_EXTERIOR: [{ name: 'u.jpg', driveId: 'drive-op2-1234567' }] } } },
    { id: OP3, id_oportunidad: '26RES060_OP902', ficha: 'RES060', creador_id: 'u-otro', prescriptor_id: P2, cliente_id: 'c-1',
      datos_calculo: { estado: 'ACEPTADA', inputs: {}, reforma_uploads: { FOTO_UNIDAD_EXTERIOR: [{ name: 'o.jpg', driveId: 'drive-op3-1234567' }] } } },
  ],
  expedientes: [
    { id: E1, oportunidad_id: OP1, numero_expediente: '26RES060_900', estado: 'PTE FIN EXPTE', created_at: '2026-10-01', instalacion: { instalador_id: P1, municipio: 'TOMELLOSO' }, cee: { certificador_id: 'cert' } },
    { id: E2, oportunidad_id: OP2, numero_expediente: '26RES060_901', estado: 'PTE FIN EXPTE', created_at: '2026-10-01', instalador_asociado_id: P2, instalacion: { instalador_id: P2 }, cee: { certificador_id: 'cert' } },
    { id: E3, oportunidad_id: OP3, numero_expediente: '26RES060_902', estado: 'PTE FIN EXPTE', created_at: '2026-10-01', instalacion: { instalador_id: P2 }, cee: { certificador_id: 'cert' } },
  ],
  instalador_fotos_escaparate: [
    // De RCA: una publicada, una en revisión, una rechazada y una suelta en revisión.
    { id: F(1), instalador_id: P1, expediente_id: E1, drive_id: 'drive-pub-1234567', fase: 'DESPUES', actuacion: 'aerotermia', municipio: 'TOMELLOSO', origen: 'OBRA', slot: 'FOTO_UNIDAD_EXTERIOR', estado: 'PUBLICADA', consentimiento_cliente: true, par_id: 'par-1', orden: 0, created_at: '2026-11-01' },
    { id: F(2), instalador_id: P1, expediente_id: E1, drive_id: 'drive-pend-123456', fase: 'ANTES', actuacion: 'aerotermia', municipio: 'TOMELLOSO', origen: 'OBRA', slot: 'FOTO_CALDERA_ANTES', estado: 'PENDIENTE', consentimiento_cliente: false, permiso_cliente: true, created_at: '2026-11-02' },
    { id: F(3), instalador_id: P1, expediente_id: E1, drive_id: 'drive-novale-12345', fase: 'DESPUES', actuacion: 'aerotermia', municipio: 'TOMELLOSO', origen: 'OBRA', slot: 'FOTO_UNIDAD_INTERIOR', estado: 'NO_VALE', motivo_rechazo: 'Sale la matrícula.', consentimiento_cliente: false, created_at: '2026-11-03' },
    { id: F(4), instalador_id: P1, expediente_id: null, drive_id: 'drive-suelta-12345', fase: 'DESPUES', actuacion: 'obra', municipio: null, origen: 'SUELTA', estado: 'PENDIENTE', consentimiento_cliente: false, permiso_cliente: true, created_at: '2026-11-04' },
    // De OTRO: no la puede ver ni quitar RCA.
    { id: F(5), instalador_id: P2, expediente_id: E3, drive_id: 'drive-otro-123456', fase: 'DESPUES', actuacion: 'aerotermia', municipio: 'SOCUELLAMOS', origen: 'OBRA', estado: 'PENDIENTE', consentimiento_cliente: false, created_at: '2026-11-05' },
  ],
  instalador_textos_escaparate: [
    { id: T(1), instalador_id: P1, presentacion: 'Llevamos veinte años en la comarca.', especialidades: ['aerotermia', 'suelo_radiante'], pueblos: ['Tomelloso', 'Argamasilla de Alba'], estado: 'PENDIENTE', propuesto_at: '2026-11-10' },
  ],
  instalador_stats: [{ instalador_id: P1, num_finalizadas: 2, num_en_curso: 1, num_iniciadas: 0, ayuda_media: 3850.4 }],
  instalador_marcas: [{ instalador_id: P1, marca_nombre: 'MARCA' }],
});
let DB = INICIAL();
let FALLA = null; // tabla que «se cae»

// ── Supabase simulado: alias, `->`/`->>`, filtros, insert/update/delete ───────
const get = (row, col) => {
  if (!col.includes('->')) return row[col];
  const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]);
};
const partes = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
function proyectar(table, r, sel) {
  if (!sel || table === 'usuarios' || sel.trim() === '*') return { ...r };
  const o = {};
  for (const p of partes(sel)) {
    let m;
    if ((m = p.match(/^(\w+)\s*\(/))) o[m[1]] = r[m[1]];
    else if ((m = p.match(/^(\w+):(.+)$/))) o[m[1]] = get(r, m[2].trim());
    else o[p] = get(r, p);
  }
  return o;
}
let nId = 0;
function qb(table) {
  const st = { filtros: [], sel: null, limit: null, desde: 0, hasta: null, op: 'select', payload: null };
  const filas = () => (DB[table] || []).filter((r) => st.filtros.every((f) => f(r)));
  const ejecutar = () => {
    if (FALLA === table) return { data: null, error: { message: '521 Web server is down' } };
    if (st.op === 'insert') {
      for (const r of [].concat(st.payload)) (DB[table] = DB[table] || []).push({ id: r.id || `60000000-0000-4000-8000-${String(++nId).padStart(12, '0')}`, created_at: new Date().toISOString(), ...r });
      return { data: null, error: null };
    }
    if (st.op === 'update') { for (const r of filas()) Object.assign(r, JSON.parse(JSON.stringify(st.payload))); return { data: null, error: null }; }
    if (st.op === 'delete') { const fuera = new Set(filas()); DB[table] = (DB[table] || []).filter((r) => !fuera.has(r)); return { data: null, error: null }; }
    let base = filas();
    if (st.orden) base = [...base].sort((a, z) => { for (const [c, asc] of st.orden) { const x = get(a, c) ?? 0, y = get(z, c) ?? 0; if (x < y) return asc ? -1 : 1; if (x > y) return asc ? 1 : -1; } return 0; });
    let rows = base.map((r) => proyectar(table, r, st.sel));
    if (st.hasta != null) rows = rows.slice(st.desde, st.hasta + 1);
    if (st.limit) rows = rows.slice(0, st.limit);
    return { data: rows, error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve((() => { const r = ejecutar(); return r.error ? r : { data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: null }; })());
    if (k === 'select') return (s) => { if (st.op === 'select') st.sel = s; return b; };
    if (k === 'insert') return (p) => { st.op = 'insert'; st.payload = p; return b; };
    if (k === 'update') return (p) => { st.op = 'update'; st.payload = p; return b; };
    if (k === 'delete') return () => { st.op = 'delete'; return b; };
    if (k === 'eq') return (c, v) => { st.filtros.push((r) => String(get(r, c)) === String(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filtros.push((r) => vs.map(String).includes(String(get(r, c)))); return b; };
    if (k === 'not') return (c, op, v) => { st.filtros.push((r) => (op === 'is' && v === null ? get(r, c) != null : true)); return b; };
    if (k === 'or') return (e) => { const ps = e.split(',').map((p) => p.match(/^([\w>-]+)\.eq\.(.*)$/)).filter(Boolean); st.filtros.push((r) => ps.some((m) => String(get(r, m[1])) === m[2])); return b; };
    if (k === 'lt') return (c, v) => { st.filtros.push((r) => get(r, c) != null && Number(get(r, c)) < Number(v)); return b; };
    if (k === 'order') return (c, o = {}) => { (st.orden = st.orden || []).push([c, o.ascending !== false]); return b; };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    if (k === 'range') return (a, z) => { st.desde = a; st.hasta = z; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) }, from: qb, rpc: () => Promise.resolve({ data: null, error: null }) };
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3]);
const DRIVE_LLAMADAS = [];
const fakeDrive = new Proxy({
  getFileContent: async (id) => { DRIVE_LLAMADAS.push(['leer', id]); return JPG; },
}, { get: (o, k) => o[k] || (async (...a) => { DRIVE_LLAMADAS.push([k, ...a.map(String)]); throw new Error('Drive no se toca en este test'); }) });
// Sin red: las miniaturas de lh3/thumbnail fallan y se cae al Drive simulado.
const sinRed = async () => { throw new Error('sin red en el test'); };
const fakeAxios = Object.assign(sinRed, { get: sinRed, post: sinRed, request: sinRed, create: () => fakeAxios,
  defaults: { headers: { common: {} } }, interceptors: { request: { use() {} }, response: { use() {} } } });
for (const [mod, exp] of [['services/supabaseClient.js', fakeSb], ['services/driveService.js', fakeDrive]]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}
{ const r = require.resolve('axios', { paths: [B] }); require.cache[r] = { id: r, filename: r, loaded: true, exports: fakeAxios }; }

const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));
app.use('/api/escaparate-revision', require(path.join(B, 'routes/escaparateRevision')));
app.use('/api/public/marketplace', require(path.join(B, 'routes/publicMarketplace')));
app.use('/api/oportunidades', require(path.join(B, 'routes/oportunidades'))); // el botón del gestor (no regresión)
const esc = require(path.join(B, 'services/escaparateService'));
const { llaveDeEscaparate } = require(path.join(B, 'routes/instaladorApp'))._internos;

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const ok = (cond, texto, detalle) => { n++; if (!cond) fallos++; console.log(`${cond ? '✓' : '✗'} ${texto}${cond ? '' : `\n     → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`}`); };
  const pedir = async (metodo, ruta, { tok, json } = {}) => {
    const h = tok ? { Authorization: `Bearer ${tok}` } : {};
    const r = await fetch(base + ruta, { method: metodo, headers: json ? { ...h, 'Content-Type': 'application/json' } : h, body: json ? JSON.stringify(json) : undefined });
    const txt = await r.text(); let body = txt; try { body = JSON.parse(txt); } catch { /* binario o vacío */ }
    return { status: r.status, body, txt, tipo: r.headers.get('content-type') };
  };
  const fila = (id) => DB.instalador_fotos_escaparate.find((f) => f.id === id);
  const reiniciar = () => { DB = INICIAL(); FALLA = null; esc._olvidarRed(); };

  try {
    // ── 1. Quién entra ──────────────────────────────────────────────────────
    let r = await pedir('GET', '/api/instalador-app/escaparate');
    ok(r.status === 401, 'sin sesión → 401', r.status);
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-fuera' });
    ok(r.status === 403 && r.body.code === 'APP_INSTALADOR_OFF', 'instalador fuera de la beta → 403 APP_INSTALADOR_OFF', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-fuera', json: { presentacion: 'Hola' } });
    ok(r.status === 403, 'fuera de la beta tampoco propone textos → 403', r.status);
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-admin' });
    ok(r.status === 403, 'un ADMIN no usa la app del instalador → 403', r.status);

    // ── 2. Su página: solo lo suyo, sin Drive ni datos del cliente ─────────
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-rca' });
    ok(r.status === 200, 'GET /escaparate → 200', r.body);
    const ids = (r.body.fotos || []).map((f) => f.id).sort();
    ok(JSON.stringify(ids) === JSON.stringify([F(1), F(2), F(3), F(4)]), 've SUS cuatro fotos y ninguna de otro instalador', ids);
    ok(r.body.resumen_fotos.publicadas === 1 && r.body.resumen_fotos.revision === 2 && r.body.resumen_fotos.no_vale === 1, 'cuenta publicadas / en revisión / no vale', r.body.resumen_fotos);
    ok(r.body.fotos.find((f) => f.id === F(3)).motivo === 'Sale la matrícula.', 'la rechazada lleva su motivo', r.body.fotos);
    ok(!/drive|numero_expediente|expediente_id|26RES|CARMEN|OLIVO/i.test(r.txt.replace(/\/api\/instalador-app\/escaparate\/foto\//g, '')), 'sin driveId, nº de obra ni datos del cliente', r.txt.slice(0, 300));
    ok(r.body.fotos.every((f) => /^\/api\/instalador-app\/escaparate\/foto\/[0-9a-f-]{36}\?llave=/.test(f.miniatura)), 'miniaturas por el proxy con llave', r.body.fotos[0]);
    ok(r.body.textos.en_revision?.presentacion === 'Llevamos veinte años en la comarca.' && r.body.textos.vigentes.presentacion === 'Texto de antes.', 'textos: el vigente y el que está en revisión', r.body.textos);
    ok(r.body.sale_solo.obras === 3 && r.body.sale_solo.ayuda_media === 3850 && r.body.ficha.url?.endsWith('/rca/'), 'lo que sale solo y el enlace a su página (slug como red.mjs)', { s: r.body.sale_solo, f: r.body.ficha });
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-otro' });
    ok(r.status === 200 && r.body.fotos.length === 1 && r.body.fotos[0].id === F(5), 'OTRO ve solo la suya (aislamiento)', r.body.fotos);
    ok(r.body.ficha.sale_en_web === false, 'OTRO está oculto en la web → sale_en_web false', r.body.ficha);

    // ── 3. Elegir fotos de SUS obras ────────────────────────────────────────
    r = await pedir('GET', '/api/instalador-app/escaparate/obras', { tok: 'tok-rca' });
    const obras = (r.body.obras || []).map((o) => o.obra);
    ok(r.status === 200 && JSON.stringify(obras) === JSON.stringify(['26RES060_OP900']), 'solo las obras que INSTALA (no la que trae e instala otro, ni la ajena)', r.body);
    const o1 = r.body.obras?.[0] || { fotos: [] };
    ok(o1.fotos.length === 2 && !o1.fotos.some((f) => /rechazada|factura/.test(f.driveId)), 'solo fotos (ni el PDF ni la rechazada)', o1.fotos);
    ok(o1.titulo === 'Aerotermia en Tomelloso' && !/CARMEN|OLIVO/.test(JSON.stringify(o1)), 'la obra se nombra por el pueblo, nunca por el cliente', o1.titulo);

    const FOTO_OK = { obra: '26RES060_OP900', slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'drive-despues-1234' };
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { fotos: [FOTO_OK] } });
    ok(r.status === 400 && r.body.code === 'PERMISO_CLIENTE', 'sin marcar el permiso → 400 PERMISO_CLIENTE', r.body);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: 'true', fotos: [FOTO_OK] } });
    ok(r.status === 400 && r.body.code === 'PERMISO_CLIENTE', 'el permiso ha de ser true, no una cadena → 400', r.body);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [{ obra: '26RES060_OP902', slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'drive-op3-1234567' }] } });
    ok(r.status === 404, 'obra de otro instalador → 404', r.body);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [{ obra: '26RES060_OP901', slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'drive-op2-1234567' }] } });
    ok(r.status === 403 && r.body.code === 'NO_ES_INSTALADORA', 'obra suya que instala otra empresa → 403 NO_ES_INSTALADORA', r.body);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [FOTO_OK, { ...FOTO_OK, driveId: 'drive-inventada-123' }] } });
    ok(r.status === 404 && r.body.code === 'FOTO_NO_ES_DE_LA_OBRA', 'una foto que no está en la obra → 404, y no se escribe NINGUNA', r.body);
    ok(DB.instalador_fotos_escaparate.length === 5, 'todo o nada: ninguna fila nueva', DB.instalador_fotos_escaparate.length);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [{ ...FOTO_OK, slot: 'FOTO_UNIDAD_EXTERIOR', driveId: 'drive-rechazada-12' }] } });
    ok(r.status === 404, 'una foto RECHAZADA en el gestor no se puede proponer → 404', r.body);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [FOTO_OK] } });
    const nueva = DB.instalador_fotos_escaparate.find((f) => f.drive_id === 'drive-despues-1234');
    ok(r.status === 200 && r.body.propuestas === 1, 'proponer una foto de su obra → 200', r.body);
    ok(nueva && nueva.estado === 'PENDIENTE' && nueva.consentimiento_cliente === false && nueva.permiso_cliente === true && nueva.instalador_id === P1 && nueva.municipio === 'TOMELLOSO',
      'nace EN REVISIÓN, sin consentimiento público, con el permiso apuntado y solo el pueblo', nueva);
    r = await pedir('POST', '/api/instalador-app/escaparate/fotos', { tok: 'tok-rca', json: { permiso: true, fotos: [FOTO_OK] } });
    ok(r.status === 200 && r.body.propuestas === 0 && r.body.ya_estaban === 1 && DB.instalador_fotos_escaparate.filter((f) => f.drive_id === 'drive-despues-1234').length === 1, 'idempotente: la segunda vez no duplica', r.body);

    // ── 4. Fotos sueltas: sin carpeta configurada, no se sube nada ──────────
    const fd = new FormData(); fd.append('permiso', 'true'); fd.append('fotos', new Blob([JPG], { type: 'image/jpeg' }), 'a.jpg');
    let rr = await fetch(`${base}/api/instalador-app/escaparate/fotos/subir`, { method: 'POST', headers: { Authorization: 'Bearer tok-rca' }, body: fd });
    ok(rr.status === 503 && (await rr.json()).code === 'ESCAPARATE_SIN_CARPETA' && !DRIVE_LLAMADAS.some((l) => l[0] === 'saveFileToFolder'), 'subir sin DRIVE_FOLDER_ESCAPARATE → 503 y Drive sin tocar', rr.status);
    const fd2 = new FormData(); fd2.append('fotos', new Blob([JPG], { type: 'image/jpeg' }), 'a.jpg');
    rr = await fetch(`${base}/api/instalador-app/escaparate/fotos/subir`, { method: 'POST', headers: { Authorization: 'Bearer tok-rca' }, body: fd2 });
    ok(rr.status === 400 && (await rr.json()).code === 'PERMISO_CLIENTE', 'subir sin el permiso → 400 PERMISO_CLIENTE', rr.status);
    const fd3 = new FormData(); fd3.append('permiso', 'true'); fd3.append('fotos', new Blob([Buffer.from('%PDF-1.4 no soy una foto')], { type: 'image/jpeg' }), 'falsa.jpg');
    rr = await fetch(`${base}/api/instalador-app/escaparate/fotos/subir`, { method: 'POST', headers: { Authorization: 'Bearer tok-rca' }, body: fd3 });
    ok(rr.status === 400 && (await rr.json()).code === 'NO_ES_FOTO', 'un PDF disfrazado de .jpg → 400 NO_ES_FOTO (el tipo, por los bytes)', rr.status);

    // ── 5. Quitar: solo la suya ─────────────────────────────────────────────
    r = await pedir('DELETE', `/api/instalador-app/escaparate/fotos/${F(5)}`, { tok: 'tok-rca' });
    ok(r.status === 404 && fila(F(5)), 'quitar la foto de OTRO → 404 y sigue ahí', r.status);
    r = await pedir('DELETE', `/api/instalador-app/escaparate/fotos/${F(3)}`, { tok: 'tok-rca' });
    ok(r.status === 200 && !fila(F(3)), 'quitar la suya → 200', r.status);

    // ── 6. Textos: nada de teléfonos, correos, webs ni precios ──────────────
    for (const [texto, code] of [
      ['Llámanos al 600 12 34 56', 'TEXTO_CON_TELEFONO'], ['Llámanos al +34 926000000', 'TEXTO_CON_TELEFONO'],
      ['Escríbenos a hola@rca.es', 'TEXTO_CON_EMAIL'], ['Mira www.rca.es', 'TEXTO_CON_WEB'], ['Visita rca-instalaciones.com', 'TEXTO_CON_WEB'],
      ['Aerotermia desde 6.000 €', 'TEXTO_CON_PRECIO'], ['Los mejores precios', 'TEXTO_CON_PRECIO'],
    ]) {
      r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-rca', json: { presentacion: texto } });
      ok(r.status === 400 && r.body.code === code && r.body.error.length > 20, `«${texto}» → 400 ${code}, con un mensaje claro`, r.body);
    }
    r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-rca', json: { pueblos: ['Tomelloso', '926 51 00 00'] } });
    ok(r.status === 400, 'un teléfono en los pueblos → 400', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-rca', json: { presentacion: 'x'.repeat(301) } });
    ok(r.status === 400 && r.body.code === 'TEXTO_LARGO', 'más de 300 letras → 400 TEXTO_LARGO', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-rca', json: { especialidades: ['fontaneria'] } });
    ok(r.status === 400 && r.body.code === 'ESPECIALIDAD_NO_VALIDA', 'especialidad fuera de la lista → 400', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/textos', { tok: 'tok-rca', json: { presentacion: 'Empresa familiar de la Mancha.', especialidades: ['aerotermia'], pueblos: 'Tomelloso, Socuéllamos' } });
    const pend = DB.instalador_textos_escaparate.filter((t) => t.instalador_id === P1 && t.estado === 'PENDIENTE');
    ok(r.status === 200 && pend.length === 1 && pend[0].presentacion === 'Empresa familiar de la Mancha.', 'proponer textos → 200, una sola propuesta viva (sustituye a la anterior)', pend);
    ok(DB.prescriptores.find((p) => p.id_empresa === P1).descripcion_publica === 'Texto de antes.', 'proponer NO publica: los vigentes no cambian', DB.prescriptores[0]);

    // ── 7. La miniatura con llave ───────────────────────────────────────────
    r = await pedir('GET', `/api/instalador-app/escaparate/foto/${F(1)}`);
    ok(r.status === 403, 'miniatura sin llave → 403', r.status);
    r = await pedir('GET', `/api/instalador-app/escaparate/foto/${F(1)}?llave=${encodeURIComponent(llaveDeEscaparate(P2))}`);
    ok(r.status === 403, 'miniatura con la llave de OTRA empresa → 403', r.status);
    r = await pedir('GET', `/api/instalador-app/escaparate/foto/${F(1)}?llave=${encodeURIComponent(llaveDeEscaparate(P1))}`);
    ok(r.status === 200 && /^image\//.test(r.tipo || ''), 'miniatura con su llave → 200 imagen', { s: r.status, t: r.tipo });

    // ── 8. La revisión: la ve el equipo; aprueba y rechaza solo ADMIN ───────
    r = await pedir('GET', '/api/escaparate-revision/contador', { tok: 'tok-rca' });
    ok(r.status === 403, 'un instalador no ve la cola → 403', r.status);
    r = await pedir('GET', '/api/escaparate-revision/contador', { tok: 'tok-trab' });
    const rcaCola = (r.body.por_instalador || []).find((x) => x.id === P1);
    ok(r.status === 200 && rcaCola && rcaCola.fotos === 3 && rcaCola.textos === 1, 'el TRABAJADOR ve el contador (3 fotos y unos textos de RCA)', r.body);
    r = await pedir('GET', `/api/escaparate-revision/instalador/${P1}`, { tok: 'tok-trab' });
    ok(r.status === 200 && r.body.fotos.some((f) => f.id === F(2) && f.obra === '26RES060_900') && r.body.fotos.every((f) => f.miniatura.includes('llave=')), 'la cola enseña al equipo el nº de obra (interno) y la miniatura con llave', r.body.fotos);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(2)}/aprobar`, { tok: 'tok-trab', json: {} });
    ok(r.status === 403 && fila(F(2)).estado === 'PENDIENTE', 'aprobar sin ser ADMIN → 403 y sigue pendiente', r.status);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(2)}/aprobar`, { tok: 'tok-rca', json: {} });
    ok(r.status === 403, 'el instalador no se aprueba a sí mismo → 403', r.status);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(4)}/rechazar`, { tok: 'tok-admin', json: { motivo: 'no' } });
    ok(r.status === 400 && r.body.code === 'FALTA_MOTIVO', 'rechazar sin motivo → 400 FALTA_MOTIVO', r.body);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(2)}/aprobar`, { tok: 'tok-admin', json: { titulo_publico: 'Llama al 600123456' } });
    ok(r.status === 400 && fila(F(2)).estado === 'PENDIENTE', 'aprobar con un teléfono en el título → 400', r.body);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(2)}/aprobar`, { tok: 'tok-admin', json: {} });
    ok(r.status === 200 && fila(F(2)).estado === 'PUBLICADA' && fila(F(2)).consentimiento_cliente === true && fila(F(2)).revisada_por === 'u-admin', 'ADMIN aprueba la de obra → PUBLICADA, por el camino de «Publicar en el escaparate»', fila(F(2)));
    ok(fila(F(2)).par_id === 'par-1', 'y se empareja antes/después con la de su obra (par_id)', fila(F(2)).par_id);
    r = await pedir('POST', `/api/escaparate-revision/fotos/${F(4)}/rechazar`, { tok: 'tok-admin', json: { motivo: 'Se ve la cara del cliente.' } });
    ok(r.status === 200 && fila(F(4)).estado === 'NO_VALE' && fila(F(4)).motivo_rechazo === 'Se ve la cara del cliente.', 'ADMIN rechaza la suelta con su motivo → NO_VALE', fila(F(4)));
    const tPend = DB.instalador_textos_escaparate.find((t) => t.instalador_id === P1 && t.estado === 'PENDIENTE');
    r = await pedir('POST', `/api/escaparate-revision/textos/${tPend.id}/aprobar`, { tok: 'tok-trab', json: {} });
    ok(r.status === 403, 'aprobar textos sin ser ADMIN → 403', r.status);
    r = await pedir('POST', `/api/escaparate-revision/textos/${tPend.id}/aprobar`, { tok: 'tok-admin', json: {} });
    const p1 = DB.prescriptores.find((p) => p.id_empresa === P1);
    ok(r.status === 200 && p1.descripcion_publica === 'Empresa familiar de la Mancha.' && JSON.stringify(p1.zona_trabajo_publica) === JSON.stringify(['Tomelloso', 'Socuéllamos']), 'ADMIN aprueba los textos → pasan a los vigentes', p1);

    // ── 9. La API pública: solo lo publicado y por lista blanca ─────────────
    esc._olvidarRed();
    r = await pedir('GET', '/api/public/marketplace/red/rca/pagina');
    ok(r.status === 200, 'GET /red/rca/pagina (sin sesión) → 200', r.body);
    ok(JSON.stringify(Object.keys(r.body).sort()) === JSON.stringify(['especialidades', 'fotos', 'nombre', 'presentacion', 'pueblos', 'slug']), 'solo las claves de la lista blanca', Object.keys(r.body));
    ok((r.body.fotos || []).every((f) => JSON.stringify(Object.keys(f).filter((k) => k !== 'portada').sort()) === JSON.stringify(['actuacion', 'fase', 'grupo', 'municipio', 'titulo', 'url']) && (f.portada === undefined || f.portada === true)), 'cada foto, solo sus claves de la lista blanca (y `portada: true` en una)', r.body.fotos?.[0]);
    const urls = (r.body.fotos || []).map((f) => f.url);
    ok(urls.length === 2 && urls.includes(`/api/public/marketplace/foto/${F(1)}`) && urls.includes(`/api/public/marketplace/foto/${F(2)}`), 'salen las dos PUBLICADAS', urls);
    ok(![F(4), F(5), 'drive-despues-1234'].some((x) => r.txt.includes(x)) && !DB.instalador_fotos_escaparate.filter((f) => f.estado !== 'PUBLICADA').some((f) => r.txt.includes(f.id)), 'ninguna en revisión ni rechazada', urls);
    ok(!/drive|26RES|expediente|CARMEN|RUIZ|OLIVO|cliente|clave_rara/i.test(r.txt), 'ni Drive, ni nº de obra, ni el cliente, ni especialidades fuera de la lista', r.txt);
    ok(r.body.fotos.every((f) => f.municipio === 'Tomelloso') && r.body.presentacion === 'Empresa familiar de la Mancha.', 'la geografía, solo el pueblo; la presentación, la VIGENTE', r.body);
    r = await pedir('GET', '/api/public/marketplace/red/otro/pagina');
    ok(r.status === 404, 'un instalador oculto en la web → 404', r.status);
    r = await pedir('GET', '/api/public/marketplace/red/fuera/pagina');
    ok(r.status === 404, 'un instalador sin obra no está en la red → 404', r.status);
    r = await pedir('GET', '/api/public/marketplace/red/RCA%3Cscript%3E/pagina');
    ok(r.status === 404, 'un slug raro → 404', r.status);
    r = await pedir('GET', `/api/public/marketplace/foto/${F(5)}`);
    ok(r.status === 404, 'la foto pública de una EN REVISIÓN → 404 (aunque se sepa su id)', r.status);
    r = await pedir('GET', `/api/public/marketplace/foto/${F(4)}`);
    ok(r.status === 404, 'la foto pública de una RECHAZADA → 404', r.status);
    r = await pedir('GET', `/api/public/marketplace/foto/${F(1)}`);
    ok(r.status === 200, 'la foto pública de una PUBLICADA → 200', r.status);

    // ── 9.b La PORTADA (fase 8): la elige él entre sus publicadas; sin elegir, la 1.ª «después» ──
    const portadaApi = async () => { esc._olvidarRed(); const x = await pedir('GET', '/api/public/marketplace/red/rca/pagina'); return (x.body.fotos || []).filter((f) => f.portada).map((f) => f.url.split('/').pop()); };
    ok(JSON.stringify(await portadaApi()) === JSON.stringify([F(1)]), 'sin elegir: portada automática = la primera «después» (y solo UNA marcada)', await portadaApi());
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-rca' });
    ok(r.body.fotos.find((f) => f.id === F(1))?.portada === 'automatica' && r.body.fotos.filter((f) => f.portada).length === 1, 'en su app: esa foto sale como portada «automática»', r.body.fotos.map((f) => [f.id.slice(-2), f.portada]));
    r = await pedir('PUT', '/api/instalador-app/escaparate/portada', { json: { fotoId: F(2) } });
    ok(r.status === 401, 'poner portada sin sesión → 401', r.status);
    r = await pedir('PUT', '/api/instalador-app/escaparate/portada', { tok: 'tok-rca', json: { fotoId: F(5) } });
    ok(r.status === 404 && !(Number(fila(F(5)).orden) < 0), 'la foto de OTRO instalador no puede ser su portada → 404', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/portada', { tok: 'tok-rca', json: { fotoId: F(4) } });
    ok(r.status === 409 && r.body.code === 'FOTO_NO_PUBLICADA', 'una foto no publicada (rechazada o en revisión) → 409 FOTO_NO_PUBLICADA', r.body);
    r = await pedir('PUT', '/api/instalador-app/escaparate/portada', { tok: 'tok-rca', json: { fotoId: F(2) } });
    ok(r.status === 200 && fila(F(2)).orden === esc.ORDEN_PORTADA, 'elige una suya publicada → 200 (orden = -1), sin pasar por revisión', fila(F(2)));
    let pa = await portadaApi();
    ok(JSON.stringify(pa) === JSON.stringify([F(2)]), 'la API pública marca la ELEGIDA (aunque sea un «antes»), y solo esa', pa);
    esc._olvidarRed();
    r = await pedir('GET', '/api/public/marketplace/red/rca/pagina');
    ok(r.body.fotos[0].url.endsWith(F(2)), 'y la da la primera de la lista', r.body.fotos.map((f) => f.url.slice(-2)));
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-rca' });
    ok(r.body.fotos.find((f) => f.id === F(2))?.portada === 'elegida', 'en su app sale como «elegida»', r.body.fotos.map((f) => [f.id.slice(-2), f.portada]));
    r = await pedir('PUT', '/api/escaparate-revision/instalador/' + P1 + '/portada', { tok: 'tok-trab', json: { fotoId: F(1) } });
    ok(r.status === 403 && fila(F(2)).orden === esc.ORDEN_PORTADA, 'cambiarla desde el CRM sin ser ADMIN → 403', r.status);
    r = await pedir('GET', `/api/escaparate-revision/instalador/${P1}`, { tok: 'tok-trab' });
    ok(r.status === 200 && (r.body.publicadas || []).length === 2 && r.body.publicadas.find((f) => f.id === F(2))?.portada === 'elegida', 'la ficha del CRM lista sus publicadas con la portada', r.body.publicadas);
    r = await pedir('PUT', '/api/escaparate-revision/instalador/' + P1 + '/portada', { tok: 'tok-admin', json: { fotoId: F(1) } });
    ok(r.status === 200 && fila(F(1)).orden === esc.ORDEN_PORTADA && fila(F(2)).orden === 0, 'ADMIN la cambia desde el CRM: una sola portada (la anterior vuelve a 0)', [fila(F(1)).orden, fila(F(2)).orden]);
    r = await pedir('PUT', '/api/instalador-app/escaparate/portada', { tok: 'tok-rca', json: { fotoId: null } });
    ok(r.status === 200 && !DB.instalador_fotos_escaparate.some((f) => f.instalador_id === P1 && Number(f.orden) < 0), 'fotoId null → se quita y vuelve la automática', DB.instalador_fotos_escaparate.map((f) => f.orden));
    ok(JSON.stringify(await portadaApi()) === JSON.stringify([F(1)]), 'la automática otra vez', await portadaApi());
    ok(!Number(fila(F(5)).orden), 'la de OTRO instalador no se ha tocado nunca', fila(F(5)).orden);

    // ── 10. NO REGRESIÓN del escaparate antiguo (galería por slug y el botón del gestor) ──
    reiniciar();
    Object.assign(DB.prescriptores.find((p) => p.id_empresa === P1), { marketplace_slug: 'rca', visible_marketplace: true });
    r = await pedir('GET', '/api/public/marketplace/instaladores/rca/fotos');
    const urlsViejas = JSON.stringify(r.body);
    ok(r.status === 200 && urlsViejas.includes(F(1)) && ![F(2), F(3), F(4)].some((x) => urlsViejas.includes(x)), 'galería antigua: sigue sirviendo la publicada y NO lo que está en revisión o rechazado', r.body);
    r = await pedir('GET', `/api/oportunidades/${OP1}/docs/escaparate`, { tok: 'tok-trab' });
    ok(r.status === 200 && (r.body.publicadas || []).map((f) => f.id).join() === F(1), 'gestor: la estrella solo en las PUBLICADAS', r.body);
    r = await pedir('POST', `/api/oportunidades/${OP1}/docs/FOTO_CALDERA_ANTES/publicar-escaparate`, { tok: 'tok-trab', json: { driveId: 'drive-antes-123456', consentimiento_cliente: true } });
    ok(r.status === 403, 'botón «Publicar en el escaparate»: sigue siendo solo de ADMIN', r.status);
    r = await pedir('POST', `/api/oportunidades/${OP1}/docs/FOTO_CALDERA_ANTES/publicar-escaparate`, { tok: 'tok-admin', json: { driveId: 'drive-antes-123456', consentimiento_cliente: true } });
    const pub = DB.instalador_fotos_escaparate.find((f) => f.drive_id === 'drive-antes-123456');
    ok(r.status === 200 && r.body.fase === 'ANTES' && r.body.actuacion === 'aerotermia' && pub?.estado === 'PUBLICADA' && pub.consentimiento_cliente === true && pub.par_id === 'par-1' && pub.municipio === 'TOMELLOSO' && pub.instalador_id === P1,
      'botón del ADMIN: publica como siempre (fase, actuación, par, pueblo e instalador)', { body: r.body, pub });
    r = await pedir('POST', `/api/oportunidades/${OP1}/docs/FOTO_CALDERA_ANTES/publicar-escaparate`, { tok: 'tok-admin', json: { driveId: 'drive-pend-123456', consentimiento_cliente: true } });
    ok(r.status === 200 && fila(F(2)).estado === 'PUBLICADA' && DB.instalador_fotos_escaparate.filter((f) => f.drive_id === 'drive-pend-123456').length === 1, 'el botón sobre una foto que el instalador tenía EN REVISIÓN la publica sin duplicarla', fila(F(2)));

    // ── 11. Con la BD caída, 503 (nunca una página vacía) ───────────────────
    reiniciar(); FALLA = 'instalador_fotos_escaparate';
    r = await pedir('GET', '/api/instalador-app/escaparate', { tok: 'tok-rca' });
    ok(r.status === 503 && r.body.code === 'PAGINA_UNAVAILABLE', 'BD caída → GET /escaparate 503', r.body);
    r = await pedir('GET', '/api/escaparate-revision/contador', { tok: 'tok-trab' });
    ok(r.status === 503, 'BD caída → contador de la cola 503', r.status);
    r = await pedir('GET', '/api/public/marketplace/red/rca/pagina');
    ok(r.status === 503, 'BD caída → página pública 503', r.status);
    FALLA = null;

    ok(!DRIVE_LLAMADAS.some((l) => l[0] !== 'leer'), 'Drive: solo se ha LEÍDO (ni subir, ni borrar)', DRIVE_LLAMADAS);
  } catch (e) {
    fallos++; console.error('✗ excepción:', e.stack || e.message);
  } finally {
    srv.close();
    console.log(`\n${fallos ? '✗' : '✓'} ${n - fallos}/${n} comprobaciones del escaparate${fallos ? ` — ${fallos} FALLAN` : ''}`);
    process.exit(fallos ? 1 : 0);
  }
});
