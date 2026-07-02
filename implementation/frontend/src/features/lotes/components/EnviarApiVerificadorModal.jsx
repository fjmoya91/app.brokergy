import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';
import { buildSolicitudVerificacionPayload } from '../logic/solicitudVerificacion';
import { SendActionOverlay } from '../../../components/SendActionOverlay';

// ─────────────────────────────────────────────────────────────────────────────
// EnviarApiVerificadorModal — envío del lote al VERIFICADOR (Marwen) por API.
//
// Flujo en 2 tiempos:
//   1. Al abrir hace un dryRun a POST /api/lotes/:id/enviar-verificador-api
//      → muestra la RESOLUCIÓN geográfica del solicitante (provincia/localidad
//        con sus IDs de Marwen), avisos y bloqueos, y el nº de actuaciones.
//   2. "Confirmar y enviar por API" repite la llamada sin dryRun → crea la
//      solicitud en Marwen y muestra el nº de solicitud devuelto.
//
// El step1 (solicitante) lo arma el BACKEND desde el Sujeto Obligado del lote;
// aquí solo construimos step2/step3 + contacto editable.
// ─────────────────────────────────────────────────────────────────────────────

export function EnviarApiVerificadorModal({ lote, payloadOpts, onClose, onSent }) {
    const base = useMemo(() => buildSolicitudVerificacionPayload(lote, payloadOpts || {}), [lote, payloadOpts]);

    const [phase, setPhase] = useState('loading'); // loading | ready | error (dry-run)
    const [preview, setPreview] = useState(null);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);
    const [sendPhase, setSendPhase] = useState(null); // null | 'sending' | 'done'
    const [sendOk, setSendOk] = useState(false);
    const [sendError, setSendError] = useState('');

    const body = useMemo(() => ({
        contacto: base.contacto,
        figura: base.figura,
        step2: base.step2,
        step3: base.step3,
    }), [base]);

    // 1) Previsualización (dryRun) al abrir. Dependemos SOLO de lote.id (estable
    //    mientras el modal está abierto): así NO se reejecuta cuando el padre
    //    refresca el lote tras enviar (eso pisaba la pantalla de éxito y "volvía"
    //    a la de enviar), pero sí completa correctamente en React StrictMode.
    useEffect(() => {
        let alive = true;
        setPhase('loading'); setError(null);
        axios.post(`/api/lotes/${lote.id}/enviar-verificador-api`, { ...body, dryRun: true })
            .then(r => { if (alive) { setPreview(r.data); setPhase('ready'); } })
            .catch(err => { if (alive) { setError(err.response?.data?.error || err.message); setPhase('error'); } });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lote.id]);

    const blocking = preview?.blocking || [];
    const warnings = preview?.warnings || [];
    const canSend = phase === 'ready' && blocking.length === 0;
    const sending = sendPhase === 'sending';

    const handleSend = async () => {
        setSendPhase('sending'); setSendError('');
        try {
            const r = await axios.post(`/api/lotes/${lote.id}/enviar-verificador-api`, body);
            setResult(r.data);
            setSendOk(true);
            setSendPhase('done');
            if (onSent && r.data?.lote) onSent(r.data.lote);
        } catch (err) {
            setSendError(err.response?.data?.error || err.message);
            setSendOk(false);
            setSendPhase('done');
        }
    };

    const sol = preview?.solicitante || {};
    const resProv = preview?.resolved?.provincia || null;
    const resLoc = preview?.resolved?.localidad || null;
    const nAct = base.step2.length;

    const Row = ({ k, v, ok }) => (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <span className="text-[10px] uppercase tracking-widest font-black text-white/35 shrink-0">{k}</span>
            <span className={`text-[12px] text-right truncate ${ok === false ? 'text-red-400' : 'text-white/85'}`}>{v}</span>
        </div>
    );

    return createPortal(
        <div className="fixed inset-0 z-[360] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
            <div className="bg-[#0F1013] border border-white/[0.08] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
                {/* Cabecera */}
                <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-base font-black uppercase tracking-tight text-white">Enviar al verificador por API</h2>
                        <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                            {lote.codigo || 'Lote'} · Marwen · {nAct} actuacion{nAct === 1 ? '' : 'es'}
                        </p>
                    </div>
                    <button onClick={onClose} className="text-white/30 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Cuerpo */}
                <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {phase === 'loading' && (
                        <div className="flex items-center gap-3 text-white/60 py-6 justify-center">
                            <svg className="w-5 h-5 animate-spin text-brand" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            <span className="text-[12px] uppercase tracking-widest font-bold">Resolviendo provincia y localidad en Marwen…</span>
                        </div>
                    )}

                    {phase === 'error' && (
                        <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-[12px] text-red-300">
                            ❌ {error}
                        </div>
                    )}

                    {phase === 'ready' && preview && (
                        <>
                            {/* Solicitante (Sujeto Obligado) */}
                            <div className="space-y-1.5">
                                <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30">Solicitante (Sujeto Obligado)</p>
                                <Row k="Razón social" v={sol.razon_social || '—'} />
                                <Row k="CIF" v={sol.cif || '—'} />
                                <Row k="Provincia" v={resProv ? `${resProv.nombre} · ID ${resProv.id}` : `${sol.provincia || '—'} · NO RESUELTA`} ok={!!resProv} />
                                <Row k="Localidad" v={resLoc ? `${resLoc.nombre} · ID ${resLoc.id}` : `${sol.municipio || '—'} · NO RESUELTA`} ok={!!resLoc} />
                            </div>

                            {/* Avisos / bloqueos */}
                            {blocking.length > 0 && (
                                <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 space-y-1">
                                    {blocking.map((b, i) => <p key={i} className="text-[11px] text-red-300">⛔ {b}</p>)}
                                    <p className="text-[10px] text-white/40 pt-1">Revisa la provincia/municipio del Sujeto Obligado en su ficha de partner.</p>
                                </div>
                            )}
                            {warnings.length > 0 && blocking.length === 0 && (
                                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 space-y-1">
                                    {warnings.map((w, i) => <p key={i} className="text-[11px] text-amber-300">⚠️ {w}</p>)}
                                </div>
                            )}

                            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-widest font-black text-white/35">Destino</span>
                                <span className="text-[11px] text-white/60">{preview.destino}</span>
                            </div>
                            <p className="text-[11px] text-white/45">
                                Se enviarán <b className="text-white/70">{nAct}</b> actuacion{nAct === 1 ? '' : 'es'} como
                                <b className="text-white/70"> Solicitud de Verificación Estandarizada</b>. El nº de actuaciones y emplazamientos se valida en el servidor.
                            </p>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-end gap-3">
                    <button onClick={onClose} disabled={sending} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">Cancelar</button>
                    <button onClick={handleSend} disabled={!canSend || sending}
                        title={!canSend ? 'No se puede enviar: faltan datos del solicitante' : 'Enviar por API'}
                        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                        Confirmar y enviar por API
                    </button>
                </div>
            </div>

            <SendActionOverlay
                phase={sendPhase}
                ok={sendOk}
                subtitle={`${lote.codigo || 'Lote'} · Verificador`}
                items={sendOk && result ? [`Nº de solicitud: ${result.num_solicitud || '—'}`] : []}
                errorText={sendError}
                onClose={() => { if (sendOk) { onClose(); } else { setSendPhase(null); } }}
                sendingTitle="Enviando al verificador…"
                okTitle="¡Solicitud enviada!"
                errorTitle="No se pudo enviar"
            />
        </div>,
        document.body
    );
}

export default EnviarApiVerificadorModal;
