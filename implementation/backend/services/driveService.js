const { google } = require('googleapis');

const SCOPES = ['https://www.googleapis.com/auth/drive'];

// Configuración de OAuth2
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);

// Establecemos el refresh token
oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

/**
 * Copia el contenido de una carpeta a otra recursivamente
 */
async function copyFolderContents(sourceId, targetId) {
    console.log(`Copiando contenidos de ${sourceId} a ${targetId}...`);
    
    // Si no hay refresh token aún, no podemos operar
    if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
        console.warn('⚠️ No se ha configurado el GOOGLE_OAUTH_REFRESH_TOKEN. La automatización de Drive está pausada.');
        return;
    }

    const response = await drive.files.list({
        q: `'${sourceId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files;
    
    // Usar Promise.all para procesar los archivos en paralelo y ganar velocidad
    await Promise.all(files.map(async (file) => {
        try {
            if (file.mimeType === 'application/vnd.google-apps.folder') {
                const newFolder = await drive.files.create({
                    resource: {
                        name: file.name,
                        mimeType: 'application/vnd.google-apps.folder',
                        parents: [targetId]
                    },
                    fields: 'id'
                });
                await copyFolderContents(file.id, newFolder.data.id);
            } else {
                await drive.files.copy({
                    fileId: file.id,
                    resource: {
                        name: file.name,
                        parents: [targetId]
                    }
                });
            }
        } catch (err) {
            console.error(`Error copiando ${file.name}:`, err.message);
        }
    }));
}

/**
 * Crea una carpeta para una nueva oportunidad clonando la plantilla
 */
async function setupOpportunityFolder(opportunityId, clientRef) {
    try {
        if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
            console.error('❌ Error Drive: GOOGLE_OAUTH_REFRESH_TOKEN no configurado en .env');
            return null;
        }

        const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
        const templateId = process.env.DRIVE_TEMPLATE_ID;
        
        if (!rootId || !templateId) {
            console.error('❌ Error Drive: Faltan IDs de carpeta (Root/Template) en .env');
            return null;
        }

        const folderName = `${opportunityId}${clientRef ? ' - ' + clientRef : ''}`;
        console.log(`Iniciando creación de carpeta en Drive (OAuth2): ${folderName}`);

        // 1. Crear la carpeta principal
        const opportunityFolder = await drive.files.create({
            resource: {
                name: folderName,
                mimeType: 'application/vnd.google-apps.folder',
                parents: [rootId]
            },
            fields: 'id, webViewLink'
        });

        const newFolderId = opportunityFolder.data.id;
        const folderLink = opportunityFolder.data.webViewLink;

        // 1.1 Hacer la carpeta pública (cualquier persona con el enlace)
        await setFolderPublic(newFolderId);

        // 2. Clonar contenido
        await copyFolderContents(templateId, newFolderId);


        console.log(`✅ Carpeta de oportunidad creada con éxito: ${newFolderId}`);
        return {
            id: newFolderId,
            link: folderLink
        };
    } catch (error) {
        console.error('❌ Error fatal en setupOpportunityFolder:', error.message);
        return null;
    }
}

/**
 * Guarda un archivo (buffer) en una carpeta específica de Drive
 */
// Detecta errores TRANSITORIOS de Drive/red que merecen reintento (no un fallo
// permanente como "File not found" o "insufficient permissions").
function isTransientDriveError(err) {
    const status = Number(err?.code ?? err?.response?.status);
    if ([429, 500, 502, 503, 504].includes(status)) return true;
    const msg = `${err?.message || ''} ${err?.code || ''}`.toLowerCase();
    return /\b(rate ?limit|ratelimitexceeded|userratelimit|quota|backenderror|backend error|internalerror|internal error|try again|timeout|econnreset|etimedout|eai_again|socket hang up|network)\b/.test(msg);
}

const _driveSleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Sube un archivo a una carpeta de Drive, con reintento automático ante errores
 * transitorios (5xx / rate limit / red). El stream se recrea en cada intento
 * porque un Readable solo puede consumirse una vez.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.throwOnError=false] Si true, lanza el error real de Drive
 *        en vez de devolver null (para que el llamador muestre la causa exacta).
 *        Por defecto false → mantiene el contrato histórico (null si falla).
 * @param {number} [opts.retries=2] Número de reintentos ante errores transitorios.
 */
async function saveFileToFolder(folderId, fileName, mimeType, fileBuffer, opts = {}) {
    const { throwOnError = false, retries = 2 } = opts;

    if (!fileBuffer || fileBuffer.length === 0) {
        console.error(`[DriveService] Error: Intento de guardar archivo vacío '${fileName}'`);
        if (throwOnError) throw new Error(`El archivo '${fileName}' está vacío (0 bytes) y no se puede subir`);
        return null;
    }
    console.log(`[DriveService] Guardando archivo '${fileName}' en carpeta ${folderId}...`);

    if (fileName.toLowerCase().includes('test')) {
        console.warn(`[DriveService] ALERTA: Detectada creación de archivo '${fileName}'. Stack trace:`);
        console.warn(new Error().stack);
    }

    const { Readable } = require('stream');
    let lastErr;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            // Recrear el stream en CADA intento (un Readable es de un solo uso).
            const readableStream = new Readable();
            readableStream.push(fileBuffer);
            readableStream.push(null);

            const file = await drive.files.create({
                resource: { name: fileName, parents: [folderId] },
                media: { mimeType: mimeType, body: readableStream },
                fields: 'id, webViewLink'
            });

            if (attempt > 0) {
                console.log(`✅ Archivo '${fileName}' subido en el reintento ${attempt + 1}/${retries + 1}`);
            }
            console.log(`✅ Archivo guardado con éxito en Drive ID: ${file.data.id}`);
            return { id: file.data.id, link: file.data.webViewLink };
        } catch (err) {
            lastErr = err;
            const transient = isTransientDriveError(err);
            console.error(`❌ Error al subir archivo a Drive '${fileName}' (intento ${attempt + 1}/${retries + 1}${transient ? ', transitorio' : ', permanente'}): ${err.message}`);
            if (attempt < retries && transient) {
                const wait = 600 * Math.pow(2, attempt); // 600ms, 1200ms, ...
                await _driveSleep(wait);
                continue;
            }
            break; // error permanente o sin reintentos restantes
        }
    }

    if (throwOnError) throw lastErr || new Error('Fallo desconocido al subir a Drive');
    return null;
}

/**
 * Mueve una carpeta de una ubicación a otra
 */
async function moveFolder(fileId, newParentId) {
    console.log(`[DriveService] Intento de movimiento: Carpeta=${fileId} -> Destino=${newParentId}`);
    try {
        const file = await drive.files.get({
            fileId: fileId,
            fields: 'parents, name'
        });
        
        if (!file.data.parents) {
            console.error(`[DriveService] La carpeta ${fileId} no tiene padres.`);
            return false;
        }

        const previousParents = file.data.parents.join(',');
        console.log(`[DriveService] Moviendo folder '${file.data.name}' (${fileId}). Padres antiguos: ${previousParents}`);

        // Mover el archivo al nuevo padre
        await drive.files.update({
            fileId: fileId,
            addParents: newParentId,
            removeParents: previousParents,
            fields: 'id, parents'
        });

        console.log(`✅ Carpeta ${fileId} movida a ${newParentId}`);
        return true;
    } catch (error) {
        console.error('❌ Error al mover carpeta en Drive:', error.message);
        return false;
    }
}

/**
 * Busca un archivo por nombre dentro de una carpeta padre (sin restricción de mimeType)
 */
async function findFileByName(parentId, name) {
    try {
        const safeName = name.replace(/'/g, "\\'");
        const response = await drive.files.list({
            q: `'${parentId}' in parents and name = '${safeName}' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 1
        });
        return response.data.files?.[0]?.id || null;
    } catch (err) {
        console.error(`[DriveService] Error buscando archivo '${name}':`, err.message);
        return null;
    }
}

