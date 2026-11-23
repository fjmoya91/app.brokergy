// test_presupuesto_pasos.mjs — los PASOS del presupuesto del instalador y su selector de EQUIPO
// (22/11/2026). Puro: importa `logic/presupuestoApp.js` y mira que la pantalla siga montada con él.
//   node implementation/backend/scripts/test_presupuesto_pasos.mjs
import fs from 'fs';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const raizFront = path.join(aqui, '../../frontend');
const front = (p) => pathToFileURL(path.join(raizFront, 'src', p)).href;
const pa = await import(front('features/instalador/logic/presupuestoApp.js'));
const { calcularPresupuesto } = await import(front('features/instalador/logic/presupuesto.js'));

let ok = 0; let mal = 0;
const t = (nombre, cond, extra = '') => { if (cond) ok += 1; else { mal += 1; console.log(`✗ ${nombre}${extra ? ` — ${extra}` : ''}`); } };
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const calcDe = (f) => { const e = pa.entradaDe(f); return calcularPresupuesto(e); };

const cli = { id_cliente: 'c-1', nombre_razon_social: 'LUCÍA', apellidos: 'PRADO', tlf: '600000001', direccion: 'C/ Las Eras, 14', codigo_postal: '13000', municipio: 'VILLANUEVA' };
const opciones = { numero: '42/26', fecha: '2026-11-22', iva_pct: 21, validez_dias: 30, obra: { tipo: 'aerotermia', caldera: { combustible: 'gasoleo' } } };

// ── Los pasos ───────────────────────────────────────────────────────────────
const f0 = pa.estadoInicial({ opciones });
t('seis pasos en aerotermia', igual(pa.pasosDe(f0), ['cliente', 'obra', 'equipo', 'incluye', 'precio', 'datos']));
t('«otra obra» no tiene equipo', !pa.pasosDe({ ...f0, obra: { ...f0.obra, tipo: 'otro' } }).includes('equipo'));
const l0 = pa.pasosListos(f0, { calc: calcDe(f0) });
t('nuevo sin cliente: el cliente falta', l0.cliente === false);
t('nuevo: el nº y la fecha ya vienen', l0.datos === true);
t('nuevo: sin precio', l0.precio === false);
t('nuevo: se abre el cliente', pa.pasoInicial(f0, 'nuevo', l0) === 'cliente');
const f1 = pa.estadoInicial({ opciones, cliente: cli });
const l1 = pa.pasosListos(f1, { calc: calcDe(f1) });
t('desde su ficha: el cliente está y la obra (misma dirección) también', l1.cliente && l1.obra);
t('desde su ficha: se abre el primero que falta (el equipo, sin catálogo: a mano)', pa.pasoInicial(f1, 'nuevo', l1) === 'equipo');
t('cambiando uno hecho: todo cerrado', pa.pasoInicial(f1, 'editar', l1) === null);
t('otro igual: se abre el cliente', pa.pasoInicial(f1, 'duplicar', l1) === 'cliente');
t('sin dirección del cliente, la obra falta', pa.pasosListos({ ...f1, cliente: { ...f1.cliente, direccion: '' } }, {}).obra === false);
t('«otra obra» sin describir falta', pa.pasosListos({ ...f1, obra: { ...f1.obra, tipo: 'otro', descripcion: '' } }, {}).obra === false);
// Seguir: el siguiente que no esté hecho (visto y listo)
const vistos = new Set(['cliente', 'datos']);
t('seguir desde el cliente → la obra', pa.siguientePaso(f1, 'cliente', { vistos, listos: l1 }) === 'obra');
const fPrecio = { ...f1, total: '9200' };
const lP = pa.pasosListos(fPrecio, { calc: calcDe(fPrecio) });
t('con precio, el precio está', lP.precio === true);
t('seguir desde el precio, con el nº visto → ninguno (a guardar)', pa.siguientePaso(fPrecio, 'precio', { vistos: new Set(['cliente', 'obra', 'equipo', 'incluye', 'precio', 'datos']), listos: lP }) === null);
t('seguir no se salta lo que incluye si no se ha visto', pa.siguientePaso(fPrecio, 'equipo', { vistos: new Set(['cliente', 'obra', 'equipo', 'datos']), listos: lP }) === 'incluye');
// Errores del servidor → su paso
t('nº repetido → número y fecha', pa.pasoDeCampo('numero', f1) === 'datos');
t('precio → el precio', pa.pasoDeCampo('precio', f1) === 'precio');
t('dirección de un cliente nuevo en su misma casa → el cliente', pa.pasoDeCampo('direccion', { clienteModo: 'nuevo', misma: true }) === 'cliente');
t('dirección con cliente elegido → la obra', pa.pasoDeCampo('direccion', { clienteModo: 'elegido', misma: false }) === 'obra');
t('las líneas → lo que incluye', pa.pasoDeCampo('conceptos', f1) === 'incluye');

