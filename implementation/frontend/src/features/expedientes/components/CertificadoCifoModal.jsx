import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';
import { useAuth } from '../../../context/AuthContext';
import { BOILER_EFFICIENCIES, calculateHybridization } from '../../calculator/logic/calculation';
import { buildInstalacionAddress } from '../utils/docGenerators';
import { calcCifo } from '../logic/calcCifo';

const APP_BASE_URL = 'https://app.brokergy.es';

// Origen de la app para servir assets (foto de portada, fuentes) con URL ABSOLUTA
// — Puppeteer (backend) renderiza con `setContent` (base about:blank), así que las
// rutas relativas no cargan. Mismo patrón que CertificadoRes080Modal/docGenerators.
const APP_URL = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

// IMPORTANTE: este documento lo firma la EMPRESA INSTALADORA (representante legal
// o autónomo), nunca Brokergy. Por eso, a diferencia del Certificado RES080, aquí
// NO debe aparecer el logo/wordmark/tagline/contacto de Brokergy en ninguna página
// (cabecera, pie, portada). La identidad que se muestra en la portada es la de la
// empresa instaladora (mismos datos que la tabla "Datos de la empresa instaladora").

const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
];

// Fuentes del diseño (Archivo + Instrument Sans) auto-alojadas en /public/fonts,
// igual que en CertificadoRes080Modal.
const FONT_LATIN = 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const FONT_LATINEXT = 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF';

function buildFontFaces(appUrl) {
    const fams = [
        ['Archivo', 'Archivo', [400, 500, 600, 700, 800, 900]],
        ['Instrument Sans', 'InstrumentSans', [400, 500, 600, 700]],
    ];
    let out = '';
    for (const [name, slug, weights] of fams) {
        for (const w of weights) {
            for (const [sub, range] of [['latin', FONT_LATIN], ['latinext', FONT_LATINEXT]]) {
                out += `@font-face{font-family:'${name}';font-style:normal;font-weight:${w};font-display:swap;src:url('${appUrl}/fonts/${slug}-${w}-${sub}.woff2') format('woff2');unicode-range:${range};}`;
            }
        }
    }
    return out;
}
const FONT_FACES = buildFontFaces(APP_URL);

const DESIGN_SHARED = `
    * { box-sizing: border-box; }
    .doc-page { font-family: 'Instrument Sans', Arial, sans-serif; font-size: 12.5px; color: #1A1A1A; background: #fff; text-align: left; }
    .doc-page h1, .doc-page h2, .doc-page h3 { font-family: 'Archivo', sans-serif; margin: 0; }
    .doc-page table { break-inside: avoid; }
    .doc-page tr { break-inside: avoid; }
    .cmp { table-layout: fixed; }
    .cmp td, .cmp th { border-bottom: 1px solid #ECECE4; }
    .cmp tr:last-child td { border-bottom: none; }
    .just tr:last-child td { border-bottom: none; }
    .doc-foot { margin-top: auto; padding-top: 10px; border-top: 1px solid #ECECE4; display: flex; justify-content: space-between; font-size: 10.5px; color: #9A9A92; font-weight: 500; }
`;

const DOC_CSS = `
    ${FONT_FACES}
    ${DESIGN_SHARED}
    html, body { margin: 0; }
    .doc-wrap { background: #4a4a46; width: 794px; padding: 20px 0; margin: 0 auto; }
    .doc-page {
        width: 794px;
        min-height: 1123px;
        padding: 15mm 14mm 12mm;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 18px rgba(20,20,19,.16);
        position: relative;
    }
    .doc-page:last-child { margin-bottom: 0; }
    @media print {
        .doc-wrap { background: #fff !important; padding: 0 !important; }
        .doc-page { margin: 0 !important; box-shadow: none !important; }
    }
`;

const PDF_CSS = `
    ${FONT_FACES}
    ${DESIGN_SHARED}
    @page { size: 210mm 297mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; }
    * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .doc-page {
        width: 210mm;
        min-height: 297mm;
        padding: 15mm 14mm 12mm;
        page-break-after: always;
        break-after: page;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .doc-page:last-child { page-break-after: auto; break-after: auto; }
`;