/**
 * Busca una subcarpeta por nombre dentro de una carpeta padre
 * Devuelve el ID de la subcarpeta o null si no existe
 */
async function findSubfolderByName(parentId, name) {
    try {
        const safeName = name.replace(/'/g, "\\'");
        const response = await drive.files.list({
            q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and name = '${safeName}' and trashed = false`,
            fields: 'files(id)',
            pageSize: 1
        });
        return response.data.files?.[0]?.id || null;
    } catch (err) {
        console.error(`[DriveService] Error buscando subcarpeta '${name}':`, err.message);
        return null;
    }
}

/**
 * Crea una subcarpeta dentro de una carpeta padre
 */
async function createSubfolder(parentId, name) {
    const folder = await drive.files.create({
        resource: {
            name,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [parentId]
        },
        fields: 'id'
    });
    return folder.data.id;
}

/**
 * Busca o crea una subcarpeta dentro de una carpeta padre
 */
async function getOrCreateSubfolder(parentId, subfolderName) {
    try {
        let folderId = await findSubfolderByName(parentId, subfolderName);
        if (!folderId) {
            folderId = await createSubfolder(parentId, subfolderName);
        }
        return folderId;
    } catch (err) {
        console.error(`[DriveService] Error en getOrCreateSubfolder para '${subfolderName}':`, err.message);
        return parentId; // Fallback al padre si falla
    }
}

/**
 * Normaliza el nombre de una carpeta para comparaciones TOLERANTES a diferencias
 * de espacios/puntuación: "5. FACTURAS" ≡ "5.FACTURAS" ≡ "5 FACTURAS" → "5facturas".
 */
function normalizeFolderName(name) {
    return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Busca una subcarpeta por nombre tolerante a espacios/puntuación. Lista las
 * subcarpetas del padre y compara por nombre normalizado; prefiere una coincidencia
 * EXACTA si existe. Evita duplicar carpetas cuando la plantilla usa "5. FACTURAS"
 * (con espacio) y el código pedía "5.FACTURAS" (sin espacio).
 */
async function findSubfolderByNameNormalized(parentId, name) {
    try {
        const response = await drive.files.list({
            q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 200
        });
        const folders = response.data.files || [];
        const exact = folders.find(f => f.name === name);
        if (exact) return exact.id;
        const target = normalizeFolderName(name);
        const norm = folders.find(f => normalizeFolderName(f.name) === target);
        return norm?.id || null;
    } catch (err) {
        console.error(`[DriveService] Error buscando subcarpeta (norm) '${name}':`, err.message);
        return null;
    }
}

/**
 * Igual que getOrCreateSubfolder pero con búsqueda tolerante (normalizeFolderName):
 * solo crea la carpeta si NO existe ninguna variante. Úsalo para carpetas que ya
 * vienen en la plantilla de Drive para no generar duplicados por diferencias de nombre.
 */
async function getOrCreateSubfolderNormalized(parentId, subfolderName) {
    try {
        let folderId = await findSubfolderByNameNormalized(parentId, subfolderName);
        if (!folderId) folderId = await createSubfolder(parentId, subfolderName);
        return folderId;
    } catch (err) {
        console.error(`[DriveService] Error en getOrCreateSubfolderNormalized para '${subfolderName}':`, err.message);
        return parentId;
    }
}

/**
 * Renombra un archivo o carpeta en Drive
 */
async function renameFolder(fileId, newName) {
    console.log(`[DriveService] Renombrando ${fileId} a '${newName}'...`);
    try {
        await drive.files.update({
            fileId: fileId,
            resource: { name: newName },
            fields: 'id, name'
        });
        console.log(`✅ Renombrado con éxito: ${fileId} -> '${newName}'`);
        return true;
    } catch (error) {
        console.error('❌ Error al renombrar en Drive:', error.message);
        return false;
    }
}

/**
 * Hace que una carpeta sea accesible para cualquier persona con el vínculo (lector)
 */
async function setFolderPublic(fileId, role = 'reader') {
    console.log(`[DriveService] Haciendo pública la carpeta ${fileId} con rol ${role}...`);
    try {
        await drive.permissions.create({
            fileId: fileId,
            resource: {
                role: role,
                type: 'anyone'
            }
        });
        console.log(`✅ Carpeta ${fileId} ahora es pública (cualquier persona con el enlace).`);
        return true;
    } catch (error) {
        console.error('❌ Error al cambiar permisos en Drive:', error.message);
        return false;
    }
}

/**
 * Comparte un fichero/carpeta con un email concreto. Idempotente: si el email ya
 * tiene permiso, lo trata como éxito.
 */
async function grantPermissionToEmail(fileId, emailAddress, role = 'writer') {
    if (!fileId || !emailAddress) {
        throw new Error('fileId y emailAddress son obligatorios');
    }
    try {
        const { data } = await drive.permissions.create({
            fileId,
            sendNotificationEmail: false,
            requestBody: { type: 'user', role, emailAddress },
        });
        console.log(`[DriveService] Permiso ${role} otorgado a ${emailAddress} sobre ${fileId}`);
        return { ok: true, permissionId: data.id };
    } catch (err) {
        const detail = err?.errors?.[0]?.message || err?.response?.data?.error?.message || err.message || '';
        if (/already|duplicate|exists/i.test(detail)) {
            console.log(`[DriveService] ${emailAddress} ya tenía permiso sobre ${fileId}`);
            return { ok: true, alreadyGranted: true };
        }
        console.error(`[DriveService] Error otorgando permiso a ${emailAddress} sobre ${fileId}:`, detail);
        throw err;
    }
}

/**
 * Devuelve el webViewLink de un fichero/carpeta de Drive.
 */
async function getWebViewLink(fileId) {
    try {
        const { data } = await drive.files.get({ fileId, fields: 'webViewLink' });
        return data?.webViewLink || `https://drive.google.com/drive/folders/${fileId}`;
    } catch (err) {
        console.error(`[DriveService] Error obteniendo webViewLink de ${fileId}:`, err.message);
        return `https://drive.google.com/drive/folders/${fileId}`;
    }
}

/**
 * Obtiene el contenido de un archivo en Drive como Buffer
 */
async function getFileContent(fileId) {
    try {
        const response = await drive.files.get({
            fileId: fileId,
            alt: 'media'
        }, { responseType: 'arraybuffer' });
        return Buffer.from(response.data);
    } catch (err) {
        console.error(`[DriveService] Error obteniendo contenido de archivo ${fileId}:`, err.message);
        return null;
    }
}

/**
 * Lista los archivos de una carpeta
 */
async function listFiles(folderId) {
    try {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, webViewLink)',
            orderBy: 'name'
        });
        const allFiles = response.data.files || [];
        // Filtro explícito para eliminar archivos fantasma "test.txt"
        return allFiles.filter(f => f.name !== 'test.txt');
    } catch (err) {
        console.error(`[DriveService] Error listando archivos de carpeta ${folderId}:`, err.message);
        return [];
    }
}

