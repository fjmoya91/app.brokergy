// ─── certapp/entrega.js — entregar el CEE al certificador ────────────────────
// Lo pulsa BROKERGY en el admin («Entregar») o, con CERTAPP_ENTREGA_AUTO=true,
// quien deje los ficheros de la IA en «1. CEE» (entregar(obraId, { por })).
//
//   1. Comparte la carpeta de la OBRA con el email del certificador (LECTOR:
//      con escritura podía plantar un .cex en «1. CEE», ver drive.js).
//      REGLA — nunca «cualquiera con el enlace». Si Drive no deja (un email que
//      no es de Google), la entrega sigue: los ficheros se bajan desde la app
//      con enlaces firmados, y se dice.
//   2. Obra LISTO (listo_at, entregado_at) + evento ENTREGA.
//   3. Aviso al certificador (email con la marca y WhatsApp si tiene teléfono),
//      con el enlace a SU obra en la app, no a los ficheros sueltos.
//
// Los ficheros que deja la IA en «1. CEE»: `{nº} - CEE_REVISAR.cex/.xml/.pdf`
// (sufijoCex de un CEE directo único) y `{nº} - CEE INICIAL_CROQUIS.pdf`. Los que
// sube el certificador (certapp/firma.js): `{nº} - CEE_fdo.pdf` (firmado),
// `{nº} - CEE.xml` y `{nº} - CEE.pdf` (lo definitivo hecho en su CE3X).
//
// REGLA — de cada clase manda el MÁS RECIENTE (`modifiedTime`): un XML definitivo
// subido después gana al de la IA, y uno que la IA regenera después gana al
// definitivo. El firmado solo vale si es posterior al PDF: si el PDF se ha
// regenerado, la firma era de otro documento y no se ofrece.
// ─────────────────────────────────────────────────────────────────────────────
const supabase = require('../supabaseClient');
const driveService = require('../driveService');
const drive = require('./drive');
const obras = require('./obras');
const docs = require('./docs');
const avisos = require('./avisos');
const { fallo, errorBd, evento, certappUrl, nombreApp, encendido } = require('./comun');

const enlaceEnvolvente = (obra) => `${certappUrl()}/obra/${obra.id}/envolvente?origen=ext`;
const enlaceObra = (obra) => `${certappUrl()}/obra/${obra.id}`;

/**
 * Elige, de lo que hay en «1. CEE», el PDF, el firmado, el .cex, el XML y el
 * croquis: el más reciente de cada clase (ver la REGLA de arriba); a igual fecha,
 * el que empieza por el número.
 */
function elegirFicheros(lista, numero) {
    const num = String(numero || '').toUpperCase();
    const nombre = f => String(f.name || '').toUpperCase();
    const cuando = f => Date.parse(f.modifiedTime || '') || 0;
    const mejor = (filtro) => lista
        .filter(f => !/_OLD\d*\./.test(nombre(f)) && filtro(f))
        .sort((a, b) => (cuando(b) - cuando(a)) || ((nombre(b).startsWith(num) ? 1 : 0) - (nombre(a).startsWith(num) ? 1 : 0)))[0] || null;
    const ext = (f, e) => new RegExp(`\\.${e}$`, 'i').test(f.name || '');
    const esFirmado = f => /_FDO\.PDF$/.test(nombre(f));
    // El PDF del CERTIFICADO: lleva «CEE» en el nombre (no el croquis ni lo del Catastro).
    const pdf = mejor(f => ext(f, 'pdf') && /CEE/.test(nombre(f)) && !/CROQUIS/.test(nombre(f)) && !esFirmado(f));
    const firmado = mejor(f => ext(f, 'pdf') && esFirmado(f));
    return {
        cex: mejor(f => ext(f, 'cex')),
        xml: mejor(f => ext(f, 'xml')),
        pdf,
        firmado: firmado && (!pdf || cuando(firmado) >= cuando(pdf)) ? firmado : null,
        croquis: mejor(f => ext(f, 'pdf') && /CROQUIS/.test(nombre(f))),
    };
}

/**
 * Los enlaces de la obra: descargas firmadas (12 h) de lo que hay en «1. CEE»,
 * la carpeta de Drive y la envolvente.
 * @returns {Promise<{ pdf, firmado, cex, xml, croquis, carpeta, envolvente, ficheros }>}
 */
