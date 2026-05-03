import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

const DOCUMENT_SLOTS = [
    { id: 'xml', label: '.XML', suffix: '.xml', accept: '.xml' },
    { id: 'pdf', label: 'PDF FIRMADO', suffix: '_fdo.pdf', accept: '.pdf' },
    { id: 'cex', label: '.CEX', suffix: '.cex', accept: '.cex' },
    { id: 'registro', label: 'REGISTRO', suffix: '_reg.pdf', accept: '.pdf' },
    { id: 'etiqueta', label: 'ETIQUETA', suffix: '_etq.pdf', accept: '.pdf' },
    { id: 'otros', label: 'OTROS', suffix: '', accept: '*', isMultiple: true },
];

function UploadItem({ 
    label, 
    value, 
    uploading, 
    onUpload, 
    onManage,
    accept, 
    isMultiple = false,
    editMode
}) {
    const inputRef = React.useRef();

    return (
        <div className="flex flex-col items-center gap-1.5 min-w-[60px]">
            <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.15em] mb-1">{label}</span>
            <div className="relative group">
                {uploading ? (
                    <div className="w-11 h-11 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                        <svg className="w-5 h-5 text-brand animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                    </div>
                ) : value && !isMultiple ? (
                    <div className="flex flex-col items-center">
                        <button 
                            onClick={onManage}
                            className="w-11 h-11 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand hover:bg-brand hover:text-bkg-deep transition-all shadow-lg shadow-brand/10"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <button 
                        onClick={editMode ? onManage : undefined}
                        className={`w-11 h-11 rounded-2xl border border-dashed flex items-center justify-center transition-all ${editMode ? 'border-white/10 text-white/20 cursor-pointer hover:bg-white/5 hover:border-brand/40 shadow-sm' : 'border-white/5 text-white/5 cursor-not-allowed'}`}
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                )}
                
                {isMultiple && value && value.length > 0 && (
                    <div className="absolute -bottom-1 -right-1 bg-brand text-black text-[8px] font-black px-1.5 py-0.5 rounded-full shadow-lg border border-black/20">
                        {value.length}
                    </div>
                )}
            </div>
        </div>
    );
}

