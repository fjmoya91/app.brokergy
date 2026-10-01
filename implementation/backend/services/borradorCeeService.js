// ─── borradorCeeService.js ───────────────────────────────────────────────────
// El borrador para presentar el CEE en el Registro Autonómico, servido desde el
// backend.
//
// La lógica vive en `frontend/src/features/expedientes/logic/borradorCee.js` y se
// carga por import() ESM, igual que `cifoService` con `cifoDoc.js`. Existe este
// servicio, y no solo la ruta, porque el MISMO borrador lo piden DOS superficies:
// el popup que lo enseña para copiar y el visto bueno que le adjunta el PDF al
// certificador. Si cada una lo compusiera por su cuenta, el documento que se
// revisa en pantalla y el que viaja en el correo podrían no ser el mismo.
//
// Sirve para los dos negocios: el expediente CAE y el CEE directo. Lo único que
// cambia entre ellos es de dónde se leen el cliente y dónde vive la carpeta.

const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const pdfService = require('./pdfService');
const driveService = require('./driveService');

let _promesa = null;
function cargarLogica() {
    if (!_promesa) {
        const url = pathToFileURL(
            path.join(__dirname, '../../frontend/src/features/expedientes/logic/borradorCee.js')
        ).href;
        _promesa = import(url);
    }
    return _promesa;
}

let _parserPromesa = null;
function cargarParser() {
    if (!_parserPromesa) {
        const url = pathToFileURL(
            path.join(__dirname, '../../frontend/src/features/calculator/logic/xmlCeeParser.js')
        ).href;
        _parserPromesa = import(url);
    }
    return _parserPromesa;
}

/**
 * Las DOS calificaciones del certificado, rescatadas del .xml crudo si el objeto
 * parseado no las trae.
 *
 * La del consumo de energía primaria se guarda desde que existe `epnrLetra`; la de
 * EMISIONES es nueva, así que NINGÚN certificado subido antes de hoy la tiene en
 * `cee_inicial`/`cee_final`. Su XML crudo sí sigue en `cee.xml_*`, y de ahí se lee:
 * sin esto el borrador saldría sin las dos casillas del apartado 06 en todos los
 * expedientes que ya existen, que son todos.
 *
 * Solo aporta lo que FALTA: lo guardado manda, porque puede haberse corregido a
 * mano. Mismo criterio que `conEpnr` en AvisoIrpfEpnr.
 */
async function conCalificaciones(cee, fase) {
    const clave = `cee_${fase}`;
    const parseado = cee?.[clave];
    if (!parseado) return cee;
    if (parseado.epnrLetra && parseado.emisionesLetra) return cee;

    const xml = cee[fase === 'final' ? 'xml_final' : 'xml_inicial'];
    if (!xml || typeof xml !== 'string') return cee;
    try {
        // `leerCalificacionesDeTexto` y NO `parseEpnrFromXml`: aquél necesita
        // DOMParser, que en Node no existe, y devolvería vacío en silencio.
        const { leerCalificacionesDeTexto } = await cargarParser();
        const re = leerCalificacionesDeTexto(xml);
        if (!re.epnrLetra && !re.emisionesLetra) return cee;
        return {
            ...cee,
            [clave]: {
                ...parseado,
                epnrLetra: parseado.epnrLetra || re.epnrLetra,
                emisionesLetra: parseado.emisionesLetra || re.emisionesLetra,
            },
        };
    } catch (e) {
        console.warn('[borrador-cee] no se pudieron releer las calificaciones del .xml:', e.message);
        return cee;
    }
}

