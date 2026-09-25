// ─────────────────────────────────────────────────────────────────────────────
// La imagen que va DENTRO del .cex: la puesta a mano manda sobre la de Catastro.
//
// Catastro no siempre tiene foto de fachada, y cuando la tiene puede ser de hace
// quince años o de la casa de al lado. El certificador ha estado delante del
// edificio: si pone la suya, es la que tiene que viajar al certificado — y la
// pantalla tiene que enseñar ESA, no otra.
//
// Aquí NO se escribe en el Drive de ningún expediente: Drive y Supabase van
// simulados. Lo que se prueba es la decisión (cuál gana, qué se dice cuando el
// fichero ya no está) y que el `.cex` y la vista salen de la MISMA función.
//
//     node implementation/backend/scripts/test_imagenes_cex.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(AQUI, 'x.js'));

let fallos = 0;
const ok = (cond, que) => { if (!cond) { fallos++; console.log('  ✗ ' + que); }
                            else console.log('  ✓ ' + que); };

// ── Los dobles, puestos ANTES de cargar el servicio ──────────────────────────
const drive = require('../services/driveService');
const catastro = require('../services/catastroService');
const monitor = require('../services/catastroMonitor');
const supabase = require('../services/supabaseClient');

const FACHADA_CATASTRO = Buffer.from('FOTO-DE-CATASTRO');
const CROQUIS_CATASTRO = Buffer.from('CROQUIS-DE-CATASTRO');
const MIA = Buffer.from('LA-FOTO-QUE-HICE-YO');

const drivelandia = new Map([['id-mio', MIA]]);
let subidos = [];
let archivados = [];
let escrito = null;

monitor.shouldSkipRequest = () => false;
const MINI = Buffer.from('LA-MISMA-PERO-MAS-PEQUENA');
catastro.getFacadeImage = async () => ({ data: FACHADA_CATASTRO, miniatura: MINI });
catastro.getParcelImage = async () => ({ data: CROQUIS_CATASTRO });
drive.getFileContent = async (id) => {
    if (!drivelandia.has(id)) throw new Error('File not found');
    return drivelandia.get(id);
};
drive.findFileByName = async () => 'id-anterior';
drive.archiveExistingToOld = async (carpeta, id, nombre) => { archivados.push(nombre); };
drive.saveFileToFolder = async (carpeta, nombre, tipo, buffer) => {
    const id = `id-${subidos.length}`;
    drivelandia.set(id, buffer);
    subidos.push({ carpeta, nombre, tipo });
    return { id, webViewLink: `https://drive/${id}` };
};
// Devuelve { id, link }, como la de verdad (`carpetaFase` desestructura).
require('../services/ceeUploadService').ensureCeeSectionFolder = async () => ({ id: 'carpeta-cee', link: 'https://drive/carpeta-cee' });
supabase.rpc = async (_fn, args) => { escrito = args; return { error: null }; };

const cex = require('../services/ceeEnvolventeCex');

const b64 = (buf) => buf.toString('base64');
const ctxCon = (imagenes) => ({
    expediente: {
        id: 'exp-1', numero_expediente: '26RES060_186',
        instalacion: { ref_catastral: '4410205WJ0641S0001JH' },
        cee: imagenes ? { envolvente_imagenes: imagenes } : {},
    },
});

console.log('\n1. Sin nada puesto, mandan las de Catastro');
{
    const img = await cex.imagenesDelCex(ctxCon(null), null);
    ok(img.foto_edificio === b64(FACHADA_CATASTRO), 'la foto es la de Catastro');
    ok(img.plano_situacion === b64(CROQUIS_CATASTRO), 'y el croquis también');
    ok(Object.keys(img.sustituidas).length === 0, 'ninguna sustituida');
}

console.log('\n1.b Al .cex va la GRANDE; a la pantalla, la miniatura');
{
    // Catastro sirve la fachada a 2304x1728 (323 KB) y la pantalla la pinta en
    // un recuadro de 300x170: esperar 431 KB de base64 para eso es lo que hacia
    // que la imagen del certificado tardara en aparecer. El fichero ya trae una
    // de 640x480 dentro de su EXIF.
    const img = await cex.imagenesDelCex(ctxCon(null), null);
    ok(img.foto_edificio === b64(FACHADA_CATASTRO), 'el .cex se queda con la grande');
    ok(img.foto_edificio_vista === b64(MINI), 'y la pantalla con la pequeña');
}
console.log('\n2. Con una puesta a mano, manda la MÍA');
{
    const img = await cex.imagenesDelCex(
        ctxCon({ fachada: { drive_id: 'id-mio', nombre: 'la mia.jpg' } }), null);
    ok(img.foto_edificio === b64(MIA), 'la foto es la que puse yo');
    ok(img.foto_edificio_vista === b64(MIA), 'y la pantalla enseña esa misma');
    ok(img.plano_situacion === b64(CROQUIS_CATASTRO), 'el croquis sigue siendo el de Catastro');
    ok(img.sustituidas.fachada?.nombre === 'la mia.jpg', 'y se dice cuál es mía');
}

