/**
 * Pantalla final — Resultado para el cliente.
 *
 * Mantiene el estilo dark de la app, pero replica la estructura del PDF
 * comercial: cifra grande de bono CAE arriba + tabla "Análisis de
 * subvenciones y deducciones" + tabla "Análisis de ahorro y rentabilidad".
 */

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { computeLandingResult } from '../data/landingCalculation';

const fmtEur = (n) => `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(Math.abs(n || 0))} €`;
const fmtEurSigned = (n, sign) => `${sign === '-' ? '−' : '+'} ${fmtEur(n)}`;

export function LandingResultView({ leadResult, funnel, contacto, partnerBranding, calculatorInputs }) {
    const [instaladores, setInstaladores] = useState([]);
    const [loadingInst, setLoadingInst] = useState(false);

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

    return (
        <div className="animate-fade-in max-w-2xl mx-auto">
            {/* Header compacto */}
            <div className="text-center mb-5">
                <h1 className="text-xl md:text-2xl font-black text-white tracking-tight mb-1">
                    ¡Listo, {contacto?.nombre?.split(' ')[0] || 'enhorabuena'}!
                </h1>
                <p className="text-white/50 text-xs md:text-sm">
                    Hemos calculado tu propuesta orientativa.
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
                    {r.irpfDeduction > 0 && (
                        <RowFin
                            label="Deducción en el IRPF por rehabilitación energética"
                            value={fmtEurSigned(r.irpfDeduction, '-')}
                            color="text-emerald-400"
                        />
                    )}
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
function RowFin({ label, value, color = 'text-white' }) {
    return (
        <div className="px-5 py-3 flex justify-between items-center gap-3">
            <span className="text-white/80 text-sm leading-snug flex-1">{label}</span>
            <span className={`text-sm font-bold whitespace-nowrap ${color}`}>{value}</span>
        </div>
    );
}
