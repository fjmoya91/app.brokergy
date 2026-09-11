// ─────────────────────────────────────────────────────────────────────────────
// EL CONTRATO firmado con un CERTIFICADOR — dónde vive y cuándo está completo.
//
// Es el acuerdo marco con cada técnico certificador. Vive en SU FICHA
// (`prescriptores.contrato_link`), como el Convenio CAE del Sujeto Obligado, y
// el fichero se guarda en la carpeta que ya existe fuera de la app:
//   Mi unidad / 01. RD 36-2023 (CAES) / 01. COMERCIAL / 01. CONTRATOS Y ACUERDOS
//   / 04. CERTIFICADORES / {NN. NOMBRE}
//
// REGLA — el contrato no se guarda en la carpeta de un expediente ni de un lote.
// Ahí lo movería o lo borraría cualquiera que ordene esa carpeta. Va donde el
// equipo ya los guarda: cada certificador tiene la suya, y su id se SELLA en la
// ficha (`contrato_carpeta_id`) la primera vez. Sellarlo, y no buscar la carpeta
// por nombre en cada subida, es lo que hace que sobreviva a una errata o a un
// renombrado — la de Raquel Moncayo se llama hoy "02. RAQUEL MONTOYA".
//
// REGLA — NO se pone en verde hasta que consten las DOS firmas: la del
// certificador y la de Brokergy. Un contrato a medio firmar no obliga a nadie, y
// un semáforo que se pone verde al subir el fichero convierte "lo tenemos" en
// "lo hemos recibido", que no es lo mismo. Cómo se acredita cada firma:
//   · FIRMA ELECTRÓNICA — se lee del propio PDF (`utils/firmasPdf`), gratis y sin
//     modelo de IA. Es PRUEBA: se detecta sola y no se puede desmarcar.
//   · A MANO — un contrato impreso, firmado y escaneado no lleva nada dentro que
//     leer. Lo confirma una PERSONA, marcando quién ha firmado, y queda sellado
//     con su nombre y la fecha. Es una declaración, no una comprobación, y por
//     eso se distingue de la anterior en la ficha.
// Esto NO valida la firma (cadena de confianza, revocación): eso es de Autofirma
// y del validador del Ministerio. Lo que se afirma es qué firmas declara el PDF.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const { leerFirmasPdf, firmanteCoincide } = require('../utils/firmasPdf');

// Carpeta "04. CERTIFICADORES". Id por variable de entorno con el valor real de
// respaldo, mismo criterio que `catalogoFichas`: es una carpeta estable, y
// resolverla por nombre en cada subida son cuatro consultas más a Drive.
const CARPETA_CONTRATOS = process.env.DRIVE_CONTRATOS_CERTIFICADORES_ID || '1rJlzfMy7w2LP0Ae1eO7F2-ywgVR1GdJj';

