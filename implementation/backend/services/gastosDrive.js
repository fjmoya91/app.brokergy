// ─── gastosDrive.js ──────────────────────────────────────────────────────────
// Los GASTOS de la contabilidad, tal como están en Drive:
//
//   00. S2E2 / 04. CONTABILIDAD /
//     CAE - SERVICIOS CAE / FACTURAS GASTOS / {año} / {n. MES}    → la SOCIEDAD
//     ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS / …         → la SOCIEDAD
//     FML - SERVICIOS AUTONOMO / GASTOS / …                       → el AUTÓNOMO
//
// Qué hace: LISTA los justificantes de un trimestre, los LEE con Gemini cuando
// se le pide (`POST /api/facturacion/gastos/leer`, nunca al abrir la pantalla) y
// GUARDA lo leído en las `appProperties` del propio fichero de Drive (claves
// `brk_*`): el dato viaja con el fichero y no hace falta esquema nuevo. Con la
// md5 del contenido: un fichero cuya md5 no ha cambiado no se vuelve a leer.
//
// REGLA — el modelo solo LEE (fecha, proveedor, NIF, importes, moneda y qué
// clase de documento es). Qué IVA se deduce, qué es ISP, qué va al 111 o al 349
// lo decide el CÓDIGO (`contabilidadService.fiscalGasto`), con los criterios del
// SOP de cierre trimestral.
//
// REGLA — a qué TRIMESTRE va un gasto: al MÁS TARDÍO entre el de su carpeta y
// el de la fecha de la factura. Una factura de junio archivada en julio se
// recibió tarde y se deduce en el T3; una del 1 de julio archivada en junio (la
// de Pepephone de junio) no puede deducirse antes de existir: T3. Cada fichero
// cae en UN solo trimestre, así que no se cuenta dos veces.
//
// Ver docs/conocimiento/facturacion/trimestres-y-contabilidad.md.
// ─────────────────────────────────────────────────────────────────────────────
const { google } = require('googleapis');
const { ajustesGemini } = require('../utils/geminiAjustes');
const { numeroEs } = require('./loteOcrService');
const { fechaDesdeLiteral } = require('./facturaOcrService');

const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth });

// ── Carpetas (cuenta de Drive de la app) ────────────────────────────────────
const env = (k, d) => String(process.env[k] || '').trim() || d;
const RAIZ_CONTABILIDAD = env('CONTABILIDAD_ROOT_FOLDER_ID', '1npS7KfEUMLZ2wluSl7DnsGFA4hcITw31');
const GASTOS = {
    CAE: env('CONTABILIDAD_GASTOS_CAE_FOLDER_ID', '1NFhJwNp_ZhKxfW372An0RtPeD_jKZyT3'),
    ING: env('CONTABILIDAD_GASTOS_ING_FOLDER_ID', '1KzfsPEAW7vL3hv06JB1q_Vz_qPd9wdXK'),
    FML: env('CONTABILIDAD_GASTOS_FML_FOLDER_ID', '1ncQlpVmYZc0MgIB2xwPptCck4zWSatni'),
};
const VENTAS = {
    CAE: env('CONTABILIDAD_FACTURAS_CAE_FOLDER_ID', '1NG1w-QW0YGzqOXazwMVmVNT7HCXSWFpf'),
    ING: env('CONTABILIDAD_FACTURAS_ING_FOLDER_ID', '1M-SVjCAhDXDqbugXCBDWH0nUvYYLvFdh'),
    FML: env('CONTABILIDAD_FACTURAS_FML_FOLDER_ID', '1PYgsnaefPpyTNgUpNJXGIhv5RnBnZaEC'),
};
const EXTRACTOS = env('CONTABILIDAD_EXTRACTOS_FOLDER_ID', '1g5VYwWP28qCEuAyY5hJgeDyvFmNO-GHl');
const ENTREGA_GESTORIA = env('CONTABILIDAD_ENTREGA_FOLDER_ID', '1k_Hm5vBkj0Sxwkx0umFwvE_PN2FEd-Vj');

const RUTA = {
    GASTOS: { CAE: 'CAE - SERVICIOS CAE / FACTURAS GASTOS', ING: 'ING - SERVICIOS DE INGENIERIA / FACTURAS GASTOS', FML: 'FML - SERVICIOS AUTONOMO / GASTOS' },
    VENTAS: { CAE: 'CAE - SERVICIOS CAE / FACTURAS VENTAS', ING: 'ING - SERVICIOS DE INGENIERIA / FACTURAS VENTAS', FML: 'FML - SERVICIOS AUTONOMO / VENTAS' },
};
// FML → el autónomo; CAE e ING → la sociedad. Dos contribuyentes que no se mezclan.
const CONTRIBUYENTE = { CAE: 'SL', ING: 'SL', FML: 'AUTONOMO' };

const MESES = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
const CARPETA = 'application/vnd.google-apps.folder';
const LEGIBLES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Mes de una carpeta: «10. OCTUBRE», «OCTUBRE» (2025), «3.MARZO» → 10 / 10 / 3. */
function mesDeCarpeta(nombre) {
    const m = /^(?:(\d{1,2})\s*\.\s*)?([A-Z]+)\s*$/.exec(sinTildes(nombre));
    if (!m) return null;
    const i = MESES.indexOf(m[2]);
    if (i < 0) return null;
    if (m[1] && Number(m[1]) !== i + 1) return null;      // «3. ABRIL» no es de nadie
    return i + 1;
}

// ── Drive ───────────────────────────────────────────────────────────────────

const CAMPOS = 'id, name, mimeType, md5Checksum, size, parents, appProperties, webViewLink, createdTime, modifiedTime';

async function hijos(folderIds, { soloCarpetas = false } = {}) {
    const ids = [].concat(folderIds).filter(Boolean);
    if (!ids.length) return [];
    const out = [];
    // Drive admite varias carpetas en una consulta con OR; en tandas de 20.
    for (let i = 0; i < ids.length; i += 20) {
        const padres = ids.slice(i, i + 20).map(id => `'${id}' in parents`).join(' or ');
        let pageToken;
        do {
            const r = await drive.files.list({
                q: `(${padres}) and trashed = false${soloCarpetas ? ` and mimeType = '${CARPETA}'` : ''}`,
                fields: `nextPageToken, files(${CAMPOS})`, pageSize: 1000, pageToken,
            });
            out.push(...(r.data.files || []));
            pageToken = r.data.nextPageToken;
        } while (pageToken);
    }
    return out;
}

