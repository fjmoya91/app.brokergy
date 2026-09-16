/**
 * paredFotoService — La FOTO REAL de cada cerramiento, pegada a su pared.
 *
 * El plano de la envolvente dice que FBS3 da a la calle y mide 10,94 m, pero no
 * dice QUE HAY en ella. Eso se mira en una foto, y la foto casi siempre existe:
 * el cliente subio «tu casa vista desde la calle» y «las paredes que dan a un
 * patio» al hacer la simulacion, y lleva meses en `12. DOCUMENTOS PARA CEE`.
 *
 * Aqui se le pone a cada pared —y a cada hueco— la suya.
 *
 * ── REGLA: primero lo que YA HAY, y despues subir ───────────────────────────
 * `candidatas()` lista las fotos de fachada, patios y ventanas que el expediente
 * ya tiene. Volver a pedirle al cliente una foto que mando en junio es la peor
 * forma de estrenar esto, y ademas la suya es la buena: es de antes de la obra.
 *
 * ── REGLA: una foto del expediente se REFERENCIA, no se copia ───────────────
 * Ya esta en la carpeta del expediente y ya la ve el gestor de documentacion.
 * Copiarla dejaria dos ficheros identicos que hay que borrar dos veces, y el dia
 * que alguien corrija uno, el otro seguiria diciendo lo de antes. Si el original
 * desaparece se DICE —igual que hace `imagenesDelCex` con la foto sustituida—,
 * nunca se calla.
 *
 * ── REGLA: la foto va a DRIVE; en la BD solo su id (regla 21) ───────────────
 * Lo que se guarda en `expedientes.cee.envolvente_fotos` son metadatos: el id de
 * Drive, el nombre, quien la puso y lo ultimo que se leyo de ella. Una foto en
 * base64 dentro de un JSONB es lo que tumbo la base de datos dos veces.
 *
 * ── REGLA: clave APARTE del trabajo del plano ──────────────────────────────
 * `cee.envolvente` lo REEMPLAZA entero el navegador en cada autoguardado (cada
 * 1,2 s mientras se trabaja). Una foto subida entre dos guardados se perderia.
 * Por eso vive en `cee.envolvente_fotos`, igual que `cee.envolvente_imagenes`.
 *
 * ── REGLA: la clave es el ID DE CATASTRO, no el nombre ──────────────────────
 * El nombre de una pared es EDITABLE (FBE1 pasa a PBE1 al reclasificarla), asi
 * que indexar por el nombre haria que renombrar una pared perdiera sus fotos.
 * `m.id` no cambia nunca. Y un hueco se indexa por `id/uid` — su `uid`, que
 * tampoco cambia aunque se le cambie el nombre de V1 a V3.
 */

const driveService = require('./driveService');
const reformaUploadService = require('./reformaUploadService');
const ceeUploadService = require('./ceeUploadService');
const supabase = require('./supabaseClient');

//: Donde se anota. Clave APARTE del trabajo del plano, por lo dicho arriba.
const CAMPO = 'envolvente_fotos';

//: La carpeta de las fotos que se suben DESDE aqui. Cuelga de la del CEE, que es
//: la que ya se comparte con el certificador al encargarle el certificado: son
//: su material de trabajo. En su propia subcarpeta y no sueltas entre los `.cex`,
//: porque quince fotos de paredes entre los certificados esconden los
//: certificados.
const SUBCARPETA = 'FOTOS ENVOLVENTE';

//: De donde salen las CANDIDATAS: los apartados del checklist documental en los
//: que el cliente y el instalador ya han subido fotos de la envolvente. El
//: rotulo es el que se le ensena al certificador para que sepa que esta mirando.
const SLOTS_CANDIDATOS = [
    ['FOTO_FACHADA_PRINCIPAL', 'Fachada principal'],
    ['FOTO_PATIOS_INTERIORES', 'Patios interiores'],
    ['FOTO_FACHADA_ANTES', 'Fachada (antes de la obra)'],
    ['FOTO_VENTANAS_ANTES', 'Ventanas (antes de la obra)'],
    ['FOTO_CUBIERTA_ANTES', 'Cubierta (antes de la obra)'],
];

