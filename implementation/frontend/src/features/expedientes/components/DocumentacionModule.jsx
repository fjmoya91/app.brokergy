import React, { useState, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { toTitleCase } from '../logic/certMessages';
import { unidadesSinSerie, countUnidades } from '../logic/aerotermiaUnits';
import { AnexoIModal } from './AnexoIModal';
import { AnexoCesionModal } from './AnexoCesionModal';
import { FichaRes060Modal } from './FichaRes060Modal';
import { FichaRes080Modal } from './FichaRes080Modal';
import { FichaRes093Modal } from './FichaRes093Modal';
import { FichaTer100Modal } from './FichaTer100Modal';
import { esTer100 } from '../logic/ter100';
import { CertificadoCifoModal } from './CertificadoCifoModal';
import { CertificadoRes080Modal } from './CertificadoRes080Modal';
import { AnexoFotograficoModal } from './AnexoFotograficoModal';
import { EnviarBorradorRiteModal } from './EnviarBorradorRiteModal';
import { EnviarAnexosModal } from './EnviarAnexosModal';
import { CesionManuscritaModal, esFirmaManuscrita } from './CesionManuscritaModal';
import { SendActionOverlay } from '../../../components/SendActionOverlay';
import FirmarConCertificadoModal from './FirmarConCertificadoModal';
import { SIGN_BOXES } from '../logic/signBoxes';
import { clienteContacts, instaladorContacts, defaultContactId, phoneValid } from '../utils/docContacts';
import { calcCifo } from '../logic/calcCifo';
import { readAnnexPrefs, orderAttachments } from '../logic/annexPrefs';
import { ftAttachmentSlots, ftDocFields } from '../logic/fichasTecnicas';

// Cada documento firmado vive en su subcarpeta de Drive: el RITE en
// "7. LEGALIZACION RITE", las facturas en "5. FACTURAS" y el resto en "6. ANEXOS CAE".
// Lo usan tanto la subida manual como la firma con certificado, para que un documento
// firmado desde la app no acabe en otra carpeta distinta de la suya.
const SIGNED_SUBFOLDER_DEFAULT = '6. ANEXOS CAE';
const SIGNED_SUBFOLDER = {
    cert_rite_signed_link: '7. LEGALIZACION RITE',
    facturas_combined_link: '5. FACTURAS',
};

// Los ÚNICOS dos documentos que firma Brokergy con su certificado: el Acuerdo de
// Cesión (como Cesionario) y el Anexo Fotográfico. Al firmarlos quedan validados
// automáticamente — ver AUTO_VALIDATE_ON_SIGN en backend/routes/expedientes.js.
// Del resto no somos firmantes: se revisan y se validan a mano, sin firma nuestra.
const FIRMABLES_CON_CERTIFICADO = new Set([
    'anexo_cesion_signed_link',
    'anexo_fotografico_signed_link',
]);

// Documentos que se pueden abrir YA firmando desde un enlace externo
// (`/?exp=<id>&firmar=<clave>`): el aviso de "falta tu firma en el Anexo de Cesión"
// manda `firmar=cesion` y, al abrir el expediente, salta directamente el popup de
// Autofirma sobre el PDF que subió el cliente. Solo claves de FIRMABLES_CON_CERTIFICADO.
const AUTO_FIRMA_DOCS = {
    cesion: { field: 'anexo_cesion_signed_link', label: 'Anexo Cesión de Ahorro' },
    fotografico: { field: 'anexo_fotografico_signed_link', label: 'Anexo Fotográfico' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Puerta previa al Convenio de Cesión: ¿la obra está terminada?
 *
 * No es un detalle de redacción. El convenio de obra EJECUTADA afirma que la
 * actuación se ha llevado a cabo y que el ahorro ya existe; firmado antes de la
 * obra, el cliente declara como hecho algo que no ha pasado. El convenio PREVIO
 * dice lo mismo en futuro y advierte de que el ahorro es estimado.
 *
 * Se propone la respuesta según haya facturas registradas, pero decide la
 * persona: puede haber una factura suelta subida por el cliente con la obra a
 * medias, o una obra acabada cuya factura aún no ha llegado.
 */
function CesionObraGate({ isOpen, sugerencia, onElegir, onCancel }) {
    if (!isOpen) return null;
    const Opcion = ({ activa, titulo, texto, onClick }) => (
        <button onClick={onClick}
            className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all ${activa
                ? 'border-brand/40 bg-brand/[0.06] hover:bg-brand/[0.1]'
                : 'border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/20'}`}>
            <div className="flex items-center gap-2">
                <span className="text-sm font-black text-white">{titulo}</span>
                {activa && <span className="text-[9px] font-black uppercase tracking-widest text-brand">Sugerido</span>}
            </div>
            <p className="text-[11px] text-white/45 leading-relaxed mt-1">{texto}</p>
        </button>
    );
    return (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="px-6 py-5 border-b border-white/[0.07]">
                    <h2 className="text-lg font-black uppercase tracking-tight text-white">¿La obra está finalizada?</h2>
                    <p className="text-[11px] text-white/40 mt-1">
                        {sugerencia
                            ? 'El expediente ya tiene facturas registradas.'
                            : 'El expediente todavía no tiene ninguna factura registrada.'}
                    </p>
                </div>
                <div className="px-6 py-5 space-y-3">
                    <Opcion activa={!sugerencia} titulo="Todavía no, está en obra"
                        texto="Convenio PREVIO: la actuación y el ahorro se describen como previstos y estimados. Es el que se firma mientras no haya facturas."
                        onClick={() => onElegir(false)} />
                    <Opcion activa={sugerencia} titulo="Sí, la obra está terminada"
                        texto="Convenio de obra EJECUTADA: la actuación se describe como realizada."
                        onClick={() => onElegir(true)} />
                </div>
                <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07]">
                    <button onClick={onCancel}
                        className="w-full px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
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
        <div className="flex flex-col items-center gap-1 shrink-0 max-md:flex-1 max-md:min-w-0">
            <span className="text-[8px] font-black uppercase text-white/30 tracking-[0.12em] whitespace-nowrap text-center leading-tight">{label}</span>
            {onChange ? (
                <input
                    type="date"
                    value={value || ''}
                    onChange={e => onChange(e.target.value || null)}
                    disabled={readOnly}
                    className={`no-uppercase bg-bkg-elevated border rounded-lg px-2 max-md:px-1 py-2 text-[10px] text-center font-mono w-[122px] max-md:w-full focus:outline-none transition-colors ${readOnly ? 'border-white/5 text-white/45 cursor-not-allowed' : 'border-white/10 text-white/80 focus:border-brand/50 cursor-pointer hover:border-white/20'}`}
                />
            ) : (
                <div className="bg-bkg-elevated border border-white/5 rounded-lg px-2 py-2 text-[10px] text-center font-bold text-white/55 w-[122px] max-md:w-full">
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

// ─── Componente de Facturas ───────────────────────────────────────────────────
// Id de Drive de una factura. Las antiguas se guardaron solo con `drive_link`, así
// que hay que saber sacarlo del enlace para poder borrarlas de la carpeta.
function driveIdDeFactura(f) {
    if (f?.drive_id) return f.drive_id;
    const s = String(f?.drive_link || '');
    const m = /\/file\/d\/([A-Za-z0-9_-]{10,})/.exec(s) || /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s);
    return m ? m[1] : null;
}

function FacturasSection({ expedienteId, facturas, onChange, onCommit, readOnly, onGenerateCombined, combinedLink, generating, huerfanos, ultimoCombinado }) {
    const { user } = useAuth();
    const isAdmin = user?.rol === 'ADMIN';
    const [uploading, setUploading] = useState({}); // idx → bool
    const [ocrBusy, setOcrBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    // Resultado del último OCR pendiente de confirmar: { numero, incidencias[] }.
    // Las incidencias se PROPONEN; solo se registran las que el usuario deja marcadas.
    const [revision, setRevision] = useState(null);
    const [incSel, setIncSel] = useState(new Set());
    const [regBusy, setRegBusy] = useState(false);

    const addFactura = () => {
        onChange([...facturas, { numero_factura: '', fecha_factura: null, importe_sin_iva: 0, drive_link: null, validada: false }]);
    };

    // Quitar una factura: además de sacarla de la lista, ARCHIVA su PDF en
    // "5. FACTURAS/OLD". Si solo se quitaba la fila, el fichero seguía en la carpeta
    // y volvía a colarse en el PDF combinado (era el origen del "una factura, dos PDF").
    const removeFactura = async (idx) => {
        const f = facturas[idx];
        const driveId = driveIdDeFactura(f);
        if (driveId && expedienteId) {
            try {
                await axios.delete(`/api/expedientes/${expedienteId}/facturas/${driveId}`);
            } catch (err) {
                console.warn('No se pudo archivar el PDF de la factura:', err);
            }
        }
        // El backend ya ha quitado la fila del JSON; persistimos para no dejar el
        // estado local por detrás de la BD.
        (onCommit || onChange)(facturas.filter((_, i) => i !== idx));
    };
    // Tocar un campo (o validar la factura) es el visto bueno humano que le faltaba
    // a lo que leyó el OCR solo: el aviso "leída automáticamente" desaparece.
    const revisada = (f) => { const { ocr_pendiente_revision, ...rest } = f; return rest; };
    const updateFactura = (idx, field, val) => {
        const updated = facturas.map((f, i) => i === idx ? { ...revisada(f), [field]: val || null } : f);
        onChange(updated);
    };
    // Toggle de "validada" (booleano; no usar updateFactura que fuerza null en falsy).
    const toggleValidada = (idx) => {
        const updated = facturas.map((f, i) => i === idx ? { ...revisada(f), validada: !f.validada } : f);
        onChange(updated);
    };

    // Todas subidas (con PDF) y validadas → habilita el PDF único.
    const canGenerate = facturas.length > 0 && facturas.every(f => f.drive_link && f.validada);

    // Sube la factura y la LEE (OCR). `idx = null` → alta nueva; con idx, rellena esa
    // fila sin pisar lo que ya esté escrito a mano (el OCR propone, no manda).
    const procesarFactura = async (fileList, idx = null) => {
        const files = Array.from(fileList || []).filter(Boolean);
        if (!files.length || !expedienteId) return;
        if (idx === null) setOcrBusy(true); else setUploading(u => ({ ...u, [idx]: true }));
        try {
            // Si la fila ya tenía PDF (Reemplazar), se archiva el anterior antes de subir
            // el nuevo: si no, quedan los dos en la carpeta.
            if (idx !== null) {
                const prevId = driveIdDeFactura(facturas[idx]);
                if (prevId) {
                    try { await axios.delete(`/api/expedientes/${expedienteId}/facturas/${prevId}`); }
                    catch (e) { console.warn('No se pudo archivar el PDF anterior:', e); }
                }
            }

            const form = new FormData();
            files.forEach(f => form.append('files', f));
            const { data } = await axios.post(`/api/expedientes/${expedienteId}/facturas/ocr`, form);

            // El fichero YA está en Drive: la fila se persiste de inmediato (autoguardado,
            // modelo C del módulo). Si se dejara solo en estado local y se cerrase el modal
            // sin guardar, el PDF quedaría huérfano en la carpeta.
            const guardar = onCommit || onChange;
            const leida = data.factura || {};
            if (idx === null) {
                guardar([...facturas, leida]);
            } else {
                // Solo rellena los huecos: si ya habías escrito el nº o el importe, manda lo tuyo.
                guardar(facturas.map((f, i) => i !== idx ? f : {
                    ...f,
                    numero_factura: f.numero_factura || leida.numero_factura || '',
                    fecha_factura: f.fecha_factura || leida.fecha_factura || null,
                    importe_sin_iva: Number(f.importe_sin_iva) || leida.importe_sin_iva || 0,
                    drive_link: leida.drive_link,
                    drive_id: leida.drive_id,
                    origen: 'ocr',
                    validada: false,   // una versión nueva vuelve a estar sin validar
                    // Partidas del OCR: identifican la factura de la instalación
                    // térmica (de ella sale la fecha de pruebas del RITE).
                    partidas: leida.partidas || f.partidas || [],
                }));
            }

            const incidencias = data.incidencias || [];
            setRevision({ numero: leida.numero_factura || '', incidencias, ocr: data.ocr });
            setIncSel(new Set(incidencias.map((_, i) => i)));   // se proponen todas marcadas
        } catch (err) {
            console.error('Error procesando la factura:', err);
            const detail = err.response?.data?.error || err.response?.data?.details || err.message || '';
            alert('No se pudo procesar la factura.' + (detail ? `\n\nDetalle: ${detail}` : ''));
        } finally {
            if (idx === null) setOcrBusy(false); else setUploading(u => ({ ...u, [idx]: false }));
        }
    };

    // Da de alta en el expediente SOLO las incidencias que sigan marcadas.
    const registrarIncidencias = async () => {
        const elegidas = (revision?.incidencias || []).filter((_, i) => incSel.has(i));
        if (!elegidas.length) { setRevision(null); return; }
        setRegBusy(true);
        try {
            for (const inc of elegidas) {
                const texto = [
                    `${inc.titulo}. ${inc.texto}`,
                    inc.evidencia ? `\nEvidencia en la factura: ${inc.evidencia}` : '',
                    `\nDetectado al subir la factura ${revision.numero || '(sin nº)'}.`,
                ].join('');
                await axios.post(`/api/expedientes/${expedienteId}/incidencias`, {
                    texto,
                    severidad: inc.severidad,
                    procedencia: 'AGENTE_IA',
                });
            }
            alert(`${elegidas.length} incidencia(s) registrada(s) en el expediente.`);
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudieron registrar las incidencias.');
        } finally {
            setRegBusy(false);
            setRevision(null);
        }
    };

    const dropProps = !readOnly && !ocrBusy ? {
        onDragOver: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragOver(true); } },
        onDragLeave: () => setDragOver(false),
        onDrop: (e) => {
            if (!e.dataTransfer?.types?.includes('Files')) return;
            e.preventDefault(); e.stopPropagation(); setDragOver(false);
            procesarFactura(e.dataTransfer.files, null);
        },
    } : {};

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

            {/* SOLTAR FACTURA → OCR. Sube, lee los datos y cruza con el expediente en
                una sola operación. Lo que detecte se PROPONE abajo; no registra nada solo. */}
            {!readOnly && (
                <label
                    {...dropProps}
                    className={`flex flex-col items-center justify-center gap-1.5 w-full mb-4 rounded-xl border border-dashed px-4 py-5 text-center transition-all ${
                        ocrBusy
                            ? 'border-brand/40 bg-brand/[0.04] text-brand/70 cursor-wait'
                            : dragOver
                                ? 'border-brand bg-brand/[0.08] text-brand cursor-copy'
                                : 'border-white/10 text-white/35 hover:border-white/25 hover:text-white/60 cursor-pointer'
                    }`}
                >
                    {ocrBusy ? (
                        <>
                            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">Leyendo la factura…</span>
                        </>
                    ) : (
                        <>
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 13h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V20a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-[11px] font-black uppercase tracking-widest">Suelta aquí la factura</span>
                            <span className="text-[10px] normal-case opacity-70">PDF o foto · rellena nº, fecha e importe y revisa incidencias</span>
                        </>
                    )}
                    <input
                        type="file" multiple accept=".pdf,image/*" className="hidden" disabled={ocrBusy}
                        onChange={e => { procesarFactura(e.target.files, null); e.target.value = ''; }}
                    />
                </label>
            )}

            {/* Revisión del OCR: incidencias PROPUESTAS. Solo se registran las marcadas. */}
            {revision && (
                <div className="mb-4 rounded-xl border border-white/10 bg-bkg-elevated/60 overflow-hidden">
                    <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between gap-3">
                        <p className="text-[11px] font-black uppercase tracking-widest text-white/70">
                            {revision.incidencias.length
                                ? `${revision.incidencias.length} posible(s) incidencia(s)`
                                : 'Factura leída sin incidencias'}
                        </p>
                        <button onClick={() => setRevision(null)} className="text-white/25 hover:text-white/60 transition-colors" title="Cerrar">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {revision.incidencias.length === 0 ? (
                        <p className="px-4 py-3 text-[11px] text-emerald-400/80 normal-case">
                            Nada que objetar: titular, alcance, fechas e importes cuadran con el expediente.
                        </p>
                    ) : (
                        <>
                            <div className="max-h-72 overflow-y-auto divide-y divide-white/[0.05]">
                                {revision.incidencias.map((inc, i) => (
                                    <label key={i} className="flex gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors">
                                        <input
                                            type="checkbox" checked={incSel.has(i)}
                                            onChange={() => setIncSel(prev => {
                                                const next = new Set(prev);
                                                next.has(i) ? next.delete(i) : next.add(i);
                                                return next;
                                            })}
                                            className="mt-1 accent-brand w-3.5 h-3.5 flex-shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <p className="flex items-center gap-2 flex-wrap">
                                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                                                    inc.severidad === 'GRAVE'
                                                        ? 'bg-red-500/15 text-red-400 border border-red-500/25'
                                                        : 'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                                                }`}>{inc.severidad}</span>
                                                <span className="text-[12px] font-bold text-white/85 normal-case">{inc.titulo}</span>
                                            </p>
                                            <p className="text-[11px] text-white/45 normal-case mt-1 leading-snug">{inc.texto}</p>
                                            {inc.evidencia && (
                                                <p className="text-[10px] text-white/30 normal-case mt-1 italic truncate">{inc.evidencia}</p>
                                            )}
                                        </div>
                                    </label>
                                ))}
                            </div>
                            <div className="px-4 py-3 bg-white/[0.02] border-t border-white/[0.06] flex justify-end gap-2">
                                <button onClick={() => setRevision(null)} disabled={regBusy}
                                        className="px-4 py-2 rounded-lg border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                                    No registrar
                                </button>
                                <button onClick={registrarIncidencias} disabled={regBusy || incSel.size === 0}
                                        className="px-4 py-2 rounded-lg bg-brand/10 border border-brand/30 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-bkg-deep transition-all disabled:opacity-40">
                                    {regBusy ? 'Registrando…' : `Registrar ${incSel.size}`}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Ficheros sueltos en "5. FACTURAS" que no corresponden a ninguna factura de
                la lista. Ya NO entran en el PDF combinado, pero conviene limpiarlos. */}
            {!readOnly && isAdmin && huerfanos?.length > 0 && (
                <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-amber-400">
                        {huerfanos.length} fichero(s) sueltos en la carpeta
                    </p>
                    <p className="text-[11px] text-white/50 normal-case mt-1 leading-snug">
                        Están en "5. FACTURAS" pero no corresponden a ninguna factura registrada, así que
                        no entran en el PDF único: {huerfanos.map(h => h.name).join(', ')}.
                    </p>
                </div>
            )}

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
                            {/* Factura que subió el CLIENTE por el enlace y leyó el OCR solo,
                                sin que nadie la mirara. Los datos ya están puestos, pero salen
                                de una máquina leyendo un fichero que podría ser cualquier cosa
                                (un albarán, un presupuesto, una foto movida): hay que darles
                                el visto bueno antes de fiarse del importe. */}
                            {f.ocr_pendiente_revision && (
                                <div className="mb-3 flex items-start gap-2 rounded-lg border border-sky-400/25 bg-sky-400/[0.07] px-3 py-2">
                                    <span className="text-sm leading-none mt-0.5">🤖</span>
                                    <p className="text-[11px] text-sky-200/80 leading-snug">
                                        <strong className="text-sky-200">Leída automáticamente</strong> de la factura que subió el cliente.
                                        Comprueba el nº, la fecha y el importe antes de darla por buena.
                                    </p>
                                </div>
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
                                                <label className={`text-xs ${uploading[idx] ? 'text-brand/60 cursor-wait' : 'cursor-pointer text-white/30 hover:text-white/60'}`}>
                                                    {uploading[idx] ? 'Leyendo…' : 'Reemplazar'}
                                                    <input type="file" accept=".pdf,image/*" className="hidden" disabled={uploading[idx]}
                                                           onChange={e => { procesarFactura(e.target.files, idx); e.target.value = ''; }} />
                                                </label>
                                            )}
                                            {/* Validación de la factura (solo ADMIN). Verde = validada. */}
                                            {isAdmin && !readOnly && (
                                                <button
                                                    type="button"
                                                    onClick={() => toggleValidada(idx)}
                                                    title={f.validada ? 'Factura validada — pulsa para desmarcar' : 'Marcar factura como validada'}
                                                    className={`ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${
                                                        f.validada
                                                            ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500 hover:text-bkg-deep'
                                                            : 'bg-white/[0.03] border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
                                                    }`}
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                    {f.validada ? 'Validada' : 'Validar'}
                                                </button>
                                            )}
                                            {!isAdmin && f.validada && (
                                                <span className="ml-auto flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-500/10 text-emerald-400/80">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                                                    Validada
                                                </span>
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
                                                    Leyendo y subiendo a Drive...
                                                </>
                                            ) : (
                                                <>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                    </svg>
                                                    Subir PDF/imagen a Drive (5. FACTURAS)
                                                </>
                                            )}
                                            <input
                                                type="file"
                                                accept=".pdf,image/*"
                                                multiple
                                                className="hidden"
                                                disabled={uploading[idx]}
                                                onChange={e => { procesarFactura(e.target.files, idx); e.target.value = ''; }}
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

            {/* PDF ÚNICO de facturas — se habilita cuando TODAS están subidas y validadas. */}
            {!readOnly && facturas.length > 0 && (
                <div className="mt-5 pt-4 border-t border-white/[0.06]">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                            <p className="text-xs font-black text-white/70 uppercase tracking-wider">PDF único de facturas</p>
                            <p className="text-white/30 text-[10px] mt-0.5">
                                {canGenerate
                                    ? 'Todas validadas. Genera un único PDF con todas las facturas.'
                                    : 'Sube y valida todas las facturas para poder generar el PDF único.'}
                            </p>
                            {/* El combinado se guarda en "5. FACTURAS" y se COPIA a
                                "10. EXPEDIENTE CAE" (la carpeta canónica que revisa el
                                auditor). Se dice aquí porque, si no, ver el mismo PDF en
                                dos carpetas parece que se haya generado dos veces. */}
                            {combinedLink && isAdmin && (
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                    <a href={combinedLink} target="_blank" rel="noopener noreferrer"
                                       className="text-[11px] text-brand/80 hover:text-brand font-bold inline-flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        Ver en 5. FACTURAS
                                    </a>
                                    {ultimoCombinado?.auditLink && (
                                        <a href={ultimoCombinado.auditLink} target="_blank" rel="noopener noreferrer"
                                           className="text-[11px] text-white/40 hover:text-white/70 font-bold inline-flex items-center gap-1">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                            Copia en 10. EXPEDIENTE CAE
                                        </a>
                                    )}
                                </div>
                            )}
                            {combinedLink && isAdmin && (
                                <p className="text-white/25 text-[10px] normal-case mt-1 leading-snug">
                                    Es el MISMO PDF en dos carpetas: el de trabajo en "5. FACTURAS" y la copia
                                    para el auditor en "10. EXPEDIENTE CAE".
                                    {ultimoCombinado && ` Última generación: ${ultimoCombinado.count} factura(s) → ${ultimoCombinado.pages} página(s).`}
                                </p>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => onGenerateCombined?.()}
                            disabled={!canGenerate || generating}
                            className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
                                (!canGenerate || generating)
                                    ? 'bg-white/[0.03] border border-white/10 text-white/25 cursor-not-allowed'
                                    : 'bg-brand/10 border border-brand/30 text-brand hover:bg-brand hover:text-bkg-deep'
                            }`}
                        >
                            {generating ? 'Generando…' : (combinedLink ? 'Regenerar PDF único' : 'Generar PDF único')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Componente Principal ─────────────────────────────────────────────────────
export function DocumentacionModule({ expediente, onSave, onLiveUpdate, saving, results, onEditCliente, autoFirmarDoc, onAutoFirmarDocDone }) {
    const { user } = useAuth();
    const isReforma = expediente?.oportunidades?.ficha === 'RES080' || expediente?.numero_expediente?.includes('RES080');
    const isHybrid  = expediente?.oportunidades?.ficha === 'RES093' || expediente?.numero_expediente?.includes('RES093');
    // TER100: mismo flujo documental que RES060 (comparte los slots ficha_res060_* y
    // cert_cifo_*), solo cambia la ficha oficial que se genera.
    const isTer100  = esTer100(expediente);
    // Nombre de la ficha oficial del expediente. Se usa en la etiqueta de la fila, en
    // el nombre del documento firmado y en el aviso de "ya generado".
    const fichaLabel = isReforma ? 'Ficha RES080' : isHybrid ? 'Ficha RES093' : isTer100 ? 'Ficha TER100' : 'Ficha RES060';

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
    // Los huecos de ficha técnica NO son dos fijos: son uno por MODELO distinto de
    // bomba de calor (fichasTecnicas.js). Una cascada de equipos distintos pide una
    // ficha por equipo, y el equipo que resuelve calefacción y ACS pide una sola.
    const [cifoAttachments, setCifoAttachments] = useState(
        () => ftAttachmentSlots(expediente?.instalacion)
    );

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
            // Los huecos fijos se REDERIVAN de la instalación (al cambiar el equipo o
            // añadir uno en cascada cambian), conservando el fichero ya cargado de
            // cada uno por su id — si no, el preview se quedaría en blanco.
            const prevById = new Map(prev.map(a => [a.id, a]));
            const fixed = ftAttachmentSlots(expediente?.instalacion).map(slot => {
                const before = prevById.get(slot.id);
                return before ? { ...before, label: slot.label, detalle: slot.detalle } : slot;
            });
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
            // El orden guardado (documentacion.cifo_annex_prefs.order) manda: si no
            // se aplicase aquí, cada refetch devolvería los anexos a "fijos primero,
            // extras por antigüedad" y el usuario vería deshacerse su reordenación.
            return orderAttachments([...fixed, ...extraSlots], readAnnexPrefs(expediente?.documentacion));
        });
    }, [expediente?.id, expediente?.instalacion, expediente?.documentacion?.cifo_extra_annexes, expediente?.documentacion?.cifo_annex_prefs]);

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
    const [showFichaTer100, setShowFichaTer100] = useState(false);
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
    // Persona concreta a la que se dirige el aviso (titular / representante /
    // persona de contacto). Sin esto el aviso iba siempre al contacto que eligiera
    // el backend, y con la mayoría de instaladores se habla con otra persona.
    const [rejectContactId, setRejectContactId] = useState(null);
    // Rechazo que ha abierto el modal de generación del Anexo Fotográfico / CIFO para
    // regenerarlo y reenviarlo corregido. { motivo, label, nota } — null si se abrió
    // el modal por las buenas. Se limpia al cerrarlo.
    const [regenRechazo, setRegenRechazo] = useState(null);
    // Escaneo del Anexo de Cesión firmado A MANO pendiente de montar (anexo + DNI del
    // cliente + DNI del representante). { file } — null si no hay ninguno en curso.
    const [cesionManuscrita, setCesionManuscrita] = useState(null);
    // Puerta del Convenio de Cesión: obra terminada o no. `cesionPrevio` viaja al
    // modal porque la decisión se acaba de guardar y el `expediente` de la vista
    // va todavía un refetch por detrás.
    const [cesionGate, setCesionGate] = useState(false);
    const [cesionPrevio, setCesionPrevio] = useState(null);
    // Overlay de "subiendo a la nube → subido" de un documento firmado.
    // { phase: 'sending'|'done', ok, label, error }
    const [subidaDoc, setSubidaDoc] = useState(null);
    const [showEnviarBorrador, setShowEnviarBorrador] = useState(false);
    const [enviarAnexos, setEnviarAnexos] = useState({ open: false, docs: [], overrides: null });
    // Firma con certificado (Autofirma) de un documento YA firmado que está en Drive:
    // hoy la contrafirma de Brokergy del Anexo de Cesión. { field, label, fileName, box }
    const [signCtx, setSignCtx] = useState(null);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signBusy, setSignBusy] = useState(false);

    // ── Validación ───────────────────────────────────────────────────────────
    const [validation, setValidation] = useState({ isOpen: false, fields: [], onConfirm: null, docName: '' });

    const validateExpediente = (docType, opts = {}) => {
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
            // En el convenio PREVIO el IBAN no falta: el propio texto dice que el
            // ingreso irá a la cuenta que el Cedente aporte, acreditando su
            // titularidad. Pedirlo aquí sería un aviso de algo que no es un hueco.
            const iban = cli.numero_cuenta || '';
            if (!opts.cesionPrevia && (!isPresent(iban) || iban.includes('__'))) missing.push('Número de Cuenta (IBAN)');
            if (!isPresent(inst.coord_x)) missing.push('Coordenada UTM X');
            if (!isPresent(inst.coord_y)) missing.push('Coordenada UTM Y');
            if (!isPresent(op.datos_calculo?.inputs?.rc || cli.referencia_catastral || inst.ref_catastral)) missing.push('Referencia Catastral');
            if (!isPresent(cli.tlf || cli.telefono)) missing.push('Teléfono Cliente');
            if (!isPresent(cli.email)) missing.push('Email Cliente');
        }

        if (docType === 'anexo1') {
            if (!isPresent(op.datos_calculo?.inputs?.rc || cli.referencia_catastral || inst.ref_catastral)) missing.push('Referencia Catastral');
            // En cascada el Anexo I lista el nº de serie de TODAS las unidades:
            // ninguna puede quedar sin él.
            const nCal = countUnidades(inst.aerotermia_cal);
            for (const n of unidadesSinSerie(inst.aerotermia_cal)) {
                missing.push(nCal > 1 ? `Número de Serie Ud. Exterior — equipo ${n}` : 'Número de Serie Ud. Exterior');
            }

            const hasAcs = inst.cambio_acs != null
                ? !!(inst.cambio_acs === true || inst.cambio_acs === 'si')
                : !!(op.datos_calculo?.inputs?.changeAcs === true || op.datos_calculo?.inputs?.incluir_acs === true);
            if (hasAcs && !inst.misma_aerotermia_acs) {
                const nAcs = countUnidades(inst.aerotermia_acs);
                for (const n of unidadesSinSerie(inst.aerotermia_acs)) {
                    missing.push(nAcs > 1 ? `Número de Serie Ud. Interior (ACS) — equipo ${n}` : 'Número de Serie Ud. Interior (ACS)');
                }
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

        // OJO: `memoria_rite` NO se valida aquí. Sus reglas dependen de datos que
        // este componente no tiene (el catálogo de aerotermia, del que sale la
        // potencia del modelo) y de matices que ya resuelve el generador (cliente
        // empresa sin apellidos, técnico firmante distinto del representante legal).
        // El barrido lo hace el backend en GET /:id/memoria-rite/check con la MISMA
        // función que usa /generate → una sola fuente de verdad, sin divergencias.

        return missing;
    };

    // Barrido de la Memoria RITE: lo resuelve el backend (ver comentario arriba).
    // Si la llamada falla no se bloquea al usuario: se sigue al modal y, si de
    // verdad falta algo, /generate responde 422 con la misma lista.
    const validateMemoriaRiteRemoto = async () => {
        try {
            const { data } = await axios.get(`/api/expedientes/${expediente.id}/memoria-rite/check`);
            // Modelos sin potencia frigorífica: se piden en su propio popup (no se
            // listan como "dato faltante"). Se guarda aquí para la cadena de popups.
            const pend = Array.isArray(data?.potencias) ? data.potencias : [];
            potFrioRef.current = pend;
            setPotFrioPendiente(pend);
            situadoEnRef.current = data?.situadoEn || null;
            setSituadoEnOpciones(data?.situadoEn?.opciones || []);
            // Fecha de pruebas ambigua → su propio popup (tampoco es un "dato faltante").
            fechaPruebasRef.current = data?.fechaPruebas || null;
            setFechaPruebasInfo(data?.fechaPruebas || null);
            return Array.isArray(data?.missing) ? data.missing : [];
        } catch (e) {
            console.warn('[memoria-rite] No se pudo validar en el servidor:', e?.message);
            potFrioRef.current = [];
            setPotFrioPendiente([]);
            situadoEnRef.current = null;
            setSituadoEnOpciones([]);
            fechaPruebasRef.current = null;
            setFechaPruebasInfo(null);
            return [];
        }
    };

    const handleGenerateClick = async (docType, docName, openFn, opts = {}) => {
        const missing = docType === 'memoria_rite'
            ? await validateMemoriaRiteRemoto()
            : validateExpediente(docType, opts);
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

    // La respuesta se guarda en el expediente (`anexo_cesion_obra_finalizada`)
    // para que el envío, que vuelve a generar el PDF, use la MISMA redacción que
    // se revisó en pantalla.
    const elegirEstadoObra = (finalizada) => {
        setCesionGate(false);
        setCesionPrevio(!finalizada);
        commitField('anexo_cesion_obra_finalizada', finalizada);
        handleGenerateClick('cesion', 'Anexo Cesión de Ahorro', () => setShowAnexoCesion(true), { cesionPrevia: !finalizada });
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

    // Cambios de facturas que YA han tocado Drive (alta por OCR, borrado): se persisten
    // en el acto para que la BD no quede por detrás de la carpeta.
    const handleFacturasCommit = (facturas) => {
        setLocal(prev => {
            const next = { ...prev, facturas };
            const cifo = calcCifo(next);
            const merged = { ...next, fecha_inicio_cifo: cifo.inicio, fecha_fin_cifo: cifo.fin };
            onSave({ documentacion: merged });
            return merged;
        });
    };

    // Genera un ÚNICO PDF con todas las facturas ("{nº expte} - FACTURAS.pdf" en la
    // carpeta "5. FACTURAS"). Requiere que todas estén subidas y validadas: primero
    // persistimos (el backend relee las validaciones) y luego llamamos al endpoint.
    const [generatingFacturas, setGeneratingFacturas] = useState(false);
    const [huerfanosFacturas, setHuerfanosFacturas] = useState([]);
    const [ultimoCombinado, setUltimoCombinado] = useState(null);
    // Guarda de reentrada. El estado de React se confirma en el siguiente render, así
    // que `generatingFacturas` NO sirve para frenar una segunda llamada disparada en
    // el mismo ciclo: dos POST solapados creaban DOS PDF combinados en Drive.
    const generandoRef = useRef(false);

    const handleGenerateFacturasPdf = async () => {
        if (!expediente?.id || generandoRef.current) return;
        generandoRef.current = true;
        setGeneratingFacturas(true);
        try {
            await onSave({ documentacion: local });
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/facturas/generar-pdf`);
            setHuerfanosFacturas(data.huerfanos || []);
            setUltimoCombinado({ auditLink: data.audit_link || null, count: data.count, pages: data.pages });
            const next = { ...local, facturas_combined_link: data.drive_link };
            setLocal(next);
            await onSave({ documentacion: next });
            // Se dice cuántas páginas salen: si una factura de 1 página produjera 2,
            // se ve en el aviso en vez de descubrirlo abriendo el PDF.
            const avisos = [];
            if (data.skipped?.length) avisos.push(`${data.skipped.length} fichero(s) omitido(s) por formato no soportado.`);
            if (data.reparadas?.length) avisos.push(`Se ha recuperado el PDF de: ${data.reparadas.join(', ')}.`);
            if (data.huerfanos?.length) avisos.push(`${data.huerfanos.length} fichero(s) sueltos en la carpeta NO se han incluido.`);
            alert(`PDF único generado: ${data.count} factura(s) → ${data.pages} página(s).`
                + (avisos.length ? `\n\n${avisos.join('\n')}` : ''));
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo generar el PDF de facturas.');
        } finally {
            generandoRef.current = false;
            setGeneratingFacturas(false);
        }
    };

    // Auto-genera el PDF único en cuanto TODAS las facturas quedan subidas+validadas
    // (si aún no existe) — el backend lo copia a la vez a "10. EXPEDIENTE CAE" para
    // auditoría, así no hace falta pulsar "Generar PDF único" a mano tras validar la
    // última factura. Se dispara desde un efecto (no desde el toggle) para no leer
    // el estado `local` desactualizado antes de que React lo confirme.
    React.useEffect(() => {
        const facturas = local.facturas || [];
        const allDone = facturas.length > 0 && facturas.every(f => f.drive_link && f.validada);
        if (allDone && !local.facturas_combined_link && !generandoRef.current) {
            handleGenerateFacturasPdf();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [local.facturas, local.facturas_combined_link]);

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
        return `¡Hola!\n\n`
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

    // ── Sexo del titular (Hombre/Mujer) para la Memoria RITE ──────────────────
    // Antes de abrir el modal de generación se pregunta el sexo del titular. La
    // elección se PERSISTE en el cliente (clientes.sexo) y marca la casilla
    // correspondiente en la Memoria RITE (el backend la lee al generar).
    const cliId = expediente?.clientes?.id_cliente || expediente?.cliente_id || null;
    const [sexoPopup, setSexoPopup] = useState({ isOpen: false, saving: null, error: null });

    // ── Fecha de pruebas del Certificado de Instalación Térmica ───────────────
    // Es la fecha de la puesta en marcha de la instalación TÉRMICA. La resuelve
    // el backend (GET /memoria-rite/check → `fechaPruebas`, fuente única en
    // utils/riteValidation): manda lo marcado a mano y, si no, la factura con
    // partida AEROTERMIA/ACS. Solo se pregunta cuando el dato es AMBIGUO — sin
    // facturas, o con varias y ninguna identificable como la térmica: en una
    // REFORMA la primera factura puede ser la de las ventanas y adivinar deja la
    // memoria fechada en una obra que no es la del CAE.
    const [fechaPruebasPopup, setFechaPruebasPopup] = useState({ isOpen: false, value: null, saving: false, error: null });
    // Lo que devuelve /check. Como con las potencias, se lee en el MISMO tick en
    // que llega (el click encadena los popups), así que la ref da la lectura
    // síncrona y el estado solo alimenta el render.
    const fechaPruebasRef = useRef(null);
    const [fechaPruebasInfo, setFechaPruebasInfo] = useState(null);

    // ── Potencia frigorífica del modelo (cuando el emisor da frío) ────────────
    // El dato vive en el CATÁLOGO, no en el expediente: se teclea una vez aquí,
    // se guarda en la ficha del modelo y ya sirve para todos los expedientes
    // futuros que lleven ese equipo. La lista la resuelve el backend en /check.
    const [potFrioPendiente, setPotFrioPendiente] = useState([]);
    const [potFrioPopup, setPotFrioPopup] = useState({ isOpen: false, values: {}, saving: false, error: null });
    // La lista se consulta en el MISMO tick en que se recibe del backend (el click
    // de "Generar" valida y encadena los popups seguido), y para entonces el
    // `useState` todavía devuelve el valor del render anterior. La ref da la
    // lectura síncrona; el estado solo alimenta el render del popup.
    const potFrioRef = useRef([]);
    // "Situado en" del generador de frío: depende de la OBRA, no del modelo, así
    // que se guarda en el expediente (documentacion.frio_situado_en).
    const [situadoEnOpciones, setSituadoEnOpciones] = useState([]);
    const [situadoEnValue, setSituadoEnValue] = useState('');
    const situadoEnRef = useRef(null);

    // Llamado tras pasar la validación: si la fecha de pruebas no es fiable, la
    // pide antes; en cuanto la tiene, sigue al popup de sexo.
    // Cadena de popups previos a generar: fecha de pruebas → potencia frigorífica
    // → titular (sexo / jurídica) → modal de generación. Cada paso se salta solo
    // si su dato ya está resuelto.
    const abrirSexoThenBorrador = () => {
        const pendiente = fechaPruebasRef.current;
        if (pendiente) {
            setFechaPruebasPopup({ isOpen: true, value: pendiente.propuesta || null, saving: false, error: null });
            return;
        }
        if (potFrioRef.current.length || situadoEnRef.current) {
            setPotFrioPopup({ isOpen: true, values: {}, saving: false, error: null });
            return;
        }
        // Si el cliente ya consta como persona jurídica no hay nada que preguntar:
        // la memoria marca "Jurídica" y una sociedad no tiene sexo.
        if (expediente?.clientes?.es_empresa) {
            setShowEnviarBorrador(true);
            return;
        }
        setSexoPopup({ isOpen: true, saving: null, error: null });
    };

    // Guarda la potencia frigorífica tecleada en el CATÁLOGO de cada modelo y
    // continúa la cadena. No toca el expediente: el generador la relee del
    // catálogo, así que el borrador ya sale con el frío relleno.
    const confirmarPotenciaFrio = async () => {
        const modelos = potFrioRef.current;
        const v = potFrioPopup.values;
        // `faltan` viene del backend: solo se exige lo que de verdad falta. El
        // refrigerante es texto (R32, R290…); el resto, números en kW.
        const relleno = (c, key) => c === 'refrigerante'
            ? !!String(v[key] || '').trim()
            : parseFloat(v[key]) > 0;
        const incompleto = modelos.some(m =>
            (m.faltan || []).some(c => !relleno(c, `${c}|${m.id}`)));
        if (incompleto) {
            setPotFrioPopup(p => ({ ...p, error: 'Completa los datos que faltan del equipo.' }));
            return;
        }
        if (situadoEnRef.current && !situadoEnValue) {
            setPotFrioPopup(p => ({ ...p, error: 'Indica dónde está situado el generador de frío.' }));
            return;
        }
        setPotFrioPopup(p => ({ ...p, saving: true, error: null }));
        try {
            // Potencias del MODELO → catálogo (sirven para todos los expedientes).
            for (const m of modelos) {
                const payload = {};
                for (const c of (m.faltan || [])) {
                    const raw = v[`${c}|${m.id}`];
                    if (c === 'refrigerante') {
                        if (String(raw || '').trim()) payload[c] = String(raw).trim();
                    } else if (parseFloat(raw) > 0) {
                        payload[c] = parseFloat(raw);
                    }
                }
                if (Object.keys(payload).length) {
                    await axios.patch(`/api/aerotermia/${m.id}/datos-rite`, payload);
                }
            }
            // Emplazamiento → EXPEDIENTE (depende de la obra, no del equipo).
            if (situadoEnRef.current && situadoEnValue) {
                const merged = { ...local, frio_situado_en: situadoEnValue };
                setLocal(merged);
                await onSave({ documentacion: merged });
            }
            potFrioRef.current = [];
            situadoEnRef.current = null;
            setPotFrioPendiente([]);
            setPotFrioPopup({ isOpen: false, values: {}, saving: false, error: null });
            if (expediente?.clientes?.es_empresa) setShowEnviarBorrador(true);
            else setSexoPopup({ isOpen: true, saving: null, error: null });
        } catch (e) {
            setPotFrioPopup(p => ({ ...p, saving: false, error: e.response?.data?.error || 'No se pudieron guardar los datos del generador de frío' }));
        }
    };

    // Confirma la fecha de pruebas elegida, la persiste y continúa al popup de sexo.
    const confirmarFechaPruebas = async () => {
        const fecha = fechaPruebasPopup.value;
        if (!fecha) { setFechaPruebasPopup(p => ({ ...p, error: 'Selecciona una fecha de pruebas.' })); return; }
        setFechaPruebasPopup(p => ({ ...p, saving: true, error: null }));
        try {
            // Persistir igual que el resto de campos de documentación (merge + PUT).
            const merged = { ...local, fecha_pruebas_cert_instalacion: fecha };
            setLocal(merged);
            await onSave({ documentacion: merged });
            // Ya es un dato marcado a mano: manda sobre las facturas y no se
            // vuelve a preguntar en esta cadena.
            fechaPruebasRef.current = null;
            setFechaPruebasInfo(null);
            setFechaPruebasPopup({ isOpen: false, value: null, saving: false, error: null });
            // Siguiente eslabón de la cadena (potencia frigorífica → titular).
            if (potFrioRef.current.length || situadoEnRef.current) setPotFrioPopup({ isOpen: true, values: {}, saving: false, error: null });
            else if (expediente?.clientes?.es_empresa) setShowEnviarBorrador(true);
            else setSexoPopup({ isOpen: true, saving: null, error: null });
        } catch (e) {
            setFechaPruebasPopup(p => ({ ...p, saving: false, error: e.response?.data?.error || 'No se pudo guardar la fecha de pruebas' }));
        }
    };

    // Elige sexo (o lo omite), lo persiste en el cliente y abre el modal de generación.
    // `value === 'JURIDICA'` no es un sexo: marca el cliente como persona jurídica
    // (clientes.es_empresa) y borra el sexo — una sociedad no lo tiene, y en la
    // memoria se marca la casilla "Jurídica" en lugar de "Física".
    const elegirSexoYGenerar = async (value) => {
        setSexoPopup(p => ({ ...p, saving: value || 'omitir', error: null }));
        try {
            if (value === 'JURIDICA' && cliId) {
                await axios.put(`/api/clientes/${cliId}`, { es_empresa: true, sexo: null });
                if (expediente?.clientes) {
                    expediente.clientes.es_empresa = true;
                    expediente.clientes.sexo = null;
                }
            } else if (value && cliId) {
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
    // El estado vive en documentacion.docs_validados = { <campo>: fecha-ISO }, igual
    // para todos los documentos (incluida la Cesión: "cesion_firmado_brokergy" es solo
    // la PRECONDICIÓN de que ya están las firmas necesarias, no sustituye a validar —
    // si lo hiciera, la Cesión nunca pasaría por /documentos/validar y no se copiaría
    // a "10. EXPEDIENTE CAE").
    const isValidated = (field) => !!local.docs_validados?.[field];

    // Cesión firmada por el cliente a la que aún le falta nuestra contrafirma: el visor
    // ofrece ahí la firma como acción PRINCIPAL en el pie (no se puede validar hasta
    // firmarla), así que en ese caso el botón de la cabecera se oculta para no repetirlo.
    const cesionPendienteContrafirma = !!managingSigned
        && managingSigned.field === 'anexo_cesion_signed_link'
        && !local.cesion_firmado_brokergy;

    // Validar un documento firmado NO es solo marcarlo verde: el backend copia el
    // fichero a la carpeta de auditoría "10. EXPEDIENTE CAE" (dejando el original en
    // su carpeta habitual) para que toda la documentación validada del CAE quede
    // reunida y lista para una auditoría posterior. Por eso es una única escritura
    // atómica en el backend (igual que /documentos/rechazar), no un setLocal+onSave.
    const handleValidateSigned = async (field) => {
        setManagingSigned(null);
        // Optimista: refleja el verde al instante; se corrige si el backend falla.
        setLocal(prev => ({
            ...prev,
            docs_validados: { ...(prev.docs_validados || {}), [field]: new Date().toISOString() },
            docs_rechazados: (() => { const dr = { ...(prev.docs_rechazados || {}) }; delete dr[field]; return dr; })()
        }));
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/validar`, { field });
            setLocal(prev => ({ ...prev, docs_validados: data.docs_validados, docs_rechazados: data.docs_rechazados }));
        } catch (err) {
            console.error('Error validando documento:', err);
            alert(err.response?.data?.error || 'No se pudo validar el documento.');
        }
    };

    // ── Firma de Brokergy con certificado (Autofirma) ─────────────────────────
    // Vale para CUALQUIER documento firmado que haya en Drive, no solo para la
    // contrafirma del Anexo de Cesión: es habitual que el cliente suba el documento
    // desde su enlace, o que se arrastre aquí, y aún falte nuestra firma. En vez de
    // descargar → firmar con Adobe → volver a subir, se descarga el PDF que hay en
    // Drive, se firma con el certificado desde el navegador y el backend lo sube
    // (archivando el anterior en OLD) y lo deja validado (verde).
    const openFirmarConCertificado = async (field, label) => {
        setSignBusy(true);
        try {
            const { data } = await axios.get(`/api/expedientes/${expediente.id}/documento-b64/${field}`);
            if (!data?.pdf) throw new Error('No se pudo descargar el documento');
            setSignPdfB64(data.pdf);
            setSignCtx({
                field,
                label,
                fileName: field === 'anexo_cesion_signed_link'
                    ? `${expediente.numero_expediente || ''} - Anexo Cesión ahorro_fdo`
                    : `${expediente.numero_expediente || ''} - ${label}_fdo`,
                // Columna del CESIONARIO (Brokergy); la izquierda es la del cliente.
                box: field === 'anexo_cesion_signed_link' ? SIGN_BOXES.anexo_cesion_cesionario : null,
                // La rúbrica es la de por defecto del modal (el sello de Brokergy con la
                // firma manuscrita incrustada), igual que en el resto de documentos que
                // firma Brokergy. Ver DEFAULT_RUBRIC_IMAGE_URL en FirmarConCertificadoModal.
            });
            setManagingSigned(null);
        } catch (err) {
            alert(err.response?.data?.error || 'No se pudo preparar el documento para firmar.');
        } finally {
            setSignBusy(false);
        }
    };

    const handleDocumentoFirmado = async (signedB64) => {
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/firmar-subir`, {
                field: signCtx.field,
                signedPdfBase64: signedB64,
                fileName: signCtx.fileName,
                subfolderName: SIGNED_SUBFOLDER[signCtx.field] || SIGNED_SUBFOLDER_DEFAULT,
            });
            setSignCtx(null); setSignPdfB64(null);
            // El backend ya persistió enlace + firma de Brokergy + validado: aquí solo
            // se refleja en pantalla (sin re-guardar, para no pisar nada).
            setLocal(prev => ({
                ...prev,
                [signCtx.field]: data.signed_link || prev[signCtx.field],
                ...(signCtx.field === 'anexo_cesion_signed_link' ? { cesion_firmado_brokergy: true } : {}),
                ...(data.validated
                    ? { docs_validados: { ...(prev.docs_validados || {}), [signCtx.field]: new Date().toISOString() } }
                    : {}),
                docs_rechazados: (() => { const dr = { ...(prev.docs_rechazados || {}) }; delete dr[signCtx.field]; return dr; })(),
            }));
        } catch (err) {
            alert('Se firmó pero no se pudo guardar: ' + (err.response?.data?.error || err.message));
        }
    };

    // ── Firma automática al llegar por enlace (?firmar=<clave>) ───────────────
    // El aviso de "falta tu firma en el Anexo de Cesión" (email y WhatsApp) trae el
    // enlace `/?exp=<id>&firmar=cesion`: al abrir el expediente se despliega este
    // módulo y aquí se lanza el popup de Autofirma sin más clicks — el mismo gesto de
    // un-click que la firma de las fichas del lote. A partir de ahí todo sigue el
    // camino normal (handleDocumentoFirmado → sube a Drive, contrafirma y valida).
    const autoFirmaRef = React.useRef(null);
    React.useEffect(() => {
        const spec = autoFirmarDoc ? AUTO_FIRMA_DOCS[autoFirmarDoc] : null;
        if (!spec || autoFirmaRef.current === autoFirmarDoc) return;
        autoFirmaRef.current = autoFirmarDoc;         // una sola vez por enlace
        onAutoFirmarDocDone?.();
        // Nada que firmar: aún no hay PDF del cliente, o ya lo firmamos nosotros
        // (p. ej. al reabrir el enlace del correo). Se deja el módulo abierto y ya.
        if (!local[spec.field]) return;
        if (spec.field === 'anexo_cesion_signed_link' && local.cesion_firmado_brokergy) return;
        openFirmarConCertificado(spec.field, spec.label);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoFirmarDoc, local[AUTO_FIRMA_DOCS[autoFirmarDoc]?.field]]);

    // ── Rechazo de documento: marca docs_rechazados (recuadro rojo) y, si se elige
    // cliente/instalador, envía el aviso por WhatsApp/email para que lo corrijan.
    const isRejected = (field) => !!local.docs_rechazados?.[field];

    // Contactos disponibles del grupo elegido (titular / representante / personas de
    // contacto). Misma lista que ofrece el envío de anexos — fuente única en
    // utils/docContacts para que ambos sitios se dirijan a la misma gente.
    const rejectContacts = rejectTarget === 'cliente'
        ? clienteContacts(expediente?.clientes || {})
        : rejectTarget === 'instalador'
            ? instaladorContacts(expediente?.prescriptores || {})
            : [];
    const rejectContact = rejectContacts.find(c => c.id === rejectContactId) || rejectContacts[0] || null;

    // Resuelve a quién se notifica REALMENTE. Manda el contacto marcado; si no hay
    // ninguno se cae al mismo criterio del backend (resolveSolicitudContacto): para
    // el instalador, el CONTACTO de notificaciones si está activo.
    const notifyTarget = (t) => {
        const marcado = rejectContact;
        if (marcado && ((t === 'cliente' && rejectTarget === 'cliente') || (t === 'instalador' && rejectTarget === 'instalador'))) {
            return { nombre: marcado.label, tlf: marcado.phone || null, email: marcado.email || null };
        }
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

    // Documentos que GENERAMOS nosotros y firma un tercero. Rechazar uno de éstos no
    // basta: su enlace público sirve el BORRADOR de Drive, así que mientras no se
    // regenere y se reenvíe, el firmante se descarga el mismo PDF con el error y lo
    // firma otra vez igual (caso real: nº de serie erróneos en el Anexo I).
    // El backend bloquea ese borrador hasta que se reenvía; aquí encadenamos el rechazo
    // con el envío del documento corregido para que no quede a medias.
    //   via      → por dónde se reenvía el corregido (qué modal se abre después)
    //   firmante → quién lo firma, que es a quien hay que avisar
    //   bloquea  → si su enlace público queda cerrado hasta reenviarlo (ver
    //              BORRADORES_CLIENTE en backend/utils/docValidacion.js). El Anexo
    //              Fotográfico no tiene enlace público: se regenera y se reenvía, pero
    //              no hay nada que desbloquear.
    const DOC_REGENERABLE = {
        anexo_i_signed_link:           { via: 'anexos', key: 'anexo1', firmante: 'cliente',    bloquea: true },
        anexo_cesion_signed_link:      { via: 'anexos', key: 'cesion', firmante: 'cliente',    bloquea: true },
        anexo_fotografico_signed_link: { via: 'foto',                  firmante: 'cliente',    bloquea: false },
        // Mismo slot, dos documentos distintos: el CIFO lo firma el INSTALADOR desde
        // /subir-cifo (por eso su enlace se bloquea), mientras que el Certificado
        // RES080 lo firma Brokergy y solo se ENTREGA al cliente — ahí no hay enlace
        // público que cerrar, solo un documento que rehacer y volver a mandar.
        cert_cifo_signed_link: isReforma
            ? { via: 'cifo', firmante: 'cliente',    bloquea: false }
            : { via: 'cifo', firmante: 'instalador', bloquea: true },
    };
    const rejectRegen = rejectDoc ? DOC_REGENERABLE[rejectDoc.field] : null;

    const buildRejectMessage = (t, field, label, motivo) => {
        const nombre = recipientName(t);
        const numExp = expediente?.numero_expediente || '';
        // Los documentos que generamos nosotros NO se piden corregidos: los corregimos
        // y los reenviamos. Y su enlace de firma está bloqueado hasta entonces, así que
        // mandar ahí al destinatario sería mandarlo a una puerta cerrada.
        if (DOC_REGENERABLE[field]) {
            return `${nombre}:\n\n`
                + `Le informamos de que, tras la revisión de «${label}» del expediente ${numExp}, `
                + `el documento ha sido rechazado por el siguiente motivo:\n\n`
                + `• ${motivo || '—'}\n\n`
                + `Estamos preparando la versión corregida, que le remitiremos para su firma. `
                + `La versión anterior queda anulada; no es necesaria ninguna acción por su parte hasta recibirla.\n\n`
                + `Atentamente,\nBROKERGY — Ingeniería Energética`;
        }
        const link = docUploadLink(field);
        return `${nombre}:\n\n`
            + `Le informamos de que, tras la revisión de «${label}» del expediente ${numExp}, `
            + `el documento ha sido rechazado por el siguiente motivo:\n\n`
            + `• ${motivo || '—'}\n\n`
            + (link ? `Le agradecemos que nos remita el documento corregido a través del siguiente enlace:\n${link}\n\n` : '')
            + `Atentamente,\nBROKERGY — Ingeniería Energética`;
    };

    // Autogenera el mensaje a partir del motivo/destinatario mientras no se edite a mano.
    React.useEffect(() => {
        if (rejectDoc && !rejectMsgEdited) {
            setRejectMsg(buildRejectMessage(rejectTarget, rejectDoc.field, rejectDoc.label, rejectMotivo));
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rejectDoc, rejectTarget, rejectContactId, rejectMotivo, rejectMsgEdited]);

    const openRejectDoc = (field, label) => {
        setRejectMotivo(''); setRejectMsg(''); setRejectMsgEdited(false); setRejectError(null);
        // Defecto razonable: anexos del cliente → cliente; CIFO/RITE/factura →
        // instalador. Salvo en REFORMA, donde ese mismo slot es el Certificado RES080,
        // que firmamos nosotros y se entrega al cliente.
        const clienteFields = ['anexo_i_signed_link', 'anexo_cesion_signed_link', 'anexo_fotografico_signed_link'];
        if (isReforma) clienteFields.push('cert_cifo_signed_link');
        const t = clienteFields.includes(field) ? 'cliente' : 'instalador';
        setRejectTarget(t);
        setRejectContactId(defaultContactId(t, expediente?.clientes || {}, expediente?.prescriptores || {}));
        setRejectDoc({ field, label });
        setManagingSigned(null);
    };

    // Cambiar de destinatario recoloca el contacto marcado en el que toca por defecto.
    const switchRejectTarget = (t) => {
        setRejectTarget(t);
        setRejectContactId(t === 'ninguno' ? null : defaultContactId(t, expediente?.clientes || {}, expediente?.prescriptores || {}));
    };

    // `reenviar` → tras registrar el rechazo abre el envío del documento con él ya
    // marcado: el PDF se REGENERA con los datos actuales del expediente, viaja adjunto
    // y actualiza el borrador de Drive (que es lo que firma el destinatario). Cada
    // documento se reenvía por su propia superficie: los anexos del cliente por
    // EnviarAnexosModal, el Anexo Fotográfico y el CIFO por su modal de generación.
    const confirmRejectDoc = async (reenviar = false) => {
        if (!rejectMotivo.trim() || !rejectDoc) return;
        setRejectSending(true); setRejectError(null);
        try {
            const target = rejectTarget === 'cliente' ? 'CLIENTE' : rejectTarget === 'instalador' ? 'INSTALADOR' : 'NINGUNO';
            const motivo = rejectMotivo.trim();
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/rechazar`, {
                field: rejectDoc.field,
                label: rejectDoc.label,
                motivo,
                target,
                channels: ['whatsapp', 'email'],
                mensaje: target === 'NINGUNO' ? '' : rejectMsg,
                // Persona marcada: manda sobre el contacto por defecto del backend.
                ...(target !== 'NINGUNO' && rejectContact
                    ? { nombre: rejectContact.label, tlf: rejectContact.phone || '', email: rejectContact.email || '' }
                    : {}),
            });
            // Fusiona SOLO lo que persistió el backend (no pisa ediciones locales sin guardar).
            setLocal(prev => ({ ...prev, docs_rechazados: data.docs_rechazados, docs_validados: data.docs_validados, historial: data.historial }));
            const regen = DOC_REGENERABLE[rejectDoc.field];
            const label = rejectDoc.label;
            setRejectDoc(null); setRejectMotivo(''); setRejectMsg('');
            if (reenviar && regen) {
                const nota = `Hemos corregido el ${label} (${motivo}). Firma esta versión nueva: la anterior no es válida.`;
                if (regen.via === 'anexos') {
                    setEnviarAnexos({ open: true, docs: [regen.key], overrides: null, nota });
                } else {
                    // El Anexo Fotográfico y el CIFO se regeneran desde su propio modal
                    // (fotos / cálculos + anexos técnicos). Se abre con el motivo del
                    // rechazo delante para corregir antes de volver a generar y enviar.
                    setRegenRechazo({ motivo, label, nota });
                    if (regen.via === 'foto') setShowAnexoFotografico(true);
                    else if (isReforma) setShowCertificadoRes080(true);
                    else setShowCertificadoCifo(true);
                }
            }
        } catch (e) {
            setRejectError(e.response?.data?.error || 'No se pudo rechazar el documento.');
        } finally {
            setRejectSending(false);
        }
    };

    const handleSignedUpload = async (field, file) => {
        if (!file) return;

        // Anexo de Cesión firmado A MANO: el escaneo por sí solo no vale — hay que
        // anexarle el DNI del cliente y el del representante de Brokergy, igual que
        // hace el enlace público. Si el PDF trae firma electrónica NO se toca: ése ya
        // identifica al firmante por el certificado y sigue el camino de siempre.
        // La detección no es una barrera: el modal deja subirlo tal cual si se
        // equivoca (una firma digital hecha con una herramienta que no sepamos leer).
        if (field === 'anexo_cesion_signed_link' && await esFirmaManuscrita(file)) {
            setCesionManuscrita({ file });
            return;
        }
        return uploadSignedPlain(field, file);
    };

    // Subida "tal cual" de un firmado: va a su subcarpeta de Drive con el nombre del
    // documento y queda enlazado en el slot. Separado de handleSignedUpload para que
    // el montaje de la Cesión manuscrita pueda saltárselo y volver aquí si hace falta.
    const uploadSignedPlain = async (field, file) => {
        if (!file) return;

        const displayNames = {
            anexo_i_signed_link: 'Anexo I',
            anexo_cesion_signed_link: 'Anexo Cesión ahorro',
            cert_cifo_signed_link: isReforma ? 'Certificado Reforma RES080' : 'Certificado CIFO',
            ficha_res060_signed_link: fichaLabel,
            anexo_fotografico_signed_link: 'Anexo Fotográfico',
            cert_rite_signed_link: 'Certificado RITE',
            facturas_combined_link: 'Facturas'
        };

        const baseName = displayNames[field] || field.replace(/_/g, ' ').toUpperCase();
        const fileName = `${expediente.numero_expediente} - ${baseName}_fdo.pdf`;

        setEditMode(false); // To show progress or lock
        // Overlay estándar mientras viaja a Drive: subir un PDF grande tarda varios
        // segundos y hasta ahora la app no daba ninguna señal — parecía colgada, y el
        // aviso final era un alert() del navegador.
        setSubidaDoc({ phase: 'sending', ok: false, label: baseName, error: '' });
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64 = e.target.result.split(',')[1];
            try {
                const { data } = await axios.post(`/api/expedientes/${expediente.id}/documents/upload`, {
                    base64,
                    fileName,
                    mimeType: file.type,
                    subfolders: [SIGNED_SUBFOLDER[field] || SIGNED_SUBFOLDER_DEFAULT]
                });
                if (!data.drive_link) throw new Error('Drive no devolvió el enlace del fichero.');
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
                setSubidaDoc({ phase: 'done', ok: true, label: baseName, error: '' });
            } catch (err) {
                console.error('Error uploading signed doc:', err);
                setSubidaDoc({
                    phase: 'done', ok: false, label: baseName,
                    error: err.response?.data?.error || err.message || 'No se pudo subir el archivo firmado.',
                });
            }
        };
        reader.onerror = () => setSubidaDoc({ phase: 'done', ok: false, label: baseName, error: 'No se pudo leer el fichero del disco.' });
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
            <CesionObraGate
                isOpen={cesionGate}
                sugerencia={(local.facturas || []).length > 0}
                onElegir={elegirEstadoObra}
                onCancel={() => setCesionGate(false)}
            />
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
                previo={cesionPrevio ?? undefined}
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
                initialNote={enviarAnexos.nota}
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
            <FichaTer100Modal
                isOpen={showFichaTer100}
                onClose={() => setShowFichaTer100(false)}
                expediente={expediente}
                onSaveDrive={(link) => handleModalSaveDrive('ficha_res060_drive_link', link)}
            />
            <CertificadoCifoModal
                isOpen={showCertificadoCifo}
                onClose={() => { setShowCertificadoCifo(false); setRegenRechazo(null); }}
                expediente={expediente}
                results={results}
                rechazo={showCertificadoCifo ? regenRechazo : null}
                attachments={cifoAttachments}
                onAttachmentsChange={setCifoAttachments}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
                onMarkSent={() => handleModalSaveDrive('cert_cifo_sent_at', new Date().toISOString())}
                onSaveFichaLink={(type, link, driveId) => {
                    const fields = ftDocFields(type);
                    if (!fields) return;
                    setLocal(prev => {
                        const next = { ...prev, [fields.link]: link, [fields.id]: driveId };
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
                // Orden + páginas excluidas: el modal ya lo persistió por su endpoint
                // atómico, aquí solo mantenemos coherente la copia local.
                onSaveAnnexPrefs={(prefs) => setLocal(prev => ({ ...prev, cifo_annex_prefs: prefs }))}
            />
            <CertificadoRes080Modal
                isOpen={showCertificadoRes080}
                onClose={() => { setShowCertificadoRes080(false); setRegenRechazo(null); }}
                expediente={expediente}
                results={results}
                rechazo={showCertificadoRes080 ? regenRechazo : null}
                attachments={cifoAttachments}
                onAttachmentsChange={setCifoAttachments}
                onSaveSignedLink={(link) => handleModalSaveDrive('cert_cifo_signed_link', link)}
                onSaveDrive={(link) => handleModalSaveDrive('cert_cifo_drive_link', link)}
                onMarkSent={() => handleModalSaveDrive('cert_cifo_sent_at', new Date().toISOString())}
                onSaveFichaLink={(type, link, driveId) => {
                    const fields = ftDocFields(type);
                    if (!fields) return;
                    setLocal(prev => {
                        const next = { ...prev, [fields.link]: link, [fields.id]: driveId };
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
                onSaveAnnexPrefs={(prefs) => setLocal(prev => ({ ...prev, cifo_annex_prefs: prefs }))}
                // Capturas CE3X: el modal ya las persistió por su endpoint atómico
                // (clave protegida en mergeDocumentacion). Aquí solo mantenemos
                // coherente la copia local para no re-descargarlas al reabrir.
                onSaveCe3x={(accion, slot, captura) => setLocal(prev => {
                    const capturas = { ...(prev.ce3x_capturas || {}) };
                    const val = capturas[slot];
                    const lista = Array.isArray(val) ? val : (val && typeof val === 'object' ? [val] : []);
                    capturas[slot] = accion === 'add'
                        ? [...lista, captura]
                        : lista.filter(c => c.driveId !== captura.driveId);
                    return { ...prev, ce3x_capturas: capturas };
                })}
            />
            <AnexoFotograficoModal
                isOpen={showAnexoFotografico}
                onClose={() => { setShowAnexoFotografico(false); setRegenRechazo(null); }}
                expediente={expediente}
                results={results}
                rechazo={showAnexoFotografico ? regenRechazo : null}
                photos={local.photo_attachments}
                onPhotosChange={(newPhotos) => setLocal(p => ({ ...p, photo_attachments: newPhotos }))}
                onSaveDrive={(link) => handleModalSaveDrive('anexo_fotografico_drive_link', link)}
                onSignedComplete={(field, signedLink, validated) => {
                    // El backend (firmar-subir) ya persistió signed_link + docs_validados
                    // y copió a auditoría. Aquí solo reflejamos el estado en local (verde)
                    // sin re-guardar, para no pisar lo que ya escribió el backend.
                    setLocal(prev => {
                        const dv = { ...(prev.docs_validados || {}) };
                        if (validated) dv[field] = new Date().toISOString();
                        const dr = { ...(prev.docs_rechazados || {}) };
                        delete dr[field];
                        return { ...prev, [field]: signedLink, docs_validados: dv, docs_rechazados: dr };
                    });
                }}
            />

            {/* Popup: fecha de pruebas del Certificado de Instalación Térmica.
                Solo aparece cuando el backend NO puede resolverla con certeza
                (sin facturas, o con varias y ninguna clasificada como térmica).
                Se listan las facturas para poder elegir la de la instalación
                térmica: en una reforma la más antigua suele ser la de ventanas. */}
            {fechaPruebasPopup.isOpen && (() => {
                const busy = fechaPruebasPopup.saving;
                const info = fechaPruebasInfo;
                const facturas = info?.facturas || [];
                const close = () => !busy && setFechaPruebasPopup({ isOpen: false, value: null, saving: false, error: null });
                const fmt = (iso) => { try { return new Date(iso).toLocaleDateString('es-ES'); } catch { return iso; } };
                return (
                    <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={close}>
                        <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                            <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5">
                                <h2 className="text-lg font-black uppercase tracking-tight text-white">Fecha de pruebas</h2>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                    {facturas.length ? 'No se sabe qué factura es la de la instalación térmica' : 'Este expediente aún no tiene factura'}
                                </p>
                            </div>
                            <div className="px-6 py-6 space-y-4">
                                <p className="text-sm text-white/60 leading-relaxed">
                                    {facturas.length ? (
                                        <>La fecha de pruebas debe ser la de la puesta en marcha de la <strong className="text-white/80">instalación térmica</strong>.
                                        Este expediente tiene varias facturas y ninguna se ha podido identificar como la de la aerotermia/ACS,
                                        así que indícala tú. Se guardará en el expediente y mandará sobre las facturas.</>
                                    ) : (
                                        <>La fecha de pruebas de la Memoria RITE se toma de la factura de la instalación térmica.
                                        Como aún no hay factura cargada, indícala a mano. Se guardará en el expediente y se usará para generar la documentación.</>
                                    )}
                                </p>
                                {facturas.length > 0 && (
                                    <div className="space-y-1.5">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-white/30">Facturas del expediente</p>
                                        {facturas.map((f, i) => (
                                            <button key={i} type="button" disabled={busy}
                                                onClick={() => setFechaPruebasPopup(p => ({ ...p, value: f.fecha, error: null }))}
                                                className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl border text-left transition-all ${
                                                    fechaPruebasPopup.value === f.fecha
                                                        ? 'bg-brand/10 border-brand/40'
                                                        : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20'
                                                }`}>
                                                <span className="text-[11px] text-white/70 truncate">
                                                    {f.numero || '(sin nº)'}{f.termica ? ' · térmica' : ''}
                                                </span>
                                                <span className="text-[11px] font-bold text-white/50 shrink-0">{fmt(f.fecha)}</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <DateField
                                    label="Fecha de pruebas"
                                    value={fechaPruebasPopup.value}
                                    onChange={v => setFechaPruebasPopup(p => ({ ...p, value: v, error: null }))}
                                />
                                {fechaPruebasPopup.error && (
                                    <p className="text-[11px] text-red-400">❌ {fechaPruebasPopup.error}</p>
                                )}
                            </div>
                            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                                <button type="button" disabled={busy} onClick={close}
                                    className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                                    Cancelar
                                </button>
                                <button type="button" disabled={busy} onClick={confirmarFechaPruebas}
                                    className="px-5 py-2.5 rounded-xl bg-brand/15 border border-brand/50 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand hover:text-bkg-deep transition-all disabled:opacity-50 flex items-center gap-2">
                                    {busy ? (
                                        <><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>Guardando…</>
                                    ) : 'Continuar →'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Potencia frigorífica del modelo — solo si el emisor da frío (suelo
                radiante / splits / conductos) y el catálogo no la tiene. Se guarda
                en la ficha del MODELO, así que solo se pide una vez por equipo. */}
            {potFrioPopup.isOpen && (
                <div className="fixed inset-0 z-[320] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                    onClick={() => !potFrioPopup.saving && setPotFrioPopup({ isOpen: false, values: {}, saving: false, error: null })}>
                    <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5">
                            <h2 className="text-lg font-black uppercase tracking-tight text-white">Potencias del equipo</h2>
                            <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                Faltan en el catálogo · Memoria RITE
                            </p>
                        </div>
                        <div className="px-6 py-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <p className="text-sm text-white/60 leading-relaxed">
                                Estas potencias son del MODELO y salen de su ficha técnica. Al guardarlas quedan
                                en el catálogo: solo se piden una vez por equipo.
                            </p>
                            {potFrioPendiente.map(m => (
                                <div key={m.id} className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <p className="text-sm font-black text-white">{[m.marca, m.modelo_comercial].filter(Boolean).join(' · ')}</p>
                                            {m.modelo_ud_exterior && <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Ud. ext: {m.modelo_ud_exterior}</p>}
                                            {m.potencia_calefaccion && <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Calefacción: {m.potencia_calefaccion} kW</p>}
                                        </div>
                                        {(m.ficha_tecnica || m.eprel) && (
                                            <a href={m.ficha_tecnica || m.eprel} target="_blank" rel="noopener noreferrer"
                                                className="shrink-0 px-3 py-2 rounded-xl border border-brand/40 text-brand text-[10px] font-black uppercase tracking-widest hover:bg-brand/10 transition-all">
                                                Ver ficha técnica ↗
                                            </a>
                                        )}
                                    </div>
                                    {(m.faltan || []).map((campo, ci) => {
                                        // La potencia térmica se guarda en la misma columna para
                                        // calefacción y para ACS: la etiqueta la da el bloque.
                                        const ETIQ = {
                                            potencia_calefaccion: m.bloque === 'acs' ? 'P. térmica (ACS)' : 'P. térmica (calefacción)',
                                            potencia_frigorifica: 'P. frigorífica',
                                            potencia_compresores: 'P. compresores',
                                            refrigerante: 'Refrigerante',
                                        };
                                        const HINT = { potencia_calefaccion: '12', potencia_frigorifica: '13,6', potencia_compresores: '2,14', refrigerante: 'R32' };
                                        const k = `${campo}|${m.id}`;
                                        const esTexto = campo === 'refrigerante';
                                        return (
                                            <div key={campo} className="flex items-center gap-3">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-white/50 w-44">{ETIQ[campo]}</span>
                                                <input type={esTexto ? 'text' : 'number'}
                                                    {...(esTexto ? {} : { step: '0.01', min: '0' })}
                                                    autoFocus={ci === 0}
                                                    disabled={potFrioPopup.saving} placeholder={HINT[campo]}
                                                    value={potFrioPopup.values[k] ?? ''}
                                                    onChange={e => setPotFrioPopup(p => ({ ...p, values: { ...p.values, [k]: e.target.value } }))}
                                                    className="w-28 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-white font-black tabular-nums uppercase focus:outline-none focus:border-brand/50 disabled:opacity-50" />
                                                <span className="text-[11px] font-black uppercase tracking-widest text-white/40">
                                                    {esTexto ? 'gas' : campo === 'potencia_compresores' ? 'kW (absorbida)' : 'kW'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                    {!(m.ficha_tecnica || m.eprel) && (
                                        <p className="text-[10px] text-white/30">Este modelo no tiene ficha técnica enlazada en el catálogo.</p>
                                    )}
                                </div>
                            ))}
                            {/* Emplazamiento: depende de la obra, se guarda en el expediente. */}
                            {!!situadoEnOpciones.length && (
                                <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 space-y-3">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-white/50">Situado en</p>
                                    <div className="flex gap-2">
                                        {situadoEnOpciones.map(op => (
                                            <button key={op} type="button" disabled={potFrioPopup.saving}
                                                onClick={() => setSituadoEnValue(op)}
                                                className={`flex-1 py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-40 ${situadoEnValue === op ? 'bg-brand/15 border-brand/50 text-brand' : 'bg-white/[0.02] border-white/10 text-white/60 hover:border-brand/40'}`}>
                                                {op}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <p className="text-[11px] text-white/30 leading-relaxed">
                                Ojo: las fichas ErP solo traen calefacción. La capacidad de refrigeración y la
                                potencia absorbida están en la tabla de capacidades de la ficha comercial.
                            </p>
                            {potFrioPopup.error && <p className="text-[11px] text-red-400">❌ {potFrioPopup.error}</p>}
                        </div>
                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-between gap-3">
                            <button type="button" disabled={potFrioPopup.saving}
                                onClick={() => setPotFrioPopup({ isOpen: false, values: {}, saving: false, error: null })}
                                className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">
                                Cancelar
                            </button>
                            <button type="button" disabled={potFrioPopup.saving} onClick={confirmarPotenciaFrio}
                                className="px-5 py-2.5 rounded-xl bg-brand text-black text-[10px] font-black uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40">
                                {potFrioPopup.saving ? 'Guardando…' : 'Guardar y continuar →'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {sexoPopup.isOpen && (() => {
                const current = (expediente?.clientes?.sexo || '').toUpperCase();
                const cliNombre = [expediente?.clientes?.nombre_razon_social, expediente?.clientes?.apellidos].filter(Boolean).join(' ').trim();
                const busy = !!sexoPopup.saving;
                const esEmpresa = !!expediente?.clientes?.es_empresa;
                const SexBtn = ({ value, label, path }) => {
                    const active = value === 'JURIDICA' ? esEmpresa : current === value;
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
                                <h2 className="text-lg font-black uppercase tracking-tight text-white">Titular de la instalación</h2>
                                <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
                                    Se marcará en la Memoria RITE{cliNombre ? ` · ${cliNombre}` : ''}
                                </p>
                            </div>
                            <div className="px-6 py-6 space-y-4">
                                <p className="text-sm text-white/60 leading-relaxed">Indica quién es el titular para marcar la casilla correspondiente del documento. Se guardará en la ficha del cliente.</p>
                                <div className="flex gap-3">
                                    <SexBtn value="HOMBRE" label="Hombre" path="M10 14a5 5 0 105-5m0 0V4m0 5h-4m4-5h5" />
                                    <SexBtn value="MUJER" label="Mujer" path="M12 14a5 5 0 100-10 5 5 0 000 10zm0 0v6m-3-3h6" />
                                </div>
                                {/* Persona jurídica: no es un sexo, es el tipo de titular. En la
                                    memoria marca "Jurídica" en vez de "Física" y deja el sexo vacío. */}
                                <div className="flex gap-3">
                                    <SexBtn value="JURIDICA" label="Jurídica (empresa)" path="M3 21h18M5 21V7l7-4 7 4v14M9 9h1m4 0h1M9 13h1m4 0h1M9 17h1m4 0h1" />
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
                            className="bg-bkg-surface/60 rounded-xl p-6 max-md:p-3 border border-white/[0.06]"
                            onDragOver={e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }}
                            onDrop={e => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); }}
                        >
                            <div className="flex items-center justify-between mb-8 px-4 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:mb-4 max-md:px-1">
                                <h4 className="text-[11px] font-black text-white/40 uppercase tracking-widest">Documentos Generables</h4>
                                <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                <div className="flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-colors group">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Facturas de la Obra</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">{(local.facturas?.length || 0)} factura(s) · carpeta 5. FACTURAS</p>
                                    </div>
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                        {/* placeholder para alinear con la columna Enviado de las demás filas (las
                                            facturas no se "envían" — se generan y validan directamente) */}
                                        <div className="w-11" />
                                        {/* PDF FIRMADO: el PDF único combinado (se autogenera al validar todas las
                                            facturas). Mismo componente/flujo que el resto: ámbar=generado sin
                                            revisar, verde=validado (copia también a "10. EXPEDIENTE CAE"). */}
                                        <div className="w-11">
                                            <SignedSlot
                                                link={local.facturas_combined_link}
                                                field="facturas_combined_link"
                                                label="PDF de Facturas"
                                                onUpload={(file) => handleSignedUpload('facturas_combined_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ANEXO I */}
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'anexo_i' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('anexo_i', f => handleSignedUpload('anexo_i_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo I</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">Declaración Responsable Beneficiario</p>
                                        {local.anexo_i_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_i_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'cesion' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('cesion', f => handleSignedUpload('anexo_cesion_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo Cesión de Ahorro</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">Convenio de Cesión CAE</p>
                                        {local.anexo_cesion_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_cesion_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => setCesionGate(true)}
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
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'res060' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('res060', f => handleSignedUpload('ficha_res060_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">{fichaLabel}</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">{isReforma ? 'Resultado del cálculo de ahorro — Reforma' : isHybrid ? 'Resultado del cálculo de ahorro — Hibridación' : isTer100 ? 'Resultado del cálculo de ahorro — Terciario (calefacción · ACS · piscina)' : 'Resultado del cálculo de ahorro energético'}</p>
                                        {local.ficha_res060_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.ficha_res060_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
                                        {/* 1. BORRADOR */}
                                        <div className="w-[100px]">
                                            <button 
                                                onClick={() => handleGenerateClick('res060', fichaLabel, () => isReforma ? setShowFichaRes080(true) : isHybrid ? setShowFichaRes093(true) : isTer100 ? setShowFichaTer100(true) : setShowFichaRes060(true))}
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
                                                label={`${fichaLabel} Firmada`}
                                                dragActive={dragRow === 'res060'}
                                                onUpload={(file) => handleSignedUpload('ficha_res060_signed_link', file)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* CIFO / RES080 */}
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'cifo' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('cifo', f => handleSignedUpload('cert_cifo_signed_link', f))}>
                                    <div className="w-[260px] min-w-0 shrink-0 max-md:w-full">
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

                                    {/* Fechas del periodo CIFO: se rellenan solas (min/max de
                                        facturas + fecha de pruebas del cert.), pero son EDITABLES.
                                        Al editar se guarda un override manual (fecha_*_cifo_manual)
                                        que manda sobre el cálculo automático — útil para
                                        requerimientos. Vaciar el campo revierte al automático. */}
                                    <div className="flex items-center gap-3 shrink-0 max-md:w-full max-md:justify-between">
                                        <InlineDate label="Fecha Inicio CIFO" value={local.fecha_inicio_cifo} onChange={v => commitField('fecha_inicio_cifo_manual', v)} />
                                        <InlineDate label="Fecha Fin CIFO" value={local.fecha_fin_cifo} onChange={v => commitField('fecha_fin_cifo_manual', v)} />
                                    </div>

                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'foto' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('foto', f => handleSignedUpload('anexo_fotografico_signed_link', f))}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-black text-white uppercase tracking-tight mb-0.5">Anexo Fotográfico</p>
                                        <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest leading-tight">
                                            {(local.photo_attachments || []).filter(p => p.file).length} fotos cargadas
                                        </p>
                                        {local.anexo_fotografico_drive_link && user?.rol === 'ADMIN' && (
                                            <a href={local.anexo_fotografico_drive_link} target="_blank" rel="noopener noreferrer" className="text-[9px] text-brand/60 hover:text-brand font-black uppercase underline decoration-1 underline-offset-4 tracking-[0.15em] transition-all mt-1.5 inline-block">Ver Borrador</a>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                <div className={`flex flex-col gap-4 p-4 max-md:p-3 rounded-2xl border transition-all ${dragRow === 'rite_cert' ? 'ring-2 ring-brand/40 bg-brand/[0.05] border-brand/30' : 'bg-white/[0.02] border-white/[0.04]'}`} {...rowDragProps('rite_cert', f => handleSignedUpload('cert_rite_signed_link', f))}>
                                    <div className="flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3">
                                        <div className="w-[260px] min-w-0 shrink-0 max-md:w-full">
                                            <p className="text-sm font-black text-white uppercase tracking-tight mb-1">Certificado RITE</p>
                                            <p className="text-white/30 text-[9px] font-bold uppercase tracking-widest mb-1">Gestión manual (Drive)</p>
                                        </div>

                                        {/* Fechas del Certificado de Instalación Térmica (editables en modo edición) */}
                                        <div className="flex items-center gap-3 shrink-0 max-md:w-full max-md:justify-between">
                                            <InlineDate label="Fecha Pruebas Cert. Inst." value={local.fecha_pruebas_cert_instalacion} onChange={v => commitField('fecha_pruebas_cert_instalacion', v)} />
                                            <InlineDate label="Fecha Firma Cert. Inst." value={local.fecha_firma_cert_instalacion} onChange={v => commitField('fecha_firma_cert_instalacion', v)} />
                                        </div>

                                        <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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
                                <div className={`flex items-center justify-between gap-6 max-md:flex-col max-md:items-stretch max-md:gap-3 p-4 max-md:p-3 rounded-2xl transition-all group ${dragRow === 'rite_memoria' ? 'ring-2 ring-brand/40 bg-brand/[0.05]' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`} {...rowDragProps('rite_memoria', f => handleSignedUpload('cert_rite_signed_link', f))}>
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
                                    <div className="flex items-center gap-6 max-md:w-full max-md:justify-between max-md:gap-3">
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

                                        {/* 2. ENVIADO (abre modal de envío). Pasa por la MISMA cadena que
                                            "Generar": el modal regenera los documentos al vuelo, así que
                                            entrar por aquí sin validar producía RITEs con huecos (p. ej.
                                            sin la potencia de ACS) sin avisar de nada. */}
                                        <div className="w-11 flex justify-center">
                                            <button
                                                onClick={() => handleGenerateClick('memoria_rite', 'Memoria + Borrador RITE', abrirSexoThenBorrador)}
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
                                                label="Certificado RITE"
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
                            <div className="flex items-center gap-2">
                                {/* Firmar con certificado: disponible para cualquier documento
                                    firmado, porque es habitual que el cliente lo suba desde su
                                    enlace (o que se arrastre aquí) y falte todavía la firma de
                                    Brokergy. Firma, sube y valida en un paso. */}
                                {FIRMABLES_CON_CERTIFICADO.has(managingSigned.field) && !cesionPendienteContrafirma && (
                                    <button
                                        onClick={() => openFirmarConCertificado(managingSigned.field, managingSigned.label)}
                                        disabled={signBusy}
                                        title={`Firmar ${managingSigned.label} con certificado`}
                                        className="inline-flex items-center gap-2 px-4 h-10 rounded-2xl bg-brand/15 border border-brand/40 text-brand text-[10px] font-black uppercase tracking-[0.15em] hover:bg-brand hover:text-bkg-deep transition-all active:scale-[0.98] shadow-lg shadow-brand/10 disabled:opacity-40"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        {signBusy ? 'Preparando…' : 'Firmar'}
                                    </button>
                                )}
                                <button onClick={() => setManagingSigned(null)} className="w-10 h-10 flex items-center justify-center hover:bg-white/5 rounded-2xl transition-all border border-transparent hover:border-white/10">
                                    <svg className="w-6 h-6 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>
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
                            {/* Aviso: Cesión firmada electrónicamente pero solo por el cliente —
                                falta la contrafirma de Brokergy antes de poder validar. */}
                            {managingSigned.field === 'anexo_cesion_signed_link' && !local.cesion_firmado_brokergy && local.anexo_cesion_firma_tipo === 'electronica' && (
                                <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-400 text-[10px] font-black uppercase tracking-widest">
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                    Firma electrónica: el cliente ya firmó, falta la firma de Brokergy para poder validar
                                </div>
                            )}
                            {/* Principales: validar / rechazar */}
                            <div className="flex flex-col sm:flex-row gap-2.5">
                                {managingSigned.field === 'anexo_cesion_signed_link' && !local.cesion_firmado_brokergy ? (
                                    <>
                                        {/* Contrafirma con certificado: firma, sube y valida en un paso. */}
                                        <button
                                            onClick={() => openFirmarConCertificado(managingSigned.field, managingSigned.label)}
                                            disabled={signBusy}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-brand/15 border border-brand/40 text-brand text-[11px] font-black uppercase tracking-[0.15em] hover:bg-brand hover:text-bkg-deep transition-all active:scale-[0.98] shadow-lg shadow-brand/10 disabled:opacity-40"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            {signBusy ? 'Preparando…' : 'Firmar con certificado'}
                                        </button>
                                        {/* Salida manual: ya se firmó por fuera (Adobe) y se sustituyó el PDF. */}
                                        <button
                                            onClick={() => {
                                                setLocal(prev => { const next = { ...prev, cesion_firmado_brokergy: true }; onSave({ documentacion: next }); return next; });
                                                setManagingSigned(null);
                                            }}
                                            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-black uppercase tracking-[0.15em] hover:bg-emerald-500 hover:text-white transition-all active:scale-[0.98] shadow-lg shadow-emerald-500/10"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                            Ya firmado fuera
                                        </button>
                                    </>
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

            {/* Subida de un documento firmado a Drive: "subiendo a la nube" → ✓ + confeti */}
            <SendActionOverlay
                phase={subidaDoc?.phase || null}
                ok={!!subidaDoc?.ok}
                icon="upload"
                subtitle={expediente?.numero_expediente || ''}
                sendingTitle="Subiendo a la nube…"
                okTitle="¡Documento subido!"
                errorTitle="No se pudo subir"
                items={subidaDoc?.ok ? [`${subidaDoc.label} · guardado en Drive`] : []}
                errorText={subidaDoc?.error || ''}
                onClose={() => setSubidaDoc(null)}
            />

            {/* Montaje del Anexo de Cesión manuscrito (escaneo + DNI cliente + DNI Brokergy) */}
            <CesionManuscritaModal
                isOpen={!!cesionManuscrita}
                onClose={() => setCesionManuscrita(null)}
                expediente={expediente}
                file={cesionManuscrita?.file}
                // Los expedientes antiguos guardaron las caras sueltas en vez de la
                // página montada: también cuentan como "ya tenemos el DNI".
                dniLink={local.dni_link || ((local.dni_frontal_link && local.dni_trasero_link) ? local.dni_frontal_link : null)}
                onSubirTalCual={() => {
                    const f = cesionManuscrita?.file;
                    setCesionManuscrita(null);
                    if (f) uploadSignedPlain('anexo_cesion_signed_link', f);
                }}
                onDone={(data) => {
                    // El backend ya persistió `documentacion` entera (enlace montado,
                    // tipo de firma, DNI y el historial): aquí solo reflejamos lo suyo,
                    // sin re-guardar, para no pisar lo que acaba de escribir.
                    setLocal(prev => ({
                        ...prev,
                        anexo_cesion_signed_link: data.signed_link,
                        anexo_cesion_firma_tipo: 'manuscrita',
                        cesion_firmado_brokergy: true,
                        ...(data.dni_link ? { dni_link: data.dni_link } : {}),
                        docs_validados: data.documentacion?.docs_validados ?? prev.docs_validados,
                        docs_rechazados: data.documentacion?.docs_rechazados ?? prev.docs_rechazados,
                        historial: data.documentacion?.historial ?? prev.historial,
                    }));
                    setCesionManuscrita(null);
                }}
            />

            {/* Firma con certificado (Autofirma) del documento ya firmado por la otra parte */}
            {signCtx && signPdfB64 && (
                <FirmarConCertificadoModal
                    pdfBase64={signPdfB64}
                    title={`Firmar ${signCtx.label} · ${expediente?.numero_expediente || ''}`}
                    fixedBox={signCtx.box}
                    signatureAnchor={signCtx.box ? null : ['fdo', 'firma', 'cesionario']}
                    onClose={() => { setSignCtx(null); setSignPdfB64(null); }}
                    onSigned={handleDocumentoFirmado}
                />
            )}

            {/* Modal de RECHAZO de documento (motivo + destinatario + mensaje → aviso) */}
            {rejectDoc && (
                // Nunca se cierra al clicar fuera (mismo criterio que Clientes/Partners):
                // aquí se escribe un motivo y se edita el mensaje del aviso, y un click
                // despistado en el fondo lo tiraba todo. Solo "X" o "Cancelar".
                <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
                    <div className="bg-[#0F1013] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-5 border-b border-white/10 bg-red-500/5 flex items-center gap-3 text-red-400">
                            <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-black uppercase tracking-tight">Rechazar documento</h3>
                                <p className="text-[11px] text-white/40 truncate">{rejectDoc.label}</p>
                            </div>
                            <button onClick={() => setRejectDoc(null)} disabled={rejectSending} title="Cerrar"
                                className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>

                        <div className="px-6 py-5 space-y-5 overflow-y-auto">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">¿Por qué se rechaza?</label>
                                <textarea value={rejectMotivo} onChange={e => setRejectMotivo(e.target.value)} rows={2} placeholder="Ej: el importe no coincide con la base imponible" className="no-uppercase w-full bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-red-400/50 resize-none" />
                            </div>
                            {rejectRegen && (
                                <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] p-3.5">
                                    <p className="text-[11px] text-amber-300 font-bold leading-snug flex gap-2">
                                        <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                                        <span>
                                            Este documento lo generamos nosotros.{' '}
                                            {rejectRegen.bloquea
                                                ? <>Al rechazarlo, <span className="font-black">el enlace de firma {rejectRegen.firmante === 'instalador' ? 'del instalador' : 'del cliente'} queda bloqueado</span> hasta que le reenvíes la versión corregida — así no vuelve a firmar la que tiene el error. </>
                                                : <>Al continuar se abre su generador para que lo rehagas y lo reenvíes corregido. </>}
                                            <span className="font-black">Corrige antes los datos en el expediente</span>: el documento se regenera con lo que haya guardado al enviarlo. El aviso de aquí abajo es opcional; el documento corregido va en el paso siguiente, con sus destinatarios y su mensaje.
                                        </span>
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">{rejectRegen ? 'Avisar del rechazo a' : 'Enviar a corregir a'}</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['cliente', 'instalador', 'ninguno'].map(v => (
                                        <button key={v} onClick={() => switchRejectTarget(v)} title={v === 'ninguno' ? 'Solo rechazar, sin enviar mensaje' : recipientName(v)}
                                            className={`py-2.5 px-2 rounded-xl border transition-all text-center ${rejectTarget === v ? 'border-red-400/80 bg-red-400/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'}`}>
                                            <span className={`block text-[10px] font-black uppercase tracking-widest ${rejectTarget === v ? 'text-red-300' : 'text-white/60'}`}>{v === 'ninguno' ? 'Sin aviso' : v === 'cliente' ? 'Cliente' : 'Instalador'}</span>
                                            <span className="block text-[9px] font-bold normal-case truncate mt-0.5 text-white/35">{v === 'ninguno' ? 'No enviar' : recipientName(v)}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {rejectTarget !== 'ninguno' && rejectContacts.length > 0 && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Persona de contacto</label>
                                    <div className="space-y-2">
                                        {rejectContacts.map(c => {
                                            const on = (rejectContact?.id === c.id);
                                            return (
                                                <button key={c.id} type="button" onClick={() => setRejectContactId(c.id)}
                                                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl border text-left transition-all ${on ? 'border-red-400/60 bg-red-400/[0.06]' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${on ? 'border-red-400' : 'border-white/20'}`}>
                                                        {on && <span className="w-2 h-2 rounded-full bg-red-400" />}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[12px] font-bold text-white truncate normal-case">{c.label}</span>
                                                            <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.sublabel}</span>
                                                        </div>
                                                        <div className="text-[10px] text-white/35 truncate normal-case">{c.phone || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}</div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {rejectContact && !phoneValid(rejectContact.phone) && !rejectContact.email && (
                                        <p className="text-[10px] text-amber-400/80 mt-1.5 normal-case">Este contacto no tiene teléfono ni email: el rechazo se registrará, pero no saldrá ningún aviso.</p>
                                    )}
                                </div>
                            )}
                            {rejectTarget !== 'ninguno' && (
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Mensaje (editable)</label>
                                    <textarea value={rejectMsg} onChange={e => { setRejectMsg(e.target.value); setRejectMsgEdited(true); }} rows={7} className="no-uppercase w-full bg-bkg-elevated border border-white/10 rounded-xl px-3 py-2 text-sm text-white/90 focus:outline-none focus:border-red-400/50 resize-none" />
                                    <p className="text-[10px] text-white/25 mt-1.5 normal-case">Se enviará por WhatsApp/email a <span className="text-white/45">{recipientName(rejectTarget)}</span>{(() => { const nt = notifyTarget(rejectTarget); const d = nt.tlf || nt.email; return d ? <span className="text-white/30"> · {d}</span> : null; })()}.{rejectRegen ? ' El documento corregido se envía después, en el paso siguiente, donde eliges contactos y canal.' : ''}</p>
                                </div>
                            )}
                            {rejectError && <p className="text-[12px] text-red-400">⚠️ {rejectError}</p>}
                        </div>

                        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/10 flex gap-3">
                            <button onClick={() => setRejectDoc(null)} disabled={rejectSending} className="flex-1 px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">Cancelar</button>
                            {rejectRegen ? (
                                <>
                                    <button onClick={() => confirmRejectDoc(false)} disabled={rejectSending || !rejectMotivo.trim()} title="Marcar el rechazo (y enviar el aviso si has elegido destinatario). El documento corregido lo reenvías más tarde." className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all disabled:opacity-40">{rejectTarget === 'ninguno' ? 'Solo rechazar' : 'Rechazar y avisar'}</button>
                                    <button onClick={() => confirmRejectDoc(true)} disabled={rejectSending || !rejectMotivo.trim()} title="Registra el rechazo, envía el aviso si procede y abre la regeneración del documento para reenviarlo corregido" className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-40">{rejectSending ? 'Rechazando…' : 'Rechazar y reenviar corregido'}</button>
                                </>
                            ) : (
                                <button onClick={() => confirmRejectDoc(false)} disabled={rejectSending || !rejectMotivo.trim()} className="flex-1 px-4 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-300 text-[10px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all disabled:opacity-40">{rejectSending ? 'Enviando…' : rejectTarget === 'ninguno' ? 'Rechazar' : 'Rechazar y avisar'}</button>
                            )}
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
                                <p className="text-[10px] text-brand font-black uppercase tracking-[0.2em] mt-1 opacity-60">Carpeta Drive · 5. FACTURAS</p>
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
                                onCommit={handleFacturasCommit}
                                readOnly={false}
                                onGenerateCombined={handleGenerateFacturasPdf}
                                combinedLink={local.facturas_combined_link}
                                generating={generatingFacturas}
                                huerfanos={huerfanosFacturas}
                                ultimoCombinado={ultimoCombinado}
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
