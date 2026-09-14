// ============================================================================
// ceeEnvolventeCex.js — el .cex de envolvente: de qué datos sale y dónde acaba.
//
// Lo usan la RUTA (`routes/ceeEnvolvente.js`, el botón del certificador) y el
// script de prueba. No es una comodidad: con cada uno cargando el expediente a
// su manera, el script daba por buena una ficha a la que le faltaba la zona
// climática porque no traía la oportunidad — y eso es justo lo que el script
// tenía que haber detectado.
//
// La GEOMETRÍA no se toca aquí: la mide el motor. Esto pone lo que el motor no
// puede saber (titular, zona, transmitancias) y se encarga de que el fichero
// acabe en la carpeta del expediente.
// ============================================================================
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const ceeUploadService = require('./ceeUploadService');
const catastroService = require('./catastroService');
const catastroMonitor = require('./catastroMonitor');

//: `_REVISAR` no es decorativo: este `.cex` lo escribe una máquina y hay que
//: abrirlo en CE3X y comprobarlo antes de que valga como certificado. Es además
//: lo que lo distingue del que entrega el técnico, que vive en esta misma
//: carpeta con la misma extensión (ver `matchSlot` en `ceeUploadService`).
const SUFIJO_REVISAR = 'CEE INICIAL_REVISAR';

//: Las dos fases, con su nombre de fichero y su carpeta. La carpeta la resuelve
//: `ceeUploadService.ensureCeeSectionFolder`, que es quien la crea y la comparte
//: con el certificador: aquí no se escribe ninguna ruta a mano.
//:
//: El `_REVISAR` va en las dos y por el mismo motivo: lo escribe una máquina y
//: hay que abrirlo en CE3X antes de que valga. Es además lo que lo distingue del
//: que entrega el técnico, que vive en esa misma carpeta con la misma extensión
//: (la salida `_revisar.cex → null` de `matchSlot` ya cubre las dos).
const FASES = {
    inicial: { seccion: 'inicial', sufijo: 'CEE INICIAL_REVISAR', carpeta: '1. CEE / CEE INICIAL' },
    final: { seccion: 'final', sufijo: 'CEE FINAL_REVISAR', carpeta: '1. CEE / CEE FINAL' },
};

function faseDe(fase) {
    const f = FASES[String(fase || 'inicial').toLowerCase()];
    if (!f) throw new Error(`fase de CEE no contemplada: ${fase}`);
    return f;
}

const FICHA_JS = path.join(
    __dirname, '../../frontend/src/features/cee-envolvente/logic/fichaCe3x.js');
let _ficha = { sello: null, promesa: null };

/**
 * Fuente única con la vista: el módulo del frontend, por import() ESM (mismo
 * patrón que `cifoService` con `cifoDoc.js`).
 *
 * REGLA — se recarga cuando el fichero CAMBIA en disco. Un `import()` se cachea
 * por PROCESO, así que un backend levantado antes de tocar este módulo sigue
 * componiendo la ficha con la versión de su arranque — y eso no falla: genera un
 * `.cex` sin lo que se acaba de añadir, que es el peor sitio donde esconder un
 * cambio (pasó el 13/09/2026: el `.cex` salía sin medidas de mejora y sin el
 * cuadro del informe, y nada lo decía). La clave `?v=` fuerza a Node a releerlo.
 *
 * En producción el fichero no cambia entre despliegues, así que el coste es un
 * `stat` por llamada — y el proceso se recrea en cada deploy de todos modos.
 */
function loadFichaCe3x() {
    let sello;
    try {
        sello = String(fs.statSync(FICHA_JS).mtimeMs);
    } catch {
        sello = _ficha.sello || 'x';     // si no se puede mirar, vale lo cargado
    }
    if (_ficha.sello !== sello || !_ficha.promesa) {
        _ficha = { sello, promesa: import(`${pathToFileURL(FICHA_JS).href}?v=${sello}`) };
    }
    return _ficha.promesa;
}

/**
 * Expediente + cliente + carpeta de Drive: lo que la ficha necesita.
 * `clave` es el id o el número de expediente.
 */
