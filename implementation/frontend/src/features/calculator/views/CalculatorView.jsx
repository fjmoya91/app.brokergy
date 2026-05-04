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
    calculateRes080,
    calculateRes080Estimated,
    calculateHybridization,
    FUEL_PRICES,
    getUByYear,
    getVentanaYACHByYear,
    AEROTHERMIA_MODELS
} from '../logic/calculation';
import axios from 'axios';

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
    hibridacion: false,
    potenciaBomba: 12,
    discountCertificates: false,
    includeLegalization: false,
    installerNoCard: false,
    legalizationPrice: 200,
    numOwners: 1,
    referenciaCliente: '',
    itpPercent: 0,
    includeItp: false,
    includeIrpf: true,
    titularType: 'particular',
    aplicarIrpfCae: false,
    cod_cliente_interno: '',
    instalador_asociado_id: '',
    prescriptor_id: '',
    
    // Modo de demanda y datos (real o estimado)
    demandMode: 'estimated',
    xmlDemandData: null,
    // Datos de Reforma (RES080)
    isReforma: false,
    comparativaReforma: true,
    reformaType: 'none', // 'none' | 'both' | 'onlyReforma'
    xmlDemandDataFinal: null,
    combustibleAcsInicial: 'Gas Natural',
    combustibleAcsFinal: 'Electricidad peninsular',
    combustibleCalefaccionInicial: 'Gas Natural',
    combustibleCalefaccionFinal: 'Electricidad peninsular',
    combustibleRefrigeracionInicial: 'Electricidad peninsular',
    combustibleRefrigeracionFinal: 'Electricidad peninsular',
    presupuestoEnvolvente: 0,

    // Nuevos campos Estimación RES080
    boilerAcsType: '',
    boilerHeatingType: 'No tiene Calefacción',
    insulationState: 'sin_aislamiento',
    reformaParedes: false,
    
    // Campos de Emisiones Manuales (para modo Manual + Reforma)
    manualEmisionesAcsInicial: 0,
    manualEmisionesAcsFinal: 0,
    manualEmisionesCalefaccionInicial: 0,
    manualEmisionesCalefaccionFinal: 0,
    manualEmisionesRefrigeracionInicial: 0,
    manualEmisionesRefrigeracionFinal: 0,

    // UI State (Persistente)
    showBuildingData: false,
    showEnvolvente: false,
    showInstalaciones: false,
    showEconomicData: false,
    showAdvanced: false
};

