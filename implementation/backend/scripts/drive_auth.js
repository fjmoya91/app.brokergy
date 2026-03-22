/**
 * Script de autorización OAuth2 para Google Drive.
 * Se ejecuta UNA SOLA VEZ para obtener el refresh_token.
 * 
 * Uso: node scripts/drive_auth.js
 * 
 * Requisitos en .env:
 *   GOOGLE_OAUTH_CLIENT_ID=...
 *   GOOGLE_OAUTH_CLIENT_SECRET=...
 */
require('dotenv').config();
const { google } = require('googleapis');
const http = require('http');
const url = require('url');

const CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333/oauth2callback';
const SCOPES = ['https://www.googleapis.com/auth/drive'];

if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error('❌ Faltan GOOGLE_OAUTH_CLIENT_ID y/o GOOGLE_OAUTH_CLIENT_SECRET en .env');
    process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent' // Forzar para obtener refresh_token
});

// Crear un servidor HTTP temporal para recibir el callback
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    if (parsedUrl.pathname === '/oauth2callback') {
        const code = parsedUrl.query.code;
        
        if (!code) {
            res.writeHead(400);
            res.end('Error: No se recibió código de autorización.');
            return;
        }
        
        try {
            const { tokens } = await oauth2Client.getToken(code);
            
            console.log('\n✅ ¡Autorización completada con éxito!\n');
            console.log('='.repeat(60));
            console.log('REFRESH TOKEN (copia esto en tu .env):');
            console.log('='.repeat(60));
            console.log(`\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`);
            console.log('='.repeat(60));
            
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
                    <h1 style="color: #22d3ee;">✅ ¡Autorización completada!</h1>
                    <p>Ya puedes cerrar esta ventana y volver a la terminal.</p>
                    <p style="color: #94a3b8; font-size: 14px;">El refresh token se ha mostrado en la consola.</p>
                </body>
                </html>
            `);
        } catch (err) {
            console.error('Error al obtener tokens:', err.message);
            res.writeHead(500);
            res.end('Error al obtener tokens: ' + err.message);
        }
        
        // Cerrar servidor después de un momento
        setTimeout(() => {
            server.close();
            process.exit(0);
        }, 2000);
    }
});

server.listen(3333, () => {
    console.log('\n🔑 Autorización de Google Drive para Brokergy');
    console.log('='.repeat(50));
    console.log('\nAbre este enlace en tu navegador:\n');
    console.log(authUrl);
    console.log('\nEsperando autorización...\n');
});