async function cargarExpediente(clave) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    // Con la oportunidad: de ella salen la zona climática y el año con los que
    // se simuló, que son los que fijaron las transmitancias de la propuesta.
    const { data: expediente, error } = await supabase
        .from('expedientes').select('*, oportunidades(datos_calculo)')
        .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (error || !expediente) return null;

    let cliente = null;
    if (expediente.cliente_id) {
        const { data } = await supabase.from('clientes').select('*')
            .eq('id_cliente', expediente.cliente_id).maybeSingle();
        cliente = data || null;
    }
    // El TÉCNICO que firma el certificado: el certificador asignado. Sus once
    // campos de CE3X están en `prescriptores` — titulación, colegio y número
    // incluidos—, así que no hay que teclear ninguno.
    let certificador = null;
    const certId = expediente.cee?.certificador_id;
    if (certId) {
        const { data } = await supabase.from('prescriptores')
            .select('razon_social, cif, es_autonomo, nombre_responsable, apellidos_responsable, '
                    + 'nif_responsable, direccion, municipio, provincia, codigo_postal, '
                    + 'email, tlf, email_responsable, tlf_responsable, '
                    + 'titulacion, colegio_profesional, numero_colegiado')
            .eq('id_empresa', certId).maybeSingle();
        certificador = data || null;
    }

    // El id de la carpeta vive en `datos_calculo` de la oportunidad, no en el
    // expediente. Lo resuelve ceeUploadService y no se repite aquí.
    const driveFolderId = await ceeUploadService.resolveDriveFolderId(expediente);
    return { expediente, cliente, certificador, driveFolderId };
}

/**
 * Qué construcciones del Catastro cuentan en este expediente.
 *
 * Sale de la OPORTUNIDAD, que es donde una persona lo marcó en la ficha
 * técnica y de donde salió la superficie con la que se le presupuestó al
 * cliente: si el `.cex` midiera otras plantas, el certificado no reproduciría
 * el ahorro de su propia propuesta.
 *
 * REGLA — sin selección guardada se devuelve `null`, y el motor sigue
 * decidiendo por el uso de Catastro. El valor por defecto de aquella pantalla
 * es «todas las de uso VIVIENDA», que es exactamente lo mismo: una oportunidad
 * que nunca pasó por ahí no puede empezar a medir distinto.
 */
async function construccionesElegidas(clave) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    const { data } = await supabase
        .from('expedientes').select('oportunidades(datos_calculo)')
        .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    const inputs = data?.oportunidades?.datos_calculo?.inputs || {};
    const lista = inputs.construcciones_elegidas;
    return Array.isArray(lista) && lista.length ? lista : null;
}

/**
 * Cambiar QUE CUENTA desde la envolvente.
 *
 * Se marca al abrir la oportunidad, pero el error se ve AQUI: con el plano
 * delante se nota que la planta que consta como almacen es vivienda, o que el
 * porche cerrado que consta como vivienda no lo calienta nadie. Obligar a salir,
 * abrir la ficha tecnica y volver es el camino que nadie recorre.
 *
 * REGLA — se escribe en la OPORTUNIDAD, que es la fuente. Guardarlo aparte
 * —en el trabajo de la envolvente, por ejemplo— dejaria dos sitios contestando
 * a la misma pregunta, y el dia que no coincidan nadie sabria cual manda.
 *
 * REGLA — NO se tocan `superficie`, `plantas` ni `result` de la oportunidad.
 * Son las cifras con las que se le presupuesto al cliente y pueden estar ya en
 * una propuesta firmada: moverlas desde aqui, sin recalcular el ahorro ni
 * avisar a nadie, cambiaria el bono de un expediente en marcha. Lo que cambia
 * es lo que MIDE el certificado, y la diferencia se dice en pantalla.
 */
