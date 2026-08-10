// ─── recordatorios — los TEXTOS que propone la página de acción del parte diario
//
// Este módulo NO envía nada: redacta. El envío lo siguen haciendo las rutas de
// siempre (`notify-certificador`, `solicitar-faltantes`), que son las que además
// sellan el seguimiento y el historial. Aquí solo vive el texto, por dos motivos:
//
//  1. La página de acción tiene que ENSEÑAR el mensaje antes de mandarlo (es
//     editable), así que necesita el borrador por adelantado.
//  2. Ese borrador tiene que ser EL MISMO que manda la app cuando escribes desde el
//     expediente. Si aquí se redactara aparte, el certificador recibiría dos textos
//     distintos según por dónde le hayas escrito. Por eso `notify-certificador`
//     importa de aquí sus plantillas en vez de tenerlas escritas dentro.

const FIRMA = '*BROKERGY · Ingeniería Energética*';

/** Nombre propio en bonito: "JOSE ANTONIO PEREZ" → "Jose Antonio Perez". */
const capitalizar = (s) => (s || '').toLowerCase().split(/\s+/).filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

/** Primer nombre para el saludo. Un "¡Hola INSTALACIONES GARCIA SL!" suena a robot. */
const nombrePila = (s) => {
    const first = (s || '').trim().split(/\s+/)[0] || '';
    return first ? capitalizar(first) : '';
};

/**
 * Limpia la dirección de la obra para meterla en un mensaje.
 * Viene compuesta por tramos (calle, CP + municipio, provincia) y en las capitales
 * el municipio y la provincia son lo mismo: "AV PUENTE DE RETAMA 16, 13002 CIUDAD
 * REAL, (CIUDAD REAL)". También llega a veces el código INE entre paréntesis.
 */
const direccionLimpia = (dir) => {
    let d = String(dir || '').trim();
    if (!d) return '';
    d = d.replace(/,?\s*\(\d+\)\s*$/, '');                       // código INE final
    const m = d.match(/^(.*),\s*\(([^)]+)\)\s*$/);               // provincia final
    if (m) {
        const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
        if (norm(m[1]).endsWith(norm(m[2]))) d = m[1].trim();     // ya la nombra el municipio
        else d = `${m[1].trim()} (${m[2].trim()})`;
    }
    return d.replace(/\s*,\s*$/, '').trim();
};

// ─── Certificador ─────────────────────────────────────────────────────────────

/**
 * Recordatorio de REGISTRO: ya tiene nuestro visto bueno y falta que lo presente en
 * Industria. Lleva SIEMPRE el enlace de subida del CEE registrado, porque subirlo es
 * exactamente la acción que le estamos pidiendo.
 */
function certRegistroWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa = '', subirWa = '' }) {
    return `¡Hola *${certName}*! 👋\n\nEl *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''} tiene nuestro visto bueno y sigue *pendiente de registrar* en Industria.\n\nEn cuanto lo presentes, súbenos la etiqueta y el justificante de registro.${adminMsgWa}${subirWa}\n\n¡Gracias!\n${FIRMA}`;
}

/** Recordatorio de EMISIÓN: se le encargó el CEE y todavía no lo ha entregado. */
function certEmisionWa({ certName, phaseLabel, expedienteNum, clienteName, adminMsgWa = '', ceeFolderLink = null, portalLink = null }) {
    return `¡Hola *${certName}*! 👋\n\nTe recordamos que tienes pendiente el *${phaseLabel}* del expediente *${expedienteNum}*${clienteName ? ` (${clienteName})` : ''}.\n\n¿Podrías darnos una estimación de fecha de entrega?${adminMsgWa}\n\n${ceeFolderLink ? '📁 Carpeta: ' + ceeFolderLink + '\n' : ''}${portalLink ? '🔗 Portal: ' + portalLink + '\n' : ''}\n¡Gracias!\n${FIRMA}`;
}

// ─── Cliente / instalador ─────────────────────────────────────────────────────

/**
 * Bloque con lo que falta por su parte, sacado de las ACCIONES que calcula
 * `buildSolicitudAcciones` (GET /solicitud-info). Cada acción trae su enlace público
 * correcto — firmar anexos, subir RITE, subir fotos con solo los slots pendientes —,
 * así que no se inventa ninguna URL aquí.
 *
 * `relay` = el mensaje va al instalador pero habla de cosas del cliente: entonces se
 * usa la redacción en tercera persona que ya trae cada acción.
 */
