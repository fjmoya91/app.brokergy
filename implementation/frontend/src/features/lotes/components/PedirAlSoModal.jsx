import React, { useCallback, useMemo, useState } from 'react';
import axios from 'axios';
import { EnviarLoteDocModal } from './EnviarLoteDocModal';
import { deriveSoEnvio, CC_BROKERGY } from '../logic/soContactos';
import { fmtFecha } from '../logic/peticionesSo';

// ─────────────────────────────────────────────────────────────────────────────
// Petición al SUJETO OBLIGADO sobre VARIOS lotes a la vez.
//
// Los envíos que ya existían son de UN documento de UN lote (firmar el Anexo I,
// firmar la oferta de ESE lote). Éste es de otra naturaleza: un solo correo con
// las cuatro ofertas —o las cuatro facturas—, que es como se trabaja con él.
// Mandarle cuatro correos iguales el mismo día es la forma de que no conteste a
// ninguno.
//
// El popup es UNO para todas las peticiones. Lo que cambia entre ellas —qué se
// adjunta, cómo se llama, quién se queda fuera y por qué— lo aporta la propia
// petición (`docs`, `sustantivo`, `fuera`), no un `if` aquí dentro: dos popups
// gemelos acabarían divergiendo justo en la parte delicada, que es la lista de lo
// que va adjunto.
//
// Reutiliza `EnviarLoteDocModal` —los mismos canales, los mismos contactos, el
// mismo overlay de envío— con `onSendOverride`, porque la ruta es de la colección
// y no de un lote. Qué se pide, con qué texto y con qué asunto lo decide
// `logic/peticionesSo.js`: aquí solo se manda.
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Los PRECIOS que faltan, pedidos ANTES de escribir el correo.
//
// El precio de la oferta es el dato por el que el S.O. decide si firma. Sin él, el
// correo le pide firmar cuatro papeles sin decirle cuánto cuesta ninguno y tiene
// que abrir los cuatro PDF para saberlo.
//
// Se piden aquí y no en la ficha de cada lote porque es aquí donde se han echado
// de menos, y obligar a salir, entrar en cuatro lotes y volver es la forma de que
// el correo salga sin ellos. Se GUARDAN en su lote (no solo en este correo): el
// siguiente envío ya los trae, y la ficha del lote también.
//
// REGLA — se puede seguir SIN ponerlos. Es una mejora del correo, no un requisito
// del trámite: bloquear el envío por un dato que quizá no tienes a mano convierte
// una ayuda en un peaje. Los que falten salen como "precio por confirmar".
// ─────────────────────────────────────────────────────────────────────────────
function PreciosPendientes({ peticion, onListo, onSaltar, onClose }) {
    const [valores, setValores] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const faltan = peticion.faltanImporte || [];
    const alguno = faltan.some(x => Number(valores[x.lote.id]) > 0);

    const guardar = async () => {
        setGuardando(true);
        setError('');
        const puestos = {};
        try {
            for (const x of faltan) {
                const v = Number(valores[x.lote.id]);
                if (!(v > 0)) continue;
                await axios.post(
                    `/api/lotes/${x.lote.id}/documentos/${peticion.campoImporte.key}/importe`,
                    { importe: v });
                puestos[x.lote.id] = v;
            }
            onListo(puestos);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo guardar el importe.');
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
            <div className="relative w-full max-w-md bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                <div className="absolute inset-x-0 top-0 h-[3px] pointer-events-none" style={{ background: 'var(--brand-gradient)' }} />
                <div className="px-6 pt-7 pb-5">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-brand/80">Antes de escribir el correo</p>
                    <h3 className="mt-1 text-lg font-black uppercase tracking-tight text-white">
                        {faltan.length === 1 ? 'Falta el precio de una oferta' : `Faltan ${faltan.length} precios`}
                    </h3>
                    <p className="mt-2 text-[11px] text-white/45 leading-relaxed no-uppercase">
                        Es lo que el S.O. mira para decidir si firma. Se guarda en su lote, así que
                        solo hay que ponerlo una vez.
                    </p>

                    <div className="mt-5 space-y-2">
                        {faltan.map(x => (
                            <div key={x.lote.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-white/10 bg-white/[0.02]">
                                <span className="flex-1 min-w-0 text-[11px] font-bold text-white truncate">{x.lote.codigo}</span>
                                <div className="relative shrink-0">
                                    <input
                                        type="number" min="0" step="0.01" inputMode="decimal"
                                        value={valores[x.lote.id] ?? ''}
                                        onChange={(e) => setValores(v => ({ ...v, [x.lote.id]: e.target.value }))}
                                        placeholder="0,00"
                                        className="w-32 pl-3 pr-7 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-white text-[12px] text-right focus:border-brand/50 focus:outline-none no-uppercase"
                                    />
                                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-white/35 pointer-events-none">€</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="mt-2 text-[9px] text-white/25 no-uppercase">Sin IVA, como el resto de importes de la app.</p>
                    {error && <p className="mt-3 text-[11px] text-red-400">{error}</p>}
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                    <button onClick={onClose}
                        className="text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white/60 transition-all">
                        Cancelar
                    </button>
                    <div className="flex items-center gap-3">
                        <button onClick={onSaltar} disabled={guardando}
                            className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                            Seguir sin precios
                        </button>
                        <button onClick={guardar} disabled={guardando || !alguno}
                            className="px-5 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                            {guardando ? 'Guardando…' : 'Guardar y seguir'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function PedirAlSoModal({ peticion, onClose, onSent }) {
    // Los precios que se acaban de teclear. Ya están guardados en su lote, pero la
    // petición de este render se calculó ANTES: sin esto el correo saldría sin la
    // cifra que se acaba de introducir, que es justo por lo que se pidió.
    const [precios, setPrecios] = useState(null);
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
        return typeof peticion?.mensaje === 'function' ? peticion.mensaje({ saludo, precios: precios || {} }) : '';
    }, [peticion, envio, precios]);

    const mensaje = useMemo(() => mensajeFor(envio.notifyEmail), [mensajeFor, envio.notifyEmail]);

    const codigos = (peticion?.lotes || []).map(x => x.lote?.codigo).filter(Boolean);

    // `onSendOverride` devuelve UNA LÍNEA POR CANAL: es lo que el overlay enseña al
    // terminar, y con un solo "enviado" no se sabría si salió el email, el WhatsApp
    // o los dos.
    const enviar = async ({ email, cc, phone, channels, message }) => {
        const { data } = await axios.post('/api/lotes/peticion-so', {
            peticion: peticion.id,
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
        // El acuse dice QUÉ ha viajado, con el nombre de la petición: "3 ofertas a
        // jesus@…". Un "enviado" a secas no distingue un correo con las facturas de
        // uno con las ofertas, y son dos trámites distintos con el mismo destinatario.
        const cosa = n === 1 ? (peticion.sustantivo?.sing || 'documento') : (peticion.sustantivo?.plur || 'documentos');
        if (channels.email) {
            const err = fallo('email');
            out.push(err
                ? { channel: 'email', status: 'fail', text: err }
                : { channel: 'email', status: 'ok', text: `${n} ${cosa} a ${email}` });
        }
        if (channels.whatsapp) {
            const err = fallo('whatsapp');
            out.push(err
                ? { channel: 'whatsapp', status: 'fail', text: err }
                : { channel: 'whatsapp', status: 'ok', text: `${n} ${cosa} a ${phone}` });
        }
        return out;
    };

    if (!peticion) return null;

    // Con precios que faltan, lo primero que se ve es la pregunta por ellos. No es
    // un paso más: es el dato que hace útil el correo, y pedirlo después de haber
    // escrito el mensaje obligaría a rehacerlo.
    if (precios === null && (peticion.faltanImporte || []).length > 0) {
        return (
            <PreciosPendientes
                peticion={peticion}
                onClose={onClose}
                onSaltar={() => setPrecios({})}
                onListo={(puestos) => setPrecios(puestos)}
            />
        );
    }

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
                + (peticion.fuera ? `   ⚠ fuera: ${peticion.fuera.resumen}` : '')}
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
            docs={peticion.docs || []}
            onSendOverride={enviar}
            // ── Los lotes que se QUEDAN FUERA ─────────────────────────────────
            // Un lote sin su factura subida no se puede reclamar: no habría nada
            // que adjuntar. Pero callarlo es peor que excluirlo — se manda el
            // correo creyendo que van los cuatro y el S.O. paga tres. Se dice aquí,
            // con el nombre del lote y lo que le falta.
            extraBody={peticion.fuera ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5">
                    <p className="text-[11px] text-amber-300/90 leading-snug">
                        ⚠ {peticion.fuera.lotes.length === 1 ? 'Se queda fuera' : 'Se quedan fuera'}{' '}
                        <b>{peticion.fuera.lotes.map(l => l.codigo).join(', ')}</b>: {peticion.fuera.aviso}
                    </p>
                </div>
            ) : null}
        />
    );
}

export default PedirAlSoModal;
