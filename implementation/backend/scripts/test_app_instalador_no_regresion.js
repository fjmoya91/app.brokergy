// App del INSTALADOR, fase 2 — NO REGRESIÓN: el enlace público de siempre responde
// igual que antes, y la ruta con sesión que lo despacha hace EXACTAMENTE lo mismo.
//
// Se cargan las rutas REALES (`routes/public.js`, `routes/facturaInstalador.js` y
// `routes/instaladorApp.js`) con Supabase, Drive, WhatsApp y el email SIMULADOS en
// memoria: ninguna escritura sale de este proceso. Para cada acción se parte del mismo
// estado, se llama primero al enlace público (con su token, como el instalador hoy) y
// después a la ruta de la app (con sesión, sin token), y se comparan:
//   · la respuesta (la de la app es la pública SANEADA: sin enlaces de Drive ni token);
//   · lo que se escribe en la BD, lo que se sube a Drive y los avisos que salen.
//
//   node scripts/test_app_instalador_no_regresion.js   (desde implementation/backend)
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-2.md.
const path = require('path');
const assert = require('assert');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', BOT_WHATSAPP_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false',
  WA_SYNC_INSTALADORES: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', APP_INSTALADOR_BETA: 'p-1',
});
delete process.env.WHATSAPP_ADMIN_CHAT;

