// ============================================================================
// revisionCex.js — el .cex que ENTREGA el certificador: leerlo, y ponerle la
// medida de mejora del expediente cuando no la trae.
//
// Hay cosas que solo están en el .cex y no en el .xml —el depósito de ACS, la
// cola con la que CE3X estima la caldera y la MEDIDA DE MEJORA entera— así que
// la revisión del CEE necesita el fichero. La lectura la hace el motor
// (`cee-engine/tools/radiografia_cex.py`, sin deserializar nada) y aquí solo se
// busca el fichero y se le manda.
//
// REGLA — el .cex que se revisa es el del TÉCNICO, nunca el borrador que
// escribe la app (`…_REVISAR.cex`): ése es un punto de partida, no su entrega.
// Lo decide `ceeUploadService.matchSlot`, la misma función que pinta la rejilla
// del CEE, para que la revisión y la pantalla no puedan hablar de ficheros
// distintos.
// ============================================================================

const driveService = require('../driveService');
const ceeUploadService = require('../ceeUploadService');
const cex = require('../ceeEnvolventeCex');

const MOTOR = process.env.CEE_ENGINE_URL || 'http://cee-engine:8080';
const ESPERA_MS = Number(process.env.CEE_REVISION_ESPERA_MS || 60000);

//: Cómo se llama el `.cex` con la medida puesta por la app. Lleva `_REVISAR`
//: a propósito: `matchSlot` lo descarta, así que NO pasa por la entrega del
//: técnico —hay que abrirlo en CE3X, pulsar «Actualizar» y guardarlo como el
//: suyo— y tampoco choca con el borrador de la envolvente
//: (`{nº} - CEE INICIAL_REVISAR.cex`).
const SUFIJO_MEDIDA = '_CON MEDIDA_REVISAR.cex';

function error(status, mensaje) {
    const e = new Error(mensaje);
    e.status = status;
    return e;
}

async function alMotor(ruta, fd) {
    try {
        return await fetch(`${MOTOR}${ruta}`, {
            method: 'POST', body: fd, signal: AbortSignal.timeout(ESPERA_MS),
        });
    } catch (e) {
        throw error(503, e.name === 'TimeoutError'
            ? 'El motor de CE3X ha tardado demasiado en leer el .cex.'
            : 'El motor de CE3X no responde. ¿Está levantado el contenedor cee-engine?');
    }
}

/**
 * El `.cex` que entregó el técnico en la carpeta de ESTA fase, o `null`.
 *
 * Con varios candidatos gana el más reciente: es el que acaba de subir, y el
 * anterior ya estaría en OLD si hubiera entrado por la app.
 */
async function carpetaSinCrear(ctx, fase) {
    //: Para LEER no se crea ni se hace pública ninguna carpeta: `carpetaFase`
    //: lo hace, y es lo correcto al generar, no al mirar.
    if (!cex.esCeeDirecto(ctx.expediente) && !cex.esOportunidad(ctx.expediente)) {
        if (!ctx.driveFolderId) return null;
        const raiz = await driveService.findSubfolderByName(ctx.driveFolderId, '1. CEE');
        if (!raiz) return null;
        const id = await driveService.findSubfolderByName(raiz, fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL');
        return id ? { id } : null;
    }
    return cex.carpetaFase(ctx, fase);
}

/**
 * El fichero que entregó el técnico en la carpeta de ESTA fase para un slot
 * (`cex`, `xml`…), o `null`. Qué slot es cada fichero lo decide
 * `ceeUploadService.matchSlot`, el mismo criterio que la rejilla del CEE.
 *
 * Con varios candidatos gana el más reciente: es el que acaba de subir.
 */
async function ficheroEntregado(ctx, fase = 'inicial', slot = 'cex') {
    const carpeta = await carpetaSinCrear(ctx, fase).catch(() => null);
    if (!carpeta?.id) return null;
    const ficheros = await driveService.listFiles(carpeta.id);
    const cand = (ficheros || [])
        .filter((f) => f.mimeType !== 'application/vnd.google-apps.folder'
            && ceeUploadService.matchSlot(f.name) === slot)
        .sort((a, b) => String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || '')));
    if (!cand.length) return null;
    const bytes = await driveService.getFileContent(cand[0].id);
    if (!bytes?.length) return null;
    return { bytes, nombre: cand[0].name, driveId: cand[0].id, carpetaId: carpeta.id, varios: cand.length > 1 };
}

/** El `.cex` que entregó el técnico en la carpeta de ESTA fase, o `null`. */
const cexEntregado = (ctx, fase = 'inicial') => ficheroEntregado(ctx, fase, 'cex');

/** Los HECHOS de un `.cex`, leídos por el motor. */
async function radiografiaCex(bytes) {
    const fd = new FormData();
    fd.append('fichero', new Blob([bytes]), 'entregado.cex');
    const r = await alMotor('/cex/radiografia', fd);
    if (!r.ok) {
        const f = await r.json().catch(() => ({}));
        throw error(r.status === 400 ? 422 : 502, f.detail || 'No se ha podido leer el .cex.');
    }
    return r.json();
}

/**
 * La medida de mejora que la app compondría para este expediente: la MISMA
 * función que la escribe en el `.cex` que genera la propia app (`medidasCe3x`),
 * con lo que el certificador haya retocado en la cara del CEE final de la
 * ventana de envolvente. Importada, nunca recompuesta aquí.
 */
