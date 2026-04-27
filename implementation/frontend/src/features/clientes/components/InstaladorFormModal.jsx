import React, { useState } from 'react';
import axios from 'axios';

export default function InstaladorFormModal({ isOpen, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [form, setForm] = useState({
        es_autonomo: false,
        razon_social: '',
        cif: '',
        email: '',
        tlf: '',
        usuario_nombre: '',
        usuario_apellidos: '',
    });

    if (!isOpen) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        setLoading(true);

        try {
            const payload = {
                tipo_empresa: 'INSTALADOR',
                nuevo_usuario: true,
                es_autonomo: form.es_autonomo,
                razon_social: form.razon_social.trim(),
                cif: form.cif.trim(),
                email: form.email.trim(),
                tlf: form.tlf.trim(),
                usuario_nombre: form.usuario_nombre.trim() || (form.es_autonomo ? form.razon_social.trim() : 'Instalador'),
                usuario_apellidos: form.usuario_apellidos.trim(),
                usuario_nif: form.cif.trim(),
                usuario_email: form.email.trim(),
                usuario_tlf: form.tlf.trim(),
                usuario_password: form.cif.trim(), // Por defecto el CIF
            };

            const res = await axios.post('/api/prescriptores/avanzado', payload);
            if (onSuccess) onSuccess(res.data.prescriptor);
        } catch (err) {
            const msg = err.response?.data?.error || err.message || 'Error al crear instalador';
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-bkg-page w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-5 border-b border-white/[0.05] flex items-center justify-between bg-white/[0.02] shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center border border-brand/20">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-white tracking-tight">Crear Nuevo Instalador</h2>
                            <p className="text-xs text-white/40 font-medium">Da de alta un instalador asociado</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="overflow-y-auto flex-1 p-5 custom-scrollbar">
                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <p className="text-sm text-red-300 leading-relaxed font-medium">{error}</p>
                        </div>
                    )}

                    <form id="instalador-form" onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="sm:col-span-2">
                                <label className="flex items-center gap-3 cursor-pointer group w-fit">
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            className="peer sr-only"
                                            checked={form.es_autonomo}
                                            onChange={e => setForm({ ...form, es_autonomo: e.target.checked })}
                                        />
                                        <div className="w-8 h-4 bg-white/10 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand"></div>
                                    </div>
                                    <span className="text-xs font-bold uppercase tracking-wider text-white/50 group-hover:text-white transition-colors">
                                        Es Trabajador Autónomo
                                    </span>
                                </label>
                            </div>

                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">
                                    {form.es_autonomo ? 'Nombre Completo' : 'Razón Social'}
                                </label>
                                <input
                                    required
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all uppercase"
                                    placeholder={form.es_autonomo ? 'EJ: JUAN PÉREZ' : 'EJ: INSTALACIONES S.L.'}
                                    value={form.razon_social}
                                    onChange={e => setForm({ ...form, razon_social: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">CIF / NIF</label>
                                <input
                                    required
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all uppercase"
                                    placeholder="B12345678"
                                    value={form.cif}
                                    onChange={e => setForm({ ...form, cif: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Teléfono</label>
                                <input
                                    required
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all"
                                    placeholder="600 000 000"
                                    value={form.tlf}
                                    onChange={e => setForm({ ...form, tlf: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1.5 sm:col-span-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 ml-1">Email</label>
                                <input
                                    required
                                    type="email"
                                    className="w-full bg-black/20 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-brand/50 focus:border-brand/50 transition-all"
                                    placeholder="email@ejemplo.com"
                                    value={form.email}
                                    onChange={e => setForm({ ...form, email: e.target.value.toLowerCase() })}
                                />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-5 border-t border-white/[0.05] bg-white/[0.02] flex justify-end gap-3 shrink-0">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        form="instalador-form"
                        disabled={loading}
                        className="px-6 py-2.5 rounded-xl text-sm font-bold bg-brand text-white hover:bg-brand-hover active:bg-brand-active disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        {loading ? (
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                        ) : null}
                        {loading ? 'Creando...' : 'Crear Instalador'}
                    </button>
                </div>
            </div>
        </div>
    );
}
