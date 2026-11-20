import React, { useMemo } from 'react';
import axios from 'axios';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';
import { mensajeDocLote } from '../logic/mensajesDocLote';

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

// El mensaje por defecto (editable antes de enviar) sale de `logic/mensajesDocLote.js`:
// el mismo que usa el envío automático de la oferta que llega de beCAE.

export function EnviarDocLoteModal({ lote, doc, onClose, onSent }) {
    const so = lote?.sujeto_obligado || {};
    const { notifyEmail, notifyPhone, ccSugerencias } = useMemo(() => deriveSoEnvio(so), [so]);
    const nombre = doc?.label || 'Documento del lote';
    const mensaje = useMemo(() => mensajeDocLote(lote, doc), [lote, doc]);

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
