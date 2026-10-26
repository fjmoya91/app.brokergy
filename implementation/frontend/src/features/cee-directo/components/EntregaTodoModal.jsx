import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { useAuth } from '../../../context/AuthContext';

// ─── «Entregar todo»: los dos certificados de un DOBLE en UN mensaje ─────────
// Fran, 25/10/2026: «1. CEE inicial 2. etiqueta del inicial 3. CEE final
// 4. etiqueta del final 5. guía IRPF. Todo en un único mensaje». El texto lista
// los adjuntos en ese orden y es editable; por WhatsApp va el texto y detrás cada
// PDF numerado. Sella las dos fases: la entrega automática ya no repite.
// Ver services/ceeDirectoEntrega.js (`borradorTodo`, `entregarTodo`).

const API = '/api/cee-directos';

const fecha = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' });

export function EntregaTodoModal({ isOpen, onClose, id, onEnviado }) {
    const { user } = useAuth();
    const isAdmin = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';

    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [canales, setCanales] = useState(['whatsapp', 'email']);
    const [texto, setTexto] = useState('');
    const [tocado, setTocado] = useState(false);
    const [sinCobro, setSinCobro] = useState(false);
    const [overlay, setOverlay] = useState({ phase: null });

    useEffect(() => {
        if (!isOpen || !id) return;
        let vivo = true;
        setDatos(null); setError(null); setTocado(false); setSinCobro(false);
        axios.get(`${API}/${id}/entrega-todo`)
            .then(({ data }) => {
                if (!vivo) return;
                setDatos(data);
                setTexto(data.mensaje || '');
                setCanales([data.destinatario?.tlf && 'whatsapp', data.destinatario?.email && 'email'].filter(Boolean));
            })
            .catch(e => vivo && setError(e.response?.data?.error || 'No se pudo preparar la entrega'));
        return () => { vivo = false; };
    }, [isOpen, id]);

    if (!isOpen) return null;

    const d = datos?.destinatario;
    // Lo único que se puede saltar es el cobro, y solo un ADMIN marcándolo.
    const listo = datos && (datos.puede || (sinCobro && datos.soloFaltaCobro));
    const toggleCanal = (c) => setCanales(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]));
    const puedeEnviar = listo && canales.length > 0 && texto.trim() && overlay.phase !== 'sending';

    const enviar = async () => {
        if (!puedeEnviar) return;
        setOverlay({ phase: 'sending' });
        try {
            const { data } = await axios.post(`${API}/${id}/entrega-todo`, {
                channels: canales, mensaje: tocado ? texto : null,
                reenviar: !!datos.yaEntregado, sinCobro: sinCobro && datos.soloFaltaCobro
            }, { timeout: 180000 });
            const items = [`A ${data.destinatario?.nombre || 'el cliente'} por ${data.canales.join(' y ')}`];
            data.ficheros.forEach((f, i) => items.push({ texto: `${i + 1}. ${f}`, tono: 'ok' }));
            (data.errores || []).forEach(e => items.push({ texto: e, tono: 'aviso' }));
            setOverlay({ phase: 'done', ok: true, items });
            onEnviado?.();
        } catch (e) {
            const r = e.response?.data;
            setOverlay({ phase: 'done', ok: false, errorText: r?.faltan?.join(' · ') || r?.errores?.join(' · ') || r?.error || 'No se ha enviado' });
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[540] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">📦 Entregar todo junto</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            {datos ? `${datos.numero} · CEE inicial y final en un solo mensaje` : 'Preparando…'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {!datos && !error && <p className="text-[11px] text-white/40 normal-case">Preparando la entrega (los ficheros y la guía)…</p>}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300 normal-case leading-snug">{error}</div>
                    )}

                    {datos && (
                        <>
                            {datos.faltan.length > 0 && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3">
                                    <div className="text-[11px] font-bold text-amber-300 normal-case">Todavía no se puede entregar:</div>
                                    <ul className="mt-1 space-y-0.5">
                                        {datos.faltan.map((f, i) => <li key={i} className="text-[11px] text-amber-300/80 normal-case">• {f}</li>)}
                                    </ul>
                                    {isAdmin && datos.soloFaltaCobro && (
                                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                            <input type="checkbox" className="accent-[#f59e0b] w-4 h-4" checked={sinCobro} onChange={e => setSinCobro(e.target.checked)} />
                                            <span className="text-[11px] text-amber-200 normal-case">Entregar sin esperar al pago</span>
                                        </label>
                                    )}
                                </div>
                            )}
                            {datos.yaEntregado ? (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] text-white/55 normal-case leading-snug">
                                    Ya tiene los dos: el inicial desde el {fecha(datos.yaEntregado.inicial.at)} y el final desde el {fecha(datos.yaEntregado.final.at)}. Si sigues, le llega todo otra vez.
                                </div>
                            ) : (datos.entregadas.inicial || datos.entregadas.final) && (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] text-white/55 normal-case leading-snug">
                                    El {datos.entregadas.inicial ? 'inicial' : 'final'} ya se le entregó el {fecha((datos.entregadas.inicial || datos.entregadas.final).at)}: con esto le llega el juego completo.
                                </div>
                            )}

                            {/* A quién */}
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">Para</div>
                                <div className="text-[12px] text-white font-bold normal-case">
                                    {d?.nombre || 'El cliente'}
                                    {d?.partner && <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-brand">partner · se le facturó{d.factura ? ` la ${d.factura}` : ''}</span>}
                                </div>
                                <div className="text-[11px] text-white/40 normal-case">
                                    {[d?.tlf, d?.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email: complétalo en la ficha'}
                                </div>
                                <div className="flex gap-2 mt-3">
                                    {[['whatsapp', '💬 WhatsApp', d?.tlf], ['email', '✉ Email', d?.email]].map(([c, label, hay]) => (
                                        <button key={c} type="button" disabled={!hay} onClick={() => toggleCanal(c)}
                                            className={`flex-1 min-h-[40px] rounded-xl border text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-30 ${
                                                canales.includes(c) ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 text-white/40 hover:text-white'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Los adjuntos, en el orden en que llegan */}
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1.5">Adjuntos, en este orden</div>
                                <ol className="space-y-1">
                                    {datos.adjuntos.map((a, i) => (
                                        <li key={i} className="text-[11px] normal-case leading-snug">
                                            <span className="text-white/80 font-bold">{i + 1}. {a.etiqueta.charAt(0).toUpperCase() + a.etiqueta.slice(1)}</span>
                                            <span className={`block ${a.fichero ? 'text-white/35' : 'text-amber-400/80'}`}>{a.fichero || 'falta en Drive'}</span>
                                        </li>
                                    ))}
                                </ol>
                                {!datos.guia?.va && datos.guia?.comparable && (
                                    <div className="text-[10px] text-white/35 normal-case mt-2">La guía de la Renta no irá: {datos.guia.motivo}</div>
                                )}
                                {datos.guia?.va && datos.guia.avisos?.length > 0 && (
                                    <div className="text-[10px] text-amber-300/80 normal-case mt-2">⚠️ La guía tiene {datos.guia.avisos.length === 1 ? '1 cosa' : `${datos.guia.avisos.length} cosas`} que revisar: míralo en «Revisar la guía» del CEE final.</div>
                                )}
                            </div>

                            {/* El texto */}
                            <div>
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1.5">Mensaje (editable)</div>
                                <textarea value={texto} rows={14}
                                          onChange={e => { setTexto(e.target.value); setTocado(true); }}
                                          className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[12px] text-white/85 font-mono leading-relaxed normal-case focus:outline-none focus:border-brand/50" />
                                <p className="text-[10px] text-white/30 normal-case mt-1">
                                    Por WhatsApp: este texto y detrás los PDF, numerados. Por email: un solo correo con todo adjunto (sin los asteriscos).
                                </p>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 flex gap-2">
                    <button type="button" onClick={onClose}
                            className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                        Ahora no
                    </button>
                    <button type="button" onClick={enviar} disabled={!puedeEnviar}
                            className={`flex-1 min-h-[44px] px-4 rounded-xl text-bkg-deep text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-40 ${
                                datos?.yaEntregado || (sinCobro && !datos?.puede) ? 'bg-amber-500' : 'bg-brand hover:bg-brand-700'}`}>
                        {datos?.yaEntregado ? 'Reenviarlo todo' : sinCobro && !datos?.puede ? 'Enviar todo sin cobrar' : 'Enviar todo'}
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                items={overlay.items}
                errorText={overlay.errorText}
                subtitle={datos ? `${datos.numero} · CEE inicial y final` : ''}
                sendingTitle="Enviando los certificados…"
                okTitle="Entregado"
                errorTitle="No se ha enviado"
                onClose={() => { const ok = overlay.ok; setOverlay({ phase: null }); if (ok) onClose?.(); }}
            />
        </div>,
        document.body
    );
}

export default EntregaTodoModal;
