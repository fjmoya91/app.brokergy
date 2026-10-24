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
// (sufijoCex de un CEE directo único) y `{nº} - CEE INICIAL_CROQUIS.pdf`.
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

/** Elige, de lo que hay en «1. CEE», el PDF, el .cex, el XML y el croquis. */
function elegirFicheros(lista, numero) {
    const num = String(numero || '').toUpperCase();
    const puntua = (f) => {
        const n = String(f.name || '').toUpperCase();
        return (n.startsWith(num) ? 4 : 0) + (n.includes('_REVISAR') ? 2 : 0) + (/_OLD\d*\./.test(n) ? -10 : 0);
    };
    const mejor = (filtro) => lista.filter(filtro).sort((a, b) => puntua(b) - puntua(a))[0] || null;
    const ext = (f, e) => new RegExp(`\\.${e}$`, 'i').test(f.name || '');
    return {
        cex: mejor(f => ext(f, 'cex')),
        xml: mejor(f => ext(f, 'xml')),
        pdf: mejor(f => ext(f, 'pdf') && !/CROQUIS/i.test(f.name)),
        croquis: mejor(f => ext(f, 'pdf') && /CROQUIS/i.test(f.name)),
    };
}

/**
 * Los enlaces de la obra: descargas firmadas (12 h) de lo que hay en «1. CEE»,
 * la carpeta de Drive y la envolvente.
 * @returns {Promise<{ pdf, cex, xml, croquis, carpeta, envolvente, ficheros }>}
 */
async function enlaces(obra, { admin = false } = {}) {
    const out = { pdf: null, cex: null, xml: null, croquis: null, carpeta: obra.drive_folder_link || null, envolvente: enlaceEnvolvente(obra), ficheros: {} };
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

    const p = {
        titulo: `Tu certificado ${obra.numero_expediente} está listo`,
        saludo: cuenta.nombre ? `Hola ${cuenta.nombre}:` : 'Hola:',
        parrafos: [
            `Ya tienes el certificado de ${[obra.direccion, obra.municipio].filter(Boolean).join(', ') || obra.numero_expediente}: el PDF, el .cex, el XML y el croquis.`,
            'Revísalo con calma. Si quieres cambiar algo, hazlo en la envolvente y valídalo allí: se vuelve a generar. Lo que cambies a mano en el .cex con CE3X no vuelve a la envolvente.',
            compartida.ok ? 'También lo tienes en tu carpeta de Google Drive, compartida con este email.' : '',
        ],
        boton: { href: enlaceObra(obra), label: 'Ver el certificado' },
    };
    const aviso = await avisos.avisarCertificador(cuenta, {
        asunto: `${p.titulo} — ${nombreApp()}`,
        html: avisos.plantilla({ ...p, preheader: p.parrafos[0] }),
        texto: avisos.textoPlano(p),
        whatsapp: `✅ Tu certificado ${obra.numero_expediente} está listo (${[obra.direccion, obra.municipio].filter(Boolean).join(', ')}). Lo tienes aquí: ${enlaceObra(obra)}`,
    });
    return { obra: lista, enlaces: enl, compartida, aviso };
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
            await avisos.avisarEquipo({
                asunto: `${obra.numero_expediente} — certificado listo para revisar y entregar`,
                cuerpo: `📦 ${obra.numero_expediente}: la IA ha dejado el certificado en «1. CEE». Revísalo y pulsa «Entregar»: ${require('./ia').enlaceAdmin(obra)}`,
                soloWhatsapp: true,
            });
        }
        return { auto: false };
    } catch (e) {
        console.warn(`[certapp entrega] al terminar la IA (${obraId}):`, e.message);
        return { auto: true, ok: false, error: e.message };
    }
}

module.exports = { entregar, alTerminarIa, enlaces, elegirFicheros, enlaceEnvolvente, enlaceObra };