// ── Los resúmenes de cada paso cerrado ───────────────────────────────────────
const eur = (n) => `${n.toFixed(2)} €`;
const r = pa.resumenesDe({ ...fPrecio, obra: { ...fPrecio.obra, acs: true } }, { calc: calcDe(fPrecio), eur, tel: (s) => `[${s}]` });
t('cliente: nombre, teléfono (formateado) y pueblo', r.cliente === 'Lucía Prado · [600000001] · Villanueva', r.cliente);
t('obra: lo que es y dónde', /^Aerotermia · quita caldera de gasóleo · radiadores · con agua caliente · C\/ Las Eras, 14, Villanueva$/.test(r.obra), r.obra);
t('precio: total con IVA', r.precio === '11132.00 € con IVA (21 %)', r.precio);
t('datos: nº, fecha y validez', r.datos === 'Nº 42/26 · 22/11/2026 · vale 30 días', r.datos);
t('sin cliente: «Sin elegir»', pa.resumenesDe(f0, {}).cliente === 'Sin elegir');

// ── El equipo: catálogo, a mano o genérico ───────────────────────────────────
t('modo: con id del catálogo → catálogo', pa.modoEquipoDe({ aerotermia_id: 101 }) === 'catalogo');
t('modo: marca escrita → a mano', pa.modoEquipoDe({ marca: 'X' }) === 'mano');
t('modo: vacío al empezar → sin decir', pa.modoEquipoDe({}) === null);
t('modo: vacío en uno guardado → genérico', pa.modoEquipoDe({}, true) === 'generico');
t('estado inicial de uno guardado sin marca: genérico', pa.estadoInicial({ entrada: { obra: { tipo: 'aerotermia', equipo: {} } } }).equipoModo === 'generico');
t('visible: sin decir y con catálogo → catálogo', pa.modoEquipoVisible(f0, true) === 'catalogo');
t('visible: sin decir y sin catálogo → a mano', pa.modoEquipoVisible(f0, false) === 'mano');
t('visible: catálogo en agua caliente → a mano (el catálogo es de aerotermia)', pa.modoEquipoVisible({ ...f0, equipoModo: 'catalogo', obra: { ...f0.obra, tipo: 'acs' } }, true) === 'mano');
t('genérico: el paso del equipo está', pa.pasosListos({ ...f0, equipoModo: 'generico' }, {}).equipo === true);
t('catálogo sin elegir: el equipo falta', pa.pasosListos({ ...f0, equipoModo: 'catalogo' }, { hayCatalogo: true }).equipo === false);
t('genérico: la línea sale sin marca ni modelo', !/MARCA|MODELO/.test(pa.entradaDe({ ...f0, equipoModo: 'generico' }).conceptos[0]));
t('el modo no viaja a la API', !('equipoModo' in pa.entradaDe({ ...f0, equipoModo: 'generico' })));
const CAT = [
    { id: 101, marca: 'MARCA A', nombre: 'Aire-agua Serie Uno 8', ref: 'MA-U8-M1', potencia_kw: 8, referencias: {} },
    { id: 102, marca: 'MARCA A', nombre: 'Aire-agua Serie Uno 12', ref: 'MA-U12-M1', potencia_kw: 12, referencias: {} },
    { id: 104, marca: 'Marca B', nombre: 'Compacta 6', ref: 'MB-C6', potencia_kw: 6, referencias: { interior: 'MB-HYD' } },
    { id: 105, marca: 'MARCA B', nombre: 'Compacta 16 trifásica', ref: 'MB-C16-T', potencia_kw: 16, referencias: {} },
];
const ids = (l) => l.map((x) => x.id);
t('filtrar: todo, por marca y potencia', igual(ids(pa.filtrarEquipos(CAT)), [101, 102, 104, 105]));
t('filtrar por marca (sin mayúsculas)', igual(ids(pa.filtrarEquipos(CAT, { marca: 'marca b' })), [104, 105]));
t('filtrar por modelo', igual(ids(pa.filtrarEquipos(CAT, { q: 'serie 12' })), [102]));
t('filtrar por kW («8 kw»)', igual(ids(pa.filtrarEquipos(CAT, { q: '8 kw' })), [101]));
t('filtrar sin tildes', igual(ids(pa.filtrarEquipos(CAT, { q: 'trifasica' })), [105]));
t('filtrar por la referencia interior', igual(ids(pa.filtrarEquipos(CAT, { q: 'mb-hyd' })), [104]));
t('marca + búsqueda', igual(ids(pa.filtrarEquipos(CAT, { marca: 'MARCA A', q: 'compacta' })), []));
t('del catálogo: la potencia del equipo nuevo, con coma', igual(pa.equipoDelCatalogo({ id: 9, marca: 'M', nombre: 'N', ref: 'R1', potencia_kw: 7.5 }), { aerotermia_id: 9, marca: 'M', modelo: 'R1', potencia_kw: '7,5' }));
t('del catálogo sin ref: el nombre', pa.equipoDelCatalogo({ id: 9, marca: 'M', nombre: 'N' }).modelo === 'N');