export function CalculatorView({ initialData, onBack, onNavigate }) {
    const { user } = useAuth();
    const [showBrokergy, setShowBrokergy] = useState(false);
    
    // Sincronizar permisos de Admin/Partner dinámicamente
    useEffect(() => {
        const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';
        setShowBrokergy(isAdmin);
    }, [user]);

    // Inicializar estado. Si hay initialData, lo usamos como base absoluta.
    const [inputs, setInputs] = useState(() => {
        // Combinamos los defaults con la data inicial. 
        // Si initialData ya es un objeto de estado completo (viniendo de App.jsx), se respetará íntegramente.
        const base = { ...INITIAL_INPUTS, ...initialData };

        // Forzamos defaults críticos si vienen vacíos de initialData (ej: oportunidades antiguas o mal inicializadas)
        if (!base.boilerHeatingType || base.boilerHeatingType === '') {
            base.boilerHeatingType = 'No tiene Calefacción';
        }
        if (!base.insulationState || base.insulationState === '') {
            base.insulationState = 'sin_aislamiento';
        }
        if (!base.demandMode || !['estimated', 'real', 'manual'].includes(base.demandMode)) {
            base.demandMode = 'estimated';
        }

        if (initialData) {
            // Aseguramos conversiones de tipo para campos críticos que puedan venir como strings del catastro
            if (initialData.anio) base.anio = Number(initialData.anio);
            if (initialData.plantas) base.plantas = Number(initialData.plantas);
            if (initialData.superficie) {
                base.superficie = Number(initialData.superficie);
                if (!initialData.superficieCalefactable) base.superficieCalefactable = base.superficie;
            }

            const isPersistent = !!initialData.isPersistent;

            console.log('[CalculatorView] Init:', {
                isPersistent,
                anio: base.anio,
                boilerHeatingType: base.boilerHeatingType,
                insulationState: base.insulationState,
                initialDataKeys: Object.keys(initialData),
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
    const [dbModels, setDbModels] = useState([]);
    const [associatedExpediente, setAssociatedExpediente] = useState(null);
    const [showAcceptModal, setShowAcceptModal] = useState(false);
    const [acceptLoading, setAcceptLoading] = useState(false);
    const [manualExpNumber, setManualExpNumber] = useState('');
    const [isManualMode, setIsManualMode] = useState(false);
    const [acceptError, setAcceptError] = useState(null);
    const [lastSnapshot, setLastSnapshot] = useState(null);

    useEffect(() => {
        const fetchModels = async () => {
            try {
                const res = await axios.get('/api/aerotermia');
                setDbModels(res.data);
            } catch (err) {
                console.error('Error fetching models for calculator:', err);
            }
        };
        fetchModels();
    }, []);

    // Buscar expediente asociado
    useEffect(() => {
        if (inputs.id_oportunidad) {
            axios.get('/api/expedientes')
                .then(res => {
                    const found = (res.data || []).find(e => 
                        e.oportunidades?.id_oportunidad === inputs.id_oportunidad ||
                        e.id_oportunidad_ref === inputs.id_oportunidad
                    );
                    if (found) setAssociatedExpediente(found);
                    else setAssociatedExpediente(null);
                })
                .catch(err => console.error('Error fetching associated expediente:', err));
        }
    }, [inputs.id_oportunidad]);

    // Cálculos en tiempo real cada vez que cambian los inputs o se cargan los modelos
    useEffect(() => {
        handleCalculate();
    }, [inputs, dbModels]);

    // Defensive: al activar Reforma, garantizar que insulationState tiene un valor válido.
    // Algunas oportunidades antiguas guardaban el campo vacío/null, lo que provocaba que
    // el cálculo usara un fallback incorrecto hasta que el usuario re-seleccionaba la opción.
    useEffect(() => {
        if (!inputs.isReforma) return;
        const valid = ['sin_aislamiento', 'antigua_mal_aislamiento', 'antigua_aislamiento_medio', 'bien_aislada'];
        if (!inputs.insulationState || !valid.includes(inputs.insulationState)) {
            setInputs(prev => ({ ...prev, insulationState: 'sin_aislamiento' }));
        }
    }, [inputs.isReforma, inputs.insulationState]);

    // Calcular si hay cambios pendientes (Dirty State)
    const currentSnapshot = JSON.stringify({
        inputs: { ...inputs, referenciaCliente: inputs.referenciaCliente || '' },
        result: result ? { ...result, selectedModel: null } : null // Ignoramos el modelo objeto para evitar circularidad o inconsistencias de fetch
    });
    const isDirty = lastSnapshot !== null && lastSnapshot !== currentSnapshot;

    // Inicializar snapshot por primera vez cuando los datos base se asientan
    useEffect(() => {
        if (result && lastSnapshot === null) {
            setLastSnapshot(currentSnapshot);
        }
    }, [result, lastSnapshot, currentSnapshot]);

    const handleCalculate = () => {
        // Se eliminó la alerta bloqueante para permitir actualización fluida de cálculos en tiempo real

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
            manualDemand: parseFloat(inputs.manualDemand) || 0,
            itpPercent: inputs.itpPercent !== undefined ? parseFloat(inputs.itpPercent) : 6,
            
            // Campos de Reforma
            presupuestoEnvolvente: parseFloat(inputs.presupuestoEnvolvente) || 0,
            isReforma: inputs.isReforma || false,
            reformaType: inputs.reformaType || 'none',

            // Hibridación
            hibridacion: inputs.hibridacion || false,
            potenciaBomba: parseFloat(inputs.potenciaBomba) || 12,

            // Campos de Mejora Estimada
            reformaVentanas: !!inputs.reformaVentanas,
            reformaCubierta: !!inputs.reformaCubierta,
            reformaSuelo: !!inputs.reformaSuelo,
            reformaParedes: !!inputs.reformaParedes,
            boilerAcsType: inputs.boilerAcsType || '',
            boilerHeatingType: inputs.boilerHeatingType || '',
            insulationState: inputs.insulationState || 'sin_aislamiento',

            // Sanitización Emisiones Manuales
            manualEmisionesAcsInicial: parseFloat(inputs.manualEmisionesAcsInicial) || 0,
            manualEmisionesAcsFinal: parseFloat(inputs.manualEmisionesAcsFinal) || 0,
            manualEmisionesCalefaccionInicial: parseFloat(inputs.manualEmisionesCalefaccionInicial) || 0,
            manualEmisionesCalefaccionFinal: parseFloat(inputs.manualEmisionesCalefaccionFinal) || 0,
            manualEmisionesRefrigeracionInicial: parseFloat(inputs.manualEmisionesRefrigeracionInicial) || 0,
            manualEmisionesRefrigeracionFinal: parseFloat(inputs.manualEmisionesRefrigeracionFinal) || 0,
        };

        // 1. Calcular Demanda
        let demandRes;
        const currentDemandMode = inputs.demandMode || 'estimated';

        if (currentDemandMode === 'real' && inputs.xmlDemandData?.demandaCalefaccion) {
            // Modo REAL: usar la demanda del XML (kWh/m²·año) × superficie calefactable
            const xmlDemandTotal = inputs.xmlDemandData.demandaCalefaccion * sanitizedInputs.superficieCalefactable;
            demandRes = {
                Q_net: xmlDemandTotal,
                q_net: inputs.xmlDemandData.demandaCalefaccion,
                fromXml: true
            };
        } else if (currentDemandMode === 'manual') {
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

        // 1.5 Cálculo de Hibridación (necesario para corregir ahorros)
        const hybridizationRes = sanitizedInputs.hibridacion ? calculateHybridization({
            demandAnnual: demandRes.Q_net,
            zone: sanitizedInputs.zona,
            heatPumpPower: sanitizedInputs.potenciaBomba
        }) : null;
        const cb = hybridizationRes?.cb ?? 1.0;

        // 2. Calcular Ahorro
        const savingsRes = calculateSavings({
            q_net_heating: demandRes.Q_net,
            dacs: sanitizedInputs.dacs,
            boilerEff: sanitizedInputs.boilerEff,
            scopHeating: sanitizedInputs.scopHeating,
            scopAcs: sanitizedInputs.scopAcs,
            changeAcs: sanitizedInputs.changeAcs,
            cb: cb
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
            legalizationPrice: sanitizedInputs.legalizationPrice,
            itpPercent: sanitizedInputs.itpPercent,
            includeIrpf: inputs.includeIrpf,
            titularType: inputs.titularType || 'particular',
            aplicarIrpfCae: inputs.aplicarIrpfCae === true || inputs.aplicarIrpfCae === 'true' || inputs.aplicarIrpfCae === undefined
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
                changeACS: sanitizedInputs.changeAcs,
                cb: cb
            });
        }

        // 5. Cálculo de Amortización
        const paybackRes = calculatePayback({
            presupuesto: sanitizedInputs.presupuesto,
            totalAyuda: financialRes.totalAyuda,
            ahorroAnual: annualSavingsRes.ahorroAnual
        });

        // ============================================
        // CÁLCULO RES080 (Opción 2 y 3)
        // ============================================
        let res080Data = null;
        let financialsRes080 = null;
        
        // LÓGICA DE CÁLCULO RES080
        if (inputs.isReforma && inputs.reformaType !== 'none') {
            if (inputs.demandMode === 'real') {
                // MODO REAL: Siempre usar lógica XML si el archivo final está cargado
                if (inputs.xmlDemandDataFinal) {
                    res080Data = calculateRes080({
                        xmlInicial: inputs.xmlDemandData,
                        xmlFinal: inputs.xmlDemandDataFinal,
                        scopAcs: sanitizedInputs.scopAcs,
                        scopHeating: sanitizedInputs.scopHeating,
                        combAcsInicial: inputs.combustibleAcsInicial,
                        combAcsFinal: inputs.combustibleAcsFinal,
                        combCalefaccionInicial: inputs.combustibleCalefaccionInicial,
                        combCalefaccionFinal: inputs.combustibleCalefaccionFinal,
                        combRefrigeracionInicial: inputs.combustibleRefrigeracionInicial,
                        combRefrigeracionFinal: inputs.combustibleRefrigeracionFinal,
                        superficieCustom: sanitizedInputs.superficieCalefactable
                    });
                }
            } else if (inputs.reformaType === 'estimated' || (inputs.demandMode === 'manual' && inputs.isReforma)) {
                // MODO ESTIMATIVO MANUAL O CEE APORTADO
                // El CEE aportado usa el mismo motor pero inyectando la demanda manual real en vez de calcularla
                res080Data = calculateRes080Estimated({
                    ...sanitizedInputs,
                    manualDemandOverride: inputs.demandMode === 'manual' ? sanitizedInputs.manualDemand : undefined
                });
            } else if (inputs.xmlDemandDataFinal) {
                // MODO XML TRADICIONAL (para reformaType 'both' o 'onlyReforma')
                res080Data = calculateRes080({
                    xmlInicial: inputs.xmlDemandData,
                    xmlFinal: inputs.xmlDemandDataFinal,
                    scopAcs: sanitizedInputs.scopAcs,
                    scopHeating: sanitizedInputs.scopHeating,
                    combAcsInicial: inputs.combustibleAcsInicial,
                    combAcsFinal: inputs.combustibleAcsFinal,
                    combCalefaccionInicial: inputs.combustibleCalefaccionInicial,
                    combCalefaccionFinal: inputs.combustibleCalefaccionFinal,
                    combRefrigeracionInicial: inputs.combustibleRefrigeracionInicial,
                    combRefrigeracionFinal: inputs.combustibleRefrigeracionFinal,
                    superficieCustom: sanitizedInputs.superficieCalefactable
                });
            }
        }

        if (res080Data) {
            financialsRes080 = calculateFinancials({
                presupuesto: sanitizedInputs.presupuesto + (sanitizedInputs.isReforma ? sanitizedInputs.presupuestoEnvolvente : 0),
                savingsKwh: res080Data.ahorroEnergiaFinalTotal,
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
                legalizationPrice: sanitizedInputs.legalizationPrice,
                itpPercent: sanitizedInputs.itpPercent,
                includeIrpf: inputs.includeIrpf,
                titularType: inputs.titularType || 'particular',
                aplicarIrpfCae: inputs.aplicarIrpfCae === true || inputs.aplicarIrpfCae === 'true' || inputs.aplicarIrpfCae === undefined
            });
        }

        // 6. Información del modelo seleccionado
        const modelId = sanitizedInputs.aerothermiaModel;
        let selectedModel = dbModels.find(m => String(m.id) === String(modelId));
        if (!selectedModel) selectedModel = AEROTHERMIA_MODELS.find(m => m.id === modelId);

        // Combinar resultados
        setResult({
            ...demandRes,
            savings: savingsRes,
            financials: financialRes,
            annualSavings: annualSavingsRes,
            payback: paybackRes,
            res080: res080Data,
            financialsRes080: financialsRes080,
            includeAnnualSavings: inputs.includeAnnualSavings,
            discountCertificates: inputs.discountCertificates,
            discountLegalization: inputs.discountLegalization,
            selectedModel: selectedModel && modelId !== 'custom' ? {
                marca: selectedModel.marca,
                modelo: selectedModel.modelo_comercial || selectedModel.label,
                id: modelId,
                potencia: selectedModel.potencia_calefaccion || selectedModel.potencia_nominal_35 || 0
            } : null,
            hybridization: hybridizationRes
        });
    };

    return (
        <div className={`animate-fade-in text-white ${result?.financials?.caeBonus !== undefined ? 'pt-32 md:pt-28' : ''}`}>
            {/* Sticky Bono Badge */}
            {result?.financials?.caeBonus !== undefined && (() => {
                const showDual = inputs.isReforma && result.financialsRes080;
                const showOnlyReforma = showDual && inputs?.comparativaReforma === false;
                const fmt = (n) => new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
                const currentFinancials = showOnlyReforma ? result.financialsRes080 : result.financials;
                return (
                <div className="fixed bottom-0 md:bottom-auto md:top-0 left-0 right-0 z-[100] p-2 md:p-4 flex justify-center pointer-events-none">
                    <div className="w-full max-w-4xl bg-[#0a0a0a]/90 backdrop-blur-2xl border border-white/10 rounded-[2rem] p-1.5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-stretch pointer-events-auto transform transition-all duration-500 ring-1 ring-white/5 mx-auto">
                        <div className="flex flex-1 items-center justify-between px-2 py-1 gap-2">
                             {/* Card 1: Bono Aerotermia (RES060) */}
                             {!showOnlyReforma && (
                                 <div className={`flex-1 ${showDual ? 'bg-amber-500/10 border-amber-500/20' : 'bg-white/[0.03] border-white/[0.05]'} rounded-2xl p-3 flex flex-col items-center justify-center min-w-[120px] transition-all`}>
                                <span className={`text-2xl md:text-4xl font-black tracking-tighter ${showDual ? 'text-amber-400' : 'text-white'} drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]`}>
                                    {fmt(result.financials.caeBonus)}
                                    <span className={`${showDual ? 'text-amber-400/60' : 'text-brand'} ml-1`}>€</span>
                                </span>
                                <span className={`text-[9px] font-black ${showDual ? 'text-amber-400/60' : 'text-brand'} uppercase tracking-[0.2em] mt-1 opacity-80`}>
                                    {showDual ? 'Bono Aero' : 'Bono Energético CAE'}
                                </span>
                             </div>
                             )}

                             {/* Card 1.5: Bono Integral (RES080) - SOLO SI HAY REFORMA */}
                             {showDual && (
                                <div className={`flex-1 bg-cyan-500/10 border border-cyan-500/20 rounded-2xl p-3 flex flex-col items-center justify-center min-w-[120px] transition-all ${showOnlyReforma ? 'scale-105 ring-1 ring-cyan-400/50' : ''}`}>
                                    <span className="text-2xl md:text-3xl font-black tracking-tighter text-cyan-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.3)]">
                                        {fmt(result.financialsRes080.caeBonus)}
                                        <span className="text-cyan-400/60 ml-1">€</span>
                                    </span>
                                    <span className="text-[9px] font-black text-cyan-400/60 uppercase tracking-[0.2em] mt-1 opacity-80">
                                        {showOnlyReforma ? 'Bono Energético Reforma CAE' : 'Bono Reforma'}
                                    </span>
                                 </div>
                             )}

                             {/* Card 2: Beneficio (Solo ADMIN) */}
                             {showBrokergy && currentFinancials.profitBrokergy !== undefined && (
                                <div className="flex-1 bg-emerald-500/[0.03] border border-emerald-500/10 rounded-2xl p-3 flex flex-col items-center justify-center min-w-[120px]">
                                    <span className="text-2xl md:text-3xl font-black tracking-tighter text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                                        {new Intl.NumberFormat('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(currentFinancials.profitBrokergy)}
                                        <span className="text-emerald-500/60 ml-1">€</span>
                                    </span>
                                    <span className="text-[9px] font-black text-emerald-500/60 uppercase tracking-[0.2em] mt-1">Beneficio</span>
                                </div>
                             )}

                              {/* Card 3: Demanda (Solo ADMIN) */}
                              {showBrokergy && (
                                 <div className="flex-1 bg-indigo-500/[0.03] border border-indigo-500/10 rounded-2xl p-3 flex flex-col items-center justify-center min-w-[120px]">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl md:text-3xl font-black tracking-tighter text-indigo-400 drop-shadow-[0_0_15px_rgba(129,140,248,0.3)]">
                                            {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(result.q_net)}
                                        </span>
                                        <span className="text-[10px] font-black text-indigo-400/50 uppercase tracking-tighter">kWh/m²</span>
                                    </div>
                                    <span className="text-[9px] font-black text-indigo-500/30 uppercase tracking-[0.2em] mt-1.5">Demanda Calefacción</span>
                                 </div>
                              )}

                              {/* Card 4: Ahorro (Solo ADMIN) */}
                              {showBrokergy && (
                                 <div className="flex-1 bg-white/[0.03] border border-white/[0.1] rounded-2xl p-3 flex flex-col items-center justify-center min-w-[120px]">
                                    <div className="flex items-baseline gap-1.5">
                                        <span className="text-2xl md:text-3xl font-black tracking-tighter text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                                            {new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(result.savings.savingsKwh / 1000)}
                                        </span>
                                        <span className="text-[10px] font-black text-white/40 uppercase tracking-tighter">MWh/año</span>
                                    </div>
                                    <span className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mt-1.5">Ahorro Aerotermia</span>
                                 </div>
                              )}
                        </div>
                    </div>
                </div>
                );
            })()}
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
                    {inputs.id_oportunidad && (
                        <div className="flex items-center gap-2">
                            <span className="px-3 py-1 bg-brand/10 rounded-full border border-brand/20 text-[10px] font-mono text-brand font-bold uppercase tracking-widest">
                                ID: {inputs.id_oportunidad}
                            </span>
                            {associatedExpediente && (
                                user?.rol?.toUpperCase() === 'ADMIN' ? (
                                    <button
                                        onClick={() => onNavigate('expedientes', { expediente_id: associatedExpediente.id })}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 rounded-full text-[9px] font-black text-indigo-400 uppercase tracking-widest transition-all"
                                        title={`Ir al expediente ${associatedExpediente.numero_expediente}`}
                                    >
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        {associatedExpediente.numero_expediente}
                                    </button>
                                ) : (
                                    <span className="flex items-center gap-1.5 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-[9px] font-black text-indigo-400 uppercase tracking-widest">
                                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        {associatedExpediente.numero_expediente}
                                    </span>
                                )
                            )}

                        </div>
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
                        dbModels={dbModels}
                    />
                </div>

                {/* Columna Derecha: Resultados */}
                <div className="lg:col-span-5">
                    <ResultsPanel 
                        result={result} 
                        inputs={inputs} 
                        onInputChange={setInputs} 
                        showBrokergy={showBrokergy} 
                        onAcceptOpportunity={['ENVIADA', 'PTE ENVIAR'].includes(inputs.estado?.toUpperCase()) && !associatedExpediente ? () => {
                            setManualExpNumber('');
                            setIsManualMode(false);
                            setAcceptError(null);
                            setShowAcceptModal(true);
                        } : null}
                    />
                </div>
            </div>

            {/* Accept Opportunity Modal */}
            {showAcceptModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in shadow-2xl">
                    <div className="bg-bkg-deep border border-emerald-500/30 rounded-[2rem] w-full max-w-sm overflow-hidden shadow-[0_30px_100px_rgba(0,0,0,0.8)] relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-emerald-500 to-emerald-700"></div>
                        
                        <div className="p-8">
                            <div className="flex justify-center mb-6">
                                <div className="w-16 h-16 bg-emerald-500/20 rounded-2xl flex items-center justify-center border border-emerald-500/30 shadow-[0_0_30px_rgba(16,185,129,0.1)]">
                                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                            </div>

                            <h3 className="text-xl font-black text-center text-white uppercase tracking-tight mb-2">Aceptar Oportunidad</h3>
                            <p className="text-white/40 text-center text-[11px] mb-8 leading-relaxed uppercase font-bold tracking-widest">
                                Confirmar conversión a expediente técnico
                            </p>

                            <div className="space-y-6">
                                {/* Selector de Modo */}
                                <div className="flex p-1 bg-white/5 rounded-xl border border-white/5">
                                    <button 
                                        onClick={() => setIsManualMode(false)}
                                        className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${!isManualMode ? 'bg-emerald-600 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}
                                    >
                                        Auto-Generar
                                    </button>
                                    <button 
                                        onClick={() => setIsManualMode(true)}
                                        className={`flex-1 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${isManualMode ? 'bg-brand text-bkg-deep shadow-lg' : 'text-white/40 hover:text-white'}`}
                                    >
                                        Manual
                                    </button>
                                </div>

                                {isManualMode ? (
                                    <div className="animate-slide-up">
                                        <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 ml-1">Número de Expediente</label>
                                        <input 
                                            autoFocus
                                            type="text"
                                            value={manualExpNumber}
                                            onChange={e => setManualExpNumber(e.target.value.toUpperCase())}
                                            placeholder="EJ: 24RES060_999"
                                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-brand transition-all font-mono text-sm placeholder:text-white/10"
                                        />
                                    </div>
                                ) : (
                                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-4 animate-slide-up">
                                        <p className="text-[9px] text-emerald-400/80 leading-relaxed font-black uppercase tracking-widest text-center">
                                            Se asignará el siguiente correlativo oficial {new Date().getFullYear().toString().slice(-2)}{inputs.isReforma ? 'RES080' : (inputs.hibridacion ? 'RES093' : 'RES060')}_...
                                        </p>
                                    </div>
                                )}

                                {acceptError && (
                                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-[10px] font-bold text-center animate-shake">
                                        {acceptError}
                                    </div>
                                )}

                                <div className="flex flex-col gap-3 pt-4">
                                    <button 
                                        disabled={acceptLoading || (isManualMode && !manualExpNumber.trim())}
                                        onClick={async () => {
                                            setAcceptLoading(true);
                                            setAcceptError(null);
                                            try {
                                                // 1. Si es manual, validar duplicados en frontend rápido antes de ir al back
                                                if (isManualMode) {
                                                    const { data: allExpedientes } = await axios.get('/api/expedientes');
                                                    const exists = (allExpedientes || []).some(e => e.numero_expediente === manualExpNumber.trim());
                                                    if (exists) {
                                                        throw new Error(`El número ${manualExpNumber} ya está en uso. Por favor, introduce uno diferente.`);
                                                    }
                                                }

                                                // 2. Crear expediente (el backend ahora soporta numero_expediente)
                                                const res = await axios.post('/api/expedientes', {
                                                    oportunidad_id: inputs.id_uuid,
                                                    cliente_id: inputs.cliente_id,
                                                    numero_expediente: isManualMode ? manualExpNumber.trim() : null
                                                });

                                                // 3. Actualizar estado e ID de la oportunidad localmente
                                                const acceptedExp = res.data;
                                                setInputs(prev => ({ 
                                                    ...prev, 
                                                    estado: 'ACEPTADA',
                                                    referenciaCliente: acceptedExp.referencia_cliente || prev.referenciaCliente
                                                }));
                                                setAssociatedExpediente(acceptedExp);
                                                setShowAcceptModal(false);
                                            } catch (err) {
                                                setAcceptError(err.response?.data?.error || err.message || 'Error al procesar la aceptación');
                                            } finally {
                                                setAcceptLoading(false);
                                            }
                                        }}
                                        className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-[0.2em] rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-30 flex items-center justify-center gap-2"
                                    >
                                        {acceptLoading ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                </svg>
                                                Procesando...
                                            </>
                                        ) : 'Confirmar Aceptación'}
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => setShowAcceptModal(false)}
                                        className="w-full py-3 text-white/20 hover:text-white/40 text-[9px] font-black uppercase tracking-[0.3em] transition-all"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
