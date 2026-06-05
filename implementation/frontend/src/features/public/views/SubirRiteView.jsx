import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Página pública para que el instalador suba, tras firmar/tramitar:
//  - la MEMORIA firmada  → cert_rite_signed_link
//  - el CERTIFICADO RITE → cert_rite_drive_link (slot "Certificado RITE")
export function SubirRiteView({ expedienteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [memoria, setMemoria] = useState(null);
    const [certificado, setCertificado] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [uploadError, setUploadError] = useState(null);

    useEffect(() => {
        axios.get(`${API_URL}/rite-upload/${expedienteId}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));
    }, [expedienteId]);

    const pickPdf = (f, setter) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setUploadError('Solo se admiten archivos PDF.'); return; }
        setUploadError(null);
        setter(f);
    };

    const handleSubmit = async () => {
        if (!memoria && !certificado) return;
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            if (memoria) form.append('memoria', memoria);
            if (certificado) form.append('certificado', certificado);
            await axios.post(`${API_URL}/rite-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir los archivos. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    if (!info && !loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                    </svg>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando expediente...</p>
                </div>
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <DynamicNetworkBackground />
                <div className="w-full max-w-md relative z-10 bg-bkg-surface border border-white/[0.06] rounded-[2.5rem] p-10 text-center backdrop-blur-xl">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Enlace no válido</h2>
                    <p className="text-white/40 text-sm leading-relaxed">{loadError}</p>
                </div>
            </div>
        );
    }

    const DropZone = ({ file, setter, title, desc }) => {
        const ref = useRef();
        return (
            <div>
                <p className="text-[11px] font-black text-white uppercase tracking-wide mb-1">{title}</p>
                <p className="text-white/35 text-[11px] mb-2 leading-snug">{desc}</p>
                <div className="relative group">
                    <input ref={ref} type="file" accept="application/pdf"
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        onChange={e => pickPdf(e.target.files?.[0], setter)} />
                    <div
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); pickPdf(e.dataTransfer.files?.[0], setter); }}
                        className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${file ? 'border-brand/40 bg-brand/5' : 'border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5'}`}
                    >
                        {file ? (
                            <div className="space-y-1">
                                <svg className="w-7 h-7 text-brand mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                <p className="text-brand font-bold text-xs truncate px-2">{file.name}</p>
                                <p className="text-white/30 text-[10px]">{(file.size / 1024).toFixed(0)} KB · cambiar</p>
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
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-lg relative z-10 px-4">
                <div className="text-center mb-8 relative">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Documentación</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">RITE</span>
                    </h1>
                    <p className="text-white/60 text-sm">Sube la memoria firmada y el certificado RITE tramitado.</p>
                </div>

                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del expediente</p>
                        {[['Expediente', info.numero_expediente, 'text-brand font-mono'], ['Cliente', info.cliente, 'text-white/80'], ['Instalador', info.instalador, 'text-white/80']].map(([label, value, cls]) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{label}</span>
                                <span className={`text-sm font-bold ${cls}`}>{value || '—'}</span>
                            </div>
                        ))}
                    </div>

                    <div className="p-8 space-y-5">
                        {done ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Documentación recibida!</h2>
                                <p className="text-white/50 text-sm leading-relaxed">Gracias. El equipo de Brokergy continuará con la tramitación del expediente <strong className="text-brand">{info.numero_expediente}</strong>.</p>
                                <p className="text-white/20 text-xs mt-6">Puedes cerrar esta ventana.</p>
                            </div>
                        ) : (
                            <>
                                <p className="text-white/40 text-sm leading-relaxed">
                                    Una vez <strong className="text-white">firmada la memoria</strong> y <strong className="text-white">tramitado el certificado</strong>, súbelos aquí. Se guardarán directamente en el expediente.
                                </p>

                                <DropZone file={memoria} setter={setMemoria} title="1 · Memoria Técnica firmada" desc="La memoria que os enviamos, ya firmada por vosotros (PDF)." />
                                <DropZone file={certificado} setter={setCertificado} title="2 · Certificado RITE tramitado" desc="El certificado descargado de la plataforma de tramitación (PDF)." />

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
                                <p className="text-[10px] text-white/20 text-center uppercase tracking-wider font-bold">Solo PDF · puedes subir uno o ambos</p>
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
