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
async function saveFileToFolder(folderId, fileName, mimeType, fileBuffer) {
    if (!fileBuffer || fileBuffer.length === 0) {
        console.error(`[DriveService] Error: Intento de guardar archivo vacío '${fileName}'`);
        return null;
    }
    console.log(`[DriveService] Guardando archivo '${fileName}' en carpeta ${folderId}...`);
    
    if (fileName.toLowerCase().includes('test')) {
        console.warn(`[DriveService] ALERTA: Detectada creación de archivo '${fileName}'. Stack trace:`);
        console.warn(new Error().stack);
    }
    try {
        const { Readable } = require('stream');
        const readableStream = new Readable();
        readableStream.push(fileBuffer);
        readableStream.push(null);

        const fileMetadata = {
            name: fileName,
            parents: [folderId]
        };
        const media = {
            mimeType: mimeType,
            body: readableStream
        };

        const file = await drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        console.log(`✅ Archivo guardado con éxito en Drive ID: ${file.data.id}`);
        return {
            id: file.data.id,
            link: file.data.webViewLink
        };
    } catch (err) {
        console.error('❌ Error fatal al subir archivo a Drive:', err.message);
        return null;
    }
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

module.exports = {
    setupOpportunityFolder,
    moveFolder,
    renameFolder,
    saveFileToFolder,
    findSubfolderByName,
    findFileByName,
    createSubfolder,
    getOrCreateSubfolder,
    setFolderPublic,
    getFileContent,
    listFiles,
    deleteFile
};
