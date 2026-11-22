// ─── gastoRapido.js ──────────────────────────────────────────────────────────
// El ALTA RÁPIDA de un gasto desde el móvil (botón «Gasto» del cuadro de mando,
// 22/11/2026, Fran: «que se pueda hacer desde el móvil de manera rápida, que haga
// un escaneo y se guarde como pdf la foto… en la carpeta correcta de contabilidad»).
//
// Dos pasos, los dos con un gesto del usuario:
//   1. preparar: la foto (ya escaneada por el navegador) o el PDF se LEE con
//      Gemini (gastosDrive.leerParaAlta) y se PROPONE: de quién es el gasto, a
//      qué carpeta y mes va, con qué nombre, y su criterio fiscal (fiscalGasto,
//      el mismo de Trimestres). No escribe nada.
//   2. alta: el PDF final se SUBE a su carpeta ya leído (gastosDrive.subirGasto).
//      La carpeta y el nombre los vuelve a decidir el servidor: no se fían del
//      navegador.
//
// REGLA — de quién es: a nombre de quién va la factura (el NIF del destinatario)
// manda; sin él, el gasoil y el coche van al AUTÓNOMO (así están en Drive: los
// PLENERGY, el IVTM, el taller) y lo demás a la SOCIEDAD, en la carpeta CAE (la
// de los gastos generales de la SL desde 2026: comidas, IKEA, Amazon). Se cambia
// con un toque antes de guardar.
//
// REGLA — a qué mes: el de la fecha de la factura, salvo que su trimestre ya
// esté cerrado (pasó el plazo del 303, está presentado en los datos fiscales o
// ya se preparó su paquete para la gestoría): entonces al mes de HOY, que es
// cuando se recibe (y por la regla del trimestre más tardío, cuenta ahí).
//
// Doc: docs/conocimiento/facturacion/alta-rapida-de-gastos-desde-el-movil.md
// ─────────────────────────────────────────────────────────────────────────────
const gastosDrive = require('./gastosDrive');
const conta = require('./contabilidadService');

const error = (msg, status = 400) => Object.assign(new Error(msg), { status });
const hoyMadrid = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid' }).format(new Date());
const esIso = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

const MAX_PAGINAS = 6;
const MAX_IMAGEN = 8 * 1024 * 1024;
const MAX_PDF = 15 * 1024 * 1024;
const LINEA = { SL: 'CAE', AUTONOMO: 'FML' };
const CONTRIBUYENTES = Object.keys(LINEA);

// ── Lo que llega del navegador ──────────────────────────────────────────────

/** «data:image/jpeg;base64,…» o el base64 solo → { buf, mime } (por los bytes, no por lo que diga). */
function decodificar(b64) {
    const s = String(b64 || '');
    const buf = Buffer.from(s.includes(',') ? s.slice(s.indexOf(',') + 1) : s, 'base64');
    let mime = null;
    if (buf[0] === 0xff && buf[1] === 0xd8) mime = 'image/jpeg';
    else if (buf.slice(0, 4).toString('hex') === '89504e47') mime = 'image/png';
    else if (buf.slice(0, 4).toString('latin1') === '%PDF') mime = 'application/pdf';
    return { buf, mime };
}

function documentoDe({ imagenes, pdf }) {
    if (Array.isArray(imagenes) && imagenes.length) {
        if (imagenes.length > MAX_PAGINAS) throw error(`Como mucho ${MAX_PAGINAS} páginas por gasto`);
        const out = imagenes.map(decodificar);
        if (out.some(x => !['image/jpeg', 'image/png'].includes(x.mime))) throw error('Las fotos van en JPEG o PNG');
        if (out.some(x => x.buf.length > MAX_IMAGEN)) throw error('Una de las fotos pesa demasiado');
        return { imagenes: out };
    }
    const p = pdfDe(pdf);
    return { pdf: p };
}

function pdfDe(pdf) {
    const { buf, mime } = decodificar(pdf);
    if (!buf.length) throw error('Falta el documento');
    if (mime !== 'application/pdf') throw error('El documento no es un PDF');
    if (buf.length > MAX_PDF) throw error('El PDF pesa demasiado (más de 15 MB)');
    return buf;
}

// ── Las decisiones (puras) ──────────────────────────────────────────────────

