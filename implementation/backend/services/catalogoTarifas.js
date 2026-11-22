// ─── Catálogo de aerotermia con TARIFAS (app del instalador, fase 4) ──────────
//
// Lo COMÚN de las dos caras:
//   · la carga del Excel del equipo interno (routes/aerotermiaTarifas.js): leer el
//     .xlsx, casar cada fila con un modelo del catálogo y decir qué cambia;
//   · el Catálogo del instalador (routes/instaladorApp.js, bloque «FASE 4»): qué
//     marcas ve, la tarifa VIGENTE de cada modelo y cómo se le enseña un equipo.
//
// REGLA — el Excel NUNCA crea un modelo: una fila que no casa con UNO solo del
// catálogo (por marca y por una de sus referencias: comercial, conjunto o unidad
// exterior) no se carga y se lista para resolverla a mano.
// Ver docs/conocimiento/instalador-app/app-del-instalador-fase-4.md.
const crypto = require('crypto');

const MAX_BYTES = 5 * 1024 * 1024;   // un Excel de tarifas pesa KB; 5 MB es de sobra
const MAX_FILAS = 5000;
const REFS = ['modelo_comercial', 'modelo_conjunto', 'modelo_ud_exterior'];

class ErrorExcel extends Error {
    constructor(code, message) { super(message); this.code = code; }
}

/** Para casar: sin tildes, en mayúsculas y solo letras y dígitos («wh-wdg 12» → «WHWDG12»). */
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const r2 = (n) => Math.round(n * 100) / 100;

/** Un precio de una celda: número, o texto «4.650,00 €», «4650.5», «4,650.00». null si no vale. */
function precioDe(v) {
    if (v == null || v === '') return null;
    let n;
    if (typeof v === 'number') n = v;
    else {
        let s = String(v).replace(/[€\s]|EUR/gi, '');
        if (!/^-?[\d.,]+$/.test(s)) return null;
        const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.');
        if (coma >= 0 && punto >= 0) s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        else if (coma >= 0) s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        n = Number(s);
    }
    if (!Number.isFinite(n) || n <= 0 || n >= 1e6) return null;
    return r2(n);
}

/** El valor de una celda de exceljs (texto enriquecido, fórmula, enlace…). */
function valorCelda(v) {
    if (v == null) return null;
    if (typeof v === 'object') {
        if (v instanceof Date) return v.toISOString().slice(0, 10);
        if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
        if ('result' in v) return valorCelda(v.result);
        if ('text' in v) return valorCelda(v.text);
        return null;
    }
    return v;
}

/** ¿Es un .xlsx? Por sus BYTES: un ZIP (PK\x03\x04) con la carpeta `xl/` dentro. */
function pareceXlsx(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 30) return false;
    if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) return false;
    return buf.includes(Buffer.from('xl/'));
}

const CAB = {
    marca: (t) => /^MARCA/.test(t) || t === 'FABRICANTE',
    ref: (t) => /^(MODELO|REFERENCIA|REF|CODIGO|COD)/.test(t),
    precio: (t) => /(PRECIO|TARIFA|PVP|IMPORTE)/.test(t),
};

/**
 * Lee el Excel: la PRIMERA hoja, con una fila de cabecera (en las 15 primeras) que
 * tenga MARCA, MODELO/REFERENCIA y PRECIO/TARIFA/PVP. Devuelve las filas con datos.
 */
