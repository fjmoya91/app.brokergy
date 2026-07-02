/**
 * PortalLoginView — acceso del cliente a "Mi expediente".
 * URL: /portal (o /mi-expediente sin token)
 *
 * Login de baja fricción, estilo JCCM: nº de expediente + DNI. Si valida,
 * redirige a /mi-expediente/:uuid?token= (mismo token que /subir-docs).
 */
import React, { useState } from 'react';
import axios from 'axios';
import { DynamicNetworkBackground } from '../../../components/DynamicNetworkBackground';

const API = import.meta.env.PROD ? '/api/public/portal' : 'http://localhost:3000/api/public/portal';

export function PortalLoginView() {
    const [numeroExpediente, setNumeroExpediente] = useState('');
    const [dni, setDni] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        if (loading) return;
        setError(null);
        setLoading(true);
        try {
            const { data } = await axios.post(`${API}/login`, {
                numeroExpediente: numeroExpediente.trim(),
                dni: dni.trim(),
            });
            if (data?.token && data?.uuid) {
                window.location.href = `/mi-expediente/${data.uuid}?token=${data.token}`;
            } else {
                setError('No se pudo acceder. Revisa los datos.');
                setLoading(false);
            }
        } catch (err) {
            setError(err.response?.data?.error || 'No se pudo acceder. Inténtalo de nuevo.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 text-white relative overflow-x-hidden px-4 py-10 flex items-center justify-center">
            <DynamicNetworkBackground />
            <div className="relative z-10 w-full max-w-sm">
                <header className="text-center mb-8">
                    <div className="text-3xl font-black tracking-tight">
                        <span className="text-white">BROKER</span><span className="text-amber-400">GY</span>
                    </div>
                    <p className="text-amber-300/80 text-[11px] font-black uppercase tracking-widest mt-3">Mi expediente</p>
                </header>

                <form onSubmit={submit} className="bg-bkg-surface border border-white/10 rounded-2xl p-6 space-y-4">
                    <p className="text-white/55 text-sm leading-relaxed">
                        Consulta el estado de tu expediente con tu <strong className="text-white/80">nº de expediente</strong> y tu <strong className="text-white/80">DNI</strong>.
                    </p>

                    <div>
                        <label className="block text-white/50 text-xs font-bold uppercase tracking-wide mb-1.5">Nº de expediente</label>
                        <input
                            type="text"
                            value={numeroExpediente}
                            onChange={e => setNumeroExpediente(e.target.value)}
                            placeholder="26RES060_118"
                            autoCapitalize="characters"
                            className="w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                        />
                    </div>

                    <div>
                        <label className="block text-white/50 text-xs font-bold uppercase tracking-wide mb-1.5">DNI</label>
                        <input
                            type="text"
                            value={dni}
                            onChange={e => setDni(e.target.value)}
                            placeholder="00000000X"
                            autoCapitalize="characters"
                            className="w-full bg-bkg-elevated border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/25 focus:border-brand focus:ring-1 focus:ring-brand outline-none"
                        />
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-gradient-to-r from-brand to-brand-700 text-white font-bold py-3 rounded-xl hover:brightness-110 transition disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        ) : 'Entrar'}
                    </button>
                </form>

                <footer className="mt-8 text-center">
                    <p className="text-white/20 text-[10px] uppercase tracking-[0.2em] font-bold">Brokergy · Ingeniería Energética</p>
                </footer>
            </div>
        </div>
    );
}

export default PortalLoginView;
