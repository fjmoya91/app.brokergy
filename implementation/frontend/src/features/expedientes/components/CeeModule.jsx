import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { parseCeeXml } from '../../calculator/logic/xmlCeeParser';
import { FACTORES_PASO, calculateRes080 } from '../../calculator/logic/calculation';
import { EfficiencyTable } from '../../calculator/components/EfficiencyTable';
import { CeeDocumentsGrid } from './CeeDocumentsGrid';

// ─── Componentes de Celda ──────────────────────────────────────────────────
function TableCell({ value, onChange, readOnly, type = 'number', highlight = false }) {
    if (readOnly) {
        return (
            <div className={`px-4 py-3 text-[13px] flex items-center h-full min-h-[44px] ${highlight ? 'font-black text-brand' : 'text-white/60'}`}>
                {value ?? '—'}
            </div>
        );
    }

    return (
        <div className="px-2 py-1.5 h-full flex items-center">
            <input
                type={type}
                value={value ?? ''}
                onChange={e => onChange(e.target.value)}
                step="any"
                className={`w-full bg-white/[0.03] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-brand/40 transition-all ${
                    highlight ? 'font-bold text-brand border-brand/20 bg-brand/[0.02]' : ''
                }`}
            />
        </div>
    );
}

const getAcsCalculatedValue = (isFinal, local) => {
    const ceeObj = isFinal ? local.cee_final : local.cee_inicial;
    const method = local.acs_method;
    const rooms = local.num_rooms;
    
    if (method === 'xml' && ceeObj) {
        const dacsKwhM2 = parseFloat(ceeObj.demandaACS) || 0;
        const superficie = parseFloat(ceeObj.superficieHabitable) || 0;
        return (dacsKwhM2 * superficie).toFixed(2);
    } else if (method === 'cte') {
        const numPeople = rooms + 1;
        const val = 28 * numPeople * 0.001162 * 365 * 46;
        return val.toFixed(2);
    }
    return '—';
};

