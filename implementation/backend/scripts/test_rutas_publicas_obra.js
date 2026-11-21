// Rutas PÚBLICAS de documentación (enlace con token): un token vale para UNA obra.
//
//   · DELETE /api/public/reforma-docs/:uuid/:slot  solo borra un fichero de ESA obra y
//     de ESE apartado: apuntado en su `reforma_uploads[slot]` o, porque Drive manda
//     (regla 20), en la subcarpeta de la obra con el nombre de ese apartado.
//   · GET /api/public/reforma-thumb/:uuid/:driveId  solo sirve un fichero de ESA obra:
//     en su `reforma_uploads` o colgando de su carpeta de Drive (≤ 4 niveles).
//   · utils/documentacionAtomica: la subida del CIFO/RITE escribe clave a clave por RPC.
//
// Se carga la ruta REAL (`routes/public.js`) con Supabase, Drive y la red SIMULADOS en
// memoria: ninguna escritura sale de este proceso.
//
//   node scripts/test_rutas_publicas_obra.js   (desde implementation/backend)
// Ver docs/conocimiento/transversal-backend/rutas-publicas-solo-lo-de-esa-obra.md.
const path = require('path');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', BOT_WHATSAPP_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false',
  WA_SYNC_INSTALADORES: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false',
});
delete process.env.WHATSAPP_ADMIN_CHAT;

const OP = 'bbbbbbbb-0000-4000-8000-000000000961';
const OTRA = 'bbbbbbbb-0000-4000-8000-000000000962';
const SUB = 'sub-docs-961', SUB_OTRA = 'sub-docs-962', SUB_FAC = 'sub-fac-961';
const INICIAL = {
  oportunidades: [
    { id: OP, datos_calculo: { upload_token: 'tok-961', drive_folder_id: 'carpeta-961', reforma_uploads: {
      FOTO_EQUIPO: [{ name: 'FOTO_EQUIPO.jpg', driveId: 'foto-apuntada-0001' }, { name: 'FOTO_EQUIPO_2.jpg', driveId: 'foto-apuntada-0002' }],
      FOTO_FACHADA: [{ name: 'FOTO_FACHADA.jpg', driveId: 'fachada-apuntada-01' }],
    } } },
    { id: OTRA, datos_calculo: { upload_token: 'tok-962', drive_folder_id: 'carpeta-962', reforma_uploads: { FOTO_EQUIPO: [{ name: 'FOTO_EQUIPO.jpg', driveId: 'foto-de-la-otra-01' }] } } },
  ],
};
// El Drive simulado: cada fichero con su nombre y su carpeta.
const FICHEROS = {
  'foto-apuntada-0001': { name: 'FOTO_EQUIPO.jpg', parents: [SUB] },
  'foto-apuntada-0002': { name: 'FOTO_EQUIPO_2.jpg', parents: [SUB] },
  'fachada-apuntada-01': { name: 'FOTO_FACHADA.jpg', parents: [SUB] },
  'solo-en-drive-0001': { name: 'FOTO_EQUIPO_3.jpg', parents: [SUB] },          // en Drive, no en la BD
  'solo-en-drive-otro': { name: 'FOTO_FACHADA_2.jpg', parents: [SUB] },         // de otro apartado
  'suelto-en-drive-01': { name: 'IMG_2041.jpg', parents: [SUB] },               // «Otros existentes»
  'foto-de-la-otra-01': { name: 'FOTO_EQUIPO.jpg', parents: [SUB_OTRA] },       // de OTRA obra
  'lote-de-brokergy-1': { name: 'FOTO_EQUIPO.jpg', parents: ['carpeta-lotes'] }, // cualquier otro fichero
  'factura-en-drive-1': { name: 'DOC_FACTURAS_2.pdf', parents: [SUB_FAC] },
  [SUB]: { name: '12. DOCUMENTOS PARA CEE', parents: ['carpeta-961'] },
  [SUB_OTRA]: { name: '12. DOCUMENTOS PARA CEE', parents: ['carpeta-962'] },
  [SUB_FAC]: { name: '5. FACTURAS', parents: ['carpeta-961'] },
};
let DB, SIDE, BD_CAIDA = false;
const reiniciar = () => { DB = JSON.parse(JSON.stringify(INICIAL)); SIDE = { rpc: [], drive: [] }; BD_CAIDA = false; };
reiniciar();

