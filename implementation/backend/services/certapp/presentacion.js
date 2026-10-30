// ─── certapp/presentacion.js — presentar el CEE en el Registro (CLM) ─────────
// Lo pidió Fran (28/10/2026): «que haya un botón para presentar el certificado y
// que genere un borrador con los datos de la presentación, de momento de
// Castilla-La Mancha, como el borrador que tenemos… que se suba el justificante de
// presentación y la etiqueta, drag and drop… se guardará en la misma carpeta… y un
// apartado de otros para la tasa, la resolución… para tener toda la documentación
// centralizada aquí».
//
//   · EL BORRADOR es el MISMO del CRM (`features/expedientes/logic/borradorCee.js`,
//     el que usa borradorCeeService): la guía de relleno del procedimiento 020264 de
//     la JCCM. Lo que cambia es de dónde salen los datos (`certificadores/logic/
//     presentar.js`, compartido con la demo): el titular, de la obra; el 02
//     (Representante), de SU perfil (es él quien firma y presenta); el 05 y el 06,
//     del XML cargado. Aquí se cruzan los cuatro ficheros con «1. CEE». Fuera de
//     CLM no hay borrador (`aplica: false`), como en el CRM.
//   · LO QUE DEVUELVE EL REGISTRO va a «1. CEE» de la obra: el JUSTIFICANTE
//     (`{nº} - JUSTIFICANTE DE REGISTRO.pdf`; su fecha se LEE con el mismo lector que
//     el CRM, `registroCeeOcrService.resolverFechaRegistro`, y queda en `cee.registro`)
//     y la ETIQUETA (`{nº} - ETIQUETA ENERGÉTICA.pdf`). Lo anterior con el mismo
//     nombre, a OLD. «Otros» (la tasa, las resoluciones…) va a la subcarpeta OTROS
//     con el nombre que diga el certificador.
//
// REGLA — los nombres NO llevan «CEE»: `entrega.elegirFicheros` toma por certificado
// el PDF más reciente con «CEE» en el nombre, y un justificante subido después se
// haría pasar por el certificado (además se excluyen por nombre, por si acaso).
// REGLA — solo con el certificado entregado (LISTO / VALIDADO), como firmar.
// En un ENCARGO de BROKERGY (services/certapp/crm.js) el justificante y la etiqueta
// van además al expediente del CRM, por la puerta del técnico (subidaCeePublica):
// el justificante lo marca REGISTRADO allí con la fecha leída.
// ─────────────────────────────────────────────────────────────────────────────
const path = require('path');
const { pathToFileURL } = require('url');
const driveService = require('../driveService');
const pdfService = require('../pdfService');
const cex = require('../ceeEnvolventeCex');
const drive = require('./drive');
const docs = require('./docs');
const tipos = require('./tipos');
const documentos = require('./documentos');
const { elegirFicheros } = require('./entrega');
const { fallo, evento } = require('./comun');

const ESTADOS = ['LISTO', 'VALIDADO'];
const MAX_BYTES = 25 * 1024 * 1024;
const MAX_OTROS = 40;
const CLASES = ['justificante', 'etiqueta', 'otros'];
const NOMBRE = {
    justificante: (obra) => `${obra.numero_expediente} - JUSTIFICANTE DE REGISTRO.pdf`,
    etiqueta: (obra, ext) => `${obra.numero_expediente} - ETIQUETA ENERGÉTICA.${ext}`,
};
// Lo que se admite en cada una (detectado por los bytes, no por la extensión).
const ADMITE = {
    justificante: ['pdf'],
    etiqueta: ['pdf', 'jpg', 'png'],
    otros: ['pdf', 'jpg', 'png', 'webp', 'heic'],
};

// La obra → el borrador (certificadores/logic/presentar.js, el mismo que usa la
// demo) y el HTML del PDF (el del CRM).
const RAIZ = path.join(__dirname, '..', '..', '..', 'frontend', 'src');
let _logica = null;
function cargarLogica() {
    if (!_logica) {
        _logica = Promise.all([
            import(pathToFileURL(path.join(RAIZ, 'certificadores', 'logic', 'presentar.js')).href),
            import(pathToFileURL(path.join(RAIZ, 'features', 'expedientes', 'logic', 'borradorCee.js')).href),
        ]).then(([p, b]) => ({ borradorDeObra: p.borradorDeObra, buildBorradorCeeHtml: b.buildBorradorCeeHtml }))
            .catch((e) => { _logica = null; throw e; });
    }
    return _logica;
}

