// El PRESUPUESTO del instalador (22/11/2026): cuentas y nº con la lógica común, el
// cliente (reutilizar / crear / ajeno / candidatos), crear-actualizar-anular, el PDF
// REAL (con una plantilla mínima hecha aquí con pdf-lib y con la hoja genérica), las
// rutas (sesión, lo ajeno, lista blanca, vista previa que no guarda) y el WhatsApp al
// teléfono de la FICHA. Supabase, Drive y WhatsApp SIMULADOS: nada real.
//   node scripts/test_presupuesto_instalador.js   (desde implementation/backend)
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const assert = require('assert');
const B = path.join(__dirname, '..');
Object.assign(process.env, {
  WHATSAPP_ENABLED: 'false', PROPUESTA_PROGRAMADA_ENABLED: 'false', REVISION_ALERTA_ENABLED: 'false',
  BOT_WHATSAPP_ENABLED: 'false', CEE_ENTREGA_AUTO: 'false', WA_SYNC_INSTALADORES: 'false',
  APP_INSTALADOR_BETA: 'p-1, p-2',
});
delete process.env.DRIVE_FOLDER_PLANTILLAS_FACTURA;

const U = (n) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const OP902 = U(3), OP901 = U(2), PRESU_AJENO = U(9);
const DB = {
  usuarios: [
    { auth_user_id: 'a-tok-rca', id_usuario: 'u-rca', activo: true, tlf: '+34 699 000 597', roles: { nombre_rol: 'INSTALADOR' } },
    { auth_user_id: 'a-tok-otro', id_usuario: 'u-otro', activo: true, tlf: null, roles: { nombre_rol: 'INSTALADOR' } },
  ],
  prescriptores: [
    { id_empresa: 'p-1', representante_legal_id: 'u-rca', razon_social: 'RCA INSTALACIONES', acronimo: 'RCA', cif: 'B11111111', direccion: 'C/ CAMPO 91', codigo_postal: '13700', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', tlf: '926000111', tlf_responsable: '600111222', email: 'rca@ejemplo.es' },
    { id_empresa: 'p-2', representante_legal_id: 'u-otro', razon_social: 'OTRO INSTALADOR', acronimo: 'OTRO', tlf: '926999888' },
  ],
  clientes: [
    { id_cliente: U(1), nombre_razon_social: 'CARMEN', apellidos: 'RUIZ', dni: '22222222J', tlf: '600000001', email: null, municipio: 'TOMELLOSO', prescriptor_id: 'p-1' },
    { id_cliente: U(4), nombre_razon_social: 'JUAN', apellidos: 'PÉREZ', tlf: '600000002', municipio: 'SOCUELLAMOS', prescriptor_id: 'p-1' },
    { id_cliente: U(5), nombre_razon_social: 'JUAN', apellidos: 'PEREZ', tlf: '600000003', municipio: 'TOMELLOSO', prescriptor_id: 'p-1' },
    { id_cliente: U(6), nombre_razon_social: 'PILAR', apellidos: 'NIETO', dni: '33333333P', tlf: '600000004', direccion: 'C/ MURCIA 2', codigo_postal: '13700', municipio: 'TOMELLOSO', provincia: 'CIUDAD REAL', prescriptor_id: null },
    { id_cliente: U(7), nombre_razon_social: 'AJENO', apellidos: 'DEL OTRO', dni: '11111111H', tlf: '611111111', prescriptor_id: 'p-2' },
  ],
  oportunidades: [
    { id: OP902, id_oportunidad: '26RES060_OP902', creador_id: 'u-rca', prescriptor_id: 'p-1', cliente_id: U(6), ref_catastral: '1234567VJ0000S0001AA',
      datos_calculo: { historial: [], reforma_uploads: {}, inputs: { address: 'C/ MURCIA 2', codigo_postal: '13700', municipio: 'TOMELLOSO', provincia_nombre: 'CIUDAD REAL',
        aerothermiaModel: '127', potenciaBomba: '9', fuelType: 'gasoleo', changeAcs: false,
        presupuestos_leidos: { AEROTERMIA: { numero: '39/26' } } } } },
    { id: OP901, id_oportunidad: '26RES060_OP901', creador_id: 'u-otro', prescriptor_id: 'p-2', cliente_id: U(7), datos_calculo: { inputs: {} } },
  ],
  aerotermia: [{ id: 127, marca: 'PANASONIC', modelo_comercial: 'WH-WXG09ME5' }],
  expedientes: [],
  instalador_presupuestos: [
    { id: U('a'), prescriptor_id: 'p-1', numero: '38/26', fecha: '2026-11-07', estado: 'EMITIDO', origen: 'app', cliente: { nombre: 'X' }, obra: {}, lineas: [], base: 1, total: 1.21, created_at: '2026-11-07T10:00:00Z' },
    { id: PRESU_AJENO, prescriptor_id: 'p-2', numero: '5/26', fecha: '2026-11-01', estado: 'EMITIDO', origen: 'app', cliente_id: U(7), cliente: { nombre: 'AJENO DEL OTRO' },
      obra: { tipo: 'aerotermia' }, lineas: [{ texto: 'OBRA', cantidad: 1, precio: 100, importe: 100 }], modo: 'total', base: 100, iva_pct: 21, iva: 21, total: 121, created_at: '2026-11-01T10:00:00Z' },
  ],
};

// ── Supabase simulado: select con alias y caminos JSON, filtros, orden, insert/update y los únicos ──
let FALLA = null; // nombre de tabla que «se cae»
let reloj = Date.parse('2026-11-22T08:00:00Z');
const get = (row, col) => {
  if (col.includes('->')) { const [base, ...rest] = col.split(/->>?/); return rest.reduce((o, k) => o?.[k], row[base]); }
  return row[col];
};
const sinT = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function proyectar(r, sel) {
  if (!sel || sel.trim() === '*') return { ...r };
  const o = {};
  for (const part of sel.split(',').map(s => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\w+):(.+)$/);
    if (m) o[m[1]] = get(r, m[2]); else if (part === '*') Object.assign(o, r); else if (/^\w+$/.test(part)) o[part] = r[part];
    else if (/^\w+\s*\(/.test(part)) Object.assign(o, r);
  }
  return o;
}
function choca(table, fila, salvo) {
  if (table === 'instalador_presupuestos' && fila.estado !== 'ANULADO') {
    return DB[table].some(r => r !== salvo && r.estado !== 'ANULADO' && r.prescriptor_id === fila.prescriptor_id && sinT(r.numero) === sinT(fila.numero));
  }
  if (table === 'clientes' && fila.dni) return DB[table].some(r => r !== salvo && r.dni && r.dni === fila.dni);
  return false;
}
function qb(table) {
  const st = { op: 'select', payload: null, filters: [], select: null, order: null, limit: null };
  const filas = () => { let rows = (DB[table] ||= []); for (const f of st.filters) rows = rows.filter(f); return rows; };
  const ejecutar = () => {
    if (FALLA === table) return { data: null, error: { message: '521 Web server is down' } };
    let rows;
    if (st.op === 'insert') {
      rows = [];
      for (const p of st.payload) {
        const nueva = { id: crypto.randomUUID(), created_at: new Date(reloj += 1000).toISOString(), ...p };
        if (table === 'clientes') { nueva.id_cliente ||= crypto.randomUUID(); delete nueva.id; }
        if (choca(table, nueva)) return { data: null, error: { code: '23505', message: 'duplicate key' } };
        DB[table].push(nueva); rows.push(nueva);
      }
    } else if (st.op === 'update') {
      rows = filas();
      for (const r of rows) { if (choca(table, { ...r, ...st.payload }, r)) return { data: null, error: { code: '23505', message: 'duplicate key' } }; }
      for (const r of rows) Object.assign(r, JSON.parse(JSON.stringify(st.payload)));
    } else rows = filas().slice();
    if (st.order) rows = rows.slice().sort((a, b) => (String(a[st.order.c]) < String(b[st.order.c]) ? -1 : 1) * (st.order.asc ? 1 : -1));
    if (st.limit) rows = rows.slice(0, st.limit);
    return { data: rows.map(r => proyectar(JSON.parse(JSON.stringify(r)), st.select)), error: null };
  };
  const b = new Proxy({}, { get(_, k) {
    if (k === 'then') return (ok, ko) => Promise.resolve(ejecutar()).then(ok, ko);
    if (k === 'single' || k === 'maybeSingle') return () => Promise.resolve((() => { const r = ejecutar(); return r.error ? r : { data: r.data[0] || null, error: null }; })());
    if (k === 'select') return (s) => { st.select = s; return b; };
    if (k === 'insert') return (p) => { st.op = 'insert'; st.payload = Array.isArray(p) ? p : [p]; return b; };
    if (k === 'update') return (p) => { st.op = 'update'; st.payload = p; return b; };
    if (k === 'eq') return (c, v) => { st.filters.push(r => String(get(r, c)) === String(v)); return b; };
    if (k === 'neq') return (c, v) => { st.filters.push(r => String(get(r, c)) !== String(v)); return b; };
    if (k === 'ilike') return (c, v) => { st.filters.push(r => sinT(get(r, c)) === sinT(v)); return b; };
    if (k === 'in') return (c, vs) => { st.filters.push(r => vs.map(String).includes(String(get(r, c)))); return b; };
    if (k === 'or') return (e) => {
      const ps = [...e.matchAll(/([\w>-]+)\.(eq|in)\.(\([^)]*\)|[^,]*)/g)].map(m => [m[1], m[2], m[3]]);
      st.filters.push(r => ps.some(([c, o, v]) => o === 'eq' ? String(get(r, c)) === v : v.slice(1, -1).split(',').includes(String(get(r, c)))));
      return b;
    };
    if (k === 'order') return (c, o = {}) => { st.order = { c, asc: o.ascending !== false }; return b; };
    if (k === 'limit') return (n) => { st.limit = n; return b; };
    return () => b;
  } });
  return b;
}
const fakeSb = { auth: { getUser: async (t) => ({ data: { user: { id: 'a-' + t, email: t + '@x' } }, error: null }) }, from: qb, rpc: async () => ({ data: null, error: null }) };