/**
 * Lista los archivos de una carpeta cuyo nombre EMPIEZA por `prefix` (case-insensitive).
 * Útil para precarga de slots canónicos tipo `FOTO_CALDERA_ANTES*`.
 * Ordena por createdTime descendente (más reciente primero).
 */
async function listFilesByPrefix(folderId, prefix) {
    try {
        const safePrefix = String(prefix || '').replace(/'/g, "\\'");
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false and name contains '${safePrefix}'`,
            fields: 'files(id, name, mimeType, webViewLink, createdTime)',
            orderBy: 'createdTime desc'
        });
        const all = response.data.files || [];
        const upper = String(prefix || '').toUpperCase();
        return all.filter(f => (f.name || '').toUpperCase().startsWith(upper) && f.name !== 'test.txt');
    } catch (err) {
        console.error(`[DriveService] Error listando por prefijo '${prefix}' en ${folderId}:`, err.message);
        return [];
    }
}

/**
 * Copia un archivo a una carpeta destino, opcionalmente renombrándolo.
 * Devuelve { id, link } del nuevo archivo, o null si falla.
 */
async function copyFile(sourceFileId, targetFolderId, newName) {
    try {
        const response = await drive.files.copy({
            fileId: sourceFileId,
            requestBody: {
                name: newName,
                parents: [targetFolderId]
            },
            fields: 'id, webViewLink'
        });
        return {
            id: response.data.id,
            link: response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`
        };
    } catch (err) {
        console.error(`[DriveService] Error copiando archivo ${sourceFileId} → ${targetFolderId}:`, err.message);
        return null;
    }
}

