import React, { useState, useEffect } from 'react';
import axios from 'axios';

// ─── SolicitarFaltantesModal ─────────────────────────────────────────────────
// Genera un mensaje (editable, para revisar) por destinatario —Cliente / Instalador—
// con SOLO lo que falta de cada uno, mapeado a su flujo público correcto:
//   · IBAN + justificante + firma de anexos → /firmar-anexos/:id
//   · Certificado RITE → /subir-rite/:id     · CIFO firmado → /subir-cifo/:id
//   · Factura y fotos de obra → /subir-docs?rol=instalador&need=…
//   · Fotos del estado previo → /subir-docs?rol=cliente&need=…
// Cada enlace de subida lleva ?need= para que el destinatario vea únicamente los
// slots pendientes. El envío (WhatsApp/Email) queda registrado en el historial.

const RECIPIENTS = [
    { id: 'CLIENTE', key: 'cliente', label: 'Cliente' },
    { id: 'INSTALADOR', key: 'instalador', label: 'Instalador' },
];

function buildMessage({ nombre, numExp, acciones, obra, target }) {
    const saludo = `Hola${nombre ? ` ${nombre}` : ''} 👋`;
    // Para el instalador (lleva varias obras a la vez) indicamos cliente + dirección.
    const obraLine = (target === 'INSTALADOR' && obra && (obra.cliente || obra.direccion))
        ? `\n\n📍 Obra de *${obra.cliente || '—'}*${obra.direccion ? ` — ${obra.direccion}` : ''}\nExpediente ${numExp || ''}`
        : '';
    if (!acciones || acciones.length === 0) {
        return `${saludo}${obraLine}\n\nDe momento no hay nada pendiente${target === 'INSTALADOR' ? '' : ' por tu parte'} en el expediente ${numExp || ''}.\n\nBROKERGY — Ingeniería Energética`;
    }
    const intro = target === 'INSTALADOR'
        ? `Para avanzar con esta obra necesitamos lo siguiente:`
        : `Para avanzar con tu expediente ${numExp || ''} necesitamos lo siguiente:`;
    const blocks = acciones.map((a, i) => {
        // Si al instalador le relayamos una acción del cliente → tercera persona.
        const relay = target === 'INSTALADOR' && a.owner === 'CLIENTE';
        const titulo = relay ? (a.tituloRelay || a.titulo) : a.titulo;
        const nota = relay ? (a.notaRelay || a.nota) : a.nota;
        const items = (a.items || []).map(it => `   • ${it}`).join('\n');
        const notaStr = nota ? `\n${nota}` : '';
        const linkLine = relay ? `🔗 Enlace para el cliente: ${a.url}` : `👉 ${a.url}`;
        return `${i + 1}) ${titulo}:\n${items}${notaStr}\n${linkLine}`;
    }).join('\n\n');
    return `${saludo}${obraLine}\n\n${intro}\n\n${blocks}\n\nGracias.\nBROKERGY — Ingeniería Energética`;
}

