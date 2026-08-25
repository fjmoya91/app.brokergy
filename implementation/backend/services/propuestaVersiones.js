// ─────────────────────────────────────────────────────────────────────────────
// Versiones de la PROPUESTA enviada al cliente / partner / instalador.
//
// Antes de esto, enviar una propuesta no dejaba copia de nada: el PDF se
// generaba al vuelo para WhatsApp, el email lo rasterizaba el backend desde el
// HTML y `html_propuesta` se sobrescribía. Con dos envíos (precio corregido,
// alcance ampliado) no se podía saber qué documento tenía el cliente delante
// ni, sobre todo, cuál aceptó.
//
// REGLA — la versión sube cuando la propuesta SALE, no cuando se guarda.
// El botón "Guardar en Drive" de la vista previa deja un BORRADOR con nombre
// fijo (se reemplaza a sí mismo) y no consume número: si contara, el contador
// dejaría de significar "lo que ha visto el cliente", que es lo único que hace
// falta saber cuando alguien pregunta por qué propuesta va la conversación.
//
// REGLA — se archiva EXACTAMENTE el PDF que se envía. Se genera UNA vez aquí y
// ese mismo buffer viaja al email y a WhatsApp. Antes cada canal rasterizaba su
// propio HTML (el del email lleva otro envoltorio), así que el adjunto del
// correo y el de WhatsApp no eran el mismo documento.
//
// REGLA — en BD solo metadatos y el enlace (regla 21). El HTML de una propuesta
// pesa 353 KB de media y hasta 1,35 MB (medido en producción el 2026-08-25):
// guardar el de cada versión dentro del JSONB repetiría la caída de julio.
// ─────────────────────────────────────────────────────────────────────────────

const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const { getBrowser } = require('./pdfService');

// Las versiones se acumulan aquí para no llenar la raíz de la oportunidad, que
// ya viene con su plantilla de subcarpetas.
const SUBCARPETA = '0. PROPUESTAS';

// Nombre del borrador del botón "Guardar en Drive". Fijo a propósito: se
// reemplaza a sí mismo en vez de dejar una copia más por cada pulsación (Drive
// admite nombres duplicados y así es como se acumulaban PDFs indistinguibles).
const BORRADOR_LABEL = 'Propuesta (borrador)';

const fileNameVersion = (idOportunidad, v) =>
    `Propuesta_${String(idOportunidad || 'SIN_ID').replace(/[^A-Za-z0-9_\-]/g, '_')}_v${v}`;

/** Lista de versiones ya registradas, ordenada, o [] si no hay ninguna. */
function listar(datosCalculo) {
    const arr = datosCalculo?.propuesta_versiones;
    if (!Array.isArray(arr)) return [];
    return [...arr].sort((a, b) => (a?.v || 0) - (b?.v || 0));
}

/** Número que le tocaría al PRÓXIMO envío. Lo autoritativo es la RPC; esto es
 *  para que la vista previa pueda imprimir la marca antes de enviar. */
function siguienteVersion(datosCalculo) {
    const vs = listar(datosCalculo).map(e => Number(e?.v) || 0);
    return (vs.length ? Math.max(...vs) : 0) + 1;
}

/** La última versión enviada (la que el cliente tiene delante), o null. */
function vigente(datosCalculo) {
    const vs = listar(datosCalculo);
    return vs.length ? vs[vs.length - 1] : null;
}

// Importes que definen la propuesta. Se sellan por versión para poder decir QUÉ
// cambió de una a otra sin volver a rasterizar ni recalcular nada.
const IMPORTES = ['inversion', 'caeBonus', 'irpfDeduction', 'totalAyuda'];

function importesDe(result, inputs) {
    const f = result?.financials || {};
    const num = (x) => (Number.isFinite(Number(x)) ? Math.round(Number(x)) : null);
    return {
        inversion: num(inputs?.investment ?? inputs?.inversion ?? f.investment),
        caeBonus: num(f.caeBonus),
        irpfDeduction: num(f.irpfDeduction),
        totalAyuda: num(f.totalAyuda),
    };
}

const ETIQUETA_IMPORTE = {
    inversion: 'inversión',
    caeBonus: 'bono CAE',
    irpfDeduction: 'deducción IRPF',
    totalAyuda: 'ayuda total',
};

