// CalculatorView v2.1 - Updated 2026-03-10
import React, { useState, useEffect } from 'react';
import { CalculatorForm } from '../components/CalculatorForm';
import { ResultsPanel } from '../components/ResultsPanel';
import { useAuth } from '../../../context/AuthContext';
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
    superficieCalefactable: 120,
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
    includeLegalization: false,
    installerNoCard: false,
    legalizationPrice: 200,
    numOwners: 1,
    referenciaCliente: '',
    
    // Modo de demanda y datos (real o estimado)
    demandMode: 'estimated',
    xmlDemandData: null,
    manualDemand: 0
};

export function CalculatorView({ initialData, onBack }) {
    const { user } = useAuth();
    const [showBrokergy, setShowBrokergy] = useState(user?.rol?.toUpperCase() === 'ADMIN');
    
    // Forzar siempre vista prescriptor si no es admin (seguridad extra)
    useEffect(() => {
        if (user?.rol?.toUpperCase() !== 'ADMIN' && showBrokergy) {
            setShowBrokergy(false);
        }
    }, [user, showBrokergy]);

    // Inicializar estado. Si hay initialData, lo usamos como base absoluta.
    const [inputs, setInputs] = useState(() => {
        // Combinamos los defaults con la data inicial. 
        // Si initialData ya es un objeto de estado completo (viniendo de App.jsx), se respetará íntegramente.
        const base = { ...INITIAL_INPUTS, ...initialData };

        if (initialData) {
            // Aseguramos conversiones de tipo para campos críticos que puedan venir como strings del catastro
            if (initialData.anio) base.anio = Number(initialData.anio);
            if (initialData.plantas) base.plantas = Number(initialData.plantas);
            if (initialData.superficie) {
                base.superficie = Number(initialData.superficie);
                if (!initialData.superficieCalefactable) base.superficieCalefactable = base.superficie;
            }

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
            superficieCalefactable: parseFloat(inputs.superficieCalefactable) || 0,
            plantas: parseInt(inputs.plantas) || 1,
            altura: parseFloat(inputs.altura) || 2.7,
            presupuesto: parseFloat(inputs.presupuesto) || 0,
            dacs: 2731.4, // Valor fijo solicitado por el usuario
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
            numOwners: parseInt(inputs.numOwners) || 1,
            legalizationPrice: parseFloat(inputs.legalizationPrice) || 250,
            manualDemand: parseFloat(inputs.manualDemand) || 0
        };

        // 1. Calcular Demanda
        let demandRes;
        if (showBrokergy && inputs.demandMode === 'real' && inputs.xmlDemandData?.demandaCalefaccion) {
            // Modo REAL: usar la demanda del XML (kWh/m²·año) × superficie calefactable
            const xmlDemandTotal = inputs.xmlDemandData.demandaCalefaccion * sanitizedInputs.superficieCalefactable;
            demandRes = {
                Q_net: xmlDemandTotal,
                q_net: inputs.xmlDemandData.demandaCalefaccion,
                fromXml: true
            };
        } else if (showBrokergy && inputs.demandMode === 'manual') {
            // Modo MANUAL: usar la demanda introducida a mano (kWh/m²·año) × superficie calefactable
            demandRes = {
                Q_net: sanitizedInputs.manualDemand * sanitizedInputs.superficieCalefactable,
                q_net: sanitizedInputs.manualDemand,
                fromManual: true
            };
        } else {
            // Modo ESTIMADO: cálculo tradicional
            demandRes = calculateDemand(sanitizedInputs);
            demandRes.fromXml = false;
        }

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
            numOwners: sanitizedInputs.numOwners,
            discountCertificates: sanitizedInputs.discountCertificates,
            includeLegalization: sanitizedInputs.includeLegalization,
            installerNoCard: sanitizedInputs.installerNoCard,
            legalizationPrice: sanitizedInputs.legalizationPrice
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
            discountCertificates: inputs.discountCertificates,
            discountLegalization: inputs.discountLegalization
        });
    };

    return (
        <div className="animate-fade-in text-white">
            {/* Sticky Bono Badge */}
            {result?.financials?.caeBonus !== undefined && (
                <div className="fixed bottom-0 md:bottom-auto md:top-0 left-0 right-0 z-[100] p-2 md:p-4 flex justify-center pointer-events-none">
                    <div className={`w-full ${showBrokergy ? 'max-w-xl' : 'max-w-md'} bg-bkg-deep/90 md:bg-bkg-deep/80 backdrop-blur-xl border border-brand/40 rounded-2xl md:rounded-3xl p-3 md:p-4 shadow-[0_-10px_40px_rgba(255,160,0,0.12)] md:shadow-[0_20px_50px_rgba(255,160,0,0.15)] flex items-center justify-between pointer-events-auto transform hover:scale-[1.02] transition-all duration-500 ring-1 ring-white/10 group`}>
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-gradient-to-br from-brand-300 to-brand-700 flex items-center justify-center shadow-lg shadow-brand/20 group-hover:rotate-12 transition-transform duration-500">
                                <svg className="w-5 h-5 md:w-6 md:h-6 text-bkg-deep" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                                </svg>
                            </div>
                            <div>
                                <p className="text-[9px] md:text-[10px] font-black text-brand uppercase tracking-[0.2em]">Bono Energético</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 md:gap-4">
                            <div className="flex items-baseline gap-1.5 md:gap-2 bg-bkg-surface py-1.5 px-4 md:py-2 md:px-6 rounded-xl md:rounded-2xl border border-white/[0.06]">
                                <span className="text-3xl md:text-4xl font-black text-white tracking-tighter animate-pulse-slow">
                                    {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(result.financials.caeBonus)}
                                </span>
                                <span className="text-lg md:text-xl font-black text-brand">€</span>
                            </div>
                            {showBrokergy && result.financials.profitBrokergy !== undefined && (
                                <div className="flex items-baseline gap-1 bg-emerald-500/10 py-1.5 px-3 md:py-2 md:px-4 rounded-xl md:rounded-2xl border border-emerald-500/20">
                                    <span className="text-[8px] md:text-[9px] font-black text-emerald-400/60 uppercase tracking-wider mr-1">Beneficio</span>
                                    <span className="text-xl md:text-2xl font-black text-emerald-400 tracking-tighter">
                                        {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(result.financials.profitBrokergy)}
                                    </span>
                                    <span className="text-sm font-black text-emerald-500">€</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            {/* Header de la Calculadora */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => onBack(inputs)}
                        className="flex items-center gap-2 text-white/40 hover:text-white transition-colors text-xs uppercase tracking-widest font-bold py-2"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        Volver a Ficha Técnica
                    </button>
                </div>

                <div className="hidden md:flex items-center gap-3">
                    {inputs.referenciaCliente && (
                        <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                            {inputs.referenciaCliente}
                        </span>
                    )}
                    {inputs.rc && (
                        <span className="px-3 py-1 bg-bkg-surface rounded-full border border-white/[0.06] text-[10px] font-mono text-white/40">
                            RC: {inputs.rc}
                        </span>
                    )}

                    {/* Toggle Vista Brokergy/Prescriptor - Solo ADMIN */}
                    {user?.rol?.toUpperCase() === 'ADMIN' && (
                        <button
                            onClick={() => setShowBrokergy(!showBrokergy)}
                            title={showBrokergy ? 'Cambiar a Vista Prescriptor' : 'Cambiar a Vista Brokergy'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all duration-300 ${
                                showBrokergy
                                    ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25'
                                    : 'bg-white/5 border-white/10 text-white/40 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            {showBrokergy ? 'BKG' : 'PRE'}
                        </button>
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
                        demandMode={inputs.demandMode}
                        onDemandModeChange={(mode) => setInputs(prev => ({...prev, demandMode: mode}))}
                        xmlDemandData={inputs.xmlDemandData}
                        onXmlDemandDataChange={(data) => setInputs(prev => ({...prev, xmlDemandData: data}))}
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
