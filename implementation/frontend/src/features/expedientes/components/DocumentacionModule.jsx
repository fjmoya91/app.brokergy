import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { toTitleCase } from '../logic/certMessages';
import { AnexoIModal } from './AnexoIModal';
import { AnexoCesionModal } from './AnexoCesionModal';
import { FichaRes060Modal } from './FichaRes060Modal';
import { FichaRes080Modal } from './FichaRes080Modal';
import { FichaRes093Modal } from './FichaRes093Modal';
import { CertificadoCifoModal } from './CertificadoCifoModal';
import { CertificadoRes080Modal } from './CertificadoRes080Modal';
import { AnexoFotograficoModal } from './AnexoFotograficoModal';
import { EnviarBorradorRiteModal } from './EnviarBorradorRiteModal';
import { EnviarAnexosModal } from './EnviarAnexosModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Convierte un ArrayBuffer a base64 POR TROZOS. Evita el "Maximum call stack size
// exceeded" de `String.fromCharCode(...array)` con ficheros grandes (PDFs).
function arrayBufferToBase64(arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
}

function ValidationModal({ isOpen, onClose, missingFields, onConfirm, docName }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07] bg-red-500/5">
                    <div className="flex items-center gap-3 text-red-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <h2 className="text-lg font-black uppercase tracking-tight">Datos Faltantes</h2>
                    </div>
                </div>
                
                <div className="px-6 py-6 space-y-4">
                    <p className="text-sm text-white/60 leading-relaxed">
                        Para generar el <span className="text-white font-bold">{docName}</span>, faltan los siguientes campos por completar:
                    </p>
                    
                    <div className="bg-white/[0.03] border border-white/[0.05] rounded-xl p-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                        <ul className="space-y-2">
                            {missingFields.map((field, i) => (
                                <li key={i} className="flex items-center gap-2 text-[10px] text-red-400/80 font-black uppercase tracking-widest">
                                    <div className="w-1 h-1 rounded-full bg-red-500/50" />
                                    {field}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <p className="text-[10px] text-white/30 italic">
                        * Puedes continuar de todos modos, pero el documento tendrá huecos vacíos.
                    </p>
                </div>

                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex gap-3">
                    <button 
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all"
                    >
                        Volver
                    </button>
                    <button 
                        onClick={onConfirm}
                        className="flex-1 px-4 py-2.5 rounded-xl bg-white/5 text-white/80 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all"
                    >
                        Generar de todos modos
                    </button>
                </div>
            </div>
        </div>
    );
}

function DateField({ label, value, onChange, readOnly = false, hint = '' }) {
    return (
        <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">
                {label}
                {hint && <span className="ml-1 text-red-400/70 normal-case font-normal">{hint}</span>}
            </label>
            <input
                type="date"
                value={value || ''}
                onChange={onChange ? e => onChange(e.target.value || null) : undefined}
                readOnly={readOnly}
                disabled={readOnly}
                className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-sm focus:outline-none ${
                    readOnly
                        ? 'border-white/5 text-white/50 cursor-not-allowed'
                        : 'border-white/10 text-white focus:border-brand/50'
                }`}
            />
        </div>
    );
}

// Fecha compacta para incrustar dentro de una fila de documento (label arriba, control abajo).
// Sin onChange → display de solo lectura (p.ej. fechas CIFO calculadas).
function InlineDate({ label, value, onChange, readOnly = false }) {
    return (
        <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.12em] whitespace-nowrap text-center leading-tight">{label}</span>
            {onChange ? (
                <input
                    type="date"
                    value={value || ''}
                    onChange={e => onChange(e.target.value || null)}
                    disabled={readOnly}
                    className={`no-uppercase bg-bkg-elevated border rounded-lg px-2 py-2 text-[10px] text-center font-mono w-[122px] focus:outline-none transition-colors ${readOnly ? 'border-white/5 text-white/45 cursor-not-allowed' : 'border-white/10 text-white/80 focus:border-brand/50 cursor-pointer hover:border-white/20'}`}
                />
            ) : (
                <div className="bg-bkg-elevated border border-white/5 rounded-lg px-2 py-2 text-[10px] text-center font-bold text-white/55 w-[122px]">
                    {value ? formatDateDisplay(value) : '—'}
                </div>
            )}
        </div>
    );
}

function TextField({ label, value, onChange, readOnly = false, placeholder = '' }) {
    return (
        <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>
            <input
                type="text"
                value={value || ''}
                onChange={onChange ? e => onChange(e.target.value) : undefined}
                readOnly={readOnly}
                placeholder={placeholder}
                className={`w-full bg-bkg-elevated border rounded-lg px-3 py-2 text-white text-sm focus:outline-none ${
                    readOnly
                        ? 'border-white/5 text-white/60 cursor-not-allowed'
                        : 'border-white/10 focus:border-brand/50'
                }`}
            />
        </div>
    );
}

function NumericField({ label, value, onChange, readOnly = false, placeholder = '0.00' }) {
    return (
        <div>
            <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">{label}</label>
            <div className="relative">
                <input
                    type="number"
                    step="0.01"
                    value={value || ''}
                    onChange={onChange ? e => onChange(parseFloat(e.target.value) || 0) : undefined}
                    readOnly={readOnly}
                    placeholder={placeholder}
                    className={`w-full bg-bkg-elevated border rounded-lg pl-3 pr-8 py-2 text-white text-sm focus:outline-none appearance-none ${
                        readOnly
                            ? 'border-white/5 text-white/60 cursor-not-allowed'
                            : 'border-white/10 focus:border-brand/50'
                    }`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-white/20 uppercase tracking-widest pointer-events-none">€</span>
            </div>
        </div>
    );
}

function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

// Calculadora automática de fechas CIFO
function calcCifo(doc) {
    const allDates = [
        doc.fecha_pruebas_cert_instalacion,
        ...(doc.facturas || []).map(f => f.fecha_factura)
    ].filter(Boolean);

    if (allDates.length === 0) return { inicio: null, fin: null };
    const sorted = allDates.sort();
    return { inicio: sorted[0], fin: sorted[sorted.length - 1] };
}

// ─── Componente de Facturas ───────────────────────────────────────────────────
function FacturasSection({ expedienteId, facturas, onChange, readOnly }) {
    const { user } = useAuth();
    const [uploading, setUploading] = useState({}); // idx → bool

    const addFactura = () => {
        onChange([...facturas, { numero_factura: '', fecha_factura: null, importe_sin_iva: 0, drive_link: null }]);
    };
    const removeFactura = (idx) => {
        onChange(facturas.filter((_, i) => i !== idx));
    };
    const updateFactura = (idx, field, val) => {
        const updated = facturas.map((f, i) => i === idx ? { ...f, [field]: val || null } : f);
        onChange(updated);
    };

    const handleFileUpload = async (idx, file) => {
        if (!file || !expedienteId) return;
        setUploading(u => ({ ...u, [idx]: true }));
        try {
            const arrayBuffer = await file.arrayBuffer();
            // Conversión a base64 POR TROZOS. `String.fromCharCode(...array)` con el
            // spread de un PDF (>100 KB) revienta el stack ("Maximum call stack size
            // exceeded") y caía en el catch genérico "Comprueba la configuración de Drive".
            const base64 = arrayBufferToBase64(arrayBuffer);
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/facturas/upload`, {
                base64,
                fileName: file.name,
                mimeType: file.type || 'application/pdf'
            });
            updateFactura(idx, 'drive_link', data.drive_link);
        } catch (err) {
            console.error('Error subiendo factura:', err);
            const detail = err.response?.data?.error || err.response?.data?.details || err.message || '';
            alert('Error al subir la factura a Drive.' + (detail ? `\n\nDetalle: ${detail}` : ' Comprueba la configuración de Drive.'));
        } finally {
            setUploading(u => ({ ...u, [idx]: false }));
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-black text-white/60 uppercase tracking-wider">Facturas</h4>
                {!readOnly && (
                    <button
                        onClick={addFactura}
                        className="flex items-center gap-1 text-xs text-brand/80 hover:text-brand font-bold"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                        Añadir factura
                    </button>
                )}
            </div>

            {facturas.length === 0 ? (
                <p className="text-white/30 text-xs italic">Sin facturas.</p>
            ) : (
                <div className="space-y-3">
                    {facturas.map((f, idx) => (
                        <div key={idx} className="bg-bkg-elevated/60 rounded-xl p-4 border border-white/[0.06] relative">
                            {!readOnly && (
                                <button
                                    onClick={() => removeFactura(idx)}
                                    className="absolute top-3 right-3 text-white/20 hover:text-red-400 transition-colors"
                                    title="Eliminar factura"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pr-6">
                                <TextField
                                    label={`Nº Factura ${idx + 1}`}
                                    value={f.numero_factura}
                                    onChange={v => updateFactura(idx, 'numero_factura', v)}
                                    readOnly={readOnly}
                                    placeholder="Ej: T-260079"
                                />
                                <DateField
                                    label="Fecha Factura"
                                    value={f.fecha_factura}
                                    onChange={v => updateFactura(idx, 'fecha_factura', v)}
                                    readOnly={readOnly}
                                />
                                <NumericField
                                    label="Importe € s/IVA"
                                    value={f.importe_sin_iva}
                                    onChange={v => updateFactura(idx, 'importe_sin_iva', v)}
                                    readOnly={readOnly}
                                />
                                <div className="sm:col-span-3">
                                    <label className="block text-xs text-white/40 uppercase tracking-wider mb-1 font-bold">PDF Factura (Drive)</label>
                                    {f.drive_link ? (
                                        <div className="flex items-center gap-3">
                                            {user?.rol === 'ADMIN' && (
                                                <a
                                                    href={f.drive_link}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs text-brand/80 hover:text-brand truncate flex items-center gap-1"
                                                >
                                                    <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                    </svg>
                                                    Ver en Drive
                                                </a>
                                            )}
                                            {!readOnly && (
                                                <label className="cursor-pointer text-xs text-white/30 hover:text-white/60">
                                                    Reemplazar
                                                    <input type="file" accept=".pdf,image/*" className="hidden" onChange={e => handleFileUpload(idx, e.target.files[0])} />
                                                </label>
                                            )}
                                        </div>
                                    ) : !readOnly ? (
                                        <label className={`flex items-center gap-2 cursor-pointer w-full bg-bkg-elevated border border-dashed rounded-lg px-3 py-2 text-sm transition-colors ${
                                            uploading[idx] ? 'border-brand/40 text-brand/60' : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white/50'
                                        }`}>
                                            {uploading[idx] ? (
                                                <>
                                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                                    </svg>
                                                    Subiendo a Drive...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                    Subir PDF/imagen a Drive (5.FACTURAS)
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept=".pdf,image/*"
                                                className="hidden"
                                                disabled={uploading[idx]}
                                                onChange={e => handleFileUpload(idx, e.target.files[0])}
                                            />
                                        </label>
                                    ) : (
                                        <p className="text-white/30 text-xs italic">Sin PDF.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function DocumentacionModule({ expediente, onSave, onLiveUpdate, saving, results, onEditCliente }) {
    const { user } = useAuth();
    const isReforma = expediente?.oportunidades?.ficha === 'RES080' || expediente?.numero_expediente?.includes('RES080');
    const isHybrid  = expediente?.oportunidades?.ficha === 'RES093' || expediente?.numero_expediente?.includes('RES093');

    const [local, setLocal] = useState(() => {
        const doc = {
            fecha_visita_cee_inicial: null,
            fecha_firma_cee_inicial: null,
            fecha_registro_cee_inicial: null,
            fecha_visita_cee_final: null,
            fecha_firma_cee_final: null,
            fecha_registro_cee_final: null,
            facturas: [],
            fecha_pruebas_cert_instalacion: null,
            fecha_firma_cert_instalacion: null,
            fecha_inicio_cifo: null,
            fecha_fin_cifo: null,
            cert_cifo_drive_link: null,
            cert_cifo_sent_at: null,
            cert_cifo_signed_link: null,
            cert_rite_drive_link: null,
            cert_rite_sent_at: null,
            cert_rite_signed_link: null,
            memoria_rite_guia_link: null,
            memoria_rite_pdf_link: null,
            borrador_cert_rite_link: null,
            borrador_cert_sent_at: null,
            anexo_i_drive_link: null,
            anexo_i_sent_at: null,
            anexo_i_signed_link: null,
            anexo_cesion_drive_link: null,
            anexo_cesion_sent_at: null,
            anexo_cesion_signed_link: null,
            ficha_res060_drive_link: null,
            ficha_res060_sent_at: null,
            ficha_res060_signed_link: null,
            anexo_fotografico_drive_link: null,
            anexo_fotografico_sent_at: null,
            anexo_fotografico_signed_link: null,
            cifo_extra_annexes: [],
            res080_attachments: [
                { id: 'aerotermia', label: 'Ficha técnica aerotermia', file: null, required: true },
                { id: 'rite', label: 'Certificado RITE / Memoria técnica', file: null, required: true },
                { id: 'marco', label: 'Ficha técnica Marco Ventana', file: null, required: false },
                { id: 'cristal', label: 'Ficha técnica Vidrio/Cristal', file: null, required: false },
                { id: 'aislamiento', label: 'Ficha técnica Aislamiento', file: null, required: false }
            ],
            photo_attachments: [
                { id: 'caldera_anterior', label: 'Foto Caldera Anterior', file: null, required: true },
                { id: 'placa_caldera_anterior', label: 'Foto Placa de la Caldera Anterior', file: null, required: true },
                { id: 'unidad_exterior', label: 'Foto Unidad Exterior', file: null, required: true },
                { id: 'placa_unidad_exterior', label: 'Foto Placa de la Unidad Exterior', file: null, required: true },
            ],
            ...(expediente?.documentacion || {})
        };
        // Saneamiento: nunca dejar cifo_attachments en local — son blobs base64
        // que ya no se persisten (los anexos del CIFO viven en Drive). Ver
        // backend/scripts/clean_cifo_attachments.sql para limpiar registros
        // legacy en BD.
        if ('cifo_attachments' in doc) delete doc.cifo_attachments;
        const cifo = calcCifo(doc);
        return { ...doc, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
    });

    // Estado efímero del CIFO: NO se persiste en BD. Se reconstruye en cada
    // apertura del modal leyendo de Drive (driveId únicamente, sin blobs).
    const [cifoAttachments, setCifoAttachments] = useState([
        { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
        { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
    ]);

    // Cuando cambia el expediente o se rehidrata documentacion, recargamos los
    // anexos extra persistidos como slots.
    //
    // IMPORTANTE: cada save dispara un re-fetch del expediente (handleSave →
    // fetchExpediente → setExpediente), lo que cambia la referencia de
    // cifo_extra_annexes y vuelve a ejecutar este effect. Si reconstruyéramos los
    // slots desde cero perderíamos las `previewPages` ya rasterizadas (el preview
    // del CIFO/RES080 dejaría de mostrar las páginas del anexo aunque sí viajen en
    // la descarga). Por eso CONSERVAMOS el slot previo cuando ya existe por driveId
    // (mantiene previewPages); solo creamos slot nuevo para anexos no vistos aún.
    React.useEffect(() => {
        const extras = expediente?.documentacion?.cifo_extra_annexes || [];
        setCifoAttachments(prev => {
            const fixed = prev.filter(a => a.required);
            const prevByDriveId = new Map(
                prev.filter(a => a.isExtra && a.file?.driveId).map(a => [a.file.driveId, a])
            );
            const extraSlots = extras.map(e => {
                const existing = prevByDriveId.get(e.driveId);
                if (existing) return existing; // conserva previewPages ya hidratadas
                return {
                    id: `extra_${e.driveId}`,
                    label: e.label || e.fileName,
                    isExtra: true,
                    file: { driveId: e.driveId, link: e.link, name: e.fileName, source: 'manual_upload' }
                };
            });
            return [...fixed, ...extraSlots];
        });
    }, [expediente?.id, expediente?.documentacion?.cifo_extra_annexes]);

    React.useEffect(() => {
        if (expediente?.documentacion) {
            const nextDoc = {
                fecha_visita_cee_inicial: null,
                fecha_firma_cee_inicial: null,
                fecha_registro_cee_inicial: null,
                fecha_visita_cee_final: null,
                fecha_firma_cee_final: null,
                fecha_registro_cee_final: null,
                facturas: [],
                fecha_pruebas_cert_instalacion: null,
                fecha_firma_cert_instalacion: null,
                fecha_inicio_cifo: null,
                fecha_fin_cifo: null,
                cert_cifo_drive_link: null,
                cert_cifo_sent_at: null,
                cert_cifo_signed_link: null,
                cert_rite_drive_link: null,
                cert_rite_sent_at: null,
                cert_rite_signed_link: null,
                memoria_rite_guia_link: null,
                memoria_rite_pdf_link: null,
                borrador_cert_rite_link: null,
                borrador_cert_sent_at: null,
                anexo_i_drive_link: null,
                anexo_i_sent_at: null,
                anexo_i_signed_link: null,
                anexo_cesion_drive_link: null,
                anexo_cesion_sent_at: null,
                anexo_cesion_signed_link: null,
                ficha_res060_drive_link: null,
                ficha_res060_sent_at: null,
                ficha_res060_signed_link: null,
                anexo_fotografico_drive_link: null,
                anexo_fotografico_sent_at: null,
                anexo_fotografico_signed_link: null,
                cifo_extra_annexes: [],
                res080_attachments: [
                    { id: 'aerotermia', label: 'Ficha técnica aerotermia', file: null, required: true },
                    { id: 'rite', label: 'Certificado RITE / Memoria técnica', file: null, required: true },
                    { id: 'marco', label: 'Ficha técnica Marco Ventana', file: null, required: false },
                    { id: 'cristal', label: 'Ficha técnica Vidrio/Cristal', file: null, required: false },
                    { id: 'aislamiento', label: 'Ficha técnica Aislamiento', file: null, required: false }
                ],
                photo_attachments: [
                    { id: 'caldera_anterior', label: 'Foto Caldera Anterior', file: null, required: true },
                    { id: 'placa_caldera_anterior', label: 'Foto Placa de la Caldera Anterior', file: null, required: true },
                    { id: 'unidad_exterior', label: 'Foto Unidad Exterior', file: null, required: true },
                    { id: 'placa_unidad_exterior', label: 'Foto Placa de la Unidad Exterior', file: null, required: true },
                ],
                ...expediente.documentacion
            };
            // Saneamiento: descartar cifo_attachments legacy si viene de BD
            if ('cifo_attachments' in nextDoc) delete nextDoc.cifo_attachments;
            const cifo = calcCifo(nextDoc);
            setLocal({ ...nextDoc, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin });
        }
    }, [expediente?.id]);

    // Sincronizar con el estado Live del padre
    React.useEffect(() => {
        if (onLiveUpdate) {
            onLiveUpdate(local);
        }
    }, [local, onLiveUpdate]);

    const [editMode, setEditMode] = useState(false);
    // Revela el campo para pegar el enlace Drive del Certificado RITE (acción puntual).
    const [showRiteLinkInput, setShowRiteLinkInput] = useState(false);

    // Drag & drop a nivel de FILA: arrastrar un PDF sobre cualquier parte de la fila
    // resalta su slot firmado y, al soltar, lo anexa. dragRow = id de la fila activa.
    const [dragRow, setDragRow] = useState(null);
    const dragCounters = React.useRef({});
    const rowDragProps = (rowId, onDropFile) => ({
        onDragEnter: (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); e.stopPropagation(); dragCounters.current[rowId] = (dragCounters.current[rowId] || 0) + 1; setDragRow(rowId); },
        onDragOver:  (e) => { if (!e.dataTransfer?.types?.includes('Files')) return; e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; },
        onDragLeave: (e) => { e.preventDefault(); e.stopPropagation(); dragCounters.current[rowId] = (dragCounters.current[rowId] || 0) - 1; if (dragCounters.current[rowId] <= 0) { dragCounters.current[rowId] = 0; setDragRow(r => (r === rowId ? null : r)); } },
        onDrop:      (e) => { e.preventDefault(); e.stopPropagation(); dragCounters.current[rowId] = 0; setDragRow(null); const f = e.dataTransfer?.files?.[0]; if (f) onDropFile(f); },
    });
    const [showAnexoI, setShowAnexoI] = useState(false);
    const [showAnexoCesion, setShowAnexoCesion] = useState(false);
    const [showFichaRes060, setShowFichaRes060] = useState(false);
    const [showFichaRes080, setShowFichaRes080] = useState(false);
    const [showFichaRes093, setShowFichaRes093] = useState(false);
    const [showCertificadoCifo, setShowCertificadoCifo] = useState(false);
    const [showCertificadoRes080, setShowCertificadoRes080] = useState(false);
    const [showAnexoFotografico, setShowAnexoFotografico] = useState(false);
    const [showFacturasModal, setShowFacturasModal] = useState(false);
    const [managingSigned, setManagingSigned] = useState(null); // { field, link, label }
    // Rechazo de documento (motivo + destinatario + mensaje editable → aviso WA/email)
    const [rejectDoc, setRejectDoc] = useState(null); // { field, label }
    const [rejectMotivo, setRejectMotivo] = useState('');
    const [rejectTarget, setRejectTarget] = useState('cliente'); // 'cliente'|'instalador'|'ninguno'
    const [rejectMsg, setRejectMsg] = useState('');
    const [rejectMsgEdited, setRejectMsgEdited] = useState(false);
    const [rejectSending, setRejectSending] = useState(false);
    const [rejectError, setRejectError] = useState(null);
    const [showEnviarBorrador, setShowEnviarBorrador] = useState(false);
    const [enviarAnexos, setEnviarAnexos] = useState({ open: false, docs: [], overrides: null });

    // ── Validación ───────────────────────────────────────────────────────────
    const [validation, setValidation] = useState({ isOpen: false, fields: [], onConfirm: null, docName: '' });

    const validateExpediente = (docType) => {
        const missing = [];
        const cli = expediente.clientes || {};
        const inst = expediente.instalacion || {};
        const op = expediente.oportunidades || {};
        const cee = expediente.cee || {};
        const doc = local || {};

        const isPresent = (val) => {
            if (!val) return false;
            if (typeof val === 'string' && (val.trim() === '' || val.includes('_____') || val === '—')) return false;
            return true;
        };

        // 1. Datos base (Comunes)
        if (!isPresent(expediente.numero_expediente)) missing.push('Número de Expediente');
        if (!isPresent(cli.nombre_razon_social)) missing.push('Nombre / Razón Social Cliente');
        if (!isPresent(cli.dni_nie || cli.dni)) missing.push('DNI / NIE Cliente');
        if (!isPresent(cli.direccion)) missing.push('Dirección Cliente');
        if (!isPresent(cli.codigo_postal)) missing.push('Código Postal Cliente');
        if (!isPresent(cli.municipio)) missing.push('Municipio Cliente');
        if (!isPresent(cli.provincia)) missing.push('Provincia Cliente');

        // 2. Específicos
        if (docType === 'cesion') {
            const iban = cli.numero_cuenta || '';
            if (!isPresent(iban) || iban.includes('__')) missing.push('Número de Cuenta (IBAN)');
            if (!isPresent(inst.coord_x)) missing.push('Coordenada UTM X');
            if (!isPresent(inst.coord_y)) missing.push('Coordenada UTM Y');
            if (!isPresent(op.datos_calculo?.inputs?.rc || cli.referencia_catastral || inst.ref_catastral)) missing.push('Referencia Catastral');
            if (!isPresent(cli.tlf || cli.telefono)) missing.push('Teléfono Cliente');
            if (!isPresent(cli.email)) missing.push('Email Cliente');
        }

        if (docType === 'anexo1') {
            if (!isPresent(op.datos_calculo?.inputs?.rc || cli.referencia_catastral || inst.ref_catastral)) missing.push('Referencia Catastral');
            if (!isPresent(inst.aerotermia_cal?.numero_serie)) missing.push('Número de Serie Ud. Exterior');
            
            const hasAcs = inst.cambio_acs != null
                ? !!(inst.cambio_acs === true || inst.cambio_acs === 'si')
                : !!(op.datos_calculo?.inputs?.changeAcs === true || op.datos_calculo?.inputs?.incluir_acs === true);
            if (hasAcs && !isPresent(inst.aerotermia_acs?.numero_serie) && !inst.misma_aerotermia_acs) {
                missing.push('Número de Serie Ud. Interior (ACS)');
            }
            if (!isPresent(cli.tlf || cli.telefono)) missing.push('Teléfono Cliente');
            if (!isPresent(cli.email)) missing.push('Email Cliente');
        }

        if (docType === 'cifo') {
            if (!isPresent(doc.fecha_inicio_cifo)) missing.push('Fecha Inicio CIFO (basada en facturas/certificados)');
            if (!isPresent(doc.fecha_fin_cifo)) missing.push('Fecha Fin CIFO');
            if (!isPresent(doc.fecha_pruebas_cert_instalacion)) missing.push('Fecha Pruebas Cert. Instalación');
            if (!isPresent(doc.fecha_firma_cert_instalacion)) missing.push('Fecha Firma Cert. Instalación');
            if (!isPresent(cee.cee_final?.demandaCalefaccion)) missing.push('Demanda Calefacción (CEE Final)');
            if (!isPresent(cee.cee_final?.superficieHabitable)) missing.push('Superficie Habitable (CEE Final)');
            if (!doc.facturas?.length) missing.push('Al menos una factura');
        }

        if (docType === 'res060') {
            if (!isPresent(cee.cee_final?.demandaCalefaccion)) missing.push('Demanda Calefacción (CEE Final)');
            if (!isPresent(cee.cee_final?.superficieHabitable)) missing.push('Superficie Habitable (CEE Final)');
            if (!isPresent(inst.aerotermia_cal?.modelo || inst.aerotermia_cal?.marca)) missing.push('Modelo Bomba de Calor');
            if (!isPresent(doc.fecha_inicio_cifo)) missing.push('Fecha Inicio Actuación (basada en facturas/certificados)');
            if (!isPresent(doc.fecha_fin_cifo)) missing.push('Fecha Fin Actuación');
        }

        if (docType === 'memoria_rite') {
            const pres = expediente.prescriptores || {};
            const inputs = op.datos_calculo?.inputs || {};
            const cal = inst.aerotermia_cal || {};
            const acs = inst.aerotermia_acs || {};

            // Titular (base ya cubre nombre/dni/dirección/cp/municipio/provincia)
            if (!isPresent(cli.apellidos)) missing.push('Apellidos Cliente');

            // Ubicación / cálculo
            if (!isPresent(inputs.superficie)) missing.push('Superficie (Cálculo / Toma de datos)');
            if (!isPresent(inputs.zona)) missing.push('Zona Climática (Cálculo)');
            if (!isPresent(inputs.plantas)) missing.push('Nº de Plantas (Cálculo)');
            if (!isPresent(inst.ref_catastral || op.ref_catastral || inputs.rc)) missing.push('Referencia Catastral (Instalación)');

            // Equipo calefacción
            if (!isPresent(cal.marca)) missing.push('Marca Aerotermia Calefacción (Instalación)');
            if (!isPresent(cal.modelo)) missing.push('Modelo Aerotermia Calefacción (Instalación)');
            if (!isPresent(cal.numero_serie)) missing.push('Nº Serie Aerotermia Calefacción (Instalación)');
            if (!isPresent(cal.potencia)) missing.push('Potencia Aerotermia Calefacción (Instalación)');

            // Equipo ACS (solo si hay cambio de ACS)
            const hasAcs = inst.cambio_acs === true || inst.cambio_acs === 'si';
            if (hasAcs) {
                if (!isPresent(acs.marca)) missing.push('Marca Aerotermia ACS (Instalación)');
                if (!isPresent(acs.modelo)) missing.push('Modelo Aerotermia ACS (Instalación)');
                if (!isPresent(acs.numero_serie)) missing.push('Nº Serie Aerotermia ACS (Instalación)');
                if (!isPresent(acs.potencia)) missing.push('Potencia Aerotermia ACS (Instalación)');
            }

            // Emisor
            if (!isPresent(inst.tipo_emisor)) missing.push('Tipo de Emisor (Instalación)');

            // Instalador (ficha del Partner)
            if (!isPresent(pres.razon_social)) missing.push('Razón Social Instalador (ficha Partner)');
            if (!isPresent(pres.cif)) missing.push('CIF Instalador (ficha Partner)');
            if (!isPresent(pres.nombre_responsable)) missing.push('Nombre Responsable Técnico (ficha Partner)');
            if (!isPresent(pres.apellidos_responsable)) missing.push('Apellidos Responsable Técnico (ficha Partner)');
            if (!isPresent(pres.nif_responsable || pres.tecnico_firmante_dni)) missing.push('NIF Responsable Técnico (ficha Partner)');
            if (!isPresent(pres.numero_carnet_rite)) missing.push('Nº Empresa RITE (ficha Partner)');
            if (!isPresent(pres.municipio)) missing.push('Municipio Instalador (ficha Partner)');

            // Fecha de factura (= fecha de pruebas en la memoria)
            if (!doc.facturas?.length || !isPresent(doc.facturas[0]?.fecha_factura)) missing.push('Fecha de Factura (Documentación)');
        }

        return missing;
    };

    const handleGenerateClick = (docType, docName, openFn) => {
        const missing = validateExpediente(docType);
        if (missing.length > 0) {
            setValidation({
                isOpen: true,
                fields: missing,
                docName,
                onConfirm: () => {
                    setValidation(prev => ({ ...prev, isOpen: false }));
                    openFn();
                }
            });
        } else {
            openFn();
        }
    };

    const setField = useCallback((field, val) => {
        setLocal(prev => {
            const next = { ...prev, [field]: val };
            const cifo = calcCifo(next);
            return { ...next, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
        });
    }, []);

    // Autoguardado: actualiza el campo en local y persiste de inmediato (modelo C).
    // Para fechas (un único evento de cambio) y para commits onBlur de inputs de texto.
    const commitField = useCallback((field, val) => {
        setLocal(prev => {
            const next = { ...prev, [field]: val };
            const cifo = calcCifo(next);
            const merged = { ...next, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
            onSave({ documentacion: merged });
            return merged;
        });
    }, [onSave]);

    const handleFacturasChange = (facturas) => {
        setLocal(prev => {
            const next = { ...prev, facturas };
            const cifo = calcCifo(next);
            return { ...next, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
        });
    };

    const handleModalSaveDrive = (field, link) => {
        setLocal(prev => {
            const next = { ...prev, [field]: link };
            onSave({ documentacion: next });
            return next;
        });
    };

    // Marca como enviados los anexos que se enviaron correctamente desde el modal
    // unificado (EnviarAnexosModal) → enciende los indicadores "Enviado" de la fila.
    const markAnexosSent = (keys, driveLinks) => {
        if (!Array.isArray(keys) || !keys.length) return;
        setLocal(prev => {
            const now = new Date().toISOString();
            const next = { ...prev };
            if (keys.includes('anexo1')) { next.anexo_i_sent_at = now; if (driveLinks?.anexo1) next.anexo_i_drive_link = driveLinks.anexo1; }
            if (keys.includes('cesion')) { next.anexo_cesion_sent_at = now; if (driveLinks?.cesion) next.anexo_cesion_drive_link = driveLinks.cesion; }
            onSave({ documentacion: next });
            return next;
        });
    };

    // Mensaje predefinido (editable) para el envío al instalador. Genérico, sin
    // nombre (va al contacto de notificaciones del partner).
    const borradorMensajeDefault = (() => {
        const cliR = expediente?.clientes || {};
        const clienteNombre = [cliR.nombre_razon_social, cliR.apellidos].filter(Boolean).join(' ').trim();
        const uploadLink = `${window.location.origin}/subir-rite/${expediente?.id}`;
        return `¡Hola! 👋\n\n`
            + `Desde *Brokergy* os lo ponemos fácil 🚀\n\n`
            + `Para agilizar la legalización térmica del expediente *${expediente?.numero_expediente || ''}*${clienteNombre ? ` (${clienteNombre})` : ''} os adjuntamos, ya preparados con los datos del proyecto:\n\n`
            + `📄 *Memoria Técnica RITE* (Word) — prácticamente rellena: revisar y firmar.\n`
            + `📕 *Memoria Técnica RITE* (PDF) — por si no necesitáis hacer cambios.\n`
            + `📋 *Borrador del Certificado de Instalación Térmica* (PDF) — listo para *copiar y pegar* directamente en la plataforma de tramitación (JE6).\n\n`
            + `Lo hemos rellenado por vosotros para ahorraros tiempo y evitar errores. Revisad que todo sea correcto antes de presentar.\n\n`
            + `✅ *Cuando tengáis la Memoria firmada y el Certificado RITE tramitado*, subidlos en 1 clic aquí (arrastrar y soltar):\n${uploadLink}\n\n`
            + `¿Cualquier duda? El equipo de Brokergy está aquí para ayudaros 💪`;
    })();

    // El modal hace todo (descargar / Drive / email / WhatsApp). El botón de la
    // fila solo valida y abre el modal.
    const abrirBorradorModal = () => setShowEnviarBorrador(true);

    // ── Sexo del titular (Hombre/Mujer) para la Memoria RITE ──────────────────
    // Antes de abrir el modal de generación se pregunta el sexo del titular. La
    // elección se PERSISTE en el cliente (clientes.sexo) y marca la casilla
    // correspondiente en la Memoria RITE (el backend la lee al generar).
    const cliId = expediente?.clientes?.id_cliente || expediente?.cliente_id || null;
    const [sexoPopup, setSexoPopup] = useState({ isOpen: false, saving: null, error: null });

    // Llamado tras pasar la validación: abre el popup de sexo (no genera directo).
    const abrirSexoThenBorrador = () => setSexoPopup({ isOpen: true, saving: null, error: null });

    // Elige sexo (o lo omite), lo persiste en el cliente y abre el modal de generación.
    const elegirSexoYGenerar = async (value) => {
        setSexoPopup(p => ({ ...p, saving: value || 'omitir', error: null }));
        try {
            if (value && cliId) {
                await axios.put(`/api/clientes/${cliId}`, { sexo: value });
                // Reflejo local para coherencia si se reabre el modal en esta sesión.
                if (expediente?.clientes) expediente.clientes.sexo = value;
            }
            setSexoPopup({ isOpen: false, saving: null, error: null });
            setShowEnviarBorrador(true);
        } catch (e) {
            setSexoPopup(p => ({ ...p, saving: null, error: e.response?.data?.error || 'No se pudo guardar el sexo del titular' }));
        }
    };

    // Cuando el modal sube a Drive, persistimos los enlaces devueltos.
    const onBorradorUploaded = (data) => {
        setLocal(prev => {
            const next = {
                ...prev,
                cert_rite_drive_link: data.cert_rite_drive_link || prev.cert_rite_drive_link,
                memoria_rite_pdf_link: data.memoria_rite_pdf_link || prev.memoria_rite_pdf_link,
                memoria_rite_guia_link: data.memoria_rite_guia_link || prev.memoria_rite_guia_link,
                borrador_cert_rite_link: data.borrador_cert_rite_link || prev.borrador_cert_rite_link
            };
            onSave({ documentacion: next });
            return next;
        });
    };

    const handleDeleteSigned = (field) => {
        if (confirm('¿Estás seguro de que deseas eliminar este documento firmado?')) {
            setLocal(prev => {
                const next = { ...prev, [field]: null };
                onSave({ documentacion: next });
                return next;
            });
            setManagingSigned(null);
        }
    };

    // ── Validación de documentos: SUBIDO (ámbar) → REVISADO/CORRECTO (verde) ──────
    // El estado vive en documentacion.docs_validados = { <campo>: fecha-ISO }. La
    // Cesión conserva su semántica propia (cesion_firmado_brokergy = ambas firmas).
    const isValidated = (field) => field === 'anexo_cesion_signed_link'
        ? !!local.cesion_firmado_brokergy
        : !!local.docs_validados?.[field];

    const handleValidateSigned = (field) => {
        setLocal(prev => {
            const dv = { ...(prev.docs_validados || {}), [field]: new Date().toISOString() };
            const dr = { ...(prev.docs_rechazados || {}) }; delete dr[field];
            const next = { ...prev, docs_validados: dv, docs_rechazados: dr };
            onSave({ documentacion: next });
            return next;
        });
        setManagingSigned(null);
    };

    // ── Rechazo de documento: marca docs_rechazados (recuadro rojo) y, si se elige
    // cliente/instalador, envía el aviso por WhatsApp/email para que lo corrijan.
    const isRejected = (field) => !!local.docs_rechazados?.[field];

    // Resuelve a quién se notifica REALMENTE (igual que resolveSolicitudContacto del
    // backend): para el instalador, el CONTACTO de notificaciones si está activo.
    const notifyTarget = (t) => {
        if (t === 'cliente' || t === 'CLIENTE') {
            const c = expediente?.clientes || {};
            return {
                nombre: [c.nombre_razon_social, c.apellidos].filter(Boolean).join(' ').trim() || 'Cliente',
                tlf: c.tlf || c.telefono || null,
                email: c.email || null,
            };
        }
        const p = expediente?.prescriptores || {};
        const useContact = p.contacto_notificaciones_activas === true || p.contacto_notificaciones_activas === 'true';
        return {
            nombre: (useContact ? (p.nombre_contacto || p.razon_social) : (p.razon_social || p.acronimo)) || 'Instalador',
            tlf: (useContact ? (p.tlf_contacto || p.tlf) : (p.tlf || p.tlf_contacto || p.landing_telefono_contacto)) || null,
            email: (useContact ? (p.email_contacto || p.email) : (p.email || p.email_contacto)) || null,
        };
    };
    const recipientName = (t) => toTitleCase(notifyTarget(t).nombre);

    // Enlace público de subida según el documento (mismo patrón que el CIFO): el
    // destinatario sube la versión corregida y aparece directamente en su slot.
    const docUploadLink = (field) => {
        const id = expediente?.id;
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        if (!id) return null;
        if (field === 'cert_cifo_signed_link') return `${origin}/subir-cifo/${id}`;
        if (field === 'cert_rite_signed_link') return `${origin}/subir-rite/${id}`;
        if (['anexo_i_signed_link', 'anexo_cesion_signed_link', 'anexo_fotografico_signed_link'].includes(field)) return `${origin}/firmar-anexos/${id}`;
        return null;
    };

    const buildRejectMessage = (t, field, label, motivo) => {
        const nombre = recipientName(t);
        const numExp = expediente?.numero_expediente || '';
        const link = docUploadLink(field);
        return `Hola ${nombre} 👋\n\n`
            + `Hemos revisado «${label}» del expediente ${numExp} y necesitamos que lo corrijáis:\n\n`
            + `• Motivo: ${motivo || '—'}\n\n`
            + (link ? `👉 Súbelo ya corregido directamente aquí:\n${link}\n\n` : '')
            + `¡Gracias!\nBROKERGY — Ingeniería Energética`;
    };

    // Autogenera el mensaje a partir del motivo/destinatario mientras no se edite a mano.
    React.useEffect(() => {
        if (rejectDoc && !rejectMsgEdited) {
            setRejectMsg(buildRejectMessage(rejectTarget, rejectDoc.field, rejectDoc.label, rejectMotivo));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rejectDoc, rejectTarget, rejectMotivo, rejectMsgEdited]);

    const openRejectDoc = (field, label) => {
        setRejectMotivo(''); setRejectMsg(''); setRejectMsgEdited(false); setRejectError(null);
        // Defecto razonable: anexos del cliente → cliente; CIFO/RITE/factura → instalador.
        const clienteFields = ['anexo_i_signed_link', 'anexo_cesion_signed_link', 'anexo_fotografico_signed_link'];
        setRejectTarget(clienteFields.includes(field) ? 'cliente' : 'instalador');
        setRejectDoc({ field, label });
        setManagingSigned(null);
    };

    const confirmRejectDoc = async () => {
        if (!rejectMotivo.trim() || !rejectDoc) return;
        setRejectSending(true); setRejectError(null);
        try {
            const target = rejectTarget === 'cliente' ? 'CLIENTE' : rejectTarget === 'instalador' ? 'INSTALADOR' : 'NINGUNO';
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/rechazar`, {
                field: rejectDoc.field,
                label: rejectDoc.label,
                motivo: rejectMotivo.trim(),
                target,
                channels: ['whatsapp', 'email'],
                mensaje: target === 'NINGUNO' ? '' : rejectMsg,
            });
            // Fusiona SOLO lo que persistió el backend (no pisa ediciones locales sin guardar).
            setLocal(prev => ({ ...prev, docs_rechazados: data.docs_rechazados, docs_validados: data.docs_validados, historial: data.historial }));
            setRejectDoc(null); setRejectMotivo(''); setRejectMsg('');
        } catch (e) {
            setRejectError(e.response?.data?.error || 'No se pudo rechazar el documento.');
        } finally {
            setRejectSending(false);
        }
    };

    const handleSignedUpload = async (field, file) => {
        if (!file) return;

        const displayNames = {
            anexo_i_signed_link: 'Anexo I',
            anexo_cesion_signed_link: 'Anexo Cesión ahorro',
            cert_cifo_signed_link: isReforma ? 'Certificado Reforma RES080' : 'Certificado CIFO',
            ficha_res060_signed_link: 'Ficha RES060',
            anexo_fotografico_signed_link: 'Anexo Fotográfico',
            cert_rite_signed_link: 'Memoria RITE'
        };

        // Cada documento firmado va a su subcarpeta de Drive. El RITE vive en
        // "7. LEGALIZACION RITE"; el resto en "6. ANEXOS CAE".
        const signedSubfolders = {
            cert_rite_signed_link: ["7. LEGALIZACION RITE"]
        };

        const baseName = displayNames[field] || field.replace(/_/g, ' ').toUpperCase();
        const fileName = `${expediente.numero_expediente} - ${baseName}_fdo.pdf`;

        setEditMode(false); // To show progress or lock
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result.split(',')[1];
            try {
                const { data } = await axios.post(`/api/expedientes/${expediente.id}/documents/upload`, {
                    base64,
                    fileName,
                    mimeType: file.type,
                    subfolders: signedSubfolders[field] || ["6. ANEXOS CAE"]
                });
                if (data.drive_link) {
                    setLocal(prev => {
                        const updates = { [field]: data.drive_link };
                        // Cuando el admin sube la Cesión firmada, es la versión final (ambas firmas)
                        if (field === 'anexo_cesion_signed_link') updates.cesion_firmado_brokergy = true;
                        // Re-subir un firmado lo deja como "subido sin revisar": limpia validación/rechazo previos.
                        const dv = { ...(prev.docs_validados || {}) }; delete dv[field];
                        const dr = { ...(prev.docs_rechazados || {}) }; delete dr[field];
                        const next = { ...prev, ...updates, docs_validados: dv, docs_rechazados: dr };
                        onSave({ documentacion: next });
                        return next;
                    });
                    alert('✅ Archivo firmado subido correctamente');
                }
            } catch (err) {
                console.error('Error uploading signed doc:', err);
                alert('Error al subir el archivo firmado');
            }
        };
        reader.readAsDataURL(file);
    };



    const handleToggleSent = (field) => {
        setLocal(prev => {
            const next = { ...prev, [field]: prev[field] ? null : new Date().toISOString() };
            onSave({ documentacion: next });
            return next;
        });
    };

    // partial=true → cliente firmó pero Brokergy aún no (Cesión). dragActive lo controla
    // la fila: al arrastrar un PDF sobre cualquier parte de la fila, su slot se resalta.
    const SignedSlot = ({ link, onUpload, label, field, partial, dragActive = false }) => {
        const slotInputRef = React.useRef();
        const validated = isValidated(field); // subido (ámbar) → validado (verde)
        const rejected = isRejected(field);   // rechazado (rojo)
        return (
            <div className="flex flex-col items-center gap-1 group/slot relative">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (link) {
                            setManagingSigned({ field, link, label });
                        } else {
                            slotInputRef.current.click();
                        }
                    }}
                    title={validated && link ? `${label} — validado (correcto)` : rejected ? `${label} — rechazado: ${local.docs_rechazados?.[field]?.motivo || ''}` : partial ? 'Cliente firmó — subir versión firmada por Brokergy' : (link ? `Gestionar ${label}` : `Arrastra un PDF aquí o pulsa para subir ${label}`)}
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all relative ${
                        dragActive
                        ? 'ring-2 ring-brand ring-offset-2 ring-offset-[#0b0c11] scale-125 bg-brand/25 border-brand text-brand shadow-2xl shadow-brand/40 z-20'
                        : validated && link
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400 shadow-lg shadow-emerald-500/10 hover:bg-emerald-500 hover:text-white'
                        : rejected
                        ? 'bg-red-500/15 border-red-500/40 text-red-400 shadow-lg shadow-red-500/10 hover:bg-red-500 hover:text-white'
                        : partial
                        ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-lg shadow-orange-500/10 hover:bg-orange-500 hover:text-white'
                        : link
                            ? 'bg-brand/10 border-brand/30 text-brand shadow-lg shadow-brand/10 hover:bg-brand hover:text-bkg-deep'
                            : 'bg-white/5 border-white/5 border-dashed hover:border-brand/40 hover:bg-white/[0.07] text-white/20'
                    }`}
                >
                    {dragActive ? (
                        <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16" />
                        </svg>
                    ) : rejected ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    ) : partial ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    ) : link ? (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                        </svg>
                    )}
                    <input
                        type="file"
                        ref={slotInputRef}
                        className="hidden"
                        accept=".pdf"
                        onChange={e => onUpload(e.target.files[0])}
                    />
                </button>
                {dragActive && (
                    <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 z-30 text-[8px] font-black uppercase tracking-widest text-brand whitespace-nowrap bg-bkg-deep/95 px-2 py-0.5 rounded-md border border-brand/40 shadow-lg pointer-events-none">
                        Soltar
                    </span>
                )}
            </div>
        );
    };

    const handleSave = () => {
        onSave({ documentacion: local });
        setEditMode(false);
    };

    const inicialHint = isReforma ? '(obligatorio)' : '(opcional)';
    const finalHint   = '(obligatorio)';

    return (
        <div>
            <ValidationModal 
                isOpen={validation.isOpen}
                onClose={() => setValidation(prev => ({ ...prev, isOpen: false }))}
                missingFields={validation.fields}
                docName={validation.docName}
                onConfirm={validation.onConfirm}
            />

            <AnexoIModal
                isOpen={showAnexoI}
                onClose={() => setShowAnexoI(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('anexo_i_drive_link', link)}
                onRequestSend={({ docs, overrides }) => setEnviarAnexos({ open: true, docs, overrides: overrides || null })}
            />
            <AnexoCesionModal
                isOpen={showAnexoCesion}
                onClose={() => setShowAnexoCesion(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('anexo_cesion_drive_link', link)}
                onRequestSend={({ docs, overrides }) => setEnviarAnexos({ open: true, docs, overrides: overrides || null })}
            />
            <EnviarAnexosModal
                isOpen={enviarAnexos.open}
                onClose={() => setEnviarAnexos(s => ({ ...s, open: false }))}
                onExit={() => { setEnviarAnexos(s => ({ ...s, open: false })); setShowAnexoI(false); setShowAnexoCesion(false); }}
                expediente={expediente}
                results={results}
                initialDocs={enviarAnexos.docs}
                overrides={enviarAnexos.overrides}
                onMarkSent={markAnexosSent}
                onEditCliente={onEditCliente}
            />
            <FichaRes060Modal
                isOpen={showFichaRes060}
                onClose={() => setShowFichaRes060(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('ficha_res060_drive_link', link)}
            />
            <FichaRes080Modal
                isOpen={showFichaRes080}
                onClose={() => setShowFichaRes080(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('ficha_res060_drive_link', link)}
            />
            <FichaRes093Modal
                isOpen={showFichaRes093}
                onClose={() => setShowFichaRes093(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('ficha_res060_drive_link', link)}
            />
            <CertificadoCifoModal
                isOpen={showCertificadoCifo}
                onClose={() => setShowCertificadoCifo(false)}
                expediente={expediente}
                results={results}
                attachments={cifoAttachments}
                onAttachmentsChange={setCifoAttachments}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
                onMarkSent={() => handleModalSaveDrive('cert_cifo_sent_at', new Date().toISOString())}
                onSaveFichaLink={(type, link, driveId) => {
                    const linkField = type === 'cal' ? 'ft_aerotermia_cal_link' : 'ft_aerotermia_acs_link';
                    const idField   = type === 'cal' ? 'ft_aerotermia_cal_id'   : 'ft_aerotermia_acs_id';
                    setLocal(prev => {
                        const next = { ...prev, [linkField]: link, [idField]: driveId };
                        onSave({ documentacion: next });
                        return next;
                    });
                }}
                onSaveExtraAnnexes={(action, annex) => {
                    setLocal(prev => {
                        const list = Array.isArray(prev.cifo_extra_annexes) ? prev.cifo_extra_annexes : [];
                        let next;
                        if (action === 'add') {
                            next = { ...prev, cifo_extra_annexes: [...list, annex] };
                        } else if (action === 'remove') {
                            next = { ...prev, cifo_extra_annexes: list.filter(a => a.driveId !== annex.driveId) };
                        } else {
                            return prev;
                        }
                        // El backend ya persistió; solo refrescamos local + onSave para
                        // que el padre vea el cambio en su próxima renderización.
                        onSave({ documentacion: next });
                        return next;
                    });
                }}
            />
            <CertificadoRes080Modal
                isOpen={showCertificadoRes080}
                onClose={() => setShowCertificadoRes080(false)}
                expediente={expediente}
                results={results}
                attachments={cifoAttachments}
                onAttachmentsChange={setCifoAttachments}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
                onMarkSent={() => handleModalSaveDrive('cert_cifo_sent_at', new Date().toISOString())}
                onSaveFichaLink={(type, link, driveId) => {
                    const linkField = type === 'cal' ? 'ft_aerotermia_cal_link' : 'ft_aerotermia_acs_link';
                    const idField   = type === 'cal' ? 'ft_aerotermia_cal_id'   : 'ft_aerotermia_acs_id';
                    setLocal(prev => {
                        const next = { ...prev, [linkField]: link, [idField]: driveId };
                        onSave({ documentacion: next });
                        return next;
                    });
                }}
                onSaveExtraAnnexes={(action, annex) => {
                    setLocal(prev => {
                        const list = Array.isArray(prev.cifo_extra_annexes) ? prev.cifo_extra_annexes : [];
                        let next;
                        if (action === 'add') {
                            next = { ...prev, cifo_extra_annexes: [...list, annex] };
                        } else if (action === 'remove') {
                            next = { ...prev, cifo_extra_annexes: list.filter(a => a.driveId !== annex.driveId) };
                        } else {
                            return prev;
                        }
                        onSave({ documentacion: next });
                        return next;
                    });
                }}
            />
            <AnexoFotograficoModal
                isOpen={showAnexoFotografico}
                onClose={() => setShowAnexoFotografico(false)}
                expediente={expediente}
                results={results}
                photos={local.photo_attachments}
                onPhotosChange={(newPhotos) => setLocal(p => ({ ...p, photo_attachments: newPhotos }))}
                onSaveDrive={(link) => handleModalSaveDrive('anexo_fotografico_drive_link', link)}
            />

            {/* Popup: sexo del titular antes de generar la Memoria RITE */}
            {sexoPopup.isOpen && (() => {
                const current = (expediente?.clientes?.sexo || '').toUpperCase();
                const cliNombre = [expediente?.clientes?.nombre_razon_social, expediente?.clientes?.apellidos].filter(Boolean).join(' ').trim();
                const busy = !!sexoPopup.saving;
                const SexBtn = ({ value, label, path }) => {
                    const active = current === value;
                    const loading = sexoPopup.saving === value;
                    return (
                        <button type="button" disabled={busy} onClick={() => elegirSexoYGenerar(value)}
                            className={`flex-1 flex flex-col items-center justify-center gap-2 py-6 rounded-2xl border transition-all active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed ${active ? 'bg-brand/15 border-brand/50 text-brand shadow-[0_0_20px_rgba(242,166,64,0.12)]' : 'bg-white/[0.02] border-white/10 text-white/70 hover:border-brand/40 hover:bg-brand/5'}`}>
                            {loading ? (
                                <svg className="w-8 h-8 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                            ) : (
                                <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={path} /></svg>
                            )}
                            <span className="text-sm font-black uppercase tracking-widest">{label}</span>
                            {active && <span className="text-[8px] font-black uppercase tracking-[0.2em] text-brand/70">Actual</span>}
                        </button>
                    );
                };
                return (
                    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => !busy && setSexoPopup({ isOpen: false, saving: null, error: null })}>
                        <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5">
                                <h2 className="text-lg font-black uppercase tracking-tight text-white">Sexo del titular</h2>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                    Se marcará en la Memoria RITE{cliNombre ? ` · ${cliNombre}` : ''}
                                </p>
                            </div>
                            <div className="px-6 py-6 space-y-4">
                                <p className="text-sm text-white/60 leading-relaxed">Indica el sexo del titular para marcar la casilla correspondiente del documento. Se guardará en la ficha del cliente.</p>
                                <div className="flex gap-3">
                                    <SexBtn value="HOMBRE" label="Hombre" path="M10 14a5 5 0 105-5m0 0V4m0 5h-4m4-5h5" />
                                    <SexBtn value="MUJER" label="Mujer" path="M12 14a5 5 0 100-10 5 5 0 000 10zm0 0v6m-3-3h6" />
                                </div>
                                {sexoPopup.error && (
                                    <p className="text-[11px] text-red-400">❌ {sexoPopup.error}</p>
                                )}
                            </div>
                            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                                <button type="button" disabled={busy} onClick={() => setSexoPopup({ isOpen: false, saving: null, error: null })}
                                    className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                                    Cancelar
                                </button>
                                <button type="button" disabled={busy} onClick={() => elegirSexoYGenerar(null)}
                                    className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-all disabled:opacity-40">
                                    Omitir y continuar →
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <EnviarBorradorRiteModal
                isOpen={showEnviarBorrador}
                onClose={() => setShowEnviarBorrador(false)}
                expediente={expediente}
                defaultMessage={borradorMensajeDefault}
                onSent={() => setLocal(prev => {
                    const next = { ...prev, borrador_cert_sent_at: new Date().toISOString() };
                    onSave({ documentacion: next });
                    return next;
                })}
                onUploaded={onBorradorUploaded}
            />

            {/* Indicador de autoguardado: los datos se persisten solos (al cambiar fechas
                o salir de un campo); las subidas y toggles guardan al instante. */}
            <div className="flex items-center justify-end gap-4 mb-6">
                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.15em]">
                    {saving ? (
                        <>
                            <svg className="w-3.5 h-3.5 text-brand animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            <span className="text-brand/70">Guardando…</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-3.5 h-3.5 text-emerald-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            <span className="text-white/25">Cambios guardados automáticamente</span>
                        </>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                    <div className="space-y-6 animate-fade-in">
                        {/* Guard: un PDF soltado fuera de un slot NO debe abrirse en el navegador.
                            Cada SignedSlot hace stopPropagation, así que solo los drops perdidos llegan aquí. */}
                        <div
                            className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]"
                            onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }}
                            onDrop={e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }}
                        >
                            <div className="flex items-center justify-between mb-8 px-4">
                                <h4 className="text-[11px] font-black text-white/40 uppercase tracking-widest">Documentos Generables</h4>
                                <div className="flex items-center gap-6">
                                    <div className="w-[100px] flex justify-center">
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none text-center">Borrador</span>
                                    </div>
                                    <div className="w-11 flex justify-center">
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none text-center">Enviado</span>
                                    </div>
                                    <div className="w-11 flex justify-center">
                                        <span className="text-[8px] font-black text-white/20 uppercase tracking-widest leading-none text-center">PDF<br/>FIRMADO</span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                {/* FACTURAS DE LA OBRA */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Facturas de la Obra</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">{(local.facturas?.length || 0)} factura(s) · carpeta 5.FACTURAS</p>
                                    </div>
                                    <div className="flex items-center gap-6">
                                        <div className="w-[100px]">
                                            <button
                                                onClick={() => setShowFacturasModal(true)}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    (local.facturas?.length > 0)
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                    : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                Gestionar
                                            </button>
                                        </div>
                                        {/* placeholders para alinear con las columnas Enviado/Firmado de las demás filas */}
                                        <div className="w-11" />
                                        <div className="w-11" />
                                    </div>
                                </div>

                                {/* ANEXO I */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'anexo_i' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('anexo_i', f => handleSignedUpload('anexo_i_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo I</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">Declaración Responsable Beneficiario</p>
                                        {local.anexo_i_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_i_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => handleGenerateClick('anexo1', 'Anexo I', () => setShowAnexoI(true))}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    local.anexo_i_drive_link 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                                    : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {local.anexo_i_drive_link ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                disabled={!local.anexo_i_drive_link}
                                                onClick={() => handleToggleSent('anexo_i_sent_at')}
                                                title={local.anexo_i_sent_at ? `Enviado el ${new Date(local.anexo_i_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.anexo_i_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : !local.anexo_i_drive_link
                                                        ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                        : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.anexo_i_signed_link}
                                                field="anexo_i_signed_link"
                                                label="Anexo I Firmado"
                                                dragActive={dragRow === 'anexo_i'}
                                                onUpload={(file) => handleSignedUpload('anexo_i_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ANEXO CESIÓN */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'cesion' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('cesion', f => handleSignedUpload('anexo_cesion_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo Cesión de Ahorro</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">Convenio de Cesión CAE</p>
                                        {local.anexo_cesion_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_cesion_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => handleGenerateClick('cesion', 'Anexo Cesión de Ahorro', () => setShowAnexoCesion(true))}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    local.anexo_cesion_drive_link 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                                    : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {local.anexo_cesion_drive_link ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                disabled={!local.anexo_cesion_drive_link}
                                                onClick={() => handleToggleSent('anexo_cesion_sent_at')}
                                                title={local.anexo_cesion_sent_at ? `Enviado el ${new Date(local.anexo_cesion_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.anexo_cesion_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : !local.anexo_cesion_drive_link
                                                        ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                        : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.anexo_cesion_signed_link}
                                                field="anexo_cesion_signed_link"
                                                label="Anexo Cesión Firmado"
                                                dragActive={dragRow === 'cesion'}
                                                onUpload={(file) => handleSignedUpload('anexo_cesion_signed_link', file)}
                                                partial={!!local.anexo_cesion_signed_link && !local.cesion_firmado_brokergy}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* FICHA RES060 */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'res060' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('res060', f => handleSignedUpload('ficha_res060_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">{isReforma ? 'Ficha RES080' : isHybrid ? 'Ficha RES093' : 'Ficha RES060'}</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">{isReforma ? 'Resultado del cálculo de ahorro — Reforma' : isHybrid ? 'Resultado del cálculo de ahorro — Hibridación' : 'Resultado del cálculo de ahorro energético'}</p>
                                        {local.ficha_res060_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.ficha_res060_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => handleGenerateClick('res060', isReforma ? 'Ficha RES080' : isHybrid ? 'Ficha RES093' : 'Ficha RES060', () => isReforma ? setShowFichaRes080(true) : isHybrid ? setShowFichaRes093(true) : setShowFichaRes060(true))}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    local.ficha_res060_drive_link 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                                    : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {local.ficha_res060_drive_link ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                disabled={!local.ficha_res060_drive_link}
                                                onClick={() => handleToggleSent('ficha_res060_sent_at')}
                                                title={local.ficha_res060_sent_at ? `Enviado el ${new Date(local.ficha_res060_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.ficha_res060_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : !local.ficha_res060_drive_link
                                                        ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                        : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.ficha_res060_signed_link}
                                                field="ficha_res060_signed_link"
                                                label={isReforma ? 'Ficha RES080 Firmada' : isHybrid ? 'Ficha RES093 Firmada' : 'Ficha RES060 Firmada'}
                                                dragActive={dragRow === 'res060'}
                                                onUpload={(file) => handleSignedUpload('ficha_res060_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* CIFO / RES080 */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'cifo' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('cifo', f => handleSignedUpload('cert_cifo_signed_link', f))}>
                                    <div className="w-[260px] min-w-0 shrink-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">
                                            {isReforma ? 'Certificado CAE Reforma' : 'Certificado CIFO'}
                                        </p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">
                                            {isReforma ? 'Cálculos REFORMA RES080' : 'Cálculos automáticos e Instalador'}
                                        </p>
                                        {local.cert_cifo_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.cert_cifo_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-400/60 hover:text-emerald-400 font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>

                                    {/* Fechas del periodo CIFO (calculadas según facturas/certificados) */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        <InlineDate label="Fecha Inicio CIFO" value={local.fecha_inicio_cifo} />
                                        <InlineDate label="Fecha Fin CIFO" value={local.fecha_fin_cifo} />
                                    </div>

                                    <div className="flex items-center gap-6">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button
                                                onClick={() => handleGenerateClick('cifo', isReforma ? 'Certificado Reforma RES080' : 'Certificado CIFO', () => isReforma ? setShowCertificadoRes080(true) : setShowCertificadoCifo(true))}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    local.cert_cifo_drive_link 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                                    : isReforma 
                                                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep' 
                                                        : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {local.cert_cifo_drive_link ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                disabled={!local.cert_cifo_drive_link}
                                                onClick={() => handleToggleSent('cert_cifo_sent_at')}
                                                title={local.cert_cifo_sent_at ? `Enviado el ${new Date(local.cert_cifo_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.cert_cifo_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : !local.cert_cifo_drive_link
                                                        ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                        : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.cert_cifo_signed_link}
                                                field="cert_cifo_signed_link"
                                                label={isReforma ? 'RES080 Firmado' : 'CIFO Firmado'}
                                                dragActive={dragRow === 'cifo'}
                                                onUpload={(file) => handleSignedUpload('cert_cifo_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ANEXO FOTOGRÁFICO */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'foto' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('foto', f => handleSignedUpload('anexo_fotografico_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo Fotográfico</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">
                                            {(local.photo_attachments || []).filter(p => p.file).length} fotos cargadas
                                        </p>
                                        {local.anexo_fotografico_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_fotografico_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => setShowAnexoFotografico(true)}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    local.anexo_fotografico_drive_link 
                                                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]' 
                                                    : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {local.anexo_fotografico_drive_link ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                disabled={!local.anexo_fotografico_drive_link}
                                                onClick={() => handleToggleSent('anexo_fotografico_sent_at')}
                                                title={local.anexo_fotografico_sent_at ? `Enviado el ${new Date(local.anexo_fotografico_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.anexo_fotografico_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : !local.anexo_fotografico_drive_link
                                                        ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                        : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.anexo_fotografico_signed_link}
                                                field="anexo_fotografico_signed_link"
                                                label="Anexo Fotografico Firmado"
                                                dragActive={dragRow === 'foto'}
                                                onUpload={(file) => handleSignedUpload('anexo_fotografico_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* CERTIFICADO RITE */}
                                <div className={`flex flex-col gap-4 p-4 rounded-2xl border transition-all ${dragRow === 'rite_cert' ? 'ring-2 ring-brand/40 bg-brand/[0.05] border-brand/30' : 'bg-white/[0.02] border-white/[0.04]'}`} {...rowDragProps('rite_cert', f => handleSignedUpload('cert_rite_signed_link', f))}>
                                    <div className="flex items-center justify-between gap-6">
                                        <div className="w-[260px] min-w-0 shrink-0">
                                            <p className="text-sm font-black text-white uppercase tracking-tight mb-1">Certificado RITE</p>
                                            <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest mb-1">Gestión manual (Drive)</p>
                                        </div>

                                        {/* Fechas del Certificado de Instalación Térmica (editables en modo edición) */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <InlineDate label="Fecha Pruebas Cert. Inst." value={local.fecha_pruebas_cert_instalacion} onChange={v => commitField('fecha_pruebas_cert_instalacion', v)} />
                                            <InlineDate label="Fecha Firma Cert. Inst." value={local.fecha_firma_cert_instalacion} onChange={v => commitField('fecha_firma_cert_instalacion', v)} />
                                        </div>

                                        <div className="flex items-center gap-6">
                                            {/* 1. BORRADOR (Manual Drive Link) */}
                                            <div className="w-[100px]">
                                                <button
                                                    onClick={() => setShowRiteLinkInput(v => !v)}
                                                    className={`w-full py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                                        local.cert_rite_drive_link
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep'
                                                        : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white'
                                                    }`}
                                                >
                                                    {local.cert_rite_drive_link ? 'Aportado' : 'Enlace'}
                                                </button>
                                            </div>

                                            {/* 2. ENVIADO */}
                                            <div className="w-11 flex justify-center">
                                                <button
                                                    disabled={!local.cert_rite_drive_link}
                                                    onClick={() => handleToggleSent('cert_rite_sent_at')}
                                                    title={local.cert_rite_sent_at ? `Enviado el ${new Date(local.cert_rite_sent_at).toLocaleDateString()}` : 'Marcar como enviado'}
                                                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                        local.cert_rite_sent_at
                                                        ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                        : !local.cert_rite_drive_link
                                                            ? 'bg-white/5 border-white/5 text-white/5 cursor-not-allowed'
                                                            : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                    }`}
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                </button>
                                            </div>

                                            {/* 3. PDF FIRMADO — fallback al link del cert si aún no hay versión firmada separada */}
                                            <div className="w-11">
                                                <SignedSlot
                                                    link={local.cert_rite_signed_link || local.cert_rite_drive_link}
                                                    field="cert_rite_signed_link"
                                                    label="Certificado RITE"
                                                    dragActive={dragRow === 'rite_cert'}
                                                    onUpload={(file) => handleSignedUpload('cert_rite_signed_link', file)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    {showRiteLinkInput && (
                                        <div className="animate-slide-up pt-2 border-t border-white/5">
                                            <label className="block text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2 ml-1">Enlace a Documento Drive · se guarda al salir del campo</label>
                                            <input
                                                type="text"
                                                value={local.cert_rite_drive_link || ''}
                                                onChange={e => setLocal(p => ({ ...p, cert_rite_drive_link: e.target.value || null }))}
                                                onBlur={() => setLocal(p => { onSave({ documentacion: p }); return p; })}
                                                placeholder="https://drive.google.com/..."
                                                className="w-full bg-bkg-elevated border border-white/5 rounded-xl px-4 py-2.5 text-white text-[11px] font-bold focus:outline-none focus:border-brand/40 transition-all"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* MEMORIA RITE + BORRADOR CERTIFICADO RITE (se generan y envían juntos) */}
                                <div className={`flex items-center justify-between gap-6 p-4 rounded-2xl transition-all group ${dragRow === 'rite_memoria' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('rite_memoria', f => handleSignedUpload('cert_rite_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Memoria RITE + Borrador Certificado RITE</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">
                                            Word + PDF + Borrador · para el instalador
                                        </p>
                                        {user?.rol === 'ADMIN' && (local.cert_rite_drive_link || local.memoria_rite_pdf_link || local.borrador_cert_rite_link || local.memoria_rite_guia_link) && (
                                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                                {local.cert_rite_drive_link && <a href={local.cert_rite_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-400/60 hover:text-emerald-400 font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all">Memoria (Word)</a>}
                                                {local.memoria_rite_pdf_link && <a href={local.memoria_rite_pdf_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-400/60 hover:text-emerald-400 font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all">Memoria (PDF)</a>}
                                                {local.borrador_cert_rite_link && <a href={local.borrador_cert_rite_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-emerald-400/60 hover:text-emerald-400 font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all">Borrador</a>}
                                                {local.memoria_rite_guia_link && <a href={local.memoria_rite_guia_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all">Guía JE6</a>}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6">
                                        {/* 1. GENERAR / ACCIONES (abre el modal) */}
                                        <div className="w-[100px]">
                                            <button
                                                onClick={() => handleGenerateClick('memoria_rite', 'Memoria + Borrador RITE', abrirSexoThenBorrador)}
                                                className={`w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                                    (local.cert_rite_drive_link || local.borrador_cert_rite_link)
                                                        ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                                                        : 'bg-brand/10 border border-brand/20 text-brand hover:bg-brand hover:text-bkg-deep'
                                                }`}
                                            >
                                                {(local.cert_rite_drive_link || local.borrador_cert_rite_link) ? 'Generado' : 'Generar'}
                                            </button>
                                        </div>

                                        {/* 2. ENVIADO (abre modal de envío) */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                onClick={() => setShowEnviarBorrador(true)}
                                                title={local.borrador_cert_sent_at ? `Enviado el ${new Date(local.borrador_cert_sent_at).toLocaleDateString()}` : 'Enviar al instalador'}
                                                className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all ${
                                                    local.borrador_cert_sent_at
                                                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400 shadow-lg shadow-blue-500/10 hover:bg-blue-500 hover:text-white'
                                                    : 'bg-orange-500/10 border-orange-500/20 text-orange-500 hover:bg-orange-500 hover:text-white'
                                                }`}
                                            >
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                                </svg>
                                            </button>
                                        </div>

                                        {/* 3. PDF FIRMADO (memoria firmada) */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.cert_rite_signed_link}
                                                field="cert_rite_signed_link"
                                                label="Memoria RITE Firmada"
                                                dragActive={dragRow === 'rite_memoria'}
                                                onUpload={(file) => handleSignedUpload('cert_rite_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
            </div>
            {/* MODAL GESTIÓN FIRMADOS */}
            {managingSigned && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bkg-deep/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#0b0c11] border border-white/10 rounded-2xl sm:rounded-[2.5rem] w-full max-w-5xl h-[90vh] sm:h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />

                        {/* Header */}
                        <div className="p-5 sm:p-8 border-b border-white/5 flex items-center justify-between relative z-10">
                            <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-[0.2em]">{managingSigned.label}</h3>
                                <p className="text-[10px] text-brand font-black uppercase tracking-[0.3em] mt-1.5 opacity-60">Gestión de Documento Firmado</p>
                            </div>
                            <button onClick={() => setManagingSigned(null)} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10">
                                <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Visor */}
                        <div className="flex-1 bg-black/40 p-1 relative z-10">
                            <iframe 
                                src={managingSigned.link.replace('/view?usp=drivesdk', '/preview')} 
                                className="w-full h-full border-0"
                                title="Visor Documento"
                            />
                        </div>

                        {/* Footer — acciones de revisión (moderno, mobile-first) */}
                        <div className="p-4 sm:p-6 border-t border-white/5 bg-white/[0.01] relative z-10 space-y-2.5">
                            {/* Principales: validar / rechazar */}
                            <div className="flex flex-col sm:flex-row gap-2.5">
                                {managingSigned.field === 'anexo_cesion_signed_link' && !local.cesion_firmado_brokergy ? (
                                    <button
                                        onClick={() => {
                                            setLocal(prev => { const next = { ...prev, cesion_firmado_brokergy: true }; onSave({ documentacion: next }); return next; });
                                            setManagingSigned(null);
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500 hover:text-white transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/10"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        Brokergy ha firmado
                                    </button>
                                ) : isValidated(managingSigned.field) ? (
                                    <div className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-emerald-500/[0.07] border border-emerald-500/20 text-emerald-400/80 text-[11px] font-black uppercase tracking-[0.15em]">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        Validado
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => handleValidateSigned(managingSigned.field)}
                                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500 hover:text-white transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/10"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                        Validar — correcto
                                    </button>
                                )}
                                <button
                                    onClick={() => openRejectDoc(managingSigned.field, managingSigned.label)}
                                    className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-[11px] font-black uppercase tracking-[0.15em] hover:bg-red-500 hover:text-white transition-all active:scale-[0.98] shadow-lg shadow-red-500/5"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                    Rechazar
                                </button>
                            </div>
                            {/* Secundarias: sustituir / abrir en Drive / eliminar */}
                            <div className="flex flex-wrap items-center gap-2">
                                <label className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-brand/10 border border-brand/25 text-brand text-[10px] font-black uppercase tracking-[0.15em] hover:bg-brand hover:text-bkg-deep transition-all cursor-pointer active:scale-[0.98]">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                    Sustituir
                                    <input type="file" className="hidden" accept=".pdf" onChange={e => { if (e.target.files[0]) { handleSignedUpload(managingSigned.field, e.target.files[0]); setManagingSigned(null); } }} />
                                </label>
                                {user?.rol === 'ADMIN' && (
                                    <button onClick={() => window.open(managingSigned.link, '_blank')} className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white/55 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-white/10 hover:text-white transition-all active:scale-[0.98]">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        Abrir en Drive
                                    </button>
                                )}
                                <button onClick={() => handleDeleteSigned(managingSigned.field)} className="flex-1 min-w-[120px] inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-red-500/15 text-red-500/70 text-[10px] font-black uppercase tracking-[0.15em] hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all active:scale-[0.98]">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                    Eliminar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de RECHAZO de documento (motivo + destinatario + mensaje → aviso) */}
            {rejectDoc && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={() => !rejectSending && setRejectDoc(null)}>
                    <div className="bg-[#0F1013] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-white/10 bg-red-500/5 flex items-center gap-3 text-red-400">
                            <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="min-w-0">
                                <h3 className="text-base font-black uppercase tracking-tight">Rechazar documento</h3>
                                <p className="text-[11px] text-white/40 truncate">{rejectDoc.label}</p>
                            </div>
                        </div>

                        <div className="px-6 py-5 space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">¿Por qué se rechaza?</label>
                                <textarea value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} rows={2} placeholder="Ej: el importe no coincide con la base imponible" className="no-uppercase w-full bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400/50 resize-none" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Enviar a corregir a</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['cliente', 'instalador', 'ninguno'].map(v => (
                                        <button key={v} onClick={() => setRejectTarget(v)} title={v === 'ninguno' ? 'Solo rechazar, sin enviar mensaje' : recipientName(v)}
                                            className={`py-2.5 px-2 rounded-xl border transition-all text-center ${rejectTarget === v ? 'border-red-400/80 bg-red-400/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
                                            <span className={`block text-[10px] font-black uppercase tracking-widest ${rejectTarget === v ? 'text-red-300' : 'text-white/60'}`}>{v === 'ninguno' ? 'Sin aviso' : v === 'cliente' ? 'Cliente' : 'Instalador'}</span>
                                            <span className="block text-[9px] font-bold normal-case truncate mt-0.5 text-white/35">{v === 'ninguno' ? 'No enviar' : recipientName(v)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {rejectTarget !== 'ninguno' && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Mensaje (editable)</label>
                                    <textarea value={rejectMsg} onChange={e => { setRejectMsg(e.target.value); setRejectMsgEdited(true); }} rows={7} className="no-uppercase w-full bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-red-400/50 resize-none" />
                                    <p className="text-[10px] text-white/25 mt-1.5 normal-case">Se enviará por WhatsApp/email a <span className="text-white/45">{recipientName(rejectTarget)}</span>{(() => { const nt = notifyTarget(rejectTarget); const d = nt.tlf || nt.email; return d ? <span className="text-white/30"> · {d}</span> : null; })()}.</p>
                                </div>
                            )}
                            {rejectError && <p className="text-[12px] text-red-400">⚠️ {rejectError}</p>}
                        </div>

                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/10 flex gap-3">
                            <button onClick={() => setRejectDoc(null)} disabled={rejectSending} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">Cancelar</button>
                            <button onClick={confirmRejectDoc} disabled={rejectSending || !rejectMotivo.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-40">{rejectSending ? 'Enviando…' : rejectTarget === 'ninguno' ? 'Rechazar' : 'Rechazar y avisar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal de gestión de FACTURAS (desde la pestaña Documentación) */}
            {showFacturasModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bkg-deep/90 backdrop-blur-xl animate-fade-in" onClick={() => setShowFacturasModal(false)}>
                    <div className="bg-[#0b0c11] border border-white/10 rounded-2xl sm:rounded-[2rem] w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-5 sm:p-6 border-b border-white/5 flex items-center justify-between">
                            <div>
                                <h3 className="text-base font-black text-white uppercase tracking-[0.15em]">Facturas de la Obra</h3>
                                <p className="text-[10px] text-brand font-black uppercase tracking-[0.2em] mt-1 opacity-60">Carpeta Drive · 5.FACTURAS</p>
                            </div>
                            <button onClick={() => setShowFacturasModal(false)} className="w-9 h-9 flex items-center justify-center hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-white/10">
                                <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                        <div className="p-5 sm:p-6 overflow-y-auto flex-1">
                            <FacturasSection
                                expedienteId={expediente?.id}
                                facturas={local.facturas || []}
                                onChange={handleFacturasChange}
                                readOnly={false}
                            />
                        </div>
                        <div className="p-4 sm:p-5 border-t border-white/5 bg-white/[0.01] flex justify-end gap-3">
                            <button onClick={() => setShowFacturasModal(false)} className="px-5 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">Cerrar</button>
                            <button onClick={() => { onSave({ documentacion: local }); setShowFacturasModal(false); }} disabled={saving} className="px-6 py-2.5 rounded-xl bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest hover:scale-[1.02] transition-all disabled:opacity-50">{saving ? 'Guardando…' : 'Guardar Facturas'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