function exigirEntregada(obra) {
    if (!ESTADOS.includes(obra.estado)) throw fallo(409, 'Esto se hace con el certificado ya entregado.', 'ESTADO_NO_ENTREGADO');
}

const limpio = (v) => String(v ?? '').trim();

/** Los cuatro ficheros que se anexan, con lo que HAY en «1. CEE» de la obra. */
async function ficherosDe(obra, b) {
    const pre = b.nif ? `${b.nif}_` : '';
    let lista = [];
    try {
        const carpeta = await drive.carpetaCeeSiExiste(obra);
        if (carpeta) lista = (await drive.listar(carpeta)).filter(x => x.mimeType !== 'application/vnd.google-apps.folder');
    } catch (e) {
        console.warn('[certapp presentar] no se pudo listar «1. CEE»:', e.message);
        return b.ficheros.map(f => ({ ...f, presente: null, url: null }));
    }
    const el = elegirFicheros(lista, obra.numero_expediente);
    const mejoras = lista.find(x => /\.pdf$/i.test(x.name || '') && /MEJORA/i.test(x.name || '')) || null;
    const hit = { pdf: el.firmado, xml: el.xml, cex: el.cex, mejoras };
    return b.ficheros.map(f => {
        const h = hit[f.clave] || null;
        const nombre = h ? tipos.nombreDescarga(h.name) : null;
        return {
            clave: f.clave,
            titulo: f.titulo,
            presente: !!h,
            nombreDrive: nombre || f.titulo,
            nombreRegistro: nombre ? `${pre}${nombre}` : null,
            url: h ? docs.urlFichero(obra.id, h.id) : null,
            // El PDF sin firmar no vale: el Registro pide el firmado.
            nota: f.clave === 'pdf' && !h ? (el.pdf ? 'Está sin firmar: fírmalo antes de presentarlo.' : null) : null,
        };
    });
}

/**
 * El borrador para presentar el certificado de la obra.
 * @returns {Promise<{ borrador: object, html: string|null }>}
 */
async function borrador(obra, cuenta) {
    exigirEntregada(obra);
    const { borradorDeObra, buildBorradorCeeHtml } = await cargarLogica();
    const b = borradorDeObra(obra, cuenta);
    if (!b.aplica) return { borrador: b, html: null };
    b.ficheros = await ficherosDe(obra, b);
    b.registro = documentos.resumenRegistro(obra);
    return { borrador: b, html: buildBorradorCeeHtml(b) };
}

/** El borrador en PDF (null fuera de Castilla-La Mancha). */
async function borradorPdf(obra, cuenta) {
    const { borrador: b, html } = await borrador(obra, cuenta);
    if (!html) return null;
    const buffer = await pdfService.documentoAPdf({ html });
    return { buffer, nombre: `${obra.numero_expediente} - BORRADOR PRESENTACIÓN.pdf`, borrador: b };
}

/** Guarda en `carpeta` con su nombre; lo que hubiera con ese nombre, a OLD. */
async function guardar(carpeta, nombre, mime, buffer) {
    const previo = await driveService.findFileByName(carpeta, nombre);
    if (previo) await driveService.archiveExistingToOld(carpeta, previo, nombre);
    const r = await driveService.saveFileToFolder(carpeta, nombre, mime, buffer, { throwOnError: true });
    return { driveId: r?.id || null, nombre, sustituye: !!previo };
}