// Drive, WhatsApp y avisos SIMULADOS.
const SUBIDAS = [], AVISOS = [], WA = [];
let WA_LISTO = true;
const dobles = {
  'services/supabaseClient.js': fakeSb,
  'services/reformaUploadService.js': {
    checklistForOportunidad: async () => [{ key: 'DOC_PRESUPUESTO', label: 'Presupuesto', fase: 'ANTES', multiple: true }],
    subirFicherosASlot: async (a) => { SUBIDAS.push(a); return { subidas: [{ driveId: 'd-presu-123456', link: 'https://drive.google.com/file/d/d-presu-123456' }], fallidas: [] }; },
  },
  'services/uploadNotifier.js': { registrarSubida: (a) => AVISOS.push(a) },
  'services/avisosAlPartner.js': { desvioDelPartner: async () => null },
  'services/whatsappAutoSync.js': { programarCliente: () => {} },
  'services/whatsappService.js': {
    _config: { get enabled() { return WA_LISTO; } }, isReady: () => WA_LISTO,
    sendMedia: async (tlf, media, op) => { WA.push({ tlf, media, op }); return { ok: true, id: 'w1', ack: 1 }; },
  },
};
for (const [mod, exp] of Object.entries(dobles)) { const r = require.resolve(path.join(B, mod)); require.cache[r] = { id: r, filename: r, loaded: true, exports: exp }; }