const EXP = 'aaaaaaaa-0000-4000-8000-000000000950';
const OP = 'bbbbbbbb-0000-4000-8000-000000000950';
const INICIAL = {
  usuarios: [{ auth_user_id: 'a-tok-rca', id_usuario: 'u-rca', activo: true, roles: { nombre_rol: 'INSTALADOR' } }],
  prescriptores: [{ id_empresa: 'p-1', representante_legal_id: 'u-rca', razon_social: 'RCA INSTALACIONES', acronimo: 'RCA' }],
  clientes: [{ id_cliente: 'c-1', nombre_razon_social: 'CLIENTE', apellidos: 'PRUEBA', direccion: 'C/ OLIVO 12', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL' }],
  oportunidades: [{ id: OP, id_oportunidad: '26RES060_OP950', ficha: 'RES060', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: 'c-1',
    datos_calculo: { estado: 'ACEPTADA', upload_token: 'tok-950', drive_folder_id: 'carpeta-950', inputs: {}, result: {} } }],
  expedientes: [{ id: EXP, oportunidad_id: OP, cliente_id: 'c-1', numero_expediente: '26RES060_950', estado: 'PTE FIN EXPTE', created_at: '2026-10-01',
    instalacion: { instalador_id: 'p-1' }, cee: { certificador_id: 'cert-1' },
    documentacion: { cert_cifo_drive_link: 'https://drive.google.com/file/d/BORRADORCIFO1234567890abcd/view', cert_cifo_sent_at: '2026-11-01T10:00:00Z' } }],
};
const PK = { clientes: 'id_cliente', oportunidades: 'id', expedientes: 'id', prescriptores: 'id_empresa', usuarios: 'id_usuario' };
let DB, SIDE, nDrive;
const reiniciar = () => { DB = JSON.parse(JSON.stringify(INICIAL)); SIDE = { updates: [], rpc: [], drive: [], wa: [], email: [] }; nDrive = 0; };
reiniciar();

// ── Supabase simulado (selects con alias, `->`/`->>` y embebidos `tabla!fk(...)`) ──
const get = (row, col) => {
  if (!col.includes('->')) return row[col];
  const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]);
};
const partes = (s) => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; };
function proyectar(table, r, sel) {
  if (!sel || table === 'usuarios') return { ...r };
  const o = {};
  for (const p of partes(sel)) {
    let m;
    if (p === '*') Object.assign(o, r);
    else if ((m = p.match(/^(\w+)!(\w+)\s*\(/))) { const rel = (DB[m[1]] || []).find(x => x[PK[m[1]]] === r[m[2]]); o[m[1]] = rel ? { ...rel } : null; }
    else if ((m = p.match(/^(\w+)\s*\(/))) o[m[1]] = r[m[1]];
    else if ((m = p.match(/^(\w+):(.+)$/))) o[m[1]] = get(r, m[2].trim());
    else o[p] = get(r, p);
  }
  return o;
}
function qb(table) {
  const st = { filtros: [], sel: null, limit: null, update: null };
  const filas = () => (DB[table] || []).filter(r => st.filtros.every(f => f(r)));
  const ejecutar = () => {
    if (st.update) {
      SIDE.updates.push({ table, payload: JSON.parse(JSON.stringify(st.update)) });
      for (const r of filas()) Object.assign(r, JSON.parse(JSON.stringify(st.update)));
      return { data: null, error: null };
    }
    let rows = filas().map(r => proyectar(table, r, st.sel));
    if (st.limit) rows = rows.slice(0, st.limit);
    return { data: rows, error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve((() => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] || null : r.data, error: null }; })());
    if (k === 'select') return (s) => { if (!st.update) st.sel = s; return b; };
    if (k === 'update') return (p) => { st.update = p; return b; };
    if (k === 'eq') return (c, v) => { st.filtros.push(r => String(get(r, c)) === String(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filtros.push(r => vs.map(String).includes(String(get(r, c)))); return b; };
    if (k === 'or') return (e) => { const ps = e.split(',').map(p => p.match(/^([\w>-]+)\.eq\.(.*)$/)).filter(Boolean); st.filtros.push(r => ps.some(m => String(get(r, m[1])) === m[2])); return b; };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = {
  auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t } }, error: null }) },
  from: qb,
  // Las dos RPC de `documentacion` (regla 19), aplicadas en memoria como en Postgres.
  rpc: (fn, args) => {
    SIDE.rpc.push({ fn, args: JSON.parse(JSON.stringify(args)) });
    if (fn === 'set_expediente_doc_field') {
      for (const e of DB.expedientes.filter(x => x.oportunidad_id === args.p_oportunidad_id)) e.documentacion = { ...(e.documentacion || {}), [args.p_field]: args.p_value };
    } else if (fn === 'merge_expediente_doc_json') {
      const e = DB.expedientes.find(x => x.id === args.p_expediente_id);
      if (e) { const d = e.documentacion || {}; const prev = d[args.p_field]; e.documentacion = { ...d, [args.p_field]: Array.isArray(args.p_value) ? [...(Array.isArray(prev) ? prev : [{}]), ...args.p_value] : { ...(prev || {}), ...args.p_value } }; }
    }
    return Promise.resolve({ data: null, error: null });
  },
};
// ── Drive, WhatsApp, email y lo que corre en segundo plano: simulados y apuntados ──
const fakeDrive = {
  getOrCreateSubfolder: async (padre, nombre) => { SIDE.drive.push(['subcarpeta', padre, nombre]); return `${padre}/${nombre}`; },
  saveFileToFolder: async (carpeta, nombre, mime, buf) => { nDrive++; SIDE.drive.push(['guardar', carpeta, nombre, mime, Buffer.from(buf).toString('base64')]); return { id: `nuevo-${nDrive}`, link: `https://drive.google.com/file/d/nuevo-${nDrive}/view` }; },
  archiveExistingToOld: async (...a) => { SIDE.drive.push(['archivar', ...a]); },
  findFileByName: async () => null, deleteFile: async (id) => { SIDE.drive.push(['borrar', id]); },
  setFolderPublic: async (id, r) => { SIDE.drive.push(['publico', id, r]); },
  getFileContent: async (id) => { SIDE.drive.push(['leer', id]); return Buffer.from('%PDF-1.4 borrador ' + id); },
  getFileMetadata: async (id) => ({ id, mimeType: 'application/pdf', parents: [] }),
};
const fakeWa = new Proxy({}, { get: (_, k) => async (...a) => { SIDE.wa.push([k, a.length]); return { ok: true }; } });
const fakeEmail = new Proxy({}, { get: (_, k) => async (o) => { SIDE.email.push([k, o?.subject || null]); return { ok: true }; } });
const CTX_FACTURA = {
  token: 'tok-950', exp: { id: EXP, numero_expediente: '26RES060_950' }, instalador: { acronimo: 'RCA' }, consejo: {},
  datos: { clienteNombre: 'CLIENTE PRUEBA', clienteDomicilio: 'C/ OLIVO 12', inmueble: 'C/ OLIVO 12', refCatastral: 'RC', observaciones: '' },
  lineas: [{ texto: 'Instalación de aerotermia' }], plantilla: { cfg: { iva_pct: 21 } }, fechaMinima: '2026-10-01', otrasFacturas: [], generada: null,
  subidas: [{ drive_id: 'fac-drive-1', numero_factura: '1/26', importe_con_iva: 1210, drive_link: 'https://drive.google.com/fac' }],
};
const fakeFactura = {
  datosFactura: async (id) => (id === EXP ? JSON.parse(JSON.stringify(CTX_FACTURA)) : null),
  refFactura: (f) => require('crypto').createHash('sha256').update(String(f?.drive_id || '')).digest('hex').slice(0, 12),
  plantillaDe: async () => ({ cfg: {} }),
};
for (const [mod, exp] of [
  ['services/supabaseClient.js', fakeSb], ['services/driveService.js', fakeDrive], ['services/whatsappService.js', fakeWa],
  ['services/emailService.js', fakeEmail], ['services/facturaInstaladorService.js', fakeFactura],
  ['services/inexactitudesLote.js', { colocarCorregidosExpediente: async () => {} }],
  ['services/riteCertificado.js', { procesarCertificadoRite: async () => null }],
]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}

