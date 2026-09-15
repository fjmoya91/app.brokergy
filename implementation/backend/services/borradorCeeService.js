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
    const { buildBorradorCee, buildBorradorCeeHtml } = await cargarLogica();
    const ctx = await cargar(origen, id, fase);
    const borrador = buildBorradorCee(ctx, { fase });

    // El estado en Drive solo se consulta si hay borrador que enseñar: fuera de
    // Castilla-La Mancha no se va a presentar nada, y listar la carpeta cuesta
    // dos llamadas a Google.
    if (borrador.aplica) {
        borrador.ficheros = await ficherosDe(ctx.expediente, origen, borrador);
    }
    return { borrador, html: borrador.aplica ? buildBorradorCeeHtml(borrador) : null };
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
    const { borrador, html } = await componer(origen, id, fase);
    if (!html) return null;
    const buffer = await pdfService.documentoAPdf({ html });
    const num = borrador.numeroExpediente || 'expediente';
    return {
        borrador,
        buffer,
        filename: `Borrador presentar ${borrador.faseLabel} - ${num}.pdf`,
    };
}

module.exports = { componer, pdf, fichero };
