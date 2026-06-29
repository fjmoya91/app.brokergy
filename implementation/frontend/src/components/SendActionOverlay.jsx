import React, { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';

// ─── SendActionOverlay ───────────────────────────────────────────────────────
// Overlay ESTÁNDAR para cualquier acción de envío (WhatsApp / email):
//   fase 'sending' → animación "Enviando…"   ·   fase 'done' → ✓/✗ + confeti de docs.
// Úsalo en TODOS los envíos para que todos los popups sean iguales.
//
// Props:
//   phase: null | 'sending' | 'done'
//   ok: boolean (solo aplica en 'done')
//   subtitle: string (p.ej. "26RES080_41 · Cliente")
//   items: string[] (líneas de éxito, p.ej. destinatarios o canales)
//   errorText: string (mensaje de error en 'done' + !ok)
//   onClose: () => void (cierra el overlay; se llama desde el botón final)
//   sendingTitle / okTitle / errorTitle: textos opcionales

function fireDocsConfetti() {
    if (typeof window === 'undefined') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const scalar = 3.6;
    let shapes;
    try { shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar })); } catch { shapes = undefined; }
    const burst = (x, delay = 0) => setTimeout(() => {
        confetti({ particleCount: 22, spread: 65, startVelocity: 34, gravity: 0.8, decay: 0.92, ticks: 220, scalar, origin: { x, y: 0.5 }, zIndex: 10000, disableForReducedMotion: true, ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }) });
    }, delay);
    burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
}

export function SendActionOverlay({
    phase,
    ok = false,
    subtitle = '',
    items = [],
    errorText = '',
    onClose,
    sendingTitle = 'Enviando mensaje…',
    okTitle = '¡Mensaje enviado!',
    errorTitle = 'No se pudo enviar',
}) {
    const firedRef = useRef(false);
    useEffect(() => {
        if (phase === 'done' && ok && !firedRef.current) {
            firedRef.current = true;
            fireDocsConfetti();
        }
        if (phase !== 'done') firedRef.current = false;
    }, [phase, ok]);

    if (!phase) return null;

    return (
        <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
            <div className="relative w-full max-w-sm bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                <div className={`absolute -top-20 left-1/2 -translate-x-1/2 w-64 h-64 rounded-full blur-3xl pointer-events-none ${phase === 'done' ? (ok ? 'bg-emerald-500/25' : 'bg-red-500/20') : 'bg-brand/20'}`} />
                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                    {phase === 'sending' ? (
                        <>
                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                <span className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
                                <span className="absolute inset-4 rounded-full bg-brand/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                                <div className="relative w-16 h-16 rounded-full bg-brand/15 border border-brand/40 flex items-center justify-center">
                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ animation: 'float 1.8s ease-in-out infinite' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                </div>
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{sendingTitle}</h3>
                            {subtitle && <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{subtitle}</p>}
                            <p className="mt-6 text-[10px] text-white/25 uppercase tracking-widest font-bold">No cierres esta ventana</p>
                        </>
                    ) : (
                        <>
                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                <span className={`absolute inset-0 rounded-full animate-ping ${ok ? 'bg-emerald-500/20' : 'bg-red-500/20'}`} />
                                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center border-2 ${ok ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400' : 'bg-red-500/15 border-red-400/50 text-red-400'}`}>
                                    <svg className="w-10 h-10 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={ok ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                                </div>
                            </div>
                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{ok ? okTitle : errorTitle}</h3>
                            {subtitle && <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{subtitle}</p>}
                            {ok && items.length > 0 && (
                                <div className="mt-5 w-full space-y-1.5">
                                    {items.map((name, i) => (
                                        <div key={i} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500/[0.06] border border-emerald-400/25">
                                            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                            <span className="text-[11px] text-white font-bold no-uppercase">{name}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {!ok && errorText && <p className="mt-4 text-[11px] text-red-400/80">{errorText}</p>}
                            <div className="mt-7 w-full">
                                <button onClick={onClose}
                                    className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">
                                    {ok ? 'Cerrar' : 'Volver e intentar de nuevo'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

export default SendActionOverlay;