// ─── Los cuatro ficheros que se anexan al Registro ───────────────────────────
//
// Cuáles son y cómo se llaman lo dice la LÓGICA (`DOCUMENTOS_REGISTRO`); aquí
// solo se cruzan con lo que hay en Drive, para poder ofrecerlos ya descargados y
// renombrados: al Registro se suben con el NIF del titular delante, y eso se
// venía haciendo a mano fichero a fichero.
//
// REGLA — el nombre de descarga es el del fichero que HAY en Drive con el NIF
// delante, no el compuesto. Un nombre compuesto podría no coincidir con el
// fichero real (un migrado, uno subido a mano) y entonces lo que se baja no es lo
// que se creía. Si el fichero no está, se enseña el nombre esperado como
// referencia y se dice que falta.

const clave = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');

/** La carpeta de Drive de esa fase del CEE, sin crearla. */
async function carpetaDeFase(exp, origen, faseLabel, fase) {
    if (origen === 'cee_directo') {
        const raiz = exp?.drive_folder_id;
        if (!raiz) return null;
        const ceeDirectoFolders = require('./ceeDirectoFolders');
        const nombre = ceeDirectoFolders.subcarpetaFase(exp.alcance, fase);
        return driveService.findSubfolderByName(raiz, nombre);
    }
    const ceeUploadService = require('./ceeUploadService');
    const raiz = await ceeUploadService.resolveDriveFolderId(exp);
    if (!raiz) return null;
    const ceeRoot = await driveService.findSubfolderByName(raiz, '1. CEE');
    return ceeRoot ? driveService.findSubfolderByName(ceeRoot, faseLabel) : null;
}

/** Los ficheros del borrador, con su estado REAL en Drive. */
async function ficherosDe(exp, origen, borrador) {
    const fase = borrador.fase;
    const pre = borrador.nif ? `${borrador.nif}_` : '';
    const faseLabel = fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';

    let enDrive = [];
    try {
        const carpeta = await carpetaDeFase(exp, origen, faseLabel, fase);
        if (carpeta) {
            enDrive = (await driveService.listFiles(carpeta))
                // Se ignora la subcarpeta OLD: ahí viven las versiones archivadas.
                .filter(f => f.mimeType !== 'application/vnd.google-apps.folder');
        }
    } catch (e) {
        // Sin carpeta el borrador sigue valiendo: enseña los nombres esperados y
        // deja `presente` sin afirmar nada.
        console.warn('[borrador-cee] no se pudo listar la carpeta del CEE:', e.message);
        return borrador.ficheros;
    }

    const { DOCUMENTOS_REGISTRO } = await cargarLogica();
    const { matchSlot } = require('./ceeUploadService');
    const def = (k) => DOCUMENTOS_REGISTRO.find(d => d.clave === k) || {};

    return (borrador.ficheros || []).map(f => {
        const d = def(f.clave);
        const hit = enDrive.find(x => (d.slot
            ? matchSlot(x.name) === d.slot
            // El informe de medidas de mejora no tiene slot: se reconoce por su
            // nombre, que es como lo deja CE3X.
            : clave(x.name).includes('medidasmejora')));
        return {
            ...f,
            presente: !!hit,
            link: hit?.webViewLink || null,
            nombreDrive: hit?.name || f.nombreDrive,
            nombreRegistro: hit?.name ? `${pre}${hit.name}` : f.nombreRegistro,
        };
    });
}

// ─── Carga ───────────────────────────────────────────────────────────────────

async function cargar(origen, id, fase) {
    const tabla = origen === 'cee_directo' ? 'cee_directos' : 'expedientes';
    const { data: exp, error } = await supabase
        .from(tabla)
        // `cee` entero es necesario: de él salen las dos calificaciones, las
        // fechas y la identificación del edificio. No es un listado (regla 22),
        // es UN expediente.
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error) throw new Error(error.message);
    if (!exp) { const e = new Error('Expediente no encontrado'); e.status = 404; throw e; }

    const certId = exp.cee?.certificador_id || null;
    const [{ data: cliente }, { data: certificador }, { data: oportunidad }] = await Promise.all([
        exp.cliente_id
            ? supabase.from('clientes').select('*').eq('id_cliente', exp.cliente_id).maybeSingle()
            : Promise.resolve({ data: null }),
        certId
            ? supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle()
            : Promise.resolve({ data: null }),
        exp.oportunidad_id
            ? supabase.from('oportunidades').select('id, ref_catastral, datos_calculo').eq('id', exp.oportunidad_id).maybeSingle()
            : Promise.resolve({ data: null }),
    ]);

    const expediente = { ...exp, cee: await conCalificaciones(exp.cee || {}, fase) };
    return { expediente, cliente, certificador, oportunidad };
}

