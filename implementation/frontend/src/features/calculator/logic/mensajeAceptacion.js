/**
 * El ENLACE para aceptar la propuesta va en un MENSAJE APARTE.
 *
 * Iba dentro del mensaje de la propuesta, a mitad de un texto largo y detrás de
 * las cifras, y la gente no lo veía: lo siguiente que llegaba era "¿y cómo lo
 * acepto?" y había que volver a pasárselo a mano. Ahora el mensaje de la
 * propuesta cuenta la información y AVISA de que el enlace va debajo
 * (`lineaEnlaceDebajo`), y el enlace sale solo en su propio mensaje
 * (`mensajeAceptacion`), DESPUÉS del PDF: es lo último que queda en el chat.
 *
 * Por WhatsApp son tres burbujas: el texto, el PDF y este mensaje. En el email no
 * hay "mensaje aparte": el correo ya lleva el botón «✍️ Aceptar y firmar» debajo
 * del texto, así que la línea que avisa dice "más abajo" y no "en otro mensaje",
 * y vale para los dos canales.
 *
 * Al PARTNER/INSTALADOR se le escribe en tercera persona ("el cliente"): así puede
 * reenviarle ese mensaje tal cual sin que el cliente lea algo dirigido a otro.
 *
 * Es FUENTE ÚNICA del popup de envío, de su vista previa y del envío programado
 * (que guarda el texto ya hecho en el plan): si cada sitio lo redactara, la
 * propuesta enviada a mano y la programada dirían cosas distintas.
 */

/** La línea que sustituye al enlace dentro del mensaje de la propuesta. */
export function lineaEnlaceDebajo({ b2b = false } = {}) {
    return b2b
        ? '👇 Más abajo os dejo el enlace para que el cliente acepte la propuesta, por si queréis pasárselo.'
        : '👇 Más abajo te dejo el enlace para aceptarla.';
}

/**
 * El mensaje con el enlace. El enlace va SOLO en su línea: pegado a una frase,
 * en algunos móviles el subrayado se come la palabra de al lado y no se ve dónde
 * pulsar.
 */
export function mensajeAceptacion({ url, b2b = false } = {}) {
    if (!url) return '';
    if (b2b) {
        return [
            '✍️ *Enlace para que el cliente acepte la propuesta:*',
            url,
            '',
            'Al abrirlo, el cliente completa sus datos y firma la aceptación desde el móvil, en un par de minutos.',
        ].join('\n');
    }
    return [
        '✍️ *Para aceptar la propuesta, pulsa aquí:*',
        url,
        '',
        'Se abre una página donde completas tus datos y firmas la aceptación desde el móvil, en un par de minutos. '
            + '(También puedes hacerlo con el botón *"FIRMAR Y ACEPTAR PROPUESTA"* del PDF.)',
    ].join('\n');
}

export const esB2B = (mode) => mode === 'PARTNER' || mode === 'INSTALADOR';
