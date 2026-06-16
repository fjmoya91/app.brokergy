// Mensajes al certificador (texto editable de los popups de Notificar y Validar).
// Centralizado para que ambos popups sean homogéneos. Los nombres se guardan en
// MAYÚSCULAS en BD, así que aquí los normalizamos a formato legible.

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

// Mensaje de ENCARGO / RECORDATORIO / URGENTE (popup "Notificar Certificador").
export function buildCertDefaultMessage(template, section, certName, clienteNombre, numExp, ceeFolderLink) {
    const tecnico = firstNameProper(certName) || 'técnico';
    const cli = clienteNombre ? ` (${toTitleCase(clienteNombre)})` : '';
    const fase = section === 'final' ? 'CEE Final' : 'CEE Inicial';

    let body;
    if (template === 'reminder') {
        body = `¡Hola ${tecnico}! 👋\n\nTe recordamos que tienes pendiente el ${fase} del expediente ${numExp}${cli}.\n\n¿Podrías darnos una estimación de fecha de entrega? Nos ayudaría mucho para la planificación.\n\n¡Gracias!`;
    } else if (template === 'urgent') {
        body = `Hola ${tecnico}:\n\nNecesitamos con carácter urgente el ${fase} del expediente ${numExp}${cli}.\n\nEs importante que lo priorices para poder cumplir con los plazos del programa de ayudas. Quedamos a la espera.`;
    } else if (section === 'final') {
        body = `¡Hola ${tecnico}! 👋\n\nYa puedes presentar el CEE Final del expediente ${numExp}${cli}.\n\nToda la documentación de obra (facturas, memorias de instalación y fotos de fin de obra) ya está disponible en la carpeta compartida.\n\n¡Gracias!`;
    } else {
        body = `¡Hola ${tecnico}! 👋\n\nTe hemos asignado el expediente ${numExp}${cli} para la emisión del CEE Inicial.\n\nTienes toda la documentación del cliente en la carpeta compartida y en el portal.\n\n¡Gracias!`;
    }
    return body + carpetaLine(ceeFolderLink);
}

// Mensaje de VISTO BUENO / luz verde para registrar (popup "Validar").
export function buildCertApproveMessage(section, certName, clienteNombre, numExp, ceeFolderLink) {
    const tecnico = firstNameProper(certName) || 'técnico';
    const cli = clienteNombre ? ` (${toTitleCase(clienteNombre)})` : '';
    const fase = section === 'final' ? 'CEE Final' : 'CEE Inicial';
    const body = `¡Hola ${tecnico}! 👋\n\nHemos revisado el ${fase} del expediente ${numExp}${cli} y tiene nuestro visto bueno. Ya puedes proceder a registrarlo en Industria.\n\nUna vez registrado, sube por favor la etiqueta energética y el justificante de registro a la carpeta compartida o al portal.\n\n¡Gracias!`;
    return body + carpetaLine(ceeFolderLink);
}
