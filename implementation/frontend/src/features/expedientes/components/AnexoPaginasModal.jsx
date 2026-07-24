import React, { useEffect, useMemo, useState } from 'react';
import { parsePageSelection, formatPageRanges } from '../logic/annexPrefs';

/**
 * Selector de páginas de un anexo (CIFO RES060/RES093 y Certificado RES080).
 *
 * Enseña las páginas ya rasterizadas del PDF (`previewPages`, las mismas que usa
 * la previsualización del certificado) y permite quitar las que no se quieren
 * anexar, o bien clicando la miniatura o bien escribiendo un rango ("4-12, 20").
 *
 * NO toca el PDF de Drive: solo devuelve la lista de páginas excluidas, que se
 * guarda en documentacion.cifo_annex_prefs y se aplica al concatenar (pdf-lib).
 *
 * Props:
 *   · annex          — slot { id, label, file:{ name, previewPages } }
 *   · excludedPages  — páginas (1-based) excluidas ahora mismo
 *   · onSave(pages)  — confirma la nueva selección
 *   · onClose()
 */
export default function AnexoPaginasModal({ isOpen, annex, excludedPages = [], onSave, onClose }) {
    const pages = annex?.file?.previewPages || [];
    const total = pages.length;

    const [excluded, setExcluded] = useState(() => new Set(excludedPages));
    const [rangeText, setRangeText] = useState('');
    const [rangeError, setRangeError] = useState(null);
    const [saving, setSaving] = useState(false);

    // Al abrir (o al cambiar de anexo) partimos siempre del estado guardado.
    useEffect(() => {
        if (!isOpen) return;
        setExcluded(new Set(excludedPages));
        setRangeText('');
        setRangeError(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, annex?.id]);

    const incluidas = useMemo(() => total - excluded.size, [total, excluded]);

    if (!isOpen || !annex) return null;

    const toggle = (n) => {
        setExcluded(prev => {
            const next = new Set(prev);
            if (next.has(n)) next.delete(n);
            else next.add(n);
            return next;
        });
    };

    // El rango que se escribe son las páginas que SÍ se quieren (más natural al
    // teclearlo: "quiero la 1 y de la 4 a la 12"); el resto quedan excluidas.
    const applyRange = () => {
        const { pages: keep, error } = parsePageSelection(rangeText, total);
        if (error) { setRangeError(error); return; }
        if (keep.length === 0) { setRangeError('Escribe al menos una página, por ejemplo: 1, 4-12'); return; }
        const next = new Set();
        for (let p = 1; p <= total; p++) if (!keep.includes(p)) next.add(p);
        setExcluded(next);
        setRangeError(null);
    };

    const handleSave = async () => {
        if (incluidas === 0) return;
        setSaving(true);
        try {
            await onSave([...excluded].sort((a, b) => a - b));
        } finally {
            setSaving(false);
        }
    };

    const resumen = excluded.size === 0
        ? 'Se anexan todas las páginas'
        : `Se quitan las páginas ${formatPageRanges([...excluded])}`;

    return (
        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4" onClick={onClose}>
            <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-5xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] flex flex-col max-h-[92vh]"
                 onClick={e => e.stopPropagation()}>

                <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02] shrink-0">
                    <div className="min-w-0">
                        <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs truncate">Páginas · {annex.label}</h3>
                        <p className="text-[10px] text-white/30 mt-1 truncate">{annex.file?.name || ''}</p>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors shrink-0">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>

                {total === 0 ? (
                    <div className="p-16 text-center">
                        <svg className="w-8 h-8 text-brand animate-spin mx-auto mb-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest">Cargando las páginas del anexo…</p>
                        <p className="text-[10px] text-white/20 mt-2">Si no aparecen, cierra y vuelve a abrir el gestor de anexos.</p>
                    </div>
                ) : (
                    <>
                        <div className="px-8 py-4 border-b border-white/5 flex flex-wrap items-center gap-3 shrink-0">
                            <div className="flex items-center gap-2">
                                <input
                                    value={rangeText}
                                    onChange={e => { setRangeText(e.target.value); setRangeError(null); }}
                                    onKeyDown={e => { if (e.key === 'Enter') applyRange(); }}
                                    placeholder="Páginas a incluir: 1, 4-12"
                                    className="bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-[11px] text-white placeholder-white/20 focus:border-brand/60 focus:outline-none w-56"
                                />
                                <button onClick={applyRange}
                                        className="px-4 py-2.5 bg-white/5 hover:bg-brand hover:text-black border border-white/10 hover:border-brand text-white/60 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all">
                                    Aplicar rango
                                </button>
                            </div>
                            <div className="flex items-center gap-2 ml-auto">
                                <button onClick={() => setExcluded(new Set())}
                                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all">
                                    Todas
                                </button>
                                <button onClick={() => setExcluded(prev => {
                                            const next = new Set();
                                            for (let p = 1; p <= total; p++) if (!prev.has(p)) next.add(p);
                                            return next;
                                        })}
                                        className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-[10px] font-black rounded-xl uppercase tracking-widest transition-all">
                                    Invertir
                                </button>
                            </div>
                            {rangeError && <p className="w-full text-[10px] text-red-400 font-bold">{rangeError}</p>}
                        </div>

                        <div className="p-8 overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                                {pages.map((src, i) => {
                                    const n = i + 1;
                                    const off = excluded.has(n);
                                    return (
                                        <button key={n} onClick={() => toggle(n)} title={off ? 'Volver a incluir esta página' : 'Quitar esta página del anexo'}
                                                className={`group relative rounded-xl overflow-hidden border-2 transition-all ${off ? 'border-red-500/60 opacity-35' : 'border-white/10 hover:border-brand/60'}`}>
                                            <img src={src} alt={`Página ${n}`} className="w-full block bg-white" />
                                            <span className={`absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md text-[10px] font-black ${off ? 'bg-red-500 text-white' : 'bg-black/70 text-white/80'}`}>
                                                {n}
                                            </span>
                                            {off && (
                                                <span className="absolute inset-0 flex items-center justify-center">
                                                    <svg className="w-10 h-10 text-red-500 drop-shadow-lg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12"/></svg>
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="px-8 py-5 bg-black/40 flex items-center justify-between gap-4 shrink-0 border-t border-white/5">
                            <div className="min-w-0">
                                <p className={`text-[11px] font-black uppercase tracking-widest ${incluidas === 0 ? 'text-red-400' : 'text-white/60'}`}>
                                    {incluidas} de {total} páginas
                                </p>
                                <p className="text-[10px] text-white/25 truncate">{incluidas === 0 ? 'Deja al menos una página' : resumen}</p>
                            </div>
                            <div className="flex gap-3 shrink-0">
                                <button onClick={onClose}
                                        className="px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-[10px] font-black rounded-2xl uppercase tracking-[0.2em] transition-all">
                                    Cancelar
                                </button>
                                <button onClick={handleSave} disabled={incluidas === 0 || saving}
                                        className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(242,166,64,0.3)] hover:scale-105 active:scale-95 transition-all disabled:opacity-30 disabled:hover:scale-100">
                                    {saving ? 'Guardando…' : 'Guardar selección'}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
