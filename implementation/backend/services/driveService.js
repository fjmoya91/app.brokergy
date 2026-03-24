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
 * Mueve una carpeta de una ubicación a otra
 */
async function moveFolder(fileId, newParentId) {
    try {
        // Obtener los padres actuales
        const file = await drive.files.get({
            fileId: fileId,
            fields: 'parents'
        });
        const previousParents = file.data.parents.join(',');

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

module.exports = {
    setupOpportunityFolder,
    moveFolder
};