async function leerExcel(buffer) {
    if (!buffer || !buffer.length) throw new ErrorExcel('SIN_FICHERO', 'No ha llegado ningún fichero.');
    if (buffer.length > MAX_BYTES) throw new ErrorExcel('EXCEL_GRANDE', 'El Excel pesa más de 5 MB. Quita las hojas que no sean la tarifa.');
    if (!pareceXlsx(buffer)) throw new ErrorExcel('NO_ES_XLSX', 'El fichero no es un Excel (.xlsx). Si es un .xls antiguo o un PDF, guárdalo como .xlsx.');
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    try { await wb.xlsx.load(buffer); } catch { throw new ErrorExcel('NO_ES_XLSX', 'No se ha podido abrir el Excel. Ábrelo y guárdalo de nuevo como .xlsx.'); }
    const hoja = wb.worksheets[0];
    if (!hoja) throw new ErrorExcel('EXCEL_VACIO', 'El Excel no tiene ninguna hoja.');

    let cab = null, filaCab = 0;
    for (let i = 1; i <= Math.min(15, hoja.rowCount) && !cab; i++) {
        const fila = hoja.getRow(i), c = {};
        fila.eachCell({ includeEmpty: false }, (celda, col) => {
            const t = norm(valorCelda(celda.value));
            for (const [k, ok] of Object.entries(CAB)) if (!c[k] && t && ok(t)) { c[k] = col; break; }
        });
        if (c.marca && c.ref && c.precio) { cab = c; filaCab = i; }
    }
    if (!cab) throw new ErrorExcel('SIN_CABECERA', 'No encuentro la fila de títulos. La primera hoja tiene que tener las columnas MARCA, MODELO y PRECIO SIN IVA (descarga la plantilla).');

    const filas = [];
    for (let i = filaCab + 1; i <= hoja.rowCount; i++) {
        const fila = hoja.getRow(i);
        const marca = String(valorCelda(fila.getCell(cab.marca).value) ?? '').trim();
        const ref = String(valorCelda(fila.getCell(cab.ref).value) ?? '').trim();
        const bruto = valorCelda(fila.getCell(cab.precio).value);
        if (!marca && !ref && (bruto == null || bruto === '')) continue; // fila en blanco
        if (filas.length >= MAX_FILAS) throw new ErrorExcel('EXCEL_LARGO', `El Excel tiene más de ${MAX_FILAS} filas. Pártelo por marcas.`);
        const precio = precioDe(bruto);
        let error = null;
        if (!marca) error = 'Falta la marca';
        else if (!ref) error = 'Falta el modelo';
        else if (precio == null) error = 'El precio no es un número válido';
        filas.push({ fila: i, marca: marca.slice(0, 80), ref: ref.slice(0, 120), precio, precio_texto: bruto == null ? '' : String(bruto).slice(0, 30), error });
    }
    if (!filas.length) throw new ErrorExcel('EXCEL_VACIO', 'El Excel no tiene ninguna fila con datos debajo de los títulos.');
    return filas;
}

const nombreEquipo = (e) => e.modelo_comercial || e.modelo_conjunto || e.modelo_ud_exterior || `Equipo ${e.id}`;

/**
 * La tarifa VIGENTE de cada modelo: la de `vigente_desde` más reciente que ya ha empezado;
 * a igualdad, la cargada después. Desde el 22/11/2026 la tarifa es DE UN DISTRIBUIDOR:
 * a la carga se le pasan solo las de ESE distribuidor; para el instalador se usa
 * `vigentesPorDistribuidor`.
 */
function vigentes(tarifas, hoy = new Date().toISOString().slice(0, 10)) {
    const m = new Map();
    for (const t of tarifas || []) {
        if (!t || String(t.vigente_desde).slice(0, 10) > hoy) continue;
        const prev = m.get(t.aerotermia_id);
        const clave = `${String(t.vigente_desde).slice(0, 10)}|${t.cargada_at || ''}`;
        if (!prev || clave > prev._clave) m.set(t.aerotermia_id, { ...t, _clave: clave });
    }
    return m;
}

/** aerotermia_id → Map(distribuidor_id → tarifa vigente). Sin `distribuidor_id` no cuenta. */
function vigentesPorDistribuidor(tarifas, hoy) {
    const porDist = new Map();
    for (const t of tarifas || []) {
        if (!t?.distribuidor_id) continue;
        if (!porDist.has(t.distribuidor_id)) porDist.set(t.distribuidor_id, []);
        porDist.get(t.distribuidor_id).push(t);
    }
    const out = new Map();
    for (const [dist, lista] of porDist) {
        for (const [aid, t] of vigentes(lista, hoy)) {
            if (!out.has(aid)) out.set(aid, new Map());
            out.get(aid).set(dist, t);
        }
    }
    return out;
}

/**
 * Casa cada fila con el catálogo. `elecciones` = { [fila]: aerotermia_id } que
 * resuelve a mano una fila AMBIGUA (solo vale un id de SUS candidatos).
 * Estados: CASA · AMBIGUA · SIN_PAREJA · ERROR · DUPLICADA (mismo modelo con dos
 * precios: no se carga ninguna) · REPETIDA (mismo modelo y mismo precio: vale la 1.ª).
 * Cambio (solo CASA): NUEVA · IGUAL · SUBE · BAJA.
 */
