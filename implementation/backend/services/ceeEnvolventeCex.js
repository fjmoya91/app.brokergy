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
const ceeDirectoService = require('./ceeDirectoService');
const ceeDirectoUploadService = require('./ceeDirectoUploadService');
const { getUnidades } = require('../utils/aerotermiaUnits');
const { normalizeData } = require('../utils/normalization');
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

// ─── De qué NEGOCIO es este expediente ──────────────────────────────────────
//
// La envolvente vale para los dos: el expediente CAE y el CEE contratado suelto
// (`cee_directos`). Lo que cambia entre ellos no es la geometría ni la ficha
// —eso es el mismo edificio— sino DÓNDE se escribe el trabajo y EN QUÉ carpeta
// acaba el `.cex`. Se decide aquí, en cuatro funciones, y no con un `if`
// repartido por el fichero.
//
// La marca la pone `ceeDirectoComoExpediente` al cargar: no se deduce de que
// falte `oportunidad_id`, porque de esto depende en qué TABLA se escribe.
const esCeeDirecto = (e) => !!e?.es_cee_directo;

//: Una OPORTUNIDAD todavía sin aceptar (la envolvente se empieza desde la
//: calculadora). La marca la pone `oportunidadComoExpediente` al cargar. Su
//: trabajo vive en `datos_calculo.envolvente_cee`, con las MISMAS claves que
//: `expedientes.cee`, y `expedienteService` lo vuelca al expediente al aceptar.
const esOportunidad = (e) => !!e?.es_oportunidad;

/** 'cae' · 'cee' · 'op' — cualquier otra cosa es el CAE de siempre. */
function origenNorm(origen) {
    const o = String(origen || 'cae').toLowerCase();
    return o === 'cee' || o === 'op' ? o : 'cae';
}

const esUuid = (v) => /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(v));

/** Escribe UNA clave de `cee` en la tabla que toque. Reemplaza, no funde. */
async function setCeeField(expediente, campo, valor) {
    const { error } = esOportunidad(expediente)
        ? await supabase.rpc('set_oportunidad_cee_field', {
            p_oportunidad_id: expediente.id, p_field: campo, p_value: valor })
        : esCeeDirecto(expediente)
        ? await supabase.rpc('set_cee_directo_cee_field', {
            p_cee_directo_id: expediente.id, p_field: campo, p_value: valor })
        : await supabase.rpc('set_expediente_cee_field', {
            p_expediente_id: expediente.id, p_field: campo, p_value: valor });
    if (error) throw new Error(error.message);
}

/**
 * La carpeta de Drive de esta fase, creada si hace falta y compartida.
 *
 * En el CAE es `1. CEE / CEE INICIAL`; en un CEE directo la sección cuelga
 * DIRECTAMENTE de la raíz y en un encargo de un solo certificado se llama
 * `1. CEE` a secas. Lo resuelve cada servicio de subida: aquí no se escribe
 * ninguna ruta a mano, que es justo lo que dejó 18 ficheros donde nadie mira.
 */
async function carpetaFase(ctx, fase) {
    const f = faseDe(fase);
    if (esCeeDirecto(ctx.expediente)) {
        return ceeDirectoUploadService.ensureSectionFolder(ctx.expediente, f.seccion);
    }
    const { id, link } = await ceeUploadService.ensureCeeSectionFolder(ctx.driveFolderId, f.seccion);
    return { id, link };
}

/**
 * Cómo se llama el `.cex` de esta fase.
 *
 * En un encargo de UN solo certificado el fichero NO se llama «CEE INICIAL»:
 * ahí no hay un después, y esa palabra manda a buscar un certificado que nunca
 * va a llegar. Es la misma decisión que ya toma `ceeDirectoUploadService` para
 * los ficheros del técnico, importada y no copiada.
 */
