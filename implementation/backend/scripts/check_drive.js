const { google } = require('googleapis');
require('dotenv').config();

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function listRoot() {
    const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
    console.log(`Checking folders in Root: ${rootId}`);
    try {
        const response = await drive.files.list({
            q: `'${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 100
        });
        console.log('Folders found:', JSON.stringify(response.data.files, null, 2));
    } catch (err) {
        console.error('Drive Error:', err.message);
    }
}

listRoot();
