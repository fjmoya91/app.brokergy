// ============================================================================
// cartaPagoService.js — la CARTA DE PAGO del Bono CAE (2026-10-22).
// ----------------------------------------------------------------------------
// Cuando se sube el justificante de la transferencia en la fase 7 del lote
// (`pagoClientesService.registrarTransferencia`), cada expediente pagado tiene
// su carta: un PDF de UNA hoja con el importe, la cuenta (solo las 4 últimas
// cifras) y la petición de reseña. Se guarda en «5. FACTURAS» del expediente y
// sale adjunta al aviso de transferencia (WhatsApp + email).
//
//   1. DATOS. Del propio cobro: lo que se ordenó en la remesa (importe y fecha de
//      ejecución) y las cuentas ya enmascaradas. El IBAN entero NO se lee aquí.
//   2. PLANTILLA. `plantillas/carta_pago_bono_cae.html`, diseño CERRADO: solo se
//      sustituyen las {{variables}}, escapadas. Fuentes, logo y QR incrustados.
//   3. RENDER con el Chrome de `pdfService` y CONTROL DE CALIDAD antes de guardar
//      (1 página, nada desbordado, ninguna variable sin sustituir, enlace de la
//      reseña clicable). Si algo falla no se guarda ni se envía nada y queda una
//      incidencia en el expediente.
//   4. NÚMERO CP-AAAA-NNNN, correlativo por año, de la tabla `cartas_pago`
//      (RPC `carta_pago_numero`): regenerar o reenviar conserva el número.
//
// REGLA — la carta solo existe con la transferencia HECHA (`cobro.transferencia`).
// La prueba (`prueba: true`) la compone con lo que se ORDENARÍA, sin numerar, sin
// guardar y sin escribir nada.
//
// REGLA — el envío nace con visto bueno (popup de la fase 7). `CARTA_PAGO_ENVIO_AUTO`
// = true la manda sola al subir el justificante; apagado en local, como todo lo que
// sale a clientes desde el portátil (local escribe en producción).
// ============================================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const cobroService = require('./cobroService');

const PLANTILLA = path.join(__dirname, '../plantillas/carta_pago_bono_cae.html');
// La ficha de Google Business de BROKERGY (la misma del diseño aprobado).
const RESENA_URL_DEFECTO = 'https://search.google.com/local/writereview?placeid=ChIJW00n1QqKXGMRLwQXmfKJU-U';
const ALTO_HOJA = 1123;

const VARIABLES = [
    'numero_carta', 'fecha_emision', 'nombre_saludo', 'importe', 'fecha_pago',
    'titular_nombre', 'titular_nif', 'vivienda_direccion', 'ref_catastral', 'instalador',
    'actuacion', 'expediente', 'ahorro_kwh', 'cuenta_abono', 'resena_url',
];

// Lo que se imprime en «Actuación» (≤ 32 caracteres), por ficha.
const ACTUACION_POR_FICHA = {
    RES060: 'Aerotermia · cambio de caldera',
    RES093: 'Aerotermia · hibridación',
    RES080: 'Reforma energética de vivienda',
    TER100: 'Aerotermia · sector terciario',
    TER173: 'Hibridación · sector terciario',
};

const envioAuto = () => String(process.env.CARTA_PAGO_ENVIO_AUTO || '').toLowerCase() === 'true';
const enlaceResena = () => String(process.env.GOOGLE_RESENA_URL || '').trim() || RESENA_URL_DEFECTO;

// ─── Plantilla ───────────────────────────────────────────────────────────────

let _plantilla = null;
const plantilla = () => (_plantilla ??= fs.readFileSync(PLANTILLA, 'utf8'));

const escapar = (v) => String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/**
 * Sustituye las {{variables}} escapando su valor. Una variable sin dato es un
 * ERROR, nunca un hueco: una carta de pago con «Titular: » no se manda.
 */
function rellenar(html, datos) {
    const faltan = [];
    const out = html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => {
        const v = datos[k];
        if (v === null || v === undefined || String(v).trim() === '') { faltan.push(k); return ''; }
        return escapar(v);
    });
    if (faltan.length) {
        const e = new Error(`Faltan datos para la carta de pago: ${[...new Set(faltan)].join(', ')}`);
        e.status = 422; e.faltan = [...new Set(faltan)];
        throw e;
    }
    return out;
}

