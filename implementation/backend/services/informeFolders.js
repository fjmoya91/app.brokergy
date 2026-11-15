// ─── informeFolders.js ──────────────────────────────────────────────────────
// Carpetas de Drive de los INFORMES técnicos ({AAAA}INF_{n}) y de los
// CERTIFICADOS DE INSTALACIÓN TÉRMICA ({AAAA}CIT_{n}).
//
// Nada que ver con `driveFolders.js` (CAE: la carpeta VIAJA entre 13 carpetas de
// estado) ni con `ceeDirectoFolders.js` (CEE sueltos, en «26. CERTIF. EFICIENCIA
// ENER / 1. PRODUCCION»). Como en los CEE directos, la carpeta nace al dar de alta
// y NO se mueve nunca: no hay mapa de estados ni sincronizador.
//
//   54. INFORMES TECNICOS                       (INF · Fran, 05/11/2026: primer nivel)
//     └── 2026INF_1 - EUGENIO …
//           ├── 1. INFORME                      borrador, final, Word y _fdo.pdf (versiones a OLD)
//           ├── 2. DOCUMENTACIÓN                lo que aporta el cliente o el instalador
//           └── 3. PRESUPUESTO Y FACTURAS       presupuesto, factura, justificante (nunca público)
//
//   39. LEGALIZACIONES RITE / 2. PRODUCCION     (CIT · Fran, 05/11/2026; al lado de
//     └── 2026CIT_1 - …                          la normativa y la plantilla de la memoria)
//           ├── 1. MEMORIA Y CERTIFICADO        memoria, _fdo.pdf y el certificado oficial de eDICE
//           ├── 2. DOCUMENTACIÓN
//           └── 3. PRESUPUESTO Y FACTURAS
//
// La raíz de cada línea se puede fijar con DRIVE_INFORMES_FOLDER_ID /
// DRIVE_CIT_FOLDER_ID; si no, se busca (o se crea, la primera vez) por su nombre.
// ─────────────────────────────────────────────────────────────────────────────

const driveService = require('./driveService');
const { lineaValida, SUBCARPETAS_DE } = require('../utils/informeEstados');

const NOMBRE_RAIZ = '54. INFORMES TECNICOS';
// La de los CIT cuelga de una carpeta que YA existe (normativa, ejemplos, plantilla).
const RUTA_CIT = ['39. LEGALIZACIONES RITE', '2. PRODUCCION'];
const raizCache = {};

/** El id de la carpeta raíz de la línea. Con `crear: false` no crea nada. */
async function raiz({ crear = true, linea = 'INF' } = {}) {
    const l = lineaValida(linea);
    const fija = l === 'CIT' ? process.env.DRIVE_CIT_FOLDER_ID : process.env.DRIVE_INFORMES_FOLDER_ID;
    if (fija) return fija;
    if (raizCache[l]) return raizCache[l];
    const ruta = l === 'CIT' ? RUTA_CIT : [NOMBRE_RAIZ];
    let id = 'root';
    for (const nombre of ruta) {
        let sig = await driveService.findSubfolderByName(id, nombre);
        if (!sig && crear) {
            sig = await driveService.createSubfolder(id, nombre);
            if (sig) console.log(`✅ ${l}: creada la carpeta «${nombre}» (${sig})`);
        }
        if (!sig) return null;
        id = sig;
    }
    raizCache[l] = id;
    return id;
}

/** `{nº} - {CLIENTE}`, saneado para Drive Desktop en Windows (como los CEE). */
function nombreCarpeta(numero, nombre) {
    const limpio = driveService.sanitizeWindowsSegment(String(nombre || '').trim().toUpperCase());
    return limpio ? `${numero} - ${limpio}` : String(numero);
}

/**
 * Crea (o ADOPTA, si ya hay una con ese nombre) la carpeta del informe y sus tres
 * subcarpetas, en la raíz de SU línea. No lanza: sin Drive el informe se crea
 * igual y la carpeta se vuelve a intentar al subir el primer fichero (`asegurar`).
 * @returns {{id, link, subcarpetas: Record<string,string>} | null}
 */
async function crearCarpeta(numero, nombre, linea = 'INF') {
    try {
        const padre = await raiz({ linea });
        if (!padre) return null;
        const nombreC = nombreCarpeta(numero, nombre);
        let id = await driveService.findSubfolderByName(padre, nombreC);
        if (!id) id = await driveService.createSubfolder(padre, nombreC);
        if (!id) return null;
        const subcarpetas = {};
        for (const s of SUBCARPETAS_DE(linea)) {
            const sid = await driveService.getOrCreateSubfolder(id, s);
            if (sid) subcarpetas[s] = sid;
        }
        return { id, link: await driveService.getWebViewLink(id), subcarpetas };
    } catch (e) {
        console.error('❌ Informes: fallo creando la carpeta de Drive:', e.message);
        return null;
    }
}

/** El id de una subcarpeta del informe (la crea si falta). */
async function subcarpeta(folderId, nombre) {
    if (!folderId) return null;
    return driveService.getOrCreateSubfolder(folderId, nombre);
}

module.exports = { NOMBRE_RAIZ, RUTA_CIT, raiz, nombreCarpeta, crearCarpeta, subcarpeta };
