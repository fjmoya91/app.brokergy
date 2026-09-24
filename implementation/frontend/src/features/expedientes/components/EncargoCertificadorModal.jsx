// ============================================================================
// EncargoCertificadorModal.jsx — asignar el técnico y mandarle el encargo del CEE.
//
// UNA sola pieza para las DOS superficies desde las que se encarga:
//   · el módulo CEE del expediente (`CeeModule`), al elegir técnico;
//   · la pestaña Seguimiento, en la fila de "Aceptados y sin encargar el CEE".
// Vivía dentro de `CeeModule` y se sacó al necesitarlo la segunda pantalla: con dos
// copias, el encargo que sale desde la cola de trabajo acabaría diciendo otra cosa
// que el que sale desde el expediente (el mensaje, el aviso al cliente, o qué pasa
// con "Solo asignar").
//
// El BACKEND persiste el certificador (`notify-certificador` con `certificador_id`),
// así que quien llama no tiene que guardar nada antes. `onAntesDeEnviar` existe para
// el módulo CEE, que además tiene su propio estado sin guardar (XML, fechas…).
//
// ⚠️ `certAnterior` lo manda quien llama: justo antes de notificar, el módulo CEE ya
// ha persistido el técnico nuevo, así que el backend no puede deducir el cambio
// comparando contra la BD (ver "Asignar y REASIGNAR certificador" en CLAUDE.md).
// ============================================================================
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { MensajeEditable } from './MensajeEditable';
import { buildCertDefaultMessage } from '../logic/certMessages';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { CanalChip } from '../../../components/CanalChip';
import { telefonoDe, emailDe } from '../../../utils/contactoPrescriptor';