const limpio = (s) => String(s || '').replace(/[\\/<>:"|?*]/g, '_').trim();

const norm = (s) => String(s || '')
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();

/** Nombre de la persona/empresa, para nombrar carpeta y fichero. */
function nombreDe(pres) {
    return limpio(pres?.razon_social
        || [pres?.nombre_responsable, pres?.apellidos_responsable].filter(Boolean).join(' ')
        || pres?.acronimo || 'CERTIFICADOR').toUpperCase();
}

/**
 * La subcarpeta del certificador dentro de "04. CERTIFICADORES".
 *
 * Se usa la SELLADA si la hay. Si no, se busca entre las existentes por palabras
 * del nombre (ignorando el prefijo "NN. ") y, como último recurso, se crea. El
 * id encontrado se sella para que la próxima vez no dependa del nombre.
 */
async function carpetaDeCertificador(pres) {
    if (pres?.contrato_carpeta_id) return pres.contrato_carpeta_id;

    const nombre = nombreDe(pres);
    const palabras = norm(nombre).split(' ').filter(p => p.length >= 3);

    let id = null;
    try {
        const hijos = await driveService.listFiles(CARPETA_CONTRATOS);
        const carpetas = (hijos || []).filter(h => h.mimeType === 'application/vnd.google-apps.folder');
        // Se acepta la carpeta que comparta MÁS palabras con el nombre, siempre que
        // comparta al menos una. Con menos que eso no se está reconociendo a nadie:
        // se crea la suya, que es preferible a dejar su contrato en la de otro.
        let mejor = 0;
        for (const c of carpetas) {
            const suyas = norm(c.name).split(' ').filter(p => p.length >= 3);
            const comunes = palabras.filter(p => suyas.includes(p)).length;
            if (comunes > mejor) { mejor = comunes; id = c.id; }
        }
        if (!mejor) id = null;
    } catch (e) {
        console.warn('[contratoCertificador] no se pudo listar la carpeta de contratos:', e.message);
    }

    if (!id) {
        id = await driveService.getOrCreateSubfolder(CARPETA_CONTRATOS, nombre);
        if (!id || id === CARPETA_CONTRATOS) {
            throw new Error('No se pudo preparar la carpeta del certificador en Drive');
        }
    }

    try {
        await supabase.from('prescriptores').update({ contrato_carpeta_id: id }).eq('id_empresa', pres.id_empresa);
    } catch (_) { /* el sello es una comodidad, no bloquea la subida */ }
    return id;
}

/** Nombre canónico del fichero: se reconoce sin abrirlo y no depende de quién lo suba. */
function nombreContrato(pres) {
    return `CONTRATO CERTIFICADOR - ${nombreDe(pres)}.pdf`;
}

/** El técnico que firma por el certificador, tal como consta en su ficha. */
function firmanteCertificador(pres) {
    if (!pres) return null;
    if (pres.representante_distinto) {
        return {
            nombre: [pres.representante_nombre, pres.representante_apellidos].filter(Boolean).join(' ').trim(),
            nif: pres.representante_dni || null,
        };
    }
    return {
        nombre: [pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ').trim()
            || pres.razon_social || '',
        // En un AUTÓNOMO el NIF de la persona es el `cif` de la ficha: no hay otro.
        nif: pres.nif_responsable || (pres.es_autonomo ? pres.cif : null) || null,
    };
}

// Quién firma por Brokergy sale del MISMO sitio que lo imprime el Convenio de
// Cesión (`docGenerators.FIRMANTE_CESIONARIO`), por import() ESM. Si falla no se
// bloquea nada: se deja de comprobar esa firma y se dice.
async function firmanteBrokergy() {
    try {
        const { pathToFileURL } = require('url');
        const path = require('path');
        const url = pathToFileURL(path.join(__dirname, '../../frontend/src/features/expedientes/utils/docGenerators.js')).href;
        const mod = await import(url);
        return mod.FIRMANTE_CESIONARIO || null;
    } catch (e) {
        console.warn('[contratoCertificador] no se pudo leer el firmante de Brokergy:', e.message);
        return null;
    }
}

/**
 * Qué firmas declara el PDF y de quién son.
 *
 * @returns {Promise<{ n, firmantes, detectado: {certificador, brokergy}, avisos }>}
 */
async function analizarFirmas(buffer, pres) {
    const vacio = { n: 0, firmantes: [], detectado: { certificador: false, brokergy: false }, avisos: [] };
    if (!buffer || !buffer.length) return vacio;

    const firmas = leerFirmasPdf(buffer);
    const out = {
        n: firmas.n || 0,
        firmantes: (firmas.firmantes || []).map(f => ({
            nombre: f.nombre || f.cn || null, nif: f.nif || null,
            organizacion: f.organizacion || null, fecha: f.fecha || null,
        })),
        detectado: { certificador: false, brokergy: false },
        avisos: [...(firmas.avisos || [])],
    };

    if (!firmas.firmada) {
        out.avisos.push('El PDF no lleva firma electrónica. Si está firmado a mano, confírmalo abajo.');
        return out;
    }

    const cert = firmanteCertificador(pres);
    if (cert && (cert.nombre || cert.nif)) {
        out.detectado.certificador = (firmas.firmantes || []).some(f => firmanteCoincide(f, cert).coincide);
    }
    const brok = await firmanteBrokergy();
    if (brok && (brok.nombre || brok.nif)) {
        out.detectado.brokergy = (firmas.firmantes || []).some(f => firmanteCoincide(f, brok).coincide);
    } else {
        out.avisos.push('No se ha podido comprobar la firma de Brokergy.');
    }
    return out;
}

/**
 * Estado del contrato, tal como lo pinta la ficha. La firma electrónica DETECTADA
 * manda sobre la confirmación manual: es prueba, y por eso no se puede desmarcar.
 */
function componerFirmas(previo, analisis, manual) {
    const ant = previo || {};
    const det = analisis ? analisis.detectado : (ant.detectado || { certificador: false, brokergy: false });
    const man = { ...(ant.manual || {}), ...(manual || {}) };

    return {
        n: analisis ? analisis.n : (ant.n || 0),
        firmantes: analisis ? analisis.firmantes : (ant.firmantes || []),
        avisos: analisis ? analisis.avisos : (ant.avisos || []),
        detectado: det,
        manual: man,
        certificador: !!(det.certificador || man.certificador),
        brokergy: !!(det.brokergy || man.brokergy),
    };
}

/** ¿Verde? Solo con las dos partes. Fuente única de la regla. */
function contratoCompleto(firmas) {
    return !!(firmas && firmas.certificador && firmas.brokergy);
}

const CAMPOS = 'id_empresa, razon_social, acronimo, es_autonomo, cif, tipo_empresa, '
    + 'nombre_responsable, apellidos_responsable, nif_responsable, '
    + 'representante_distinto, representante_nombre, representante_apellidos, representante_dni, '
    + 'contrato_link, contrato_nombre, contrato_at, contrato_firmas, contrato_carpeta_id';

/**
 * Registra el contrato de un certificador, o actualiza quién consta que lo ha firmado.
 *
 * @param {string} presId `prescriptores.id_empresa`
 * @param {{ buffer?: Buffer, link?: string|null, fileName?: string,
 *           manual?: { certificador?: boolean, brokergy?: boolean }, quien?: string }} origen
 */
async function registrarContrato(presId, origen = {}) {
    const { buffer = null, link = undefined, fileName = null, manual = null, quien = null } = origen;

    const { data: pres } = await supabase.from('prescriptores')
        .select(CAMPOS).eq('id_empresa', presId).maybeSingle();
    if (!pres) throw new Error('No se encontró el certificador');

    // ── Solo se cambia quién ha firmado (confirmación a mano) ────────────────
    if (!buffer && link === undefined && manual) {
        if (!pres.contrato_link) throw new Error('Todavía no hay contrato que confirmar');
        const firmas = componerFirmas(pres.contrato_firmas, null, {
            ...manual,
            confirmado_por: quien || null,
            confirmado_at: new Date().toISOString(),
        });
        return guardar(presId, {
            contrato_link: pres.contrato_link,
            contrato_nombre: pres.contrato_nombre,
            contrato_at: pres.contrato_at,
            contrato_firmas: firmas,
        });
    }

    let contrato_link = null;
    let contrato_nombre = null;
    let firmas = null;
    let nombreEnDrive = null;

    if (buffer) {
        if (buffer.length < 5 || buffer[0] !== 0x25 || buffer[1] !== 0x50) {
            throw new Error('El contrato debe ser un PDF');
        }
        // Se leen las firmas ANTES de subir: si el fichero no es lo que se cree,
        // se dice con el fichero todavía en la mano.
        firmas = componerFirmas(null, await analizarFirmas(buffer, pres), null);

        const carpeta = await carpetaDeCertificador(pres);
        nombreEnDrive = nombreContrato(pres);
        // El contrato nuevo REEMPLAZA al anterior — el vigente es uno solo — y el
        // anterior se ARCHIVA en OLD, nunca se borra: es un documento contractual.
        try {
            const previos = await driveService.findFilesByName(carpeta, nombreEnDrive);
            for (const p of (previos || [])) await driveService.archiveExistingToOld(carpeta, p, nombreEnDrive);
        } catch (_) { /* no bloqueante */ }

        const saved = await driveService.saveFileToFolder(carpeta, nombreEnDrive, 'application/pdf', buffer);
        if (!saved) throw new Error('No se pudo guardar el contrato en Drive');
        contrato_link = saved.link || (saved.id ? `https://drive.google.com/file/d/${saved.id}/view` : null);
        contrato_nombre = fileName || nombreEnDrive;
    } else if (typeof link === 'string') {
        const l = link.trim();
        if (l && !/drive\.google\.com|docs\.google\.com/.test(l)) {
            throw new Error('El enlace debe ser de Google Drive');
        }
        contrato_link = l || null;
        contrato_nombre = l ? (fileName || 'Contrato del certificador') : null;
        // Apuntando un enlace no hay fichero que leer: las firmas se confirman a
        // mano. Quitar el contrato (link vacío) borra también lo que constaba
        // firmado — si no, la ficha seguiría en verde sin documento debajo.
        firmas = l ? componerFirmas(pres.contrato_firmas, null, null) : null;
    } else {
        throw new Error('Falta el PDF del contrato o su enlace de Drive');
    }

    const out = await guardar(presId, {
        contrato_link, contrato_nombre,
        contrato_at: contrato_link ? new Date().toISOString() : null,
        contrato_firmas: firmas,
    });
    return { ...out, nombre_en_drive: nombreEnDrive };
}

async function guardar(presId, campos) {
    const { data, error } = await supabase.from('prescriptores')
        .update(campos).eq('id_empresa', presId)
        .select('id_empresa, razon_social, contrato_link, contrato_nombre, contrato_at, contrato_firmas, contrato_carpeta_id')
        .single();
    if (error) throw error;
    return { ...data, completo: contratoCompleto(data.contrato_firmas) };
}

module.exports = {
    CARPETA_CONTRATOS,
    registrarContrato,
    contratoCompleto,
    analizarFirmas,
    firmanteCertificador,
    nombreContrato,
    carpetaDeCertificador,
};
