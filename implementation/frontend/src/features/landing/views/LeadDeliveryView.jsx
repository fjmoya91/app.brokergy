/**
 * LeadDeliveryView — pantalla de cierre del funnel público.
 *
 * Muestra PRIMERO el resultado estimado y DESPUÉS las opciones de entrega.
 *
 * Comportamiento de selección:
 *   - WhatsApp y Email son independientes (multi-select, checkboxes)
 *   - Técnico es exclusivo (radio): seleccionarlo limpia WA/Email y viceversa
 *
 * Antes de llamar a onSubmit(), llama a onCaptureSummary(r) con el objeto
 * de resultado local para que el padre pueda incluirlo en el payload del
 * backend (evita depender de paths de precomputedResult que no existen).
 *
 * delivery_preference se transmite como array: ['whatsapp'], ['email'],
 * ['whatsapp','email'] o ['tecnico'].
 */

import React, { useState, useMemo } from 'react';
import { funnelToCalculatorInputs } from '../data/funnelToInputs';
import { computeLandingResult } from '../data/landingCalculation';

/* ── Formateo ────────────────────────────────────────────────── */
const fmtEur = (n) =>
    `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(n || 0))} €`;

/* ── Iconos ──────────────────────────────────────────────────── */
const IconWA = ({ className = 'w-6 h-6' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
);
const IconMail = ({ className = 'w-6 h-6' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
    </svg>
);
const IconUser = ({ className = 'w-6 h-6' }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
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
    { value: 'explorando',emoji: '🔍', label: 'Explorando' },
];

/* ── Componente principal ────────────────────────────────────── */
export function LeadDeliveryView({
    funnel,
    catastro,
    contacto,
    setContacto,
    deliveryPreference,      // array: ['whatsapp'], ['email'], ['whatsapp','email'], ['tecnico']
    setDeliveryPreference,
    onCaptureSummary,        // (r) => void  — captura valores del resultado antes del submit
    onSubmit,
    onBack,
    submitting,
    submitError,
}) {
    const [touched, setTouched] = useState({});
    const setField = (key, value) => setContacto(prev => ({ ...prev, [key]: value }));

    /* Cálculo local del resultado (sin API, para mostrar y para capturar valores) */
    const r = useMemo(() => {
        try {
            const inputs = funnelToCalculatorInputs(
                { ...funnel, titular_type: 'particular', num_propietarios: 1 },
                catastro,
                { mode: 'public' }
            );
            return computeLandingResult(inputs);
        } catch { return null; }
    }, [funnel, catastro]);

    /* ── Lógica de selección ── */
    const pref = deliveryPreference || [];
    const hasWA      = pref.includes('whatsapp');
    const hasEmail   = pref.includes('email');
    const hasTecnico = pref.includes('tecnico');

    const toggleWA = () => {
        if (hasTecnico) {
            setDeliveryPreference(['whatsapp']);
        } else {
            setDeliveryPreference(hasWA
                ? pref.filter(p => p !== 'whatsapp')
                : [...pref.filter(p => p !== 'tecnico'), 'whatsapp']);
        }
    };
    const toggleEmail = () => {
        if (hasTecnico) {
            setDeliveryPreference(['email']);
        } else {
            setDeliveryPreference(hasEmail
                ? pref.filter(p => p !== 'email')
                : [...pref.filter(p => p !== 'tecnico'), 'email']);
        }
    };
    const selectTecnico = () => {
        setDeliveryPreference(hasTecnico ? [] : ['tecnico']);
    };

    /* ── Validación ── */
    const emailValid = !contacto.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contacto.email);
    const tlfValid   = !contacto.tlf   || /^[+]?\d{9,15}$/.test((contacto.tlf || '').replace(/\s/g, ''));
    const nombre     = (contacto.nombre || '').trim();

    const canSubmit = useMemo(() => {
        if (!pref.length || !nombre || !contacto.rgpd_aceptado) return false;
        if (hasTecnico) {
            return !!(
                (contacto.email || contacto.tlf) &&
                emailValid && tlfValid &&
                contacto.titular_type &&
                contacto.timeline
            );
        }
        if (hasWA    && (!contacto.tlf   || !tlfValid))   return false;
        if (hasEmail && (!contacto.email || !emailValid)) return false;
        return true;
    }, [pref, nombre, contacto, emailValid, tlfValid, hasWA, hasEmail, hasTecnico]);

    /* ── CTA label y estilo ── */
    const ctaLabel  = hasTecnico ? 'Confirmar solicitud →'
        : (hasWA && hasEmail) ? 'Enviar por WhatsApp y email →'
        : hasWA  ? 'Enviar por WhatsApp →'
        : hasEmail ? 'Enviar por email →'
        : 'Confirmar →';

    const ctaCls = hasTecnico
        ? 'bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep shadow-amber-500/20'
        : (hasWA && hasEmail)
            ? 'bg-gradient-to-r from-[#25D366] to-blue-500 hover:from-[#1eb554] hover:to-blue-400 text-white'
            : hasWA
                ? 'bg-[#25D366] hover:bg-[#1eb554] text-white'
                : 'bg-blue-500 hover:bg-blue-400 text-white';

    /* ── Submit ── */
    const handleSubmit = () => {
        setTouched({ nombre: true, email: true, tlf: true, rgpd: true, titular: true, timeline: true, propietarios: true });
        if (!canSubmit || submitting) return;

        // ① Capturar valores del resultado local ANTES del submit (síncrono vía ref)
        onCaptureSummary?.(r);

        // ② Defaults suaves para modos simplificados
        if (!hasTecnico) {
            setContacto(prev => ({
                ...prev,
                titular_type:     prev.titular_type     || 'particular',
                num_propietarios: prev.num_propietarios || 1,
                timeline:         prev.timeline          || 'explorando',
                consent_whatsapp: hasWA,
                consent_email:    hasEmail,
            }));
        }
        onSubmit();
    };

    /* ── Clases de campo ── */
    const inputCls = (invalid) =>
        `w-full bg-white/[0.04] border-2 rounded-xl px-4 py-3 text-white text-sm outline-none transition-all placeholder-white/25 ${
            invalid ? 'border-red-500/60' : 'border-white/10 focus:border-amber-400'
        }`;
    const fieldLabel = 'block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 ml-1';
    const smallCard = (sel) =>
        `flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border-2 font-bold text-xs transition-all cursor-pointer ${
            sel
                ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-amber-400/40 hover:text-white'
        }`;

    /* ── Formulario visible cuando alguna opción está seleccionada ── */
    const showForm = pref.length > 0;

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">

            {/* Botón atrás */}
            <button type="button" onClick={onBack}
                className="flex items-center gap-2 text-white/40 hover:text-amber-400 transition-colors text-xs uppercase tracking-widest font-bold py-2 mb-5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                </svg>
                Volver
            </button>

            {/* ── Resultado estimado ── */}
            {r && (
                <div className="mb-7">
                    <p className="text-center text-[11px] font-black uppercase tracking-[0.18em] text-amber-400/80 mb-4">
                        Tu estimación orientativa
                    </p>
                    <div className="grid grid-cols-3 gap-2 md:gap-3">
                        <MetricCard label="Ayuda total"     value={fmtEur(r.totalAyudaCliente)}   sub={`${r.porcentajeCubiertoCliente}% cubierto`} color="emerald" />
                        <MetricCard label="Inversión neta"  value={fmtEur(r.inversionNetaCliente)} sub="tras las ayudas"                           color="amber"   />
                        <MetricCard label="Ahorro anual"    value={r.ahorroAnualEur > 0 ? fmtEur(r.ahorroAnualEur) : '—'} sub="en calefacción"   color="blue"    />
                    </div>
                    <p className="text-center text-[10px] text-white/25 mt-3">
                        Estimación teórica. Se ajusta tras el CEE inicial.{' '}
                        <span className="text-amber-400/50 font-bold">El bono CAE lo garantiza Brokergy.</span>
                    </p>
                </div>
            )}

            {/* ── Título CTA ── */}
            <p className="text-center font-black text-white text-lg md:text-xl tracking-tight mb-5">
                ¿Cómo quieres recibir tu propuesta?
            </p>

            {/* ── Las 3 opciones ── */}
            <div className="space-y-3 mb-5">

                {/* WhatsApp — checkbox */}
                <OptionCard
                    icon={<IconWA className="w-6 h-6" />}
                    iconColor="text-[#25D366]"
                    title="Envíame por WhatsApp"
                    desc="La recibirás al instante en tu teléfono con todos los importes."
                    selected={hasWA}
                    ring={hasWA ? 'border-[#25D366] bg-[#25D366]/[0.1]' : 'border-white/10 bg-white/[0.03] hover:border-[#25D366]/30'}
                    checkColor="text-[#25D366]"
                    multiSelect
                    onClick={toggleWA}
                />

                {/* Email — checkbox */}
                <OptionCard
                    icon={<IconMail className="w-6 h-6" />}
                    iconColor="text-blue-400"
                    title="Envíame por email"
                    desc="Te la mandamos en segundos con el desglose completo."
                    selected={hasEmail}
                    ring={hasEmail ? 'border-blue-400 bg-blue-400/[0.1]' : 'border-white/10 bg-white/[0.03] hover:border-blue-400/30'}
                    checkColor="text-blue-400"
                    multiSelect
                    onClick={toggleEmail}
                />

                {/* Técnico — radio exclusivo */}
                <OptionCard
                    icon={<IconUser className="w-6 h-6" />}
                    iconColor="text-amber-400"
                    title="Que un técnico de Brokergy revise mi propuesta"
                    desc="Un especialista la estudia y te contacta antes de las 18h del siguiente día laborable."
                    selected={hasTecnico}
                    ring={hasTecnico ? 'border-amber-400 bg-amber-400/10' : 'border-white/10 bg-white/[0.03] hover:border-amber-400/30'}
                    checkColor="text-amber-400"
                    multiSelect={false}
                    onClick={selectTecnico}
                />
            </div>

            {/* ── Formulario unificado (aparece cuando hay selección) ── */}
            {showForm && (
                <div className="p-5 bg-white/[0.03] border border-white/10 rounded-2xl animate-fade-in space-y-4 mb-5">

                    {/* Nombre — siempre */}
                    <div>
                        <label className={fieldLabel}>Nombre y apellidos *</label>
                        <input
                            type="text"
                            placeholder="Ej. María García López"
                            value={contacto.nombre || ''}
                            onChange={e => setField('nombre', e.target.value)}
                            onBlur={() => setTouched(t => ({ ...t, nombre: true }))}
                            className={inputCls(touched.nombre && !nombre)}
                            autoFocus
                        />
                    </div>

                    {/* Teléfono — si WA seleccionado */}
                    {(hasWA || hasTecnico) && (
                        <div>
                            <label className={fieldLabel}>
                                {hasWA ? 'Tu número de WhatsApp *' : 'Teléfono'}
                                {hasTecnico && !hasWA && <span className="text-white/30 normal-case font-normal ml-1">(o email)</span>}
                            </label>
                            {hasWA && (
                                <p className="text-[#25D366]/80 text-[10px] mb-2 ml-1 leading-relaxed flex items-center gap-1">
                                    <svg className="w-3 h-3 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.626.712.226 1.36.194 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884" /></svg>
                                    Te enviaremos la propuesta a este número
                                </p>
                            )}
                            <input
                                type="tel"
                                autoComplete="tel"
                                placeholder="+34 600 000 000"
                                value={contacto.tlf || ''}
                                onChange={e => setField('tlf', e.target.value)}
                                onBlur={() => setTouched(t => ({ ...t, tlf: true }))}
                                className={inputCls(
                                    hasWA
                                        ? (touched.tlf && (!contacto.tlf || !tlfValid))
                                        : (touched.tlf && !tlfValid)
                                )}
                            />
                            {hasWA && touched.tlf && !contacto.tlf && (
                                <p className="text-red-400 text-xs mt-1.5 ml-1">
                                    El teléfono es obligatorio si quieres recibir la propuesta por WhatsApp.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Email — si email o técnico seleccionado */}
                    {(hasEmail || hasTecnico) && (
                        <div>
                            <label className={fieldLabel}>
                                {hasEmail ? 'Tu email *' : 'Email'}
                                {hasTecnico && !hasEmail && <span className="text-white/30 normal-case font-normal ml-1">(o teléfono)</span>}
                            </label>
                            <input
                                type="email"
                                autoComplete="email"
                                placeholder="tu@email.com"
                                value={contacto.email || ''}
                                onChange={e => setField('email', e.target.value)}
                                onBlur={() => setTouched(t => ({ ...t, email: true }))}
                                className={inputCls(
                                    hasEmail
                                        ? (touched.email && (!contacto.email || !emailValid))
                                        : (touched.email && !emailValid)
                                )}
                            />
                        </div>
                    )}

                    {/* Error de contacto vacío en técnico */}
                    {hasTecnico && touched.email && touched.tlf && !contacto.email && !contacto.tlf && (
                        <p className="text-red-400 text-xs -mt-2">Necesitamos al menos email o teléfono.</p>
                    )}

                    {/* Campos extra solo en modo técnico */}
                    {hasTecnico && (
                        <>
                            <div>
                                <label className={fieldLabel}>¿Particular o empresa? *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button type="button" onClick={() => setField('titular_type', 'particular')}
                                        className={smallCard(contacto.titular_type === 'particular')}>
                                        <IconHome className="w-4 h-4" /> Particular
                                    </button>
                                    <button type="button" onClick={() => setField('titular_type', 'empresa')}
                                        className={smallCard(contacto.titular_type === 'empresa')}>
                                        <IconBuilding className="w-4 h-4" /> Empresa
                                    </button>
                                </div>
                            </div>

                            {contacto.titular_type === 'particular' && (
                                <div className="animate-fade-in">
                                    <label className={fieldLabel}>¿Cuántos propietarios? *</label>
                                    <p className="text-white/35 text-[10px] mb-2 ml-1">Cada propietario puede aplicar la deducción en su IRPF.</p>
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

                            <div>
                                <label className={fieldLabel}>¿Cuándo te gustaría hacerlo? *</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {TIMELINE_OPTIONS.map(t => (
                                        <button key={t.value} type="button"
                                            onClick={() => setField('timeline', t.value)}
                                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left ${
                                                contacto.timeline === t.value
                                                    ? 'border-amber-400 bg-amber-400/10 text-amber-300'
                                                    : 'border-white/10 bg-white/[0.03] text-white/70 hover:border-amber-400/40'
                                            }`}>
                                            <span className="text-xl">{t.emoji}</span>
                                            <span className="text-[11px] font-bold">{t.label}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}

                    {/* RGPD — siempre */}
                    <label className="flex items-start gap-3 cursor-pointer p-3 bg-white/[0.03] border border-white/10 rounded-xl hover:bg-white/[0.05] transition-all">
                        <input
                            type="checkbox"
                            checked={!!contacto.rgpd_aceptado}
                            onChange={e => setField('rgpd_aceptado', e.target.checked)}
                            className="mt-0.5 w-4 h-4 rounded border-white/20 bg-white/10 text-amber-400 focus:ring-amber-400 focus:ring-offset-0 cursor-pointer flex-shrink-0"
                        />
                        <span className="text-white/60 text-xs leading-relaxed">
                            Acepto que BROKERGY trate mis datos para enviarme la propuesta y contactarme si lo necesito. Puedo solicitar la eliminación en cualquier momento. *
                        </span>
                    </label>
                    {touched.rgpd && !contacto.rgpd_aceptado && (
                        <p className="text-red-400 text-xs -mt-2 ml-1">Debes aceptar el tratamiento de datos para continuar.</p>
                    )}

                    {/* Error de submit */}
                    {submitError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                            <p className="text-red-400 text-xs font-bold">{submitError}</p>
                        </div>
                    )}

                    {/* Botón submit */}
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={submitting || !pref.length}
                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg transition-all ${ctaCls} ${
                            (submitting || !pref.length) ? 'opacity-60 cursor-not-allowed' : ''
                        }`}
                    >
                        {submitting ? 'Enviando…' : ctaLabel}
                    </button>
                </div>
            )}

            <p className="text-center text-white/20 text-[10px] uppercase tracking-[0.15em] font-bold">
                Sin spam · Sin compromiso · Datos protegidos
            </p>
        </div>
    );
}

/* ── Sub-componentes ──────────────────────────────────────────── */

function OptionCard({ icon, iconColor, title, desc, selected, ring, checkColor, multiSelect, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full text-left p-4 rounded-2xl border-2 transition-all flex items-start gap-4 ${ring}`}
        >
            <span className={`mt-0.5 shrink-0 ${iconColor}`}>{icon}</span>
            <div className="flex-1 min-w-0">
                <p className={`font-black text-sm md:text-base ${selected ? 'text-white' : 'text-white/80'}`}>{title}</p>
                <p className="text-white/45 text-xs mt-0.5 leading-snug">{desc}</p>
            </div>
            {/* Checkbox o Radio visual */}
            <div className={`w-5 h-5 shrink-0 mt-0.5 flex items-center justify-center transition-all border-2 ${
                multiSelect ? 'rounded-md' : 'rounded-full'
            } ${selected ? `${checkColor} border-current bg-current` : 'border-white/20 bg-transparent'}`}>
                {selected && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                )}
            </div>
        </button>
    );
}

function MetricCard({ label, value, sub, color }) {
    const cols = {
        emerald: { bg: 'from-emerald-500/20 to-emerald-500/5', border: 'border-emerald-500/30', lbl: 'text-emerald-300/80', val: 'text-emerald-300', sub: 'text-emerald-400/60' },
        amber:   { bg: 'from-amber-500/20 to-amber-500/5',     border: 'border-amber-500/30',   lbl: 'text-amber-300/80',   val: 'text-amber-300',   sub: 'text-amber-400/60' },
        blue:    { bg: 'from-blue-500/20 to-blue-500/5',       border: 'border-blue-500/30',     lbl: 'text-blue-300/80',    val: 'text-blue-300',    sub: 'text-blue-400/60' },
    }[color];
    return (
        <div className={`p-3 md:p-4 bg-gradient-to-br ${cols.bg} border-2 ${cols.border} rounded-2xl text-center`}>
            <div className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest mb-1 ${cols.lbl}`}>{label}</div>
            <div className={`text-lg md:text-2xl font-black tracking-tight ${cols.val}`}>{value}</div>
            <div className={`text-[9px] md:text-[10px] mt-0.5 font-bold uppercase tracking-widest ${cols.sub}`}>{sub}</div>
        </div>
    );
}
