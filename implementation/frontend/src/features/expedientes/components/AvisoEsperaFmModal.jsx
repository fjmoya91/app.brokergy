import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import { clienteContacts, defaultContactIds, phoneValid } from '../utils/docContacts';
import { nombreSaludo } from '../../../utils/nombres.js';
import { mensajeEsperaFm, FM_PRESENTACION } from '../logic/convenioFm';

// ─── «Esperar al 15/01/2027»: proponer al cliente la vía FM ─────────────────
// Fran (08/11/2026): «obras que no están marcadas como DOC. COMPLETA, que le
// podamos enviar un mensaje al cliente para que, si está de acuerdo, se espere a
// partir del 15/01 para presentarlo». Se abre desde el panel «Vía FM».
//
// · Al cliente no se le escribe solo: el texto se ENSEÑA entero, se puede
//   retocar, y sale con «Enviar» (y el overlay de envío de la casa).
// · Va por WhatsApp a los contactos marcados (los del cliente: titular,
//   propietarios, persona de contacto), como el envío de anexos.
// · Queda apuntado en `documentacion.via_fm.aviso_espera` (cuándo y a quién) y
//   la respuesta se marca a mano en el panel (`espera_cliente`).
// NO cambia la vía: eso se hace cuando el cliente dice que sí.

export function AvisoEsperaFmModal({ isOpen, onClose, expediente, cifras, onEnviado }) {
    const cli = expediente?.clientes || {};
    const contactos = useMemo(() => clienteContacts(cli).filter((c) => phoneValid(c.phone)), [cli]);
    const [marcados, setMarcados] = useState([]);
    const [texto, setTexto] = useState('');
    const [tocado, setTocado] = useState(false);
    const [overlay, setOverlay] = useState({ phase: null });

    const borrador = (ids) => {
        const elegidos = contactos.filter((c) => ids.includes(c.id));
        const saludos = [...new Set(elegidos.map((c) => nombreSaludo(c.saludo || c.label)).filter(Boolean))];
        return mensajeEsperaFm({
            saludo: saludos.join(' y '),
            numero: expediente?.numero_expediente || '',
            cifras,
            tercero: elegidos.length > 0 && elegidos.every((c) => c.tercero),
        });
    };

    useEffect(() => {
        if (!isOpen) return;
        const ids = defaultContactIds('cliente', cli, null).filter((id) => contactos.some((c) => c.id === id));
        const inicial = ids.length ? ids : contactos.slice(0, 1).map((c) => c.id);
        setMarcados(inicial);
        setTexto(borrador(inicial));
        setTocado(false);
        setOverlay({ phase: null });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    if (!isOpen) return null;

    const marcar = (id) => {
        const ids = marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id];
        setMarcados(ids);
        if (!tocado) setTexto(borrador(ids));
    };

    const destinos = contactos.filter((c) => marcados.includes(c.id));
    const puedeEnviar = destinos.length > 0 && texto.trim() && overlay.phase !== 'sending';

    const enviar = async () => {
        if (!puedeEnviar) return;
        setOverlay({ phase: 'sending' });
        const items = [];
        const fallos = [];
        for (const c of destinos) {
            try {
                await axios.post('/api/whatsapp/send-text', { phone: c.phone, message: texto }, { timeout: 60000 });
                items.push(`WhatsApp · ${c.label}${c.sublabel ? ` (${c.sublabel.toLowerCase()})` : ''}`);
            } catch (e) {
                fallos.push(`${c.label}: ${e.response?.data?.error || e.message}`);
            }
        }
        if (!items.length) {
            setOverlay({ phase: 'done', ok: false, errorText: fallos.join(' · ') || 'No se ha enviado' });
            return;
        }
        fallos.forEach((f) => items.push({ texto: `No ha salido a ${f}`, tono: 'aviso' }));
        items.push({ texto: 'Cuando conteste, marca su respuesta en el panel «Vía FM». La vía no cambia hasta que lo hagas tú.', tono: 'info' });
        setOverlay({ phase: 'done', ok: true, items });
        try {
            await onEnviado?.({ at: new Date().toISOString(), a: destinos.map((c) => c.label) });
        } catch { /* el envío ya salió: apuntarlo es secundario */ }
    };

    return createPortal(
        <div className="fixed inset-0 z-[540] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm p-4 max-md:p-0">
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[92vh]">
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">Proponer esperar al FM</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            {expediente?.numero_expediente} · la vía FM se presenta desde el {FM_PRESENTACION.desdeTxt}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/5 text-white/40">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {!(cifras?.gana > 0) && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300 normal-case leading-snug">
                            Con los datos de ahora la vía FM no le da más al cliente{cifras?.gana != null ? '' : ' (falta alguna de las dos cifras)'}. Revísalo antes de proponérselo.
                        </div>
                    )}
                    {cifras?.bloquea?.length > 0 && (
                        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.06] px-4 py-3 text-[11px] text-amber-300 normal-case leading-snug">
                            {cifras.bloquea.map((b) => <p key={b}>⚠ {b}</p>)}
                        </div>
                    )}
                    {cifras?.estimada && (
                        <p className="text-[11px] text-white/45 normal-case leading-snug">
                            Los importes salen de la simulación: el expediente aún no tiene CEE. El mensaje los da como «estimados».
                        </p>
                    )}

                    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                        <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-2">Para (WhatsApp)</div>
                        {contactos.length === 0 && <p className="text-[11px] text-amber-300 normal-case">El cliente no tiene ningún teléfono: complétalo en su ficha.</p>}
                        <div className="space-y-1.5">
                            {contactos.map((c) => (
                                <label key={c.id} className="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" className="accent-[#f59e0b] w-4 h-4" checked={marcados.includes(c.id)} onChange={() => marcar(c.id)} />
                                    <span className="text-[12px] text-white normal-case">{c.label}</span>
                                    <span className="text-[10px] text-white/35 normal-case">{c.sublabel} · {c.phone}</span>
                                </label>
                            ))}
                        </div>
                    </div>

                    <div>
                        <div className="text-[9px] font-black text-white/50 uppercase tracking-widest mb-1.5">Mensaje (editable)</div>
                        <textarea value={texto} rows={14} onChange={(e) => { setTexto(e.target.value); setTocado(true); }}
                            className="w-full rounded-xl bg-white/[0.03] border border-white/10 px-3 py-2.5 text-[12px] text-white/85 font-mono leading-relaxed normal-case focus:outline-none focus:border-brand/50" />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-white/[0.06] shrink-0 flex gap-2">
                    <button type="button" onClick={onClose}
                        className="min-h-[44px] px-4 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white">
                        Ahora no
                    </button>
                    <button type="button" onClick={enviar} disabled={!puedeEnviar}
                        className="flex-1 min-h-[44px] px-4 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:bg-brand-700 transition-colors disabled:opacity-40">
                        Enviar por WhatsApp
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={overlay.phase}
                ok={overlay.ok}
                items={overlay.items}
                errorText={overlay.errorText}
                subtitle={expediente?.numero_expediente || ''}
                sendingTitle="Enviando la propuesta…"
                okTitle="Propuesta enviada"
                errorTitle="No se ha enviado"
                onClose={() => { const ok = overlay.ok; setOverlay({ phase: null }); if (ok) onClose?.(); }}
            />
        </div>,
        document.body,
    );
}

export default AvisoEsperaFmModal;
