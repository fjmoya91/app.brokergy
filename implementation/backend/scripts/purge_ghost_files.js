const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function purgeGhostFiles() {
    console.log('🚀 Iniciando purga de archivos "test.txt" en Google Drive...');
    
    try {
        // Buscar todos los archivos llamados "test.txt" que no estén en la papelera
        const res = await drive.files.list({
            q: "name = 'test.txt' and trashed = false",
            fields: 'files(id, name, parents)',
        });

        const files = res.data.files || [];
        console.log(`🔍 Encontrados ${files.length} archivos potenciales para eliminar.`);

        for (const file of files) {
            console.log(`🗑️ Eliminando archivo ID: ${file.id} (Nombre: ${file.name})`);
            await drive.files.delete({ fileId: file.id });
        }

        console.log('✅ Purga completada.');
    } catch (err) {
        console.error('❌ Error durante la purga:', err.message);
    }
}

purgeGhostFiles();
