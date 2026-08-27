import React, { useState, useRef } from 'react';
import axios from 'axios';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Zona de arrastrar y soltar con feedback visual + estado "ya subido".
export function DropZone({ title, desc, file, onPick, alreadyUploaded }) {
    const ref = useRef();
    const [dragging, setDragging] = useState(false);

    const replaced = alreadyUploaded && !file;
    return (
        <div>
            <p className="text-[11px] font-black text-white uppercase tracking-wide mb-1">{title}</p>
            <p className="text-white/35 text-[11px] mb-2 leading-snug">{desc}</p>
            {/* input OCULTO (sin superponer): así la zona recibe los eventos de arrastre */}
            <input ref={ref} type="file" accept="application/pdf" className="hidden"
                onChange={e => onPick(e.target.files?.[0])} />
            <div className="group">
                <div
                    onClick={() => ref.current?.click()}
                    onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                    onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                    onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                    onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f); }}
                    className={`cursor-pointer border-2 border-dashed rounded-xl p-5 text-center transition-all duration-150 ${
                        dragging
                            ? 'border-brand bg-brand/20 scale-[1.02] shadow-[0_0_25px_rgba(232,115,28,0.25)]'
                            : file
                                ? 'border-brand/40 bg-brand/5'
                                : replaced
                                    ? 'border-emerald-500/30 bg-emerald-500/5'
                                    : 'border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5'
                    }`}
                >
                    {dragging ? (
                        <div className="space-y-1 py-1 pointer-events-none">
                            <svg className="w-7 h-7 text-brand mx-auto animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            <p className="text-brand font-black text-xs uppercase tracking-widest">Suelta aquí</p>
                        </div>
                    ) : file ? (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-brand mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            <p className="text-brand font-bold text-xs truncate px-2">{file.name}</p>
                            <p className="text-white/30 text-[10px]">{(file.size / 1024).toFixed(0)} KB · pulsa para cambiar</p>
                        </div>
                    ) : replaced ? (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-emerald-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            <p className="text-emerald-400 font-bold text-xs">Ya subido ✓</p>
                            <p className="text-white/30 text-[10px]">Pulsa o arrastra para reemplazarlo</p>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            <svg className="w-7 h-7 text-white/20 group-hover:text-brand mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            <p className="text-xs text-white/40 font-medium">Pulsa o arrastra el PDF</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubirRiteCard — la tarea "registra el RITE y devuélvenos el certificado",
// extraída de SubirRiteView para usarla también en /instalador/:id junto a la
// del CIFO. Misma razón que FirmarCifoCard: dos superficies que piden lo mismo
// no pueden pedirlo distinto.
//
// `pideMemoria` es false cuando NUNCA generamos una Memoria RITE para este
// expediente: pedirle "la memoria que os enviamos, firmada" a quien no ha
// recibido ninguna es pedirle un documento que no existe.
// ─────────────────────────────────────────────────────────────────────────────
export function SubirRiteCard({ expedienteId, info, onDone, pideMemoria = true }) {
    const [memoria, setMemoria] = useState(null);
    const [certificado, setCertificado] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    const pickPdf = (f, setter) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setUploadError('Solo se admiten archivos PDF.'); return; }
        setUploadError(null);
        setter(f);
    };

    const handleSubmit = async () => {
        if (!memoria && !certificado) return;
        setUploading(true); setUploadError(null);
        try {
            const form = new FormData();
            if (memoria) form.append('memoria', memoria);
            if (certificado) form.append('certificado', certificado);
            await axios.post(`${API_URL}/rite-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setMemoria(null); setCertificado(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir los archivos. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    const yaSubido = info?.memoria_subida || info?.certificado_subido;

    return (
        <div className="space-y-5">
            <p className="text-white/40 text-sm leading-relaxed">
                Una vez <strong className="text-white">tramitado el certificado</strong>
                {pideMemoria ? <> y <strong className="text-white">firmada la memoria</strong></> : null}, súbelo aquí. Se guarda directamente en el expediente.
            </p>

            {yaSubido && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
                    <svg className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                    <p className="text-emerald-300/90 text-[11px] font-medium leading-relaxed">
                        Ya hay documentación subida en este expediente. Si subes de nuevo, se <strong className="font-bold text-emerald-200">reemplazará</strong> el archivo anterior (no se duplica).
                    </p>
                </div>
            )}

            <DropZone file={certificado} onPick={f => pickPdf(f, setCertificado)} alreadyUploaded={info?.certificado_subido}
                title={pideMemoria ? '1 · Certificado RITE tramitado' : 'Certificado RITE tramitado'}
                desc="El certificado descargado de la plataforma de tramitación (PDF)." />
            {pideMemoria && (
                <DropZone file={memoria} onPick={f => pickPdf(f, setMemoria)} alreadyUploaded={info?.memoria_subida}
                    title="2 · Memoria Técnica firmada"
                    desc="La memoria que os enviamos, ya firmada por vosotros (PDF)." />
            )}

            {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] font-medium flex gap-2 items-center">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {uploadError}
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={(!memoria && !certificado) || uploading}
                className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
            >
                {uploading ? (
                    <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>Subiendo...</>
                ) : (
                    <>Subir documentación<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                )}
            </button>
            <p className="text-[10px] text-white/20 text-center uppercase tracking-wider font-bold">
                Solo PDF{pideMemoria ? ' · puedes subir uno o ambos' : ''}
            </p>
        </div>
    );
}

export default SubirRiteCard;
