import React, { useState } from 'react';
import { CE3X_TEXTOS } from '../logic/ce3xTextos';

// ─── Ayudas CE3X ─────────────────────────────────────────────────────────────
// La caja de herramientas del certificador: los textos fijos que hay que teclear
// en CE3X, listos para copiar. Vive junto al selector de técnico del módulo CEE,
// que es la barra desde la que se gobierna su trabajo.
//
// REGLA — cada sección viene PLEGADA y se puede copiar SIN abrirla. El texto de
// las pruebas son veinte renglones: desplegado por defecto tapa la otra
// herramienta, y obligar a desplegarlo para copiarlo es un clic de peaje sobre
// algo que casi nunca se lee, porque siempre es el mismo.
//
// REGLA — con VARIAS casillas no hay "copiar todo". En CE3X son cuadros
// distintos y un bloque único habría que recortarlo a mano una vez por casilla.
export function Ce3xAyudasModal({ isOpen, onClose }) {
    const [abierta, setAbierta] = useState(null);
    const [copiado, setCopiado] = useState(null);

    const copiar = async (texto, clave) => {
        try {
            await navigator.clipboard.writeText(String(texto));
            setCopiado(clave);
            setTimeout(() => setCopiado(c => (c === clave ? null : c)), 1800);
        } catch { /* contexto no seguro: se selecciona a mano */ }
    };

    if (!isOpen) return null;

    return (
        // En móvil, hoja inferior a lo ancho: un popup centrado con veinte
        // renglones de texto no cabe en una pantalla de 375 px.
        <div className="fixed inset-0 z-[500] flex items-center justify-center max-md:items-end bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:p-0"
             onClick={onClose}>
            <div className="bg-bkg-deep border border-white/10 rounded-2xl max-md:rounded-b-none max-md:rounded-t-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>
                {/* Cabecera */}
                <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/[0.06] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-sm font-black text-white uppercase tracking-widest">🧰 Ayudas CE3X</h3>
                        <p className="text-[10px] text-white/40 normal-case mt-1 leading-snug">
                            Textos que se teclean siempre igual. Se copian y se pegan tal cual en su casilla.
                        </p>
                    </div>
                    <button type="button" onClick={onClose}
                            className="shrink-0 w-9 h-9 flex items-center justify-center rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-colors">
                        <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Herramientas */}
                <div className="flex-1 overflow-y-auto p-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5">
                    {CE3X_TEXTOS.map(sec => {
                        const open = abierta === sec.id;
                        // Con una sola casilla, la sección se copia entera desde su
                        // propia cabecera: es el gesto que se venía a hacer.
                        const unico = sec.campos.length === 1 ? sec.campos[0] : null;
                        return (
                            <div key={sec.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-3 max-md:py-3.5">
                                    <button type="button"
                                            onClick={() => setAbierta(a => (a === sec.id ? null : sec.id))}
                                            className="min-w-0 flex-1 text-left">
                                        <div className="text-[11px] font-black text-white uppercase tracking-widest">{sec.titulo}</div>
                                        <div className="text-[10px] text-white/40 normal-case mt-0.5">
                                            {sec.resumen}
                                            <span className="text-white/25">
                                                {' · '}{sec.campos.length === 1 ? '1 casilla' : `${sec.campos.length} casillas`}
                                            </span>
                                        </div>
                                    </button>
                                    {unico && (
                                        <button type="button"
                                                onClick={() => copiar(unico.valor, `${sec.id}__unico`)}
                                                className={`shrink-0 px-2.5 py-1.5 max-md:px-3 max-md:py-2 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-colors ${
                                                    copiado === `${sec.id}__unico`
                                                        ? 'text-emerald-400 border-emerald-500/40'
                                                        : 'text-brand border-brand/30 hover:text-white hover:border-brand/60'
                                                }`}>
                                            {copiado === `${sec.id}__unico` ? '✓ Copiado' : 'Copiar'}
                                        </button>
                                    )}
                                    <button type="button"
                                            onClick={() => setAbierta(a => (a === sec.id ? null : sec.id))}
                                            title={open ? 'Ocultar' : 'Ver el texto'}
                                            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-white/30 hover:text-white hover:bg-white/5 transition-colors">
                                        <svg className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`}
                                             fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                        </svg>
                                    </button>
                                </div>

                                {open && (
                                    <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] space-y-1.5">
                                        {sec.nota && (
                                            <p className="text-[10px] text-white/35 normal-case leading-snug pt-2">{sec.nota}</p>
                                        )}
                                        {sec.campos.map(c => (
                                            <div key={c.campo}
                                                 className="flex items-start gap-2 px-3 py-2 rounded-lg border border-white/[0.08] bg-white/[0.03] hover:border-brand/30 transition-colors">
                                                <div className="min-w-0 flex-1">
                                                    {/* Un solo cuadro no necesita rótulo: el título de la
                                                        sección ya dice de qué casilla se trata. */}
                                                    {!unico && (
                                                        <div className="text-[9px] font-bold uppercase tracking-widest text-white/35">{c.campo}</div>
                                                    )}
                                                    <div className={`text-white mt-0.5 break-words normal-case text-[13px] ${
                                                        c.parrafo ? 'leading-relaxed whitespace-pre-line' : 'font-semibold'
                                                    }`}>
                                                        {c.valor}
                                                    </div>
                                                </div>
                                                {!unico && (
                                                    <button type="button"
                                                            onClick={() => copiar(c.valor, `${sec.id}__${c.campo}`)}
                                                            title="Copiar"
                                                            className={`flex-shrink-0 mt-1 px-2 py-1 max-md:px-3 max-md:py-2 rounded-md text-[9px] font-black uppercase tracking-widest transition-colors ${
                                                                copiado === `${sec.id}__${c.campo}`
                                                                    ? 'bg-emerald-500/20 text-emerald-300'
                                                                    : 'bg-white/5 text-white/40 hover:bg-brand/20 hover:text-brand'
                                                            }`}>
                                                        {copiado === `${sec.id}__${c.campo}` ? '✓' : 'Copiar'}
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