// Las carpetas de año y mes cambian poco: se recuerdan 10 minutos.
const cache = new Map();
const TTL_MS = 10 * 60 * 1000;

/** { mes → folderId } de `{raiz}/{año}`. Sin la carpeta del año, {}. */
async function carpetasMes(raiz, anio) {
    const k = `${raiz}:${anio}`;
    const c = cache.get(k);
    if (c && Date.now() - c.t < TTL_MS) return c.v;
    const anios = await hijos(raiz, { soloCarpetas: true });
    const fa = anios.find(f => f.name.trim() === String(anio));
    const v = {};
    if (fa) {
        for (const f of await hijos(fa.id, { soloCarpetas: true })) {
            const m = mesDeCarpeta(f.name);
            if (m && !v[m]) v[m] = { id: f.id, nombre: f.name };
        }
    }
    cache.set(k, { t: Date.now(), v });
    return v;
}

/** [{anio, mes}] de los meses que se miran para un trimestre: los 3 suyos y el anterior. */
function mesesAMirar(anio, n) {
    const out = [];
    const m0 = (n - 1) * 3 + 1;
    out.push(m0 === 1 ? { anio: anio - 1, mes: 12, vecino: true } : { anio, mes: m0 - 1, vecino: true });
    for (let m = m0; m < m0 + 3; m++) out.push({ anio, mes: m, vecino: false });
    return out;
}

const trimestreDeMes = (mes) => Math.ceil(mes / 3);
const claveT = (anio, n) => anio * 10 + n;

// ── appProperties: lo leído viaja con el fichero ────────────────────────────
//
// Drive limita cada par clave+valor a 124 bytes (UTF-8) y a 30 propiedades por
// aplicación y fichero. Claves cortas, `brk_` delante, valores recortados.

const CLAVES = {
    v: 'brk_v', md5: 'brk_md5', at: 'brk_at', rev: 'brk_rev',
    fecha: 'brk_fecha', proveedor: 'brk_prov', nif: 'brk_nif', numero: 'brk_num',
    nif_destinatario: 'brk_ndst', pais: 'brk_pais', documento: 'brk_doc', naturaleza: 'brk_nat',
    concepto: 'brk_con', base: 'brk_base', iva_pct: 'brk_ivap', cuota: 'brk_iva', irpf: 'brk_irpf',
    suplidos: 'brk_sup', total: 'brk_tot', moneda: 'brk_mon', total_eur: 'brk_eur',
    // Lo que se corrige a mano y manda sobre el criterio del código:
    tipo: 'brk_tipo', actividad: 'brk_act', deducible_pct: 'brk_ded', irpf_deducible_pct: 'brk_dirpf',
    error: 'brk_err',
    // Las VENTAS CAE de Drive que no están en la app (autofacturas): el cliente.
    cliente: 'brk_cli', autofactura: 'brk_auto',
    // …y el COBRO (AAAA-MM-DD): no hay `facturas_so` donde marcarlo. Solo lo escribe
    // `marcarCobroVenta`; leer otra vez el PDF no lo toca (Drive funde las claves).
    cobro_fecha: 'brk_cobro_fecha',
};
const VERSION = '1';
const NUMERICOS = new Set(['base', 'iva_pct', 'cuota', 'irpf', 'suplidos', 'total', 'total_eur', 'deducible_pct', 'irpf_deducible_pct']);
const DATOS = ['fecha', 'proveedor', 'nif', 'numero', 'nif_destinatario', 'pais', 'documento', 'naturaleza', 'concepto',
    'base', 'iva_pct', 'cuota', 'irpf', 'suplidos', 'total', 'moneda', 'total_eur'];
const AJUSTES = ['tipo', 'actividad', 'deducible_pct', 'irpf_deducible_pct'];
const DATOS_VENTA = ['fecha', 'cliente', 'nif', 'numero', 'documento', 'concepto', 'base', 'iva_pct', 'cuota', 'total', 'autofactura'];

/** Recorta el valor para que clave+valor quepan en 124 bytes. */
function cabe(clave, valor) {
    let v = String(valor);
    const max = 124 - Buffer.byteLength(clave, 'utf8');
    while (v && Buffer.byteLength(v, 'utf8') > max) v = v.slice(0, -1);
    return v;
}

/** Lo de la app → appProperties (null borra la clave en Drive). */
function codificar(obj = {}) {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        const clave = CLAVES[k];
        if (!clave) continue;
        if (v === null || v === undefined || v === '') { out[clave] = null; continue; }
        if (k === 'autofactura') { out[clave] = v === true || v === '1' || v === 'true' ? '1' : '0'; continue; }
        out[clave] = cabe(clave, NUMERICOS.has(k) ? String(Math.round(Number(v) * 100) / 100) : v);
    }
    return out;
}

/** appProperties → { datos, meta, ajustes } (lo que no es nuestro se ignora). */
function decodificar(ap = {}) {
    const inv = Object.fromEntries(Object.entries(CLAVES).map(([k, c]) => [c, k]));
    const o = {};
    for (const [c, v] of Object.entries(ap || {})) {
        const k = inv[c];
        if (!k) continue;
        o[k] = NUMERICOS.has(k) ? (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v)) : v;
    }
    if (o.autofactura !== undefined) o.autofactura = o.autofactura === '1';
    const datos = Object.fromEntries([...new Set([...DATOS, 'cliente', 'autofactura'])].filter(k => o[k] !== undefined).map(k => [k, o[k]]));
    const ajustes = Object.fromEntries(AJUSTES.filter(k => o[k] !== undefined && o[k] !== null).map(k => [k, o[k]]));
    return {
        leido: !!o.md5,
        meta: {
            version: o.v || null, md5: o.md5 || null, leido_el: o.at || null, revisado: o.rev === '1', error: o.error || null,
            cobro_fecha: /^\d{4}-\d{2}-\d{2}$/.test(String(o.cobro_fecha || '')) ? o.cobro_fecha : null,
        },
        datos, ajustes,
    };
}

// ── Listado ─────────────────────────────────────────────────────────────────

const RE_FML = /\b(\d{2}FML_\d+)\b/i;