export function SolicitarFaltantesModal({ isOpen, onClose, expedienteId, numeroExpediente }) {
    const [info, setInfo] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [active, setActive] = useState('CLIENTE');
    const [messages, setMessages] = useState({ CLIENTE: '', INSTALADOR: '' });
    const [channels, setChannels] = useState({ CLIENTE: [], INSTALADOR: [] });
    // Destinatario editable (tlf/email): por defecto la persona de notificaciones,
    // pero el admin puede dirigirlo a otro número/correo.
    const [dest, setDest] = useState({ CLIENTE: { nombre: '', tlf: '', email: '' }, INSTALADOR: { nombre: '', tlf: '', email: '' } });
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState({ CLIENTE: null, INSTALADOR: null });
    // "Trato todo con el instalador": al instalador se le piden también las cosas del cliente.
    const [todoAlInstalador, setTodoAlInstalador] = useState(false);

    useEffect(() => {
        if (!isOpen || !expedienteId) return;
        setLoading(true); setError(null); setResult({ CLIENTE: null, INSTALADOR: null }); setTodoAlInstalador(false);
        axios.get(`/api/expedientes/${expedienteId}/solicitud-info`)
            .then(({ data }) => {
                setInfo(data);
                const numExp = data.numero_expediente || numeroExpediente;
                const msgs = {}, chs = {}, dst = {};
                for (const r of RECIPIENTS) {
                    const c = data[r.key] || {};
                    msgs[r.id] = buildMessage({ nombre: c.nombre, numExp, acciones: c.acciones, obra: data.obra, target: r.id });
                    chs[r.id] = [c.tlf && 'whatsapp', c.email && 'email'].filter(Boolean);
                    dst[r.id] = { nombre: c.nombre || '', tlf: c.tlf || '', email: c.email || '' };
                }
                setMessages(msgs);
                setChannels(chs);
                setDest(dst);
                // Empezar en el destinatario que tenga pendientes.
                const cliN = (data.cliente?.acciones || []).length;
                setActive(cliN > 0 ? 'CLIENTE' : ((data.instalador?.acciones || []).length > 0 ? 'INSTALADOR' : 'CLIENTE'));
            })
            .catch(e => setError(e.response?.data?.error || 'No se pudo cargar la información de contacto.'))
            .finally(() => setLoading(false));
    }, [isOpen, expedienteId]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!isOpen) return null;

    const rk = RECIPIENTS.find(r => r.id === active)?.key;
    const c = info?.[rk] || {};
    const dst = dest[active] || { nombre: '', tlf: '', email: '' };
    const cliAcciones = info?.cliente?.acciones || [];
    const insAcciones = info?.instalador?.acciones || [];
    // Acciones efectivas del destinatario activo (instalador puede englobar las del cliente).
    const acciones = (active === 'INSTALADOR' && todoAlInstalador) ? [...cliAcciones, ...insAcciones] : (c.acciones || []);
    const actChannels = channels[active] || [];
    const sinPendientes = !loading && acciones.length === 0;
    const puedeTodoInstalador = cliAcciones.length > 0;

    const toggleChannel = (ch) => setChannels(prev => ({
        ...prev,
        [active]: prev[active].includes(ch) ? prev[active].filter(x => x !== ch) : [...prev[active], ch],
    }));

    // Activa/desactiva "pedir todo al instalador" y regenera su mensaje.
    const toggleTodoInstalador = () => {
        setTodoAlInstalador(prev => {
            const next = !prev;
            const numExp = info?.numero_expediente || numeroExpediente;
            const acc = next ? [...cliAcciones, ...insAcciones] : insAcciones;
            setMessages(m => ({ ...m, INSTALADOR: buildMessage({ nombre: dst.nombre, numExp, acciones: acc, obra: info?.obra, target: 'INSTALADOR' }) }));
            return next;
        });
    };

    // Regenera el mensaje del destinatario activo con el nombre/datos actuales
    // (no se hace automáticamente para no pisar ediciones manuales).
    const regenMessage = () => {
        const numExp = info?.numero_expediente || numeroExpediente;
        const acc = active === 'INSTALADOR'
            ? (todoAlInstalador ? [...cliAcciones, ...insAcciones] : insAcciones)
            : cliAcciones;
        setMessages(m => ({ ...m, [active]: buildMessage({ nombre: dest[active]?.nombre, numExp, acciones: acc, obra: info?.obra, target: active }) }));
    };

    const handleSend = async () => {
        // Solo canales con dato disponible (tlf para WhatsApp, email para Email).
        const eff = actChannels.filter(ch => ch === 'whatsapp' ? !!dst.tlf : !!dst.email);
        if (!eff.length) { setResult(p => ({ ...p, [active]: { type: 'error', text: 'Indica un teléfono o email y selecciona el canal.' } })); return; }
        setSending(true);
        setResult(p => ({ ...p, [active]: null }));
        try {
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/solicitar-faltantes`, {
                target: active,
                channels: eff,
                mensaje: messages[active],
                tlf: dst.tlf || null,
                email: dst.email || null,
                nombre: dst.nombre || null,
                solicitado: acciones.flatMap(a => a.items || []),
                asunto: `Documentación pendiente · Expediente ${info?.numero_expediente || numeroExpediente || ''}`.trim(),
            });
            setResult(p => ({ ...p, [active]: { type: 'ok', text: `Enviado vía ${(data.channels || []).join(' + ')}${data.sentTo ? ` (${data.sentTo})` : ''}.` } }));
        } catch (e) {
            setResult(p => ({ ...p, [active]: { type: 'error', text: e.response?.data?.error || 'Error al enviar.' } }));
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4" onClick={() => { if (!sending) onClose(); }}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="p-5 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Solicitar lo que falta</h3>
                        <p className="text-[10px] text-white/40">Mensaje + enlaces · Expediente <span className="text-brand font-bold">{info?.numero_expediente || numeroExpediente || ''}</span></p>
                    </div>
                    <button onClick={onClose} className="w-9 h-9 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all">
                        <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Selector de destinatario */}
                <div className="px-5 pt-4">
                    <div className="grid grid-cols-2 gap-2 p-1 bg-white/[0.03] rounded-xl border border-white/10">
                        {RECIPIENTS.map(r => {
                            const n = (info?.[r.key]?.acciones || []).length;
                            return (
                                <button key={r.id} onClick={() => setActive(r.id)}
                                    className={`py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${active === r.id ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-white/40 hover:text-white/70'}`}>
                                    {r.label}
                                    {n > 0 && <span className={`text-[8px] px-1.5 py-0.5 rounded-full ${active === r.id ? 'bg-black/20' : 'bg-amber-500/20 text-amber-400'}`}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Cuerpo */}
                <div className="p-5 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-10 gap-3 text-white/40">
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">Cargando…</span>
                        </div>
                    ) : error ? (
                        <div className="px-4 py-3 rounded-xl border border-red-400/20 bg-red-500/[0.06] text-[12px] text-red-400">⚠️ {error}</div>
                    ) : (
                        <>
                            {/* Destinatario (editable) — por defecto la persona de notificaciones */}
                            <div className="flex items-center justify-between mb-1.5">
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Destinatario</p>
                                <button type="button" onClick={regenMessage}
                                    className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors flex items-center gap-1">
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    Regenerar mensaje
                                </button>
                            </div>
                            <div className="space-y-2 mb-4">
                                <input value={dst.nombre}
                                    onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], nombre: e.target.value } }))}
                                    placeholder="Nombre de a quién te diriges"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                <div className="grid grid-cols-2 gap-2">
                                    <input value={dst.tlf}
                                        onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], tlf: e.target.value } }))}
                                        placeholder="Teléfono"
                                        className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                    <input value={dst.email}
                                        onChange={e => setDest(p => ({ ...p, [active]: { ...p[active], email: e.target.value } }))}
                                        placeholder="Email"
                                        className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder:text-white/25 focus:outline-none focus:border-brand/40" />
                                </div>
                                <p className="text-[9px] text-white/25">Cambia el nombre/teléfono para dirigirlo a otra persona y pulsa "Regenerar mensaje".</p>
                            </div>

                            {/* Trato todo con el instalador → incluir lo del cliente */}
                            {active === 'INSTALADOR' && puedeTodoInstalador && (
                                <button type="button" onClick={toggleTodoInstalador}
                                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 mb-4 rounded-xl border text-left transition-all ${todoAlInstalador ? 'bg-brand/10 border-brand/30' : 'bg-white/[0.02] border-white/10 hover:border-white/20'}`}>
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${todoAlInstalador ? 'bg-brand border-brand' : 'border-white/20'}`}>
                                        {todoAlInstalador && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                    </div>
                                    <span className={`text-[10px] font-black uppercase tracking-wider ${todoAlInstalador ? 'text-brand' : 'text-white/50'}`}>
                                        Pedir también lo del cliente (trato todo con el instalador)
                                    </span>
                                </button>
                            )}

                            {/* Resumen de acciones */}
                            {sinPendientes ? (
                                <div className="px-4 py-3 mb-1 rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] text-[12px] text-emerald-300">
                                    ✓ No hay nada pendiente por parte {active === 'CLIENTE' ? 'del cliente' : 'del instalador'}.
                                </div>
                            ) : (
                                <div className="mb-4 space-y-1.5">
                                    {acciones.map((a, i) => (
                                        <div key={i} className="flex items-start gap-2 text-[11px] text-white/55">
                                            <span className="text-brand font-black shrink-0">{i + 1}.</span>
                                            <span><strong className="text-white/75">{a.titulo}</strong> — {(a.items || []).join(', ')}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Aviso de datos que completa Brokergy (cliente) */}
                            {active === 'CLIENTE' && (info?.cliente?.adminPendiente?.length > 0) && (
                                <p className="text-[10px] text-amber-400/70 mb-4">⚠️ Pendiente de completar por Brokergy (no se solicita al cliente): {info.cliente.adminPendiente.join(', ')}.</p>
                            )}

                            {/* Canales */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Enviar por</p>
                            <div className="flex gap-2 mb-4">
                                <button type="button" disabled={!dst.tlf || sinPendientes} onClick={() => toggleChannel('whatsapp')}
                                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${actChannels.includes('whatsapp') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-white/5 text-white/30 hover:text-white/50'}`}>
                                    💬 WhatsApp
                                </button>
                                <button type="button" disabled={!dst.email || sinPendientes} onClick={() => toggleChannel('email')}
                                    className={`flex-1 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border disabled:opacity-30 disabled:cursor-not-allowed ${actChannels.includes('email') ? 'bg-brand/10 border-brand/30 text-brand' : 'border-white/5 text-white/30 hover:text-white/50'}`}>
                                    ✉️ Email
                                </button>
                            </div>

                            {/* Mensaje editable */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Mensaje (editable)</p>
                            <textarea
                                value={messages[active]}
                                onChange={e => setMessages(prev => ({ ...prev, [active]: e.target.value }))}
                                rows={13}
                                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white/90 leading-relaxed focus:outline-none focus:border-brand/40 resize-y font-mono"
                            />

                            {result[active] && (
                                <div className={`mt-4 px-4 py-2.5 rounded-xl text-[12px] font-bold border ${result[active].type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
                                    {result[active].type === 'ok' ? '✓ ' : '⚠️ '}{result[active].text}
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                {!loading && !error && (
                    <div className="p-5 border-t border-white/10 flex items-center justify-between gap-3">
                        <button onClick={() => navigator.clipboard?.writeText(messages[active])}
                            className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all">
                            Copiar mensaje
                        </button>
                        <button onClick={handleSend} disabled={sending || !actChannels.length || sinPendientes}
                            className="flex-1 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg shadow-brand/20 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                            {sending ? (
                                <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" /> Enviando…</>
                            ) : `Enviar a ${RECIPIENTS.find(r => r.id === active)?.label}`}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default SolicitarFaltantesModal;