const SUBCARPETA_DOCS = '12. DOCUMENTOS PARA CEE';

//: Una clave es `FBS3` (la pared) o `FBS3/a1b2c3` (uno de sus huecos). Se valida
//: porque viaja en la URL y acaba siendo parte de un nombre de fichero.
const RE_CLAVE = /^[A-Za-z0-9_-]{1,40}(\/[A-Za-z0-9_-]{1,40})?$/;

const MAX_POR_CLAVE = 8;

function validaClave(clave) {
    const c = String(clave || '');
    if (!RE_CLAVE.test(c)) {
        throw Object.assign(new Error(`«${c}» no es un cerramiento valido.`), { status: 400 });
    }
    return c;
}

const esImagen = (f) => String(f?.mimeType || '').startsWith('image/');

// ── Lo guardado ─────────────────────────────────────────────────────────────

function fotosDe(expediente) {
    const v = expediente?.cee?.[CAMPO];
    return v && typeof v === 'object' ? v : {};
}

async function escribir(id, todas) {
    const { error } = await supabase.rpc('set_expediente_cee_field', {
        p_expediente_id: id, p_field: CAMPO, p_value: todas,
    });
    if (error) throw new Error(error.message);
}

/**
 * Lo que tiene cada cerramiento, RECONCILIADO con Drive.
 *
 * Un enlace a un fichero que ya no esta no es una foto presente: si el original
 * lo borro alguien desde el gestor de documentacion, la pantalla tiene que
 * decirlo en vez de ensenar un hueco negro. Mismo criterio que `comprobarExisten`
 * en el paquete de actuaciones.
 */
async function estado(expediente) {
    const guardadas = fotosDe(expediente);
    const salida = {};
    const ids = new Set();
    for (const lista of Object.values(guardadas)) {
        for (const f of lista || []) if (f?.drive_id) ids.add(f.drive_id);
    }

    // Una sola comprobacion por fichero, aunque este referenciado dos veces.
    const vivos = new Map();
    await Promise.all([...ids].map(async (driveId) => {
        try {
            // `trashed` hay que PEDIRLO: no va en los campos por defecto, y un
            // fichero en la papelera todavia se descarga — o sea que sin esto
            // una foto borrada seguiria pareciendo presente hasta que alguien
            // vaciara la papelera.
            const meta = await driveService.getFileMetadata(driveId, 'id, name, mimeType, trashed');
            vivos.set(driveId, !!meta && !meta.trashed);
        } catch {
            vivos.set(driveId, false);
        }
    }));

    for (const [clave, lista] of Object.entries(guardadas)) {
        salida[clave] = (lista || []).map((f) => ({
            ...f,
            roto: f?.drive_id ? vivos.get(f.drive_id) === false : true,
        }));
    }
    return salida;
}

/**
 * Las fotos de la envolvente que el expediente YA tiene.
 *
 * No se filtran por pared —una foto no sabe a que fachada pertenece— ni se
 * asignan solas: elegir cual es la de FBS3 es justo el juicio que tiene delante
 * quien esta mirando el plano.
 */
async function candidatas(expediente) {
    const dc = expediente?.oportunidades?.datos_calculo || {};
    const raiz = dc.drive_folder_id || dc.inputs?.drive_folder_id
        || expediente?.drive_folder_id || null;
    if (!raiz) return { fotos: [], aviso: 'El expediente no tiene carpeta de Drive.' };

    const sub = await driveService.findSubfolderByName(raiz, SUBCARPETA_DOCS);
    if (!sub) return { fotos: [], aviso: `No existe la carpeta «${SUBCARPETA_DOCS}».` };

    const ficheros = (await driveService.listFiles(sub) || []).filter(esImagen);
    const fotos = [];
    for (const [slot, rotulo] of SLOTS_CANDIDATOS) {
        for (const f of ficheros) {
            if (!reformaUploadService.fileBelongsToSlot(f.name, slot)) continue;
            fotos.push({ drive_id: f.id, nombre: f.name, slot, rotulo });
        }
    }
    fotos.sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es', { numeric: true }));
    return {
        fotos,
        aviso: fotos.length ? null
            : 'El expediente no tiene ninguna foto de fachada, patios ni ventanas.',
    };
}