/**
 * Obtiene metadatos básicos de un archivo (sin contenido).
 */
async function getFileMetadata(fileId) {
    try {
        const response = await drive.files.get({
            fileId,
            fields: 'id, name, size, mimeType, webViewLink'
        });
        return response.data;
    } catch (err) {
        console.error(`[DriveService] Error metadata ${fileId}:`, err.message);
        return null;
    }
}

/**
 * Devuelve los segmentos de carpeta desde la raíz "Mi unidad" (My Drive) hasta la
 * carpeta indicada, subiendo por la cadena de carpetas padre en Drive.
 *
 * Se usa para reconstruir la ruta LOCAL de Windows (espejo de Google Drive para
 * escritorio) de un expediente: la ruta local es exactamente la misma jerarquía
 * bajo "C:\Users\...\Mi unidad". Así la ruta es siempre correcta aunque la carpeta
 * se haya movido de subcarpeta de estado (2. ACEPTADO → 3. EN CURSO, etc.).
 *
 * @param {string} fileId  ID de la carpeta del expediente en Drive.
 * @returns {Promise<string[]>}  Segmentos de arriba (justo bajo "Mi unidad") hacia abajo.
 */
async function getFolderPathSegments(fileId) {
    if (!process.env.GOOGLE_OAUTH_REFRESH_TOKEN) return [];

    let rootId = null;
    try {
        const r = await drive.files.get({ fileId: 'root', fields: 'id', supportsAllDrives: true });
        rootId = r.data.id;
    } catch (e) {
        console.warn('[DriveService] No se pudo resolver el root de Drive:', e.message);
    }

    const segments = [];
    let currentId = fileId;
    let guard = 0; // tope anti-bucle (jerarquías de Drive nunca son tan profundas)
    while (currentId && currentId !== rootId && guard < 30) {
        const { data } = await drive.files.get({
            fileId: currentId,
            fields: 'id, name, parents',
            supportsAllDrives: true,
        });
        if (!data) break;
        segments.unshift(data.name);
        currentId = (data.parents && data.parents.length) ? data.parents[0] : null;
        guard++;
    }
    return segments;
}