function formatDateSpanish(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

function getEmitterTemp(val) {
    if (val === 'suelo_radiante') return 35;
    if (val === 'radiadores_baja_temp') return 45;
    if (val === 'radiadores_convencionales') return 55;
    return 35;
}

export function CertificadoCifoModal({ isOpen, onClose, expediente, results, attachments: externalAttachments, onAttachmentsChange, onSaveDrive, onSaveFichaLink, onSaveExtraAnnexes, onMarkSent }) {
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);

    // ── Envío del CIFO al instalador (contacto + plantilla + Email/WhatsApp) ──
    const [sendOpen, setSendOpen] = useState(false);
    const [waReady, setWaReady] = useState(null);                 // null = sin comprobar
    const [selectedIds, setSelectedIds] = useState([]);          // varios destinatarios
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [templateKey, setTemplateKey] = useState('primera');   // 'primera' | 'requerimiento'
    const [sendMessage, setSendMessage] = useState('');
    const [sendStatus, setSendStatus] = useState(null);          // { ok, text }
    const [channels, setChannels] = useState({ email: true, whatsapp: true }); // canales elegidos en el popup
    const [sendPhase, setSendPhase] = useState(null);            // null | 'sending' | 'done' → overlay de envío
    const [sendResults, setSendResults] = useState([]);          // [{ channel, status: 'ok'|'fail'|'unavailable', text }]

    // El padre ahora pasa siempre los attachments fijos en su state efímero;
    // mantenemos el fallback por si llegan vacíos.
    const initialAttachments = [
        { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
        { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
    ];
    const attachments = externalAttachments || initialAttachments;
    // IMPORTANTE: pasamos el updater function tal cual al setter del padre
    // (que es un useState setter y sabe encadenarlos). Si resolvieramos aquí
    // con `newVal(attachments)` se introduciría un stale closure: cuando dos
    // updates async corren en paralelo (loadFichaSlot 'cal' + 'acs'), el
    // segundo leería el `attachments` del render previo (sin el cambio del
    // primero) y solo se conservaría el último.
    const setAttachments = (newVal) => {
        if (onAttachmentsChange) onAttachmentsChange(newVal);
    };

    const [isAnexosOpen, setIsAnexosOpen] = useState(false);
    const [loadingFichas, setLoadingFichas] = useState({ cal: false, acs: false });
    const [resyncingType, setResyncingType] = useState(null);
    const [uploadingExtra, setUploadingExtra] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);

    // Carga PDF.js (CDN) sólo cuando hace falta para renderizar el preview.
    // El resultado de la conversión NO se persiste ni se envía al backend
    // (el backend concatena los PDFs vectoriales originales con pdf-lib).
    const loadPdfJs = () => {
        if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
        return new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            document.head.appendChild(script);
        });
    };

    const renderPdfBufferToImages = async (arrayBuffer) => {
        try {
            const pdfjs = await loadPdfJs();
            const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
            const pdf = await loadingTask.promise;
            const images = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 1.5 });
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: ctx, viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.7));
            }
            return images;
        } catch (e) {
            console.warn('[CIFO preview] No se pudo renderizar el PDF para preview:', e.message);
            return [];
        }
    };

    // Construye un slot a partir de los metadatos devueltos por el backend.
    const makeSlotFile = ({ driveId, link, fileName, source, label }) => ({
        driveId,
        link,
        name: fileName || label || 'Ficha técnica',
        source // 'drive' | 'model_copy' | 'manual_upload'
    });

    const setSlot = (slotId, updater) => {
        setAttachments(prev => prev.map(a => a.id === slotId ? { ...a, ...updater(a) } : a));
    };

    // Descarga el PDF del slot en binario y lo rasteriza a imágenes para el
    // preview HTML. Async y no bloqueante: el slot se muestra listo en cuanto
    // hay metadatos, las páginas del preview llegan después.
    const hydrateSlotPreview = async (slotId, type) => {
        try {
            const res = await axios.get(`/api/expedientes/${expediente.id}/fichas-tecnicas/${type}`, {
                responseType: 'arraybuffer',
                validateStatus: s => s === 200
            });
            const images = await renderPdfBufferToImages(res.data);
            if (images.length === 0) return;
            setSlot(slotId, prev => ({ file: { ...(prev.file || {}), previewPages: images } }));
        } catch (e) {
            console.warn(`[CIFO preview] hydrate ${type} falló:`, e.message);
        }
    };

    // Intenta obtener metadatos de la ficha del expediente. Si 404, dispara
    // auto-copy desde el modelo y vuelve a intentar. Si tampoco hay modelo
    // o ficha en BD, marca el slot como missing con razón clara.
    const loadFichaSlot = useCallback(async (type) => {
        if (!expediente?.id) return;
        const slotId = type === 'cal' ? 'aerotermia_cal' : 'aerotermia_acs';
        setLoadingFichas(p => ({ ...p, [type]: true }));
        try {
            const infoUrl = `/api/expedientes/${expediente.id}/fichas-tecnicas/${type}?info=1`;
            const res = await axios.get(infoUrl, { validateStatus: s => s === 200 || s === 404 });

            if (res.status === 200) {
                setSlot(slotId, () => ({
                    file: makeSlotFile({ driveId: res.data.driveId, link: res.data.link, fileName: res.data.fileName, source: 'drive' }),
                    missing: false, missingReason: null, missingModel: null
                }));
                hydrateSlotPreview(slotId, type);
                return;
            }

            // 404 → intentar auto-copy desde el modelo
            const copyRes = await axios.post(
                `/api/expedientes/${expediente.id}/fichas-tecnicas/auto-copy`,
                { type },
                { validateStatus: s => s === 200 || s === 400 || s === 404 }
            );
            if (copyRes.status === 200) {
                if (onSaveFichaLink) onSaveFichaLink(type, copyRes.data.link, copyRes.data.driveId);
                setSlot(slotId, () => ({
                    file: makeSlotFile({ driveId: copyRes.data.driveId, link: copyRes.data.link, fileName: null, source: 'model_copy' }),
                    missing: false, missingReason: null, missingModel: null
                }));
                hydrateSlotPreview(slotId, type);
            } else {
                setSlot(slotId, () => ({
                    file: null,
                    missing: true,
                    missingReason: copyRes.data?.error || 'unknown',
                    missingModel: copyRes.data?.model || null
                }));
            }
        } catch (err) {
            console.error(`[CIFO] loadFichaSlot(${type}) error:`, err);
            setSlot(slotId, () => ({ file: null, missing: true, missingReason: 'network_error' }));
        } finally {
            setLoadingFichas(p => ({ ...p, [type]: false }));
        }
    }, [expediente?.id, onSaveFichaLink]);

    const handleResync = async (type) => {
        if (!expediente?.id) return;
        const slotId = type === 'cal' ? 'aerotermia_cal' : 'aerotermia_acs';
        setResyncingType(type);
        try {
            const copyRes = await axios.post(
                `/api/expedientes/${expediente.id}/fichas-tecnicas/auto-copy`,
                { type, force: true },
                { validateStatus: s => s === 200 || s === 400 || s === 404 }
            );
            if (copyRes.status === 200) {
                if (onSaveFichaLink) onSaveFichaLink(type, copyRes.data.link, copyRes.data.driveId);
                setSlot(slotId, () => ({
                    file: makeSlotFile({ driveId: copyRes.data.driveId, link: copyRes.data.link, fileName: null, source: 'model_copy' }),
                    missing: false, missingReason: null, missingModel: null
                }));
                hydrateSlotPreview(slotId, type);
            } else {
                setSlot(slotId, () => ({
                    file: null,
                    missing: true,
                    missingReason: copyRes.data?.error || 'unknown',
                    missingModel: copyRes.data?.model || null
                }));
            }
        } catch (err) {
            console.error(`[CIFO] resync(${type}) error:`, err);
        } finally {
            setResyncingType(null);
        }
    };

    // Subida manual a un slot fijo (cal/acs): sube a Drive con nombre canónico
    // vía POST /fichas-tecnicas/upload, luego recarga el slot por info=1.
    const handleManualFixedUpload = async (slotId, file) => {
        if (!file || !expediente?.id) return;
        const type = slotId === 'aerotermia_cal' ? 'cal' : 'acs';
        setLoadingFichas(p => ({ ...p, [type]: true }));
        try {
            // Convertimos el File a buffer en cliente para reaprovecharlo en el
            // preview (evita una segunda descarga del PDF que acabamos de subir).
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/fichas-tecnicas/upload`, {
                base64,
                type,
                numexpte: expediente.numero_expediente
            });
            if (onSaveFichaLink) onSaveFichaLink(type, data.link, data.driveId);
            const previewPages = await renderPdfBufferToImages(arrayBuffer);
            setSlot(slotId, () => ({
                file: { ...makeSlotFile({ driveId: data.driveId, link: data.link, fileName: file.name, source: 'manual_upload' }), previewPages },
                missing: false, missingReason: null, missingModel: null
            }));
        } catch (err) {
            console.error('[CIFO] manualFixedUpload error:', err);
            alert('❌ Error al subir la ficha: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoadingFichas(p => ({ ...p, [type]: false }));
        }
    };

    // Subida de un anexo "extra" (no es ficha cal/acs). Se persiste en
    // documentacion.cifo_extra_annexes vía POST /anexos-cifo/upload.
    const handleManualExtraUpload = async (file) => {
        if (!file || !expediente?.id) return;
        setUploadingExtra(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/anexos-cifo/upload`, {
                base64, fileName: file.name, label: file.name
            });
            const previewPages = await renderPdfBufferToImages(arrayBuffer);
            setAttachments(prev => [...prev, {
                id: `extra_${data.driveId}`,
                label: data.label,
                isExtra: true,
                file: { ...makeSlotFile({ driveId: data.driveId, link: data.link, fileName: data.fileName, source: 'manual_upload' }), previewPages }
            }]);
            if (onSaveExtraAnnexes) onSaveExtraAnnexes('add', { driveId: data.driveId, link: data.link, fileName: data.fileName, label: data.label });
        } catch (err) {
            console.error('[CIFO] manualExtraUpload error:', err);
            alert('❌ Error al subir el anexo: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploadingExtra(false);
        }
    };

    const arrayBufferToBase64 = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer);
        // En lotes para no saturar el call stack con PDFs grandes
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    };

    const removeAttachment = async (index) => {
        const item = attachments[index];
        if (!item) return;
        if (item.required) {
            // Slot fijo: limpiamos el archivo localmente (no borramos de Drive)
            setAttachments(prev => prev.map((a, i) => i === index ? { ...a, file: null, missing: false } : a));
            return;
        }
        // Anexo extra: borrar del backend + Drive
        if (item.file?.driveId && expediente?.id) {
            try {
                await axios.delete(`/api/expedientes/${expediente.id}/anexos-cifo/${item.file.driveId}`);
                if (onSaveExtraAnnexes) onSaveExtraAnnexes('remove', { driveId: item.file.driveId });
            } catch (err) {
                console.error('[CIFO] delete extra annex error:', err);
                alert('❌ Error al eliminar el anexo');
                return;
            }
        }
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const reorderAttachments = (dragIdx, dropIdx) => {
        if (dragIdx === dropIdx) return;
        setAttachments(prev => {
            const copy = [...prev];
            const [moved] = copy.splice(dragIdx, 1);
            copy.splice(dropIdx, 0, moved);
            return copy;
        });
    };

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const avail = containerRef.current.clientWidth - 48;
        setScale(avail < 794 ? avail / 794 : 1);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updateScale();
        const t = setTimeout(updateScale, 80);
        window.addEventListener('resize', updateScale);
        return () => { clearTimeout(t); window.removeEventListener('resize', updateScale); };
    }, [isOpen, updateScale]);

    // Carga automática de fichas técnicas al abrir el modal.
    useEffect(() => {
        if (!isOpen || !expediente?.id) return;
        const inst = expediente.instalacion || {};
        const tieneAcs = inst.cambio_acs !== false;
        loadFichaSlot('cal');
        if (tieneAcs) loadFichaSlot('acs');

        // Hidratar el preview de los anexos extra que ya venían persistidos.
        // Para los extras descargamos el PDF de Drive vía el endpoint que sirve
        // ficheros (no hay endpoint dedicado para extras — usamos el de Drive
        // directo a través del backend; si no, podemos usar el iframe con link).
        // Por ahora rasterizamos descargando vía files.get autenticado del backend.
        const extras = (attachments || []).filter(a => a.isExtra && a.file?.driveId && !a.file.previewPages);
        extras.forEach(async (extra) => {
            try {
                const res = await axios.get(`/api/expedientes/${expediente.id}/anexos-cifo/${extra.file.driveId}/content`, {
                    responseType: 'arraybuffer',
                    validateStatus: s => s === 200
                });
                const imgs = await renderPdfBufferToImages(res.data);
                if (imgs.length > 0) {
                    setAttachments(prev => prev.map(a => a.id === extra.id
                        ? { ...a, file: { ...a.file, previewPages: imgs } }
                        : a));
                }
            } catch (e) {
                console.warn('[CIFO preview] extra hydrate falló:', extra.id, e.message);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, expediente?.id]);

    if (!isOpen || !expediente) return null;

    // ── DATA EXTRACTION ───────────────────────────────────────────────
    const op = expediente.oportunidades || {};
    const opInputs = op.datos_calculo || {};
    const inst = expediente.instalacion || {};
    const doc = expediente.documentacion || {};
    const cee = expediente.cee || {};
    const loc = expediente.ubicacion || {};
    const cli = expediente.clientes || expediente.cliente || {}; 
    const pres = expediente.prescriptores || {};

    const zoneStr = (op.datos_calculo?.zona || 'D3').toUpperCase();
    const zoneLabel = [
        'A3', 'A4', 'B3', 'B4', 'C1', 'C2', 'C3', 'C4', 'D1', 'D2', 'D3'
    ].includes(zoneStr) ? 'Cálido' : (zoneStr === 'E1' ? 'Medio' : 'Cálido');

    const numexpte = expediente.numero_expediente || '';
    const facturasList = (doc.facturas || []).map(f => f.numero_factura).filter(Boolean).join(', ') || '—';

    // Recalculado en vivo (igual que DocumentacionModule): el campo persistido
    // documentacion.fecha_inicio_cifo/fecha_fin_cifo puede quedar desfasado.
    const cifoDatesCert = calcCifo(doc);
    const fechaInicio = formatDateSpanish(cifoDatesCert.inicio || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial);
    const fechaFin = formatDateSpanish(cifoDatesCert.fin || doc.fecha_fin_cifo || doc.fecha_firma_cee_final);

    // Métricas para Header
    const aeKwh = Math.round(results?.savingsKwh || 0).toLocaleString('es-ES');
    const beneficioStr = Math.round((results?.savingsKwh || 0) * (results?.price_kwh || 0.10)).toLocaleString('es-ES');

    // CEE Final
    const ceeFinal = cee.cee_final || {};
    const dcalRaw = parseFloat(ceeFinal.demandaCalefaccion) || 0;
    const dcal = dcalRaw.toFixed(2).replace('.', ',');
    const sRaw = parseFloat(ceeFinal.superficieHabitable) || 0;
    const sStr = sRaw.toFixed(2).replace('.', ',');

    // Justificación Demand ACS
    const acsMode = cee.acs_method || 'xml';
    const numRooms = parseInt(cee.num_rooms) || 4;
    const numPeople = numRooms + 1;
    
    // Valor ACS según modo
    let dacsValue = 0;
    if (acsMode === 'xml') {
        const dacsKwhM2 = parseFloat(ceeFinal.demandaACS) || 0;
        const superficie = parseFloat(ceeFinal.superficieHabitable) || 0;
        dacsValue = dacsKwhM2 * superficie;
    } else {
        dacsValue = 28 * numPeople * 0.001162 * 365 * 46;
    }
    const dacsStr = dacsValue.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    // Identificación Actuación (Location) — dirección de la INSTALACIÓN (vivienda
    // del Catastro/oportunidad), NUNCA el domicilio del cliente.
    const instAddr = buildInstalacionAddress(expediente);
    const locFullDir = instAddr.full || '—';
    const PROV_CCAA = {
        '04':'Andalucía','11':'Andalucía','14':'Andalucía','18':'Andalucía',
        '21':'Andalucía','23':'Andalucía','29':'Andalucía','41':'Andalucía',
        '22':'Aragón','44':'Aragón','50':'Aragón','33':'Asturias','07':'Islas Baleares',
        '35':'Canarias','38':'Canarias','39':'Cantabria','02':'Castilla-La Mancha',
        '13':'Castilla-La Mancha','16':'Castilla-La Mancha','19':'Castilla-La Mancha',
        '45':'Castilla-La Mancha','05':'Castilla y León','09':'Castilla y León',
        '24':'Castilla y León','34':'Castilla y León','37':'Castilla y León',
        '40':'Castilla y León','42':'Castilla y León','47':'Castilla y León',
        '49':'Castilla y León','08':'Cataluña','17':'Cataluña','25':'Cataluña',
        '43':'Cataluña','51':'Ceuta', '03':'Comunidad Valenciana','12':'Comunidad Valenciana',
        '46':'Comunidad Valenciana','06':'Extremadura','10':'Extremadura','15':'Galicia',
        '27':'Galicia','32':'Galicia','36':'Galicia','26':'La Rioja','28':'Comunidad de Madrid',
        '52':'Melilla','30':'Región de Murcia','31':'Navarra','01':'País Vasco','20':'País Vasco','48':'País Vasco',
    };

    const cp = instAddr.cp || opInputs.ccaa_cp || opInputs.cp || '';
    const provCode = cp ? String(cp).substring(0, 2).padStart(2, '0') : '';

    const locCA = (
        instAddr.ccaa ||
        (provCode ? PROV_CCAA[provCode] : '') ||
        '—'
    ).toUpperCase();
    const locRefCat = instAddr.refCatastral || '—';
    const locUtmX = inst.coord_x || loc.coord_x || opInputs.coordX || opInputs.coord_x || '—';
    const locUtmY = inst.coord_y || loc.coord_y || opInputs.coordY || opInputs.coord_y || '—';

    // Propietario (Client)
    const cliNombre = (cli.nombre_razon_social || cli.nombre || '—') + (cli.apellidos ? ` ${cli.apellidos}` : '');
    const cliNif = cli.nif || cli.dni || '—';
    const cliDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;
    const cliTlf = cli.tlf || cli.telefono || opInputs?.phone || '—';

    // Caldera Antigua Calefaccion
    const calExMarca = inst.caldera_antigua_cal?.marca || '—';
    const calExMod = inst.caldera_antigua_cal?.modelo || '—';
    const calExSerie = inst.caldera_antigua_cal?.numero_serie || '—';
    const boilerEffId = inst.caldera_antigua_cal?.rendimiento_id || 'default';
    const boilerEffEntry = BOILER_EFFICIENCIES.find(b => b.id === boilerEffId);
    
    const calExTipo = boilerEffEntry?.label || '—'; 
    const calExComb = calExTipo.split(',')[0] || '—'; 
    
    const etaBoiler = boilerEffEntry?.value || 0.92;
    const etaStr = etaBoiler.toFixed(2).replace('.', ',');

    // Aerotermia Calefaccion (3)
    const calNuMarca = inst.aerotermia_cal?.marca || '—';
    // El "Modelo" del equipo nuevo es NOMBRE COMERCIAL + UNIDAD EXTERIOR (la ref. de
    // la placa que se ve en las fotos): el par identifica el equipo sin ambigüedad.
    // Fallback al conjunto (que incluye la ext) para expedientes antiguos sin snapshot.
    const calNuMod = [inst.aerotermia_cal?.modelo, inst.aerotermia_cal?.modelo_ud_exterior].filter(Boolean).join(' · ')
        || inst.aerotermia_cal?.modelo_conjunto || '—';
    const calNuSerieEx = inst.aerotermia_cal?.numero_serie || inst.aerotermia_cal?.n_serie_ext || '—';
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';

    // ACS
    const tieneAcs = inst.cambio_acs !== false;
    const acsExMarca = inst.caldera_antigua_acs?.marca || calExMarca;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || inst.caldera_antigua_acs?.n_serie || '—';
    
    const acsEffId = inst.caldera_antigua_acs?.rendimiento_id || boilerEffId;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === acsEffId);
    const acsExTipo = acsEffEntry?.label || calExTipo;
    const acsExComb = acsExTipo.split(',')[0] || '—';

    const acsNuMarca = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMarca : inst.aerotermia_acs?.marca || '—') : '—';
    const acsNuMod = tieneAcs
        ? (inst.misma_aerotermia_acs
            ? calNuMod
            : ([inst.aerotermia_acs?.modelo, inst.aerotermia_acs?.modelo_ud_exterior].filter(Boolean).join(' · ')
                || inst.aerotermia_acs?.modelo_conjunto || '—'))
        : '—';
    const acsNuSerieEx = tieneAcs ? (inst.misma_aerotermia_acs ? calNuSerieEx : inst.aerotermia_acs?.numero_serie || inst.aerotermia_acs?.n_serie_ext || '—') : '—';
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

    // ACS como depósito acumulador (toggle "Es acumulador" en Instalación):
    // el depósito lo calienta la BdC de calefacción, no hay equipo de ACS con
    // serie propia → el CIFO imprime "Acumulador ACS" y "no aplica" en el serie.
    const acsAero = inst.misma_aerotermia_acs ? inst.aerotermia_cal : inst.aerotermia_acs;
    const acsEsAcumulador = tieneAcs && !!acsAero?.es_acumulador;

    // Ahorro Total
    const aeRaw = results?.savingsKwh || 0;
    const aeKwhVal = aeRaw ? Math.round(aeRaw).toLocaleString('es-ES') : '—';

    // EMPRESA INSTALADORA
    const empNombre = pres.razon_social || pres.nombre || '—';
    const empCif    = pres.cif || '—';
    const empDir    = pres.direccion || '—';
    const empCp     = pres.codigo_postal || '—';
    const empMun    = pres.municipio || '—';
    const empProv   = pres.provincia || '—';
    const empCargo  = pres.es_autonomo ? 'Trabajador autónomo' : 'Representante legal';
    const empEmail  = pres.email || '';
    const empTlf    = pres.tlf || '';
    const empResponsable = [pres.nombre_responsable, pres.apellidos_responsable].filter(Boolean).join(' ') || empNombre;
    const emiLabel  = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';
    const metodoCal = inst.aerotermia_cal?.metodo_scop || 'ficha';
    const metodoAcs = inst.aerotermia_acs?.metodo_scop || 'ficha';

    // RES093 hybridization data
    const isHybrid = numexpte.includes('RES093');
    let cbStr = '—', pDesignKwStr = '—', coveragePct = 0, coveragePctStr = '—';
    let thZone = 0, pbdcKw = 0, pbdcKwStr = '—', demandaAnualKwhStr = '—', appliedCovStr = '—';
    if (isHybrid) {
        const demandaAnual = dcalRaw * sRaw;
        pbdcKw = parseFloat(inst.potencia_bomba || opInputs.inputs?.potenciaBomba || opInputs.potenciaBomba) || 0;
        const hybridData = calculateHybridization({ demandAnnual: demandaAnual, zone: zoneStr, heatPumpPower: pbdcKw });
        cbStr = hybridData?.cb != null ? ((hybridData.cb * 100).toFixed(2).replace('.', ',') + '%') : '—';
        const pDesignRaw = hybridData?.pDesign || 0;
        pDesignKwStr = pDesignRaw.toFixed(2).replace('.', ',');
        const rawCoveragePct = pDesignRaw > 0 ? (pbdcKw / pDesignRaw) * 100 : 0;
        coveragePct = rawCoveragePct;
        coveragePctStr = rawCoveragePct.toFixed(0);
        thZone = hybridData?.th || 0;
        pbdcKwStr = pbdcKw.toFixed(2).replace('.', ',');
        demandaAnualKwhStr = demandaAnual.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        appliedCovStr = (coveragePct >= 95 ? 95 : coveragePct).toFixed(0);
    }

    const missingReasonText = (item) => {
        switch (item.missingReason) {
            case 'no_model': return '⚠ Selecciona un modelo de aerotermia en Instalación';
            case 'no_ficha_in_db': return `⚠ El modelo "${item.missingModel || '?'}" no tiene ficha técnica en la BD`;
            case 'bad_ficha_url': return '⚠ La URL de la ficha del modelo no es válida';
            case 'model_not_found': return '⚠ El modelo no existe en la BD';
            case 'no_drive_folder': return '⚠ La oportunidad no tiene carpeta de Drive';
            case 'network_error': return '⚠ Error de red — reintenta';
            default: return '⚠ Sube manualmente o re-sincroniza';
        }
    };

    const sourceBadge = (source) => {
        if (source === 'drive') return { text: 'Drive del expediente', tone: 'emerald' };
        if (source === 'model_copy') return { text: 'Copiada del modelo', tone: 'sky' };
        if (source === 'manual_upload') return { text: 'Subida manual', tone: 'amber' };
        return { text: 'Drive', tone: 'emerald' };
    };

    const AnexosModal = () => (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
            <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
                 onClick={e => e.stopPropagation()}>
                <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        </div>
                        <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Gestión de Anexos {numexpte.match(/RES\d+/)?.[0] || 'RES060'}</h3>
                    </div>
                    <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>

                <div className="p-8 grid gap-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                    <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-2">Las fichas técnicas se concatenan al PDF automáticamente desde Drive</p>

                    {attachments.filter(item => item.id !== 'aerotermia_acs' || tieneAcs).map((item, idx) => {
                        const type = item.id === 'aerotermia_cal' ? 'cal' : item.id === 'aerotermia_acs' ? 'acs' : null;
                        const isLoading = type && loadingFichas[type];
                        const isResyncing = type && resyncingType === type;
                        const badge = item.file ? sourceBadge(item.file.source) : null;
                        return (
                            <div key={item.id}
                                 draggable={!isLoading && !isResyncing}
                                 onDragStart={() => setDraggedIndex(idx)}
                                 onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.backgroundColor = 'rgba(242, 166, 64, 0.1)'; }}
                                 onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                                 onDrop={(e) => {
                                     e.preventDefault();
                                     e.currentTarget.style.backgroundColor = '';
                                     if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                         const f = e.dataTransfer.files[0];
                                         if (item.required) handleManualFixedUpload(item.id, f);
                                         else handleManualExtraUpload(f);
                                     } else {
                                         reorderAttachments(draggedIndex, idx);
                                     }
                                 }}
                                 className={`group flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border transition-all duration-300 ${draggedIndex === idx ? 'opacity-30' : 'opacity-100'} ${item.file ? 'border-white/10 hover:border-brand/40' : item.missing ? 'border-amber-400/30 border-dashed hover:border-amber-400/60' : 'border-white/5 border-dashed hover:border-white/20'}`}>

                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="cursor-grab active:cursor-grabbing text-white/5 hover:text-white/20 transition-colors shrink-0">
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg>
                                    </div>

                                    <div className="flex flex-col gap-1 min-w-0">
                                        <span className={`text-[11px] font-black uppercase tracking-wider ${item.file ? 'text-white/80' : 'text-white/20'} truncate`}>{item.label}</span>
                                        {isLoading || isResyncing ? (
                                            <span className="text-[10px] text-white/40 flex items-center gap-1.5">
                                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                                                {isResyncing ? 'Re-sincronizando…' : 'Cargando desde Drive…'}
                                            </span>
                                        ) : item.file ? (
                                            <div className="flex flex-col gap-0.5 min-w-0">
                                                <a href={item.file.link} target="_blank" rel="noreferrer" className="text-[10px] text-brand font-bold flex items-center gap-1.5 hover:text-brand/70 transition-colors truncate">
                                                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                                    <span className="truncate">{item.file.name}</span>
                                                </a>
                                                {badge && (
                                                    <span className={`text-[9px] text-${badge.tone}-400/70 font-bold uppercase tracking-wider`}>✓ {badge.text}</span>
                                                )}
                                            </div>
                                        ) : item.missing ? (
                                            <span className="text-[10px] text-amber-400/80 font-bold">{missingReasonText(item)}</span>
                                        ) : (
                                            <span className="text-[10px] text-white/10 italic">Sin ficha</span>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-2 shrink-0">
                                    {type && (item.file || item.missing) && !isLoading && (
                                        <button
                                            onClick={() => handleResync(type)}
                                            disabled={isResyncing}
                                            title="Re-sincronizar desde el modelo de aerotermia"
                                            className="p-2.5 text-sky-400/60 hover:text-sky-300 hover:bg-sky-500/10 rounded-xl transition-all disabled:opacity-30"
                                        >
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        </button>
                                    )}
                                    {item.file && (
                                        <button onClick={() => removeAttachment(idx)} title={item.required ? 'Quitar del slot' : 'Eliminar del Drive'} className="p-2.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                    )}
                                    {!item.file && !isLoading && (
                                        <label className="p-2.5 bg-white/5 text-white/40 border border-white/10 rounded-xl cursor-pointer hover:bg-brand hover:text-black hover:border-brand transition-all shadow-xl">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                            <input type="file" className="hidden" accept=".pdf" onChange={(e) => {
                                                const f = e.target.files[0];
                                                if (!f) return;
                                                if (item.required) handleManualFixedUpload(item.id, f);
                                                else handleManualExtraUpload(f);
                                            }} />
                                        </label>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    <div className="mt-4 flex flex-col items-center gap-4">
                        <div
                            onDragOver={e => { e.preventDefault(); setIsGlobalDragging(true); }}
                            onDragLeave={() => setIsGlobalDragging(false)}
                            onDrop={e => {
                                e.preventDefault();
                                setIsGlobalDragging(false);
                                if (e.dataTransfer.files.length > 0) handleManualExtraUpload(e.dataTransfer.files[0]);
                            }}
                            className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isGlobalDragging ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/5 bg-white/[0.01]'}`}
                        >
                            {uploadingExtra ? (
                                <svg className="w-8 h-8 text-brand animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            ) : (
                                <svg className={`w-8 h-8 transition-transform ${isGlobalDragging ? 'scale-110 text-brand' : 'text-white/10'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                            )}
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">{uploadingExtra ? 'Subiendo…' : 'Suelta un PDF aquí para anexarlo'}</p>
                        </div>

                        <button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.pdf';
                                input.onchange = (e) => { if (e.target.files[0]) handleManualExtraUpload(e.target.files[0]); };
                                input.click();
                            }}
                            disabled={uploadingExtra}
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-brand hover:text-black border border-white/10 hover:border-brand text-white/50 text-[10px] font-black rounded-2xl transition-all uppercase tracking-[0.2em] shadow-xl disabled:opacity-30"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                            Explorar Archivos
                        </button>
                    </div>
                </div>

                <div className="p-6 bg-black/40 flex justify-end">
                    <button
                        onClick={() => setIsAnexosOpen(false)}
                        className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(242,166,64,0.3)] hover:scale-105 active:scale-95 transition-all"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );

    // ── HTML GENERATION ──────────────────────────────────────────────
    // `withAnnexPreview`: cuando true, añade páginas-imagen del PDF para que
    // se vean en el preview del modal. Cuando false (default), solo la portada
    // ANEXOS — el backend concatena los PDFs vectoriales con pdf-lib en las
    // 4 llamadas (/api/pdf/generate, save-to-drive, send-cifo, whatsapp).
    const buildHtml = ({ withAnnexPreview = false } = {}) => {
        const pages = [];
        const cifoLabel = isHybrid ? 'RES093' : 'RES060';
        const actuacionNombre = isHybrid
            ? 'Hibridación de combustión con bomba de calor de accionamiento eléctrico'
            : 'Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)';
        const fichaNombreCompleto = isHybrid
            ? 'RES093: Hibridación en modo paralelo de caldera/s de combustión con bomba de calor de accionamiento eléctrico en edificios residenciales ubicados en la zona climática D1, D2 o D3'
            : 'RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas';

        // ─── Helpers de diseño — mismo sistema visual que el Certificado RES080,
        // SIN ningún elemento de marca Brokergy (logo, tagline, contacto): este
        // documento lo firma la EMPRESA INSTALADORA, nunca Brokergy.
        const pageHeader = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1A1A1A;border-radius:14px;">
                <span style="font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:2.5px;color:#93C01F;">CERTIFICADO CIFO · ${cifoLabel}</span>
                <span style="font-family:'Archivo';font-weight:600;font-size:11px;letter-spacing:1px;color:#93C01F;">Expte: ${numexpte}</span>
            </div>`;
        const sectionTitle = (t, mt = '13px') => `
            <div style="display:flex;align-items:center;gap:11px;margin:${mt} 0 8px;">
                <span style="width:9px;height:24px;border-radius:5px;background:linear-gradient(#F18A00,#93C01F);"></span>
                <h3 style="font-weight:800;font-size:14px;letter-spacing:.5px;text-transform:uppercase;">${t}</h3>
            </div>`;
        const subLabel = (t, color = '#6E6E66', mt = '18px') => `<h3 style="font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin:${mt} 0 8px;">${t}</h3>`;
        const footer = `<div class="doc-foot"><span>Certificado de Instalación · CIFO</span><span>PAGE_X_OF_Y · Expte ${numexpte}</span></div>`;
        const obsBox = (inner, mt = '16px') => `<div style="margin-top:${mt};padding:14px 18px;background:#FBF6EE;border:1px solid #F1E4CF;border-radius:14px;font-size:10.5px;line-height:1.5;color:#6b5a3e;">${inner}</div>`;
        const rowsBox = (inner) => `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">${inner}</div>`;
        const kv = (label, value, last = false) => `<div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${label}</div><div style="padding:7px 16px;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${value}</div></div>`;
        const cmpHead = (col1 = 'Comparativa', ex = 'Existente', nu = 'Nueva') => `<thead><tr>
            <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">${col1}</th>
            <th style="text-align:left;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${ex}</th>
            <th style="text-align:left;padding:8px 16px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${nu}</th>
        </tr></thead>`;
        const cmpRow = (label, ex, nu) => `<tr><td style="padding:5px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">${label}</td><td style="padding:5px 16px;color:#7a7a72;">${ex}</td><td style="padding:5px 16px;background:#F3F8E6;font-weight:700;">${nu}</td></tr>`;
        const cmpBox = (headHtml, bodyRows) => `<div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;"><table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">${headHtml}<tbody>${bodyRows}</tbody></table></div>`;
        const scopBox = (headTitle, formula, rowsHtml) => `
            <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;margin-top:12px;">
                <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                    <tr><td colspan="3" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">${headTitle}</td></tr>
                    <tr><td colspan="3" style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;padding:8px;color:#1A1A1A;">${formula}</td></tr>
                    <tr>
                        <td style="width:15%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Variable</td>
                        <td style="padding:6px 12px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Descripción</td>
                        <td style="width:14%;text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.5px;">Valor</td>
                    </tr>
                    ${rowsHtml}
                </tbody></table>
            </div>`;
        const svRow = (v, desc, val) => `<tr><td style="text-align:center;font-weight:700;padding:6px 10px;">${v}</td><td style="padding:6px 12px;color:#4a4a44;">${desc}</td><td style="text-align:center;padding:6px 10px;font-weight:700;">${val}</td></tr>`;
        const scopResult = (calcText, scopVal) => `<tr><td colspan="2" style="padding:8px 12px;font-weight:700;color:#1A1A1A;">${calcText}</td><td style="text-align:center;font-family:'Archivo';font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${scopVal}</td></tr>`;
        const scopCallout = (html) => `<div style="margin-top:12px;padding:14px 18px;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:14px;font-size:12.5px;font-weight:700;color:#1A1A1A;line-height:1.5;">${html}</div>`;

        // Tabla de variables de ahorro (Fp, Dcal, S, Dacs, ηi, SCOPbdc, SCOPdhw, [Cb], AEtotal, Di)
        const varCols = [
            { th: 'F<sub>P</sub>', td: '1' },
            { th: 'D<sub>CAL</sub>', td: dcal },
            { th: 'S', td: sStr },
            { th: 'D<sub>ACS</sub>', td: dacsStr },
            { th: 'η<sub>i</sub>', td: etaStr },
            { th: 'SCOP<sub>bdc</sub>', td: scopCalStr },
            { th: 'SCOP<sub>dhw</sub>', td: scopAcsStr },
            ...(isHybrid ? [{ th: 'C<sub>b</sub>', td: cbStr, hi: true }] : []),
            { th: 'AE<sub>TOTAL</sub>', td: aeKwhVal, hi: true },
            { th: 'D<sub>i</sub>', td: '15' },
        ];
        const varTableBox = `
            <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                <table style="width:100%;border-collapse:collapse;">
                    <thead><tr>${varCols.map(c => `<th style="padding:8px 4px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:9.5px;text-align:center;">${c.th}</th>`).join('')}</tr></thead>
                    <tbody><tr>${varCols.map(c => `<td style="padding:8px 4px;text-align:center;font-weight:${c.hi ? 800 : 600};font-size:${c.hi ? '12px' : '11px'};background:${c.hi ? '#F3F8E6' : '#FAFAF6'};color:${c.hi ? '#4d6a12' : '#1A1A1A'};">${c.td}</td>`).join('')}</tr></tbody>
                </table>
            </div>`;

        // "Donde" — descripción de cada variable
        const donde = [
            { n: 1, sym: 'F<sub>P</sub>', desc: 'Factor de ponderación', val: '1' },
            { n: 2, sym: 'D<sub>CAL</sub>', desc: 'Demanda de energía en calefacción del edificio/vivienda', val: `${dcal} kWh/m²·año` },
            { n: 3, sym: 'S', desc: 'Superficie útil habitable del edificio o vivienda', val: `${sStr} m²` },
            { n: 4, sym: 'D<sub>ACS</sub>', desc: 'Demanda de energía en agua caliente sanitaria', val: `${dacsStr} kWh/año` },
            { n: 5, sym: 'η<sub>i</sub>', desc: 'Rendimiento de caldera de combustión(PCS)', val: etaStr },
            { n: 6, sym: 'SCOP<sub>bdc</sub>', desc: 'Rendimiento estacional bomba calor calefacción', val: scopCalStr },
            { n: 7, sym: 'SCOP<sub>dhw</sub>', desc: 'Rendimiento estacional bomba calor ACS', val: scopAcsStr },
            ...(isHybrid ? [{ n: 8, sym: 'C<sub>b</sub>', desc: 'Coeficiente de cobertura por bivalencia en paralelo', val: cbStr }] : []),
            { n: isHybrid ? 9 : 8, sym: 'D<sub>i</sub>', desc: 'Vida útil de la actuación de eficiencia energética', val: '15 años' },
        ];
        const dondeBox = `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;">${donde.map((d, i) => `
            <div style="display:flex;align-items:center;gap:14px;padding:5px 16px;${i === donde.length - 1 ? '' : 'border-bottom:1px solid #ECECE4;'}">
                <span style="flex:none;width:26px;height:26px;border-radius:8px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-family:'Archivo';font-weight:800;font-size:12px;display:flex;align-items:center;justify-content:center;">${d.n}</span>
                <span style="flex:none;width:56px;font-family:'Archivo';font-weight:700;font-size:12px;color:#1A1A1A;">${d.sym}</span>
                <span style="flex:1;color:#4a4a44;font-size:11.5px;">${d.desc}</span>
                <span style="flex:none;font-weight:700;font-size:12px;color:#1A1A1A;white-space:nowrap;">${d.val}</span>
            </div>`).join('')}</div>`;

        // PÁGINA 0: PORTADA (no se numera). Foto: reforma de la instalación térmica
        // (caldera antigua → bomba de calor). La identidad mostrada es la de la
        // EMPRESA INSTALADORA — nunca Brokergy, ya que el CIFO lo firma ella.
        pages.push(`
            <div class="doc-page" style="padding:0;display:block;background:#111110;overflow:hidden;">
                <img src="${APP_URL}/assets/pegatina-cifo.png" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(3px);transform:scale(1.06);">
                <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(15,15,14,.72) 0%, rgba(15,15,14,.30) 34%, rgba(15,15,14,.55) 66%, rgba(12,12,11,.94) 100%);"></div>

                <div style="position:absolute;top:96mm;left:0;right:0;z-index:3;padding:0 20mm;">
                    <div style="display:inline-flex;align-items:center;gap:9px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.16);padding:6px 16px;border-radius:999px;margin-bottom:20px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:#93C01F;"></span>
                        <span style="font-family:'Archivo';font-weight:700;font-size:12px;letter-spacing:4px;color:#fff;">CERTIFICADO CIFO · ${cifoLabel}</span>
                    </div>
                    <h1 style="font-weight:900;font-size:62px;line-height:.98;letter-spacing:-1.5px;color:#fff;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,.5);max-width:14ch;">Certificado de <span style="color:#F18A00;">instalación</span></h1>
                    <p style="font-family:'Archivo';font-weight:600;font-size:18px;color:#EDEDE8;margin:20px 0 0;max-width:30ch;text-shadow:0 2px 14px rgba(0,0,0,.6);">${actuacionNombre}</p>
                    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">
                        <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:#fff;padding:6px 16px;border-radius:10px;">Expte: ${numexpte}</span>
                        <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:linear-gradient(90deg,#F5A21E,#A9C63A);padding:6px 16px;border-radius:10px;">${cifoLabel}</span>
                    </div>
                </div>

                <div style="position:absolute;bottom:0;left:0;right:0;z-index:3;">
                    <div style="padding:0 20mm 22px;">
                        <div style="display:inline-flex;align-items:center;gap:20px;background:rgba(12,12,11,.78);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px 26px;">
                            <div>
                                <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2.5px;color:#93C01F;text-transform:uppercase;">Ahorro anual certificado</div>
                                <div style="font-family:'Archivo';font-weight:900;font-size:36px;line-height:1;color:#fff;margin-top:4px;">${aeKwh} <span style="font-size:16px;font-weight:700;color:#F18A00;">kWh/año</span></div>
                            </div>
                            <div style="width:1px;height:44px;background:rgba(255,255,255,.2);"></div>
                            <div style="font-family:'Archivo';font-weight:800;font-size:24px;color:#fff;">${aeKwh} <span style="font-size:13px;font-weight:700;color:#B9B9B4;">CAEs</span></div>
                        </div>
                    </div>
                    <div style="background:#0C0C0B;padding:16px 20mm;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:3px solid;border-image:linear-gradient(90deg,#F18A00,#93C01F) 1;">
                        <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">${empNombre} <span style="color:#93C01F;font-weight:600;font-size:13px;">· Empresa instaladora</span></div>
                        <div style="display:flex;gap:22px;font-size:12.5px;color:#EDEDE8;font-weight:500;flex-wrap:wrap;">
                            ${empCif && empCif !== '—' ? `<span><b style="color:#F18A00;">CIF</b>&nbsp; ${empCif}</span>` : ''}
                            ${empTlf ? `<span><b style="color:#F18A00;">Tel</b>&nbsp; ${empTlf}</span>` : ''}
                            ${empEmail ? `<span><b style="color:#F18A00;">Email</b>&nbsp; ${empEmail}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `);

        // PÁGINA 1 (FIJA): Identificación + Propietario + Hitos + Empresa instaladora
        // + Firma. Este bloque tiene tamaño acotado (siempre las mismas 5 fichas de
        // datos administrativos) y por eso siempre cabe en una sola página; el resto
        // del contenido (calefacción, ACS, variables, justificaciones…) es de
        // longitud variable y se organiza aparte, en las páginas siguientes.
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                <h2 style="font-weight:800;font-size:19px;letter-spacing:-.3px;margin:12px 0 3px;">Certificado de instalación</h2>
                <p style="margin:0;font-size:13px;color:#6E6E66;font-weight:500;">Ficha ${cifoLabel} · ${actuacionNombre}</p>

                ${sectionTitle('Identificación de la actuación de ahorro de energía')}
                ${rowsBox(`
                    ${kv('Nombre de la actuación', actuacionNombre)}
                    ${kv('Código y nombre de la ficha', fichaNombreCompleto)}
                    ${kv('Comunidad autónoma', locCA)}
                    ${kv('Dirección postal', locFullDir)}
                    ${kv('Referencia catastral', locRefCat)}
                    ${kv('Coordenadas UTM', `X: ${locUtmX} · Y: ${locUtmY}`)}
                    ${kv('Facturas asociadas', facturasList, true)}
                `)}

                ${sectionTitle('Propietario inicial del ahorro')}
                ${rowsBox(`
                    ${kv('Propietario / Razón social', cliNombre)}
                    ${kv('Domicilio', cliDir)}
                    <div style="display:grid;grid-template-columns:34% 32% 34%;border-bottom:1px solid #ECECE4;">
                        <div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">NIF / NIE</div>
                        <div style="padding:7px 16px;font-weight:600;">${cliNif}</div>
                        <div style="padding:7px 16px;font-weight:600;"><span style="color:#6E6E66;">Tel&nbsp;</span>${cliTlf}</div>
                    </div>
                    ${kv('Correo electrónico', cli.email || '—', true)}
                `)}

                ${sectionTitle('Hitos de la actuación', '12px')}
                <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">
                    <div style="display:grid;grid-template-columns:34% 66%;border-bottom:1px solid #ECECE4;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de inicio</div><div style="padding:6px 16px;font-weight:700;">${fechaInicio}</div></div>
                    <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de fin</div><div style="padding:6px 16px;font-weight:700;">${fechaFin}</div></div>
                </div>

                ${sectionTitle('Datos de la empresa instaladora', '12px')}
                ${rowsBox(`
                    ${kv('Razón social', empNombre)}
                    ${kv('NIF / CIF', empCif)}
                    ${kv('Domicilio', `${empDir} · ${empCp} ${empMun} (${empProv})`)}
                    ${kv('Cargo firmante', empCargo, true)}
                `)}

                ${sectionTitle('Firma y sello', '12px')}
                <div style="border:2px solid #1A1A1A;border-radius:16px;padding:12px 18px;min-height:130px;display:flex;flex-direction:column;break-inside:avoid;">
                    <div style="font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">Espacio reservado para firma electrónica</div>
                    <div style="flex:1;"></div>
                    <div style="border-top:1px solid #ECECE4;padding-top:10px;font-size:12.5px;font-weight:700;color:#1A1A1A;">${empResponsable} <span style="font-weight:600;color:#6E6E66;">· ${empCargo}</span></div>
                </div>
                ${footer}
            </div>
        `);

        // PÁGINA 2 (VARIABLE): Calefacción + ACS + variables de ahorro + Donde. Sin
        // firma ni datos de empresa aquí (ya fijos en la página 1), este bloque se
        // organiza únicamente por su propio volumen de contenido.
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Datos de la instalación de calefacción', '16px')}
                ${cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de caldera', calExTipo, 'Bomba de calor')}
                    ${cmpRow('Marca', calExMarca, calNuMarca)}
                    ${cmpRow('Modelo', calExMod, calNuMod)}
                    ${cmpRow('Fuente de energía', calExComb, 'Electricidad')}
                    ${cmpRow('Nº serie unidad exterior', calExSerie, calNuSerieEx)}
                    ${cmpRow('SCOP<sub>bdc</sub> / Rendimiento', etaStr, scopCalStr)}
                `)}

                ${sectionTitle('Datos de la instalación de agua caliente sanitaria (ACS)', '14px')}
                ${tieneAcs
                    ? cmpBox(cmpHead(), `
                        ${cmpRow('Tipo de equipo', acsExTipo, acsEsAcumulador ? 'Acumulador ACS' : 'Bomba de calor')}
                        ${cmpRow('Marca', acsExMarca, acsNuMarca)}
                        ${cmpRow('Modelo', acsExMod, acsNuMod)}
                        ${cmpRow('Fuente de energía', acsExComb, 'Electricidad')}
                        ${cmpRow('Nº serie equipo ACS', acsExSerie, acsEsAcumulador ? 'No aplica' : acsNuSerieEx)}
                        ${cmpRow('SCOP<sub>dhw</sub> / Rendimiento', etaStr, scopAcsStr)}
                    `)
                    : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`
                }

                ${subLabel('Valores de las variables para el ahorro de energía', '#6E6E66', '12px')}
                ${varTableBox}

                ${subLabel('Donde', '#6E6E66', '12px')}
                ${dondeBox}
                ${footer}
            </div>
        `);

        // Bloque "Anexo I — Justificación de las variables" (puntos 1-5). Cuando la
        // demanda de ACS usa el cálculo CTE completo (tablas + fórmula) es el caso
        // más voluminoso; el resto de veces (sin ACS o ACS por XML) cabe con margen.
        const acsDemandHeavy = tieneAcs && acsMode !== 'xml';
        const anexoIBlock = `
            ${sectionTitle(`Anexo I · Justificación de las variables — apartado 3 de la ficha ${cifoLabel}`, '20px')}

            ${subLabel('1. Factor de ponderación F<sub>P</sub>')}
            <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">Este valor es 1, tal y como indica la ficha ${cifoLabel}.</p>

            ${subLabel('2. Justificación de D<sub>CAL</sub>', '#6E6E66', '16px')}
            <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">El valor de la demanda de calefacción se ha determinado directamente a partir del Certificado de Eficiencia Energética del Edificio, tal como se establece en la ficha ${cifoLabel}. Dicho certificado ha sido elaborado y firmado por un técnico competente, de acuerdo con lo dispuesto en el RD 390/2021, de 1 de junio.</p>

            ${subLabel('3. Justificación de la superficie S', '#6E6E66', '16px')}
            <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">La superficie se ha obtenido directamente del Certificado de Eficiencia Energética adjunto a este expediente CAE.</p>

            ${subLabel('4. Justificación de la demanda de ACS D<sub>ACS</sub>', '#6E6E66', '16px')}
            ${!tieneAcs
                ? `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:18px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`
                : acsMode === 'xml'
                ? `<p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;line-height:1.6;">La demanda de ACS ha sido calculada según el archivo .xml del certificado de eficiencia energética cuyo valor es <b style="color:#1A1A1A;">${parseFloat(ceeFinal.demandaACS || 0).toFixed(2).replace('.', ',')} kWh/m²·año</b>, que multiplicado por la superficie habitable (<b style="color:#1A1A1A;">${parseFloat(ceeFinal.superficieHabitable || 0).toFixed(2).replace('.', ',')} m²</b>) da como resultado <b style="color:#1A1A1A;">${dacsStr} kWh/año</b>.</p>`
                : `
                <p style="margin:0 0 10px;font-size:12.5px;color:#4a4a44;">Según el Anejo F del documento de Ahorro de Energía HE, del Código Técnico de la Edificación (año 2022):</p>
                <div style="text-align:center;margin:10px 0;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;">D<sub>ACS</sub> = D<sub>L/D</sub> · N<sub>P</sub> · C<sub>e</sub> · 365 · ΔT</div>
                ${rowsBox(`
                    ${kv('D<sub>ACS</sub>', 'Demanda de energía anual para ACS (kWh/año)')}
                    ${kv('D<sub>L/D</sub>', 'Ver tabla c · Anejo F Demanda orientativa de ACS para residencial privado')}
                    ${kv('N<sub>P</sub>', 'Número de personas consideradas')}
                    ${kv('C<sub>e</sub>', 'Calor específico (agua) = 0,001162 kWh/kg·°C')}
                    ${kv('ΔT', 'Salto térmico con instalaciones a 60°C de acumulación = 60°C − 14°C = 46°C', true)}
                `)}
                <div style="margin-top:12px;">
                    ${rowsBox(`
                        ${kv('Nº de habitaciones', numRooms)}
                        ${kv('Nº de personas', numPeople)}
                        ${kv('Litros persona/día', '28')}
                        ${kv('C<sub>e</sub> · CTE · ΔT', '0,001162 · 365 · 46')}
                        ${kv('D<sub>ACS</sub> (resultado)', `<b style="color:#4d6a12;">${dacsStr} kWh/año</b>`, true)}
                    `)}
                </div>
                <p style="margin:12px 0 0;font-size:11px;color:#6E6E66;">La estimación de la demanda diaria de Agua Caliente Sanitaria (ACS) se ha realizado conforme a los criterios y valores orientativos establecidos en el Anejo F del Documento Básico de Ahorro de Energía HE del Código Técnico de la Edificación (CTE DB-HE, versión 2022).</p>
                `}

            ${subLabel('5. Justificación rendimiento de caldera de combustión η<sub>i</sub>', '#6E6E66', '16px')}
            <p style="margin:0;font-size:12.5px;color:#4a4a44;">Se ha utilizado un rendimiento estacional de <b style="color:#1A1A1A;">${etaStr}</b>, al tratarse de una caldera de <b style="color:#1A1A1A;">${calExTipo}</b>, siguiendo las indicaciones del Ministerio para la Transición Ecológica y el Reto Demográfico recogidas en los criterios de verificación "24/11.03: Rendimientos estacionales vs. nominales en fichas IND040, RES060, RES090-099, TER100 y TER170-179".</p>
        `;

        // SCOP calefacción + SCOP ACS (justificaciones EPREL restyled)
        const renderEprelJustification = (isAcs = false) => {
            const label = isAcs ? 'ACS' : 'Calefacción';
            const etaVar = isAcs ? 'η<sub>wh</sub>' : 'η<sub>s,h</sub>';
            const scopRaw = isAcs ? scopAcsRaw : scopCalRaw;
            const scopStr = isAcs ? scopAcsStr : scopCalStr;
            const etaValue = Math.round((scopRaw * 40) - 3);
            const totalPercentage = (scopRaw * 100).toFixed(0);
            const eprelUrl = isAcs ? inst.aerotermia_acs?.url_eprel : inst.aerotermia_cal?.url_eprel;
            const fichaEprel = eprelUrl
                ? `<a href="${eprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                : 'Ficha EPREL';
            const anexoRef = `Anexo ${isHybrid ? 'II' : 'IV'} de la ficha ${cifoLabel}`;
            return scopBox(
                `Justificación del SCOP en ${label} — ${anexoRef}`,
                `SCOP = CC · (${etaVar} + F(1) + F(2))`,
                `${svRow('CC', 'Coeficiente de conversión', '2,5')}
                 ${svRow(etaVar, `Eficiencia energética estacional de ${label.toLowerCase()} (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()}${isAcs ? ' y perfil ACS' : `, impulsión ${getEmitterTemp(inst.tipo_emisor)}°C`})`, `${etaValue}%`)}
                 ${svRow('F(1)', 'Factor de corrección por tecnología (bombas de calor aerotérmicas)', '3%')}
                 ${svRow('F(2)', 'Factor de corrección por clima (bombas de calor aerotérmicas)', '0%')}
                 ${scopResult(`Cálculo: SCOP = 2,5 · (${etaValue}% + 3% + 0%) = ${totalPercentage}% &nbsp;→&nbsp; SCOP en ${label}`, scopStr)}`
            );
        };

        const renderAcsScopJustification = () => {
            const FC_TABLE = { A3: 1.246, A4: 1.251, B3: 1.223, B4: 1.228, C1: 1.154, C2: 1.165, C3: 1.175, C4: 1.181, D1: 1.093, D2: 1.103, D3: 1.113, E1: 1.056 };
            const acsEprelUrl = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_eprel : inst.aerotermia_acs?.url_eprel;
            const acsFtUrl   = inst.misma_aerotermia_acs ? inst.aerotermia_cal?.url_ficha  : inst.aerotermia_acs?.url_ficha;

            if (metodoAcs === 'conjunto') {
                const etaWh = (scopAcsRaw / 2.5 * 100).toFixed(1).replace('.', ',');
                const fichaEprel = acsEprelUrl
                    ? `<a href="${acsEprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                    : 'Ficha EPREL';
                return scopBox(
                    `Justificación del SCOP en ACS — Anexo IV ficha RES060 (depósito ACS en conjunto con la BdC)`,
                    `SCOP<sub>dhw</sub> = CC · η<sub>wh</sub>`,
                    `${svRow('CC', 'Coeficiente de conversión', '2,5')}
                     ${svRow('η<sub>wh</sub>', `Eficiencia energética de caldeo de agua (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()} y perfil ACS)`, `${etaWh}%`)}
                     ${scopResult(`Cálculo: SCOP<sub>dhw</sub> = 2,5 · ${etaWh}% &nbsp;→&nbsp; SCOP en ACS`, scopAcsStr)}`
                );
            }

            if (metodoAcs === 'independiente') {
                const fc = FC_TABLE[zoneStr] ?? FC_TABLE['D3'];
                const fcStr  = fc.toFixed(3).replace('.', ',');
                const copCalc = (scopAcsRaw / fc).toFixed(2).replace('.', ',');
                const ftLink = acsFtUrl ? `<li style="margin-top:3px;">Ficha técnica: <a href="${acsFtUrl}" style="color:#0000EE;text-decoration:underline;">Acceder a la ficha técnica del fabricante</a></li>` : '';
                return `
                    <div style="margin-top:12px;padding:16px 20px;border:1px solid #E9E9E1;border-radius:16px;font-size:12.5px;line-height:1.5;color:#4a4a44;">
                        <div style="font-family:'Archivo';font-weight:800;font-size:13px;text-transform:uppercase;color:#1A1A1A;margin-bottom:8px;">Cálculo del SCOP en ACS</div>
                        <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Fórmula aplicada</div>
                        <p style="margin:0 0 6px;">Según el Anexo VI de la ficha RES060 (Caso 3: bomba de calor aerotérmica con depósito de ACS no suministrado como conjunto), para la zona climática ${zoneStr}:</p>
                        <div style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;border-radius:10px;padding:8px;margin:10px 0;color:#1A1A1A;">SCOP<sub>dhw</sub> = COP · F<sub>c</sub></div>
                        <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Donde</div>
                        <ul style="list-style:none;margin:0 0 10px;padding-left:0;">
                            <li>· COP: coeficiente de rendimiento según ficha técnica y placa de características del equipo</li>
                            <li style="margin-top:3px;">· F<sub>c</sub>: factor de corrección para la zona climática ${zoneStr} (clima ${zoneLabel.toLowerCase()})</li>
                            ${ftLink}
                        </ul>
                        <div style="font-weight:700;color:#1A1A1A;margin-bottom:4px;">Valores utilizados</div>
                        <ul style="list-style:none;margin:0 0 10px;padding-left:0;">
                            <li>· COP = ${copCalc} (según ficha técnica del fabricante)</li>
                            <li style="margin-top:3px;">· F<sub>c</sub> = ${fcStr} (para zona climática ${zoneStr})</li>
                        </ul>
                        <div style="display:flex;justify-content:space-between;align-items:center;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:12px;padding:10px 16px;margin-top:10px;">
                            <span style="font-weight:700;color:#1A1A1A;">SCOP<sub>dhw</sub> = ${copCalc} × ${fcStr} = ${scopAcsStr}</span>
                            <span style="font-family:'Archivo';font-weight:900;font-size:18px;color:#4d6a12;">${scopAcsStr}</span>
                        </div>
                    </div>`;
            }

            return scopCallout(`SCOP en ACS = ${scopAcsStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`);
        };

        const scopJustBlock = `
            ${subLabel('6. Coeficiente de rendimiento estacional de la bomba de calor en calefacción SCOP<sub>bdc</sub>', '#6E6E66', '20px')}
            <div style="border:1px solid #E9E9E1;border-radius:16px;padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Ubicación de la instalación</span><span style="font-weight:700;">Zona climática ${zoneStr} (DB-HE CTE)</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Condiciones en calefacción</span><span style="font-weight:700;">${zoneLabel}</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Tipo de bomba de calor</span><span style="font-weight:700;">Aerotérmica</span></div>
                <div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">Sistema de distribución</span><span style="font-weight:700;">${emiLabel}</span></div>
            </div>
            ${metodoCal === 'eprel'
                ? renderEprelJustification(false)
                : scopCallout(`SCOP en Calefacción = ${scopCalStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`)
            }

            ${subLabel('7. Rendimiento estacional SCOP<sub>dhw</sub>', '#6E6E66', '20px')}
            ${tieneAcs ? renderAcsScopJustification() : scopCallout('SCOP en ACS = no aplica.')}
        `;

        // PÁGINA 4/5: Anexo I + SCOP. Cuando la demanda de ACS es "pesada" (cálculo
        // CTE completo) cada bloque ya llena su propia hoja; en el resto de casos
        // (sin ACS o ACS por XML) hay hueco de sobra y se funden en una sola página
        // para no dejar una hoja casi vacía.
        if (acsDemandHeavy) {
            pages.push(`<div class="doc-page">${pageHeader}${anexoIBlock}${footer}</div>`);
            pages.push(`<div class="doc-page">${pageHeader}${scopJustBlock}${footer}</div>`);
        } else {
            pages.push(`<div class="doc-page">${pageHeader}${anexoIBlock}${scopJustBlock}${footer}</div>`);
        }

        // PÁGINA 6 (solo RES093): Coeficiente de cobertura por bivalencia
        if (isHybrid) {
            const cappedNote = coveragePct >= 95
                ? obsBox(`<p style="margin:0;"><b>Nota:</b> El porcentaje de cobertura calculado (${coveragePctStr}%) es superior al 95%. Conforme al Anexo III de la ficha RES093, el valor máximo aplicable es el 95% (límite de la tabla de bivalencia).</p>`, '10px')
                : '';
            pages.push(`
                <div class="doc-page">
                    ${pageHeader}
                    ${subLabel('8. Coeficiente de cobertura por bivalencia C<sub>b</sub>', '#6E6E66', '20px')}
                    <p style="margin:0 0 6px;font-size:12.5px;color:#4a4a44;">La ficha técnica RES093 establece que el ahorro de energía se pondera mediante el coeficiente de cobertura por bivalencia (C<sub>b</sub>), que refleja la fracción de la demanda de calefacción cubierta por la bomba de calor en modo de funcionamiento bivalente paralelo. Su valor se determina conforme al Anexo III de la ficha RES093 siguiendo el procedimiento que se indica a continuación:</p>

                    ${subLabel('Paso 1 — Horas equivalentes de calefacción (t<sub>h</sub>)', '#6E6E66', '16px')}
                    <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">Conforme a los valores recogidos en el Anexo de las fichas <b>RES220</b> y <b>RES230</b>, incluidas en la <i>Resolución de 3 de julio de 2024</i> de la Dirección General de Planificación y Coordinación Energética (por la que se actualiza el Anexo I de la <i>Orden TED/845/2023, de 18 de julio</i>), las horas equivalentes de calefacción para la zona climática <b>${zoneStr}</b> son:</p>
                    <div style="text-align:center;margin:6px 0;font-family:'Archivo';font-weight:800;font-size:14px;background:#FBF6EE;border-radius:10px;padding:8px;">t<sub>h</sub> = ${thZone.toLocaleString('es-ES')} h/año</div>

                    ${subLabel('Paso 2 — Potencia de diseño (P<sub>diseño</sub>)', '#6E6E66', '16px')}
                    <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">La potencia de diseño se obtiene dividiendo la demanda anual de calefacción entre las horas equivalentes:</p>
                    <div style="text-align:center;margin:6px 0;font-family:'Archivo';font-weight:800;font-size:13px;background:#FBF6EE;border-radius:10px;padding:8px;">P<sub>diseño</sub> = ${demandaAnualKwhStr} kWh / ${thZone.toLocaleString('es-ES')} h = <span style="color:#4d6a12;">${pDesignKwStr} kW</span></div>

                    ${subLabel('Paso 3 — Porcentaje de cobertura de la bomba de calor', '#6E6E66', '16px')}
                    <p style="margin:0 0 6px;font-size:12px;color:#4a4a44;">El porcentaje de cobertura expresa la fracción de la potencia de diseño que cubre la bomba de calor:</p>
                    <div style="text-align:center;margin:6px 0;font-family:'Archivo';font-weight:800;font-size:13px;background:#FBF6EE;border-radius:10px;padding:8px;">% cobertura = ${pbdcKwStr} kW / ${pDesignKwStr} kW = <span style="color:#4d6a12;">${coveragePctStr}%</span></div>
                    ${cappedNote}

                    ${subLabel('Paso 4 — Valor de C<sub>b</sub> aplicado', '#6E6E66', '16px')}
                    <p style="margin:0 0 8px;font-size:12px;color:#4a4a44;">Aplicando el ${appliedCovStr}% en la tabla del Anexo III de la ficha RES093:</p>
                    <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12px;"><tbody>
                            <tr><td colspan="2" style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:10.5px;letter-spacing:.5px;text-transform:uppercase;">Coeficiente de cobertura por bivalencia — valor aplicado</td></tr>
                            <tr><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">Cobertura potencia térmica BdC — Zona ${zoneStr}</td><td style="text-align:center;padding:6px 10px;background:#F7F7F1;color:#6E6E66;font-weight:700;font-size:10px;text-transform:uppercase;">C<sub>b</sub></td></tr>
                            <tr><td style="text-align:center;font-family:'Archivo';font-weight:800;font-size:15px;background:#FBF6EE;padding:10px;">${appliedCovStr}%${coveragePct >= 95 ? ' · valor aplicado' : ''}</td><td style="text-align:center;font-family:'Archivo';font-weight:900;font-size:16px;background:#F3F8E6;color:#4d6a12;">${cbStr}</td></tr>
                        </tbody></table>
                    </div>
                    ${footer}
                </div>
            `);
        }

        // SEPARADOR ANEXOS — solo si hay al menos un anexo con driveId. Sin cierre
        // de marca (a diferencia del RES080): este documento no lleva identidad
        // de Brokergy en ninguna página.
        const annexList = attachments.filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || tieneAcs));
        if (annexList.length > 0) {
            const items = annexList.map((a, i) => `
                <div style="display:flex;align-items:center;gap:16px;border:1px solid #E9E9E1;border-radius:16px;padding:14px 18px;background:#fff;">
                    <span style="flex:none;width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#F18A00,#93C01F);color:#fff;font-family:'Archivo';font-weight:800;font-size:15px;display:flex;align-items:center;justify-content:center;">${i + 1}</span>
                    <div style="font-weight:700;font-size:13.5px;">${a.label}</div>
                </div>
            `).join('');
            pages.push(`
                <div class="doc-page">
                    ${pageHeader}
                    ${sectionTitle('Anexos · Documentación adjunta', '20px')}
                    <p style="margin:0 0 16px 20px;font-size:12.5px;color:#4a4a44;">Se adjunta al presente certificado la siguiente documentación técnica justificativa.</p>
                    <div style="display:grid;gap:10px;">${items}</div>
                    ${footer}
                </div>
            `);

            // En el preview del modal, añadimos imágenes rasterizadas por anexo
            // para que el usuario vea TODO el contenido sin descargar. Estas
            // páginas NO viajan al backend: el HTML generado para /api/pdf/*
            // pasa `withAnnexPreview: false` y solo lleva la portada arriba.
            if (withAnnexPreview) {
                annexList.forEach(a => {
                    const imgs = a.file.previewPages || [];
                    imgs.forEach(src => {
                        pages.push(`
                            <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                                <img src="${src}" style="width: 100%; height: 100%; object-fit: contain;">
                            </div>
                        `);
                    });
                });
            }
        }

        // NUMERACIÓN: la portada (índice 0) no se numera; el resto de páginas
        // propias del CIFO sí. Las páginas de los anexos las añade pdf-lib en
        // backend y respetan la numeración del propio fabricante.
        const total = pages.length - 1;
        const finalPages = pages.map((p, i) => i === 0 ? p : p.replace(/PAGE_X_OF_Y/g, `Página ${i} | ${total}`));

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PDF_CSS}</style></head><body>${finalPages.join('')}</body></html>`;
    };

    // IDs de Drive a concatenar al PDF principal, en orden de attachments.
    const getAnnexDriveFileIds = () => {
        const inst = expediente?.instalacion || {};
        const tieneAcs = inst.cambio_acs !== false;
        return attachments
            .filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || tieneAcs))
            .map(a => a.file.driveId);
    };


    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const annexDriveFileIds = getAnnexDriveFileIds();
            const { data } = await axios.post('/api/pdf/generate', { html: buildHtml(), annexDriveFileIds });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `${numexpte || 'DRAFT'} - Certificado_CIFO.pdf`; a.click();
        } catch { alert('Error al generar el PDF.'); }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive.'); return; }
        setSavingDrive(true);
        try {
            const annexDriveFileIds = getAnnexDriveFileIds();
            const { data } = await axios.post('/api/pdf/save-to-drive', {
                html: buildHtml(), folderId, fileName: `${numexpte || 'DRAFT'} - Certificado CIFO`, subfolderName: '6. ANEXOS CAE',
                annexDriveFileIds
            });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                alert('✅ Guardado en Drive (carpeta 6. ANEXOS CAE)');
            }
        } catch { alert('Error al guardar en Drive.'); }
        finally { setSavingDrive(false); }
    };

    // ── ENVÍO AL INSTALADOR ──────────────────────────────────────────────────
    // Dirección de la instalación (Catastro/oportunidad) y enlace único de subida
    // del CIFO firmado. Reutiliza `instAddr` calculado arriba (NO el del cliente).
    const instAddrText  = instAddr.full || '';
    // window.location.origin: en local apunta a localhost (testeable) y en producción
    // a app.brokergy.es (correcto para el instalador real). Antes iba hardcodeado a
    // prod, por lo que al enviar desde local el visor de firma no aparecía.
    const uploadLink    = `${(typeof window !== 'undefined' ? window.location.origin : APP_BASE_URL)}/subir-cifo/${expediente.id}`;

    // Contactos disponibles del perfil del instalador (puede haber varios):
    // representante/empresa + persona de contacto de notificaciones.
    const instContacts = [];
    {
        const repName = (empResponsable && empResponsable !== '—') ? empResponsable : empNombre;
        if (empTlf || empEmail) {
            instContacts.push({ id: 'rep', label: repName, sublabel: pres.es_autonomo ? 'Autónomo' : 'Representante legal', phone: empTlf || '', email: empEmail || '' });
        }
        const arr = Array.isArray(pres.contactos_notificacion) ? pres.contactos_notificacion : [];
        if (arr.length) {
            arr.forEach((c, i) => {
                if (c && (c.tlf || c.email)) instContacts.push({ id: `c${i}`, label: c.nombre || 'Contacto', sublabel: 'Persona de contacto', phone: c.tlf || '', email: c.email || '' });
            });
        } else if (pres.nombre_contacto && (pres.tlf_contacto || pres.email_contacto)) {
            instContacts.push({ id: 'contacto', label: pres.nombre_contacto, sublabel: 'Persona de contacto', phone: pres.tlf_contacto || '', email: pres.email_contacto || '' });
        }
    }
    const altIds = instContacts.filter(c => c.id !== 'rep').map(c => c.id);
    const phoneValid = (ph) => (ph || '').replace(/[^0-9]/g, '').length >= 9;

    const resolveContact = (id) => {
        if (id === 'otro') return { id: 'otro', label: (manualContact.name || '').trim() || 'Otro contacto', phone: (manualContact.phone || '').trim(), email: (manualContact.email || '').trim() };
        return instContacts.find(c => c.id === id) || { id, label: 'Contacto', phone: '', email: '' };
    };
    const selectedContacts = selectedIds.map(resolveContact);

    // Dos plantillas: primera solicitud de firma vs. reenvío por requerimiento.
    const buildCifoMessage = (tplKey, contactName) => {
        const firstName = (contactName || '').trim().split(/\s+/)[0] || 'instalador';
        const expteB = `*${numexpte}*`;
        if (tplKey === 'requerimiento') {
            return `Hola ${firstName},\n\nHemos recibido un *requerimiento* sobre el expediente ${expteB} de ${cliNombre}${instAddrText ? ` (instalación en ${instAddrText})` : ''} y necesitamos que el *Certificado CIFO* se vuelva a firmar.\n\nAbre este enlace y fírmalo *directamente con tu certificado electrónico* (Autofirma), sin descargar ni volver a subir nada. Nos llegará firmado automáticamente:\n\n${uploadLink}\n\nDebe firmarlo el representante legal de la empresa instaladora. Disculpa las molestias y gracias por tu colaboración.\n*BROKERGY · Ingeniería Energética*`;
        }
        return `Hola ${firstName},\n\nTe adjunto el *Certificado CIFO* correspondiente al expediente ${expteB} de ${cliNombre}${instAddrText ? `, de la instalación realizada en ${instAddrText}` : ''}.\n\nAhora puedes *firmarlo directamente* con tu certificado electrónico, sin descargar ni volver a subir nada: abre el enlace y fírmalo con *Autofirma* (representante legal de la empresa instaladora). Nos llegará firmado automáticamente:\n\n${uploadLink}\n\nSi lo prefieres, desde ese mismo enlace también puedes subir el PDF ya firmado.\n\nUn saludo,\n*BROKERGY · Ingeniería Energética*`;
    };

    const openSendModal = async () => {
        // Por defecto: si la redirección está activa, todos los contactos de
        // notificación; si no, el representante (o el primero disponible).
        const defIds = (pres.contacto_notificaciones_activas && altIds.length) ? altIds : (instContacts[0] ? [instContacts[0].id] : []);
        const sel = instContacts.filter(c => defIds.includes(c.id));
        // Si ya hubo un firmado previo, lo más probable es que sea un requerimiento.
        const defaultTpl = doc.cert_cifo_signed_link ? 'requerimiento' : 'primera';
        setSelectedIds(defIds);
        setTemplateKey(defaultTpl);
        setSendMessage(buildCifoMessage(defaultTpl, sel[0]?.label || empResponsable));
        setChannels({
            email: sel.some(c => c.email),
            whatsapp: sel.some(c => phoneValid(c.phone)),
        });
        setSendStatus(null);
        setSendPhase(null);
        setSendResults([]);
        setWaReady(null);
        setSendOpen(true);
        try {
            const st = await axios.get('/api/whatsapp/status');
            setWaReady(!!st.data?.ready);
        } catch { setWaReady(false); }
    };

    // Al marcar/desmarcar un contacto o cambiar de plantilla regeneramos el mensaje
    // (el saludo usa el nombre del PRIMER destinatario marcado).
    const pickContact = (id) => {
        setSelectedIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id];
            const firstLabel = next.length ? resolveContact(next[0]).label : empResponsable;
            setSendMessage(buildCifoMessage(templateKey, firstLabel));
            return next;
        });
    };
    const pickTemplate = (key) => {
        setTemplateKey(key);
        setSendMessage(buildCifoMessage(key, selectedContacts[0]?.label || empResponsable));
    };

    const toggleChannel = (ch) => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));

    // Disponibilidad de cada canal entre los contactos seleccionados.
    const contactPhoneValid = selectedContacts.some(c => phoneValid(c.phone));
    const canEmail = selectedContacts.some(c => c.email);
    const canWhatsapp = contactPhoneValid && waReady !== false;
    const willEmail = channels.email && canEmail;
    const willWhatsapp = channels.whatsapp && canWhatsapp;
    const nEmail = selectedContacts.filter(c => c.email).length;
    const nPhone = selectedContacts.filter(c => phoneValid(c.phone)).length;
    const sending = sendingEmail || sendingWhatsapp;

    // Envíos individuales (devuelven { ok, text } y NO tocan el status global).
    const sendEmailOnce = async (c) => {
        const subject = templateKey === 'requerimiento'
            ? `${numexpte} - Requerimiento: firmar de nuevo Certificado CIFO`
            : `${numexpte} - Firmar Certificado CIFO de ${cliNombre}`;
        const { data } = await axios.post('/api/pdf/send-cifo', {
            html: buildHtml(),
            to: c.email,
            subject,
            message: sendMessage,
            instaladorNombre: c.label,
            numExpediente: numexpte,
            clienteNombre: cliNombre,
            direccionInstalacion: instAddrText,
            uploadLink,
            annexDriveFileIds: getAnnexDriveFileIds(),
        });
        if (data.success) return { ok: true, text: `${c.label} → ${c.email}` };
        return { ok: false, text: `${c.label}: email no enviado` };
    };

    // Recibe el PDF ya generado (base64) para reutilizarlo entre varios destinatarios.
    const sendWhatsappOnce = async (c, pdfBase64) => {
        await axios.post('/api/whatsapp/send-media', {
            phone: c.phone,
            caption: sendMessage,
            media: { base64: pdfBase64, filename: `${numexpte}_Certificado_CIFO.pdf`, mimetype: 'application/pdf' },
            asDocument: true,
        });
        return { ok: true, text: `${c.label} → ${c.phone}` };
    };

    // Lluvia de "papeles/documentos" al completar el envío: usamos emojis de
    // documento como formas de confeti (shapeFromText). Caída suave tipo papel.
    // Respeta prefers-reduced-motion (mismo patrón que LandingResultView).
    const fireSuccessConfetti = () => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const scalar = 3.6;
        let shapes;
        try {
            shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar }));
        } catch { shapes = undefined; } // fallback a confeti clásico si la versión no soporta shapeFromText
        const burst = (x, delay = 0) => setTimeout(() => {
            confetti({
                particleCount: 22,
                spread: 65,
                startVelocity: 34,
                gravity: 0.8,
                decay: 0.92,
                ticks: 220,
                scalar,
                origin: { x, y: 0.5 },
                zIndex: 10000,
                disableForReducedMotion: true,
                ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }),
            });
        }, delay);
        burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
    };

    // Cierra el overlay + el popup de envío + el modal del CIFO → vuelve al expediente.
    const exitToExpediente = () => {
        setSendPhase(null);
        setSendOpen(false);
        if (onClose) onClose();
    };

    // Orquestador único: envía a TODOS los destinatarios marcados por los canales
    // seleccionados (email, whatsapp o ambos). El PDF para WhatsApp se genera una vez.
    const doSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!selectedContacts.length) { setSendStatus({ ok: false, text: 'Selecciona al menos un destinatario.' }); return; }
        if (!doEmail && !doWa) { setSendStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }
        setSendStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        const results = [];

        // WhatsApp: comprobar conexión y generar el PDF UNA sola vez (se reutiliza).
        let pdfBase64 = null, waOk = doWa;
        if (doWa) {
            try {
                const st = await axios.get('/api/whatsapp/status');
                if (!st.data?.ready) { setWaReady(false); waOk = false; results.push({ channel: 'whatsapp', status: 'fail', text: 'WhatsApp no conectado' }); }
                else {
                    const pdfResp = await axios.post('/api/pdf/generate', { html: buildHtml(), annexDriveFileIds: getAnnexDriveFileIds() });
                    pdfBase64 = pdfResp.data?.pdf;
                }
            } catch (e) { waOk = false; results.push({ channel: 'whatsapp', status: 'fail', text: 'WhatsApp: ' + (e.response?.data?.message || e.message) }); }
        }

        if (doEmail) setSendingEmail(true);
        if (waOk) setSendingWhatsapp(true);

        // Envío secuencial por destinatario (cada uno por los canales con dato).
        for (const c of selectedContacts) {
            if (doEmail && c.email) {
                try { const r = await sendEmailOnce(c); results.push({ channel: 'email', status: r.ok ? 'ok' : 'fail', text: r.text }); }
                catch (e) { results.push({ channel: 'email', status: 'fail', text: `${c.label}: ` + (e.response?.data?.message || e.message) }); }
            }
            if (waOk && pdfBase64 && phoneValid(c.phone)) {
                try { const r = await sendWhatsappOnce(c, pdfBase64); results.push({ channel: 'whatsapp', status: r.ok ? 'ok' : 'fail', text: r.text }); }
                catch (e) { results.push({ channel: 'whatsapp', status: 'fail', text: `${c.label}: ` + (e.response?.data?.message || e.message) }); }
            }
        }
        setSendingEmail(false);
        setSendingWhatsapp(false);

        // Si el CIFO llegó al instalador por al menos un canal, registramos la
        // fecha de envío (documentacion.cert_cifo_sent_at). El módulo de lifecycle
        // cuenta este campo en v_expedientes_pendientes.docs_enviados_total.
        const anyOk = results.some(r => r.status === 'ok');
        if (anyOk && onMarkSent) onMarkSent();
        setSendResults(results);
        setSendStatus({ ok: anyOk, text: results.map(r => `${r.status === 'ok' ? '✓' : '✕'} ${r.text}`).join('   ') });
        setSendPhase('done');
        if (anyOk) fireSuccessConfetti();
    };

    const Spinner = () => (
        <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                {/* ── Toolbar ── */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Certificado CIFO</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numexpte}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Métricas rápidas */}
                        <div className="hidden sm:flex items-center gap-4 mr-3 pr-3 border-r border-white/10">
                            <div className="text-center">
                                <div className="text-brand font-black text-sm">{aeKwh} kWh</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Ahorro</div>
                            </div>
                            <div className="text-center">
                                <div className="text-amber-400 font-black text-sm">{beneficioStr} €</div>
                                <div className="text-white/25 text-[10px] uppercase tracking-wider">Bono CAE</div>
                            </div>
                        </div>

                        <button onClick={() => setIsAnexosOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-xs font-bold hover:text-brand hover:border-brand/30 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                            Gestionar Anexos
                        </button>
                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingDrive || generating || sendingEmail || sendingWhatsapp}
                                title="Subir a Drive"
                                className="text-white/40 hover:text-blue-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                            >
                                {savingDrive ? (
                                    <div className="w-5 h-5 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                                    </svg>
                                )}
                            </button>
                        )}

                        {/* Botón ENVIAR (Email / WhatsApp / ambos — se elige en el popup) */}
                        <button
                            onClick={openSendModal}
                            disabled={sendingEmail || sendingWhatsapp || generating || savingDrive}
                            title="Enviar al instalador"
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-xs font-bold hover:text-brand hover:border-brand/30 transition-all disabled:opacity-30"
                        >
                            {(sendingEmail || sendingWhatsapp) ? (
                                <div className="w-4 h-4 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                            )}
                            Enviar
                        </button>

                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp} 
                                className="flex items-center gap-2 px-5 py-2 bg-brand text-black text-xs font-black rounded-xl uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all disabled:opacity-30">
                            {generating ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>

                {/* CONTENT PREVIEW */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left" 
                         style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
                        <div className="doc-wrap" dangerouslySetInnerHTML={{ __html: buildHtml({ withAnnexPreview: true }) }} />
                    </div>
                </div>

                {isAnexosOpen && <AnexosModal />}

                {/* ── MODAL ENVÍO AL INSTALADOR (contacto + plantilla + canal) ── */}
                {sendOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSendOpen(false)}>
                        <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar CIFO al instalador</h2>
                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Documento a firmar · {numexpte}</p>
                                </div>
                                <button onClick={() => setSendOpen(false)} className="text-white/30 hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                                {/* Destinatario(s) — se puede marcar más de uno */}
                                <div>
                                    <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatarios <span className="text-white/20 normal-case tracking-normal font-bold">· puedes marcar varios</span></label>
                                    <div className="space-y-2">
                                        {instContacts.map(c => {
                                            const on = selectedIds.includes(c.id);
                                            return (
                                            <button key={c.id} type="button" onClick={() => pickContact(c.id)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${on ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${on ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                                    {on && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-white truncate">{c.label}</span>
                                                        <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold shrink-0">{c.sublabel}</span>
                                                    </div>
                                                    <div className="text-[11px] text-white/40 truncate">
                                                        {c.phone || 'sin teléfono'}{c.email ? ` · ${c.email}` : ''}
                                                    </div>
                                                </div>
                                            </button>
                                            );
                                        })}
                                        {/* Otro contacto manual */}
                                        <button type="button" onClick={() => pickContact('otro')}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedIds.includes('otro') ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${selectedIds.includes('otro') ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                                {selectedIds.includes('otro') && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                            </span>
                                            <span className="text-sm font-bold text-white">Otro contacto…</span>
                                        </button>
                                        {selectedIds.includes('otro') && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
                                                <input value={manualContact.name} onChange={e => { const v = e.target.value; setManualContact(m => ({ ...m, name: v })); setSendMessage(buildCifoMessage(templateKey, v)); }} placeholder="Nombre" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                                <input value={manualContact.phone} onChange={e => setManualContact(m => ({ ...m, phone: e.target.value }))} placeholder="Teléfono" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                                <input type="email" value={manualContact.email} onChange={e => setManualContact(m => ({ ...m, email: e.target.value }))} placeholder="Email" className="w-full min-w-0 no-uppercase bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Plantilla + mensaje */}
                                <div>
                                    <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Mensaje (email / WhatsApp)</label>
                                    <div className="flex gap-2 mb-3">
                                        <button type="button" onClick={() => pickTemplate('primera')}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${templateKey === 'primera' ? 'border-brand/50 bg-brand/10 text-brand' : 'border-white/10 text-white/40 hover:text-white'}`}>
                                            Primera firma
                                        </button>
                                        <button type="button" onClick={() => pickTemplate('requerimiento')}
                                            className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider border transition-all ${templateKey === 'requerimiento' ? 'border-amber-400/50 bg-amber-400/10 text-amber-400' : 'border-white/10 text-white/40 hover:text-white'}`}>
                                            Requerimiento
                                        </button>
                                    </div>
                                    <textarea
                                        value={sendMessage}
                                        onChange={e => setSendMessage(e.target.value)}
                                        rows={10}
                                        className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                                    />
                                    <p className="text-[10px] text-white/30 mt-2">🔗 El mensaje incluye el enlace único para subir el CIFO firmado.</p>
                                </div>

                                {/* Canal de envío (email / whatsapp / ambos) */}
                                <div>
                                    <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Enviar por</label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {/* Email */}
                                        <button type="button" disabled={!canEmail} onClick={() => toggleChannel('email')}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${!canEmail ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.email ? 'border-brand/50 bg-brand/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willEmail ? 'border-brand bg-brand' : 'border-white/20'}`}>
                                                {willEmail && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">Email</div>
                                                <div className="text-[10px] text-white/40 truncate">{canEmail ? `${nEmail} con email` : 'sin email'}</div>
                                            </div>
                                        </button>
                                        {/* WhatsApp */}
                                        <button type="button" disabled={!contactPhoneValid || waReady === false} onClick={() => toggleChannel('whatsapp')}
                                            className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${(!contactPhoneValid || waReady === false) ? 'opacity-40 cursor-not-allowed border-white/10 bg-white/[0.02]' : (channels.whatsapp ? 'border-emerald-400/50 bg-emerald-400/10' : 'border-white/10 bg-white/[0.02] hover:border-white/20')}`}>
                                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${willWhatsapp ? 'border-emerald-400 bg-emerald-400' : 'border-white/20'}`}>
                                                {willWhatsapp && <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                                            </span>
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">WhatsApp</div>
                                                <div className="text-[10px] text-white/40 truncate">{!contactPhoneValid ? 'sin teléfono' : (waReady === false ? 'no conectado' : `${nPhone} con teléfono`)}</div>
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {sendStatus && (
                                    <p className={`text-[11px] ${sendStatus.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                                        {sendStatus.ok ? '✅' : '❌'} {sendStatus.text}
                                    </p>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 bg-white/[0.02] border-t border-white/[0.07] flex items-center justify-end gap-3">
                                <button onClick={() => setSendOpen(false)} className="px-4 py-2.5 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                                    Cerrar
                                </button>
                                <button onClick={doSend} disabled={sending || (!willEmail && !willWhatsapp)}
                                    title={(!willEmail && !willWhatsapp) ? 'Selecciona al menos un canal disponible' : 'Enviar'}
                                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                                    {sending
                                        ? <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                                    {sending ? 'Enviando…' : 'Enviar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── OVERLAY DE ENVÍO (wow): enviando → enviado, estado por canal ── */}
                {sendPhase && (() => {
                    const anyOk = sendResults.some(r => r.status === 'ok');
                    const hasFail = sendResults.some(r => r.status === 'fail');
                    const hasUnavail = sendResults.some(r => r.status === 'unavailable');
                    const allGood = anyOk && !hasFail && !hasUnavail;
                    const done = sendPhase === 'done';
                    const tone = !done ? 'brand' : (allGood ? 'emerald' : (anyOk ? 'amber' : 'red'));
                    const glow = { brand: 'bg-brand/20', emerald: 'bg-emerald-500/25', amber: 'bg-amber-500/20', red: 'bg-red-500/20' }[tone];
                    const chMeta = {
                        email:    { name: 'Email',    path: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                        whatsapp: { name: 'WhatsApp', path: 'M12 2a10 10 0 00-8.94 14.46L2 22l5.7-1.5A10 10 0 1012 2z' },
                    };
                    const statusMeta = {
                        ok:          { color: 'emerald', label: 'Enviado',       icon: 'M5 13l4 4L19 7' },
                        fail:        { color: 'red',     label: 'Error',         icon: 'M6 18L18 6M6 6l12 12' },
                        unavailable: { color: 'amber',   label: 'No disponible', icon: 'M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
                    };
                    return (
                        <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
                            <div className="relative w-full max-w-md bg-[#0F1013] border border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-scale-in">
                                <div className={`absolute -top-28 left-1/2 -translate-x-1/2 w-80 h-80 rounded-full blur-3xl pointer-events-none ${glow}`} />
                                <div className="relative px-8 py-9 flex flex-col items-center text-center">
                                    {!done ? (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className="absolute inset-0 rounded-full bg-brand/20 animate-ping" />
                                                <span className="absolute inset-4 rounded-full bg-brand/20 animate-ping" style={{ animationDelay: '0.5s' }} />
                                                <div className="relative w-16 h-16 rounded-full bg-brand/15 border border-brand/40 flex items-center justify-center">
                                                    <svg className="w-8 h-8 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} style={{ animation: 'float 1.8s ease-in-out infinite' }}><path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando CIFO…</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
                                            <div className="mt-6 w-full space-y-2">
                                                {willEmail && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-brand shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando email…</span>
                                                    </div>
                                                )}
                                                {willWhatsapp && (
                                                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/10">
                                                        <svg className="w-4 h-4 animate-spin text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" /></svg>
                                                        <span className="text-[11px] font-bold text-white/70 uppercase tracking-wider">Enviando WhatsApp…</span>
                                                    </div>
                                                )}
                                            </div>
                                            <p className="mt-6 text-[10px] text-white/25 uppercase tracking-widest font-bold">No cierres esta ventana</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="relative w-24 h-24 mb-6 flex items-center justify-center">
                                                <span className={`absolute inset-0 rounded-full animate-ping ${tone === 'emerald' ? 'bg-emerald-500/20' : tone === 'amber' ? 'bg-amber-500/20' : 'bg-red-500/20'}`} />
                                                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center border-2 ${tone === 'emerald' ? 'bg-emerald-500/15 border-emerald-400/50 text-emerald-400' : tone === 'amber' ? 'bg-amber-500/15 border-amber-400/50 text-amber-400' : 'bg-red-500/15 border-red-400/50 text-red-400'}`}>
                                                    <svg className="w-10 h-10 animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={anyOk ? 'M5 13l4 4L19 7' : 'M6 18L18 6M6 6l12 12'} /></svg>
                                                </div>
                                            </div>
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡CIFO enviado!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numexpte}</p>
                                            <div className="mt-6 w-full space-y-2">
                                                {sendResults.map((r, i) => {
                                                    const cm = chMeta[r.channel]; const sm = statusMeta[r.status];
                                                    return (
                                                        <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${sm.color === 'emerald' ? 'bg-emerald-500/[0.06] border-emerald-400/25' : sm.color === 'amber' ? 'bg-amber-500/[0.06] border-amber-400/25' : 'bg-red-500/[0.06] border-red-400/25'}`}>
                                                            <svg className="w-5 h-5 text-white/50 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}><path strokeLinecap="round" strokeLinejoin="round" d={cm.path} /></svg>
                                                            <div className="min-w-0 flex-1 text-left">
                                                                <div className="text-[11px] font-black uppercase tracking-wider text-white">{cm.name}</div>
                                                                <div className="text-[10px] text-white/45 truncate">{r.text}</div>
                                                            </div>
                                                            <span className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-wider shrink-0 ${sm.color === 'emerald' ? 'text-emerald-400' : sm.color === 'amber' ? 'text-amber-400' : 'text-red-400'}`}>
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d={sm.icon} /></svg>
                                                                {sm.label}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                            <div className="mt-7 w-full flex flex-col gap-2">
                                                <button onClick={exitToExpediente} className="w-full py-3 rounded-xl bg-brand text-black text-[11px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all">
                                                    Volver al expediente
                                                </button>
                                                <button onClick={() => setSendPhase(null)} className="w-full py-2.5 rounded-xl border border-white/10 text-white/40 text-[10px] font-black uppercase tracking-widest hover:text-white hover:border-white/30 transition-all">
                                                    Seguir aquí
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
