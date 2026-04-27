import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

// Usamos el entorno para definir dónde están las API (Vite local o Vercel)
const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

/**
 * Componente interactivo para subir fotos/vídeos directamente a Drive
 */
function FileUploadSection({ idOportunidad, API_URL }) {
    const [files, setFiles] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [uploaded, setUploaded] = useState(false);
    const [error, setError] = useState(null);

    const handleFileChange = (e) => {
        const newFiles = Array.from(e.target.files);
        setFiles(prev => [...prev, ...newFiles].slice(0, 50)); // Limite 50
        setError(null);
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleUpload = async () => {
        if (files.length === 0) return;
        
        setUploading(true);
        setError(null);
        setProgress(0);

        let successCount = 0;
        const totalFiles = files.length;

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const formData = new FormData();
                formData.append('files', file);

                // Update progress based on which file we are uploading
                const baseProgress = (i / totalFiles) * 100;
                setProgress(Math.round(baseProgress));

                await axios.post(`${API_URL}/upload-docs/${idOportunidad}`, formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent) => {
                        const filePercent = (progressEvent.loaded / progressEvent.total) * (100 / totalFiles);
                        setProgress(Math.round(baseProgress + filePercent));
                    }
                });
                successCount++;
            }
            
            setUploaded(true);
            setFiles([]);
            setProgress(100);
        } catch (err) {
            console.error("Error subiendo archivos:", err);
            const errorMsg = err.response?.data?.error || "Error al subir los archivos. Por favor, revisa el tamaño (máx 100MB por archivo) e inténtalo de nuevo.";
            setError(errorMsg);
        } finally {
            setUploading(false);
        }
    };

    if (uploaded) {
        return (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-6 text-center animate-fade-in">
                <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-6 h-6 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                </div>
                <h4 className="text-white font-bold mb-1">¡Documentación enviada!</h4>
                <p className="text-white/40 text-xs">Tus archivos ya están en nuestra carpeta técnica.</p>
                <button 
                    onClick={() => setUploaded(false)}
                    className="mt-4 text-xs font-bold text-brand hover:underline uppercase tracking-widest"
                >
                    Subir más archivos
                </button>
            </div>
        );
    }

    return (
        <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-5 sm:p-6 transition-all">
            <h3 className="text-xs font-black text-brand uppercase tracking-widest mb-4 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Subir Fotos de la Instalación
            </h3>

            {/* Dropzone Area */}
            {!uploading && (
                <div className="relative group">
                    <input 
                        type="file" 
                        multiple 
                        accept="image/*,video/*"
                        onChange={handleFileChange}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    />
                    <div className="border-2 border-dashed border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5 rounded-xl p-8 text-center transition-all">
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform">
                            <svg className="w-6 h-6 text-white/20 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                        </div>
                        <p className="text-sm text-white/40 font-medium">Pulsa o arrastra tus fotos aquí</p>
                        <p className="text-[10px] text-white/20 mt-1 uppercase tracking-wider font-bold">Máx. 50 archivos (100MB cada uno)</p>
                    </div>
                </div>
            )}

            {/* File List */}
            {files.length > 0 && !uploading && (
                <div className="mt-6 space-y-2">
                    {files.map((file, i) => (
                        <div key={i} className="flex items-center justify-between bg-white/[0.05] p-3 rounded-lg border border-white/5">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="w-8 h-8 rounded bg-brand/10 flex items-center justify-center text-brand shrink-0">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <span className="text-xs text-white/60 truncate font-medium">{file.name}</span>
                            </div>
                            <button onClick={() => removeFile(i)} className="text-white/20 hover:text-red-400 p-1">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    ))}
                    
                    <button 
                        onClick={handleUpload}
                        className="w-full mt-4 py-3 bg-brand text-bkg-deep font-black rounded-xl hover:bg-brand-400 transition-all flex items-center justify-center gap-2 text-xs uppercase tracking-widest shadow-lg shadow-brand/20"
                    >
                        Subir ahora a Brokergy
                    </button>
                </div>
            )}

            {/* Progress Bar */}
            {uploading && (
                <div className="py-8 text-center">
                    <div className="mb-4 flex flex-col items-center">
                        <div className="text-brand text-2xl font-black mb-1">{progress}%</div>
                        <div className="text-white/30 text-[10px] font-bold uppercase tracking-widest">Enviando archivos...</div>
                    </div>
                    <div className="w-full bg-white/5 h-2 rounded-full overflow-hidden border border-white/5">
                        <div 
                            className="bg-gradient-to-r from-brand to-brand-700 h-full transition-all duration-300"
                            style={{ width: `${progress}%` }}
                        ></div>
                    </div>
                </div>
            )}

            {error && (
                <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] font-medium flex gap-2 items-center">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {error}
                </div>
            )}
        </div>
    );
}

