import React, { useState, useRef } from 'react';
import axios from 'axios';
import FirmarConCertificadoModal from '../../expedientes/components/FirmarConCertificadoModal';
import { SIGN_BOXES } from '../../expedientes/logic/signBoxes';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// ─────────────────────────────────────────────────────────────────────────────
// FirmarCifoCard — la tarea "firma el Certificado CIFO", extraída de
// SubirCifoView para poder usarla también en la página unificada del instalador
// (/instalador/:id), donde convive con la del RITE.
//
// Se saca a un componente y no se copia porque las dos superficies tienen que
// ofrecer EXACTAMENTE lo mismo: si la de firmar bloqueara un CIFO rechazado y la
// otra no, el instalador volvería a firmar el documento con el error.
//
// Props:
//   expedienteId · info: { numero_expediente, bloqueado, rechazo }
//   onDone(): se llama cuando el firmado ya está en nuestro poder.
//   compacta: dentro de la página unificada, sin su propia caja ni cabecera.
// ─────────────────────────────────────────────────────────────────────────────
export function FirmarCifoCard({ expedienteId, info, onDone, compacta = false }) {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signOpen, setSignOpen] = useState(false);
    const [preparingSign, setPreparingSign] = useState(false);
    const inputRef = useRef();

    const handleFile = (f) => {
        if (!f) return;
        if (f.type !== 'application/pdf') { setUploadError('Solo se admiten archivos PDF.'); return; }
        setUploadError(null);
        setFile(f);
    };

    const subir = async (blob, nombre) => {
        const form = new FormData();
        form.append('cifo', blob, nombre);
        await axios.post(`${API_URL}/cifo-upload/${expedienteId}`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
    };

    const handleSubmit = async () => {
        if (!file) return;
        setUploading(true); setUploadError(null);
        try {
            await subir(file, file.name);
            setFile(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'Error al subir el archivo. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    // Firma directa con Autofirma: se descarga el borrador, se firma en el
    // navegador y el firmado sube al mismo endpoint. El instalador no descarga
    // ni vuelve a subir nada.
    const handleSignNow = async () => {
        setUploadError(null); setPreparingSign(true);
        try {
            const { data } = await axios.get(`${API_URL}/cifo-upload/${expedienteId}/pdf`);
            if (!data?.pdf) throw new Error('No se recibió el documento');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (e) {
            setUploadError(e.response?.data?.error || 'No se pudo cargar el CIFO para firmar.');
        } finally { setPreparingSign(false); }
    };

    const handleSigned = async (signedB64) => {
        setUploading(true); setUploadError(null);
        try {
            const bytes = Uint8Array.from(atob(signedB64), c => c.charCodeAt(0));
            await subir(new Blob([bytes], { type: 'application/pdf' }), `${info?.numero_expediente || 'CIFO'}_fdo.pdf`);
            setSignOpen(false);
            setSignPdfB64(null);
            if (onDone) onDone();
        } catch (e) {
            setUploadError(e.response?.data?.error || 'El documento se firmó pero no se pudo enviar. Inténtalo de nuevo.');
        } finally { setUploading(false); }
    };

    // Rechazado y todavía sin corregir: no se ofrece firmar, sería volver a
    // firmar el mismo error (regla 24).
    if (info?.bloqueado) {
        return (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-8 text-center animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-4 border border-amber-500/20">
                    <svg className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                </div>
                <h2 className="text-xl font-black text-amber-400 uppercase tracking-widest mb-3">Estamos corrigiéndolo</h2>
                <p className="text-white/50 text-sm leading-relaxed">
                    El <strong className="text-white">Certificado CIFO</strong> del expediente <strong className="text-brand">{info.numero_expediente}</strong> tenía un error y lo estamos corrigiendo.
                    {info.rechazo?.motivo ? <><br /><span className="text-white/35">Motivo: {info.rechazo.motivo}</span></> : null}
                    <br />Te enviaremos la versión corregida para que la firmes. No hace falta que hagas nada mientras tanto.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-5">
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
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Subir Certificado ya firmado
            </h3>

            <p className="text-white/40 text-sm leading-relaxed">
                Si ya lo firmaste con otra herramienta, adjunta aquí el <strong className="text-white">Certificado CIFO firmado</strong>.
                El archivo se guardará directamente en el expediente.
            </p>

            <div className="relative group">
                <input ref={inputRef} type="file" accept="application/pdf"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onChange={e => handleFile(e.target.files?.[0])} />
                <div
                    onDragOver={e => e.preventDefault()}
                    onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) handleFile(f); }}
                    className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${file ? 'border-brand/40 bg-brand/5' : 'border-white/10 group-hover:border-brand/40 group-hover:bg-brand/5'}`}
                >
                    {file ? (
                        <div className="space-y-2">
                            <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                            </div>
                            <p className="text-brand font-bold text-sm truncate px-4">{file.name}</p>
                            <p className="text-white/30 text-xs">{(file.size / 1024).toFixed(0)} KB · Haz clic para cambiar</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mx-auto group-hover:scale-110 transition-transform">
                                <svg className="w-6 h-6 text-white/20 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            </div>
                            <p className="text-sm text-white/40 font-medium">Pulsa o arrastra el PDF aquí</p>
                            <p className="text-[10px] text-white/20 uppercase tracking-wider font-bold">Solo archivos PDF · Máx. 20 MB</p>
                        </div>
                    )}
                </div>
            </div>

            {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[11px] font-medium flex gap-2 items-center">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    {uploadError}
                </div>
            )}

            <button
                onClick={handleSubmit}
                disabled={!file || uploading}
                className="w-full py-4 bg-gradient-to-r from-brand to-brand-700 hover:from-brand-400 hover:to-brand-600 text-bkg-deep font-black rounded-xl transition-all shadow-lg shadow-brand/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-sm uppercase tracking-widest"
            >
                {uploading ? (
                    <><svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Subiendo...</>
                ) : (
                    <>Subir CIFO firmado<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg></>
                )}
            </button>

            {/* El instalador firma con SU certificado: sin la rúbrica de Brokergy.
                El recuadro es FIJO (SIGN_BOXES.cifo_res060). */}
            {signOpen && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar Certificado CIFO · ${info?.numero_expediente || ''}`}
                    rubricImageUrl={null}
                    initialPage={2}
                    signatureAnchor={['espacio reservado para firma']}
                    fixedBox={SIGN_BOXES.cifo_res060}
                    onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                    onSigned={handleSigned}
                />
            )}
        </div>
    );
}

export default FirmarCifoCard;