// El PDF: se apunta lo que se ESCRIBE (con fuentes incrustadas el texto no se lee en crudo).
const pdfLib = require(path.join(B, 'node_modules/pdf-lib'));
let ESCRITO = [];
const drawText = pdfLib.PDFPage.prototype.drawText;
pdfLib.PDFPage.prototype.drawText = function (t, o) { ESCRITO.push(String(t)); return drawText.call(this, t, o); };

let fallos = 0, n = 0;
async function prueba(nombre, fn) {
  n++;
  try { await fn(); console.log(`✓ ${nombre}`); }
  catch (e) { fallos++; console.log(`✗ ${nombre}\n    ${e.message}`); }
}
async function rechaza(promesa, status, code) {
  try { await promesa; } catch (e) {
    assert.strictEqual(e.status, status, `status ${e.status} (esperaba ${status}): ${e.message}`);
    if (code) assert.strictEqual(e.code, code);
    return e;
  }
  throw new Error(`no falló (esperaba ${status})`);
}

const ENTRADA = (extra = {}) => ({
  numero: '40/26', fecha: '2026-11-22',
  cliente: { nombre: 'Antonio', apellidos: 'González Carretero', dni: '00000000T', tlf: '600999888', direccion: 'C/ Murcia 2', codigo_postal: '13700', municipio: 'Tomelloso', provincia: 'Ciudad Real' },
  obra: { tipo: 'aerotermia', direccion: 'C/ Murcia 2', codigo_postal: '13700', municipio: 'Tomelloso', provincia: 'Ciudad Real',
    equipo: { marca: 'PANASONIC', modelo: 'WH-WXG09ME5', potencia_kw: 9 }, caldera: { combustible: 'gasoleo' }, acs: false, emisor: 'radiadores',
    extras: [{ clave: 'deposito_inercia', litros: 100 }, { clave: 'vaso_calefaccion', litros: 18 }, { clave: 'retirada_caldera' }] },
  modo: 'total', total: '9200', con_iva: false, iva_pct: 21, notas: 'El presupuesto no incluye la alimentación eléctrica.', validez_dias: 30,
  ...extra,
});

// ── La plantilla MÍNIMA de p-1, hecha aquí (fondos de distinto tamaño para saber cuál se usó) ──
const FUENTE = ['C:/Windows/Fonts/arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/System/Library/Fonts/Supplemental/Arial.ttf', '/Library/Fonts/Arial.ttf']
  .find(f => { try { return fs.statSync(f).isFile(); } catch { return false; } });
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'presu-inst-'));
async function hacerPlantilla() {
  const fondo = async (w, h) => { const d = await pdfLib.PDFDocument.create(); d.addPage([w, h]); return Buffer.from(await d.save()); };
  const dir = path.join(DIR, 'p-1'); fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, 'fondo.pdf'), await fondo(595.28, 841.89));
  fs.writeFileSync(path.join(dir, 'fondo_presupuesto.pdf'), await fondo(595, 842));
  fs.copyFileSync(FUENTE, path.join(dir, 'f.ttf'));
  fs.writeFileSync(path.join(dir, 'plantilla.json'), JSON.stringify({
    fondo: 'fondo.pdf', fuentes: { normal: 'f.ttf' }, iva_pct: 21,
    cliente: { x: 55, y: 145, size: 12, pitch: 16.4, nombreNegrita: true },
    numero: { x: 503.5, y: 157, size: 12, align: 'c', ejemplo: '44/26', zona: [488, 562] },
    fecha: { x: 442, y: 185, size: 10.5, align: 'l', formato: 'largo', zona: [442, 562] },
    tabla: { y: 274, pitch: 13.5, size: 9.5, separacion: 5, fondo: 692, cantidad: { x: 68, align: 'c' }, concepto: { x: 110, ancho: 300 },
      precio: { x: 453, align: 'c', simbolo: false }, importe: { x: 531, align: 'c', simbolo: true } },
    extra: { antes: 6, size: 8.5, pitch: 11, obsSize: 7, obsPitch: 9 },
    totales: { base: { x: 112, y: 765, size: 11.5, align: 'c' }, iva: { x: 270, y: 765, size: 11.5, align: 'c' }, total: { x: 459, y: 766, size: 13, align: 'c', bold: true } },
    presupuesto: { fondo: 'fondo_presupuesto.pdf', numero: { ejemplo: '40/26' }, validez_dias: 30, notas: 'El presupuesto no incluye la alimentación eléctrica.' },
  }));
}

