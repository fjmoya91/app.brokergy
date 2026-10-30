// ─── certapp/firma.js — el certificador firma su CEE y sube lo definitivo ────
// Lo pidió Fran (25/10/2026): «si le damos el visto bueno, que se pueda firmar el
// PDF con AutoFirma directamente y se pueda cargar el XML a través de la
// aplicación, igual que en la de BROKERGY, para que esté el definitivo siempre».
//
//   · PDF para firmar: el del certificado que elige la entrega
//     (`entrega.elegirFicheros`: el más reciente, sin firmar). Lo firma AutoFirma
//     en SU ordenador (WebSocket local, features/firma/autofirma.js) y vuelve aquí.
//   · El firmado: REGLA — si la firma no cubre el documento (`leerFirmasPdf`, el
//     mismo criterio que «firmar-subir» del CRM) → 422 y NO se guarda nada. Se
//     guarda PRIVADO en «1. CEE» como `{nº} - CEE_fdo.pdf` (el anterior, a OLD) y
//     queda el sello en `cee.firma` por la RPC (regla 19).
//   · Lo definitivo hecho fuera (su CE3X): el `.xml` (se comprueba que es de un
//     CEE de CE3X 3.x y se CARGA en la obra, regla 152, antes de guardarlo) y el
//     `.pdf` (firmado → `_fdo`; sin firmar → `{nº} - CEE.pdf`, para firmarlo aquí).
//     REGLA — el `.cex` se guarda en CUARENTENA y NUNCA se abre (desde el
//     26/10/2026; antes, 415): CE3X lo abre con pickle (por eso Drive se le
//     comparte como LECTOR, ver drive.js). Va a la subcarpeta de cuarentena de
//     «1. CEE» como `….cex.cuarentena` (documentos.js): es SU copia, para
//     descargarla; lo que cuenta para el registro es XML + PDF, y para regenerar,
//     la envolvente.
//   · Solo en LISTO o VALIDADO (lo entregado). Firmar implica darlo por bueno: una
//     obra LISTO pasa a VALIDADO al firmar.
//   · En un ENCARGO de BROKERGY (services/certapp/crm.js), firmar manda el PDF
//     firmado, el XML y el .cex al expediente del CRM y pide su revisión; el XML
//     definitivo, a su casilla. De fondo: el técnico no espera a eso.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const cex = require('../ceeEnvolventeCex');
const drive = require('./drive');
const tipos = require('./tipos');
const { leerFirmasPdf, firmanteCoincide } = require('../../utils/firmasPdf');
const { fallo, errorBd, evento, nombreCompleto } = require('./comun');

const ESTADOS_FIRMABLES = ['LISTO', 'VALIDADO'];
const MAX_BYTES = 25 * 1024 * 1024;

const nombreFirmado = (obra) => `${obra.numero_expediente} - CEE_fdo.pdf`;
const nombreDefinitivo = (obra, ext) => `${obra.numero_expediente} - CEE.${ext}`;

function exigirEntregada(obra) {
    if (!ESTADOS_FIRMABLES.includes(obra.estado)) {
        throw fallo(409, 'Esto se hace con el certificado ya entregado.', 'ESTADO_NO_FIRMABLE');
    }
}

async function carpetaCee(obra) {
    const id = await drive.carpetaCeeSiExiste(obra);
    if (!id) throw fallo(409, 'Todavía no hay certificado en la carpeta de la obra.', 'SIN_CEE');
    return id;
}

/** Lee un fichero de Drive entero (los CEE pesan poco; con tope por si acaso). */
async function leerBytes(driveId) {
    const f = await drive.abrirFichero(driveId);
    if (!f) throw fallo(502, 'Google Drive no responde ahora mismo. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO');
    const trozos = [];
    let total = 0;
    for await (const t of f.stream) {
        total += t.length;
        if (total > MAX_BYTES) throw fallo(413, 'El PDF es demasiado grande.', 'FICHERO_GRANDE');
        trozos.push(t);
    }
    return Buffer.concat(trozos);
}

/** Guarda en «1. CEE» con su nombre; lo que hubiera con ese nombre, a OLD. */
async function guardar(carpetaId, nombre, mime, buffer) {
    const previo = await driveService.findFileByName(carpetaId, nombre);
    if (previo) await driveService.archiveExistingToOld(carpetaId, previo, nombre);
    const r = await driveService.saveFileToFolder(carpetaId, nombre, mime, buffer, { throwOnError: true });
    return { driveId: r?.id || null, nombre, archivado: !!previo };
}

/**
 * El PDF que se firma: el del certificado, el más reciente sin firmar.
 * @returns {Promise<{ nombre: string, base64: string }>}
 */