// ─── Formatos ────────────────────────────────────────────────────────────────

const eur2 = (n) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
const entero = (n) => Math.round(Number(n)).toLocaleString('es-ES', { maximumFractionDigits: 0, useGrouping: 'always' });

/** Date | 'AAAA-MM-DD' | ISO → 'DD/MM/AAAA' (en Madrid). */
function fechaEs(v) {
    if (!v) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
        const [a, m, d] = String(v).split('-');
        return `${d}/${m}/${a}`;
    }
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
}

const hoyMadrid = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date());

/** Las 4 últimas cifras de una cuenta, enmascarada o no. */
const ultimas4 = (s) => (String(s || '').replace(/\D/g, '').slice(-4) || null);

/** «ES•• •••• … 1234»; con varias cuentas (cedentes), las terminaciones. */
function cuentaAbono(ultimos4) {
    const l = (ultimos4 || []).filter(Boolean);
    if (!l.length) return null;
    if (l.length === 1) return `ES•• •••• •••• •••• •••• ${l[0]}`;
    return l.map(u => `•••• ${u}`).join(' · ');
}

// ─── Datos del expediente ────────────────────────────────────────────────────

let _finMod = null;
const loadFinancials = () => (_finMod ??= import(pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/logic/expedienteFinancials.js')).href));

const limpia = (s) => String(s || '').replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * «C/ HUERTO PEDRERO, 20 · CAMPO DE CRIPTANA»: la dirección de la OBRA. Con «¿misma
 * dirección que el cliente? → Sí» manda la ficha del cliente, en vivo; con «No», la de la
 * instalación. Espejo de `buildDocMeta` (anexoFotograficoService), escrito AQUÍ: el
 * contenedor del backend solo lleva lo que está en el repo.
 */
async function direccionVivienda(exp, cli) {
    const inst = exp.instalacion || {};
    const dc = exp.oportunidades?.datos_calculo || {};
    const op = { ...dc, ...(dc.inputs || {}) };
    const md = String(inst.misma_direccion ?? '').trim().toUpperCase();
    const usaCli = !(inst.misma_direccion === false || md === 'NO' || md === 'FALSE');
    const sigue = usaCli && String(cli?.direccion || '').trim() ? cli : null;
    const calle = limpia(sigue?.direccion || [inst.direccion, inst.num].filter(Boolean).join(' ') || op.direccion || op.address);
    const muni = limpia(sigue?.municipio || inst.municipio || op.municipio);
    return [calle, muni].filter(Boolean).join(' · ').toUpperCase() || null;
}

/** Lo que la carta necesita y `cargarExpediente` no trae: la dirección del cliente y el instalador. */
async function extras(exp) {
    const [{ data: cli }, { data: e2 }] = await Promise.all([
        supabase.from('clientes')
            .select('direccion, codigo_postal, municipio, provincia, ccaa')
            .eq('id_cliente', exp.cliente_id).maybeSingle(),
        supabase.from('expedientes')
            .select('instalador_asociado_id, prescriptores!instalador_asociado_id(razon_social, acronimo)')
            .eq('id', exp.id).maybeSingle(),
    ]);
    return { cli: cli || {}, instalador: e2?.prescriptores?.razon_social || null };
}

/**
 * Las variables de la plantilla y lo que acompaña al envío. Con `prueba` se usa lo
 * que se ORDENARÍA (la misma cuenta que la remesa) si aún no hay remesa.
 */
async function datosDe(exp, { numero, fechaEmision, prueba = false } = {}) {
    const cobro = exp.documentacion?.cobro || {};
    let importe = cobro.transferencia?.importe ?? cobro.remesa?.importe ?? null;
    let fechaPago = cobro.remesa?.fecha_ejecucion || (cobro.transferencia?.at ? cobro.transferencia.at : null);
    let ult = (cobro.remesa?.cuentas || []).map(c => ultimas4(c.mascara));
    if (prueba && (importe == null || !ult.length)) {
        const pago = await require('./pagoClientesService').pagoDeExpediente(exp);
        if (importe == null) importe = pago.importe;
        if (!ult.length) ult = (pago.pagos || []).map(p => ultimas4(p.iban));
        if (!fechaPago) fechaPago = hoyMadrid();
    }

    const c = exp.clientes || {};
    const { cli, instalador } = await extras(exp);
    const { computeExpedienteFinancials } = await loadFinancials();
    const fin = computeExpedienteFinancials(exp) || {};
    const ficha = String(exp.oportunidades?.ficha || fin.ficha || '').toUpperCase();
    const inst = exp.instalacion || {};
    const dc = exp.oportunidades?.datos_calculo || {};
    const rc = inst.ref_catastral || dc.inputs?.rc || dc.inputs?.ref_catastral || dc.rc || null;
    const titular = `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.replace(/\s+/g, ' ').trim();
    const nombreSaludo = cobroService.primerNombre(exp);

    const datos = {
        numero_carta: numero,
        fecha_emision: fechaEs(fechaEmision || hoyMadrid()),
        nombre_saludo: nombreSaludo,
        importe: importe != null ? eur2(importe) : null,
        fecha_pago: fechaEs(fechaPago),
        titular_nombre: titular.toUpperCase() || null,
        titular_nif: String(c.dni || '').toUpperCase().trim() || null,
        vivienda_direccion: await direccionVivienda(exp, { ...c, ...cli }),
        ref_catastral: rc ? String(rc).toUpperCase().trim() : null,
        instalador: instalador ? instalador.toUpperCase() : null,
        actuacion: ACTUACION_POR_FICHA[ficha] || 'Ahorro energético',
        expediente: exp.numero_expediente,
        ahorro_kwh: Number(fin.savingsKwhVerificado) > 0 ? entero(fin.savingsKwhVerificado) : null,
        cuenta_abono: cuentaAbono(ult),
        resena_url: enlaceResena(),
    };
    return { datos, importe, ultimos4: ult.filter(Boolean) };
}

/** Juego de datos de ejemplo (el del encargo): pruebas y vista de diseño. */
function datosEjemplo() {
    return {
        numero_carta: 'CP-2026-0001', fecha_emision: '22/10/2026', nombre_saludo: 'María',
        importe: '1.370,00', fecha_pago: '21/10/2026', titular_nombre: 'MARÍA GARCÍA LÓPEZ',
        titular_nif: '12345678Z', vivienda_direccion: 'C/ EJEMPLO, 1 · TOMELLOSO',
        ref_catastral: '1234567VJ1213S0001AB', instalador: 'INSTALACIONES EJEMPLO SL',
        actuacion: 'Aerotermia · cambio de caldera', expediente: 'EXP-0001', ahorro_kwh: '12.450',
        cuenta_abono: cuentaAbono(['1234']), resena_url: RESENA_URL_DEFECTO,
    };
}

// ─── Render y control de calidad ─────────────────────────────────────────────

/** Los URI de las anotaciones de enlace del PDF. */
async function enlacesDelPdf(buffer) {
    const { PDFDocument, PDFName, PDFDict, PDFArray, PDFString, PDFHexString } = require('pdf-lib');
    const doc = await PDFDocument.load(buffer);
    const uris = [];
    for (const page of doc.getPages()) {
        const annots = page.node.lookup(PDFName.of('Annots'));
        if (!(annots instanceof PDFArray)) continue;
        for (let i = 0; i < annots.size(); i++) {
            const a = annots.lookup(i);
            const act = a instanceof PDFDict ? a.lookup(PDFName.of('A')) : null;
            const uri = act instanceof PDFDict ? act.lookup(PDFName.of('URI')) : null;
            if (uri instanceof PDFString || uri instanceof PDFHexString) uris.push(uri.decodeText());
        }
    }
    return { paginas: doc.getPageCount(), uris };
}

// Si la hoja no cabe, se recorta ANTES de dar la carta por mala: titular, vivienda
// e instalador admiten 2 líneas; luego solo la vivienda (la que casi siempre las
// necesita: «C/ HUERTO PEDRERO, 20 · CAMPO DE CRIPTANA» ya no cabe en una); y por
// último todo a una línea con elipsis. El diseño no se toca.
const ESCALONES = [
    '',
    '<style>.cp-celda-2:not(.cp-vivienda){display:block;white-space:nowrap}</style>',
    '<style>.cp-celda-2{display:block;white-space:nowrap}</style>',
];

/**
 * HTML → PDF y las cuatro comprobaciones, con los escalones de recorte. Devuelve
 * `{ pdf, fallos, medidas }`; con algún fallo el PDF NO vale.
 */
async function renderizar(html, opts = {}) {
    let r = null;
    for (const css of ESCALONES) {
        r = await renderizarUna(css ? html.replace('</head>', `${css}</head>`) : html, opts);
        if (!r.fallos.some(f => f.startsWith('El contenido no cabe'))) return r;
    }
    return r;
}

async function renderizarUna(html, { resenaUrl } = {}) {
    const fallos = [];
    if (/\{\{/.test(html)) fallos.push('Queda alguna variable {{…}} sin sustituir');
    const { getBrowser } = require('./pdfService');
    let browser = null;
    let page = null;
    let pdf = null;
    let medidas = {};
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: ALTO_HOJA, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'load', timeout: 60000 });
        await page.evaluate(() => document.fonts.ready);
        medidas = await page.evaluate(() => {
            const hoja = document.body.firstElementChild;
            // Las celdas recortadas con elipsis (dato demasiado largo para su sitio).
            const recortadas = Array.from(document.querySelectorAll('.cp-celda'))
                .filter(el => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
                .map(el => el.textContent);
            return {
                alto: hoja ? hoja.scrollHeight : null,
                ancho: hoja ? hoja.scrollWidth : null,
                fuentes: document.fonts.check('700 46px Antonio') && document.fonts.check('600 14px Inter'),
                recortadas,
            };
        });
        pdf = Buffer.from(await page.pdf({
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        }));
    } finally {
        if (page) await page.close().catch(() => {});
        if (browser) await browser.close().catch(() => {});
    }
    if (!(medidas.alto <= ALTO_HOJA)) fallos.push(`El contenido no cabe en la hoja (${medidas.alto} px de ${ALTO_HOJA})`);
    if (!(medidas.ancho <= 794)) fallos.push(`El contenido se sale de ancho (${medidas.ancho} px)`);
    if (!medidas.fuentes) fallos.push('No se han cargado las fuentes (Antonio / Inter)');
    const { paginas, uris } = await enlacesDelPdf(pdf);
    medidas.paginas = paginas;
    if (paginas !== 1) fallos.push(`El PDF tiene ${paginas} páginas (tiene que ser 1)`);
    if (resenaUrl && !uris.includes(resenaUrl)) fallos.push('El PDF no lleva el enlace clicable de la reseña');
    return { pdf, fallos, medidas };
}

// ─── Generar ─────────────────────────────────────────────────────────────────

const nombreFichero = (numExp, numero) => `CARTA_PAGO_${String(numExp).replace(/[\\/:*?"<>|]/g, '-')}_${numero}.pdf`;

async function registrarIncidencia(exp, texto, usuario) {
    try {
        await supabase.rpc('expediente_incidencia_append', {
            p_expediente_id: exp.id,
            p_incidencia: {
                id: `${Date.now()}_0_inc`,
                texto,
                procedencia: 'INTERNA',
                severidad: 'LEVE',
                slot: null,
                tipo: null,
                estado: 'ABIERTA',
                fecha: new Date().toISOString(),
                usuario: usuario || 'SISTEMA',
                resuelta_at: null,
                resuelta_por: null,
            },
        });
    } catch (e) { console.warn('[carta de pago] incidencia:', e.message); }
}

async function guardarEnDrive(exp, nombre, buffer) {
    const driveService = require('./driveService');
    const { SUBCARPETA_FACTURAS } = require('./reformaUploadService');
    const dc = exp.oportunidades?.datos_calculo || {};
    const raiz = dc.drive_folder_id || dc.inputs?.drive_folder_id;
    if (!raiz) throw Object.assign(new Error('El expediente no tiene carpeta de Drive'), { status: 409 });
    const carpeta = await driveService.getOrCreateSubfolderNormalized(raiz, SUBCARPETA_FACTURAS);
    if (!carpeta || carpeta === raiz) throw new Error(`No se pudo abrir «${SUBCARPETA_FACTURAS}» del expediente`);
    const previos = await driveService.findFilesByName(carpeta, nombre).catch(() => []);
    const saved = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', buffer);
    if (!saved?.id) throw new Error('Drive no devolvió el fichero guardado');
    for (const id of previos || []) if (id !== saved.id) await driveService.deleteFile(id).catch(() => {});
    return saved;
}

/** Los textos del envío (WhatsApp, asunto y texto plano del email) para ESTE expediente. */
async function textosDe(exp, { importe, ultimos4, numero, detalle = null }) {
    const { componerMensajeCartaPago } = await cobroService.loadCobroForm();
    const c = exp.clientes || {};
    return componerMensajeCartaPago({
        nombre: cobroService.primerNombre(exp),
        importe,
        ultimos4,
        numero,
        expediente: exp.numero_expediente,
        enlace: enlaceResena(),
        tercero: cobroService.esTercero(c),
        titular: require('./recordatorios').capitalizar(`${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim()) || null,
        partner: !!c.contacto_es_partner,
        detalle,
    });
}

// ─── El EMAIL de diseño (2026-10-22) ─────────────────────────────────────────
// `plantillas/email_carta_pago_bono_cae.html`, diseño APROBADO: tablas y estilos en
// línea (Gmail, Outlook, Apple Mail, móvil). Se manda al TITULAR; a su persona de
// contacto o al partner sale el texto corto, porque el diseño le habla al titular
// («tu cuenta», «tu reforma»).
//
// REGLA — las imágenes van ALOJADAS (Gmail no enseña base64), en
// `frontend/public/email/carta-pago/` → https://app.brokergy.es/email/carta-pago. Si
// alguna no responde 200 (p. ej. antes de desplegar) se incrustan como CID desde la
// copia de `plantillas/email_carta_pago/`, que Gmail sí enseña: el email nunca sale
// con las imágenes rotas.
const EMAIL_PLANTILLA = path.join(__dirname, '../plantillas/email_carta_pago_bono_cae.html');
const EMAIL_IMG_DIR = path.join(__dirname, '../plantillas/email_carta_pago');
// `dinero-cayendo.gif` se genera con scripts/gif_dinero_cayendo.py (Pillow).
// `logo-brokergy-blanco.png` es el del modo oscuro (ver el <style> de la plantilla).
const EMAIL_IMAGENES = ['logo-brokergy.png', 'logo-brokergy-blanco.png', 'logo-circular.png', 'qr-resena.png', 'dinero-cayendo.gif'];
const REMITENTE = '"Fran Moya · BROKERGY" <franciscojavier.moya@brokergy.es>';

const assetsUrl = () => String(process.env.CARTA_PAGO_ASSETS_URL || 'https://app.brokergy.es/email/carta-pago').replace(/\/+$/, '');
let _emailPlantilla = null;
const emailPlantilla = () => (_emailPlantilla ??= fs.readFileSync(EMAIL_PLANTILLA, 'utf8'));

const sinAutoenlace = (s) => String(s).replace(/(\d|\s)/g, '$1‌');

/** ¿Responden 200 las tres imágenes alojadas? */
async function imagenesAlojadas(base = assetsUrl()) {
    const r = await Promise.all(EMAIL_IMAGENES.map(async (f) => {
        try {
            const res = await fetch(`${base}/${f}`, { method: 'HEAD', signal: AbortSignal.timeout(6000) });
            return res.ok && /^image\//.test(res.headers.get('content-type') || '');
        } catch { return false; }
    }));
    return r.every(Boolean);
}

/**
 * Los mensajes de la carta de un expediente: WhatsApp, asunto, texto plano y —al
 * titular— el HTML de diseño. `html` es null cuando sale el texto corto.
 */
async function mensajesDe(exp, { numero, fechaEmision, prueba = false, assets = assetsUrl() } = {}) {
    const { datos, importe, ultimos4: u4 } = await datosDe(exp, { numero, fechaEmision, prueba });
    const c = exp.clientes || {};
    const conHtml = !cobroService.esTercero(c) && !c.contacto_es_partner;
    const textos = await textosDe(exp, { importe, ultimos4: u4, numero, detalle: conHtml ? datos : null });
    let html = null;
    if (conHtml) {
        html = rellenar(emailPlantilla(), {
            ...datos,
            // Gmail convierte una dirección postal en un enlace azul a Maps, que no es
            // el diseño. Un U+200C (invisible) tras cada cifra y cada espacio rompe su
            // detector sin cambiar lo que se ve (22/10/2026, 25RES060_29).
            vivienda_direccion: datos.vivienda_direccion && sinAutoenlace(datos.vivienda_direccion),
            iban_ultimos4: u4.join(' y '),
            assets_url: assets,
        });
    }
    return { ...textos, html, numero };
}

/** El HTML con las imágenes incrustadas como CID y sus adjuntos (si no están alojadas). */
function conImagenesCid(html, base) {
    let out = html;
    const attachments = EMAIL_IMAGENES.map((f) => {
        const cid = `${f.replace(/\W/g, '-')}@brokergy`;
        out = out.split(`${base}/${f}`).join(`cid:${cid}`);
        return { filename: f, path: path.join(EMAIL_IMG_DIR, f), cid, contentType: f.endsWith('.gif') ? 'image/gif' : 'image/png' };
    });
    return { html: out, attachments };
}

/**
 * Genera la carta de un expediente. Con `prueba`, sin numerar ni escribir nada.
 * @returns {{ numero, nombre, buffer, link, driveId, sha256, textos, medidas, prueba }}
 */
async function generar(expOrId, { usuario = null, prueba = false } = {}) {
    const exp = typeof expOrId === 'object' ? expOrId : await cobroService.cargarExpediente(expOrId);
    if (!exp) throw Object.assign(new Error('Expediente no encontrado'), { status: 404 });
    const cobro = exp.documentacion?.cobro || {};
    if (!prueba && !cobro.transferencia?.at) {
        throw Object.assign(new Error('Sin transferencia registrada: primero se sube el justificante del banco'), { status: 409 });
    }

    let numero;
    let fechaEmision = hoyMadrid();
    if (prueba) {
        const { data: ya } = await supabase.from('cartas_pago').select('numero, fecha_emision').eq('expediente_id', exp.id).maybeSingle();
        numero = ya?.numero || `CP-${fechaEmision.slice(0, 4)}-0000`;
        if (ya?.fecha_emision) fechaEmision = ya.fecha_emision;
    } else {
        const { data, error } = await supabase.rpc('carta_pago_numero', { p_expediente_id: exp.id, p_anio: Number(fechaEmision.slice(0, 4)) });
        if (error) throw new Error(`No se pudo numerar la carta: ${error.message}`);
        numero = (Array.isArray(data) ? data[0] : data)?.numero;
        // Regenerar conserva el número Y la fecha de emisión.
        const { data: fila } = await supabase.from('cartas_pago').select('fecha_emision, drive_id').eq('expediente_id', exp.id).maybeSingle();
        if (fila?.drive_id && fila?.fecha_emision) fechaEmision = fila.fecha_emision;
    }

    const { datos, importe } = await datosDe(exp, { numero, fechaEmision, prueba });
    let html;
    try {
        html = rellenar(plantilla(), datos);
    } catch (e) {
        if (!prueba) await registrarIncidencia(exp, `Carta de pago ${numero}: ${e.message}. No se ha enviado.`, usuario);
        throw e;
    }
    const { pdf, fallos, medidas } = await renderizar(html, { resenaUrl: datos.resena_url });
    if (fallos.length) {
        if (!prueba) await registrarIncidencia(exp, `Carta de pago ${numero} no supera el control de calidad: ${fallos.join(' · ')}. No se ha enviado.`, usuario);
        throw Object.assign(new Error(`La carta de pago no supera el control de calidad: ${fallos.join(' · ')}`), { status: 422, fallos });
    }

    const nombre = nombreFichero(exp.numero_expediente, numero);
    const sha256 = crypto.createHash('sha256').update(pdf).digest('hex');
    const textos = await mensajesDe(exp, { numero, fechaEmision, prueba });
    if (prueba) return { numero, nombre, buffer: pdf, sha256, textos, medidas, prueba: true };

    const saved = await guardarEnDrive(exp, nombre, pdf);
    const ahora = new Date().toISOString();
    const { error: upErr } = await supabase.from('cartas_pago').update({
        fecha_emision: fechaEmision, importe, pdf_sha256: sha256,
        drive_id: saved.id, drive_link: saved.link, generado_por: usuario || 'SISTEMA', updated_at: ahora,
    }).eq('expediente_id', exp.id);
    if (upErr) console.warn('[carta de pago] registro:', upErr.message);
    await cobroService.sellar(exp.id, {
        carta_pago: {
            numero, nombre, link: saved.link, driveId: saved.id, sha256,
            fecha_emision: fechaEmision, importe, at: ahora, por: usuario || 'SISTEMA',
            // Lo de un envío anterior se conserva: regenerar no "des-envía".
            enviada_at: cobro.carta_pago?.enviada_at || null,
            enviada_canales: cobro.carta_pago?.enviada_canales || null,
        },
    });
    return { numero, nombre, buffer: pdf, link: saved.link, driveId: saved.id, sha256, textos, medidas, prueba: false };
}

/** El PDF guardado de la carta (o, si no baja de Drive, se rehace con el MISMO número). */
async function pdfDe(exp, { usuario } = {}) {
    const reg = exp.documentacion?.cobro?.carta_pago;
    if (reg?.driveId) {
        const driveService = require('./driveService');
        const buf = await driveService.getFileContent(reg.driveId).catch(() => null);
        if (buf?.length) return { buffer: Buffer.from(buf), nombre: reg.nombre, numero: reg.numero, link: reg.link };
    }
    const g = await generar(exp, { usuario });
    return { buffer: g.buffer, nombre: g.nombre, numero: g.numero, link: g.link };
}

// ─── Enviar ──────────────────────────────────────────────────────────────────

const htmlEmail = (texto, enlace) => {
    const esc = escapar(texto).replace(/\r\n|\r|\n/g, '<br>');
    const conEnlace = enlace ? esc.split(escapar(enlace)).join(`<a href="${escapar(enlace)}" style="color:#bf360c">${escapar(enlace)}</a>`) : esc;
    return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#222;font-size:15px;line-height:24px">${conEnlace}</div>`;
};

/**
 * Manda la carta: por WhatsApp en TRES mensajes —el ingreso, el PDF como documento y
 * la reseña (25/10/2026)— y por email el PDF adjunto. `destino` permite mandarla a
 * OTRO teléfono/email (pruebas). Devuelve los canales por los que ha salido.
 */
async function enviar({ buffer, nombre, textos, tlf, email, channels = [] }) {
    const sent = [];
    const errores = [];
    if (channels.includes('whatsapp') && tlf) {
        try {
            const whatsappService = require('./whatsappService');
            const resena = String(textos.whatsapp_resena || '').trim();
            const r = await whatsappService.sendMedia(tlf, { base64: buffer.toString('base64'), mimetype: 'application/pdf', filename: nombre }, {
                caption: textos.whatsapp, splitCaption: true, asDocument: true,
                textoDespues: resena ? [resena] : undefined,
                // Sin la tarjeta del enlace de Google: gris, «search.google.com», encima del texto.
                linkPreview: false,
            });
            sent.push('WhatsApp');
            // El ingreso y la carta YA han llegado: si falla la reseña no se reintenta
            // (duplicaría los dos primeros); se dice para mandarla a mano.
            if (r?.despues && !r.despues.ok) errores.push(`WhatsApp (la reseña no salió: ${r.despues.error})`);
        } catch (e) { errores.push(`WhatsApp: ${e.message}`); }
    }
    if (channels.includes('email') && email) {
        try {
            const emailService = require('./emailService');
            const pdf = { filename: nombre, content: buffer, contentType: 'application/pdf' };
            let html = htmlEmail(textos.email, enlaceResena());
            let attachments = [pdf];
            if (textos.html) {
                // Comprobaciones antes de enviar: nada sin sustituir, PDF adjunto y las
                // imágenes alojadas respondiendo (si no, van incrustadas).
                if (/\{\{/.test(textos.html)) throw new Error('El email lleva variables sin sustituir');
                html = textos.html;
                const base = assetsUrl();
                if (!(await imagenesAlojadas(base))) {
                    const cid = conImagenesCid(html, base);
                    html = cid.html;
                    attachments = [pdf, ...cid.attachments];
                }
            }
            await emailService.sendMail({
                to: email, subject: textos.asunto, text: textos.email, html, attachments,
                from: REMITENTE, replyTo: 'franciscojavier.moya@brokergy.es',
            });
            sent.push('Email');
        } catch (e) { errores.push(`Email: ${e.message}`); }
    }
    return { sent, errores };
}

module.exports = {
    VARIABLES,
    ACTUACION_POR_FICHA,
    RESENA_URL_DEFECTO,
    envioAuto,
    enlaceResena,
    plantilla,
    rellenar,
    escapar,
    cuentaAbono,
    fechaEs,
    datosDe,
    datosEjemplo,
    renderizar,
    enlacesDelPdf,
    generar,
    pdfDe,
    textosDe,
    mensajesDe,
    sinAutoenlace,
    emailPlantilla,
    imagenesAlojadas,
    conImagenesCid,
    assetsUrl,
    EMAIL_IMAGENES,
    EMAIL_IMG_DIR,
    enviar,
    nombreFichero,
};