/**
 * El borrador completo: los apartados, sus avisos y el estado en Drive de los
 * cuatro ficheros que se anexan.
 *
 * @param {'expediente'|'cee_directo'} origen
 * @param {string} id
 * @param {'inicial'|'final'} fase
 */
async function componer(origen, id, fase) {
    const { borrador, html } = await componerConCtx(origen, id, fase);
    return { borrador, html };
}

// Lo mismo, pero con el expediente cargado: lo necesita quien GUARDA el PDF en su
// carpeta. `componer` no lo devuelve porque su salida va tal cual a la respuesta
// HTTP, y ahí el expediente entero no tiene nada que hacer.
async function componerConCtx(origen, id, fase) {
    const { buildBorradorCee, buildBorradorCeeHtml } = await cargarLogica();
    const ctx = await cargar(origen, id, fase);
    const borrador = buildBorradorCee(ctx, { fase });

    // El estado en Drive solo se consulta si hay borrador que enseñar: fuera de
    // Castilla-La Mancha no se va a presentar nada, y listar la carpeta cuesta
    // dos llamadas a Google.
    if (borrador.aplica) {
        borrador.ficheros = await ficherosDe(ctx.expediente, origen, borrador);
    }
    return { borrador, html: borrador.aplica ? buildBorradorCeeHtml(borrador) : null, ctx };
}

/** Un fichero concreto, descargado de Drive y con el nombre del Registro. */
async function fichero(origen, id, fase, claveDoc) {
    const { buildBorradorCee } = await cargarLogica();
    const ctx = await cargar(origen, id, fase);
    const borrador = buildBorradorCee(ctx, { fase });
    const lista = await ficherosDe(ctx.expediente, origen, borrador);

    const doc = lista.find(f => f.clave === claveDoc);
    if (!doc) { const e = new Error('Documento no válido'); e.status = 400; throw e; }
    if (!doc.presente) {
        const e = new Error(`${doc.titulo}: no está en la carpeta del CEE`);
        e.status = 404; throw e;
    }
    // Se busca otra vez el id para no tener que arrastrarlo hasta el navegador:
    // el cliente pide por CLAVE de documento, no por driveId, así que no puede
    // pedir un fichero que no sea de este expediente.
    const faseLabel = borrador.fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
    const carpeta = await carpetaDeFase(ctx.expediente, origen, faseLabel, borrador.fase);
    const files = carpeta ? await driveService.listFiles(carpeta) : [];
    const hit = files.find(f => f.name === doc.nombreDrive);
    if (!hit) { const e = new Error('El fichero ya no está en Drive'); e.status = 404; throw e; }

    const buffer = await driveService.getFileContent(hit.id);
    if (!buffer || !buffer.length) {
        const e = new Error('El fichero enlazado ya no existe en Drive'); e.status = 404; throw e;
    }
    return { buffer, filename: doc.nombreRegistro || doc.nombreDrive, mimeType: hit.mimeType };
}

/**
 * El borrador como PDF, o `null` si no aplica a ese expediente (fuera de
 * Castilla-La Mancha). Devolver null y no lanzar es deliberado: quien lo adjunta
 * al visto bueno no puede quedarse sin mandar el correo porque el expediente sea
 * de otra comunidad.
 */
