require('dotenv').config({ path: '../.env' });
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function checkHierarchy() {
    try {
        console.log('Listing ALL folders in Root...');
        const res = await drive.files.list({
            q: `'${process.env.DRIVE_ROOT_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
            fields: 'files(id, name)',
            pageSize: 100
        });
        console.log(`Found ${res.data.files.length} folders.`);
        res.data.files.forEach(f => {
            console.log(`- ${f.name} (${f.id})`);
        });
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}

checkHierarchy();
