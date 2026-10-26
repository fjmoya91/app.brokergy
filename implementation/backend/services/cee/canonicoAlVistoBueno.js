'use strict';
// ─────────────────────────────────────────────────────────────────────────────
// Al dar el VISTO BUENO, el borrador `_REVISAR` de la casa pasa a su nombre
// DEFINITIVO: `{nº} – CEE INICIAL.cex/.xml/.pdf` (en un CEE directo de un solo
// certificado, «CEE» a secas).
//
// Decisión de Fran (25/10/2026): «Eva ya no presenta; yo solo daré el visto bueno
// y desde que doy el VB se puede presentar. Una vez que se da el VB no debe llevar
// el _REVISAR los archivos». Hasta hoy eso lo hacía a mano `cee_inicial.js listo`
// en el PC; ahora lo hace el propio visto bueno (los dos negocios), así que lo
// que queda en la carpeta tras el VB es lo que `firmar_cee.js` firma y lo que
// `presentar_cee.js preparar` adjunta.
//
// Es un RENOMBRADO en Drive (mismo fichero, mismo id y mismos enlaces), sin CE3X:
// el visto bueno se da desde el VPS. El `.xml` y el `.pdf` del `_REVISAR` ya son
// los de CE3X (`calificarYGuardar`).
//
// REGLA — solo con el certificador de la CASA (Fran o el Agente IA): el CEE de un
// técnico de fuera no se toca; lo presenta él con el aviso del visto bueno.
// REGLA — manda el MÁS RECIENTE: si en la carpeta ya hay un canónico (lo subió el
// técnico, o salió de `listo`) más nuevo que el `_REVISAR`, el canónico es la
// entrega y el `_REVISAR` se archiva en OLD sin tocar nada más; si el `_REVISAR`
// es el nuevo, el canónico viejo va a OLD y el `_REVISAR` ocupa su nombre. Nunca
// se borra nada.
// REGLA — el `.xml` promovido se CARGA en la app como «Cargar CEE» (regla 152,
// `cargarXmlCee`, con `forzar`: lo que se va a firmar manda) y `.cex`/`.xml` quedan
// en `cee.cee_files` como si los hubiera subido el técnico. El PDF va SIN firmar:
// el `_fdo` lo pone `firmar_cee.js`.
// ─────────────────────────────────────────────────────────────────────────────
const driveService = require('../driveService');
const cex = require('../ceeEnvolventeCex');

const EXTS = ['cex', 'xml', 'pdf'];
const escapar = t => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
//: El borrador de ESTA fase y solo de ella: `… - CEE INICIAL_REVISAR.cex` (con el
//: número del expediente o el de la oportunidad, y la copia que numera Drive,
//: `_REVISAR (1).cex`, como `matchSlot`). ⚠️ En un RES080 la carpeta del inicial
//: guarda TAMBIÉN el `CEE PREVISTO_REVISAR`, que no es el inicial y nunca se
//: asciende (medido en seco el 25/10/2026: 26RES080_94 y _58 lo habrían
//: convertido en su «CEE INICIAL»).
const esBorradorDe = (nombre, ext, rotulo) =>
    new RegExp(` - ${escapar(rotulo)}_revisar(\\s*\\(\\d+\\))?\\.${ext}$`, 'i').test(String(nombre || ''));
const esBorrador = (nombre, rotulo) => EXTS.some(x => esBorradorDe(nombre, x, rotulo));

const esDeLaCasa = (cert) => !!cert && (require('../ceeFirmaService').esDeBrokergy(cert) || cert.es_agente_ia === true);

async function modificado(id) {
    const m = await driveService.getFileMetadata(id, 'id, modifiedTime');
    return m?.modifiedTime ? Date.parse(m.modifiedTime) : 0;
}

/** El rótulo canónico de la fase: el MISMO que pone la subida del técnico. */
function rotuloDe(negocio, expediente, fase) {
    if (negocio === 'cee') return require('../ceeDirectoUploadService').sectionLabel(expediente, fase);
    return fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL';
}

/**
 * @param {{ negocio: 'cae'|'cee', clave: string, fase: 'inicial'|'final', escribir?: boolean }} p
 *        `clave`: el id o el número (lo que acepte `cex.cargarExpediente`).
 * @returns {{ ok, promovidos: string[], archivados: string[], cargaXml, avisos: string[] }}
 */
