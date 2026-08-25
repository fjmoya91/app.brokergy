// ─── ceeDirectoFolders.js ────────────────────────────────────────────────────
// Carpetas de Drive de los CEE contratados sueltos.
//
// Nada que ver con `driveFolders.js` / `expedienteFolderSync.js` del CAE: allí la
// carpeta VIAJA entre 13 carpetas de estado (01. OPORTUNIDADES → 11. FINALIZADO)
// porque el expediente atraviesa un proceso comercial. Aquí no hay proceso: el
// encargo nace y muere en `1. PRODUCCION`, que es como se ha llevado a mano desde
// 2024. La carpeta NO se mueve nunca, y por eso este módulo no tiene mapa de
// estados ni sincronizador.
//
// Estructura, tomada de la última carpeta hecha a mano (2026CEE_53), que es la
// plantilla que se estaba consolidando:
//
//   2026CEE_55 - FRANCISCA LLAMAS GONZÁLEZ
//     ├── 1. CEE INICIAL              (en un encargo ÚNICO se llama "1. CEE")
//     ├── 2. CEE FINAL                (solo si el encargo es DOBLE)
//     ├── 3. PRESUPUESTO Y FACTURAS
//     └── 4. DOCUMENTACIÓN PARA CEE

const driveService = require('./driveService');

// `26. CERTIF. EFICIENCIA ENER / 1. PRODUCCION`, en la misma cuenta de Drive que
// ya usa el backend para el CAE — no hace falta credencial nueva. Configurable
// por si algún día se mueve, con el ID real como valor por defecto para que un
// .env sin la variable no deje la app sin crear carpetas.
const PRODUCCION_FOLDER_ID =
    process.env.DRIVE_CEE_PRODUCCION_FOLDER_ID || '1iaDiUXHZUpcw45ZCDzbKimj1fcoSOcID';

const SUB_CEE_UNICO   = '1. CEE';
const SUB_CEE_INICIAL = '1. CEE INICIAL';
const SUB_CEE_FINAL   = '2. CEE FINAL';
const SUB_FACTURAS    = '3. PRESUPUESTO Y FACTURAS';
const SUB_DOCS        = '4. DOCUMENTACIÓN PARA CEE';

/**
 * Subcarpetas que le tocan a este encargo. La de CEE FINAL solo existe si el
 * encargo la necesita: una carpeta vacía llamada "2. CEE FINAL" en un CEE de
 * compraventa invita a buscar dentro un documento que no va a llegar nunca.
 */
function subcarpetasDe(alcance) {
    const doble = String(alcance || 'UNICO').toUpperCase() === 'DOBLE';
    return doble
        ? [SUB_CEE_INICIAL, SUB_CEE_FINAL, SUB_FACTURAS, SUB_DOCS]
        : [SUB_CEE_UNICO, SUB_FACTURAS, SUB_DOCS];
}

/** Subcarpeta donde vive el certificado de una fase. */
function subcarpetaFase(alcance, fase) {
    const doble = String(alcance || 'UNICO').toUpperCase() === 'DOBLE';
    if (!doble) return SUB_CEE_UNICO;
    return fase === 'final' ? SUB_CEE_FINAL : SUB_CEE_INICIAL;
}

/**
 * Nombre de la carpeta: `{numero} - {NOMBRE}`.
 * Se sanea para que Drive Desktop pueda sincronizarla en Windows: la carpeta se
 * abre TAMBIÉN en local (botón "Carpeta Local"), y un `/` o un `:` en el nombre
 * del cliente deja el fichero sin bajar sin decir por qué.
 */
function nombreCarpeta(numeroExpediente, nombre) {
    const limpio = driveService.sanitizeWindowsSegment(String(nombre || '').trim());
    return limpio ? `${numeroExpediente} - ${limpio}` : String(numeroExpediente);
}

/**
 * Crea la carpeta del expediente y sus subcarpetas.
 *
 * No lanza: si Drive falla, el expediente se crea igual y queda sin carpeta —
 * mismo criterio que en el CAE (regla 1: la creación de carpetas es NO
 * bloqueante). Perder el alta por un 503 de Google es peor que arreglar la
 * carpeta después con `asegurarCarpeta()`.
 *
 * @returns {{id: string, link: string, subcarpetas: Record<string,string>} | null}
 */
async function crearCarpeta(numeroExpediente, nombre, alcance) {
    try {
        const folderName = nombreCarpeta(numeroExpediente, nombre);

        // Idempotente: si ya existe una carpeta con ese nombre (creada a mano
        // antes de dar de alta el expediente, que es lo habitual), se adopta en
        // vez de crear una segunda con el mismo nombre — Drive lo permite, y dos
        // carpetas iguales es justo el lío que hay que evitar.
        let folderId = await driveService.findSubfolderByName(PRODUCCION_FOLDER_ID, folderName);
        let link = null;

        if (folderId) {
            link = await driveService.getWebViewLink(folderId);
            console.log(`📁 CEE directo: adoptada carpeta existente "${folderName}"`);
        } else {
            folderId = await driveService.createSubfolder(PRODUCCION_FOLDER_ID, folderName);
            if (!folderId) return null;
            link = await driveService.getWebViewLink(folderId);
            console.log(`✅ CEE directo: carpeta creada "${folderName}"`);
        }

        const subcarpetas = {};
        for (const sub of subcarpetasDe(alcance)) {
            const id = await driveService.getOrCreateSubfolder(folderId, sub);
            if (id) subcarpetas[sub] = id;
        }

        return { id: folderId, link, subcarpetas };
    } catch (err) {
        console.error('❌ CEE directo: fallo creando la carpeta de Drive:', err.message);
        return null;
    }
}