function casar(filas, catalogo, tarifasVigentes = new Map(), elecciones = {}) {
    const idx = new Map(); // marca → ref → Set(ids)
    const porId = new Map();
    for (const e of catalogo || []) {
        porId.set(e.id, e);
        const m = norm(e.marca);
        if (!m) continue;
        if (!idx.has(m)) idx.set(m, new Map());
        for (const k of REFS) {
            const r = norm(e[k]);
            if (!r) continue;
            const porRef = idx.get(m);
            if (!porRef.has(r)) porRef.set(r, new Set());
            porRef.get(r).add(e.id);
        }
    }
    const res = filas.map((f) => {
        const base = { fila: f.fila, marca: f.marca, ref: f.ref, precio: f.precio, precio_texto: f.precio_texto };
        if (f.error) return { ...base, estado: 'ERROR', motivo: f.error };
        const porRef = idx.get(norm(f.marca));
        if (!porRef) return { ...base, estado: 'SIN_PAREJA', motivo: 'Esa marca no está en el catálogo' };
        const ids = [...(porRef.get(norm(f.ref)) || [])];
        if (!ids.length) return { ...base, estado: 'SIN_PAREJA', motivo: 'Ningún modelo de esa marca tiene esa referencia' };
        if (ids.length > 1) {
            const elegido = Number(elecciones?.[f.fila]);
            const candidatos = ids.sort((a, b) => a - b).map((id) => ({ id, nombre: nombreEquipo(porId.get(id)), exterior: porId.get(id).modelo_ud_exterior || null, conjunto: porId.get(id).modelo_conjunto || null }));
            if (elegido && ids.includes(elegido)) return { ...base, estado: 'CASA', aerotermia_id: elegido, nombre: nombreEquipo(porId.get(elegido)), elegida_a_mano: true, candidatos };
            return { ...base, estado: 'AMBIGUA', motivo: `Casa con ${ids.length} modelos: elige cuál`, candidatos };
        }
        return { ...base, estado: 'CASA', aerotermia_id: ids[0], nombre: nombreEquipo(porId.get(ids[0])) };
    });

    // El mismo modelo dos veces: con dos precios, ninguna; con el mismo, la primera.
    const grupos = new Map();
    for (const r of res) if (r.estado === 'CASA') (grupos.get(r.aerotermia_id) || grupos.set(r.aerotermia_id, []).get(r.aerotermia_id)).push(r);
    for (const g of grupos.values()) {
        if (g.length < 2) continue;
        const precios = new Set(g.map((r) => r.precio));
        if (precios.size > 1) for (const r of g) { r.estado = 'DUPLICADA'; r.motivo = `El mismo modelo sale en las filas ${g.map((x) => x.fila).join(', ')} con precios distintos`; }
        else for (const r of g.slice(1)) { r.estado = 'REPETIDA'; r.motivo = `Repite la fila ${g[0].fila} con el mismo precio`; }
    }

    for (const r of res) {
        if (r.estado !== 'CASA') continue;
        const v = tarifasVigentes.get(r.aerotermia_id);
        const ant = v ? Number(v.precio_sin_iva) : null;
        r.anterior = ant;
        r.anterior_desde = v ? String(v.vigente_desde).slice(0, 10) : null;
        r.cambio = ant == null ? 'NUEVA' : ant === r.precio ? 'IGUAL' : r.precio > ant ? 'SUBE' : 'BAJA';
    }

    const cuenta = (est) => res.filter((r) => r.estado === est).length;
    const casan = res.filter((r) => r.estado === 'CASA');
    const plan = casan.filter((r) => r.cambio !== 'IGUAL')
        .map((r) => ({ aerotermia_id: r.aerotermia_id, precio: r.precio, fila: r.fila, ref: r.ref }))
        .sort((a, b) => a.aerotermia_id - b.aerotermia_id);
    return {
        filas: res,
        plan,
        resumen: {
            leidas: res.length, casan: casan.length,
            nuevas: casan.filter((r) => r.cambio === 'NUEVA').length,
            cambian: casan.filter((r) => r.cambio === 'SUBE' || r.cambio === 'BAJA').length,
            iguales: casan.filter((r) => r.cambio === 'IGUAL').length,
            ambiguas: cuenta('AMBIGUA'), sin_pareja: cuenta('SIN_PAREJA'), errores: cuenta('ERROR'),
            duplicadas: cuenta('DUPLICADA'), repetidas: cuenta('REPETIDA'),
            a_guardar: plan.length,
        },
    };
}