async function aCanonico({ negocio, clave, fase, escribir = true }) {
    const f = fase === 'final' ? 'final' : 'inicial';
    const out = { ok: true, promovidos: [], archivados: [], cargaXml: null, avisos: [] };
    const ctx = await cex.cargarExpediente(clave, negocio);
    if (!ctx) return { ...out, ok: false, avisos: ['no se ha encontrado el expediente'] };
    if (!ctx.driveFolderId) return { ...out, ok: false, avisos: ['el expediente no tiene carpeta de Drive'] };
    //: Solo los CEE de la CASA (Fran, por el CIF, o el Agente IA, que firma la
    //: casa). Los de un técnico de fuera son SUYOS: sus ficheros se quedan como
    //: están y los presenta él con el aviso del visto bueno (Fran, 25/10/2026).
    if (!esDeLaCasa(ctx.certificador)) return { ...out, ajeno: true };
    const e = ctx.expediente;
    const num = e.numero_expediente;
    const rotulo = rotuloDe(negocio, e, f);
    const canon = ext => `${num} – ${rotulo}.${ext}`;

    //: La carpeta de la fase, la del mapa (en seco no se crea).
    const carpeta = escribir ? await cex.carpetaFase(ctx, f) : await carpetaSinCrear(ctx, negocio, f);
    if (!carpeta?.id) return out;   // sin carpeta de la fase no hay borrador que pasar
    const ficheros = await driveService.listFiles(carpeta.id) || [];
    if (!ficheros.some(x => esBorrador(x.name, rotulo))) return out;

    const links = {};
    let xmlPromovido = null;
    for (const ext of EXTS) {
        const borradores = ficheros.filter(x => esBorradorDe(x.name, ext, rotulo));
        if (!borradores.length) continue;
        for (const b of borradores) b._t = await modificado(b.id);
        borradores.sort((a, b) => b._t - a._t);
        const [nuevo, ...viejos] = borradores;
        const actual = ficheros.find(x => x.name === canon(ext));
        const tActual = actual ? await modificado(actual.id) : 0;
        const ganaCanonico = actual && tActual > nuevo._t;
        const aOld = ganaCanonico ? borradores : viejos;
        if (!ganaCanonico) out.promovidos.push(`${nuevo.name} → ${canon(ext)}${actual ? ' (el anterior, a OLD)' : ''}`);
        for (const v of aOld) out.archivados.push(v.name);
        if (!escribir) continue;

        if (!ganaCanonico) {
            if (actual) await driveService.archiveExistingToOld(carpeta.id, actual.id, canon(ext));
            const hecho = await driveService.renameFolder(nuevo.id, canon(ext));
            if (!hecho) { out.ok = false; out.avisos.push(`no se ha podido renombrar «${nuevo.name}»`); continue; }
            //: Público de lectura, como lo deja la subida del técnico (la vista previa sin sesión).
            try { await driveService.setFolderPublic(nuevo.id, 'reader'); } catch { /* sin permiso, el fichero vale */ }
            if (ext !== 'pdf') links[ext] = nuevo.webViewLink || await driveService.getWebViewLink(nuevo.id);
            if (ext === 'xml') xmlPromovido = nuevo.id;
        }
        for (const v of aOld) await driveService.archiveExistingToOld(carpeta.id, v.id, v.name);
    }
    if (!escribir) return out;

    //: `cee_files` releído y escrito por su RPC de clave (nunca el `cee` entero).
    if (Object.keys(links).length) {
        const ef = { ...e, ...cex.expedienteStub(negocio, e.id) };
        const { data: fila } = await require('../supabaseClient').from(cex.tablaDe(negocio))
            .select('ficheros:cee->cee_files').eq('id', e.id).maybeSingle();
        const ceeFiles = { ...(fila?.ficheros || {}) };
        ceeFiles[f] = { ...(ceeFiles[f] || {}), ...links };
        await cex.setCeeField(ef, 'cee_files', ceeFiles);
    }
    if (xmlPromovido) {
        try {
            const bytes = await driveService.getFileContent(xmlPromovido);
            const { cargarXmlEnApp } = require('./cargarXmlCee');
            out.cargaXml = await cargarXmlEnApp({ ...ctx, origen: negocio }, f, Buffer.from(bytes),
                { fileName: canon('xml'), escribir: true, forzar: true });
        } catch (err) {
            out.avisos.push(`el XML no se ha cargado en la app: ${err.message}`);
        }
    }
    return out;
}

async function carpetaSinCrear(ctx, negocio, fase) {
    const e = ctx.expediente;
    if (negocio === 'cee') {
        const nombre = require('../ceeDirectoFolders').subcarpetaFase(e.alcance || 'UNICO', fase);
        return { id: await driveService.findSubfolderByName(ctx.driveFolderId, nombre) };
    }
    const raiz = await driveService.findSubfolderByName(ctx.driveFolderId, '1. CEE');
    return { id: raiz ? await driveService.findSubfolderByName(raiz, fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL') : null };
}

/** Las líneas para el popup del visto bueno y para los scripts. */
function lineas(r) {
    if (!r) return [];
    const out = r.promovidos.map(p => ({ texto: p, tono: 'ok' }));
    if (r.archivados.length) out.push({ texto: `A OLD: ${r.archivados.join(' · ')}`, tono: 'info' });
    if (r.cargaXml?.cargado) out.push({ texto: 'XML cargado en la app', tono: 'ok' });
    for (const a of r.avisos) out.push({ texto: a, tono: 'aviso' });
    return out;
}

module.exports = { aCanonico, lineas, esBorrador, esDeLaCasa };