async function pdf(origen, id, fase) {
    const { borrador, html, ctx } = await componerConCtx(origen, id, fase);
    if (!html) return null;
    const buffer = await pdfService.documentoAPdf({ html });
    const num = borrador.numeroExpediente || 'expediente';
    return {
        borrador,
        buffer,
        filename: `Borrador presentar ${borrador.faseLabel} - ${num}.pdf`,
        // Para guardarlo en su carpeta sin volver a cargar el expediente.
        origen,
        fase,
        expediente: ctx.expediente,
    };
}

// ─── Guardarlo en la carpeta del CEE ─────────────────────────────────────────
//
// El borrador viajaba solo por email. Cuando presenta el propio Brokergy no hay
// correo que abrir: lo que se abre es la carpeta del CEE —de ahí se bajan el
// .xml, el PDF firmado y el informe de mejoras que se anexan—, así que el
// borrador tiene que estar AHÍ, junto a ellos.
//
// REGLA — cada fase en SU carpeta: el del CEE inicial en `CEE INICIAL`, el del
// final en `CEE FINAL` (en un CEE directo, `1. CEE INICIAL` / `2. CEE FINAL`, o
// `1. CEE` si el encargo es de un solo certificado).
//
// REGLA — el nombre NO lleva sufijo de slot (`_fdo`, `_reg`, `_etq`): la rejilla
// del CEE reconoce las entregas del técnico por ese sufijo, y un borrador con
// pinta de PDF firmado daría el certificado por presentado. Lo que lo reconoce
// es `esBorradorPresentacion`, que lo aparta de los "archivos del CEE".
//
// REGLA — se SUSTITUYE, no se archiva en OLD. Es un documento derivado que se
// rehace de un clic con los datos del momento: uno viejo junto al nuevo solo
// sirve para presentar con la versión equivocada. El nuevo se sube PRIMERO y el
// anterior va a la papelera después, para no quedarse nunca sin ninguno.
//
// REGLA — guardar NO cambia los permisos de la carpeta. Se crea si no existe,
// pero no se hace pública: compartirla es decisión del encargo y del visto
// bueno, no de dejar un fichero dentro.

/** Cómo se llama la carpeta de la fase y cómo se rotula en el nombre del fichero. */
function rotuloFase(origen, exp, fase) {
    if (origen === 'cee_directo') {
        return require('./ceeDirectoUploadService').sectionLabel(exp, fase);
    }
    return require('./ceeUploadService').sectionLabel(fase);
}

/** La carpeta de la fase, CREÁNDOLA si hace falta (sin tocar sus permisos). */
async function carpetaParaGuardar(exp, origen, fase) {
    if (origen === 'cee_directo') {
        const raiz = exp?.drive_folder_id;
        if (!raiz) return null;
        const nombre = require('./ceeDirectoFolders').subcarpetaFase(exp.alcance, fase);
        return driveService.getOrCreateSubfolder(raiz, nombre);
    }
    const ceeUploadService = require('./ceeUploadService');
    const raiz = await ceeUploadService.resolveDriveFolderId(exp);
    if (!raiz) return null;
    const ceeRoot = await driveService.getOrCreateSubfolder(raiz, '1. CEE');
    return ceeRoot ? driveService.getOrCreateSubfolder(ceeRoot, ceeUploadService.sectionLabel(fase)) : null;
}

/** `{nº} – BORRADOR PRESENTACIÓN CEE INICIAL.pdf` — mismo guion largo que los ficheros del CEE. */
function nombreEnDrive(numero, rotulo) {
    return `${numero || 'expediente'} – BORRADOR PRESENTACIÓN ${rotulo}.pdf`;
}

/**
 * Guarda el borrador en PDF en la carpeta de su fase.
 *
 * @param {'expediente'|'cee_directo'} origen
 * @param {string} id
 * @param {'inicial'|'final'} fase
 * @param {{ doc?: object }} [opts] el resultado de `pdf()` si ya se ha generado
 *        (el visto bueno lo adjunta y lo guarda: no se rasteriza dos veces).
 * @returns {Promise<{guardado:boolean, motivo?:string, nombre?:string, link?:string,
 *          carpetaLink?:string, sustituidos?:number}>}
 *
 * No lanza por "no aplica" ni por "sin carpeta": eso se devuelve con su motivo,
 * porque quien lo llama (el visto bueno) no puede quedarse sin avisar al técnico
 * por ello. Un fallo de Drive al SUBIR sí lanza.
 */