/** La FIRMA de lo que se va a guardar: confirmar solo escribe si el plan es el mismo que se enseñó. */
function firmaDelPlan(plan, { distribuidor_id, vigente_desde, sha256 }) {
    return crypto.createHash('sha256').update(JSON.stringify({ plan, distribuidor_id, vigente_desde, sha256 })).digest('hex');
}

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** La plantilla de ejemplo (sin datos reales). */
async function plantilla() {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'BROKERGY';
    const h = wb.addWorksheet('Tarifa');
    h.columns = [
        { header: 'MARCA', key: 'marca', width: 18 },
        { header: 'MODELO', key: 'modelo', width: 32 },
        { header: 'PRECIO SIN IVA', key: 'precio', width: 18 },
        { header: 'DESCRIPCIÓN (opcional)', key: 'desc', width: 40 },
    ];
    h.getRow(1).font = { bold: true };
    h.addRow({ marca: 'MARCA EJEMPLO', modelo: 'REF-UD-EXTERIOR-08', precio: 4650, desc: 'Monobloc 8 kW' });
    h.addRow({ marca: 'MARCA EJEMPLO', modelo: 'REF CONJUNTO 10 + DEP 190', precio: 6820.5, desc: 'Todo en uno 10 kW' });
    h.getColumn('precio').numFmt = '#,##0.00 "€"';
    const a = wb.addWorksheet('Cómo rellenarla');
    a.getColumn(1).width = 110;
    [
        'Una fila por modelo. La app solo lee la PRIMERA hoja.',
        'MARCA: como está en el catálogo (da igual mayúsculas o tildes).',
        'MODELO: la referencia del modelo — el nombre comercial, la del conjunto o la de la unidad exterior. Da igual con o sin guiones o espacios.',
        'PRECIO SIN IVA: en euros. Vale 4650, 4.650 o 4.650,00 €.',
        'Una fila que casa con varios modelos se enseña para elegir a mano; una que no casa con ninguno NO se carga (el Excel nunca crea un modelo).',
        'Un Excel por DISTRIBUIDOR: el distribuidor se elige en la app al subirlo.',
        'La tarifa nueva no borra la anterior: se guarda con su fecha y se usa desde esa fecha.',
    ].forEach((t) => a.addRow([t]));
    return Buffer.from(await wb.xlsx.writeBuffer());
}

// ── Cómo se le enseña un equipo al instalador (LISTA BLANCA, sin márgenes) ──────
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const dos = (v) => (num(v) == null || num(v) <= 0 ? null : Math.round(num(v) * 100) / 100);

function usoDe(e) {
    const soloAcs = String(e.tipo || '').toUpperCase() === 'ACS';
    const agua = soloAcs || !!e.deposito_acs_incluido || num(e.scop_dhw_calido) > 0 || num(e.scop_dhw_medio) > 0;
    const frio = !soloAcs && (num(e.seer) > 0 || num(e.potencia_frigorifica) > 0);
    if (soloAcs) return { texto: 'Solo agua caliente', agua, frio: false, calefaccion: false };
    const partes = ['Calefacción', frio && 'frío', agua && 'agua caliente'].filter(Boolean);
    const texto = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
    return { texto, agua, frio, calefaccion: true };
}

function acsDe(e, uso) {
    const litros = num(e.litros_acs);
    if (e.deposito_acs_incluido) return { corto: litros ? `Depósito ${litros} l` : 'Con depósito', largo: litros ? `Con depósito de ${litros} l dentro` : 'Con depósito dentro' };
    if (uso.agua) return { corto: 'Sin depósito', largo: 'Con depósito aparte' };
    return { corto: 'Sin agua caliente', largo: 'No da agua caliente' };
}

function montajeDe(tipo) {
    const t = String(tipo || '').toUpperCase();
    if (t.includes('BIBLOC')) return 'Bibloc: un aparato fuera y otro dentro';
    if (t.includes('MONOBLOC')) return 'Monobloc: un solo aparato fuera';
    if (t.includes('AIRE-AIRE')) return 'Aire-aire (splits)';
    return null;
}

/** SCOP en clima cálido (el de casi toda España, el que usa la calculadora fuera de E1) y, si no lo hay, medio. */
function scopDe(e) {
    const s35 = dos(e.scop_cal_calido_35), s55 = dos(e.scop_cal_calido_55);
    if (s35 || s55) return { suelo: s35, radiadores: s55, clima: 'calido' };
    return { suelo: dos(e.scop_cal_medio_35), radiadores: dos(e.scop_cal_medio_55), clima: 'medio' };
}

/** Los papeles del equipo: la ficha técnica del catálogo (lo que lleva dentro, si se sabe). Nunca un enlace. */
function papelesDe(e) {
    if (!driveIdDe(e.ficha_tecnica)) return [];
    const p = e.ficha_tecnica_partes;
    const piezas = Array.isArray(p?.piezas) ? p.piezas : Array.isArray(p?.partes) ? p.partes : [];
    const incluye = [];
    const txt = piezas.map((x) => norm(x?.nombre)).join(' ');
    if (/EPREL.*FICHA|FICHE|FICHADEPRODUCTO/.test(txt)) incluye.push('la ficha de producto EPREL');
    if (/ETIQUETA|LABEL/.test(txt)) incluye.push('la etiqueta energética');
    if (/KEYMARK/.test(txt)) incluye.push('el certificado Keymark');
    return [{ id: 'ficha', nombre: 'Ficha técnica', incluye }];
}

