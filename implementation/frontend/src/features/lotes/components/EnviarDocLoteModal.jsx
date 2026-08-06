import React, { useMemo } from 'react';
import axios from 'axios';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';

// ─────────────────────────────────────────────────────────────────────────────
// Envío al SUJETO OBLIGADO de UN documento del lote.
//
// Hoy lo usan dos cosas, y por eso es genérico:
//   · La OFERTA DE VERIFICACIÓN, que además hay que firmar: el email lleva el
//     enlace `/firmar-lote/:id?doc=…` con las tres vías (Autofirma, subirla a
//     mano o devolverla por email).
//   · La FACTURA DEL VERIFICADOR, que se le remite porque el verificador se la
//     emite a él: solo va el PDF, sin enlace de firma.
//
// Reutiliza EnviarLoteDocModal (mismos canales, mismo overlay de envío) y delega
// en POST /api/lotes/:id/enviar-documento/:key.
// ─────────────────────────────────────────────────────────────────────────────

// Mensaje por defecto según el documento. Editable antes de enviar.
function mensajeDe(tipo, { saludo, lote, verificador, doc }) {
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

export function EnviarDocLoteModal({ lote, doc, onClose, onSent }) {
    const so = lote?.sujeto_obligado || {};
    const { contactoPrincipal, notifyEmail, notifyPhone, ccSugerencias } = useMemo(() => deriveSoEnvio(so), [so]);

    const verificador = lote?.verificador?.razon_social || lote?.verificador?.acronimo || 'la entidad verificadora';
    const saludo = contactoPrincipal?.nombre ? `Hola ${String(contactoPrincipal.nombre).split(' ')[0]},` : 'Estimados,';
    const tipo = doc?.tipo || 'oferta_verificacion';
    const nombre = doc?.label || 'Documento del lote';

    const mensaje = useMemo(
        () => mensajeDe(tipo, { saludo, lote, verificador, doc }),
        [tipo, saludo, lote, verificador, doc]
    );

    const handleEnviar = async ({ email, cc, phone, channels, message }) => {
        const ccList = Array.isArray(cc) ? cc : [];
        const { data } = await axios.post(`/api/lotes/${lote.id}/enviar-documento/${doc.key}`, {
            to: email, cc: ccList, phone, channels,
            customMessage: message,
            frontendOrigin: window.location.origin,
        });
        const warnings = data?.warnings || [];
        const results = [];
        if (channels.email) {
            const w = warnings.find(x => /^email/i.test(x));
            const ccTxt = ccList.length ? ` (cc: ${ccList.join(', ')})` : '';
            results.push({ channel: 'email', status: w ? 'fail' : 'ok', text: w || `→ ${email}${ccTxt}` });
        }
        if (channels.whatsapp) {
            const w = warnings.find(x => /^whatsapp/i.test(x));
            results.push({ channel: 'whatsapp', status: w ? 'fail' : 'ok', text: w || `→ ${phone}` });
        }
        if (onSent) onSent();
        return results;
    };

    return (
        <EnviarLoteDocModal
            title={`Enviar ${nombre.toLowerCase()} al Sujeto Obligado`}
            subtitle={`${lote?.codigo || 'Lote'} · ${nombre}`}
            defaultEmail={notifyEmail}
            defaultPhone={notifyPhone}
            defaultCc={CC_BROKERGY}
            ccSuggestions={ccSugerencias}
            defaultMessage={mensaje}
            docs={[{ label: nombre, fileName: doc?.file_name || `${nombre}.pdf` }]}
            onSendOverride={handleEnviar}
            onClose={onClose}
            whatsappNote={`Por WhatsApp va el mismo texto y el PDF de "${nombre}".`}
        />
    );
}

export default EnviarDocLoteModal;