function sufijoCex(expediente, fase) {
    if (esCeeDirecto(expediente)) {
        return `${ceeDirectoUploadService.sectionLabel(expediente, faseDe(fase).seccion)}_REVISAR`;
    }
    return faseDe(fase).sufijo;
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
function loadEsm(fichero, cache) {
    let sello;
    try {
        sello = String(fs.statSync(fichero).mtimeMs);
    } catch {
        sello = cache.sello || 'x';      // si no se puede mirar, vale lo cargado
    }
    if (cache.sello !== sello || !cache.promesa) {
        cache.sello = sello;
        cache.promesa = import(`${pathToFileURL(fichero).href}?v=${sello}`);
    }
    return cache.promesa;
}

function loadFichaCe3x() {
    return loadEsm(FICHA_JS, _ficha);
}

//: Un CEE directo leído como expediente. Fuente única con la VENTANA, que pinta
//: la misma fila: con dos adaptadores, la dirección que se enseña y la que se
//: escribe en el `.cex` acabarían saliendo de sitios distintos.
const CEE_DIRECTO_JS = path.join(
    __dirname, '../../frontend/src/features/cee-envolvente/logic/ceeDirecto.js');
const _ceeDirecto = { sello: null, promesa: null };

function loadCeeDirecto() {
    return loadEsm(CEE_DIRECTO_JS, _ceeDirecto);
}

//: Una oportunidad leída como expediente. Fuente única con la VENTANA, por lo
//: mismo que el de arriba.
const OPORTUNIDAD_JS = path.join(
    __dirname, '../../frontend/src/features/cee-envolvente/logic/oportunidad.js');
const _oportunidad = { sello: null, promesa: null };

function loadOportunidad() {
    return loadEsm(OPORTUNIDAD_JS, _oportunidad);
}

/**
 * Expediente + cliente + carpeta de Drive: lo que la ficha necesita.
 * `clave` es el id o el número de expediente.
 *
 * `origen` dice de qué NEGOCIO es: el expediente CAE de siempre o un CEE
 * contratado suelto. Viaja explícito desde el navegador (`?origen=cee`) y no se
 * busca «a ver en qué tabla está»: son dos tablas y el mismo UUID no vale en las
 * dos, así que una búsqueda a ciegas es la forma de escribir en el negocio
 * equivocado. Mismo criterio que `?cee=` frente a `?exp=` en los enlaces.
 */
async function cargarExpediente(clave, origen = 'cae') {
    if (origenNorm(origen) === 'cee') return cargarCeeDirecto(clave);
    if (origenNorm(origen) === 'op') return cargarOportunidad(clave);
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
                    + 'nif_responsable, empresa_razon_social, empresa_cif, '
                    + 'direccion, municipio, provincia, codigo_postal, '
                    + 'email, tlf, email_responsable, tlf_responsable, '
                    + 'titulacion, colegio_profesional, numero_colegiado')
            .eq('id_empresa', certId).maybeSingle();
        certificador = data || null;
    }

    // El id de la carpeta vive en `datos_calculo` de la oportunidad, no en el
    // expediente. Lo resuelve ceeUploadService y no se repite aquí.
    const driveFolderId = await ceeUploadService.resolveDriveFolderId(expediente);
    const modelos = await modelosDeAerotermia(expediente);
    return { expediente, cliente, certificador, driveFolderId, modelos };
}

/**
 * Lo mismo para un CEE contratado SUELTO.
 *
 * Aquí no hay oportunidad detrás —ese es justo el motivo de que `cee_directos`
 * sea otra tabla—, así que el año y la zona climática no salen de una
 * simulación: el año lo da Catastro con la geometría y la zona la deriva
 * `ceeDirectoService` del municipio cada vez que se toca la dirección.
 *
 * Tampoco hay `instalacion`: la caldera que hay y el equipo que se pone los
 * teclea el certificador en la pestaña de Instalaciones, que es donde ya se
 * podían teclear (`equipoConAjustes`). La ficha lo dice en vez de callárselo.
 */
async function cargarCeeDirecto(clave) {
    const fila = await ceeDirectoService.cargar(clave);
    if (!fila) return null;
    const { ceeDirectoComoExpediente } = await loadCeeDirecto();
    const expediente = ceeDirectoComoExpediente(fila);
    return {
        expediente,
        cliente: fila.cliente || null,
        certificador: fila.certificador || null,
        driveFolderId: fila.drive_folder_id || null,
        // El catálogo de aerotermia se consulta por el `aerotermia_db_id` que
        // sella la instalación del expediente, y aquí no hay instalación: el
        // equipo, si lo hay, se teclea. Sin ids que buscar, nada que traer.
        modelos: {},
    };
}

/**
 * La fila de la OPORTUNIDAD, solo con lo que la envolvente necesita.
 *
 * ⚠ `datos_calculo` entero puede llevar el HTML de las propuestas enviadas
 * (hasta 1,35 MB): se proyecta por JSON path, como el listado (regla 22), y se
 * devuelve con la misma forma anidada. `clave` es el uuid o el `id_oportunidad`.
 */
async function filaOportunidad(clave) {
    const { data, error } = await supabase.from('oportunidades')
        .select('id, id_oportunidad, ref_catastral, cliente_id, prescriptor_id, ficha, '
              + 'inputs:datos_calculo->inputs, zona:datos_calculo->zona, '
              + 'anio:datos_calculo->anio, provincia:datos_calculo->provincia, '
              + 'ccaa:datos_calculo->ccaa, estado:datos_calculo->>estado, '
              + 'drive_folder_id:datos_calculo->>drive_folder_id, '
              + 'drive_folder_link:datos_calculo->>drive_folder_link, '
              + 'envolvente_cee:datos_calculo->envolvente_cee')
        .eq(esUuid(clave) ? 'id' : 'id_oportunidad', clave)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const { inputs, zona, anio, provincia, ccaa, estado, drive_folder_id,
            drive_folder_link, envolvente_cee, ...resto } = data;
    return {
        ...resto,
        datos_calculo: {
            inputs: inputs || {}, estado,
            ...(zona != null ? { zona } : {}), ...(anio != null ? { anio } : {}),
            ...(provincia != null ? { provincia } : {}), ...(ccaa != null ? { ccaa } : {}),
            drive_folder_id, drive_folder_link,
            envolvente_cee: envolvente_cee || {},
        },
    };
}

