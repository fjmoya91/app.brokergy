import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CONDICIONES, CONDICIONES_VERSION } from '../logic/condicionesAceptacion';

// Popup con las condiciones y autorizaciones de la aceptación. Se PORTALEA a
// document.body: la tarjeta del formulario lleva backdrop-blur, y un
// position:fixed dentro de un ancestro con backdrop-filter se ancla a él y se
// recortaría a la tarjeta (regla 29.b).
//
// `onAceptar` es opcional: si llega, el pie ofrece aceptar desde aquí mismo —
// quien acaba de leer las condiciones no tiene por qué cerrar y buscar el botón.
//
// `condiciones` / `version` / `subtitulo` / `aceptarLabel` son opcionales: por
// defecto, las de la propuesta CAE. La oferta de CEE directo pasa las suyas
// (logic/condicionesOfertaCee.js) — mismo popup, otro texto.
export default function CondicionesAceptacionModal({ open, onClose, onAceptar, enviando,
    condiciones = CONDICIONES, version = CONDICIONES_VERSION,
    subtitulo = 'Lo que aceptas al confirmar la propuesta', aceptarLabel = 'Aceptar propuesta' }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [open, onClose]);

    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4"
             onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="condiciones-titulo">
            <div className="w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col bg-bkg-surface border border-white/10 rounded-t-3xl sm:rounded-3xl shadow-2xl"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
                    <div>
                        <h2 id="condiciones-titulo" className="text-lg font-black text-white">Condiciones y autorizaciones</h2>
                        <p className="text-xs text-white/40 mt-1">{subtitulo}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Cerrar"
                            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-6">
                    {condiciones.map((sec, i) => (
                        <section key={sec.titulo}>
                            <h3 className="text-sm font-bold text-white mb-2">
                                <span className="text-brand mr-2">{i + 1}.</span>{sec.titulo}
                            </h3>
                            {sec.parrafos?.map((p, j) => (
                                <p key={j} className="text-[13px] text-white/60 leading-relaxed mb-2">{p}</p>
                            ))}
                            {sec.filas && (
                                <dl className="rounded-xl border border-white/10 divide-y divide-white/10 overflow-hidden">
                                    {sec.filas.map(([k, v]) => (
                                        <div key={k} className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 px-4 py-2.5">
                                            <dt className="text-[11px] font-bold uppercase tracking-wider text-white/40 sm:pt-0.5">{k}</dt>
                                            <dd className="text-[13px] text-white/60 leading-relaxed">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            {sec.nota && <p className="text-[12px] text-white/40 mt-2">{sec.nota}</p>}
                        </section>
                    ))}
                    <p className="text-[10px] text-white/25 uppercase tracking-widest">Versión {version}</p>
                </div>

                <div className="flex flex-col-reverse sm:flex-row gap-3 px-6 py-4 border-t border-white/10 shrink-0"
                     style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button type="button" onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 font-bold text-sm transition-colors">
                        Cerrar
                    </button>
                    {onAceptar && (
                        <button type="button" onClick={onAceptar} disabled={enviando}
                                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-widest disabled:opacity-50">
                            {enviando ? 'Procesando…' : aceptarLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