console.log('\n3. Si el fichero ya no está en Drive, se DICE y se cae a Catastro');
{
    const img = await cex.imagenesDelCex(
        ctxCon({ fachada: { drive_id: 'id-borrado' } }), null);
    ok(img.foto_edificio === b64(FACHADA_CATASTRO), 'vuelve la de Catastro');
    ok(img.avisos.some(a => a.includes('ya no está en Drive')), 'y sale el aviso');
}

console.log('\n4. Sustituir: va a la carpeta del CEE, con nombre canónico');
{
    subidos = []; archivados = []; escrito = null;
    const puesta = await cex.sustituirImagen(ctxCon(null), 'fachada', {
        buffer: MIA, mimetype: 'image/jpeg', originalname: 'IMG_2044.JPG',
    });
    ok(subidos[0]?.carpeta === 'carpeta-cee', 'a la misma carpeta que el .cex');
    ok(subidos[0]?.nombre === '26RES060_186 - FOTO FACHADA CEX.jpg',
       'con el nombre canónico (y jpg, no jpeg)');
    ok(archivados.length === 1, 'la anterior se archiva en OLD, no se tira');
    ok(escrito?.p_field === 'envolvente_imagenes', 'se sella en su propia clave de `cee`');
    ok(escrito?.p_value?.fachada?.drive_id === puesta.drive_id
       && !escrito.p_value.fachada.base64,
       'y en la BD solo el id, nunca la imagen (regla 21)');
}

console.log('\n5. Quitarla devuelve la de Catastro y NO borra el fichero');
{
    escrito = null;
    await cex.quitarImagen(ctxCon({ fachada: { drive_id: 'id-mio' },
                                    croquis: { drive_id: 'id-mio' } }), 'fachada');
    ok(escrito?.p_value?.fachada === undefined, 'deja de constar la fachada');
    ok(escrito?.p_value?.croquis?.drive_id === 'id-mio', 'y el croquis sigue puesto');
    ok(drivelandia.has('id-mio'), 'el fichero sigue en Drive');
}

console.log('\n6. Lo que no es una imagen NO entra en el .cex');
{
    for (const [caso, fichero] of [
        ['un PDF', { buffer: MIA, mimetype: 'application/pdf' }],
        ['un fichero vacío', { buffer: Buffer.alloc(0), mimetype: 'image/png' }],
    ]) {
        let falló = false;
        try { await cex.sustituirImagen(ctxCon(null), 'fachada', fichero); }
        catch { falló = true; }
        ok(falló, `${caso} se rechaza`);
    }
    let falló = false;
    try { await cex.sustituirImagen(ctxCon(null), 'inventada', { buffer: MIA, mimetype: 'image/png' }); }
    catch { falló = true; }
    ok(falló, 'y una imagen que no existe en el .cex, también');
}