/** El expediente que ya nació de esta oportunidad, si lo hay (solo su id). */
async function expedienteDeOportunidad(oportunidadId) {
    if (!oportunidadId) return null;
    const { data } = await supabase.from('expedientes')
        .select('id, numero_expediente').eq('oportunidad_id', oportunidadId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return data || null;
}

/**
 * Lo que la ventana necesita para abrir una oportunidad: la fila, el cliente y
 * —si ya se aceptó— el expediente al que hay que ir. Desde que existe el
 * expediente, el trabajo vive allí y seguir escribiendo en la oportunidad sería
 * tener dos envolventes del mismo edificio.
 */
async function datosOportunidad(clave) {
    const fila = await filaOportunidad(clave);
    if (!fila) return null;
    const exp = await expedienteDeOportunidad(fila.id);
    let cliente = null;
    if (fila.cliente_id) {
        const { data } = await supabase.from('clientes').select('*')
            .eq('id_cliente', fila.cliente_id).maybeSingle();
        cliente = data || null;
    }
    return { oportunidad: fila, cliente, expediente: exp };
}

/**
 * Una OPORTUNIDAD, con la forma de un expediente.
 *
 * Aquí todavía no hay certificador asignado (no hay técnico que escribir en el
 * `.cex`) y la carpeta de Drive es la de la oportunidad — que es la MISMA que
 * tendrá el expediente: al aceptar se mueve, no se copia. Así las fotos y las
 * imágenes que se suban ahora siguen en su sitio después.
 */
async function cargarOportunidad(clave) {
    const d = await datosOportunidad(clave);
    if (!d) return null;
    if (d.expediente) {
        throw Object.assign(new Error(
            `Esta oportunidad ya es el expediente ${d.expediente.numero_expediente}: `
            + 'la envolvente se sigue desde allí.'), { status: 409, expediente: d.expediente });
    }
    const { oportunidadComoExpediente } = await loadOportunidad();
    const expediente = oportunidadComoExpediente(d.oportunidad, { cliente: d.cliente });
    const modelos = await modelosDeAerotermia(expediente);
    // La calculadora guarda solo el ID del modelo: la marca y el modelo salen
    // del catálogo — como hará el expediente al nacer.
    for (const k of ['aerotermia_cal', 'aerotermia_acs']) {
        const u = expediente.instalacion[k];
        const m = u?.aerotermia_db_id && modelos[u.aerotermia_db_id];
        if (m && !u.marca) {
            u.marca = m.marca || '';
            u.modelo = m.modelo_comercial || m.modelo_conjunto || m.modelo_ud_exterior || '';
        }
    }
    return {
        expediente,
        cliente: d.cliente,
        certificador: null,
        driveFolderId: d.oportunidad.datos_calculo.drive_folder_id || null,
        modelos,
    };
}

/**
 * Los modelos de aerotermia del CATÁLOGO que usa este expediente.
 *
 * ⚠️ Sin esto, la ficha decía que faltaba el SEER de equipos que SÍ lo tienen.
 * El expediente sella del modelo lo que entra en el ahorro —los SCOP— pero el
 * SEER se queda en el catálogo, así que preguntándole solo al expediente no
 * aparece nunca: medido en 26RES060_187 con una BAXI IRIDIUM 12, que tiene SEER
 * 3,66 en la tabla y salía como «falta el SEER» en las medidas de mejora.
 *
 * Es lo mismo que hace el popup «Datos del equipo (CE3X)» del módulo CEE, que
 * carga el catálogo en el navegador; aquí la ficha se compone en el backend y
 * tiene que cargarlo él.
 */
async function modelosDeAerotermia(expediente) {
    const ids = [...new Set(getUnidades(expediente?.instalacion?.aerotermia_cal)
        .concat(getUnidades(expediente?.instalacion?.aerotermia_acs))
        .map(u => u?.aerotermia_db_id).filter(Boolean))];
    if (!ids.length) return {};
    const { data, error } = await supabase.from('aerotermia').select('*').in('id', ids);
    if (error || !data) {
        // Que no se pueda leer el catálogo NO puede tumbar la generación: lo
        // peor que pasa es que la ficha pida un dato que ya estaba.
        console.warn('[ceeEnvolvente] catálogo de aerotermia:', error?.message);
        return {};
    }
    return Object.fromEntries(data.map(m => [m.id, m]));
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
async function construccionesElegidas(clave, origen = 'cae') {
    // En una OPORTUNIDAD, lo marcado en su propia ficha técnica.
    if (origenNorm(origen) === 'op') {
        const { data } = await supabase.from('oportunidades')
            .select('elegidas:datos_calculo->inputs->construcciones_elegidas')
            .eq(esUuid(clave) ? 'id' : 'id_oportunidad', clave)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        const lista = data?.elegidas;
        return Array.isArray(lista) && lista.length ? lista : null;
    }
    // En un CEE directo no hay oportunidad —no hay ficha técnica que marcar—,
    // así que lo elegido vive en el propio encargo. Es la misma lista y la mira
    // el mismo motor; lo único que cambia es dónde está escrita.
    if (String(origen).toLowerCase() === 'cee') {
        const { data } = await supabase.from('cee_directos')
            .select('cee')
            .eq(esUuid(clave) ? 'id' : 'numero_expediente', clave).maybeSingle();
        const lista = data?.cee?.[CAMPO_CONSTRUCCIONES];
        return Array.isArray(lista) && lista.length ? lista : null;
    }
    const { data } = await supabase
        .from('expedientes').select('oportunidades(datos_calculo)')
        .eq(esUuid(clave) ? 'id' : 'numero_expediente', clave).maybeSingle();
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
async function guardarConstrucciones(clave, elegidas, desglose, origen = 'cae') {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    const codigosDe = (l) => [...new Set((l || []).map(c => String(c).trim()).filter(Boolean))];
    const listaDe = (d, codigos) => (d || []).map(c => ({
        codigo: c.codigo, uso: c.uso ?? null, planta: c.planta ?? null,
        superficie: Number(c.superficie) || 0,
        cuenta: codigos.includes(c.codigo),
    }));

    // En un CEE directo lo elegido se escribe en el propio encargo: no hay
    // oportunidad, y por tanto tampoco las cifras de una propuesta firmada a las
    // que esto no puede tocar. Queda anotado en su historial por el mismo
    // motivo: cambia la superficie que mide el certificado.
    if (String(origen).toLowerCase() === 'cee') {
        const fila = await ceeDirectoService.cargar(clave, { conRelaciones: false });
        if (!fila) throw alto('Ese encargo de CEE no existe.', 404);
        const codigos = codigosDe(elegidas);
        const lista = listaDe(desglose, codigos);
        await setCeeField({ id: fila.id, es_cee_directo: true },
                          CAMPO_CONSTRUCCIONES, codigos);
        await setCeeField({ id: fila.id, es_cee_directo: true },
                          `${CAMPO_CONSTRUCCIONES}_detalle`, lista);
        const cuentan = lista.filter(c => c.cuenta);
        try {
            await ceeDirectoService.anotarHistorial(fila.id, {
                usuario: 'Sistema', accion: 'CONSTRUCCIONES QUE CUENTAN',
                detalle: `Cuentan ${cuentan.length} de ${lista.length} construcciones `
                       + `(${Math.round(cuentan.reduce((s, c) => s + c.superficie, 0))} m²).`,
            });
        } catch (e) { console.warn('[ceeEnvolvente] historial construcciones:', e.message); }
        return { elegidas: codigos, construcciones: lista };
    }

    // ⚠ `oportunidades` NO tiene columna `historial`: vive DENTRO de
    // `datos_calculo`. Pedirla aquí hacía fallar la consulta ENTERA y la app
    // decía «este expediente no tiene oportunidad detrás» de uno que sí la
    // tiene (mismo gotcha que `prescriptores.telefono`). La escribe la RPC.
    // En una OPORTUNIDAD es ella misma: se lee con la misma forma para que el
    // resto no tenga que enterarse.
    const { data, error: errLeer } = origenNorm(origen) === 'op'
        ? await supabase.from('oportunidades')
            .select('numero_expediente:id_oportunidad, oportunidad_id:id')
            .eq(esUuid ? 'id' : 'id_oportunidad', clave)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
        : await supabase
            .from('expedientes')
            .select('numero_expediente, oportunidad_id')
            .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (errLeer) throw new Error(errLeer.message);
    if (!data?.oportunidad_id) {
        throw Object.assign(
            new Error('Este expediente no tiene oportunidad detras: no hay donde '
                      + 'guardar que construcciones cuentan.'), { status: 409 });
    }

    const codigos = codigosDe(elegidas);
    const lista = listaDe(desglose, codigos);

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

// ─────────────────────────────────────────────────────────────────────────────
// Corregir el TITULAR y el TÉCNICO sin salir de la ventana
//
// Los administrativos SIGUEN sin teclearse en la ficha: lo que se escribe aquí
// va a la FUENTE —`clientes` y `prescriptores`—, no a una copia dentro del
// trabajo. Esa es toda la diferencia con los ajustes de «Datos generales», que
// solo valen para este `.cex`: el titular no puede estar en dos sitios y que
// gane el que se guarde el último.
//
// Sale de usarlo: con el plano medio hecho se ve que al cliente le falta el
// teléfono, y cerrar la pestaña para ir a su ficha —y volver a encontrar el
// sitio— es el camino que nadie recorre.
// ─────────────────────────────────────────────────────────────────────────────

//: Los campos del CLIENTE que se pueden corregir desde aquí: EXACTAMENTE los
//: que CE3X pide en «Datos del cliente», ni uno más. El formulario de la vista
//: (`PanelesFicha.CAMPOS_CLIENTE`) tiene que decir lo mismo — lo que no esté en
//: esta lista no se guarda, y desde el navegador no se ve por qué.
//:
//: El `dni` NO está: el bloque del cliente de CE3X no tiene NIF, y del NIF del
//: expediente cuelgan el Anexo I y el convenio que ya puede haber firmado.
const CAMPOS_CLIENTE = ['nombre_razon_social', 'apellidos', 'direccion', 'municipio',
                        'provincia', 'codigo_postal', 'tlf', 'email'];

//: Y los once del TÉCNICO, que son los de su ficha de Prescriptores. Se escribe
//: en `*_responsable` y no en `tlf`/`email` a propósito: aquéllos son los de la
//: PERSONA que firma —que es lo que CE3X pide— y éstos, los generales de la
//: empresa, por los que además le escribe media app.
//: La EMPRESA va aparte de la razón social: en un certificador `razon_social` es
//: el nombre de la persona (así están 6 de los 7) y la sociedad en la que ejerce
//: ocupa su propia casilla del .cex.
const CAMPOS_TECNICO = ['nombre_responsable', 'apellidos_responsable', 'nif_responsable',
                        'razon_social', 'cif', 'empresa_razon_social', 'empresa_cif',
                        'direccion', 'municipio', 'provincia',
                        'codigo_postal', 'tlf_responsable', 'email_responsable',
                        'titulacion', 'colegio_profesional', 'numero_colegiado'];

/** Solo lo que está en la lista; vacío es `null`, no la cadena vacía. */
function soloCampos(campos, lista) {
    const out = {};
    for (const k of lista) {
        if (!campos || !(k in campos)) continue;
        const v = campos[k];
        out[k] = typeof v === 'string' ? (v.trim() || null) : (v ?? null);
    }
    return out;
}

/** Lo que el formulario edita: las columnas en CRUDO, no la ficha compuesta. */
function fuenteEditable(ctx) {
    const coge = (fila, lista) => Object.fromEntries(
        lista.map(k => [k, fila?.[k] ?? null]));
    return {
        cliente: ctx?.cliente ? coge(ctx.cliente, CAMPOS_CLIENTE) : null,
        tecnico: ctx?.certificador ? coge(ctx.certificador, CAMPOS_TECNICO) : null,
    };
}

//: `cee` lleva dentro el XML del certificado (megas): de ahí solo se pide el id
//: del certificador (regla 22). El resto es una fila corta y da igual.
async function expedienteBasico(clave, columnas, origen = 'cae') {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(clave));
    if (origenNorm(origen) === 'op') {
        // Una oportunidad no tiene `numero_expediente` ni certificador: se leen
        // su id y su cliente, con los nombres que espera quien llama.
        const { data, error } = await supabase.from('oportunidades')
            .select('id, numero_expediente:id_oportunidad, cliente_id')
            .eq(esUuid ? 'id' : 'id_oportunidad', clave)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (error) throw new Error(error.message);
        return data || null;
    }
    const tabla = String(origen).toLowerCase() === 'cee' ? 'cee_directos' : 'expedientes';
    const { data, error } = await supabase.from(tabla).select(columnas)
        .eq(esUuid ? 'id' : 'numero_expediente', clave).maybeSingle();
    if (error) throw new Error(error.message);
    return data || null;
}

const alto = (msg, status) => Object.assign(new Error(msg), { status });

/**
 * Escribe en la ficha del CLIENTE. Quién puede, lo decide la ruta.
 *
 * Pasa por `normalizeData` igual que el formulario de Clientes: si no, el mismo
 * dato quedaría en MAYÚSCULAS escrito desde una pantalla y en minúsculas desde
 * la otra, y `provinciaCe3x` —que es un desplegable de CE3X— dejaría de casar.
 */
async function guardarCliente(clave, campos, origen = 'cae') {
    const exp = await expedienteBasico(clave, 'id, numero_expediente, cliente_id', origen);
    if (!exp) throw alto('Expediente no encontrado.', 404);
    if (!exp.cliente_id) {
        throw alto('Este expediente no tiene cliente vinculado: no hay ficha donde '
                   + 'escribir. Vincúlalo desde el expediente.', 409);
    }
    const patch = normalizeData(soloCampos(campos, CAMPOS_CLIENTE));
    if (!Object.keys(patch).length) throw alto('No hay nada que guardar.', 400);

    const { data, error } = await supabase.from('clientes')
        .update(patch).eq('id_cliente', exp.cliente_id)
        .select(CAMPOS_CLIENTE.join(', ')).maybeSingle();
    if (error) throw new Error(error.message);
    return { cliente: data, campos: Object.keys(patch) };
}

/**
 * Escribe en la ficha del TÉCNICO (su fila de `prescriptores`).
 *
 * `soloSuyo` es el `id_empresa` de quien pregunta cuando NO es del equipo
 * interno: un certificador corrige sus once campos y nada más. Se comprueba
 * contra el certificador ASIGNADO al expediente, que es el único cuyo nombre va
 * a salir en este `.cex`.
 */
async function guardarTecnico(clave, campos, { soloSuyo = null, origen = 'cae' } = {}) {
    if (origenNorm(origen) === 'op') {
        throw alto('Una oportunidad todavía no tiene técnico certificador: se le asigna '
                   + 'en el módulo CEE cuando sea expediente.', 409);
    }
    const exp = await expedienteBasico(
        clave, 'id, numero_expediente, certificador_id:cee->>certificador_id', origen);
    if (!exp) throw alto('Expediente no encontrado.', 404);
    const certId = exp.certificador_id || null;
    if (!certId) {
        throw alto('Este expediente no tiene certificador asignado: asígnalo en el '
                   + 'módulo CEE y entonces se podrán corregir sus datos.', 409);
    }
    if (soloSuyo !== null && String(soloSuyo) !== String(certId)) {
        throw alto('Solo puedes corregir TUS datos de técnico certificador.', 403);
    }
    const patch = normalizeData(soloCampos(campos, CAMPOS_TECNICO));
    if (!Object.keys(patch).length) throw alto('No hay nada que guardar.', 400);

    const { data, error } = await supabase.from('prescriptores')
        .update(patch).eq('id_empresa', certId)
        .select(CAMPOS_TECNICO.join(', ')).maybeSingle();
    if (error) throw new Error(error.message);
    return { tecnico: data, campos: Object.keys(patch) };
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
        certificador: ctx.certificador, modelos: ctx.modelos,
        geo: { geometria }, envolvente, ajustes, imagenes, fase, medidas,
    });
    // El CATÁLOGO viaja aparte de la ficha: es lo que la pestaña de medidas
    // pinta para que se elijan, y no es un dato que vaya dentro del `.cex`.
    // Y la FUENTE en crudo: es lo que edita el formulario de administrativos.
    // La ficha trae los valores COMPUESTOS (el nombre con los apellidos, la
    // provincia pasada por el desplegable de CE3X) y sobre eso no se puede
    // escribir: lo que se corrige son las columnas de `clientes` y
    // `prescriptores`. Viaja FUERA de `ficha`, que es lo que se le manda al
    // motor.
    //
    // `imagenesFallidas`: las que NO van en el fichero porque Catastro no ha
    // respondido (no porque no las tenga). Viaja aparte de los avisos porque
    // el popup de «generado» lo tiene que decir en grande: enterrado en la
    // lista de avisos, el .cex de 26RES093_9 salió sin croquis y nadie lo vio.
    return { ficha, catalogo, faltan, fuente: fuenteEditable(ctx),
             avisos: [...avisos, ...imagenes.avisos],
             imagenesFallidas: Object.keys(imagenes.fallos || {}) };
}

//: Las dos imágenes del pickle 2 del `.cex`: la foto de fachada y el croquis de
//: parcela. Las mismas que ya rescata la app para la ficha catastral
//: (`catastroService.getFacadeImage` / `getParcelImage`), así que aquí no hay
//: ningún cliente nuevo contra Catastro — se reutiliza el que ya respeta el WAF.
//:
//: Se cachean por RC mientras viva el proceso: la foto de fachada de un
//: inmueble no cambia, y regenerar el .cex tres veces no puede costar nueve
//: peticiones.
//:
//: ⚠️ Pero solo se cachea una RESPUESTA de Catastro —la imagen, o que no la
//: tiene—, NUNCA un fallo de conexión. Se cacheaba el resultado entero pasara
//: lo que pasara, y un `ECONNRESET` pasajero del WAF dejaba el expediente sin
//: fachada ni croquis para toda la vida del proceso: ni reabrir la ventana ni
//: «Refrescar» volvían a preguntar. Medido en 26RES093_9 (25/09/2026): la
//: envolvente se quedó con «Catastro no la tiene» mientras la ficha de la
//: oportunidad, quince minutos después, traía las dos sin problema.
const _imagenes = new Map();   // rc -> { fachada?: {grande, vista} | false, croquis?: {grande} | false }

//: Las pausas ANTES de cada reintento tras un corte de conexión: tres intentos
//: en total, en serie y cada vez más espaciados. El WAF del Catastro corta a
//: ratos las peticiones del VPS (medido el 25/09/2026: 1 de cada 8 con la
//: conexión nueva, y el croquis de 26RES093_9 falló dos veces seguidas en la
//: generación). Más intentos sería insistirle al WAF del que depende el
//: buscador de la app.
const PAUSAS_REINTENTO_MS = [2000, 5000];

/**
 * REGLA — al Catastro NUNCA en ráfaga: las dos van EN SERIE y con pausa, y si
 * el monitor está en modo bloqueado no se pide ninguna. Al otro lado está el
 * mismo WAF del que depende el buscador en producción.
 *
 * REGLA — que falte una imagen NO impide generar. Muchos inmuebles no tienen
 * foto de fachada registrada y el `.cex` es igual de válido sin ella: se dice
 * en los avisos y el certificador la pone en CE3X si la tiene.
 *
 * REGLA — «Catastro no la tiene» y «Catastro no ha respondido» NO son lo
 * mismo, y se dicen distinto (`fallos`): uno es definitivo y el otro se arregla
 * pulsando Refrescar —o volviendo a generar— un rato después.
 */
async function imagenesDeCatastro(rc) {
    if (!rc) return { avisos: ['Sin referencia catastral: el .cex sale sin foto ni croquis.'] };

    const guardado = { ...(_imagenes.get(rc) || {}) };
    const salida = { avisos: [], fallos: {} };
    const falta = cual => guardado[cual] === undefined;

    if ((falta('fachada') || falta('croquis')) && catastroMonitor.shouldSkipRequest()) {
        // No se pide nada, y tampoco se cachea: es una situación pasajera.
        if (falta('fachada')) salida.fallos.fachada = true;
        if (falta('croquis')) salida.fallos.croquis = true;
        salida.avisos.push('Catastro está limitando peticiones ahora mismo: la foto de fachada '
                           + 'y el croquis no se han podido pedir. Pulsa «Refrescar» más tarde.');
    } else {
        let pedidas = 0;
        if (falta('fachada')) {
            const r = await pedirImagen(o => catastroService.getFacadeImage(rc, o));
            pedidas++;
            if (r !== undefined) guardado.fachada = r || false;
        }
        if (falta('croquis')) {
            if (pedidas) await sleep(800);   // en serie y espaciadas, nunca las dos a la vez
            const r = await pedirImagen(o => catastroService.getParcelImage(rc, o));
            if (r !== undefined) guardado.croquis = r || false;
        }
        _imagenes.set(rc, guardado);
    }

    const fachada = guardado.fachada;
    if (fachada) {
        salida.foto_edificio = fachada.grande;
        // La misma foto en 640×480 (58 KB en vez de 322), para ENSEÑARLA: la
        // pantalla la pinta en un recuadro de 300×170 y esperar 431 KB de base64
        // para eso es lo que hacía que tardara en aparecer. Al `.cex` va la
        // grande, que es lo verificado contra un fichero real.
        salida.foto_edificio_vista = fachada.vista;
    } else if (fachada === false) {
        salida.avisos.push('Catastro no tiene la foto de fachada de esta referencia: '
                           + 'el .cex sale sin ella (se puede poner en CE3X).');
    } else if (!salida.fallos.fachada) {
        salida.fallos.fachada = true;
        salida.avisos.push('Catastro no ha respondido al pedirle la foto de fachada (corte de '
                           + 'conexión). No es que no la tenga: pulsa «Refrescar» en un rato.');
    }

    const croquis = guardado.croquis;
    if (croquis) salida.plano_situacion = croquis.grande;
    else if (croquis === false) {
        salida.avisos.push('Catastro no tiene el croquis de parcela de esta referencia: '
                           + 'el .cex sale sin plano de situación.');
    } else if (!salida.fallos.croquis) {
        salida.fallos.croquis = true;
        salida.avisos.push('Catastro no ha respondido al pedirle el croquis de parcela (corte de '
                           + 'conexión). No es que no lo tenga: pulsa «Refrescar» en un rato.');
    }
    return salida;
}

/**
 * El motor escribe la imagen desde base64 (`imagen()` en generar_cex.py).
 *
 * Devuelve la grande —la que va al fichero— y, si el original trae una
 * miniatura dentro, también esa: es la que se enseña.
 *
 * Tres respuestas, y no dos: la imagen · `null` (Catastro ha contestado que no
 * la tiene) · `undefined` (Catastro NO ha contestado — un corte de conexión,
 * tras los reintentos). Solo las dos primeras se pueden cachear.
 */
async function pedirImagen(traer) {
    for (let intento = 0; intento <= PAUSAS_REINTENTO_MS.length; intento++) {
        if (intento) await sleep(PAUSAS_REINTENTO_MS[intento - 1]);
        try {
            const img = await traer({ conFallos: true });
            const bytes = img?.data;
            if (!bytes) return null;
            const grande = Buffer.from(bytes).toString('base64');
            return { grande,
                     vista: img.miniatura ? Buffer.from(img.miniatura).toString('base64')
                                          : grande };
        } catch (e) {
            console.warn(`[ceeEnvolventeCex] imagen de Catastro (intento ${intento + 1}):`, e.message);
        }
    }
    return undefined;
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
    return `${num} - ${sufijoCex(expediente, fase)}.cex`;
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
    const dondeCae = esCeeDirecto(expediente)
        ? ceeDirectoUploadService.sectionLabel(expediente, f.seccion)
        : f.carpeta;
    try {
        // El enlace de la CARPETA, no solo el del fichero: es el que se le
        // comparte al certificador al encargarle el CEE, y es donde va a
        // buscarlo. `ensureCeeSectionFolder` ya la deja pública de lectura.
        const { id: carpeta, link: carpetaLink } = await carpetaFase(ctx, fase);
        if (!carpeta) throw new Error('no se ha podido resolver la carpeta de la fase');
        const nombre = nombreDelCex(expediente, fase);

        const previo = await driveService.findFileByName(carpeta, nombre);
        let archivado = null;
        if (previo) archivado = await driveService.archiveExistingToOld(carpeta, previo, nombre);

        const guardado = await driveService.saveFileToFolder(
            carpeta, nombre, 'application/octet-stream', buffer, { throwOnError: true });
        if (!guardado?.id) throw new Error('Drive no ha devuelto el fichero');

        return { ok: true, nombre, link: guardado.link, driveId: guardado.id,
                 carpeta: dondeCae,
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
    const carpeta = await carpetaFase(ctx, fase);
    if (!carpeta?.id) return null;
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

//: Qué construcciones del Catastro cuentan, en un CEE DIRECTO. En el CAE eso
//: vive en la oportunidad —es donde una persona lo marcó en la ficha técnica y
//: de donde salió la superficie que se presupuestó—; aquí no hay oportunidad,
//: así que lo elegido es del propio encargo.
const CAMPO_CONSTRUCCIONES = 'construcciones_elegidas';

/** Lo guardado, o `null` si este expediente no tiene nada todavía. */
async function leerTrabajo(id, origen = 'cae') {
    if (origenNorm(origen) === 'op') {
        const { data } = await supabase.from('oportunidades')
            .select('trabajo:datos_calculo->envolvente_cee->envolvente')
            .eq(esUuid(id) ? 'id' : 'id_oportunidad', id)
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
        return data?.trabajo || null;
    }
    const tabla = String(origen).toLowerCase() === 'cee' ? 'cee_directos' : 'expedientes';
    const { data } = await supabase.from(tabla)
        .select('cee').eq('id', id).maybeSingle();
    return data?.cee?.[CAMPO_TRABAJO] || null;
}

/**
 * Guarda el trabajo. REEMPLAZA la clave entera, no funde: si el certificador
 * quita un hueco, un merge lo dejaría puesto. Escribe solo esa clave, así que
 * no puede pisar `cee.cee_inicial` ni el seguimiento.
 */
async function guardarTrabajo(id, trabajo, origen = 'cae') {
    const o = origenNorm(origen);
    // La RPC de la oportunidad va por uuid: si llega el `id_oportunidad`, se
    // resuelve. Y una oportunidad YA aceptada no se escribe: su trabajo vive en
    // el expediente, y seguir aquí dejaría dos envolventes del mismo edificio.
    if (o === 'op') {
        const fila = await filaOportunidad(id);
        if (!fila) throw alto('Esa oportunidad no existe.', 404);
        const exp = await expedienteDeOportunidad(fila.id);
        if (exp) {
            throw alto(`Esta oportunidad ya es el expediente ${exp.numero_expediente}: `
                       + 'la envolvente se sigue desde allí.', 409);
        }
        id = fila.id;
    }
    await setCeeField({ id, es_cee_directo: o === 'cee', es_oportunidad: o === 'op' },
                      CAMPO_TRABAJO,
                      { ...trabajo, guardado_at: new Date().toISOString() });
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
            if (salida.fallos) delete salida.fallos[cual];
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

    //: ⚠ Aquí se le pasaba el EXPEDIENTE a `ensureCeeSectionFolder`, que espera
    //: el id de la carpeta de Drive: la imagen acababa en cualquier sitio o no
    //: se subía. Va por `carpetaFase`, que además resuelve la del CEE directo.
    const { id: carpeta } = await carpetaFase(ctx, 'inicial');
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
    await escribirImagenes(ctx.expediente, puestas);
    return puestas[cual];
}

/** Volver a la de Catastro. El fichero se queda en Drive: no se tira nada. */
async function quitarImagen(ctx, cual) {
    if (!IMAGENES[cual]) {
        throw Object.assign(new Error(`No sé qué imagen es «${cual}».`), { status: 400 });
    }
    const puestas = { ...(ctx.expediente.cee?.[CAMPO_IMAGENES] || {}) };
    delete puestas[cual];
    await escribirImagenes(ctx.expediente, puestas);
    return true;
}

async function escribirImagenes(expediente, puestas) {
    await setCeeField(expediente, CAMPO_IMAGENES, puestas);
}

module.exports = {
    esCeeDirecto,
    esOportunidad,
    origenNorm,
    datosOportunidad,
    setCeeField,
    carpetaFase,
    sufijoCex,
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
    guardarCliente,
    guardarTecnico,
    cartografia,
    SUFIJO_REVISAR,
    loadFichaCe3x,
    cargarExpediente,
    componerFicha,
    nombreDelCex,
    leerCexDeFase,
    guardarEnDrive,
};
