/**
 * Pantalla final — Resultado para el cliente.
 *
 * Mantiene el estilo dark de la app, pero replica la estructura del PDF
 * comercial: cifra grande de bono CAE arriba + tabla "Análisis de
 * subvenciones y deducciones" + tabla "Análisis de ahorro y rentabilidad".
 */

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';
import { computeLandingResult } from '../data/landingCalculation';

function fireMoneyAnimation() {
    if (typeof window === 'undefined') return;
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    const moneyEmojis = ['💵', '💰', '💸', '🤑', '🪙', '💶'];
    const shapes = moneyEmojis.map((emoji) =>
        confetti.shapeFromText({ text: emoji, scalar: 3 })
    );

    const burst = (originX, delay = 0) => {
        setTimeout(() => {
            confetti({
                particleCount: 40,
                spread: 80,
                startVelocity: 40,
                origin: { x: originX, y: 0.65 },
                shapes,
                scalar: 3,
                flat: true,
                zIndex: 9999,
                disableForReducedMotion: true,
                colors: ['#f59e0b', '#fbbf24', '#fde68a', '#22c55e', '#4ade80'],
            });
        }, delay);
    };

    burst(0.15, 0);
    burst(0.85, 200);
    burst(0.5, 450);
    burst(0.3, 700);
    burst(0.7, 900);
}

