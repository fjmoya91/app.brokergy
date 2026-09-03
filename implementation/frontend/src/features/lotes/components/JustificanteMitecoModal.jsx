import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import axios from 'axios';

// ─────────────────────────────────────────────────────────────────────────────
// El justificante de registro del MITECO, pedido JUSTO al marcar "SUBIDO A MITECO".
//
// El justificante es lo único que prueba que el lote se presentó de verdad: sin él,
// "subido" es una afirmación de palabra, y el papel se acaba quedando en la carpeta
// de descargas de quien hizo la subida. Se pide en el momento en que se tiene
// delante —acaba de salir del portal del Ministerio—, que es la única ocasión en
// que está a mano.
//
// Salida siempre: "En otro momento" deja el estado cambiado igual. Se puede subir
// después desde la fase 5 de Documentación ("Justificante de subida a MITECO"),
// que escribe en este mismo slot.
// ─────────────────────────────────────────────────────────────────────────────

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
});

export function JustificanteMitecoModal({ lote, onClose, onSubido }) {
    const [subiendo, setSubiendo] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const [hecho, setHecho] = useState(false);
    const inputRef = useRef(null);

    const subir = async (file) => {
        if (!file || subiendo) return;
        if (file.type !== 'application/pdf') { setError('El justificante debe ser un PDF.'); return; }
        setError(''); setSubiendo(true);
        try {
            const base64 = await fileToBase64(file);
            await axios.post(`/api/lotes/${lote.id}/documentos/justificante_miteco`, {
                base64, fileName: file.name,
            });
            setHecho(true);
            if (onSubido) onSubido();
            // Acuse breve: sin él, el popup se cierra solo y no queda señal de que
            // el fichero haya llegado — el mismo criterio del enlace del cliente.
            setTimeout(() => onClose(), 1400);
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo subir el justificante.');
        } finally {
            setSubiendo(false);
        }
    };

    const dnd = {
        onDragEnter: e => { e.preventDefault(); if (!subiendo && !hecho) setDragging(true); },
        onDragOver: e => { e.preventDefault(); if (!subiendo && !hecho && !dragging) setDragging(true); },
        onDragLeave: e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
        onDrop: e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) subir(f); },
    };

    return createPortal(
        <div className="fixed inset-0 z-[330] flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in overflow-y-auto">
            <div className="bg-bkg-deep border border-white/[0.08] rounded-2xl w-full max-w-md my-12 shadow-2xl">

                <div className="flex items-start justify-between gap-3 p-5 border-b border-white/[0.06]">
                    <div className="min-w-0">
                        <h3 className="text-base font-black text-white">Justificante de registro</h3>
                        <p className="text-[11px] text-white/40 mt-0.5">
                            {lote?.codigo || 'Lote'} · marcado como <span className="text-cyan-300 font-bold">SUBIDO A MITECO</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-white/30 hover:text-white transition-colors shrink-0">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <p className="text-[12px] text-white/55 leading-relaxed">
                        Adjunta el justificante que devuelve el MITECO al registrar la solicitud.
                        Es la prueba de la presentación y se guarda en la carpeta del lote.
                    </p>

                    <input ref={inputRef} type="file" accept="application/pdf" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) subir(f); }} />

                    <div {...dnd} onClick={() => !subiendo && !hecho && inputRef.current?.click()}
                        className={`border-2 border-dashed rounded-xl px-4 py-7 text-center transition-all ${
                            hecho ? 'border-emerald-500/40 bg-emerald-500/[0.07] cursor-default'
                                : dragging ? 'cursor-pointer border-brand bg-brand/15 scale-[1.01] shadow-[0_0_25px_rgba(232,115,28,0.2)]'
                                    : subiendo ? 'border-brand/40 bg-brand/[0.06] cursor-default'
                                        : 'cursor-pointer border-white/10 bg-white/[0.02] hover:border-brand/40 hover:bg-brand/5'}`}>
                        {hecho ? (
                            <div className="space-y-1.5">
                                <svg className="w-8 h-8 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                <p className="text-emerald-400 font-black text-[11px] uppercase tracking-widest">Justificante guardado</p>
                            </div>
                        ) : subiendo ? (
                            <div className="space-y-2">
                                <svg className="w-7 h-7 animate-spin text-brand mx-auto" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                <p className="text-brand font-black text-[11px] uppercase tracking-widest">Subiendo…</p>
                            </div>
                        ) : dragging ? (
                            <div className="space-y-1.5 pointer-events-none">
                                <svg className="w-8 h-8 text-brand mx-auto animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                <p className="text-brand font-black text-[11px] uppercase tracking-widest">Suelta aquí</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5">
                                <svg className="w-8 h-8 text-white/20 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" /></svg>
                                <p className="text-xs text-white/60 font-bold">Arrastra el PDF aquí</p>
                                <p className="text-[10px] text-white/30">o pulsa para seleccionarlo</p>
                            </div>
                        )}
                    </div>

                    {error && <p className="text-[11px] text-red-400">⚠️ {error}</p>}

                    {!hecho && (
                        <div className="flex items-center justify-between gap-3 pt-1">
                            <button type="button" onClick={onClose} disabled={subiendo}
                                className="text-[11px] font-black uppercase tracking-wider text-white/35 hover:text-white/70 disabled:opacity-30 transition-colors">
                                En otro momento
                            </button>
                            <span className="text-[10px] text-white/25 text-right">
                                Lo podrás subir en Documentación → Presentación a MITECO
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}

export default JustificanteMitecoModal;