(async () => {
  if (FUENTE) { await hacerPlantilla(); process.env.PLANTILLAS_FACTURA_DIR = DIR; }
  else { console.log('· sin fuente TTF del sistema: la plantilla del instalador no se prueba (la genérica sí)'); process.env.PLANTILLAS_FACTURA_DIR = DIR; }
  const PI = require(path.join(B, 'services/presupuestoInstaladorService'));
  const fis = require(path.join(B, 'services/facturaInstaladorService'));

  console.log('— Cuentas y nº (lógica común)');
  await prueba('9.200 € + IVA → base 9.200, IVA 1.932, total 11.132; el precio en la 1.ª línea y el resto sin importe', async () => {
    const { errores, fila } = await PI._internos.calcularEntrada(ENTRADA());
    assert.deepStrictEqual(errores, []);
    assert.deepStrictEqual([fila.base, fila.iva, fila.total], [9200, 1932, 11132]);
    assert.strictEqual(fila.lineas[0].importe, 9200);
    assert.ok(fila.lineas.slice(1).every(l => !l.importe));
    assert.ok(/PANASONIC.*WH-WXG09ME5.*GASÓLEO/.test(fila.lineas[0].texto), fila.lineas[0].texto);
    assert.ok(fila.lineas.some(l => /INERCIA DE 100 LITROS/.test(l.texto)) && fila.lineas.some(l => /RETIRADA DE LA CALDERA/.test(l.texto)));
  });
  await prueba('«11.132 con IVA» → base 9.200', async () => {
    const { fila } = await PI._internos.calcularEntrada(ENTRADA({ total: '11.132', con_iva: true }));
    assert.deepStrictEqual([fila.base, fila.total], [9200, 11132]);
  });
  await prueba('sin importe o sin nº → errores (no se guarda)', async () => {
    assert.ok((await PI._internos.calcularEntrada(ENTRADA({ total: '' }))).errores.length);
    assert.ok((await PI._internos.calcularEntrada(ENTRADA({ numero: '' }))).errores.length);
    assert.strictEqual((await PI._internos.calcularEntrada(ENTRADA({ numero: '' }), { borrador: true })).errores.length, 0);
  });
  await prueba('nº sugerido: tabla (38/26) + leídos de sus obras (39/26) + ejemplo de la plantilla (40/26) → 41/26; sin plantilla → 40/26', async () => {
    const pl = await fis.plantillaDe('p-1');
    if (FUENTE) assert.strictEqual(await PI.numeroSugerido('p-1', pl, '2026-11-22'), '41/26');
    assert.strictEqual(await PI.numeroSugerido('p-1', null, '2026-11-22'), '40/26');
    assert.strictEqual(await PI.numeroSugerido('p-2', null, '2026-11-22'), '6/26');
  });

  console.log('— El cliente');
  await prueba('por DNI → el mismo, y se rellena SOLO lo vacío (el teléfono no se pisa)', async () => {
    const r = await PI.resolverCliente({ prescriptorId: 'p-1', cliente: { nombre: 'Otro Nombre', dni: '22222222-j', tlf: '699999999', email: 'carmen@x.es' } });
    assert.strictEqual(r.cliente.id_cliente, U(1)); assert.strictEqual(r.creado, false);
    const c = DB.clientes.find(x => x.id_cliente === U(1));
    assert.strictEqual(c.tlf, '600000001'); assert.strictEqual(c.email, 'carmen@x.es'); assert.strictEqual(c.nombre_razon_social, 'CARMEN');
  });
  await prueba('por teléfono (9 últimos dígitos, con +34)', async () => {
    const r = await PI.resolverCliente({ prescriptorId: 'p-1', cliente: { nombre: 'C', tlf: '+34 600 00 00 01' } });
    assert.strictEqual(r.cliente.id_cliente, U(1));
  });
  await prueba('por nombre completo sin tildes', async () => {
    const r = await PI.resolverCliente({ prescriptorId: 'p-1', cliente: { nombre: 'Carmen', apellidos: 'Ruíz' } });
    assert.strictEqual(r.cliente.id_cliente, U(1));
  });
  await prueba('varios que se parecen → candidatos (con el teléfono enmascarado), sin crear', async () => {
    const antes = DB.clientes.length;
    const r = await PI.resolverCliente({ prescriptorId: 'p-1', cliente: { nombre: 'juan', apellidos: 'pérez' } });
    assert.strictEqual(r.cliente, null); assert.strictEqual(r.candidatos.length, 2);
    assert.ok(r.candidatos.every(c => /^···\d{3}$/.test(c.tlf)));
    assert.strictEqual(DB.clientes.length, antes);
  });
  await prueba('elegido por id: el de SU obra vale; el de otro instalador → 404', async () => {
    assert.strictEqual((await PI.resolverCliente({ prescriptorId: 'p-1', clienteId: U(6) })).cliente.id_cliente, U(6));
    await rechaza(PI.resolverCliente({ prescriptorId: 'p-1', clienteId: U(7) }), 404);
    await rechaza(PI.resolverCliente({ prescriptorId: 'p-1', clienteId: 'no-uuid' }), 404);
  });
  await prueba('nuevo → se crea a SU nombre (un prescriptor_id que venga en el cuerpo se ignora)', async () => {
    const r = await PI.resolverCliente({ prescriptorId: 'p-1', usuarioId: 'u-rca', cliente: { nombre: 'Lucía', apellidos: 'Martín', tlf: '611000999', prescriptor_id: 'p-2' } });
    assert.strictEqual(r.creado, true);
    const c = DB.clientes.find(x => x.id_cliente === r.cliente.id_cliente);
    assert.strictEqual(c.prescriptor_id, 'p-1'); assert.strictEqual(c.nombre_razon_social, 'LUCÍA');
  });
  await prueba('DNI de un cliente de OTRO → 409 sin decir de quién; sin nombre → 400', async () => {
    const e = await rechaza(PI.resolverCliente({ prescriptorId: 'p-1', cliente: { nombre: 'Falso', dni: '11111111h' } }), 409, 'DNI_EXISTE');
    assert.ok(!/OTRO|AJENO/i.test(e.message), e.message);
    await rechaza(PI.resolverCliente({ prescriptorId: 'p-1', cliente: { apellidos: 'Sin nombre' } }), 400);
  });

  console.log('— Crear, actualizar, anular');
  let creado;
  await prueba('crear 40/26 → EMITIDO, de p-1, con el cliente dado de alta y su foto impresa', async () => {
    creado = await PI.crear({ prescriptorId: 'p-1', usuarioId: 'u-rca', origen: 'app', entrada: ENTRADA() });
    assert.strictEqual(creado.estado, 'EMITIDO'); assert.strictEqual(creado.prescriptor_id, 'p-1'); assert.strictEqual(creado.numero, '40/26');
    assert.strictEqual(creado.cliente_creado, true); assert.strictEqual(creado.cliente.nif, '00000000T');
    assert.strictEqual(creado.total, 11132); assert.strictEqual(creado.creado_por, 'u-rca');
  });
  await prueba('el mismo nº otra vez → 409 NUMERO_REPETIDO con el sugerido', async () => {
    const e = await rechaza(PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '40/26' }) }), 409, 'NUMERO_REPETIDO');
    assert.ok(/^\d+\/26$/.test(e.sugerido) && e.sugerido !== '40/26', e.sugerido);
  });
  await prueba('el mismo nº en OTRO instalador sí vale (cada uno su serie)', async () => {
    const f = await PI.crear({ prescriptorId: 'p-2', entrada: ENTRADA({ cliente_id: U(7), cliente: undefined }) });
    assert.strictEqual(f.prescriptor_id, 'p-2');
  });
  await prueba('actualizar: cambia el importe y conserva el nº', async () => {
    const f = await PI.actualizar({ prescriptorId: 'p-1', id: creado.id, entrada: ENTRADA({ total: '9500', cliente_id: creado.cliente_id, cliente: undefined }) });
    assert.deepStrictEqual([f.numero, f.base, f.total], ['40/26', 9500, 11495]);
    assert.strictEqual(f.cliente_creado, false);
  });
  await prueba('entradaDesdeFila → al recalcular da lo mismo (sin IVA y «con IVA» de un total redondo)', async () => {
    const fila = await PI.obtener('p-1', creado.id);
    const e = PI.entradaDesdeFila(fila);
    assert.strictEqual((await PI._internos.calcularEntrada(e)).fila.total, fila.total);
    const conIva = await PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '77/26', total: '11000', con_iva: true }) });
    const e2 = PI.entradaDesdeFila(conIva);
    assert.strictEqual(e2.con_iva, true);
    assert.strictEqual((await PI._internos.calcularEntrada(e2)).fila.total, 11000);
    await PI.anular({ prescriptorId: 'p-1', id: conIva.id });
  });
  await prueba('lo ajeno → 404 (obtener, actualizar, anular)', async () => {
    await rechaza(PI.obtener('p-1', PRESU_AJENO), 404);
    await rechaza(PI.actualizar({ prescriptorId: 'p-1', id: PRESU_AJENO, entrada: ENTRADA() }), 404);
    await rechaza(PI.anular({ prescriptorId: 'p-1', id: PRESU_AJENO }), 404);
  });
  await prueba('anular libera el nº; uno anulado ya no se edita', async () => {
    const t = await PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '90/26' }) });
    await PI.anular({ prescriptorId: 'p-1', id: t.id });
    await rechaza(PI.actualizar({ prescriptorId: 'p-1', id: t.id, entrada: ENTRADA({ numero: '90/26' }) }), 409, 'ANULADO');
    const otra = await PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '90/26' }) });
    assert.strictEqual(otra.numero, '90/26');
    await PI.anular({ prescriptorId: 'p-1', id: otra.id });
  });
  await prueba('listar: solo los suyos, la forma del contrato y sin el JSONB entero', async () => {
    const l = await PI.listar('p-1');
    assert.ok(l.length >= 2 && l.every(p => p.id !== PRESU_AJENO));
    const p = l.find(x => x.id === creado.id);
    assert.deepStrictEqual(Object.keys(p).sort(), ['base', 'cliente', 'estado', 'fecha', 'id', 'municipio', 'numero', 'obra', 'origen', 'resumen', 'simulacion', 'total'].sort());
    assert.ok(/^ANTONIO GONZ[AÁ]LEZ CARRETERO$/i.test(p.cliente), p.cliente);
    assert.ok(/Panasonic/i.test(p.resumen), p.resumen);
  });
  await prueba('BD caída → 503', async () => {
    FALLA = 'instalador_presupuestos';
    try { await rechaza(PI.listar('p-1'), 503); await rechaza(PI.obtener('p-1', creado.id), 503); } finally { FALLA = null; }
  });

  console.log('— El PDF (real)');
  await prueba('hoja GENÉRICA (sin plantilla): abre, una página, «PRESUPUESTO», el nº, el cliente y los totales', async () => {
    ESCRITO = [];
    const fila = await PI.obtener('p-1', creado.id);
    const r = await PI.pdfDe('p-2', { ...fila, numero: '40/26' });
    const doc = await pdfLib.PDFDocument.load(r.buffer);
    assert.strictEqual(doc.getPageCount(), 1); assert.strictEqual(doc.getTitle(), 'Presupuesto 40/26');
    const t = ESCRITO.join(' | ');
    for (const x of ['PRESUPUESTO', 'Nº 40/26', 'OTRO INSTALADOR', 'Antonio González Carretero', 'NIF: 00000000T', '9.500,00 €', '11.495,00 €', 'Validez del presupuesto: 30 días.']) assert.ok(t.includes(x), `falta «${x}»`);
    assert.strictEqual(r.desborda, false);
  });
  await prueba('hoja genérica: 14 líneas largas → desborda; un nº de 30 caracteres se encoge y cabe; uno imposible → numeroLargo', async () => {
    const lineas = Array.from({ length: 14 }, (_, i) => ({ texto: 'CONCEPTO MUY LARGO '.repeat(30), cantidad: 1, precio: i ? null : 1, importe: i ? 0 : 1 }));
    const r = await PI.pdfDe('p-2', { numero: 'X'.repeat(30), fecha: '2026-11-22', lineas, base: 1, iva: 0.21, total: 1.21, iva_pct: 21, cliente: { nombre: 'A' } });
    assert.strictEqual(r.desborda, true); assert.strictEqual(r.numeroLargo, false);
    const l = await PI.pdfDe('p-2', { numero: 'X'.repeat(60), fecha: '2026-11-22', lineas: lineas.slice(0, 1), base: 1, iva: 0.21, total: 1.21, iva_pct: 21, cliente: { nombre: 'A' } });
    assert.strictEqual(l.numeroLargo, true);
  });
  await prueba('texto que Helvetica no sabe escribir (emoji, comillas raras) no rompe la hoja', async () => {
    const r = await PI.pdfDe('p-2', { numero: '1/26', fecha: '2026-11-22', notas: 'Ojo 🔥 «comillas» ‘simples’ — guión', lineas: [{ texto: 'EQUIPO ✓ NUEVO', cantidad: 1, precio: 10, importe: 10 }], base: 10, iva: 2.1, total: 12.1, iva_pct: 21, cliente: { nombre: 'B' } });
    assert.ok(r.buffer.length > 1000);
  });
  if (FUENTE) {
    await prueba('con SU plantilla: su fondo de PRESUPUESTO (no el de la factura), el nº y el título', async () => {
      ESCRITO = [];
      const fila = await PI.obtener('p-1', creado.id);
      const r = await PI.pdfDe('p-1', fila);
      const doc = await pdfLib.PDFDocument.load(r.buffer);
      const { width, height } = doc.getPage(0).getSize();
      assert.deepStrictEqual([width, height], [595, 842], 'no usó fondo_presupuesto.pdf');
      assert.strictEqual(doc.getTitle(), 'Presupuesto 40/26');
      const t = ESCRITO.join(' | ');
      for (const x of ['40/26', '22 de noviembre de 2026', 'EL PRESUPUESTO NO INCLUYE LA ALIMENTACIÓN ELÉCTRICA.', 'VALIDEZ DEL PRESUPUESTO: 30 DÍAS']) assert.ok(t.includes(x), `falta «${x}» en ${t.slice(0, 300)}`);
      assert.ok(!/INMUEBLE|REF\. CATASTRAL|IRPF/i.test(t), 'lleva lo de la factura');
    });
    await prueba('la FACTURA con la misma plantilla sigue en su fondo (no cambia)', async () => {
      const pl = await fis.plantillaDe('p-1');
      const r = await fis.componerPdf(pl, { clienteNombre: 'A', clienteDomicilio: [] }, { numero: '1/26', fechaTxt: 'x', lineas: [{ texto: 'X', cantidad: 1, precio: 1, importe: 1 }], base: 1, iva: 0.21, total: 1.21 });
      const doc = await pdfLib.PDFDocument.load(r.buffer);
      assert.deepStrictEqual(Object.values(doc.getPage(0).getSize()).map(Math.round), [595, 842]);
      assert.notStrictEqual(doc.getPage(0).getSize().width, 595);
      assert.ok(/^Factura/.test(doc.getTitle()));
    });
  }

  // ── Las rutas ──────────────────────────────────────────────────────────────
  const express = require(path.join(B, 'node_modules/express'));
  const app = express(); app.use(express.json());
  app.use('/api/instalador-app', require(path.join(B, 'routes/instaladorApp')));
  const srv = app.listen(0);
  await new Promise(r => srv.once('listening', r));
  const base = `http://127.0.0.1:${srv.address().port}/api/instalador-app`;
  const pide = async (quien, metodo, ruta, body) => {
    const h = quien ? { Authorization: 'Bearer tok-' + quien } : {};
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const r = await fetch(base + ruta, { method: metodo, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const buf = Buffer.from(await r.arrayBuffer());
    let js = null; if (/json/.test(r.headers.get('content-type') || '')) js = JSON.parse(buf.toString('utf8'));
    return { status: r.status, h: r.headers, js, buf };
  };
  const PROHIBIDO = /drive\.google|docs\.google|googleusercontent|d-presu-123456|"(vinculo|driveId|creado_por|margen|comision|token)"/i;

  console.log('— Rutas');
  await prueba('sin sesión → 401 (listado, nuevo, vista previa, crear, pdf, whatsapp)', async () => {
    for (const [m, r] of [['GET', '/presupuestos'], ['GET', '/presupuestos/nuevo'], ['POST', '/presupuestos/vista-previa'], ['POST', '/presupuestos'],
      ['GET', `/presupuestos/${creado.id}/pdf`], ['POST', `/presupuestos/${creado.id}/whatsapp`]]) {
      assert.strictEqual((await pide(null, m, r, m === 'POST' ? {} : undefined)).status, 401, `${m} ${r}`);
    }
  });
  await prueba('GET /presupuestos: los suyos, sin enlaces ni claves internas', async () => {
    const r = await pide('rca', 'GET', '/presupuestos');
    assert.strictEqual(r.status, 200);
    assert.ok(r.js.presupuestos.length && r.js.presupuestos.every(p => p.id !== PRESU_AJENO));
    assert.ok(!PROHIBIDO.test(JSON.stringify(r.js)));
  });
  await prueba('GET /presupuestos/nuevo?obra=: cliente, dirección, equipo previsto y caldera de SU obra; la ajena → 404', async () => {
    const r = await pide('rca', 'GET', '/presupuestos/nuevo?obra=26RES060_OP902');
    assert.strictEqual(r.status, 200, JSON.stringify(r.js));
    const o = r.js;
    assert.strictEqual(o.cliente.id, U(6)); assert.strictEqual(o.obra.direccion, 'C/ MURCIA 2');
    assert.deepStrictEqual([o.obra.equipo.marca, o.obra.equipo.modelo, o.obra.equipo.potencia_kw, o.obra.caldera.combustible], ['PANASONIC', 'WH-WXG09ME5', 9, 'gasoleo']);
    assert.ok(o.conceptos.length >= 2 && /PANASONIC/.test(o.conceptos[0]));
    assert.ok(o.extras.every(e => typeof e.texto === 'string'));
    assert.strictEqual(o.con_plantilla, !!FUENTE); assert.strictEqual(o.validez_dias, 30);
    for (const k of ['numero', 'fecha', 'iva_pct', 'notas', 'emisor', 'tipos', 'combustibles']) assert.ok(k in o, k);
    assert.strictEqual((await pide('rca', 'GET', '/presupuestos/nuevo?obra=26RES060_OP901')).status, 404);
    assert.strictEqual((await pide('rca', 'GET', `/presupuestos/nuevo?cliente=${U(7)}`)).status, 404);
  });
  let porRuta;
  await prueba('POST /presupuestos → 201; el prescriptor_id del cuerpo se ignora (lo pone la sesión)', async () => {
    const r = await pide('rca', 'POST', '/presupuestos', { ...ENTRADA({ numero: '41/26', cliente_id: U(6), cliente: undefined }), prescriptor_id: 'p-2', origen: 'interno', estado: 'ANULADO' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.js));
    porRuta = r.js.presupuesto;
    const fila = DB.instalador_presupuestos.find(x => x.id === porRuta.id);
    assert.deepStrictEqual([fila.prescriptor_id, fila.origen, fila.estado], ['p-1', 'app', 'EMITIDO']);
    assert.ok(/Hola Pilar/.test(porRuta.mensaje), porRuta.mensaje);
  });
  await prueba('POST con nº repetido → 409 con sugerido; con errores → 400 con la lista', async () => {
    const r = await pide('rca', 'POST', '/presupuestos', ENTRADA({ numero: '41/26', cliente_id: U(6), cliente: undefined }));
    assert.strictEqual(r.status, 409); assert.strictEqual(r.js.code, 'NUMERO_REPETIDO'); assert.ok(r.js.sugerido);
    const m = await pide('rca', 'POST', '/presupuestos', ENTRADA({ numero: '99/26', total: '' }));
    assert.strictEqual(m.status, 400); assert.ok(Array.isArray(m.js.errores) && m.js.errores.length);
  });
  await prueba('GET /presupuestos/:id → { presupuesto, entrada }; el de otro instalador → 404', async () => {
    const r = await pide('rca', 'GET', `/presupuestos/${porRuta.id}`);
    assert.strictEqual(r.status, 200); assert.ok(r.js.presupuesto && r.js.entrada);
    assert.strictEqual(r.js.entrada.numero, '41/26');
    assert.strictEqual((await pide('rca', 'GET', `/presupuestos/${PRESU_AJENO}`)).status, 404);
    assert.strictEqual((await pide('otro', 'GET', `/presupuestos/${porRuta.id}`)).status, 404);
    assert.strictEqual((await pide('otro', 'GET', `/presupuestos/${PRESU_AJENO}`)).status, 200);
  });
  await prueba('PUT y anular de lo ajeno → 404', async () => {
    assert.strictEqual((await pide('otro', 'PUT', `/presupuestos/${porRuta.id}`, ENTRADA())).status, 404);
    assert.strictEqual((await pide('otro', 'POST', `/presupuestos/${porRuta.id}/anular`, {})).status, 404);
    assert.strictEqual(DB.instalador_presupuestos.find(x => x.id === porRuta.id).estado, 'EMITIDO');
  });
  await prueba('vista previa: el PDF, sus cabeceras, y NO guarda nada (ni presupuesto ni cliente)', async () => {
    const antes = [DB.instalador_presupuestos.length, DB.clientes.length];
    const r = await pide('rca', 'POST', '/presupuestos/vista-previa', ENTRADA({ numero: '', cliente: { nombre: 'Medio Tecleado' } }));
    assert.strictEqual(r.status, 200); assert.strictEqual(r.h.get('content-type'), 'application/pdf');
    assert.strictEqual(r.buf.slice(0, 5).toString(), '%PDF-');
    assert.ok(['0', '1'].includes(r.h.get('x-presupuesto-desborda')) && ['0', '1'].includes(r.h.get('x-presupuesto-numero-largo')));
    assert.deepStrictEqual([DB.instalador_presupuestos.length, DB.clientes.length], antes);
    assert.strictEqual((await pide('rca', 'POST', '/presupuestos/vista-previa', ENTRADA({ cliente_id: U(7), cliente: undefined }))).status, 404);
  });
  await prueba('GET /:id/pdf?descargar=1 → adjunto «Presupuesto 41-26 - …pdf»', async () => {
    const r = await pide('rca', 'GET', `/presupuestos/${porRuta.id}/pdf?descargar=1`);
    assert.strictEqual(r.status, 200);
    assert.ok(/^attachment;.*Presupuesto 41-26 - Pilar Nieto\.pdf/.test(r.h.get('content-disposition')), r.h.get('content-disposition'));
    assert.strictEqual((await pide('rca', 'GET', `/presupuestos/${PRESU_AJENO}/pdf`)).status, 404);
  });
  await prueba('WhatsApp: al teléfono de SU ficha (el del usuario), nunca al del cuerpo; documento con el mensaje y la burbuja después', async () => {
    WA.length = 0;
    const r = await pide('rca', 'POST', `/presupuestos/${porRuta.id}/whatsapp`, { tlf: '611222333', telefono: '611222333', a: '611222333' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.js)); assert.deepStrictEqual(r.js, { ok: true, a: '···597' });
    assert.strictEqual(WA.length, 1);
    assert.strictEqual(WA[0].tlf.replace(/\D/g, '').slice(-9), '699000597');
    assert.strictEqual(WA[0].media.mimetype, 'application/pdf'); assert.ok(/^Presupuesto 41-26/.test(WA[0].media.filename));
    assert.ok(/Hola Pilar/.test(WA[0].op.caption)); assert.strictEqual(WA[0].op.splitCaption, false);
    assert.ok(/Reenvíaselo/.test(WA[0].op.textoDespues));
  });
  await prueba('WhatsApp: sin móvil del usuario → el del responsable de la empresa; sin WhatsApp → 409', async () => {
    WA.length = 0;
    const r = await pide('otro', 'POST', `/presupuestos/${PRESU_AJENO}/whatsapp`, {});
    assert.strictEqual(r.status, 200); assert.strictEqual(WA[0].tlf, '926999888');
    WA_LISTO = false;
    try {
      const n = await pide('rca', 'POST', `/presupuestos/${porRuta.id}/whatsapp`, {});
      assert.strictEqual(n.status, 409); assert.strictEqual(n.js.code, 'WHATSAPP_NO_DISPONIBLE');
    } finally { WA_LISTO = true; }
    assert.strictEqual((await pide('rca', 'POST', `/presupuestos/${PRESU_AJENO}/whatsapp`, {})).status, 404);
  });
  await prueba('vincular a SU obra: oportunidad_id, PDF a DOC_PRESUPUESTO, nota en el historial; idempotente; sin Drive en la respuesta', async () => {
    SUBIDAS.length = 0; AVISOS.length = 0;
    const r = await pide('rca', 'POST', `/presupuestos/${porRuta.id}/vincular`, { obra: '26RES060_OP902' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.js));
    assert.strictEqual(r.js.presupuesto.vinculado, true); assert.strictEqual(r.js.presupuesto.obra.oportunidad, '26RES060_OP902');
    assert.ok(!PROHIBIDO.test(JSON.stringify(r.js)), JSON.stringify(r.js));
    const fila = DB.instalador_presupuestos.find(x => x.id === porRuta.id);
    assert.strictEqual(fila.oportunidad_id, OP902); assert.strictEqual(fila.obra.vinculo.driveId, 'd-presu-123456');
    assert.strictEqual(SUBIDAS.length, 1); assert.strictEqual(SUBIDAS[0].slotDef.key, 'DOC_PRESUPUESTO'); assert.strictEqual(SUBIDAS[0].archivos[0].mimetype, 'application/pdf');
    const op = DB.oportunidades.find(o => o.id === OP902);
    const notas = op.datos_calculo.historial.filter(h => /Presupuesto 41\/26 de RCA INSTALACIONES hecho en la app: 9\.200,00 € \+ IVA = 11\.132,00 €/.test(h.texto));
    assert.strictEqual(notas.length, 1, JSON.stringify(op.datos_calculo.historial));
    assert.ok(op.datos_calculo.inputs.presupuestos_leidos && op.datos_calculo.inputs.presupuesto === undefined, 'tocó inputs.presupuesto');
    const otra = await pide('rca', 'POST', `/presupuestos/${porRuta.id}/vincular`, { obra: '26RES060_OP902' });
    assert.strictEqual(otra.status, 200); assert.strictEqual(SUBIDAS.length, 1);
    assert.strictEqual(DB.oportunidades.find(o => o.id === OP902).datos_calculo.historial.filter(h => /41\/26/.test(h.texto)).length, 1);
    // Y el detalle de la ficha lo dice en la fila del presupuesto.
    const presuApp = await PI.ligadoAObra('p-1', OP902);
    const A = require(path.join(B, 'utils/appInstalador'));
    const fil = A.caminoDeObra({ paso: 1, quien: 'nos', conExpediente: false, presupuesto: {}, presupuestoApp: presuApp }).filas.find(f => f.key === 'presupuesto');
    assert.strictEqual(fil.detalle, 'Presupuesto 41/26 · 11.132,00 €');
  });
  await prueba('vincular a una obra AJENA o sin obra → 404 / 400', async () => {
    const t = await PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '55/26' }) });
    assert.strictEqual((await pide('rca', 'POST', `/presupuestos/${t.id}/vincular`, { obra: '26RES060_OP901' })).status, 404);
    assert.strictEqual((await pide('rca', 'POST', `/presupuestos/${t.id}/vincular`, {})).status, 400);
    assert.strictEqual((await pide('otro', 'POST', `/presupuestos/${t.id}/vincular`, { obra: '26RES060_OP901' })).status, 404);
  });
  await prueba('anular por la ruta → { ok: true }', async () => {
    const t = await PI.crear({ prescriptorId: 'p-1', entrada: ENTRADA({ numero: '66/26' }) });
    const r = await pide('rca', 'POST', `/presupuestos/${t.id}/anular`, {});
    assert.deepStrictEqual([r.status, r.js], [200, { ok: true }]);
  });
  await prueba('BD caída → 503 por la ruta', async () => {
    FALLA = 'instalador_presupuestos';
    try { assert.strictEqual((await pide('rca', 'GET', '/presupuestos')).status, 503); } finally { FALLA = null; }
  });

  srv.close();
  fs.rmSync(DIR, { recursive: true, force: true });
  console.log(`\n${n - fallos}/${n} correctas (Supabase, Drive y WhatsApp simulados: ninguna escritura ni envío real)`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