function filaGasto(f, { linea, anio, mes, vecino }) {
    const ap = decodificar(f.appProperties);
    const md5Cambiada = ap.leido && f.md5Checksum && ap.meta.md5 !== f.md5Checksum;
    const fml = CONTRIBUYENTE[linea] === 'SL' ? (RE_FML.exec(f.name)?.[1] || '').toUpperCase() || null : null;
    const legible = LEGIBLES.has(f.mimeType);
    let estado = 'SIN_LEER';
    if (!legible) estado = 'NO_LEGIBLE';
    else if (fml) estado = 'APP';                     // una FML de Fran: sus cifras salen de la app
    else if (md5Cambiada) estado = 'CAMBIADO';
    else if (ap.leido && ap.meta.error && !ap.datos.total && !ap.datos.base) estado = 'ERROR';
    else if (ap.leido) estado = ap.meta.revisado ? 'REVISADO' : 'LEIDO';

    // El trimestre: el más tardío entre el de la carpeta y el de la fecha.
    const tCarpeta = claveT(anio, trimestreDeMes(mes));
    const fecha = ap.datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(ap.datos.fecha) ? ap.datos.fecha : null;
    const tFecha = fecha ? claveT(Number(fecha.slice(0, 4)), trimestreDeMes(Number(fecha.slice(5, 7)))) : null;
    const tFiscal = tFecha && tFecha > tCarpeta ? tFecha : tCarpeta;

    return {
        fileId: f.id, nombre: f.name, mime: f.mimeType, md5: f.md5Checksum || null, link: f.webViewLink || null,
        creado: f.createdTime || null,
        linea, contribuyente: CONTRIBUYENTE[linea],
        anio_carpeta: anio, mes_carpeta: mes, carpeta: `${RUTA.GASTOS[linea]} / ${anio} / ${mes}. ${MESES[mes - 1]}`,
        carpeta_vecina: !!vecino,
        estado, fml,
        leido_el: ap.meta.leido_el, revisado: ap.meta.revisado, error_lectura: ap.meta.error,
        datos: ap.datos, ajustes: ap.ajustes,
        trimestre_fiscal: `${Math.floor(tFiscal / 10)}-T${tFiscal % 10}`,
        fecha_fuera: !!(tFecha && tFecha !== tCarpeta),
    };
}

/**
 * Los justificantes de GASTO que caen en un trimestre (`{anio, n}`), de las tres
 * líneas. Lee las carpetas de sus tres meses y la del mes anterior (por si una
 * factura del primer día se archivó en el mes de antes) y se queda con los que
 * van a ESE trimestre. Los que no se pueden leer (un .xls) salen en `ignorados`.
 */
async function listarGastos({ anio, n }, { lineas = ['CAE', 'ING', 'FML'] } = {}) {
    const objetivo = `${anio}-T${n}`;
    const meses = mesesAMirar(anio, n);
    const filas = [];
    const ignorados = [];
    const sinCarpeta = [];
    // Los SIN LEER del mes anterior: sin su fecha no se sabe si son de este
    // trimestre (la Pepephone del 1 de julio está en «6. JUNIO»). Se devuelven
    // aparte y `leerPendientes` los lee con el trimestre, para poder colocarlos.
    const vecinos = [];
    for (const linea of lineas) {
        const porAnio = {};
        for (const a of [...new Set(meses.map(m => m.anio))]) porAnio[a] = await carpetasMes(GASTOS[linea], a);
        const carpetas = meses.map(m => ({ ...m, c: porAnio[m.anio][m.mes] })).filter(m => {
            if (!m.c && !m.vecino) sinCarpeta.push(`${RUTA.GASTOS[linea]} / ${m.anio} / ${m.mes}. ${MESES[m.mes - 1]}`);
            return !!m.c;
        });
        const porPadre = Object.fromEntries(carpetas.map(m => [m.c.id, m]));
        for (const f of await hijos(carpetas.map(m => m.c.id))) {
            if (f.mimeType === CARPETA) continue;
            const m = porPadre[(f.parents || []).find(p => porPadre[p])];
            if (!m) continue;
            const fila = filaGasto(f, { linea, anio: m.anio, mes: m.mes, vecino: m.vecino });
            if (fila.trimestre_fiscal !== objetivo) {
                if (m.vecino && (fila.estado === 'SIN_LEER' || fila.estado === 'CAMBIADO')) vecinos.push(fila);
                continue;
            }
            if (fila.estado === 'NO_LEGIBLE') { ignorados.push({ fileId: f.id, nombre: f.name, carpeta: fila.carpeta, motivo: `No es un PDF ni una imagen (${f.mimeType.split('/').pop()})` }); continue; }
            filas.push(fila);
        }
    }
    filas.sort((a, b) => String(a.datos.fecha || `${a.anio_carpeta}-${String(a.mes_carpeta).padStart(2, '0')}-99`).localeCompare(String(b.datos.fecha || `${b.anio_carpeta}-${String(b.mes_carpeta).padStart(2, '0')}-99`)) || a.nombre.localeCompare(b.nombre));
    return { filas, ignorados, sinCarpeta, vecinos };
}

/**
 * Un fichero de VENTAS con lo leído de él (solo se leen las ventas CAE que no
 * están en la app: las autofacturas de Iberdrola, una factura hecha fuera…).
 */
function filaVenta(f, { linea, anio, mes }) {
    const ap = decodificar(f.appProperties);
    const legible = LEGIBLES.has(f.mimeType);
    let estado = 'SIN_LEER';
    if (!legible) estado = 'NO_LEGIBLE';
    else if (ap.leido && f.md5Checksum && ap.meta.md5 !== f.md5Checksum) estado = 'CAMBIADO';
    else if (ap.leido && ap.meta.error && !ap.datos.total && !ap.datos.base) estado = 'ERROR';
    else if (ap.leido) estado = ap.meta.revisado ? 'REVISADO' : 'LEIDO';
    return {
        fileId: f.id, nombre: f.name, mime: f.mimeType, md5: f.md5Checksum || null, link: f.webViewLink || null,
        linea, anio, mes, carpeta: RUTA.VENTAS[linea],
        estado, leido_el: ap.meta.leido_el, revisado: ap.meta.revisado, error_lectura: ap.meta.error,
        cobro_fecha: ap.meta.cobro_fecha,
        datos: Object.fromEntries(DATOS_VENTA.filter(k => ap.datos[k] !== undefined).map(k => [k, ap.datos[k]])),
    };
}

