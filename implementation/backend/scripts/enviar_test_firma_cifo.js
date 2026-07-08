// Script de PRUEBA: envía al instalador (simulado) el email para firmar el CIFO
// del expediente 26RES060_131 con enlace directo a la firma con Autofirma.
// Uso: node scripts/enviar_test_firma_cifo.js
const path = require('path');
const dotenv = require('dotenv');
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const emailService = require('../services/emailService');
const { getFileContent } = require('../services/driveService');

const EXP_ID = '4eefdd7d-ec69-49ae-b364-092d59eb43e7';
const NUM_EXPTE = '26RES060_131';
const CIFO_DRIVE_FILE_ID = '19Pus9hpmaJvZhQjORpG8iH1NDAdRNbI6';
const TO = 'franciscojavier.moya.s2e2@gmail.com';
const NOMBRE = 'Fran';
const CLIENTE = 'SANEAMIENTOS ERNESTO, SL';
const SIGN_LINK = `http://localhost:5173/subir-cifo/${EXP_ID}`;

(async () => {
    try {
        console.log('Descargando CIFO borrador desde Drive…');
        const pdfBuffer = await getFileContent(CIFO_DRIVE_FILE_ID);
        console.log('CIFO descargado:', pdfBuffer?.length, 'bytes');

        // Mensaje editable (igual que el que genera el modal "PRIMERA FIRMA").
        const message = `Hola ${NOMBRE},\n\nTe adjunto el *Certificado CIFO* correspondiente al expediente *${NUM_EXPTE}* de ${CLIENTE}.\n\nAhora puedes *firmarlo directamente* con tu certificado electrónico, sin descargar ni volver a subir nada: abre el enlace y fírmalo con *Autofirma* (representante legal de la empresa instaladora). Nos llegará firmado automáticamente:\n\n${SIGN_LINK}\n\nSi lo prefieres, desde ese mismo enlace también puedes subir el PDF ya firmado.\n\nUn saludo,\n*BROKERGY · Ingeniería Energética*`;

        console.log('Enviando email (branded) a', TO, '…');
        await emailService.sendDocumentEmail({
            to: TO,
            subject: `${NUM_EXPTE} - Firma tu Certificado CIFO (${CLIENTE})`,
            title: 'Firma tu Certificado CIFO',
            message,
            primaryLink: SIGN_LINK,
            primaryLabel: '🖊️ Firmar CIFO ahora',
            secondaryNote: 'Necesitas tener Autofirma instalado para firmar en el navegador. Si lo prefieres, puedes subir el PDF ya firmado desde ese mismo enlace.',
            pill: { tone: 'warning', text: 'Pendiente de firma', emoji: '✍️' },
            attachments: [{ filename: `${NUM_EXPTE} - Certificado_CIFO.pdf`, content: pdfBuffer }],
        });
        console.log('✅ Email enviado correctamente a', TO);
        console.log('   Enlace de firma:', SIGN_LINK);
    } catch (e) {
        console.error('✗ Error enviando el email de prueba:', e);
        process.exitCode = 1;
    }
})();
