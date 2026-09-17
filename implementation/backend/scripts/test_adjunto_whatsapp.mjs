/**
 * Los ADJUNTOS de WhatsApp: que el modelo del fichero no pise la clave del mensaje.
 *
 *   node implementation/backend/scripts/test_adjunto_whatsapp.mjs
 *
 * Aquí no hay WhatsApp: se simula el modelo `MediaData` tal y como llega de
 * WhatsApp Web (campos internos `__x_*` incluidos, con su `__x_id = 1`) y se
 * comprueba (a) que el `id` del mensaje SOBREVIVE al esparcido, que es lo que
 * rompía el envío, y (b) que no se pierde ni cambia ningún dato del fichero.
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { soloDatosDelAdjunto } = require('../utils/adjuntoWhatsapp');
const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

let fallos = 0;
const comprobar = (titulo, ok, detalle = '') => {
    console.log(`${ok ? '  ✓' : '  ✗'} ${titulo}${detalle ? ` — ${detalle}` : ''}`);
    if (!ok) fallos++;
};

// El modelo tal y como llega: los datos viven en `__x_*` y `toJSON()` los expone.
function modeloSimulado() {
    const datos = {
        type: 'document', mimetype: 'application/pdf', filename: '26RES060_179_Anexo_I.pdf',
        filehash: '9fphL6UdGuUWZFrAzZsOa5h4R0VJ3Gf/NJy4qsrz1xs=', size: 184,
        directPath: '/v/t62.7119-24/584173473', mediaKey: 'TUmu2UjyYN8ImwXWep0eetzl=',
        encFilehash: '7gyPhcgvOuwojW6ktiwiqGpaOL2mv94E=', mediaKeyTimestamp: 1789661937,
        preview: 'PREVIEW', pageCount: 1,
    };
    const m = {
        __x_id: 1, __x_type: 'document', __x_filehash: datos.filehash, __x_size: 184,
        revisionNumber: 0, parent: null, collection: null, _uiObservers: [],
        deprecatedMms3Url: 'https://mmg.whatsapp.net/v/t62.7119-24/584173473',
        clientUrl: undefined, caption: undefined,
        toJSON: () => ({ ...datos }),
    };
    return { modelo: m, datos };
}

// El mensaje, compuesto EXACTAMENTE como lo hace whatsapp-web.js.
const componerMensaje = (clave, mediaOptions) => ({
    id: clave, ack: 0, from: 'yo@c.us', to: 'el@lid', local: true, self: 'out',
    isNewMsg: true, type: 'chat',
    ...mediaOptions,
    ...(typeof mediaOptions.toJSON === 'function' ? mediaOptions.toJSON() : {}),
});

// El modelo Msg de WhatsApp Web se construye desde ese objeto plano y toma cada
// propiedad de su campo interno `__x_<nombre>` cuando existe: por eso un `__x_id`
// colado se convierte EN el id del mensaje. Al no ser ya una clave de mensaje, la
// resolucion del remitente recibe `undefined` y revienta — es lo medido el
// 17/09/2026 contra la sesion real del VPS.
function construirMsg(plano) {
    const id = '__x_id' in plano ? plano.__x_id : plano.id;
    if (typeof id !== 'string' || !id.startsWith('CLAVE')) {
        throw new Error('Data passed to getter must include an id property '
            + "(it's how we memoize) but got undefined");
    }
    return { id, type: '__x_type' in plano ? plano.__x_type : plano.type };
}

console.log('\n1) El modelo CRUDO pisa la clave del mensaje (el fallo)');
{
    const { modelo } = modeloSimulado();
    const msg = componerMensaje('CLAVE_DEL_MENSAJE', modelo);
    comprobar('el modelo mete su `__x_id`', msg.__x_id === 1);
    let error = null;
    try { construirMsg(msg); } catch (e) { error = e.message; }
    comprobar('y al construir el mensaje revienta con el error de produccion',
        !!error && error.includes('must include an id property'), error ? '' : 'no fallo');
}

console.log('\n2) Limpiado, no queda ni un campo interno');
{
    const { modelo } = modeloSimulado();
    const limpio = soloDatosDelAdjunto(modelo);
    const internos = Object.keys(limpio).filter(k => k.startsWith('__'));
    comprobar('sin claves `__*`', internos.length === 0, internos.join(', '));
    const msg = componerMensaje('CLAVE_DEL_MENSAJE', limpio);
    const construido = construirMsg(msg);
    comprobar('el `id` del mensaje sobrevive', construido.id === 'CLAVE_DEL_MENSAJE');
    comprobar('y el mensaje sigue siendo un documento', construido.type === 'document');
    comprobar('y ningún campo del mensaje empieza por `__`',
        Object.keys(msg).every(k => !k.startsWith('__')));
}

console.log('\n3) No se pierde NI CAMBIA ningún dato del fichero');
{
    const { modelo, datos } = modeloSimulado();
    const antes = componerMensaje('C', modelo);
    const despues = componerMensaje('C', soloDatosDelAdjunto(modelo));
    const perdidas = Object.keys(antes).filter(k => !(k in despues));
    comprobar('lo único que se cae son los internos', perdidas.every(k => k.startsWith('__')),
        perdidas.filter(k => !k.startsWith('__')).join(', ') || `${perdidas.length} internos`);
    const distintas = Object.keys(despues).filter(k => k in antes && String(antes[k]) !== String(despues[k]));
    comprobar('y ni un valor cambia', distintas.length === 0, distintas.join(', '));
    for (const k of Object.keys(datos)) {
        if (String(despues[k]) !== String(datos[k])) { comprobar(`campo ${k}`, false); }
    }
    comprobar('el enlace del fichero subido viaja', despues.deprecatedMms3Url === modelo.deprecatedMms3Url);
    comprobar('y el nombre y el tamaño también',
        despues.filename === datos.filename && despues.size === datos.size);
}

console.log('\n4) Lo que no es un modelo se devuelve tal cual');
{
    comprobar('null', soloDatosDelAdjunto(null) === null);
    comprobar('undefined', soloDatosDelAdjunto(undefined) === undefined);
    comprobar('un objeto sin toJSON se conserva',
        soloDatosDelAdjunto({ a: 1 }).a === 1);
}

console.log('\n5) El servicio inyecta ESA función, no una copia');
{
    const src = fs.readFileSync(path.join(raiz, 'services', 'whatsappService.js'), 'utf8');
    comprobar('importa `soloDatosDelAdjunto`', src.includes("require('../utils/adjuntoWhatsapp')"));
    comprobar('la manda por su código fuente', src.includes('String(soloDatosDelAdjunto)'));
    comprobar('y el parche se asegura en cada envío',
        /asegurarParcheAdjuntos\(\);/.test(src) && /await asegurarParcheAdjuntos\(\)/.test(src));
}

console.log(fallos ? `\n❌ ${fallos} comprobación(es) fallan\n` : '\n✅ Todo correcto\n');
process.exit(fallos ? 1 : 0);