/** Los años que tienen carpeta en `{raíz de VENTAS}/{año}` (para lo pendiente de cobro de cualquier año). */
async function aniosVentas(linea = 'CAE') {
    const k = `${VENTAS[linea]}:anios`;
    const c = cache.get(k);
    if (c && Date.now() - c.t < TTL_MS) return c.v;
    const v = (await hijos(VENTAS[linea], { soloCarpetas: true }))
        .map(f => f.name.trim()).filter(n => /^\d{4}$/.test(n)).map(Number).sort((a, b) => a - b);
    cache.set(k, { t: Date.now(), v });
    return v;
}

/** Los ficheros de las carpetas de VENTAS de unos meses ({ linea → [fichero] }), para el paquete y las ventas CAE de Drive. */
async function listarVentas({ anio, meses }, { lineas = ['CAE', 'ING', 'FML'] } = {}) {
    const out = {};
    for (const linea of lineas) {
        const cm = await carpetasMes(VENTAS[linea], anio);
        const ids = meses.map(m => cm[m]?.id).filter(Boolean);
        const mesDe = Object.fromEntries(meses.filter(m => cm[m]).map(m => [cm[m].id, m]));
        out[linea] = (await hijos(ids))
            .filter(f => f.mimeType !== CARPETA)
            .map(f => filaVenta(f, { linea, anio, mes: mesDe[(f.parents || []).find(p => mesDe[p])] || null }));
    }
    return out;
}

/**
 * Lo que hay en «EXTRACTOS Y RECIBOS / 02. AUTÓNOMO» (sin sus subcarpetas): los
 * CSV del banco, con su texto (son pequeños; se recuerdan por su md5), y los
 * demás ficheros (los recibos de la TGSS). Para la cuota de autónomos y el
 * colegio (`cuotasAutonomo`).
 */
const textosCsv = new Map();
async function extractosAutonomo() {
    const subs = await hijos(EXTRACTOS, { soloCarpetas: true });
    const aut = subs.find(s => /AUT[OÓ]NOMO/i.test(s.name));
    if (!aut) return { carpeta: null, extractos: [], recibos: [] };
    const fs = (await hijos(aut.id)).filter(f => f.mimeType !== CARPETA);
    const esCsv = (f) => /\.csv$/i.test(f.name) || f.mimeType === 'text/csv';
    const extractos = [];
    for (const f of fs.filter(esCsv)) {
        const k = `${f.id}:${f.md5Checksum || f.modifiedTime}`;
        if (!textosCsv.has(k)) {
            const buf = await contenido(f.id);
            const utf = buf.toString('utf8');
            textosCsv.set(k, utf.includes('�') ? buf.toString('latin1') : utf);
        }
        extractos.push({ fileId: f.id, nombre: f.name, link: f.webViewLink || null, texto: textosCsv.get(k) });
    }
    const recibos = fs.filter(f => !esCsv(f)).map(f => ({ fileId: f.id, nombre: f.name, link: f.webViewLink || null, mime: f.mimeType }));
    return { carpeta: aut.name, extractos, recibos };
}

/**
 * Los extractos y recibos del banco que tocan a un trimestre: los de
 * «EXTRACTOS Y RECIBOS / 01. EMPRESA S2E2» (SL) y «02. AUTÓNOMO», sin su OLD,
 * creados entre 10 días antes del fin del trimestre y 10 días después del plazo
 * (los de jul-sep se bajaron el 7 de octubre). Es una ESTIMACIÓN: el paquete
 * avisa de que hay que mirarlos.
 */
async function listarExtractos({ desde, hasta }) {
    const subs = await hijos(EXTRACTOS, { soloCarpetas: true });
    const quien = (n) => (/AUT[OÓ]NOMO/i.test(n) ? 'AUTONOMO' : /EMPRESA|S2E2|SL\b/i.test(n) ? 'SL' : null);
    const carpetas = subs.map(s => ({ id: s.id, nombre: s.name, quien: quien(s.name) })).filter(s => s.quien);
    const de = Object.fromEntries(carpetas.map(c => [c.id, c]));
    const t0 = new Date(new Date(`${hasta}T00:00:00Z`).getTime() - 10 * 86400000);
    const t1 = new Date(new Date(`${desde}T00:00:00Z`).getTime() + 140 * 86400000);
    return (await hijos(carpetas.map(c => c.id)))
        .filter(f => f.mimeType !== CARPETA)
        .filter(f => { const c = new Date(f.createdTime); return c >= t0 && c <= t1; })
        .map(f => { const c = de[(f.parents || []).find(p => de[p])]; return { fileId: f.id, nombre: f.name, contribuyente: c?.quien || null, carpeta: c?.nombre || null, creado: f.createdTime }; });
}

// ── Lectura con Gemini ──────────────────────────────────────────────────────

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const PAGINAS = 3;                      // una factura de gasto cabe en 1-2 hojas
const DEADLINE_MS = Number(process.env.GASTOS_OCR_TIMEOUT_MS) || 45000;
const RETRYABLE = new Set([429, 500, 503]);

const DOCUMENTOS = ['FACTURA', 'SIMPLIFICADA', 'RECIBO', 'NO_ES_GASTO'];
const NATURALEZAS = ['GENERAL', 'COMBUSTIBLE', 'VEHICULO', 'RESTAURACION', 'ALOJAMIENTO_VIAJE', 'SOFTWARE', 'TELEFONIA',
    'PROFESIONAL', 'TASA', 'SEGURO', 'CUOTA_ASOCIACION', 'EQUIPO', 'SUMINISTRO', 'CESION_AHORRO', 'OTRO'];

