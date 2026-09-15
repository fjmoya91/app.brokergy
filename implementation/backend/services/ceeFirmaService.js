// ─── ceeFirmaService.js ──────────────────────────────────────────────────────
// Firmar el CEE y comprobar CON QUÉ FECHA se firmó.
//
// Cuando Brokergy da el visto bueno, al certificador le quedan dos cosas: firmar
// el certificado y presentarlo en el Registro. Las dos se hacían fuera de la app
// —Autofirma en su ordenador, colocando el recuadro a ojo— y de ahí salían los
// dos problemas que esto arregla:
//
//   · La FECHA. A veces se le pide firmar con una fecha concreta (la de emisión
//     del certificado) y se equivoca. Autofirma sella con el reloj del ordenador
//     de quien firma, así que NADIE puede imponerla desde aquí: lo único que
//     cierra el problema es COMPROBARLA al recibir el documento, que es lo que
//     hace `comprobarFirma`.
//   · El SITIO del recuadro. Medido sobre dos certificados reales, la firma está
//     puesta a mano y no cae en el mismo punto. Ver `CEE_SIGN_ANCHOR` en
//     `signBoxes.js` — ahí está el porqué de anclar al texto y no a coordenadas.
//
// Lo que NO hace: no valida la firma (ni el hash, ni la cadena de confianza, ni
// la revocación). Eso es de Autofirma y del validador del Ministerio. Aquí se
// afirma solo lo que el fichero declara — mismo criterio que los firmados del
// Sujeto Obligado (regla 40).

const supabase = require('./supabaseClient');
const driveService = require('./driveService');
const ceeUploadService = require('./ceeUploadService');
const { leerFirmasPdf, firmanteCoincide } = require('../utils/firmasPdf');

const normPhase = (p) => (p === 'final' || p === 'FINAL' ? 'final' : 'inicial');
const faseLabel = (p) => (normPhase(p) === 'final' ? 'CEE FINAL' : 'CEE INICIAL');

/** La fecha con la que el certificado dice haber sido emitido (la del .xml). */
function fechaDelCertificado(exp, phase) {
    const fase = normPhase(phase);
    const cee = exp?.cee || {};
    const iso = cee[`fecha_firma_cee_${fase}`] || cee[`cee_${fase}`]?.fechaFirma || null;
    return /^\d{4}-\d{2}-\d{2}/.test(String(iso || '')) ? String(iso).slice(0, 10) : null;
}

const aEs = (iso) => {
    if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return null;
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
};

/**
 * ¿Con qué fecha y quién ha firmado este PDF, y cuadra con el certificado?
 *
 * REGLA — la fecha AVISA, no bloquea. Hay motivos legítimos para que difiera (se
 * firma al día siguiente de emitir), y dejar un expediente parado por un desfase
 * de un día sería peor que el problema. Lo que no puede pasar es que nadie se
 * entere, que es lo que ocurría hasta ahora.
 *
 * @returns {{firmada, firmantes, fechaFirma, fechaCertificado, coincide, avisos}}
 */
