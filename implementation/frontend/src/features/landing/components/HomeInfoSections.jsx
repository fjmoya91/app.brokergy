/**
 * Secciones informativas del hero (debajo del CatastroSearchBox).
 * - Badges de confianza (fila de 4 chips)
 * - "Cómo funciona" en 3 pasos numerados
 * - Acordeón "¿Qué es el Bono CAE?" (colapsable)
 *
 * Solo se muestra cuando el cliente NO ha confirmado todavía una vivienda
 * (en HOME inicial), no estorba el flujo activo.
 */

import React, { useState } from 'react';

const BADGES = [
    { icon: '✅', label: 'Sin compromiso' },
    { icon: '📋', label: 'Datos oficiales del Catastro' },
    { icon: '⏱', label: 'Tarda menos de 1 minuto' },
    { icon: '🏛', label: 'Bono CAE garantizado' }
];

const STEPS = [
    { n: 1, icon: '🏠', title: 'Busca tu vivienda', desc: 'Por referencia catastral, dirección o tu ubicación actual' },
    { n: 2, icon: '💬', title: 'Responde 8 preguntas', desc: 'Sobre tu caldera actual y cómo te calientas hoy' },
    { n: 3, icon: '📊', title: 'Recibe tu propuesta', desc: 'Cuánto ahorras al año y qué ayudas del Estado te tocan' }
];

const FAQ = [
    {
        q: '¿Qué es el Bono CAE?',
        a: 'Es una ayuda económica del Estado, regulada por el RD 36/2023, para sustituir tu caldera antigua por aerotermia (más eficiente y limpia). Es compatible con la deducción del IRPF por rehabilitación energética: pueden cubrir entre el 60% y el 95% de la inversión.'
    },
    {
        q: '¿Tengo que devolver el bono?',
        a: 'No. El Bono CAE es una subvención directa, no un préstamo. Una vez recibida no se devuelve, siempre que la instalación cumpla los requisitos técnicos (lo verifica un técnico certificado por BROKERGY).'
    },
    {
        q: '¿Cuánto se tarda en cobrar?',
        a: 'Entre 30 y 90 días desde la finalización de la obra. BROKERGY adelanta el bono al cliente para que no tenga que esperar — recibes la ayuda al momento.'
    },
    {
        q: '¿Cuándo me llamáis?',
        a: 'Al recibir tu simulación, un técnico de BROKERGY la revisa personalmente y te contacta por el canal que has elegido (email o WhatsApp) con la mayor brevedad posible. La simulación inicial es orientativa; la propuesta firme se ajusta tras la llamada.'
    }
];

export function HomeInfoSections() {
    const [openFaq, setOpenFaq] = useState(null);

    return (
        <div className="max-w-3xl mx-auto mt-8 md:mt-12 space-y-10 md:space-y-14">

            {/* ───── Badges de confianza ───── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
                {BADGES.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 md:gap-3 p-3 bg-white/[0.03] border border-white/[0.08] rounded-2xl">
                        <span className="text-xl md:text-2xl flex-shrink-0">{b.icon}</span>
                        <span className="text-white/70 text-[11px] md:text-xs font-bold leading-tight">{b.label}</span>
                    </div>
                ))}
            </div>

            {/* ───── Cómo funciona ───── */}
            <section>
                <h3 className="text-center text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-amber-400/80 mb-6">
                    Cómo funciona
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    {STEPS.map(s => (
                        <div key={s.n} className="relative p-5 bg-white/[0.03] border border-white/10 rounded-2xl text-center">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-amber-500 text-bkg-deep font-black text-sm flex items-center justify-center shadow-lg shadow-amber-500/30">
                                {s.n}
                            </div>
                            <div className="text-3xl md:text-4xl mb-3 mt-2">{s.icon}</div>
                            <div className="font-black text-white text-sm md:text-base mb-1.5">{s.title}</div>
                            <p className="text-white/50 text-xs md:text-[13px] leading-snug">{s.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ───── FAQ colapsable ───── */}
            <section>
                <h3 className="text-center text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-amber-400/80 mb-5">
                    Preguntas frecuentes
                </h3>
                <div className="space-y-2">
                    {FAQ.map((item, i) => {
                        const isOpen = openFaq === i;
                        return (
                            <div key={i} className="bg-white/[0.03] border border-white/[0.08] rounded-2xl overflow-hidden">
                                <button
                                    type="button"
                                    onClick={() => setOpenFaq(isOpen ? null : i)}
                                    className="w-full flex items-center justify-between gap-3 px-4 md:px-5 py-3.5 md:py-4 text-left hover:bg-white/[0.02] transition-colors"
                                >
                                    <span className="text-white text-sm md:text-base font-bold flex-1">{item.q}</span>
                                    <svg className={`w-5 h-5 text-amber-400 flex-shrink-0 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </button>
                                {isOpen && (
                                    <div className="px-4 md:px-5 pb-4 pt-1 text-white/60 text-xs md:text-sm leading-relaxed animate-fade-in">
                                        {item.a}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </section>

        </div>
    );
}
