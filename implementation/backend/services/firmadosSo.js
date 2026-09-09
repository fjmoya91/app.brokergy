// ─────────────────────────────────────────────────────────────────────────────
// LOS FIRMADOS QUE DEVUELVE EL SUJETO OBLIGADO — se sueltan todos y la app los
// coloca.
//
// El S.O. firma el Anexo I y las cinco fichas con su certificado y los devuelve
// por email **con el mismo nombre con el que se los mandamos**. Hasta ahora había
// que abrir cada PDF para ver de qué expediente era, comprobar a ojo que llevaba
// firma, renombrarlo a mano y subirlo a su slot: seis veces por lote.
//
// Aquí se sueltan los seis de una vez y la app hace lo que se hacía a mano:
//   1. LEE las firmas del propio PDF (utils/firmasPdf.js — sin llamar a nadie);
//   2. IDENTIFICA a qué documento del lote corresponde cada fichero;
//   3. lo REGISTRA como firmado por el camino de siempre (`guardarDocFirmado`),
//      que ya lo renombra con `_fdo` y lo archiva donde toca.
//
// El nombre del paquete (`E3-3-1 - 25RES060_90 - Ficha RES060_fdo`) NO se pone
// aquí: lo pone `envioGestorService` al armar el ZIP, que es su fuente única. Lo
// que hace falta para que salga es justo esto — que la entrada del documento tenga
// su `signed_link`.
//
// REGLA — la firma se COMPRUEBA, la identidad se AVISA. Un PDF sin firma
// electrónica no es un firmado y no se registra: es el único caso que bloquea
// solo. Que el certificado no sea del representante que consta en la ficha del
// S.O. **no** bloquea —puede haber cambiado de apoderado, o firmar el
// administrador solidario— pero se dice quién firma de verdad y se pide
// confirmación. Nunca se traga en silencio.
//
// REGLA — no se adivina de quién es un fichero. Si el nombre no lleva el nº de
// expediente ni identifica al Anexo I, se devuelve SIN asignar para que lo diga
// una persona (`asignar`). Colocar la ficha del vecino en un expediente es un
// requerimiento tres semanas después.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('./supabaseClient');
const { leerFirmasPdf, firmanteCoincide } = require('../utils/firmasPdf');
const {
    esFirmablePorSo, guardarDocFirmado, sincronizarEstadoLote,
} = require('./loteDocs');

const nowIso = () => new Date().toISOString();

// Solo letras y dígitos: el nombre del fichero llega con guiones, espacios,
// "(1)", "_signed" y lo que le añada el gestor de correo de cada uno.
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// ¿Está el número de expediente DENTRO del nombre? Se exige que lo que sigue no
// sea un dígito: sin eso, "26RES060_10" casa dentro de "26RES060_105" y la ficha
// se registra en el expediente del vecino. Mismo cuidado que `normNum` al leer
// los informes de verificación.
function contieneNumero(nombreNorm, numero) {
    const n = norm(numero);
    if (!n) return false;
    let i = nombreNorm.indexOf(n);
    while (i >= 0) {
        const siguiente = nombreNorm[i + n.length];
        if (!siguiente || !/[0-9]/.test(siguiente)) return true;
        i = nombreNorm.indexOf(n, i + 1);
    }
    return false;
}

/**
 * ¿De qué documento del lote es este fichero?
 *
 * Por orden de fiabilidad:
 *   · el nº de expediente en el nombre  → su ficha (es único e inequívoco);
 *   · el nombre con el que se envió     → ese documento;
 *   · "ANEXO I" / "LISTADO" o el código del lote → el Anexo I del lote;
 *   · "SOLICITUD"                       → la solicitud de verificación.
 * Si encajan varios, no se elige: se devuelve ambiguo.
 */
