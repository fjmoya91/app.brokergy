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
            
            const fs = require('fs');
            const path = require('path');
            const envPath = path.join(__dirname, '..', '.env');
            
            let envContent = '';
            if (fs.existsSync(envPath)) {
                envContent = fs.readFileSync(envPath, 'utf8');
                if (envContent.includes('GOOGLE_OAUTH_REFRESH_TOKEN=')) {
                    envContent = envContent.replace(/GOOGLE_OAUTH_REFRESH_TOKEN=.*/, `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}`);
                } else {
                    envContent += `\nGOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
                }
            } else {
                envContent = `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`;
            }
            
            fs.writeFileSync(envPath, envContent);
            fs.writeFileSync(path.join(__dirname, '..', 'refresh_token.txt'), tokens.refresh_token);

            console.log('\n✅ ¡Autorización completada con éxito!');
            console.log('El token se ha guardado automáticamente en el archivo .env\n');

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
                <html>
                <body style="font-family: sans-serif; text-align: center; padding: 50px; background: #0f172a; color: white;">
                    <h1 style="color: #22d3ee;">✅ ¡Autorización completada!</h1>
                    <p>El token de Google Drive se ha guardado directamente en la configuración del servidor.</p>
                    <p>Ya puedes cerrar esta ventana y volver a la terminal o decirle al asistente que continúe.</p>
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