async function enlaces(obra, { admin = false } = {}) {
    const out = { pdf: null, firmado: null, cex: null, xml: null, croquis: null, carpeta: obra.drive_folder_link || null, envolvente: enlaceEnvolvente(obra), ficheros: {} };
    try {
        const carpetaCee = await drive.carpetaCeeSiExiste(obra);
        if (carpetaCee) {
            const elegidos = elegirFicheros(await driveService.listFiles(carpetaCee), obra.numero_expediente);
            for (const [k, f] of Object.entries(elegidos)) {
                if (!f) continue;
                out[k] = admin ? f.webViewLink : docs.urlFichero(obra.id, f.id);
                out.ficheros[k] = { driveId: f.id, nombre: f.name };
            }
        }
    } catch (e) { console.warn(`[certapp entrega] enlaces de ${obra.numero_expediente}:`, e.message); }
    return out;
}

/**
 * Entrega la obra al certificador.
 * @param {string} obraId
 * @param {{ por?: string, porDetalle?: string, forzar?: boolean }} opts
 *        `por`: 'BROKERGY' o 'IA' (lo ve el certificador) · `porDetalle`: quién del
 *        equipo (solo el admin) · `forzar`: entregar aunque no haya PDF ni .cex
 */
async function entregar(obraId, { por = 'BROKERGY', porDetalle = null, forzar = false } = {}) {
    const obra = await obras.cargar(obraId);
    if (!obra) throw fallo(404, 'No encuentro esa obra.', 'OBRA_NO_ENCONTRADA');
    if (!['EN_PREPARACION', 'LISTO'].includes(obra.estado)) {
        throw fallo(409, `La obra está ${obra.estado}: solo se entrega una obra en preparación (o se reentrega una lista).`, 'ESTADO_NO_ENTREGABLE');
    }
    const { data: cuenta, error } = await supabase.from('certapp_cuentas').select('*').eq('id', obra.cuenta_id).maybeSingle();
    if (error) throw errorBd(error, 'cuenta de la obra');
    if (!cuenta) throw fallo(409, 'La obra no tiene cuenta.', 'SIN_CUENTA');
    if (!obra.drive_folder_id) {
        const r = await drive.asegurarCarpetaObra(obra, cuenta);
        if (!r.ok) throw fallo(409, 'La obra no tiene carpeta de Drive (¿falta CERTAPP_DRIVE_ROOT_ID?).', 'SIN_CARPETA');
    }

    const enl = await enlaces(obra);
    if (!forzar && !enl.ficheros.pdf && !enl.ficheros.cex) {
        throw fallo(409, 'En «1. CEE» no hay ni el PDF ni el .cex: ¿ha terminado la IA? (Se puede forzar.)', 'SIN_CEE', { enlaces: enl });
    }

    const compartida = await drive.compartirConCertificador(obra, cuenta.email);
    const ahora = new Date().toISOString();
    const lista = await obras.cambiarEstado(obra.id, 'LISTO', { listo_at: obra.listo_at || ahora, entregado_at: ahora });
    await evento(obra.id, cuenta.id, 'ENTREGA',
        compartida.ok ? 'Certificado entregado; carpeta compartida con el certificador'
            : 'Certificado entregado; la carpeta de Drive no se ha podido compartir (los ficheros se bajan desde la app)',
        por === 'IA' ? 'IA' : 'BROKERGY', { compartida: compartida.ok, ficheros: enl.ficheros },
        { porDetalle: porDetalle || (por !== 'IA' && por !== 'BROKERGY' ? por : null),
          notaInterna: compartida.ok ? null : `Drive: ${compartida.error || compartida.motivo}` });

    const donde = [obra.direccion, obra.municipio].filter(Boolean).join(', ');
    const p = {
        titulo: `Tu certificado ${obra.numero_expediente} está listo`,
        saludo: cuenta.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:',
        parrafos: [
            `Ya tienes el certificado de ${donde || obra.numero_expediente}: el PDF, el .cex, el XML y el croquis, para verlos y descargarlos.`,
            compartida.ok ? 'También lo tienes en tu carpeta de Google Drive, compartida con este email.' : '',
        ],
        // Lo que pidió Fran (25/10/2026): que el aviso lleve a la envolvente «por si
        // quiere revisar algo», y que desde la app lo valide y lo firme.
        pasos: [
            ['Revísalo', 'Abre el certificado en la app: el PDF se ve en el navegador y el .cex se descarga.'],
            ['Si quieres cambiar algo, en la envolvente', 'Cámbialo allí y se vuelve a generar. Lo que cambies a mano en el .cex con CE3X no vuelve a la envolvente.'],
            ['Valídalo y fírmalo', 'Desde la app, con tu certificado digital (AutoFirma). Si lo rehaces en tu CE3X, sube allí el XML y el PDF definitivos.'],
        ],
        boton: { href: enlaceObra(obra), label: 'Ver el certificado' },
        boton2: { href: enl.envolvente, label: 'Revisar en la envolvente' },
    };
    const aviso = await avisos.avisarCertificador(cuenta, {
        asunto: `${p.titulo} — ${nombreApp()}`,
        html: avisos.plantilla({ ...p, preheader: p.parrafos[0] }),
        texto: avisos.textoPlano(p),
        // En viñetas y con negritas, como el encargo (Fran, 25/10/2026).
        whatsapp: [
            `✅ *Tu certificado ${obra.numero_expediente} está listo*`,
            ...(donde ? [donde] : []),
            '',
            '• *Revísalo:* el PDF se ve en el navegador y el .cex se descarga.',
            '• *¿Quieres cambiar algo?* Hazlo en la envolvente y se vuelve a generar.',
            '• *Valídalo y fírmalo* desde la app, con tu certificado digital (AutoFirma).',
            '',
            `👉 Ver el certificado: ${enlaceObra(obra)}`,
            `📐 Envolvente: ${enl.envolvente}`,
        ].join('\n'),
    });
    return { obra: lista, enlaces: enl, compartida, aviso };
}

