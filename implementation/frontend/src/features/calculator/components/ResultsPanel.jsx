import React, { useRef, useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import html2canvas from 'html2canvas';
import { SectionCard, Divider, Input, Label } from './UIComponents';
import { SummaryTable } from './SummaryTable';
import { AerotermiaModal } from './AerotermiaModal';
import { ProposalModal } from './ProposalModal';
import { SaveOpportunityModal } from './SaveOpportunityModal';
import { ClienteFormModal } from '../../clientes/components/ClienteFormModal';
import { ClienteDetailModal } from '../../clientes/components/ClienteDetailModal';
import { generateBrokergyReport } from '../logic/pdfGenerator';
import { calculateSavings, calculateFinancials } from '../logic/calculation';
import { EfficiencyTable } from './EfficiencyTable';
import realCasesData from '../data/real_cases_db.json';
import { SubirFotosModal } from './SubirFotosModal';
import { ErrorBoundary } from '../../../components/ErrorBoundary';

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

export function ResultsPanel({ result, inputs, onInputChange, showBrokergy, onAcceptOpportunity }) {
    const { user } = useAuth();
    const [showComparative, setShowComparative] = React.useState(false);
    const [generatingImage, setGeneratingImage] = React.useState(false);
    const [generatedImage, setGeneratedImage] = React.useState(null);
    const [showAerotermia, setShowAerotermia] = React.useState(false);
    const [showProposal, setShowProposal] = React.useState(false);
    const [showSaveOpportunity, setShowSaveOpportunity] = React.useState(false);
    const [showEfficiency, setShowEfficiency] = React.useState(false);
    const [clienteModalOp, setClienteModalOp] = React.useState(null);
    const [clienteDetailId, setClienteDetailId] = React.useState(null);
    const [pendingAcceptance, setPendingAcceptance] = React.useState(false);
    const [copied, setCopied] = React.useState(false);
    const [showPdfGuard, setShowPdfGuard] = React.useState(false);
    const [showSubirFotos, setShowSubirFotos] = React.useState(false);
    const [lastSavedSnapshot, setLastSavedSnapshot] = React.useState(null);
    const [showAddNote, setShowAddNote] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [savingNote, setSavingNote] = useState(false);
    const tableRef = useRef(null);

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

    const handleAddNote = async () => {
        const id = inputs?.id_oportunidad;
        console.log('[ResultsPanel] Attempting to save note. ID:', id, 'Text:', noteText);

        if (!noteText.trim()) {
            alert('Por favor, escribe una nota.');
            return;
        }

        if (!id) {
            console.error('[ResultsPanel] Error: id_oportunidad is missing in inputs:', inputs);
            alert('Error: No se ha identificado la oportunidad. Asegúrate de que está guardada.');
            return;
        }

        setSavingNote(true);
        try {
            const res = await axios.post(`/api/oportunidades/${id}/comentarios`, { 
                comentario: noteText.trim() 
            });
            if (res.data.success) {
                setShowAddNote(false);
                setNoteText('');
                alert('Nota añadida correctamente al historial.');
            }
        } catch (err) {
            console.error('[ResultsPanel] Error al añadir nota:', err);
            const errMsg = err.response?.data?.error || err.message || 'Error desconocido';
            alert(`Error al guardar la nota: ${errMsg}`);
        } finally {
            setSavingNote(false);
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

                            {/* Botón Añadir Nota Directa */}
                            {inputs.id_oportunidad && (
                                <button
                                    onClick={() => {
                                        setNoteText('');
                                        setShowAddNote(true);
                                    }}
                                    className="p-2 ml-1 rounded-full bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/20 transition-all hover:scale-110 active:scale-90 shadow-lg shadow-indigo-500/10 flex items-center justify-center"
                                    title="Añadir Nota al Historial"
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
                        const showRes080Button = result.res080 && inputs.demandMode === 'real';
                        return (
                        <div className={`grid grid-cols-2 ${showRes080Button ? 'lg:grid-cols-5' : 'sm:grid-cols-4'} gap-2 mb-4 animate-fade-in`}>
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
                                onClick={() => {
                                    if (!inputs.id_oportunidad) {
                                        setShowSaveOpportunity(true);
                                    } else if (isDirty) {
                                        setShowPdfGuard(true);
                                    } else {
                                        setShowProposal(true);
                                    }
                                }}
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

                            <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m.599-1c.51-.598.51-1.402 0-2" />
                                </svg>
                                {showBrokergy ? 'Estudio de Viabilidad y Márgenes' : 'Simulación de Inversión y Ayudas'}
                            </h3>

                            <div className={`grid grid-cols-1 ${result.financialsRes080 && inputs?.comparativaReforma !== false ? 'xl:grid-cols-2' : ''} gap-4`}>
                                {(inputs?.reformaType !== 'onlyReforma' && (!inputs?.isReforma || inputs?.comparativaReforma !== false)) && (
                                    <div className="glass-card overflow-hidden border-slate-700/50">
                                        <div className="bg-slate-800/50 py-2 px-4 shadow-sm border-b border-white/5 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-lime-500"></div>
                                            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Solo Aerotermia (RES060)</span>
                                        </div>
                                        <div className="p-4 space-y-3">
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">Coste de inversión Total (IVA INCLUIDO)</span>
                                                <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financials.presupuesto)} €</span>
                                            </div>
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">Ingreso Bruto: BONO ENERGÉTICO CAE {(!result.financials.isParticular && result.financials.titularType !== 'particular') ? '(IVA INC.)' : ''}</span>
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
                                            {result.financials.legalizationCost > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <span className="text-slate-400">Legalización Instalación</span>
                                                    <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financials.legalizationCost)} €</span>
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
                                                    <span className="text-slate-400">Coste de inversión Total (IVA INCLUIDO)</span>
                                                    <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
                                                        Aero: {formatNumber(inputs.presupuesto)}€ + Ref: {formatNumber(inputs.presupuestoEnvolvente)}€
                                                    </span>
                                                </div>
                                                <span className="text-white font-mono font-bold whitespace-nowrap flex-shrink-0">{formatNumber(result.financialsRes080.presupuesto)} €</span>
                                            </div>
                                            <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                <span className="text-slate-400">Ingreso Bruto: BONO ENERGÉTICO CAE {(!result.financialsRes080.isParticular && result.financialsRes080.titularType !== 'particular') ? '(IVA INC.)' : ''}</span>
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
                                            {result.financialsRes080.legalizationCost > 0 && (
                                                <div className="flex justify-between items-start text-sm py-3 border-b border-white/5 gap-4">
                                                    <span className="text-slate-400">Legalización Instalación</span>
                                                    <span className="text-red-400 font-mono font-bold whitespace-nowrap flex-shrink-0">+{formatNumber(result.financialsRes080.legalizationCost)} €</span>
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
                onClose={() => setShowSaveOpportunity(false)}
                onSaveSuccess={(ref, id, driveId, prescriptorId, instaladorId, codInterno) => {
                    const newInputs = {
                        ...inputs,
                        referenciaCliente: ref,
                        id_oportunidad: id,
                        drive_folder_id: driveId,
                        prescriptor_id: prescriptorId,
                        instalador_asociado_id: instaladorId,
                        cod_cliente_interno: codInterno
                    };
                    onInputChange(newInputs);
                    // Actualizar snapshot con la misma lógica que currentSnapshot
                    setLastSavedSnapshot(getSnapshot(newInputs, result));
                }}
                onClientLinked={(cliente_id) => {
                    onInputChange({ ...inputs, cliente_id: cliente_id });
                }}
                inputs={inputs}
                result={result}
            />

            <SubirFotosModal
                isOpen={showSubirFotos}
                onClose={() => setShowSubirFotos(false)}
                inputs={inputs}
                result={result}
                onInputChange={onInputChange}
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
                onClose={() => setClienteDetailId(null)}
            />

            {showEfficiency && result.res080 && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
                    onClick={() => setShowEfficiency(false)}
                >
                    <div className="bg-white rounded-3xl overflow-hidden shadow-2xl relative animate-scale-up max-w-4xl w-full border border-white/20"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-8 py-5 bg-slate-900 border-b border-white/10 flex justify-between items-center">
                            <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3 text-lg">
                                <span className="text-amber-500 text-2xl">📊</span>
                                DESGLOSE ENERGÉTICO RES080
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
                        <div className="p-8 bg-white overflow-auto max-h-[85vh]">
                             <EfficiencyTable res080={result.res080} />
                             
                             <div className="mt-8 p-4 bg-slate-50 rounded-xl border border-slate-200">
                                <p className="text-[11px] text-slate-500 italic leading-relaxed text-center font-medium">
                                    Este desglose corresponde a la comparativa técnica entre los certificados energéticos (XML) aportados para la situación inicial y propuesta de reforma.
                                </p>
                             </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Modal de Guardia para PDF: Obliga/Sugiere guardar antes de generar */}
            {showPdfGuard && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-bkg-deep/80 backdrop-blur-md animate-fade-in" onClick={() => setShowPdfGuard(false)}>
                    <div className="w-full max-w-md relative z-10">
                        <div className="bg-bkg-surface shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/[0.06] rounded-[2rem] p-10 relative overflow-hidden backdrop-blur-xl" onClick={e => e.stopPropagation()}>
                            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-brand/40 to-transparent"></div>
                            <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px] pointer-events-none"></div>
                            
                            <button
                                onClick={() => setShowPdfGuard(false)}
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
                                    Para asegurar que el PDF refleje los últimos cambios realizados, te recomendamos guardar la oportunidad antes de continuar.
                                </p>

                                <div className="space-y-4">
                                    <button
                                        onClick={() => {
                                            setShowPdfGuard(false);
                                            setShowSaveOpportunity(true);
                                        }}
                                        className="w-full py-4 bg-brand-600 hover:bg-brand-500 text-bkg-deep shadow-brand-500/20 shadow-lg font-black text-sm uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                        Guardar Oportunidad
                                    </button>
                                    
                                    <button
                                        onClick={() => {
                                            setShowPdfGuard(false);
                                            setShowProposal(true);
                                        }}
                                        className="w-full py-4 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all border border-white/10 active:scale-[0.98]"
                                    >
                                        Generar PDF sin guardar
                                    </button>
                                    
                                    <button
                                        onClick={() => setShowPdfGuard(false)}
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
            {/* Modal para Añadir Nota Directa */}
            {showAddNote && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
                    <div className="bg-bkg-deep border border-indigo-500/30 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600"></div>
                        <div className="p-6">
                            <h3 className="text-lg font-black text-white uppercase tracking-tight mb-4 flex items-center gap-2">
                                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                                </svg>
                                Añadir Nota Directa
                            </h3>
                            <textarea
                                autoFocus
                                value={noteText}
                                onChange={e => setNoteText(e.target.value)}
                                placeholder="Escribe aquí cualquier observación sobre el cliente o la oportunidad..."
                                className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-white text-sm focus:outline-none focus:border-indigo-500 min-h-[120px] transition-all placeholder:text-white/20"
                            />
                            <div className="flex gap-3 mt-6">
                                <button
                                    onClick={() => setShowAddNote(false)}
                                    className="flex-1 py-3 text-white/40 hover:text-white text-xs font-black uppercase tracking-widest transition-all"
                                >
                                    Cancelar
                                </button>
                                <button
                                    disabled={savingNote || !noteText.trim()}
                                    onClick={handleAddNote}
                                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest rounded-xl transition-all disabled:opacity-30 shadow-lg shadow-indigo-600/20 flex items-center justify-center gap-2"
                                >
                                    {savingNote ? (
                                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : 'Guardar Nota'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>

    );
}
