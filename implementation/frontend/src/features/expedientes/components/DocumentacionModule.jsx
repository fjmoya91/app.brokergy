import React, { useState, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { AnexoIModal } from './AnexoIModal';
import { AnexoCesionModal } from './AnexoCesionModal';
import { FichaRes060Modal } from './FichaRes060Modal';
import { FichaRes080Modal } from './FichaRes080Modal';
import { FichaRes093Modal } from './FichaRes093Modal';
import { CertificadoCifoModal } from './CertificadoCifoModal';
import { CertificadoRes080Modal } from './CertificadoRes080Modal';
import { AnexoFotograficoModal } from './AnexoFotograficoModal';

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
        doc.fecha_firma_cert_instalacion,
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
            const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/facturas/upload`, {
                base64,
                fileName: file.name,
                mimeType: file.type || 'application/pdf'
            });
            updateFactura(idx, 'drive_link', data.drive_link);
        } catch (err) {
            console.error('Error subiendo factura:', err);
            alert('Error al subir la factura a Drive. Comprueba la configuración de Drive.');
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
                                                    <input type="file" accept=".pdf" className="hidden" onChange={e => handleFileUpload(idx, e.target.files[0])} />
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
                                                    Subir PDF a Drive (5.FACTURAS)
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept=".pdf"
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
export function DocumentacionModule({ expediente, onSave, onLiveUpdate, saving, results }) {
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
            cifo_attachments: [
                { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
                { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
            ],
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
        const cifo = calcCifo(doc);
        return { ...doc, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
    });

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
                cifo_attachments: [
                    { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
                    { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
                ],
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
    const [showAnexoI, setShowAnexoI] = useState(false);
    const [showAnexoCesion, setShowAnexoCesion] = useState(false);
    const [showFichaRes060, setShowFichaRes060] = useState(false);
    const [showFichaRes080, setShowFichaRes080] = useState(false);
    const [showFichaRes093, setShowFichaRes093] = useState(false);
    const [showCertificadoCifo, setShowCertificadoCifo] = useState(false);
    const [showCertificadoRes080, setShowCertificadoRes080] = useState(false);
    const [showAnexoFotografico, setShowAnexoFotografico] = useState(false);
    const [managingSigned, setManagingSigned] = useState(null); // { field, link, label }

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
            
            const hasAcs = !!(op.datos_calculo?.inputs?.changeAcs === true || op.datos_calculo?.inputs?.incluir_acs === true);
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

    const handleSignedUpload = async (field, file) => {
        if (!file) return;

        const displayNames = {
            anexo_i_signed_link: 'Anexo I',
            anexo_cesion_signed_link: 'Anexo Cesión ahorro',
            cert_cifo_signed_link: isReforma ? 'Certificado Reforma RES080' : 'Certificado CIFO',
            ficha_res060_signed_link: 'Ficha RES060',
            anexo_fotografico_signed_link: 'Anexo Fotográfico'
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
                    subfolders: ["6. ANEXOS CAE"]
                });
                if (data.drive_link) {
                    setLocal(prev => {
                        const next = { ...prev, [field]: data.drive_link };
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

    const SignedSlot = ({ link, onUpload, label, field }) => {
        const slotInputRef = React.useRef();
        return (
            <div className="flex flex-col items-center gap-1 group/slot">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (link) {
                            setManagingSigned({ field, link, label });
                        } else {
                            slotInputRef.current.click();
                        }
                    }}
                    title={link ? `Gestionar ${label}` : `Subir ${label}`}
                    className={`w-11 h-11 rounded-2xl border flex items-center justify-center transition-all relative ${
                        link 
                        ? 'bg-brand/10 border-brand/30 text-brand shadow-lg shadow-brand/10 hover:bg-brand hover:text-bkg-deep' 
                        : 'bg-white/5 border-white/5 border-dashed hover:border-brand/40 hover:bg-white/[0.07] text-white/20'
                    }`}
                >
                    {link ? (
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
            </div>
        );
    };

    const handleSave = () => {
        onSave({ documentacion: local });
        setEditMode(false);
    };

    const inicialHint = isReforma ? '(obligatorio)' : '(opcional)';
    const finalHint   = '(obligatorio)';

    const [activeSubTab, setActiveSubTab] = useState('fechas');

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
            />
            <AnexoCesionModal
                isOpen={showAnexoCesion}
                onClose={() => setShowAnexoCesion(false)}
                expediente={expediente}
                results={results}
                onSaveDrive={(link) => handleModalSaveDrive('anexo_cesion_drive_link', link)}
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
                attachments={local.cifo_attachments}
                onAttachmentsChange={(newAnexos) => setLocal(p => ({ ...p, cifo_attachments: newAnexos }))}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
                onSaveFichaLink={(type, link, driveId) => {
                    const linkField = type === 'cal' ? 'ft_aerotermia_cal_link' : 'ft_aerotermia_acs_link';
                    const idField   = type === 'cal' ? 'ft_aerotermia_cal_id'   : 'ft_aerotermia_acs_id';
                    setLocal(prev => {
                        const next = { ...prev, [linkField]: link, [idField]: driveId };
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
                attachments={local.res080_attachments}
                onAttachmentsChange={(newAnexos) => setLocal(p => ({ ...p, res080_attachments: newAnexos }))}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
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

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div className="flex p-0.5 bg-white/5 rounded-xl border border-white/5 w-fit">
                    <button
                        onClick={() => setActiveSubTab('fechas')}
                        className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all ${
                            activeSubTab === 'fechas'
                                ? 'bg-brand text-bkg-deep shadow-lg'
                                : 'text-white/40 hover:text-white'
                        }`}
                    >
                        Fechas y Facturas
                    </button>
                    <button
                        onClick={() => setActiveSubTab('docs')}
                        className={`px-6 py-2 text-[10px] font-black uppercase tracking-[0.2em] rounded-lg transition-all ${
                            activeSubTab === 'docs'
                                ? 'bg-brand text-bkg-deep shadow-lg'
                                : 'text-white/40 hover:text-white'
                        }`}
                    >
                        Documentación
                    </button>
                </div>

                <div className="flex items-center gap-2">
                    {editMode ? (
                        <>
                            <button
                                onClick={() => setEditMode(false)}
                                className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/50 hover:text-white transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-4 py-1.5 text-xs rounded-lg bg-brand text-bkg-deep font-black uppercase tracking-wider disabled:opacity-50"
                            >
                                {saving ? 'Guardando...' : 'Guardar Datos'}
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => setEditMode(true)}
                            className="px-3 py-1.5 text-xs rounded-lg border border-white/10 text-white/50 hover:text-white hover:border-white/30 transition-colors"
                        >
                            Editar
                        </button>
                    )}
                </div>
            </div>

            <div className="space-y-6">
                {activeSubTab === 'fechas' ? (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-6">
                                <h4 className="text-[11px] font-black text-amber-500/80 uppercase tracking-widest">CEE Inicial</h4>
                                <span className="text-[10px] text-white/20 uppercase font-black">{inicialHint}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <DateField label="Fecha Visita" value={local.fecha_visita_cee_inicial} onChange={v => setField('fecha_visita_cee_inicial', v)} readOnly={!editMode} />
                                <DateField label="Fecha Firma" value={local.fecha_firma_cee_inicial} onChange={v => setField('fecha_firma_cee_inicial', v)} readOnly={!editMode} />
                                <DateField label="Fecha Registro" value={local.fecha_registro_cee_inicial} onChange={v => setField('fecha_registro_cee_inicial', v)} readOnly={!editMode} />
                            </div>
                        </div>

                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]">
                            <div className="flex items-center gap-2 mb-6">
                                <h4 className="text-[11px] font-black text-green-500/80 uppercase tracking-widest">CEE Final</h4>
                                <span className="text-[10px] text-red-500/40 uppercase font-black">{finalHint}</span>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                <DateField label="Fecha Visita" value={local.fecha_visita_cee_final} onChange={v => setField('fecha_visita_cee_final', v)} readOnly={!editMode} />
                                <DateField label="Fecha Firma" value={local.fecha_firma_cee_final} onChange={v => setField('fecha_firma_cee_final', v)} readOnly={!editMode} />
                                <DateField label="Fecha Registro" value={local.fecha_registro_cee_final} onChange={v => setField('fecha_registro_cee_final', v)} readOnly={!editMode} />
                            </div>
                        </div>

                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]">
                            <FacturasSection
                                expedienteId={expediente?.id}
                                facturas={local.facturas || []}
                                onChange={handleFacturasChange}
                                readOnly={!editMode}
                            />
                        </div>

                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]">
                            <h4 className="text-[11px] font-black text-white/40 uppercase tracking-widest mb-6">
                                Certificado de Instalación Térmica
                            </h4>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <DateField label="Fecha Pruebas Cert. Instalación" value={local.fecha_pruebas_cert_instalacion} onChange={v => setField('fecha_pruebas_cert_instalacion', v)} readOnly={!editMode} />
                                <DateField label="Fecha Firma Cert. Instalación" value={local.fecha_firma_cert_instalacion} onChange={v => setField('fecha_firma_cert_instalacion', v)} readOnly={!editMode} />
                            </div>
                        </div>

                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-brand/10">
                            <h4 className="text-[11px] font-black text-brand/80 uppercase tracking-widest mb-1">Periodo CIFO</h4>
                            <p className="text-white/20 text-[10px] mb-6 uppercase tracking-wider font-bold">Calculado según el rango de facturas y certificados.</p>
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 ml-1">Fecha Inicio CIFO</label>
                                    <div className="bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white/60 text-sm font-bold">
                                        {formatDateDisplay(local.fecha_inicio_cifo)}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-2 ml-1">Fecha Fin CIFO</label>
                                    <div className="bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white/60 text-sm font-bold">
                                        {formatDateDisplay(local.fecha_fin_cifo)}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-bkg-surface/60 rounded-xl p-6 border border-white/[0.06]">
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
                                {/* ANEXO I */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
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
                                                onUpload={(file) => handleSignedUpload('anexo_i_signed_link', file)} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ANEXO CESIÓN */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
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
                                                onUpload={(file) => handleSignedUpload('anexo_cesion_signed_link', file)} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* FICHA RES060 */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
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
                                                onUpload={(file) => handleSignedUpload('ficha_res060_signed_link', file)} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* CIFO / RES080 */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                                    <div className="flex-1 min-w-0">
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
                                                onUpload={(file) => handleSignedUpload('cert_cifo_signed_link', file)} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ANEXO FOTOGRÁFICO */}
                                <div className="flex items-center justify-between gap-6 p-4 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
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
                                                onUpload={(file) => handleSignedUpload('anexo_fotografico_signed_link', file)} 
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* CERTIFICADO RITE */}
                                <div className="flex flex-col gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
                                    <div className="flex items-center justify-between gap-6">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-black text-white uppercase tracking-tight mb-1">Certificado RITE</p>
                                            <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest mb-1">Gestión manual (Drive)</p>
                                            {local.cert_rite_drive_link && user?.rol === 'ADMIN' ? (
                                                <a href={local.cert_rite_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all">Ver en Drive</a>
                                            ) : (
                                                <span className="text-[9px] text-white/5 font-black uppercase tracking-widest italic">Link pendiente...</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-6">
                                            {/* 1. BORRADOR (Manual Drive Link) */}
                                            <div className="w-[100px]">
                                                <button 
                                                    onClick={() => setEditMode(true)}
                                                    className={`w-full py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                                                        local.cert_rite_drive_link
                                                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep'
                                                        : 'border-white/10 text-white/30 hover:border-white/20 hover:text-white'
                                                    }`}
                                                >
                                                    {local.cert_rite_drive_link ? 'Aportado' : 'Editar'}
                                                </button>
                                            </div>

                                            {/* 2. ENVIADO (Spacer) */}
                                            <div className="w-11" />

                                            {/* 3. PDF FIRMADO (Spacer for now as it's manual) */}
                                            <div className="w-11" />
                                        </div>
                                    </div>
                                    {editMode && (
                                        <div className="animate-slide-up pt-2 border-t border-white/5">
                                            <label className="block text-[8px] font-black text-white/20 uppercase tracking-[0.2em] mb-2 ml-1">Enlace a Documento Drive</label>
                                            <input
                                                type="text"
                                                value={local.cert_rite_drive_link || ''}
                                                onChange={e => setLocal(p => ({ ...p, cert_rite_drive_link: e.target.value || null }))}
                                                placeholder="https://drive.google.com/..."
                                                className="w-full bg-bkg-elevated border border-white/5 rounded-xl px-4 py-2.5 text-white text-[11px] font-bold focus:outline-none focus:border-brand/40 transition-all"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
            {/* MODAL GESTIÓN FIRMADOS */}
            {managingSigned && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-bkg-deep/90 backdrop-blur-xl animate-fade-in">
                    <div className="bg-[#0b0c11] border border-white/10 rounded-[2.5rem] w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                        
                        {/* Header */}
                        <div className="p-8 border-b border-white/5 flex items-center justify-between relative z-10">
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

                        {/* Footer */}
                        <div className="p-8 border-t border-white/5 flex items-center justify-between bg-white/[0.01] relative z-10">
                            <button 
                                onClick={() => handleDeleteSigned(managingSigned.field)}
                                className="px-8 py-3.5 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all active:scale-95 shadow-lg shadow-red-500/5"
                            >
                                Eliminar Documento
                            </button>

                            <div className="flex items-center gap-4">
                                {user?.rol === 'ADMIN' && (
                                    <button 
                                        onClick={() => window.open(managingSigned.link, '_blank')}
                                        className="px-8 py-3.5 rounded-2xl bg-white/5 border border-white/10 text-white/60 text-[11px] font-black uppercase tracking-[0.2em] hover:bg-white/10 hover:text-white transition-all active:scale-95"
                                    >
                                        Abrir en Drive
                                    </button>
                                )}
                                <label className="px-10 py-3.5 rounded-2xl bg-brand text-bkg-deep text-[11px] font-black uppercase tracking-[0.2em] hover:scale-[1.02] transition-all cursor-pointer shadow-xl shadow-brand/20 active:scale-95">
                                    Sustituir Archivo
                                    <input 
                                        type="file" 
                                        className="hidden" 
                                        accept=".pdf" 
                                        onChange={e => {
                                            if (e.target.files[0]) {
                                                handleSignedUpload(managingSigned.field, e.target.files[0]);
                                                setManagingSigned(null);
                                            }
                                        }} 
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
