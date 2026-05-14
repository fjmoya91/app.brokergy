import React, { useState } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step9_Contacto({ funnel, updateFunnel, contacto, setContacto, onSubmit, submitting, submitError }) {
    const [touched, setTouched] = useState({});

    const setField = (key, value) => {
        setContacto(prev => ({ ...prev, [key]: value }));
    };

    const emailValid = !contacto.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email);
    const tlfValid = !contacto.tlf || /^[+]?\d{9,15}$/.test(contacto.tlf.replace(/\s/g, ''));
    const tieneContacto = !!(contacto.email || contacto.tlf);

    const canSubmit = !!(
        contacto.nombre?.trim() &&
        tieneContacto &&
        emailValid &&
        tlfValid &&
        contacto.rgpd_aceptado &&
        contacto.titular_type &&
        contacto.timeline
    );

    const handleSubmit = () => {
        setTouched({ nombre: true, email: true, tlf: true, rgpd: true, titular: true, timeline: true });
        if (!canSubmit) return;
        onSubmit();
    };

    return (
        <StepLayout
            question="¿A dónde te enviamos tu cálculo?"
            subtitle="Solo lo usamos para mandarte el resultado y contactarte si tienes preguntas."
            onContinue={handleSubmit}
            canContinue={canSubmit && !submitting}
            continueLabel={submitting ? 'Enviando…' : 'Recibir mi cálculo'}
        >
            <div className="space-y-4">
                {/* Nombre */}
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1">
                        Nombre y apellidos *
                    </label>
                    <input
                        type="text"
                        placeholder="Ej. María García López"
                        value={contacto.nombre || ''}
                        onChange={e => setField('nombre', e.target.value)}
                        onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
                        className={`w-full bg-white/[0.06] border-2 rounded-2xl px-5 py-4 text-white text-base outline-none transition-all ${
                            touched.nombre && !contacto.nombre ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
                        }`}
                    />
                </div>

                {/* Email */}
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1">
                        Email
                    </label>
                    <input
                        type="email"
                        autoComplete="email"
                        placeholder="tu@email.com"
                        value={contacto.email || ''}
                        onChange={e => setField('email', e.target.value)}
                        onBlur={() => setTouched(t => ({ ...t, email: true }))}
                        className={`w-full bg-white/[0.06] border-2 rounded-2xl px-5 py-4 text-white text-base outline-none transition-all ${
                            touched.email && !emailValid ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
                        }`}
                    />
                </div>

                {/* Teléfono */}
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1">
                        Teléfono (mejor para que te llamemos)
                    </label>
                    <input
                        type="tel"
                        autoComplete="tel"
                        placeholder="+34 600 000 000"
                        value={contacto.tlf || ''}
                        onChange={e => setField('tlf', e.target.value)}
                        onBlur={() => setTouched(t => ({ ...t, tlf: true }))}
                        className={`w-full bg-white/[0.06] border-2 rounded-2xl px-5 py-4 text-white text-base outline-none transition-all ${
                            touched.tlf && !tlfValid ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
                        }`}
                    />
                    {!tieneContacto && (touched.email || touched.tlf) && (
                        <p className="text-red-400 text-xs mt-2 ml-1">Necesitamos al menos email o teléfono.</p>
                    )}
                </div>

                {/* Titular */}
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1">
                        Eres particular o empresa? *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                        <IconCard icon="🏠" title="Particular"
                            selected={contacto.titular_type === 'particular'}
                            onClick={() => setField('titular_type', 'particular')}
                        />
                        <IconCard icon="🏢" title="Empresa"
                            selected={contacto.titular_type === 'empresa'}
                            onClick={() => setField('titular_type', 'empresa')}
                        />
                    </div>
                </div>

                {/* Timeline */}
                <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1">
                        ¿Cuándo te gustaría hacerlo? *
                    </label>
                    <div className="space-y-2">
                        <IconCard icon="🚀" title="Lo antes posible (urgente)"
                            selected={contacto.timeline === 'urgente'}
                            onClick={() => setField('timeline', 'urgente')}
                        />
                        <IconCard icon="📅" title="En 1-3 meses"
                            selected={contacto.timeline === '1-3_meses'}
                            onClick={() => setField('timeline', '1-3_meses')}
                        />
                        <IconCard icon="🗓️" title="En 6 meses o más"
                            selected={contacto.timeline === '6_meses'}
                            onClick={() => setField('timeline', '6_meses')}
                        />
                        <IconCard icon="🔍" title="Solo estoy explorando"
                            selected={contacto.timeline === 'explorando'}
                            onClick={() => setField('timeline', 'explorando')}
                        />
                    </div>
                </div>

                {/* RGPD */}
                <label className="flex items-start gap-3 cursor-pointer p-4 bg-white/[0.03] border border-white/10 rounded-2xl hover:bg-white/[0.05] transition-all">
                    <input
                        type="checkbox"
                        checked={!!contacto.rgpd_aceptado}
                        onChange={e => setField('rgpd_aceptado', e.target.checked)}
                        className="mt-0.5 w-5 h-5 rounded border-white/20 bg-white/10 text-amber-400 focus:ring-amber-400 focus:ring-offset-0"
                    />
                    <span className="text-white/70 text-sm leading-relaxed">
                        Acepto que BROKERGY trate mis datos para enviarme la simulación y contactarme con información sobre las ayudas. Puedo solicitar la eliminación de mis datos en cualquier momento. *
                    </span>
                </label>

                {submitError && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
                        <p className="text-red-400 text-sm font-bold">{submitError}</p>
                    </div>
                )}
            </div>
        </StepLayout>
    );
}
