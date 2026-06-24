import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { readPhaseTime, SUBESTADO_LABELS, STALE_CLASSES, fmtDate, humanDays, daysSince } from '../logic/seguimientoTime';
import { buildCertDefaultMessage } from '../logic/certMessages';

// Pill compacto de estado por fase CEE: subestado actual + días-en-estado + última comunicación.
function CeeStatusPill({ expediente, section }) {
    const key = section === 'final' ? 'cee_final' : 'cee_inicial';
    const status = expediente?.seguimiento?.[key];
    if (!status) return null;
    const pt = readPhaseTime(expediente?.seguimiento, key);
    const isRegistrado = status === 'REGISTRADO';
    const label = SUBESTADO_LABELS[status] || status;
    const lastDays = pt.lastContacto != null ? daysSince(pt.lastContacto) : null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest ${
                isRegistrado ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' : STALE_CLASSES[pt.nivel]
            }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isRegistrado ? 'bg-emerald-400' : pt.nivel === 'late' ? 'bg-red-400' : pt.nivel === 'warn' ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                {label}
            </span>
            {!isRegistrado && pt.diasEnEstado != null && (
                <span className={`text-[8px] font-bold uppercase tracking-widest ${pt.nivel === 'late' ? 'text-red-400' : pt.nivel === 'warn' ? 'text-amber-400' : 'text-white/30'}`}>
                    {pt.diasEnEstado === 0 ? 'hoy' : `${pt.diasEnEstado}d en estado`}
                </span>
            )}
            {lastDays != null && (
                <span className="text-[8px] font-bold uppercase tracking-widest text-white/25" title={`Último aviso al certificador: ${fmtDate(pt.lastContacto)}`}>
                    · aviso {humanDays(lastDays)}
                </span>
            )}
        </div>
    );
}

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
    editMode,
    onDirectDrop,   // (files) => void  — se llama al soltar ficheros sobre el slot
}) {
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounter = useRef(0);

    const handleDragEnter = (e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current += 1;
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    };

    const handleDragLeave = (e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current -= 1;
        if (dragCounter.current <= 0) {
            dragCounter.current = 0;
            setIsDragOver(false);
        }
    };

    const handleDragOver = (e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    const handleDrop = (e) => {
        if (!editMode) return;
        e.preventDefault();
        e.stopPropagation();
        dragCounter.current = 0;
        setIsDragOver(false);
        const files = e.dataTransfer?.files;
        if (files && files.length > 0 && onDirectDrop) {
            onDirectDrop(isMultiple ? files : files[0]);
        }
    };

    const dropTargetClass = isDragOver
        ? 'ring-4 ring-brand ring-offset-2 ring-offset-[#0b0c11] scale-110 bg-brand/20 border-brand shadow-2xl shadow-brand/40'
        : '';

    return (
        <div
            className={`flex flex-col items-center gap-1.5 min-w-[48px] transition-all duration-150 relative ${isDragOver ? 'z-30' : ''}`}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            <span className={`text-[9px] font-black uppercase tracking-[0.15em] mb-1 transition-colors ${isDragOver ? 'text-brand' : 'text-white/30'}`}>
                {isDragOver ? `↓ ${label}` : label}
            </span>
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
                            className={`w-11 h-11 rounded-2xl bg-brand/10 border border-brand/30 flex items-center justify-center text-brand hover:bg-brand hover:text-bkg-deep transition-all shadow-lg shadow-brand/10 ${dropTargetClass}`}
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={editMode ? onManage : undefined}
                        className={`w-11 h-11 rounded-2xl border border-dashed flex items-center justify-center transition-all ${editMode ? 'border-white/10 text-white/20 cursor-pointer hover:bg-white/5 hover:border-brand/40 shadow-sm' : 'border-white/5 text-white/5 cursor-not-allowed'} ${dropTargetClass}`}
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
            {isDragOver && (
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[8px] font-black uppercase tracking-widest text-brand whitespace-nowrap bg-bkg-deep/90 px-2 py-0.5 rounded-md border border-brand/40 shadow-lg">
                    Soltar aquí
                </span>
            )}
        </div>
    );
}

export function CeeDocumentsGrid({
    expediente,
    certName,
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
    onApproveCee,
    onApproveSend
}) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const [uploading, setUploading] = useState({}); // path -> bool
    const [managing, setManaging] = useState(null); // { section, slot, link }
    const [isDraggingModal, setIsDraggingModal] = useState(false);
    const [pendingFiles, setPendingFiles] = useState([]);
    const [isSubstituting, setIsSubstituting] = useState(false);
    const [notifyModal, setNotifyModal] = useState(null); // { section, type }
    const [sendingNotify, setSendingNotify] = useState(false);
    const [selectedChannels, setSelectedChannels] = useState(['email', 'whatsapp']);
    const [selectedTargets, setSelectedTargets] = useState(['CLIENTE']);
    // ── Estado del modal de notificación al certificador ──
    const [certNotifyModal, setCertNotifyModal] = useState(null); // { section: 'inicial'|'final' }
    const [certTemplate, setCertTemplate] = useState('standard');
    const [certChannels, setCertChannels] = useState(['email']);
    const [certNotifyMessage, setCertNotifyMessage] = useState('');
    const [sendingCertNotify, setSendingCertNotify] = useState(false);
    // Guarda la última plantilla autogenerada para saber si el admin la ha editado a mano.
    const lastCertDefaultRef = useRef('');
    // ── Modal "solicitar revisión a Brokergy" disparado al subir .CEX (certificador) ──
    const [notifyReviewModal, setNotifyReviewModal] = useState(null); // { section: 'inicial'|'final' }
    const [sendingNotifyReview, setSendingNotifyReview] = useState(false);
    const [reviewPriority, setReviewPriority] = useState('normal'); // 'normal' | 'urgent'
    const [reviewMessage, setReviewMessage] = useState('');
    
    const numExp = expediente?.numero_expediente || 'S-EXP';

    // ── Fechas del CEE (Visita/Firma desde el XML; Registro = día de subida al slot
    // REGISTRO). Viven en documentacion; se editan vía onAutoStatus, que ya enruta las
    // claves fecha_* a documentacion. dateEdits da feedback inmediato antes del refetch.
    const [dateEdits, setDateEdits] = useState({});
    const ceeDate = (field) => (field in dateEdits ? dateEdits[field] : (expediente?.documentacion?.[field] ?? '')) || '';
    const setCeeDate = (field, v) => {
        setDateEdits(prev => ({ ...prev, [field]: v || null }));
        if (onAutoStatus) onAutoStatus(field, v || null);
    };

    // Nombre del cliente para prerellenar el mensaje al certificador (mismo fallback que el backend).
    const clienteNombre = (() => {
        const c = expediente?.clientes;
        const full = c ? `${c.nombre_razon_social || ''} ${c.apellidos || ''}`.trim() : '';
        return full || expediente?.oportunidades?.referencia_cliente || '';
    })();

    // Enlace a la carpeta "12. DOCUMENTOS PARA CEE" del expediente (la persiste el backend en cee.cee_folder_link).
    const ceeFolderLink = expediente?.cee?.cee_folder_link || null;

    // Al abrir el modal, sembramos el cuadro con la plantilla por defecto del tipo activo.
    useEffect(() => {
        if (!certNotifyModal) return;
        const def = buildCertDefaultMessage(certTemplate, certNotifyModal.section, certName, clienteNombre, numExp, ceeFolderLink);
        setCertNotifyMessage(def);
        lastCertDefaultRef.current = def;
        // Solo al abrir el modal (no en cada cambio de tipo: eso lo gestiona handleCertTemplateChange).
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [certNotifyModal]);

    // Cambio de tipo de mensaje: regenera la plantilla, pero respeta el texto si el admin lo editó a mano.
    const handleCertTemplateChange = (id) => {
        setCertTemplate(id);
        if (!certNotifyModal) return;
        const def = buildCertDefaultMessage(id, certNotifyModal.section, certName, clienteNombre, numExp, ceeFolderLink);
        setCertNotifyMessage(prev => (prev.trim() === '' || prev === lastCertDefaultRef.current) ? def : prev);
        lastCertDefaultRef.current = def;
    };

    const [resendingNotif, setResendingNotif] = useState(null); // 'inicial' | 'final' | null
    const [resendNotifModal, setResendNotifModal] = useState(null); // { section: 'inicial'|'final' }
    const [resendTargets, setResendTargets] = useState(['CLIENTE', 'PARTNER', 'ADMIN']);
    const [resendChannels, setResendChannels] = useState(['email', 'whatsapp']);

    // ── Auto-make-public al abrir modal: silenciosamente hace público el archivo
    //    para garantizar que el iframe /preview cargue, sin que el admin tenga que
    //    pulsar el botón manualmente. Tras éxito, forzamos reload del iframe con un cache buster.
    const publicifiedRef = useRef(new Set());
    const [iframeBuster, setIframeBuster] = useState(0);
    useEffect(() => {
        if (!managing?.link || managing.slot?.isMultiple) return;
        if (typeof managing.link !== 'string') return;
        if ((user?.rol || '').toUpperCase() !== 'ADMIN') return;
        // Solo PDFs son previsualizables; para XML/CEX no hace falta hacer público
        if (['xml', 'cex'].includes(managing.slot?.id)) return;
        if (publicifiedRef.current.has(managing.link)) return;
        publicifiedRef.current.add(managing.link);

        (async () => {
            try {
                await axios.post(`/api/expedientes/${expediente.id}/documents/make-public`, {
                    driveLink: managing.link
                });
                console.log('[auto-make-public] OK', managing.link);
                setIframeBuster(b => b + 1);
            } catch (err) {
                const status = err.response?.status;
                console.warn('[auto-make-public] fallo:', status, err.response?.data?.error);
                // 404 → link probablemente corrupto (bug histórico de normalización en mayúsculas).
                // Intentamos reparar reescaneando Drive y actualizando los links del expediente.
                if (status === 404) {
                    try {
                        console.log('[auto-make-public] Reparando links del expediente…');
                        const { data: repair } = await axios.post(`/api/expedientes/${expediente.id}/documents/repair-cee-links`);
                        console.log('[repair-cee-links] OK', repair);
                        const repaired = repair?.repaired || {};
                        // Actualizar ceeFiles localmente con los links nuevos
                        onFilesChange(prev => ({
                            inicial: { ...(prev?.inicial || {}), ...(repaired.inicial || {}) },
                            final:   { ...(prev?.final   || {}), ...(repaired.final   || {}) },
                        }));
                        // Si el slot actual del modal tiene un link nuevo, lo actualizamos en sitio
                        const newLink = repaired[managing.section]?.[managing.slot.id];
                        if (newLink) {
                            setManaging(m => ({ ...m, link: newLink }));
                            publicifiedRef.current.delete(managing.link); // permitir nuevo intento make-public
                            showAlert('Enlace de Drive reparado. Cargando archivo…', 'Reparado', 'success');
                        } else {
                            showAlert('No se encontró el archivo en Drive. Súbelo de nuevo.', 'Archivo no encontrado', 'warning');
                            setManaging(null);
                        }
                    } catch (repErr) {
                        console.error('[repair-cee-links] error:', repErr);
                    }
                }
            }
        })();
    }, [managing?.link, managing?.slot?.isMultiple, managing?.slot?.id, expediente?.id, user?.rol]);

    // ── Detección de archivos existentes en Drive (subidos fuera de la app) ──
    // Mergeamos slots vacíos con lo que haya en Drive. El ref guarda el último id
    // escaneado para evitar repetir; si el usuario cambia de expediente y vuelve,
    // se re-escanea porque el id cambió.
    const scannedExpIdRef = useRef(null);
    useEffect(() => {
        if (!expediente?.id) return;
        if (scannedExpIdRef.current === expediente.id) return;
        scannedExpIdRef.current = expediente.id;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await axios.get(`/api/expedientes/${expediente.id}/documents/scan-cee`);
                if (cancelled || !data) return;

                // Detectar si hay algo nuevo que mergear: solo añadimos los slots que estén vacíos
                // en ceeFiles pero llenos en Drive. Así no pisamos cambios locales en curso.
                const needsMerge = ['inicial', 'final'].some(section => {
                    const driveSec = data[section] || {};
                    const localSec = ceeFiles?.[section] || {};
                    return ['xml', 'pdf', 'cex', 'registro', 'etiqueta'].some(slot => !localSec[slot] && driveSec[slot])
                        || (Array.isArray(driveSec.otros) && driveSec.otros.length > 0 && (!localSec.otros || localSec.otros.length === 0));
                });
                if (!needsMerge) return;

                onFilesChange(prev => {
                    const next = { ...(prev || {}) };
                    for (const section of ['inicial', 'final']) {
                        const driveSec = data[section] || {};
                        next[section] = { ...(next[section] || {}) };
                        for (const slot of ['xml', 'pdf', 'cex', 'registro', 'etiqueta']) {
                            if (!next[section][slot] && driveSec[slot]) {
                                next[section][slot] = driveSec[slot];
                            }
                        }
                        if (Array.isArray(driveSec.otros) && driveSec.otros.length > 0
                            && (!next[section].otros || next[section].otros.length === 0)) {
                            next[section].otros = driveSec.otros;
                        }
                    }
                    return next;
                });
            } catch (err) {
                console.warn('[scan-cee] No se pudo escanear Drive:', err.message);
            }
        })();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [expediente?.id]);

    const handleResendCeeNotifications = (section) => {
        // Pre-seleccionar todos según datos disponibles
        const hasPartner = expediente?.oportunidades?.prescriptor_id && String(expediente?.oportunidades?.prescriptor_id) !== '1';
        setResendTargets(['CLIENTE', ...(hasPartner ? ['PARTNER'] : []), 'ADMIN']);
        setResendChannels(['email', 'whatsapp']);
        setResendNotifModal({ section });
    };

    const handleConfirmResend = async () => {
        const section = resendNotifModal.section;
        const phase = section === 'final' ? 'final' : 'inicial';
        setResendingNotif(section);
        try {
            const res = await axios.post(`/api/expedientes/${expediente.id}/resend-cee-notifications`, {
                phase,
                targets: resendTargets,
                channels: resendChannels,
            });
            const r = res.data || {};
            setResendNotifModal(null);
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
            setResendNotifModal(null);
            showAlert(err.response?.data?.error || err.message || 'Error de red', 'Error reenviando', 'error');
        } finally {
            setResendingNotif(null);
        }
    };

    const toggleResendTarget = (t) => setResendTargets(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
    const toggleResendChannel = (c) => setResendChannels(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c]);

    const handleFileSelect = async (fileOrFiles) => {
        if (!fileOrFiles) return;
        const files = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles))
            ? Array.from(fileOrFiles)
            : [fileOrFiles];

        setPendingFiles(files);
        // Preview de demandas para XML/CEX eliminada — se va directo a "Confirmar Subida".
    };

    const confirmSubstitution = () => {
        if (pendingFiles.length > 0) {
            handleUpload(managing.section, managing.slot, pendingFiles);
            setManaging(null);
            setPendingFiles([]);
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

                let targetName;
                if (!slot.isMultiple) {
                    targetName = `${numExp} – ${sectionLabel}${slot.suffix}`;
                } else {
                    const dotIdx = file.name.lastIndexOf('.');
                    const basename = dotIdx > 0 ? file.name.substring(0, dotIdx) : file.name;
                    const ext = dotIdx > 0 ? file.name.substring(dotIdx) : '';
                    targetName = `${numExp} – ${basename}${ext}`;
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

                console.log(`[Upload OK] section=${section} slot=${slot.id}`);

                // Trigger automático de estado si es el REGISTRO del CEE Inicial o Final
                if (slot.id === 'registro') {
                    if (onAutoStatus) {
                        // Auto-fecha de registro: garantiza que cee_ini/fin_registro_ok sea true en BD
                        // (única fuente de verdad para el tick de REGISTRO en la vista SQL)
                        const today = new Date().toISOString().split('T')[0];
                        if (section === 'inicial') {
                            onAutoStatus('fecha_registro_cee_inicial', today);
                            onAutoStatus('cee_inicial', 'REGISTRADO');
                            onAutoStatus('estado', 'PTE. FIN OBRA');
                        } else if (section === 'final') {
                            onAutoStatus('fecha_registro_cee_final', today);
                            onAutoStatus('cee_final', 'REGISTRADO');
                        }
                    }
                    // Popup de notificación manual (Cliente/Partner) solo para ADMIN
                    if (user?.rol === 'ADMIN') {
                        setNotifyModal({ section, type: section });
                    }
                }

                // Al subir el .CEX → marcar seguimiento como PTE_REVISION automáticamente
                // (independiente del rol; el estado debe reflejar siempre el avance).
                if (slot.id === 'cex' && onAutoStatus) {
                    if (section === 'inicial') {
                        onAutoStatus('cee_inicial', 'PTE_REVISION');
                    } else if (section === 'final') {
                        onAutoStatus('cee_final', 'PTE_REVISION');
                    }
                }

                // Al subir el .CEX, si es certificador, ofrecer notificar a Brokergy para revisión
                if (slot.id === 'cex') {
                    const rol = (user?.rol || '').toUpperCase();
                    const rolNombre = (user?.rol_nombre || '').toUpperCase();
                    const idRol = Number(user?.id_rol);
                    const isCert = rol === 'CERTIFICADOR' || rolNombre === 'CERTIFICADOR' || idRol === 4;
                    console.log('[CEX uploaded] user check:', { rol, rolNombre, idRol, isCert, section, user });
                    if (isCert) {
                        console.log('[CEX uploaded] → abriendo notifyReviewModal');
                        setReviewPriority('normal');
                        setReviewMessage('');
                        setNotifyReviewModal({ section });
                    } else {
                        console.log('[CEX uploaded] → NO se abre popup (rol no es CERTIFICADOR)');
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

    const handleDelete = async (section, slot, linkOverride = null) => {
        // 1. Recoger los links a borrar (puede ser uno o varios para slot OTROS)
        const current = linkOverride
            ? [linkOverride]
            : (() => {
                const val = ceeFiles?.[section]?.[slot.id];
                if (!val) return [];
                return Array.isArray(val) ? val : [val];
            })();

        // 2. Borrar cada uno en Drive (best-effort; si falla, lo notificamos pero seguimos)
        for (const link of current) {
            try {
                await axios.delete(`/api/expedientes/${expediente.id}/documents/file`, {
                    data: { driveLink: link }
                });
            } catch (err) {
                console.warn(`[delete-file] No se pudo borrar de Drive:`, err.message);
            }
        }

        // 3. Actualizar estado local
        onFilesChange(prev => {
            const next = { ...prev };
            if (!next[section]) next[section] = {};
            if (slot.isMultiple && linkOverride) {
                next[section][slot.id] = (next[section][slot.id] || []).filter(l => l !== linkOverride);
            } else {
                next[section][slot.id] = slot.isMultiple ? [] : null;
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
                                onDirectDrop={(fileOrFiles) => {
                                    // Drag directo: sube sin abrir el modal. Solo validamos extensión cuando hay accept específico.
                                    const filesArr = (fileOrFiles instanceof FileList || Array.isArray(fileOrFiles))
                                        ? Array.from(fileOrFiles)
                                        : [fileOrFiles];
                                    if (slot.accept && slot.accept !== '*') {
                                        const exts = slot.accept.split(',').map(s => s.trim().toLowerCase());
                                        const invalid = filesArr.find(f => !exts.some(ext => f.name.toLowerCase().endsWith(ext)));
                                        if (invalid) {
                                            showAlert(`El slot ${slot.label} solo acepta archivos ${exts.join(', ')}. Recibido: ${invalid.name}`, 'Tipo no válido', 'warning');
                                            return;
                                        }
                                    }
                                    handleUpload(section, slot, slot.isMultiple ? filesArr : filesArr[0]);
                                }}
                            />
                        );
                    };

                    const sectionDemand = demands?.[section] || {};
                    const isHab = acsMethod === 'cte';
                    const acsValue = isHab ? calcAcsHab(numRooms) : (parseFloat(sectionDemand.demandaACS) || 0).toFixed(2);

                    return (
                        <div key={section} className="flex flex-wrap items-center gap-x-5 gap-y-6 border-b border-white/[0.04] pb-12 last:border-0 last:pb-0">
                            {/* 1. Título y XML */}
                            <div className="flex items-center gap-3 w-[250px] shrink-0">
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-3 mb-2">
                                        <h4 className="text-[14px] font-black uppercase text-white tracking-[0.2em] leading-tight">
                                            CEE {section === 'inicial' ? 'Inicial' : 'Final'}
                                        </h4>
                                        {(() => {
                                            const phaseLabel = section === 'inicial' ? 'INICIAL' : 'FINAL';
                                            const seguimientoKey = section === 'final' ? 'cee_final' : 'cee_inicial';
                                            const segStatus = expediente?.seguimiento?.[seguimientoKey];
                                            // El subestado canónico (seguimiento) manda. `cee.estado` es un espejo que
                                            // puede desincronizarse (p. ej. se queda en "EN TRABAJO" tras re-subir el XML),
                                            // así que NO nos fiamos solo de él para decidir si se puede validar.
                                            const estado = expediente?.cee?.estado || expediente?.estado || '';
                                            const isPendingReview = segStatus === 'PTE_REVISION' || estado.includes(`PENDIENTE REVISIÓN (${phaseLabel})`);

                                            const isAdmin = (user?.rol || '').toUpperCase() === 'ADMIN' || (user?.rol_nombre || '').toUpperCase() === 'ADMIN' || Number(user?.id_rol) === 1;
                                            const isCertificador = (user?.rol || '').toUpperCase() === 'CERTIFICADOR' || (user?.rol_nombre || '').toUpperCase() === 'CERTIFICADOR' || Number(user?.id_rol) === 4;
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
                                                // La campana SIEMPRE está disponible para el admin y abre un popup con
                                                // varias opciones de mensaje (Encargo / Recordatorio / Urgente / Visto bueno).
                                                // El check verde es un atajo extra al "Visto bueno" cuando el CEE está
                                                // pendiente de revisión.
                                                return (
                                                    <>
                                                        {isPendingReview && onApproveCee && (
                                                            <button
                                                                title="Validar y autorizar registro (visto bueno)"
                                                                onClick={() => onApproveCee(section)}
                                                                className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-[0_0_10px_rgba(16,185,129,0.3)] active:scale-95"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                            </button>
                                                        )}
                                                        <button
                                                            title={`Comunicar con el certificador (${section === 'inicial' ? 'CEE Inicial' : 'CEE Final'})`}
                                                            onClick={() => {
                                                                // Si está pendiente de revisión, el popup abre ya en "Visto bueno".
                                                                setCertTemplate(isPendingReview ? 'approve' : 'standard');
                                                                setCertChannels(['email']);
                                                                setCertNotifyMessage('');
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
                                                            setReviewPriority('normal');
                                                            setReviewMessage('');
                                                            setNotifyReviewModal({ section });
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
                                    <CeeStatusPill expediente={expediente} section={section} />
                                </div>
                                <div className="ml-auto">
                                    {showSlot('xml')}
                                </div>
                            </div>

                            {/* 2. Demanda Calefacción */}
                            <div className="flex flex-col items-center gap-2 w-[150px] border-l border-white/5 shrink-0">
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-1 whitespace-nowrap">Demanda Calefacción</span>
                                <div className="bg-white/[0.03] border border-white/5 px-4 py-2.5 rounded-2xl shadow-inner min-w-[84px] text-center">
                                    <span className="text-sm font-mono font-bold text-white/80">
                                        {sectionDemand.demandaCalefaccion || '—'}
                                    </span>
                                </div>
                            </div>

                            {/* 3. Demanda ACS (Con Toggle) */}
                            <div className="flex flex-col items-center gap-2 w-[225px] border-l border-white/5 shrink-0">
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Demanda ACS</span>
                                <div className="flex items-center gap-2.5">
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
                                        <div className="bg-white/[0.03] border border-white/5 px-4 py-2.5 rounded-2xl shadow-inner min-w-[92px] text-center">
                                            <span className={`text-sm font-mono font-bold ${isHab ? 'text-brand shadow-[0_0_15px_rgba(238,143,31,0.2)]' : 'text-white/80'}`}>
                                                {acsValue}
                                            </span>
                                        </div>
                                        <span className="text-[7px] text-white/10 font-bold uppercase tracking-widest self-center">kWh/año</span>
                                    </div>
                                </div>
                            </div>

                            {/* 4. Fechas CEE (Visita/Firma auto del XML · Registro al subir slot REGISTRO; editables) */}
                            <div className="flex flex-col items-center gap-2 w-[320px] border-l border-white/5 shrink-0">
                                <span className="text-[9px] font-black uppercase text-white/30 tracking-[0.2em] mb-1">Fechas CEE</span>
                                <div className="flex items-end gap-1.5">
                                    {[
                                        { label: 'Visita',   field: `fecha_visita_cee_${section}` },
                                        { label: 'Firma',    field: `fecha_firma_cee_${section}` },
                                        { label: 'Registro', field: `fecha_registro_cee_${section}` },
                                    ].map(({ label, field }) => (
                                        <div key={field} className="flex flex-col items-center gap-1">
                                            <span className="text-[7px] font-black uppercase text-white/25 tracking-[0.12em] whitespace-nowrap">{label}</span>
                                            <input
                                                type="date"
                                                value={ceeDate(field)}
                                                onChange={e => setCeeDate(field, e.target.value)}
                                                disabled={!editMode}
                                                className={`no-uppercase bg-white/[0.03] border rounded-lg px-1.5 py-2 text-[10px] text-center font-mono w-[94px] focus:outline-none transition-colors ${editMode ? 'border-white/10 text-white/80 focus:border-brand/50 cursor-pointer hover:border-white/20' : 'border-white/5 text-white/45 cursor-not-allowed'}`}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* 5. Documentos (slots) */}
                            <div className="flex items-center justify-between gap-2 pl-4 border-l border-white/5 w-[340px] shrink-0">
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
                            <button onClick={() => { setManaging(null); setPendingFiles([]); setIsSubstituting(false); }} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10">
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
                            {(!managing.link || managing.slot.isMultiple || isSubstituting || pendingFiles.length > 0) ? (
                                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center animate-in fade-in duration-300">
                                    {pendingFiles.length > 0 ? (
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
                                    ) : managing.slot.isMultiple && Array.isArray(managing.link) && managing.link.length > 0 ? (
                                        <div className="w-full max-w-lg animate-slide-up">
                                            <h4 className="text-base font-black text-white uppercase tracking-widest mb-6 text-center">
                                                {managing.link.length} archivo{managing.link.length !== 1 ? 's' : ''} subido{managing.link.length !== 1 ? 's' : ''}
                                            </h4>
                                            <div className="space-y-2 mb-8 max-h-64 overflow-y-auto pr-1">
                                                {managing.link.map((url, idx) => (
                                                    <div key={idx} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3">
                                                        <svg className="w-4 h-4 text-brand/60 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                        </svg>
                                                        <span className="text-xs text-white/50 font-mono truncate flex-1">Archivo {idx + 1}</span>
                                                        {user?.rol === 'ADMIN' && (
                                                            <button
                                                                onClick={() => window.open(url, '_blank')}
                                                                className="text-[9px] font-black text-brand/60 hover:text-brand uppercase tracking-widest transition-colors"
                                                            >
                                                                Abrir
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                            <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest text-center">
                                                Arrastra o selecciona archivos para añadir más
                                            </p>
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
                                                Arrastra el nuevo archivo aquí o utiliza el botón inferior para seleccionarlo.
                                            </p>
                                        </>
                                    )}
                                </div>
                            ) : ['xml', 'cex'].includes(managing.slot.id) ? (
                                // XML/CEX: Drive no los renderiza; mostramos pantalla "archivo cargado"
                                <div className="w-full h-full flex flex-col items-center justify-center p-12 text-center">
                                    <div className="w-24 h-24 rounded-3xl bg-brand/10 border border-brand/30 flex items-center justify-center mb-6 shadow-lg shadow-brand/20">
                                        <svg className="w-10 h-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <h4 className="text-xl font-black text-white uppercase tracking-widest mb-2">
                                        Archivo {managing.slot.label} cargado
                                    </h4>
                                    <p className="text-white/40 text-sm mb-6 max-w-md">
                                        Los archivos {managing.slot.label} no se pueden previsualizar en el navegador. {user?.rol === 'ADMIN' ? 'Pulsa "Abrir en Drive" para descargarlo o verlo.' : 'Contacta con un administrador para acceder al archivo.'}
                                    </p>
                                </div>
                            ) : (() => {
                                // Convertir cualquier webViewLink de Drive a /preview (lo único embedible).
                                const m = String(managing.link || '').match(/\/file\/d\/([-\w]{20,})/);
                                const previewSrc = m
                                    ? `https://drive.google.com/file/d/${m[1]}/preview`
                                    : String(managing.link || '').replace(/\/view\b.*$/, '/preview');
                                // iframeBuster fuerza re-mount tras make-public exitoso
                                return (
                                    <iframe
                                        key={`iframe-${previewSrc}-${iframeBuster}`}
                                        src={previewSrc}
                                        className="w-full h-full border-0"
                                        title="Visor CEE"
                                    />
                                );
                            })()}
                        </div>

                        {/* Footer */}
                        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.01] relative z-10">
                            {managing.link && (
                                <button
                                    onClick={async () => {
                                        const confirmed = await showConfirm(
                                            '¿Eliminar este documento del expediente y borrarlo de Drive? Esta acción no se puede deshacer (el archivo irá a la papelera de Drive).',
                                            'Eliminar Documento',
                                            'error'
                                        );
                                        if (confirmed) {
                                            await handleDelete(managing.section, managing.slot);
                                            setManaging(null);
                                            setIsSubstituting(false);
                                            showAlert('El documento ha sido eliminado del expediente y de Drive.', 'Documento Eliminado', 'success');
                                        }
                                    }}
                                    className="px-8 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all shadow-lg shadow-red-500/5 group"
                                >
                                    <span className="flex items-center gap-2">
                                        <svg className="w-4 h-4 opacity-50 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                        Eliminar (Sistema + Drive)
                                    </span>
                                </button>
                            )}

                            <div className="flex items-center gap-4">
                                {(pendingFiles.length > 0 || isSubstituting || !managing.link) ? (
                                    <>
                                        <button
                                            onClick={() => {
                                                setPendingFiles([]);
                                                setIsSubstituting(false);
                                                if (!managing.link) setManaging(null); // Si no hay archivo y cancelamos, cerramos el modal
                                            }}
                                            className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/40 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            onClick={confirmSubstitution}
                                            disabled={pendingFiles.length === 0}
                                            className="px-12 py-3.5 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all cursor-pointer shadow-xl shadow-brand/20 disabled:opacity-50 disabled:hover:scale-100"
                                        >
                                            Confirmar Subida
                                        </button>

                                        {pendingFiles.length === 0 && (
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
                                                onClick={async () => {
                                                    try {
                                                        await axios.post(`/api/expedientes/${expediente.id}/documents/make-public`, { driveLink: managing.link });
                                                        showAlert('Permisos actualizados. Recargando vista del archivo…', 'Acceso reparado', 'success');
                                                        // Forzar recarga del iframe alterando el link (mismo valor, fuerza React a re-renderizar)
                                                        setManaging(m => ({ ...m, link: m.link + (m.link.includes('?') ? '&' : '?') + '_r=' + Date.now() }));
                                                    } catch (err) {
                                                        showAlert(err.response?.data?.error || 'No se pudo reparar el acceso.', 'Error', 'error');
                                                    }
                                                }}
                                                title="Hace público el archivo en Drive (anyone with link → reader). Útil si el iframe da 403."
                                                className="px-6 py-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-amber-500/20 transition-all"
                                            >
                                                🔓 Reparar Acceso
                                            </button>
                                        )}
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
                        <div className="grid grid-cols-4 gap-2 mb-5">
                            {[
                                { id: 'standard', icon: '📋', label: 'Encargo', color: 'brand' },
                                { id: 'reminder', icon: '⏰', label: 'Recordatorio', color: 'blue-400' },
                                { id: 'urgent', icon: '⚠️', label: 'Urgente', color: 'red-400' },
                                { id: 'approve', icon: '✅', label: 'Visto bueno', color: 'emerald-400' },
                            ].map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => handleCertTemplateChange(t.id)}
                                    className={`flex flex-col items-center justify-center gap-1.5 py-3 px-1 rounded-xl text-[8px] font-black uppercase tracking-wide text-center leading-tight transition-all border ${
                                        certTemplate === t.id
                                            ? t.id === 'urgent'
                                                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                                : t.id === 'reminder'
                                                    ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                                                    : t.id === 'approve'
                                                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                                        : 'bg-brand/10 border-brand/30 text-brand'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >
                                    <span className="text-base">{t.icon}</span>
                                    {t.label}
                                </button>
                            ))}
                        </div>

                        {/* Aviso cuando se elige "Visto bueno": no es un simple aviso, avanza el estado. */}
                        {certTemplate === 'approve' && (
                            <div className="flex items-start gap-2 mb-5 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                                <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-[9px] text-emerald-300/80 leading-snug normal-case">
                                    Da el <b>visto bueno</b> al {certNotifyModal.section === 'final' ? 'CEE Final' : 'CEE Inicial'}: marca el CEE como <b>REVISADO</b> y autoriza al certificador a registrarlo en Industria.
                                </p>
                            </div>
                        )}

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

                        {/* Mensaje a enviar (editable). Es el texto real que se manda al certificador. */}
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest">Mensaje al certificador</p>
                            <button
                                type="button"
                                onClick={() => {
                                    const def = buildCertDefaultMessage(certTemplate, certNotifyModal.section, certName, clienteNombre, numExp, ceeFolderLink);
                                    setCertNotifyMessage(def);
                                    lastCertDefaultRef.current = def;
                                }}
                                disabled={sendingCertNotify}
                                className="text-[9px] font-black uppercase tracking-widest text-white/30 hover:text-brand transition-colors disabled:opacity-40"
                                title="Restaurar el texto por defecto de este tipo de mensaje"
                            >↺ Restaurar plantilla</button>
                        </div>
                        <textarea
                            value={certNotifyMessage}
                            onChange={e => setCertNotifyMessage(e.target.value)}
                            disabled={sendingCertNotify}
                            placeholder="Escribe el mensaje que se enviará al certificador…"
                            rows={9}
                            maxLength={2000}
                            className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-sm leading-relaxed text-white normal-case placeholder:text-white/20 focus:outline-none focus:border-brand/40 resize-none mb-1"
                        />
                        <div className="flex items-center justify-between mb-5">
                            <p className="text-[9px] text-white/25 leading-snug">
                                Puedes editarlo libremente.{certChannels.includes('email') ? ' El email mantiene la cabecera de marca, los datos del cliente y los botones de acceso.' : ''}
                            </p>
                            <p className="text-[9px] text-white/20 shrink-0 ml-3">{certNotifyMessage.length}/2000</p>
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
                                    if (certTemplate === 'approve') {
                                        // Visto bueno: avanza el estado a REVISADO y avisa al certificador.
                                        const data = onApproveSend
                                            ? await onApproveSend(phase, certChannels, certNotifyMessage)
                                            : null;
                                        // Avisar solo si algún canal no salió limpio (mismo criterio que onForceNotify).
                                        const issues = [];
                                        if (data) {
                                            if (certChannels.includes('email') && !data.emailSent) issues.push('✉️ Email NO enviado');
                                            if (certChannels.includes('whatsapp') && !data.whatsAppSent) {
                                                issues.push(data.waReason === 'sin_telefono'
                                                    ? '💬 WhatsApp NO enviado (certificador sin teléfono)'
                                                    : '💬 WhatsApp NO enviado');
                                            }
                                        }
                                        if (issues.length) setTimeout(() => showAlert(issues.join('\n'), 'Aviso de envío', 'warning'), 400);
                                    } else {
                                        await onForceNotify(phase, certChannels, certTemplate, certNotifyMessage);
                                    }
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
                                        : certTemplate === 'approve'
                                            ? 'bg-emerald-500 text-black hover:scale-[1.02] shadow-emerald-500/20'
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
                                    {certChannels.length === 0
                                        ? 'Selecciona un canal'
                                        : `${certTemplate === 'approve' ? '✅ Validar y enviar ' : 'Enviar '}${certChannels.map(c => c === 'email' ? 'Email' : 'WhatsApp').join(' + ')}`}
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

            {/* ── MODAL: solicitar revisión a Brokergy al subir .CEX ─────────── */}
            {notifyReviewModal && (
                <div
                    className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
                    onClick={() => { if (!sendingNotifyReview) setNotifyReviewModal(null); }}
                >
                    <div
                        className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="absolute top-0 right-0 w-40 h-40 bg-brand/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        <div className="relative z-10 flex flex-col items-center text-center">
                            <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-6 border ${reviewPriority === 'urgent' ? 'bg-red-500/10 border-red-500/30' : 'bg-brand/10 border-brand/20'}`}>
                                <svg className={`w-8 h-8 ${reviewPriority === 'urgent' ? 'text-red-400' : 'text-brand'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                                </svg>
                            </div>

                            <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Solicitar Revisión</h3>
                            <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest mb-6">
                                CEE {notifyReviewModal.section === 'inicial' ? 'INICIAL' : 'FINAL'} · Expediente <span className="text-brand">{numExp}</span>
                            </p>

                            {/* Selector de prioridad */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 self-start pl-1">Prioridad</p>
                            <div className="flex gap-2 mb-5 w-full">
                                <button
                                    onClick={() => setReviewPriority('normal')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                        reviewPriority === 'normal'
                                            ? 'bg-brand/10 border-brand/30 text-brand'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >
                                    📋 Normal
                                </button>
                                <button
                                    onClick={() => setReviewPriority('urgent')}
                                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                                        reviewPriority === 'urgent'
                                            ? 'bg-red-500/10 border-red-500/30 text-red-400'
                                            : 'border-white/5 text-white/20 hover:text-white/40'
                                    }`}
                                >
                                    🚨 Urgente
                                </button>
                            </div>

                            {/* Mensaje libre del técnico */}
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest mb-2 self-start pl-1">Mensaje a Brokergy (opcional)</p>
                            <textarea
                                value={reviewMessage}
                                onChange={e => setReviewMessage(e.target.value)}
                                placeholder="Ej: He ajustado los valores de la envolvente, revisar antes de presentar."
                                rows={3}
                                maxLength={500}
                                className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 text-xs text-white placeholder:text-white/20 focus:outline-none focus:border-brand/40 focus:bg-white/[0.05] transition-all resize-none mb-2"
                            />
                            <p className="text-[9px] text-white/20 mb-6 self-end pr-1">{reviewMessage.length}/500</p>

                            <div className="grid grid-cols-1 gap-3 w-full">
                                <button
                                    disabled={sendingNotifyReview}
                                    onClick={async () => {
                                        setSendingNotifyReview(true);
                                        try {
                                            if (onNotifyReview) {
                                                await onNotifyReview(notifyReviewModal.section, {
                                                    priority: reviewPriority,
                                                    techMessage: reviewMessage.trim() || null,
                                                });
                                            }
                                            setNotifyReviewModal(null);
                                        } finally {
                                            setSendingNotifyReview(false);
                                        }
                                    }}
                                    className={`w-full py-4 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all shadow-xl flex items-center justify-center gap-3 ${
                                        reviewPriority === 'urgent'
                                            ? 'bg-red-500 text-white hover:scale-[1.02] shadow-red-500/20'
                                            : 'bg-brand text-bkg-deep hover:scale-[1.02] shadow-brand/20'
                                    }`}
                                >
                                    {sendingNotifyReview ? (
                                        <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                                    ) : (
                                        <>
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                            </svg>
                                            {reviewPriority === 'urgent' ? '🚨 Notificar URGENTE a Brokergy' : 'Notificar a Brokergy'}
                                        </>
                                    )}
                                </button>

                                <button
                                    onClick={() => setNotifyReviewModal(null)}
                                    disabled={sendingNotifyReview}
                                    className="w-full py-3 text-white/30 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all"
                                >
                                    Más Tarde
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Modal Reenviar Notificación CEE Registrado ──────────────────── */}
            {resendNotifModal && (() => {
                const cli = expediente?.clientes;
                const op  = expediente?.oportunidades;
                const pres = expediente?.prescriptores;
                const cliName = cli ? `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim() : 'Cliente';
                const cliContact = cli?.tlf || cli?.persona_contacto_tlf || cli?.email || null;
                const hasPartner = op?.prescriptor_id && String(op.prescriptor_id) !== '1';
                const presName   = pres?.razon_social || pres?.acronimo || 'Partner';
                const presContact = pres?.telefono || pres?.movil || pres?.email || null;
                const phaseLabel = resendNotifModal.section === 'final' ? 'CEE FINAL' : 'CEE INICIAL';

                const RecipientRow = ({ id, label, detail }) => (
                    <button
                        onClick={() => toggleResendTarget(id)}
                        className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-left transition-all border ${
                            resendTargets.includes(id)
                                ? 'bg-brand/10 border-brand/30 text-brand'
                                : 'border-white/5 text-white/20 hover:text-white/40'
                        }`}
                    >
                        <div className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${
                            resendTargets.includes(id) ? 'bg-brand border-brand' : 'border-white/20'
                        }`}>
                            {resendTargets.includes(id) && (
                                <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="text-[10px] font-black uppercase tracking-widest leading-tight">{label}</span>
                            {detail && <span className="text-[9px] opacity-60 truncate mt-0.5">{detail}</span>}
                        </div>
                    </button>
                );

                return (
                    <div
                        className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
                        onClick={() => { if (!resendingNotif) setResendNotifModal(null); }}
                    >
                        <div
                            className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="absolute top-0 right-0 w-40 h-40 bg-brand/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                            <div className="relative z-10 flex flex-col items-center text-center">
                                <div className="w-16 h-16 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mb-6">
                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                </div>

                                <h3 className="text-lg font-black text-white uppercase tracking-widest mb-2">Reenviar Notificación</h3>
                                <p className="text-[11px] text-white/40 font-bold uppercase tracking-widest mb-8">
                                    {phaseLabel} · {numExp}
                                </p>

                                {/* Recipients */}
                                <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-3 self-start pl-1">
                                    1. ¿A quién notificar?
                                </p>
                                <div className="flex flex-col gap-2 mb-6 w-full">
                                    <RecipientRow
                                        id="CLIENTE"
                                        label="Cliente"
                                        detail={cliContact ? `${cliName} · ${cliContact}` : cliName}
                                    />
                                    {hasPartner && (
                                        <RecipientRow
                                            id="PARTNER"
                                            label="Partner"
                                            detail={presContact ? `${presName} · ${presContact}` : presName}
                                        />
                                    )}
                                    <RecipientRow
                                        id="ADMIN"
                                        label="Admin"
                                        detail="BROKERGY · Resumen del registro"
                                    />
                                </div>

                                {/* Channels */}
                                <p className="text-xs text-white/40 font-bold uppercase tracking-widest mb-3 self-start pl-1">
                                    2. Vías de comunicación
                                </p>
                                <div className="flex items-center gap-2 mb-8 p-1 bg-white/[0.03] border border-white/5 rounded-2xl w-full">
                                    <button
                                        onClick={() => toggleResendChannel('email')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                            resendChannels.includes('email')
                                                ? 'bg-white/10 border border-white/20 text-white'
                                                : 'text-white/20 hover:text-white/40 border border-transparent'
                                        }`}
                                    >
                                        ✉️ Email
                                    </button>
                                    <button
                                        onClick={() => toggleResendChannel('whatsapp')}
                                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                                            resendChannels.includes('whatsapp')
                                                ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                                : 'text-white/20 hover:text-white/40 border border-transparent'
                                        }`}
                                    >
                                        💬 WhatsApp
                                    </button>
                                </div>

                                {/* Actions */}
                                <div className="grid grid-cols-1 gap-3 w-full">
                                    <button
                                        onClick={handleConfirmResend}
                                        disabled={!!resendingNotif || resendTargets.length === 0 || resendChannels.length === 0}
                                        className="w-full py-4 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all shadow-xl shadow-brand/20 flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
                                    >
                                        {resendingNotif ? (
                                            <div className="w-4 h-4 border-2 border-bkg-deep/20 border-t-bkg-deep rounded-full animate-spin" />
                                        ) : (
                                            <>
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                                </svg>
                                                {resendTargets.length === 0 || resendChannels.length === 0
                                                    ? 'Selecciona destinatario y canal'
                                                    : `Reenviar a ${resendTargets.length} destinatario${resendTargets.length > 1 ? 's' : ''}`
                                                }
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => setResendNotifModal(null)}
                                        disabled={!!resendingNotif}
                                        className="w-full py-4 text-white/30 text-[10px] font-black uppercase tracking-[0.2em] hover:text-white transition-all"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
}