async function guardarConstrucciones(clave, elegidas, desglose) {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    // ⚠ `oportunidades` NO tiene columna `historial`: vive DENTRO de
    // `datos_calculo`. Pedirla aquí hacía fallar la consulta ENTERA y la app
    // decía «este expediente no tiene oportunidad detrás» de uno que sí la
    // tiene (mismo gotcha que `prescriptores.telefono`). La escribe la RPC.
    const { data, error: errLeer } = await supabase
        .from('expedientes')
        .select('numero_expediente, oportunidad_id')
        .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (errLeer) throw new Error(errLeer.message);
    if (!data?.oportunidad_id) {
        throw Object.assign(
            new Error('Este expediente no tiene oportunidad detras: no hay donde '
                      + 'guardar que construcciones cuentan.'), { status: 409 });
    }

    const codigos = [...new Set((elegidas || []).map(c => String(c).trim()).filter(Boolean))];
    const lista = (desglose || []).map(c => ({
        codigo: c.codigo, uso: c.uso ?? null, planta: c.planta ?? null,
        superficie: Number(c.superficie) || 0,
        cuenta: codigos.includes(c.codigo),
    }));

    // El rastro va en la MISMA sentencia: cambia la superficie que mide el
    // certificado, y una selección sin rastro —o un rastro sin la selección—
    // es peor que no tener ninguno de los dos.
    const cuentan = lista.filter(c => c.cuenta);
    const m2 = Math.round(cuentan.reduce((s, c) => s + c.superficie, 0));
    const plantas = new Set(cuentan.map(c => c.planta)).size;
    const { error } = await supabase.rpc('set_oportunidad_construcciones', {
        p_oportunidad_id: data.oportunidad_id,
        p_elegidas: codigos,
        p_construcciones: lista,
        p_entrada: {
            fecha: new Date().toISOString(), usuario: 'Sistema',
            accion: 'CONSTRUCCIONES QUE CUENTAN',
            detalle: `Desde la envolvente de ${data.numero_expediente}: ahora cuentan `
                   + `${cuentan.length} de ${lista.length} construcciones (${m2} m², `
                   + `${plantas} ${plantas === 1 ? 'planta' : 'plantas'}). `
                   + 'La simulación NO se ha recalculado.',
        },
    });
    if (error) throw new Error(error.message);
    return { elegidas: codigos, construcciones: lista };
}

/**
 * Lo que se va a escribir alrededor de la envolvente, con su procedencia.
 *
 * `conImagenes` baja del Catastro la foto de fachada y el croquis de parcela.
 * Solo se pide al GENERAR: la previsualización se abre muchas veces y cada
 * llamada son peticiones al mismo WAF del que depende el buscador.
 */
async function componerFicha(ctx, { geometria, envolvente, ajustes, medidas = null,
                                    conImagenes = false, fase = 'inicial' } = {}) {
    const { fichaCe3x } = await loadFichaCe3x();
    faseDe(fase);                       // que una fase inventada falle aquí, no al guardar
    // `imagenesDelCex` y no `imagenesDeCatastro`: si el certificador ha puesto
    // otra foto, es la suya la que tiene que entrar en el fichero. Con las dos
    // funciones separadas, la pantalla enseñaría una imagen y el .cex llevaría
    // otra — y eso no se descubre hasta abrirlo en CE3X.
    const imagenes = conImagenes
        ? await imagenesDelCex(ctx, geometria)
        : { avisos: [] };
    const { ficha, avisos, medidas: catalogo, faltan } = fichaCe3x({
        expediente: ctx.expediente, cliente: ctx.cliente,
        certificador: ctx.certificador,
        geo: { geometria }, envolvente, ajustes, imagenes, fase, medidas,
    });
    // El CATÁLOGO viaja aparte de la ficha: es lo que la pestaña de medidas
    // pinta para que se elijan, y no es un dato que vaya dentro del `.cex`.
    return { ficha, catalogo, faltan, avisos: [...avisos, ...imagenes.avisos] };
}

//: Las dos imágenes del pickle 2 del `.cex`: la foto de fachada y el croquis de
//: parcela. Las mismas que ya rescata la app para la ficha catastral
//: (`catastroService.getFacadeImage` / `getParcelImage`), así que aquí no hay
//: ningún cliente nuevo contra Catastro — se reutiliza el que ya respeta el WAF.
//:
//: Se cachean por RC mientras viva el proceso: la foto de fachada de un
//: inmueble no cambia, y regenerar el .cex tres veces no puede costar nueve
//: peticiones.
const _imagenes = new Map();

