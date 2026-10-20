// ============================================================================
// docs_obra.cjs — los DOCUMENTOS de la obra que el agente puede leer: el
// presupuesto («0. PRESUPUESTO») y lo que no es foto de «12. DOCUMENTOS PARA
// CEE» (o «4. DOCUMENTACIÓN PARA CEE» en un CEE directo). Nunca «1. CEE»: ahí
// está el certificado del técnico, que es con lo que se le compara.
// Solo LEE. Se lanza con `seco.cjs` delante, como cee_inicial.js.
//
//   node -r seco.cjs docs_obra.cjs listar <clave>
//   node -r seco.cjs docs_obra.cjs bajar  <clave> <fileId> <dir>
// ============================================================================
const fs = require('fs');
const path = require('path');

const BACK = path.resolve(__dirname, '..', '..', 'implementation', 'backend');
const cex = require(path.join(BACK, 'services', 'ceeEnvolventeCex'));
const drive = require(path.join(BACK, 'services', 'driveService'));

const CARPETAS = ['0. PRESUPUESTO', '12. DOCUMENTOS PARA CEE', '4. DOCUMENTACIÓN PARA CEE'];
const IMAGEN = /\.(jpe?g|png|heic|webp|gif)$/i;

function origenDe(clave) {
    if (/_OP\d+$/i.test(clave)) return 'op';
    if (/^\d{4}CEE_\d+$/i.test(clave)) return 'cee';
    return 'cae';
}

async function permitidos(clave) {
    const ctx = await cex.cargarExpediente(clave, origenDe(clave));
    if (!ctx?.driveFolderId) throw new Error(`${clave} no tiene carpeta de Drive.`);
    const out = [];
    for (const nombre of CARPETAS) {
        const id = await drive.findSubfolderByNameNormalized?.(ctx.driveFolderId, nombre)
            ?? await drive.findSubfolderByName(ctx.driveFolderId, nombre);
        if (!id) continue;
        for (const f of (await drive.listFiles(id)) || []) {
            if (f.mimeType === 'application/vnd.google-apps.folder') continue;
            if (nombre.startsWith('12.') && IMAGEN.test(f.name || '')) continue; // las fotos ya las baja `fotos`
            out.push({ carpeta: nombre, id: f.id, nombre: f.name, tipo: f.mimeType });
        }
    }
    return out;
}

(async () => {
    const [orden, clave, id, dir] = process.argv.slice(2);
    const lista = await permitidos(clave);
    if (orden === 'listar') {
        if (!lista.length) console.log('No hay documentos en «0. PRESUPUESTO» ni en «12.» (aparte de las fotos).');
        for (const f of lista) console.log(`${f.id}  ${f.carpeta} / ${f.nombre}`);
        return;
    }
    if (orden === 'bajar') {
        const f = lista.find(x => x.id === id);
        if (!f) throw new Error('Ese fichero no está en las carpetas que se pueden leer.');
        const buf = await drive.getFileContent(id);
        if (!buf) throw new Error('Drive no lo ha devuelto.');
        fs.mkdirSync(dir, { recursive: true });
        const destino = path.join(dir, String(f.nombre).replace(/[\\/:*?"<>|]/g, '_'));
        fs.writeFileSync(destino, buf);
        console.log(`Bajado: ${destino} (${Math.round(buf.length / 1024)} KB)`);
        return;
    }
    throw new Error(`Orden desconocida: ${orden}`);
})().then(() => process.exit(0), (e) => { console.error(e.message); process.exit(1); });