const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json({ limit: '50mb' }));
app.use('/api/public/factura-instalador', require(path.join(B, 'routes/facturaInstalador')));
app.use('/api/public', require(path.join(B, 'routes/public')));
app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));
const { sanear } = require(path.join(B, 'routes/instaladorApp'))._internos;

// Las horas («_at») se igualan: son el momento de la llamada, no un comportamiento.
const sinHoras = (v) => JSON.parse(JSON.stringify(v), (k, x) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x) && !/2026-1[01]-01T10/.test(x) ? '«hora»' : x));
const PDF = Buffer.from('%PDF-1.4 firmado por el instalador');

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}`;
  let fallos = 0, n = 0;
  const ok = (cond, texto, detalle) => { n++; if (!cond) fallos++; console.log(`${cond ? '✓' : '✗'} ${texto}${cond ? '' : `\n     → ${detalle}`}`); };
  const llamar = async (metodo, ruta, { sesion = false, json, form } = {}) => {
    reiniciar();
    const h = sesion ? { Authorization: 'Bearer tok-rca' } : {};
    let body;
    if (json !== undefined) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) { body = new FormData(); for (const [k, nombre] of form) body.append(k, new Blob([PDF], { type: 'application/pdf' }), nombre); }
    const r = await fetch(base + ruta, { method: metodo, headers: h, body });
    const texto = await r.text(); let js = null; try { js = JSON.parse(texto); } catch { /* */ }
    await new Promise(res => setTimeout(res, 80)); // los avisos salen en segundo plano
    return { status: r.status, js, side: sinHoras(SIDE), db: sinHoras(DB.expedientes[0].documentacion) };
  };
  // Compara el enlace público con la ruta de la app.
  const mismo = async (texto, metodo, publica, deLaApp, opts = {}) => {
    const p = await llamar(metodo, publica, opts);
    const a = await llamar(metodo, deLaApp, { ...opts, sesion: true });
    ok(p.status === (opts.esperado || 200), `${texto}: el enlace público responde ${opts.esperado || 200} como siempre`, `status ${p.status} ${JSON.stringify(p.js)}`);
    try { assert.deepStrictEqual(a.status, p.status); assert.deepStrictEqual(sinHoras(a.js), sinHoras(sanear(p.js))); ok(true, `${texto}: la app responde lo mismo, saneado`); }
    catch { ok(false, `${texto}: la app responde lo mismo, saneado`, `pública ${p.status} ${JSON.stringify(sanear(p.js))}\n       app ${a.status} ${JSON.stringify(a.js)}`); }
    try { assert.deepStrictEqual(a.side, p.side); assert.deepStrictEqual(a.db, p.db); ok(true, `${texto}: mismas escrituras en BD y Drive y mismos avisos (${p.side.updates.length} BD · ${p.side.drive.filter(d => d[0] === 'guardar').length} Drive · ${p.side.email.length + p.side.wa.length} avisos)`); }
    catch { ok(false, `${texto}: mismas escrituras y avisos`, `pública ${JSON.stringify({ ...p.side, email: p.side.email.length })}\n       app ${JSON.stringify({ ...a.side, email: a.side.email.length })}`); }
    return p;
  };

  console.log('— Leer');
  await mismo('Página del instalador (/instalador/:id)', 'GET', `/api/public/instalador/${EXP}`, '/api/instalador-app/obras/26RES060_OP950/instalador');
  const pdf = await mismo('Borrador del CIFO en base64', 'GET', `/api/public/cifo-upload/${EXP}/pdf`, '/api/instalador-app/obras/26RES060_OP950/cifo/pdf');
  ok(pdf.js?.pdf && Buffer.from(pdf.js.pdf, 'base64').toString().includes('BORRADORCIFO'), 'el borrador sale del fichero de Drive del expediente', JSON.stringify(pdf.js));
  await mismo('Factura en la plantilla (GET)', 'GET', `/api/public/factura-instalador/${EXP}?token=tok-950`, '/api/instalador-app/obras/26RES060_OP950/factura');

  console.log('— Escribir (todo simulado en memoria)');
  const cifo = await mismo('Subir el CIFO firmado', 'POST', `/api/public/cifo-upload/${EXP}`, '/api/instalador-app/obras/26RES060_OP950/cifo', { form: [['cifo', 'cifo_fdo.pdf']] });
  ok(cifo.db.cert_cifo_signed_link && Number(cifo.db.cert_cifo_rev) === 1 && cifo.side.drive.some(d => d[0] === 'guardar' && /Certificado_CIFO_fdo\.pdf$/.test(d[2]) && d[1].endsWith('6. ANEXOS CAE')),
    'el CIFO firmado se guarda en «6. ANEXOS CAE» con su nombre y sella la versión', JSON.stringify(cifo.db));
  ok(cifo.side.updates.every(u => !('documentacion' in u.payload)) && cifo.side.rpc.some(r => r.fn === 'set_expediente_doc_field' && r.args.p_field === 'cert_cifo_signed_link'),
    'el CIFO se escribe clave a clave por RPC, sin reescribir `documentacion` (regla 19)', JSON.stringify(cifo.side.updates));
  const rite = await mismo('Subir el certificado RITE', 'POST', `/api/public/rite-upload/${EXP}`, '/api/instalador-app/obras/26RES060_OP950/rite', { form: [['certificado', 'rite.pdf']] });
  ok(rite.db.cert_rite_drive_link && rite.side.drive.some(d => d[0] === 'guardar' && d[1].endsWith('7. LEGALIZACION RITE')), 'el RITE va a «7. LEGALIZACION RITE»', JSON.stringify(rite.side.drive));
  ok(rite.side.updates.every(u => !('documentacion' in u.payload)) && !rite.side.drive.some(d => d[0] === 'publico'),
    'el RITE se escribe por RPC y su fichero NO se abre a «cualquiera con el enlace»', JSON.stringify(rite.side));
  ok(!/drive\.google/.test(JSON.stringify([cifo.js, rite.js])), 'las respuestas públicas del CIFO y del RITE no llevan enlaces de Drive (regla 1)', JSON.stringify([cifo.js, rite.js]));

  console.log('— El enlace público sigue exigiendo lo de siempre');
  const sinTok = await llamar('GET', `/api/public/factura-instalador/${EXP}`);
  ok(sinTok.status === 403, 'factura sin token → 403', sinTok.status);
  const otroTok = await llamar('GET', `/api/public/factura-instalador/${EXP}?token=tok-otro`);
  ok(otroTok.status === 403, 'factura con otro token → 403', otroTok.status);
  const sinFichero = await llamar('POST', `/api/public/cifo-upload/${EXP}`, { json: {} });
  ok(sinFichero.status === 400 && sinFichero.side.updates.length === 0, 'CIFO sin fichero → 400 y nada escrito', sinFichero.status);

  console.log('— La app no deja nada a medias');
  const appSinFichero = await llamar('POST', '/api/instalador-app/obras/26RES060_OP950/cifo', { sesion: true, json: {} });
  ok(appSinFichero.status === 400 && appSinFichero.side.updates.length === 0, 'CIFO sin fichero por la app → el mismo 400', appSinFichero.status);
  const noVa = await llamar('GET', '/api/instalador-app/obras/26RES060_OP950/factura?token=tok-otro', { sesion: true });
  ok(noVa.status === 200, 'el token que mande el navegador se ignora (la app usa el suyo)', noVa.status);

  console.log(`\n${n - fallos}/${n} correctas (Supabase, Drive, WhatsApp y email simulados: ninguna escritura real)`);
  srv.close(); process.exit(fallos ? 1 : 0);
});