/** El driveId de un enlace de Drive guardado en el catálogo (`/file/d/<id>` u `open?id=<id>`). */
function driveIdDe(url) {
    const s = String(url || '');
    const m = s.match(/\/d\/([\w-]{10,200})/) || s.match(/[?&]id=([\w-]{10,200})/);
    return m ? m[1] : null;
}

/**
 * `tarifas` = [{ distribuidor_id, distribuidor, precio_sin_iva, vigente_desde }] de los
 * distribuidores a los que COMPRA ese instalador (nunca de otros); `compro_a` = el
 * distribuidor que ha marcado para ese modelo. La `tarifa` de referencia (la que usa
 * «Calcular una obra» si no tiene precio propio) es la de `compro_a` y, si no ha
 * marcado ninguno o ese ya no tiene tarifa, la más barata.
 */
function equipoParaInstalador(e, { tarifas = [], compro_a = null, propio = null } = {}) {
    const uso = usoDe(e);
    const acs = acsDe(e, uso);
    const scop = scopDe(e);
    const nombre = nombreEquipo(e);
    const ref = [e.modelo_ud_exterior, e.modelo_conjunto].find((r) => r && norm(r) !== norm(nombre)) || null;
    const lista = (tarifas || [])
        .map((t) => ({ distribuidor_id: t.distribuidor_id, distribuidor: t.distribuidor, precio: Number(t.precio_sin_iva), desde: String(t.vigente_desde).slice(0, 10) }))
        .filter((t) => t.distribuidor_id && Number.isFinite(t.precio) && t.precio > 0)
        .sort((a, b) => a.precio - b.precio || String(a.distribuidor).localeCompare(String(b.distribuidor), 'es'));
    const elegida = lista.find((t) => t.distribuidor_id === compro_a) || null;
    const ref_tarifa = elegida || lista[0] || null;
    return {
        id: e.id,
        marca: e.marca,
        nombre,
        ref,
        referencias: { conjunto: e.modelo_conjunto || null, exterior: e.modelo_ud_exterior || null, interior: e.modelo_ud_interior || null },
        uso: uso.texto,
        montaje: montajeDe(e.tipo),
        potencia_kw: dos(e.potencia_calefaccion),
        potencia_frio_kw: dos(e.potencia_frigorifica),
        scop_suelo: scop.suelo,
        scop_radiadores: scop.radiadores,
        clima_scop: scop.clima,
        acs_corto: acs.corto,
        acs: acs.largo,
        refrigerante: e.refrigerante || null,
        tarifas: lista,
        compro_a: elegida ? elegida.distribuidor_id : (compro_a || null),
        tarifa: ref_tarifa ? { precio: ref_tarifa.precio, desde: ref_tarifa.desde, distribuidor_id: ref_tarifa.distribuidor_id, distribuidor: ref_tarifa.distribuidor, elegida: !!elegida } : null,
        tu_precio: propio ? Number(propio.precio_sin_iva) : null,
        papeles: papelesDe(e),
    };
}

/**
 * Las marcas del instalador, LEÍDAS de su ficha (no de la sesión, que vive 5 min en
 * caché: RCA no veía las marcas que le acababan de poner, 22/11/2026). Junta
 * `marca_referencia`, `marca_secundaria` y la tabla `instalador_marcas`.
 */
function marcasDeFicha(ficha, filasInstaladorMarcas = []) {
    const todas = [ficha?.marca_referencia, ficha?.marca_secundaria, ...(filasInstaladorMarcas || []).map((f) => f?.marca_nombre)]
        .flatMap((v) => String(v || '').split(','))
        .map((m) => m.trim().toUpperCase())
        .filter(Boolean);
    return [...new Set(todas)];
}

/** Compatibilidad: las marcas de la SESIÓN (routes/aerotermia.js sigue con esto). */
function marcasDelUsuario(user) {
    return String(user?.marcas_autorizadas || '').split(',').map((m) => m.trim().toUpperCase()).filter(Boolean);
}

module.exports = {
    MAX_BYTES, ErrorExcel, norm, precioDe, pareceXlsx, leerExcel, casar, vigentes, vigentesPorDistribuidor, firmaDelPlan, sha256, plantilla,
    equipoParaInstalador, marcasDeFicha, marcasDelUsuario, driveIdDe, nombreEquipo,
};
