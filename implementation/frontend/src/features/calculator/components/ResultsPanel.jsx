import React, { useRef } from 'react';
import html2canvas from 'html2canvas';
import { SectionCard, Divider, Input, Label } from './UIComponents';
import { SummaryTable } from './SummaryTable';
import { AerotermiaModal } from './AerotermiaModal';
import { ProposalModal } from './ProposalModal';
import { SaveOpportunityModal } from './SaveOpportunityModal';
import { generateBrokergyReport } from '../logic/pdfGenerator';
import { calculateSavings, calculateFinancials } from '../logic/calculation';
import realCasesData from '../data/real_cases_db.json';

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
            current: currentResult.financials.caeBonus
        };
    }, [relevantCases, inputs, currentResult]);

    const formatNum = (n) => formatNumber(n);

    return (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-slate-900/95 rounded-2xl max-w-lg w-full p-8 border border-amber-500/30 shadow-2xl relative overflow-hidden"
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

                            <div className="p-8 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl shadow-xl shadow-amber-500/10 ring-1 ring-white/20 text-center">
                                <p className="text-[10px] font-black text-slate-900/60 uppercase tracking-widest mb-3">BONO ENERGÉTICO CAE BROKERGY</p>
                                <div className="flex items-baseline justify-center gap-2">
                                    <span className="text-6xl font-black text-slate-900 tracking-tighter">{formatNum(stats.current)}</span>
                                    <span className="text-2xl font-black text-slate-900/60">€</span>
                                </div>
                                <div className="mt-6 pt-4 border-t border-slate-900/10 text-slate-900/80 text-[11px] font-bold leading-relaxed">
                                    Compara tu resultado con valores reales de mercado para viviendas similares en tu zona climática.
                                </div>
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
        <div className={`p-4 rounded-xl border h-full flex flex-col ${cls}`}>
            <div className="mb-2 h-8 flex items-start">
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-60 leading-tight">
                    {title}
                </p>
            </div>
            <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black tracking-tight">{value}</span>
                <span className="text-xs font-medium opacity-60">{unit}</span>
            </div>
            {subtext && (
                <p className="text-[10px] mt-2 opacity-60 font-medium uppercase tracking-wider">
                    {subtext}
                </p>
            )}
        </div>
    );
}

export function ResultsPanel({ result, inputs, onInputChange, showBrokergy }) {
    const [showComparative, setShowComparative] = React.useState(false);
    const [generatingImage, setGeneratingImage] = React.useState(false);
    const [generatedImage, setGeneratedImage] = React.useState(null);
    const [showAerotermia, setShowAerotermia] = React.useState(false);
    const [showProposal, setShowProposal] = React.useState(false);
    const [showSaveOpportunity, setShowSaveOpportunity] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const tableRef = useRef(null);

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
                        <div className="flex items-center">
                            <button
                                onClick={() => setShowComparative(true)}
                                className="p-2 rounded-full hover:bg-white/10 text-amber-400 hover:text-amber-300 transition-colors"
                                title="Ver comparativa real de mercado"
                            >
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setShowAerotermia(true)}
                                className="p-2 ml-1 rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 transition-all hover:scale-110 active:scale-90"
                                title="Estimación Potencia Aerotermia"
                            >
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
                                    <circle cx="9" cy="12" r="3" stroke="currentColor" strokeWidth="1.5" />
                                    <path d="M9 10L9 14" stroke="currentColor" strokeWidth="1" />
                                    <path d="M7 12L11 12" stroke="currentColor" strokeWidth="1" />
                                    <rect x="15" y="8" width="3" height="1" rx="0.5" fill="currentColor" />
                                    <rect x="15" y="11" width="3" height="1" rx="0.5" fill="currentColor" />
                                    <rect x="15" y="14" width="3" height="1" rx="0.5" fill="currentColor" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* ACTION BUTTONS: Always Visible at top level */}
                    {result.financials && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 animate-fade-in">
                            <button
                                onClick={handleGenerateImagePopup}
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
                                onClick={() => setShowProposal(true)}
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
                        </div>
                    )}

                    {showBrokergy && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fade-in mb-3">
                            <ResultCard
                                title="Demanda Calefacción"
                                value={formatNumber(result.q_net)}
                                unit="kWh/m²"
                                subtext=""
                                color="blue"
                            />
                            {result.savings && (
                                <ResultCard
                                    title="Ahorro Estimado"
                                    value={formatNumber(result.savings.savingsKwh / 1000)}
                                    unit="MWh/año"
                                    subtext=""
                                    color="green"
                                />
                            )}
                        </div>
                    )}

                    {result.financials && (
                        <div className="mt-3">
                            <Divider />

                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.599-1c.51-.598.51-1.402 0-2" />
                                </svg>
                                {showBrokergy ? 'Estudio de Viabilidad y Márgenes' : 'Simulación de Inversión y Ayudas'}
                            </h3>

                            <div className="glass-card overflow-hidden border-slate-700/50">
                                <div className="p-4 space-y-3">
                                    <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                        <span className="text-slate-400">Coste de inversión Total (IVA INCLUIDO)</span>
                                        <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financials.presupuesto)} €</span>
                                    </div>
                                    <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                        <span className="text-slate-400">Ayuda 1: BONO ENERGÉTICO CAE BROKERGY (Nota 1)</span>
                                        <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.caeBonus)} €</span>
                                    </div>
                                    {result.financials.caeMaintenanceCost > 0 && (
                                        <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                            <span className="text-slate-400">Gestión tramitación Expediente CAE</span>
                                            <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.caeMaintenanceCost)} €</span>
                                        </div>
                                    )}
                                    {result.financials.legalizationCost > 0 && (
                                        <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                            <span className="text-slate-400">Legalización Instalación</span>
                                            <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.legalizationCost)} €</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                        <div className="flex flex-col">
                                            <span className="text-slate-400">Ayuda 2: Deducciones en el IRPF (Nota 2)</span>
                                            <span className="text-[10px] text-slate-500 font-medium uppercase tracking-tight">Aplicable {result.financials.irpfRate}% (Max {formatNumber(result.financials.irpfCap)}€)</span>
                                        </div>
                                        <span className="text-amber-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.irpfDeduction)} €</span>
                                    </div>
                                    <div className="flex justify-between items-center p-3 bg-amber-500/10 rounded-lg">
                                        <span className="text-amber-200 font-semibold">Total ayuda</span>
                                        <span className="text-amber-400 font-mono font-extrabold text-lg">{formatNumber(result.financials.totalAyuda)} €</span>
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

                                    {/* Sección Ahorro Anual y Amortización */}
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
                                                            {result.payback.paybackYears < 100
                                                                ? `${formatNumber(result.payback.paybackYears)} años`
                                                                : '∞'
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}


                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </SectionCard>

            {/* Contenedor invisible para captura */}
            <div className="absolute left-[-9999px] top-0 bg-white" style={{ width: '900px' }}>
                <div ref={tableRef}>
                    <SummaryTable result={result} />
                </div>
            </div>

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

            <ProposalModal
                isOpen={showProposal}
                onClose={() => setShowProposal(false)}
                result={result}
                inputs={inputs}
            />

            <SaveOpportunityModal
                isOpen={showSaveOpportunity}
                onClose={() => setShowSaveOpportunity(false)}
                onSaveSuccess={(ref) => onInputChange({ ...inputs, referenciaCliente: ref })}
                inputs={inputs}
                result={result}
            />
        </div>
    );
}