function identificar(nombreFichero, candidatos, expNumPorId, codigoLote) {
    const n = norm(nombreFichero);
    const hits = new Set();

    for (const d of candidatos) {
        if (d.expediente_id && contieneNumero(n, expNumPorId[d.expediente_id])) hits.add(d.key);
        const base = norm(String(d.file_name || '').replace(/\.pdf$/i, ''));
        if (base && base.length > 8 && n.includes(base)) hits.add(d.key);
    }
    if (hits.size === 1) return { key: [...hits][0] };
    if (hits.size > 1) return { key: null, motivo: `el nombre encaja con ${hits.size} documentos` };

    const anexo = candidatos.find(d => d.key === 'anexo_i');
    if (anexo && (n.includes('ANEXOI') || n.includes('LISTADO') || (codigoLote && n.includes(norm(codigoLote))))) {
        return { key: 'anexo_i' };
    }
    const sol = candidatos.find(d => d.key === 'solicitud_verificacion');
    if (sol && n.includes('SOLICITUD')) return { key: 'solicitud_verificacion' };

    return { key: null, motivo: 'el nombre no dice de qué documento es' };
}

// Quién tiene que firmar cada documento. El Anexo I lo firman los DOS: el S.O. y
// Brokergy (que ya lo firma antes de enviarlo, ver AnexoListadoModal).
function firmantesEsperados(docKey, repSo, cesionario) {
    const out = [];
    if (repSo && (repSo.nombre || repSo.nif)) out.push({ ...repSo, rol: 'Sujeto Obligado' });
    if (docKey === 'anexo_i' && cesionario) out.push({ ...cesionario, rol: 'Brokergy' });
    return out;
}

// El representante legal del S.O., tal como consta en su ficha.
function representanteDe(so) {
    if (!so) return null;
    if (so.representante_distinto) {
        return {
            nombre: [so.representante_nombre, so.representante_apellidos].filter(Boolean).join(' ').trim(),
            nif: so.representante_dni || null,
        };
    }
    return {
        nombre: [so.nombre_responsable, so.apellidos_responsable].filter(Boolean).join(' ').trim(),
        nif: so.nif_responsable || null,
    };
}

// Quién firma por Brokergy sale del MISMO sitio que lo imprime el Convenio de
// Cesión (`docGenerators.FIRMANTE_CESIONARIO`), cargado por import() ESM como el
// resto de la lógica compartida. Si el import falla no se bloquea nada: se deja
// de comprobar esa firma y se dice.
async function firmanteCesionario() {
    try {
        // `pathToFileURL` es obligatorio: un import() con ruta relativa de Windows
        // falla desde CommonJS. Mismo patrón que `cifoService` con `cifoDoc.js`.
        const { pathToFileURL } = require('url');
        const path = require('path');
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/utils/docGenerators.js')).href;
        const mod = await import(url);
        return mod.FIRMANTE_CESIONARIO || null;
    } catch (e) {
        console.warn('[firmadosSo] no se pudo leer el firmante de Brokergy:', e.message);
        return null;
    }
}

/**
 * Analiza —y registra— los firmados que devuelve el S.O.
 *
 * @param {string} loteId
 * @param {Array<{ nombre: string, buffer: Buffer }>} ficheros
 * @param {object} opts
 *   - `asignar`  { [nombreFichero]: docKey }  lo que ha decidido una persona para
 *                los que la app no ha sabido identificar.
 *   - `forzar`   string[]  nombres de fichero que se registran a pesar de los
 *                avisos (firma de otra persona, o reemplazo de un firmado previo).
 *   - `dryRun`   solo analiza: no escribe en Drive ni en la base de datos.
 * @returns informe por fichero + lo que queda pendiente de firmar
 */