async function guardarEnDrive(origen, id, fase, { doc = null } = {}) {
    const fz = fase === 'final' ? 'final' : 'inicial';
    const d = doc || await pdf(origen, id, fz);
    if (!d) {
        return { guardado: false, motivo: 'No hay borrador: solo se prepara para el Registro de Castilla-La Mancha.' };
    }
    const exp = d.expediente;
    const carpeta = await carpetaParaGuardar(exp, origen, fz);
    if (!carpeta) return { guardado: false, motivo: 'El expediente no tiene carpeta de Drive.' };

    const nombre = nombreEnDrive(d.borrador?.numeroExpediente || exp?.numero_expediente,
        rotuloFase(origen, exp, fz));
    const previos = await driveService.findFilesByName(carpeta, nombre);
    const subido = await driveService.saveFileToFolder(carpeta, nombre, 'application/pdf', d.buffer,
        { throwOnError: true });
    let sustituidos = 0;
    for (const prevId of previos) {
        if (prevId && prevId !== subido?.id && await driveService.deleteFile(prevId)) sustituidos++;
    }
    let carpetaLink = null;
    try { carpetaLink = await driveService.getWebViewLink(carpeta); }
    catch { carpetaLink = `https://drive.google.com/drive/folders/${carpeta}`; }

    return { guardado: true, nombre, link: subido?.link || null, carpetaLink, sustituidos };
}

/**
 * Lo que el VISTO BUENO hace con el borrador, en los dos negocios: adjuntarlo al
 * correo del técnico, guardarlo en la carpeta de la fase, o las dos cosas.
 *
 * Se rasteriza UNA vez para las dos: el documento adjunto y el de Drive son el
 * mismo. Y NUNCA lanza: el visto bueno es el trabajo, el borrador es un apoyo —
 * que no se pueda preparar no puede dejar al técnico sin su aviso.
 *
 * @returns {Promise<{ adjunto: object|null, borradorDrive: object|null }>}
 *   `adjunto` listo para nodemailer; `borradorDrive` solo si se pidió guardar
 *   (con `guardado:false` y su `motivo` cuando no ha podido ser).
 */
async function paraVistoBueno(origen, id, fase, { adjuntar = false, guardar = false } = {}) {
    if (!adjuntar && !guardar) return { adjunto: null, borradorDrive: null };
    let doc = null;
    let fallo = null;
    try {
        doc = await pdf(origen, id, fase);
    } catch (e) {
        console.warn(`[borrador-cee] no se pudo preparar el borrador (${origen} ${id}):`, e.message);
        fallo = 'No se pudo preparar el borrador.';
    }
    const adjunto = adjuntar && doc
        ? { filename: doc.filename, content: doc.buffer, contentType: 'application/pdf' }
        : null;

    let borradorDrive = null;
    if (guardar) {
        if (fallo) borradorDrive = { guardado: false, motivo: fallo };
        else if (!doc) borradorDrive = { guardado: false, motivo: 'No hay borrador: solo se prepara para el Registro de Castilla-La Mancha.' };
        else {
            try {
                borradorDrive = await guardarEnDrive(origen, id, fase, { doc });
            } catch (e) {
                console.warn(`[borrador-cee] no se pudo guardar en Drive (${origen} ${id}):`, e.message);
                borradorDrive = { guardado: false, motivo: 'Drive no ha aceptado el fichero.' };
            }
        }
    }
    return { adjunto, borradorDrive };
}

module.exports = { componer, pdf, fichero, guardarEnDrive, paraVistoBueno, nombreEnDrive };
