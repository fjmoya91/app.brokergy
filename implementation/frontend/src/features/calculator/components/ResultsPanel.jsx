import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import html2canvas from 'html2canvas';
import { SectionCard, Divider, Input, Label } from './UIComponents';
import { SummaryTable } from './SummaryTable';
import { AerotermiaModal } from './AerotermiaModal';
import { ProposalModal } from './ProposalModal';
import { SaveOpportunityModal } from './SaveOpportunityModal';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';
import { generateBrokergyReport } from '../logic/pdfGenerator';
import { calculateSavings, calculateFinancials, calculateRes080FromEmissions, calculateRes080Estimated, getFactorPaso } from '../logic/calculation';
import { PROVINCE_CLIMATE_MAP } from '../data/provinceMapping';
import { EfficiencyTable } from './EfficiencyTable';
import ComparativaCeeModal from '../../cee/ComparativaCeeModal';
import CeeUploadModal from '../../cee/CeeUploadModal';
import { ceeToColumn } from '../logic/ceeSeed';
import { computeCeeComparison } from '../logic/ceeComparison';
import realCasesData from '../data/real_cases_db.json';
import { DocsAdminModal } from './DocsAdminModal';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import { HistorialModal } from '../../../components/HistorialModal';

const formatNumber = (val, decimals = null) => {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (num === null || num === undefined || isNaN(num)) return '0';

    // Si no se especifica, usamos 2 para no redondos, 0 para redondos
    let d = decimals;
    if (d === null) {
        d = (num % 1 === 0) ? 0 : 2;
    }

    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: true
    }).format(num);
};

const formatCurrency = (value) => {
    const num = typeof value === 'number' ? value : parseFloat(value) || 0;
    const d = (num % 1 === 0) ? 0 : 2;
    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
        useGrouping: true
    }).format(num) + ' €';
};

