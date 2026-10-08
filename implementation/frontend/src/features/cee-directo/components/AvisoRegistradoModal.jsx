import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { useAuth } from '../../../context/AuthContext';

// ─── «Ya está registrado»: avisar al cliente, con o sin la FACTURA ───────────
// Se abre desde el panel de entrega o desde el enlace del aviso que te llega
// cuando se sube el registro (`?cee=<id>&avisar=<fase>`). Al cliente no se le
// escribe solo: aquí se decide.
//
// · El destinatario es la PERSONA DE CONTACTO si el cliente la tiene.
// · Con «Emitir la factura» se emite la de por defecto (o se adjunta la ya
//   emitida) y el mensaje dice que los certificados se envían una vez abonada y
//   pide el justificante de pago. Al marcar cobrado, la entrega sale sola.
// Ver services/ceeDirectoEntrega.js (`avisarRegistrado`, `borradorAviso`).

const API = '/api/cee-directos';

const eur = (n) => (n == null ? '' : `${Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);

export function AvisoRegistradoModal({ isOpen, onClose, id, fase, onEnviado }) {
    const { user } = useAuth();
    const isAdmin = (user?.rol || user?.rol_nombre || '').toUpperCase() === 'ADMIN';

    const [datos, setDatos] = useState(null);
    const [error, setError] = useState(null);
    const [conFactura, setConFactura] = useState(false);
    const [canales, setCanales] = useState(['whatsapp', 'email']);
    const [texto, setTexto] = useState('');
    const [tocado, setTocado] = useState(false);
    const [overlay, setOverlay] = useState({ phase: null });

    useEffect(() => {
        if (!isOpen || !id) return;
        let vivo = true;
        setDatos(null); setError(null); setTocado(false);
        axios.get(`${API}/${id}/aviso-registrado`, { params: { phase: fase } })
            .then(({ data }) => {
                if (!vivo) return;
                setDatos(data);
                // Por defecto, CON factura si se puede: es lo que toca al registrar.
                const puedeFactura = !!data.textos?.conFactura;
                setConFactura(puedeFactura);
                setTexto(puedeFactura ? data.textos.conFactura : data.textos.sinFactura);
                setCanales([data.destinatario?.tlf && 'whatsapp', data.destinatario?.email && 'email'].filter(Boolean));
            })
            .catch(e => vivo && setError(e.response?.data?.error || 'No se pudo preparar el aviso'));
        return () => { vivo = false; };
    }, [isOpen, id, fase]);

    if (!isOpen) return null;

    const f = datos?.factura;
    const puedeFactura = !!datos?.textos?.conFactura;

    // Cambiar la factura cambia el texto, salvo que ya lo hayas retocado a mano.
    const elegirFactura = (v) => {
        setConFactura(v);
        if (!tocado && datos) setTexto(v ? datos.textos.conFactura : datos.textos.sinFactura);
    };
    const toggleCanal = (c) => setCanales(p => (p.includes(c) ? p.filter(x => x !== c) : [...p, c]));

    const puedeEnviar = datos && canales.length > 0 && texto.trim() && overlay.phase !== 'sending'
        && (datos.destinatario?.tlf || datos.destinatario?.email);

    const enviar = async () => {
        if (!puedeEnviar) return;
        setOverlay({ phase: 'sending' });
        try {
            const { data } = await axios.post(`${API}/${id}/aviso-registrado`,
                { phase: fase, channels: canales, factura: conFactura, mensaje: tocado ? texto : null }, { timeout: 120000 });
            const items = [`A ${datos.destinatario.nombre || 'el cliente'} por ${data.canales.join(' y ')}`];
            if (data.factura) {
                items.push({ texto: `Factura ${data.factura.numero}${data.factura.emitida ? ' emitida ahora' : ''} · ${eur(data.factura.total)} · adjunta`, tono: 'ok' });
            }
            items.push({ texto: 'Al marcarlo cobrado, el certificado sale solo con el registro y la etiqueta', tono: 'info' });
            setOverlay({ phase: 'done', ok: true, items });
            onEnviado?.();
        } catch (e) {
            setOverlay({ phase: 'done', ok: false, errorText: e.response?.data?.error || 'No se ha enviado el aviso' });
        }
    };

    const d = datos?.destinatario;

    return createPortal(
        <div className="fixed inset-0 z-[540] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">✅ Avisar al cliente</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            {datos ? `${datos.faseLabel} registrado` : 'Preparando…'}
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {!datos && !error && <p className="text-[11px] text-white/40 normal-case">Preparando el aviso…</p>}
                    {error && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.06] px-4 py-3 text-[11px] text-red-300 normal-case leading-snug">{error}</div>
                    )}

                    {datos && (
                        <>
                            {!datos.registrado && (
                                <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300 normal-case leading-snug">
                                    ⚠️ Este certificado todavía no consta como registrado.
                                </div>
                            )}
                            {datos.yaAvisado && (
                                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-[11px] text-white/55 normal-case leading-snug">
                                    Ya se le avisó el {new Date(datos.yaAvisado.at).toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}
                                    {datos.yaAvisado.factura ? ` con la factura ${datos.yaAvisado.factura}` : ''}. Si sigues, le llega otra vez.
                                </div>
                            )}
                            {datos.cobrado && (
                                <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/[0.06] px-4 py-3 text-[11px] text-emerald-300 normal-case leading-snug">
                                    Está cobrado: la entrega con el certificado sale sola (o desde «Entrega al cliente»).
                                </div>
                            )}

                            {/* A quién */}
                            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1">Para</div>
                                <div className="text-[12px] text-white font-bold normal-case">
                                    {d?.nombre || 'El cliente'}
                                    {d?.tercero && <span className="ml-2 text-[9px] font-black uppercase tracking-widest text-brand">persona de contacto</span>}
                                </div>
                                <div className="text-[11px] text-white/40 normal-case">
                                    {[d?.tlf, d?.email].filter(Boolean).join(' · ') || 'Sin teléfono ni email: complétalo en la ficha del cliente'}
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

                            {/* La factura */}
                            {isAdmin && f && (
                                <div className={`rounded-xl border px-4 py-3 ${conFactura ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/[0.08] bg-white/[0.02]'}`}>
                                    <label className={`flex items-start gap-3 ${puedeFactura ? 'cursor-pointer' : 'opacity-60'}`}>
                                        <input type="checkbox" className="mt-0.5 accent-[#f59e0b] w-4 h-4" disabled={!puedeFactura}
                                               checked={conFactura} onChange={e => elegirFactura(e.target.checked)} />
                                        <div className="min-w-0">
                                            <div className="text-[12px] font-bold text-white normal-case">
                                                {f.modo === 'adjuntar' ? `Adjuntar la factura ${f.numero}` : '¿Emitimos ya la factura?'}
                                            </div>
                                            <div className="text-[11px] text-white/45 normal-case leading-snug mt-0.5">
                                                {f.modo === 'adjuntar'
                                                    ? `Ya está emitida (${eur(f.total)} · ${f.a}). Va adjunta y el mensaje pide el justificante de pago.`
                                                    : puedeFactura
                                                        ? `Se emite ahora${f.numero ? ` con el nº ${f.numero}` : ''} · ${eur(f.total)} · a ${f.a}. Va adjunta, y el mensaje explica que los certificados se envían una vez abonada y pide el justificante de pago.`
                                                        : `No se puede emitir desde aquí: falta ${(f.faltan || []).join(', ')}. Emítela desde «Generar factura».`}
                                            </div>
                                        </div>
                                    </label>
                                </div>
                            )}

                            {/* El texto */}
                            <div>
                                <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1.5">Mensaje (editable)</div>
                                <textarea value={texto} rows={11}
                                          onChange={e => { setTexto(e.target.value); setTocado(true); }}
                                          className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[12px] text-white/85 font-mono leading-relaxed normal-case focus:outline-none focus:border-brand/50" />
                                <p className="text-[10px] text-white/30 normal-case mt-1">Va igual por WhatsApp y por email (en el email, sin los asteriscos).</p>
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
                            className="flex-1 min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-colors disabled:opacity-40">
                        {conFactura ? (f?.modo === 'adjuntar' ? 'Avisar con la factura' : 'Emitir factura y avisar') : 'Avisar al cliente'}
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                items={overlay.items}
                errorText={overlay.errorText}
                subtitle={datos ? `${datos.faseLabel} registrado` : ''}
                sendingTitle={conFactura && f?.modo === 'emitir' ? 'Emitiendo la factura y avisando…' : 'Avisando al cliente…'}
                okTitle="Cliente avisado"
                errorTitle="No se ha enviado"
                onClose={() => { const ok = overlay.ok; setOverlay({ phase: null }); if (ok) onClose?.(); }}
            />
        </div>,
        document.body
    );
}

export default AvisoRegistradoModal;
