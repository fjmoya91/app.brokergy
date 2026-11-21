// App del INSTALADOR, fase 4 — el CATÁLOGO de aerotermia con TARIFAS.
// Rutas REALES (`routes/instaladorApp.js` bloque «FASE 4» y `routes/aerotermiaTarifas.js`)
// con Supabase y Drive SIMULADOS en memoria: ninguna escritura sale de este proceso.
// El Excel se GENERA aquí con exceljs. Comprueba:
//   · quién entra: sin sesión 401; fuera de la beta 403; cargar/confirmar sin ser ADMIN 403;
//   · el instalador ve solo SUS marcas, la tarifa VIGENTE, SU precio (nunca el de otro),
//     SCOP con dos decimales y ningún enlace de Drive; sin marcas, ningún equipo;
//   · el casado del Excel: exacto, con guiones/espacios/minúsculas, ambiguo, sin pareja,
//     precio que cambia, igual, error y duplicado; la lectura EN SECO no escribe nada;
//   · confirmar solo con la firma de lo leído (409 si no), y la tarifa nueva NO borra la vieja.
//   node scripts/test_catalogo_instalador.js   (desde implementation/backend)
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
const path = require('path');
const B = path.join(__dirname, '..');
const P1 = '10000000-0000-4000-8000-000000000001'; // RCA (beta, MARCA A)
const P2 = '10000000-0000-4000-8000-000000000002'; // OTRO (beta, MARCA A y MARCA B)
const P3 = '10000000-0000-4000-8000-000000000003'; // FUERA de la beta
const P4 = '10000000-0000-4000-8000-000000000004'; // SIN MARCAS (beta)
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false',
  ESCAPARATE_AVISOS_ENABLED: 'false', APP_INSTALADOR_BETA: `${P1}, ${P2}, ${P4}`, NODE_ENV: 'test',
});
const HOY = new Date().toISOString().slice(0, 10);
const FICHA = 'https://drive.google.com/file/d/FICHA1234567890abc/view';
const INICIAL = () => ({
  usuarios: [
    { auth_user_id: 'a-tok-admin', id_usuario: '90000000-0000-4000-8000-000000000001', activo: true, roles: { nombre_rol: 'ADMIN' } },
    { auth_user_id: 'a-tok-trab', id_usuario: 'u-trab', activo: true, roles: { nombre_rol: 'TRABAJADOR' } },
    { auth_user_id: 'a-tok-rca', id_usuario: 'u-rca', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-otro', id_usuario: 'u-otro', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-fuera', id_usuario: 'u-fuera', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-sin', id_usuario: 'u-sin', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
  ],
  prescriptores: [
    { id_empresa: P1, representante_legal_id: 'u-rca', razon_social: 'RCA', acronimo: 'RCA', tipo_empresa: 'INSTALADOR', marca_referencia: 'MARCA A' },
    { id_empresa: P2, representante_legal_id: 'u-otro', razon_social: 'OTRO', acronimo: 'OTRO', tipo_empresa: 'INSTALADOR', marca_referencia: 'MARCA A, marca b' },
    { id_empresa: P3, representante_legal_id: 'u-fuera', razon_social: 'FUERA', acronimo: 'FUERA', tipo_empresa: 'INSTALADOR', marca_referencia: 'MARCA A' },
    { id_empresa: P4, representante_legal_id: 'u-sin', razon_social: 'SIN', acronimo: 'SIN', tipo_empresa: 'INSTALADOR', marca_referencia: null },
  ],
  aerotermia: [
    { id: 1, marca: 'MARCA A', modelo_comercial: 'Monobloc 8 kW', modelo_ud_exterior: 'WH-WDG08ME5', tipo: 'MONOBLOCK', potencia_calefaccion: 8, seer: 4.5,
      scop_cal_calido_35: 4.6789, scop_cal_calido_55: 3.4211, refrigerante: 'R290', ficha_tecnica: FICHA,
      ficha_tecnica_partes: { piezas: [{ nombre: 'ft.pdf' }, { nombre: 'EPREL 123 · ficha de producto (ES)' }, { nombre: 'EPREL 123 · etiqueta energética' }] } },
    { id: 2, marca: 'MARCA A', modelo_comercial: 'Monobloc 12 kW', modelo_ud_exterior: 'WH-WDG12ME5', tipo: 'MONOBLOCK', potencia_calefaccion: 12, scop_cal_medio_35: 4.1, scop_cal_medio_55: 3.05 },
    { id: 3, marca: 'MARCA A', modelo_comercial: 'Todo en uno 10', modelo_conjunto: 'WH-ADC10 + WH-UD10', modelo_ud_exterior: 'WH-UD10', tipo: 'BIBLOCK', potencia_calefaccion: 10, deposito_acs_incluido: true, litros_acs: 190, scop_dhw_calido: 3.2 },
    { id: 4, marca: 'MARCA A', modelo_comercial: 'Todo en uno 10 185', modelo_conjunto: 'WH-ADC10-185 + WH-UD10', modelo_ud_exterior: 'WH-UD10', tipo: 'BIBLOCK', potencia_calefaccion: 10, deposito_acs_incluido: true, litros_acs: 185 },
    { id: 5, marca: 'MARCA B', modelo_comercial: 'Bibloc 14', modelo_ud_exterior: 'B-14', tipo: 'BIBLOCK', potencia_calefaccion: 14 },
  ],
  aerotermia_tarifas: [
    { id: 't1', aerotermia_id: 2, precio_sin_iva: 4800, vigente_desde: '2025-01-01', cargada_at: '2025-01-01T10:00:00Z' },
    { id: 't2', aerotermia_id: 2, precio_sin_iva: 5000, vigente_desde: '2026-01-01', cargada_at: '2026-01-01T10:00:00Z' },
    { id: 't3', aerotermia_id: 2, precio_sin_iva: 9999, vigente_desde: '2099-01-01', cargada_at: '2026-02-01T10:00:00Z' }, // aún no vale
    { id: 't4', aerotermia_id: 5, precio_sin_iva: 3000, vigente_desde: '2026-01-01', cargada_at: '2026-01-01T10:00:00Z' },
  ],
  aerotermia_tarifas_cargas: [],
  instalador_precios_equipo: [
    { id: 'pp1', instalador_id: P2, aerotermia_id: 1, precio_sin_iva: 7777 }, // de OTRO: RCA no lo ve nunca
  ],
});
let DB = INICIAL();
let FALLA = null;
const ESCRITURAS = [];

// ── Supabase simulado ───────────────────────────────────────────────────────
let nId = 0;
function qb(table) {
  const st = { filtros: [], op: 'select', payload: null, desde: 0, hasta: null, limit: null, conflicto: null, devolver: false };
  const filas = () => (DB[table] || []).filter((r) => st.filtros.every((f) => f(r)));
  const ejecutar = () => {
    if (FALLA === table) return { data: null, error: { message: '521 Web server is down' } };
    if (st.op !== 'select') ESCRITURAS.push([st.op, table]);
    if (st.op === 'insert') {
      const nuevas = [].concat(st.payload).map((r) => ({ id: `id-${++nId}`, cargada_at: new Date().toISOString(), ...r }));
      (DB[table] = DB[table] || []).push(...nuevas);
      return { data: nuevas, error: null };
    }
    if (st.op === 'upsert') {
      const claves = st.conflicto.split(',');
      for (const r of [].concat(st.payload)) {
        const ya = (DB[table] || []).find((x) => claves.every((k) => String(x[k]) === String(r[k])));
        if (ya) Object.assign(ya, r); else (DB[table] = DB[table] || []).push({ id: `id-${++nId}`, ...r });
      }
      return { data: null, error: null };
    }
    if (st.op === 'delete') { const fuera = new Set(filas()); DB[table] = (DB[table] || []).filter((r) => !fuera.has(r)); return { data: null, error: null }; }
    let rows = filas().map((r) => JSON.parse(JSON.stringify(r)));
    if (st.hasta != null) rows = rows.slice(st.desde, st.hasta + 1);
    if (st.limit) rows = rows.slice(0, st.limit);
    return { data: rows, error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve((() => { const r = ejecutar(); return r.error ? r : { data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: null }; })());
    if (k === 'select') return () => b;
    if (k === 'insert') return (p) => { st.op = 'insert'; st.payload = p; return b; };
    if (k === 'upsert') return (p, o) => { st.op = 'upsert'; st.payload = p; st.conflicto = o?.onConflict; return b; };
    if (k === 'update') return (p) => { st.op = 'update'; st.payload = p; return b; };
    if (k === 'delete') return () => { st.op = 'delete'; return b; };
    if (k === 'eq') return (c, v) => { st.filtros.push((r) => String(r[c]) === String(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filtros.push((r) => vs.map(String).includes(String(r[c]))); return b; };
    if (k === 'lte') return (c, v) => { st.filtros.push((r) => String(r[c]) <= String(v)); return b; };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    if (k === 'range') return (a, z) => { st.desde = a; st.hasta = z; return b; };
    return () => b; // order, etc.
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) }, from: qb, rpc: () => Promise.resolve({ data: null, error: null }) };
const PDF = Buffer.from('%PDF-1.4 ficha de prueba');
const DRIVE = [];
const fakeDrive = new Proxy({
  getFileMetadata: async (id) => { DRIVE.push(['meta', id]); return { id, name: 'ficha.pdf', mimeType: 'application/pdf' }; },
  getFileContent: async (id) => { DRIVE.push(['leer', id]); return PDF; },
}, { get: (o, k) => o[k] || (async () => { DRIVE.push([k]); throw new Error('Drive no se toca en este test'); }) });
for (const [mod, exp] of [['services/supabaseClient.js', fakeSb], ['services/driveService.js', fakeDrive]]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}

const express = require(path.join(B, 'node_modules/express'));
const ExcelJS = require(path.join(B, 'node_modules/exceljs'));
const app = express(); app.use(express.json());
app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));
app.use('/api/aerotermia/tarifas', require(path.join(B, 'routes/aerotermiaTarifas')));
const CT = require(path.join(B, 'services/catalogoTarifas'));

async function excel(filas, { cabecera = ['MARCA', 'MODELO', 'PRECIO SIN IVA'], arriba = 0 } = {}) {
  const wb = new ExcelJS.Workbook();
  const h = wb.addWorksheet('Tarifa');
  for (let i = 0; i < arriba; i++) h.addRow([i === 0 ? 'TARIFA DISTRIBUIDOR 2026' : '']);
  h.addRow(cabecera);
  for (const f of filas) h.addRow(f);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const ok = (cond, texto, detalle) => { n++; if (!cond) fallos++; console.log(`${cond ? '✓' : '✗'} ${texto}${cond ? '' : `\n     → ${typeof detalle === 'string' ? detalle : JSON.stringify(detalle)}`}`); };
  const pedir = async (metodo, ruta, { tok, json, form } = {}) => {
    const h = tok ? { Authorization: `Bearer ${tok}` } : {};
    let body;
    if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const r = await fetch(base + ruta, { method: metodo, headers: h, body });
    const buf = Buffer.from(await r.arrayBuffer()); const txt = buf.toString('utf8');
    let cuerpo = txt; try { cuerpo = JSON.parse(txt); } catch { /* binario */ }
    return { status: r.status, body: cuerpo, txt, buf, tipo: r.headers.get('content-type') };
  };
  const formExcel = (buf, campos = {}) => {
    const f = new FormData();
    f.append('fichero', new Blob([buf]), 'tarifa marca a.xlsx');
    for (const [k, v] of Object.entries(campos)) f.append(k, typeof v === 'string' ? v : JSON.stringify(v));
    return f;
  };
  const foto = () => JSON.stringify(DB);

  try {
    // ── 1. Quién entra ──────────────────────────────────────────────────────
    let r = await pedir('GET', '/api/instalador-app/catalogo');
    ok(r.status === 401, 'catálogo sin sesión → 401', r.status);
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-fuera' });
    ok(r.status === 403 && r.body.code === 'APP_INSTALADOR_OFF', 'instalador fuera de la beta → 403', r.body);
    r = await pedir('PUT', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-fuera', json: { precio: 1000 } });
    ok(r.status === 403, 'fuera de la beta tampoco guarda precio → 403', r.status);
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-admin' });
    ok(r.status === 403, 'un ADMIN no usa la app del instalador → 403', r.status);
    for (const [m, ruta] of [['GET', '/plantilla'], ['POST', '/leer'], ['POST', '/confirmar'], ['GET', '/cargas']]) {
      r = await pedir(m, `/api/aerotermia/tarifas${ruta}`);
      ok(r.status === 401, `tarifas ${m} ${ruta} sin sesión → 401`, r.status);
      for (const tok of ['tok-rca', 'tok-trab']) {
        r = await pedir(m, `/api/aerotermia/tarifas${ruta}`, { tok, form: m === 'POST' ? formExcel(await excel([['MARCA A', 'WH-WDG08ME5', 1]]), { distribuidor: 'X', vigente_desde: HOY }) : undefined });
        ok(r.status === 403, `tarifas ${m} ${ruta} como ${tok === 'tok-rca' ? 'INSTALADOR' : 'TRABAJADOR'} → 403`, r.status);
      }
    }
    ok(ESCRITURAS.length === 0, 'ninguna de esas llamadas ha escrito nada', ESCRITURAS);

    // ── 2. El catálogo del instalador ───────────────────────────────────────
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-rca' });
    ok(r.status === 200, 'GET /catalogo → 200', r.body);
    const ids = r.body.equipos.map((e) => e.id).sort();
    ok(JSON.stringify(ids) === '[1,2,3,4]' && JSON.stringify(r.body.marcas) === '["MARCA A"]', 'RCA ve SOLO su marca (MARCA A), no la MARCA B', { ids, m: r.body.marcas });
    const e1 = r.body.equipos.find((e) => e.id === 1), e2 = r.body.equipos.find((e) => e.id === 2), e3 = r.body.equipos.find((e) => e.id === 3);
    ok(e1.tu_precio === null, 'RCA NO ve el precio que OTRO puso al equipo 1', e1);
    ok(e1.tarifa === null, 'equipo sin tarifa cargada → tarifa null (no un cero)', e1.tarifa);
    ok(e2.tarifa?.precio === 5000 && e2.tarifa?.desde === '2026-01-01', 'tarifa VIGENTE: la última ya empezada (ni la vieja ni la de 2099)', e2.tarifa);
    ok(e1.scop_suelo === 4.68 && e1.scop_radiadores === 3.42 && e1.clima_scop === 'calido', 'SCOP con dos decimales (cálido)', e1);
    ok(e2.scop_suelo === 4.1 && e2.clima_scop === 'medio', 'sin SCOP cálido, el medio, y lo dice', e2);
    ok(e3.acs === 'Con depósito de 190 l dentro' && e3.uso === 'Calefacción y agua caliente', 'lo que hace, en lenguaje de casa', e3);
    ok(e1.papeles.length === 1 && e1.papeles[0].incluye.includes('la etiqueta energética'), 'sus papeles: la ficha técnica y lo que lleva dentro', e1.papeles);
    ok(!/drive\.google|FICHA1234567890|ficha_tecnica|margen|comision/i.test(r.txt), 'ni enlaces de Drive, ni ficha_tecnica, ni márgenes en la respuesta', r.txt.slice(0, 200));
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-otro' });
    ok(r.body.equipos.length === 5 && r.body.equipos.find((e) => e.id === 1).tu_precio === 7777, 'OTRO (MARCA A y b, en minúscula) ve las dos y SU precio', r.body.equipos.map((e) => [e.id, e.tu_precio]));
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-sin' });
    ok(r.status === 200 && r.body.sin_marcas === true && r.body.equipos.length === 0, 'instalador SIN marcas asignadas → ningún equipo (conservador)', r.body);
    r = await pedir('GET', '/api/instalador-app/catalogo/5', { tok: 'tok-rca' });
    ok(r.status === 404, 'ficha de un equipo de OTRA marca → 404', r.status);
    r = await pedir('GET', '/api/instalador-app/catalogo/1', { tok: 'tok-rca' });
    ok(r.status === 200 && r.body.id === 1 && r.body.ref === 'WH-WDG08ME5', 'ficha de un equipo suyo → 200', r.body);
    r = await pedir('GET', '/api/instalador-app/catalogo/1/ficha', { tok: 'tok-rca' });
    ok(r.status === 200 && /pdf/.test(r.tipo) && r.buf.equals(PDF), 'la ficha técnica sale por PROXY (PDF), no como enlace', { s: r.status, t: r.tipo });
    r = await pedir('GET', '/api/instalador-app/catalogo/2/ficha', { tok: 'tok-rca' });
    ok(r.status === 404 && r.body.code === 'SIN_FICHA', 'equipo sin ficha → 404 SIN_FICHA', r.body);
    r = await pedir('GET', '/api/instalador-app/catalogo/5/ficha', { tok: 'tok-rca' });
    ok(r.status === 404, 'la ficha de un equipo de otra marca → 404', r.status);

    // ── 3. Su precio ────────────────────────────────────────────────────────
    r = await pedir('PUT', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-rca', json: { precio: 'mucho' } });
    ok(r.status === 400 && r.body.code === 'PRECIO_NO_VALIDO', 'precio que no es un número → 400', r.body);
    r = await pedir('PUT', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-rca', json: { precio: -5 } });
    ok(r.status === 400, 'precio negativo → 400', r.status);
    r = await pedir('PUT', '/api/instalador-app/catalogo/5/precio', { tok: 'tok-rca', json: { precio: 1000 } });
    ok(r.status === 404, 'precio a un equipo de otra marca → 404', r.status);
    r = await pedir('PUT', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-rca', json: { precio: '6.900,50', instalador_id: P2 } });
    const mio = DB.instalador_precios_equipo.filter((p) => p.instalador_id === P1);
    ok(r.status === 200 && r.body.tu_precio === 6900.5 && mio.length === 1 && mio[0].aerotermia_id === 1, 'guarda SU precio («6.900,50» → 6900.5) en SU empresa, ignore el id que mande', { b: r.body, mio });
    ok(DB.instalador_precios_equipo.find((p) => p.id === 'pp1').precio_sin_iva === 7777, 'el precio de OTRO no se ha tocado', DB.instalador_precios_equipo);
    r = await pedir('PUT', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-rca', json: { precio: 7000 } });
    ok(DB.instalador_precios_equipo.filter((p) => p.instalador_id === P1).length === 1 && r.body.tu_precio === 7000, 'cambiarlo no duplica la fila', DB.instalador_precios_equipo);
    r = await pedir('GET', '/api/instalador-app/catalogo/1', { tok: 'tok-otro' });
    ok(r.body.tu_precio === 7777, 'OTRO sigue viendo SU precio, no el de RCA', r.body.tu_precio);
    r = await pedir('DELETE', '/api/instalador-app/catalogo/1/precio', { tok: 'tok-rca' });
    ok(r.status === 200 && !DB.instalador_precios_equipo.some((p) => p.instalador_id === P1) && DB.instalador_precios_equipo.length === 1, 'quitar su precio borra SOLO el suyo', DB.instalador_precios_equipo);

    // ── 4. El casado (unidad) ───────────────────────────────────────────────
    ok(CT.precioDe('4.650,00 €') === 4650 && CT.precioDe('4650.5') === 4650.5 && CT.precioDe('4,650.00') === 4650 && CT.precioDe(5940) === 5940 && CT.precioDe('1.234') === 1234, 'precios: 4.650,00 € · 4650.5 · 4,650.00 · número · 1.234', '');
    ok(CT.precioDe('') === null && CT.precioDe('abc') === null && CT.precioDe(0) === null && CT.precioDe(2e6) === null, 'precios no válidos → null', '');
    const dup = CT.casar([{ fila: 2, marca: 'MARCA A', ref: 'WH-WDG08ME5', precio: 10 }, { fila: 3, marca: 'MARCA A', ref: 'wh wdg08me5', precio: 11 }, { fila: 4, marca: 'MARCA B', ref: 'B-14', precio: 5 }, { fila: 5, marca: 'MARCA B', ref: 'B14', precio: 5 }], DB.aerotermia);
    ok(dup.filas[0].estado === 'DUPLICADA' && dup.filas[1].estado === 'DUPLICADA' && dup.filas[2].estado === 'CASA' && dup.filas[3].estado === 'REPETIDA' && dup.plan.length === 1, 'el mismo modelo con dos precios: ninguno; con el mismo: el primero', dup.filas.map((f) => f.estado));

    // ── 5. El Excel EN SECO ─────────────────────────────────────────────────
    const xlsx = await excel([
      ['MARCA A', 'WH-WDG08ME5', 4650],              // 3: exacto → NUEVA
      ['marca a', 'wh wdg 12me5', '5.200,00 €'],     // 4: minúsculas, espacios → SUBE (5000)
      ['MARCA A', 'WH-UD10', 6000],                  // 5: dos modelos con esa ud. exterior → AMBIGUA
      ['MARCA A', 'NO-EXISTE', 100],                 // 6: sin pareja
      ['MARCA Z', 'X', 100],                         // 7: marca que no está
      ['MARCA B', 'B 14', 'abc'],                    // 8: precio que no vale
      ['Marca B', 'B-14', 3000],                     // 9: igual que la vigente
      ['MARCÁ A', 'Todo en uno 10 185', 7000],       // 10: por el nombre comercial (y tilde) → NUEVA
      ['', '', ''],                                  // en blanco: se salta
    ], { arriba: 1 });
    const antes = foto(); ESCRITURAS.length = 0;
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY }) });
    ok(r.status === 200 && r.body.en_seco === true, 'leer en seco → 200', r.body);
    const est = Object.fromEntries((r.body.filas || []).map((f) => [f.fila, f.estado + (f.cambio ? ':' + f.cambio : '')]));
    ok(est[3] === 'CASA:NUEVA', 'fila exacta → CASA, NUEVA', est);
    ok(est[4] === 'CASA:SUBE' && r.body.filas.find((f) => f.fila === 4).anterior === 5000 && r.body.filas.find((f) => f.fila === 4).aerotermia_id === 2, 'con minúsculas, espacios y «5.200,00 €» → CASA con el 2, SUBE desde 5000', r.body.filas.find((f) => f.fila === 4));
    ok(est[5] === 'AMBIGUA' && JSON.stringify(r.body.filas.find((f) => f.fila === 5).candidatos.map((c) => c.id)) === '[3,4]', 'ambigua → no casa, con sus dos candidatos', r.body.filas.find((f) => f.fila === 5));
    ok(est[6] === 'SIN_PAREJA' && est[7] === 'SIN_PAREJA' && est[8] === 'ERROR', 'sin pareja (modelo y marca) y error de precio', est);
    ok(est[9] === 'CASA:IGUAL' && est[10] === 'CASA:NUEVA', 'precio igual al vigente → IGUAL; por el comercial y con tilde → NUEVA', est);
    ok(r.body.resumen.a_guardar === 3 && r.body.resumen.leidas === 8 && r.body.resumen.ambiguas === 1 && r.body.resumen.sin_pareja === 2, 'resumen: 8 filas, 3 a guardar, 1 ambigua, 2 sin pareja', r.body.resumen);
    ok(foto() === antes && ESCRITURAS.length === 0, 'la lectura EN SECO NO escribe nada', ESCRITURAS);
    ok(!/drive/i.test(r.txt), 'la lectura no habla de Drive (el Excel no se guarda)', '');
    const seco1 = r.body;

    // Lo que no vale como Excel, por sus BYTES.
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(Buffer.from('%PDF-1.4 esto no es un excel'), { distribuidor: 'Dist', vigente_desde: HOY }) });
    ok(r.status === 400 && r.body.code === 'NO_ES_XLSX', 'un PDF con nombre .xlsx → 400 NO_ES_XLSX', r.body);
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(await excel([['A', 'B', 1]], { cabecera: ['UNO', 'DOS', 'TRES'] }), { distribuidor: 'Dist', vigente_desde: HOY }) });
    ok(r.status === 400 && r.body.code === 'SIN_CABECERA', 'sin columnas MARCA / MODELO / PRECIO → 400 SIN_CABECERA', r.body);
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { vigente_desde: HOY }) });
    ok(r.status === 400 && r.body.code === 'FALTA_DISTRIBUIDOR', 'sin distribuidor → 400', r.body);
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Dist', vigente_desde: 'mañana' }) });
    ok(r.status === 400 && r.body.code === 'FALTA_FECHA', 'fecha que no vale → 400', r.body);

    // ── 6. Confirmar ────────────────────────────────────────────────────────
    r = await pedir('POST', '/api/aerotermia/tarifas/confirmar', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, sha256: seco1.sha256, firma: 'f'.repeat(64) }) });
    ok(r.status === 409 && r.body.code === 'PLAN_CAMBIADO' && foto() === antes, 'confirmar con una firma que no es la de lo leído → 409 y nada escrito', r.body);
    // Se resuelve a mano la ambigua (fila 5 → el 3) y se vuelve a leer: eso da la firma.
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, elecciones: { 5: 3 } }) });
    const f5 = r.body.filas.find((f) => f.fila === 5);
    ok(f5.estado === 'CASA' && f5.aerotermia_id === 3 && f5.elegida_a_mano && r.body.resumen.a_guardar === 4, 'elegida a mano entre SUS candidatos → CASA (4 a guardar)', f5);
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, elecciones: { 5: 5 } }) });
    ok(r.body.filas.find((f) => f.fila === 5).estado === 'AMBIGUA', 'elegir un modelo que NO es candidato no vale: sigue ambigua', r.body.filas.find((f) => f.fila === 5));
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, elecciones: { 5: 3 } }) });
    const seco2 = r.body;
    const tarifasAntes = DB.aerotermia_tarifas.length;
    r = await pedir('POST', '/api/aerotermia/tarifas/confirmar', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, elecciones: { 5: 3 }, sha256: seco2.sha256, firma: seco2.firma }) });
    ok(r.status === 200 && r.body.guardadas === 4, 'confirmar con la firma de lo leído → guarda 4', r.body);
    ok(DB.aerotermia_tarifas.length === tarifasAntes + 4 && DB.aerotermia_tarifas.some((t) => t.id === 't2'), 'la tarifa nueva NO borra la anterior (histórico)', DB.aerotermia_tarifas.length);
    const carga = DB.aerotermia_tarifas_cargas[0];
    ok(carga && carga.distribuidor === 'Distribuidor Uno' && carga.fichero_nombre === 'tarifa marca a.xlsx' && /^[0-9a-f]{64}$/.test(carga.fichero_sha256) && carga.cargada_por === '90000000-0000-4000-8000-000000000001' && !('buffer' in carga), 'la carga guarda distribuidor, nombre, huella y quién; el Excel NO', carga);
    ok(DB.aerotermia_tarifas.filter((t) => t.carga_id === carga.id).every((t) => t.distribuidor === 'Distribuidor Uno' && t.vigente_desde === HOY && t.fila_excel), 'cada tarifa dice de qué carga, fila y distribuidor sale y desde cuándo', '');
    ok(!DB.aerotermia_tarifas.some((t) => t.carga_id === carga.id && t.aerotermia_id === 5), 'la fila IGUAL no se vuelve a guardar', '');
    r = await pedir('POST', '/api/aerotermia/tarifas/confirmar', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Distribuidor Uno', vigente_desde: HOY, elecciones: { 5: 3 }, sha256: seco2.sha256, firma: seco2.firma }) });
    ok(r.status === 409, 'confirmar dos veces lo mismo: la segunda ya no casa con lo leído → 409', r.status);
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-rca' });
    ok(r.body.equipos.find((e) => e.id === 2).tarifa.precio === 5200 && r.body.equipos.find((e) => e.id === 1).tarifa.precio === 4650, 'el instalador ve ya la tarifa nueva', r.body.equipos.map((e) => [e.id, e.tarifa]));
    const cargasAntes = DB.aerotermia_tarifas_cargas.length;
    FALLA = 'aerotermia_tarifas';
    r = await pedir('POST', '/api/aerotermia/tarifas/leer', { tok: 'tok-admin', form: formExcel(xlsx, { distribuidor: 'Dist', vigente_desde: HOY }) });
    ok(r.status === 503, 'BD caída al leer → 503 (nunca un «todo nuevo»)', r.status);
    FALLA = null;

    r = await pedir('GET', '/api/aerotermia/tarifas/plantilla', { tok: 'tok-admin' });
    ok(r.status === 200 && r.buf[0] === 0x50 && r.buf[1] === 0x4b, 'la plantilla se descarga (xlsx)', r.status);
    const filasPlantilla = await CT.leerExcel(r.buf);
    ok(filasPlantilla.length === 2 && filasPlantilla.every((f) => !f.error), 'la plantilla se lee sin errores con el mismo lector', filasPlantilla);
    ok(DB.aerotermia_tarifas_cargas.length === cargasAntes, 'nada más se ha escrito', '');

    // ── 7. BD caída en el catálogo ──────────────────────────────────────────
    FALLA = 'aerotermia';
    r = await pedir('GET', '/api/instalador-app/catalogo', { tok: 'tok-rca' });
    ok(r.status === 503 && r.body.code === 'CATALOGO_UNAVAILABLE', 'BD caída → 503, nunca un catálogo vacío', r.body);
    FALLA = null;
    ok(DRIVE.every(([op]) => op === 'meta' || op === 'leer'), 'Drive: solo se ha LEÍDO', DRIVE);
  } catch (e) {
    fallos++; console.error('✗ excepción:', e);
  } finally {
    srv.close();
    console.log(`\n${fallos ? '✗' : '✓'} ${n - fallos}/${n} comprobaciones del catálogo (Supabase y Drive simulados: ninguna escritura real)`);
    process.exit(fallos ? 1 : 0);
  }
});
