// App del INSTALADOR (fase 1): quién entra, que solo vea LO SUYO y que no salga ni
// una clave de margen. Rutas REALES con Supabase SIMULADO (como test_rutas_partner.js).
//   node scripts/test_app_instalador.js   (desde implementation/backend)
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-1.md.
const path = require('path');
const assert = require('assert');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false',
  // En la beta: la instaladora p-1 y (a propósito) la empresa del DISTRIBUIDOR, que aun así no entra.
  APP_INSTALADOR_BETA: 'p-1, p-dist',
});

const FIN_CON_MARGEN = { caeBonus: 3850.4, presupuestoTotal: 14200, irpfDeduction: 2840, caePriceSO: 0.2, profitBrokergy: 999, totalPrescriptor: 123, caePriceBrokergy: 0.1 };
const DB = {
  usuarios: [
    { auth_user_id: 'a-tok-admin', id_usuario: 'u-admin', activo: true, roles: { nombre_rol: 'ADMIN' } },
    { auth_user_id: 'a-tok-rca', id_usuario: 'u-rca', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-otro', id_usuario: 'u-otro', activo: true, roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-dist', id_usuario: 'u-dist', activo: true, roles: { nombre_rol: 'DISTRIBUIDOR' } },
  ],
  prescriptores: [
    { id_empresa: 'p-1', representante_legal_id: 'u-rca', razon_social: 'RCA INSTALACIONES', acronimo: 'RCA' },
    { id_empresa: 'p-2', representante_legal_id: 'u-otro', razon_social: 'OTRO INSTALADOR', acronimo: 'OTRO' },
    { id_empresa: 'p-dist', representante_legal_id: 'u-dist', razon_social: 'DISTRIBUIDOR', acronimo: 'DIS' },
  ],
  oportunidades: [
    { id: '11111111-1111-1111-1111-111111111111', id_oportunidad: '26RES060_OP900', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
      comisionista_id: 'k-1', comisionista_importe: 300,
      datos_calculo: { estado: 'PTE ENVIAR', upload_token: 'tok-900', via_fm: { bono: 1 }, inputs: { nombre: 'PILAR', apellidos: 'NIETO', municipio: 'SOCUELLAMOS', caePriceSO: 0.3 },
        result: { financials: FIN_CON_MARGEN } } },
    { id: '22222222-2222-2222-2222-222222222222', id_oportunidad: '26RES060_OP901', ficha: 'RES060', creador_id: 'u-otro', prescriptor_id: 'p-2', cliente_id: 'c-2',
      datos_calculo: { estado: 'PTE ENVIAR', upload_token: 'tok-AJENO', inputs: { nombre: 'AJENO' }, result: { financials: FIN_CON_MARGEN } } },
    { id: '33333333-3333-3333-3333-333333333333', id_oportunidad: '26RES060_OP902', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
      datos_calculo: { estado: 'ACEPTADA', upload_token: 'tok-902', inputs: { presupuesto: 14200 }, result: { financials: FIN_CON_MARGEN } } },
    { id: '44444444-4444-4444-4444-444444444444', id_oportunidad: '26RES060_OP903', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
      datos_calculo: { estado: 'RECHAZADA', inputs: {}, result: {} } },
  ],
  expedientes: [
    { id: 'e-902', oportunidad_id: '33333333-3333-3333-3333-333333333333', numero_expediente: '26RES060_231', estado: 'PTE FIN EXPTE', created_at: '2026-10-01',
      instalacion: { instalador_id: 'p-1', aerotermia_cal: { marca: 'MARCA', modelo: 'MOD-12', numero_serie: 'A1B2' }, caldera_antigua_cal: { combustible: 'GASOLEO' } },
      cee: { certificador_id: 'cert-1', xml_inicial: '<xml enorme/>' }, seguimiento: { cee_inicial: 'REGISTRADO' },
      documentacion: { fecha_registro_cee_inicial: '2026-10-05', cert_cifo_drive_link: 'https://drive.google.com/borrador', cert_cifo_sent_at: '2026-11-01T10:00:00Z',
        borrador_cert_sent_at: '2026-11-01T10:00:00Z', facturas: [], notas_internas: 'NO SE ENSEÑA' } },
  ],
  clientes: [
    { id_cliente: 'c-1', nombre_razon_social: 'CARMEN', apellidos: 'RUIZ', tlf: '600000000', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', direccion: 'C/ OLIVO 12' },
    { id_cliente: 'c-2', nombre_razon_social: 'AJENO', apellidos: '', tlf: '611111111', municipio: 'X' },
  ],
};
let FALLA_OPORTUNIDADES = false;
const get = (row, col) => {
  if (col.includes('->')) { const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]); }
  return row[col];
};
function qb(table) {
  const st = { filters: [], select: null, limit: null };
  const run = () => {
    let rows = (DB[table] || []).slice();
    for (const f of st.filters) rows = rows.filter(f);
    if (st.select) rows = rows.map(r => {
      const o = {};
      for (const part of st.select.split(',').map(s => s.trim()).filter(Boolean)) {
        const m = part.match(/^(\w+):(.+)$/);
        if (m) o[m[1]] = get(r, m[2]); else if (part === '*') Object.assign(o, r); else if (/^\w+$/.test(part)) o[part] = r[part];
        else if (/^\w+\s*\(/.test(part)) Object.assign(o, r); // embebidos (roles(...)): se dejan tal cual
      }
      if (table === 'usuarios') Object.assign(o, r);
      return o;
    });
    if (st.limit) rows = rows.slice(0, st.limit);
    return rows;
  };
  const resp = () => (table === 'oportunidades' && FALLA_OPORTUNIDADES)
    ? { data: null, error: { message: '521 Web server is down' } } : { data: run(), error: null };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(resp()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve((() => { const r = resp(); return r.error ? r : { data: r.data[0] || null, error: null }; })());
    if (k === 'select') return (s) => { st.select = s; return b; };
    if (k === 'eq') return (c, v) => { st.filters.push(r => String(get(r, c)) === String(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filters.push(r => vs.includes(get(r, c))); return b; };
    if (k === 'or') return (e) => {
      const ps = e.split(',').map(p => p.match(/^([\w>-]+)\.eq\.(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]);
      st.filters.push(r => ps.some(([c, v]) => String(get(r, c)) === v)); return b;
    };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) }, from: qb, rpc: () => Promise.resolve({ data: null, error: null }) };
const fakeFactura = { plantillaDe: async () => null };
for (const [mod, exp] of [['services/supabaseClient.js', fakeSb], ['services/facturaInstaladorService.js', fakeFactura]]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}

// ── 1. La tabla de pasos, pura ───────────────────────────────────────────────
const A = require(path.join(B, 'utils/appInstalador'));
const { ORDEN_ESTADOS } = (() => { try { return require(path.join(B, 'utils/expedienteEstados')); } catch { return {}; } })();
const { estadoDesdeExpediente } = require(path.join(B, 'utils/estadoOportunidad'));
let nPuro = 0;
const eq = (a, b, msg) => { nPuro++; assert.deepStrictEqual(a, b, msg); };
eq(A.pasoDeObra({ estadoCaptacion: 'PTE ENVIAR' }).paso, 1);
eq(A.pasoDeObra({ estadoCaptacion: 'PTE ENVIAR' }).quien, 'tu');
eq(A.pasoDeObra({ estadoCaptacion: 'LEAD' }).quien, 'tu');
eq(A.pasoDeObra({ estadoCaptacion: 'EN CURSO' }).quien, 'nos');
eq(A.pasoDeObra({ estadoCaptacion: 'ENVIADA' }).paso, 2);
eq(A.pasoDeObra({ estadoCaptacion: 'PRE-ACEPTADO' }).quien, 'cli');
eq(A.pasoDeObra({ estadoCaptacion: 'RECHAZADA' }), null);
eq(A.pasoDeObra({ estadoCaptacion: null }).paso, 1); // sin estado = PTE ENVIAR, como estadoVisible
eq(A.pasoDeObra({ exp: { estado: 'RECHAZADO' } }), null);
eq(A.pasoDeObra({ exp: { estado: 'FINALIZADO' } }), { paso: 5, fase: 'Cobrada', quien: 'fin', tareas: [] });
eq(A.pasoDeObra({ exp: { estado: 'PTE. CEE INICIAL' } }).paso, 3);
eq(A.pasoDeObra({ exp: { estado: 'PTE. FIN OBRA', certificador_id: 'c' } }).paso, 3);
eq(A.pasoDeObra({ exp: { estado: 'PTE. FIN OBRA', certificador_id: 'c', n_facturas: 1 } }).paso, 4);
eq(A.pasoDeObra({ exp: { estado: 'PTE. CEE FINAL', certificador_id: 'c' } }).paso, 4);
// Coherencia con estadoDesdeExpediente: recorre TODOS los estados × con/sin certificador.
const ESTADOS = (ORDEN_ESTADOS || []).concat(['RECHAZADO', 'INVENTADO']);
for (const estado of ESTADOS) for (const certificador_id of [null, 'cert']) {
  const vis = estadoDesdeExpediente({ estado, cee: { certificador_id } });
  const p = A.pasoDeObra({ exp: { estado, certificador_id } });
  if (vis === 'RECHAZADA') eq(p, null, estado);
  else if (vis === 'FINALIZADO') eq(p.paso, 5, estado);
  else if (vis === 'ACEPTADA') eq(p.paso, 3, `${estado} visible ACEPTADA → paso 3`);
  else { nPuro++; assert.ok(p.paso === 3 || p.paso === 4, `${estado} EN CURSO → 3 o 4 (dio ${p.paso})`); }
}
// La beta: solo INSTALADOR con empresa en la lista.
eq(A.enBetaInstalador({ id_usuario: 'u', prescriptor_id: 'P-1', rol_nombre: 'INSTALADOR' }, { APP_INSTALADOR_BETA: 'p-1' }), true);
eq(A.enBetaInstalador({ id_usuario: 'u', prescriptor_id: 'p-1', rol_nombre: 'DISTRIBUIDOR' }, { APP_INSTALADOR_BETA: 'p-1' }), false);
eq(A.enBetaInstalador({ id_usuario: 'u', prescriptor_id: 'p-1', rol_nombre: 'INSTALADOR' }, {}), false);
eq(A.enBetaInstalador({ id_usuario: 'u', prescriptor_id: null, rol_nombre: 'ADMIN' }, { APP_INSTALADOR_BETA: 'p-1' }), false);
// Las cuentas: la suma de lo impreso.
eq(A.cuentasCliente({ presupuestoTotal: 14200, caeBonus: 3850, irpfDeduction: 2840 }).total, 7510);
eq(A.cuentasCliente({ caeBonus: 3850 }), null);
console.log(`✓ tabla de pasos, beta y cuentas: ${nPuro} comprobaciones`);

// ── 2. Las rutas ─────────────────────────────────────────────────────────────
const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/usuarios', require(path.join(B, 'routes/usuarios')));
app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));

const PROHIBIDAS = ['caePriceSO', 'caePricePrescriptor', 'prescriptorMode', 'caePriceBrokergy', 'cae_so_rate', 'cae_prescriptor_rate',
  'profitBrokergy', 'totalPrescriptor', 'via_fm', 'comisionista_id', 'comisionista_importe', 'notas_internas', 'margen', 'comision', 'upload_token', 'datos_calculo', 'documentacion', 'cee'];
function clavesProhibidas(v, ruta = '') {
  if (Array.isArray(v)) return v.flatMap((x, i) => clavesProhibidas(x, `${ruta}[${i}]`));
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => [
    ...(PROHIBIDAS.some(p => k.toLowerCase().includes(p.toLowerCase())) ? [`${ruta}.${k}`] : []), ...clavesProhibidas(x, `${ruta}.${k}`)]);
  if (typeof v === 'string' && /drive\.google|tok-AJENO|<xml/.test(v)) return [`${ruta}=${v}`];
  return [];
}

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const t = async (quien, ruta, esperado, extra) => {
    n++;
    const h = quien === 'anónimo' ? {} : { Authorization: 'Bearer tok-' + quien };
    const r = await fetch(base + ruta, { headers: h });
    const js = await r.json().catch(() => null);
    let ok = r.status === esperado, nota = '';
    if (ok && extra) { const e = extra(js); ok = e === true; if (!ok) nota = '  ' + e; }
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${quien.padEnd(8)} GET ${ruta.padEnd(52)} → ${r.status}${ok ? '' : ` (esperaba ${esperado})${nota}`}`);
  };
  console.log('— Quién entra');
  await t('anónimo', '/api/instalador-app/obras', 401);
  await t('rca', '/api/usuarios/me', 200, js => js.app_instalador === true || 'app_instalador=' + js.app_instalador);
  await t('otro', '/api/usuarios/me', 200, js => js.app_instalador === false || 'el partner fuera de la beta la vería');
  await t('dist', '/api/usuarios/me', 200, js => js.app_instalador === false || 'el DISTRIBUIDOR entraría');
  await t('admin', '/api/usuarios/me', 200, js => js.app_instalador === false || 'el ADMIN entraría');
  await t('otro', '/api/instalador-app/obras', 403);
  await t('dist', '/api/instalador-app/obras', 403);
  await t('admin', '/api/instalador-app/obras', 403);
  console.log('— Solo lo suyo');
  await t('rca', '/api/instalador-app/obras', 200, js => {
    const ids = (js.obras || []).map(o => o.id).sort().join(',');
    if (ids !== '26RES060_OP900,26RES060_OP902') return 'obras=' + ids;
    const mal = clavesProhibidas(js); if (mal.length) return 'SE ESCAPA: ' + mal.join(' ');
    const o900 = js.obras.find(o => o.id === '26RES060_OP900');
    if (o900.bono !== 3850 || o900.paso !== 1 || o900.quien !== 'tu') return 'OP900 ' + JSON.stringify(o900);
    if (o900.tareas[0]?.destino?.tipo !== 'oportunidad') return 'la propuesta no lleva a la oportunidad';
    return js.resumen.te_toca === 2 || 'resumen ' + JSON.stringify(js.resumen);
  });
  await t('rca', '/api/instalador-app/obras/26RES060_OP901', 404);
  await t('rca', '/api/instalador-app/obras/22222222-2222-2222-2222-222222222222', 404);
  await t('rca', '/api/instalador-app/obras/26RES060_OP903', 404); // rechazada: fuera de la app
  await t('rca', '/api/instalador-app/obras/26RES060_OP902', 200, js => {
    const o = js.obra; const mal = clavesProhibidas(js); if (mal.length) return 'SE ESCAPA: ' + mal.join(' ');
    if (o.paso !== 4 || o.quien !== 'tu') return `paso ${o.paso} quien ${o.quien}`;
    const keys = o.tareas.map(x => x.key).join(',');
    if (keys !== 'cifo,rite,factura') return 'tareas=' + keys;
    if (o.tareas[0].destino.url !== '/instalador/e-902') return 'cifo → ' + o.tareas[0].destino.url;
    if (o.tareas[2].destino.url !== `/subir-docs/${'33333333-3333-3333-3333-333333333333'}?token=tok-902&rol=instalador`) return 'factura → ' + o.tareas[2].destino.url;
    if (o.cuentas?.total !== 7510) return 'cuentas ' + JSON.stringify(o.cuentas);
    if (o.equipo?.modelo !== 'MOD-12') return 'equipo ' + JSON.stringify(o.equipo);
    return true;
  });
  console.log('— BD caída (regla 38)');
  FALLA_OPORTUNIDADES = true;
  await t('rca', '/api/instalador-app/obras', 503);
  await t('rca', '/api/instalador-app/obras/26RES060_OP900', 503);
  console.log(`\n${n - fallos}/${n} correctas`);
  srv.close(); process.exit(fallos ? 1 : 0);
});