const eur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0, useGrouping: true }).format(n)} €`;

/**
 * Qué cambió entre dos versiones, en lenguaje de persona.
 * Devuelve '' si no hay importes con los que comparar (una versión antigua sin
 * sellar no puede afirmar que "no cambió nada": no lo sabe).
 */
function describirCambios(anterior, actual) {
    const a = anterior?.importes, b = actual?.importes;
    if (!a || !b) return '';
    const difs = IMPORTES
        .filter(k => Number.isFinite(a[k]) && Number.isFinite(b[k]) && a[k] !== b[k])
        .map(k => `${ETIQUETA_IMPORTE[k]} ${eur(a[k])} → ${eur(b[k])}`);
    return difs.length ? difs.join('; ') : 'sin cambios en los importes';
}

/** Rasteriza el HTML de la propuesta a PDF A4. Mismos ajustes que /api/pdf/*. */
async function renderPdf(html) {
    let browser = null, page = null;
    try {
        browser = await getBrowser();
        page = await browser.newPage();
        await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
        await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await new Promise(r => setTimeout(r, 1000));
        try { await page.evaluate(() => document.fonts.ready); } catch (_) { }
        return await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: 0, right: 0, bottom: 0, left: 0 },
        });
    } finally {
        if (page) { try { await page.close(); } catch (_) { } }
        if (browser) { try { await browser.close(); } catch (_) { } }
    }
}

/** Sube un PDF a "0. PROPUESTAS" dentro de la carpeta de la oportunidad. */
async function archivarEnDrive(folderId, safeName, pdfBuffer, { replaceExisting } = {}) {
    if (!folderId) return null;
    const targetId = await driveService.getOrCreateSubfolder(folderId, SUBCARPETA);
    if (!targetId) return null;
    const fileName = `${safeName}.pdf`;
    if (replaceExisting) {
        try {
            const previos = await driveService.findFilesByName(targetId, fileName);
            for (const prevId of (previos || [])) {
                await driveService.archiveExistingToOld(targetId, prevId, fileName);
            }
        } catch (e) {
            console.warn('[propuestaVersiones] no se pudo archivar el borrador previo:', e.message);
        }
    }
    const res = await driveService.saveFileToFolder(targetId, fileName, 'application/pdf', pdfBuffer);
    return res ? { driveId: res.id || null, driveLink: res.link || null, fileName } : null;
}

/**
 * Registra una versión NUEVA: rasteriza, reserva número (RPC, con bloqueo de
 * fila), archiva el PDF en Drive y devuelve el PDF para que lo envíen los
 * canales. El número lo asigna la BD, no Node: dos envíos simultáneos con un
 * MAX+1 leído desde aquí saldrían con el mismo número.
 *
 * @returns {{version:number, driveLink:string|null, driveId:string|null,
 *            fileName:string, pdfBase64:string, cambios:string,
 *            versionImpresa:number|null}}
 */
async function registrarEnvio({
    oportunidad,          // fila con { id, id_oportunidad, datos_calculo }
    html,                 // HTML de impresión (el mismo que se envía)
    destinatarios = [],   // [{ modo, label, email, telefono }]
    canales = [],         // ['email','whatsapp']
    usuario = null,
    versionImpresa = null,// la marca que el frontend ya pintó en el documento
    result = null,
    inputs = null,
}) {
    if (!html) throw new Error('Falta el HTML de la propuesta.');

    const pdfBuffer = await renderPdf(html);
    const previa = vigente(oportunidad?.datos_calculo);

    const entrada = {
        fecha: new Date().toISOString(),
        usuario: usuario || null,
        destinatarios: destinatarios.map(d => ({
            modo: d.modo || d.mode || null,
            label: d.label || null,
            email: d.email || null,
            telefono: d.telefono || d.phone || null,
        })),
        canales,
        importes: importesDe(result, inputs),
        version_impresa: versionImpresa || null,
    };

    const { data: creada, error } = await supabase.rpc('propuesta_version_add', {
        p_id: oportunidad.id,
        p_entry: entrada,
    });
    if (error) throw new Error(`No se pudo registrar la versión: ${error.message}`);

    const version = Number(creada?.v) || versionImpresa || 1;
    const safeName = fileNameVersion(oportunidad.id_oportunidad, version);

    // El PDF ya está hecho y va a salir igual: un fallo de Drive no puede
    // impedir el envío, pero sí queda anotado en la propia versión para que
    // "no está en Drive" sea visible en vez de silencioso.
    let archivo = null;
    try {
        archivo = await archivarEnDrive(
            oportunidad?.datos_calculo?.drive_folder_id || oportunidad?.datos_calculo?.inputs?.drive_folder_id,
            safeName,
            pdfBuffer
        );
    } catch (e) {
        console.error('[propuestaVersiones] fallo archivando en Drive:', e.message);
    }

    await merge(oportunidad.id, version, {
        drive_id: archivo?.driveId || null,
        drive_link: archivo?.driveLink || null,
        file_name: archivo?.fileName || `${safeName}.pdf`,
        drive_error: archivo ? null : 'No se pudo archivar el PDF en Drive.',
    });

    return {
        version,
        versionImpresa: versionImpresa || null,
        driveLink: archivo?.driveLink || null,
        driveId: archivo?.driveId || null,
        fileName: archivo?.fileName || `${safeName}.pdf`,
        pdfBase64: Buffer.from(pdfBuffer).toString('base64'),
        cambios: describirCambios(previa, { importes: entrada.importes }),
    };
}

/** Guarda el BORRADOR de la vista previa. No consume número de versión. */
async function guardarBorrador({ oportunidad, html }) {
    const pdfBuffer = await renderPdf(html);
    const folderId = oportunidad?.datos_calculo?.drive_folder_id
        || oportunidad?.datos_calculo?.inputs?.drive_folder_id;
    return archivarEnDrive(folderId, BORRADOR_LABEL, pdfBuffer, { replaceExisting: true });
}

/** MERGE sobre la entrada de una versión (resultados de envío, aceptación…). */
async function merge(oportunidadUuid, v, patch) {
    const { error } = await supabase.rpc('propuesta_version_merge', {
        p_id: oportunidadUuid,
        p_v: v,
        p_patch: patch,
    });
    if (error) console.error('[propuestaVersiones] merge falló:', error.message);
    return !error;
}

/**
 * Sella en la versión vigente que el cliente la aceptó. Se llama desde la ruta
 * pública de aceptación: sin esto, un reenvío posterior deja "aceptada" una
 * propuesta que el cliente nunca llegó a ver.
 */
async function sellarAceptacion(oportunidad, { aceptadoPor = null } = {}) {
    const v = vigente(oportunidad?.datos_calculo);
    if (!v?.v) return null;
    if (v.aceptada_at) return v.v;   // idempotente: re-aceptar no reescribe la fecha
    await merge(oportunidad.id, v.v, {
        aceptada_at: new Date().toISOString(),
        aceptada_por: aceptadoPor,
    });
    return v.v;
}

module.exports = {
    SUBCARPETA,
    BORRADOR_LABEL,
    listar,
    siguienteVersion,
    vigente,
    describirCambios,
    importesDe,
    registrarEnvio,
    guardarBorrador,
    sellarAceptacion,
    merge,
};
