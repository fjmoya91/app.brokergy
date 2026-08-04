import React, { useMemo } from 'react';
import axios from 'axios';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';

// ─────────────────────────────────────────────────────────────────────────────
// Envío al SUJETO OBLIGADO de la OFERTA DE VERIFICACIÓN para su firma.
//
// La entidad verificadora nos manda su oferta, la subimos al lote y desde aquí se
// remite al S.O. El email adjunta el PDF y lleva el enlace `/firmar-lote/:id`, que
// le da las tres vías: firmarla online con certificado (Autofirma), subirla firmada
// a mano (nos llega aviso automático) o devolvérnosla firmada por email.
//
// Reutiliza EnviarLoteDocModal (mismo look, mismos canales y mismo overlay de
// envío) delegando el envío en POST /api/lotes/:id/enviar-oferta.
// ─────────────────────────────────────────────────────────────────────────────

export function EnviarOfertaModal({ lote, oferta, onClose, onSent }) {
    const so = lote?.sujeto_obligado || {};
    const { contactoPrincipal, notifyEmail, notifyPhone, ccSugerencias } = useMemo(() => deriveSoEnvio(so), [so]);

    const verificador = lote?.verificador?.razon_social || lote?.verificador?.acronimo || 'la entidad verificadora';
    const saludo = contactoPrincipal?.nombre ? `Hola ${String(contactoPrincipal.nombre).split(' ')[0]},` : 'Estimados,';

    const mensaje = `${saludo}

Adjuntamos la oferta de verificación del lote ${lote?.codigo || ''}, emitida por ${verificador}, para el conjunto de actuaciones que ya nos habéis firmado.

Para poder continuar necesitamos vuestra conformidad firmada. Podéis hacerlo como mejor os venga:

1. Firmarla online con el certificado del representante legal desde el enlace de abajo (Autofirma). No hay que descargar ni volver a subir nada.
2. Firmarla por vuestra cuenta y subirla en ese mismo enlace ("Firmar a mano → Subir firmado"): nos llega el aviso automáticamente.
3. Devolvérnosla firmada respondiendo a este correo.

Quedamos a vuestra disposición para cualquier aclaración.

Un saludo,
BROKERGY · Ingeniería Energética`;

    const handleEnviar = async ({ email, cc, phone, channels, message }) => {
        const ccList = Array.isArray(cc) ? cc : [];
        const { data } = await axios.post(`/api/lotes/${lote.id}/enviar-oferta`, {
            to: email,
            cc: ccList,
            phone,
            channels,
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
            title="Enviar la oferta al Sujeto Obligado"
            subtitle={`${lote?.codigo || 'Lote'} · Oferta de verificación`}
            defaultEmail={notifyEmail}
            defaultPhone={notifyPhone}
            defaultCc={CC_BROKERGY}
            ccSuggestions={ccSugerencias}
            defaultMessage={mensaje}
            docs={[{ label: 'Oferta de verificación', fileName: oferta?.file_name || 'Oferta de verificacion.pdf' }]}
            onSendOverride={handleEnviar}
            onClose={onClose}
            whatsappNote="Por WhatsApp va el mismo texto y el PDF de la oferta."
        />
    );
}

export default EnviarOfertaModal;
