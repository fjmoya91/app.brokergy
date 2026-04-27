require('dotenv').config({ path: '../.env' });
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_OAUTH_CLIENT_ID,
    process.env.GOOGLE_OAUTH_CLIENT_SECRET
);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: 'v3', auth: oauth2Client });

async function checkFile(id) {
    try {
        const res = await drive.files.get({
            fileId: id,
            fields: 'id, name, parents'
        });
        console.log('FILE DETAILS:', res.data);
    } catch (err) {
        console.error('ERROR:', err.message);
    }
}

checkFile('1hAhPLf3BbbwAVfdAbzH5cpwcx1N3iCpT');