/**
 * REGLA — al Catastro NUNCA en ráfaga: las dos van EN SERIE y con pausa, y si
 * el monitor está en modo bloqueado no se pide ninguna. Al otro lado está el
 * mismo WAF del que depende el buscador en producción.
 *
 * REGLA — que falte una imagen NO impide generar. Muchos inmuebles no tienen
 * foto de fachada registrada y el `.cex` es igual de válido sin ella: se dice
 * en los avisos y el certificador la pone en CE3X si la tiene.
 */
async function imagenesDeCatastro(rc) {
    if (!rc) return { avisos: ['Sin referencia catastral: el .cex sale sin foto ni croquis.'] };
    if (_imagenes.has(rc)) return _imagenes.get(rc);

    const salida = { avisos: [] };
    if (catastroMonitor.shouldSkipRequest()) {
        salida.avisos.push('Catastro está limitando peticiones ahora mismo: el .cex sale '
                           + 'sin foto de fachada ni croquis. Vuelve a generarlo más tarde.');
        return salida;   // sin cachear: es una situación pasajera
    }

    const fachada = await pedirImagen(() => catastroService.getFacadeImage(rc));
    if (fachada) {
        salida.foto_edificio = fachada.grande;
        // La misma foto en 640×480 (58 KB en vez de 322), para ENSEÑARLA: la
        // pantalla la pinta en un recuadro de 300×170 y esperar 431 KB de base64
        // para eso es lo que hacía que tardara en aparecer. Al `.cex` va la
        // grande, que es lo verificado contra un fichero real.
        salida.foto_edificio_vista = fachada.vista;
    }
    else salida.avisos.push('Catastro no tiene foto de fachada de esta referencia: '
                            + 'el .cex sale sin ella (se puede poner en CE3X).');

    await sleep(800);   // en serie y espaciadas, nunca las dos a la vez

    const parcela = await pedirImagen(() => catastroService.getParcelImage(rc));
    if (parcela) salida.plano_situacion = parcela.grande;
    else salida.avisos.push('No se ha podido traer el croquis de parcela de Catastro: '
                            + 'el .cex sale sin plano de situación.');

    _imagenes.set(rc, salida);
    return salida;
}

/**
 * El motor escribe la imagen desde base64 (`imagen()` en generar_cex.py).
 *
 * Devuelve la grande —la que va al fichero— y, si el original trae una
 * miniatura dentro, también esa: es la que se enseña.
 */
async function pedirImagen(traer) {
    try {
        const img = await traer();
        const bytes = img?.data;
        if (!bytes) return null;
        const grande = Buffer.from(bytes).toString('base64');
        return { grande,
                 vista: img.miniatura ? Buffer.from(img.miniatura).toString('base64')
                                      : grande };
    } catch (e) {
        console.warn('[ceeEnvolventeCex] imagen de Catastro:', e.message);
        return null;
    }
}