// ── Poner y quitar ──────────────────────────────────────────────────────────

async function carpeta(expediente) {
    const seccion = await ceeUploadService.ensureCeeSectionFolder(expediente, 'inicial');
    if (!seccion) {
        throw Object.assign(new Error('El expediente no tiene carpeta de CEE en Drive.'),
                            { status: 502 });
    }
    return driveService.getOrCreateSubfolder(seccion, SUBCARPETA);
}

/** Sube una foto nueva y la pega a ese cerramiento. */
async function subir(expediente, clave, fichero, quien) {
    validaClave(clave);
    if (!fichero?.buffer?.length) {
        throw Object.assign(new Error('El fichero viene vacio.'), { status: 400 });
    }
    if (!String(fichero.mimetype || '').startsWith('image/')) {
        throw Object.assign(new Error('Aqui va una FOTO, no otra cosa.'), { status: 400 });
    }

    const todas = { ...fotosDe(expediente) };
    const lista = [...(todas[clave] || [])];
    if (lista.length >= MAX_POR_CLAVE) {
        throw Object.assign(
            new Error(`Ya hay ${MAX_POR_CLAVE} fotos en este cerramiento: quita alguna antes.`),
            { status: 400 });
    }

    const dest = await carpeta(expediente);
    const ext = (String(fichero.mimetype).split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    // El nombre NO es canonico a proposito: un cerramiento admite varias fotos
    // (la fachada de frente y de lado), y con un nombre fijo cada subida
    // archivaria la anterior en OLD. Mismo motivo que el cajon OTROS.
    const nombre = `${expediente.numero_expediente} - ENVOLVENTE `
        + `${clave.replace('/', ' ')} ${Date.now().toString(36)}.${ext}`;
    const subido = await driveService.saveFileToFolder(
        dest, nombre, fichero.mimetype, fichero.buffer, { throwOnError: true });

    lista.push({
        drive_id: subido.id,
        link: subido.webViewLink || null,
        nombre,
        origen: 'subida',
        subida_at: new Date().toISOString(),
        por: quien || null,
    });
    todas[clave] = lista;
    await escribir(expediente.id, todas);
    // Se deja puesto en el objeto que tiene el que llama: varias fotos se suben
    // EN SERIE, y sin esto la segunda leería el estado de antes de la primera y
    // la borraría. Recargar el expediente entre una y otra costaría cuatro
    // consultas por foto para enterarse de lo que acabamos de escribir.
    if (expediente.cee) expediente.cee[CAMPO] = todas;
    return lista[lista.length - 1];
}

/**
 * Pega a un cerramiento una foto que YA esta en el expediente.
 *
 * Solo se admiten las que `candidatas()` ofrece: el driveId llega del navegador
 * y sin esa comprobacion la ruta seria un proxy generico de Drive.
 */
async function adoptar(expediente, clave, driveId, quien) {
    validaClave(clave);
    const { fotos } = await candidatas(expediente);
    const cand = fotos.find((f) => f.drive_id === driveId);
    if (!cand) {
        throw Object.assign(new Error('Esa foto no es de este expediente.'), { status: 404 });
    }

    const todas = { ...fotosDe(expediente) };
    const lista = [...(todas[clave] || [])];
    if (lista.some((f) => f.drive_id === driveId)) return lista.find((f) => f.drive_id === driveId);
    if (lista.length >= MAX_POR_CLAVE) {
        throw Object.assign(
            new Error(`Ya hay ${MAX_POR_CLAVE} fotos en este cerramiento: quita alguna antes.`),
            { status: 400 });
    }

    lista.push({
        drive_id: cand.drive_id,
        nombre: cand.nombre,
        origen: 'expediente',
        slot: cand.slot,
        rotulo: cand.rotulo,
        subida_at: new Date().toISOString(),
        por: quien || null,
    });
    todas[clave] = lista;
    await escribir(expediente.id, todas);
    return lista[lista.length - 1];
}

/**
 * Despega una foto de su cerramiento.
 *
 * Lo SUBIDO desde aqui se borra de Drive: no es la prueba de nada y dejarlo
 * suelto llena la carpeta de fotos que ya no son de ninguna pared. Lo ADOPTADO
 * jamas se toca — es del expediente, lo subio el cliente, y aqui solo estaba
 * referenciado.
 */
async function quitar(expediente, clave, driveId) {
    validaClave(clave);
    const todas = { ...fotosDe(expediente) };
    const lista = todas[clave] || [];
    const f = lista.find((x) => x.drive_id === driveId);
    if (!f) throw Object.assign(new Error('Esa foto no esta en este cerramiento.'), { status: 404 });

    const resto = lista.filter((x) => x.drive_id !== driveId);
    if (resto.length) todas[clave] = resto; else delete todas[clave];
    await escribir(expediente.id, todas);

    if (f.origen === 'subida') {
        // Si el borrado falla, el estado ya esta escrito: la foto deja de estar
        // pegada a la pared, que es lo que se ha pedido. Queda un fichero suelto
        // en la carpeta, que es mucho menos malo que un error a media operacion.
        try { await driveService.deleteFile(driveId); }
        catch (e) { console.warn('[paredFoto] borrar de Drive:', e.message); }
    }
    return true;
}

/**
 * Baja los bytes de una foto de este expediente.
 *
 * Solo las que estan pegadas a un cerramiento o son candidatas: el driveId llega
 * del navegador y esto no puede convertirse en un proxy de la Drive API. Mismo
 * criterio que el proxy de contenido de los anexos del CIFO.
 */
async function bytesDe(expediente, driveId, { cands = null } = {}) {
    let vale = Object.values(fotosDe(expediente))
        .some((lista) => (lista || []).some((f) => f.drive_id === driveId));
    if (!vale) {
        const c = cands || (await candidatas(expediente)).fotos;
        vale = c.some((f) => f.drive_id === driveId);
    }
    if (!vale) throw Object.assign(new Error('Esa foto no es de este expediente.'), { status: 404 });

    const meta = await driveService
        .getFileMetadata(driveId, 'id, name, mimeType, trashed').catch(() => null);
    const buffer = await driveService.getFileContent(driveId);
    if (!buffer?.length) {
        throw Object.assign(new Error('No se ha podido bajar la foto de Drive.'), { status: 502 });
    }
    return { buffer, mimeType: meta?.mimeType || 'image/jpeg', nombre: meta?.name || null };
}

/**
 * Deja escrito lo ultimo que se leyo de una foto.
 *
 * Una comprobacion que se ve una vez y se pierde al cerrar el popup no sirve de
 * nada: al mes siguiente nadie sabe si esos seis huecos se contaron a ojo o
 * salieron de la foto. Van solo METADATOS (regla 21).
 */
async function sellarLectura(expediente, clave, driveIds, lectura) {
    validaClave(clave);
    const todas = { ...fotosDe(expediente) };
    const lista = [...(todas[clave] || [])];
    if (!lista.length) return false;
    const marca = {
        at: lectura?.at || new Date().toISOString(),
        modelo: lectura?.modelo || null,
        ambito: lectura?.ambito || null,
        ...(lectura?.ambito === 'pared'
            ? { ventanas: lectura.ventanas ?? null, puertas: lectura.puertas ?? null,
                encuadre: lectura.encuadre || null }
            : { tipo: lectura?.tipo || null, material_marco: lectura?.material_marco || null,
                acristalamiento: lectura?.acristalamiento || null }),
    };
    const ids = new Set(driveIds || []);
    todas[clave] = lista.map((f) => (ids.has(f.drive_id) ? { ...f, lectura: marca } : f));
    await escribir(expediente.id, todas);
    return true;
}

/**
 * Lo que de verdad se guarda de unas marcas que llegan del navegador.
 *
 * Determinista y a parte para poder probarlo: de aqui sale lo que se escribe en
 * el expediente, y una caja que se sale del encuadre o un `uid` inventado no se
 * ven hasta que alguien abre la foto y encuentra un rectangulo colgando.
 */
function normalizarMarcas(marcas) {
    return (Array.isArray(marcas) ? marcas : [])
        .filter((m) => m?.uid && m.box
            && ['x', 'y', 'ancho', 'alto'].every((k) => Number.isFinite(Number(m.box[k])))
            // Un rectangulo sin superficie no senala nada y no se puede volver a
            // coger con el raton para corregirlo.
            && Number(m.box.ancho) > 0 && Number(m.box.alto) > 0)
        .slice(0, MAX_MARCAS)
        .map((m) => ({
            uid: String(m.uid).slice(0, 40),
            box: {
                x: mil(m.box.x), y: mil(m.box.y),
                ancho: mil(m.box.ancho), alto: mil(m.box.alto),
            },
            // Se distingue lo LEIDO de lo puesto a mano: lo primero es una
            // conjetura del modelo y lo segundo, una decision de una persona.
            de: m.de === 'lectura' ? 'lectura' : 'mano',
        }));
}

//: Tope por foto. Una fachada de un bloque puede tener muchos huecos, pero
//: sesenta marcas en una imagen ya no se leen — y es el freno a que alguien
//: mande un array de mil desde fuera.
const MAX_MARCAS = 60;

/**
 * Deja SENALADO sobre una foto donde esta cada hueco.
 *
 * Es lo que convierte una foto pegada a la pared en una foto ANOTADA: al abrirla
 * se ve que esa ventana de la izquierda es V1 y la de la derecha V2, que es
 * justo lo que hay que saber para revisar sus medidas sin volver a la obra.
 *
 * REGLA — la marca vive con la FOTO, no con el hueco. El trabajo del plano
 * (`cee.envolvente`) lo REEMPLAZA entero el navegador cada 1,2 s y son ~2 KB a
 * proposito (regla 21); cuatro numeros por hueco lo engordarian sin que nadie lo
 * pidiera. Y sobre todo: una marca es «donde esta esto EN ESTA FOTO», asi que
 * pertenece a la foto — la misma ventana tiene otra caja en otra toma.
 *
 * REGLA — se guarda el `uid` del hueco, nunca su NOMBRE. V1 se puede renombrar
 * (y se recoloca solo al quitar un hueco de en medio): con el nombre, la marca
 * acabaria senalando a otra ventana.
 */
async function guardarMarcas(expediente, clave, driveId, marcas, { fundir = false } = {}) {
    validaClave(clave);
    const todas = { ...fotosDe(expediente) };
    const lista = todas[clave] || [];
    if (!lista.some((f) => f.drive_id === driveId)) {
        throw Object.assign(new Error('Esa foto no esta en este cerramiento.'), { status: 404 });
    }
    const limpias = normalizarMarcas(marcas);

    // FUNDIR es para una LECTURA: trae las cajas de los huecos que acaba de
    // proponer y no sabe nada de los que el certificador señaló a mano, así que
    // una lista completa se los llevaría por delante. Desde el visor la lista SÍ
    // es la verdad —quitar una marca es mandarla sin ella—, y ahí no se funde.
    const previas = fundir
        ? (lista.find((f) => f.drive_id === driveId)?.marcas || [])
            .filter((m) => !limpias.some((n) => n.uid === m.uid))
        : [];
    const finales = [...previas, ...limpias];

    todas[clave] = lista.map((f) => (f.drive_id === driveId
        ? { ...f, marcas: finales.length ? finales : undefined }
        : f));
    await escribir(expediente.id, todas);
    if (expediente.cee) expediente.cee[CAMPO] = todas;
    return finales;
}

//: Una caja vive dentro del encuadre. Lo que se sale no es una marca: es un
//: arrastre que se ha ido de la foto, y pintarlo dejaria un rectangulo colgando
//: del borde.
const mil = (v) => Math.min(1, Math.max(0, Math.round(Number(v) * 1000) / 1000));

module.exports = {
    CAMPO,
    SUBCARPETA,
    guardarMarcas,
    normalizarMarcas,
    MAX_MARCAS,
    SLOTS_CANDIDATOS,
    MAX_POR_CLAVE,
    fotosDe,
    estado,
    candidatas,
    subir,
    adoptar,
    quitar,
    bytesDe,
    sellarLectura,
    validaClave,
};
