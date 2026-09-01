import React, { useCallback, useMemo } from 'react';
import axios from 'axios';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';
import { fmtFecha } from '../logic/peticionesSo';

// ─────────────────────────────────────────────────────────────────────────────
// Petición al SUJETO OBLIGADO sobre VARIOS lotes a la vez.
//
// Los envíos que ya existían son de UN documento de UN lote (firmar el Anexo I,
// firmar la oferta). Éste es de otra naturaleza: un solo correo con las facturas
// de los cuatro lotes, que es como se trabaja con él. Mandarle cuatro correos
// iguales el mismo día es la forma de que no conteste a ninguno.
//
// Reutiliza `EnviarLoteDocModal` —los mismos canales, los mismos contactos, el
// mismo overlay de envío— con `onSendOverride`, porque la ruta es de la colección
// y no de un lote. Qué se pide, con qué texto y con qué asunto lo decide
// `logic/peticionesSo.js`: aquí solo se manda.
// ─────────────────────────────────────────────────────────────────────────────

const eur = (n) => `${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function PedirAlSoModal({ peticion, onClose, onSent }) {
    // El S.O. es el mismo en todos los lotes del envío; se toma del primero que lo
    // tenga resuelto. Si algún día se agrupan lotes de dos S.O. distintos, esto
    // habría que partirlo por destinatario.
    const so = useMemo(
        () => peticion?.lotes?.map(x => x.lote?.sujeto_obligado).find(Boolean) || {},
        [peticion]);
    const envio = useMemo(() => deriveSoEnvio(so), [so]);

    // El saludo lleva el nombre de QUIEN RECIBE el correo, no el del representante
    // legal: éste es quien FIRMA los documentos, y casi nunca quien lee el correo
    // del día a día (aquí firma Pedro José y el correo lo lee Jesús, el director de
    // operaciones). Se recalcula si se cambia de destinatario.
    const mensajeFor = useCallback((email) => {
        const nombre = envio.nombrePilaDe ? envio.nombrePilaDe(email) : '';
        const saludo = nombre ? `Buenos días ${nombre},` : 'Buenos días,';
        return typeof peticion?.mensaje === 'function' ? peticion.mensaje({ saludo }) : '';
    }, [peticion, envio]);

    const mensaje = useMemo(() => mensajeFor(envio.notifyEmail), [mensajeFor, envio.notifyEmail]);

    const codigos = (peticion?.lotes || []).map(x => x.lote?.codigo).filter(Boolean);

    // `onSendOverride` devuelve UNA LÍNEA POR CANAL: es lo que el overlay enseña al
    // terminar, y con un solo "enviado" no se sabría si salió el email, el WhatsApp
    // o los dos.
    const enviar = async ({ email, cc, phone, channels, message }) => {
        const { data } = await axios.post('/api/lotes/solicitar-pago-verificacion', {
            lote_ids: peticion.lotes.map(x => x.lote.id),
            to: email, cc, phone, channels,
            customMessage: message,
            asunto: peticion.asunto,
            etiqueta: peticion.etiquetaPill,
        });
        if (onSent) onSent(data);

        const fallo = (canal) => (data.warnings || []).find(w => String(w).toLowerCase().startsWith(canal));
        const out = [];
        const n = data.enviados?.length || 0;
        if (channels.email) {
            const err = fallo('email');
            out.push(err
                ? { channel: 'email', status: 'fail', text: err }
                : { channel: 'email', status: 'ok', text: `${n} factura${n === 1 ? '' : 's'} a ${email}` });
        }
        if (channels.whatsapp) {
            const err = fallo('whatsapp');
            out.push(err
                ? { channel: 'whatsapp', status: 'fail', text: err }
                : { channel: 'whatsapp', status: 'ok', text: `${n} factura${n === 1 ? '' : 's'} a ${phone}` });
        }
        return out;
    };

    if (!peticion) return null;

    return (
        <EnviarLoteDocModal
            onClose={onClose}
            title={peticion.titulo}
            // Los lotes que se quedan fuera van en el SUBTÍTULO, que está siempre a la
            // vista: el aviso del cuerpo queda por debajo del mensaje y hay que
            // desplazarse para verlo, y esto es justo lo que hay que saber antes de
            // mandar un correo que anuncia "las facturas de los lotes".
            subtitle={`${codigos.length} lote${codigos.length === 1 ? '' : 's'} · ${codigos.join(' · ')}`
                + (peticion.ultimaAt ? `   ✓ pedido el ${fmtFecha(peticion.ultimaAt)}` : '')
                + (peticion.sinFactura?.length
                    ? `   ⚠ fuera: ${peticion.sinFactura.map(l => l.codigo).join(', ')} (sin factura)`
                    : '')}
            defaultEmail={envio.notifyEmail}
            defaultPhone={envio.notifyPhone}
            defaultCc={CC_BROKERGY}
            ccSuggestions={envio.ccSugerencias}
            // Las personas del S.O. a las que se puede escribir, con su cargo: se
            // elige a quién va y el saludo se rehace solo.
            toSuggestions={envio.destinatarios}
            messageFor={mensajeFor}
            defaultMessage={mensaje}
            summaryData={{ id: codigos.join(' · '), docType: peticion.asunto }}
            // Lo que se adjunta, dicho por su nombre: es lo que hay que comprobar
            // antes de mandar un correo que pide dinero.
            // Cada línea dice además si esa factura YA se reclamó y cuándo: con
            // varios lotes en el mismo correo, es lo que distingue lo que se pide
            // por primera vez de lo que se está recordando.
            docs={(peticion.lotes || []).map(x => ({
                key: x.lote.id,
                label: `${x.lote.codigo} · ${x.factura?.numero_factura || 'Factura del verificador'}`,
                detail: [
                    x.importe ? eur(x.importe) : null,
                    x.pedidoAt ? `pedido el ${fmtFecha(x.pedidoAt)}${x.veces > 1 ? ` · ${x.veces} veces` : ''}` : null,
                ].filter(Boolean).join(' · ') || null,
            }))}
            onSendOverride={enviar}
            // ── Los lotes que se QUEDAN FUERA ─────────────────────────────────
            // Un lote sin su factura subida no se puede reclamar: no habría nada
            // que adjuntar. Pero callarlo es peor que excluirlo — se manda el
            // correo creyendo que van los cuatro y el S.O. paga tres. Se dice aquí,
            // con el nombre del lote y lo que le falta.
            extraBody={peticion.sinFactura?.length ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
                    <p className="text-[11px] text-amber-300/90 leading-snug">
                        ⚠ {peticion.sinFactura.length === 1 ? 'Se queda fuera' : 'Se quedan fuera'}{' '}
                        <b>{peticion.sinFactura.map(l => l.codigo).join(', ')}</b>:{' '}
                        {peticion.sinFactura.length === 1 ? 'no tiene' : 'no tienen'} subida la factura del
                        verificador, así que no hay nada que adjuntar. Súbela en su fase 4 y vuelve a
                        entrar si quieres reclamarla en este mismo correo.
                    </p>
                </div>
            ) : null}
        />
    );
}

export default PedirAlSoModal;