function bloqueAcciones(acciones, { relay = false } = {}) {
    if (!acciones?.length) return '';
    return acciones.map(a => {
        const titulo = (relay && a.tituloRelay) || a.titulo;
        const nota = (relay && a.notaRelay) || a.nota;
        const items = (a.items || []).map(i => `   · ${i}`).join('\n');
        return `📌 *${titulo}*\n${items}${items ? '\n' : ''}${nota ? `   _${nota}_\n` : ''}   ${a.url}`;
    }).join('\n\n');
}

/**
 * "¿Cómo va la obra?" — el CEE inicial está registrado desde hace tiempo y no hay
 * ninguna señal de que la obra se haya hecho.
 *
 * El mensaje NO es solo la pregunta: lleva enganchado lo que falta por su parte y el
 * enlace donde subirlo. Preguntar a secas obliga a un segundo mensaje con las
 * instrucciones, y ese segundo mensaje casi nunca se manda.
 */
function finObraMsg({ destinatario, esInstalador, numExp, obra, dias, acciones, uploadBase }) {
    const hola = nombrePila(destinatario) ? `¡Hola ${nombrePila(destinatario)}! 👋` : '¡Hola! 👋';
    const dir = direccionLimpia(obra?.direccion);
    const laObra = esInstalador && (obra?.cliente || dir)
        ? `la obra de *${capitalizar(obra.cliente) || 'tu cliente'}*${dir ? ` (${dir})` : ''}`
        : 'tu instalación';

    const pendiente = bloqueAcciones(acciones, { relay: esInstalador });
    const fotos = uploadBase
        ? `\n\n📸 Las fotos de la instalación terminada se suben aquí:\n${uploadBase}`
        : '';

    return `${hola}\n\nTe escribimos por ${laObra} (expediente *${numExp}*).\n\nHace ya *${dias} días* que tenemos registrado el certificado energético inicial y aún no nos consta que la obra esté terminada. ¿Cómo va? ¿Nos puedes decir una fecha aproximada?\n\n*Cuando la termines necesitamos, para tramitar la ayuda:*\n· Las *fotos de la instalación terminada* (equipo instalado, placa de características y unidad interior).\n· La *factura* de la obra.${pendiente ? `\n\n*Además, sigue pendiente por tu parte:*\n\n${pendiente}` : ''}${fotos}\n\nEn esa misma página, cuando esté todo, tienes el botón *"He terminado la obra"* para avisarnos de un clic.\n\n¡Gracias!\n${FIRMA}`;
}

/**
 * "Te falta firmar" — uno o varios documentos salieron a firma y no han vuelto.
 * El enlace es el público de firma, que sirve el borrador vigente de Drive y presenta
 * de una vez todo lo que ese firmante tenga pendiente.
 *
 * `docs` es una LISTA a propósito: al cliente le suelen faltar el Anexo I y la Cesión
 * a la vez. El texto anterior hablaba de un documento y añadía "es el único que nos
 * falta" — con dos pendientes eso era sencillamente falso, y obligaba a un segundo
 * mensaje que se contradecía con el primero.
 */
function firmaMsg({ destinatario, docs = [], numExp, obra, dias, url, esInstalador }) {
    const hola = nombrePila(destinatario) ? `¡Hola ${nombrePila(destinatario)}! 👋` : '¡Hola! 👋';
    const dir = direccionLimpia(obra?.direccion);
    const laObra = esInstalador && (obra?.cliente || dir)
        ? ` de la obra de *${capitalizar(obra.cliente) || 'tu cliente'}*${dir ? ` (${dir})` : ''}`
        : '';

    const lista = docs.map(d => `· *${d}*`).join('\n');
    const varios = docs.length > 1;
    const cabecera = varios
        ? `Te recordamos que estos documentos del expediente *${numExp}*${laObra} siguen *pendientes de tu firma* (el más antiguo, desde hace ${dias} días):\n\n${lista}`
        : `Te recordamos que el *${docs[0] || 'documento'}* del expediente *${numExp}*${laObra} sigue *pendiente de tu firma* desde hace ${dias} días.`;

    return `${hola}\n\n${cabecera}\n\nEs lo que nos falta para poder seguir con la tramitación de la ayuda.\n\n✍️ ${varios ? 'Fírmalos' : 'Fírmalo'} aquí (se ${varios ? 'hacen' : 'hace'} en 2 minutos desde el móvil):\n${url}\n\nSi tienes cualquier duda, respóndenos por aquí mismo.\n\n¡Gracias!\n${FIRMA}`;
}

module.exports = {
    certRegistroWa, certEmisionWa,
    finObraMsg, firmaMsg, bloqueAcciones,
    capitalizar, nombrePila, direccionLimpia, FIRMA,
};