const fmtEur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(n || 0))} €`;
const fmtEurSigned = (n, sign) => `${sign === '-' ? '−' : '+'} ${fmtEur(n)}`;

const DELIVERY_BANNERS = {
    whatsapp: (contacto) => ({
        icon: '📱',
        color: 'border-[#25D366]/40 bg-[#25D366]/[0.07]',
        text: `Propuesta enviada por WhatsApp${contacto?.tlf ? ` al ${contacto.tlf}` : ''}. Revisa tus mensajes.`,
    }),
    email: (contacto) => ({
        icon: '✉️',
        color: 'border-blue-400/40 bg-blue-400/[0.07]',
        text: `Propuesta enviada por email${contacto?.email ? ` a ${contacto.email}` : ''}. Revisa tu bandeja de entrada.`,
    }),
    tecnico: () => ({
        icon: '👨‍💼',
        color: 'border-amber-400/40 bg-amber-400/[0.07]',
        text: 'Un técnico de Brokergy revisará tu propuesta y te contactará antes de las 18h del siguiente día laborable.',
    }),
};

export function LandingResultView({ leadResult, funnel, contacto, partnerBranding, calculatorInputs, deliveryPreference }) {
    const [instaladores, setInstaladores] = useState([]);
    const [loadingInst, setLoadingInst] = useState(false);

    // Confeti naranja al montar — solo una vez. Pequeño retardo para que el
    // usuario tenga tiempo de ver la pantalla antes del efecto.
    useEffect(() => {
        const t = setTimeout(() => fireMoneyAnimation(), 250);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (funnel?.presupuesto_modo !== 'pide_instalador') return;
        if (!leadResult?.provincia && !contacto?.provincia) return;
        const provincia = leadResult?.provincia || contacto?.provincia;
        if (!provincia) return;

        setLoadingInst(true);
        const params = { provincia };
        if (partnerBranding?.slug) params.distribuidor_slug = partnerBranding.slug;
        axios.get('/api/landing/instaladores', { params })
            .then(res => setInstaladores(res.data.instaladores || []))
            .catch(err => console.error('[Landing] No se pudieron cargar instaladores:', err))
            .finally(() => setLoadingInst(false));
    }, [funnel?.presupuesto_modo, leadResult, contacto, partnerBranding]);

    const r = useMemo(() => {
        if (!calculatorInputs) return null;
        try { return computeLandingResult(calculatorInputs); }
        catch (err) { console.error('[Landing] Error calc:', err); return null; }
    }, [calculatorInputs]);

    if (!r) {
        return (
            <div className="text-center py-20 text-white/40">Calculando tu propuesta…</div>
        );
    }

    // deliveryPreference llega como array ['whatsapp'], ['email'], ['whatsapp','email'] o ['tecnico']
    const deliveryArr = Array.isArray(deliveryPreference)
        ? deliveryPreference
        : (deliveryPreference ? [deliveryPreference] : []);
    // Construir los banners activos: WA + Email individualmente; Técnico si no hay ningún otro
    const activeBanners = deliveryArr
        .filter(p => p !== 'tecnico' && DELIVERY_BANNERS[p])
        .map(p => DELIVERY_BANNERS[p](contacto));
    if (activeBanners.length === 0 && deliveryArr.includes('tecnico')) {
        activeBanners.push(DELIVERY_BANNERS.tecnico(contacto));
    }

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            {/* Banners de entrega — confirmación visual (puede haber más de uno) */}
            {activeBanners.map((banner, i) => (
                <div key={i} className={`mb-3 p-4 rounded-2xl border-2 flex items-start gap-3 ${banner.color}`}>
                    <span className="text-2xl shrink-0">{banner.icon}</span>
                    <p className="text-white/80 text-sm leading-snug">{banner.text}</p>
                </div>
            ))}
            {activeBanners.length > 0 && <div className="mb-2" />}

            {/* Header celebratorio — más visible y "vistoso" */}
            <div className="text-center mb-6 relative">
                {/* Resplandor decorativo */}
                <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-emerald-500/15 via-amber-500/8 to-transparent rounded-full blur-3xl -z-10 pointer-events-none" />

                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 mb-3 animate-fade-in">
                    <span className="text-sm">🎉</span>
                    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">¡Buenas noticias!</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-[1.05] mb-3">
                    Enhorabuena{contacto?.nombre?.split(' ')[0] ? <>, <span className="text-amber-400">{contacto.nombre.split(' ')[0]}</span></> : ''}.
                    <br/>
                    <span className="text-white/90">Tu vivienda</span> <span className="text-emerald-400">cumple</span><span className="text-white/90"> con las ayudas.</span>
                </h1>
                <p className="text-white/55 text-sm md:text-base max-w-md mx-auto leading-relaxed">
                    Aquí tienes el detalle de tu estimación. Un técnico afinará los números con tu caso real.
                </p>
            </div>

            {/* HERO: Inversión neta final + Ayuda total */}
            <div className="grid grid-cols-2 gap-2 md:gap-3 mb-4">
                <div className="p-3 md:p-5 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-2 border-emerald-500/30 rounded-2xl md:rounded-3xl text-center">
                    <div className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-emerald-300/80 mb-1">Ayuda total estimada</div>
                    <div className="text-2xl md:text-4xl font-black text-emerald-300 tracking-tight">{fmtEur(r.totalAyudaCliente)}</div>
                    <div className="text-[9px] md:text-[10px] text-emerald-400/60 mt-1 font-bold uppercase tracking-widest">{r.porcentajeCubiertoCliente}% cubierto</div>
                </div>
                <div className="p-3 md:p-5 bg-gradient-to-br from-amber-500/20 to-amber-500/5 border-2 border-amber-500/30 rounded-2xl md:rounded-3xl text-center">
                    <div className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-amber-300/80 mb-1">Tu inversión final</div>
                    <div className="text-2xl md:text-4xl font-black text-amber-300 tracking-tight">{fmtEur(r.inversionNetaCliente)}</div>
                    <div className="text-[9px] md:text-[10px] text-amber-400/60 mt-1 font-bold uppercase tracking-widest">tras todas las ayudas</div>
                </div>
            </div>

            {/* TABLA: Análisis de subvenciones y deducciones (versión cliente, simplificada) */}
            <div className="bg-white/[0.03] border border-white/10 rounded-2xl md:rounded-3xl overflow-hidden mb-5">
                <div className="px-4 md:px-5 py-2.5 md:py-3 bg-orange-500/15 border-b border-orange-500/20 flex justify-between items-center">
                    <h3 className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-orange-300">Subvenciones y deducciones</h3>
                    <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-orange-300/60">Importe</span>
                </div>
                <div className="divide-y divide-white/[0.05]">
                    <RowFin
                        label="Inversión sustitución de caldera por aerotermia (IVA incl.)"
                        value={fmtEur(r.presupuesto)}
                        color="text-white"
                    />
                    <RowFin
                        label="Bono Energético CAE"
                        value={fmtEurSigned(r.caeBonusNetoCliente, '-')}
                        color="text-emerald-400"
                    />
                    {r.irpfDeduction > 0 && r.numOwners > 1 ? (
                        // Mostrar una línea por propietario cuando son varios
                        Array.from({ length: r.numOwners }, (_, i) => (
                            <RowFin
                                key={`irpf-${i}`}
                                label={`Deducción IRPF Propietario ${i + 1}`}
                                sublabel={r.irpfCap ? `${r.irpfRate}%, límite ${r.irpfCap.toLocaleString('es-ES')} €` : null}
                                value={fmtEurSigned(r.irpfDeductionPerOwner, '-')}
                                color="text-emerald-400"
                            />
                        ))
                    ) : r.irpfDeduction > 0 ? (
                        <RowFin
                            label="Deducción en el IRPF por rehabilitación energética"
                            sublabel={r.irpfCap ? `${r.irpfRate}%, límite ${r.irpfCap.toLocaleString('es-ES')} €` : null}
                            value={fmtEurSigned(r.irpfDeduction, '-')}
                            color="text-emerald-400"
                        />
                    ) : null}
                </div>
                <div className="px-4 md:px-5 py-2.5 md:py-3 bg-orange-500/15 border-t border-orange-500/20 flex justify-between items-center">
                    <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-orange-300">Ayuda total estimada</span>
                    <span className="text-sm md:text-base font-black text-orange-300">{fmtEur(r.totalAyudaCliente)}</span>
                </div>
                <div className="px-4 md:px-5 py-2.5 md:py-3 bg-emerald-500/15 border-t border-emerald-500/20 flex justify-between items-center">
                    <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest text-emerald-300">% cubierto por ayudas</span>
                    <span className="text-sm md:text-base font-black text-emerald-300">{r.porcentajeCubiertoCliente}%</span>
                </div>
                <div className="px-4 md:px-5 py-3 md:py-4 bg-black/40 border-t border-white/10 flex justify-between items-center">
                    <span className="text-xs font-black uppercase tracking-widest text-white">Inversión neta final</span>
                    <span className="text-xl md:text-2xl font-black text-white">{fmtEur(r.inversionNetaCliente)}</span>
                </div>
            </div>

            {/* TABLA: Análisis de ahorro y rentabilidad */}
            {r.gastoActualEur > 0 && (
                <div className="bg-white/[0.03] border border-white/10 rounded-3xl overflow-hidden mb-6">
                    <div className="px-5 py-3 bg-black/40 border-b border-white/10">
                        <h3 className="text-[11px] font-black uppercase tracking-widest text-white/80">Análisis de ahorro y rentabilidad</h3>
                    </div>
                    <div className="divide-y divide-white/[0.05]">
                        <RowFin
                            label={`Gasto actual con ${r.fuelLabel}`}
                            value={`${fmtEur(r.gastoActualEur)} / año`}
                            color="text-red-400"
                        />
                        <RowFin
                            label="Gasto estimado con aerotermia"
                            value={`${fmtEur(r.gastoNuevoEur)} / año`}
                            color="text-emerald-400"
                        />
                    </div>
                    <div className="px-5 py-3 bg-emerald-500/15 border-t border-emerald-500/20 flex justify-between items-center">
                        <span className="text-[11px] font-black uppercase tracking-widest text-emerald-300">Ahorro económico anual</span>
                        <span className="text-base font-black text-emerald-300">{fmtEur(r.ahorroAnualEur)}</span>
                    </div>
                    {r.paybackYears > 0 && (
                        <div className="px-5 py-3 bg-emerald-500/10 border-t border-emerald-500/15 flex justify-between items-center">
                            <span className="text-[11px] font-black uppercase tracking-widest text-emerald-200/80">Amortización de la inversión</span>
                            <span className="text-base font-black text-emerald-200">{r.paybackYears} años</span>
                        </div>
                    )}
                </div>
            )}

            {/* Notas */}
            <div className="text-white/40 text-[10px] leading-relaxed space-y-2 mb-8 px-2">
                <p><strong className="text-white/60">Nota 1:</strong> El Bono Energético CAE está garantizado por Brokergy. El importe se ajustará una vez se emitan los certificados de eficiencia energética (CEE) inicial y final.</p>
                <p><strong className="text-white/60">Nota 2:</strong> La deducción del IRPF no es un descuento directo sobre la actuación, sino un derecho a deducción en tu declaración. El ahorro real depende de tu situación fiscal.</p>
                <p><strong className="text-white/60">Nota 3:</strong> Los cálculos son estimaciones teóricas. Un técnico revisará tu caso y emitirá una propuesta personalizada.</p>
            </div>

            {/* Lista de instaladores si la pidió */}
            {funnel?.presupuesto_modo === 'pide_instalador' && (
                <div className="mb-8">
                    <h2 className="text-lg md:text-xl font-black text-white text-center mb-4">
                        Instaladores certificados en tu zona
                    </h2>
                    {loadingInst ? (
                        <div className="text-center text-white/40 py-6 text-sm">Cargando instaladores…</div>
                    ) : instaladores.length === 0 ? (
                        <div className="p-5 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-center">
                            <p className="text-amber-300 text-sm">
                                Te asignaremos un instalador certificado en menos de 24h.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {instaladores.map(inst => (
                                <div key={inst.id} className="p-4 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center gap-3">
                                    {inst.logo_url ? (
                                        <img src={inst.logo_url} alt={inst.nombre} className="w-12 h-12 object-contain rounded-xl bg-white/5 p-2" />
                                    ) : (
                                        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-xl">🛠️</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white text-sm truncate">{inst.nombre}</div>
                                        <div className="text-white/40 text-xs">{inst.provincia}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* CTA: Subir fotos y documentos — destaca, llamativo (naranja Brokergy) */}
            {leadResult?.upload_link && (
                <div className="mb-8 animate-fade-in">
                    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-500/20 via-amber-500/10 to-amber-500/5 border-2 border-amber-500/40 p-6 md:p-7 text-center">
                        {/* Burbujas decorativas */}
                        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
                        <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-orange-500/15 blur-3xl pointer-events-none" />

                        <div className="relative">
                            <div className="flex items-center justify-center gap-2 mb-3">
                                <span className="text-2xl">📸</span>
                                <span className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Ayúdanos a afinar tu propuesta</span>
                            </div>
                            <h3 className="text-xl md:text-2xl font-black text-white tracking-tight mb-2">
                                Sube unas fotos rápidas
                            </h3>
                            <p className="text-white/65 text-sm leading-relaxed mb-5 max-w-md mx-auto">
                                Con algunas fotos de tu vivienda e instalación actual podemos preparar mejor tu propuesta. <strong className="text-white/85">2 minutos desde el móvil.</strong>
                            </p>
                            <div className="flex justify-center">
                                <a
                                    href={leadResult.upload_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center justify-center gap-2 px-7 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-xl shadow-amber-500/30 transition-all"
                                >
                                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                                    </svg>
                                    Subir fotos y documentos
                                </a>
                            </div>
                            <p className="text-white/35 text-[10px] mt-3 leading-relaxed">
                                Puedes hacerlo ahora o desde el enlace que te hemos enviado por WhatsApp / email.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Mensaje de cierre */}
            <div className="text-center">
                <div className="inline-flex flex-col items-center gap-2 p-5 bg-white/[0.03] border border-white/10 rounded-3xl max-w-md mx-auto">
                    <span className="text-2xl">🤝</span>
                    <div className="font-black text-white text-sm">Estudiaremos tu caso personalmente</div>
                    <p className="text-white/50 text-xs leading-relaxed">
                        Uno de nuestros técnicos revisará tu propuesta y se pondrá en contacto contigo con la mayor brevedad posible.
                    </p>
                </div>

                {leadResult?.id_oportunidad && (
                    <div className="mt-5 text-white/30 text-[10px] font-mono uppercase tracking-widest">
                        Referencia: {leadResult.id_oportunidad}
                    </div>
                )}
            </div>
        </div>
    );
}

// Pequeño componente de fila para la tabla financiera
function RowFin({ label, sublabel, value, color = 'text-white' }) {
    return (
        <div className="px-4 md:px-5 py-2.5 md:py-3 flex justify-between items-center gap-3">
            <div className="flex-1 min-w-0">
                <div className="text-white/80 text-xs md:text-sm leading-snug">{label}</div>
                {sublabel && (
                    <div className="text-white/35 text-[10px] mt-0.5 leading-tight">{sublabel}</div>
                )}
            </div>
            <span className={`text-sm font-bold whitespace-nowrap ${color}`}>{value}</span>
        </div>
    );
}
