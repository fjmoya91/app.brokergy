import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

export function CertAckView({ expedienteId, token, phase }) {
    const [status, setStatus] = useState('loading'); // 'loading' | 'success' | 'error'
    const [data, setData] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        const confirmReception = async () => {
            try {
                const res = await axios.post(`/api/expedientes/${expedienteId}/cert-ack`, {
                    token,
                    phase
                });
                setData(res.data);
                setStatus('success');

                // Redirigir siempre al expediente. Si hay sesión Supabase activa, la
                // app abre el expediente; si no, muestra el LoginView y el
                // initialExpediente persiste tras el login.
                setTimeout(() => {
                    window.location.href = `/?exp=${expedienteId}`;
                }, 2500);
            } catch (err) {
                console.error('Error confirming cert-ack:', err);
                setErrorMsg(err.response?.data?.error || 'No se pudo confirmar la recepción del encargo.');
                setStatus('error');
            }
        };

        if (expedienteId && token) {
            confirmReception();
        } else {
            setErrorMsg('Faltan parámetros en el enlace.');
            setStatus('error');
        }
    }, [expedienteId, token, phase]);

    return (
        <div className="min-h-[70vh] flex items-center justify-center relative p-4">
            <DynamicNetworkBackground />
            
            <div className="bg-slate-900 border border-white/10 rounded-3xl p-8 max-w-lg w-full shadow-2xl relative z-10 text-center animate-fade-in">
                <div className="flex justify-center mb-6">
                    <div className="bg-brand/10 p-3 rounded-2xl">
                        <span className="text-2xl font-black tracking-tighter text-white">
                            <span className="text-brand">BROKERGY</span>
                        </span>
                    </div>
                </div>

                {status === 'loading' && (
                    <div className="flex flex-col items-center justify-center py-8">
                        <div className="w-12 h-12 border-4 border-brand/20 border-t-brand rounded-full animate-spin mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Confirmando encargo...</h2>
                        <p className="text-white/50 text-sm">Por favor, espera un momento.</p>
                    </div>
                )}

                {status === 'success' && data && (
                    <div className="animate-slide-up">
                        <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-500/30">
                            <svg className="w-10 h-10 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tight">¡Encargo Aceptado!</h2>
                        <p className="text-white/70 text-base leading-relaxed mb-6">
                            Hola <strong className="text-white">{data.certName}</strong>, hemos registrado tu confirmación de recepción para el <strong className="text-brand">{data.phase}</strong>.
                        </p>
                        <div className="p-4 rounded-xl bg-white/5 border border-white/10">
                            <p className="text-sm text-white/50 animate-pulse">
                                Redirigiendo automáticamente a tu espacio de trabajo...
                            </p>
                        </div>
                    </div>
                )}

                {status === 'error' && (
                    <div className="animate-slide-up">
                        <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/30">
                            <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-black text-white mb-4 uppercase tracking-tight">Enlace No Válido</h2>
                        <p className="text-red-300/80 text-base leading-relaxed mb-6">
                            {errorMsg}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
