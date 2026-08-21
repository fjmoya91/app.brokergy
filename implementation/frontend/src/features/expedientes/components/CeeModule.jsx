import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { parseCeeXml } from '../../calculator/logic/xmlCeeParser';
import { FACTORES_PASO, calculateRes080, calculateRes080FromEmissions, calculateRes080Simplificado, calculateRes080SimplificadoFromXml, combustiblesNoElectricos } from '../../calculator/logic/calculation';
import { ceeToColumn } from '../../calculator/logic/ceeSeed';
import CeeUploadModal from '../../cee/CeeUploadModal';
import { ceeToXmlShape } from '../../cee/ceeExtract';
import { EfficiencyTable, CATEGORIES_SIMPLIFICADO } from '../../calculator/components/EfficiencyTable';
import { CeeDocumentsGrid } from './CeeDocumentsGrid';
import { TecnicoPicker } from './TecnicoPicker';
import { telefonoDe, emailDe } from '../../../utils/contactoPrescriptor';
import { MensajeEditable } from './MensajeEditable';
import { buildCertApproveMessage, buildCertDefaultMessage } from '../logic/certMessages';
import { fireSuccessConfetti } from '../utils/successConfetti';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

// El backend normalizeData guarda todos los strings en MAYÚSCULAS.
// Esta función devuelve la clave correcta de FACTORES_PASO (case-insensitive).
function normalizeCombKey(val) {
    if (!val) return null;
    if (FACTORES_PASO[val] !== undefined) return val;
    const lower = val.toLowerCase();
    return Object.keys(FACTORES_PASO).find(k => k.toLowerCase() === lower) || null;
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function CeeModule({ expediente, onSave, onLiveUpdate, onRefresh, saving, certificadores = [], onAutoStatus, onEditCliente }) {
    const isReforma = expediente?.oportunidades?.ficha === 'RES080' || expediente?.cee?.is_reforma;

    const [local, setLocal] = useState(() => {
        const saved = expediente?.cee || {};
        return {
            tipo: 'xml',
            is_reforma: isReforma,
            cee_inicial: null,
            cee_final: null,
            acs_method: 'xml',
            num_rooms: 4,
            // D_ACS en kWh/año introducida a mano (solo modo 'manual', ficha TER100).
            dacs_manual: null,
            certificador_id: null,
            // Los comb_* (acs/cal/ref · inicial/final) se inicializan más abajo, en el
            // bloque de normalización (tras ...saved), con su mismo valor por defecto.
            // No declararlos aquí evita claves duplicadas en el literal.
            cee_files: {
                inicial: { pdf: null, xml: null, cex: null, registro: null, etiqueta: null, otros: [] },
                final: { pdf: null, xml: null, cex: null, registro: null, etiqueta: null, otros: [] }
            },
            ...saved,
            // Normalizar combustibles que el backend pudo haber guardado en MAYÚSCULAS
            comb_acs_inicial: normalizeCombKey(saved.comb_acs_inicial) || 'Gasoleo Calefacción',
            comb_acs_final:   normalizeCombKey(saved.comb_acs_final)   || 'Electricidad peninsular',
            comb_cal_inicial: normalizeCombKey(saved.comb_cal_inicial) || 'Gasoleo Calefacción',
            comb_cal_final:   normalizeCombKey(saved.comb_cal_final)   || 'Electricidad peninsular',
            comb_ref_inicial: normalizeCombKey(saved.comb_ref_inicial) || 'Electricidad peninsular',
            comb_ref_final:   normalizeCombKey(saved.comb_ref_final)   || 'Electricidad peninsular',
            // Fuente del cálculo RES080: 'xml' (desde .xml) | 'manual' (emisiones a mano).
            // El backend puede haber guardado el string en MAYÚSCULAS → comparar en minúsculas.
            cee_source: (String(saved.cee_source || '').toLowerCase() === 'manual') ? 'manual' : 'xml',
            emisiones_manual: saved.emisiones_manual || { acs_ini: '', acs_fin: '', cal_ini: '', cal_fin: '', ref_ini: '', ref_fin: '' },
            // Método del ahorro RES080: 'detallado' (por uso) | 'simplificado' (por vector
            // energético: consumo eléctrico / otros combustibles). El simplificado es el único
            // aplicable cuando un mismo uso mezcla dos generadores de combustibles distintos.
            // Mismo gotcha de MAYÚSCULAS que cee_source → comparar en minúsculas.
            metodo_ahorro: (String(saved.metodo_ahorro || '').toLowerCase() === 'simplificado') ? 'simplificado' : 'detallado',
            comb_otros_inicial: normalizeCombKey(saved.comb_otros_inicial) || '',
            comb_otros_final:   normalizeCombKey(saved.comb_otros_final)   || '',
            // Superficie inicial y final (pueden diferir; CEEs de técnicos distintos).
            // Compat: si había una sola `superficie_manual`, se usa para ambas.
            superficie_manual: saved.superficie_manual ?? '',
            superficie_manual_inicial: saved.superficie_manual_inicial ?? saved.superficie_manual ?? '',
            superficie_manual_final: saved.superficie_manual_final ?? saved.superficie_manual ?? '',
        };
    });

    const [showXmlModal, setShowXmlModal] = useState(false);
    const [xmlError, setXmlError] = useState(null);
    const [xmlFinalError, setXmlFinalError] = useState(null);
    // Carga de CEE por fichero (XML/OCR) para el modo manual: 'inicial' | 'final' | null.
    const [ceeLoadTarget, setCeeLoadTarget] = useState(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isDraggingFinal, setIsDraggingFinal] = useState(false);
    // Autoguardado: el módulo siempre está editable, sin botón "Editar Módulo".
    const editMode = true;
    const [xmlWarning, setXmlWarning] = useState(null);

    // ─── Estado para popup de notificación al certificador ─────────────────
    const [showCertPopup, setShowCertPopup] = useState(false);
    const [certNotifLoading, setCertNotifLoading] = useState(false);
    const [certNotifResult, setCertNotifResult] = useState(null);
    const [certPriority, setCertPriority] = useState('normal');
    const [certAdminMessage, setCertAdminMessage] = useState('');
    // Mensaje de encargo editable (previsualización), homogéneo con el popup de la campana.
    const [certAssignMessage, setCertAssignMessage] = useState('');
    const [certChannels, setCertChannels] = useState(['email']); // 'email' | 'whatsapp'
    const savedCertId = useRef(expediente?.cee?.certificador_id || null);

    // ─── Estado para popup de validación (approve-cee) ─────────────────────
    const [showApprovePopup, setShowApprovePopup] = useState(false);
    const [approveLoading, setApproveLoading] = useState(false);
    const [approveResult, setApproveResult] = useState(null);
    const [approveMessage, setApproveMessage] = useState('');
    const [approvePendingPhase, setApprovePendingPhase] = useState(null);
    const [approveChannels, setApproveChannels] = useState(['email']);
    const [approveAttachFiles, setApproveAttachFiles] = useState(false);
    // Prioridad del visto bueno: 'normal' | 'urgent'. En urgente el mensaje lleva 🚨
    // y el email sale marcado como urgente (mismo criterio que el popup de notificar).
    const [approvePriority, setApprovePriority] = useState('normal');
    // Nota adicional: texto libre que se añade al final del mensaje (WhatsApp y email)
    // sin tocar la plantilla, para poder restaurarla sin perder la nota.
    const [approveNota, setApproveNota] = useState('');
    // Enlaces (descarga carpeta CEE + subida del CEE registrado) que el backend
    // añadirá al mensaje. Se muestran en el preview para que el admin los vea.
    const [approveLinks, setApproveLinks] = useState(null);

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

    // Marcador estable en el texto de la incidencia: es lo que permite no volver a
    // abrirla si ya está registrada (el certificador puede resubir el .xml varias
    // veces mientras corrige).
    const MARCA_INC_DEMANDA = '[CEE-DEMANDA]';

    /**
     * Registra como incidencia GRAVE que la demanda de calefacción del CEE final no
     * coincide con la del inicial. El popup solo avisa en el momento y se cierra
     * clicando fuera: sin esto, quien no estuviera delante no se entera nunca y el
     * expediente viaja al verificador con dos certificados que se contradicen.
     * Best-effort: si falla, el aviso visual ya ha salido y no se bloquea nada.
     */
    const registrarIncidenciaDemanda = async (iniValue, finValue) => {
        if (!expediente?.id) return;
        const yaAbierta = (expediente?.documentacion?.incidencias || []).some(
            i => i.estado === 'ABIERTA' && String(i.texto || '').includes(MARCA_INC_DEMANDA)
        );
        if (yaAbierta) return;
        const diff = Math.abs(iniValue - finValue);
        const pct = iniValue > 0 ? Math.round((diff / iniValue) * 1000) / 10 : 0;
        try {
            await axios.post(`/api/expedientes/${expediente.id}/incidencias`, {
                texto: `${MARCA_INC_DEMANDA} La demanda de calefacción del CEE FINAL no coincide con la del INICIAL: `
                    + `${iniValue.toLocaleString('es-ES')} kWh/año en el inicial frente a ${finValue.toLocaleString('es-ES')} kWh/año en el final `
                    + `(${diff.toLocaleString('es-ES')} kWh/año, ${pct} %). `
                    + `En esta ficha la actuación es sustituir el generador y la envolvente no se toca, así que la demanda debe ser la misma. `
                    + `Detectado automáticamente al subir el .xml del CEE final.`,
                procedencia: 'AGENTE_IA',
                severidad: 'GRAVE',
            });
        } catch (err) {
            console.warn('[incidencia demanda CEE] no se pudo registrar:', err.message);
        }
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
                } else if (isFinal && !isReforma) {
                    // RES060/RES093: comprobar que la demanda del CEE final coincida con la del inicial
                    const ceeIni = nextLocal.cee_inicial || local.cee_inicial;
                    if (ceeIni) {
                        const iniSup = parseFloat(ceeIni.superficieHabitable) || 0;
                        const finSup = parseFloat(parsed.superficieHabitable) || 0;
                        const iniDemanda = (parseFloat(ceeIni.demandaCalefaccion) || 0) * iniSup;
                        const finDemanda = (parseFloat(parsed.demandaCalefaccion) || 0) * finSup;
                        // Tolerancia del 2% — diferencias pequeñas son por redondeo en el .cex
                        if (iniDemanda > 0 && finDemanda > 0 && Math.abs(iniDemanda - finDemanda) > iniDemanda * 0.02) {
                            setXmlWarning({
                                type: 'demanda_mismatch',
                                iniValue: Math.round(iniDemanda),
                                finValue: Math.round(finDemanda),
                            });
                            registrarIncidenciaDemanda(Math.round(iniDemanda), Math.round(finDemanda));
                        } else {
                            setXmlWarning(null);
                        }
                    } else {
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

    // Cambio de certificador: si es distinto del ya guardado, abre el popup de
    // notificación (asignar + avisar) en vez de guardar directamente.
    const handleCertificadorChange = (v) => {
        const newCertId = v || null;
        const nextLocal = { ...local, certificador_id: newCertId };
        setLocal(nextLocal);
        if (newCertId && newCertId !== savedCertId.current) {
            const certObj = certificadores.find(c => String(c.id_empresa) === String(newCertId));
            const certName = certObj ? (certObj.razon_social || certObj.acronimo) : '';
            setShowCertPopup(true);
            setCertNotifResult(null);
            setCertPriority('normal');
            setCertAdminMessage('');
            setCertChannels(['email']);
            // Previsualización editable del mensaje de encargo (igual que el popup de la campana).
            setCertAssignMessage(buildCertDefaultMessage('standard', 'inicial', certName, clienteNombre, numExp, ceeFolderLink, expedienteId));
        } else {
            onSave({ cee: nextLocal });
        }
    };

    const handleCertConfirm = async (notify) => {
        // Persistir el resto del CEE (XML, fechas, ACS, etc) — el backend del endpoint
        // se encargará de persistir cert_id, dar acceso Drive y enviar el email si aplica.
        try {
            const maybePromise = onSave({ cee: local });
            if (maybePromise && typeof maybePromise.then === 'function') {
                await maybePromise;
            }
        } catch (_) {
            setCertNotifResult({ type: 'error', text: 'No se pudo guardar el módulo. Inténtalo de nuevo.' });
            return;
        }
        savedCertId.current = local.certificador_id;

        if (!expediente?.id) {
            setCertNotifResult({ type: 'error', text: 'Expediente no disponible.' });
            return;
        }

        // Pre-validación del email del cert (solo si vamos a notificar por email)
        const localCert = certificadores.find(c => String(c.id_empresa) === String(local.certificador_id));
        const knownEmail = localCert?.email;
        const knownPhone = localCert?.telefono || localCert?.movil || localCert?.tlf || null;

        const wantsEmail = notify && certChannels.includes('email');
        const wantsWA = notify && certChannels.includes('whatsapp');

        if (wantsEmail && !knownEmail) {
            setCertNotifResult({
                type: 'error',
                text: `${localCert?.razon_social || 'El certificador'} no tiene email registrado en su ficha. Edítalo desde Prescriptores.`
            });
            return;
        }
        if (wantsWA && !knownPhone) {
            setCertNotifResult({
                type: 'error',
                text: `${localCert?.razon_social || 'El certificador'} no tiene teléfono registrado en su ficha. Edítalo desde Prescriptores.`
            });
            return;
        }
        if (notify && !wantsEmail && !wantsWA) {
            setCertNotifResult({
                type: 'error',
                text: 'Selecciona al menos un canal (Email o WhatsApp).'
            });
            return;
        }

        setCertNotifLoading(true);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/notify-certificador`, {
                certificador_id: local.certificador_id,
                sendEmail: wantsEmail,
                sendWhatsApp: wantsWA,
                phase: 'initial',
                template: 'standard',
                priority: certPriority,
                adminMessage: certAdminMessage.trim() || null,
                // Cuerpo editable del encargo (previsualización). Solo aplica si se notifica.
                customMessage: notify ? (certAssignMessage.trim() || null) : null
            });

            const driveOk = data?.driveAccessGranted;
            if (notify) {
                const chans = data?.channels || [];
                const driveMsg = driveOk ? ' Tiene acceso de edición a la carpeta CEE.' : '';
                const sentText = chans.length > 0
                    ? `Enviado vía ${chans.join(' + ')}${data?.sentTo ? ' (' + data.sentTo + ')' : ''}.`
                    : `Notificación enviada.`;
                setCertNotifResult({ type: 'ok', text: `${sentText}${driveMsg}` });
                fireSuccessConfetti();
            } else {
                const driveMsg = driveOk
                    ? `Certificador asignado. ${localCert?.razon_social || 'El cert'} tiene acceso de edición a la carpeta CEE.`
                    : 'Certificador asignado correctamente.';
                setCertNotifResult({ type: 'ok', text: driveMsg });
            }
            // Refrescar para que cee_folder_link aparezca en la UI (botón "Carpeta CEE")
            if (onRefresh) onRefresh();
        } catch (err) {
            const msg = err.response?.data?.error || (notify ? 'Error al enviar la notificación' : 'Error al asignar el certificador');
            setCertNotifResult({ type: 'error', text: msg });
        } finally {
            setCertNotifLoading(false);
        }
    };

    // Nombre del cliente y enlace a la carpeta CEE, para prerellenar el mensaje de visto bueno
    // (mismos fallbacks que el popup de notificar y que el backend).
    const clienteNombre = (() => {
        const c = expediente?.clientes;
        const full = c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '';
        return full || expediente?.oportunidades?.referencia_cliente || '';
    })();
    const ceeFolderLink = expediente?.cee?.cee_folder_link || null;
    const numExp = expediente?.numero_expediente || 'S-EXP';
    // Deep-link al expediente para incrustarlo en los mensajes al certificador.
    const expedienteId = expediente?.id || null;

    // Abre el popup de "Validar" prerellenando el mensaje editable de visto bueno.
    const openApprovePopup = (phase) => {
        const section = phase === 'final' ? 'final' : 'inicial';
        setApprovePendingPhase(phase);
        setApproveChannels(['email']);
        setApproveAttachFiles(false);
        setApproveNota('');
        setApprovePriority('normal');
        setApproveMessage(buildCertApproveMessage(section, selectedCertName, clienteNombre, numExp, ceeFolderLink, expedienteId, 'normal'));
        setApproveResult(null);
        setApproveLinks(null);
        // Cargar los enlaces reales (descarga + subida) para mostrarlos en el preview.
        if (expediente?.id) {
            axios.get(`/api/expedientes/${expediente.id}/approve-cee-links?phase=${section}`)
                .then(r => setApproveLinks(r.data))
                .catch(() => setApproveLinks(null));
        }
        setShowApprovePopup(true);
    };

    // Plantilla de visto bueno para la prioridad indicada (normal / urgente).
    const approveTemplateFor = (prio) => buildCertApproveMessage(
        approvePendingPhase === 'final' ? 'final' : 'inicial',
        selectedCertName, clienteNombre, numExp, ceeFolderLink, expedienteId, prio
    );

    // Cambio de prioridad: regenera SIEMPRE la plantilla de esa prioridad (mismo
    // criterio que el selector de tipo de mensaje del grid). Intentar "preservar la
    // edición" dejaba el texto en la plantilla anterior, que es justo lo que no
    // queremos al pulsar "Urgente". Lo escrito en "Nota adicional" no se toca.
    const changeApprovePriority = (prio) => {
        setApprovePriority(prio);
        setApproveMessage(approveTemplateFor(prio));
    };

    // Visto bueno enviado DIRECTAMENTE desde el popup de la campana (sin abrir el popup
    // dedicado de Validar). Parametriza approve-cee con fase/canales/mensaje editado y
    // devuelve la respuesta para que el grid muestre el estado real por canal.
    const submitApprove = async (phase, channels, customMessage, attachFiles = false) => {
        if (!expediente?.id) throw new Error('Expediente no disponible');
        const { data } = await axios.post(`/api/expedientes/${expediente.id}/approve-cee`, {
            phase,
            sendEmail: channels.includes('email'),
            sendWhatsApp: channels.includes('whatsapp'),
            customMessage: (customMessage || '').trim() || null,
            attachFiles: !!attachFiles && channels.includes('email'),
        });
        fireSuccessConfetti();
        if (onRefresh) onRefresh();
        return data;
    };

    const handleApproveConfirm = async () => {
        if (!expediente?.id || !approvePendingPhase) return;
        setApproveLoading(true);
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/approve-cee`, {
                phase: approvePendingPhase,
                sendEmail: approveChannels.includes('email'),
                sendWhatsApp: approveChannels.includes('whatsapp'),
                customMessage: approveMessage.trim() || null,
                notaAdicional: approveNota.trim() || null,
                attachFiles: approveAttachFiles && approveChannels.includes('email'),
                priority: approvePriority
            });
            const phaseLabel = approvePendingPhase === 'final' ? 'CEE Final' : 'CEE Inicial';
            // Feedback real por canal (el backend devuelve el estado de cada envío).
            const parts = [];
            if (approveChannels.includes('email')) parts.push(data.emailSent ? '✉️ Email enviado' : '✉️ Email NO enviado');
            if (approveChannels.includes('whatsapp')) {
                if (data.whatsAppSent) parts.push(data.waReason === 'encolado' ? '💬 WhatsApp encolado (se enviará al reconectar)' : '💬 WhatsApp enviado');
                else parts.push(data.waReason === 'sin_telefono' ? '💬 WhatsApp NO enviado (certificador sin teléfono)' : '💬 WhatsApp NO enviado');
            }
            setApproveResult({
                type: 'ok',
                text: `${phaseLabel} validado. ${parts.join(' · ')}`
            });
            fireSuccessConfetti();
            if (onRefresh) onRefresh();
        } catch (err) {
            setApproveResult({ type: 'error', text: err.response?.data?.error || 'Error al aprobar el CEE' });
        } finally {
            setApproveLoading(false);
        }
    };

    // Fuente manual (sin .xml): comparar en minúsculas por la normalización del backend.
    const isManualSource = String(local.cee_source || '').toLowerCase() === 'manual';

    // Método del ahorro: por USO (detallado) o por VECTOR energético (simplificado).
    const esSimplificado = String(local.metodo_ahorro || '').toLowerCase() === 'simplificado';

    const res080Data = (() => {
        if (!isReforma) return null;
        if (isManualSource && esSimplificado) {
            const em = local.emisiones_manual || {};
            const supFallback = local.superficie_manual || expediente?.oportunidades?.datos_calculo?.surface;
            return calculateRes080Simplificado({
                emiElecIni: em.electrico_ini, emiElecFin: em.electrico_fin,
                emiOtrosIni: em.otros_ini, emiOtrosFin: em.otros_fin,
                combOtrosIni: local.comb_otros_inicial,
                combOtrosFin: local.comb_otros_final,
                superficieInicial: local.superficie_manual_inicial || supFallback,
                superficieFinal: local.superficie_manual_final || local.superficie_manual_inicial || supFallback
            });
        }
        if (isManualSource) {
            const em = local.emisiones_manual || {};
            const supFallback = local.superficie_manual || expediente?.oportunidades?.datos_calculo?.surface;
            return calculateRes080FromEmissions({
                emiAcsIni: em.acs_ini, emiAcsFin: em.acs_fin,
                emiCalIni: em.cal_ini, emiCalFin: em.cal_fin,
                emiRefIni: em.ref_ini, emiRefFin: em.ref_fin,
                combAcsInicial: local.comb_acs_inicial,
                combAcsFinal: local.comb_acs_final,
                combCalefaccionInicial: local.comb_cal_inicial,
                combCalefaccionFinal: local.comb_cal_final,
                combRefrigeracionInicial: local.comb_ref_inicial,
                combRefrigeracionFinal: local.comb_ref_final,
                superficieInicial: local.superficie_manual_inicial || supFallback,
                superficieFinal: local.superficie_manual_final || local.superficie_manual_inicial || supFallback
            });
        }
        if (local.cee_inicial && local.cee_final) {
            // Con los dos .xml, el simplificado sale EXACTO: el propio certificado publica
            // el reparto por vector en <EmisionesCO2><ConsumoElectrico>/<ConsumoOtros>.
            if (esSimplificado) {
                return calculateRes080SimplificadoFromXml({
                    xmlInicial: local.cee_inicial,
                    xmlFinal: local.cee_final,
                    combOtrosIni: local.comb_otros_inicial,
                    combOtrosFin: local.comb_otros_final,
                    superficieCustom: local.superficie_custom,
                });
            }
            return calculateRes080({
                xmlInicial: local.cee_inicial,
                xmlFinal: local.cee_final,
                combAcsInicial: local.comb_acs_inicial,
                combAcsFinal: local.comb_acs_final,
                combCalefaccionInicial: local.comb_cal_inicial,
                combCalefaccionFinal: local.comb_cal_final,
                combRefrigeracionInicial: local.comb_ref_inicial,
                combRefrigeracionFinal: local.comb_ref_final
            });
        }
        return null;
    })();

    // Mostrar con coma decimal (ES). Normalizar lo tecleado a coma.
    const ceeComma = (v) => (v === '' || v === null || v === undefined) ? '' : String(v).replace('.', ',');
    const ceeNormComma = (s) => (String(s).includes(',') ? String(s) : String(s).replace('.', ','));

    // Draft crudo para los inputs de emisiones (modo manual): lo que se teclea, sin
    // recalcular, para que el input no pelee con el re-render del motor (con coma decimal).
    // Las claves del draft son las mismas `type` que usa EfficiencyTable en sus onChange,
    // así que cada método declara las suyas: acs/cal/ref (detallado) o electrico/otros
    // (simplificado). Ambas viven en el MISMO `emisiones_manual`, con prefijos distintos:
    // cambiar de método y volver no puede borrar lo ya tecleado en el otro.
    const emissionDraft = esSimplificado ? {
        electrico: { ini: ceeComma(local.emisiones_manual?.electrico_ini), fin: ceeComma(local.emisiones_manual?.electrico_fin) },
        otros: { ini: ceeComma(local.emisiones_manual?.otros_ini), fin: ceeComma(local.emisiones_manual?.otros_fin) },
    } : {
        acs: { ini: ceeComma(local.emisiones_manual?.acs_ini), fin: ceeComma(local.emisiones_manual?.acs_fin) },
        cal: { ini: ceeComma(local.emisiones_manual?.cal_ini), fin: ceeComma(local.emisiones_manual?.cal_fin) },
        ref: { ini: ceeComma(local.emisiones_manual?.ref_ini), fin: ceeComma(local.emisiones_manual?.ref_fin) },
    };

    // type ∈ 'acs'|'cal'|'ref' (detallado) o 'electrico'|'otros' (simplificado)
    const handleEmissionChange = (type, isFinal, value) => {
        const key = `${type}_${isFinal ? 'fin' : 'ini'}`;
        const nextLocal = {
            ...local,
            emisiones_manual: { ...(local.emisiones_manual || {}), [key]: ceeNormComma(value) },
        };
        setLocal(nextLocal);
        onSave({ cee: nextLocal });
    };

    // Superficie inicial/final (modo manual), editable desde la fila de la tabla.
    const handleSuperficieChange = (isFinal, value) => {
        const key = isFinal ? 'superficie_manual_final' : 'superficie_manual_inicial';
        const nextLocal = { ...local, [key]: ceeNormComma(value) };
        setLocal(nextLocal);
        onSave({ cee: nextLocal });
    };
    const supDraft = {
        ini: ceeComma(local.superficie_manual_inicial),
        fin: ceeComma(local.superficie_manual_final),
    };

    // ¿La energía final se LEE del certificado (<EnergiaFinalVectores>) o se reconstruye
    // dividiendo emisiones entre su factor de paso?
    const esDeclarada = res080Data?.fuenteDatos === 'energia_final_declarada';
    // La restricción de "un único combustible no eléctrico" es de la vía por EMISIONES:
    // allí «otros combustibles» es UNA cifra de CO₂ que hay que dividir por UN factor.
    // Leyendo la energía final cada vector viene por separado y en kWh, así que sumar dos
    // combustibles es legítimo y no hay nada que avisar.
    const mezclaCombustibles = esDeclarada ? null : combustiblesNoElectricos({
        acs: local.comb_acs_inicial, cal: local.comb_cal_inicial, ref: local.comb_ref_inicial,
    });
    // Con .xml pero SIN energía final declarada, las emisiones salen del certificado pero el
    // COMBUSTIBLE no siempre: si el XML declara dos no eléctricos, `combustibleOtros` viene
    // null y no hay factor que aplicar. Se avisa y se elige en la fila «Otros combustibles».
    const faltaCombOtros = esSimplificado && !isManualSource && !esDeclarada
        && !(local.comb_otros_inicial || local.cee_inicial?.combustibleOtros)
        && Number(local.cee_inicial?.emisionesConsumoOtros) > 0;

    // Cargar un CEE por fichero (XML exacto u OCR IA) y volcarlo a la columna (inicial/final)
    // del expediente.
    //
    // RES060/RES093 (sin reforma): CeeDocumentsGrid lee `cee_inicial`/`cee_final` con la
    // MISMA forma que produce parseCeeXml() — así que aquí reproducimos EXACTAMENTE ese
    // efecto (demanda, superficie, combustible, fechas) como si se hubiera subido el .xml.
    //
    // RES080 (reforma): la tabla es de emisiones (emisiones_manual/comb_*/superficie_manual_*),
    // así que seguimos el flujo previo. Si la otra columna venía de un XML cargado, migramos
    // SUS emisiones a manual para no perderla (el path manual solo lee emisiones_manual).
    const applyCeeToExpediente = (data, target) => {
        const isFinal = target === 'final';

        if (!isReforma) {
            const xmlShaped = ceeToXmlShape(data);
            const nextLocal = {
                ...local,
                [isFinal ? 'cee_final' : 'cee_inicial']: xmlShaped,
                [isFinal ? 'fecha_visita_cee_final' : 'fecha_visita_cee_inicial']: xmlShaped.fechaVisita || local[isFinal ? 'fecha_visita_cee_final' : 'fecha_visita_cee_inicial'],
                [isFinal ? 'fecha_firma_cee_final' : 'fecha_firma_cee_inicial']: xmlShaped.fechaFirma || local[isFinal ? 'fecha_firma_cee_final' : 'fecha_firma_cee_inicial'],
                [isFinal ? 'comb_acs_final' : 'comb_acs_inicial']: xmlShaped.combustibleACS || local[isFinal ? 'comb_acs_final' : 'comb_acs_inicial'],
                [isFinal ? 'comb_cal_final' : 'comb_cal_inicial']: xmlShaped.combustibleCalefaccion || local[isFinal ? 'comb_cal_final' : 'comb_cal_inicial'],
            };
            setLocal(nextLocal);
            onSave({ cee: nextLocal });
            return;
        }

        const has = (v) => v !== undefined && v !== '' && v !== null;
        const em = { ...(local.emisiones_manual || {}) };
        const next = { ...local, cee_source: 'manual' };

        // Vuelca los valores de una columna (obj con emiAcs/emiCal/emiRef/combAcs/... /sup) al
        // lado 'ini'|'fin'. Solo escribe lo que tenga valor; refrigeración vacía → electricidad.
        const setCol = (col, side) => {
            if (!col) return;
            const sufComb = side === 'fin' ? 'final' : 'inicial';
            if (has(col.emiAcs)) em[`acs_${side}`] = ceeComma(col.emiAcs);
            if (has(col.emiCal)) em[`cal_${side}`] = ceeComma(col.emiCal);
            if (has(col.emiRef)) em[`ref_${side}`] = ceeComma(col.emiRef);
            next[`comb_acs_${sufComb}`] = col.combAcs || 'Gas Natural';
            next[`comb_cal_${sufComb}`] = col.combCal || 'Gas Natural';
            next[`comb_ref_${sufComb}`] = col.combRef || 'Electricidad peninsular';
            if (has(col.sup)) next[`superficie_manual_${sufComb}`] = ceeComma(col.sup);
            // Celdas del método SIMPLIFICADO (solo llegan por OCR: el .xml no publica el
            // reparto por vector). Se vuelcan siempre, esté activo el método o no — así el
            // dato está listo si luego se cambia de método.
            if (has(col.emiElec)) em[`electrico_${side}`] = ceeComma(col.emiElec);
            if (has(col.emiOtros)) em[`otros_${side}`] = ceeComma(col.emiOtros);
            if (has(col.combOtros)) next[`comb_otros_${sufComb}`] = col.combOtros;
        };
        // Emisiones de una columna a partir de un objeto XML ya cargado (parseCeeXml).
        const colFromXml = (xmlObj) => xmlObj ? {
            emiAcs: xmlObj.emisionesACS, emiCal: xmlObj.emisionesCalefaccion, emiRef: xmlObj.emisionesRefrigeracion,
            combAcs: xmlObj.combustibleACS, combCal: xmlObj.combustibleCalefaccion, combRef: xmlObj.combustibleRefrigeracion,
            sup: xmlObj.superficieHabitable,
        } : null;

        // Columna cargada (nueva).
        const c = ceeToColumn(data);
        setCol(c, isFinal ? 'fin' : 'ini');

        // Otra columna: si aún no tiene emisiones manuales pero había un XML, migrarlo.
        const otherSide = isFinal ? 'ini' : 'fin';
        const otherHasManual = ['acs', 'cal', 'ref'].some(k => has(em[`${k}_${otherSide}`]));
        if (!otherHasManual) {
            setCol(colFromXml(isFinal ? local.cee_inicial : local.cee_final), otherSide);
        }

        next.emisiones_manual = em;
        setLocal(next);
        onSave({ cee: next });
    };

    const renderRes060 = () => (
        <div className="space-y-8">
            <CeeDocumentsGrid
                expediente={expediente}
                onEditCliente={onEditCliente}
                certName={selectedCertName}
                ceeFiles={local.cee_files}
                onFilesChange={(newFiles, extraPatch) => {
                    setLocal(current => {
                        const nextFiles = typeof newFiles === 'function' ? newFiles(current.cee_files) : newFiles;
                        // extraPatch: cambios en el resto de `cee` que deben viajar en el
                        // MISMO guardado que los ficheros (p. ej. limpiar docs_validados al
                        // re-subir). Por onManualUpdate se perderían: ese usa el `local` del
                        // render, que aún no tiene los cee_files nuevos.
                        const patch = typeof extraPatch === 'function' ? extraPatch(current) : extraPatch;
                        const nextLocal = { ...current, ...(patch || {}), cee_files: nextFiles };
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
                dacsManual={local.dacs_manual}
                onManualUpdate={(patch) => {
                    const nextLocal = { ...local, ...patch };
                    setLocal(nextLocal);
                    onSave({ cee: nextLocal });
                }}
                onAutoStatus={onAutoStatus}
                onForceNotify={async (phase, channels, template, customMessage, extra = {}) => {
                    if (!local.certificador_id) {
                        alert('Asigna primero un certificador');
                        return;
                    }
                    try {
                        const { data } = await axios.post(`/api/expedientes/${expediente.id}/notify-certificador`, {
                            certificador_id: local.certificador_id,
                            sendEmail: channels.includes('email'),
                            sendWhatsApp: channels.includes('whatsapp'),
                            phase,
                            template,
                            // Dos ejes: qué esperamos (emisión/registro) y con qué tono.
                            espera: extra.espera || null,
                            tono: extra.tono || null,
                            dias: extra.dias ?? null,
                            customMessage: (customMessage || '').trim() || null,
                            priority: (extra.tono === 'urgent' || template === 'urgent') ? 'urgent' : 'normal'
                        });
                        // Éxito = confeti de papeles (efecto homogéneo con el envío de anexos).
                        fireSuccessConfetti();
                        // Solo interrumpimos con un aviso si algún canal no salió limpio.
                        const issues = [];
                        if (channels.includes('email') && !data.emailSent) issues.push('✉️ Email NO enviado');
                        if (channels.includes('whatsapp')) {
                            if (data.channels?.some(c => c.includes('encolado'))) issues.push('💬 WhatsApp encolado: se enviará cuando WhatsApp esté conectado.');
                            else if (!data.whatsAppSent) issues.push('💬 WhatsApp NO enviado (revisa el teléfono del certificador).');
                        }
                        if (issues.length) setTimeout(() => alert(issues.join('\n')), 600);
                        if (onRefresh) onRefresh();
                    } catch (err) {
                        alert(err.response?.data?.error || 'Error al notificar al certificador');
                    }
                }}
                onNotifyReview={async (phase, opts = {}) => {
                    try {
                        await axios.post(`/api/expedientes/${expediente.id}/notify-review`, {
                            phase,
                            priority: opts.priority || 'normal',
                            techMessage: opts.techMessage || null,
                        });
                        alert(opts.priority === 'urgent'
                            ? '🚨 Revisión URGENTE solicitada. Brokergy ha sido avisado.'
                            : 'Revisión solicitada correctamente. Brokergy ha sido avisado.');
                        if (onRefresh) onRefresh();
                    } catch (err) {
                        alert(err.response?.data?.error || 'Error al solicitar revisión');
                    }
                }}
                onApproveCee={openApprovePopup}
                onApproveSend={submitApprove}
            />

            {/* Cargar CEE por fichero (XML exacto u OCR IA) — alternativa a subir el .xml o
                editar a mano. Rellena cee_inicial/cee_final tal cual lo haría un .xml real. */}
            <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-center gap-2 text-slate-300 text-[10px] font-black uppercase tracking-widest shrink-0">
                    <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                    Cargar CEE por fichero
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed flex-1">
                    Sube el CEE de una columna (<b className="text-slate-300">.xml exacto</b>, o <b className="text-slate-300">PDF/fotos con OCR</b>) y rellenamos demanda de calefacción, superficie y combustible. Útil si solo tienes el PDF.
                </p>
                <div className="flex gap-2 shrink-0">
                    <button
                        type="button"
                        onClick={() => setCeeLoadTarget('inicial')}
                        className="flex items-center gap-2 px-3 py-2 max-md:flex-1 max-md:justify-center max-md:py-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                        <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        CEE inicial
                    </button>
                    <button
                        type="button"
                        onClick={() => setCeeLoadTarget('final')}
                        className="flex items-center gap-2 px-3 py-2 max-md:flex-1 max-md:justify-center max-md:py-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                    >
                        <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        CEE final
                    </button>
                </div>
            </div>
        </div>
    );

    const renderRes080 = () => (
        <div className="space-y-8">
            <CeeDocumentsGrid
                expediente={expediente}
                onEditCliente={onEditCliente}
                certName={selectedCertName}
                ceeFiles={local.cee_files}
                onFilesChange={(newFiles, extraPatch) => {
                    setLocal(current => {
                        const nextFiles = typeof newFiles === 'function' ? newFiles(current.cee_files) : newFiles;
                        // extraPatch: cambios en el resto de `cee` que deben viajar en el
                        // MISMO guardado que los ficheros (p. ej. limpiar docs_validados al
                        // re-subir). Por onManualUpdate se perderían: ese usa el `local` del
                        // render, que aún no tiene los cee_files nuevos.
                        const patch = typeof extraPatch === 'function' ? extraPatch(current) : extraPatch;
                        const nextLocal = { ...current, ...(patch || {}), cee_files: nextFiles };
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
                dacsManual={local.dacs_manual}
                onManualUpdate={(patch) => {
                    const nextLocal = { ...local, ...patch };
                    setLocal(nextLocal);
                    onSave({ cee: nextLocal });
                }}
                onAutoStatus={onAutoStatus}
                onForceNotify={async (phase, channels, template, customMessage, extra = {}) => {
                    if (!local.certificador_id) {
                        alert('Asigna primero un certificador');
                        return;
                    }
                    try {
                        const { data } = await axios.post(`/api/expedientes/${expediente.id}/notify-certificador`, {
                            certificador_id: local.certificador_id,
                            sendEmail: channels.includes('email'),
                            sendWhatsApp: channels.includes('whatsapp'),
                            phase,
                            template,
                            // Dos ejes: qué esperamos (emisión/registro) y con qué tono.
                            espera: extra.espera || null,
                            tono: extra.tono || null,
                            dias: extra.dias ?? null,
                            customMessage: (customMessage || '').trim() || null,
                            priority: (extra.tono === 'urgent' || template === 'urgent') ? 'urgent' : 'normal'
                        });
                        // Éxito = confeti de papeles (efecto homogéneo con el envío de anexos).
                        fireSuccessConfetti();
                        // Solo interrumpimos con un aviso si algún canal no salió limpio.
                        const issues = [];
                        if (channels.includes('email') && !data.emailSent) issues.push('✉️ Email NO enviado');
                        if (channels.includes('whatsapp')) {
                            if (data.channels?.some(c => c.includes('encolado'))) issues.push('💬 WhatsApp encolado: se enviará cuando WhatsApp esté conectado.');
                            else if (!data.whatsAppSent) issues.push('💬 WhatsApp NO enviado (revisa el teléfono del certificador).');
                        }
                        if (issues.length) setTimeout(() => alert(issues.join('\n')), 600);
                        if (onRefresh) onRefresh();
                    } catch (err) {
                        alert(err.response?.data?.error || 'Error al notificar al certificador');
                    }
                }}
                onNotifyReview={async (phase, opts = {}) => {
                    try {
                        await axios.post(`/api/expedientes/${expediente.id}/notify-review`, {
                            phase,
                            priority: opts.priority || 'normal',
                            techMessage: opts.techMessage || null,
                        });
                        alert(opts.priority === 'urgent'
                            ? '🚨 Revisión URGENTE solicitada. Brokergy ha sido avisado.'
                            : 'Revisión solicitada correctamente. Brokergy ha sido avisado.');
                        if (onRefresh) onRefresh();
                    } catch (err) {
                        alert(err.response?.data?.error || 'Error al solicitar revisión');
                    }
                }}
                onApproveCee={openApprovePopup}
                onApproveSend={submitApprove}
            />

            {/* En modo MANUAL (sin .xml): aviso de que todo (incluida la superficie) se edita en la tabla */}
            {isManualSource && (
                <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-4 flex items-center gap-3">
                    <div className="flex items-center gap-2 text-amber-400 text-[10px] font-black uppercase tracking-widest shrink-0">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        CEE Manual (sin XML)
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                        Edita en la tabla la <b className="text-slate-300">superficie</b> (inicial/final, pueden diferir entre CEEs), el <b className="text-slate-300">combustible</b> y las <b className="text-slate-300">emisiones</b> de CO₂ de cada consumo; el consumo y el ahorro se recalculan con el factor de paso.
                    </p>
                </div>
            )}

            {/* Cargar CEE por fichero (XML exacto u OCR IA) — disponible en cualquier modo.
                Al cargar, la tabla pasa a modo manual (editable) y la otra columna se conserva. */}
            {isReforma && (
                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-2 text-slate-300 text-[10px] font-black uppercase tracking-widest shrink-0">
                        <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                        Cargar CEE por fichero
                    </div>
                    <p className="text-[10px] text-slate-500 leading-relaxed flex-1">
                        Sube el CEE de una columna (<b className="text-slate-300">.xml exacto</b>, o <b className="text-slate-300">PDF/fotos con OCR</b>) y rellenamos emisiones, combustible y superficie. Útil si solo tienes el PDF.
                    </p>
                    <div className="flex gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => setCeeLoadTarget('inicial')}
                            className="flex items-center gap-2 px-3 py-2 max-md:flex-1 max-md:justify-center max-md:py-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                            <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            CEE inicial
                        </button>
                        <button
                            type="button"
                            onClick={() => setCeeLoadTarget('final')}
                            className="flex items-center gap-2 px-3 py-2 max-md:flex-1 max-md:justify-center max-md:py-3.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                        >
                            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            CEE final
                        </button>
                    </div>
                </div>
            )}

            {res080Data ? (
                <div className="bg-slate-900 border border-white/10 rounded-[2rem] p-8 shadow-2xl overflow-hidden">
                    <h4 className="text-sm font-black text-white uppercase tracking-widest mb-8 flex items-center gap-2">
                        <span className="w-2 h-2 bg-brand rounded-full" /> Resultados Comparativos
                    </h4>
                    {esSimplificado && (
                        <p className="-mt-5 mb-6 text-[11px] text-white/40 leading-relaxed">
                            {esDeclarada ? (
                                <>Método <b className="text-white/70">simplificado</b>: se lee la <b className="text-white/70">energía
                                final que declara el propio certificado</b> por vector energético (<i>EnergiaFinalVectores</i> del
                                .xml). No se estima nada — el ahorro es la diferencia entre los kWh del CEE anterior y el
                                posterior. Vectores con consumo:{' '}
                                <b className="text-white/70">{(res080Data?.vectores?.inicial || []).map(v => v.nombre).join(' · ') || '—'}</b>.</>
                            ) : (
                                <>Método <b className="text-white/70">simplificado</b>: el ahorro sale de las emisiones globales del
                                edificio que declara el CEE, separadas en <b className="text-white/70">consumo eléctrico</b> y
                                <b className="text-white/70"> otros combustibles</b>, divididas por su factor de paso. Se usa cuando
                                un mismo servicio tiene dos generadores y el certificado no dice qué parte consume cada uno. Solo
                                vale si en todo el edificio hay un único combustible no eléctrico.</>
                            )}
                        </p>
                    )}
                    {faltaCombOtros && (
                        <div className="-mt-2 mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                            <div className="text-[10px] font-black text-amber-300 uppercase tracking-widest mb-1">⚠️ Falta saber qué combustible es</div>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                El certificado declara emisiones por otros combustibles, pero no un único combustible no
                                eléctrico del que deducirlas. Elígelo en la fila <b className="text-white/70">«Otros
                                combustibles»</b> de la tabla: sin él no hay factor de paso que aplicar y ese consumo
                                cuenta como cero.
                            </p>
                        </div>
                    )}
                    {/* Aviso (no bloquea): con dos combustibles no eléctricos distintos, la fila
                        "otros combustibles" del CEE suma dos factores de paso y no se puede deshacer. */}
                    {esSimplificado && mezclaCombustibles?.mixto && (
                        <div className="-mt-2 mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                            <div className="text-[10px] font-black text-amber-300 uppercase tracking-widest mb-1">⚠️ Más de un combustible no eléctrico</div>
                            <p className="text-[11px] text-white/50 leading-relaxed">
                                En los usos ya cargados aparecen <b className="text-white/70">{mezclaCombustibles.lista.join(' y ')}</b>.
                                Compruébalo antes de dar el ahorro por bueno: si de verdad solo hay uno, corrige el combustible del otro uso.
                            </p>
                        </div>
                    )}
                    <EfficiencyTable
                        res080={res080Data}
                        editable={editMode}
                        categories={esSimplificado ? CATEGORIES_SIMPLIFICADO : undefined}
                        onFuelChange={(type, isFinal, value) => {
                            // 'otros' (simplificado) → comb_otros_*; el resto → comb_acs/cal/ref_*.
                            const key = `comb_${type}_${isFinal ? 'final' : 'inicial'}`;
                            const nextLocal = { ...local, [key]: value };
                            setLocal(nextLocal);
                            onSave({ cee: nextLocal });
                        }}
                        onEmissionChange={isManualSource ? handleEmissionChange : undefined}
                        emissionDraft={isManualSource ? emissionDraft : undefined}
                        superficieDraft={isManualSource ? supDraft : undefined}
                        onSuperficieChange={isManualSource ? handleSuperficieChange : undefined}
                    />
                </div>
            ) : (
                <div className="p-20 text-center bg-white/[0.01] border border-dashed border-white/10 rounded-[3rem]">
                    <p className="text-white/20 font-black uppercase tracking-widest text-xs">
                        {isManualSource ? 'Activa "Editar Módulo" e introduce las emisiones del CEE' : 'Sube los archivos XML para ver resultados'}
                    </p>
                </div>
            )}
        </div>
    );

    // Nombre y contacto del certificador seleccionado, para los popups.
    const selectedCert = certificadores.find(c => String(c.id_empresa) === String(local.certificador_id)) || null;
    const selectedCertName = selectedCert ? (selectedCert.razon_social || selectedCert.acronimo) : '';
    const selectedCertTel = telefonoDe(selectedCert);
    const selectedCertEmail = emailDe(selectedCert);

    return (
        <div className="space-y-6">
            {/* ─── Popup de validación CEE (approve-cee) ─────────────────── */}
            {showApprovePopup && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in max-md:items-end" onClick={() => { if (!approveLoading) setShowApprovePopup(false); }}>
                    <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md md:max-w-2xl w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto custom-scrollbar max-md:mx-0 max-md:p-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh] max-md:flex max-md:flex-col max-md:overflow-hidden" onClick={e => e.stopPropagation()}>
                        {approveResult ? (
                            <div className="text-center py-4 max-md:px-5 max-md:py-8">
                                <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border ${approveResult.type === 'ok' ? 'bg-emerald-500/20 border-emerald-500/30' : 'bg-red-500/20 border-red-500/30'}`}>
                                    {approveResult.type === 'ok' ? (
                                        <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                        <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    )}
                                </div>
                                <p className={`text-sm font-bold ${approveResult.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{approveResult.text}</p>
                                <button onClick={() => setShowApprovePopup(false)} className="mt-4 px-6 py-2 bg-white/5 border border-white/10 rounded-xl text-white/60 text-xs font-black uppercase hover:text-white transition-all">Cerrar</button>
                            </div>
                        ) : (
                            <>
                                <div className="flex items-center gap-3 mb-5 max-md:shrink-0 max-md:mb-0 max-md:px-5 max-md:pt-4 max-md:pb-3 max-md:border-b max-md:border-white/[0.06]">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${approvePriority === 'urgent' ? 'bg-red-500/20' : 'bg-emerald-500/20'}`}>
                                        <svg className={`w-5 h-5 ${approvePriority === 'urgent' ? 'text-red-400' : 'text-emerald-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-white uppercase tracking-widest">
                                            Validar {approvePendingPhase === 'final' ? 'CEE Final' : 'CEE Inicial'}
                                            {approvePriority === 'urgent' && <span className="text-red-400"> · 🚨 Urgente</span>}
                                        </h4>
                                        <p className="text-[10px] text-white/40">
                                            {approvePriority === 'urgent'
                                                ? 'Luz verde con petición de registro URGENTE en Industria'
                                                : 'El certificador recibirá luz verde para registrar en Industria'}
                                        </p>
                                    </div>
                                </div>

                                <div className="max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:px-5 max-md:py-4">
                                {/* Prioridad: en urgente el mensaje lleva 🚨 y el email sale marcado. */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Prioridad</p>
                                <div className="flex gap-2 mb-5">
                                    <button
                                        type="button"
                                        onClick={() => changeApprovePriority('normal')}
                                        disabled={approveLoading}
                                        className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            approvePriority === 'normal'
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >✅ Normal</button>
                                    <button
                                        type="button"
                                        onClick={() => changeApprovePriority('urgent')}
                                        disabled={approveLoading}
                                        className={`flex-1 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            approvePriority === 'urgent'
                                                ? 'bg-red-500/10 border-red-500/40 text-red-400'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >🚨 Urgente</button>
                                </div>

                                {/* Canales */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Canales</p>
                                <div className="flex gap-2 mb-5">
                                    {[
                                        { id: 'email', label: 'Email', icon: '✉️' },
                                        { id: 'whatsapp', label: 'WhatsApp', icon: '💬' }
                                    ].map(ch => (
                                        <button
                                            key={ch.id}
                                            type="button"
                                            onClick={() => setApproveChannels(prev => prev.includes(ch.id) ? prev.filter(c => c !== ch.id) : [...prev, ch.id])}
                                            disabled={approveLoading}
                                            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                                approveChannels.includes(ch.id)
                                                    ? ch.id === 'whatsapp'
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                        : 'bg-brand/10 border-brand/30 text-brand'
                                                    : 'border-white/5 text-white/20 hover:text-white/40'
                                            }`}
                                        >
                                            {/* En móvil, el número/email al que va el mensaje se lee
                                                AQUÍ: comprobarlo es justo lo que se hace antes de
                                                pulsar. En escritorio la píldora no cambia. */}
                                            <span className="flex flex-col items-center leading-tight">
                                                <span><span>{ch.icon}</span> {ch.label}</span>
                                                <span className="hidden max-md:block text-[9px] font-bold normal-case tracking-normal opacity-70 max-w-[130px] truncate">
                                                    {(ch.id === 'whatsapp' ? selectedCertTel : selectedCertEmail) || 'no consta en su ficha'}
                                                </span>
                                            </span>
                                        </button>
                                    ))}
                                </div>

                                {/* Adjuntar los archivos del CEE al email (opcional) */}
                                {approveChannels.includes('email') && (
                                    <label className="flex items-start gap-2.5 mb-5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 cursor-pointer hover:border-emerald-500/30 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={approveAttachFiles}
                                            onChange={e => setApproveAttachFiles(e.target.checked)}
                                            disabled={approveLoading}
                                            className="mt-0.5 w-4 h-4 accent-emerald-500 shrink-0"
                                        />
                                        <span className="text-[10px] text-white/60 leading-snug normal-case">
                                            <b className="text-white/80">Adjuntar los archivos del CEE al email</b> (además del enlace de descarga).
                                        </span>
                                    </label>
                                )}

                                {/* Mensaje editable (homogéneo con el popup de notificar) */}
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Mensaje al certificador</p>
                                    <button
                                        type="button"
                                        onClick={() => setApproveMessage(approveTemplateFor(approvePriority))}
                                        disabled={approveLoading}
                                        className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-emerald-400 transition-colors disabled:opacity-40"
                                        title="Restaurar el texto por defecto"
                                    >↺ Restaurar plantilla</button>
                                </div>
                                <MensajeEditable
                                    value={approveMessage}
                                    onChange={setApproveMessage}
                                    disabled={approveLoading}
                                    placeholder="Escribe el mensaje que se enviará al certificador…"
                                    rows={9}
                                    maxLength={2000}
                                    focusClass="focus:border-emerald-500/40"
                                    className="mb-1"
                                />
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-[9px] text-white/25 leading-snug">
                                        Puedes editarlo libremente.{approveChannels.includes('email') ? ' El email mantiene la cabecera de marca y los botones de acceso.' : ''}
                                    </p>
                                    <p className="text-[9px] text-white/20 shrink-0 ml-3">{approveMessage.length}/2000</p>
                                </div>

                                {/* Nota adicional: va aparte de la plantilla para que
                                    "Restaurar plantilla" no se la lleve por delante. */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Nota adicional (opcional)</p>
                                <textarea
                                    value={approveNota}
                                    onChange={e => setApproveNota(e.target.value)}
                                    disabled={approveLoading}
                                    placeholder="Cualquier aclaración para este envío concreto. Se añade al final del mensaje, en WhatsApp y en el email."
                                    rows={3}
                                    maxLength={1000}
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm leading-relaxed text-white normal-case placeholder:text-white/20 focus:outline-none focus:border-emerald-500/40 resize-none mb-1"
                                />
                                <div className="flex items-center justify-end mb-4">
                                    <p className="text-[9px] text-white/20 shrink-0">{approveNota.length}/1000</p>
                                </div>

                                {/* Enlaces que se AÑADEN automáticamente al final del mensaje. */}
                                <div className="mb-5 px-3 py-3 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/20">
                                    <p className="text-[9px] font-black text-emerald-400/80 uppercase tracking-widest mb-2">Se añadirán al mensaje automáticamente</p>
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2">
                                            <span className="text-sm leading-none mt-0.5">📥</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] text-white/70 font-bold normal-case">Descargar el CEE para presentarlo</p>
                                                {approveLinks?.presentFolderLink
                                                    ? <a href={approveLinks.presentFolderLink} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/80 hover:text-brand break-all">{approveLinks.presentFolderLink}</a>
                                                    : <p className="text-[9px] text-white/25">{approveLinks ? 'La carpeta CEE aún no existe (se creará al enviar).' : 'Cargando enlace…'}</p>}
                                            </div>
                                        </div>
                                        <div className="flex items-start gap-2">
                                            <span className="text-sm leading-none mt-0.5">📤</span>
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[10px] text-white/70 font-bold normal-case">Subir el CEE registrado (etiqueta + justificante)</p>
                                                {approveLinks?.ceeUploadLink
                                                    ? <a href={approveLinks.ceeUploadLink} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/80 hover:text-brand break-all">{approveLinks.ceeUploadLink}</a>
                                                    : <p className="text-[9px] text-white/25">Cargando enlace…</p>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                </div>

                                <div className="flex gap-3 max-md:shrink-0 max-md:px-5 max-md:pt-3 max-md:border-t max-md:border-white/[0.06] max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <button
                                        onClick={() => setShowApprovePopup(false)}
                                        disabled={approveLoading}
                                        className="flex-1 py-2.5 max-md:py-3.5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
                                    >Cancelar</button>
                                    <button
                                        onClick={handleApproveConfirm}
                                        disabled={approveLoading || approveChannels.length === 0}
                                        className={`flex-1 py-2.5 text-[11px] font-black uppercase tracking-widest rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                                            approvePriority === 'urgent'
                                                ? 'bg-red-500 text-white shadow-red-500/30'
                                                : 'bg-emerald-500 text-black shadow-emerald-500/20'
                                        }`}
                                    >
                                        {approveLoading ? (
                                            <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin" />Validando...</>
                                        ) : (approveChannels.length === 0
                                            ? 'Selecciona un canal'
                                            : `${approvePriority === 'urgent' ? '🚨 Validar URGENTE y enviar ' : '✅ Validar y enviar '}${approveChannels.map(c => c === 'email' ? 'Email' : 'WhatsApp').join(' + ')}`)}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ─── Popup de notificación al certificador ─────────────────── */}
            {showCertPopup && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in p-4 max-md:items-end max-md:p-0" onClick={() => { if (!certNotifLoading) setShowCertPopup(false); }}>
                    {/* En móvil es una hoja inferior: cabecera fija con el técnico al que
                        asignas, UN solo eje de scroll y los dos botones pegados abajo
                        respetando el área segura. Con el popup centrado, el teclado al
                        editar el mensaje dejaba el botón de enviar fuera de la pantalla. */}
                    <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl max-h-[90vh] overflow-y-auto max-md:mx-0 max-md:p-0 max-md:rounded-b-none max-md:rounded-t-3xl max-md:max-h-[92dvh] max-md:flex max-md:flex-col max-md:overflow-hidden" onClick={e => e.stopPropagation()}>
                        {certNotifResult ? (
                            <div className="text-center py-4 max-md:px-5 max-md:py-8">
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
                                <div className="flex items-center gap-3 mb-5 max-md:shrink-0 max-md:mb-0 max-md:px-5 max-md:pt-4 max-md:pb-3 max-md:border-b max-md:border-white/[0.06]">
                                    <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                    </div>
                                    <div>
                                        <h4 className="text-sm font-black text-white uppercase tracking-widest">Notificar Certificador</h4>
                                        <p className="text-[10px] text-white/40">Se asignará <span className="text-brand font-bold">{selectedCertName}</span> al expediente</p>
                                    </div>
                                </div>
                                <div className="max-md:flex-1 max-md:overflow-y-auto max-md:overscroll-contain max-md:px-5 max-md:py-4">
                                <p className="text-xs text-white/60 mb-5">¿Deseas enviar un email de notificación al certificador con los datos del expediente y el enlace a la documentación?</p>

                                {/* Prioridad */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Prioridad</p>
                                <div className="flex gap-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setCertPriority('normal')}
                                        disabled={certNotifLoading}
                                        className={`flex-1 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            certPriority === 'normal'
                                                ? 'bg-brand/10 border-brand/30 text-brand'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >📋 Normal</button>
                                    <button
                                        type="button"
                                        onClick={() => setCertPriority('urgent')}
                                        disabled={certNotifLoading}
                                        className={`flex-1 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            certPriority === 'urgent'
                                                ? 'bg-red-500/10 border-red-500/40 text-red-400'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >🚨 Urgente</button>
                                </div>

                                {/* Canales de comunicación */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Canales</p>
                                <div className="flex gap-2 mb-4">
                                    <button
                                        type="button"
                                        onClick={() => setCertChannels(prev => prev.includes('email') ? prev.filter(c => c !== 'email') : [...prev, 'email'])}
                                        disabled={certNotifLoading}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            certChannels.includes('email')
                                                ? 'bg-brand/10 border-brand/30 text-brand'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >
                                        <span className="flex flex-col items-center leading-tight">
                                            <span>✉️ Email</span>
                                            <span className="hidden max-md:block text-[9px] font-bold normal-case tracking-normal opacity-70 max-w-[130px] truncate">
                                                {selectedCertEmail || 'no consta en su ficha'}
                                            </span>
                                        </span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setCertChannels(prev => prev.includes('whatsapp') ? prev.filter(c => c !== 'whatsapp') : [...prev, 'whatsapp'])}
                                        disabled={certNotifLoading}
                                        className={`flex-1 flex items-center justify-center gap-2 py-2 max-md:py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            certChannels.includes('whatsapp')
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : 'border-white/5 text-white/20 hover:text-white/40'
                                        }`}
                                    >
                                        <span className="flex flex-col items-center leading-tight">
                                            <span>💬 WhatsApp</span>
                                            <span className="hidden max-md:block text-[9px] font-bold normal-case tracking-normal opacity-70 max-w-[130px] truncate">
                                                {selectedCertTel || 'no consta en su ficha'}
                                            </span>
                                        </span>
                                    </button>
                                </div>

                                {/* Mensaje al certificador (previsualización editable, homogéneo con el popup de la campana) */}
                                <div className="flex items-center justify-between mb-2">
                                    <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Mensaje al certificador</p>
                                    <button
                                        type="button"
                                        onClick={() => setCertAssignMessage(buildCertDefaultMessage('standard', 'inicial', selectedCertName, clienteNombre, numExp, ceeFolderLink, expedienteId))}
                                        disabled={certNotifLoading}
                                        className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors disabled:opacity-40"
                                        title="Restaurar el texto por defecto"
                                    >↺ Restaurar plantilla</button>
                                </div>
                                <MensajeEditable
                                    value={certAssignMessage}
                                    onChange={setCertAssignMessage}
                                    disabled={certNotifLoading}
                                    placeholder="Mensaje que se enviará al certificador…"
                                    rows={8}
                                    maxLength={2000}
                                    focusClass="focus:border-brand/40"
                                    className="mb-1"
                                />
                                <div className="flex items-center justify-between mb-4">
                                    <p className="text-[9px] text-white/25 leading-snug">Puedes editarlo libremente. Solo se envía si pulsas «Asignar y notificar».</p>
                                    <p className="text-[9px] text-white/20 shrink-0 ml-3">{certAssignMessage.length}/2000</p>
                                </div>

                                {/* Notas internas adicionales (se añaden al mensaje y al historial) */}
                                <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Mensaje adicional (opcional)</p>
                                <textarea
                                    value={certAdminMessage}
                                    onChange={e => setCertAdminMessage(e.target.value)}
                                    disabled={certNotifLoading}
                                    placeholder="Indicaciones específicas para el certificador (se incluyen en el email/WhatsApp y se registran en el historial)…"
                                    rows={3}
                                    className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none mb-5"
                                />

                                </div>

                                <div className="flex gap-3 max-md:shrink-0 max-md:px-5 max-md:pt-3 max-md:pb-4 max-md:border-t max-md:border-white/[0.06] max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
                                    <button
                                        onClick={() => handleCertConfirm(false)}
                                        disabled={certNotifLoading}
                                        className="flex-1 py-2.5 max-md:py-3.5 rounded-xl border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white hover:border-white/20 transition-all"
                                    >Solo asignar</button>
                                    <button
                                        onClick={() => handleCertConfirm(true)}
                                        disabled={certNotifLoading}
                                        className={`flex-1 py-2.5 max-md:py-3.5 rounded-xl text-[11px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2 ${
                                            certPriority === 'urgent'
                                                ? 'bg-red-500 text-white shadow-red-500/30'
                                                : 'bg-brand text-black'
                                        }`}
                                    >
                                        {certNotifLoading ? (
                                            <><div className="w-4 h-4 border-2 border-black/20 border-t-black rounded-full animate-spin"></div> Enviando...</>
                                        ) : (certPriority === 'urgent' ? '🚨 Asignar y avisar URGENTE' : 'Asignar y notificar')}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* Cabecera. En MÓVIL se apila y el selector de técnico sube a lo primero
                (`max-md:order-first`): en una sola fila quedaba empujado fuera de la
                pantalla por el título y los grupos de pestañas, y el módulo recorta,
                así que asignar certificador desde el teléfono era imposible. El
                escritorio no cambia: todas las reglas móviles van en `max-md:`. */}
            <div className="flex items-center justify-between flex-wrap gap-4 max-md:flex-col max-md:items-stretch max-md:gap-3">
                <div className="flex items-center gap-5 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:min-w-0">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest border-l-2 border-brand pl-4">Certs. Energéticos</h3>
                    {!isReforma && (
                        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] max-md:w-full">
                            {['xml', 'aportado'].map(t => (
                                <button
                                    key={t}
                                    onClick={() => {
                                        const nextLocal = { ...local, tipo: t };
                                        setLocal(nextLocal);
                                        onSave({ cee: nextLocal });
                                    }}
                                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer max-md:flex-1 max-md:py-3.5 max-md:text-[10px] ${
                                        local.tipo === t ? 'bg-brand text-black' : 'text-white/30'
                                    }`}
                                >
                                    {t === 'xml' ? 'Auto XML' : 'Manual'}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Reforma RES080: fuente del cálculo — desde .xml o emisiones a mano */}
                    {isReforma && (
                        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] max-md:w-full">
                            {[{ id: 'xml', label: 'Auto XML' }, { id: 'manual', label: 'Manual' }].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        const nextLocal = { ...local, cee_source: t.id };
                                        setLocal(nextLocal);
                                        onSave({ cee: nextLocal });
                                    }}
                                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer max-md:flex-1 max-md:py-3.5 max-md:text-[10px] ${
                                        (String(local.cee_source || '').toLowerCase() === t.id) ? 'bg-brand text-black' : 'text-white/30'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}
                    {/* Reforma RES080: MÉTODO del ahorro — por uso (detallado) o por vector
                        energético (simplificado). El simplificado es el único que se puede
                        aplicar cuando un mismo uso mezcla dos generadores de combustibles
                        distintos y el CEE no dice qué porcentaje es cada uno. Vale con .xml y
                        a mano: el reparto por vector lo publica el propio XML. */}
                    {isReforma && (
                        <div className="flex items-center gap-1 bg-white/[0.03] p-1 rounded-xl border border-white/[0.06] max-md:w-full">
                            {[{ id: 'detallado', label: 'Por uso' }, { id: 'simplificado', label: 'Por vector' }].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => {
                                        const nextLocal = { ...local, metodo_ahorro: t.id };
                                        setLocal(nextLocal);
                                        onSave({ cee: nextLocal });
                                    }}
                                    className={`px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer max-md:flex-1 max-md:py-3.5 max-md:text-[10px] ${
                                        (String(local.metodo_ahorro || 'detallado').toLowerCase() === t.id) ? 'bg-brand text-black' : 'text-white/30'
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="max-md:order-first max-md:w-full">
                        <TecnicoPicker
                            certificadores={certificadores}
                            value={local.certificador_id || ''}
                            onChange={handleCertificadorChange}
                        />
                    </div>
                </div>
                {saving && (
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30">Guardando…</span>
                )}
            </div>

            {isReforma ? renderRes080() : renderRes060()}

            {/* Modal de carga de CEE (XML exacto u OCR IA) — compartido entre RES060/RES093 y
                RES080, disparado por ceeLoadTarget desde cualquiera de los dos render paths. */}
            <CeeUploadModal
                isOpen={!!ceeLoadTarget}
                onClose={() => setCeeLoadTarget(null)}
                title={ceeLoadTarget === 'final' ? 'Cargar CEE final' : 'Cargar CEE inicial'}
                subtitle={isReforma
                    ? 'Sube el CEE (.xml exacto, o PDF/fotos con OCR). Rellenaremos las emisiones, el combustible y la superficie de esta columna.'
                    : 'Sube el CEE (.xml exacto, o PDF/fotos con OCR). Rellenaremos la demanda de calefacción, la superficie y el combustible de esta columna, igual que si subieras el .xml.'}
                onLoaded={(data) => { applyCeeToExpediente(data, ceeLoadTarget); setCeeLoadTarget(null); }}
            />

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
                                    {xmlWarning.type === 'demand' ? 'Demanda Inferior a la Propuesta' :
                                     xmlWarning.type === 'ahorro' ? 'Ahorro Inferior al Simulado' :
                                     'Demanda CEE Inicial ≠ Final'}
                                </h4>
                                <p className="text-[10px] text-white/35 mt-1">
                                    {xmlWarning.type === 'demanda_mismatch'
                                        ? 'En RES060/RES093 la demanda de calefacción debe ser idéntica en ambos certificados'
                                        : 'El certificado no respalda los valores comerciales'}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-hidden mb-4">
                            {xmlWarning.type === 'demanda_mismatch' ? (
                                <>
                                    <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                                        <div className="p-4 text-center">
                                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-1">CEE Inicial</p>
                                            <p className="text-xl font-black text-white">{xmlWarning.iniValue.toLocaleString('es-ES')}</p>
                                            <p className="text-[9px] text-white/25 mt-0.5">kWh/año</p>
                                        </div>
                                        <div className="p-4 text-center">
                                            <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-widest mb-1">CEE Final</p>
                                            <p className="text-xl font-black text-amber-400">{xmlWarning.finValue.toLocaleString('es-ES')}</p>
                                            <p className="text-[9px] text-amber-400/40 mt-0.5">kWh/año</p>
                                        </div>
                                    </div>
                                    <div className="px-4 py-2 border-t border-white/[0.04] bg-amber-500/5 text-center">
                                        <span className="text-[10px] font-bold text-amber-400">
                                            Diferencia: {Math.abs(xmlWarning.iniValue - xmlWarning.finValue).toLocaleString('es-ES')} kWh/año
                                        </span>
                                    </div>
                                    {/* El popup se cierra clicando fuera: si no quedara registrado,
                                        quien no estuviera delante no se enteraría nunca. */}
                                    <div className="px-4 py-2 border-t border-white/[0.04] text-center">
                                        <span className="text-[9px] text-white/30 normal-case">
                                            Queda registrado como incidencia GRAVE en el expediente.
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
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
                                </>
                            )}
                        </div>

                        <p className="text-[11px] text-white/45 text-center mb-5 leading-relaxed">
                            {xmlWarning.type === 'demand'
                                ? 'La demanda certificada debe igualar o superar la de la propuesta para garantizar el Bono CAE. Confirma los datos con el técnico certificador.'
                                : xmlWarning.type === 'ahorro'
                                ? 'El ahorro real certificado debe igualar o superar el simulado en la propuesta. Confirma los datos con el técnico certificador.'
                                : 'La demanda del CEE final debe coincidir con la del inicial para que el Bono CAE sea correcto. Comprueba con el certificador que no haya habido modificaciones de la envolvente.'}
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
