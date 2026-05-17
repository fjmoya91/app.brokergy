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

const STEPS = [
    { n: 1, icon: '🏠', title: 'Busca tu vivienda', desc: 'Por referencia catastral, dirección o tu ubicación actual' },
    { n: 2, icon: '💬', title: 'Responde 8 preguntas', desc: 'Sobre tu caldera actual y cómo te calientas hoy' },
    { n: 3, icon: '📊', title: 'Recibe tu propuesta', desc: 'Cuánto ahorras al año y qué ayudas del Estado te tocan' }
];

const FAQ = [
    {
        q: '¿Qué es el Bono Energético CAE?',
        a: 'Los Certificados de Ahorro Energético (CAE) son un mecanismo regulado por el Ministerio para la Transición Ecológica y el Reto Demográfico (Real Decreto 36/2023) que premia económicamente las acciones de eficiencia energética realizadas en hogares y negocios — como sustituir una caldera antigua por aerotermia, mejorar el aislamiento o cambiar ventanas.'
    },
    {
        q: '¿Quién paga el bono?',
        a: 'Las grandes empresas energéticas — los llamados "sujetos obligados" — están obligadas por ley a comprar estos certificados. Sin embargo, solo los adquieren en grandes volúmenes y no negocian directamente con particulares. BROKERGY actúa como intermediario especializado: agrupa tu expediente con otros similares, gestiona toda la documentación técnica y administrativa, y negocia con los sujetos obligados para obtener el máximo precio por tus certificados.'
    },
    {
        q: '¿Cuánto se tarda en cobrar?',
        a: 'Entre 3 y 6 meses desde la finalización de la obra. BROKERGY no realiza adelantos — cobramos a éxito una vez los sujetos obligados validan y pagan el expediente. El pago es íntegro y en el plazo garantizado, sin sorpresas.'
    },
    {
        q: '¿Qué tengo que hacer yo?',
        a: 'Casi nada. Solo necesitas firmar 2 documentos (cesión del CAE y autorización de gestión). BROKERGY se encarga de toda la documentación técnica, la emisión de facturas específicas y la tramitación administrativa de principio a fin. Sin papeleo, sin complicaciones.'
    },
    {
        q: '¿Tengo que devolver el bono?',
        a: 'No. El Bono CAE es una subvención directa, no un préstamo. Una vez tramitado y cobrado, no se devuelve. La instalación queda verificada por un técnico certificado por BROKERGY y validada por el sujeto obligado.'
    },
    {
        q: '¿Cuándo me llamáis?',
        a: 'Al recibir tu simulación, un técnico de BROKERGY la revisa personalmente y te contacta por el canal que has elegido (email o WhatsApp) con la mayor brevedad posible. La simulación inicial es orientativa; la propuesta firme se ajusta tras la llamada.'
    }
];

export function HomeInfoSections() {
    const [openFaq, setOpenFaq] = useState(null);

    return (
        <div className="max-w-3xl mx-auto mt-10 md:mt-14 space-y-10 md:space-y-14">

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