export function EncargoCertificadorModal({
    expedienteId,
    numExp,
    clienteNombre = '',
    ceeFolderLink = null,
    certificador,
    certAnterior = null,
    apiBase = '/api/expedientes',
    msgCtx = {},
    onAntesDeEnviar,
    // Lo que conviene saber ANTES de encargar (p.ej. que aún falta el material de
    // la vivienda). Se enseña arriba, en ámbar: no bloquea — hay técnicos que van a
    // la vivienda y hacen ellos las fotos —, pero sin decirlo se encarga a ciegas.
    avisoPrevio = null,
    onCerrar,
    onHecho,
}) {
    const certId = certificador?.id_empresa || null;
    const certName = certificador ? (certificador.razon_social || certificador.acronimo || '') : '';
    const certTel = telefonoDe(certificador);
    const certEmail = emailDe(certificador);

    const plantilla = () => buildCertDefaultMessage('standard', 'inicial', certName, clienteNombre,
        numExp, ceeFolderLink, expedienteId, { ctx: msgCtx });

    const [certNotifLoading, setCertNotifLoading] = useState(false);
    const [certNotifResult, setCertNotifResult] = useState(null);
    const [certPriority, setCertPriority] = useState('normal');
    const [certAdminMessage, setCertAdminMessage] = useState('');
    const [certAssignMessage, setCertAssignMessage] = useState(plantilla);
    const [certChannels, setCertChannels] = useState(['email']);
    // Si la pulsación fue "Asignar y notificar" o "Solo asignar": el overlay no puede
    // decir "Enviando encargo…" cuando no se manda nada.
    const [certNotifyMode, setCertNotifyMode] = useState(true);
    // Aviso al CLIENTE, que sale por el MISMO botón. El texto lo redacta el BACKEND
    // (fuente única en recordatorios.js); aquí solo se enseña y se puede retocar.
    const [avisoCliente, setAvisoCliente] = useState(null);
    const [avisarCliente, setAvisarCliente] = useState(false);
    const [clienteMessage, setClienteMessage] = useState('');
    const [clienteChannels, setClienteChannels] = useState(['whatsapp']);
    const [verMsgCliente, setVerMsgCliente] = useState(false);

    // Borrador del aviso al cliente. Se pasa el técnico elegido porque en un CEE
    // directo el aviso lo nombra, y aún no está guardado.
    useEffect(() => {
        if (!expedienteId || !certId) return undefined;
        let vivo = true;
        axios.get(`${apiBase}/${expedienteId}/aviso-cliente-cee?phase=initial&certificador_id=${encodeURIComponent(certId)}`)
            .then(r => {
                if (!vivo) return;
                const d = r.data || {};
                setAvisoCliente(d);
                setClienteMessage(d.mensaje || '');
                // Por WhatsApp, que es donde el cliente lee; si no consta teléfono, por email.
                setClienteChannels(d.tlf ? ['whatsapp'] : (d.email ? ['email'] : []));
                // Viene marcado salvo que no haya por dónde escribirle o que ya se le
                // avisara: reasignar técnico es el caso normal y el cliente no puede
                // enterarse dos veces de que su trámite acaba de empezar.
                setAvisarCliente(!!(d.tlf || d.email) && !d.avisadoEn);
            })
            .catch(() => { if (vivo) setAvisoCliente(null); });
        return () => { vivo = false; };
    }, [apiBase, expedienteId, certId]);

    const confirmar = async (notify) => {
        setCertNotifyMode(!!notify);

        const wantsEmail = notify && certChannels.includes('email');
        const wantsWA = notify && certChannels.includes('whatsapp');

        if (wantsEmail && !certEmail) {
            setCertNotifResult({ type: 'error', text: `${certName || 'El certificador'} no tiene email registrado en su ficha. Edítalo desde Prescriptores.` });
            return;
        }
        if (wantsWA && !certTel) {
            setCertNotifResult({ type: 'error', text: `${certName || 'El certificador'} no tiene teléfono registrado en su ficha. Edítalo desde Prescriptores.` });
            return;
        }
        if (notify && !wantsEmail && !wantsWA) {
            setCertNotifResult({ type: 'error', text: 'Selecciona al menos un canal (Email o WhatsApp).' });
            return;
        }

        if (onAntesDeEnviar) {
            try {
                await onAntesDeEnviar();
            } catch {
                setCertNotifResult({ type: 'error', text: 'No se pudo guardar el módulo. Inténtalo de nuevo.' });
                return;
            }
        }
        if (!expedienteId) {
            setCertNotifResult({ type: 'error', text: 'Expediente no disponible.' });
            return;
        }

        setCertNotifLoading(true);
        try {
            const { data } = await axios.post(`${apiBase}/${expedienteId}/notify-certificador`, {
                certificador_id: certId,
                certificador_anterior: certAnterior,
                sendEmail: wantsEmail,
                sendWhatsApp: wantsWA,
                phase: 'initial',
                template: 'standard',
                priority: certPriority,
                adminMessage: certAdminMessage.trim() || null,
                // Cuerpo editable del encargo. Solo aplica si se notifica.
                customMessage: notify ? (certAssignMessage.trim() || null) : null,
                // El aviso al cliente solo sale si de verdad sale el encargo: el texto
                // le dice que ya le hemos mandado las instrucciones al técnico.
                avisarCliente: !!notify && avisarCliente && clienteChannels.length > 0,
                clienteChannels,
                clienteMessage: clienteMessage.trim() || null,
                clienteAsunto: avisoCliente?.asunto || null,
            });

            // UNA LÍNEA POR HECHO: por dónde ha salido, a quién y si ya tiene la carpeta.
            const driveItem = data?.driveAccessGranted ? 'Acceso de edición a la carpeta CEE' : null;
            if (notify) {
                const items = (data?.channels || []).map(c => {
                    const low = String(c).toLowerCase();
                    if (low.includes('mail')) return `Email · ${data?.sentTo || certEmail || ''}`.trim();
                    if (low.includes('whats')) return `WhatsApp · ${certTel || ''}`.trim();
                    return String(c);
                });
                if (!items.length) items.push('Notificación enviada');
                if (data?.avisoCliente?.canales?.length) {
                    items.push(`Aviso al cliente${data.avisoCliente.nombre ? ` · ${data.avisoCliente.nombre}` : ''} · ${data.avisoCliente.canales.join(' + ')}`);
                }
                if (driveItem) items.push(driveItem);
                setCertNotifResult({ type: 'ok', title: certPriority === 'urgent' ? '¡Encargo urgente enviado!' : '¡Encargo enviado!', items });
            } else {
                setCertNotifResult({ type: 'ok', title: 'Certificador asignado', items: [`${certName || 'Certificador'} asignado al expediente`, ...(driveItem ? [driveItem] : [])] });
            }
            if (onHecho) onHecho({ notificado: !!notify });
        } catch (err) {
            const msg = err.response?.data?.error || (notify ? 'Error al enviar la notificación' : 'Error al asignar el certificador');
            setCertNotifResult({ type: 'error', text: msg });
        } finally {
            setCertNotifLoading(false);
        }
    };

    return (
            <>
            <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:items-end max-md:p-0" onClick={() => { if (!certNotifLoading && !certNotifResult) onCerrar(false); }}>
                {/* En móvil es una hoja inferior: cabecera fija con el técnico al que
                    asignas, UN solo eje de scroll y los dos botones pegados abajo
                    respetando el área segura. Con el popup centrado, el teclado al
                    editar el mensaje dejaba el botón de enviar fuera de la pantalla. */}
                <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md md:max-w-3xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto max-md:mx-0 max-md:p-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh] max-md:flex max-md:flex-col max-md:overflow-hidden" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center gap-3 mb-5 max-md:shrink-0 max-md:mb-0 max-md:px-5 max-md:pt-4 max-md:pb-3 max-md:border-b max-md:border-white/[0.06]">
                                <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                                    <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <h4 className="text-sm font-black text-white uppercase tracking-widest">Notificar Certificador</h4>
                                    <p className="text-[10px] text-white/40">Se asignará <span className="text-brand font-bold">{certName}</span> al expediente</p>
                                </div>
                            </div>
                            <div className="max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:px-5 max-md:py-4">
                            {avisoPrevio && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2.5 mb-4 text-[11px] text-amber-300 leading-snug">
                                    {avisoPrevio}
                                </div>
                            )}
                            <p className="text-xs text-white/60 mb-5">¿Deseas enviar un email de notificación al certificador con los datos del expediente y el enlace a la documentación?</p>

                            {/* Prioridad */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Prioridad</p>
                            <div className="flex gap-2 mb-4">
                                <button
                                    type="button"
                                    onClick={() => setCertPriority('normal')}
                                    disabled={certNotifLoading}
                                    className={`flex-1 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                        certPriority === 'normal'
                                            ? 'bg-brand/10 border-brand/30 text-brand'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >📋 Normal</button>
                                <button
                                    type="button"
                                    onClick={() => setCertPriority('urgent')}
                                    disabled={certNotifLoading}
                                    className={`flex-1 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                        certPriority === 'urgent'
                                            ? 'bg-red-500/10 border-red-500/40 text-red-400'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >🚨 Urgente</button>
                            </div>

                            {/* Los CANALES viven en la barra inferior, junto al botón:
                                mismo criterio que el popup de validar, y son los dos
                                popups del mismo interlocutor. */}

                            {/* Mensaje al certificador (previsualización editable, homogéneo con el popup de la campana) */}
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Mensaje al certificador</p>
                                <button
                                    type="button"
                                    onClick={() => setCertAssignMessage(plantilla())}
                                    disabled={certNotifLoading}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors disabled:opacity-40"
                                    title="Restaurar el texto por defecto"
                                >↺ Restaurar plantilla</button>
                            </div>
                            <MensajeEditable
                                value={certAssignMessage}
                                onChange={setCertAssignMessage}
                                disabled={certNotifLoading}
                                placeholder="Mensaje que se enviará al certificador…"
                                rows={8}
                                maxLength={2000}
                                focusClass="focus:border-brand/40"
                                className="mb-1"
                            />
                            <div className="flex items-center justify-between mb-4">
                                <p className="text-[9px] text-white/25 leading-snug">Puedes editarlo libremente. Solo se envía si pulsas «Asignar y notificar».</p>
                                <p className="text-[9px] text-white/20 shrink-0 ml-3">{certAssignMessage.length}/2000</p>
                            </div>

                            {/* Notas internas adicionales (se añaden al mensaje y al historial).
                                Van con `case-sensitive` (index.css, con !important): la regla
                                global pone en MAYÚSCULAS todo `textarea`, y aquí se le escribe
                                a una persona, no se rellena un dato de formulario. */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Mensaje adicional (opcional)</p>
                            <textarea
                                value={certAdminMessage}
                                onChange={e => setCertAdminMessage(e.target.value)}
                                disabled={certNotifLoading}
                                placeholder="Indicaciones específicas para el certificador (se incluyen en el email/WhatsApp y se registran en el historial)…"
                                rows={3}
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white case-sensitive placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none mb-5"
                            />

                            {/* ── Aviso al CLIENTE, por el MISMO botón ──────────────────
                                Encargar el CEE es el primer movimiento del expediente y el
                                cliente no se enteraba: la primera noticia que tenía era la
                                llamada de un técnico que nadie le había anunciado.
                                El mensaje viene PLEGADO — casi nunca se edita, y enseñarlo
                                entero solo aleja el botón de enviar. */}
                            {avisoCliente && (
                                <div className={`rounded-xl border p-3 mb-5 transition-colors ${avisarCliente ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.07] bg-black/20'}`}>
                                    <label className="flex items-start gap-3 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={avisarCliente}
                                            disabled={certNotifLoading || (!avisoCliente.tlf && !avisoCliente.email)}
                                            onChange={e => setAvisarCliente(e.target.checked)}
                                            className="mt-0.5 w-4 h-4 shrink-0 accent-emerald-500 disabled:opacity-40"
                                        />
                                        <span className="min-w-0">
                                            <span className="block text-[11px] font-black text-white uppercase tracking-widest">Avisar también al cliente</span>
                                            <span className="block text-[10px] text-white/40 leading-snug mt-0.5">
                                                {(!avisoCliente.tlf && !avisoCliente.email)
                                                    ? 'El cliente no tiene teléfono ni email en su ficha.'
                                                    : `Le decimos que el trámite ha arrancado y que le avisaremos cuando el CEE esté registrado${avisoCliente.nombre ? ` · ${avisoCliente.nombre}` : ''}`}
                                            </span>
                                        </span>
                                    </label>

                                    {/* Ya avisado: no se bloquea (puede hacer falta reenviarlo),
                                        pero se dice — y por eso no viene marcado. */}
                                    {avisoCliente.avisadoEn && (
                                        <p className="text-[10px] text-amber-400/80 mt-2 ml-7 leading-snug">
                                            ⚠️ Ya se le avisó el {new Date(avisoCliente.avisadoEn).toLocaleDateString('es-ES')}
                                            {avisoCliente.avisadoA ? ` a ${avisoCliente.avisadoA}` : ''}. Márcalo solo si quieres repetirlo.
                                        </p>
                                    )}

                                    {avisarCliente && (
                                        <div className="mt-3 ml-7">
                                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                <CanalChip
                                                    canal="whatsapp" nombre="WhatsApp"
                                                    activo={clienteChannels.includes('whatsapp')}
                                                    disponible={!!avisoCliente.tlf}
                                                    detalle={avisoCliente.tlf}
                                                    motivo="no consta en su ficha"
                                                    bloqueado={certNotifLoading}
                                                    onClick={() => setClienteChannels(prev => prev.includes('whatsapp') ? prev.filter(c => c !== 'whatsapp') : [...prev, 'whatsapp'])}
                                                />
                                                <CanalChip
                                                    canal="email" nombre="Email"
                                                    activo={clienteChannels.includes('email')}
                                                    disponible={!!avisoCliente.email}
                                                    detalle={avisoCliente.email}
                                                    motivo="no consta en su ficha"
                                                    bloqueado={certNotifLoading}
                                                    onClick={() => setClienteChannels(prev => prev.includes('email') ? prev.filter(c => c !== 'email') : [...prev, 'email'])}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setVerMsgCliente(v => !v)}
                                                    className="ml-auto text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-brand transition-colors"
                                                >{verMsgCliente ? 'Ocultar mensaje' : '👁 Ver el mensaje'}</button>
                                            </div>
                                            {clienteChannels.length === 0 && (
                                                <p className="text-[10px] text-amber-400/80 mb-2">Elige un canal o desmarca el aviso.</p>
                                            )}
                                            {verMsgCliente && (
                                                <>
                                                    <MensajeEditable
                                                        value={clienteMessage}
                                                        onChange={setClienteMessage}
                                                        disabled={certNotifLoading}
                                                        placeholder="Mensaje que recibirá el cliente…"
                                                        rows={10}
                                                        maxLength={2000}
                                                        focusClass="focus:border-emerald-500/40"
                                                    />
                                                    <div className="flex items-center justify-between mt-1">
                                                        <button
                                                            type="button"
                                                            onClick={() => setClienteMessage(avisoCliente.mensaje || '')}
                                                            disabled={certNotifLoading}
                                                            className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors disabled:opacity-40"
                                                        >↺ Restaurar plantilla</button>
                                                        <p className="text-[9px] text-white/20 shrink-0 ml-3">{clienteMessage.length}/2000</p>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            </div>

                            {/* Barra inferior: los canales y, pegado a ellos, lo único
                                irreversible. El email y el teléfono se leen DENTRO de
                                la píldora de cada canal. */}
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between max-md:shrink-0 max-md:px-5 max-md:pt-3 max-md:pb-4 max-md:border-t max-md:border-white/[0.06] max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                <div className="flex items-center gap-2">
                                    <CanalChip
                                        canal="email" nombre="Email"
                                        activo={certChannels.includes('email')}
                                        disponible={!!certEmail}
                                        detalle={certEmail}
                                        motivo="no consta en su ficha"
                                        bloqueado={certNotifLoading}
                                        onClick={() => setCertChannels(prev => prev.includes('email') ? prev.filter(c => c !== 'email') : [...prev, 'email'])}
                                    />
                                    <CanalChip
                                        canal="whatsapp" nombre="WhatsApp"
                                        activo={certChannels.includes('whatsapp')}
                                        disponible={!!certTel}
                                        detalle={certTel}
                                        motivo="no consta en su ficha"
                                        bloqueado={certNotifLoading}
                                        onClick={() => setCertChannels(prev => prev.includes('whatsapp') ? prev.filter(c => c !== 'whatsapp') : [...prev, 'whatsapp'])}
                                    />
                                </div>
                                <div className="flex gap-3 shrink-0">
                                <button
                                    onClick={() => confirmar(false)}
                                    disabled={certNotifLoading}
                                    className="flex-1 sm:flex-none px-4 py-2.5 max-md:py-3.5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
                                >Solo asignar</button>
                                <button
                                    onClick={() => confirmar(true)}
                                    disabled={certNotifLoading}
                                    className={`flex-1 sm:flex-none px-5 py-2.5 max-md:py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                                        certPriority === 'urgent'
                                            ? 'bg-red-500 text-white shadow-red-500/30'
                                            : 'bg-brand text-black'
                                    }`}
                                >
                                    {certNotifLoading ? (
                                        <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Enviando...</>
                                    ) : (certPriority === 'urgent' ? '🚨 Asignar y avisar URGENTE' : 'Asignar y notificar')}
                                </button>
                                </div>
                            </div>
                </div>
            </div>
            {/* Resultado del encargo — overlay ESTÁNDAR de la app (enviando → ✓/✗
                con confeti y filete de marca). Es el MISMO que usan «Solicitar lo
                que falta» y el reenvío de notificaciones: un envío no puede
                contarse de una manera aquí y de otra allí. Va POR ENCIMA del
                formulario (z-[600]) para que, al fallar, «Volver e intentar de
                nuevo» devuelva lo escrito intacto en vez de cerrarlo todo. */}
            <SendActionOverlay
                phase={certNotifLoading ? 'sending' : (certNotifResult ? 'done' : null)}
                ok={certNotifResult?.type === 'ok'}
                subtitle={[numExp, certName].filter(Boolean).join(' · ')}
                items={certNotifResult?.items || []}
                errorText={certNotifResult?.type === 'error' ? certNotifResult.text : ''}
                sendingTitle={certNotifyMode ? 'Enviando encargo…' : 'Asignando certificador…'}
                okTitle={certNotifResult?.title || '¡Encargo enviado!'}
                errorTitle={certNotifyMode ? 'No se pudo enviar el encargo' : 'No se pudo asignar'}
                onClose={() => {
                    if (certNotifResult?.type === 'ok') onCerrar(true);
                    else setCertNotifResult(null);
                }}
            />
            </>
    );
}