const get = (row, col) => { const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]); };
function qb(table) {
  const st = { filtros: [], sel: null };
  const fila = () => {
    if (BD_CAIDA) return { data: null, error: { message: 'BD caída (simulada)' } };
    const r = (DB[table] || []).find(x => st.filtros.every(f => f(x)));
    if (!r) return { data: null, error: null };
    if (!st.sel) return { data: { ...r }, error: null };
    const o = {};
    for (const p of st.sel.split(',').map(s => s.trim())) { const m = p.match(/^(\w+):(.+)$/); if (m) o[m[1]] = get(r, m[2].trim()); else o[p] = get(r, p); }
    return { data: o, error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(fila()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve(fila());
    if (k === 'select') return (s) => { st.sel = s; return b; };
    if (k === 'eq') return (c, v) => { st.filtros.push(r => String(get(r, c)) === String(v)); return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = {
  from: qb,
  rpc: (fn, args) => { SIDE.rpc.push({ fn, args: JSON.parse(JSON.stringify(args)) }); return Promise.resolve({ data: null, error: null }); },
};
const fakeDrive = {
  getFileMetadata: async (id) => (FICHEROS[id] ? { id, mimeType: 'image/jpeg', ...FICHEROS[id] } : null),
  findSubfolderByName: async (padre, nombre) => Object.keys(FICHEROS).find(id => FICHEROS[id].name === nombre && FICHEROS[id].parents.includes(padre)) || null,
  findSubfolderByNameNormalized: async (padre, nombre) => Object.keys(FICHEROS).find(id => FICHEROS[id].name.replace(/\s/g, '') === nombre.replace(/\s/g, '') && FICHEROS[id].parents.includes(padre)) || null,
  findFileByName: async (padre, nombre) => Object.keys(FICHEROS).find(id => FICHEROS[id].name === nombre && FICHEROS[id].parents.includes(padre)) || null,
  deleteFile: async (id) => { SIDE.drive.push(['borrar', id]); },
  getFileContent: async (id) => { SIDE.drive.push(['leer', id]); return Buffer.from('jpeg ' + id); },
};
// Sin red: la miniatura de lh3/thumbnail «falla» y se cae a los bytes por la API de Drive.
const sinRed = async () => { throw new Error('sin red en el test'); };
const fakeAxios = new Proxy(function () {}, {
  get: (_, k) => (k === 'get' || k === 'post' || k === 'request' ? sinRed : k === 'create' ? () => fakeAxios : k === 'defaults' ? { headers: { common: {} } } : fakeAxios),
  apply: () => sinRed(),
});
for (const [mod, exp] of [
  ['services/supabaseClient.js', fakeSb], ['services/driveService.js', fakeDrive],
  ['services/whatsappService.js', new Proxy({}, { get: () => async () => ({ ok: true }) })],
  ['services/emailService.js', new Proxy({}, { get: () => async () => ({ ok: true }) })],
]) {
  const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp };
}
const rAxios = require.resolve('axios', { paths: [B] });
require.cache[rAxios] = { id: rAxios, filename: rAxios, loaded: true, exports: fakeAxios };

const express = require(path.join(B, 'node_modules/express'));
const app = express(); app.use(express.json());
app.use('/api/public', require(path.join(B, 'routes/public')));

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${srv.address().port}/api/public`;
  let fallos = 0, n = 0;
  const ok = (cond, texto, detalle) => { n++; if (!cond) fallos++; console.log(`${cond ? '✓' : '✗'} ${texto}${cond ? '' : `\n     → ${detalle}`}`); };
  const pide = async (metodo, ruta, { caida = false } = {}) => {
    reiniciar(); BD_CAIDA = caida;
    const r = await fetch(base + ruta, { method: metodo });
    await r.arrayBuffer();
    return { status: r.status, side: SIDE };
  };
  const borrados = (s) => s.drive.filter(d => d[0] === 'borrar').map(d => d[1]);
  const leidos = (s) => s.drive.filter(d => d[0] === 'leer').map(d => d[1]);
  const escribe = (s) => s.rpc.some(x => x.fn === 'reforma_replace_slot');

  console.log('— DELETE /reforma-docs/:uuid/:slot: solo lo de ESA obra y ESE apartado');
  let r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=lote-de-brokergy-1`);
  ok(r.status === 404 && !borrados(r.side).length && !escribe(r.side), 'un driveId cualquiera del Drive de Brokergy → 404, nada borrado ni escrito', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=foto-de-la-otra-01`);
  ok(r.status === 404 && !borrados(r.side).length, 'la foto de OTRA obra, con el token de esta → 404', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=fachada-apuntada-01`);
  ok(r.status === 404 && !borrados(r.side).length, 'una foto de esta obra pero de OTRO apartado → 404', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=solo-en-drive-otro`);
  ok(r.status === 404 && !borrados(r.side).length, 'en Drive, de esta obra, con el nombre de OTRO apartado → 404', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=foto-apuntada-0002`);
  const rep = r.side.rpc.find(x => x.fn === 'reforma_replace_slot');
  ok(r.status === 200 && borrados(r.side).join() === 'foto-apuntada-0002' && rep?.args.p_array.length === 1 && rep.args.p_array[0].driveId === 'foto-apuntada-0001',
    'la apuntada en ESE apartado → 200, se borra en Drive y sale de reforma_uploads', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=solo-en-drive-0001`);
  ok(r.status === 200 && borrados(r.side).join() === 'solo-en-drive-0001', 'la que está en Drive y no en la BD, en su subcarpeta y con su nombre → 200 (regla 20)', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/OTROS_EXISTENTES?token=tok-961&driveId=suelto-en-drive-01`);
  ok(r.status === 200 && borrados(r.side).join() === 'suelto-en-drive-01', '«Otros existentes»: un fichero suelto de la subcarpeta de la obra → 200', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/OTROS_EXISTENTES?token=tok-961&driveId=foto-de-la-otra-01`);
  ok(r.status === 404 && !borrados(r.side).length, '«Otros existentes» de OTRA obra → 404', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/DOC_FACTURAS?token=tok-961&driveId=factura-en-drive-1`);
  ok(r.status === 200 && borrados(r.side).join() === 'factura-en-drive-1', 'una factura en «5. FACTURAS» de la obra → 200', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&name=FOTO_EQUIPO.jpg`);
  ok(r.status === 200 && borrados(r.side).join() === 'foto-apuntada-0001', 'solo con el nombre (navegador antiguo), apuntada → 200', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&name=FOTO_FACHADA.jpg`);
  ok(r.status === 404 && !borrados(r.side).length, 'solo con el nombre de OTRO apartado → 404', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-962&driveId=foto-apuntada-0001`);
  ok(r.status === 403 && !borrados(r.side).length, 'con el token de OTRA obra → 403', JSON.stringify(r));
  r = await pide('DELETE', `/reforma-docs/${OP}/FOTO_EQUIPO?token=tok-961&driveId=foto-apuntada-0001`, { caida: true });
  ok(r.status === 503 && !borrados(r.side).length, 'con la BD caída → 503, nada borrado (regla 38)', JSON.stringify(r));

  console.log('— GET /reforma-thumb/:uuid/:driveId: solo lo de ESA obra');
  r = await pide('GET', `/reforma-thumb/${OP}/foto-apuntada-0001`);
  ok(r.status === 403 && !leidos(r.side).length, 'sin token → 403', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/foto-apuntada-0001?token=tok-962`);
  ok(r.status === 403 && !leidos(r.side).length, 'con el token de otra obra → 403', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/lote-de-brokergy-1?token=tok-961`);
  ok(r.status === 404 && !leidos(r.side).length, 'un driveId cualquiera del Drive de Brokergy → 404, no se lee', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/foto-de-la-otra-01?token=tok-961`);
  ok(r.status === 404 && !leidos(r.side).length, 'la foto de OTRA obra, con el token de esta → 404', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/fachada-apuntada-01?token=tok-961&sz=200`);
  ok(r.status === 200 && leidos(r.side).join() === 'fachada-apuntada-01', 'la apuntada en su reforma_uploads → 200', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/suelto-en-drive-01?token=tok-961`);
  ok(r.status === 200 && leidos(r.side).join() === 'suelto-en-drive-01', 'la que solo está en Drive, colgando de la carpeta de la obra → 200 (regla 20)', JSON.stringify(r));
  r = await pide('GET', `/reforma-thumb/${OP}/foto-apuntada-0001?token=tok-961`, { caida: true });
  ok(r.status === 503 && !leidos(r.side).length, 'con la BD caída → 503 (regla 38)', JSON.stringify(r));

  console.log('— utils/documentacionAtomica: clave a clave, el enlace el último');
  const { escribirSubidaEnDocumentacion } = require(path.join(B, 'utils/documentacionAtomica'));
  reiniciar();
  await escribirSubidaEnDocumentacion(fakeSb, {
    expedienteId: 'exp-1', oportunidadId: OP,
    docLeida: { historial: [], docs_validados: { cert_cifo_signed_link: '2026-11-01T10:00:00Z' } },
    subidos: ['cert_cifo_signed_link'], quien: { usuario: 'RCA', origen: 'subida por el instalador' },
    campos: { cert_cifo_rev: 2, cert_cifo_refirma_at: null, cert_cifo_signed_link: 'enlace-nuevo' },
  });
  const orden = SIDE.rpc.map(x => `${x.fn}:${x.args.p_field}`);
  ok(orden.join(' ') === 'merge_expediente_doc_json:docs_validados merge_expediente_doc_json:docs_rechazados merge_expediente_doc_json:historial set_expediente_doc_field:cert_cifo_rev set_expediente_doc_field:cert_cifo_refirma_at set_expediente_doc_field:cert_cifo_signed_link',
    'invalida, anota, escribe los sellos y el ENLACE el último', orden.join(' '));
  ok(SIDE.rpc[0].args.p_value.cert_cifo_signed_link === null && SIDE.rpc[2].args.p_value[0].tipo === 'doc_nueva_version'
    && SIDE.rpc[3].args.p_value === '2' && SIDE.rpc[4].args.p_value === null,
    'el visto bueno se anula (null), la nota de nueva versión va al historial, la versión como texto y el null como null', JSON.stringify(SIDE.rpc));
  let lanzo = false;
  try { await escribirSubidaEnDocumentacion({ rpc: async () => ({ error: { message: 'caída' } }) }, { expedienteId: 'e', oportunidadId: 'o', docLeida: {}, subidos: ['x'], campos: { a: 1 } }); }
  catch { lanzo = true; }
  ok(lanzo, 'si una RPC falla, LANZA (la ruta responde 500 y no da el documento por recibido)', 'no lanzó');

  console.log(`\n${n - fallos}/${n} correctas (Supabase, Drive y la red simulados: ninguna escritura real)`);
  // Cerrar las conexiones de `fetch` antes de salir: en Windows, `process.exit` con un
  // socket aún cerrándose aborta node (UV_HANDLE_CLOSING) y el código de salida miente.
  srv.closeAllConnections?.(); srv.close();
  setTimeout(() => process.exit(fallos ? 1 : 0), 100);
});