/** De quién es el gasto, y por qué. `nifs`: { nifSl, nifAutonomo } de facturacion_emisores. */
function contribuyenteDe(datos = {}, { nifSl = null, nifAutonomo = null } = {}) {
    const dest = conta.nifEs(datos.nif_destinatario);
    if (dest && nifAutonomo && dest === conta.nifEs(nifAutonomo)) return { contribuyente: 'AUTONOMO', motivo: 'La factura va a tu nombre: gasto del autónomo.' };
    if (dest && nifSl && dest === conta.nifEs(nifSl)) return { contribuyente: 'SL', motivo: 'La factura va a nombre de la sociedad.' };
    if (['COMBUSTIBLE', 'VEHICULO'].includes(datos.naturaleza)) return { contribuyente: 'AUTONOMO', motivo: 'El gasoil y el coche van al autónomo, como siempre.' };
    if (dest) return { contribuyente: 'SL', motivo: 'La factura va a otro NIF: mira a nombre de quién está.' };
    return { contribuyente: 'SL', motivo: 'Gasto de la sociedad.' };
}

/**
 * A qué carpeta de mes va: { anio, mes, motivo }. `cerrado(T)` dice por qué un
 * trimestre ya no admite gastos (texto) o null.
 */
function mesDestino(fecha, hoy, cerrado = () => null) {
    const deHoy = { anio: Number(hoy.slice(0, 4)), mes: Number(hoy.slice(5, 7)) };
    if (!esIso(fecha)) return { ...deHoy, motivo: 'Sin fecha leída: va al mes de hoy.' };
    if (fecha > hoy) return { ...deHoy, motivo: 'La fecha leída es posterior a hoy: va al mes de hoy.' };
    const anio = Number(fecha.slice(0, 4));
    const mes = Number(fecha.slice(5, 7));
    const n = Math.ceil(mes / 3);
    const porque = cerrado({ anio, n });
    if (porque && !(anio === deHoy.anio && Math.ceil(deHoy.mes / 3) === n)) {
        return { ...deHoy, motivo: `El ${n}.º trimestre de ${anio} ya está cerrado (${porque}): va al mes de hoy, que es cuando se recibe.` };
    }
    return { anio, mes, motivo: null };
}

const sinMarcas = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Lo que no puede ir en un nombre de fichero de Drive/Windows, fuera; espacios simples. */
const limpiaNombre = (s) => sinMarcas(s).replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * «2026-11-20 - IKEA IBERICA - 0123456 - escritorio despacho.pdf», como los que
 * ya hay en Drive (sin tildes; el número y el concepto, si los hay).
 */
function nombreGasto(datos = {}, hoy = hoyMadrid()) {
    const fecha = esIso(datos.fecha) && datos.fecha <= hoy ? datos.fecha : hoy;
    const prov = limpiaNombre(conta.proveedorCorto(datos.proveedor)).slice(0, 50) || 'PROVEEDOR';
    const numero = limpiaNombre(String(datos.numero || '').replace(/[\\/]/g, '-')).slice(0, 40);
    const concepto = limpiaNombre(datos.concepto).toLowerCase().slice(0, 60).trim();
    return `${[fecha, prov, numero, concepto].filter(Boolean).join(' - ')}.pdf`;
}

/** Lo que se enseña del criterio fiscal (lo decide `fiscalGasto`, el de Trimestres). */
function resumenFiscal(f) {
    return {
        tipo: f.tipo, tipo_texto: f.tipo_texto, total: f.total, base: f.base, cuota: f.cuota, iva_pct: f.iva_pct,
        deducible_pct: f.deducible_pct, iva_deducible: f.iva_deducible, inversion: f.inversion, avisos: f.avisos,
    };
}

// ── Lo que lee la BD y Drive ────────────────────────────────────────────────

/**
 * ¿Por qué el trimestre T ya no admite gastos de `contribuyente`? Texto o null.
 * Pasó el plazo del 303 · su 303 está anotado como pagado en los datos fiscales ·
 * ya existe su carpeta en ENTREGA GESTORÍA (el paquete se preparó).
 */
async function porQueCerrado(T, { hoy, contribuyente }) {
    if (hoy > conta.plazos(T).m303) return 'pasó el plazo del 303';
    const datos = await require('./impuestosEmpresa').leerDatos();
    if ((datos.pagos || []).some(p => p.anio === T.anio && p.modelo === '303' && p.periodo === `T${T.n}` && p.contribuyente === contribuyente)) return 'su 303 ya está presentado';
    const etiqueta = conta.nombreCarpetaPaquete(conta.parseTrimestre(`${T.anio}-T${T.n}`));
    if (await gastosDrive.carpeta(gastosDrive.ENTREGA_GESTORIA, etiqueta)) return 'ya se preparó su paquete para la gestoría';
    return null;
}

