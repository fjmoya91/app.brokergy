// Mensajes al certificador — FUENTE ÚNICA de los textos que salen por email y WhatsApp.
// La usan los popups del frontend (CeeDocumentsGrid, CeeModule) y el backend a través de
// utils/frontendLogic.js, para que nadie vuelva a duplicar plantillas.
//
// MODELO DE DOS EJES
// ------------------
// 1) ESPERA — qué estamos esperando del certificador. Lo deduce el subestado de
//    `seguimiento.cee_inicial` / `cee_final`, NO lo elige el admin a ciegas:
//      · 'emision'  → aún no ha emitido: tiene que visitar, firmar y subir el .cex
//      · 'registro' → ya tiene nuestro visto bueno: tiene que registrar en Industria
//                     y subirnos la etiqueta + el justificante
// 2) TONO — con qué intensidad se lo pedimos: 'status' | 'reminder' | 'urgent'.
//
// Antes solo había un eje (Encargo/Recordatorio/Urgente) y los recordatorios hablaban
// SIEMPRE de "tienes pendiente el CEE", con lo que un aviso enviado en fase de registro
// pedía algo que el técnico ya había hecho.

// "JOSEFINA PEDROCHE ABAD" → "Josefina Pedroche Abad"
export const toTitleCase = (s) => (s || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

// "LUIS ALBERTO LANUZA PELAYO" → "Luis" (solo el nombre de pila, en formato normal)
export const firstNameProper = (s) => {
    const t = (s || '').trim().split(/\s+/)[0] || '';
    return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : '';
};

const carpetaLine = (ceeFolderLink) =>
    ceeFolderLink ? `\n\n📁 Carpeta de documentos del expediente:\n${ceeFolderLink}` : '';

// Dominio de producción del portal. Se fija aquí (no window.location.origin) para que
// el enlace que recibe el certificador sea SIEMPRE el de producción, aunque el admin
// esté trabajando en localhost al pulsar "enviar".
const APP_BASE = 'https://app.brokergy.es';

// Enlace directo al expediente dentro de la app. El deep-link lo consume App.jsx:
// si el certificador no está logueado, tras iniciar sesión se abre el expediente;
// si ya lo está, entra directamente.
//
// ⚠️ El PARÁMETRO cambia según el negocio: `?exp=` es el expediente CAE y `?cee=`
// el CEE contratado suelto. Son DOS TABLAS distintas y el mismo UUID no vale en
// las dos: mandar `?exp=` con el id de un CEE directo le da al técnico un enlace
// que abre la pestaña equivocada y no encuentra nada. Visto en 2026CEE_54.
const expedienteLine = (expedienteId, ctx = {}) =>
    expedienteId ? `\n\n🔗 Abre el expediente directamente en la app:\n${APP_BASE}/?${ctx.deepLink || 'exp'}=${expedienteId}` : '';

// ─── Eje 1: qué esperamos del certificador ───────────────────────────────────
export const CERT_ESPERA = { EMISION: 'emision', REGISTRO: 'registro' };

export const ESPERA_LABELS = {
    emision: 'Emisión del CEE',
    registro: 'Registro en Industria',
};

/**
 * Deriva la espera a partir del subestado de seguimiento de la fase.
 * REVISADO = ya le dimos el visto bueno, lo que falta es que registre.
 * @param {string} subestado valor de seguimiento.cee_inicial | cee_final
 * @returns {'emision'|'registro'}
 */
export function resolveCertEspera(subestado) {
    const s = String(subestado || '').toUpperCase();
    return (s === 'REVISADO' || s === 'REGISTRADO') ? CERT_ESPERA.REGISTRO : CERT_ESPERA.EMISION;
}

// ─── Eje 2: tono ─────────────────────────────────────────────────────────────
export const CERT_TONO_LABELS = {
    status: '¿Cómo va?',
    reminder: 'Recordatorio',
    urgent: 'Urgente',
};

/**
 * Tono sugerido según los días que lleva parado en el subestado actual.
 * Umbrales acordados: a partir de 7 días recordatorio, a partir de 15 urgente.
 * Solo es una SUGERENCIA de preselección: el admin siempre puede cambiarla.
 * @param {number|null} dias
 * @returns {'status'|'reminder'|'urgent'}
 */
export function suggestCertTono(dias) {
    if (dias == null) return 'status';
    if (dias >= 15) return 'urgent';
    if (dias >= 7) return 'reminder';
    return 'status';
}

// "hace 12 días" / "" cuando no sabemos los días (no inventamos antigüedad).
const haceDias = (dias) => (dias != null && dias > 0) ? `hace ${dias} día${dias === 1 ? '' : 's'}` : null;

// Saludo: en urgente sustituye al "¡Hola X!" por el aviso con alarma.
const saludo = (tecnico, tono) => tono === 'urgent'
    ? `🚨*¡Urgente ${tecnico}!* 🚨`
    : `¡Hola ${tecnico}! 👋`;

/**
 * Cuerpo del mensaje al certificador para un par (espera, tono).
 *
 * @param {object}  p
 * @param {'emision'|'registro'} p.espera
 * @param {'status'|'reminder'|'urgent'} p.tono
 * @param {'inicial'|'final'} p.fase
 * @param {string}  p.certName        nombre del certificador (tal cual está en BD)
 * @param {string}  p.clienteNombre
 * @param {string}  p.numExp
 * @param {string}  [p.expedienteId]  para el deep-link ?exp=
 * @param {number|null} [p.dias]      días en el subestado actual (contexto temporal)
 * @returns {string}
 */
export function buildCertMessage({ espera, tono, fase, certName, clienteNombre, numExp, expedienteId, dias = null, ctx = {} }) {
    const tecnico = firstNameProper(certName) || 'técnico';
    const cli = clienteNombre ? ` (${toTitleCase(clienteNombre)})` : '';
    const faseLabel = fase === 'final' ? 'CEE Final' : 'CEE Inicial';
    const hace = haceDias(dias);
    const cab = saludo(tecnico, tono);

    let body;
    if (espera === CERT_ESPERA.REGISTRO) {
        // Ya tiene el visto bueno: lo que falta es registrar en Industria y subirnos
        // la etiqueta + el justificante.
        const desde = hace ? ` ${hace}` : '';
        if (tono === 'urgent') {
            body = `${cab}\n\nTe dimos el visto bueno al ${faseLabel} del expediente ${numExp}${cli}${desde} y todavía no nos consta registrado en Industria.\n\n🚨 Necesitamos el registro con carácter URGENTE: el expediente está bloqueado hasta que nos subas la etiqueta energética y el justificante de registro.\n\n¿Puedes confirmarnos cuándo lo vas a presentar?`;
        } else if (tono === 'reminder') {
            body = `${cab}\n\nTe recordamos que el ${faseLabel} del expediente ${numExp}${cli} tiene nuestro visto bueno${hace ? ` desde ${hace}` : ''} y sigue pendiente de registrar en Industria.\n\nEn cuanto lo presentes, súbenos la etiqueta energética y el justificante de registro para poder continuar con el expediente.\n\n¡Gracias!`;
        } else {
            body = `${cab}\n\n¿Cómo llevas el registro en Industria del ${faseLabel} del expediente ${numExp}${cli}?${hace ? ` Te dimos el visto bueno ${hace}.` : ''}\n\n¿Nos puedes dar una estimación de cuándo lo tendrás presentado? Nos ayuda mucho para la planificación.\n\n¡Gracias!`;
        }
    } else {
        // Todavía no ha emitido: falta visita, firma y subida del .cex.
        const desde = hace ? ` Te lo encargamos ${hace}.` : '';
        if (tono === 'urgent') {
            body = `${cab}\n\nNecesitamos con carácter URGENTE el ${faseLabel} del expediente ${numExp}${cli}.${desde}\n\n🚨 Es importante que lo priorices para poder cumplir con los plazos del programa de ayudas. Quedamos a la espera.`;
        } else if (tono === 'reminder') {
            body = `${cab}\n\nTe recordamos que tienes pendiente el ${faseLabel} del expediente ${numExp}${cli}.${desde}\n\n¿Podrías darnos una estimación de fecha de entrega? Nos ayudaría mucho para la planificación.\n\n¡Gracias!`;
        } else {
            body = `${cab}\n\n¿Cómo va el ${faseLabel} del expediente ${numExp}${cli}?${desde}\n\nSi ya tienes fecha de visita o una estimación de entrega, dínoslo para que podamos planificar el resto del expediente.\n\n¡Gracias!`;
        }
    }
    return body + expedienteLine(expedienteId, ctx);
}

// Mensaje de ENCARGO: la asignación inicial del trabajo al certificador.
//
// En la fase FINAL el encargo lleva además el bloque de instrucciones CE3X
// (`ce3xBlock`, que construye logic/ce3xFinal.js). Desde 2026-08 el CEE final
// lo teclea el certificador, no Brokergy: el aviso genérico "ya puedes
// presentarlo" no le bastaba, necesita los valores exactos del equipo. El
// bloque entra como parámetro para que este módulo siga siendo texto puro y no
// dependa de la instalación del expediente.
export function buildCertEncargoMessage(fase, certName, clienteNombre, numExp, ceeFolderLink, expedienteId, ce3xBlock = '', ctx = {}) {
    const tecnico = firstNameProper(certName) || 'técnico';
    const cli = clienteNombre ? ` (${toTitleCase(clienteNombre)})` : '';
    const bloque = ce3xBlock ? `\n\n${ce3xBlock}` : '';
    // En un CEE contratado suelto no hay obra ni portal del cliente: hablarle de
    // "documentación de obra" o "el portal" es mandarle a buscar algo que no existe.
    const esCae = ctx.cae !== false;
    const body = fase === 'final'
        ? (esCae
            ? `¡Hola ${tecnico}! 👋\n\nYa puedes presentar el CEE Final del expediente ${numExp}${cli}.\n\nToda la documentación de obra (facturas, memorias de instalación y fotos de fin de obra) ya está disponible en la carpeta compartida.${bloque}\n\n¡Gracias!`
            : `¡Hola ${tecnico}! 👋\n\nTe encargamos el CEE Final del expediente ${numExp}${cli}.\n\nTienes la documentación en las carpetas compartidas.${bloque}\n\n¡Gracias!`)
        : (esCae
            ? `¡Hola ${tecnico}! 👋\n\nTe hemos asignado el expediente ${numExp}${cli} para la emisión del CEE Inicial.\n\nTienes toda la documentación del cliente en la carpeta compartida y en el portal.\n\n¡Gracias!`
            : `¡Hola ${tecnico}! 👋\n\nTe encargamos el ${ctx.faseLabel || 'CEE'} del expediente ${numExp}${cli}.\n\nTienes la documentación en las carpetas compartidas.\n\n¡Gracias!`);
    return body + expedienteLine(expedienteId, ctx) + carpetaLine(ceeFolderLink);
}

// Mensaje de VISTO BUENO / luz verde para registrar (popup "Validar").
// `priority` = 'normal' | 'urgent'. En urgente el texto lleva el emoji de alarma 🚨
// y pide expresamente que se priorice el registro en Industria.
export function buildCertApproveMessage(section, certName, clienteNombre, numExp, ceeFolderLink, expedienteId, priority = 'normal', ctx = {}) {
    const tecnico = firstNameProper(certName) || 'técnico';
    const cli = clienteNombre ? ` (${toTitleCase(clienteNombre)})` : '';
    const fase = section === 'final' ? 'CEE Final' : 'CEE Inicial';
    // Los enlaces de DESCARGA (carpeta CEE) y de SUBIDA (popup del CEE registrado)
    // los añade el backend automáticamente al final del mensaje (approve-cee).
    const body = priority === 'urgent'
        ? `🚨*¡Urgente ${tecnico}!* 🚨\n\nHemos revisado el ${fase} del expediente ${numExp}${cli} y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.\n\n🚨 Te pedimos que lo priorices: necesitamos el registro con carácter URGENTE para poder cumplir con los plazos del programa de ayudas.\n\nAbajo tienes el enlace para descargar los archivos y, una vez presentado, para subir el CEE registrado (etiqueta + justificante).\n\n¡Muchas gracias!`
        : `¡Hola ${tecnico}! 👋\n\nHemos revisado el ${fase} del expediente ${numExp}${cli} y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.\n\nAbajo tienes el enlace para descargar los archivos y, una vez presentado, para subir el CEE registrado (etiqueta + justificante).\n\n¡Gracias!`;
    return body + expedienteLine(expedienteId, ctx);
}

/**
 * Compatibilidad con la firma antigua por "template". Se mantiene porque la usan el
 * backend (fallbacks de email/WhatsApp) y los popups que aún no pasan los dos ejes.
 *
 * @param {'standard'|'status'|'reminder'|'urgent'|'approve'} template
 * @param {object} [opts] { espera, dias, priority } — contexto de los dos ejes
 */
export function buildCertDefaultMessage(template, section, certName, clienteNombre, numExp, ceeFolderLink, expedienteId, opts = {}) {
    const fase = section === 'final' ? 'final' : 'inicial';
    // `opts.ctx` = de qué negocio es este expediente: { deepLink, cae, faseLabel }.
    // Sin él manda el CAE, que es el comportamiento de siempre.
    const ctx = opts.ctx || {};
    if (template === 'approve') {
        return buildCertApproveMessage(fase, certName, clienteNombre, numExp, ceeFolderLink, expedienteId, opts.priority || 'normal', ctx);
    }
    if (template === 'standard') {
        return buildCertEncargoMessage(fase, certName, clienteNombre, numExp, ceeFolderLink, expedienteId, opts.ce3xBlock || '', ctx);
    }
    return buildCertMessage({
        espera: opts.espera || CERT_ESPERA.EMISION,
        tono: template === 'urgent' ? 'urgent' : template === 'status' ? 'status' : 'reminder',
        fase, certName, clienteNombre, numExp, expedienteId,
        dias: opts.dias ?? null,
        ctx,
    });
}
