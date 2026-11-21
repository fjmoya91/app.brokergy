// App del INSTALADOR (fases 1 y 2): quién entra, que solo vea LO SUYO y que no salga ni
// una clave de margen, ni un token ni un enlace de Drive. Rutas REALES de la app con
// Supabase y Drive SIMULADOS; las rutas públicas de siempre, sustituidas por un ECO
// (ninguna escritura real). Que lo despachado da lo mismo que el enlace público lo
// prueba test_app_instalador_no_regresion.js.
//   node scripts/test_app_instalador.js   (desde implementation/backend)
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-1.md y -fase-2.md.
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
      datos_calculo: { estado: 'ACEPTADA', upload_token: 'tok-902', drive_folder_id: 'carpeta-902', inputs: { presupuesto: 14200 }, result: { financials: FIN_CON_MARGEN },
        reforma_uploads: { FOTO_EQUIPO: [{ name: 'equipo.jpg', driveId: 'd-ok-1234567890' }] } } },
    // La TRAE RCA, pero la INSTALA otra empresa: la ve y sube fotos; no firma, ni el RITE, ni la factura.
    { id: '55555555-5555-5555-5555-555555555555', id_oportunidad: '26RES060_OP904', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
      datos_calculo: { estado: 'ACEPTADA', upload_token: 'tok-904', inputs: {}, result: { financials: FIN_CON_MARGEN } } },
    { id: '44444444-4444-4444-4444-444444444444', id_oportunidad: '26RES060_OP903', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
      datos_calculo: { estado: 'RECHAZADA', inputs: {}, result: {} } },
  ],
  expedientes: [
    { id: 'e-902', oportunidad_id: '33333333-3333-3333-3333-333333333333', numero_expediente: '26RES060_231', estado: 'PTE FIN EXPTE', created_at: '2026-10-01',
      instalacion: { instalador_id: 'p-1', aerotermia_cal: { marca: 'MARCA', modelo: 'MOD-12', numero_serie: 'A1B2' }, caldera_antigua_cal: { combustible: 'GASOLEO' } },
      cee: { certificador_id: 'cert-1', xml_inicial: '<xml enorme/>' }, seguimiento: { cee_inicial: 'REGISTRADO' },
      documentacion: { fecha_registro_cee_inicial: '2026-10-05', cert_cifo_drive_link: 'https://drive.google.com/borrador', cert_cifo_sent_at: '2026-11-01T10:00:00Z',
        borrador_cert_sent_at: '2026-11-01T10:00:00Z', facturas: [], notas_internas: 'NO SE ENSEÑA' } },
    { id: 'e-904', oportunidad_id: '55555555-5555-5555-5555-555555555555', numero_expediente: '26RES060_232', estado: 'PTE FIN EXPTE', created_at: '2026-10-01',
      instalador_asociado_id: 'p-2', instalacion: { instalador_id: 'p-2' }, cee: { certificador_id: 'cert-1' },
      documentacion: { facturas: [{ drive_id: 'd-fac-1234567890', numero_factura: '7/26', importe_con_iva: 1210, validada: false, drive_link: 'https://drive.google.com/fac' }] } },
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
const fakeFactura = { plantillaDe: async () => null,
  refFactura: (f) => require('crypto').createHash('sha256').update(String(f?.drive_id || '')).digest('hex').slice(0, 12) };
// Drive SIMULADO: el de verdad no se toca. Conoce tres ficheros; dos cuelgan de la carpeta de la 902.
const DRIVE = { 'd-ok-1234567890': { mimeType: 'image/jpeg', parents: ['sub-fotos'] }, 'sub-fotos': { parents: ['carpeta-902'] },
  'd-pdf-1234567890': { mimeType: 'application/pdf', parents: ['sub-fotos'] }, 'd-fac-1234567890': { mimeType: 'application/pdf', parents: [] },
  'd-ajeno-1234567': { mimeType: 'application/pdf', parents: ['otra-carpeta'] } };
const DRIVE_LLAMADAS = [];
const fakeDrive = {
  getFileMetadata: async (id) => { DRIVE_LLAMADAS.push(id); return DRIVE[id] ? { id, ...DRIVE[id] } : null; },
  getFileContent: async (id) => DRIVE[id] ? Buffer.from('%PDF-1.4 prueba') : null,
};
// Las rutas de SIEMPRE (public, facturaInstalador, oportunidades) se sustituyen por un ECO
// que apunta lo que les llega: aquí se prueba la capa nueva (guardián, credencial, saneado).
// Que lo despachado responde lo MISMO que la ruta pública: test_app_instalador_no_regresion.js.
const ECO = [];
function eco(nombre) {
  const r = require(path.join(B, 'node_modules/express')).Router();
  r.use((req, res) => {
    const ruta = req.url.split('?')[0];
    ECO.push({ nombre, metodo: req.method, ruta, token: req.query.token, sz: req.query.sz, body: req.body });
    if (/^\/reforma-thumb\//.test(ruta)) return res.type('image/jpeg').send(Buffer.from('jpg'));
    if (nombre === 'oportunidades' && req.method === 'GET' && /\/anexos$/.test(ruta)) {
      return res.json([{ id: 'f-presu-1234567', name: 'PRESUPUESTO DE LA INSTALACIÓN.pdf', webViewLink: 'https://drive.google.com/x', modifiedTime: '2026-10-03' },
        { id: 'f-old-12345678', name: 'PRESUPUESTO DE LA INSTALACIÓN_old.pdf', webViewLink: 'https://drive.google.com/y' }]);
    }
    res.json({ ok: true, fileLink: 'https://drive.google.com/file/d/X', upload_token: 'tok-902', memoria_link: 'https://drive.google.com/m',
      anidado: [{ link: 'x', webViewLink: 'y', nombre: 'Factura 1', miniatura: 'https://lh3.googleusercontent.com/d/abc' }] });
  });
  return r;
}
for (const [mod, exp] of [['routes/public.js', eco('public')], ['routes/facturaInstalador.js', eco('factura')], ['routes/oportunidades.js', eco('oportunidades')]]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}
for (const [mod, exp] of [['services/supabaseClient.js', fakeSb], ['services/facturaInstaladorService.js', fakeFactura], ['services/driveService.js', fakeDrive]]) {
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
  if (typeof v === 'string' && /drive\.google|docs\.google|googleusercontent|tok-AJENO|tok-90\d|<xml/.test(v)) return [`${ruta}=${v}`];
  return [];
}
// Fase 2: además, ninguna clave de enlace ni de token (las de la ruta de siempre se quitan).
const conEnlaceOToken = (v, ruta = '') => Array.isArray(v) ? v.flatMap((x, i) => conEnlaceOToken(x, `${ruta}[${i}]`))
  : v && typeof v === 'object' ? Object.entries(v).flatMap(([k, x]) => [...(/(link|links|url)$|token/i.test(k) ? [`${ruta}.${k}`] : []), ...conEnlaceOToken(x, `${ruta}.${k}`)]) : [];

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  // pide(quien, 'MÉTODO /ruta', esperado, extra, body): comprueba el status y, si responde
  // JSON, que no lleva margen, comisión, token ni enlace de Drive.
  const pide = async (quien, linea, esperado, extra, body) => {
    n++;
    const [metodo, ruta] = linea.includes(' ') ? linea.split(' ') : ['GET', linea];
    const h = quien === 'anónimo' ? {} : { Authorization: 'Bearer tok-' + quien };
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const tipo = r.headers.get('content-type') || '';
    const texto = await r.text();
    let js = null; if (/json/.test(tipo)) { try { js = JSON.parse(texto); } catch { /* */ } }
    let ok = r.status === esperado, nota = '';
    if (ok && js) { const mal = [...clavesProhibidas(js), ...conEnlaceOToken(js)]; if (mal.length) { ok = false; nota = '  SE ESCAPA: ' + mal.join(' '); } }
    if (ok && extra) { const e = await extra(js, r, texto); ok = e === true; if (!ok) nota = '  ' + e; }
    if (!ok) fallos++;
    console.log(`${ok ? '✓' : '✗'} ${quien.padEnd(8)} ${metodo.padEnd(6)} ${ruta.slice(0, 64).padEnd(64)} → ${r.status}${ok ? '' : ` (esperaba ${esperado})${nota}`}`);
    return js;
  };
  const t = (quien, ruta, esperado, extra) => pide(quien, 'GET ' + ruta, esperado, extra);
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
    if (ids !== '26RES060_OP900,26RES060_OP902,26RES060_OP904') return 'obras=' + ids;
    const o904 = js.obras.find(o => o.id === '26RES060_OP904');
    if (o904.tareas.length) return 'a quien NO instala le salen tareas: ' + o904.tareas.map(x => x.key).join(',');
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
    // Fase 2: las tareas se hacen DENTRO de la obra; ningún destino lleva enlace con token.
    const d = o.tareas.map(x => x.destino);
    if (d[0].tipo !== 'accion' || d[0].accion !== 'cifo') return 'cifo → ' + JSON.stringify(d[0]);
    if (d[1].accion !== 'rite') return 'rite → ' + JSON.stringify(d[1]);
    if (d[2].accion !== 'factura' || d[2].modo !== 'subir') return 'factura (sin plantilla) → ' + JSON.stringify(d[2]);
    if (d.some(x => x.url)) return 'un destino lleva url';
    if (o.es_instaladora !== true || o.factura_modo !== 'subir') return `es_instaladora=${o.es_instaladora} factura_modo=${o.factura_modo}`;
    if (o.cuentas?.total !== 7510) return 'cuentas ' + JSON.stringify(o.cuentas);
    if (o.equipo?.modelo !== 'MOD-12') return 'equipo ' + JSON.stringify(o.equipo);
    return true;
  });
  await t('rca', '/api/instalador-app/obras/26RES060_OP904', 200, js => {
    const o = js.obra;
    if (o.es_instaladora !== false) return 'es_instaladora=' + o.es_instaladora;
    const f = o.facturas || []; // la ve (es su obra), con su referencia opaca y sin enlace
    return (f.length === 1 && /^[0-9a-f]{12}$/.test(f[0].ref) && f[0].revisada === false) || 'facturas ' + JSON.stringify(f);
  });

  // ── Fase 2: las acciones dentro de la obra ────────────────────────────────
  const P = '/api/instalador-app';
  const NUEVAS = [
    'GET /obras/26RES060_OP902/presupuesto', 'GET /obras/26RES060_OP902/presupuesto/f-presu-1234567', 'POST /obras/26RES060_OP902/presupuesto',
    'GET /obras/26RES060_OP902/factura', 'GET /obras/26RES060_OP902/factura/word', 'POST /obras/26RES060_OP902/factura/vista-previa',
    'POST /obras/26RES060_OP902/factura/generar', 'POST /obras/26RES060_OP902/factura/subir', 'GET /obras/26RES060_OP902/factura/fichero/abcdef012345',
    'GET /obras/26RES060_OP902/instalador', 'GET /obras/26RES060_OP902/cifo/pdf', 'POST /obras/26RES060_OP902/cifo', 'POST /obras/26RES060_OP902/rite',
    'GET /obras/26RES060_OP902/fm-declaracion/pdf', 'POST /obras/26RES060_OP902/fm-declaracion',
    'GET /docs/26RES060_OP902', 'POST /docs/26RES060_OP902/fin-obra', 'PATCH /docs/26RES060_OP902/ventanas', 'POST /docs/26RES060_OP902/FOTO_EQUIPO',
    'POST /docs/26RES060_OP902/FOTO_EQUIPO/batch', 'POST /docs/26RES060_OP902/FOTO_EQUIPO/merge-pdf', 'DELETE /docs/26RES060_OP902/FOTO_EQUIPO?driveId=d-ok-1234567890',
  ];
  const ECO_ANTES = ECO.length;
  console.log('— Fase 2: sin sesión → 401, fuera de la beta → 403, obra ajena → 404');
  for (const l of NUEVAS) { const [m, r] = l.split(' '); await pide('anónimo', `${m} ${P}${r}`, 401, null, m === 'GET' || m === 'DELETE' ? undefined : {}); }
  for (const quien of ['otro', 'dist', 'admin']) {
    for (const l of NUEVAS) { const [m, r] = l.split(' '); await pide(quien, `${m} ${P}${r}`, 403, null, m === 'GET' || m === 'DELETE' ? undefined : {}); }
  }
  for (const l of NUEVAS) {
    const [m, r] = l.split(' ');
    for (const ajena of ['26RES060_OP901', '22222222-2222-2222-2222-222222222222', '26RES060_OP903']) {
      await pide('rca', `${m} ${P}${r.replace('26RES060_OP902', ajena)}`, 404, null, m === 'GET' || m === 'DELETE' ? undefined : {});
    }
  }
  if (ECO.length !== ECO_ANTES) { fallos++; console.log(`✗ con 401/403/404 la ruta de siempre llegó a ejecutarse ${ECO.length - ECO_ANTES} vez/veces`); }
  else console.log('✓ con 401/403/404 la ruta de siempre no llega a ejecutarse');

  console.log('— Fase 2: la obra que trae pero NO instala → 403 al firmar, al RITE y a la factura; fotos, sí');
  for (const l of NUEVAS.filter(x => /\/(factura|instalador|cifo|rite|fm-declaracion)/.test(x) && !/factura\/fichero/.test(x))) {
    const [m, r] = l.split(' ');
    await pide('rca', `${m} ${P}${r.replace('OP902', 'OP904')}`, 403, js => js?.code === 'NO_ES_INSTALADORA' || 'code=' + js?.code, m === 'GET' ? undefined : {});
  }
  await pide('rca', `GET ${P}/docs/26RES060_OP904`, 200, () => ECO.at(-1).token === 'tok-904' || 'token ' + ECO.at(-1).token);

  console.log('— Fase 2: la credencial la pone el SERVIDOR; lo del navegador se ignora');
  const ultimo = () => ECO.at(-1);
  await pide('rca', `GET ${P}/obras/26RES060_OP902/factura?token=tok-AJENO`, 200, () => {
    const e = ultimo(); return (e.nombre === 'factura' && e.ruta === '/e-902' && e.token === 'tok-902') || JSON.stringify(e);
  });
  await pide('rca', `POST ${P}/obras/26RES060_OP902/factura/generar?token=tok-AJENO&llave=x`, 200, () => {
    const e = ultimo(); return (e.ruta === '/e-902/generar' && e.token === 'tok-902' && e.metodo === 'POST') || JSON.stringify(e);
  }, { lineas: [] });
  await pide('rca', `GET ${P}/obras/26RES060_OP902/instalador?token=tok-AJENO`, 200, (js) => {
    const e = ultimo();
    if (e.nombre !== 'public' || e.ruta !== '/instalador/e-902' || e.token !== undefined) return JSON.stringify(e);
    // Saneado: fuera fileLink, upload_token, memoria_link, link y webViewLink; la miniatura de Drive, a null.
    return (js.ok === true && js.anidado[0].nombre === 'Factura 1' && js.anidado[0].miniatura === null && !('fileLink' in js)) || JSON.stringify(js);
  });
  await pide('rca', `GET ${P}/obras/26RES060_OP902/cifo/pdf`, 200, () => ultimo().ruta === '/cifo-upload/e-902/pdf' || ultimo().ruta);
  await pide('rca', `POST ${P}/obras/26RES060_OP902/cifo`, 200, () => ultimo().ruta === '/cifo-upload/e-902' || ultimo().ruta, { pdf: 'JVBERi0=' });
  await pide('rca', `POST ${P}/obras/26RES060_OP902/rite`, 200, () => ultimo().ruta === '/rite-upload/e-902' || ultimo().ruta, {});
  await pide('rca', `POST ${P}/obras/26RES060_OP902/factura/subir`, 200, () => {
    const e = ultimo(); return (e.ruta === '/reforma-docs/33333333-3333-3333-3333-333333333333/DOC_FACTURAS/batch' && e.token === 'tok-902') || JSON.stringify(e);
  }, {});

  console.log('— Fase 2: fotos y papeles (canal reforma-docs) y su llave');
  let llaveObra = null;
  await pide('rca', `GET ${P}/docs/26RES060_OP902?token=tok-AJENO`, 200, (js) => {
    const e = ultimo(); llaveObra = js.llave;
    if (e.ruta !== '/reforma-docs/33333333-3333-3333-3333-333333333333' || e.token !== 'tok-902') return JSON.stringify(e);
    return /^\d{13}\.[\w-]{43}$/.test(js.llave || '') || 'llave=' + js.llave;
  });
  await pide('rca', `POST ${P}/docs/26RES060_OP902/fin-obra`, 200, () => ultimo().body?.rol === 'instalador' || 'rol=' + ultimo().body?.rol, { rol: 'admin' });
  await pide('rca', `POST ${P}/docs/26RES060_OP902/FOTO..EQUIPO`, 400, null, {});
  const nEco = ECO.length;
  await pide('rca', `DELETE ${P}/docs/26RES060_OP902/FOTO_EQUIPO?driveId=d-ajeno-1234567`, 404, () => ECO.length === nEco || 'llegó a borrarse en la ruta de siempre');
  await pide('rca', `DELETE ${P}/docs/26RES060_OP902/OTRO_SLOT?driveId=d-ok-1234567890`, 404);
  await pide('rca', `DELETE ${P}/docs/26RES060_OP902/FOTO_EQUIPO?driveId=d-ok-1234567890`, 200, () => {
    const e = ultimo(); return (e.metodo === 'DELETE' && e.ruta.endsWith('/FOTO_EQUIPO') && e.token === 'tok-902') || JSON.stringify(e);
  });

  console.log('— Fase 2: miniaturas y ficheros con llave (sin sesión)');
  const m = `${P}/thumb/26RES060_OP902/d-ok-1234567890`;
  await pide('anónimo', `GET ${m}`, 403);
  await pide('anónimo', `GET ${m}?token=tok-902`, 403); // el upload_token NO es la llave
  await pide('anónimo', `GET ${m}?token=${encodeURIComponent(require(path.join(B, 'utils/llaveObra')).firmarLlave('26RES060_OP900'))}`, 403); // llave de otra obra
  await pide('anónimo', `GET ${m}?token=${llaveObra}&sz=w400`, 200, (_, r) => {
    const e = ultimo(); return (r.headers.get('content-type').startsWith('image/') && e.ruta === '/reforma-thumb/33333333-3333-3333-3333-333333333333/d-ok-1234567890' && e.token === 'tok-902' && e.sz === 'w400') || JSON.stringify(e);
  });
  await pide('anónimo', `GET ${P}/thumb/26RES060_OP902/d-ajeno-1234567?token=${llaveObra}`, 404); // no es de esta obra
  await pide('anónimo', `GET ${P}/fichero/26RES060_OP902/d-pdf-1234567890?token=${llaveObra}`, 200, (_, r) =>
    (r.headers.get('content-type') === 'application/pdf' && /sandbox/.test(r.headers.get('content-security-policy') || '') && r.headers.get('x-content-type-options') === 'nosniff')
    || 'cabeceras ' + JSON.stringify(Object.fromEntries(r.headers)));
  await pide('anónimo', `GET ${P}/fichero/26RES060_OP901/d-pdf-1234567890?token=${llaveObra}`, 403);
  const { verificarLlave, firmarLlave } = require(path.join(B, 'utils/llaveObra'));
  n++; const caduca = !verificarLlave('X', firmarLlave('X', Date.now() - 13 * 3600e3)) && verificarLlave('X', firmarLlave('X')) && !verificarLlave('Y', firmarLlave('X'));
  if (!caduca) fallos++; console.log(`${caduca ? '✓' : '✗'} la llave caduca a las 12 h y solo vale para su obra`);

  console.log('— Fase 2: presupuesto y factura');
  await pide('rca', `GET ${P}/obras/26RES060_OP902/presupuesto`, 200, (js) =>
    (js.estado === 'subido' && js.importe === 14200 && js.ficheros.length === 1 && js.ficheros[0].id === 'f-presu-1234567') || JSON.stringify(js));
  await pide('rca', `GET ${P}/obras/26RES060_OP900/presupuesto`, 200, () => ultimo().ruta === '/26RES060_OP900/anexos' || ultimo().ruta);
  await pide('rca', `POST ${P}/obras/26RES060_OP902/presupuesto`, 400, null, { fileName: 'x.exe', mimeType: 'application/x-msdownload', base64: 'AAAA' });
  await pide('rca', `POST ${P}/obras/26RES060_OP902/presupuesto`, 200, (js) => {
    const b = ultimo().body;
    return (js.ok === true && b.isBudget === true && b.budgetSlot === 'AEROTERMIA' && b.mimeType === 'application/pdf' && !('carpeta' in b)) || JSON.stringify(b);
  }, { fileName: 'presu.pdf', mimeType: 'application/pdf', base64: 'JVBERi0=', carpeta: 'OTRA', isBudget: false });
  const ref904 = fakeFactura.refFactura({ drive_id: 'd-fac-1234567890' });
  await pide('rca', `GET ${P}/obras/26RES060_OP904/factura/fichero/${ref904}`, 200, (_, r) => r.headers.get('content-type') === 'application/pdf' || r.headers.get('content-type'));
  await pide('rca', `GET ${P}/obras/26RES060_OP902/factura/fichero/${ref904}`, 404); // la factura de OTRA obra

  console.log('— BD caída (regla 38)');
  FALLA_OPORTUNIDADES = true;
  await t('rca', '/api/instalador-app/obras', 503);
  await t('rca', '/api/instalador-app/obras/26RES060_OP900', 503);
  await t('rca', '/api/instalador-app/obras/26RES060_OP902/presupuesto', 503);
  await t('rca', '/api/instalador-app/docs/26RES060_OP902', 503);
  await t('anónimo', `/api/instalador-app/thumb/26RES060_OP902/d-ok-1234567890?token=${llaveObra}`, 503);
  FALLA_OPORTUNIDADES = false;
  const escrituras = ECO.filter(e => e.metodo !== 'GET').length;
  console.log(`(escrituras que llegaron a la ruta de siempre, SIMULADA: ${escrituras}; Supabase y Drive simulados en todo el test)`);
  console.log(`\n${n - fallos}/${n} correctas`);
  srv.close(); process.exit(fallos ? 1 : 0);
});