export function CeeDocumentsGrid({ 
    expediente, 
    ceeFiles, 
    onFilesChange, 
    editMode, 
    onXmlUploaded,
    demands, // { inicial: parsedXml, final: parsedXml }
    acsMethod,
    numRooms,
    onManualUpdate,
    onAutoStatus,
    onForceNotify,
    onNotifyReview,
    onApproveCee
}) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const [uploading, setUploading] = useState({}); // path -> bool
    const [managing, setManaging] = useState(null); // { section, slot, link }
    const [isDraggingModal, setIsDraggingModal] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [previewData, setPreviewData] = useState(null); // { cal, acs }
    const [isSubstituting, setIsSubstituting] = useState(false);
    const [notifyModal, setNotifyModal] = useState(null); // { section, type }
    const [sendingNotify, setSendingNotify] = useState(false);
    const [selectedChannels, setSelectedChannels] = useState(['email', 'whatsapp']);
    const [selectedTargets, setSelectedTargets] = useState(['CLIENTE']);
    // ── Estado del modal de notificación al certificador ──
    const [certNotifyModal, setCertNotifyModal] = useState(null); // { section: 'inicial'|'final' }
    const [certTemplate, setCertTemplate] = useState('standard');
    const [certChannels, setCertChannels] = useState(['email']);
    const [sendingCertNotify, setSendingCertNotify] = useState(false);
    
    const numExp = expediente?.numero_expediente || 'S-EXP';
    const [resendingNotif, setResendingNotif] = useState(null); // 'inicial' | 'final' | null

    const handleResendCeeNotifications = async (section) => {
        const phase = section === 'final' ? 'final' : 'inicial';
        const phaseLabel = phase === 'final' ? 'CEE Final' : 'CEE Inicial';
        const confirmed = await showConfirm(
            `¿Reenviar las notificaciones de registro del ${phaseLabel} a cliente, admin y partner?`,
            'Reenviar notificación',
            'info'
        );
        if (!confirmed) return;

        setResendingNotif(section);
        try {
            const res = await axios.post(`/api/expedientes/${expediente.id}/resend-cee-notifications`, { phase });
            const r = res.data || {};
            if (r.ok) {
                const wa = r.channels?.whatsapp?.join(', ') || '—';
                const em = r.channels?.email?.join(', ') || '—';
                showAlert(
                    `Notificaciones reenviadas.\nWhatsApp [${wa}] (estado: ${r.whatsappState || '?'})\nEmail [${em}]`,
                    'Reenvío OK',
                    'success'
                );
            } else {
                showAlert(`No se pudo completar el reenvío: ${r.reason || 'error desconocido'}`, 'Error', 'error');
            }
        } catch (err) {
            console.error('[resend-cee-notifications]', err);
            showAlert(err.response?.data?.error || err.message || 'Error de red', 'Error reenviando', 'error');
        } finally {
            setResendingNotif(null);
        }
    };

    const parseXmlForPreview = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const text = e.target.result;
                    const parser = new DOMParser();
                    const xmlDoc = parser.parseFromString(text, "text/xml");
                    
                    const findNode = (parent, tag) => {
                        const exact = parent.getElementsByTagName(tag);
                        if (exact.length > 0) return exact[0];
                        const all = parent.getElementsByTagName('*');
                        const search = tag.toLowerCase();
                        for (let i = 0; i < all.length; i++) {
                            if (all[i].localName.toLowerCase() === search) return all[i];
                        }
                        return null;
                    };

                    const demandaNode = findNode(xmlDoc, 'Demanda');
                    const edificioNode = demandaNode ? findNode(demandaNode, 'EdificioObjeto') : null;

                    const getTagValue = (tag) => {
                        const el = edificioNode ? findNode(edificioNode, tag) : findNode(xmlDoc, tag);
                        if (!el) return '—';
                        const val = parseFloat(el.textContent.replace(',', '.'));
                        return isNaN(val) ? '—' : val.toFixed(2);
                    };
                    
                    resolve({
                        cal: getTagValue('Calefaccion'),
                        acs: getTagValue('ACS')
                    });
                } catch (err) {
                    console.error("Preview parse error:", err);
                    resolve({ cal: '—', acs: '—' });
                }
            };
            reader.readAsText(file);
        });
    };

    const handleFileSelect = async (fileOrFiles) => {
        if (!fileOrFiles) return;
        const files = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles)) 
            ? Array.from(fileOrFiles) 
            : [fileOrFiles];

        setPendingFiles(files);
        
        // Solo previsualizamos el primer XML si es el caso
        if (managing.slot.id === 'xml' && files[0]) {
            const preview = await parseXmlForPreview(files[0]);
            setPreviewData(preview);
        }
    };

    const confirmSubstitution = () => {
        if (pendingFiles.length > 0) {
            handleUpload(managing.section, managing.slot, pendingFiles);
            setManaging(null);
            setPendingFiles([]);
            setPreviewData(null);
            setIsSubstituting(false);
        }
    };

    const handleUpload = async (section, slot, fileOrFiles) => {
        if (!fileOrFiles || (fileOrFiles instanceof FileList && fileOrFiles.length === 0)) return;

        const files = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles)) 
            ? Array.from(fileOrFiles) 
            : [fileOrFiles];
        
        // El loop se encarga de procesar cada archivo
        const sectionLabel = section === 'inicial' ? 'CEE INICIAL' : 'CEE FINAL';
        const subfolders = ["1. CEE", sectionLabel];

        for (const file of files) {
            // Validación de seguridad: No subir archivos vacíos
            if (file.size === 0) {
                showAlert(`El archivo "${file.name}" está vacío y no se puede subir al sistema.`, 'Archivo Vacío', 'warning');
                continue;
            }
            const uploadId = `${section}-${slot.id}-${file.name}`;
            setUploading(prev => ({ ...prev, [uploadId]: true }));

            try {
                if (slot.id === 'xml' && onXmlUploaded) {
                    onXmlUploaded(file, section === 'final');
                }

                let targetName = file.name;
                if (!slot.isMultiple) {
                    targetName = `${numExp} – ${sectionLabel}${slot.suffix}`;
                }

                const reader = new FileReader();
                const base64Promise = new Promise((resolve) => {
                    reader.onload = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(file);
                });

                const base64 = await base64Promise;

                const { data } = await axios.post(`/api/expedientes/${expediente.id}/documents/upload`, {
                    base64,
                    fileName: targetName,
                    mimeType: file.type,
                    subfolders
                });

                onFilesChange(prev => {
                    const next = { ...prev };
                    if (!next[section]) next[section] = {};
                    
                    if (slot.isMultiple) {
                        const current = next[section][slot.id] || [];
                        next[section][slot.id] = [...current, data.drive_link];
                    } else {
                        next[section][slot.id] = data.drive_link;
                    }
                    return next;
                });

                // Trigger automático de estado si es el REGISTRO del CEE Inicial o Final
                if (slot.id === 'registro') {
                    if (onAutoStatus) {
                        if (section === 'inicial') {
                            console.log('[AutoStatus] Detectada subida de Registro Inicial. Marcando como REGISTRADO y pasando estado a PTE. FIN OBRA.');
                            onAutoStatus('cee_inicial', 'REGISTRADO');
                            onAutoStatus('estado', 'PTE. FIN OBRA');
                        } else if (section === 'final') {
                            console.log('[AutoStatus] Detectada subida de Registro Final. Marcando como REGISTRADO.');
                            onAutoStatus('cee_final', 'REGISTRADO');
                            // Para el final, podríamos pasar a PTE FIRMA ANEXOS si quisiéramos, 
                            // pero el usuario solo ha pedido explícitamente el cambio de PTE FIN DE OBRA.
                        }
                    }
                    // Activar el popup de notificación manual (Cliente/Partner) solo para ADMIN
                                    if (user?.rol === 'ADMIN') {
                                        setNotifyModal({ section, type: section });
                                    }
                                }



            } catch (err) {
                console.error(`Error uploading to ${slot.label}:`, err);
                const errorMsg = err.response?.data?.error || err.message || 'Error desconocido';
                showAlert(`No se pudo subir el archivo ${file.name}. ${errorMsg}`, 'Error de Carga', 'error');
            } finally {
                setUploading(prev => ({ ...prev, [uploadId]: false }));
            }
        }
    };

    const handleDelete = (section, slot) => {
        onFilesChange(prev => {
            const next = { ...prev };
            if (next[section]) {
                next[section][slot.id] = null;
            }
            return next;
        });
    };

    // Cálculo de ACS HAB
    const calcAcsHab = (rooms) => {
        const numPeople = (parseInt(rooms) || 4) + 1;
        return (28 * numPeople * 0.001162 * 365 * 46).toFixed(2);
    };

    const handleNotifyAction = async () => {
        if (!notifyModal) return;
        if (selectedChannels.length === 0) {
            showAlert('Debes seleccionar al menos una vía de comunicación (Email o WhatsApp).', 'Aviso', 'warning');
            return;
        }
        if (selectedTargets.length === 0) {
            showAlert('Debes seleccionar al menos un destinatario (Cliente o Partner).', 'Aviso', 'warning');
            return;
        }

        const expId = expediente?.id;
        if (!expId) {
            console.error('[Notify error] Expediente ID is undefined', expediente);
            showAlert('ID de expediente no encontrado. Por favor, refresca la página.', 'Error', 'error');
            return;
        }

        setSendingNotify(true);
        try {
            // Si se seleccionan ambos, mandamos 'AMBOS', de lo contrario el específico
            const targetParam = selectedTargets.length === 2 ? 'AMBOS' : selectedTargets[0];

            await axios.post(`/api/expedientes/${expId}/notify-registration`, {
                target: targetParam,
                type: notifyModal.type,
                channels: selectedChannels
            });
            showAlert(`Notificaciones enviadas correctamente.`, 'Comunicaciones Enviadas', 'success');
            setNotifyModal(null);
        } catch (err) {
            console.error('Notify error:', err);
            showAlert('No se pudieron enviar las comunicaciones seleccionadas.', 'Error de Envío', 'error');
        } finally {
            setSendingNotify(false);
        }
    };

    const toggleTarget = (t) => {
        setSelectedTargets(prev => 
            prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
        );
    };

    const toggleChannel = (ch) => {
        setSelectedChannels(prev => 
            prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
        );
    };

    return (
        <div className="bg-[#0b0c11] border border-white/[0.06] rounded-[2.5rem] p-4 py-8 sm:p-10 shadow-[0_32px_120px_rgba(0,0,0,0.8)] relative overflow-hidden mb-12">
            <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            
            <div className="relative z-10 flex flex-col gap-12">
                {['inicial', 'final'].map((section) => {
                    const showSlot = (slotId) => {
                        const slot = DOCUMENT_SLOTS.find(s => s.id === slotId);
                        return (
                            <UploadItem
                                key={slotId}
                                label={slot.label}
                                value={ceeFiles?.[section]?.[slotId]}
                                uploading={Object.values(uploading).some((v, idx) => v && Object.keys(uploading)[idx].startsWith(`${section}-${slotId}-`))}
                                onUpload={(f) => handleUpload(section, slot, f)}
                                onManage={() => setManaging({ section, slot, link: ceeFiles?.[section]?.[slotId] })}
                                accept={slot.accept}
                                isMultiple={slot.isMultiple}
                                editMode={editMode}
                            />
                        );
                    };

                    const sectionDemand = demands?.[section] || {};
                    const isHab = acsMethod === 'cte';
                    const acsValue = isHab ? calcAcsHab(numRooms) : (parseFloat(sectionDemand.demandaACS) || 0).toFixed(2);

                    return (
                        <div key={section} className="flex flex-col lg:flex-row items-center gap-10 border-b border-white/[0.04] pb-12 last:border-0 last:pb-0">
                            {/* 1. Título y XML */}
                            <div className="flex items-center gap-6 min-w-[320px]">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h4 className="text-[14px] font-black uppercase text-white tracking-[0.2em] leading-tight">
                                            CEE {section === 'inicial' ? 'Inicial' : 'Final'}
                                        </h4>
                                        {(() => {
                                            const estado = expediente?.cee?.estado || '';
                                            const phaseLabel = section === 'inicial' ? 'INICIAL' : 'FINAL';
                                            const isPendingReview = estado.includes(`PENDIENTE REVISIÓN (${phaseLabel})`);

                                            const isAdmin = (user?.rol || '').toUpperCase() === 'ADMIN' || (user?.rol_nombre || '').toUpperCase() === 'ADMIN' || Number(user?.id_rol) === 1;
                                            const isCertificador = (user?.rol || '').toUpperCase() === 'CERTIFICADOR' || (user?.rol_nombre || '').toUpperCase() === 'CERTIFICADOR' || Number(user?.id_rol) === 4;
                                            const seguimientoKey = section === 'final' ? 'cee_final' : 'cee_inicial';
                                            const isRegistrado = expediente?.seguimiento?.[seguimientoKey] === 'REGISTRADO';
                                            const isResending = resendingNotif === section;

                                            const resendBtn = isRegistrado ? (
                                                <button
                                                    key="resend"
                                                    title={`Reenviar notificación de ${section === 'inicial' ? 'CEE Inicial' : 'CEE Final'} registrado a cliente/partner/admin`}
                                                    disabled={isResending}
                                                    onClick={() => handleResendCeeNotifications(section)}
                                                    className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/40 transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    {isResending ? (
                                                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    ) : (
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                    )}
                                                </button>
                                            ) : null;

                                            if (isAdmin) {
                                                if (isPendingReview && onApproveCee) {
                                                    return (
                                                        <>
                                                            <button
                                                                title="Validar y Autorizar Presentación"
                                                                onClick={() => onApproveCee(section)}
                                                                className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] active:scale-95"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            </button>
                                                            {resendBtn}
                                                        </>
                                                    );
                                                }
                                                return (
                                                    <>
                                                        <button
                                                            title={`Notificar certificador (${section === 'inicial' ? 'CEE Inicial' : 'CEE Final'})`}
                                                            onClick={() => {
                                                                setCertTemplate('standard');
                                                                setCertChannels(['email']);
                                                                setCertNotifyModal({ section });
                                                            }}
                                                            className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:bg-brand/20 hover:text-brand hover:border-brand/40 transition-all active:scale-95"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                            </svg>
                                                        </button>
                                                        {resendBtn}
                                                    </>
                                                );
                                            } else if (isCertificador) {
                                                if (isPendingReview) {
                                                    return (
                                                        <div title="Pendiente de revisión por Brokergy" className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-brand/60 cursor-help">
                                                            <svg className="w-4 h-4 animate-[spin_3s_linear_infinite]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                        </div>
                                                    );
                                                }
                                                return (
                                                    <button 
                                                        title="Notificar CEE Realizado (Solicitar Revisión)"
                                                        onClick={() => {
                                                            if (!ceeFiles?.[section]?.cex && !ceeFiles?.[section]?.xml) {
                                                                showAlert('Debes subir el archivo .CEX (o .XML) antes de solicitar la revisión.', 'Archivo Faltante', 'warning');
                                                                return;
                                                            }
                                                            if (onNotifyReview) onNotifyReview(section);
                                                        }}
                                                        className="w-7 h-7 rounded-lg bg-brand/10 border border-brand/20 flex items-center justify-center text-brand/80 hover:bg-brand hover:text-black transition-all shadow-[0_0_10px_rgba(238,143,31,0.2)] active:scale-95"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                                        </svg>
                                                    </button>
                                                );
                                            }
                                            return null;
                                        })()}
                                    </div>
                                    <p className="text-[9px] text-white/20 font-bold uppercase tracking-widest leading-none">
                                        Gestión técnica del activo
                                    </p>
                                </div>
                                <div className="ml-auto">
                                    {showSlot('xml')}
                                </div>
                            </div>

                            {/* 2. Demanda Calefacción */}
                            <div className="flex flex-col items-center gap-2 px-6 border-l border-white/5">
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Demanda Calefacción</span>
                                <div className="bg-white/[0.03] border border-white/5 px-6 py-3 rounded-2xl shadow-inner min-w-[100px] text-center">
                                    <span className="text-sm font-mono font-bold text-white/80">
                                        {sectionDemand.demandaCalefaccion || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* 3. Demanda ACS (Con Toggle) */}
                            <div className="flex flex-col items-center gap-2 px-6 border-l border-white/5">
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Demanda ACS</span>
                                <div className="flex items-center gap-4">
                                    {/* Toggles */}
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex p-0.5 bg-black/40 rounded-lg border border-white/5">
                                            <button 
                                                onClick={() => onManualUpdate({ acs_method: 'xml' })}
                                                className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${acsMethod === 'xml' ? 'bg-brand text-black' : 'text-white/30 hover:text-white'}`}
                                            >
                                                XML
                                            </button>
                                            <button 
                                                onClick={() => onManualUpdate({ acs_method: 'cte' })}
                                                className={`px-3 py-1 rounded-md text-[8px] font-black uppercase tracking-widest transition-all ${acsMethod === 'cte' ? 'bg-brand text-black' : 'text-white/30 hover:text-white'}`}
                                            >
                                                HAB
                                            </button>
                                        </div>
                                        {isHab && (
                                            <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                                                <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">Dorm:</span>
                                                <input 
                                                    type="number" 
                                                    value={numRooms} 
                                                    onChange={e => onManualUpdate({ num_rooms: parseInt(e.target.value) || 0 })}
                                                    className="w-8 bg-transparent text-[10px] text-brand font-mono font-bold focus:outline-none border-0 p-0 text-center"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    {/* Valor */}
                                    <div className="flex flex-col items-start gap-0.5">
                                        <div className="bg-white/[0.03] border border-white/5 px-6 py-3 rounded-2xl shadow-inner min-w-[120px] text-center">
                                            <span className={`text-sm font-mono font-bold ${isHab ? 'text-brand shadow-[0_0_15px_rgba(238,143,31,0.2)]' : 'text-white/80'}`}>
                                                {acsValue}
                                            </span>
                                        </div>
                                        <span className="text-[7px] text-white/10 font-bold uppercase tracking-widest self-center">kWh/año</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Restantes Slots */}
                            <div className="flex items-center gap-6 ml-auto pl-10 border-l border-white/5">
                                {['pdf', 'cex', 'registro', 'etiqueta', 'otros'].map(sId => showSlot(sId))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL GESTIÓN CEE */}
            {managing && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bkg-deep/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        
                        {/* Header */}
                        <div className="p-8 border-b border-white/5 flex items-center justify-between relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-[0.2em]">CEE {managing.section} - {managing.slot.label}</h3>
                                <p className="text-[10px] text-brand font-black uppercase tracking-[0.3em] mt-1.5 opacity-60">Gestión de Expediente Técnico</p>
                            </div>
                            <button onClick={() => { setManaging(null); setPendingFiles([]); setPreviewData(null); setIsSubstituting(false); }} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10">
                                <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Visor o DropZone */}
                        <div 
                            className={`flex-1 relative z-10 overflow-hidden ${isDraggingModal ? 'bg-brand/10' : 'bg-black/40'}`}
                            onDragOver={e => { e.preventDefault(); setIsDraggingModal(true); }}
                            onDragLeave={() => setIsDraggingModal(false)}
                            onDrop={e => {
                                e.preventDefault();
                                setIsDraggingModal(false);
                                if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                    handleFileSelect(managing.slot.isMultiple ? e.dataTransfer.files : e.dataTransfer.files[0]);
                                }
                            }}
                        >
                            {(!managing.link || isSubstituting || previewData || pendingFiles.length > 0) ? (
                                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-300">
                                    {previewData ? (
                                        <div className="w-full max-w-2xl animate-slide-up">
                                            <div className="bg-brand/10 border border-brand/20 rounded-3xl p-8 mb-8">
                                                <h4 className="text-brand text-xs font-black uppercase tracking-[0.3em] mb-8">Previsualización de Datos</h4>
                                                
                                                <div className="grid grid-cols-2 gap-8">
                                                    {/* Calefacción */}
                                                    <div className="flex flex-col gap-4">
                                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Demanda Calefacción</span>
                                                        <div className="flex items-center justify-center gap-6">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[8px] text-white/20 uppercase font-bold mb-1">Actual</span>
                                                                <span className="text-sm font-mono text-white/40">{(demands?.[managing.section]?.demandaCalefaccion) || '—'}</span>
                                                            </div>
                                                            <div className="w-8 h-px bg-white/5" />
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[8px] text-brand/60 uppercase font-bold mb-1">Nuevo</span>
                                                                <span className="text-xl font-mono text-brand font-black">{previewData.cal}</span>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* ACS */}
                                                    <div className="flex flex-col gap-4">
                                                        <span className="text-[9px] font-black text-white/40 uppercase tracking-widest">Demanda ACS</span>
                                                        <div className="flex items-center justify-center gap-6">
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[8px] text-white/20 uppercase font-bold mb-1">Actual</span>
                                                                <span className="text-sm font-mono text-white/40">{(demands?.[managing.section]?.demandaACS) || '—'}</span>
                                                            </div>
                                                            <div className="w-8 h-px bg-white/5" />
                                                            <div className="flex flex-col items-center">
                                                                <span className="text-[8px] text-brand/60 uppercase font-bold mb-1">Nuevo</span>
                                                                <span className="text-xl font-mono text-brand font-black">{previewData.acs}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-widest">¿Confirmar actualización de valores y archivo?</p>
                                        </div>
                                    ) : pendingFiles.length > 0 ? (
                                        <div className="w-full max-w-md animate-slide-up">
                                             <div className="w-20 h-20 rounded-3xl bg-brand/10 border border-brand/20 flex items-center justify-center mb-8 mx-auto">
                                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                </svg>
                                            </div>
                                            <h4 className="text-lg font-black text-white uppercase tracking-widest mb-4">
                                                {pendingFiles.length === 1 ? 'Archivo Seleccionado' : `${pendingFiles.length} Archivos Seleccionados`}
                                            </h4>
                                            <p className="text-brand text-sm font-mono mb-8 truncate px-4">
                                                {pendingFiles.length === 1 ? pendingFiles[0].name : 'Varios archivos listos para subir'}
                                            </p>
                                            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest">¿Deseas subir {pendingFiles.length === 1 ? 'este archivo' : 'estos archivos'} al expediente?</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="w-24 h-24 rounded-3xl bg-brand/5 border border-dashed border-brand/20 flex items-center justify-center mb-6 animate-pulse">
                                                <svg className="w-10 h-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                </svg>
                                            </div>
                                            <h4 className="text-xl font-black text-white uppercase tracking-widest mb-4">
                                                {managing.link ? `¿Deseas actualizar el archivo ${managing.slot.label}?` : `Subir Nuevo ${managing.slot.label}`}
                                            </h4>
                                            <p className="text-white/30 text-sm max-w-md leading-relaxed mb-8">
                                                Arrastra el nuevo archivo aquí o utiliza el botón inferior para seleccionarlo. {managing.slot.id === 'xml' || managing.slot.id === 'cex' ? 'Podrás revisar los valores antes de confirmar.' : ''}
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <iframe 
                                    src={managing.link.replace('/view?usp=drivesdk', '/preview')} 
                                    className="w-full h-full border-0"
                                    title="Visor CEE"
                                />
                            )}
                        </div>

                        {/* Footer */}
                        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.01] relative z-10">
                            <button 
                                onClick={async () => {
                                    const confirmed = await showConfirm(
                                        '¿Estás seguro de que deseas eliminar este documento del expediente? Esta acción quitará el enlace del sistema, aunque el archivo permanecerá en Drive.',
                                        'Eliminar Documento',
                                        'error'
                                    );
                                    if (confirmed) {
                                        handleDelete(managing.section, managing.slot);
                                        setManaging(null);
                                        setIsSubstituting(false);
                                        showAlert('El documento ha sido desvinculado del expediente.', 'Documento Eliminado', 'success');
                                    }
                                }}
                                className="px-8 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 group"
                            >
                                <span className="flex items-center gap-2">
                                    <svg className="w-4 h-4 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    Eliminar del Sistema
                                </span>
                            </button>

                            <div className="flex items-center gap-4">
                                {(previewData || pendingFiles.length > 0 || isSubstituting || !managing.link) ? (
                                    <>
                                        <button 
                                            onClick={() => { 
                                                setPendingFiles([]); 
                                                setPreviewData(null); 
                                                setIsSubstituting(false);
                                                if (!managing.link) setManaging(null); // Si no hay archivo y cancelamos, cerramos el modal
                                            }}
                                            className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/40 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button 
                                            onClick={confirmSubstitution}
                                            disabled={!previewData && pendingFiles.length === 0}
                                            className="px-12 py-3.5 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all cursor-pointer shadow-xl shadow-brand/20 disabled:opacity-50 disabled:hover:scale-100"
                                        >
                                            {previewData ? 'Confirmar y Actualizar' : 'Confirmar Subida'}
                                        </button>

                                        {!previewData && pendingFiles.length === 0 && (
                                            <label className="px-10 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all cursor-pointer shadow-lg">
                                                Seleccionar {managing.slot.isMultiple ? 'Archivos' : 'Archivo'}
                                                <input 
                                                    type="file" 
                                                    className="hidden" 
                                                    accept={managing.slot.accept} 
                                                    multiple={managing.slot.isMultiple}
                                                    onChange={e => handleFileSelect(managing.slot.isMultiple ? e.target.files : e.target.files[0])} 
                                                />
                                            </label>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {user?.rol === 'ADMIN' && (
                                            <button 
                                                onClick={() => window.open(managing.link, '_blank')}
                                                className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all shadow-lg"
                                            >
                                                Abrir en Drive 
                                            </button>
                                        )}
                                        <button 
                                            onClick={() => setIsSubstituting(true)}
                                            className="px-10 py-3.5 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all cursor-pointer shadow-xl shadow-brand/20"
                                        >
                                            Sustituir Archivo
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* MODAL NOTIFICACIÓN REGISTRO */}
            {notifyModal && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
                    <div className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-40 h-40 bg-brand/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        
                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className="w-16 h-16 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                                <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>

                            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Notificar Registro</h3>
                            <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest mb-8">
                                CEE {notifyModal.section === 'inicial' ? 'INICIAL' : 'FINAL'} PRESENTADO
                            </p>

                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-4 self-start pl-2">
                                1. ¿A quién notificar?
                            </p>
                            <div className="flex items-center gap-2 mb-6 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-full">
                                <button 
                                    onClick={() => toggleTarget('CLIENTE')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedTargets.includes('CLIENTE') ? 'bg-brand/10 border border-brand/30 text-brand' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                                >
                                    Cliente
                                </button>
                                <button 
                                    onClick={() => toggleTarget('PARTNER')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedTargets.includes('PARTNER') ? 'bg-brand/10 border border-brand/30 text-brand' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                                >
                                    Partner
                                </button>
                            </div>

                            <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-4 self-start pl-2">
                                2. Vías de comunicación
                            </p>
                            <div className="flex items-center gap-2 mb-8 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-full">
                                <button 
                                    onClick={() => toggleChannel('email')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedChannels.includes('email') ? 'bg-white/10 border border-white/20 text-white' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                                >
                                    Email
                                </button>
                                <button 
                                    onClick={() => toggleChannel('whatsapp')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedChannels.includes('whatsapp') ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'text-white/20 hover:text-white/40 border border-transparent'}`}
                                >
                                    WhatsApp
                                </button>
                            </div>

                            <div className="grid grid-cols-1 gap-3 w-full">
                                <button 
                                    onClick={handleNotifyAction}
                                    disabled={sendingNotify}
                                    className="w-full py-4 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-xl shadow-brand/20 flex items-center justify-center gap-3"
                                >
                                    {sendingNotify ? (
                                        <div className="w-4 h-4 border-2 border-bkg-deep/20 border-t-bkg-deep rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                            Enviar Notificaciones
                                        </>
                                    )}
                                </button>
                                
                                <button 
                                    onClick={() => setNotifyModal(null)}
                                    disabled={sendingNotify}
                                    className="w-full py-4 text-white/30 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all mt-2"
                                >
                                    Omitir Notificación
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal de Notificación al Certificador ───────────────────────── */}
            {certNotifyModal && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => { if (!sendingCertNotify) setCertNotifyModal(null); }}>
                    <div className="bg-bkg-deep border border-white/10 rounded-2xl p-6 max-w-md w-full mx-4 shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 mb-5">
                            <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>
                            <div>
                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Notificar Certificador</h4>
                                <p className="text-[10px] text-white/40">
                                    CEE {certNotifyModal.section === 'inicial' ? 'Inicial' : 'Final'} · Expediente <span className="text-brand font-bold">{numExp}</span>
                                </p>
                            </div>
                        </div>

                        {/* Selector de Plantilla */}
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Tipo de mensaje</p>
                        <div className="flex gap-2 mb-5">
                            {[
                                { id: 'standard', icon: '📋', label: 'Encargo', color: 'brand' },
                                { id: 'reminder', icon: '⏰', label: 'Recordatorio', color: 'blue-400' },
                                { id: 'urgent', icon: '⚠️', label: 'Urgente', color: 'red-400' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setCertTemplate(t.id)}
                                    className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                        certTemplate === t.id
                                            ? t.id === 'urgent' 
                                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                                : t.id === 'reminder'
                                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                    : 'bg-brand/10 border-brand/30 text-brand'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >
                                    <span className="text-base">{t.icon}</span>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Selector de Canal */}
                        <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2">Canales</p>
                        <div className="flex gap-2 mb-5">
                            {[
                                { id: 'email', label: 'Email', icon: '✉️' },
                                { id: 'whatsapp', label: 'WhatsApp', icon: '💬' }
                            ].map(ch => (
                                <button
                                    key={ch.id}
                                    onClick={() => {
                                        setCertChannels(prev => 
                                            prev.includes(ch.id)
                                                ? prev.filter(c => c !== ch.id)
                                                : [...prev, ch.id]
                                        );
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                        certChannels.includes(ch.id)
                                            ? ch.id === 'whatsapp'
                                                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                : 'bg-brand/10 border-brand/30 text-brand'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >
                                    <span>{ch.icon}</span> {ch.label}
                                </button>
                            ))}
                        </div>

                        {/* Vista previa del tono */}
                        <div className={`p-3 rounded-xl border mb-5 text-[11px] leading-relaxed ${
                            certTemplate === 'urgent' ? 'bg-red-500/5 border-red-500/20 text-red-300/70' :
                            certTemplate === 'reminder' ? 'bg-blue-500/5 border-blue-500/20 text-blue-300/70' :
                            'bg-white/[0.02] border-white/5 text-white/40'
                        }`}>
                            {certTemplate === 'urgent' && (
                                <p>⚠️ <strong>Aviso urgente</strong>: Se enviará un mensaje indicando que el CEE se necesita con carácter prioritario para cumplir plazos.</p>
                            )}
                            {certTemplate === 'reminder' && (
                                <p>⏰ <strong>Recordatorio amable</strong>: Se enviará un mensaje preguntando por el estado y pidiendo estimación de fecha de entrega.</p>
                            )}
                            {certTemplate === 'standard' && certNotifyModal.section === 'final' && (
                                <p>📋 <strong>Encargo Final</strong>: Se notificará al técnico que ya puede presentar el CEE Final con la documentación disponible en la carpeta compartida.</p>
                            )}
                            {certTemplate === 'standard' && certNotifyModal.section === 'inicial' && (
                                <p>📋 <strong>Encargo Inicial</strong>: Se notificará al técnico la asignación del expediente con los datos del cliente y las directrices técnicas.</p>
                            )}
                        </div>

                        {/* Botón Enviar */}
                        <button
                            disabled={sendingCertNotify || certChannels.length === 0}
                            onClick={async () => {
                                // Validación pre-vuelo para CEE Final
                                if (certNotifyModal.section === 'final' && certTemplate === 'standard') {
                                    const missingDocs = [];
                                    if (!ceeFiles?.inicial?.registro) missingDocs.push('Registro CEE Inicial');
                                    if (!ceeFiles?.inicial?.pdf) missingDocs.push('PDF Firmado CEE Inicial');
                                    
                                    if (missingDocs.length > 0) {
                                        const proceed = await showConfirm(
                                            `No se han detectado los siguientes documentos:\n\n• ${missingDocs.join('\n• ')}\n\n¿Deseas notificar al certificador de todas formas?`,
                                            'Documentación Incompleta',
                                            'warning'
                                        );
                                        if (!proceed) return;
                                    }
                                }

                                setSendingCertNotify(true);
                                try {
                                    const phase = certNotifyModal.section === 'final' ? 'final' : 'initial';
                                    await onForceNotify(phase, certChannels, certTemplate);
                                    setCertNotifyModal(null);
                                } catch (err) {
                                    console.error('Error notifying cert:', err);
                                } finally {
                                    setSendingCertNotify(false);
                                }
                            }}
                            className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-3 ${
                                certChannels.length === 0
                                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                    : certTemplate === 'urgent'
                                        ? 'bg-red-500 text-white hover:scale-[1.02] shadow-red-500/20'
                                        : 'bg-brand text-bkg-deep hover:scale-[1.02] shadow-brand/20'
                            }`}
                        >
                            {sendingCertNotify ? (
                                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                    </svg>
                                    {certChannels.length === 0 ? 'Selecciona un canal' : `Enviar ${certChannels.map(c => c === 'email' ? 'Email' : 'WhatsApp').join(' + ')}`}
                                </>
                            )}
                        </button>
                        <button
                            onClick={() => setCertNotifyModal(null)}
                            disabled={sendingCertNotify}
                            className="w-full py-3 text-white/30 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all mt-2"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