const PROMPT = `Documento de GASTO de una empresa española (factura recibida, ticket, recibo). Copia los datos que pide el esquema; NO calcules ni deduzcas nada que no esté escrito. Si un dato no aparece, null.

- proveedor: quien EMITE el documento y cobra (logo, arriba). proveedor_nif: su NIF/CIF o NIF-IVA tal cual (con su prefijo de país si lo lleva: IE…, EU…). proveedor_pais: código ISO de 2 letras del país del EMISOR según su dirección.
- destinatario_nombre / destinatario_nif: a quién va la factura («Cliente», «Facturar a»). Un ticket sin datos del cliente: null.
- numero_factura: tal cual.
- fecha_texto: la fecha de la factura COPIADA tal como está impresa. fecha: la misma en AAAA-MM-DD (en España el día va primero: 06/09/26 es 2026-09-06).
- documento: FACTURA (completa, con NIF del destinatario) · SIMPLIFICADA (ticket o factura simplificada) · RECIBO (recibo de banco, de seguro, de cuota, sin ser factura) · NO_ES_GASTO (presupuesto, contrato, anexo, albarán sin importe).
- naturaleza: COMBUSTIBLE (gasóleo, gasolina) · VEHICULO (taller, ITV, neumáticos, impuesto de circulación) · RESTAURACION (comidas, cenas, bar) · ALOJAMIENTO_VIAJE (hotel, transporte) · SOFTWARE (suscripciones, nube, API) · TELEFONIA (móvil, internet) · PROFESIONAL (servicios de un profesional: certificador, asesoría, abogado) · TASA (tasa o impuesto público) · SEGURO · CUOTA_ASOCIACION (colegio, asociación) · EQUIPO (ordenadores, móviles, maquinaria, instalaciones) · SUMINISTRO (material de oficina, pequeño material) · CESION_AHORRO (anexo de cesión de ahorro energético o bono CAE) · GENERAL (otro gasto) · OTRO.
- concepto: qué se compra, en 6-10 palabras.
- moneda: código ISO (EUR, USD…).
- Importes COPIADOS como texto tal como están impresos, en la moneda del documento: base_imponible (antes de IVA), iva_pct (el tipo; si hay varios, el principal), iva_importe (la cuota TOTAL de IVA), retencion_irpf (la retención, en positivo), suplidos (importes que la factura marca como suplidos, tasas adelantadas o no sujetos), total (lo que se paga). total_eur_indicado: si un documento en otra moneda indica su importe en euros, ese importe; si no, null.`;

const S = { type: 'STRING', nullable: true };
const SCHEMA = {
    type: 'OBJECT',
    properties: {
        proveedor: S, proveedor_nif: S, proveedor_pais: S, destinatario_nombre: S, destinatario_nif: S,
        numero_factura: S, fecha_texto: S, fecha: S,
        documento: { type: 'STRING', enum: DOCUMENTOS, nullable: true },
        naturaleza: { type: 'STRING', enum: NATURALEZAS, nullable: true },
        concepto: S, moneda: S,
        base_imponible: S, iva_pct: S, iva_importe: S, retencion_irpf: S, suplidos: S, total: S, total_eur_indicado: S,
    },
    required: ['documento', 'naturaleza'],
};

async function llamarGemini(pdf, { prompt = PROMPT, schema = SCHEMA } = {}) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw error('Falta GEMINI_API_KEY en el entorno.', 503);
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
    const body = JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'application/pdf', data: pdf.toString('base64') } }] }],
        generationConfig: {
            responseMimeType: 'application/json', responseSchema: schema, maxOutputTokens: 1024,
            // Leer una factura es transcribir: sin razonamiento (regla 121: lo decide ajustesGemini).
            ...ajustesGemini(GEMINI_MODEL, { pensamiento: 0, temperatura: 0 }),
        },
    });
    const t0 = Date.now();
    let res, text;
    for (let intento = 0; intento <= 2; intento++) {
        const restante = t0 + DEADLINE_MS - Date.now();
        if (restante <= 0) throw error('La lectura superó el plazo.', 504);
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), restante);
        try {
            res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }, body, signal: ctrl.signal });
            text = await res.text();
        } catch (e) {
            if (e.name === 'AbortError') throw error('La lectura superó el plazo.', 504);
            throw e;
        } finally { clearTimeout(t); }
        if (res.ok || !RETRYABLE.has(res.status) || intento === 2) break;
        await new Promise(r => setTimeout(r, 800 * 2 ** intento));
    }
    if (!res.ok) throw error(`Gemini ${res.status}: ${String(text || '').slice(0, 200)}`, 502);
    const data = JSON.parse(text);
    const uso = data?.usageMetadata || {};
    console.log(`[gastosDrive] ${GEMINI_MODEL} ${((Date.now() - t0) / 1000).toFixed(1)}s · in=${uso.promptTokenCount ?? '?'} out=${uso.candidatesTokenCount ?? '?'}`);
    const out = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!out) throw error('Gemini no devolvió contenido.', 502);
    return { bruto: JSON.parse(out), tokens: { in: uso.promptTokenCount ?? null, out: uso.candidatesTokenCount ?? null } };
}

const txt = (v, max = 200) => { const s = v == null ? '' : String(v).replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null; };
const nif = (v) => { const s = String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); return s || null; };
const positivo = (v) => { const n = numeroEs(v); return n == null ? null : Math.abs(n); };

/** Lo que devuelve el modelo → los datos que se guardan. Determinista y probado. */
function normalizarLectura(r = {}) {
    const fecha = fechaDesdeLiteral(r.fecha_texto) || (/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha || '')) ? r.fecha : null);
    const moneda = (String(r.moneda || '').toUpperCase().match(/[A-Z]{3}/) || ['EUR'])[0];
    const pais = (String(r.proveedor_pais || '').toUpperCase().match(/^[A-Z]{2}$/) || [null])[0];
    return {
        fecha,
        proveedor: txt(r.proveedor, 120),
        nif: nif(r.proveedor_nif),
        numero: txt(r.numero_factura, 60),
        nif_destinatario: nif(r.destinatario_nif),
        pais,
        documento: DOCUMENTOS.includes(r.documento) ? r.documento : null,
        naturaleza: NATURALEZAS.includes(r.naturaleza) ? r.naturaleza : 'OTRO',
        concepto: txt(r.concepto, 90),
        base: numeroEs(r.base_imponible),
        iva_pct: positivo(r.iva_pct),
        cuota: numeroEs(r.iva_importe),
        irpf: positivo(r.retencion_irpf),
        suplidos: positivo(r.suplidos),
        total: numeroEs(r.total),
        moneda,
        total_eur: moneda === 'EUR' ? null : positivo(r.total_eur_indicado),
    };
}

/** PDF o imagen → PDF de como mucho PAGINAS hojas (lo que se le manda al modelo). */
async function prepararPdf(buf, mime) {
    const { aPdf } = require('./justificanteOcrService');
    const { primerasPaginas } = require('./riteOcrService');
    const pdf = await aPdf(buf, mime === 'application/pdf' ? 'application/pdf' : mime);
    return (await primerasPaginas(pdf, PAGINAS)).pdf;
}