/**
 * Se asegura de que existan las subcarpetas que hoy le tocan al encargo.
 * Se llama al ampliar un encargo de ÚNICO a DOBLE: entonces aparece la de CEE
 * FINAL, y la de "1. CEE" pasa a llamarse "1. CEE INICIAL" — porque a partir de
 * ese momento sí hay un después y la palabra vuelve a significar algo.
 */
async function asegurarSubcarpetas(folderId, alcance) {
    if (!folderId) return {};
    const out = {};
    try {
        if (String(alcance || '').toUpperCase() === 'DOBLE') {
            const unico = await driveService.findSubfolderByName(folderId, SUB_CEE_UNICO);
            const yaInicial = await driveService.findSubfolderByName(folderId, SUB_CEE_INICIAL);
            if (unico && !yaInicial) {
                await driveService.renameFolder(unico, SUB_CEE_INICIAL);
            }
        }
        for (const sub of subcarpetasDe(alcance)) {
            const id = await driveService.getOrCreateSubfolder(folderId, sub);
            if (id) out[sub] = id;
        }
    } catch (err) {
        console.error('❌ CEE directo: fallo asegurando subcarpetas:', err.message);
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// QUÉ VE EL CERTIFICADOR
// ---------------------------------------------------------------------------
// El técnico necesita dos cosas: los certificados de su fase y la documentación
// del inmueble para poder emitirlos. NO tiene por qué ver lo que le cobramos al
// cliente ni lo que nos cuesta la obra.
//
// REGLA — al certificador NUNCA se le manda el enlace de la carpeta RAÍZ del
// expediente. La raíz contiene "3. PRESUPUESTO Y FACTURAS", y en Drive los
// permisos se HEREDAN: compartir la raíz es compartir los importes. Se comparten
// las subcarpetas concretas, una a una.
// ═══════════════════════════════════════════════════════════════════════════

/** Subcarpetas que se le comparten, según la fase que se le encarga. */
function carpetasParaCertificador(alcance, fase) {
    return [subcarpetaFase(alcance, fase), SUB_DOCS];
}

/**
 * Comparte con "cualquiera con el enlace (lector)" SOLO lo que le toca al
 * certificador y devuelve sus enlaces.
 *
 * Es lo que se llama antes de mandarle el encargo. Idempotente: volver a
 * compartir una carpeta ya compartida no hace nada.
 *
 * @returns {Promise<Array<{nombre:string, link:string}>>}
 */
async function compartirConCertificador(ceeDirecto, fase) {
    const root = ceeDirecto?.drive_folder_id;
    if (!root) return [];

    const salida = [];
    for (const nombre of carpetasParaCertificador(ceeDirecto.alcance, fase)) {
        try {
            // `getOrCreate` y no `find`: si el expediente viene del Drive antiguo
            // puede no tener la carpeta de documentación, y el encargo llegaría sin
            // el sitio donde el técnico tiene que buscar lo que necesita.
            const id = await driveService.getOrCreateSubfolder(root, nombre);
            if (!id) continue;
            await driveService.setFolderPublic(id, 'reader');
            const link = await driveService.getWebViewLink(id)
                || `https://drive.google.com/drive/folders/${id}`;
            salida.push({ nombre, link });
        } catch (err) {
            console.error(`❌ CEE directo: no se pudo compartir "${nombre}":`, err.message);
        }
    }
    return salida;
}

/**
 * ¿Este destino puede hacerse público?
 * Los ficheros subidos desde la app se marcan "cualquiera con el enlace" para que
 * la previsualización del navegador funcione sin estar logueado en la cuenta de
 * Brokergy. En la carpeta de presupuestos y facturas NO: ahí hay importes, y un
 * fichero con enlace público es un fichero que sale de la app en cuanto alguien
 * copia una URL.
 */
function puedeHacersePublico(subcarpetas = []) {
    return !subcarpetas.some(s => String(s).toUpperCase().includes('FACTURA')
        || String(s).toUpperCase().includes('PRESUPUESTO'));
}

/** Renombra la carpeta cuando cambia el nombre del expediente. Best-effort. */
async function renombrarCarpeta(folderId, numeroExpediente, nombre) {
    if (!folderId) return false;
    try {
        await driveService.renameFolder(folderId, nombreCarpeta(numeroExpediente, nombre));
        return true;
    } catch (err) {
        console.error('❌ CEE directo: fallo renombrando la carpeta:', err.message);
        return false;
    }
}

module.exports = {
    PRODUCCION_FOLDER_ID,
    SUB_CEE_UNICO,
    SUB_CEE_INICIAL,
    SUB_CEE_FINAL,
    SUB_FACTURAS,
    SUB_DOCS,
    subcarpetasDe,
    subcarpetaFase,
    nombreCarpeta,
    crearCarpeta,
    asegurarSubcarpetas,
    carpetasParaCertificador,
    compartirConCertificador,
    puedeHacersePublico,
    renombrarCarpeta
};