async function pdfParaFirmar(obra) {
    exigirEntregada(obra);
    const { elegirFicheros } = require('./entrega');
    const elegido = elegirFicheros(await driveService.listFiles(await carpetaCee(obra)), obra.numero_expediente).pdf;
    if (!elegido) throw fallo(409, 'Todavía no está el PDF del certificado.', 'SIN_PDF');
    const bytes = await leerBytes(elegido.id);
    if (!tipos.detectar(bytes) || tipos.detectar(bytes).ext !== 'pdf') throw fallo(409, 'El PDF del certificado no se puede leer.', 'PDF_ILEGIBLE');
    return { nombre: elegido.name, base64: bytes.toString('base64') };
}

/**
 * Guarda el PDF FIRMADO. Lo que no cuadra no se guarda.
 * @param {object} obra   fila de certapp_obras
 * @param {object} cuenta la del certificador
 * @param {Buffer} buffer el PDF firmado
 * @param {{ via?: 'autofirma'|'subido' }} [o]
 */
async function guardarFirmado(obra, cuenta, buffer, { via = 'autofirma' } = {}) {
    exigirEntregada(obra);
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw fallo(400, 'No ha llegado el PDF.', 'SIN_FICHERO');
    if (buffer.length > MAX_BYTES) throw fallo(413, 'El PDF es demasiado grande (máximo 25 MB).', 'FICHERO_GRANDE');
    const firmas = leerFirmasPdf(buffer);
    if (!firmas.esPdf) throw fallo(400, 'Eso no es un PDF.', 'NO_ES_PDF');
    if (!firmas.firmada) throw fallo(422, 'El PDF no lleva ninguna firma digital.', 'SIN_FIRMA');
    if (firmas.integridad.rota) {
        console.warn(`[certapp firma] ${obra.numero_expediente}: firma ROTA, no se guarda: ${firmas.integridad.problemas.join(' · ')}`);
        throw fallo(422, 'El PDF firmado ha llegado dañado y no se ha guardado. Vuelve a firmarlo.', 'FIRMA_ROTA',
            { problemas: firmas.integridad.problemas });
    }
    const f = firmas.firmantes[firmas.firmantes.length - 1] || {};
    const esperado = nombreCompleto(cuenta);
    const coincide = esperado ? firmanteCoincide(f, { nombre: esperado }) : { coincide: null };
    const avisos = coincide.coincide === false ? [`La firma no parece de ${esperado} (${coincide.motivo}).`] : [];

    const guardado = await guardar(await carpetaCee(obra), nombreFirmado(obra), 'application/pdf', buffer);
    const sello = {
        at: new Date().toISOString(), via, fichero: guardado.nombre, drive_id: guardado.driveId,
        firmante: { nombre: f.nombre || f.cn || f.nombreDeclarado || null, nif: f.nif || null },
        coincide: coincide.coincide, n_firmas: firmas.n,
    };
    await cex.setCeeField(cex.expedienteStub('ext', obra.id), 'firma', sello);

    // Firmar es darlo por bueno: una obra LISTO pasa a VALIDADO.
    let estado = obra.estado;
    if (obra.estado === 'LISTO') {
        const { data, error } = await supabase.from('certapp_obras')
            .update({ estado: 'VALIDADO', validado_at: sello.at }).eq('id', obra.id).eq('estado', 'LISTO').select('estado');
        if (error) throw errorBd(error, 'validar al firmar');
        if (data?.length) estado = 'VALIDADO';
    }
    await evento(obra.id, obra.cuenta_id, 'FIRMA',
        `El certificador ha firmado el certificado${sello.firmante.nombre ? ` (${sello.firmante.nombre})` : ''}`
            + (via === 'subido' ? ' y lo ha subido' : ' con AutoFirma'),
        'certificador', { fichero: guardado.nombre, coincide: coincide.coincide });
    // Un encargo de BROKERGY: el firmado, el XML y el .cex, al expediente y a revisión (de fondo).
    require('./crm').enviarCeeAsync(obra, cuenta, { firmado: buffer });
    return { ok: true, estado, firma: sello, avisos };
}

/**
 * Lo definitivo hecho en SU CE3X: un `.xml` o un `.pdf` (firmado o no).
 * @param {object} obra
 * @param {object} cuenta
 * @param {{ buffer: Buffer, originalname?: string }} fichero
 */
