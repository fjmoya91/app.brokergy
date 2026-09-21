/**
 * DocsAdminModal — superficie de documentación dentro del panel (modo admin).
 *
 * Usa el núcleo <DocsManager> (subir/ver/validar/rechazar). Además, en la
 * cabecera, permite REENVIAR el enlace de subida de documentación al cliente
 * y/o instalador por WhatsApp o email, con mensaje editable (incluye el enlace
 * y la lista de lo que falta).
 */

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { DocsManager } from '../../docs/DocsManager';

const IconWA = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
);
const IconDrive = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M7.71 3.5 1.15 15l3.43 5.5L11.14 9zM9.4 15l-3.28 5.5h13.34L22.85 15zM22.85 13.5 16.29 2H9.43l6.56 11.5z" /></svg>
);
const IconFolder = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
const IconMail = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg>
);

export function DocsAdminModal({ isOpen, onClose, idOportunidad }) {
    const { user } = useAuth();
    const { showAlert } = useModal();
    const canValidate = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';

    const [info, setInfo] = useState(null);     // { id_oportunidad, aceptada, upload_link, slots, recipients }
    const [send, setSend] = useState(null);      // { channel:'whatsapp'|'email' } | null
    const [sel, setSel] = useState(new Set());   // destinatarios seleccionados
    const [manual, setManual] = useState('');
    const [message, setMessage] = useState('');
    // Un mensaje editado a mano no se rehace al cambiar la selección: lo escrito
    // lo escribió una persona (mismo criterio que los popups del expediente).
    const [msgTocado, setMsgTocado] = useState(false);
    const [sending, setSending] = useState(false);
    const [abriendoLocal, setAbriendoLocal] = useState(false);

    // -- Accesos directos a la carpeta de las FOTOS -----------------------------
    // Las fotos se vuelcan en "12. DOCUMENTOS PARA CEE", no en la raiz del
    // expediente: los dos botones llevan ahi y no un nivel por encima, que
    // obligaria a buscarla entre las trece subcarpetas. Solo ADMIN (regla 1: los
    // enlaces de Drive no se le sirven a un partner).
    //
    // La carpeta LOCAL se abre con el protocolo propio `brokergylocal:` (mismo
    // patron que el boton del expediente y el del lote; requiere registrar una vez
    // `tools/windows/brokergylocal_setup.reg`). La ruta viaja en base64url
    // CONSERVANDO el padding `=` y SIN `//` tras el esquema -- con `//` el navegador
    // pone el "host" en minusculas y rompe el base64. Se copia ademas al
    // portapapeles: si el PC no tiene el protocolo, al menos se puede pegar.
    const abrirCarpetaLocal = async () => {
        if (abriendoLocal) return;
        setAbriendoLocal(true);
        try {
            const { data } = await axios.get(`/api/oportunidades/${idOportunidad}/local-path`, { params: { sub: 'docs' } });
            const path = data?.path;
            if (!path) throw new Error('No se pudo obtener la ruta local.');
            try { await navigator.clipboard.writeText(path); } catch (_) { /* contexto no seguro */ }
            const b64url = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            showAlert(err?.response?.data?.error || err.message || 'No se pudo abrir la carpeta local.', 'Carpeta local', 'error');
        } finally {
            setAbriendoLocal(false);
        }
    };

    useEffect(() => {
        if (!isOpen || !idOportunidad) return;
        let cancel = false;
        axios.get(`/api/oportunidades/${idOportunidad}/docs`)
            .then(res => { if (!cancel) setInfo(res.data); })
            .catch(() => { if (!cancel) setInfo(null); });
        return () => { cancel = true; };
    }, [isOpen, idOportunidad]);

    // Lo que falta — mismo criterio que "Solicitar lo que falta" ([buildSolicitudAcciones]
    // en expedientes.js): solo fase ANTES, OBLIGATORIAS y SIN las marcadas como
    // "no necesario" (waived). El backend ya pone required=false a las waived, pero lo
    // filtramos explícitamente por claridad. Antes de aceptar → solo las pre_aceptacion;
    // tras aceptar → todas las de ANTES sin subir. Más las rechazadas (a repetir).
    const pendientes = useMemo(() => {
        const slots = info?.slots || [];
        const antes = slots.filter(s => s.fase === 'ANTES' && s.required && !s.waived);
        const missing = antes.filter(s => !(s.items?.length));
        const base = info?.aceptada ? missing : missing.filter(s => s.gating === 'pre_aceptacion');
        const rechazadas = antes.filter(s => (s.items || []).some(i => i.estado === 'rechazada'));
        const seen = new Set(); const out = [];
        for (const s of [...base, ...rechazadas]) { if (!seen.has(s.key)) { seen.add(s.key); out.push(s.label); } }
        return out;
    }, [info]);

    const buildDefaultMessage = () =>
`Hola

Para continuar con el expediente *${info?.id_oportunidad || ''}* aún nos falta algo de documentación. Puedes subirla fácilmente desde el móvil en este enlace:

🔗 ${info?.upload_link || ''}
${pendientes.length ? `\nNos falta:\n${pendientes.map(p => `• ${p}`).join('\n')}\n` : ''}
¡Gracias!
*BROKERGY — Ingeniería Energética*`;

    const openSend = (channel) => {
        setSel(new Set(info?.recipients?.cliente ? ['cliente'] : []));
        setManual('');
        setMessage(buildDefaultMessage());
        setMsgTocado(false);
        setSend({ channel, need: null });
    };

    // ── PEDIR UNA FOTO CONCRETA ─────────────────────────────────────────────
    // Lo que falta casi nunca es "la documentación": es una foto con nombre. El
    // enlace se manda filtrado a lo pedido (`need=`), así que el cliente abre y
    // ve SOLO esas casillas — ni tiene que buscarlas entre veinte, ni volvemos a
    // pedirle lo que ya subió.
    //
    // Los apartados que se le pueden reclamar: los que no tiene y no se han
    // marcado como no necesarios. Un `existing` (cajón de lo ya aportado) no es
    // una casilla que rellenar.
    const faltantes = useMemo(
        () => (info?.slots || []).filter(s => !(s.items?.length) && !s.waived && !s.existing),
        [info]
    );

    // Cuántas faltan de cada destino. De aquí salen los dos botones de petición
    // rápida: si de un destino no falta nada, su botón no existe — uno apagado
    // obliga a pulsarlo para descubrir por qué.
    const faltaPorDestino = useMemo(() => {
        const n = { CEE: 0, EXPEDIENTE: 0 };
        for (const s of faltantes) {
            // El contador cuenta lo que el botón va a pedir DE VERDAD: si dijera 9 y
            // luego la lista viniera con 4 marcadas, el número sería una promesa falsa.
            if (s.optionalAlways || s.prescindible) continue;
            if (!info?.fin_obra && s.fase === 'DESPUES') continue;
            const d = s.destino || 'EXPEDIENTE';
            n[d] = (n[d] || 0) + 1;
        }
        return n;
    }, [faltantes, info]);

    // Al cliente se le nombra la foto en SU idioma, no con la etiqueta técnica:
    // "la pegatina de la máquina de fuera", no "Placa de la unidad exterior".
    const nombreCliente = (s) => s.labelCliente || s.label;

    // POR QUÉ se le pide. Un cliente que entiende para qué sirve una foto la hace
    // bien; al que solo recibe una lista de nombres técnicos hay que repetírsela.
    const MOTIVO = {
        CEE: 'Para poder hacer el certificado energético de tu vivienda necesitamos ver cómo es la casa por fuera',
        EXPEDIENTE: 'Para seguir con la tramitación de tu ayuda nos falta',
    };

    const buildNeedMessage = (keys, destino = null) => {
        const pedidos = faltantes.filter(s => keys.includes(s.key));
        const lista = pedidos.map(s => {
            const ayuda = s.helpCliente || s.help;
            return `• *${nombreCliente(s)}*${ayuda ? `\n   ${ayuda}` : ''}`;
        }).join('\n');
        const link = `${info?.upload_link || ''}${info?.upload_link?.includes('?') ? '&' : '?'}need=${keys.join(',')}`;
        // Con un destino declarado se explica para qué es; pidiendo cosas sueltas
        // de aquí y de allá no se puede decir "esto es para el certificado" sin
        // mentir a medias, así que se cae a la frase de siempre.
        const intro = destino && MOTIVO[destino]
            ? `${MOTIVO[destino]}:`
            : `Para seguir con el expediente *${info?.id_oportunidad || ''}* nos falta ${pedidos.length > 1 ? 'esto' : 'esta foto'}:`;
        return `Hola

${intro}

${lista}

Puedes ${pedidos.length > 1 ? 'subirlas' : 'subirla'} desde el móvil en este enlace, que te lleva directo:

🔗 ${link}

¡Gracias!
*BROKERGY — Ingeniería Energética*`;
    };

    /** La vista se cargó al abrir el modal: sin refrescar se reclama lo ya subido. */
    const refrescarDocs = async () => {
        try {
            const { data } = await axios.get(`/api/oportunidades/${idOportunidad}/docs`);
            setInfo(data);
        } catch { /* con lo que ya teníamos basta para enviar */ }
    };

    // Pedir TODO lo que falta de un destino. Es el caso normal: al cliente se le
    // reclama "lo del certificado" o "lo de la obra", nunca una casilla suelta de
    // cada — y mezclarlo le pediría a la vez la fachada (que puede hacer hoy) y la
    // máquina nueva instalada (que no existe todavía).
    const pedirDestino = async (destino) => {
        // Vienen marcados los que de verdad se reclaman. Lo `optionalAlways` (el CEE
        // anterior, el RITE) se le OFRECE al cliente, no se le exige: meterlo en una
        // lista de "nos falta" le reclama un papel que puede no existir. Sigue en la
        // lista de abajo por si se quiere pedir a propósito.
        const keys = faltantes
            .filter(s => (s.destino || 'EXPEDIENTE') === destino && !s.optionalAlways && !s.prescindible)
            // Mientras la obra no esté terminada, lo del DESPUÉS no se reclama: la
            // foto de la máquina instalada no existe todavía, y una lista con cinco
            // cosas imposibles hace que no se atienda ninguna. Se puede marcar a
            // mano si se sabe que la obra ya está hecha.
            .filter(s => info?.fin_obra || s.fase !== 'DESPUES')
            .map(s => s.key);
        if (!keys.length) return;
        setSel(new Set(info?.recipients?.cliente ? ['cliente'] : []));
        setManual('');
        setMessage(buildNeedMessage(keys, destino));
        setMsgTocado(false);
        setSend({ channel: 'whatsapp', need: keys, destino });
        await refrescarDocs();
    };

    const pedirSlot = async (slot) => {
        const keys = [slot.key];
        setSel(new Set(info?.recipients?.cliente ? ['cliente'] : []));
        setManual('');
        setMessage(buildNeedMessage(keys));
        setMsgTocado(false);
        setSend({ channel: 'whatsapp', need: keys, destino: slot.destino || null });
        // Se pide DESPUÉS de abrir para no dejar el botón sin respuesta mientras
        // llega: lo que importa es que la lista esté al día antes de enviar.
        await refrescarDocs();
    };

    // Marcar/desmarcar otra foto en la misma petición: lo que falta rara vez es
    // una sola cosa, y dos mensajes seguidos el mismo día se leen como un lío.
    const toggleNeed = (key) => setSend(prev => {
        if (!prev?.need) return prev;
        const keys = prev.need.includes(key) ? prev.need.filter(k => k !== key) : [...prev.need, key];
        if (!keys.length) return prev;                    // al menos una: si no, no hay petición
        // El "para qué" solo se mantiene mientras TODO lo marcado sea de ese
        // destino: en cuanto se mezcla, decir "esto es para el certificado" sería
        // mentir a medias, y el mensaje vuelve a la frase genérica.
        const destinos = new Set(faltantes.filter(s => keys.includes(s.key)).map(s => s.destino || 'EXPEDIENTE'));
        const destino = destinos.size === 1 ? [...destinos][0] : null;
        if (!msgTocado) setMessage(buildNeedMessage(keys, destino));
        return { ...prev, need: keys, destino };
    });

    const toggle = (type) => setSel(prev => {
        const n = new Set(prev);
        n.has(type) ? n.delete(type) : n.add(type);
        return n;
    });

    const doSend = async () => {
        const recipients = [];
        if (sel.has('cliente')) recipients.push({ type: 'cliente' });
        if (sel.has('instalador')) recipients.push({ type: 'instalador' });
        if (sel.has('otro')) recipients.push({ type: 'otro', value: manual.trim() });
        if (!recipients.length) { showAlert('Selecciona al menos un destinatario.', 'Atención', 'warning'); return; }
        if (sel.has('otro') && !manual.trim()) { showAlert(`Escribe el ${send.channel === 'whatsapp' ? 'teléfono' : 'email'} del otro contacto.`, 'Atención', 'warning'); return; }
        if (!message.trim()) { showAlert('El mensaje no puede estar vacío.', 'Atención', 'warning'); return; }
        setSending(true);
        try {
            const { data } = await axios.post(`/api/oportunidades/${idOportunidad}/docs/enviar-enlace`, {
                recipients, channel: send.channel, message
            });
            const ok = (data.results || []).filter(r => r.ok);
            const ko = (data.results || []).filter(r => !r.ok);
            if (ok.length) {
                showAlert(`Enviado a ${ok.length} destinatario(s)${ko.length ? `. No se pudo a: ${ko.map(f => `${f.type} (${f.error})`).join(', ')}` : ''}.`, 'Enviado', ko.length ? 'warning' : 'success');
                setSend(null);
            } else {
                showAlert(`No se pudo enviar: ${ko.map(f => `${f.type} (${f.error})`).join(', ')}`, 'Error', 'error');
            }
        } catch (e) {
            showAlert('Error al enviar: ' + (e.response?.data?.error || e.message), 'Error', 'error');
        } finally {
            setSending(false);
        }
    };

    if (!isOpen) return null;

    const recipientCard = (type, title, name, phone, disabled) => (
        <button type="button" disabled={disabled}
            onClick={() => !disabled && toggle(type)}
            className={`w-full text-left p-3.5 rounded-xl border-2 transition-all flex items-center gap-3 ${
                disabled ? 'border-white/5 bg-white/[0.02] opacity-40 cursor-not-allowed'
                    : sel.has(type) ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:border-amber-400/40'
            }`}>
            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${sel.has(type) ? 'bg-amber-400 border-amber-400' : 'border-white/20'}`}>
                {sel.has(type) && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
            </div>
            <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">{title}</p>
                <p className="text-white font-bold text-sm truncate">{name}</p>
                {phone && <p className="text-white/40 text-xs font-mono mt-0.5">{phone}</p>}
            </div>
        </button>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative max-w-2xl w-full flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-4 bg-slate-900 border-b border-white/10 flex justify-between items-center shrink-0">
                    <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3 text-base">
                        <span className="text-amber-400 text-xl">📸</span>
                        Documentación del expediente
                    </h3>
                    <div className="flex items-center gap-2">
                        {/* Accesos directos a "12. DOCUMENTOS PARA CEE" (solo ADMIN) */}
                        {canValidate && (
                            <>
                                <a href={info?.docs_folder_link || undefined} target="_blank" rel="noopener noreferrer"
                                    onClick={e => { if (!info?.docs_folder_link) e.preventDefault(); }}
                                    title={info?.docs_folder_link ? 'Abrir en Drive la carpeta "12. DOCUMENTOS PARA CEE"' : 'Aun no existe la carpeta de fotos en Drive'}
                                    className={`p-2 rounded-full transition-all ${info?.docs_folder_link ? 'hover:bg-white/10 text-white/60 hover:text-amber-400' : 'text-white/60 opacity-30 cursor-not-allowed'}`}>
                                    <IconDrive />
                                </a>
                                <button onClick={abrirCarpetaLocal} disabled={abriendoLocal || !idOportunidad}
                                    title='Abrir la carpeta local "12. DOCUMENTOS PARA CEE" en el Explorador de Windows (se copia tambien la ruta)'
                                    className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-emerald-400 transition-all disabled:opacity-30">
                                    {abriendoLocal
                                        ? <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                        : <IconFolder />}
                                </button>
                                <span className="w-px h-5 bg-white/10 mx-0.5" />
                            </>
                        )}

                        {/* Pedir de una vez todo lo que falta de UN destino. Es como
                            se pide de verdad ("necesito lo del certificado"), y el
                            enlace que recibe el cliente va filtrado a eso. */}
                        {faltaPorDestino.CEE > 0 && (
                            <button onClick={() => pedirDestino('CEE')} disabled={!info?.upload_link}
                                title="Pedir al cliente lo que falta para levantar el certificado energético"
                                className="px-2.5 py-1.5 rounded-lg border border-sky-400/30 text-sky-300 text-[10px] font-black uppercase tracking-wider hover:bg-sky-400/10 transition-all disabled:opacity-30">
                                📐 Pedir lo del certificado · {faltaPorDestino.CEE}
                            </button>
                        )}
                        {faltaPorDestino.EXPEDIENTE > 0 && (
                            <button onClick={() => pedirDestino('EXPEDIENTE')} disabled={!info?.upload_link}
                                title="Pedir al cliente o al instalador lo que falta del expediente"
                                className="px-2.5 py-1.5 rounded-lg border border-amber-400/30 text-amber-300 text-[10px] font-black uppercase tracking-wider hover:bg-amber-400/10 transition-all disabled:opacity-30">
                                📸 Pedir lo del expediente · {faltaPorDestino.EXPEDIENTE}
                            </button>
                        )}
                        <span className="w-px h-5 bg-white/10 mx-0.5" />
                        {/* Reenviar enlace de subida */}
                        <button onClick={() => openSend('email')} disabled={!info?.upload_link} title="Enviar enlace por email"
                            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-amber-400 transition-all disabled:opacity-30">
                            <IconMail />
                        </button>
                        <button onClick={() => openSend('whatsapp')} disabled={!info?.upload_link} title="Enviar enlace por WhatsApp"
                            className="p-2 rounded-full hover:bg-white/10 text-white/60 hover:text-[#25D366] transition-all disabled:opacity-30">
                            <IconWA />
                        </button>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                <div className="p-5 md:p-6 overflow-y-auto bg-[#0F1013] flex-1 text-white">
                    {idOportunidad ? (
                        <DocsManager mode="admin" idOrUuid={idOportunidad} embedded canValidate={canValidate}
                            onPedirSlot={info?.upload_link ? pedirSlot : null} />
                    ) : (
                        <p className="text-white/50 text-sm text-center py-10">Guarda la oportunidad antes de gestionar su documentación.</p>
                    )}
                </div>
            </div>

            {/* Modal de envío del enlace */}
            {send && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#16181D] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[92vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
                            <span className={send.channel === 'whatsapp' ? 'text-[#25D366]' : 'text-amber-400'}>
                                {send.channel === 'whatsapp' ? <IconWA className="w-6 h-6" /> : <IconMail className="w-6 h-6" />}
                            </span>
                            <div className="flex-1 min-w-0">
                                <h4 className="text-white font-black uppercase tracking-widest text-xs">
                                    {send.need ? (send.need.length > 1 ? 'Pedir las fotos que faltan' : 'Pedir esta foto') : 'Reenviar enlace de subida'}
                                </h4>
                                <p className="text-white/40 text-[11px]">{send.channel === 'whatsapp' ? 'Por WhatsApp' : 'Por email'} · selecciona destinatario(s)</p>
                            </div>
                            {/* El canal se cambia AQUÍ: al pedir una foto desde su casilla no
                                hay dos botones de los que salir, y cerrar para volver a
                                entrar por el otro es un peaje. */}
                            <div className="flex items-center gap-1 shrink-0">
                                {[['whatsapp', 'WhatsApp'], ['email', 'Email']].map(([c, txt]) => (
                                    <button key={c} type="button" onClick={() => setSend(prev => ({ ...prev, channel: c }))}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${send.channel === c ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'}`}>
                                        {txt}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="p-5 overflow-y-auto space-y-4">
                            {/* Qué se está pidiendo. Va ARRIBA, antes del destinatario: es
                                lo que hay que revisar, y de aquí sale tanto el texto del
                                mensaje como el enlace filtrado que abrirá el cliente. */}
                            {send.need && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">
                                        Se le pide ({send.need.length})
                                    </label>
                                    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1">
                                        {faltantes.map(s => {
                                            const on = send.need.includes(s.key);
                                            return (
                                                <button key={s.key} type="button" onClick={() => toggleNeed(s.key)}
                                                    className={`w-full text-left px-3 py-2 rounded-xl border-2 transition-all flex items-center gap-2.5 ${on ? 'border-sky-400/60 bg-sky-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                    <span className={`w-4 h-4 rounded border-2 shrink-0 flex items-center justify-center ${on ? 'bg-sky-400 border-sky-400' : 'border-white/20'}`}>
                                                        {on && <svg className="w-2.5 h-2.5 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>}
                                                    </span>
                                                    <span className="min-w-0 flex-1">
                                                        <span className={`block text-sm font-bold truncate ${on ? 'text-white' : 'text-white/55'}`}>{nombreCliente(s)}</span>
                                                        {s.required && <span className="text-[9px] font-black uppercase tracking-wider text-amber-300/80">Obligatoria</span>}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-white/30 text-[10px] mt-1.5">El enlace que recibe va filtrado a esto: no verá el resto de casillas.</p>
                                </div>
                            )}
                            {/* Destinatarios */}
                            <div className="space-y-2">
                                {recipientCard('cliente', 'Cliente', info?.recipients?.cliente?.name || 'Sin cliente vinculado', send.channel === 'whatsapp' ? info?.recipients?.cliente?.phone : null, !info?.recipients?.cliente)}
                                {recipientCard('instalador', 'Instalador', info?.recipients?.instalador?.name || 'Sin instalador asignado', send.channel === 'whatsapp' ? info?.recipients?.instalador?.phone : null, !info?.recipients?.instalador)}
                                {recipientCard('otro', 'Otro contacto', sel.has('otro') ? 'Escribe abajo el destino' : 'Introducir manualmente', null, false)}
                                {sel.has('otro') && (
                                    <input
                                        type={send.channel === 'whatsapp' ? 'tel' : 'email'}
                                        value={manual}
                                        onChange={e => setManual(e.target.value)}
                                        placeholder={send.channel === 'whatsapp' ? '+34 600 000 000' : 'correo@ejemplo.com'}
                                        className="w-full bg-white/[0.04] border-2 border-white/10 focus:border-amber-400 rounded-xl px-4 py-2.5 text-white text-sm outline-none"
                                    />
                                )}
                            </div>

                            {/* Mensaje editable */}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Mensaje (editable)</label>
                                <textarea
                                    value={message}
                                    onChange={e => { setMessage(e.target.value); setMsgTocado(true); }}
                                    rows={9}
                                    className="case-sensitive w-full bg-white/[0.04] border-2 border-white/10 focus:border-amber-400 rounded-xl px-4 py-3 text-white text-sm outline-none resize-none leading-relaxed"
                                />
                                <p className="text-white/30 text-[10px] mt-1.5">El enlace ya va incluido en el mensaje. No lo borres.</p>
                            </div>
                        </div>

                        <div className="px-5 py-4 bg-black/30 flex justify-end gap-3">
                            <button onClick={() => setSend(null)} disabled={sending} className="px-5 py-2 text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest disabled:opacity-50">Cancelar</button>
                            <button onClick={doSend} disabled={sending}
                                className={`px-6 py-2 text-xs font-black rounded-xl uppercase tracking-widest transition-all disabled:opacity-50 ${send.channel === 'whatsapp' ? 'bg-[#25D366] hover:bg-[#1eb554] text-white' : 'bg-amber-500 hover:bg-amber-400 text-black'}`}>
                                {sending ? 'Enviando…' : 'Enviar enlace'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DocsAdminModal;