/** «resolución de la JCCM.pdf» → «RESOLUCIÓN DE LA JCCM» (sin lo que Drive no admite). */
function nombreOtro(nombre, original) {
    const base = limpio(nombre) || limpio(original).replace(/\.[a-z0-9]{2,5}$/i, '');
    return base.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * Sube lo que devuelve el Registro o un documento más.
 * @param {object} obra
 * @param {object} cuenta
 * @param {'justificante'|'etiqueta'|'otros'} clase
 * @param {{ buffer: Buffer, originalname?: string }} fichero
 * @param {{ nombre?: string }} [o] el nombre de un documento de «Otros»
 */
async function subir(obra, cuenta, clase, fichero, { nombre = '' } = {}) {
    exigirEntregada(obra);
    if (!CLASES.includes(clase)) throw fallo(400, 'No sé dónde va ese documento.', 'CLASE_NO_VALE');
    const buffer = fichero?.buffer;
    if (!Buffer.isBuffer(buffer) || !buffer.length) throw fallo(400, 'No ha llegado ningún archivo.', 'SIN_FICHERO');
    if (buffer.length > MAX_BYTES) throw fallo(413, 'El archivo es demasiado grande (máximo 25 MB).', 'FICHERO_GRANDE');
    const t = tipos.detectar(buffer);
    if (!t || !ADMITE[clase].includes(t.ext)) {
        throw fallo(415, clase === 'justificante' ? 'El justificante tiene que ser el PDF que da la sede.'
            : clase === 'etiqueta' ? 'Sube la etiqueta en PDF (o una foto en JPG o PNG).'
                : 'Sube un PDF o una imagen.', 'TIPO_NO_VALE');
    }
    const carpetaCee = await drive.carpetaCeeSiExiste(obra);
    if (!carpetaCee) throw fallo(409, 'Todavía no hay carpeta del certificado en esta obra.', 'SIN_CEE');

    if (clase === 'otros') {
        const base = nombreOtro(nombre, fichero.originalname);
        if (!base) throw fallo(400, 'Dale un nombre al documento.', 'FALTA_NOMBRE');
        let carpeta;
        try { carpeta = await driveService.getOrCreateSubfolder(carpetaCee, documentos.CARPETA_OTROS); } catch (e) { carpeta = null; }
        // getOrCreateSubfolder devuelve el PADRE si falla: caería en la raíz de «1. CEE».
        if (!carpeta || carpeta === carpetaCee) throw fallo(502, 'Google Drive no responde ahora mismo. Vuelve a intentarlo en un momento.', 'DRIVE_FALLO');
        const hay = ((await drive.listar(carpeta)) || []).filter(x => x.mimeType !== 'application/vnd.google-apps.folder').length;
        if (hay >= MAX_OTROS) throw fallo(409, `Ya hay ${hay} documentos en «Otros». Escríbenos si necesitas guardar más.`, 'OTROS_LLENO');
        const g = await guardar(carpeta, `${obra.numero_expediente} - ${base}.${t.ext}`, t.mime, buffer);
        await evento(obra.id, obra.cuenta_id, 'DOCUMENTO', `El certificador ha subido «${base}»`, 'certificador', { fichero: g.nombre });
        return { ok: true, clase, fichero: g.nombre, sustituye: g.sustituye };
    }

    const g = await guardar(carpetaCee, NOMBRE[clase](obra, t.ext), t.mime, buffer);
    // Un encargo de BROKERGY: al expediente del CRM (el justificante lo marca REGISTRADO allí).
    require('./crm').enviarRegistroAsync(obra, cuenta, { clase, buffer, mime: t.mime });
    if (clase === 'etiqueta') {
        await evento(obra.id, obra.cuenta_id, 'DOCUMENTO', 'El certificador ha subido la etiqueta energética', 'certificador', { fichero: g.nombre });
        return { ok: true, clase, fichero: g.nombre, sustituye: g.sustituye };
    }

    // El justificante: su fecha se LEE (regla 27.c del CRM); si no se puede, la de hoy, y se dice.
    const { resolverFechaRegistro } = require('../registroCeeOcrService');
    const lectura = await resolverFechaRegistro(buffer);
    const sello = {
        at: new Date().toISOString(), fecha: lectura.fecha, origen: lectura.origen,
        numero: lectura.numero_registro || null, fichero: g.nombre, drive_id: g.driveId,
    };
    await cex.setCeeField(cex.expedienteStub('ext', obra.id), 'registro', sello);
    await evento(obra.id, obra.cuenta_id, 'REGISTRO',
        `El certificador ha subido el justificante de registro (${lectura.origen === 'justificante' ? `registrado el ${lectura.fecha}` : 'fecha sin leer'})`,
        'certificador', { fichero: g.nombre, fecha: lectura.fecha, origen: lectura.origen });
    return { ok: true, clase, fichero: g.nombre, sustituye: g.sustituye, registro: documentos.resumenRegistro({ cee: { registro: sello } }), aviso: lectura.aviso || null };
}

module.exports = { borrador, borradorPdf, subir, CLASES };