async function subirDefinitivo(obra, cuenta, fichero) {
    exigirEntregada(obra);
    const buffer = fichero?.buffer;
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw fallo(400, 'No ha llegado ningún archivo.', 'SIN_FICHERO');
    if (buffer.length > MAX_BYTES) throw fallo(413, 'El archivo es demasiado grande (máximo 25 MB).', 'FICHERO_GRANDE');
    const t = tipos.detectar(buffer);
    if (t?.ext === 'cex') return guardarCexEnCuarentena(obra, buffer);
    if (t?.ext === 'pdf') {
        if (leerFirmasPdf(buffer).firmada) return { tipo: 'pdf_firmado', ...(await guardarFirmado(obra, cuenta, buffer, { via: 'subido' })) };
        const guardado = await guardar(await carpetaCee(obra), nombreDefinitivo(obra, 'pdf'), 'application/pdf', buffer);
        await evento(obra.id, obra.cuenta_id, 'DEFINITIVO', 'El certificador ha subido el PDF definitivo (sin firmar)', 'certificador',
            { fichero: guardado.nombre });
        return { ok: true, tipo: 'pdf', fichero: guardado.nombre, estado: obra.estado };
    }
    if (t?.ext !== 'xml') throw fallo(415, 'Sube el XML del certificado (de CE3X) o el PDF.', 'TIPO_NO_VALE');

    // El XML: primero se lee (sin escribir). Si no es un CEE de CE3X 3.x que se
    // pueda cargar, no se guarda nada.
    const { cargarXmlEnApp } = require('../cee/cargarXmlCee');
    const ctx = await cex.cargarExpediente(obra.id, 'ext');
    if (!ctx) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    const nombre = nombreDefinitivo(obra, 'xml');
    let prueba;
    try { prueba = await cargarXmlEnApp(ctx, 'inicial', buffer, { fileName: nombre, escribir: false, forzar: true }); } catch (e) {
        throw fallo(422, `Ese XML no se puede leer: ${e.message}`, 'XML_ILEGIBLE');
    }
    if (prueba?.omitido && prueba.omitido !== 'en seco') throw fallo(422, `Ese XML no se puede cargar: ${prueba.omitido}`, 'XML_ILEGIBLE');
    if (!prueba?.parsed?.epnrLetra && !prueba?.parsed?.emisionesLetra) {
        throw fallo(422, 'Ese XML no trae la calificación: súbelo tal como lo saca CE3X al terminar el certificado.', 'XML_SIN_CALIFICACION');
    }
    const guardado = await guardar(await carpetaCee(obra), nombre, 'application/xml', buffer);
    const carga = await cargarXmlEnApp(ctx, 'inicial', buffer, { fileName: nombre, escribir: true, forzar: true });
    await evento(obra.id, obra.cuenta_id, 'DEFINITIVO', 'El certificador ha subido el XML definitivo', 'certificador',
        { fichero: guardado.nombre, cargado: !!carga?.cargado });
    require('./crm').enviarDefinitivoAsync(obra, cuenta, { tipo: 'xml', buffer });
    return { ok: true, tipo: 'xml', fichero: guardado.nombre, cargado: !!carga?.cargado, estado: obra.estado };
}

/**
 * Su `.cex`, a la cuarentena (ver la REGLA de arriba): nunca sustituye al nuestro,
 * no se lee y no se abre. Uno por subida, con la hora en el nombre; hasta
 * MAX_CUARENTENA por obra.
 */
async function guardarCexEnCuarentena(obra, buffer) {
    const documentos = require('./documentos');
    const padre = await carpetaCee(obra);
    let carpeta;
    try {
        carpeta = await driveService.getOrCreateSubfolder(padre, documentos.CARPETA_CUARENTENA);
    } catch (e) { carpeta = null; }
    // getOrCreateSubfolder devuelve el PADRE si falla: el .cex caería en «1. CEE».
    if (!carpeta || carpeta === padre) throw fallo(502, 'Google Drive no responde ahora mismo. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO');
    const hay = ((await drive.listar(carpeta)) || []).length;
    if (hay >= documentos.MAX_CUARENTENA) {
        throw fallo(409, `Ya hay ${hay} archivos .cex guardados en esta obra. Escríbenos si necesitas guardar más.`, 'CUARENTENA_LLENA');
    }
    // La hora de España (el VPS va en UTC): «2026-10-26 17h53».
    const sello = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .format(new Date()).replace(':', 'h');
    const nombre = `${obra.numero_expediente} - CEE ${sello}.cex${documentos.SUFIJO_CUARENTENA}`;
    const r = await driveService.saveFileToFolder(carpeta, nombre, 'application/octet-stream', buffer, { throwOnError: true });
    await evento(obra.id, obra.cuenta_id, 'DEFINITIVO', 'El certificador ha subido su .cex (guardado aparte: no se abre ni sustituye al nuestro)',
        'certificador', { fichero: nombre });
    return { ok: true, tipo: 'cex', fichero: documentos.nombreDescarga(nombre), drive_id: r?.id || null, estado: obra.estado };
}

/** Lo que ve el certificador de la firma y la calificación (sin enlaces de Drive). */
function resumenParaCertificador(obra) {
    const c = obra.cee?.cee_inicial || {};
    const f = obra.cee?.firma || null;
    return {
        calificacion: c.epnrLetra || c.emisionesLetra ? { consumo: c.epnrLetra || null, emisiones: c.emisionesLetra || null } : null,
        firma: f ? { at: f.at || null, firmante: f.firmante?.nombre || null, via: f.via || null } : null,
    };
}

module.exports = { pdfParaFirmar, guardarFirmado, subirDefinitivo, resumenParaCertificador, nombreFirmado, ESTADOS_FIRMABLES };