console.log('\n7. Un corte de conexión NO se cachea; «no la tiene», sí');
{
    // 26RES093_9 (25/09/2026): un ECONNRESET del WAF se quedaba cacheado para
    // toda la vida del proceso, y ni reabrir ni «Refrescar» volvían a pedirla.
    const RC = '8720315VJ8682S0001OJ';
    const ctx = { expediente: { id: 'exp-9', numero_expediente: '26RES093_9',
                                instalacion: { ref_catastral: RC }, cee: {} } };
    let pedidasFachada = 0, pedidasCroquis = 0, caido = true;
    const corte = () => { const e = new Error('read ECONNRESET'); e.code = 'ECONNRESET'; return e; };
    catastro.getFacadeImage = async (rc, o = {}) => {
        pedidasFachada++;
        if (caido) { if (o.conFallos) throw corte(); return null; }
        return { data: FACHADA_CATASTRO, miniatura: MINI };
    };
    catastro.getParcelImage = async (rc, o = {}) => {
        pedidasCroquis++;
        if (caido) { if (o.conFallos) throw corte(); return null; }
        return { data: CROQUIS_CATASTRO };
    };

    const a = await cex.imagenesDelCex(ctx, null);
    ok(!a.foto_edificio && !a.plano_situacion, 'con Catastro caído no hay imágenes');
    ok(a.fallos?.fachada && a.fallos?.croquis, 'y se marca como FALLO, no como «no la tiene»');
    ok(a.avisos.some(a2 => a2.includes('no ha respondido')), 'el aviso dice que no ha respondido');
    ok(pedidasFachada === 2 && pedidasCroquis === 2, 'se reintenta UNA vez cada una, no más');

    caido = false;
    const b = await cex.imagenesDelCex(ctx, null);
    ok(b.foto_edificio === b64(FACHADA_CATASTRO) && b.plano_situacion === b64(CROQUIS_CATASTRO),
       'al volver Catastro, «Refrescar» SÍ las trae (no se había cacheado el fallo)');
    ok(!b.fallos?.fachada && !b.fallos?.croquis, 'y ya no hay fallos');

    const antes = pedidasFachada + pedidasCroquis;
    await cex.imagenesDelCex(ctx, null);
    ok(pedidasFachada + pedidasCroquis === antes, 'lo que llegó bien sí se cachea: cero peticiones más');

    // «No la tiene» es una respuesta de Catastro: se cachea y no es un fallo.
    const RC2 = '0000000XX0000X0001XX';
    const ctx2 = { expediente: { ...ctx.expediente, instalacion: { ref_catastral: RC2 } } };
    catastro.getFacadeImage = async () => { pedidasFachada++; return null; };
    const c = await cex.imagenesDelCex(ctx2, null);
    ok(!c.fallos?.fachada && c.avisos.some(x => x.includes('no tiene la foto de fachada')),
       'una fachada que Catastro no tiene se dice como tal');
    const n = pedidasFachada;
    await cex.imagenesDelCex(ctx2, null);
    ok(pedidasFachada === n, 'y esa respuesta sí se cachea');

    // Solo se reintenta lo que falló: si la foto llegó y el croquis no, al
    // refrescar no se vuelve a pedir la foto.
    const RC3 = '1111111YY1111Y0001YY';
    const ctx3 = { expediente: { ...ctx.expediente, instalacion: { ref_catastral: RC3 } } };
    let croquisCaido = true, f3 = 0, c3 = 0;
    catastro.getFacadeImage = async () => { f3++; return { data: FACHADA_CATASTRO }; };
    catastro.getParcelImage = async (rc, o = {}) => {
        c3++; if (croquisCaido) throw corte(); return { data: CROQUIS_CATASTRO };
    };
    const d = await cex.imagenesDelCex(ctx3, null);
    ok(d.foto_edificio && !d.plano_situacion && d.fallos?.croquis && !d.fallos?.fachada,
       'la foto llega, el croquis se marca como fallo');
    croquisCaido = false;
    const e = await cex.imagenesDelCex(ctx3, null);
    ok(e.plano_situacion && f3 === 1, 'al refrescar llega el croquis sin volver a pedir la foto');
}

console.log('\n8. Con el monitor en BLOQUEADO no se pide nada, y tampoco se cachea');
{
    const RC4 = '2222222ZZ2222Z0001ZZ';
    const ctx4 = { expediente: { id: 'e4', numero_expediente: 'X', instalacion: { ref_catastral: RC4 }, cee: {} } };
    let pedidas = 0;
    catastro.getFacadeImage = async () => { pedidas++; return { data: FACHADA_CATASTRO }; };
    catastro.getParcelImage = async () => { pedidas++; return { data: CROQUIS_CATASTRO }; };
    monitor.shouldSkipRequest = () => true;
    const a = await cex.imagenesDelCex(ctx4, null);
    ok(pedidas === 0 && a.fallos?.fachada && a.fallos?.croquis, 'bloqueado: ninguna petición y marcado como fallo');
    monitor.shouldSkipRequest = () => false;
    const b = await cex.imagenesDelCex(ctx4, null);
    ok(b.foto_edificio && b.plano_situacion && pedidas === 2, 'desbloqueado: se piden y llegan');
}

console.log(fallos ? `\n${fallos} FALLOS\n` : '\nTodo correcto\n');
process.exit(fallos ? 1 : 0);