function comprobarFirma(buffer, { exp, phase, certificador } = {}) {
    const lectura = leerFirmasPdf(buffer);
    const esperada = fechaDelCertificado(exp, phase);
    const avisos = [];

    if (!lectura.esPdf) {
        return { esPdf: false, firmada: false, firmantes: [], fechaFirma: null,
                 fechaCertificado: esperada, coincide: null,
                 avisos: ['El fichero no es un PDF.'] };
    }
    if (!lectura.firmada) {
        return { esPdf: true, firmada: false, firmantes: [], fechaFirma: null,
                 fechaCertificado: esperada, coincide: null,
                 avisos: ['El PDF no lleva firma electrónica.'] };
    }

    // La fecha que declara la PRIMERA firma (el certificado lo firma una persona).
    const primera = lectura.firmantes[0] || {};
    const fechaFirma = primera.fecha || null;   // dd/mm/aaaa
    const esperadaEs = aEs(esperada);

    let coincide = null;
    if (fechaFirma && esperadaEs) {
        coincide = fechaFirma === esperadaEs;
        if (!coincide) {
            avisos.push(`La firma es del ${fechaFirma} y el certificado se emitió el ${esperadaEs}. `
                + 'Si el Registro exige que coincidan, hay que volver a firmarlo con la fecha correcta.');
        }
    } else if (!esperadaEs) {
        avisos.push('El expediente no tiene fecha de emisión del certificado, así que no se puede '
            + 'comprobar que la firma lleve la suya.');
    } else if (!fechaFirma) {
        avisos.push('La firma no declara su fecha: compruébala en Autofirma.');
    }

    // Quién firma. No bloquea —un certificador puede firmar con el certificado de
    // su empresa, como hace Brokergy— pero se dice cuando no es quien esperábamos.
    const esperado = [certificador?.nombre_responsable, certificador?.apellidos_responsable]
        .filter(Boolean).join(' ').trim() || certificador?.razon_social || null;
    if (esperado && !lectura.firmantes.some(f => firmanteCoincide(f, esperado))) {
        const quien = lectura.firmantes.map(f => f.nombre).filter(Boolean).join(', ') || 'otra persona';
        avisos.push(`Lo firma ${quien}, y el certificador asignado es ${esperado}.`);
    }

    return {
        esPdf: true,
        firmada: true,
        firmantes: lectura.firmantes,
        fechaFirma,
        fechaCertificado: esperada,
        coincide,
        avisos: [...avisos, ...(lectura.avisos || [])],
    };
}

/** La carpeta de la fase, sin crearla. */
async function carpetaDeFase(exp, phase) {
    const raiz = await ceeUploadService.resolveDriveFolderId(exp);
    if (!raiz) return null;
    const root = await driveService.findSubfolderByName(raiz, '1. CEE');
    return root ? driveService.findSubfolderByName(root, faseLabel(phase)) : null;
}

/**
 * El estado del Paso 1: qué hay en la casilla del certificado y si está firmado.
 *
 * Los tres casos que se dan de verdad, y por eso se distinguen:
 *   · `firmado`   — ya está: no hay nada que hacer (medido: los 8 expedientes que
 *                   miré al diseñar esto llegaron así).
 *   · `sin_firmar`— está el PDF pero sin firma: se le ofrece firmarlo aquí, con el
 *                   recuadro ya puesto.
 *   · `sin_pdf`   — no hay documento: se le pide que suelte el que generó en CE3X.
 */
async function estadoFirma(expId, phase) {
    const fase = normPhase(phase);
    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, cee, oportunidad_id, cliente_id, documentacion')
        .eq('id', expId).maybeSingle();
    if (!exp) { const e = new Error('Expediente no encontrado'); e.status = 404; throw e; }

    const certId = exp.cee?.certificador_id || null;
    const { data: certificador } = certId
        ? await supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle()
        : { data: null };

    let fichero = null;
    try {
        const carpeta = await carpetaDeFase(exp, fase);
        if (carpeta) {
            const files = await driveService.listFiles(carpeta);
            fichero = files.find(f => f.mimeType !== 'application/vnd.google-apps.folder'
                && ceeUploadService.matchSlot(f.name) === 'pdf') || null;
        }
    } catch (e) {
        console.warn('[cee-firma] no se pudo listar la carpeta:', e.message);
    }

    const base = {
        expedienteId: exp.id,
        numeroExpediente: exp.numero_expediente,
        fase,
        faseLabel: faseLabel(fase),
        fechaCertificado: fechaDelCertificado(exp, fase),
        certificador: certificador ? {
            nombre: [certificador.nombre_responsable, certificador.apellidos_responsable]
                .filter(Boolean).join(' ').trim() || certificador.razon_social || null,
            // El LOGO solo cuando firma Brokergy. En la firma de un técnico externo
            // nuestra marca daría a entender que firma Brokergy, y no es así.
            conLogo: esDeBrokergy(certificador),
        } : null,
    };

    if (!fichero) return { ...base, estado: 'sin_pdf', comprobacion: null, nombre: null };

    const buffer = await driveService.getFileContent(fichero.id);
    const comprobacion = comprobarFirma(buffer, { exp, phase: fase, certificador });
    return {
        ...base,
        estado: comprobacion.firmada ? 'firmado' : 'sin_firmar',
        nombre: fichero.name,
        driveId: fichero.id,
        comprobacion,
    };
}

