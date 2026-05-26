import React, { useState } from 'react';
import { StepLayout } from '../components/StepLayout';

// ── Iconos SVG ────────────────────────────────────────────────────────────────
const IconMail = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    </svg>
);

const IconWhatsapp = ({ className = 'w-5 h-5' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
    </svg>
);

const IconHome = ({ className = 'w-4 h-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
);

const IconBuilding = ({ className = 'w-4 h-4' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01" />
    </svg>
);

const TIMELINE_OPTIONS = [
    { value: 'urgente',    emoji: '🚀', label: 'Urgente' },
    { value: '1-3_meses', emoji: '📅', label: '1-3 meses' },
    { value: '6_meses',   emoji: '🗓️', label: '6+ meses' },
    { value: 'explorando',emoji: '🔍', label: 'Explorando' }
];

// ── Config por canal elegido en StepPreview ───────────────────────────────────
const CTA_CONFIG = {
    whatsapp: {
        question: '¿A qué número te enviamos la propuesta?',
        subtitle: 'La recibirás al instante por WhatsApp.',
        phoneRequired: true,
        emailRequired: false,
        submitLabel: 'Enviar por WhatsApp',
        submitClass: 'bg-[#25D366] hover:bg-[#20b858] text-white',
        submitIcon: <IconWhatsapp className="w-4 h-4" />,
    },
    email: {
        question: '¿A qué email te enviamos la propuesta?',
        subtitle: 'Te llegará con todos los detalles del cálculo.',
        phoneRequired: false,
        emailRequired: true,
        submitLabel: 'Enviar por email',
        submitClass: 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep',
        submitIcon: <IconMail className="w-4 h-4" />,
    },
    tecnico: {
        question: '¿A qué número te llamamos?',
        subtitle: 'Un técnico de BROKERGY revisará tu caso y te contactará antes de las 18h (días laborables).',
        phoneRequired: true,
        emailRequired: false,
        submitLabel: 'Solicitar revisión técnica',
        submitClass: 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white',
        submitIcon: null,
    },
    // Fallback si llega sin cta_choice (ej. modo interno o datos legacy)
    default: {
        question: '¿A dónde te enviamos tu cálculo?',
        subtitle: 'Solo lo usamos para mandarte el resultado y contactarte si tienes preguntas.',
        phoneRequired: false,
        emailRequired: false,
        submitLabel: 'Recibir mi cálculo',
        submitClass: 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep',
        submitIcon: null,
    },
};

// ── Componente principal ───────────────────────────────────────────────────────
export function Step9_Contacto({ funnel, updateFunnel, contacto, setContacto, onSubmit, submitting, submitError, mode = 'public', submitLabel }) {
    const [touched, setTouched] = useState({});
    const isInternal = mode === 'internal';

    const setField = (key, value) => setContacto(prev => ({ ...prev, [key]: value }));

    const emailValid = !contacto.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email);
    const tlfValid   = !contacto.tlf   || /^[+]?\d{9,15}$/.test(contacto.tlf.replace(/\s/g, ''));

    // Config según canal elegido en StepPreview
    const cfg = isInternal ? null : (CTA_CONFIG[contacto?.cta_choice] || CTA_CONFIG.default);

    // ── Validación ──
    const tieneEmail = !!contacto.email && emailValid;
    const tienePhone = !!contacto.tlf && tlfValid;

    // Para el modo público con CTA elegido, requerimos el campo específico
    const contactoOk = isInternal
        ? !!contacto.tlf
        : cfg?.phoneRequired
            ? tienePhone
            : cfg?.emailRequired
                ? tieneEmail
                : !!(contacto.email || contacto.tlf);

    const isParticular = contacto.titular_type === 'particular';
    const propietariosOk = isInternal || !isParticular || !!contacto.num_propietarios;

    // Modo internal: solo la REFERENCIA del cliente es obligatoria.
    //   - Nombre/tlf/email son opcionales (si se rellenan, se usan para la ficha del cliente).
    //   - Si no hay nombre explícito → usaremos la referencia como nombre antes del submit.
    // Modo public: validación completa (nombre + RGPD + canal contacto + timeline + titular).
    const canSubmit = isInternal
        ? !!(contacto.referenciaCliente?.trim() && tlfValid && emailValid)
        : !!(
            contacto.nombre?.trim() &&
            contactoOk &&
            emailValid &&
            tlfValid &&
            contacto.rgpd_aceptado &&
            contacto.titular_type &&
            contacto.timeline &&
            propietariosOk
        );

    const handleSubmit = () => {
        setTouched({ nombre: true, email: true, tlf: true, ref: true, rgpd: true, titular: true, timeline: true, propietarios: true });
        if (!canSubmit) return;
        // En internal, si nombre vacío usamos la referencia como nombre (el backend
        // requiere algo en nombre para crear la ficha cliente).
        if (isInternal && !contacto.nombre?.trim() && contacto.referenciaCliente?.trim()) {
            setContacto(prev => ({ ...prev, nombre: prev.referenciaCliente.trim() }));
            // Esperamos un tick para que el setContacto se aplique antes del submit
            setTimeout(() => onSubmit(), 0);
            return;
        }
        onSubmit();
    };

    // Helpers de clases
    const fieldLabel = 'block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1';
    const inputCls = (invalid) => `w-full bg-white/[0.04] border-2 rounded-xl px-4 py-3 text-white text-sm outline-none transition-all ${
        invalid ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
    }`;
    const smallCard = (selected) => `flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer ${
        selected
            ? 'border-amber-400 bg-amber-400/10 text-amber-300'
            : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-amber-400/40 hover:text-white'
    }`;

    // ── MODO INTERNAL ─────────────────────────────────────────────────────────
    if (isInternal) {
        return (
            <StepLayout
                question="¿Cómo identificas esta oportunidad?"
                subtitle="Solo necesitamos una referencia para localizarla en tu panel. Los datos del cliente son opcionales — si los tienes a mano, los guardamos en su ficha."
                onContinue={handleSubmit}
                canContinue={canSubmit && !submitting}
                continueLabel={submitting ? 'Creando…' : (submitLabel || 'Calcular')}
            >
                <div className="space-y-3 max-w-md mx-auto">
                    {/* Campo PRINCIPAL: referencia del cliente */}
                    <div>
                        <label className={fieldLabel}>Referencia del cliente *</label>
                        <input type="text" placeholder="Ej. PACO (ESTHER TRUJILLO) o ALEJANDRA TARI"
                            value={contacto.referenciaCliente || ''}
                            onChange={e => setField('referenciaCliente', e.target.value)}
                            onBlur={() => setTouched(t => ({ ...t, ref: true }))}
                            className={inputCls(touched.ref && !contacto.referenciaCliente?.trim())}
                            autoFocus />
                        <p className="text-white/35 text-[10px] mt-1.5 ml-1 leading-snug">
                            Lo que verás en tu panel para identificar esta oportunidad.
                        </p>
                    </div>

                    {/* Separador visual */}
                    <div className="pt-3 pb-1 flex items-center gap-3">
                        <div className="flex-1 h-px bg-white/10"></div>
                        <span className="text-[9px] font-black text-white/30 uppercase tracking-widest">Datos del cliente (opcionales)</span>
                        <div className="flex-1 h-px bg-white/10"></div>
                    </div>

                    <div>
                        <label className={fieldLabel}>Nombre y apellidos (opcional)</label>
                        <input type="text" placeholder="Ej. María García López"
                            value={contacto.nombre || ''}
                            onChange={e => setField('nombre', e.target.value)}
                            className={inputCls(false)} />
                    </div>
                    <div>
                        <label className={fieldLabel}>Teléfono (opcional)</label>
                        <input type="tel" autoComplete="tel" placeholder="+34 600 000 000"
                            value={contacto.tlf || ''}
                            onChange={e => setField('tlf', e.target.value)}
                            onBlur={() => setTouched(t => ({ ...t, tlf: true }))}
                            className={inputCls(touched.tlf && !tlfValid)} />
                    </div>
                    <div>
                        <label className={fieldLabel}>Email (opcional)</label>
                        <input type="email" autoComplete="email" placeholder="cliente@email.com"
                            value={contacto.email || ''}
                            onChange={e => setField('email', e.target.value)}
                            onBlur={() => setTouched(t => ({ ...t, email: true }))}
                            className={inputCls(touched.email && !emailValid)} />
                    </div>
                </div>
                {submitError && (
                    <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl max-w-md mx-auto">
                        <p className="text-red-400 text-xs font-bold text-center">{submitError}</p>
                    </div>
                )}
            </StepLayout>
        );
    }

    // ── MODO PUBLIC ───────────────────────────────────────────────────────────
    const submitBtnLabel = submitting
        ? 'Enviando…'
        : (submitLabel || cfg?.submitLabel || 'Recibir mi cálculo');

    const showPhone = cfg?.phoneRequired || (!cfg?.emailRequired);
    const showEmail = cfg?.emailRequired || (!cfg?.phoneRequired);

    return (
        <StepLayout
            question={cfg?.question || '¿A dónde te enviamos tu cálculo?'}
            subtitle={cfg?.subtitle || 'Solo lo usamos para mandarte el resultado.'}
            onContinue={handleSubmit}
            canContinue={canSubmit && !submitting}
            continueLabel={submitBtnLabel}
            continueCls={submitting ? undefined : cfg?.submitClass}
            continueIcon={cfg?.submitIcon}
        >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">

                {/* ── Columna A: Datos personales ── */}
                <div className="space-y-3">
                    <div>
                        <label className={fieldLabel}>Nombre y apellidos *</label>
                        <input type="text" placeholder="Ej. María García López"
                            value={contacto.nombre || ''}
                            onChange={e => setField('nombre', e.target.value)}
                            onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
                            className={inputCls(touched.nombre && !contacto.nombre)} />
                    </div>

                    {/* Email — siempre visible; obligatorio solo si cfg lo requiere */}
                    {showEmail && (
                        <div>
                            <label className={fieldLabel}>
                                Email {cfg?.emailRequired ? '*' : '(opcional)'}
                            </label>
                            <input type="email" autoComplete="email" placeholder="tu@email.com"
                                value={contacto.email || ''}
                                onChange={e => setField('email', e.target.value)}
                                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                                className={inputCls(
                                    touched.email && (
                                        (cfg?.emailRequired && !contacto.email) || !emailValid
                                    )
                                )} />
                        </div>
                    )}

                    {/* Teléfono — obligatorio si cfg lo requiere */}
                    {showPhone && (
                        <div>
                            <label className={fieldLabel}>
                                Teléfono {cfg?.phoneRequired ? '*' : '(opcional)'}
                            </label>
                            <input type="tel" autoComplete="tel" placeholder="+34 600 000 000"
                                value={contacto.tlf || ''}
                                onChange={e => setField('tlf', e.target.value)}
                                onBlur={() => setTouched(t => ({ ...t, tlf: true }))}
                                className={inputCls(
                                    touched.tlf && (
                                        (cfg?.phoneRequired && !contacto.tlf) || !tlfValid
                                    )
                                )} />
                            {!contactoOk && cfg?.phoneRequired && touched.tlf && (
                                <p className="text-red-400 text-xs mt-1.5 ml-1">
                                    Necesitamos un teléfono válido para enviarte la propuesta.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Particular / Empresa */}
                    <div>
                        <label className={fieldLabel}>¿Particular o empresa? *</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button type="button" onClick={() => setField('titular_type', 'particular')}
                                className={smallCard(contacto.titular_type === 'particular')}>
                                <IconHome /> Particular
                            </button>
                            <button type="button" onClick={() => setField('titular_type', 'empresa')}
                                className={smallCard(contacto.titular_type === 'empresa')}>
                                <IconBuilding /> Empresa
                            </button>
                        </div>
                    </div>

                    {/* Propietarios solo si particular */}
                    {contacto.titular_type === 'particular' && (
                        <div className="animate-fade-in">
                            <label className={fieldLabel}>¿Cuántos propietarios? *</label>
                            <p className="text-white/40 text-[10px] mb-2 ml-1 leading-relaxed">
                                Cada propietario deduce en su IRPF — más ayuda total.
                            </p>
                            <div className="grid grid-cols-4 gap-2">
                                {[1, 2, 3, 4].map(n => (
                                    <button key={n} type="button"
                                        onClick={() => setField('num_propietarios', n)}
                                        className={`py-2.5 rounded-xl border-2 font-black text-base transition-all ${
                                            contacto.num_propietarios === n
                                                ? 'border-amber-400 bg-amber-400/15 text-amber-300'
                                                : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-amber-400/40'
                                        }`}>
                                        {n === 4 ? '4+' : n}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Columna B: Cuándo ── */}
                <div className="space-y-3">
                    <div>
                        <label className={fieldLabel}>¿Cuándo te gustaría hacerlo? *</label>
                        <div className="grid grid-cols-2 gap-2">
                            {TIMELINE_OPTIONS.map(t => (
                                <button key={t.value} type="button"
                                    onClick={() => setField('timeline', t.value)}
                                    className={`flex flex-col items-center justify-center gap-1 py-3 rounded-xl border-2 transition-all ${
                                        contacto.timeline === t.value
                                            ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                                            : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-amber-400/40'
                                    }`}>
                                    <span className="text-2xl">{t.emoji}</span>
                                    <span className="text-[11px] font-bold leading-none">{t.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Confirmación del canal elegido (solo informativo, ya decidido en StepPreview) */}
                    {contacto.cta_choice && contacto.cta_choice !== 'default' && (
                        <div className="animate-fade-in p-3 bg-white/[0.03] border border-white/10 rounded-xl">
                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-1">
                                Envío elegido
                            </p>
                            <p className="text-white/70 text-xs">
                                {contacto.cta_choice === 'whatsapp' && '📱 Propuesta por WhatsApp al número que indiques'}
                                {contacto.cta_choice === 'email'    && '✉️ Propuesta por email a la dirección que indiques'}
                                {contacto.cta_choice === 'tecnico'  && '📞 Un técnico de BROKERGY te llamará antes de las 18h'}
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* RGPD */}
            <label className="mt-4 flex items-start gap-3 cursor-pointer p-3 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-all">
                <input type="checkbox"
                    checked={!!contacto.rgpd_aceptado}
                    onChange={e => setField('rgpd_aceptado', e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-amber-400 focus:ring-amber-400 focus:ring-offset-0 cursor-pointer flex-shrink-0" />
                <span className="text-white/70 text-xs leading-relaxed">
                    Acepto que BROKERGY trate mis datos para enviarme la simulación y contactarme.
                    Puedo solicitar la eliminación en cualquier momento. *
                </span>
            </label>

            {submitError && (
                <div className="mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-xs font-bold">{submitError}</p>
                </div>
            )}
        </StepLayout>
    );
}