async function medidasDelExpediente(ctx, { superficie, existentes = null, version = null } = {}) {
    const { medidasCe3x, claveInstalacion, claveExtras } = await cex.loadFichaCe3x();
    const trabajo = await cex.leerTrabajo(ctx.expediente.id).catch(() => null);
    const cfg = trabajo?.ajustes || {};
    //: Lo tecleado en la cara del CEE FINAL de la ventana de envolvente: la
    //: medida es «el edificio con la instalación del final» (mismas claves que
    //: usa `fichaCe3x`, que las exporta).
    const extras = cfg[claveExtras('final')];
    const final = { ajustes: cfg[claveInstalacion('final')], extras: Array.isArray(extras) ? extras : [] };
    //: En un `.cex` de la 3.1 el autoconsumo va como «Generación renovable
    //: eléctrica», mes a mes: los meses salen de PVGIS (ver `pvgisParaAutoconsumo`).
    const pv = version === '3.1' ? await cex.pvgisParaAutoconsumo(ctx, cfg) : {};
    return medidasCe3x({
        expediente: ctx.expediente, superficie, fase: 'inicial',
        modelos: ctx.modelos, textos: cfg.medidas_texto, final,
        autoconsumoKwh: cfg.autoconsumo_kwh,
        autoconsumoFv: pv.especifica || null,
        //: Sin aerotermia en el expediente, la genérica de la simulación.
        generica: true,
        //: Los equipos que declara el `.cex` del técnico: es lo que dice si la
        //: caldera que se retira daba también el ACS (y entonces la medida
        //: lleva un termo eléctrico).
        existentes,
    });
}

/**
 * Pone la medida de mejora del expediente en el `.cex` que entregó el técnico
 * y lo deja en su carpeta como `{nº} - CEE INICIAL_CON MEDIDA_REVISAR.cex`.
 *
 * Es lo que se hacía a mano al revisar: «le cargo como medida de mejora lo que
 * va a ser el certificado final». Lo que NO puede hacer es CALCULARLA: eso es
 * el motor de CE3X al pulsar «Actualizar», y por eso el fichero lleva
 * `_REVISAR` y se dice.
 */
async function ponerMedida(ctx) {
    const entregado = await cexEntregado(ctx, 'inicial');
    if (!entregado) throw error(409, 'No hay ningún .cex del certificador en «1. CEE / CEE INICIAL».');
    const rx = await radiografiaCex(entregado.bytes);
    const { medidas, avisos: avisosMedida } = await medidasDelExpediente(ctx, {
        superficie: rx.generales?.superficie,
        //: La versión del fichero del técnico, que NO cambia al ponerle la medida.
        version: rx.version_ce3x || null,
        existentes: (rx.equipos || []).map((e) => ({ slot: e.slot, nombre: e.nombre, combustible: e.combustible })),
    });
    if (!medidas?.length) {
        throw error(422, `El expediente no da para componer la medida: ${(avisosMedida || []).join(' · ') || 'no declara equipo nuevo'}`);
    }

    const fd = new FormData();
    fd.append('fichero', new Blob([entregado.bytes]), 'entregado.cex');
    fd.append('datos', JSON.stringify({ medidas, envolvente: { espacio: 'auto' } }));
    const r = await alMotor('/cex/medida', fd);
    if (!r.ok) {
        const f = await r.json().catch(() => ({}));
        throw error(r.status === 422 ? 422 : 502, f.detail || 'No se ha podido poner la medida.');
    }
    const salida = Buffer.from(await r.arrayBuffer());
    let avisos = [];
    try { avisos = JSON.parse(r.headers.get('X-Cee-Avisos') || '[]'); } catch { /* noop */ }

    const numero = ctx.expediente.numero_expediente || ctx.expediente.numero || 'EXPEDIENTE';
    //: `sufijoCex` ya termina en `_REVISAR` (es el del borrador de la app), y
    //: `SUFIJO_MEDIDA` lo vuelve a poner: sin quitarlo salía
    //: «CEE INICIAL_REVISAR_CON MEDIDA_REVISAR.cex» (26RES060_196).
    const base = cex.sufijoCex(ctx.expediente, 'inicial').replace(/_REVISAR$/i, '');
    const nombre = `${numero} - ${base}${SUFIJO_MEDIDA}`;
    //: Un fichero anterior con el mismo nombre se ARCHIVA, no se borra.
    const previo = await driveService.findFileByName(entregado.carpetaId, nombre);
    if (previo) await driveService.archiveExistingToOld(entregado.carpetaId, previo, nombre).catch(() => null);
    const guardado = await driveService.saveFileToFolder(
        entregado.carpetaId, nombre, 'application/octet-stream', salida, { throwOnError: true });

    return {
        nombre,
        link: guardado?.link || null,
        driveId: guardado?.id || null,
        base: entregado.nombre,
        medidas: medidas.map((m) => m.nombre),
        avisos: [...(avisosMedida || []), ...avisos],
    };
}

module.exports = { cexEntregado, ficheroEntregado, radiografiaCex, medidasDelExpediente, ponerMedida, SUFIJO_MEDIDA };
