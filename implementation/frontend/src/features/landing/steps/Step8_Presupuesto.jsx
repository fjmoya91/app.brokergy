import React, { useState } from 'react';
import { IconCard } from '../components/IconCard';
import { StepLayout } from '../components/StepLayout';

export function Step8_Presupuesto({ funnel, updateFunnel, onNext }) {
    const [showInput, setShowInput] = useState(false);
    const [customValue, setCustomValue] = useState(funnel.presupuesto_eur || '');

    const selectMode = (modo) => {
        if (modo === 'tengo') {
            setShowInput(true);
            updateFunnel({ presupuesto_modo: 'tengo' });
            return;
        }
        if (modo === 'no_se') {
            updateFunnel({ presupuesto_modo: 'no_se', presupuesto_eur: 15000 });
            setTimeout(onNext, 250);
            return;
        }
        if (modo === 'pide_instalador') {
            updateFunnel({ presupuesto_modo: 'pide_instalador', presupuesto_eur: 15000 });
            setTimeout(onNext, 250);
        }
    };

    const confirmCustom = () => {
        const num = parseInt(customValue, 10);
        if (!num || num < 1000) return;
        updateFunnel({ presupuesto_eur: num });
        setTimeout(onNext, 200);
    };

    return (
        <StepLayout
            question="¿Tienes un presupuesto orientativo?"
            subtitle="Si no lo sabes, no te preocupes — usamos una media o te conectamos con un instalador."
        >
            <IconCard
                icon="💶"
                title="Sí, tengo un presupuesto en mente"
                subtitle="Te lo pediremos a continuación"
                selected={funnel.presupuesto_modo === 'tengo'}
                onClick={() => selectMode('tengo')}
            />
            <IconCard
                icon="🤷"
                title="No, calcúlame uno orientativo"
                subtitle="Usamos 15.000 € como media nacional de vivienda unifamiliar"
                selected={funnel.presupuesto_modo === 'no_se'}
                onClick={() => selectMode('no_se')}
            />
            <IconCard
                icon="🛠️"
                title="Quiero presupuesto de un instalador"
                subtitle="Te conectamos al final con instaladores certificados de tu zona"
                selected={funnel.presupuesto_modo === 'pide_instalador'}
                onClick={() => selectMode('pide_instalador')}
                badge="Personalizado"
            />

            {showInput && funnel.presupuesto_modo === 'tengo' && (
                <div className="mt-6 pt-6 border-t border-white/10 animate-fade-in">
                    <label className="block text-amber-300 text-xs font-black uppercase tracking-widest mb-3 text-center">
                        ¿Cuánto presupuesto tienes?
                    </label>
                    <div className="flex items-center gap-3 max-w-sm mx-auto">
                        <div className="flex-1 relative">
                            <input
                                type="number"
                                min="1000"
                                step="500"
                                placeholder="15000"
                                value={customValue}
                                onChange={e => setCustomValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmCustom(); }}
                                className="w-full bg-white/[0.06] border-2 border-white/10 focus:border-amber-400 rounded-2xl px-5 py-4 text-white text-2xl font-bold text-center transition-all outline-none"
                            />
                            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-white/40 text-xl font-bold pointer-events-none">€</span>
                        </div>
                        <button
                            type="button"
                            onClick={confirmCustom}
                            disabled={!customValue || parseInt(customValue, 10) < 1000}
                            className="px-6 py-4 bg-amber-500 hover:bg-amber-400 disabled:opacity-30 disabled:cursor-not-allowed text-bkg-deep font-black uppercase tracking-widest text-xs rounded-2xl transition-all"
                        >
                            OK
                        </button>
                    </div>
                </div>
            )}
        </StepLayout>
    );
}