// Brokergy firma con el certificado de representante de SOLUCIONES SOSTENIBLES
// PARA EFICIENCIA ENERGÉTICA, S.L. Se reconoce por su CIF y no por el nombre del
// técnico: el día que firme otra persona de la casa, su firma seguirá siendo la
// nuestra y seguirá llevando el logo.
const CIF_BROKERGY = 'B19350222';
function esDeBrokergy(cert) {
    const limpio = (v) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    return limpio(cert?.empresa_cif) === CIF_BROKERGY || limpio(cert?.cif) === CIF_BROKERGY;
}

/** El PDF del certificado para firmarlo en el navegador. */
async function pdfParaFirmar(expId, phase) {
    const st = await estadoFirma(expId, phase);
    if (st.estado === 'sin_pdf') {
        const e = new Error('Todavía no hay ningún PDF del certificado en el expediente: súbelo primero.');
        e.status = 404; throw e;
    }
    const buffer = await driveService.getFileContent(st.driveId);
    if (!buffer || !buffer.length) {
        const e = new Error('No se pudo descargar el certificado desde Drive'); e.status = 502; throw e;
    }
    return { pdf: Buffer.from(buffer).toString('base64'), estado: st };
}

/**
 * Guarda el certificado (firmado o no) en la casilla del CEE.
 *
 * Va por `ceeUploadService.uploadCeeFile`, que es el MISMO camino que la rejilla
 * y que el enlace público del técnico: renombra al nombre canónico y versiona a
 * OLD lo que hubiera. Aquí no se inventa ninguna colocación.
 */
async function guardarCertificado(expId, phase, buffer, { mimeType = 'application/pdf' } = {}) {
    const fase = normPhase(phase);
    const { data: exp } = await supabase
        .from('expedientes')
        .select('id, numero_expediente, cee, oportunidad_id')
        .eq('id', expId).maybeSingle();
    if (!exp) { const e = new Error('Expediente no encontrado'); e.status = 404; throw e; }

    const certId = exp.cee?.certificador_id || null;
    const { data: certificador } = certId
        ? await supabase.from('prescriptores').select('*').eq('id_empresa', certId).maybeSingle()
        : { data: null };

    const comprobacion = comprobarFirma(buffer, { exp, phase: fase, certificador });

    const driveFolderId = await ceeUploadService.resolveDriveFolderId(exp);
    if (!driveFolderId) { const e = new Error('El expediente no tiene carpeta de Drive'); e.status = 400; throw e; }

    const subido = await ceeUploadService.uploadCeeFile(
        driveFolderId, fase, exp.numero_expediente, 'pdf', buffer, mimeType
    );

    // La huella de lo comprobado se queda en el expediente: una comprobación que
    // se ve una vez y se pierde al cerrar la pantalla no sirve de nada (mismo
    // criterio que `rite_ocr` y `placas_ocr`). Solo metadatos — regla 21.
    try {
        const cee = { ...(exp.cee || {}) };
        cee[`firma_cee_${fase}`] = {
            at: new Date().toISOString(),
            fecha_firma: comprobacion.fechaFirma,
            fecha_certificado: comprobacion.fechaCertificado,
            coincide: comprobacion.coincide,
            firmantes: (comprobacion.firmantes || []).map(f => ({ nombre: f.nombre, nif: f.nif, fecha: f.fecha })),
            avisos: comprobacion.avisos,
        };
        await supabase.from('expedientes').update({ cee }).eq('id', exp.id);
    } catch (e) {
        console.warn('[cee-firma] no se pudo sellar la comprobación:', e.message);
    }

    return { ...subido, comprobacion };
}

module.exports = {
    comprobarFirma,
    estadoFirma,
    pdfParaFirmar,
    guardarCertificado,
    fechaDelCertificado,
    esDeBrokergy,
    CIF_BROKERGY,
};