function rcDe(ctx, geometria) {
    return geometria?.referencia_catastral?.inmueble
        || geometria?.referencia_catastral?.completa
        || ctx?.expediente?.instalacion?.ref_catastral
        || null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function nombreDelCex(expediente, fase = 'inicial') {
    const num = expediente?.numero_expediente || 'EXPEDIENTE';
    return `${num} - ${faseDe(fase).sufijo}.cex`;
}

/**
 * Deja el `.cex` en `1. CEE / CEE INICIAL`. Si ya había uno con ese nombre, el
 * anterior se archiva en OLD: un `.cex` es el trabajo de alguien y regenerar no
 * puede hacerlo desaparecer.
 */
async function guardarEnDrive(ctx, buffer, fase = 'inicial') {
    const { expediente, driveFolderId } = ctx;
    if (!driveFolderId) return { ok: false, error: 'el expediente no tiene carpeta de Drive' };
    const f = faseDe(fase);
    try {
        // El enlace de la CARPETA, no solo el del fichero: es el que se le
        // comparte al certificador al encargarle el CEE, y es donde va a
        // buscarlo. `ensureCeeSectionFolder` ya la deja pública de lectura.
        const { id: carpeta, link: carpetaLink } =
            await ceeUploadService.ensureCeeSectionFolder(driveFolderId, f.seccion);
        const nombre = nombreDelCex(expediente, fase);

        const previo = await driveService.findFileByName(carpeta, nombre);
        let archivado = null;
        if (previo) archivado = await driveService.archiveExistingToOld(carpeta, previo, nombre);

        const guardado = await driveService.saveFileToFolder(
            carpeta, nombre, 'application/octet-stream', buffer, { throwOnError: true });
        if (!guardado?.id) throw new Error('Drive no ha devuelto el fichero');

        return { ok: true, nombre, link: guardado.link, driveId: guardado.id,
                 carpeta: f.carpeta,
                 carpeta_link: carpetaLink
                     || `https://drive.google.com/drive/folders/${carpeta}`,
                 archivado, bytes: buffer.length };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

/**
 * El `.cex` de una fase que YA está en la carpeta del expediente.
 *
 * Es lo que hace falta para el CEE FINAL: no se levanta de cero, se COPIA el
 * inicial y se le cambia el generador — que es como se hace a mano y lo que
 * garantiza que la envolvente, el técnico y las dos imágenes del Catastro sean
 * exactamente las mismas. De paso ahorra una segunda tanda de peticiones al WAF
 * por unas fotos que ya están dentro del fichero.
 */
async function leerCexDeFase(ctx, fase = 'inicial') {
    const { expediente, driveFolderId } = ctx;
    if (!driveFolderId) return null;
    const f = faseDe(fase);
    const carpeta = await ceeUploadService.ensureCeeSectionFolder(driveFolderId, f.seccion);
    const nombre = nombreDelCex(expediente, fase);
    const id = await driveService.findFileByName(carpeta.id, nombre);
    if (!id) return null;
    const bytes = await driveService.getFileContent(id);
    return bytes?.length ? { bytes, nombre, driveId: id } : null;
}

// ─── Lo que el certificador señala, guardado en el expediente ────────────────

//: Dónde vive: `expedientes.cee.envolvente`. Son METADATOS (~2 KB): la entrada,
//: los huecos de cada pared y las paredes reclasificadas. Ni geometría ni
//: ficheros — la geometría la mide el motor y el `.cex` vive en Drive
//: (regla 21).
const CAMPO_TRABAJO = 'envolvente';

//: Dónde se anota la imagen que el certificador pone en lugar de la de Catastro.
//: Clave APARTE del trabajo: el trabajo lo REEMPLAZA entero el navegador en cada
//: autoguardado, y una imagen subida entre dos guardados se perdería.
const CAMPO_IMAGENES = 'envolvente_imagenes';

/** Lo guardado, o `null` si este expediente no tiene nada todavía. */
async function leerTrabajo(id) {
    const { data } = await supabase.from('expedientes')
        .select('cee').eq('id', id).maybeSingle();
    return data?.cee?.[CAMPO_TRABAJO] || null;
}

/**
 * Guarda el trabajo. REEMPLAZA la clave entera, no funde: si el certificador
 * quita un hueco, un merge lo dejaría puesto. Escribe solo esa clave, así que
 * no puede pisar `cee.cee_inicial` ni el seguimiento.
 */
async function guardarTrabajo(id, trabajo) {
    const { error } = await supabase.rpc('set_expediente_cee_field', {
        p_expediente_id: id,
        p_field: CAMPO_TRABAJO,
        p_value: { ...trabajo, guardado_at: new Date().toISOString() },
    });
    if (error) throw new Error(error.message);
    return true;
}

/**
 * Las dos imágenes de portada, a demanda.
 *
 * Se piden CUANDO SE PIDEN y no al previsualizar la ficha: esa pantalla se abre
 * muchas veces y al otro lado está el mismo WAF del que depende el buscador de
 * la app. Van por el mismo helper cacheado que usa la generación, así que
 * mirarlas aquí NO cuesta una petición más cuando luego se genere.
 */
//: Las dos imágenes que van DENTRO del `.cex`, y cómo se llaman cuando se
//: sustituyen. El nombre es canónico: sustituir dos veces reemplaza el fichero
//: en vez de dejar dos sueltos en la carpeta.
const IMAGENES = {
    fachada: { campo: 'foto_edificio', vista: 'foto_edificio_vista',
               fichero: 'FOTO FACHADA CEX', etiqueta: 'la foto de fachada' },
    croquis: { campo: 'plano_situacion', fichero: 'CROQUIS PARCELA CEX',
               etiqueta: 'el croquis de parcela' },
};

/**
 * Las dos imágenes del `.cex`: la SUSTITUIDA manda sobre la de Catastro.
 *
 * Catastro no siempre tiene foto, y cuando la tiene puede ser de hace quince
 * años o de la casa de al lado. El certificador ha estado delante del edificio:
 * si pone la suya, es la que va al certificado — con la de Catastro no se
 * discute, se sustituye.
 *
 * REGLA — lo sustituido vive en DRIVE, y en la BD solo su id (regla 21). Una
 * foto en base64 dentro de un JSONB es lo que tumbó la base de datos dos veces.
 */
async function imagenesDelCex(ctx, geometria) {
    const puestas = ctx?.expediente?.cee?.[CAMPO_IMAGENES] || {};
    const salida = { ...(await imagenesDeCatastro(rcDe(ctx, geometria))) };
    salida.avisos = [...(salida.avisos || [])];
    salida.sustituidas = {};

    for (const [cual, def] of Object.entries(IMAGENES)) {
        const puesta = puestas[cual];
        if (!puesta?.drive_id) continue;
        try {
            const bytes = await driveService.getFileContent(puesta.drive_id);
            if (!bytes?.length) throw new Error('el fichero está vacío');
            salida[def.campo] = Buffer.from(bytes).toString('base64');
            // La que sube el certificador se enseña TAL CUAL: no sabemos
            // reescalar una foto cualquiera sin meter una dependencia nueva.
            if (def.vista) salida[def.vista] = salida[def.campo];
            salida.sustituidas[cual] = { ...puesta };
            // Los avisos de Catastro sobre ESTA imagen ya no vienen a cuento:
            // decir que no hay foto de fachada cuando se ha puesto una es
            // contarle al certificador un problema que él mismo resolvió.
            salida.avisos = salida.avisos.filter(a => !a.includes(def.etiqueta));
        } catch (e) {
            // El enlace apunta a un fichero que ya no está: se dice y se cae a
            // la de Catastro. Callarlo sería generar el .cex con otra imagen.
            salida.avisos.push(
                `${def.etiqueta}: la que habías puesto ya no está en Drive `
                + `(${e.message}). El .cex sale con la de Catastro — vuelve a subirla.`);
        }
    }
    return salida;
}

//: La cartografía ya pedida, por rectángulo. Al otro lado está el mismo WMS de
//: Catastro del que depende el buscador: encender y apagar el fondo del plano no
//: puede ser una petición cada vez.
const _carto = new Map();

/**
 * La cartografía del Catastro DEBAJO del plano.
 *
 * El motor dice en qué rectángulo del mundo dibujó (`georef`), y al WMS se le
 * pide ese mismo: la imagen encaja con el plano píxel a píxel, sin ajustar nada
 * a ojo. Es lo que convierte «esta pared da al vecino, me fío de Catastro» en
 * «esta pared da al vecino, lo estoy viendo».
 */
async function cartografia(georef) {
    const bbox = (georef?.bbox || []).map(Number);
    if (bbox.length !== 4 || !bbox.every(Number.isFinite)) {
        throw Object.assign(new Error('Falta el rectángulo del plano.'), { status: 400 });
    }
    // Un rectángulo desmesurado no es el plano de una casa: es una petición que
    // le cuesta al WMS y no sirve para nada.
    const anchoM = bbox[2] - bbox[0], altoM = bbox[3] - bbox[1];
    if (!(anchoM > 0 && altoM > 0) || anchoM > 2000 || altoM > 2000) {
        throw Object.assign(new Error('El rectángulo del plano no es razonable.'),
                            { status: 400 });
    }
    const clave = `${georef.crs || 'EPSG:25830'}|${bbox.join(',')}`;
    if (_carto.has(clave)) return _carto.get(clave);

    if (catastroMonitor.shouldSkipRequest()) {
        // Sin cachear: es pasajero.
        return { aviso: 'Catastro está limitando peticiones ahora mismo: el plano se '
                      + 'queda sin la cartografía de fondo. Inténtalo más tarde.' };
    }
    try {
        const img = await catastroService.getWmsImage(bbox, { crs: georef.crs });
        const salida = { imagen: img.data.toString('base64'),
                         tipo: img.contentType, ancho: img.ancho, alto: img.alto };
        _carto.set(clave, salida);
        return salida;
    } catch (e) {
        console.warn('[ceeEnvolventeCex] cartografía:', e.message);
        return { aviso: `No se ha podido traer la cartografía del Catastro: ${e.message}` };
    }
}

/**
 * Sustituir una de las dos imágenes.
 *
 * Va a la MISMA carpeta que el `.cex` (`1. CEE / CEE INICIAL`), que es la que ya
 * se comparte con el certificador: una imagen del certificado que viva fuera del
 * expediente no la encuentra nadie cuando haya que comprobarla.
 */
async function sustituirImagen(ctx, cual, fichero) {
    const def = IMAGENES[cual];
    if (!def) throw Object.assign(new Error(`No sé qué imagen es «${cual}».`), { status: 400 });
    if (!fichero?.buffer?.length) {
        throw Object.assign(new Error('El fichero viene vacío.'), { status: 400 });
    }
    const tipo = String(fichero.mimetype || '');
    if (!tipo.startsWith('image/')) {
        throw Object.assign(new Error('Solo una imagen: el .cex no admite otra cosa.'),
                            { status: 400 });
    }

    const carpeta = await ceeUploadService.ensureCeeSectionFolder(ctx.expediente, 'inicial');
    if (!carpeta) {
        throw Object.assign(new Error('El expediente no tiene carpeta de CEE en Drive.'),
                            { status: 502 });
    }
    const ext = (tipo.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const nombre = `${ctx.expediente.numero_expediente} - ${def.fichero}.${ext}`;
    // La anterior se ARCHIVA en OLD, no se tira: puede estar ya dentro de un
    // `.cex` entregado, y entonces es la prueba de lo que se certificó.
    try {
        // ⚠ Devuelve el ID, no un objeto.
        const previo = await driveService.findFileByName(carpeta, nombre);
        if (previo) await driveService.archiveExistingToOld(carpeta, previo, nombre);
    } catch (e) {
        console.warn('[ceeEnvolventeCex] archivar imagen anterior:', e.message);
    }
    const subido = await driveService.saveFileToFolder(
        carpeta, nombre, tipo, fichero.buffer, { throwOnError: true });

    const puestas = { ...(ctx.expediente.cee?.[CAMPO_IMAGENES] || {}) };
    puestas[cual] = {
        drive_id: subido.id, link: subido.webViewLink || null, nombre,
        subida_at: new Date().toISOString(),
    };
    await escribirImagenes(ctx.expediente.id, puestas);
    return puestas[cual];
}

/** Volver a la de Catastro. El fichero se queda en Drive: no se tira nada. */
async function quitarImagen(ctx, cual) {
    if (!IMAGENES[cual]) {
        throw Object.assign(new Error(`No sé qué imagen es «${cual}».`), { status: 400 });
    }
    const puestas = { ...(ctx.expediente.cee?.[CAMPO_IMAGENES] || {}) };
    delete puestas[cual];
    await escribirImagenes(ctx.expediente.id, puestas);
    return true;
}

async function escribirImagenes(id, puestas) {
    const { error } = await supabase.rpc('set_expediente_cee_field', {
        p_expediente_id: id, p_field: CAMPO_IMAGENES, p_value: puestas,
    });
    if (error) throw new Error(error.message);
}

module.exports = {
    imagenesDelCex,
    sustituirImagen,
    quitarImagen,
    IMAGENES,
    CAMPO_TRABAJO,
    FASES,
    faseDe,
    leerTrabajo,
    guardarTrabajo,
    construccionesElegidas,
    guardarConstrucciones,
    cartografia,
    SUFIJO_REVISAR,
    loadFichaCe3x,
    cargarExpediente,
    componerFicha,
    nombreDelCex,
    leerCexDeFase,
    guardarEnDrive,
};
