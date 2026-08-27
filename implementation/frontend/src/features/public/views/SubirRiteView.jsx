import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';
import { SubirRiteCard } from '../components/SubirRiteCard';

const isProd = import.meta.env.PROD;
const API_URL = isProd ? '/api/public' : 'http://localhost:3000/api/public';

// Página de SOLO el RITE. Sigue viva porque su enlace ya viaja en mensajes
// enviados; la superficie de subida es la MISMA que usa /instalador/:id — ver
// SubirRiteCard.
export function SubirRiteView({ expedienteId }) {
    const [info, setInfo] = useState(null);
    const [loadError, setLoadError] = useState(null);
    const [done, setDone] = useState(false);

    const loadInfo = () => axios.get(`${API_URL}/rite-upload/${expedienteId}`)
        .then(r => setInfo(r.data))
        .catch(() => setLoadError('No se ha encontrado el expediente o el enlace no es válido.'));

    useEffect(() => { loadInfo(); }, [expedienteId]);

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

                    <div className="p-8">
                        {done ? (
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-8 text-center animate-fade-in">
                                <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4 border border-emerald-500/20">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                </div>
                                <h2 className="text-xl font-black text-emerald-400 uppercase tracking-widest mb-3">¡Documentación recibida!</h2>
                                <p className="text-white/50 text-sm leading-relaxed">Gracias. El equipo de Brokergy continuará con la tramitación del expediente <strong className="text-brand">{info.numero_expediente}</strong>.</p>
                                <button onClick={() => { setDone(false); loadInfo(); }} className="mt-6 text-[11px] text-brand/70 hover:text-brand font-black uppercase tracking-widest underline underline-offset-4">Subir o reemplazar otro documento</button>
                            </div>
                        ) : (
                            <SubirRiteCard expedienteId={expedienteId} info={info} onDone={() => { setDone(true); loadInfo(); }} />
                        )}
                    </div>
                </div>

                <p className="text-center mt-8 text-[10px] uppercase font-black tracking-[0.2em] text-white/20">Sistema de Gestión Brokergy &copy; {new Date().getFullYear()}</p>
            </div>
        </div>
    );
}