/**
 * LEE un justificante y devuelve lo leído SIN guardar nada (lo usa la prueba con
 * los PDF del T3 y `leerPendientes`).
 */
async function leerJustificante(buf, mime = 'application/pdf') {
    if (!buf?.length) throw error('El fichero está vacío.', 422);
    const { bruto, tokens } = await llamarGemini(await prepararPdf(buf, mime));
    return { datos: normalizarLectura(bruto), tokens };
}

// ── Las VENTAS CAE de Drive que no están en la app ──────────────────────────
//
// REGLA — una venta CAE que solo está en Drive (la AUTOFACTURA de Iberdrola, que
// expide el cliente en nuestro nombre —art. 5 del Reglamento de facturación—, o
// una factura hecha fuera de la app) es INGRESO de la sociedad: se LEE como un
// gasto (Gemini copia, el código decide) y cuenta en el 303 y en el cuadro.

const DOCUMENTOS_VENTA = ['FACTURA', 'RECTIFICATIVA', 'JUSTIFICANTE_PAGO', 'OTRO'];
const PROMPT_VENTA = `Documento de la carpeta de VENTAS de una empresa española: una factura que ella emite, o una AUTOFACTURA que el CLIENTE expide en su nombre («facturación por el destinatario»: la numeración y el logo son del cliente). Copia los datos que pide el esquema; NO calcules nada. Si un dato no aparece, null.

- cliente: la empresa que COMPRA y paga (la contraparte de la que vende), AUNQUE sea ella quien expide el documento. cliente_nif: su NIF/CIF tal cual.
- autofactura: true si el documento lo expide el cliente (dice «autofactura», «facturación por el destinatario», o el logo y la numeración son del cliente); false si lo expide la empresa que vende.
- documento: FACTURA · RECTIFICATIVA · JUSTIFICANTE_PAGO (transferencia, comprobante, recibo de pago) · OTRO.
- numero_factura: tal cual. fecha_texto: la fecha de la factura COPIADA como está impresa. fecha: la misma en AAAA-MM-DD (en España el día va primero).
- concepto: qué se vende, en 6-10 palabras. moneda: código ISO.
- Importes COPIADOS como texto tal como están impresos: base_imponible, iva_pct (el tipo), iva_importe (la cuota de IVA), total.`;
const SCHEMA_VENTA = {
    type: 'OBJECT',
    properties: {
        cliente: S, cliente_nif: S, autofactura: { type: 'BOOLEAN', nullable: true },
        documento: { type: 'STRING', enum: DOCUMENTOS_VENTA, nullable: true },
        numero_factura: S, fecha_texto: S, fecha: S, concepto: S, moneda: S,
        base_imponible: S, iva_pct: S, iva_importe: S, total: S,
    },
    required: ['documento'],
};

/** Lo que devuelve el modelo de una VENTA → los datos que se guardan. */
function normalizarVenta(r = {}) {
    return {
        fecha: fechaDesdeLiteral(r.fecha_texto) || (/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha || '')) ? r.fecha : null),
        cliente: txt(r.cliente, 120),
        nif: nif(r.cliente_nif),
        numero: txt(r.numero_factura, 60),
        documento: DOCUMENTOS_VENTA.includes(r.documento) ? r.documento : 'OTRO',
        concepto: txt(r.concepto, 90),
        base: numeroEs(r.base_imponible),
        iva_pct: positivo(r.iva_pct),
        cuota: numeroEs(r.iva_importe),
        total: numeroEs(r.total),
        autofactura: r.autofactura === true,
    };
}

async function leerVentaPdf(buf, mime = 'application/pdf') {
    if (!buf?.length) throw error('El fichero está vacío.', 422);
    const { bruto, tokens } = await llamarGemini(await prepararPdf(buf, mime), { prompt: PROMPT_VENTA, schema: SCHEMA_VENTA });
    return { datos: normalizarVenta(bruto), tokens };
}

/**
 * Lo que se escribe al LEER una venta: la lectura y nada más. El cobro
 * (`brk_cobro_fecha`) NO va: Drive funde las appProperties, así que una clave que
 * no se manda se conserva y leer otra vez el PDF (otra md5) no borra el cobro.
 */
const propsLecturaVenta = (md5, datos) => codificar({ v: VERSION, md5, at: hoy(), rev: null, error: null, ...Object.fromEntries(DATOS_VENTA.map(k => [k, datos[k] ?? null])) });

/**
 * Lee con Gemini las VENTAS CAE de Drive de unos meses que se le digan
 * (`fileIds`: las que no están en la app; lo decide contabilidadService) y
 * guarda lo leído en sus appProperties. Mismo trato que `leerPendientes`.
 */
async function leerVentas({ anio, meses }, { fileIds, forzar = false, presupuestoMs = 80000, concurrencia = 2 } = {}) {
    const t0 = Date.now();
    const pedidos = new Set([].concat(fileIds || []));
    const filas = (await listarVentas({ anio, meses }, { lineas: ['CAE'] })).CAE || [];
    const cola = filas.filter(v => pedidos.has(v.fileId) && v.estado !== 'NO_LEGIBLE' && (forzar || ['SIN_LEER', 'CAMBIADO'].includes(v.estado)));
    const leidos = [], errores = [];
    const tokens = { in: 0, out: 0 };
    let i = 0;
    const trabajador = async () => {
        while (i < cola.length) {
            if (Date.now() - t0 > presupuestoMs) return;
            const v = cola[i++];
            try {
                const { datos, tokens: tk } = await leerVentaPdf(await contenido(v.fileId), v.mime);
                tokens.in += tk.in || 0; tokens.out += tk.out || 0;
                await escribir(v.fileId, propsLecturaVenta(v.md5, datos));
                leidos.push({ fileId: v.fileId, nombre: v.nombre, datos });
            } catch (e) {
                errores.push({ fileId: v.fileId, nombre: v.nombre, error: e.message });
                if (e.status !== 503) await escribir(v.fileId, codificar({ v: VERSION, md5: v.md5, at: hoy(), error: String(e.message).slice(0, 90) })).catch(() => { });
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador));
    return { leidos, errores, quedan: Math.max(0, cola.length - leidos.length - errores.length), tokens, segundos: Math.round((Date.now() - t0) / 100) / 10 };
}

async function contenido(fileId) {
    const r = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
    return Buffer.from(r.data);
}

async function metadatos(fileId) {
    const r = await drive.files.get({ fileId, fields: CAMPOS });
    return r.data;
}

/**
 * ¿Está el fichero dentro de una carpeta de GASTOS ({raíz}/{año}/{mes}/fichero)?
 * Solo ahí se escriben appProperties: una ruta no puede marcar cualquier fichero
 * del Drive. Devuelve { linea, anio, mes } o null.
 */
async function ubicarGasto(f) {
    const mesId = f.parents?.[0];
    if (!mesId) return null;
    const mes = await metadatos(mesId).catch(() => null);
    const anio = mes?.parents?.[0] ? await metadatos(mes.parents[0]).catch(() => null) : null;
    const raiz = anio?.parents?.[0];
    // También las VENTAS CAE (las de Drive que no están en la app se leen y corrigen igual).
    const venta = raiz === VENTAS.CAE;
    const linea = venta ? 'CAE' : Object.keys(GASTOS).find(k => GASTOS[k] === raiz);
    const m = mes ? mesDeCarpeta(mes.name) : null;
    if (!linea || !m || !/^\d{4}$/.test(String(anio?.name || '').trim())) return null;
    return { linea, anio: Number(anio.name.trim()), mes: m, venta };
}

async function escribir(fileId, props) {
    const r = await drive.files.update({ fileId, requestBody: { appProperties: props }, fields: CAMPOS });
    return r.data;
}

const hoy = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());

