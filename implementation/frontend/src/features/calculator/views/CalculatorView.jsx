import React, { useState, useEffect } from 'react';
import { CalculatorForm } from '../components/CalculatorForm';
import { ResultsPanel } from '../components/ResultsPanel';
import {
    calculateDemand,
    calculateSavings,
    calculateFinancials,
    calculateAnnualSavingsTheoretical,
    calculateAnnualSavingsFromSpending,
    calculatePayback,
    FUEL_PRICES,
    getUByYear,
    getVentanaYACHByYear
} from '../logic/calculation';

const INITIAL_INPUTS = {
    // Datos Edificio
    zona: 'D3',
    anio: 2000,
    superficie: 120,
    plantas: 2,
    altura: 2.7,
    ventanaU: 3.0,
    ach: 0.83,
    tipo: 'unifamiliar',
    subtipo: 'intermedio',
    gla: 22,
    fachadas: 4,
    patios: 0,
    orientacion: 'media',
    sueloTipo: 'terreno',
    uMuro: 1.70,
    uCubierta: 2.50,

    // Datos Instalaciones / Ahorro
    boilerId: 'default',
    boilerEff: 0.92,
    scopHeating: 3.2,
    changeAcs: false,
    scopAcs: 3.0,
    dacs: 2731.4,
    caePriceClient: 95,
    caePriceSO: 160,
    presupuesto: 12000,

    // Datos Ahorro Anual
    fuelType: 'gas_natural',
    savingsMode: 'theoretical', // 'theoretical' o 'real'
    gastoAnualReal: 0,           // Gasto anual en € (modo real)
    participation: 100,         // Porcentaje de participación
    caePricePrescriptor: 0,
    includeCommission: false,
    prescriptorMode: 'brokergy',   // 'client', 'brokergy', 'both'
    emitterType: 'radiadores_convencionales',
    includeAnnualSavings: false,
    discountCertificates: false,
    numOwners: 1,
    referenciaCliente: ''
};

