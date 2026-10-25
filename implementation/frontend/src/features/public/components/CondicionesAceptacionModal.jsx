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
//
// `tema`: 'oscuro' (por defecto, la oferta de CEE directo) o 'carta', el estilo
// «carta de pago» de /firma/:id (regla 164). Como va portaleado, no hereda el
// CSS de la página: cada tema trae sus clases.
const TEMAS = {
    oscuro: {
        caja: 'bg-bkg-surface border border-white/10',
        linea: 'border-white/10',
        titulo: 'text-lg font-black text-white',
        sub: 'text-xs text-white/40',
        cerrarX: 'text-white/50 hover:text-white hover:bg-white/10',
        h3: 'text-sm font-bold text-white',
        num: 'text-brand',
        p: 'text-[13px] text-white/60',
        dl: 'border-white/10 divide-white/10',
        dt: 'text-[11px] font-bold uppercase tracking-wider text-white/40',
        dd: 'text-[13px] text-white/60',
        nota: 'text-[12px] text-white/40',
        version: 'text-[10px] text-white/25',
        cerrar: 'rounded-xl border border-white/15 text-white/70 hover:text-white hover:bg-white/5 font-bold text-sm',
        aceptar: 'rounded-xl bg-gradient-to-r from-brand to-brand-700 text-bkg-deep font-black text-sm uppercase tracking-widest',
    },
    carta: {
        caja: 'bg-white border border-[rgba(20,17,17,.08)] [color-scheme:light]',
        linea: 'border-[rgba(20,17,17,.08)]',
        titulo: 'text-[26px] leading-tight text-[#141111] [font-family:Antonio,Inter,Impact,sans-serif] font-bold',
        sub: 'text-[13px] text-[#55585f]',
        cerrarX: 'text-[#55585f] hover:text-[#141111] hover:bg-[#faf9f7]',
        h3: 'text-[15px] font-bold text-[#141111]',
        num: 'text-[#b33a0a]',
        p: 'text-[14px] text-[#55585f]',
        dl: 'border-[rgba(20,17,17,.08)] divide-[rgba(20,17,17,.08)] bg-[#faf9f7]',
        dt: 'text-[11px] font-extrabold uppercase tracking-[.12em] text-[#55585f]',
        dd: 'text-[14px] text-[#3b3e45]',
        nota: 'text-[13px] text-[#6b6e76]',
        version: 'text-[11px] font-bold text-[#6b6e76]',
        cerrar: 'min-h-[52px] rounded-2xl border-[1.5px] border-[rgba(20,17,17,.14)] bg-white text-[#141111] font-bold text-[15.5px] hover:border-[rgba(20,17,17,.3)]',
        aceptar: 'min-h-[52px] rounded-2xl bg-[#ffa000] text-[#08090c] font-bold text-[15.5px] shadow-[0_10px_22px_-10px_rgba(255,160,0,.75)]',
    },
};

export default function CondicionesAceptacionModal({ open, onClose, onAceptar, enviando,
    condiciones = CONDICIONES, version = CONDICIONES_VERSION,
    subtitulo = 'Lo que aceptas al confirmar la propuesta', aceptarLabel = 'Aceptar propuesta',
    tema = 'oscuro' }) {
    useEffect(() => {
        if (!open) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
    }, [open, onClose]);

    if (!open) return null;
    const t = TEMAS[tema] || TEMAS.oscuro;
    const carta = tema === 'carta';

    return createPortal(
        <div className={`fixed inset-0 z-[9999] flex items-end sm:items-center justify-center ${carta ? 'bg-[rgba(20,17,17,.55)]' : 'bg-black/80'} backdrop-blur-sm p-0 sm:p-4`}
             onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="condiciones-titulo">
            <div className={`w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[85vh] flex flex-col ${t.caja} rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden`}
                 style={carta ? { fontFamily: "'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif" } : undefined}
                 onClick={e => e.stopPropagation()}>
                {carta && <div className="h-1 shrink-0" style={{ background: 'linear-gradient(90deg,#fca508 0%,#f5c53f 30%,#eee475 55%,#c7d54c 78%,#b5cf38 100%)' }} />}
                <div className={`flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b ${t.linea} shrink-0`}>
                    <div>
                        <h2 id="condiciones-titulo" className={t.titulo}>Condiciones y autorizaciones</h2>
                        <p className={`${t.sub} mt-1`}>{subtitulo}</p>
                    </div>
                    <button type="button" onClick={onClose} aria-label="Cerrar"
                            className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${t.cerrarX} transition-colors`}>
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="overflow-y-auto px-6 py-5 space-y-6">
                    {condiciones.map((sec, i) => (
                        <section key={sec.titulo}>
                            <h3 className={`${t.h3} mb-2`}>
                                <span className={`${t.num} mr-2`}>{i + 1}.</span>{sec.titulo}
                            </h3>
                            {sec.parrafos?.map((p, j) => (
                                <p key={j} className={`${t.p} leading-relaxed mb-2`}>{p}</p>
                            ))}
                            {sec.filas && (
                                <dl className={`rounded-xl border divide-y overflow-hidden ${t.dl}`}>
                                    {sec.filas.map(([k, v]) => (
                                        <div key={k} className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-1 sm:gap-3 px-4 py-2.5">
                                            <dt className={`${t.dt} sm:pt-0.5`}>{k}</dt>
                                            <dd className={`${t.dd} leading-relaxed`}>{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            {sec.nota && <p className={`${t.nota} mt-2`}>{sec.nota}</p>}
                        </section>
                    ))}
                    <p className={`${t.version} uppercase tracking-widest`}>Versión {version}</p>
                </div>

                <div className={`flex flex-col-reverse sm:flex-row gap-3 px-6 py-4 border-t ${t.linea} shrink-0`}
                     style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
                    <button type="button" onClick={onClose}
                            className={`flex-1 py-3 transition-colors ${t.cerrar}`}>
                        Cerrar
                    </button>
                    {onAceptar && (
                        <button type="button" onClick={onAceptar} disabled={enviando}
                                className={`flex-1 py-3 disabled:opacity-50 ${t.aceptar}`}>
                            {enviando ? 'Procesando…' : aceptarLabel}
                        </button>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
