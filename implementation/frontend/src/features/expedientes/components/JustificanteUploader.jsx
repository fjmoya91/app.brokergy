import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';

// Subida del justificante de titularidad bancaria con arrastrar-y-soltar + efecto
// de subida ("anexando…"). Reutilizable: variant="row" (barrido) | "box" (ficha
// cliente). Escribe SIEMPRE en el mismo sitio (carpeta Drive del expediente).

const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(file);
});

export function JustificanteUploader({ expedienteId, currentLink = null, onUploaded, variant = 'box', label = 'Justificante de titularidad bancaria' }) {
    const [link, setLink] = useState(currentLink || null);
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState(null);
    const inputRef = useRef(null);

    useEffect(() => { setLink(currentLink || null); }, [currentLink]);

    const doUpload = async (file) => {
        if (!file || !expedienteId || uploading) return;
        const ok = file.type === 'application/pdf' || (file.type || '').startsWith('image/');
        if (!ok) { setError('Solo se admite PDF o imagen.'); return; }
        setError(null); setUploading(true);
        try {
            const base64 = await fileToBase64(file);
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/justificante`, { base64, mimeType: file.type });
            if (data?.link) { setLink(data.link); if (onUploaded) onUploaded(data.link); }
        } catch (e) {
            setError(e.response?.data?.error || 'No se pudo subir el justificante.');
        } finally { setUploading(false); }
    };

    const dnd = {
        onDragEnter: e => { e.preventDefault(); if (!uploading) setDragging(true); },
        onDragOver: e => { e.preventDefault(); if (!uploading && !dragging) setDragging(true); },
        onDragLeave: e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); },
        onDrop: e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) doUpload(f); },
    };
    const pick = () => !uploading && inputRef.current?.click();
    const HiddenInput = () => <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { doUpload(e.target.files?.[0]); e.target.value = ''; }} />;

    // Barra indeterminada de "anexando…"
    const Bar = () => (
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-1/3 bg-brand rounded-full" style={{ animation: 'justifBar 1s linear infinite' }} />
            <style>{`@keyframes justifBar{0%{transform:translateX(-110%)}100%{transform:translateX(320%)}}`}</style>
        </div>
    );

    // ───────── variant ROW (barrido) ─────────
    if (variant === 'row') {
        return (
            <div {...dnd} onClick={pick}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all ${
                    dragging ? 'border-brand bg-brand/15 scale-[1.01]' : uploading ? 'border-brand/40 bg-brand/[0.06]' : 'border-white/[0.05] bg-white/[0.02] hover:border-brand/30'
                }`}>
                <HiddenInput />
                <span className="w-1.5 h-1.5 rounded-full bg-white/30 shrink-0" />
                <div className="min-w-0 flex-1">
                    <span className="text-[13px] font-medium text-white/85 truncate block">{label}</span>
                    {uploading && <div className="mt-1.5"><Bar /></div>}
                </div>
                <span className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all ${
                    uploading ? 'border-brand/40 text-brand' : dragging ? 'border-brand bg-brand text-black' : 'border-brand/30 bg-brand/10 text-brand'
                }`}>
                    {uploading
                        ? <><svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>Anexando…</>
                        : dragging ? 'Suelta aquí'
                        : <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" /></svg>Subir / soltar</>}
                </span>
            </div>
        );
    }

    // ───────── variant BOX (ficha cliente) ─────────
    return (
        <div>
            <HiddenInput />
            <div {...dnd} onClick={pick}
                className={`cursor-pointer border-2 border-dashed rounded-xl px-4 py-4 text-center transition-all ${
                    dragging ? 'border-brand bg-brand/15 scale-[1.01] shadow-[0_0_25px_rgba(232,115,28,0.2)]'
                        : uploading ? 'border-brand/40 bg-brand/[0.06]'
                        : link ? 'border-emerald-500/30 bg-emerald-500/[0.05] hover:border-emerald-400/50'
                        : 'border-white/10 bg-white/[0.02] hover:border-brand/40 hover:bg-brand/5'
                }`}>
                {uploading ? (
                    <div className="space-y-2">
                        <div className="flex items-center justify-center gap-2 text-brand">
                            <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">Anexando…</span>
                        </div>
                        <Bar />
                    </div>
                ) : dragging ? (
                    <div className="space-y-1 py-1 pointer-events-none">
                        <svg className="w-7 h-7 text-brand mx-auto animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        <p className="text-brand font-black text-xs uppercase tracking-widest">Suelta aquí</p>
                    </div>
                ) : link ? (
                    <div className="space-y-1">
                        <svg className="w-6 h-6 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                        <p className="text-emerald-400 font-bold text-[11px] uppercase tracking-wider">Justificante subido</p>
                        <p className="text-white/30 text-[10px]">Arrastra o pulsa para reemplazar</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        <svg className="w-7 h-7 text-white/20 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0-12l-4 4m4-4l4 4" /></svg>
                        <p className="text-xs text-white/50 font-bold">Arrastra el PDF/foto o pulsa para subir</p>
                    </div>
                )}
            </div>
            {link && !uploading && (
                <a href={link} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400/70 hover:text-emerald-300">Ver justificante ↗</a>
            )}
            {error && <p className="mt-1.5 text-[11px] text-red-400">⚠️ {error}</p>}
        </div>
    );
}

export default JustificanteUploader;
