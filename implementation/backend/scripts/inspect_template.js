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

async function listRecursive(folderId, path = '') {
    const res = await drive.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
    });
    
    for (const file of res.data.files) {
        console.log(`${path}/${file.name} (${file.mimeType})`);
        if (file.mimeType === 'application/vnd.google-apps.folder') {
            await listRecursive(file.id, `${path}/${file.name}`);
        }
    }
}

async function run() {
    console.log('Listing template contents for:', process.env.DRIVE_TEMPLATE_ID);
    await listRecursive(process.env.DRIVE_TEMPLATE_ID);
    console.log('Done.');
}

run().catch(console.error);
