const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    'http://localhost:3333/oauth2callback'
);

oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function listTemplate() {
    console.log('Loading config from:', path.join(__dirname, '../.env'));
    const templateId = process.env.DRIVE_TEMPLATE_ID || '1JHOE7AYTRj9kL31BHysWOfSp_SiI76eK';
    console.log('Using Template ID:', templateId);
    
    const response = await drive.files.list({
        q: `'${templateId}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType)',
    });

    const files = response.data.files;
    console.log(`\n--- FOLDERS & FILES IN TEMPLATE ---`);
    const budgetFolder = files.find(f => f.name === '0. PRESUPUESTO' && f.mimeType === 'application/vnd.google-apps.folder');
    if (budgetFolder) {
        console.log(`\n--- FILES INSIDE '0. PRESUPUESTO' TEMPLATE ---`);
        const budgetResp = await drive.files.list({
            q: `'${budgetFolder.id}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType)',
        });
        const budgetFiles = budgetResp.data.files;
        if (!budgetFiles || budgetFiles.length === 0) {
            console.log('Empty budget folder.');
        } else {
            budgetFiles.forEach(f => console.log(`[ARCHIVO] ${f.name}`));
        }
        console.log(`------------------------------------\n`);
    }
}

listTemplate().catch(err => {
    console.error('ERROR:', err.message);
    if (err.response) console.error('Response:', err.response.data);
});