/**
 * Lee con Gemini los justificantes del trimestre que no están leídos (o cuyo
 * contenido ha cambiado: otra md5) y guarda lo leído en sus appProperties.
 * Nunca lee dos veces un fichero con la misma md5, salvo `forzar` con su id.
 * Tiene presupuesto de tiempo (nginx corta a los 120 s): lo que no da tiempo
 * queda en `quedan` y se lee en la siguiente llamada.
 */
async function leerPendientes({ anio, n }, { fileIds = null, forzar = false, presupuestoMs = 80000, concurrencia = 3, escribirEnDrive = true } = {}) {
    const t0 = Date.now();
    const { filas, vecinos } = await listarGastos({ anio, n });
    const pedidos = fileIds ? new Set([].concat(fileIds)) : null;
    const cola = [...filas, ...vecinos].filter(g => {
        if (pedidos && !pedidos.has(g.fileId)) return false;
        if (g.estado === 'APP') return false;
        if (forzar && pedidos) return true;
        return g.estado === 'SIN_LEER' || g.estado === 'CAMBIADO';
    });
    const leidos = [];
    const errores = [];
    const tokens = { in: 0, out: 0 };
    let i = 0;
    const trabajador = async () => {
        while (i < cola.length) {
            if (Date.now() - t0 > presupuestoMs) return;
            const g = cola[i++];
            try {
                const buf = await contenido(g.fileId);
                const { datos, tokens: tk } = await leerJustificante(buf, g.mime);
                tokens.in += tk.in || 0; tokens.out += tk.out || 0;
                // Una lectura nueva borra lo corregido a mano de los DATOS (era de
                // otro contenido) pero conserva la actividad, que es de la carpeta.
                const props = codificar({
                    v: VERSION, md5: g.md5, at: hoy(), rev: null, error: null,
                    ...Object.fromEntries(DATOS.map(k => [k, datos[k] ?? null])),
                    tipo: null, deducible_pct: null, irpf_deducible_pct: null,
                });
                if (escribirEnDrive) await escribir(g.fileId, props);
                leidos.push({ fileId: g.fileId, nombre: g.nombre, datos });
            } catch (e) {
                errores.push({ fileId: g.fileId, nombre: g.nombre, error: e.message });
                // El error también se anota (con la md5): no se reintenta en bucle
                // cada vez que se pulsa «Leer»; se reintenta con `forzar`.
                if (escribirEnDrive && e.status !== 503) {
                    await escribir(g.fileId, codificar({ v: VERSION, md5: g.md5, at: hoy(), error: String(e.message).slice(0, 90) })).catch(() => { });
                }
            }
        }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrencia) }, trabajador));
    return { leidos, errores, quedan: Math.max(0, cola.length - leidos.length - errores.length), tokens, segundos: Math.round((Date.now() - t0) / 100) / 10 };
}

/**
 * Corrige a mano lo leído de un gasto (y lo marca REVISADO si se pide). Los
 * datos se validan aquí; el criterio fiscal lo vuelve a aplicar el código.
 */
const TIPOS = ['GASTO_CORRIENTE', 'ISP', 'COMBUSTIBLE', 'VEHICULO', 'TICKET_SIN_NIF', 'RESTAURACION', 'TASA', 'RECIBO', 'INVERSION', 'BONO_CAE', 'NO_GASTO'];
const ACTIVIDADES = ['CAE', 'ING', 'COMUN'];