export function CalculatorView({ initialData, onBack }) {
    const [showBrokergy, setShowBrokergy] = useState(false);

    // Inicializar estado. Si hay initialData, lo usamos como base absoluta.
    const [inputs, setInputs] = useState(() => {
        // Combinamos los defaults con la data inicial. 
        // Si initialData ya es un objeto de estado completo (viniendo de App.jsx), se respetará íntegramente.
        const base = { ...INITIAL_INPUTS, ...initialData };

        if (initialData) {
            // Aseguramos conversiones de tipo para campos críticos que puedan venir como strings del catastro
            if (initialData.anio) base.anio = Number(initialData.anio);
            if (initialData.plantas) base.plantas = Number(initialData.plantas);
            if (initialData.superficie) base.superficie = Number(initialData.superficie);

            // isPersistent = true solo si viene explícitamente marcado desde App.jsx
            // (datos guardados en BD o inputs persistentes de sesión).
            // NO usar !!initialData.uMuro porque INITIAL_INPUTS ya pone un uMuro por defecto
            // y eso hacía que siempre fuese true.
            const isPersistent = !!initialData.isPersistent;

            console.log('[CalculatorView] Init:', {
                isPersistent,
                anio: base.anio,
                initialDataKeys: Object.keys(initialData),
                hasUMuro: 'uMuro' in initialData,
                initialUMuro: initialData.uMuro,
                baseUMuro: base.uMuro,
            });

            if (!isPersistent && initialData.tipo) {
                if (initialData.tipo === 'unifamiliar') {
                    base.fachadas = 4;
                    base.sueloTipo = 'terreno';
                    base.gla = 12;
                } else if (initialData.tipo === 'hilera') {
                    base.fachadas = 2;
                    base.sueloTipo = 'terreno';
                    base.gla = 15;
                } else if (initialData.tipo === 'piso') {
                    base.fachadas = 1;
                    base.sueloTipo = 'vivienda';
                    base.gla = 15;
                }
            }

            if (!isPersistent && base.anio) {
                const yearU = getUByYear(base.anio);
                base.uMuro = yearU.wall;
                base.uCubierta = yearU.roof;

                const yearVentanaAch = getVentanaYACHByYear(base.anio);
                base.ventanaU = yearVentanaAch.ventanaU;
                base.ach = yearVentanaAch.ach;

                console.log('[CalculatorView] Applied year-based defaults for year', base.anio, ':', {
                    uMuro: base.uMuro,
                    uCubierta: base.uCubierta,
                    ventanaU: base.ventanaU,
                    ach: base.ach
                });
            }

            if (initialData.participation) {
                const part = parseFloat(initialData.participation.toString().replace('%', '').replace(',', '.'));
                base.participation = isNaN(part) ? 100 : part;
            }
        }
        return base;
    });

    const [result, setResult] = useState(null);

    // Cálculos en tiempo real cada vez que cambian los inputs
    useEffect(() => {
        handleCalculate();
    }, [inputs]);

    const handleCalculate = () => {
        // Sanitización local de inputs numéricos para evitar que los strings con "." o "," rompan el motor de cálculo
        const sanitizedInputs = {
            ...inputs,
            superficie: parseFloat(inputs.superficie) || 0,
            plantas: parseInt(inputs.plantas) || 1,
            altura: parseFloat(inputs.altura) || 2.7,
            presupuesto: parseFloat(inputs.presupuesto) || 0,
            dacs: parseFloat(inputs.dacs) || 0,
            boilerEff: parseFloat(inputs.boilerEff) || 0.92,
            scopHeating: parseFloat(inputs.scopHeating) || 3.2,
            scopAcs: parseFloat(inputs.scopAcs) || 3.0,
            uMuro: parseFloat(inputs.uMuro) || 1.7,
            uCubierta: parseFloat(inputs.uCubierta) || 2.5,
            ventanaU: parseFloat(inputs.ventanaU) || 3.0,
            ach: parseFloat(inputs.ach) || 0.83,
            gla: parseFloat(inputs.gla) || 15,
            gastoAnualReal: parseFloat(inputs.gastoAnualReal) || 0,
            participation: parseFloat(inputs.participation) || 100,
            caePriceClient: parseFloat(inputs.caePriceClient) || 95,
            caePriceSO: parseFloat(inputs.caePriceSO) || 160,
            caePricePrescriptor: parseFloat(inputs.caePricePrescriptor) || 0,
            numOwners: parseInt(inputs.numOwners) || 1
        };

        // 1. Calcular Demanda (usando inputs sanitizados)
        const demandRes = calculateDemand(sanitizedInputs);

        // 2. Calcular Ahorro
        const savingsRes = calculateSavings({
            q_net_heating: demandRes.Q_net,
            dacs: sanitizedInputs.dacs,
            boilerEff: sanitizedInputs.boilerEff,
            scopHeating: sanitizedInputs.scopHeating,
            scopAcs: sanitizedInputs.scopAcs,
            changeAcs: sanitizedInputs.changeAcs
        });

        // 3. Cálculos Financieros (IRPF + CAE)
        const financialRes = calculateFinancials({
            presupuesto: sanitizedInputs.presupuesto,
            savingsKwh: savingsRes.savingsKwh,
            caePriceClient: sanitizedInputs.caePriceClient,
            caePriceSO: sanitizedInputs.caePriceSO,
            caePricePrescriptor: inputs.includeCommission ? sanitizedInputs.caePricePrescriptor : 0,
            prescriptorMode: sanitizedInputs.prescriptorMode,
            tipo: sanitizedInputs.tipo,
            participation: sanitizedInputs.participation,
            numOwners: sanitizedInputs.numOwners
        });

        // 4. Cálculos de Ahorro Anual (€)
        let annualSavingsRes;
        if (sanitizedInputs.savingsMode === 'real' && sanitizedInputs.gastoAnualReal > 0) {
            annualSavingsRes = calculateAnnualSavingsFromSpending({
                gastoAnual: sanitizedInputs.gastoAnualReal,
                fuelType: sanitizedInputs.fuelType,
                boilerEff: sanitizedInputs.boilerEff,
                scopCalefaccion: sanitizedInputs.scopHeating
            });
        } else {
            annualSavingsRes = calculateAnnualSavingsTheoretical({
                demandaCalefaccion: demandRes.Q_net,
                demandaACS: sanitizedInputs.dacs,
                boilerEff: sanitizedInputs.boilerEff,
                scopCalefaccion: sanitizedInputs.scopHeating,
                scopACS: sanitizedInputs.scopAcs,
                fuelType: sanitizedInputs.fuelType,
                changeACS: sanitizedInputs.changeAcs
            });
        }

        // 5. Cálculo de Amortización
        const paybackRes = calculatePayback({
            presupuesto: sanitizedInputs.presupuesto,
            totalAyuda: financialRes.totalAyuda,
            ahorroAnual: annualSavingsRes.ahorroAnual
        });

        // Combinar resultados
        setResult({
            ...demandRes,
            savings: savingsRes,
            financials: financialRes,
            annualSavings: annualSavingsRes,
            payback: paybackRes,
            includeAnnualSavings: inputs.includeAnnualSavings,
            discountCertificates: inputs.discountCertificates
        });
    };

    return (
        <div className="animate-fade-in text-white">
            {/* Header de la Calculadora */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 w-full md:w-auto">
                    <button
                        onClick={() => onBack(inputs)}
                        className="flex items-center justify-center sm:justify-start gap-2 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold py-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Volver
                    </button>

                    {/* Selector de Vista Global (Experto UI/UX) */}
                    <div className="flex bg-slate-900/60 p-1 rounded-xl border border-white/5 shadow-inner w-full sm:min-w-[280px]">
                        <button
                            onClick={() => setShowBrokergy(false)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${!showBrokergy
                                ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-900 shadow-lg'
                                : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            VISTA PRESCRIPTOR
                        </button>
                        <button
                            onClick={() => setShowBrokergy(true)}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-[9px] sm:text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${showBrokergy
                                ? 'bg-gradient-to-r from-emerald-500 to-lime-600 text-white shadow-lg shadow-emerald-500/20'
                                : 'text-slate-500 hover:text-slate-300'}`}
                        >
                            VISTA BROKERGY
                        </button>
                    </div>
                </div>

                <div className="hidden md:block">
                    {inputs.rc && (
                        <span className="px-3 py-1 bg-white/5 rounded-full border border-white/10 text-[10px] font-mono text-slate-400">
                            RC: {inputs.rc}
                        </span>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
                {/* Columna Izquierda: Formulario */}
                <div className="lg:col-span-7">
                    <CalculatorForm
                        inputs={inputs}
                        onInputChange={setInputs}
                        onCalculate={handleCalculate}
                        result={result}
                        showBrokergy={showBrokergy}
                    />
                </div>

                {/* Columna Derecha: Resultados */}
                <div className="lg:col-span-5">
                    <ResultsPanel result={result} inputs={inputs} onInputChange={setInputs} showBrokergy={showBrokergy} />
                </div>
            </div>
        </div>
    );
}