/**
 * Sanea un nombre de carpeta/fichero tal y como hace Google Drive para escritorio al
 * espejar en Windows: los caracteres ilegales de Windows ( \ / : * ? " < > | ) se
 * sustituyen por un espacio (verificado empíricamente: "/" → espacio), y Windows
 * recorta espacios/puntos finales. Se usa para construir la ruta LOCAL del expediente
 * de modo que coincida con la carpeta real en disco. El handler .vbs además resuelve
 * de forma tolerante por si Google cambiara el criterio para algún carácter.
 */
function sanitizeWindowsSegment(name) {
    return String(name == null ? '' : name)
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/[ .]+$/g, '');
}

/**
 * Elimina un archivo de Drive (lo mueve a la papelera)
 */
async function deleteFile(fileId) {
    console.log(`[DriveService] Eliminando archivo ${fileId}...`);
    try {
        await drive.files.update({
            fileId: fileId,
            resource: { trashed: true }
        });
        return true;
    } catch (err) {
        console.error(`[DriveService] Error eliminando archivo ${fileId}:`, err.message);
        return false;
    }
}

/**
 * Archiva un fichero existente en la subcarpeta "OLD" del folder dado, renombrándolo
 * a `{base}_OLD{ext}` y, si ya existe, `{base}_OLD1{ext}`, `{base}_OLD2{ext}`… (primer
 * hueco libre). Devuelve el nombre final usado, o null si falla.
 */
async function archiveExistingToOld(currentFolderId, existingFileId, fileName) {
    try {
        const oldFolderId = await getOrCreateSubfolder(currentFolderId, 'OLD');
        const dotIdx = fileName.lastIndexOf('.');
        const baseName = dotIdx > 0 ? fileName.substring(0, dotIdx) : fileName;
        const ext = dotIdx > 0 ? fileName.substring(dotIdx) : '';
        let candidate = `${baseName}_OLD${ext}`;
        let n = 1;
        // Buscar el primer nombre libre en la carpeta OLD (_OLD, _OLD1, _OLD2…).
        while (await findFileByName(oldFolderId, candidate)) {
            candidate = `${baseName}_OLD${n}${ext}`;
            n++;
        }
        await renameFolder(existingFileId, candidate);
        await moveFolder(existingFileId, oldFolderId);
        return candidate;
    } catch (err) {
        console.warn(`[DriveService] archiveExistingToOld('${fileName}'):`, err.message);
        return null;
    }
}

module.exports = {
    setupOpportunityFolder,
    archiveExistingToOld,
    moveFolder,
    renameFolder,
    saveFileToFolder,
    findSubfolderByName,
    findFileByName,
    createSubfolder,
    getOrCreateSubfolder,
    normalizeFolderName,
    findSubfolderByNameNormalized,
    getOrCreateSubfolderNormalized,
    setFolderPublic,
    grantPermissionToEmail,
    getWebViewLink,
    getFileContent,
    copyFile,
    getFileMetadata,
    getFolderPathSegments,
    sanitizeWindowsSegment,
    listFiles,
    listFilesByPrefix,
    deleteFile
};