async function corregir(fileId, cambios = {}, { revisado = undefined } = {}) {
    const f = await metadatos(fileId).catch(() => null);
    if (!f) throw error('El fichero no existe en Drive', 404);
    const donde = await ubicarGasto(f);
    if (!donde) throw error('Ese fichero no está en una carpeta de GASTOS (ni de VENTAS CAE) de contabilidad', 403);

    const limpio = {};
    for (const k of donde.venta ? DATOS_VENTA : [...DATOS, ...AJUSTES]) {
        if (!(k in cambios)) continue;
        let v = cambios[k];
        if (v === '' || v === null) { limpio[k] = null; continue; }
        if (NUMERICOS.has(k)) {
            v = numeroEs(v);
            if (v == null) throw error(`«${k}» no es un número`);
            if ((k === 'deducible_pct' || k === 'irpf_deducible_pct') && (v < 0 || v > 100)) throw error(`«${k}» va de 0 a 100`);
        } else if (k === 'fecha') {
            v = fechaDesdeLiteral(v) || (/^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : null);
            if (!v) throw error('La fecha no se entiende (dd/mm/aaaa)');
        } else if (k === 'tipo') {
            v = String(v).toUpperCase();
            if (!TIPOS.includes(v)) throw error(`Tipo «${v}» desconocido (hay: ${TIPOS.join(', ')})`);
        } else if (k === 'actividad') {
            v = sinTildes(v).replace(/^COMUNES?$/, 'COMUN');
            if (!ACTIVIDADES.includes(v)) throw error('La actividad es CAE, ING o COMUN');
        } else if (k === 'documento') {
            v = String(v).toUpperCase();
            if (!(donde.venta ? DOCUMENTOS_VENTA : DOCUMENTOS).includes(v)) throw error(`Documento «${v}» desconocido`);
        } else if (k === 'autofactura') {
            v = v === true || v === '1' || v === 'true';
        } else if (k === 'naturaleza') {
            v = String(v).toUpperCase();
            if (!NATURALEZAS.includes(v)) throw error(`Naturaleza «${v}» desconocida`);
        } else if (k === 'moneda') {
            v = (String(v).toUpperCase().match(/^[A-Z]{3}$/) || [null])[0];
            if (!v) throw error('La moneda es un código de 3 letras (EUR, USD…)');
        } else if (k === 'nif' || k === 'nif_destinatario') {
            v = nif(v);
        } else {
            v = txt(v, 120);
        }
        limpio[k] = v;
    }
    const props = codificar({
        ...limpio,
        // Un fichero que se corrige sin haberse leído queda «leído» con su md5:
        // lo que se teclea manda y no se pisa con una lectura automática.
        ...(decodificar(f.appProperties).leido ? {} : { v: VERSION, md5: f.md5Checksum || 'manual', at: hoy() }),
        ...(revisado === true ? { rev: '1' } : revisado === false ? { rev: null } : {}),
    });
    if (!Object.keys(props).length) throw error('No hay nada que cambiar');
    const nuevo = await escribir(fileId, props);
    if (donde.venta) return { venta: true, ...filaVenta(nuevo, { linea: 'CAE', anio: donde.anio, mes: donde.mes }) };
    return filaGasto(nuevo, { linea: donde.linea, anio: donde.anio, mes: donde.mes, vecino: false });
}

/**
 * Marca (fecha AAAA-MM-DD) o desmarca (null) el COBRO de una venta CAE de Drive,
 * en `brk_cobro_fecha` del propio fichero. Solo en un fichero de «CAE / FACTURAS
 * VENTAS / {año} / {mes}» (403 si no). `comprobar(fila)` puede rechazar ANTES de
 * escribir (lo usa contabilidadService para no marcar una factura de la app).
 * Toca SOLO esa clave: lo leído, la md5 y el «revisado» se quedan como estaban.
 */
async function marcarCobroVenta(fileId, fecha, { comprobar = null } = {}) {
    if (fecha != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) throw error('La fecha del cobro va como AAAA-MM-DD');
    const f = await metadatos(fileId).catch(() => null);
    if (!f) throw error('El fichero no existe en Drive', 404);
    const donde = await ubicarGasto(f);
    if (!donde?.venta) throw error('Ese fichero no está en una carpeta de VENTAS CAE de contabilidad', 403);
    const antes = filaVenta(f, { linea: 'CAE', anio: donde.anio, mes: donde.mes });
    if (comprobar) await comprobar(antes);
    const nuevo = await escribir(fileId, codificar({ cobro_fecha: fecha ?? null }));
    return filaVenta(nuevo, { linea: 'CAE', anio: donde.anio, mes: donde.mes });
}

// ── Escritura del paquete (solo la llama contabilidadService fuera de «seco») ──

async function carpeta(padre, nombre, { crear = false } = {}) {
    const safe = nombre.replace(/'/g, "\\'");
    const r = await drive.files.list({ q: `'${padre}' in parents and name = '${safe}' and mimeType = '${CARPETA}' and trashed = false`, fields: 'files(id)', pageSize: 1 });
    if (r.data.files?.[0]) return r.data.files[0].id;
    if (!crear) return null;
    const c = await drive.files.create({ requestBody: { name: nombre, mimeType: CARPETA, parents: [padre] }, fields: 'id' });
    if (!c.data.id) throw error(`No se pudo crear la carpeta «${nombre}»`, 502);
    return c.data.id;
}

async function nombresEn(folderId) {
    if (!folderId) return new Set();
    return new Set((await hijos(folderId)).filter(f => f.mimeType !== CARPETA).map(f => f.name));
}

/**
 * Lo que ya cuelga de una carpeta, hasta `niveles` de hondo: Map(nombre del
 * fichero → su subcarpeta relativa, «02 SL - FACTURAS RECIBIDAS/A - CAE»).
 */
async function nombresBajo(folderId, niveles = 3) {
    const out = new Map();
    if (!folderId) return out;
    let nivel = [{ id: folderId, ruta: '' }];
    for (let k = 0; k < niveles && nivel.length; k++) {
        const de = Object.fromEntries(nivel.map(c => [c.id, c.ruta]));
        const siguiente = [];
        for (const f of await hijos(nivel.map(c => c.id))) {
            const padre = (f.parents || []).find(p => p in de);
            const base = padre ? de[padre] : '';
            if (f.mimeType === CARPETA) siguiente.push({ id: f.id, ruta: base ? `${base}/${f.name}` : f.name });
            else if (!out.has(f.name)) out.set(f.name, base);
        }
        nivel = siguiente;
    }
    return out;
}

async function copiar(fileId, destino, nombre) {
    const r = await drive.files.copy({ fileId, requestBody: { name: nombre, parents: [destino] }, fields: 'id, webViewLink' });
    return { id: r.data.id, link: r.data.webViewLink || null };
}

async function subir(destino, nombre, mime, buffer) {
    const { Readable } = require('stream');
    const r = await drive.files.create({ requestBody: { name: nombre, parents: [destino] }, media: { mimeType: mime, body: Readable.from(buffer) }, fields: 'id, webViewLink' });
    return { id: r.data.id, link: r.data.webViewLink || null };
}

module.exports = {
    // carpetas
    RAIZ_CONTABILIDAD, GASTOS, VENTAS, EXTRACTOS, ENTREGA_GESTORIA, RUTA, CONTRIBUYENTE, MESES,
    // listado y lectura
    listarGastos, listarVentas, aniosVentas, listarExtractos, extractosAutonomo, leerPendientes, leerJustificante, leerVentas, corregir, marcarCobroVenta, contenido,
    // paquete
    carpeta, nombresEn, nombresBajo, copiar, subir,
    // puros (pruebas)
    mesDeCarpeta, mesesAMirar, codificar, decodificar, normalizarLectura, normalizarVenta, filaGasto, filaVenta, cabe, propsLecturaVenta,
    TIPOS, ACTIVIDADES, DOCUMENTOS, NATURALEZAS, DOCUMENTOS_VENTA,
};
