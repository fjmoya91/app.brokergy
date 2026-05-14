/**
 * Pantalla final del funnel.
 * Muestra al cliente el bono CAE estimado, ahorro anual y CO₂ evitado.
 * Mensaje "te llamamos en 24h" + opción de subida de fotos (Fase 3) + listado
 * de instaladores si pidió presupuesto de un instalador.
 *
 * NOTA: las cifras mostradas son ORIENTATIVAS — el técnico afina el cálculo
 * real en la calculadora al revisar la oportunidad.
 */

import React, { useEffect, useState } from 'react';
import axios from 'axios';

export function LandingResultView({ leadResult, funnel, contacto, partnerBranding }) {
    const [instaladores, setInstaladores] = useState([]);
    const [loadingInst, setLoadingInst] = useState(false);

    // Cargar instaladores si el cliente lo pidió
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

    // Cifras orientativas — se afina con la calculadora real luego
    const ahorroAnualOrientativo = Math.round((funnel?.gasto_anual_eur || 1500) * 0.6);
    const bonoCaeOrientativo = funnel?.isReforma ? 5500 : 3500;
    const co2Orientativo = Math.round((funnel?.gasto_anual_eur || 1500) * 0.003);

    const fmt = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 }).format(n);

    return (
        <div className="animate-fade-in max-w-3xl mx-auto">
            {/* Header */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-emerald-500/20 border-2 border-emerald-500/40 mb-6">
                    <span className="text-5xl">✓</span>
                </div>
                <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight mb-3">
                    ¡Listo, {contacto?.nombre?.split(' ')[0] || 'enhorabuena'}!
                </h1>
                <p className="text-white/60 text-base md:text-lg max-w-xl mx-auto">
                    Hemos recibido tu simulación. Estos son tus números orientativos:
                </p>
            </div>

            {/* Cifras principales */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                <div className="p-6 bg-gradient-to-br from-amber-500/20 to-amber-500/5 border-2 border-amber-500/30 rounded-3xl text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-amber-300/80 mb-2">Bono CAE</div>
                    <div className="text-4xl md:text-5xl font-black text-amber-300 tracking-tight">
                        {fmt(bonoCaeOrientativo)}<span className="text-2xl ml-1">€</span>
                    </div>
                    <div className="text-xs text-white/40 mt-2">Ayuda directa del Estado</div>
                </div>
                <div className="p-6 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-2 border-emerald-500/30 rounded-3xl text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-emerald-300/80 mb-2">Ahorro anual</div>
                    <div className="text-4xl md:text-5xl font-black text-emerald-300 tracking-tight">
                        {fmt(ahorroAnualOrientativo)}<span className="text-2xl ml-1">€</span>
                    </div>
                    <div className="text-xs text-white/40 mt-2">En tu factura cada año</div>
                </div>
                <div className="p-6 bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border-2 border-cyan-500/30 rounded-3xl text-center">
                    <div className="text-[10px] font-black uppercase tracking-widest text-cyan-300/80 mb-2">CO₂ evitado</div>
                    <div className="text-4xl md:text-5xl font-black text-cyan-300 tracking-tight">
                        {fmt(co2Orientativo)}<span className="text-2xl ml-1">t</span>
                    </div>
                    <div className="text-xs text-white/40 mt-2">Al año vs tu sistema actual</div>
                </div>
            </div>

            {/* Disclaimer */}
            <div className="p-4 bg-white/[0.03] border border-white/10 rounded-2xl mb-8 text-center">
                <p className="text-white/50 text-xs leading-relaxed">
                    Cifras orientativas calculadas con los datos que nos has dado. Un técnico de
                    BROKERGY revisará tu caso y te enviará una propuesta personalizada en menos de 24 horas.
                </p>
            </div>

            {/* Lista de instaladores si la pidió */}
            {funnel?.presupuesto_modo === 'pide_instalador' && (
                <div className="mb-10">
                    <h2 className="text-xl md:text-2xl font-black text-white text-center mb-6">
                        Instaladores certificados en tu zona
                    </h2>
                    {loadingInst ? (
                        <div className="text-center text-white/40 py-8">Cargando instaladores…</div>
                    ) : instaladores.length === 0 ? (
                        <div className="p-6 bg-amber-500/5 border border-amber-500/20 rounded-2xl text-center">
                            <p className="text-amber-300 text-sm">
                                Te asignaremos personalmente un instalador certificado en menos de 24h.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {instaladores.map(inst => (
                                <div key={inst.id} className="p-4 bg-white/[0.04] border border-white/10 rounded-2xl flex items-center gap-3">
                                    {inst.logo_url ? (
                                        <img src={inst.logo_url} alt={inst.nombre} className="w-14 h-14 object-contain rounded-xl bg-white/5 p-2" />
                                    ) : (
                                        <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-2xl">🛠️</div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <div className="font-bold text-white truncate">{inst.nombre}</div>
                                        <div className="text-white/40 text-xs">{inst.provincia}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Próximos pasos */}
            <div className="text-center">
                <div className="inline-flex flex-col items-center gap-2 p-6 bg-white/[0.03] border border-white/10 rounded-3xl max-w-md mx-auto">
                    <span className="text-3xl">📞</span>
                    <div className="font-black text-white">Te llamamos en menos de 24h</div>
                    <p className="text-white/50 text-sm">
                        Si quieres adelantar el contacto, llámanos al
                        <a href={`tel:${partnerBranding?.telefono_contacto || '+34900000000'}`} className="text-amber-400 font-bold ml-1">
                            {partnerBranding?.telefono_contacto || '900 000 000'}
                        </a>
                    </p>
                </div>

                {leadResult?.id_oportunidad && (
                    <div className="mt-6 text-white/30 text-[10px] font-mono uppercase tracking-widest">
                        Referencia: {leadResult.id_oportunidad}
                    </div>
                )}
            </div>
        </div>
    );
}