// ── La pantalla sigue montada así ────────────────────────────────────────────
const form = fs.readFileSync(path.join(raizFront, 'src/features/instalador/views/PresupuestoForm.jsx'), 'utf8');
t('el formulario usa los pasos y el selector', /pasosListos\(/.test(form) && /<ElegirEquipo/.test(form) && /CSS_PRESUPUESTO/.test(form));
// Ningún hook por debajo del primer `return` condicional (regla 62; lo mira también el build).
const cuerpo = form.slice(form.indexOf('export function PresupuestoForm'));
const primerReturn = cuerpo.indexOf('if (falloCarga) return');
t('ningún hook tras el primer return', !/\buse(State|Effect|Memo|Ref|Callback|LayoutEffect)\(/.test(cuerpo.slice(primerReturn, cuerpo.indexOf('\nfunction Volver'))));
const elegir = fs.readFileSync(path.join(raizFront, 'src/features/instalador/views/ElegirEquipo.jsx'), 'utf8');
t('el selector: catálogo, otro modelo y genérico', /'catalogo'/.test(elegir) && /'mano'/.test(elegir) && /'generico'/.test(elegir));
t('el selector: elegido con Cambiar y Quitar', />\{cambiando \? 'Dejarlo' : 'Cambiar'\}</.test(elegir) && />Quitar</.test(elegir));

// ── Borrar (23/11/2026): deslizar en la lista y el botón de la ficha, siempre con su popup ──
const vista = fs.readFileSync(path.join(raizFront, 'src/features/instalador/views/PresupuestosView.jsx'), 'utf8');
const desliza = fs.readFileSync(path.join(raizFront, 'src/features/instalador/ui/FilaDeslizable.jsx'), 'utf8');
const app = fs.readFileSync(path.join(raizFront, 'src/features/instalador/AppInstalador.jsx'), 'utf8');
t('la API borra con DELETE /presupuestos/:id', /borrarPresupuesto:\s*\(id\)\s*=>\s*axios\.delete\(`\$\{B\}\/presupuestos\/\$\{e\(id\)\}`\)/.test(app));
t('la lista envuelve cada fila en FilaDeslizable y la papelera solo PIDE confirmar', /<FilaDeslizable[\s\S]*?onBorrar=\{\(\) => setABorrar\(p\)\}/.test(vista));
t('la lista y la ficha confirman con HojaBorrar antes de llamar a la API', (vista.match(/<HojaBorrar /g) || []).length === 2
    && (vista.match(/api\.borrarPresupuesto\(/g) || []).length === 2
    && /const siBorrar[\s\S]*?api\.borrarPresupuesto/.test(vista));
t('la ficha vuelve a la lista al cerrar el «borrado» (alCerrar)', /alCerrar: \(\) => \(onBorrado \|\| onVolver\)/.test(vista) && /onBorrado=\{/.test(app));
t('el popup avisa de que lo de su obra se queda', /se queda allí/.test(vista));
t('deslizar: solo con el dedo y el scroll vertical lo hace el navegador', /pointerType === 'mouse'/.test(desliza) && /touch-action:pan-y/.test(desliza));
t('deslizar: se abre pasada la mitad de la papelera', /desplazado < -ancho \/ 2 \? 'abierta' : 'cerrada'/.test(desliza));
t('la papelera escondida no se alcanza con el tabulador', /tabIndex=\{abierta \? 0 : -1\}/.test(desliza));
const cuerpoLista = vista.slice(vista.indexOf('export function PresupuestosView'), vista.indexOf('export function HojaBorrar'));
const primerRetLista = cuerpoLista.indexOf('\n    return (');
t('lista: ningún hook tras su return', !/\buse(State|Effect|Memo|Ref|Callback|Guardado)\(/.test(cuerpoLista.slice(primerRetLista)));

console.log(`\n${mal ? '✗' : '✓'} test_presupuesto_pasos: ${ok}/${ok + mal}`);
process.exit(mal ? 1 : 0);