export function AceptarPropuestaView({ idOportunidad }) {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState(null);
    const [showIbanInfo, setShowIbanInfo] = useState(false);
    const [noInstaller, setNoInstaller] = useState(false);

    const [formData, setFormData] = useState({
        nombre_razon_social: '',
        apellidos: '',
        dni_cif: '',
        email: '',
        telefono: '',
        iban: ''
    });

    const [generatedExpediente, setGeneratedExpediente] = useState(null);
    const [displayId, setDisplayId] = useState(idOportunidad);

    useEffect(() => {
        const fetchCliente = async () => {
            try {
                const res = await axios.get(`${API_URL}/cliente/${idOportunidad}`);
                // fill the form if dat exist
                const { estado, numero_expediente, id_oportunidad: readableId, tiene_instalador, ...rest } = res.data;
                
                if (tiene_instalador === false) {
                    setNoInstaller(true);
                    setLoading(false);
                    if (readableId) setDisplayId(readableId);
                    return;
                }

                setFormData(prev => ({
                    ...prev,
                    ...rest
                }));
                if (readableId) setDisplayId(readableId);

                // Si ya está aceptada, saltamos directamente a la pantalla de éxito/subida de docs
                if (estado === 'ACEPTADA') {
                        if (numero_expediente) {
                            setGeneratedExpediente(numero_expediente);
                        }
                    setSuccess(true);
                }
            } catch (err) {
                console.error("No se pudo cargar info del cliente:", err);
                if (err.response && err.response.status === 404) {
                    setError("Esta propuesta ya no existe o el ID es incorrecto.");
                }
            } finally {
                setLoading(false);
            }
        };

        if (idOportunidad) {
            fetchCliente();
        }
    }, [idOportunidad]);

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitting(true);
        setError(null);
        try {
             const res = await axios.post(`${API_URL}/aceptar/${idOportunidad}`, formData);
             if (res.data.numeroExpediente) {
                 setGeneratedExpediente(res.data.numeroExpediente);
             }
             setSuccess(true);
        } catch (err) {
             const msg = err.response?.data?.error || "Ocurrió un error al procesar tu aceptación. Por favor, inténtalo de nuevo.";
             setError(msg);
             if (err.response?.data?.code === 'INSTALLER_REQUIRED') {
                 setNoInstaller(true);
             }
             setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center">
                <DynamicNetworkBackground />
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <svg className="w-8 h-8 animate-spin text-brand" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando propuesta...</p>
                </div>
            </div>
        );
    }

    if (noInstaller) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
                <DynamicNetworkBackground />
                <div className="w-full max-w-md relative z-10 bg-bkg-surface border border-white/[0.06] rounded-[2.5rem] p-10 text-center backdrop-blur-xl animate-in fade-in zoom-in-95 duration-500">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
                    
                    <div className="w-20 h-20 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-amber-500/30 shadow-[0_0_30px_rgba(245,158,11,0.1)]">
                        <svg className="w-10 h-10 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                    </div>
                    <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Acción Pendiente</h2>
                    <p className="text-white/60 text-sm leading-relaxed mb-8">
                        Esta propuesta requiere la asignación de un **instalador** por parte de Brokergy antes de poder ser aceptada. 
                        <br /><br />
                        Por favor, contacta con tu asesor para completar este paso obligatorio.
                    </p>
                    <div className="pt-6 border-t border-white/5">
                        <p className="text-[10px] font-bold text-white/20 uppercase tracking-[0.2em] mb-1">Referencia Oportunidad</p>
                        <p className="text-lg font-mono text-white/40 font-bold">{displayId}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center py-10 px-4 relative overflow-x-hidden selection:bg-brand selection:text-black">
                <DynamicNetworkBackground />

                <div className="w-full max-w-2xl relative z-10">
                    {/* Header: EXACT match to Firma screen */}
                    <div className="text-center mb-10 relative px-4">
                        <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                        
                        <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                             <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Propuesta</span>
                             <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">
                                  BROKERGY
                             </span>
                        </h1>
                        <p className="text-white/60 text-sm md:text-base relative z-10">
                             Siguientes pasos para preparar tu expediente.
                        </p>
                    </div>

                    <div className="relative">
                        <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
                        
                        <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2.5rem] p-6 sm:p-10 relative overflow-hidden backdrop-blur-xl transition-all font-inter">
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                            {/* Success Icon & Main Title */}
                            <div className="text-center mb-8">
                                <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                    <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                <h2 className="text-3xl font-black text-white mb-3 tracking-tight">¡Propuesta Aceptada!</h2>
                                <p className="text-white/40 text-sm leading-relaxed max-w-md mx-auto">
                                    Hemos recibido la aceptación correctamente. <strong>También recibirás un email con estas indicaciones.</strong> 
                                    Ahora prepararemos el <strong>CEE Inicial</strong> necesario para tu expediente.
                                </p>
                            </div>

                            {/* Expediente Badge - Very visible */}
                            <div className="bg-white/5 border border-brand/20 rounded-2xl p-6 mb-8 text-center ring-1 ring-brand/10">
                                <div className="text-white/30 text-[10px] font-black uppercase tracking-[0.2em] mb-1">
                                    Número de expediente asignado
                                </div>
                                <div className="text-3xl font-black text-brand tracking-widest">{generatedExpediente || 'PTE...'}</div>
                            </div>

                            {/* File Upload Section - Dynamic Replacement */}
                            <FileUploadSection idOportunidad={idOportunidad} API_URL={API_URL} />

                            <div className="my-8 flex items-center gap-4">
                                <div className="h-px flex-1 bg-white/5"></div>
                                <div className="text-[10px] font-black text-white/20 uppercase tracking-[0.2em]">o bien vía</div>
                                <div className="h-px flex-1 bg-white/5"></div>
                            </div>

                            {/* CTA Actions - Mobile Optimized Buttons */}
                            <div className="space-y-3">
                                <a 
                                    href={`https://wa.me/34623926179?text=${encodeURIComponent(`Hola, soy ${formData.nombre_razon_social || ''}. Os envío documentación del expediente ${generatedExpediente}.`)}`}
                                    className="w-full py-4 bg-[#0f8f66]/20 hover:bg-[#0f8f66]/30 border border-[#0f8f66]/40 text-[#4ade80] font-black rounded-xl transition-all shadow-lg flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                >
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                                    Asistente por WhatsApp
                                </a>
                                <a 
                                    href={`mailto:info@brokergy.es?subject=Documentación expediente ${generatedExpediente}&body=Hola, os envío documentación del expediente ${generatedExpediente}.`}
                                    className="w-full py-4 bg-white/5 border border-white/10 text-white font-black rounded-xl hover:bg-white/10 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    Enviar por Email
                                </a>
                            </div>

                            <div className="mt-8 text-center">
                                <p className="text-[10px] text-white/20 italic">
                                    El CEE inicial debe emitirse <strong>antes de la última factura de obra</strong>.
                                </p>
                            </div>
                        </div>
                    </div>

                    <p className="text-center mt-10 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                        Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />

            <div className="w-full max-w-2xl relative z-10 px-4">
                
                {/* Header Style matching Login */}
                <div className="text-center mb-10 relative">
                    <div className="absolute -top-24 -left-24 w-64 h-64 bg-amber-500/10 rounded-full blur-[100px] pointer-events-none animate-pulse"></div>
                    
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2 relative z-10">
                         <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Propuesta</span>
                         <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">
                               BROKERGY
                         </span>
                    </h1>
                    <p className="text-white/60 text-sm md:text-base relative z-10">
                         Verifica y completa tus datos para procesar la aceptación.
                    </p>
                </div>

                <div className="relative group">
                    <div className="absolute -bottom-24 -right-24 w-64 h-64 bg-orange-600/10 rounded-full blur-[100px] pointer-events-none animate-pulse" style={{ animationDelay: '2s' }}></div>
                    
                    <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-8 sm:p-10 relative overflow-hidden backdrop-blur-xl">
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                        {error && !formData.nombre_razon_social ? (
                            <div className="text-center py-6 animate-fade-in">
                                <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                                    <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h2 className="text-2xl font-black text-white mb-4 tracking-tight">Acceso No Válido</h2>
                                <p className="text-white/40 mb-8">{error}</p>
                                <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/20 text-[10px] uppercase font-bold tracking-widest">
                                    Si crees que esto es un error, contacta con tu gestor Brokergy
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="text-center mb-10">
                                    <h2 className="text-2xl font-black text-white mb-2 tracking-tight uppercase">
                                        Firma de Aceptación
                                    </h2>
                                    <p className="text-white/40 text-xs font-bold uppercase tracking-widest">
                                        Expediente: <span className="text-white/60">{displayId}</span>
                                    </p>
                                </div>

                                {error && (
                                    <div className="mb-8 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm flex gap-3 items-start animate-shake">
                                        <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-6">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 ml-1" htmlFor="nombre_razon_social">
                                                Nombre / Razón Social <span className="text-brand">*</span>
                                            </label>
                                            <input 
                                                id="nombre_razon_social"
                                                name="nombre_razon_social"
                                                type="text" 
                                                required
                                                value={formData.nombre_razon_social}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 ml-1" htmlFor="apellidos">
                                                Apellidos
                                            </label>
                                            <input 
                                                id="apellidos"
                                                name="apellidos"
                                                type="text" 
                                                value={formData.apellidos || ''}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 ml-1" htmlFor="dni_cif">
                                                DNI / CIF <span className="text-brand">*</span>
                                            </label>
                                            <input 
                                                id="dni_cif"
                                                name="dni_cif"
                                                type="text" 
                                                required
                                                value={formData.dni_cif || ''}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium uppercase"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 ml-1" htmlFor="email">
                                                Email <span className="text-brand">*</span>
                                            </label>
                                            <input 
                                                id="email"
                                                name="email"
                                                type="email" 
                                                required
                                                value={formData.email || ''}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <label className="block text-xs font-black uppercase tracking-widest text-white/40 ml-1" htmlFor="telefono">
                                                Teléfono <span className="text-brand">*</span>
                                            </label>
                                            <input 
                                                id="telefono"
                                                name="telefono"
                                                type="tel" 
                                                required
                                                value={formData.telefono || ''}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium"
                                            />
                                        </div>

                                        <div className="space-y-1.5 relative">
                                            <div className="flex items-center justify-between mb-1.5 ml-1">
                                                <label className="block text-xs font-black uppercase tracking-widest text-white/40" htmlFor="iban">
                                                    Cuenta (IBAN)
                                                </label>
                                                <button 
                                                    type="button"
                                                    onClick={() => setShowIbanInfo(!showIbanInfo)}
                                                    className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/40 hover:text-brand hover:border-brand/40 transition-all group"
                                                    title="¿Por qué pedimos esto?"
                                                >
                                                    i
                                                </button>
                                            </div>

                                            {showIbanInfo && (
                                                <div className="absolute bottom-full left-0 right-0 mb-3 bg-slate-800 border border-brand/30 p-4 rounded-xl shadow-2xl z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                                    <div className="text-[11px] text-white/80 leading-relaxed">
                                                        <p className="mb-2">Pedimos el <strong>IBAN</strong> porque es necesario para generar el anexo para acreditar ante el Ministerio que quien recibe el dinero es la persona que hace la inversión.</p>
                                                        <p>Ten en cuenta que posteriormente nos tendrás que aportar el <strong>justificante de titularidad bancaria</strong> (no solo el número).</p>
                                                    </div>
                                                    <div className="absolute bottom-0 left-6 translate-y-1/2 rotate-45 w-2 h-2 bg-slate-800 border-r border-b border-brand/30"></div>
                                                </div>
                                            )}

                                            <input 
                                                id="iban"
                                                name="iban"
                                                type="text" 
                                                value={formData.iban || ''}
                                                onChange={handleChange}
                                                className="w-full bg-bkg-elevated border border-white/[0.1] rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:border-brand focus:ring-1 focus:ring-brand transition-all font-medium uppercase"
                                                placeholder="ESXX XXXX ..."
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-6">
                                        <button
                                            type="submit"
                                            disabled={submitting}
                                            className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-base uppercase tracking-widest"
                                        >
                                            {submitting ? (
                                                <>
                                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    Procesando...
                                                </>
                                            ) : (
                                                <>
                                                    Confirmar y Aceptar Propuesta
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                                    </svg>
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </form>
                            </>
                        )}
                    </div>
                </div>

                <p className="text-center mt-10 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">
                    Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}
