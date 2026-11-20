// ─────────────────────────────────────────────────────────────────────────────
// El mensaje con el que sale al SUJETO OBLIGADO un documento del lote: la
// OFERTA DE VERIFICACIÓN (firmable) o la FACTURA DEL VERIFICADOR.
//
// Fuente ÚNICA (17/11/2026): la usan el modal `EnviarDocLoteModal` (el texto
// por defecto, editable antes de enviar) y el envío AUTOMÁTICO de la oferta
// cuando llega de beCAE (`services/ofertaVerificadorAuto.js`, que lo importa en
// runtime). Así el mensaje automático es EL MISMO que si se carga a mano.
//
// Puro: solo depende de `soContactos.js` (sin React, sin axios).
// ─────────────────────────────────────────────────────────────────────────────

import { deriveSoEnvio } from './soContactos.js';

/** «Hola {nombre de pila},» del contacto principal del S.O.; si no hay, «Estimados,». */
export function saludoSo(so) {
    const { contactoPrincipal } = deriveSoEnvio(so || {});
    return contactoPrincipal?.nombre ? `Hola ${String(contactoPrincipal.nombre).split(' ')[0]},` : 'Estimados,';
}

/** Quién emite la oferta o la factura: razón social, acrónimo o un genérico. */
export function nombreVerificador(lote) {
    return lote?.verificador?.razon_social || lote?.verificador?.acronimo || 'la entidad verificadora';
}

/** Mensaje por defecto según el tipo de documento (`oferta_verificacion` | `factura_verificador`). */
export function mensajeDe(tipo, { saludo, lote, verificador, doc }) {
    if (tipo === 'factura_verificador') {
        return `${saludo}

Os remitimos la factura de ${verificador} correspondiente a la verificación del lote ${lote?.codigo || ''}${doc?.importe ? `, por importe de ${Number(doc.importe).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' })}` : ''}.

La verificación la contratáis vosotros directamente con la entidad verificadora, así que la factura va a vuestro nombre. Quedamos a vuestra disposición para cualquier aclaración.

Un saludo,
BROKERGY · Ingeniería Energética`;
    }
    // Oferta de verificación (documento firmable).
    return `${saludo}

Adjuntamos la oferta de verificación del lote ${lote?.codigo || ''}, emitida por ${verificador}, para el conjunto de actuaciones del lote.

Para poder continuar necesitamos vuestra conformidad firmada. Podéis hacerlo como mejor os venga:

1. Firmarla online con el certificado del representante legal desde el enlace de abajo (Autofirma). No hay que descargar ni volver a subir nada.
2. Firmarla por vuestra cuenta y subirla en ese mismo enlace ("Firmar a mano → Subir firmado"): nos llega el aviso automáticamente.
3. Devolvérnosla firmada respondiendo a este correo.

Quedamos a vuestra disposición para cualquier aclaración.

Un saludo,
BROKERGY · Ingeniería Energética`;
}

/** Atajo: el mensaje de un documento del lote, con su saludo y su verificador. */
export function mensajeDocLote(lote, doc) {
    const tipo = doc?.tipo || 'oferta_verificacion';
    return mensajeDe(tipo, {
        saludo: saludoSo(lote?.sujeto_obligado),
        lote,
        verificador: nombreVerificador(lote),
        doc,
    });
}