function ComparativeAnalysisModal({ isOpen, onClose, inputs, currentResult }) {
    if (!isOpen) return null;

    const relevantCases = React.useMemo(() => {
        return realCasesData.filter(c => {
            if (c.zonaClimatica !== inputs.zona) return false;
            const mapType = (t) => t === 'piso' ? 'ViviendaIndividualEnBloque' : 'ViviendaUnifamiliar';
            const targetType = mapType(inputs.tipo);
            if (c.tipo && c.tipo !== targetType && c.tipo !== 'Desconocido') return false;
            if (Math.abs(c.anoConstruccion - inputs.anio) > 20) return false;
            const diffSurf = Math.abs(c.superficie - inputs.superficie);
            return (diffSurf / inputs.superficie) <= 0.5;
        });
    }, [inputs]);

    const stats = React.useMemo(() => {
        const demands = relevantCases.map(c => c.demandaCalefaccion).filter(d => d > 0 && d < 1000);
        if (demands.length === 0) return null;

        const sum = demands.reduce((a, b) => a + b, 0);
        const avgDemand = sum / demands.length;
        const minDemand = Math.min(...demands);
        const maxDemand = Math.max(...demands);

        const getCaeBonusForDemand = (qNetHeating) => {
            const s = calculateSavings({
                q_net_heating: qNetHeating * inputs.superficie,
                dacs: inputs.dacs,
                boilerEff: inputs.boilerEff,
                scopHeating: inputs.scopHeating,
                scopAcs: inputs.scopAcs,
                changeAcs: inputs.changeAcs
            });
            const f = calculateFinancials({
                presupuesto: inputs.presupuesto,
                savingsKwh: s.savingsKwh,
                caePriceClient: inputs.caePriceClient,
                caePriceSO: inputs.caePriceSO,
                caePricePrescriptor: inputs.caePricePrescriptor,
                prescriptorMode: inputs.prescriptorMode,
                tipo: inputs.tipo
            });
            return f.caeBonus;
        };

        return {
            avg: getCaeBonusForDemand(avgDemand),
            min: getCaeBonusForDemand(minDemand),
            max: getCaeBonusForDemand(maxDemand),
            count: demands.length,
            current: currentResult.financials.caeBonus,
            currentRes080: currentResult.financialsRes080?.caeBonus || null
        };
    }, [relevantCases, inputs, currentResult]);

    const formatNum = (n) => formatNumber(n);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={onClose}
        >
            <div
                className={`bg-slate-900/95 rounded-2xl ${stats.currentRes080 ? 'max-w-4xl' : 'max-w-lg'} w-full p-8 border border-amber-500/30 shadow-2xl relative overflow-hidden`}
                onClick={e => e.stopPropagation()}
            >
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-[80px] pointer-events-none"></div>

                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClose(); }}
                    className="absolute top-6 right-6 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-all z-[210] cursor-pointer"
                >
                    <svg className="w-6 h-6 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>

                <div className="relative z-10">
                    <h3 className="text-2xl font-black text-white mb-1 flex items-center gap-3">
                        <span className="text-amber-400 text-3xl">⚡</span>
                        BONO ENERGÉTICO: COMPARATIVA
                    </h3>
                    <p className="text-xs text-slate-400 mb-8 uppercase tracking-[0.2em] font-bold">Análisis basado en {realCasesData.length} certificados reales</p>

                    {stats ? (
                        <div className="space-y-8">
                            <div className="p-5 bg-white/5 rounded-2xl border border-white/10 flex flex-col gap-3">
                                <p className="text-xs text-slate-500 uppercase font-black">Contexto de la muestra</p>
                                <div className="flex gap-2 flex-wrap">
                                    <span className="px-3 py-1 bg-slate-800 text-[10px] text-slate-300 rounded-full border border-slate-700">ZONA {inputs.zona}</span>
                                    <span className="px-3 py-1 bg-slate-800 text-[10px] text-slate-300 rounded-full border border-slate-700">~ {inputs.anio}</span>
                                    <span className="px-3 py-1 bg-slate-800 text-[10px] text-slate-300 rounded-full border border-slate-700">VIVIENDA {inputs.tipo.toUpperCase()}</span>
                                    <span className="px-3 py-1 bg-amber-500/20 text-[10px] text-amber-200 rounded-full border border-amber-500/30 font-black">{stats.count} CASOS SIMILARES</span>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="flex justify-between items-end">
                                    <span className="text-xs text-slate-400 font-bold uppercase">Ayuda Media en zona</span>
                                    <span className="text-xl font-mono text-white font-black">{formatNum(stats.avg)} €</span>
                                </div>
                                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden relative border border-white/5">
                                    <div className="bg-slate-600 h-full w-full opacity-30"></div>
                                    <div className="absolute top-0 h-full bg-amber-500/50" style={{ left: '0%', width: '100%' }}></div>
                                    <div className="absolute top-0 h-full w-1.5 bg-white shadow-[0_0_10px_white] transition-all duration-1000" style={{ left: `${Math.min(98, (stats.current / (stats.max || 1)) * 100)}%` }}></div>
                                </div>
                                <div className="flex justify-between text-[10px] text-slate-500 font-bold">
                                    <span>POTENCIAL MÍN: {formatNum(stats.min)} €</span>
                                    <span>POTENCIAL MÁX: {formatNum(stats.max)} €</span>
                                </div>
                            </div>

                            <div className={`grid grid-cols-1 ${stats.currentRes080 ? 'md:grid-cols-2' : ''} gap-6`}>
                                <div className="p-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-xl shadow-amber-500/10 ring-1 ring-white/20 text-center flex flex-col justify-between">
                                    <div>
                                        <p className="text-[10px] font-black text-slate-900/60 uppercase tracking-widest mb-3">
                                            {stats.currentRes080 ? 'SOLO AEROTERMIA (RES060)' : 'BONO ENERGÉTICO CAE BROKERGY'}
                                        </p>
                                        <div className="flex items-baseline justify-center gap-2">
                                            <span className="text-6xl font-black text-slate-900 tracking-tighter">{formatNum(stats.current)}</span>
                                            <span className="text-2xl font-black text-slate-900/60">€</span>
                                        </div>
                                    </div>
                                    <div className="mt-6 pt-4 border-t border-slate-900/10 text-slate-900/80 text-[11px] font-bold leading-relaxed">
                                        Subvención por sustitución directa de caldera.
                                    </div>
                                </div>

                                {stats.currentRes080 && (
                                    <div className="p-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-2xl shadow-xl shadow-cyan-500/10 ring-1 ring-white/20 text-center flex flex-col justify-between">
                                        <div>
                                            <p className="text-[10px] font-black text-white/60 uppercase tracking-widest mb-3">REFORMA INTEGRAL (RES080)</p>
                                            <div className="flex items-baseline justify-center gap-2">
                                                <span className="text-6xl font-black text-white tracking-tighter">{formatNum(stats.currentRes080)}</span>
                                                <span className="text-2xl font-black text-white/60">€</span>
                                            </div>
                                        </div>
                                        <div className="mt-6 pt-4 border-t border-white/10 text-white/80 text-[11px] font-bold leading-relaxed">
                                            Subvención máxima combinando Aerotermia y mejoras en la Envolvente.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-16">
                            <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                                <span className="text-3xl">🔍</span>
                            </div>
                            <p className="text-slate-300 font-bold">Sin referencias suficientes</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ResultCard({ title, value, unit, subtext, color = 'cyan' }) {
    const colorClasses = {
        cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
        green: 'text-green-400 bg-green-500/10 border-green-500/20',
        amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    };

    const cls = colorClasses[color] || colorClasses.cyan;

    return (
        <div className={`p-4 rounded-xl border h-full flex flex-col justify-between overflow-hidden ${cls}`}>
            <div className="mb-2">
                <p className="text-[9px] font-black uppercase tracking-widest opacity-60 leading-tight">
                    {title}
                </p>
            </div>
            <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-2xl font-black tracking-tighter leading-none">{value}</span>
                <span className="text-[10px] font-bold opacity-60 uppercase">{unit}</span>
            </div>
            {subtext && (
                <p className="text-[9px] mt-2 opacity-60 font-medium uppercase tracking-wider">
                    {subtext}
                </p>
            )}
        </div>
    );
}

export function ResultsPanel({ result, inputs, onInputChange, showBrokergy, onAcceptOpportunity, showEficiencia, setShowEficiencia, onOpenRes060FCDetail }) {
    const { user } = useAuth();
    const { showAlert } = useModal();
    const [showComparative, setShowComparative] = React.useState(false);
    const [generatingImage, setGeneratingImage] = React.useState(false);
    const [generatedImage, setGeneratedImage] = React.useState(null);
    const [showAerotermia, setShowAerotermia] = React.useState(false);
    const [showProposal, setShowProposal] = React.useState(false);
    const [showSaveOpportunity, setShowSaveOpportunity] = React.useState(false);
    // Apertura del modal de desglose: usa el estado elevado (CalculatorView) si se pasa,
    // para que tanto "Ver TABLA RES080" como "Por Emisiones" abran el mismo modal.
    const [showEfficiencyInternal, setShowEfficiencyInternal] = React.useState(false);
    const showEfficiency = showEficiencia !== undefined ? showEficiencia : showEfficiencyInternal;
    const setShowEfficiency = setShowEficiencia || setShowEfficiencyInternal;
    // Borrador editable (solo modo emisiones). Al confirmar se vuelca a inputs.
    const [emiDraft, setEmiDraft] = React.useState(null);
    const [showComparativaCee, setShowComparativaCee] = React.useState(false);
    // Carga de CEE por fichero dentro del modal de emisiones: 'inicial' | 'final' | null.
    const [ceeLoadTarget, setCeeLoadTarget] = React.useState(null);
    const isEmisionesMode = inputs?.demandMode === 'manual' && inputs?.isReforma;
    const [clienteModalOp, setClienteModalOp] = React.useState(null);
    const [clienteDetailId, setClienteDetailId] = React.useState(null);
    const [pendingAcceptance, setPendingAcceptance] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [showPdfGuard, setShowPdfGuard] = React.useState(false);
    const [showSubirFotos, setShowSubirFotos] = React.useState(false);
    const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState(null);
    const [showHistorial, setShowHistorial] = useState(false);
    // Plegado del Estudio de Viabilidad SOLO en móvil (en PC siempre visible vía md:block)
    const [showViability, setShowViability] = useState(false);
    const tableRef = useRef(null);
    // Política "guardar antes de generar": acción pendiente que se reanuda tras guardar
    // (PDF/Tabla) y bandera de si el modal de guardar terminó con éxito.
    const pendingActionRef = useRef(null);
    const didSaveRef = useRef(false);

    // Mostrar un número con coma decimal (ES). Cadena vacía si no hay valor.
    const toCommaStr = (v) => {
        if (v === '' || v === null || v === undefined) return '';
        return String(v).replace('.', ',');
    };

    // Al abrir el modal en modo emisiones, sembrar el borrador desde los inputs actuales
    // (con coma decimal para que se muestre "14,35" y no "14.35").
    React.useEffect(() => {
        if (showEfficiency && isEmisionesMode) {
            const supBase = inputs.superficieCalefactable || inputs.superficie || '';
            setEmiDraft({
                emi: {
                    acsIni: toCommaStr(inputs.manualEmisionesAcsInicial), acsFin: toCommaStr(inputs.manualEmisionesAcsFinal),
                    calIni: toCommaStr(inputs.manualEmisionesCalefaccionInicial), calFin: toCommaStr(inputs.manualEmisionesCalefaccionFinal),
                    refIni: toCommaStr(inputs.manualEmisionesRefrigeracionInicial), refFin: toCommaStr(inputs.manualEmisionesRefrigeracionFinal),
                },
                comb: {
                    acsIni: inputs.combustibleAcsInicial, acsFin: inputs.combustibleAcsFinal,
                    calIni: inputs.combustibleCalefaccionInicial, calFin: inputs.combustibleCalefaccionFinal,
                    // Refrigeración siempre eléctrica en ES: si viene vacía, electricidad.
                    refIni: inputs.combustibleRefrigeracionInicial || 'Electricidad peninsular',
                    refFin: inputs.combustibleRefrigeracionFinal || 'Electricidad peninsular',
                },
                supIni: toCommaStr(inputs.manualSupInicial || supBase),
                supFin: toCommaStr(inputs.manualSupFinal || inputs.manualSupInicial || supBase),
                // Datos para estimar el CEE FINAL (demanda del CEE inicial + SCOP de la aerotermia).
                est: {
                    demCal: toCommaStr(inputs.manualDemand || ''),
                    demAcs: toCommaStr(inputs.manualDemandAcs || 8.8),
                    scopCal: toCommaStr(inputs.scopHeating || ''),
                    scopAcs: toCommaStr(inputs.scopAcs || ''),
                },
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showEfficiency]);

    // Parse tolerante a coma decimal ("10,67" → 10.67) al volcar el borrador a inputs.
    const toNumEmi = (v) => {
        if (typeof v === 'number') return isNaN(v) ? 0 : v;
        if (v === null || v === undefined || v === '') return 0;
        let s = String(v).trim();
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(s);
        return isNaN(n) ? 0 : n;
    };
    // Normaliza lo tecleado para mostrar coma (convierte un punto decimal en coma).
    const normComma = (s) => (s.includes(',') ? s : s.replace('.', ','));

    // Estima la columna FINAL del CEE cuando aún no tenemos el CEE final:
    // consumo_final = demanda / SCOP (aerotermia) ; emisiones = consumo · factor_electricidad.
    // ACS: si NO se cambia, se mantiene la del CEE inicial. Refrigeración: se mantiene la inicial.
    const estimarFinal = () => {
        const changeAcs = inputs?.changeAcs || inputs?.incluir_acs;
        const fElec = getFactorPaso('Electricidad peninsular'); // 0.331
        const r2 = (n) => Math.round(n * 100) / 100;
        setEmiDraft(d => {
            const est = d.est || {};
            const demCal = toNumEmi(est.demCal);
            const demAcs = toNumEmi(est.demAcs);
            const scopCal = toNumEmi(est.scopCal) || 3.0;
            const scopAcs = toNumEmi(est.scopAcs) || scopCal;
            const emiCalFin = (demCal / scopCal) * fElec;
            const emiAcsFin = changeAcs ? (demAcs / scopAcs) * fElec : null;
            return {
                ...d,
                comb: {
                    ...d.comb,
                    calFin: 'Electricidad peninsular',
                    acsFin: changeAcs ? 'Electricidad peninsular' : d.comb.acsIni,
                    refFin: d.comb.refIni,
                },
                emi: {
                    ...d.emi,
                    calFin: toCommaStr(r2(emiCalFin)),
                    // ACS: estimada si se cambia; si no, igual que el inicial
                    acsFin: changeAcs ? toCommaStr(r2(emiAcsFin)) : d.emi.acsIni,
                    // Refrigeración: se mantiene la inicial
                    refFin: d.emi.refIni,
                },
            };
        });
    };

    // Vuelca un CEE cargado por fichero (XML/OCR) a la columna INICIAL o FINAL del borrador.
    // No pisa la otra columna: "cargar CEE final real" mantiene el CEE inicial aportado.
    const applyCeeToColumn = (ceeData, target) => {
        const c = ceeToColumn(ceeData);
        const isFinal = target === 'final';
        setEmiDraft(d => {
            const base = d || {};
            const supStr = c.sup !== '' ? toCommaStr(c.sup) : (isFinal ? base.supFin : base.supIni);
            return {
                ...base,
                emi: {
                    ...base.emi,
                    [isFinal ? 'acsFin' : 'acsIni']: c.emiAcs !== '' ? toCommaStr(c.emiAcs) : base.emi?.[isFinal ? 'acsFin' : 'acsIni'],
                    [isFinal ? 'calFin' : 'calIni']: c.emiCal !== '' ? toCommaStr(c.emiCal) : base.emi?.[isFinal ? 'calFin' : 'calIni'],
                    [isFinal ? 'refFin' : 'refIni']: c.emiRef !== '' ? toCommaStr(c.emiRef) : base.emi?.[isFinal ? 'refFin' : 'refIni'],
                },
                comb: {
                    ...base.comb,
                    [isFinal ? 'acsFin' : 'acsIni']: c.combAcs,
                    [isFinal ? 'calFin' : 'calIni']: c.combCal,
                    [isFinal ? 'refFin' : 'refIni']: c.combRef,
                },
                [isFinal ? 'supFin' : 'supIni']: supStr,
                // La demanda del CEE inicial alimenta el estimador de FINAL (demanda/SCOP).
                est: !isFinal && c.demCal !== '' ? { ...(base.est || {}), demCal: toCommaStr(c.demCal) } : base.est,
            };
        });
    };

    const confirmEmisiones = () => {
        const d = emiDraft;
        if (!d) { setShowEfficiency(false); return; }
        const supIniNum = toNumEmi(d.supIni);
        onInputChange(prev => ({
            ...prev,
            combustibleAcsInicial: d.comb.acsIni, combustibleAcsFinal: d.comb.acsFin,
            combustibleCalefaccionInicial: d.comb.calIni, combustibleCalefaccionFinal: d.comb.calFin,
            combustibleRefrigeracionInicial: d.comb.refIni, combustibleRefrigeracionFinal: d.comb.refFin,
            manualEmisionesAcsInicial: toNumEmi(d.emi.acsIni), manualEmisionesAcsFinal: toNumEmi(d.emi.acsFin),
            manualEmisionesCalefaccionInicial: toNumEmi(d.emi.calIni), manualEmisionesCalefaccionFinal: toNumEmi(d.emi.calFin),
            manualEmisionesRefrigeracionInicial: toNumEmi(d.emi.refIni), manualEmisionesRefrigeracionFinal: toNumEmi(d.emi.refFin),
            manualSupInicial: supIniNum, manualSupFinal: toNumEmi(d.supFin),
            // La superficie INICIAL (vivienda real) sincroniza con el resto del cálculo.
            superficieCalefactable: supIniNum, superficie: supIniNum,
            manualCeeMode: 'emisiones',
        }));
        // El recálculo (presupuestos/CAE) lo dispara el useEffect([inputs]) del padre.
        setShowEfficiency(false);
    };

    // Etiquetas de IVA. Empresa/autónomo en modo "Sin IVA" => cifras netas => "(IVA NO INCLUIDO)".
    const ivaTag = (fin) => {
        const esEmpresa = fin && !fin.isParticular && fin.titularType !== 'particular';
        return (esEmpresa && !fin.includeIVA) ? '(IVA NO INCLUIDO)' : '(IVA INC.)';
    };
    // El CAE solo se rotula cuando hay IVA en juego (empresa/autónomo); en particular, sin etiqueta.
    const ivaTagCae = (fin) => {
        const esEmpresa = fin && !fin.isParticular && fin.titularType !== 'particular';
        return esEmpresa ? (fin.includeIVA ? '(IVA INC.)' : '(IVA NO INCLUIDO)') : '';
    };

    /** Detección de cambios (Dirty State) para guardar antes de PDF **/
    const getSnapshot = (inp, res) => {
        if (!inp || !res) return null;
        return JSON.stringify({
            ref: inp.referenciaCliente || '',
            id: inp.id_oportunidad || '',
            // Solo comparamos inputs clave normalizados para evitar saltos por tipos string/number
            inputs: {
                superficie: Number(inp.superficie) || 0,
                presupuesto: Number(inp.presupuesto) || 0,
                presupuestoFotovoltaica: Number(inp.presupuestoFotovoltaica) || 0,
                caePriceClient: Number(inp.caePriceClient) || 0,
                participation: Number(inp.participation) || 0,
                referencia: inp.referenciaCliente || ''
            },
            // Comparar los resultados clave (ahorro y bono) que son lo que va al PDF
            res: {
                ahorro: Math.round(res.savings?.savingsKwh || 0),
                bono: Math.round(res.financials?.caeBonus || 0)
            }
        });
    };

    // Sincronización de Snapshot inicial para detección de cambios (isDirty)
    React.useEffect(() => {
        if (result && lastSavedSnapshot === null) {
            setLastSavedSnapshot(getSnapshot(inputs, result));
        }
    }, [result, inputs, lastSavedSnapshot]);

    const currentSnapshot = getSnapshot(inputs, result);
    const isDirty = lastSavedSnapshot !== null && currentSnapshot !== null && lastSavedSnapshot !== currentSnapshot;

    // ─── Handlers ──────────────────────────────────────────────────────────────
    const handleAcceptClick = () => {
        if (!inputs.cliente_id) {
            setPendingAcceptance(true);
            setClienteModalOp({
                id_oportunidad: inputs.id_oportunidad,
                referencia_cliente: inputs.referenciaCliente,
                prescriptor_id: inputs.prescriptor_id,
                instalador_asociado_id: inputs.instalador_asociado_id,
                datos_calculo: { 
                    inputs,
                    cod_cliente_interno: inputs.cod_cliente_interno
                }
            });
        } else {
            onAcceptOpportunity();
        }
    };

    // Abrir la carpeta LOCAL de Windows de la oportunidad (solo ADMIN). Igual que en
    // el detalle de expediente: el backend reconstruye la ruta (espejo de Drive) y
    // lanzamos el protocolo brokergylocal: (abre directo, sin modal); la ruta se copia
    // al portapapeles en silencio como respaldo. Requiere brokergylocal_setup.reg.
    const [localPathLoading, setLocalPathLoading] = useState(false);
    const handleOpenLocalFolder = async () => {
        try {
            setLocalPathLoading(true);
            const { data } = await axios.get(`/api/oportunidades/${encodeURIComponent(inputs.id_oportunidad)}/local-path`);
            const path = data?.path;
            if (!path) { showAlert('No se pudo obtener la ruta local de la oportunidad.', 'Carpeta local', 'error'); return; }
            try { await navigator.clipboard.writeText(path); } catch (e) { /* contexto no seguro */ }
            const b64url = btoa(unescape(encodeURIComponent(path))).replace(/\+/g, '-').replace(/\//g, '_');
            const a = document.createElement('a');
            a.href = `brokergylocal:${b64url}`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
        } catch (err) {
            const msg = err?.response?.data?.error || 'No se pudo resolver la ruta local.';
            showAlert(msg, 'Carpeta local', 'error');
        } finally {
            setLocalPathLoading(false);
        }
    };

    const handleSuccessCliente = (cliente) => {
        onInputChange({ ...inputs, cliente_id: cliente?.id_cliente });
        setClienteModalOp(null);
        if (pendingAcceptance) {
            setPendingAcceptance(false);
            // Pequeño delay para que el modal de cliente cierre suavemente antes de abrir el de aceptación
            setTimeout(() => {
                onAcceptOpportunity();
            }, 300);
        }
    };

    if (!result) {
        return (
            <SectionCard className="h-full flex flex-col items-center justify-center text-center p-8 opacity-50">
                <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
                <h3 className="text-lg font-medium text-slate-300">Esperando cálculo...</h3>
                <p className="text-sm text-slate-500 max-w-xs mt-2">
                    Completa los datos del edificio y pulsa el botón "Calcular" para ver los resultados.
                </p>
            </SectionCard>
        );
    }

    const handleGenerateImagePopup = async () => {
        if (!tableRef.current) return;
        setGeneratingImage(true);
        try {
            const canvas = await html2canvas(tableRef.current, {
                scale: 3,
                backgroundColor: '#ffffff',
                logging: false,
                useCORS: true,
                borderRadius: 16
            });

            const dataUrl = canvas.toDataURL('image/png');
            setGeneratedImage(dataUrl);
            setCopied(false);
        } catch (error) {
            console.error('Error generating image:', error);
            alert('Error al generar la imagen de la tabla.');
        } finally {
            setGeneratingImage(false);
        }
    };

    const handleCopyToClipboard = async () => {
        if (!generatedImage) return;
        try {
            const response = await fetch(generatedImage);
            const blob = await response.blob();
            await navigator.clipboard.write([
                new ClipboardItem({ [blob.type]: blob })
            ]);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy image: ', err);
            alert('No se ha podido copiar la imagen automáticamente. Prueba con clic derecho -> Copiar imagen.');
        }
    };

    const handleDownloadImage = () => {
        if (!generatedImage) return;
        const link = document.createElement('a');
        const filename = `BROKERGY-RESUMEN AYUDAS_${inputs?.rc || 'REF'}.png`;
        link.download = filename;
        link.href = generatedImage;
        link.click();
    };

    // ─── Política: guardar la oportunidad antes de producir entregables ──────────
    const isAdmin = user?.rol?.toUpperCase() === 'ADMIN';

    // Ejecuta la acción ya validada (no comprueba guardado).
    const runAction = (action) => {
        if (action === 'pdf') setShowProposal(true);
        else if (action === 'tabla') handleGenerateImagePopup();
    };

    // Garantiza que la oportunidad quede registrada en el CRM antes de generar el
    // PDF o la Tabla (Word/Excel):
    //  - Sin id_oportunidad (nunca guardada) → obliga a guardar (sin escape).
    //  - Con cambios sin guardar (isDirty) → modal de guardia.
    // El ADMIN puede ver la TABLA libremente (tanteos rápidos) y, si la oportunidad
    // ya existe pero está "sucia", saltarse el guardado en el modal de guardia.
    // El PARTNER nunca puede saltárselo: así siempre registra la oportunidad.
    const requestAction = (action) => {
        if (isAdmin && action === 'tabla') { runAction(action); return; }
        const needsSave = !inputs.id_oportunidad || isDirty;
        if (!needsSave) { runAction(action); return; }
        pendingActionRef.current = action;
        didSaveRef.current = false;
        if (!inputs.id_oportunidad) {
            // Nunca guardada: directo a guardar, sin opción de "sin guardar".
            setShowSaveOpportunity(true);
        } else {
            // Guardada pero con cambios: modal de guardia.
            setShowPdfGuard(true);
        }
    };


    return (
        <div className="relative h-full">
            <SectionCard className="h-full flex flex-col">
                <div className="flex-1">
                    <div className="mb-6 flex justify-between items-start text-white">
                        <div>
                            <h2 className="text-2xl font-bold text-white mb-1">Resultados</h2>
                            {showBrokergy && (
                                <p className="text-sm text-slate-400">
                                    {result?.fromXml ? 'Demanda real (desde certificado CEE)' : 'Estimación de demanda de calefacción'}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            {inputs?.drive_folder_link && user?.rol?.toUpperCase() === 'ADMIN' && (
                                <button
                                    type="button"
                                    onClick={handleOpenLocalFolder}
                                    disabled={localPathLoading}
                                    className="p-2 mr-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all hover:scale-110 active:scale-90 disabled:opacity-50 disabled:cursor-wait"
                                    title="Abrir la carpeta local en el Explorador de Windows"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13l2 2 4-4" />
                                    </svg>
                                </button>
                            )}

                            {inputs?.drive_folder_link && user?.rol?.toUpperCase() === 'ADMIN' && (
                                <a
                                    href={inputs.drive_folder_link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-2 mr-1 rounded-full bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20 transition-all hover:scale-110 active:scale-90"
                                    title="Abrir carpeta en Google Drive"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                </a>
                            )}
                            
                            {/* Botón Aceptar junto a Drive */}
                            {onAcceptOpportunity && (
                                <button
                                    onClick={handleAcceptClick}
                                    className="p-2 mr-1 rounded-full bg-[#10b981]/15 hover:bg-[#10b981]/25 text-[#10b981] border border-[#10b981]/30 transition-all hover:scale-110 active:scale-90 shadow-[0_0_15px_rgba(16,185,129,0.1)] flex items-center justify-center animate-pulse-slow"
                                    title="Aceptar Oportunidad"
                                >
                                    <div className="bg-[#10b981] p-1 rounded-full flex items-center justify-center">
                                        <svg className="w-3 h-3 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </button>
                            )}

                            {/* Botón Historial */}
                            {inputs.id_oportunidad && (
                                <button
                                    onClick={() => setShowHistorial(true)}
                                    className="p-2 ml-1 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all hover:scale-110 active:scale-90 shadow-lg shadow-indigo-500/10 flex items-center justify-center"
                                    title="Historial de Estados"
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                    </svg>
                                </button>
                            )}

                            {user?.rol !== 'DISTRIBUIDOR' && (
                                <button
                                    onClick={() => {
                                        if (inputs.cliente_id) {
                                            setClienteDetailId(inputs.cliente_id);
                                        } else {
                                            setClienteModalOp({
                                                id_oportunidad: inputs.id_oportunidad,
                                                referencia_cliente: inputs.referenciaCliente,
                                                prescriptor_id: inputs.prescriptor_id,
                                                instalador_asociado_id: inputs.instalador_asociado_id,
                                                datos_calculo: { 
                                                    inputs,
                                                    cod_cliente_interno: inputs.cod_cliente_interno
                                                }
                                            });
                                        }
                                    }}
                                    className={`p-2 ml-1 rounded-full transition-all hover:scale-110 active:scale-90 border shadow-lg ${inputs.cliente_id
                                        ? 'bg-amber-500/10 text-amber-500 border-amber-500/20 hover:bg-amber-500/20 shadow-amber-500/10'
                                        : 'bg-white/5 text-white/30 border-white/10 hover:bg-brand/10 hover:text-brand hover:border-brand/20'
                                        }`}
                                    title={inputs.cliente_id ? "Ver Ficha de Cliente vinculado" : "Crear Cliente desde esta Oportunidad"}
                                >
                                    {inputs.cliente_id ? (
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                                        </svg>
                                    )}
                                </button>
                            )}

                        </div>
                    </div>

                    {/* ACTION BUTTONS: Always Visible at top level */}
                    {result.financials && (() => {
                        const showRes080Button = result.res080 && (
                            inputs.demandMode === 'real' ||
                            (inputs.demandMode === 'manual' && inputs.isReforma) ||
                            // Estimado + reforma: la tabla se deriva de los datos ya
                            // introducidos (calderas, aerotermia, envolvente).
                            (inputs.isReforma && inputs.reformaType === 'estimated')
                        );
                        return (
                        <div className={`grid grid-cols-2 ${showRes080Button ? 'lg:grid-cols-5' : 'sm:grid-cols-4'} gap-2 mb-4 animate-fade-in`}>
                            <button
                                onClick={() => requestAction('tabla')}
                                disabled={generatingImage}
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl transition-all hover:scale-105 active:scale-95 group shadow-sm"
                            >
                                <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
                                    <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="block uppercase tracking-tight text-[10px] sm:text-xs font-bold leading-tight">Ver Tabla</span>
                                    <span className="block uppercase tracking-tight text-[8px] text-white/50 font-bold leading-tight">Word / Excel</span>
                                </div>
                            </button>

                            <button
                                onClick={() => requestAction('pdf')}
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/20 text-blue-400 rounded-xl transition-all hover:scale-105 active:scale-95 group shadow-sm"
                            >
                                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                                    <span className="text-lg">📄</span>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="block uppercase tracking-tight text-[10px] sm:text-xs font-bold leading-tight">Generar PDF</span>
                                    <span className="block uppercase tracking-tight text-[8px] text-blue-400/50 font-bold leading-tight">Propuesta</span>
                                </div>
                            </button>

                            <button
                                onClick={() => {
                                    if (!inputs.id_oportunidad) {
                                        setShowSaveOpportunity(true);
                                    } else {
                                        setShowSubirFotos(true);
                                    }
                                }}
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-500/20 text-purple-400 rounded-xl transition-all hover:scale-105 active:scale-95 group shadow-sm"
                            >
                                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                                    <span className="text-xl">📸</span>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="block uppercase tracking-tight text-[10px] sm:text-xs font-bold leading-tight">Subir</span>
                                    <span className="block uppercase tracking-tight text-[8px] text-purple-400/50 font-bold leading-tight">Fotos</span>
                                </div>
                            </button>

                            <button
                                onClick={() => setShowSaveOpportunity(true)}
                                className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/20 text-emerald-400 rounded-xl transition-all hover:scale-105 active:scale-95 group shadow-sm bg-gradient-to-t from-emerald-900/10"
                            >
                                <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center group-hover:bg-emerald-500/30 transition-colors">
                                    <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                    </svg>
                                </div>
                                <div className="text-center mt-1">
                                    <span className="block uppercase tracking-tight text-[10px] sm:text-xs font-bold leading-tight">Guardar</span>
                                    <span className="block uppercase tracking-tight text-[8px] text-emerald-400/50 font-bold leading-tight">Oportunidad</span>
                                </div>
                            </button>

                            {showRes080Button && (
                                <button
                                    onClick={() => setShowEfficiency(true)}
                                    className="flex flex-col items-center justify-center gap-1.5 py-3 px-2 bg-amber-600/10 hover:bg-amber-600/20 border border-amber-500/20 text-amber-400 rounded-xl transition-all hover:scale-105 active:scale-95 group shadow-sm col-span-2 sm:col-span-1"
                                >
                                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors text-xl">
                                        📊
                                    </div>
                                    <div className="text-center mt-1">
                                        <span className="block uppercase tracking-tight text-[10px] sm:text-xs font-bold leading-tight">Ver TABLA</span>
                                        <span className="block uppercase tracking-tight text-[8px] text-amber-400/50 font-bold leading-tight uppercase font-black">RES080</span>
                                    </div>
                                </button>
                            )}
                        </div>
                        );
                    })()}

                    {/* Redundant metrics removed from here as they are now in the header */}


                    {result.financials && (
                        <div className="mt-3">
                            <Divider />

                            {inputs?.cee_previo && (
                                <div className="mb-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <svg className="w-7 h-7 text-amber-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 17V7m4 10V11m4 6V4M4 21h16" /></svg>
                                        <div>
                                            <div className="text-sm font-bold text-white">Este cliente aportó un CEE inicial</div>
                                            <div className="text-xs text-white/50">Genera la comparativa "con tu CEE" vs. "CEE nuevo BROKERGY" para enviársela.</div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setShowComparativaCee(true)}
                                        className="px-5 py-2.5 rounded-xl font-bold text-black text-sm whitespace-nowrap transition-transform hover:scale-[1.03]"
                                        style={{ backgroundColor: '#FFA000' }}
                                    >
                                        Comparativa para el cliente →
                                    </button>
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={() => setShowViability(v => !v)}
                                aria-expanded={showViability}
                                className="w-full flex items-center justify-between gap-2 mb-4 text-left cursor-pointer md:cursor-default md:pointer-events-none"
                            >
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.599-1c.51-.598.51-1.402 0-2" />
                                    </svg>
                                    {showBrokergy ? 'Estudio de Viabilidad y Márgenes' : 'Simulación de Inversión y Ayudas'}
                                </h3>
                                <span className="md:hidden flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-amber-400 shrink-0">
                                    {showViability ? 'Ocultar' : 'Ver'}
                                    <svg className={`w-4 h-4 transition-transform duration-300 ${showViability ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </span>
                            </button>

                            <div className={`${showViability ? 'block' : 'hidden'} md:block`}>
                            <div className={`grid grid-cols-1 ${result.financialsRes080 && inputs?.comparativaReforma !== false ? 'xl:grid-cols-2' : ''} gap-4`}>
                                {(inputs?.reformaType !== 'onlyReforma' && (!inputs?.isReforma || inputs?.comparativaReforma !== false)) && (
                                    <div className="glass-card overflow-hidden border-slate-700/50">
                                        <div className="bg-slate-800/50 py-2 px-4 shadow-sm border-b border-white/5 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-lime-500"></div>
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Solo Aerotermia (RES060)</span>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">{result.financials.presupuestoFotovoltaica > 0 ? `Inversión Aerotermia ${ivaTag(result.financials)}` : `Coste de inversión Total ${ivaTag(result.financials)}`}</span>
                                                <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financials.presupuesto)} €</span>
                                            </div>
                                            {result.financials.presupuestoFotovoltaica > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                        <svg className="w-3.5 h-3.5 text-amber-400/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                                                        </svg>
                                                        Inversión Fotovoltaica {ivaTag(result.financials)}
                                                    </span>
                                                    <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financials.presupuestoFotovoltaica)} €</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">Ingreso Bruto: BONO ENERGÉTICO CAE {ivaTagCae(result.financials)}</span>
                                                <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.caeBonus)} €</span>
                                            </div>
                                            {result.financials.irpfCaeAmount > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-pink-500/10 gap-4 bg-pink-500/5 px-3 -mx-3 rounded-xl shadow-inner">
                                                    <div className="flex flex-col">
                                                        <span className="text-pink-300 font-medium">Retención IRPF s/ CAE (Estimado)</span>
                                                        <span className="text-[10px] text-pink-400/70 uppercase tracking-widest mt-1">Ganancia Patrimonial</span>
                                                    </div>
                                                    <span className="text-pink-400 font-mono font-bold whitespace-nowrap flex-shrink-0">-{formatNumber(result.financials.irpfCaeAmount)} €</span>
                                                </div>
                                            )}
                                            {result.financials.caeMaintenanceCost > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <span className="text-slate-400">Gestión tramitación Expediente CAE</span>
                                                    <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.caeMaintenanceCost)} €</span>
                                                </div>
                                            )}
                                            {result.financials.irpfCap > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-400">Deducción de IRPF por Obra</span>
                                                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Aplicable {result.financials.irpfRate}% (Max {formatNumber(result.financials.irpfCap)}€)</span>
                                                    </div>
                                                    <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.irpfDeduction)} €</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center p-3 bg-amber-500/10 rounded-lg">
                                                <span className="text-amber-200 font-semibold uppercase text-[11px] tracking-wider">Beneficio Fiscal Total</span>
                                                <span className="text-amber-400 font-mono font-extrabold text-lg">+{formatNumber(result.financials.totalBeneficioFiscal)} €</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-lime-500/10 rounded-lg">
                                                <span className="text-lime-200 text-xs font-semibold uppercase tracking-wider">Ahorro conseguido por BROKERGY</span>
                                                <span className="text-lime-400 font-bold text-lg">{formatNumber(result.financials.porcentajeCubierto)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/10 mt-4">
                                                <span className="text-white font-bold text-lg uppercase tracking-tight">COSTE FINAL</span>
                                                <div className="text-right">
                                                    <span className="text-3xl font-black text-white">{formatNumber(result.financials.costeFinal)} €</span>
                                                </div>
                                            </div>

                                            {result.includeAnnualSavings && result.annualSavings && (
                                                <div className="mt-6 p-4 bg-gradient-to-br from-emerald-900/30 to-cyan-900/30 rounded-xl border border-emerald-500/20">
                                                    <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                                        </svg>
                                                        Análisis de Ahorro Anual
                                                    </h4>
                                                    <div className="space-y-3 text-sm">
                                                        <div className="flex justify-between items-center py-2 border-b border-white/5 gap-4">
                                                            <span className="text-slate-400">Coste anual actual ({result.annualSavings.fuelLabel})</span>
                                                            <span className="text-red-400 font-mono font-bold whitespace-nowrap">{formatNumber(result.annualSavings.costeActual)} €/año</span>
                                                        </div>
                                                        <div className="flex justify-between items-center py-2 border-b border-white/5 gap-4">
                                                            <span className="text-slate-400">Coste anual futuro (Aerotermia)</span>
                                                            <span className="text-emerald-400 font-mono font-bold whitespace-nowrap">{formatNumber(result.annualSavings.costeNuevo)} €/año</span>
                                                        </div>
                                                        <div className="flex justify-between items-center p-3 bg-emerald-500/10 rounded-lg">
                                                            <span className="text-emerald-300 font-semibold">AHORRO ANUAL</span>
                                                            <span className="text-emerald-400 font-mono font-extrabold text-lg">{formatNumber(result.annualSavings.ahorroAnual)} €</span>
                                                        </div>
                                                    </div>
                                                    {result.payback && (
                                                        <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4 text-center">
                                                            <div>
                                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Inversión Neta</p>
                                                                <p className="text-xl font-bold text-white">{formatNumber(result.payback.inversionNeta)} €</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] text-slate-500 uppercase tracking-wider">Amortización</p>
                                                                <p className="text-xl font-bold text-cyan-400">
                                                                    {result.payback.paybackYears < 100 ? `${formatNumber(result.payback.paybackYears)} años` : '∞'}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {result.financialsRes080 && (
                                    <div className="glass-card overflow-hidden border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                                        <div className="bg-cyan-900/40 py-2 px-4 shadow-sm border-b border-cyan-500/20 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-cyan-400"></div>
                                            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400">
                                                {inputs.isReforma ? "Reforma Integral (RES080)" : "Tanteo Energético (CEE)"}
                                            </span>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400">Coste de inversión Total {ivaTag(result.financialsRes080)}</span>
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
                                                        Aero: {formatNumber(inputs.presupuesto)}€ + Ref: {formatNumber(inputs.presupuestoEnvolvente)}€{result.financialsRes080.presupuestoFotovoltaica > 0 ? ` + FV: ${formatNumber(result.financialsRes080.presupuestoFotovoltaica)}€` : ''}
                                                    </span>
                                                </div>
                                                <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financialsRes080.presupuestoTotal)} €</span>
                                            </div>
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">Ingreso Bruto: BONO ENERGÉTICO CAE {ivaTagCae(result.financialsRes080)}</span>
                                                <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financialsRes080.caeBonus)} €</span>
                                            </div>
                                            {result.financialsRes080.irpfCaeAmount > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-pink-500/10 gap-4 bg-pink-500/5 px-3 -mx-3 rounded-xl shadow-inner">
                                                    <div className="flex flex-col">
                                                        <span className="text-pink-300 font-medium">Retención IRPF s/ CAE (Estimado)</span>
                                                        <span className="text-[10px] text-pink-400/70 uppercase tracking-widest mt-1">Ganancia Patrimonial</span>
                                                    </div>
                                                    <span className="text-pink-400 font-mono font-bold whitespace-nowrap flex-shrink-0">-{formatNumber(result.financialsRes080.irpfCaeAmount)} €</span>
                                                </div>
                                            )}
                                            {result.financialsRes080.caeMaintenanceCost > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <span className="text-slate-400">Gestión tramitación Expediente CAE</span>
                                                    <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financialsRes080.caeMaintenanceCost)} €</span>
                                                </div>
                                            )}
                                            {result.financialsRes080.irpfCap > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-400">Deducción de IRPF por Obra</span>
                                                        <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Aplicable {result.financialsRes080.irpfRate}% (Max {formatNumber(result.financialsRes080.irpfCap)}€)</span>
                                                    </div>
                                                    <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financialsRes080.irpfDeduction)} €</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center p-3 bg-amber-500/10 rounded-lg">
                                                <span className="text-amber-200 font-semibold uppercase text-[11px] tracking-wider">Beneficio Fiscal Total</span>
                                                <span className="text-amber-400 font-mono font-extrabold text-lg">+{formatNumber(result.financialsRes080.totalBeneficioFiscal)} €</span>
                                            </div>
                                            <div className="flex justify-between items-center p-3 bg-lime-500/10 rounded-lg">
                                                <span className="text-lime-200 text-xs font-semibold uppercase tracking-wider">Ahorro conseguido por BROKERGY</span>
                                                <span className="text-lime-400 font-bold text-lg">{formatNumber(result.financialsRes080.porcentajeCubierto)}%</span>
                                            </div>
                                            <div className="flex justify-between items-center p-4 bg-white/5 rounded-xl border border-white/10 mt-4">
                                                <span className="text-white font-bold text-lg uppercase tracking-tight">COSTE FINAL</span>
                                                <div className="text-right">
                                                    <span className="text-3xl font-black text-white">{formatNumber(result.financialsRes080.costeFinal)} €</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── Ficha RES060FC (propuesta de nueva normativa) — comparativa en tiempo real ── */}
                            {showBrokergy && (() => {
                                const fc = result.res060fc;
                                const provSelect = (
                                    <select
                                        value={inputs.provincia || ''}
                                        onChange={e => {
                                            const code = e.target.value;
                                            onInputChange(prev => ({
                                                ...prev,
                                                provincia: code,
                                                // Igual que el formulario: la provincia fija la zona climática
                                                zona: PROVINCE_CLIMATE_MAP[code]?.zone || prev.zona,
                                            }));
                                        }}
                                        className="bg-slate-900 border border-violet-500/30 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-violet-400"
                                    >
                                        <option value="">— Provincia —</option>
                                        {Object.entries(PROVINCE_CLIMATE_MAP)
                                            .sort((a, b) => a[1].name.localeCompare(b[1].name))
                                            .map(([code, data]) => (
                                                <option key={code} value={code}>{data.name}</option>
                                            ))}
                                    </select>
                                );

                                if (!fc) {
                                    return (
                                        <div className="mt-4 glass-card overflow-hidden border-violet-500/30">
                                            <div className="bg-violet-900/40 py-2 px-4 border-b border-violet-500/20 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-violet-400"></div>
                                                <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Ficha RES060FC · Nueva normativa (propuesta)</span>
                                            </div>
                                            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                                <p className="text-xs text-slate-400 flex-1 leading-relaxed">
                                                    Para simular el cálculo con la nueva ficha <b className="text-violet-300">RES060FC</b> hace falta la <b>provincia</b> (la demanda sale del Anexo IV por provincia y año de construcción). Selecciónala:
                                                </p>
                                                {provSelect}
                                            </div>
                                        </div>
                                    );
                                }

                                if (fc.noAnexoData) {
                                    return (
                                        <div className="mt-4 glass-card overflow-hidden border-violet-500/30">
                                            <div className="bg-violet-900/40 py-2 px-4 border-b border-violet-500/20 flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-violet-400"></div>
                                                <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Ficha RES060FC · Nueva normativa (propuesta)</span>
                                            </div>
                                            <div className="p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                                                <p className="text-xs text-slate-400 flex-1 leading-relaxed">
                                                    El Anexo IV del borrador <b>no publica demanda</b> para <b className="text-white">{fc.provinciaNombre}</b> (Canarias, Ceuta y Melilla), así que no se puede calcular la ficha RES060FC aquí.
                                                </p>
                                                {provSelect}
                                            </div>
                                        </div>
                                    );
                                }

                                const actKwh = result.savings?.savingsKwh || 0;
                                const actEur = result.financials?.caeBonus || 0;
                                const fcKwh = fc.cae;
                                const fcEur = result.financialsRes060FC?.caeBonus || 0;
                                const mx = Math.max(fcKwh, actKwh, 1);
                                const ratio = actKwh > 0 ? fcKwh / actKwh : 0;
                                const diffEur = fcEur - actEur;

                                return (
                                    <div className="mt-4 glass-card overflow-hidden border-violet-500/30 shadow-[0_0_20px_rgba(139,92,246,0.1)]">
                                        <div className="bg-violet-900/40 py-2 px-4 border-b border-violet-500/20 flex items-center justify-between gap-2 flex-wrap">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-violet-400"></div>
                                                <span className="text-xs font-bold uppercase tracking-wider text-violet-300">Ficha RES060FC · Nueva normativa (propuesta)</span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${fc.limitedByTope
                                                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                                                    : 'bg-lime-500/20 text-lime-300 border border-lime-500/30'}`}>
                                                    {fc.limitedByTope ? 'Tope 70%·CEF (manda el consumo real)' : 'Techo técnico (demanda/η/SCOP)'}
                                                </span>
                                                {onOpenRes060FCDetail && (
                                                    <button
                                                        type="button"
                                                        onClick={onOpenRes060FCDetail}
                                                        className="px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-violet-500/20 text-violet-200 border border-violet-400/40 hover:bg-violet-500/35 transition-all cursor-pointer"
                                                    >
                                                        🔍 Ver desglose
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4 space-y-4">
                                            {/* Comparativa en tiempo real: RES060FC vs RES060 actual */}
                                            <div className="space-y-3">
                                                <div className="flex justify-between items-baseline gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-300">RES060FC (propuesta)</span>
                                                    <span className="flex items-baseline gap-2">
                                                        <span className="text-2xl font-black text-violet-300 tabular-nums">{formatNumber(fcKwh, 0)} <span className="text-[10px] font-bold text-violet-400/60 uppercase">kWh/año</span></span>
                                                        <span className="text-sm font-bold text-violet-200 tabular-nums">{formatNumber(fcEur, 0)} €</span>
                                                    </span>
                                                </div>
                                                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all duration-300" style={{ width: `${(100 * fcKwh / mx)}%` }}></div>
                                                </div>
                                                <div className="flex justify-between items-baseline gap-3">
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">RES060 actual</span>
                                                    <span className="flex items-baseline gap-2">
                                                        <span className="text-xl font-black text-white/80 tabular-nums">{formatNumber(actKwh, 0)} <span className="text-[10px] font-bold text-white/40 uppercase">kWh/año</span></span>
                                                        <span className="text-sm font-bold text-white/60 tabular-nums">{formatNumber(actEur, 0)} €</span>
                                                    </span>
                                                </div>
                                                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
                                                    <div className="h-full rounded-full bg-slate-500 transition-all duration-300" style={{ width: `${(100 * actKwh / mx)}%` }}></div>
                                                </div>
                                            </div>

                                            <div className={`flex items-center justify-center gap-3 p-3 rounded-xl ${diffEur >= 0 ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                                                <span className={`text-2xl font-black tabular-nums ${diffEur >= 0 ? 'text-violet-300' : 'text-red-400'}`}>{ratio > 0 ? `${formatNumber(ratio, 2)}×` : '—'}</span>
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-white/50 leading-tight">
                                                    {diffEur >= 0 ? 'más bono con la ficha nueva' : 'menos bono con la ficha nueva'}<br />
                                                    <span className={diffEur >= 0 ? 'text-violet-300' : 'text-red-400'}>{diffEur >= 0 ? '+' : ''}{formatNumber(diffEur, 0)} € · {formatNumber(fcKwh - actKwh, 0)} kWh/año</span>
                                                </span>
                                            </div>

                                            {/* Desglose del cálculo */}
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 text-[11px] pt-1 border-t border-white/5">
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">Anexo IV ({fc.provinciaNombre})</span><span className="text-white/70 font-mono">{formatNumber(fc.q, 1)} kWh/m²</span></div>
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">Demanda ({fc.yearLabel})</span><span className="text-white/70 font-mono">{formatNumber(fc.dem, 0)} kWh</span></div>
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">η caldera / f_C</span><span className="text-white/70 font-mono">{formatNumber(fc.eta * 100, 0)}% / {formatNumber(fc.fc, 1)}</span></div>
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">AES (techo técnico)</span><span className="text-white/70 font-mono">{formatNumber(fc.aes, 0)} kWh</span></div>
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">Tope 0,70·CEF</span><span className="text-white/70 font-mono">{formatNumber(fc.tope, 0)} kWh</span></div>
                                                <div className="flex justify-between gap-2 pt-2"><span className="text-slate-500">Tipología</span><span className="text-white/70 font-mono">{fc.tipologiaLabel}</span></div>
                                            </div>

                                            <p className="text-[10px] text-slate-500 italic leading-relaxed">
                                                AE = mín(AES; 0,70·CEF) × f_C, con demanda del Anexo IV por provincia/año y el mismo η y SCOP que el cálculo actual. CEF = consumo previo estimado ({formatNumber(fc.cef, 0)} kWh/año). Borrador en consulta pública: puede cambiar.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                            </div>
                        </div>
                    )}
                </div>
            </SectionCard>

            {/* TABLA OCULTA PARA CAPTURA (OFF-SCREEN) */}
            {/* Solo usamos 2 columnas si está el modo reforma activo y tenemos resultados financieros para ambos */}
            {(() => {
                const hasReformaResults = inputs?.isReforma && result.financialsRes080;
                const useTwoCols = hasReformaResults && inputs?.comparativaReforma !== false;
                const containerWidth = useTwoCols ? '1800px' : '900px';

                return (
                    <div className="absolute left-[-9999px] top-0 bg-white" style={{ width: containerWidth }}>
                        <div ref={tableRef} className={`p-8 bg-slate-100 grid gap-8 ${useTwoCols ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {/* CAJA OPCIÓN 1: AEROTERMIA (Solo mostramos si hay comparativa o no hay reforma) */}
                            {(!hasReformaResults || inputs?.comparativaReforma !== false) && (
                                <div className="flex flex-col">
                                    {useTwoCols && (
                                        <h2 className="text-3xl font-black text-slate-800 mb-6 text-center tracking-tight border-b-4 border-amber-500 pb-2 inline-block mx-auto uppercase flex items-center justify-center min-h-[80px]">
                                            Opción 1: Cambio de caldera por Aerotermia
                                        </h2>
                                    )}
                                    <SummaryTable result={result} />
                                </div>
                            )}

                            {/* CAJA OPCIÓN 2: REFORMA (Solo si hay resultados) */}
                            {hasReformaResults && (
                                <div className="flex flex-col">
                                    <h2 className="text-3xl font-black text-slate-800 mb-6 text-center tracking-tight border-b-4 border-amber-500 pb-2 inline-block mx-auto uppercase flex items-center justify-center min-h-[80px]">
                                        Opción 2: Cambio de caldera por Aerotermia y Reforma Integral
                                    </h2>
                                    <SummaryTable result={{ ...result, financials: result.financialsRes080, includeAnnualSavings: false }} isReforma={true} />
                                </div>
                            )}
                        </div>
                        {result.res080 && inputs?.isReforma && (
                            <div className="mt-8 px-8 pb-8 bg-slate-100">
                                 <EfficiencyTable res080={result.res080} />
                            </div>
                        )}
                        {/* Comparativa: ahorro con el CEE aportado (baseline real) vs método estimado.
                            Misma reforma; solo cambia la demanda de calefacción inicial: real (CEE) vs
                            estimada. Reusa calculateRes080Estimated con manualDemandOverride. */}
                        {inputs?.cee_previo && inputs?.isReforma && result.res080 && (() => {
                            try {
                                const cee = inputs.cee_previo;
                                const ceeHeatDemand = Number(cee?.demandas?.calefaccion_kwh_m2_ano);
                                if (!isFinite(ceeHeatDemand) || ceeHeatDemand <= 0) return null;
                                // "Estimado" = el número canónico que ya muestra la app (nunca recalculamos).
                                const estAhorro = Number(result.res080?.ahorroEnergiaFinalTotal) || 0;
                                const estCae = Number(result.financialsRes080?.caeBonus) || 0;
                                // "Con CEE" = misma reforma pero con la demanda de calefacción REAL del CEE.
                                const ceeRes = calculateRes080Estimated({ ...inputs, manualDemandOverride: ceeHeatDemand });
                                const ceeAhorro = Number(ceeRes?.ahorroEnergiaFinalTotal) || 0;
                                if (estAhorro <= 0 && ceeAhorro <= 0) return null;
                                const effPrice = estAhorro > 0 && estCae > 0
                                    ? estCae / (estAhorro / 1000)
                                    : (Number(inputs.caePriceClient) || 0);
                                const ceeCae = (ceeAhorro / 1000) * effPrice;
                                const diffCae = ceeCae - estCae;
                                const Col = ({ title, tag, ahorro, cae, highlight }) => (
                                    <div className={`flex-1 rounded-2xl border p-5 ${highlight ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{title}</span>
                                            {tag && <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${highlight ? 'bg-amber-400 text-black' : 'bg-slate-200 text-slate-600'}`}>{tag}</span>}
                                        </div>
                                        <div className="text-3xl font-black text-slate-900">{formatNumber(cae)} €</div>
                                        <div className="text-xs text-slate-500 mt-1">Bono CAE estimado</div>
                                        <div className="mt-3 pt-3 border-t border-slate-200 text-sm text-slate-600">
                                            Ahorro: <b className="text-slate-800">{formatNumber(ahorro)}</b> kWh/año
                                        </div>
                                    </div>
                                );
                                return (
                                    <div className="mt-8 px-8 pb-8 bg-slate-100">
                                        <div className="mb-4">
                                            <h4 className="text-lg font-black text-slate-800">Comparativa: CEE aportado vs método estimado</h4>
                                            <p className="text-xs text-slate-500">Misma reforma. La única diferencia es el punto de partida: la demanda de calefacción <b>real del CEE</b> ({formatNumber(ceeHeatDemand)} kWh/m²·año) frente a nuestra <b>estimación</b>.</p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row gap-4">
                                            <Col title="Método estimado" tag="Nuestro modelo" ahorro={estAhorro} cae={estCae} highlight={false} />
                                            <Col title="Con CEE aportado" tag="Baseline real" ahorro={ceeAhorro} cae={ceeCae} highlight={true} />
                                        </div>
                                        <div className="mt-3 text-sm text-slate-600">
                                            {Math.abs(diffCae) < 1
                                                ? 'Ambos métodos dan prácticamente el mismo resultado: la estimación queda validada por el CEE.'
                                                : <>Usar el CEE aportado {diffCae > 0 ? 'aumenta' : 'reduce'} el bono CAE en <b className={diffCae > 0 ? 'text-emerald-600' : 'text-red-600'}>{formatNumber(Math.abs(diffCae))} €</b> frente a la estimación.</>}
                                        </div>
                                        <div className="mt-4">
                                            <button
                                                onClick={() => setShowComparativaCee(true)}
                                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors"
                                            >
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m4 10V11m4 6V4M4 21h16" /></svg>
                                                Comparativa para el cliente
                                            </button>
                                        </div>
                                    </div>
                                );
                            } catch (e) {
                                console.warn('[Comparativa CEE] no se pudo calcular:', e?.message);
                                return null;
                            }
                        })()}
                    </div>
                );
            })()}

            {/* Popup con la Imagen Generada */}
            {generatedImage && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-2 bg-black/80 backdrop-blur-md animate-fade-in outline-none"
                    onClick={() => setGeneratedImage(null)}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Escape' && setGeneratedImage(null)}
                >
                    <div className="bg-white rounded-2xl overflow-hidden shadow-2xl relative animate-scale-up border border-white/20"
                        style={{ width: '1000px', maxWidth: '98vw', maxHeight: '98vh' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center gap-4">
                            <h3 className="text-slate-800 font-black uppercase tracking-tight flex items-center gap-2 text-lg whitespace-nowrap">
                                <div className="w-1.5 h-6 bg-amber-500 rounded-full"></div>
                                TABLA DE RESULTADOS
                            </h3>

                            <div className="flex flex-col sm:flex-row gap-3 flex-1 justify-center max-w-xl w-full sm:w-auto">
                                <button
                                    onClick={handleCopyToClipboard}
                                    className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${copied
                                        ? 'bg-emerald-500 text-white'
                                        : 'bg-slate-900 text-white hover:bg-slate-800'
                                        }`}
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        {copied
                                            ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                                        }
                                    </svg>
                                    {copied ? '¡COPIADA!' : 'COPIAR IMAGEN'}
                                </button>

                                <button
                                    onClick={handleDownloadImage}
                                    className="flex-1 py-3 px-4 rounded-lg font-bold text-sm bg-white text-slate-900 hover:bg-slate-50 border-2 border-slate-900 flex items-center justify-center gap-2 transition-all"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                    </svg>
                                    GUARDAR FOTO
                                </button>
                            </div>

                            <button
                                onClick={() => setGeneratedImage(null)}
                                className="p-1.5 rounded-full hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-4 bg-slate-100 flex flex-col items-center overflow-auto" style={{ maxHeight: 'calc(98vh - 100px)' }}>
                            <img
                                src={generatedImage}
                                alt="Tabla de Resultados"
                                className="shadow-2xl rounded-xl border border-slate-300"
                                style={{ width: '100%', height: 'auto' }}
                            />
                        </div>
                    </div>
                </div>
            )}

            {showComparative && (
                <ComparativeAnalysisModal
                    isOpen={showComparative}
                    onClose={() => setShowComparative(false)}
                    inputs={inputs}
                    currentResult={result}
                />
            )}

            <AerotermiaModal
                isOpen={showAerotermia}
                onClose={() => setShowAerotermia(false)}
                demand={result?.q_net}
                surface={inputs?.superficie}
                zone={inputs?.zona}
            />

            {showProposal && (
                <ErrorBoundary onClose={() => setShowProposal(false)}>
                    <ProposalModal
                        isOpen={showProposal}
                        onClose={() => setShowProposal(false)}
                        result={result}
                        inputs={inputs}
                        onSaveRequest={() => setShowSaveOpportunity(true)}
                    />
                </ErrorBoundary>
            )}

            <SaveOpportunityModal
                isOpen={showSaveOpportunity}
                onClose={() => {
                    setShowSaveOpportunity(false);
                    // Tras guardar con éxito, reanudar la acción pendiente (PDF/Tabla)
                    // que disparó la política de guardado.
                    const action = pendingActionRef.current;
                    const saved = didSaveRef.current;
                    pendingActionRef.current = null;
                    didSaveRef.current = false;
                    if (saved && action) {
                        setTimeout(() => runAction(action), 300);
                    }
                }}
                onSaveSuccess={(ref, id, driveId, prescriptorId, instaladorId, codInterno, driveFolderLink) => {
                    const newInputs = {
                        ...inputs,
                        referenciaCliente: ref,
                        id_oportunidad: id,
                        drive_folder_id: driveId,
                        drive_folder_link: driveFolderLink || inputs.drive_folder_link,
                        prescriptor_id: prescriptorId,
                        instalador_asociado_id: instaladorId,
                        cod_cliente_interno: codInterno
                    };
                    onInputChange(newInputs);
                    // Actualizar snapshot con la misma lógica que currentSnapshot
                    setLastSavedSnapshot(getSnapshot(newInputs, result));
                    // Marcar que el guardado fue correcto para reanudar la acción al cerrar.
                    didSaveRef.current = true;
                }}
                onClientLinked={(cliente_id) => {
                    onInputChange({ ...inputs, cliente_id: cliente_id });
                }}
                inputs={inputs}
                result={result}
            />

            <DocsAdminModal
                isOpen={showSubirFotos}
                onClose={() => setShowSubirFotos(false)}
                idOportunidad={inputs.id_oportunidad}
            />

            <ClienteFormModal
                key={clienteModalOp?.id_oportunidad}
                isOpen={!!clienteModalOp}
                onClose={() => {
                    setClienteModalOp(null);
                    setPendingAcceptance(false);
                }}
                oportunidad={clienteModalOp}
                onSuccess={handleSuccessCliente}
            />

            <ClienteDetailModal
                clienteId={clienteDetailId}
                isOpen={!!clienteDetailId}
                oportunidadId={inputs.id_oportunidad}
                onClose={() => setClienteDetailId(null)}
                onClienteSwapped={() => {
                    // Recargamos la página para refrescar los datos de la oportunidad
                    // con el nuevo cliente vinculado
                    window.location.reload();
                }}
            />

            {showEfficiency && (result.res080 || isEmisionesMode) && (() => {
                // En modo emisiones la tabla es EDITABLE y se calcula desde el borrador
                // (no del resultado), para no recalcular todo en cada tecla. Al confirmar
                // se vuelca a inputs. En el resto de modos, tabla de solo lectura.
                const editable = isEmisionesMode && !!emiDraft;
                const draftRes = editable ? calculateRes080FromEmissions({
                    emiAcsIni: emiDraft.emi.acsIni, emiAcsFin: emiDraft.emi.acsFin,
                    emiCalIni: emiDraft.emi.calIni, emiCalFin: emiDraft.emi.calFin,
                    emiRefIni: emiDraft.emi.refIni, emiRefFin: emiDraft.emi.refFin,
                    combAcsInicial: emiDraft.comb.acsIni, combAcsFinal: emiDraft.comb.acsFin,
                    combCalefaccionInicial: emiDraft.comb.calIni, combCalefaccionFinal: emiDraft.comb.calFin,
                    combRefrigeracionInicial: emiDraft.comb.refIni, combRefrigeracionFinal: emiDraft.comb.refFin,
                    superficieInicial: emiDraft.supIni, superficieFinal: emiDraft.supFin
                }) : result.res080;
                const setComb = (type, isFinal, value) => setEmiDraft(d => ({ ...d, comb: { ...d.comb, [type + (isFinal ? 'Fin' : 'Ini')]: value } }));
                const setEmi = (type, isFinal, value) => setEmiDraft(d => ({ ...d, emi: { ...d.emi, [type + (isFinal ? 'Fin' : 'Ini')]: normComma(value) } }));
                const eDraft = editable ? {
                    acs: { ini: emiDraft.emi.acsIni, fin: emiDraft.emi.acsFin },
                    cal: { ini: emiDraft.emi.calIni, fin: emiDraft.emi.calFin },
                    ref: { ini: emiDraft.emi.refIni, fin: emiDraft.emi.refFin },
                } : null;
                return (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in"
                    onClick={() => { if (!editable) setShowEfficiency(false); }}
                >
                    <div className="bg-white rounded-3xl overflow-hidden shadow-2xl relative animate-scale-up max-w-4xl w-full max-h-[92vh] flex flex-col border border-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-8 py-5 bg-slate-900 border-b border-white/10 flex justify-between items-center shrink-0">
                            <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3 text-lg">
                                <span className="text-amber-500 text-2xl">📊</span>
                                DESGLOSE ENERGÉTICO RES080{editable ? ' · EDITAR EMISIONES' : ''}
                            </h3>
                            <button
                                onClick={() => setShowEfficiency(false)}
                                className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all hover:rotate-90"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <div className="p-8 bg-white overflow-auto flex-1">
                             {editable && (
                                <p className="mb-4 text-[11px] text-slate-500 leading-relaxed">
                                    Edita combustible, <b>emisiones</b> y <b>superficie</b> (inicial/final) en la tabla. La superficie es la base del ahorro (emisiones × superficie) y puede diferir entre el CEE inicial y el final. Al confirmar se actualiza todo el cálculo.
                                </p>
                             )}
                             {/* Cargar CEE por fichero (XML exacto u OCR IA) para rellenar la columna */}
                             {editable && (
                                <div className="mb-5 flex flex-col sm:flex-row gap-3">
                                    <button
                                        onClick={() => setCeeLoadTarget('inicial')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        Cargar CEE inicial
                                    </button>
                                    <button
                                        onClick={() => setCeeLoadTarget('final')}
                                        className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-slate-300 hover:border-slate-400 text-slate-700 text-[11px] font-black uppercase tracking-widest transition-all active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                        Cargar CEE final (real)
                                    </button>
                                </div>
                             )}
                             {/* Estimar el CEE FINAL si aún no lo tenemos (con la aerotermia) */}
                             {editable && emiDraft?.est && (
                                <div className="mb-5 p-4 rounded-xl bg-blue-50 border border-blue-200">
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="text-blue-500 text-lg">⚡</span>
                                        <div className="flex flex-col leading-tight">
                                            <span className="text-[11px] font-black text-slate-800 uppercase tracking-widest">¿Aún no tienes el CEE FINAL?</span>
                                            <span className="text-[9px] font-bold text-blue-500/70 uppercase tracking-widest">Estímalo con la aerotermia · consumo = demanda / SCOP</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        {[
                                            { key: 'demCal', label: 'Demanda calef.', unit: 'kWh/m²·año' },
                                            { key: 'scopCal', label: 'SCOP calef.', unit: '' },
                                            { key: 'demAcs', label: 'Demanda ACS', unit: 'kWh/m²·año' },
                                            { key: 'scopAcs', label: 'SCOP ACS', unit: '' },
                                        ].map(f => (
                                            <div key={f.key}>
                                                <label className="block text-[8px] font-black text-slate-500 uppercase tracking-[0.15em] mb-1">{f.label}</label>
                                                <input
                                                    type="text"
                                                    inputMode="decimal"
                                                    className="w-full bg-white border border-blue-300 rounded-lg h-9 text-[13px] font-mono font-bold text-slate-900 text-center focus:outline-none focus:border-blue-500"
                                                    placeholder="—"
                                                    value={emiDraft.est[f.key] ?? ''}
                                                    onChange={e => { const v = normComma(e.target.value); setEmiDraft(d => ({ ...d, est: { ...d.est, [f.key]: v } })); }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
                                        <p className="text-[10px] text-slate-500 leading-relaxed flex-1 min-w-[200px]">
                                            La demanda la lees del CEE inicial. {(inputs?.changeAcs || inputs?.incluir_acs) ? 'Se estima también el ACS (se cambia a aerotermia).' : 'El ACS se mantiene igual que el inicial (no se cambia).'} La refrigeración se mantiene. Rellena la columna FINAL; puedes ajustarla luego.
                                        </p>
                                        <button onClick={estimarFinal} className="shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                            Rellenar FINAL
                                        </button>
                                    </div>
                                </div>
                             )}
                             <EfficiencyTable
                                res080={draftRes}
                                editable={editable}
                                onFuelChange={editable ? setComb : null}
                                onEmissionChange={editable ? setEmi : null}
                                emissionDraft={eDraft}
                                superficieDraft={editable ? { ini: emiDraft.supIni, fin: emiDraft.supFin } : null}
                                onSuperficieChange={editable ? (isFinal, value) => { const v = normComma(value); setEmiDraft(d => ({ ...d, [isFinal ? 'supFin' : 'supIni']: v })); } : null}
                             />

                             {!editable && (
                                <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                   <p className="text-[11px] text-slate-500 italic leading-relaxed text-center font-medium">
                                       {inputs?.demandMode === 'real'
                                           ? 'Este desglose corresponde a la comparativa técnica entre los certificados energéticos (XML) aportados para la situación inicial y propuesta de reforma.'
                                           : 'Este desglose es una estimación técnica a partir de los datos introducidos (sistema actual, aerotermia y mejoras de envolvente). Las emisiones se derivan del consumo estimado y el factor de paso de cada combustible.'}
                                   </p>
                                </div>
                             )}
                        </div>
                        {editable && (
                            <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                                <button onClick={() => setShowEfficiency(false)} className="px-6 py-3 rounded-xl border border-slate-300 text-slate-500 text-[11px] font-black uppercase tracking-widest hover:bg-slate-100 transition-all">
                                    Cancelar
                                </button>
                                <button onClick={confirmEmisiones} className="px-7 py-3 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-[11px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 transition-all active:scale-95 flex items-center gap-2">
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                    Confirmar y recalcular
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                );
            })()}
            {/* Modal de Guardia para PDF: Obliga/Sugiere guardar antes de generar */}
            {showPdfGuard && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-bkg-deep/80 backdrop-blur-md animate-fade-in" onClick={() => { setShowPdfGuard(false); pendingActionRef.current = null; }}>
                    <div className="w-full max-w-md relative z-10">
                        <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 relative overflow-hidden backdrop-blur-xl" onClick={e => e.stopPropagation()}>
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>
                            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px] pointer-events-none"></div>

                            <button
                                onClick={() => { setShowPdfGuard(false); pendingActionRef.current = null; }}
                                className="absolute top-6 right-6 p-2 text-white/20 hover:text-white transition-colors z-20"
                            >
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>

                            <div className="relative z-10">
                                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                    <svg className="w-6 h-6 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                    </svg>
                                    Guardar Cambios
                                </h3>
                                <p className="text-sm text-white/40 mb-8 leading-relaxed">
                                    {isAdmin
                                        ? 'Para asegurar que el entregable refleje los últimos cambios realizados, te recomendamos guardar la oportunidad antes de continuar.'
                                        : 'Has realizado cambios sin guardar. Guarda la oportunidad para que quede registrada y el entregable refleje los últimos datos.'}
                                </p>

                                <div className="space-y-4">
                                    <button
                                        onClick={() => {
                                            setShowPdfGuard(false);
                                            didSaveRef.current = false;
                                            setShowSaveOpportunity(true);
                                        }}
                                        className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-bkg-deep shadow-brand-500/20 shadow-lg font-black text-sm uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                        Guardar Oportunidad
                                    </button>

                                    {/* Escape "sin guardar": SOLO ADMIN. El partner debe guardar siempre. */}
                                    {isAdmin && (
                                        <button
                                            onClick={() => {
                                                setShowPdfGuard(false);
                                                const action = pendingActionRef.current || 'pdf';
                                                pendingActionRef.current = null;
                                                runAction(action);
                                            }}
                                            className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-white/10 active:scale-[0.98]"
                                        >
                                            Continuar sin guardar
                                        </button>
                                    )}

                                    <button
                                        onClick={() => { setShowPdfGuard(false); pendingActionRef.current = null; }}
                                        className="w-full py-2 text-[10px] font-black uppercase tracking-[0.3em] text-white/20 hover:text-white transition-all mt-4"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            <HistorialModal
                isOpen={showHistorial}
                onClose={() => setShowHistorial(false)}
                idOportunidad={inputs.id_oportunidad}
                referenciaCliente={inputs.referenciaCliente}
            />

            <ComparativaCeeModal
                isOpen={showComparativaCee}
                onClose={() => setShowComparativaCee(false)}
                comparison={showComparativaCee ? computeCeeComparison(inputs) : null}
                clienteNombre={inputs.referenciaCliente}
            />

            <CeeUploadModal
                isOpen={!!ceeLoadTarget}
                onClose={() => setCeeLoadTarget(null)}
                title={ceeLoadTarget === 'final' ? 'Cargar CEE final (real)' : 'Cargar CEE inicial'}
                subtitle={ceeLoadTarget === 'final'
                    ? 'Sube el CEE FINAL real para rellenar la columna FINAL. El CEE inicial aportado se mantiene; se recalcula el ahorro real medido.'
                    : 'Sube el CEE (situación inicial) para rellenar la columna INICIAL: emisiones, combustible, superficie y demanda.'}
                onLoaded={(data) => { applyCeeToColumn(data, ceeLoadTarget); setCeeLoadTarget(null); }}
            />
        </div>

    );
}
