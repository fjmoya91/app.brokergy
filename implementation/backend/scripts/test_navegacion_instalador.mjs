/**
 * test_navegacion_instalador — la DIRECCIÓN y la MARCA de la app del instalador (fase 5).
 *
 *   node implementation/backend/scripts/test_navegacion_instalador.mjs
 *
 * Vigila `features/instalador/ui/direccion.js`:
 *   - recargar o abrir un enlace directo deja al instalador donde estaba (pantalla, obra, acción);
 *   - en la dirección viajan SOLO seis claves (la sexta, presupuesto, 22/11/2026) y nunca un dato personal: lo que no casa con su
 *     forma (un nombre con espacios, un correo, un DNI con letras raras, un token largo) se ignora
 *     al leer y no se escribe;
 *   - lo de quien nos aloja (`op`, los parámetros del banco) no se toca.
 * Y `ui/marca.js`: el color del instalador se usa solo si pasa AA (4.5:1) sobre los tres fondos
 * donde va; si no, se queda el de BROKERGY (null).
 * Y `ui/cabeceraApp.js` + `index.html`: el manifest del instalador NO está en la página de todos;
 * se pone solo al montar su app.
 * Sin red ni BD.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizFront = path.join(aqui, '../../frontend');
const front = (p) => pathToFileURL(path.join(raizFront, 'src', p)).href;
const dir = await import(front('features/instalador/ui/direccion.js'));
const marca = await import(front('features/instalador/ui/marca.js'));

let ok = 0; let mal = 0;
const t = (nombre, cond, extra = '') => {
    if (cond) { ok += 1; } else { mal += 1; console.log(`✗ ${nombre}${extra ? ` — ${extra}` : ''}`); }
};
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── leerDireccion ────────────────────────────────────────────────────────────
const L = dir.leerDireccion;
t('vacía → inicio', igual(L(''), { seccion: 'inicio', obra: null, accion: null, cliente: null, equipo: null, presupuesto: null }));
t('sección válida', L('?seccion=clientes').seccion === 'clientes');
t('sección desconocida → inicio', L('?seccion=ajustes').seccion === 'inicio');
t('obra manda sobre la sección', igual(L('?seccion=clientes&obra=26RES060_OP901'), { seccion: 'obras', obra: '26RES060_OP901', accion: null, cliente: null, equipo: null, presupuesto: null }));
t('obra + acción válida', L('?obra=26RES060_187&accion=cifo').accion === 'cifo');
t('la propuesta es una acción de la obra (también sin expediente)', L('?obra=26RES060_OP279&accion=propuesta').accion === 'propuesta');
t('acción desconocida se ignora', L('?obra=26RES060_187&accion=borrar').accion === null);
t('acción sin obra se ignora', L('?accion=cifo').accion === null);
t('cliente → clientes', L('?cliente=8f2c1a90-1b2c-4d5e-9f00-123456789abc').seccion === 'clientes');
t('equipo → catálogo', L('?equipo=101').seccion === 'catalogo');
t('obra gana a cliente y equipo', L('?obra=X1&cliente=c1&equipo=101').cliente === null && L('?obra=X1&cliente=c1&equipo=101').equipo === null);
t('acepta URLSearchParams', L(new URLSearchParams('obra=26RES060_OP906')).obra === '26RES060_OP906');
// Lo que no casa con su forma (posibles datos personales) se ignora.
for (const [k, v] of [
    ['obra', 'Juan Pérez'], ['obra', 'juan@correo.es'], ['obra', 'x'.repeat(61)], ['obra', '<script>'],
    ['cliente', 'María López'], ['cliente', '12345678Z;drop'], ['cliente', 'a'.repeat(65)],
    ['equipo', 'Calle Mayor 3'], ['equipo', '1/2'],
]) {
    const r = L(`?${k}=${encodeURIComponent(v)}`);
    t(`${k}=«${v.slice(0, 20)}» se ignora`, r[k] === null && r.seccion === 'inicio');
}
t('espacios alrededor se recortan', L('?obra=%2026RES060_OP901%20').obra === '26RES060_OP901');

// ── clavesDe ─────────────────────────────────────────────────────────────────
const C = dir.clavesDe;
t('inicio no se escribe', igual(C({ seccion: 'inicio', ficha: null }), {}));
t('sección suelta', igual(C({ seccion: 'catalogo', ficha: null }), { seccion: 'catalogo' }));
t('sección rara no se escribe', igual(C({ seccion: 'admin', ficha: null }), {}));
t('ficha obra', igual(C({ seccion: 'inicio', ficha: { tipo: 'obra', obra: { id: '26RES060_OP901', cliente: 'Juan Pérez', municipio: 'Toledo' } } }), { seccion: 'obras', obra: '26RES060_OP901' }));
t('ficha obra + acción', igual(C({ seccion: 'obras', ficha: { tipo: 'obra', obra: { id: 'A1' }, accion: { accion: 'rite', doc: { nombre: 'x' } } } }), { seccion: 'obras', obra: 'A1', accion: 'rite' }));
t('acción desconocida no se escribe', igual(C({ seccion: 'obras', ficha: { tipo: 'obra', obra: { id: 'A1' }, accion: { accion: 'pagar' } } }), { seccion: 'obras', obra: 'A1' }));
t('ficha cliente: solo el id', igual(C({ seccion: 'clientes', ficha: { tipo: 'cliente', cliente: { id_cliente: 'c-1', nombre: 'Ana', dni: '1234Z', telefono: '600000000' } } }), { seccion: 'clientes', cliente: 'c-1' }));
t('ficha equipo', igual(C({ seccion: 'catalogo', ficha: { tipo: 'equipo', equipo: { id: 101, modelo: 'X' } } }), { seccion: 'catalogo', equipo: '101' }));
t('id con forma rara no se escribe', igual(C({ seccion: 'obras', ficha: { tipo: 'obra', obra: { id: 'Juan Pérez' } } }), { seccion: 'obras' }));
// Ida y vuelta: lo que se escribe se vuelve a leer igual.
for (const estado of [
    { seccion: 'obras', ficha: { tipo: 'obra', obra: { id: '26RES060_OP901' }, accion: { accion: 'factura' } } },
    { seccion: 'clientes', ficha: { tipo: 'cliente', cliente: { id_cliente: '8f2c1a90-1b2c' } } },
    { seccion: 'catalogo', ficha: { tipo: 'equipo', equipo: { id: 7 } } },
    { seccion: 'pagina', ficha: null },
]) {
    const claves = C(estado);
    const leido = L(`?${new URLSearchParams(claves)}`);
    t(`ida y vuelta ${claves.seccion}`, Object.entries(claves).every(([k, v]) => leido[k] === v));
}

// ── Los PRESUPUESTOS que hace el instalador (22/11/2026) ─────────────────────
const UUID = 'aaaaaaaa-0000-4000-8000-000000000040';
t('sección presupuestos', L('?seccion=presupuestos').seccion === 'presupuestos');
t('presupuesto → su sección', igual(L(`?presupuesto=${UUID}`), { seccion: 'presupuestos', obra: null, accion: null, cliente: null, equipo: null, presupuesto: UUID }));
t('presupuesto=nuevo (el formulario)', L('?presupuesto=nuevo').presupuesto === 'nuevo');
t('obra gana a presupuesto', L(`?obra=A1&presupuesto=${UUID}`).presupuesto === null);
for (const v of ['Juan Pérez', 'juan@correo.es', '12345678Z;x', 'C/ Mayor 3', 'a'.repeat(65)]) {
    const r = L(`?presupuesto=${encodeURIComponent(v)}`);
    t(`presupuesto=«${v.slice(0, 20)}» se ignora`, r.presupuesto === null && r.seccion === 'inicio');
}
t('ficha presupuesto: solo el id', igual(C({ seccion: 'presupuestos', ficha: { tipo: 'presupuesto', id: UUID, desde: { cliente: { nombre: 'Ana', dni: '1234Z' } } } }), { seccion: 'presupuestos', presupuesto: UUID }));
t('ficha presupuesto nuevo', igual(C({ seccion: 'inicio', ficha: { tipo: 'presupuesto', id: 'nuevo', desde: { obra: '26RES060_OP901' } } }), { seccion: 'presupuestos', presupuesto: 'nuevo' }));
t('cambiándolo, la misma dirección (la entrada no viaja)', igual(C({ seccion: 'presupuestos', ficha: { tipo: 'presupuesto', id: UUID, accion: { accion: 'editar', entrada: { cliente: { nombre: 'Ana' } } } } }), { seccion: 'presupuestos', presupuesto: UUID }));
for (const estado of [
    { seccion: 'presupuestos', ficha: null },
    { seccion: 'presupuestos', ficha: { tipo: 'presupuesto', id: UUID } },
    { seccion: 'inicio', ficha: { tipo: 'presupuesto', id: 'nuevo' } },
]) {
    const claves = C(estado);
    const leido = L(`?${new URLSearchParams(claves)}`);
    t(`ida y vuelta presupuesto ${claves.presupuesto || claves.seccion}`, Object.entries(claves).every(([k, v]) => leido[k] === v));
}

// ── presupuestoApp.js: formulario ↔ API, errores junto al campo, simulación ──
const pa = await import(front('features/instalador/logic/presupuestoApp.js'));
const cliFicha = { id_cliente: 'c-1', nombre_razon_social: 'LUCÍA', apellidos: 'PRADO', tlf: '600000001', dni: '00000000T', direccion: 'C/ Las Eras, 14', codigo_postal: '13000', municipio: 'VILLANUEVA' };
const opciones = { numero: '42/26', fecha: '2026-11-22', iva_pct: 21, notas: 'Nota', validez_dias: 30, obra: { tipo: 'aerotermia', equipo: { marca: 'M', modelo: 'X1' }, caldera: { combustible: 'gasoleo' } } };
const f0 = pa.estadoInicial({ opciones, cliente: cliFicha });
t('desde un cliente: elegido, con su id', f0.clienteModo === 'elegido' && f0.cliente_id === 'c-1');
t('número y fecha del servidor', f0.numero === '42/26' && f0.fecha === '2026-11-22');
const e0 = pa.entradaDe({ ...f0, total: '9.200,00' });
t('entrada con cliente_id (no el cliente entero)', e0.cliente_id === 'c-1' && !('cliente' in e0));
t('misma dirección: la obra lleva la del cliente', e0.obra.direccion === 'C/ Las Eras, 14' && e0.obra.codigo_postal === '13000');
t('las líneas salen solas', Array.isArray(e0.conceptos) && e0.conceptos.length > 0);
const fNuevo = { ...pa.estadoInicial({ opciones }), clienteModo: 'nuevo', cliente: { ...pa.CLIENTE_VACIO, nombre: 'Ana', tlf: '600' } };
const e1 = pa.entradaDe(fNuevo);
t('cliente nuevo: va el cliente, sin id', !('cliente_id' in e1) && e1.cliente.nombre === 'Ana');
const f2 = pa.estadoInicial({ entrada: { ...e0, conceptos: ['A MANO'] } });
t('líneas tocadas a mano se conservan al reabrir', igual(pa.conceptosVisibles(f2), ['A MANO']) && f2.conceptosMano !== null);
const err = (status, data) => ({ response: { status, data } });
const r409 = pa.erroresPorCampo(err(409, { code: 'NUMERO_REPETIDO', error: 'Ya tienes el 40/26', sugerido: '43/26' }));
t('409 número repetido → junto al número, con el sugerido', !!r409.numero && r409.sugerido === '43/26');
const r400 = pa.erroresPorCampo(err(400, { error: 'x', errores: ['Falta el nombre del cliente.', 'Falta el precio.'] }));
t('400 con errores → cada uno a su campo', !!r400.cliente && !!r400.precio);
t('sin respuesta → sin conexión (general)', pa.erroresPorCampo(new Error('net')).general.length === 1);
const sim = pa.simulacionDesde({ presupuesto: { id: 'p1', numero: '40/26', fecha: '2026-11-20', total: 11132, base: 9200, iva_pct: 21, cliente: { nombre: 'Lucía Prado', nif: '00000000T', tlf: '600000001' }, obra: { direccion: 'C/ Las Eras, 14', codigo_postal: '13000', municipio: 'Villanueva', equipo: { aerotermia_id: 101, marca: 'M', modelo: 'X1' } } }, entrada: e0 });
t('simulación: total con IVA, dirección y equipo', sim.total_con_iva === 11132 && sim.direccion === 'C/ Las Eras, 14, 13000 Villanueva' && sim.equipo.aerotermia_id === 101);
t('simulación: el cliente impreso (con DNI)', sim.cliente.nombre === 'Lucía Prado' && sim.cliente.dni === '00000000T');
t('simulación: sin funciones (viaja limpia)', !Object.values(sim).some((v) => typeof v === 'function'));
t('obra ligada: la del listado', pa.obraDelPresupuesto({ obra: '26RES060_OP902' }) === '26RES060_OP902');
t('obra ligada: el uuid no se toma por id de obra', pa.obraDelPresupuesto({ oportunidad_id: 'uuid-x' }) === null && pa.estaLigado({ oportunidad_id: 'uuid-x' }));

// ── «atrás» desde un presupuesto abierto desde otra ficha ────────────────────
const appSrc = fs.readFileSync(path.join(raizFront, 'src/features/instalador/AppInstalador.jsx'), 'utf8');
t('AppInstalador: la sección y las fichas de presupuesto', /seccion === 'presupuestos'/.test(appSrc) && /ficha\?\.tipo === 'presupuesto'/.test(appSrc));
t('AppInstalador: al crear la oportunidad se liga el presupuesto', /vincularPresupuesto\(/.test(appSrc));
const menu = fs.readFileSync(path.join(raizFront, 'src/features/instalador/MarcoInstalador.jsx'), 'utf8');
t('menú lateral con «Presupuestos»', /key: 'presupuestos'/.test(menu));

// ── urlCon ───────────────────────────────────────────────────────────────────
const U = dir.urlCon;
t('cambia solo nuestras claves', U('https://app.brokergy.es/?op=OP906&seccion=inicio&obra=X', { seccion: 'clientes' }) === '/?op=OP906&seccion=clientes');
t('quita las que ya no van', U('https://app.brokergy.es/?seccion=obras&obra=A1&accion=cifo', {}) === '/');
t('respeta parámetros del banco', U('http://localhost:5187/instalador-demo.html?sinred=1&marca=1', { seccion: 'obras', obra: 'A1' }) === '/instalador-demo.html?sinred=1&marca=1&seccion=obras&obra=A1');
t('conserva el hash', U('https://app.brokergy.es/?seccion=obras#x', { seccion: 'catalogo' }) === '/?seccion=catalogo#x');
t('nunca escribe claves ajenas', !U('https://app.brokergy.es/', { seccion: 'obras', nombre: 'Juan', token: 'abc' }).includes('Juan'));

// ── marca ────────────────────────────────────────────────────────────────────
const AA = 4.5;
t('contraste negro/blanco = 21', Math.abs(marca.contraste('#000000', '#ffffff') - 21) < 0.01);
t('contraste con basura = 0', marca.contraste('azul', '#ffffff') === 0);
t('sin color → null (BROKERGY)', marca.varsDeMarca(null) === null && marca.varsDeMarca('') === null);
t('color inválido → null', marca.varsDeMarca('rojo') === null);
for (const hex of ['#1565c0', '#ffd400', '#00ff00', '#ffffff', '#e30613', '#7cb342', '#000000', '#ff9800']) {
    const v = marca.varsDeMarca(hex);
    if (v === null) { t(`${hex}: o pasa AA o se queda BROKERGY`, true); continue; }
    const peor = Math.min(...marca.FONDOS_MARCA.map((f) => marca.contraste(v['--marca'], f)));
    t(`${hex} → ${v['--marca']} pasa AA en los tres fondos`, peor >= AA, `peor ${peor.toFixed(2)}`);
    t(`${hex}: --marca-rgb casa con --marca`, v['--marca-rgb'] === v['--marca'].slice(1).match(/../g).map((x) => parseInt(x, 16)).join(', '));
    t(`${hex}: fondo gris`, v['--marca-fondo'] === '#f1efeb');
}
t('un azul de marca se conserva (no cae a BROKERGY)', marca.varsDeMarca('#1565c0') !== null);
t('un amarillo claro se oscurece hasta AA (no cae a BROKERGY)', marca.varsDeMarca('#ffd400') !== null);

// ── cabecera: los demás usuarios no ven el manifest del instalador ───────────
const indexHtml = fs.readFileSync(path.join(raizFront, 'index.html'), 'utf8');
t('index.html no enlaza el manifest del instalador', !indexHtml.includes('/instalador/manifest'));
const cab = fs.readFileSync(path.join(raizFront, 'src/features/instalador/ui/cabeceraApp.js'), 'utf8');
t('la cabecera devuelve cómo deshacerse', /return\s*\(\)\s*=>|return function/.test(cab));
const app = fs.readFileSync(path.join(raizFront, 'src/features/instalador/AppInstalador.jsx'), 'utf8');
t('se pone SOLO al montar la app del instalador', /useEffect\(\(\)\s*=>\s*ponerCabeceraInstalador\(\),\s*\[\]\)/.test(app));
const usos = ['src/App.jsx', 'src/main.jsx'].filter((f) => fs.existsSync(path.join(raizFront, f)))
    .filter((f) => fs.readFileSync(path.join(raizFront, f), 'utf8').includes('ponerCabeceraInstalador'));
t('ni App.jsx ni main.jsx tocan la cabecera', usos.length === 0, usos.join(', '));
const man = JSON.parse(fs.readFileSync(path.join(raizFront, 'public/instalador/manifest.webmanifest'), 'utf8'));
t('manifest: standalone y crema', man.display === 'standalone' && man.background_color === '#faf9f7' && man.theme_color === '#faf9f7');
t('manifest: iconos existen', man.icons.every((i) => fs.existsSync(path.join(raizFront, 'public', i.src.replace(/^\//, '')))));
t('manifest: con icono maskable', man.icons.some((i) => /maskable/.test(i.purpose || '')));
t('manifest: start_url sin datos personales', !/obra=|cliente=|token|@/.test(man.start_url));
t('sin service worker', !fs.existsSync(path.join(raizFront, 'public/instalador/sw.js')) && !/serviceWorker\.register/.test(cab));

console.log(`\n${mal ? '✗' : '✓'} test_navegacion_instalador: ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