function AcsCell({ isFinal, local, setLocal, editMode }) {
    const method = local.acs_method;
    const rooms = local.num_rooms;
    const val = getAcsCalculatedValue(isFinal, local);

    return (
        <div className="flex flex-col gap-2 p-2 h-full justify-center">
            <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06] self-start">
                {['xml', 'cte'].map(m => (
                    <button 
                        key={m} 
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (editMode) {
                                setLocal(p => ({ ...p, acs_method: m }));
                            }
                        }}
                        className={`px-2 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${
                            method === m ? 'bg-brand text-black' : 'text-white/20 hover:text-white/40'
                        } ${!editMode ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                        {m === 'xml' ? 'XML' : 'Hab.'}
                    </button>
                ))}
            </div>
            
            <div className="flex items-center gap-3">
                {method === 'cte' && (
                    <div className="flex items-center gap-1.5 px-2 py-1 bg-white/[0.03] border border-white/10 rounded-lg">
                        <span className="text-[8px] font-bold text-white/20 uppercase">Dorm:</span>
                        <input 
                            type="number" 
                            disabled={!editMode}
                            value={rooms} 
                            onChange={e => {
                                e.stopPropagation();
                                setLocal(p => ({ ...p, num_rooms: parseInt(e.target.value) || 0 }))
                            }}
                            className="w-8 bg-transparent text-[11px] font-bold text-brand text-center outline-none disabled:opacity-50" 
                        />
                    </div>
                )}
                
                <div className="flex flex-col gap-0.5 min-w-[80px]">
                    <span className="text-[7px] font-black text-white/30 uppercase tracking-[0.15em] leading-none">Demanda ACS</span>
                    <span className="text-[12px] font-black text-brand leading-none">
                        {val} <span className="text-[8px] text-white/40 font-bold ml-0.5">kWh/año</span>
                    </span>
                </div>
            </div>
        </div>
    );
}

function TableHeader({ label, ceeType, required, onOpenModal, editMode, filename }) {
    const [isDragging, setIsDragging] = useState(false);

    return (
        <div 
            className={`flex flex-col gap-2 p-4 border-l border-white/[0.06] transition-all relative ${
                isDragging ? 'bg-brand/5' : ''
            }`}
            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={e => {
                e.preventDefault();
                setIsDragging(false);
                if (editMode && ceeType === 'xml') onOpenModal();
            }}
        >
            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">{label}</span>
                {required && <span className="text-[9px] text-red-400/60 uppercase font-bold px-1.5 py-0.5 bg-red-400/5 rounded">Obligatorio</span>}
            </div>

            <div className="flex items-center gap-3">
                {filename ? (
                    <div className="flex items-center gap-2 text-green-400 bg-green-400/10 px-2 py-1.5 rounded-lg border border-green-400/30 max-w-full overflow-hidden shadow-sm">
                        <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-[11px] font-bold truncate tracking-tight">{filename}</span>
                    </div>
                ) : (
                    ceeType === 'xml' && !editMode && (
                        <span className="text-[11px] text-white/20 italic ml-1">Pendiente</span>
                    )
                )}

                {editMode && ceeType === 'xml' && (
                    <button
                        onClick={onOpenModal}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-[11px] font-black uppercase tracking-wider transition-all shadow-lg ${
                            filename 
                                ? 'border-white/10 text-white/40 hover:text-white hover:border-white/20 bg-white/[0.02]' 
                                : 'border-brand/40 text-brand hover:bg-brand hover:text-bkg-deep bg-brand/5 shadow-brand/10'
                        }`}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                        {filename ? 'Reemplazar' : 'Subir XML'}
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function CeeModule({ expediente, onSave, onLiveUpdate, saving, certificadores = [], onAutoStatus }) {
    const isReforma = expediente?.oportunidades?.ficha === 'RES080' || expediente?.cee?.is_reforma;

    const [local, setLocal] = useState(() => ({
        tipo: 'xml',
        is_reforma: isReforma,
        cee_inicial: null,
        cee_final: null,
        acs_method: 'xml',
        num_rooms: 4,
        certificador_id: null,
        // Combustibles RES080
        comb_acs_inicial: 'Gasoleo Calefacción',
        comb_acs_final: 'Electricidad peninsular',
        comb_cal_inicial: 'Gasoleo Calefacción',
        comb_cal_final: 'Electricidad peninsular',
        comb_ref_inicial: 'Electricidad peninsular',
        comb_ref_final: 'Electricidad peninsular',
        cee_files: {
            inicial: { pdf: null, xml: null, cex: null, registro: null, etiqueta: null, otros: [] },
            final: { pdf: null, xml: null, cex: null, registro: null, etiqueta: null, otros: [] }
        },
        ...(expediente?.cee || {})
    }));

    const [showXmlModal, setShowXmlModal] = useState(false);
    const [xmlError, setXmlError] = useState(null);
    const [xmlFinalError, setXmlFinalError] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDraggingFinal, setIsDraggingFinal] = useState(false);
    const [editMode, setEditMode] = useState(false);
    const [xmlWarning, setXmlWarning] = useState(null);

    // ─── Estado para popup de notificación al certificador ─────────────────
    const [showCertPopup, setShowCertPopup] = useState(false);
    const [certNotifLoading, setCertNotifLoading] = useState(false);
    const [certNotifResult, setCertNotifResult] = useState(null);
    const savedCertId = useRef(expediente?.cee?.certificador_id || null);

    // Notificar al padre de cambios en tiempo real
    useEffect(() => {
        if (onLiveUpdate) onLiveUpdate(local);
    }, [local, onLiveUpdate]);

    const handleXmlInicial = (parsed) => {
        if (!parsed) return;
        setLocal(p => ({ 
            ...p, 
            cee_inicial: parsed,
            comb_acs_inicial: parsed.combustibleACS || p.comb_acs_inicial,
            comb_cal_inicial: parsed.combustibleCalefaccion || p.comb_cal_inicial
        }));
    };

    const handleXmlFinal = (parsed) => {
        if (!parsed) return;
        setLocal(p => ({ 
            ...p, 
            cee_final: parsed,
            comb_acs_final: parsed.combustibleACS || p.comb_acs_final,
            comb_cal_final: parsed.combustibleCalefaccion || p.comb_cal_final
        }));
    };

    const processXmlFile = (file, isFinal = false) => {
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.xml')) {
            isFinal ? setXmlFinalError('Archivo .xml no válido') : setXmlError('Archivo .xml no válido');
            return;
        }

        isFinal ? setXmlFinalError(null) : setXmlError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const xmlContent = e.target.result;
                const parsed = parseCeeXml(xmlContent);
                parsed._fileName = file.name;
                const nextLocal = {
                    ...local,
                    [isFinal ? 'xml_final' : 'xml_inicial']: xmlContent,
                    [isFinal ? 'cee_final' : 'cee_inicial']: parsed,
                    [isFinal ? 'fecha_visita_cee_final' : 'fecha_visita_cee_inicial']: parsed.fechaVisita || local[isFinal ? 'fecha_visita_cee_final' : 'fecha_visita_cee_inicial'],
                    [isFinal ? 'fecha_firma_cee_final' : 'fecha_firma_cee_inicial']: parsed.fechaFirma || local[isFinal ? 'fecha_firma_cee_final' : 'fecha_firma_cee_inicial'],
                    [isFinal ? 'comb_acs_final' : 'comb_acs_inicial']: parsed.combustibleACS || local[isFinal ? 'comb_acs_final' : 'comb_acs_inicial'],
                    [isFinal ? 'comb_cal_final' : 'comb_cal_inicial']: parsed.combustibleCalefaccion || local[isFinal ? 'comb_cal_final' : 'comb_cal_inicial'],
                };
                setLocal(nextLocal);
                onSave({ cee: nextLocal });

                // ─── Validación contra propuesta comercial ──────────────────
                const dc = expediente?.oportunidades?.datos_calculo || {};
                const opResult = dc.result || {};

                if (!isFinal && !isReforma) {
                    // RES060/RES093: La demanda certificada debe igualar o superar la propuesta
                    const xmlDemandaM2 = parseFloat(parsed.demandaCalefaccion) || 0;
                    const xmlSuperficie = parseFloat(parsed.superficieHabitable) || 0;
                    const xmlDemandaTotal = xmlDemandaM2 * xmlSuperficie;
                    const proposalQNet = parseFloat(opResult.Q_net) || 0;

                    if (xmlDemandaTotal > 0 && proposalQNet > 0 && xmlDemandaTotal <= proposalQNet) {
                        setXmlWarning({
                            type: 'demand',
                            xmlValue: Math.round(xmlDemandaTotal),
                            proposalValue: Math.round(proposalQNet),
                        });
                    } else {
                        setXmlWarning(null);
                    }
                } else if (isFinal && isReforma && (nextLocal.cee_inicial || local.cee_inicial)) {
                    // RES080: El ahorro certificado debe igualar o superar el simulado
                    try {
                        const res080 = calculateRes080({
                            xmlInicial: nextLocal.cee_inicial || local.cee_inicial,
                            xmlFinal: parsed,
                            combAcsInicial: nextLocal.comb_acs_inicial,
                            combAcsFinal: nextLocal.comb_acs_final,
                            combCalefaccionInicial: nextLocal.comb_cal_inicial,
                            combCalefaccionFinal: nextLocal.comb_cal_final,
                            combRefrigeracionInicial: nextLocal.comb_ref_inicial,
                            combRefrigeracionFinal: nextLocal.comb_ref_final,
                        });
                        const xmlAhorro = parseFloat(res080?.ahorroEnergiaFinalTotal) || 0;
                        const proposalAhorro = parseFloat(opResult.res080?.ahorroEnergiaFinalTotal) || 0;

                        if (xmlAhorro > 0 && proposalAhorro > 0 && xmlAhorro <= proposalAhorro) {
                            setXmlWarning({
                                type: 'ahorro',
                                xmlValue: Math.round(xmlAhorro),
                                proposalValue: Math.round(proposalAhorro),
                                diff: Math.round(proposalAhorro - xmlAhorro),
                            });
                        } else {
                            setXmlWarning(null);
                        }
                    } catch (_) {
                        setXmlWarning(null);
                    }
                } else {
                    setXmlWarning(null);
                }
            } catch (err) {
                isFinal ? setXmlFinalError(err.message) : setXmlError(err.message);
            }
        };
        reader.readAsText(file, 'UTF-8');
    };

    const handleSave = () => {
        const certChanged = local.certificador_id && local.certificador_id !== savedCertId.current;
        if (certChanged) {
            // Mostrar popup de confirmación antes de guardar
            setShowCertPopup(true);
            setCertNotifResult(null);
        } else {
            onSave({ cee: local });
            setEditMode(false);
        }
    };

    const handleCertConfirm = async (notify) => {
        // Siempre guardar los datos del CEE
        onSave({ cee: local });
        setEditMode(false);
        savedCertId.current = local.certificador_id;

        if (notify && expediente?.id) {
            setCertNotifLoading(true);
            try {
                const { data } = await axios.post(`/api/expedientes/${expediente.id}/notify-certificador`, {
                    certificador_id: local.certificador_id
                });
                setCertNotifResult({ type: 'ok', text: `Email enviado a ${data.sentTo}` });
            } catch (err) {
                const msg = err.response?.data?.error || 'Error al enviar la notificación';
                setCertNotifResult({ type: 'error', text: msg });
            } finally {
                setCertNotifLoading(false);
            }
        } else {
            setShowCertPopup(false);
        }
    };

    const res080Data = isReforma && local.cee_inicial && local.cee_final ? calculateRes080({
        xmlInicial: local.cee_inicial,
        xmlFinal: local.cee_final,
        combAcsInicial: local.comb_acs_inicial,
        combAcsFinal: local.comb_acs_final,
        combCalefaccionInicial: local.comb_cal_inicial,
        combCalefaccionFinal: local.comb_cal_final,
        combRefrigeracionInicial: local.comb_ref_inicial,
        combRefrigeracionFinal: local.comb_ref_final
    }) : null;

    const renderRes060 = () => (
        <CeeDocumentsGrid 
            expediente={expediente} 
            ceeFiles={local.cee_files} 
            onFilesChange={(newFiles) => {
                setLocal(current => {
                    const nextFiles = typeof newFiles === 'function' ? newFiles(current.cee_files) : newFiles;
                    const nextLocal = { ...current, cee_files: nextFiles };
                    onSave({ cee: nextLocal });
                    return nextLocal;
                });
            }}
            editMode={editMode}
            onXmlUploaded={(file, isFinal) => processXmlFile(file, isFinal)}
            demands={{
                inicial: local.cee_inicial,
                final: local.cee_final
            }}
            acsMethod={local.acs_method}
            numRooms={local.num_rooms}
            onManualUpdate={(patch) => {
                const nextLocal = { ...local, ...patch };
                setLocal(nextLocal);
                onSave({ cee: nextLocal });
            }}
            onAutoStatus={onAutoStatus}
        />
    );

    const renderRes080 = () => (
        <div className="space-y-8">
            <CeeDocumentsGrid 
                expediente={expediente} 
                ceeFiles={local.cee_files} 
                onFilesChange={(newFiles) => {
                    setLocal(current => {
                        const nextFiles = typeof newFiles === 'function' ? newFiles(current.cee_files) : newFiles;
                        const nextLocal = { ...current, cee_files: nextFiles };
                        onSave({ cee: nextLocal });
                        return nextLocal;
                    });
                }}
                editMode={editMode}
                onXmlUploaded={(file, isFinal) => processXmlFile(file, isFinal)}
                demands={{
                    inicial: local.cee_inicial,
                    final: local.cee_final
                }}
                acsMethod={local.acs_method}
                numRooms={local.num_rooms}
                onManualUpdate={(patch) => {
                    const nextLocal = { ...local, ...patch };
                    setLocal(nextLocal);
                    onSave({ cee: nextLocal });
                }}
                onAutoStatus={onAutoStatus}
            />

            {res080Data ? (
                <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl overflow-hidden">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-8 flex items-center gap-2">
                        <span className="w-2 h-2 bg-brand rounded-full" /> Resultados Comparativos
                    </h4>
                    <EfficiencyTable 
                        res080={res080Data} 
                        editable={editMode} 
                        onFuelChange={(type, isFinal, value) => {
                            const key = `comb_${type}_${isFinal ? 'final' : 'inicial'}`;
                            setLocal(p => ({ ...p, [key]: value }));
                        }}
                    />
                </div>
            ) : (
                <div className="p-20 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-[3rem]">
                    <p className="text-white/20 font-black uppercase tracking-widest text-xs">Sube los archivos XML para ver resultados</p>
                </div>
            )}
        </div>
    );

    // Nombre del certificador seleccionado para mostrar en popup
    const selectedCertName = (() => {
        const c = certificadores.find(c => String(c.id_empresa) === String(local.certificador_id));
        return c ? (c.razon_social || c.acronimo) : '';
    })();

    return (
        <div className="space-y-6">
            {/* ─── Popup de notificación al certificador ─────────────────── */}
            {showCertPopup && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => { if (!certNotifLoading) setShowCertPopup(false); }}>
                    <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        {certNotifResult ? (
                            <div className="text-center py-4">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border ${certNotifResult.type === 'ok' ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
                                    {certNotifResult.type === 'ok' ? (
                                        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    )}
                                </div>
                                <p className={`text-sm font-bold ${certNotifResult.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{certNotifResult.text}</p>
                                <button onClick={() => setShowCertPopup(false)} className="mt-4 px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 text-xs font-black uppercase hover:text-white transition-all">Cerrar</button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center">
                                        <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Notificar Certificador</h4>
                                        <p className="text-[10px] text-white/40">Se asignará <span className="text-brand font-bold">{selectedCertName}</span> al expediente</p>
                                    </div>
                                </div>
                                <p className="text-xs text-white/60 mb-6">¿Deseas enviar un email de notificación al certificador con los datos del expediente y el enlace a la documentación?</p>
                                <div className="flex gap-3">
                                    <button
                                        onClick={() => handleCertConfirm(false)}
                                        disabled={certNotifLoading}
                                        className="flex-1 py-2.5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
                                    >Solo asignar</button>
                                    <button
                                        onClick={() => handleCertConfirm(true)}
                                        disabled={certNotifLoading}
                                        className="flex-1 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                                    >
                                        {certNotifLoading ? (
                                            <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Enviando...</>
                                        ) : 'Asignar y notificar'}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-5">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">Certs. Energéticos</h3>
                    {!isReforma && (
                        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06]">
                            {['xml', 'aportado'].map(t => (
                                <button key={t} onClick={() => setLocal(p => ({ ...p, tipo: t }))} className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest ${local.tipo === t ? 'bg-brand text-black' : 'text-white/30'}`}>
                                    {t === 'xml' ? 'Auto XML' : 'Manual'}
                                </button>
                            ))}
                        </div>
                    )}
                    <select value={local.certificador_id || ''} onChange={e => setLocal(p => ({ ...p, certificador_id: e.target.value || null }))} className="bg-white/[0.03] border border-white/10 rounded-xl px-4 py-2 text-[10px] font-black uppercase text-brand outline-none">
                        <option value="">Certificador no asignado</option>
                        {certificadores.map(c => <option key={c.id_empresa} value={c.id_empresa}>{c.razon_social || c.acronimo}</option>)}
                    </select>
                </div>
                <div className="flex gap-2">
                    {editMode ? (
                        <>
                            <button onClick={() => setEditMode(false)} className="px-5 py-2 text-[10px] font-black uppercase text-white/30 transition-all">Cancelar</button>
                            <button onClick={handleSave} disabled={saving} className="px-7 py-3 bg-brand text-black text-[11px] font-black uppercase rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50">
                                {saving ? 'Cargando...' : 'Confirmar Datos'}
                            </button>
                        </>
                    ) : (
                        <button onClick={() => setEditMode(true)} className="px-6 py-3 bg-white/[0.02] border border-white/10 text-white/40 hover:text-white rounded-xl text-[11px] font-black uppercase transition-all">Editar Módulo</button>
                    )}
                </div>
            </div>

            {isReforma ? renderRes080() : renderRes060()}

            {/* showXmlModal is now handled inside CeeDocumentsGrid via sub-components or direct upload logic */}

            {/* ─── Modal de validación XML ─────────────────────────────────── */}
            {xmlWarning && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => setXmlWarning(null)}>
                    <div className="bg-[#0d1117] border border-amber-500/20 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex flex-col items-center gap-3 mb-5">
                            <div className="w-14 h-14 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                            </div>
                            <div className="text-center">
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">
                                    {xmlWarning.type === 'demand' ? 'Demanda Inferior a la Propuesta' : 'Ahorro Inferior al Simulado'}
                                </h4>
                                <p className="text-[10px] text-white/35 mt-1">El certificado no respalda los valores comerciales</p>
                            </div>
                        </div>

                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden mb-4">
                            <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                                <div className="p-4 text-center">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">Valor Propuesta</p>
                                    <p className="text-xl font-black text-white">{xmlWarning.proposalValue.toLocaleString('es-ES')}</p>
                                    <p className="text-[9px] text-white/25 mt-0.5">kWh/año</p>
                                </div>
                                <div className="p-4 text-center">
                                    <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-widest mb-1">Valor Certificado</p>
                                    <p className="text-xl font-black text-amber-400">{xmlWarning.xmlValue.toLocaleString('es-ES')}</p>
                                    <p className="text-[9px] text-amber-400/40 mt-0.5">kWh/año</p>
                                </div>
                            </div>
                            <div className="px-4 py-2 border-t border-white/[0.04] bg-amber-500/5 text-center">
                                <span className="text-[10px] font-bold text-amber-400">
                                    Déficit: −{Math.abs(xmlWarning.proposalValue - xmlWarning.xmlValue).toLocaleString('es-ES')} kWh/año
                                </span>
                            </div>
                        </div>

                        <p className="text-[11px] text-white/45 text-center mb-5 leading-relaxed">
                            {xmlWarning.type === 'demand'
                                ? 'La demanda certificada debe igualar o superar la de la propuesta para garantizar el Bono CAE. Confirma los datos con el técnico certificador.'
                                : 'El ahorro real certificado debe igualar o superar el simulado en la propuesta. Confirma los datos con el técnico certificador.'}
                        </p>

                        <button
                            onClick={() => setXmlWarning(null)}
                            className="w-full py-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[11px] font-black uppercase tracking-widest rounded-xl hover:bg-amber-500/20 transition-all"
                        >
                            Entendido · Continuar bajo mi responsabilidad
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
