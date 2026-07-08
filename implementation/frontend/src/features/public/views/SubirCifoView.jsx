import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { SIGN_BOXES } from '../../expedientes/logic/signBoxes';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

export function SubirCifoView({ expedienteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [done, setDone] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const inputRef = useRef();
    // Firma en el navegador con Autofirma (sin descargar el PDF)
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [preparingSign, setPreparingSign] = useState(false);

    useEffect(() => {
        axios.get(`${API_URL}/cifo-upload/${expedienteId}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));
    }, [expedienteId]);

    const handleFile = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf') {
            setUploadError('Solo se admiten archivos PDF.');
            return;
        }
        setUploadError(null);
        setFile(f);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) handleFile(f);
    };

    const handleSubmit = async () => {
        if (!file) return;
        setUploading(true);
        setUploadError(null);
        try {
            const form = new FormData();
            form.append('cifo', file);
            await axios.post(`${API_URL}/cifo-upload/${expedienteId}`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir el archivo. Inténtalo de nuevo.');
        } finally {
            setUploading(false);
        }
    };

    // ── FIRMA DIRECTA CON AUTOFIRMA (sin descargar el PDF) ────────────────────
    // 1) descarga el CIFO borrador en base64, 2) abre el modal de firma con
    // recuadro arrastrable, 3) al firmar sube el PDF firmado al mismo endpoint.
    const handleSignNow = async () => {
        setUploadError(null);
        setPreparingSign(true);
        try {
            const { data } = await axios.get(`${API_URL}/cifo-upload/${expedienteId}/pdf`);
            if (!data?.pdf) throw new Error('No se recibió el documento');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'No se pudo cargar el CIFO para firmar.');
        } finally {
            setPreparingSign(false);
        }
    };

    // Recibe el PDF firmado (base64) desde Autofirma → lo sube al endpoint público.
    const handleSigned = async (signedB64) => {
        setUploading(true);
        setUploadError(null);
        try {
            const bytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const form = new FormData();
            form.append('cifo', blob, `${info?.numero_expediente || 'CIFO'}_fdo.pdf`);
            await axios.post(`${API_URL}/cifo-upload/${expedienteId}`, form, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            setSignOpen(false);
            setSignPdfB64(null);
            setDone(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'El documento se firmó pero no se pudo enviar. Inténtalo de nuevo.');
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
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
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
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500/40 to-transparent rounded-t-[2.5rem]"></div>
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                        <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Enlace no válido</h2>
                    <p className="text-white/40 text-sm leading-relaxed">{loadError}</p>
                    <div className="mt-8 p-4 rounded-xl bg-white/5 border border-white/10 text-white/20 text-[10px] uppercase font-bold tracking-widest">
                        Si crees que esto es un error, contacta con Brokergy
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />

            <div className="w-full max-w-lg relative z-10 px-4">

                {/* Header */}
                <div className="text-center mb-10 relative">
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Certificado</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">BROKERGY</span>
                    </h1>
                    <p className="text-white/60 text-sm md:text-base relative z-10">
                        Subida segura del CIFO firmado digitalmente.
                    </p>
                </div>

                <div className="relative">
                    <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>

                    <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                        {/* Info expediente */}
                        <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del expediente</p>
                            {[
                                ['Expediente', info.numero_expediente, 'text-brand font-mono'],
                                ['Cliente', info.cliente, 'text-white/80'],
                                ['Instalador', info.instalador, 'text-white/80'],
                            ].map(([label, value, cls]) => (
                                <div key={label} className="flex items-center justify-between">
                                    <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{label}</span>
                                    <span className={`text-sm font-bold ${cls}`}>{value || '—'}</span>
                                </div>
                            ))}
                        </div>

                        <div className="p-8 space-y-5">
                            {done ? (
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                    <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                        <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                    <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Documento recibido!</h2>
                                    <p className="text-white/50 text-sm leading-relaxed">
                                        El <strong className="text-white">Certificado CIFO firmado</strong> del expediente <strong className="text-brand">{info.numero_expediente}</strong> se ha subido correctamente.<br />
                                        Nuestro equipo continuará con la tramitación.
                                    </p>
                                    <p className="text-white/20 text-xs mt-6">Puedes cerrar esta ventana.</p>
                                </div>
                            ) : (
                                <>
                                    {/* OPCIÓN RECOMENDADA: firmar en el navegador con Autofirma */}
                                    <div className="rounded-2xl border border-brand/20 bg-brand/[0.04] p-5">
                                        <h3 className="text-xs font-black text-brand uppercase tracking-widest flex items-center gap-2 mb-2">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            Firmar con certificado (recomendado)
                                        </h3>
                                        <p className="text-white/40 text-sm leading-relaxed mb-4">
                                            Firma el CIFO <strong className="text-white">directamente aquí</strong> con tu certificado
                                            electrónico mediante <strong className="text-white">Autofirma</strong>, sin descargar ni
                                            volver a subir nada. Necesitas tener Autofirma instalado.
                                        </p>
                                        <button
                                            onClick={handleSignNow}
                                            disabled={preparingSign || uploading}
                                            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                        >
                                            {preparingSign ? (
                                                <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Cargando documento...</>
                                            ) : (
                                                <>🖊️ Firmar ahora con Autofirma</>
                                            )}
                                        </button>
                                    </div>

                                    <div className="flex items-center gap-3 my-1">
                                        <div className="flex-1 h-px bg-white/10" />
                                        <span className="text-[10px] font-black uppercase tracking-widest text-white/25">o subir manualmente</span>
                                        <div className="flex-1 h-px bg-white/10" />
                                    </div>

                                    <h3 className="text-xs font-black text-white/50 uppercase tracking-widest flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                        </svg>
                                        Subir Certificado ya firmado
                                    </h3>

                                    <p className="text-white/40 text-sm leading-relaxed">
                                        Si ya lo firmaste con otra herramienta, adjunta aquí el <strong className="text-white">Certificado CIFO firmado</strong>.
                                        El archivo se guardará directamente en el expediente.
                                    </p>

                                    {/* Drop zone */}
                                    <div className="relative group">
                                        <input
                                            ref={inputRef}
                                            type="file"
                                            accept="application/pdf"
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                            onChange={e => handleFile(e.target.files?.[0])}
                                        />
                                        <div
                                            onDragOver={e => e.preventDefault()}
                                            onDrop={handleDrop}
                                            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                                                file
                                                    ? 'border-brand/40 bg-brand/5'
                                                    : 'border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5'
                                            }`}
                                        >
                                            {file ? (
                                                <div className="space-y-2">
                                                    <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                                        <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-brand font-bold text-sm truncate px-4">{file.name}</p>
                                                    <p className="text-white/30 text-xs">{(file.size / 1024).toFixed(0)} KB · Haz clic para cambiar</p>
                                                </div>
                                            ) : (
                                                <div className="space-y-2">
                                                    <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                                        <svg className="w-6 h-6 text-white/20 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                                        </svg>
                                                    </div>
                                                    <p className="text-sm text-white/40 font-medium">Pulsa o arrastra el PDF aquí</p>
                                                    <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Solo archivos PDF · Máx. 20 MB</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {uploadError && (
                                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] font-medium flex gap-2 items-center">
                                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                            </svg>
                                            {uploadError}
                                        </div>
                                    )}

                                    <button
                                        onClick={handleSubmit}
                                        disabled={!file || uploading}
                                        className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                    >
                                        {uploading ? (
                                            <>
                                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Subiendo...
                                            </>
                                        ) : (
                                            <>
                                                Subir CIFO firmado
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                </svg>
                                            </>
                                        )}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <p className="text-center mt-10 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                </p>
            </div>

            {/* Modal de firma con Autofirma (recuadro arrastrable). El instalador firma
                con SU certificado, por eso no lleva la rúbrica/logo de Brokergy. */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar Certificado CIFO · ${info?.numero_expediente || ''}`}
                    rubricImageUrl={null}
                    initialPage={2}
                    signatureAnchor={['firma y sello@2', 'firma y sello', 'espacio reservado para firma']}
                    fixedBox={SIGN_BOXES.cifo_res060}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleSigned}
                />
            )}
        </div>
    );
}
