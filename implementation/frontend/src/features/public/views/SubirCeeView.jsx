import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Descripción de cada slot para el certificador.
const SLOT_HINTS = {
    xml: 'Fichero .XML del certificado.',
    cex: 'Fichero .CEX del certificado.',
    pdf: 'PDF del certificado firmado.',
    registro: 'Justificante de registro en Industria (PDF).',
    etiqueta: 'Etiqueta energética (PDF).',
};

function SlotRow({ slot, phase, expedienteId, token, onUploaded }) {
    const ref = useRef();
    const [dragging, setDragging] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState(null);

    const doUpload = async (file) => {
        if (!file) return;
        if (file.size === 0) { setError('El archivo está vacío.'); return; }
        setError(null);
        setUploading(true);
        try {
            const form = new FormData();
            form.append('file', file);
            const { data } = await axios.post(
                `${API_URL}/cee-upload/${expedienteId}/${slot.id}?token=${encodeURIComponent(token)}&phase=${phase}`,
                form,
                { headers: { 'Content-Type': 'multipart/form-data' } }
            );
            onUploaded(slot.id, data);
        } catch (e) {
            setError(e.response?.data?.error || 'Error al subir el archivo.');
        } finally {
            setUploading(false);
        }
    };

    const isRegistro = slot.id === 'registro';
    const done = !!slot.current;

    return (
        <div className={`rounded-2xl border p-4 transition-all ${isRegistro ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <div className="flex items-center justify-between mb-2">
                <div>
                    <p className="text-[11px] font-black text-white uppercase tracking-wide flex items-center gap-2">
                        {slot.label}
                        {isRegistro && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 tracking-widest">CLAVE</span>}
                    </p>
                    <p className="text-white/35 text-[11px] leading-snug">{SLOT_HINTS[slot.id] || ''}</p>
                </div>
                {done && (
                    <a href={slot.current.link} target="_blank" rel="noopener noreferrer"
                        className="text-[10px] font-bold text-emerald-400 hover:underline shrink-0 ml-2">Ver ✓</a>
                )}
            </div>

            <input ref={ref} type="file" accept={slot.accept} className="hidden"
                onChange={e => doUpload(e.target.files?.[0])} />
            <div
                onClick={() => !uploading && ref.current?.click()}
                onDragEnter={e => { e.preventDefault(); setDragging(true); }}
                onDragOver={e => { e.preventDefault(); if (!dragging) setDragging(true); }}
                onDragLeave={e => { e.preventDefault(); if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
                onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) doUpload(f); }}
                className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all duration-150 ${
                    dragging ? 'border-brand bg-brand/20 scale-[1.01]'
                        : done ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-white/10 hover:border-brand/40 hover:bg-brand/5'
                }`}
            >
                {uploading ? (
                    <div className="flex items-center justify-center gap-2 py-1 text-brand text-xs font-bold">
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                        Subiendo…
                    </div>
                ) : done ? (
                    <p className="text-emerald-400 text-[11px] font-bold py-1 truncate px-2">
                        {slot.current.name} · <span className="text-white/40">pulsa para reemplazar</span>
                    </p>
                ) : (
                    <p className="text-white/40 text-[11px] font-medium py-1">Pulsa o arrastra el archivo</p>
                )}
            </div>
            {error && <p className="text-red-400 text-[10px] mt-1.5 font-medium">{error}</p>}
        </div>
    );
}

export function SubirCeeView({ expedienteId, token, phase }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [justRegistered, setJustRegistered] = useState(false);

    const loadInfo = useCallback(() => {
        return axios.get(`${API_URL}/cee-upload/${expedienteId}?token=${encodeURIComponent(token)}&phase=${phase}`)
            .then(r => setInfo(r.data))
            .catch(() => setLoadError('El enlace no es válido o ha caducado.'));
    }, [expedienteId, token, phase]);

    useEffect(() => { loadInfo(); }, [loadInfo]);

    const handleUploaded = (slotId, data) => {
        // Refresca el estado desde el servidor (reconciliado con Drive).
        loadInfo();
        if (slotId === 'registro' && data?.registrado) setJustRegistered(true);
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
                    <p className="text-white/40 font-bold uppercase tracking-widest text-xs">Cargando expediente…</p>
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

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden selection:bg-brand selection:text-black">
            <DynamicNetworkBackground />
            <div className="w-full max-w-lg relative z-10 px-4 py-8">
                <div className="text-center mb-8">
                    <h1 className="flex items-baseline justify-center gap-x-2 md:gap-x-4 mb-2">
                        <span className="text-white text-2xl md:text-3xl font-medium tracking-tight">Subir</span>
                        <span className="text-3xl md:text-5xl font-black tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-brand via-brand to-brand-700 uppercase">{info.phaseLabel}</span>
                    </h1>
                    <p className="text-white/60 text-sm">Una vez presentado en Industria, sube aquí el certificado registrado.</p>
                </div>

                <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] overflow-hidden backdrop-blur-xl relative">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>

                    <div className="px-8 pt-8 pb-5 border-b border-white/[0.06] space-y-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-3">Detalles del expediente</p>
                        {[['Expediente', info.numero_expediente, 'text-brand font-mono'], ['Cliente', info.cliente, 'text-white/80'], ['Fase', info.phaseLabel, 'text-white/80']].map(([label, value, cls]) => (
                            <div key={label} className="flex items-center justify-between">
                                <span className="text-[10px] text-white/30 uppercase tracking-widest font-bold">{label}</span>
                                <span className={`text-sm font-bold ${cls}`}>{value || '—'}</span>
                            </div>
                        ))}
                    </div>

                    <div className="p-8 space-y-4">
                        {(justRegistered || info.registrado) && (
                            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-2.5">
                                <svg className="w-5 h-5 shrink-0 mt-0.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                <p className="text-emerald-300/90 text-[12px] font-medium leading-relaxed">
                                    <strong className="text-emerald-200">Registro recibido.</strong> El equipo de Brokergy ha sido notificado automáticamente. ¡Gracias!
                                </p>
                            </div>
                        )}

                        <p className="text-white/40 text-sm leading-relaxed">
                            Sube cada archivo a su casilla. Los archivos se guardan directamente en el expediente y se renombran automáticamente. El <strong className="text-emerald-300">justificante de registro</strong> notifica al equipo de que ya está presentado.
                        </p>

                        {info.slots.map(slot => (
                            <SlotRow key={slot.id} slot={slot} phase={info.phase}
                                expedienteId={expedienteId} token={token} onUploaded={handleUploaded} />
                        ))}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
