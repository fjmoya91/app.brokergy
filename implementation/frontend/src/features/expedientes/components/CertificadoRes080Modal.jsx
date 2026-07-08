import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import confetti from 'canvas-confetti';
import { useAuth } from '../../../context/AuthContext';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';
import { buildInstalacionAddress } from '../utils/docGenerators';
import FirmarConCertificadoModal from './FirmarConCertificadoModal';

// ─── CONSTANTES Y ESTILOS ────────────────────────────────────────────────────

// Origen de la app: se usa para servir logos, la imagen de portada y las fuentes
// auto-alojadas con URL ABSOLUTA. Puppeteer (backend) genera el PDF con
// `setContent` (base about:blank), por lo que las rutas relativas NO cargan; hay
// que darle URLs absolutas al mismo origen (patrón ya usado en docGenerators.js).
const APP_URL = import.meta.env.VITE_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '');

const DOC_WIDTH = '794px';

// Fuentes del diseño (Archivo + Instrument Sans) auto-alojadas en /public/fonts.
// Subsets latin + latin-ext descargados de Google Fonts. document.fonts.ready en el
// backend espera a que carguen antes de imprimir, así que no hace falta CDN externa.
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

// Estilos base compartidos por preview (px) e impresión (mm). El grueso del look
// (colores, tarjetas, degradados) va INLINE en las plantillas de página, igual que
// el diseño entregado, para tener una única fuente de verdad screen↔PDF. Aquí solo
// viven: fuentes, caja de página, helpers de tabla, pie y el contenteditable.
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
    .doc-wrap { background: #4a4a46; width: ${DOC_WIDTH}; padding: 20px 0; margin: 0 auto; }
    .doc-page {
        width: ${DOC_WIDTH};
        min-height: 1123px;
        padding: 11mm 14mm 12mm;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 18px rgba(20,20,19,.16);
        position: relative;
    }
    .doc-page:last-child { margin-bottom: 0; }

    /* Contenteditable inline (se edita en el preview; en el PDF va texto plano) */
    .doc-editable {
        outline: none;
        background: #fffde7;
        cursor: text;
        min-height: 1rem;
        padding: 0 3px;
        border-radius: 3px;
        display: inline-block;
        min-width: 20px;
    }
    .doc-editable:focus { background: #fff9c4; box-shadow: inset 0 0 0 1px #F18A00; }

    @media print {
        .doc-wrap { background: #fff !important; padding: 0 !important; }
        .doc-page { margin: 0 !important; box-shadow: none !important; }
        .doc-editable { background: transparent !important; box-shadow: none !important; }
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
        padding: 11mm 14mm 12mm;
        page-break-after: always;
        break-after: page;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .doc-page:last-child { page-break-after: auto; break-after: auto; }
`;

// Emisores de calefacción (para la justificación del SCOP, igual que RES060).
const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',            label: 'Suelo Radiante (35°C)',              temp: 35 },
    { value: 'radiadores_baja_temp',      label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)',   temp: 55 },
];

function getEmitterTemp(val) {
    if (val === 'suelo_radiante') return 35;
    if (val === 'radiadores_baja_temp') return 45;
    if (val === 'radiadores_convencionales') return 55;
    return 35;
}

export function CertificadoRes080Modal({ isOpen, onClose, expediente, results, attachments: externalAttachments, onAttachmentsChange, onSaveDrive, onSaveFichaLink, onSaveExtraAnnexes, onMarkSent, onSaveSignedLink }) {
    const { user } = useAuth();
    // Firma con certificado electrónico (Autofirma, formato arrastrable)
    const [signOpen, setSignOpen] = useState(false);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signBusy, setSignBusy] = useState(false);
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);

    // ── Envío del Certificado RES080 al cliente (contacto + canal Email/WhatsApp) ──
    // El RES080 lo firma Brokergy (admin), así que el envío es la ENTREGA FINAL del
    // certificado ya firmado al cliente (sin flujo de firma del instalador).
    const [sendOpen, setSendOpen] = useState(false);
    const [waReady, setWaReady] = useState(null);                 // null = sin comprobar
    const [selectedContactId, setSelectedContactId] = useState(null);
    const [manualContact, setManualContact] = useState({ name: '', phone: '', email: '' });
    const [sendMessage, setSendMessage] = useState('');
    const [sendStatus, setSendStatus] = useState(null);          // { ok, text }
    const [channels, setChannels] = useState({ email: true, whatsapp: true });
    const [sendPhase, setSendPhase] = useState(null);            // null | 'sending' | 'done'
    const [sendResults, setSendResults] = useState([]);
    const [loadingFichas, setLoadingFichas] = useState({ cal: false, acs: false });
    const [resyncingType, setResyncingType] = useState(null);
    const [uploadingExtra, setUploadingExtra] = useState(false);

    // Estado efímero de anexos: fichas de aerotermia (auto-copiadas del modelo) +
    // anexos extra (RITE, envolvente, etc.) que viven en Drive. Mismo modelo que el
    // CIFO RES060. El padre persiste los enlaces en documentacion.
    const initialAttachments = [
        { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
        { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
    ];
    const attachments = externalAttachments || initialAttachments;
    // IMPORTANTE: pasamos el updater tal cual al setter del padre (que es un
    // useState setter y sabe encadenar). Resolver aquí introduciría stale closures
    // cuando dos cargas async (cal+acs) corren en paralelo.
    const setAttachments = (newVal) => {
        if (onAttachmentsChange) onAttachmentsChange(newVal);
    };

    const editableRef = useRef({
        nombre_actuacion: '',
        descripcion_actuacion: 'Rehabilitación profunda de la envolvente térmica y sustitución de instalaciones térmicas por equipos de alta eficiencia energética.',
        descripcion_termica: 'Sustitución de sistema de calefacción y ACS existente por bomba de calor aerotérmica de alta eficiencia.',
        descripcion_ventanas: 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',
        fecha_inicio: '',
        fecha_fin: '',
        director_nombre: 'Francisco Javier Moya López',
        director_entidad: 'Soluciones Sostenibles para Eficiencia Energética, SL',
        director_titulacion: 'Graduado en ingeniería industrial',
        director_email: 'franciscojavier.moya@brokergy.es',
        director_tlf: '695615330',
        empresa_responsable: '',
        marco_nuevo_material: 'PVC',
        marco_nuevo_marca: 'CORTIZO',
        marco_nuevo_modelo: 'A 70',
        marco_nuevo_uf: '1,3',
        cristal_nuevo_u: '1.3',
        cristal_nuevo_marca: 'GUARDIAN',
        cristal_nuevo_modelo: 'SUN',
        cristal_nuevo_composicion: '4/16/4 Bajo emisivo',
        cristal_nuevo_ug: '1,1',
        cristal_nuevo_g: '0,43',
        permeabilidad_nueva: '3',
    });

    const [editableData, setEditableData] = useState({});
    const [isAnexosOpen, setIsAnexosOpen] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);

    const updateScale = useCallback(() => {
        if (!containerRef.current) return;
        const avail = containerRef.current.clientWidth - 48;
        setScale(avail < 794 ? avail / 794 : 1);
    }, []);

    useEffect(() => {
        if (!isOpen) return;
        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [isOpen, updateScale]);

    useEffect(() => {
        if (expediente && isOpen) {
            const doc = expediente.documentacion || {};
            const env = doc.envolvente || {};
            const inst = expediente.instalacion || {};
            const op = expediente.oportunidades || {};
            
            // Búsqueda robusta de empresa instaladora
            const pres = expediente.prescriptores || {};
            const empName = pres.razon_social || 
                           pres.nombre || 
                           op.datos_calculo?.inputs?.partner_name ||
                           '';

            const empCif = pres.cif || 
                          pres.nif || 
                          op.datos_calculo?.inputs?.partner_cif ||
                          '';

            const empAddr = pres.direccion 
                ? `${pres.direccion}, ${pres.codigo_postal || pres.cp || ''} ${pres.municipio || ''} (${pres.provincia || ''})`.replace(/,  \(\)/, '').replace(/^, /, '')
                : (op.datos_calculo?.inputs?.partner_address || '');

            // Normaliza cualquier fecha (ISO aaaa-mm-dd, dd/mm/aaaa o dd-mm-aaaa) a formato dd-mm-aaaa.
            const toDdMmYyyy = (val) => {
                if (!val) return '';
                const s = String(val).trim();
                let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);          // ISO: aaaa-mm-dd[Thh:mm]
                if (m) return `${m[3]}-${m[2]}-${m[1]}`;
                m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);  // dd/mm/aaaa o dd-mm-aaaa
                if (m) return `${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}-${m[3]}`;
                return s;
            };

            // Número → string con coma decimal (es-ES). Devuelve '' para vacío/null,
            // de modo que el `|| default` posterior funcione.
            const numStr = (v) => (v === null || v === undefined || v === '') ? '' : String(v).replace('.', ',');

            const initialFields = {
                nombre_actuacion: `${expediente.numero_expediente}: Rehabilitación profunda de edificios de viviendas generadora de ahorros energéticos`,
                fecha_inicio: toDdMmYyyy(doc.fecha_inicio_res080 || doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial),
                fecha_fin: toDdMmYyyy(doc.fecha_fin_res080 || doc.fecha_fin_cifo || doc.fecha_firma_cee_final),
                descripcion_ventanas: env.descripcion_ventanas || editableRef.current.descripcion_ventanas || 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',
                descripcion_termica: doc.descripcion_termica || (inst.cambio_acs === false
                    ? 'Sustitución del sistema de calefacción existente por bomba de calor aerotérmica de alta eficiencia. La instalación de ACS existente se mantiene sin cambios.'
                    : editableRef.current.descripcion_termica),
                descripcion_envolvente: env.descripcion_cerramientos || editableRef.current.descripcion_envolvente || 'Se ha llevado a cabo la rehabilitación energética...',
                aislamiento_muros_sn: env.aislamiento_muros === true ? 'SÍ' : 'NO',
                aislamiento_muros_tipo: env.aislamiento_muros_tipo || editableRef.current.aislamiento_muros_tipo || '—',
                aislamiento_muros_mat: env.aislamiento_muros_material || editableRef.current.aislamiento_muros_mat || '—',
                aislamiento_muros_esp: env.aislamiento_muros_espesor ? `${env.aislamiento_muros_espesor} cm` : (editableRef.current.aislamiento_muros_esp || '—'),
                aislamiento_muros_cond: env.aislamiento_muros_conductividad ? env.aislamiento_muros_conductividad.toString().replace('.', ',') : (editableRef.current.aislamiento_muros_cond || '—'),
                aislamiento_cubierta_sn: env.aislamiento_cubierta === true ? 'SÍ' : 'NO',
                aislamiento_cubierta_tipo: env.aislamiento_cubierta_tipo || editableRef.current.aislamiento_cubierta_tipo || '—',
                aislamiento_cubierta_mat: env.aislamiento_cubierta_material || editableRef.current.aislamiento_cubierta_mat || '—',
                aislamiento_cubierta_esp: env.aislamiento_cubierta_espesor ? `${env.aislamiento_cubierta_espesor} cm` : (editableRef.current.aislamiento_cubierta_esp || '—'),
                aislamiento_cubierta_cond: env.aislamiento_cubierta_conductividad ? env.aislamiento_cubierta_conductividad.toString().replace('.', ',') : (editableRef.current.aislamiento_cubierta_cond || '—'),
                envolvente_observaciones: env.envolvente_observaciones || editableRef.current.envolvente_observaciones || '- La duración indicativa de la actuación (Di) es de 25 años...',
                // ── Ventanas NUEVAS: volcar lo guardado en la pestaña Envolvente ──
                // Antes la columna "NUEVAS" usaba SIEMPRE los defaults de editableRef
                // (PVC/CORTIZO/A 70…), ignorando lo introducido por el usuario. Ahora
                // se siembra desde `env`; si un campo está vacío, cae al default.
                marco_nuevo_material: env.marco_nuevo_material || editableRef.current.marco_nuevo_material,
                marco_nuevo_marca: env.marco_nuevo_marca || editableRef.current.marco_nuevo_marca,
                marco_nuevo_modelo: env.marco_nuevo_modelo || editableRef.current.marco_nuevo_modelo,
                marco_nuevo_uf: numStr(env.marco_nuevo_transmitancia) || editableRef.current.marco_nuevo_uf,
                cristal_nuevo_marca: env.cristal_nuevo_marca || editableRef.current.cristal_nuevo_marca,
                cristal_nuevo_modelo: env.cristal_nuevo_modelo || editableRef.current.cristal_nuevo_modelo,
                cristal_nuevo_composicion: env.cristal_nuevo_composicion || editableRef.current.cristal_nuevo_composicion,
                cristal_nuevo_ug: numStr(env.cristal_nuevo_transmitancia) || editableRef.current.cristal_nuevo_ug,
                cristal_nuevo_g: numStr(env.cristal_nuevo_factor_solar) || editableRef.current.cristal_nuevo_g,
                permeabilidad_nueva: numStr(env.permeabilidad_nueva) || editableRef.current.permeabilidad_nueva,
                empresa_responsable: empName.toUpperCase(),
                empresa_cif: empCif.toUpperCase(),
                empresa_domicilio: empAddr.toUpperCase()
            };

            // Volcar a ref para persistencia (usado en PDF y edicion)
            editableRef.current = { ...editableRef.current, ...initialFields };
            
            // Volcar a state para disparar el primer render con datos
            setEditableData(prev => ({ ...prev, ...initialFields }));
        }
    }, [expediente, isOpen]);

    // Función para manejar cambios en el contenido editable (contenteditable)
    const handleContentBlur = (e) => {
        const field = e.target.getAttribute('data-field');
        if (field) {
            const val = e.target.innerText;
            editableRef.current[field] = val;
            setEditableData(prev => ({ ...prev, [field]: val }));
        }
    };

    // ── ANEXOS (Drive) — mismo modelo que el CIFO RES060 ─────────────────────
    // PDF.js (CDN) solo para el preview. El backend concatena los PDFs vectoriales
    // originales con pdf-lib en las 4 llamadas (generate, save-to-drive, send-cifo).
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
            console.warn('[RES080 preview] No se pudo renderizar el PDF para preview:', e.message);
            return [];
        }
    };

    const makeSlotFile = ({ driveId, link, fileName, source, label }) => ({
        driveId, link, name: fileName || label || 'Ficha técnica', source
    });

    const setSlot = (slotId, updater) => {
        setAttachments(prev => prev.map(a => a.id === slotId ? { ...a, ...updater(a) } : a));
    };

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
            console.warn(`[RES080 preview] hydrate ${type} falló:`, e.message);
        }
    };

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
                    file: null, missing: true,
                    missingReason: copyRes.data?.error || 'unknown',
                    missingModel: copyRes.data?.model || null
                }));
            }
        } catch (err) {
            console.error(`[RES080] loadFichaSlot(${type}) error:`, err);
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
                    file: null, missing: true,
                    missingReason: copyRes.data?.error || 'unknown',
                    missingModel: copyRes.data?.model || null
                }));
            }
        } catch (err) {
            console.error(`[RES080] resync(${type}) error:`, err);
        } finally {
            setResyncingType(null);
        }
    };

    const arrayBufferToBase64 = (arrayBuffer) => {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = '';
        const chunk = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return btoa(binary);
    };

    // Páginas de preview de un buffer de anexo. Si es una IMAGEN (JPEG/PNG) devuelve
    // una única "página" con la imagen como data-URL; si es un PDF, las páginas
    // rasterizadas con pdf.js. Necesario porque pdf.js falla sobre bytes de imagen:
    // maneja tanto los anexos nuevos (ya convertidos a PDF en backend) como los
    // antiguos que se guardaron como imagen cruda con content-type application/pdf.
    const bufferToPreviewPages = async (arrayBuffer) => {
        const b = new Uint8Array(arrayBuffer.slice(0, 4));
        const isJpg = b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
        const isPng = b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
        if (isJpg || isPng) {
            const mime = isPng ? 'image/png' : 'image/jpeg';
            return [`data:${mime};base64,${arrayBufferToBase64(arrayBuffer)}`];
        }
        return renderPdfBufferToImages(arrayBuffer);
    };

    const handleManualFixedUpload = async (slotId, file) => {
        if (!file || !expediente?.id) return;
        const type = slotId === 'aerotermia_cal' ? 'cal' : 'acs';
        setLoadingFichas(p => ({ ...p, [type]: true }));
        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/fichas-tecnicas/upload`, {
                base64, type, numexpte: expediente.numero_expediente
            });
            if (onSaveFichaLink) onSaveFichaLink(type, data.link, data.driveId);
            const previewPages = await renderPdfBufferToImages(arrayBuffer);
            setSlot(slotId, () => ({
                file: { ...makeSlotFile({ driveId: data.driveId, link: data.link, fileName: file.name, source: 'manual_upload' }), previewPages },
                missing: false, missingReason: null, missingModel: null
            }));
        } catch (err) {
            console.error('[RES080] manualFixedUpload error:', err);
            alert('❌ Error al subir la ficha: ' + (err.response?.data?.error || err.message));
        } finally {
            setLoadingFichas(p => ({ ...p, [type]: false }));
        }
    };

    const handleManualExtraUpload = async (file, labelOverride) => {
        if (!file || !expediente?.id) return;
        setUploadingExtra(true);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const base64 = arrayBufferToBase64(arrayBuffer);
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/anexos-cifo/upload`, {
                base64, fileName: file.name, label: labelOverride || file.name
            });
            const previewPages = await bufferToPreviewPages(arrayBuffer);
            setAttachments(prev => [...prev, {
                id: `extra_${data.driveId}`,
                label: data.label,
                isExtra: true,
                file: { ...makeSlotFile({ driveId: data.driveId, link: data.link, fileName: data.fileName, source: 'manual_upload' }), previewPages }
            }]);
            if (onSaveExtraAnnexes) onSaveExtraAnnexes('add', { driveId: data.driveId, link: data.link, fileName: data.fileName, label: data.label });
        } catch (err) {
            console.error('[RES080] manualExtraUpload error:', err);
            alert('❌ Error al subir el anexo: ' + (err.response?.data?.error || err.message));
        } finally {
            setUploadingExtra(false);
        }
    };

    const removeAttachment = async (index) => {
        const item = attachments[index];
        if (!item) return;
        if (item.required) {
            setAttachments(prev => prev.map((a, i) => i === index ? { ...a, file: null, missing: false } : a));
            return;
        }
        if (item.file?.driveId && expediente?.id) {
            try {
                await axios.delete(`/api/expedientes/${expediente.id}/anexos-cifo/${item.file.driveId}`);
                if (onSaveExtraAnnexes) onSaveExtraAnnexes('remove', { driveId: item.file.driveId });
            } catch (err) {
                console.error('[RES080] delete extra annex error:', err);
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

    // Carga automática de fichas técnicas + hidratación de previews al abrir.
    useEffect(() => {
        if (!isOpen || !expediente?.id) return;
        const inst = expediente.instalacion || {};
        const tieneAcs = inst.cambio_acs !== false;
        loadFichaSlot('cal');
        if (tieneAcs) loadFichaSlot('acs');

        const extras = (attachments || []).filter(a => a.isExtra && a.file?.driveId && !a.file.previewPages);
        extras.forEach(async (extra) => {
            try {
                const res = await axios.get(`/api/expedientes/${expediente.id}/anexos-cifo/${extra.file.driveId}/content`, {
                    responseType: 'arraybuffer',
                    validateStatus: s => s === 200
                });
                const imgs = await bufferToPreviewPages(res.data);
                if (imgs.length > 0) {
                    setAttachments(prev => prev.map(a => a.id === extra.id
                        ? { ...a, file: { ...a.file, previewPages: imgs } }
                        : a));
                }
            } catch (e) {
                console.warn('[RES080 preview] extra hydrate falló:', extra.id, e.message);
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, expediente?.id]);

    if (!isOpen || !expediente) return null;

    const op = expediente.oportunidades || {};
    const inst = expediente.instalacion || {};
    const cee = expediente.cee || {};
    const env = (expediente.documentacion || {}).envolvente || {};
    const cli = expediente.clientes || expediente.cliente || {};
    const loc = expediente.ubicacion || {};
    const tieneAcs = inst.cambio_acs !== false;

    const numExpte = expediente.numero_expediente || '—';
    // Dirección de la INSTALACIÓN (Catastro/oportunidad), nunca la del cliente
    // (esa se usa en clientDir, abajo, como dato legal del titular).
    const instAddr = buildInstalacionAddress(expediente);
    const locCA = (instAddr.ccaa || '—').toUpperCase();
    const locDir = instAddr.full || '—';
    const locCat = instAddr.refCatastral || '—';
    const utmX = inst.coord_x || loc.coord_x || '—';
    const utmY = inst.coord_y || loc.coord_y || '—';

    const clientFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
    const clientDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;

    const formatNum = (val) => {
        if (!val && val !== 0) return '0';
        return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };

    // Datos energéticos desde resultados
    const aeTotal = Math.round(results?.ahorroEnergiaFinalTotal || 0);
    const ef_i    = Math.round(results?.totalEnergiaInicialAno || 0);
    const ef_f    = Math.round(results?.totalEnergiaFinalAno || 0);
    const aeKwh = aeTotal.toLocaleString('es-ES');
    const beneficioStr = Math.round(aeTotal * (results?.price_kwh || 0.102)).toLocaleString('es-ES');

    // ─── LÓGICA DE EQUIPOS ───────────────────────────────────────────────────
    const calExBrand = inst.caldera_antigua_cal?.marca || '—';
    const calExMod   = inst.caldera_antigua_cal?.modelo || '—';
    const calExSerie = inst.caldera_antigua_cal?.numero_serie || '—';
    const calExTipoEq = inst.caldera_antigua_cal?.tipo_equipo || 'Caldera';
    // Rendimiento/combustible de la caldera antigua derivados de rendimiento_id
    // (BOILER_EFFICIENCIES), igual que el CIFO RES060 — no hay campos combustible/rendimiento.
    const calEffEntry = BOILER_EFFICIENCIES.find(b => b.id === (inst.caldera_antigua_cal?.rendimiento_id || 'default')) || BOILER_EFFICIENCIES[0];
    const calExFuel  = calEffEntry.id === 'electric' ? 'Electricidad'
        : calEffEntry.id !== 'default' ? calEffEntry.label.split(',')[0].trim()
        : (inst.caldera_antigua_cal?.combustible || '—');

    const calNuBrand = inst.aerotermia_cal?.marca || '—';
    const calNuMod   = inst.aerotermia_cal?.modelo || '—';
    const calNuScop  = inst.aerotermia_cal?.scop || '—';
    const calNuSerieOut = inst.aerotermia_cal?.numero_serie || '—';

    const acsExBrand = inst.caldera_antigua_acs?.marca || calExBrand;
    const acsExMod   = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || calExSerie;
    const acsExTipoEq = inst.caldera_antigua_acs?.tipo_equipo || calExTipoEq;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === (inst.caldera_antigua_acs?.rendimiento_id || inst.caldera_antigua_cal?.rendimiento_id || 'default')) || calEffEntry;
    const acsExFuel  = acsEffEntry.id === 'electric' ? 'Electricidad'
        : acsEffEntry.id !== 'default' ? acsEffEntry.label.split(',')[0].trim()
        : (inst.caldera_antigua_acs?.combustible || calExFuel);
    // ¿Se actúa sobre el ACS? Si cambio_acs === false, se conserva la instalación existente (no se sustituye).
    const acsSeActua = inst.cambio_acs !== false;

    const sameAero = !!inst.misma_aerotermia_acs;
    const acsNuBrand = sameAero ? calNuBrand : (inst.aerotermia_acs?.marca || '—');
    const acsNuMod   = sameAero ? calNuMod : (inst.aerotermia_acs?.modelo || '—');
    const acsNuScop  = sameAero ? calNuScop : (inst.aerotermia_acs?.scop || '—');
    const acsNuSerie = sameAero ? 'Misma unidad' : (inst.aerotermia_acs?.numero_serie || '—');

    // ─── JUSTIFICACIÓN DEL SCOP (igual que RES060) ──────────────────────────
    const zoneStr = (op.datos_calculo?.zona || 'D3').toUpperCase();
    const zoneLabel = ['A3','A4','B3','B4','C1','C2','C3','C4','D1','D2','D3'].includes(zoneStr)
        ? 'Cálido' : (zoneStr === 'E1' ? 'Medio' : 'Cálido');
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';
    const scopAcsRaw = tieneAcs ? parseFloat(sameAero ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';
    const emiLabel   = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';
    const metodoCal  = inst.aerotermia_cal?.metodo_scop || 'ficha';
    const metodoAcs  = inst.aerotermia_acs?.metodo_scop || 'ficha';

    // ─── LÓGICA DE HUECOS (XML) ─────────────────────────────────────────────
    // Función para parsear XML on-the-fly si no vienen los huecos en el objeto
    const getHuecosFromXml = (xmlStr) => {
        if (!xmlStr) return [];
        try {
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, 'text/xml');
            
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

            const allElements = xmlDoc.getElementsByTagName('Elemento');
            const result = [];
            
            for (let i = 0; i < allElements.length; i++) {
                const el = allElements[i];
                const tipo = findNode(el, 'Tipo')?.textContent?.trim()?.toLowerCase();
                const getVal = (tag) => {
                    const node = findNode(el, tag);
                    const valStr = node?.textContent?.trim()?.replace(',', '.') || '0';
                    return parseFloat(valStr) || 0;
                };

                if (tipo === 'hueco') {
                    result.push({
                        nombre: findNode(el, 'Nombre')?.textContent?.trim() || 'Desconocido',
                        tipo: 'Hueco',
                        superficie: getVal('Superficie'),
                        transmitancia: getVal('Transmitancia'),
                        factorSolar: getVal('FactorSolar'),
                        orientacion: findNode(el, 'Orientacion')?.textContent?.trim() || 'Desconocida'
                    });
                } else if (tipo && ['fachada', 'cubierta', 'suelo', 'particioninteriorvertical', 'particioninteriorhorizontal'].includes(tipo)) {
                    result.push({
                        nombre: findNode(el, 'Nombre')?.textContent?.trim() || 'Desconocido',
                        tipo: findNode(el, 'Tipo')?.textContent?.trim() || 'Desconocido',
                        superficie: getVal('Superficie'),
                        transmitancia: getVal('Transmitancia'),
                        orientacion: findNode(el, 'Orientacion')?.textContent?.trim() || 'Desconocida'
                    });
                }
            }
            return result;
        } catch (e) {
            console.error("Error parsing XML in Modal:", e);
            return [];
        }
    };

    const huecosInit = cee.cee_inicial?.huecos || [];
    const huecosFin = cee.cee_final?.huecos || [];

    const opacosInit = cee.cee_inicial?.opacos || getHuecosFromXml(cee.xml_inicial).filter(e => e.tipo !== 'Hueco');
    const opacosFin = cee.cee_final?.opacos || getHuecosFromXml(cee.xml_final).filter(e => e.tipo !== 'Hueco');
    
    const hInitArr = huecosInit.length > 0 ? huecosInit : getHuecosFromXml(cee.xml_inicial).filter(e => e.tipo === 'Hueco');
    const hFinArr = huecosFin.length > 0 ? huecosFin : getHuecosFromXml(cee.xml_final).filter(e => e.tipo === 'Hueco');

    const changedHuecos = hFinArr.filter(hFin => {
        const nameFin = hFin.nombre.trim().toLowerCase();
        const original = hInitArr.find(hIni => {
            const nameIni = hIni.nombre.trim().toLowerCase();
            const sameName = nameFin === nameIni || nameFin.startsWith(nameIni) || nameIni.startsWith(nameFin);
            const diffTrans = Math.abs(hIni.transmitancia - hFin.transmitancia) > 0.01;
            return sameName && diffTrans;
        });
        return !!original;
    }).map(hFin => ({
        initial: hInitArr.find(hIni => {
            const nameIni = hIni.nombre.trim().toLowerCase();
            const nameFin = hFin.nombre.trim().toLowerCase();
            return nameFin === nameIni || nameFin.startsWith(nameIni) || nameIni.startsWith(nameFin);
        }),
        final: hFin
    }));

    const changedOpacos = opacosFin.filter(oFin => {
        const nameFin = oFin.nombre.trim().toLowerCase();
        const original = opacosInit.find(oIni => {
            const nameIni = oIni.nombre.trim().toLowerCase();
            const sameName = nameFin === nameIni || nameFin.startsWith(nameIni) || nameIni.startsWith(nameFin);
            const diffTrans = Math.abs(oIni.transmitancia - oFin.transmitancia) > 0.01;
            return sameName && diffTrans;
        });
        return !!original;
    }).map(oFin => ({
        initial: opacosInit.find(oIni => {
            const nameIni = oIni.nombre.trim().toLowerCase();
            const nameFin = oFin.nombre.trim().toLowerCase();
            return nameFin === nameIni || nameFin.startsWith(nameIni) || nameIni.startsWith(nameFin);
        }),
        final: oFin
    }));

    // Determinar si se sustituyen ventanas (Prioridad: Detección automática > flag manual)
    const seSustituyen = changedHuecos.length > 0 || env.sustituye_ventanas === true;

    const generateHtml = (isForPdf = false, withAnnexPreview = false) => {
        const ed = (f) => editableData[f] || editableRef.current[f] || '';
        const eb = (f) => isForPdf ? ed(f) : `<div contenteditable="true" class="doc-editable" data-field="${f}">${ed(f)}</div>`;
        const formatN = (v) => v ? v.toString().replace('.', ',') : '—';

        const pages = [];

        // ─── Helpers de diseño (nuevo formato modernizado) ───────────────────
        const pageHeader = `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:#1A1A1A;border-radius:14px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <img src="${APP_URL}/logo_brokergy_white.png" alt="Brokergy" style="height:19px;">
                    <span style="font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:2.5px;color:#93C01F;border-left:1px solid rgba(255,255,255,.28);padding-left:12px;">CERTIFICADO CAE · RES080</span>
                </div>
                <span style="font-family:'Archivo';font-weight:600;font-size:11px;letter-spacing:1px;color:#93C01F;">Expte: ${numExpte}</span>
            </div>`;
        const sectionTitle = (t, mt = '13px') => `
            <div style="display:flex;align-items:center;gap:11px;margin:${mt} 0 8px;">
                <span style="width:9px;height:24px;border-radius:5px;background:linear-gradient(#F18A00,#93C01F);"></span>
                <h3 style="font-weight:800;font-size:14px;letter-spacing:.5px;text-transform:uppercase;">${t}</h3>
            </div>`;
        const subLabel = (t, color = '#6E6E66', mt = '18px') => `<h3 style="font-weight:700;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:${color};margin:${mt} 0 8px;">${t}</h3>`;
        const footer = `<div class="doc-foot"><span>BROKERGY · Ingeniería Energética · www.brokergy.es</span><span>PAGE_X_OF_Y · Expte ${numExpte}</span></div>`;
        const obsBox = (inner, mt = '16px') => `
            <div style="margin-top:${mt};padding:14px 18px;background:#FBF6EE;border:1px solid #F1E4CF;border-radius:14px;font-size:10.5px;line-height:1.5;color:#6b5a3e;">
                <div style="font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;color:#B5730A;text-transform:uppercase;margin-bottom:6px;">Observaciones</div>
                ${inner}
            </div>`;
        const rowsBox = (inner) => `<div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">${inner}</div>`;
        const kv = (label, value, last = false) => `<div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${label}</div><div style="padding:7px 16px;font-weight:600;${last ? '' : 'border-bottom:1px solid #ECECE4;'}">${value}</div></div>`;
        // Tabla comparativa Existente/Nueva (calefacción, ACS, ventanas)
        const cmpHead = (col1 = 'Comparativa', ex = 'Existente', nu = 'Nueva') => `<thead><tr>
            <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">${col1}</th>
            <th style="text-align:left;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${ex}</th>
            <th style="text-align:left;padding:8px 16px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${nu}</th>
        </tr></thead>`;
        const cmpRow = (label, ex, nu) => `<tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">${label}</td><td style="padding:6px 16px;color:#7a7a72;">${ex}</td><td style="padding:6px 16px;background:#F3F8E6;font-weight:700;">${nu}</td></tr>`;
        const cmpGroup = (t) => `<tr><td colspan="3" style="padding:7px 16px;background:#EFEFE8;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">${t}</td></tr>`;
        const cmpBox = (headHtml, bodyRows) => `<div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;"><table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">${headHtml}<tbody>${bodyRows}</tbody></table></div>`;

        // PÁGINA 0: PORTADA (No se numera)
        pages.push(`
            <div class="doc-page" style="padding:0;display:block;background:#111110;overflow:hidden;">
                <img src="${APP_URL}/assets/pegatina-reforma.png" alt="Reforma" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(3px);transform:scale(1.06);">
                <div style="position:absolute;inset:0;background:linear-gradient(180deg, rgba(15,15,14,.72) 0%, rgba(15,15,14,.30) 34%, rgba(15,15,14,.55) 66%, rgba(12,12,11,.94) 100%);"></div>

                <div style="position:absolute;top:11mm;left:0;right:0;z-index:3;display:flex;justify-content:center;">
                    <div style="background:#fff;border-radius:22px;padding:14px 30px;box-shadow:0 10px 34px rgba(0,0,0,.34);position:relative;">
                        <div style="position:absolute;inset:-4px;border-radius:26px;background:linear-gradient(90deg,#F18A00,#B7C63A 55%,#93C01F);z-index:-1;"></div>
                        <img src="${APP_URL}/logo_brokergy_doc.png" alt="Brokergy" style="height:40px;display:block;">
                    </div>
                </div>

                <div style="position:absolute;top:96mm;left:0;right:0;z-index:3;padding:0 20mm;">
                    <div style="display:inline-flex;align-items:center;gap:9px;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.16);padding:6px 16px;border-radius:999px;margin-bottom:20px;">
                        <span style="width:8px;height:8px;border-radius:50%;background:#93C01F;"></span>
                        <span style="font-family:'Archivo';font-weight:700;font-size:12px;letter-spacing:4px;color:#fff;">CERTIFICADO CAE · RES080</span>
                    </div>
                    <h1 style="font-weight:900;font-size:74px;line-height:.92;letter-spacing:-1.5px;color:#fff;text-transform:uppercase;text-shadow:0 4px 26px rgba(0,0,0,.5);max-width:12ch;">Certificado <span style="color:#F18A00;">final</span> de <span style="color:#93C01F;">obra</span></h1>
                    <p style="font-family:'Archivo';font-weight:600;font-size:20px;color:#EDEDE8;margin:20px 0 0;max-width:24ch;text-shadow:0 2px 14px rgba(0,0,0,.6);">Rehabilitación profunda de edificios de viviendas</p>
                    <div style="display:flex;gap:10px;margin-top:22px;flex-wrap:wrap;">
                        <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:#fff;padding:6px 16px;border-radius:10px;">Expte: ${numExpte}</span>
                        <span style="font-family:'Archivo';font-weight:700;font-size:13px;letter-spacing:1px;color:#1A1A1A;background:linear-gradient(90deg,#F5A21E,#A9C63A);padding:6px 16px;border-radius:10px;">RES080 · Rehabilitación profunda</span>
                    </div>
                </div>

                <div style="position:absolute;bottom:0;left:0;right:0;z-index:3;">
                    <div style="padding:0 20mm 22px;">
                        <div style="display:inline-flex;align-items:center;gap:20px;background:rgba(12,12,11,.78);border:1px solid rgba(255,255,255,.14);border-radius:20px;padding:16px 26px;">
                            <div>
                                <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2.5px;color:#93C01F;text-transform:uppercase;">Ahorro anual certificado</div>
                                <div style="font-family:'Archivo';font-weight:900;font-size:40px;line-height:1;color:#fff;margin-top:4px;">${formatNum(aeTotal)} <span style="font-size:18px;font-weight:700;color:#F18A00;">kWh/año</span></div>
                            </div>
                            <div style="width:1px;height:44px;background:rgba(255,255,255,.2);"></div>
                            <div style="font-family:'Archivo';font-weight:800;font-size:26px;color:#fff;">${formatNum(aeTotal)} <span style="font-size:13px;font-weight:700;color:#B9B9B4;">CAEs</span></div>
                        </div>
                    </div>
                    <div style="background:#0C0C0B;padding:16px 20mm;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-top:3px solid;border-image:linear-gradient(90deg,#F18A00,#93C01F) 1;">
                        <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">BROKERGY <span style="color:#93C01F;font-weight:600;font-size:13px;">· Ingeniería Energética</span></div>
                        <div style="display:flex;gap:22px;font-size:12.5px;color:#EDEDE8;font-weight:500;">
                            <span><b style="color:#F18A00;">Tel</b>&nbsp; 623 926 179</span>
                            <span><b style="color:#F18A00;">Web</b>&nbsp; www.brokergy.es</span>
                            <span><b style="color:#F18A00;">Email</b>&nbsp; info@brokergy.es</span>
                        </div>
                    </div>
                </div>
            </div>
        `);

        // PÁGINA 1: DATOS GENERALES
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                <h2 style="font-weight:800;font-size:19px;letter-spacing:-.3px;margin:12px 0 3px;">Certificado de obra de rehabilitación energética</h2>
                <p style="margin:0;font-size:13px;color:#6E6E66;font-weight:500;">Ficha RES080 · Rehabilitación profunda de edificios de viviendas</p>

                ${sectionTitle('Identificación de la actuación de ahorro')}
                ${rowsBox(`
                    ${kv('Nombre de la actuación', eb('nombre_actuacion'))}
                    ${kv('Código y nombre de la ficha', 'RES080: Rehabilitación profunda de edificios de viviendas')}
                    ${kv('Comunidad autónoma', locCA)}
                    ${kv('Dirección postal', locDir)}
                    ${kv('Referencia catastral', locCat)}
                    ${kv('Coordenadas UTM', `X: ${utmX} · Y: ${utmY}`)}
                    ${kv('Breve descripción', eb('descripcion_actuacion'), true)}
                `)}

                ${sectionTitle('Propietario inicial del ahorro')}
                ${rowsBox(`
                    ${kv('Propietario / Razón social', clientFull)}
                    ${kv('Domicilio', clientDir)}
                    <div style="display:grid;grid-template-columns:34% 32% 34%;border-bottom:1px solid #ECECE4;">
                        <div style="padding:7px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">NIF / NIE</div>
                        <div style="padding:7px 16px;font-weight:600;">${cli.nif || cli.dni || '—'}</div>
                        <div style="padding:7px 16px;font-weight:600;"><span style="color:#6E6E66;">Tel&nbsp;</span>${cli.tlf || cli.telefono || '—'}</div>
                    </div>
                    ${kv('Correo electrónico', cli.email || '—', true)}
                `)}

                <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:13px;">
                    <div>
                        ${sectionTitle('Hitos', '0px')}
                        <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12.5px;">
                            <div style="display:grid;grid-template-columns:52% 48%;border-bottom:1px solid #ECECE4;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de inicio</div><div style="padding:6px 16px;font-weight:700;">${eb('fecha_inicio')}</div></div>
                            <div style="display:grid;grid-template-columns:52% 48%;"><div style="padding:6px 16px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Fecha de fin</div><div style="padding:6px 16px;font-weight:700;">${eb('fecha_fin')}</div></div>
                        </div>
                        <p style="margin:10px 2px 0;font-size:12px;color:#6E6E66;">En Tomelloso, a fecha de firma electrónica.</p>
                        <p style="margin:2px 2px 0;font-size:12.5px;color:#1A1A1A;font-weight:700;">Fdo.: ${ed('director_nombre')}</p>
                    </div>
                    <div>
                        ${sectionTitle('Director redactor', '0px')}
                        <div style="border:1px solid #E9E9E1;border-radius:16px;overflow:hidden;font-size:12px;">
                            <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Nombre</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_nombre')}</div></div>
                            <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Entidad</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_entidad')}</div></div>
                            <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;border-bottom:1px solid #ECECE4;">Titulación</div><div style="padding:9px 14px;font-weight:600;border-bottom:1px solid #ECECE4;">${eb('director_titulacion')}</div></div>
                            <div style="display:grid;grid-template-columns:34% 66%;"><div style="padding:9px 14px;background:#F7F7F1;color:#6E6E66;font-weight:600;">Contacto</div><div style="padding:9px 14px;font-weight:600;">${eb('director_email')} · ${eb('director_tlf')}</div></div>
                        </div>
                    </div>
                </div>

                ${sectionTitle('Cálculo del ahorro de energía final total')}
                <div style="border-radius:20px;background:linear-gradient(135deg,#1A1A1A,#242422);color:#fff;padding:15px 22px;overflow:hidden;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
                        <div>
                            <div style="font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:2px;color:#93C01F;text-transform:uppercase;">AE<sub>TOTAL</sub> = FP · (EF<sub>i</sub> − EF<sub>f</sub>)</div>
                            <div style="display:flex;gap:26px;margin-top:14px;">
                                <div><div style="font-size:11px;color:#B9B9B4;">Consumo inicial · EF<sub>i</sub></div><div style="font-family:'Archivo';font-weight:800;font-size:22px;">${formatNum(ef_i)} <span style="font-size:12px;font-weight:600;color:#B9B9B4;">kWh/año</span></div></div>
                                <div style="align-self:center;color:#F18A00;font-size:22px;font-weight:800;">→</div>
                                <div><div style="font-size:11px;color:#B9B9B4;">Consumo final · EF<sub>f</sub></div><div style="font-family:'Archivo';font-weight:800;font-size:22px;color:#93C01F;">${formatNum(ef_f)} <span style="font-size:12px;font-weight:600;color:#B9B9B4;">kWh/año</span></div></div>
                            </div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px;color:#B9B9B4;text-transform:uppercase;letter-spacing:1px;">Ahorro anual total</div>
                            <div style="font-family:'Archivo';font-weight:900;font-size:46px;line-height:1;color:#F18A00;">${formatNum(aeTotal)}</div>
                            <div style="font-size:13px;color:#fff;font-weight:600;">kWh/año</div>
                        </div>
                    </div>
                </div>
                ${footer}
            </div>
        `);

        // PÁGINA 2: INSTALACIÓN TÉRMICA
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Actuación sobre la instalación térmica', '20px')}
                <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_termica')}</p>

                ${subLabel('Instalación de calefacción')}
                ${cmpBox(cmpHead(), `
                    ${cmpRow('Tipo de equipo', calExTipoEq, 'Bomba de calor (aerotermia)')}
                    ${cmpRow('Marca', calExBrand, calNuBrand)}
                    ${cmpRow('Modelo', calExMod, calNuMod)}
                    ${cmpRow('Combustible', calExFuel, 'Electricidad')}
                    ${cmpRow('Nº serie unidad exterior', calExSerie, calNuSerieOut)}
                    ${cmpRow('SCOP / Rendimiento', 'Según CEE inicial <sup>(1)</sup>', `${calNuScop} <sup>(2)</sup>`)}
                `)}

                ${subLabel('Agua caliente sanitaria (ACS)', '#6E6E66', '20px')}
                ${acsSeActua
                    ? cmpBox(cmpHead(), `
                        ${cmpRow('Tipo de equipo', acsExTipoEq, 'Bomba de calor')}
                        ${cmpRow('Marca', acsExBrand, acsNuBrand)}
                        ${cmpRow('Modelo', acsExMod, acsNuMod)}
                        ${cmpRow('Combustible', acsExFuel, 'Electricidad')}
                        ${cmpRow('Nº serie equipo ACS', acsExSerie, acsNuSerie)}
                        ${cmpRow('SCOP / Rendimiento', 'Según CEE inicial <sup>(1)</sup>', `${acsNuScop} <sup>(3)</sup>`)}
                    `)
                    : `<div style="border:1px solid #E9E9E1;border-radius:16px;padding:28px;text-align:center;font-size:13px;color:#6E6E66;font-weight:700;">No se actúa sobre el ACS · No aplica</div>`}

                ${subLabel('Empresa instaladora', '#6E6E66', '20px')}
                ${rowsBox(`
                    ${kv('Nombre o razón social', eb('empresa_responsable'))}
                    ${kv('CIF / NIF', eb('empresa_cif'))}
                    ${kv('Domicilio', eb('empresa_domicilio'), true)}
                `)}

                ${obsBox(`
                    <p style="margin:0 0 5px;"><b>(1)</b> El rendimiento estacional de la caldera existente es el que consta en el Certificado de Eficiencia Energética Inicial, determinado por el programa oficial CE3X en función de su tipología, antigüedad y aislamiento.</p>
                    <p style="margin:0 0 5px;"><b>(2)</b> Según ficha técnica del fabricante y/o cálculos realizados según anexos III y IV de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</p>
                    ${acsSeActua ? `<p style="margin:0 0 5px;"><b>(3)</b> Según ficha técnica del fabricante y/o cálculos realizados según anexos III, V y VI de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</p>` : ''}
                    <p style="margin:0;">La duración indicativa de la actuación (Di) es de 15 años según Recomendación (UE) 2019/1658. Se adjuntan las fichas técnicas de los nuevos equipos instalados.</p>
                `)}
                ${footer}
            </div>
        `);

        // Celdas de tabla antes/después (cerramientos y huecos) — nuevo estilo
        const thDark = (t, align = 'left', w = '') => `<th style="text-align:${align};padding:6px 10px;background:#33332F;color:#fff;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:.5px;text-transform:uppercase;${w}">${t}</th>`;
        const thGreen = (t, align = 'left', w = '') => `<th style="text-align:${align};padding:6px 10px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:10px;letter-spacing:.5px;text-transform:uppercase;${w}">${t}</th>`;
        const tdC = (v, extra = '') => `<td style="padding:6px 10px;text-align:center;${extra}">${v}</td>`;
        const tdG = (v, extra = '') => `<td style="padding:6px 10px;text-align:center;background:#F8FBEF;${extra}">${v}</td>`;

        // PÁGINA 3: ENVOLVENTE TÉRMICA (OPACOS) - SÓLO SI SE ACTÚA
        if (env.actua_cerramientos === true) {
            pages.push(`
                <div class="doc-page">
                    ${pageHeader}
                    ${sectionTitle('Actuación sobre los cerramientos opacos', '20px')}
                    <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_envolvente')}</p>

                    ${subLabel('Datos del aislamiento térmico')}
                    <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:12.5px;">
                            <thead><tr>
                                <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:34%;">Elemento</th>
                                <th style="text-align:center;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Muros</th>
                                <th style="text-align:center;padding:8px 16px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Cubierta</th>
                            </tr></thead>
                            <tbody>
                                <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">¿Se añade aislamiento térmico?</td>${tdC(eb('aislamiento_muros_sn'), 'font-weight:700;')}${tdC(eb('aislamiento_cubierta_sn'), 'font-weight:700;')}</tr>
                                <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Tipo de aislamiento</td>${tdC(eb('aislamiento_muros_tipo'))}${tdC(eb('aislamiento_cubierta_tipo'))}</tr>
                                <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Material del aislamiento</td>${tdC(eb('aislamiento_muros_mat'))}${tdC(eb('aislamiento_cubierta_mat'))}</tr>
                                <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Espesor del aislamiento [cm]</td>${tdC(eb('aislamiento_muros_esp'))}${tdC(eb('aislamiento_cubierta_esp'))}</tr>
                                <tr><td style="padding:6px 16px;background:#FAFAF6;color:#4a4a44;font-weight:600;">Conductividad térmica λ [W/mK]</td>${tdC(eb('aislamiento_muros_cond'))}${tdC(eb('aislamiento_cubierta_cond'))}</tr>
                            </tbody>
                        </table>
                    </div>

                    ${subLabel('Cerramientos antes de la rehabilitación')}
                    <div style="border-radius:14px;overflow:hidden;border:1px solid #E9E9E1;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead><tr>${thDark('Cerramiento')}${thDark('Nombre')}${thDark('Orient.', 'center')}${thDark('U (W/m²K)', 'center')}${thDark('Sup. (m²)', 'center')}</tr></thead>
                            <tbody>
                                ${changedOpacos.map(o => `<tr><td style="padding:6px 10px;font-weight:600;">${o.initial?.tipo || '—'}</td><td style="padding:6px 10px;">${o.initial?.nombre || '—'}</td>${tdC(o.initial?.orientacion || '—')}${tdC(formatN(o.initial?.transmitancia), 'color:#c0392b;font-weight:700;')}${tdC(formatN(o.initial?.superficie))}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${subLabel('Cerramientos después de la rehabilitación', '#4d6a12', '16px')}
                    <div style="border-radius:14px;overflow:hidden;border:1px solid #D5E6A8;">
                        <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                            <thead><tr>${thGreen('Cerramiento')}${thGreen('Nombre')}${thGreen('Orient.', 'center')}${thGreen('U (W/m²K)', 'center')}${thGreen('Sup. (m²)', 'center')}</tr></thead>
                            <tbody>
                                ${changedOpacos.map(o => `<tr><td style="padding:6px 10px;font-weight:600;background:#F8FBEF;">${o.final?.tipo || '—'}</td><td style="padding:6px 10px;background:#F8FBEF;">${o.final?.nombre || '—'}</td>${tdG(o.final?.orientacion || '—')}${tdG(formatN(o.final?.transmitancia), 'color:#4d6a12;font-weight:800;')}${tdG(formatN(o.final?.superficie))}</tr>`).join('')}
                            </tbody>
                        </table>
                    </div>

                    ${obsBox(`<p style="margin:0;">${eb('envolvente_observaciones')}</p>`)}
                    ${footer}
                </div>
            `);
        }

        // PÁGINA 4: VENTANAS - SÓLO SI SE ACTÚA
        if (env.sustituye_ventanas === true) {
            pages.push(`
                <div class="doc-page">
                    ${pageHeader}
                    ${sectionTitle('Actuación sobre las ventanas', '20px')}
                    <p style="margin:0 0 6px 20px;font-size:12.5px;color:#4a4a44;">${eb('descripcion_ventanas')}</p>
                    <div style="display:flex;gap:10px;margin:12px 0 4px 20px;flex-wrap:wrap;">
                        <span style="display:inline-flex;align-items:center;gap:8px;background:#F3F8E6;border:1px solid #D5E6A8;border-radius:999px;padding:7px 15px;font-size:12px;font-weight:700;color:#4d6a12;">Se sustituyen las ventanas · ${seSustituyen ? 'SÍ' : 'NO'}</span>
                        <span style="display:inline-flex;align-items:center;gap:8px;background:#1A1A1A;border-radius:999px;padding:7px 15px;font-size:12px;font-weight:700;color:#fff;">Nº ventanas sustituidas · ${env.num_ventanas || changedHuecos.length}</span>
                    </div>
                    ${seSustituyen ? `
                        ${subLabel('Huecos antes de la rehabilitación')}
                        <div style="border-radius:14px;overflow:hidden;border:1px solid #E9E9E1;">
                            <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                                <thead><tr>${thDark('Cerramiento')}${thDark('Nombre')}${thDark('Orient.', 'center')}${thDark('U (W/m²K)', 'center')}${thDark('Sup. (m²)', 'center')}${thDark('F. solar', 'center')}${thDark('Perm.', 'center')}</tr></thead>
                                <tbody>
                                    ${changedHuecos.map(h => `<tr><td style="padding:6px 10px;font-weight:600;">Hueco</td><td style="padding:6px 10px;">${h.initial?.nombre || '—'}</td>${tdC(h.initial?.orientacion || '—')}${tdC(formatN(h.initial?.transmitancia), 'color:#c0392b;font-weight:700;')}${tdC(formatN(h.initial?.superficie))}${tdC(formatN(h.initial?.factorSolar))}${tdC('100', 'color:#c0392b;font-weight:700;')}</tr>`).join('')}
                                </tbody>
                            </table>
                        </div>

                        ${subLabel('Huecos después de la rehabilitación', '#4d6a12', '16px')}
                        <div style="border-radius:14px;overflow:hidden;border:1px solid #D5E6A8;">
                            <table class="cmp" style="width:100%;border-collapse:collapse;font-size:11px;">
                                <thead><tr>${thGreen('Cerramiento')}${thGreen('Nombre')}${thGreen('Orient.', 'center')}${thGreen('U (W/m²K)', 'center')}${thGreen('Sup. (m²)', 'center')}${thGreen('F. solar', 'center')}${thGreen('Perm.', 'center')}</tr></thead>
                                <tbody>
                                    ${changedHuecos.map(h => `<tr><td style="padding:6px 10px;font-weight:600;background:#F8FBEF;">Hueco</td><td style="padding:6px 10px;background:#F8FBEF;">${h.final?.nombre || '—'}</td>${tdG(h.final?.orientacion || '—')}${tdG(formatN(h.final?.transmitancia), 'color:#4d6a12;font-weight:800;')}${tdG(formatN(h.final?.superficie))}${tdG(formatN(h.final?.factorSolar))}${tdG('3', 'color:#4d6a12;font-weight:800;')}</tr>`).join('')}
                                </tbody>
                            </table>
                        </div>

                        ${subLabel('Características de las ventanas')}
                        ${cmpBox(cmpHead('Comparativa', 'Existentes', 'Nuevas'), `
                            ${cmpGroup('Marco')}
                            ${cmpRow('Material del marco', env.marco_existente_material || '—', eb('marco_nuevo_material'))}
                            ${cmpRow('Marca del marco', 'Desconocida', eb('marco_nuevo_marca'))}
                            ${cmpRow('Modelo del marco', 'Desconocida', eb('marco_nuevo_modelo'))}
                            ${cmpRow('Transmitancia del marco U<sub>f</sub> (W/m²K)', '—', eb('marco_nuevo_uf'))}
                            ${cmpGroup('Vidrio')}
                            ${cmpRow('Composición del cristal', env.cristal_existente_composicion || 'Desconocida', eb('cristal_nuevo_composicion'))}
                            ${cmpRow('Marca del cristal', 'Desconocida', eb('cristal_nuevo_marca'))}
                            ${cmpRow('Modelo del cristal', 'Desconocida', eb('cristal_nuevo_modelo'))}
                            ${cmpRow('Transmitancia del cristal U<sub>g</sub> (W/m²K)', '—', eb('cristal_nuevo_ug'))}
                            ${cmpRow('Factor solar (g)', '—', eb('cristal_nuevo_g'))}
                            ${cmpGroup('Conjunto')}
                            ${cmpRow('Permeabilidad al aire (m³/h·m²)', env.permeabilidad_existente ?? '—', eb('permeabilidad_nueva'))}
                        `)}
                    ` : `<div style="margin:40px 0;text-align:center;color:#9A9A92;">No hay sustitución de ventanas.</div>`}
                    ${obsBox(`<p style="margin:0;">La duración indicativa de la actuación (Di) es de 25 años según Recomendación (UE) 2019/1658. Se adjunta ficha técnica completa del marco y del cristal en anexos.</p>`, '14px')}
                    ${footer}
                </div>
            `);
        }

        // PÁGINA: JUSTIFICACIÓN DEL CÁLCULO DE AHORRO (solo si hay datos de results)
        if (results && results.details) {
            const d = results.details;
            const fN = (v, dec = 2) => v !== null && v !== undefined
                ? Number(v).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec })
                : '—';
            const fI = (v) => v !== null && v !== undefined
                ? Math.round(Number(v)).toLocaleString('es-ES')
                : '—';
            const aeTotal = results.ahorroEnergiaFinalTotal || 0;
            const aeMwh = (aeTotal / 1000).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const jCell = (v, final = false) => `<td style="padding:8px 12px;text-align:center;border-bottom:1px solid #ECECE4;${final ? 'background:#F3F8E6;font-weight:700;' : 'color:#7a7a72;'}">${v}</td>`;
            const jLabel = (t) => `<td style="padding:6px 16px;color:#4a4a44;border-bottom:1px solid #ECECE4;">${t}</td>`;
            const renderCategory = (label, data) => `
                <tr><td colspan="3" style="padding:7px 16px;background:#EFEFE8;font-family:'Archivo';font-weight:700;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:#6E6E66;">${label}</td></tr>
                <tr>${jLabel('Tipo de combustible')}${jCell(data.fuelIni || '—')}${jCell(data.fuelFin || '—', true)}</tr>
                <tr>${jLabel('Factor de paso')}${jCell(fN(data.factorIni, 3))}${jCell(fN(data.factorFin, 3), true)}</tr>
                <tr>${jLabel('Emisiones CO₂ (kgCO₂/m²·año)')}${jCell(fN(data.emissionsIni))}${jCell(fN(data.emissionsFin), true)}</tr>
                <tr>${jLabel('Consumo energía final (kWh/m²·año)')}${jCell(fN(data.energyIni))}${jCell(fN(data.energyFin), true)}</tr>`;

            pages.push(`
                <div class="doc-page">
                    ${pageHeader}
                    ${sectionTitle('Justificación del cálculo de ahorro inicial y final', '20px')}
                    <div style="border-radius:16px;overflow:hidden;border:1px solid #E9E9E1;">
                        <table class="just" style="width:100%;border-collapse:collapse;font-size:12px;">
                            <thead><tr>
                                <th style="text-align:left;padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;font-size:11px;letter-spacing:1px;text-transform:uppercase;width:52%;">Parámetro energético</th>
                                <th style="text-align:center;padding:8px 12px;background:#33332F;color:#C9C9C4;font-family:'Archivo';font-weight:700;font-size:11px;text-transform:uppercase;">Inicial</th>
                                <th style="text-align:center;padding:8px 12px;background:#93C01F;color:#1A1A1A;font-family:'Archivo';font-weight:800;font-size:11px;text-transform:uppercase;">Final</th>
                            </tr></thead>
                            <tbody>
                                ${d.acs ? renderCategory('Agua caliente sanitaria (ACS)', d.acs) : ''}
                                ${d.cal ? renderCategory('Calefacción', d.cal) : ''}
                                ${d.ref ? renderCategory('Refrigeración', d.ref) : ''}
                                <tr><td style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;">Consumo total de energía final (kWh/m²·año)</td><td style="padding:8px 12px;text-align:center;background:#1A1A1A;color:#C9C9C4;font-weight:700;">${fN(results.totalEnergiaInicialM2)}</td><td style="padding:8px 12px;text-align:center;background:#0f0f0e;color:#93C01F;font-family:'Archivo';font-weight:800;">${fN(results.totalEnergiaFinalM2)}</td></tr>
                                <tr><td style="padding:8px 16px;background:#1A1A1A;color:#fff;font-family:'Archivo';font-weight:700;border-top:1px solid #333;">Consumo total de energía final (kWh/año)</td><td style="padding:8px 12px;text-align:center;background:#1A1A1A;color:#C9C9C4;font-weight:700;border-top:1px solid #333;">${fI(results.totalEnergiaInicialAno)}</td><td style="padding:8px 12px;text-align:center;background:#0f0f0e;color:#93C01F;font-family:'Archivo';font-weight:800;border-top:1px solid #333;">${fI(results.totalEnergiaFinalAno)}</td></tr>
                            </tbody>
                        </table>
                    </div>

                    <div style="margin-top:16px;border-radius:20px;background:linear-gradient(120deg,#F18A00,#A9C63A);padding:3px;">
                        <div style="border-radius:17px;background:#fff;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                            <div style="font-family:'Archivo';font-weight:800;font-size:15px;letter-spacing:.3px;text-transform:uppercase;color:#1A1A1A;">Ahorro de energía final</div>
                            <div style="font-family:'Archivo';font-weight:900;font-size:40px;line-height:1;color:#1A1A1A;">${aeMwh} <span style="font-size:16px;color:#B5730A;">MWh/año</span></div>
                        </div>
                    </div>
                    <p style="margin:12px 2px 0;font-size:11px;color:#6E6E66;">Este desglose corresponde a la comparativa técnica entre los certificados energéticos (XML) aportados para la situación inicial y la propuesta de reforma.</p>
                    ${footer}
                </div>
            `);
        }

        // PÁGINA: JUSTIFICACIÓN DEL SCOP (calefacción + ACS) — igual que RES060 (restyled)
        // Se conserva la justificación legal completa (Anexo IV/VI RES060, EPREL) con el
        // nuevo lenguaje visual: tarjeta redondeada, cabecera oscura, banner de fórmula
        // (#FBF6EE) y fila de resultado resaltada en verde.
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
        const renderEprelJustification = (isAcs = false) => {
            const label = isAcs ? 'ACS' : 'Calefacción';
            const etaVar = isAcs ? 'η<sub>wh</sub>' : 'η<sub>s,h</sub>';
            const scopRaw = isAcs ? scopAcsRaw : scopCalRaw;
            const scopStr = isAcs ? scopAcsStr : scopCalStr;
            const etaValue = Math.round((scopRaw * 40) - 3);
            const totalPercentage = (scopRaw * 100).toFixed(0);
            const eprelUrl = isAcs ? inst.aerotermia_acs?.url_eprel : inst.aerotermia_cal?.url_eprel;
            // El hipervínculo va embebido en el texto "Ficha EPREL" (sin fila aparte,
            // que desbordaba la página al sumar un <li> extra).
            const fichaEprel = eprelUrl
                ? `<a href="${eprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                : 'Ficha EPREL';
            // Justificación compacta en tabla (solo método EPREL): mantiene fórmula,
            // definición de variables, valores, cálculo y resultado, ocupando ~1/4 de
            // página para que ambas secciones SCOP quepan juntas sin salto de página.
            return scopBox(
                `Justificación del SCOP en ${label} — Anexo IV ficha RES060`,
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
            const acsEprelUrl = sameAero ? inst.aerotermia_cal?.url_eprel : inst.aerotermia_acs?.url_eprel;
            const acsFtUrl    = sameAero ? inst.aerotermia_cal?.url_ficha  : inst.aerotermia_acs?.url_ficha;

            if (metodoAcs === 'conjunto') {
                // Anexo IV RES060: SCOPdhw = CC × ηwh = 2,5 × (eta_acs / 100)
                const etaWh = (scopAcsRaw / 2.5 * 100).toFixed(1).replace('.', ',');
                const fichaEprel = acsEprelUrl
                    ? `<a href="${acsEprelUrl}" style="color: #0000EE; text-decoration: underline;">Ficha EPREL</a>`
                    : 'Ficha EPREL';
                return scopBox(
                    'Justificación del SCOP en ACS — Anexo IV ficha RES060 (depósito ACS en conjunto con la BdC)',
                    `SCOP<sub>dhw</sub> = CC · η<sub>wh</sub>`,
                    `${svRow('CC', 'Coeficiente de conversión', '2,5')}
                     ${svRow('η<sub>wh</sub>', `Eficiencia energética de caldeo de agua (obtenida de la ${fichaEprel} — clima ${zoneLabel.toLowerCase()} y perfil ACS)`, `${etaWh}%`)}
                     ${scopResult(`Cálculo: SCOP<sub>dhw</sub> = 2,5 · ${etaWh}% &nbsp;→&nbsp; SCOP en ACS`, scopAcsStr)}`
                );
            }

            if (metodoAcs === 'independiente') {
                // Anexo VI RES060 Caso 3: SCOPdhw = COP × Fc(zona)
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

            // Ficha técnica (default + legacy 'eprel')
            return scopCallout(`SCOP en ACS = ${scopAcsStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`);
        };

        // SCOP calefacción + SCOP ACS en una sola página: con las justificaciones EPREL
        // en formato tabla compacta ambas caben en un A4 sin necesidad de salto.
        const scopCond = (label, value) => `<div style="display:flex;justify-content:space-between;border-bottom:1px dashed #E4E4DC;padding-bottom:8px;"><span style="color:#6E6E66;">${label}</span><span style="font-weight:700;">${value}</span></div>`;
        pages.push(`
            <div class="doc-page">
                ${pageHeader}
                ${sectionTitle('Anexos · Rendimiento estacional (SCOP)', '20px')}

                ${subLabel('SCOP de la bomba de calor en calefacción', '#6E6E66', '4px')}
                <div style="border:1px solid #E9E9E1;border-radius:16px;padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:10px 24px;font-size:12.5px;">
                    ${scopCond('Ubicación de la instalación', `Zona climática ${zoneStr} (DB-HE CTE)`)}
                    ${scopCond('Condiciones en calefacción', zoneLabel)}
                    ${scopCond('Tipo de bomba de calor', 'Aerotérmica')}
                    ${scopCond('Sistema de distribución', emiLabel)}
                </div>
                ${metodoCal === 'eprel'
                    ? renderEprelJustification(false)
                    : scopCallout(`SCOP en Calefacción = ${scopCalStr}. Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.`)
                }

                ${subLabel('SCOP de la bomba de calor para ACS (agua caliente sanitaria)', '#6E6E66', '20px')}
                ${tieneAcs ? renderAcsScopJustification() : scopCallout('SCOP en ACS = no aplica.')}
                ${footer}
            </div>
        `);

        // SEPARADOR ANEXOS — solo si hay al menos un anexo en Drive. Lista los
        // ficheros que se concatenarán al PDF (las páginas reales las añade
        // pdf-lib en backend con annexDriveFileIds, escaladas a A4). En el preview
        // del modal añadimos imágenes rasterizadas (withAnnexPreview) para ver todo.
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
                    <div style="margin-top:22px;background:linear-gradient(120deg,#1A1A1A,#242422);border-radius:20px;padding:20px 24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
                        <div>
                            <div style="font-family:'Archivo';font-weight:800;font-size:16px;color:#fff;">BROKERGY <span style="color:#93C01F;font-weight:600;font-size:13px;">· Ingeniería Energética</span></div>
                            <div style="font-size:12px;color:#B9B9B4;margin-top:4px;">Tel 623 926 179 · www.brokergy.es · info@brokergy.es</div>
                        </div>
                        <img src="${APP_URL}/logo-brokergy-circular.png" alt="Brokergy" style="height:56px;">
                    </div>
                    ${footer}
                </div>
            `);

            if (withAnnexPreview) {
                annexList.forEach(a => {
                    (a.file.previewPages || []).forEach(src => {
                        pages.push(`
                            <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                                <img src="${src}" style="width: 100%; height: 100%; object-fit: contain;">
                            </div>
                        `);
                    });
                });
            }
        }

        // NUMERACIÓN DINÁMICA (la portada no se cuenta)
        const total = pages.length - 1;
        return pages.map((p, idx) => {
            if (idx === 0) return p;
            return p.replace(/PAGE_X_OF_Y/g, `Página ${idx} | ${total}`);
        }).join('');
    };

    const buildFullHtml = (isForPdf = false) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${isForPdf ? PDF_CSS : DOC_CSS}</style></head><body><div class="${isForPdf ? '' : 'doc-wrap'}">${generateHtml(isForPdf)}</div></body></html>`;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildFullHtml(true), annexDriveFileIds: getAnnexDriveFileIds() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = `${numExpte} - Certificado_Reforma_RES080.pdf`; a.click();
        } catch (error) { console.error('Error PDF:', error); alert('Error al generar el PDF.'); } finally { setGenerating(false); }
    };

    // ── FIRMA CON CERTIFICADO (Autofirma, recuadro arrastrable) ───────────────
    // 1) genera el PDF oficial (mismo que "Descargar"), 2) abre el modal de firma
    // donde el usuario arrastra el recuadro y firma con su certificado.
    const handleFirmar = async () => {
        setSignBusy(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildFullHtml(true), annexDriveFileIds: getAnnexDriveFileIds() });
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch (error) {
            console.error('Error generando PDF para firmar:', error);
            alert('No se pudo generar el PDF para firmar.');
        } finally { setSignBusy(false); }
    };

    // Recibe el PDF ya firmado (base64) desde Autofirma → lo sube a Drive y marca firmado.
    const handleSigned = async (signedB64) => {
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/firmar-subir`, {
                field: 'cert_cifo_signed_link',
                signedPdfBase64: signedB64,
                fileName: `${numExpte} - Certificado Reforma RES080_fdo`,
                subfolderName: '6. ANEXOS CAE',
            });
            setSignOpen(false);
            setSignPdfB64(null);
            if (data?.signed_link) {
                if (onSaveSignedLink) onSaveSignedLink(data.signed_link);
                try { confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } }); } catch (e) { console.debug('confetti', e); }
                alert('✅ Certificado firmado y guardado en Drive');
            }
        } catch (error) {
            console.error('Error subiendo PDF firmado:', error);
            alert('El documento se firmó, pero no se pudo guardar en Drive: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive.'); return; }
        setSavingDrive(true);
        try {
            const { data } = await axios.post('/api/pdf/save-to-drive', { html: buildFullHtml(true), folderId, fileName: `${numExpte} - Certificado Reforma RES080`, subfolderName: '6. ANEXOS CAE', annexDriveFileIds: getAnnexDriveFileIds() });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                alert('✅ Guardado en Drive');
            }
        } catch (error) { console.error('Error Drive:', error); alert('Error al guardar en Drive.'); } finally { setSavingDrive(false); }
    };

    // ── ENTREGA AL CLIENTE (contacto + canal Email/WhatsApp) ──────────────────
    // El RES080 lo firma Brokergy, así que se entrega ya firmado al cliente.
    // Contactos disponibles: el propietario (cliente) + un contacto manual.
    const clientContacts = [];
    {
        const cPhone = cli.tlf || cli.telefono || '';
        const cEmail = cli.email || '';
        if (cPhone || cEmail || clientFull) {
            clientContacts.push({ id: 'cliente', label: clientFull || 'Cliente', sublabel: 'Propietario', phone: cPhone, email: cEmail });
        }
    }

    const resolveContact = (id) => {
        if (id === 'otro') return { id: 'otro', label: (manualContact.name || '').trim() || 'Otro contacto', phone: (manualContact.phone || '').trim(), email: (manualContact.email || '').trim() };
        return clientContacts.find(c => c.id === id) || clientContacts[0] || { id: 'cliente', label: clientFull, phone: cli.tlf || cli.telefono || '', email: cli.email || '' };
    };
    const selectedContact = resolveContact(selectedContactId);

    const buildDeliveryMessage = (contactName) => {
        const firstName = (contactName || '').trim().split(/\s+/)[0] || 'hola';
        return `Hola ${firstName},\n\nTe adjuntamos el *Certificado Final de Obra (RES080)* correspondiente a tu expediente *${numExpte}*, ya firmado.\n\nEs el documento que acredita la actuación de rehabilitación energética realizada en tu vivienda.\n\nCualquier duda, quedamos a tu disposición.\n\nUn saludo,\n*BROKERGY · Ingeniería Energética*`;
    };

    const openSendModal = async () => {
        const defaultId = clientContacts[0]?.id || 'otro';
        const initContact = resolveContact(defaultId);
        setSelectedContactId(defaultId);
        setSendMessage(buildDeliveryMessage(initContact.label));
        setChannels({
            email: !!initContact.email,
            whatsapp: (initContact.phone || '').replace(/[^0-9]/g, '').length >= 9,
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

    const pickContact = (id) => {
        setSelectedContactId(id);
        setSendMessage(buildDeliveryMessage(resolveContact(id).label));
    };

    const toggleChannel = (ch) => setChannels(prev => ({ ...prev, [ch]: !prev[ch] }));

    const contactPhoneValid = (selectedContact.phone || '').replace(/[^0-9]/g, '').length >= 9;
    const canEmail = !!selectedContact.email;
    const canWhatsapp = contactPhoneValid && waReady !== false;
    const willEmail = channels.email && canEmail;
    const willWhatsapp = channels.whatsapp && canWhatsapp;
    const sending = sendingEmail || sendingWhatsapp;

    // Envíos individuales (devuelven { ok, text } y NO tocan el status global).
    const sendEmailOnce = async () => {
        const c = selectedContact;
        // Reutilizamos /send-cifo (concatena anexos y respeta el mensaje editable,
        // sin enlace de subida y SIN efectos sobre la oportunidad).
        const { data } = await axios.post('/api/pdf/send-cifo', {
            html: buildFullHtml(true),
            to: c.email,
            subject: `${numExpte} - Certificado Final de Obra RES080 de ${clientFull}`,
            message: sendMessage,
            instaladorNombre: c.label,
            numExpediente: numExpte,
            clienteNombre: clientFull,
            annexDriveFileIds: getAnnexDriveFileIds(),
        });
        if (data.success) return { ok: true, text: `Email → ${c.email}` };
        return { ok: false, text: 'Email no enviado' };
    };

    const sendWhatsappOnce = async () => {
        const c = selectedContact;
        const st = await axios.get('/api/whatsapp/status');
        if (!st.data?.ready) { setWaReady(false); return { ok: false, text: 'WhatsApp no conectado' }; }
        const pdfResp = await axios.post('/api/pdf/generate', { html: buildFullHtml(true), annexDriveFileIds: getAnnexDriveFileIds() });
        await axios.post('/api/whatsapp/send-media', {
            phone: c.phone,
            caption: sendMessage,
            media: { base64: pdfResp.data?.pdf, filename: `${numExpte}_Certificado_RES080.pdf`, mimetype: 'application/pdf' },
            asDocument: true,
        });
        return { ok: true, text: `WhatsApp → ${c.phone}` };
    };

    const fireSuccessConfetti = () => {
        if (typeof window === 'undefined') return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const scalar = 3.6;
        let shapes;
        try {
            shapes = ['📄', '📃', '📑', '📋'].map(text => confetti.shapeFromText({ text, scalar }));
        } catch { shapes = undefined; }
        const burst = (x, delay = 0) => setTimeout(() => {
            confetti({
                particleCount: 22, spread: 65, startVelocity: 34, gravity: 0.8, decay: 0.92, ticks: 220, scalar,
                origin: { x, y: 0.5 }, zIndex: 10000, disableForReducedMotion: true,
                ...(shapes ? { shapes, flat: true } : { colors: ['#f2a640', '#34d399', '#fcd34d', '#ffffff'] }),
            });
        }, delay);
        burst(0.2, 0); burst(0.8, 140); burst(0.5, 300);
    };

    const exitToExpediente = () => {
        setSendPhase(null);
        setSendOpen(false);
        if (onClose) onClose();
    };

    const doSend = async () => {
        const doEmail = willEmail;
        const doWa = willWhatsapp;
        if (!doEmail && !doWa) { setSendStatus({ ok: false, text: 'Selecciona al menos un canal disponible.' }); return; }
        setSendStatus(null);
        setSendResults([]);
        setSendPhase('sending');
        const results = [];

        if (doEmail) {
            setSendingEmail(true);
            try { const r = await sendEmailOnce(); results.push({ channel: 'email', status: r.ok ? 'ok' : 'fail', text: r.text }); }
            catch (e) { results.push({ channel: 'email', status: 'fail', text: 'Email: ' + (e.response?.data?.message || e.message) }); }
            finally { setSendingEmail(false); }
        } else if (channels.email) {
            results.push({ channel: 'email', status: 'unavailable', text: 'No disponible — sin dirección de correo' });
        }
        if (doWa) {
            setSendingWhatsapp(true);
            try { const r = await sendWhatsappOnce(); results.push({ channel: 'whatsapp', status: r.ok ? 'ok' : 'fail', text: r.text }); }
            catch (e) { results.push({ channel: 'whatsapp', status: 'fail', text: 'WhatsApp: ' + (e.response?.data?.message || e.message) }); }
            finally { setSendingWhatsapp(false); }
        } else if (channels.whatsapp) {
            results.push({ channel: 'whatsapp', status: 'unavailable', text: !contactPhoneValid ? 'No disponible — sin teléfono' : 'No disponible — WhatsApp no conectado' });
        }

        // Si llegó al cliente por al menos un canal, registramos la fecha de envío.
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

    // Anexos en Drive: IDs a concatenar al PDF principal, en orden de attachments.
    const getAnnexDriveFileIds = () => {
        return attachments
            .filter(a => a.file?.driveId && (a.id !== 'aerotermia_acs' || tieneAcs))
            .map(a => a.file.driveId);
    };

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

    // Documentación de eficiencia (EPREL/KEYMARK): el modelo solo guarda el enlace
    // web (no PDF), así que se ofrecen huecos de subida manual con el enlace oficial
    // del modelo como ayuda. Al subir se guardan como anexos extra etiquetados y se
    // concatenan al PDF como cualquier otra ficha.
    const EPREL_LABEL = 'Ficha EPREL';
    const KEYMARK_LABEL = 'Certificado KEYMARK';
    const isHttpUrl = (u) => /^https?:\/\//i.test((u || '').trim());
    const eficienciaDocs = [
        { kind: 'eprel',   label: EPREL_LABEL,   url: inst.aerotermia_cal?.url_eprel,   openText: 'Abrir ficha EPREL oficial' },
        { kind: 'keymark', label: KEYMARK_LABEL, url: inst.aerotermia_cal?.url_keymark, openText: 'Abrir certificado KEYMARK' },
    ];

    const AnexosModal = () => (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
            <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
                 onClick={e => e.stopPropagation()}>
                <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        </div>
                        <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Gestión de Anexos {(numExpte.match(/RES\d+/) || [])[0] || 'RES080'}</h3>
                    </div>
                    <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>

                <div className="p-8 grid gap-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                    <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-2">Las fichas técnicas se concatenan al PDF automáticamente desde Drive</p>

                    {attachments.map((item, idx) => {
                        if (item.id === 'aerotermia_acs' && !tieneAcs) return null;
                        // EPREL/KEYMARK se muestran en su propio bloque, no aquí.
                        if (item.isExtra && (item.label === EPREL_LABEL || item.label === KEYMARK_LABEL)) return null;
                        const type = item.id === 'aerotermia_cal' ? 'cal' : item.id === 'aerotermia_acs' ? 'acs' : null;
                        const isLoading = type && loadingFichas[type];
                        const isResyncing = type && resyncingType === type;
                        const badge = item.file ? sourceBadge(item.file.source) : null;
                        return (
                            <div key={item.id}
                                 draggable={!isLoading && !isResyncing}
                                 onDragStart={() => setDraggedIndex(idx)}
                                 onDragEnd={() => setDraggedIndex(null)}
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

                    {/* EPREL / KEYMARK — huecos de subida manual con el enlace del modelo */}
                    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                        <div className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Documentación de eficiencia (EPREL / KEYMARK)</div>
                        <p className="text-[10px] text-white/25 mb-3">Si el SCOP se justifica por EPREL, adjunta aquí la ficha EPREL y/o el KEYMARK: abre el enlace oficial, descarga el PDF y súbelo. Se concatenan al certificado.</p>
                        {eficienciaDocs.map(row => {
                            const idx = attachments.findIndex(a => a.isExtra && a.label === row.label);
                            const annex = idx >= 0 ? attachments[idx] : null;
                            return (
                                <div key={row.kind} className="flex items-center justify-between gap-3 py-2.5 border-t border-white/5 first:border-t-0">
                                    <div className="min-w-0">
                                        <div className="text-[11px] font-black uppercase tracking-wider text-white/80">{row.label}</div>
                                        {annex ? (
                                            <a href={annex.file.link} target="_blank" rel="noreferrer" className="text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 truncate hover:text-emerald-300 transition-colors">
                                                <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                                <span className="truncate">{annex.file.name}</span>
                                            </a>
                                        ) : isHttpUrl(row.url) ? (
                                            <a href={row.url} target="_blank" rel="noreferrer" className="text-[10px] text-brand font-bold hover:text-brand/70 inline-flex items-center gap-1 transition-colors">{row.openText} ↗</a>
                                        ) : (
                                            <span className="text-[10px] text-white/20 italic">Sin enlace en el modelo — sube el PDF manualmente</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        {annex ? (
                                            <button onClick={() => removeAttachment(idx)} title="Eliminar del Drive" className="p-2.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                        ) : (
                                            <label className={`p-2.5 bg-white/5 text-white/40 border border-white/10 rounded-xl cursor-pointer hover:bg-brand hover:text-black hover:border-brand transition-all shadow-xl ${uploadingExtra ? 'opacity-40 pointer-events-none' : ''}`}>
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                                <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => { const f = e.target.files[0]; if (f) handleManualExtraUpload(f, row.label); }} />
                                            </label>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

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
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">{uploadingExtra ? 'Subiendo…' : 'Suelta un PDF o imagen aquí para anexarlo'}</p>
                        </div>

                        <button
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.pdf,.jpg,.jpeg,.png';
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

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Certificado RES080</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numExpte}</p>
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
                            title="Enviar al cliente"
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

                        <button onClick={handleFirmar} disabled={signBusy || generating || savingDrive || sendingEmail || sendingWhatsapp}
                                title="Firmar con certificado electrónico (Autofirma)"
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-xs font-bold hover:text-brand hover:border-brand/30 transition-all disabled:opacity-30">
                            {signBusy ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
                            {signBusy ? 'Preparando...' : 'Firmar'}
                        </button>

                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp}
                                className="flex items-center gap-2 px-5 py-2 bg-brand text-black text-xs font-black rounded-xl uppercase tracking-wider hover:brightness-110 active:scale-95 transition-all disabled:opacity-30">
                            {generating ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            {generating ? 'Generando...' : 'Descargar PDF'}
                        </button>
                    </div>
                </div>

                {/* ── MODAL FIRMA CON CERTIFICADO (Autofirma, recuadro arrastrable) ── */}
                {signOpen && signPdfB64 && (
                    <FirmarConCertificadoModal
                        pdfBase64={signPdfB64}
                        title={`Firmar Certificado RES080 · ${numExpte}`}
                        initialPage={2}
                        signatureAnchor={['a fecha de firma electrónica', 'fdo.']}
                        onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                        onSigned={handleSigned}
                    />
                )}
                
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center custom-scrollbar">
                    <div className="inline-block text-left"
                         style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
                         onBlur={handleContentBlur}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
                        <div dangerouslySetInnerHTML={{ __html: generateHtml(false, true) }} />
                    </div>
                </div>

                {/* ── MODAL ENVÍO AL CLIENTE (contacto + mensaje + canal) ── */}
                {sendOpen && (
                    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setSendOpen(false)}>
                        <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="px-6 py-5 border-b border-white/[0.07] bg-brand/5 flex items-center justify-between">
                                <div>
                                    <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar Certificado RES080 al cliente</h2>
                                    <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">Certificado final · {numExpte}</p>
                                </div>
                                <button onClick={() => setSendOpen(false)} className="text-white/30 hover:text-white transition-colors">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>

                            <div className="px-6 py-5 space-y-5 max-h-[74vh] overflow-y-auto custom-scrollbar">
                                {/* Destinatario */}
                                <div>
                                    <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Destinatario</label>
                                    <div className="space-y-2">
                                        {clientContacts.map(c => (
                                            <button key={c.id} type="button" onClick={() => pickContact(c.id)}
                                                className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedContactId === c.id ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                                <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${selectedContactId === c.id ? 'border-brand bg-brand' : 'border-white/20'}`} />
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
                                        ))}
                                        {/* Otro contacto manual */}
                                        <button type="button" onClick={() => pickContact('otro')}
                                            className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedContactId === 'otro' ? 'border-brand/50 bg-brand/5' : 'border-white/10 bg-white/[0.02] hover:border-white/20'}`}>
                                            <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${selectedContactId === 'otro' ? 'border-brand bg-brand' : 'border-white/20'}`} />
                                            <span className="text-sm font-bold text-white">Otro contacto…</span>
                                        </button>
                                        {selectedContactId === 'otro' && (
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-7">
                                                <input value={manualContact.name} onChange={e => { const v = e.target.value; setManualContact(m => ({ ...m, name: v })); setSendMessage(buildDeliveryMessage(v)); }} placeholder="Nombre" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                                <input value={manualContact.phone} onChange={e => setManualContact(m => ({ ...m, phone: e.target.value }))} placeholder="Teléfono" className="w-full min-w-0 bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                                <input type="email" value={manualContact.email} onChange={e => setManualContact(m => ({ ...m, email: e.target.value }))} placeholder="Email" className="w-full min-w-0 no-uppercase bg-bkg-elevated border border-white/5 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-brand/40 transition-all" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Mensaje */}
                                <div>
                                    <label className="block text-[9px] font-black text-white/30 uppercase tracking-[0.2em] mb-2">Mensaje (email / WhatsApp)</label>
                                    <textarea
                                        value={sendMessage}
                                        onChange={e => setSendMessage(e.target.value)}
                                        rows={9}
                                        className="w-full no-uppercase bg-bkg-elevated border border-white/5 rounded-xl px-4 py-3 text-white text-[12px] leading-relaxed focus:outline-none focus:border-brand/40 transition-all resize-y"
                                    />
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
                                                <div className="text-[10px] text-white/40 truncate">{selectedContact.email || 'sin email'}</div>
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
                                                <div className="text-[10px] text-white/40 truncate">{!contactPhoneValid ? 'sin teléfono' : (waReady === false ? 'no conectado' : selectedContact.phone)}</div>
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

                {/* ── OVERLAY DE ENVÍO: enviando → enviado, estado por canal ── */}
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">Enviando certificado…</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numExpte}</p>
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
                                            <h3 className="text-xl font-black uppercase tracking-tight text-white">{allGood ? '¡Certificado enviado!' : anyOk ? 'Enviado parcialmente' : 'No se pudo enviar'}</h3>
                                            <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">{numExpte}</p>
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
            {isAnexosOpen && <AnexosModal />}
        </div>
    );
};