/**
 * El aviso al EQUIPO de que el certificado está calificado y listo para revisar:
 * UNO por WhatsApp (el email con el detalle lo manda `agenteIa.terminarExt`).
 * Lo que pidió Fran (25/10/2026): «ni me han enviado notificación… ni sé en qué
 * carpeta lo puedo ver»: lleva el admin (PDF, .cex, XML y carpeta, que solo ve
 * un ADMIN) y la envolvente. Sin enlaces de Drive: el chat lo pueden leer otros.
 */
function textoListoEquipo(obra, cuenta) {
    const titular = obra.titular || {};
    const cliente = [titular.nombre, titular.apellidos].filter(Boolean).join(' ') || obra.nombre || null;
    const c = obra.cee?.cee_inicial || {};
    const letras = [c.epnrLetra && `consumo ${c.epnrLetra}`, c.emisionesLetra && `emisiones ${c.emisionesLetra}`].filter(Boolean).join(' · ');
    const quien = [cuenta?.nombre, cuenta?.apellidos].filter(Boolean).join(' ') || cuenta?.email || null;
    return [
        `✅ *CEE listo para revisar · ${obra.numero_expediente}*`,
        '',
        ...(cliente ? [`• *Cliente:* ${cliente}`] : []),
        ...(quien ? [`• *Certificador:* ${quien}`] : []),
        ...(letras ? [`• *Calificación:* ${letras}`] : []),
        '',
        `👉 Revísalo y pulsa «Entregar» (PDF, .cex y carpeta): ${require('./ia').enlaceAdmin(obra)}`,
        `📐 Envolvente: ${enlaceEnvolvente(obra)}`,
    ].join('\n');
}

/**
 * Para quien detecte que la IA ha terminado (el .cex en «1. CEE»): con
 * CERTAPP_ENTREGA_AUTO=true entrega sola; si no, avisa al equipo de que hay una
 * obra lista para revisar y entregar. Nunca lanza.
 */
async function alTerminarIa(obraId) {
    try {
        if (encendido('CERTAPP_ENTREGA_AUTO')) return { auto: true, ...(await entregar(obraId, { por: 'IA' })) };
        const obra = await obras.cargar(obraId);
        if (obra) {
            const { data: cuenta } = await supabase.from('certapp_cuentas').select('nombre, apellidos, email').eq('id', obra.cuenta_id).maybeSingle();
            await avisos.avisarEquipo({
                asunto: `${obra.numero_expediente} — certificado listo para revisar y entregar`,
                cuerpo: textoListoEquipo(obra, cuenta),
                soloWhatsapp: true,
            });
        }
        return { auto: false };
    } catch (e) {
        console.warn(`[certapp entrega] al terminar la IA (${obraId}):`, e.message);
        return { auto: true, ok: false, error: e.message };
    }
}

module.exports = { entregar, alTerminarIa, enlaces, elegirFicheros, enlaceEnvolvente, enlaceObra, textoListoEquipo };
