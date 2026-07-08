// Envía un email de prueba del "Visto Bueno" (diseño nuevo) al correo indicado.
// Uso:  node scripts/test_email_visto_bueno.js  [destinatario opcional]
// Lee el código ACTUAL del disco (services/emailService.js), así que sirve para
// comprobar el diseño sin depender de que el backend en marcha esté reiniciado.
require('dotenv').config();
const email = require('../services/emailService');

const to = process.argv[2] || 'franciscojavier.moya.s2e2@gmail.com';

(async () => {
    const r = await email.sendCertificadorApproveNotification(
        to,
        'FRANCISCO JAVIER MOYA',
        '26RES060_159',
        'CEE Inicial',
        'https://app.brokergy.es/?exp=07b333b6-9d3b-4002-8f4f-470dcfe6c61e',
        null,
        null,
        '¡Hola Francisco! 👋\n\nHemos revisado el CEE Inicial del expediente 26RES060_159 (David Cobos Pérez) y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.\n\n¡Gracias!\n\n🔗 Abre el expediente:\nhttps://app.brokergy.es/?exp=07b333b6-9d3b-4002-8f4f-470dcfe6c61e',
        {
            presentFolderLink: 'https://drive.google.com/drive/folders/1UE8W6AXVdwcqzh6QgQxId7qE3WLyJ09A',
            ceeUploadLink: 'https://app.brokergy.es/subir-cee/07b333b6-9d3b-4002-8f4f-470dcfe6c61e?token=abc&phase=inicial'
        }
    );
    console.log('ENVIADO OK ->', JSON.stringify(r));
})().catch(e => { console.error('ERROR:', e.message); });
