// Arranque del backend en LOCAL sin NADA que salga a terceros ni se dispare solo.
//
//   node -r ./scripts/local_sin_envios.cjs server.js        (desde implementation/backend)
//
// Para MIRAR la app en local (capturas, la envolvente, probar una pantalla) sin el
// riesgo de siempre: el `.env` local trae WHATSAPP_ENABLED=true y un backend local
// abre su propia sesión contra la MISMA cuenta de WhatsApp que producción. Aquí se
// apagan WhatsApp y todo lo programado (avisos, envíos, rondas, agentes) ANTES de
// que `server.js` lea su `.env`: dotenv no pisa lo que ya está puesto.
//
// En un WORKTREE no hay `.env` (no está en git): se carga el de la copia principal
// del repo, que se encuentra por el directorio común de git.
//
// ⚠ La base de datos y Drive siguen siendo los de PRODUCCIÓN: esto quita los
// envíos, no las escrituras. Para mirar sin escribir, el capturador de la
// envolvente (`scratch/envolvente_ui/captura.js`) aborta toda escritura.
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const APAGADOS = [
    'WHATSAPP_ENABLED', 'BOT_WHATSAPP_ENABLED', 'WA_AUTO_SYNC', 'WA_SYNC_INSTALADORES', 'WA_RONDA_ENABLED',
    'REVISION_ALERTA_ENABLED', 'CEE_ENTREGA_AUTO', 'PROPUESTA_PROGRAMADA_ENABLED', 'RESENA_PROGRAMADA_ENABLED',
    'FIRMADOS_SO_CORREO_ENABLED', 'CARTA_PAGO_ENVIO_AUTO', 'ACEPTACION_AGENTE_ENABLED', 'CEE_REGISTRO_AVISO_AUTO',
    'PRESENTAR_NOCHE_ENABLED', 'CEE_CIEGO_ENABLED', 'CERTAPP_AVISOS_ENABLED', 'CERTAPP_IA_AUTO',
    'CERTAPP_ENTREGA_AUTO', 'CERTAPP_ASISTENTE_ENABLED', 'VERIFACTU_ENVIO_ENABLED',
];
for (const k of APAGADOS) process.env[k] = 'false';
// El timbre del asistente del VPS: sin URL no llama a nadie.
process.env.ASISTENTE_URL = '';
// `--puerto 3010`: para no chocar con otro backend local (el frontend lo busca
// por BACKEND_PORT en su `.env.local`).
const iPuerto = process.argv.indexOf('--puerto');
if (iPuerto > 0 && process.argv[iPuerto + 1]) process.env.PORT = process.argv[iPuerto + 1];

const backend = path.join(__dirname, '..');
let env = path.join(backend, '.env');
if (!fs.existsSync(env)) {
    try {
        const comun = execSync('git rev-parse --path-format=absolute --git-common-dir', { cwd: backend })
            .toString().trim();
        const principal = path.join(path.dirname(comun), 'implementation', 'backend', '.env');
        if (fs.existsSync(principal)) env = principal;
    } catch { /* sin git: se queda sin .env y server.js lo dirá */ }
}
require('dotenv').config({ path: env, quiet: true });
console.log(`[local-sin-envios] .env: ${env} · apagados: WhatsApp y ${APAGADOS.length - 1} automatismos`);