async function procesarFirmados(loteId, ficheros, opts = {}) {
    const { asignar = {}, forzar = [], dryRun = false, usuario = 'SISTEMA' } = opts;
    if (!Array.isArray(ficheros) || !ficheros.length) throw new Error('No se ha recibido ningún fichero');

    const { data: lote, error } = await supabase.from('lotes').select('*').eq('id', loteId).maybeSingle();
    if (error) throw error;
    if (!lote) throw new Error('Lote no encontrado');

    // Dos listas, y la diferencia importa:
    //   · `candidatos`     — todo lo firmable del lote. Es donde se busca cuando el
    //     destino lo dice una PERSONA (el botón "Subir firmado" de una fila, o el
    //     desplegable): ahí no hay nada que adivinar.
    //   · `identificables` — solo lo que ya se le mandó. Es contra lo que se
    //     empareja por el nombre del fichero: un documento que no ha salido no
    //     puede volver firmado, y ofrecerlo como destino automático invitaría a
    //     colocar ahí un fichero que es de otra cosa.
    const firmables = (Array.isArray(lote.documentos_so) ? lote.documentos_so : [])
        .filter(esFirmablePorSo);
    const candidatos = firmables;
    const identificables = firmables.filter(d => d.sent_at || d.signed_link);

    const { data: exps } = await supabase.from('expedientes')
        .select('id, numero_expediente').eq('lote_id', lote.id);
    const expNumPorId = Object.fromEntries((exps || []).map(e => [e.id, e.numero_expediente]));

    const { data: so } = lote.sujeto_obligado_id
        ? await supabase.from('prescriptores')
            .select('razon_social, cif, nombre_responsable, apellidos_responsable, nif_responsable, representante_distinto, representante_nombre, representante_apellidos, representante_dni')
            .eq('id_empresa', lote.sujeto_obligado_id).maybeSingle()
        : { data: null };
    const repSo = representanteDe(so);
    const cesionario = await firmanteCesionario();

    const forzarSet = new Set(forzar.map(String));
    let docsActuales = Array.isArray(lote.documentos_so) ? [...lote.documentos_so] : [];
    const resultados = [];
    const historial = Array.isArray(lote.historial) ? [...lote.historial] : [];
    const usados = new Set();

    for (const f of ficheros) {
        const res = {
            fichero: f.nombre,
            bytes: f.buffer?.length || 0,
            doc: null, etiqueta: null, expediente: null,
            firmas: [], avisos: [], estado: null, registrado: false,
        };

        // 1) ¿Lleva firma electrónica? Es lo único que bloquea por sí solo.
        const firmas = leerFirmasPdf(f.buffer);
        res.firmas = firmas.firmantes;
        res.avisos.push(...firmas.avisos);
        if (!firmas.esPdf) {
            res.estado = 'no_pdf';
            res.avisos.push('No es un PDF.');
            resultados.push(res);
            continue;
        }
        if (!firmas.firmada) {
            res.estado = 'sin_firma';
            res.avisos.push('El PDF no lleva firma electrónica: no puede registrarse como firmado.');
            resultados.push(res);
            continue;
        }

        // 2) ¿De qué documento es?
        const elegido = asignar[f.nombre]
            ? { key: asignar[f.nombre] }
            : identificar(f.nombre, identificables, expNumPorId, lote.codigo);
        const doc = elegido.key ? candidatos.find(d => d.key === elegido.key) : null;
        if (!doc) {
            res.estado = 'sin_identificar';
            res.avisos.push(elegido.motivo || 'No se ha podido identificar el documento.');
            resultados.push(res);
            continue;
        }
        res.doc = doc.key;
        res.etiqueta = doc.label || doc.file_name;
        // Con qué nombre va a quedar guardado, ANTES de registrarlo: es la mitad
        // de lo que se revisa en esa pantalla ("¿le va a poner el _fdo y va a la
        // carpeta que toca?"). Lo pone `guardarDocFirmado`; aquí solo se anticipa.
        res.nombre_guardado = `${String(doc.file_name || doc.label || doc.key).replace(/\.pdf$/i, '')}_fdo.pdf`;
        res.expediente = doc.expediente_id ? expNumPorId[doc.expediente_id] || null : null;

        if (usados.has(doc.key)) {
            res.estado = 'duplicado';
            res.avisos.push(`Ya se ha colocado otro fichero en "${res.etiqueta}".`);
            resultados.push(res);
            continue;
        }

        // 3) ¿Firman quienes tienen que firmar?
        const esperados = firmantesEsperados(doc.key, repSo, cesionario);
        res.esperados = esperados.map(e => ({ nombre: e.nombre, nif: e.nif, rol: e.rol }));
        // Quién FALTA va en estructura, no solo dentro de la frase del aviso: es lo
        // que le permite a la pantalla ofrecer "fírmalo tú ahora" cuando la que
        // falta es la de Brokergy. Leer eso de un texto en castellano se rompe la
        // primera vez que alguien mejore la redacción.
        res.faltan = [];
        for (const e of esperados) {
            const hit = firmas.firmantes.map(x => firmanteCoincide(x, e)).find(x => x.coincide);
            if (!hit) {
                const quien = firmas.firmantes.map(x => x.nombre || x.cn).filter(Boolean).join(', ') || 'nadie reconocible';
                res.avisos.push(`No consta la firma de ${e.nombre || e.nif} (${e.rol}); firma ${quien}.`);
                res.faltan.push({ nombre: e.nombre, nif: e.nif, rol: e.rol });
            }
        }
        if (doc.key === 'anexo_i' && firmas.n < 2) {
            res.avisos.push('El Anexo I debe llevar DOS firmas (Sujeto Obligado y Brokergy) y solo trae una.');
        }
        if (doc.signed_link) {
            res.avisos.push('Este documento ya tenía un firmado registrado: al aplicarlo se reemplaza.');
        }

        res.estado = res.avisos.length ? 'revisar' : 'listo';
        usados.add(doc.key);

        // 4) Registrar. Se aplica lo LIMPIO y, de lo que tiene avisos, solo lo que
        //    una persona haya marcado: el camino es `guardarDocFirmado`, el mismo
        //    que la firma en cadena y la subida a mano.
        const aplicar = !dryRun && (res.estado === 'listo' || forzarSet.has(f.nombre));
        if (aplicar) {
            try {
                const r = await guardarDocFirmado({ ...lote, documentos_so: docsActuales }, doc.key, f.buffer);
                docsActuales = r.docsSo;
                res.registrado = true;
                res.enlace = r.entry?.signed_link || null;
                historial.push({
                    id: `${Date.now()}_fdo_${doc.key}`, tipo: 'sistema',
                    texto: `Registrado firmado de "${res.etiqueta}" desde "${f.nombre}"`
                        + ` · firma${firmas.n > 1 ? 's' : ''}: ${firmas.firmantes.map(x => x.nombre || x.cn || '¿?').join(' + ')}`,
                    fecha: nowIso(), usuario,
                });
            } catch (e) {
                res.estado = 'error';
                res.avisos.push(`No se pudo guardar: ${e.message}`);
            }
        }
        resultados.push(res);
    }

    const registrados = resultados.filter(r => r.registrado);
    if (registrados.length) {
        await supabase.from('lotes')
            .update({ documentos_so: docsActuales, historial, updated_at: nowIso() })
            .eq('id', lote.id);
        await sincronizarEstadoLote(lote.id, { docs: docsActuales, usuario, motivo: 'firmados del S.O. registrados' });
    }

    // Lo que sigue faltando, para poder decirlo en la misma pantalla en vez de
    // obligar a cerrar y contar las filas a mano.
    const pendientes = identificables
        .map(d => docsActuales.find(x => x.key === d.key) || d)
        .filter(d => !d.signed_link)
        .map(d => ({
            key: d.key,
            etiqueta: d.label || d.file_name,
            expediente: d.expediente_id ? expNumPorId[d.expediente_id] || null : null,
        }));

    return {
        codigo: lote.codigo,
        dryRun: !!dryRun,
        representante_so: repSo,
        firmante_brokergy: cesionario ? { nombre: cesionario.nombre, nif: cesionario.nif } : null,
        resultados,
        registrados: registrados.length,
        pendientes,
        destinos: identificables.map(d => ({
            key: d.key,
            etiqueta: d.label || d.file_name,
            expediente: d.expediente_id ? expNumPorId[d.expediente_id] || null : null,
            firmado: !!(docsActuales.find(x => x.key === d.key) || d).signed_link,
        })),
    };
}

module.exports = {
    procesarFirmados,
    // Exportados para las pruebas
    identificar,
    contieneNumero,
    representanteDe,
};