/** Carpeta, mes, nombre y criterio fiscal para UN contribuyente. */
async function opcion(datos, contribuyente, { hoy, ctx }) {
    const linea = LINEA[contribuyente];
    // Solo hace falta saber si está cerrado el trimestre de la FECHA (el de hoy nunca lo está).
    const f = esIso(datos.fecha) && datos.fecha <= hoy ? datos.fecha : null;
    const T = f ? { anio: Number(f.slice(0, 4)), n: Math.ceil(Number(f.slice(5, 7)) / 3) } : null;
    const porque = T ? await porQueCerrado(T, { hoy, contribuyente }) : null;
    const m = mesDestino(datos.fecha, hoy, () => porque);
    const c = await gastosDrive.carpetaMesGastos(linea, m.anio, m.mes);
    const nombre = nombreGasto(datos, hoy);
    const fiscal = conta.fiscalGasto({ datos, contribuyente, linea, nombre }, ctx);
    return {
        contribuyente, linea, anio: m.anio, mes: m.mes, trimestre: `${m.anio}-T${Math.ceil(m.mes / 3)}`,
        carpeta: c.ruta, carpeta_nueva: !c.existe, motivo_mes: m.motivo, nombre, fiscal: resumenFiscal(fiscal),
    };
}

/**
 * Paso 1: lee y propone. No escribe nada (ni en Drive ni en la BD).
 * @param body { imagenes?: [base64 JPEG/PNG], pdf?: base64 }
 */
async function preparar(body = {}, { hoy = hoyMadrid() } = {}) {
    const t0 = Date.now();
    const doc = documentoDe(body);
    const { datos, cajas, tokens } = await gastosDrive.leerParaAlta(doc);
    const quien = await conta.emisores();
    await conta.precargarCambios([{ datos }]);
    const ctx = conta.ctxFiscal(quien);
    const propuesta = contribuyenteDe(datos, { nifSl: quien.sl.nif, nifAutonomo: quien.autonomo.nif });
    const [SL, AUTONOMO] = await Promise.all([opcion(datos, 'SL', { hoy, ctx }), opcion(datos, 'AUTONOMO', { hoy, ctx })]);
    return {
        datos, cajas, propuesta: propuesta.contribuyente, motivo: propuesta.motivo, opciones: { SL, AUTONOMO },
        tokens, segundos: Math.round((Date.now() - t0) / 100) / 10,
    };
}

/**
 * Paso 2: sube el PDF a su carpeta, ya leído. `seco`: devuelve el plan sin subir.
 * @param body { pdf: base64, contribuyente: 'SL'|'AUTONOMO', datos: {…lo leído, con lo corregido} }
 */
async function alta(body = {}, { hoy = hoyMadrid(), seco = false } = {}) {
    const contribuyente = String(body.contribuyente || '').toUpperCase();
    if (!CONTRIBUYENTES.includes(contribuyente)) throw error('¿De quién es el gasto? SL o AUTONOMO');
    // En seco el PDF sobra: la pantalla lo usa para recalcular carpeta, nombre y
    // criterio fiscal al corregir un dato o cambiar de contribuyente.
    const pdf = seco && !body.pdf ? null : pdfDe(body.pdf);
    const entrada = Object.fromEntries(Object.entries(body.datos || {}).filter(([k]) => gastosDrive.DATOS.includes(k)));
    const datos = gastosDrive.limpiarCambios(entrada);
    if (!datos.proveedor) throw error('Falta el proveedor');
    if (datos.total == null && datos.base == null) throw error('Falta el importe');
    const quien = await conta.emisores();
    await conta.precargarCambios([{ datos }]);
    const o = await opcion(datos, contribuyente, { hoy, ctx: conta.ctxFiscal(quien) });
    if (seco) return { seco: true, ...o, bytes: pdf ? pdf.length : null };
    const fila = await gastosDrive.subirGasto({ linea: o.linea, anio: o.anio, mes: o.mes, nombre: o.nombre, pdf, datos });
    return { ...o, nombre: fila.nombre, carpeta: fila.ruta, fileId: fila.fileId, link: fila.link, ya_estaba: fila.yaEstaba };
}

module.exports = { preparar, alta, contribuyenteDe, mesDestino, nombreGasto, decodificar, LINEA };
