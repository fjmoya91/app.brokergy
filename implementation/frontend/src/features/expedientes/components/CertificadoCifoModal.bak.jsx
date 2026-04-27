import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';

const EMITTER_OPTIONS = [
    { value: 'suelo_radiante',          label: 'Suelo Radiante (35°C)',           temp: 35 },
    { value: 'radiadores_baja_temp',    label: 'Radiadores Baja Temperatura (45°C)', temp: 45 },
    { value: 'radiadores_convencionales', label: 'Radiadores Convencionales (55°C)', temp: 55 },
];

const PAGE_PADDING = '93px 95px 19px 113px';

const DOC_CSS = `
    .doc-wrap { background: #e8e8e8; width: 794px; }
    .doc-page {
        font-family: 'Arial MT', Arial, Helvetica, sans-serif;
        font-size: 11pt;
        color: #000;
        background: white;
        width: 794px;
        min-height: 1123px;
        padding: ${PAGE_PADDING};
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin-bottom: 12px;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
    }
    .doc-page:last-child { page-break-after: avoid; }
    .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 20px;
        font-size: 10pt;
        table-layout: fixed;
    }
    .doc-table td, .doc-table th {
        border: 1px solid #000;
        padding: 4px 6px;
        vertical-align: middle;
        line-height: 1.3;
        word-wrap: break-word;
    }
    .doc-table th {
        font-weight: bold;
        text-align: left;
    }
    .lbl { background-color: #f2a640; color: #fff; font-weight: bold; }
    .heading { background-color: #000; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 10pt; padding: 4px; }
    .subheading { font-weight: bold; font-size: 12pt; text-align: center; text-decoration: underline; margin-bottom: 16px; margin-top: 10px; }
    .section-title { font-weight: bold; margin-bottom: 6px; margin-top: 16px; font-size: 11pt; }
    .doc-p { margin-bottom: 8px; line-height: 1.4; text-align: justify; }
    ul { margin: 0 0 10px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    .formula { margin: 10px 0 10px 20px; font-size: 11pt; }
`;

const PDF_CSS = `
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
    .doc-page {
        font-family: 'Arial MT', Arial, sans-serif;
        font-size: 10.5pt;
        color: #1a1a1a;
        width: 210mm;
        min-height: 297mm;
        padding: 50px 70px;
        box-sizing: border-box;
        page-break-after: always;
        position: relative;
        overflow: hidden;
    }
    .doc-page:last-child { page-break-after: avoid; }
    
    .subheading { 
        font-weight: bold; 
        font-size: 14pt; 
        text-align: center; 
        text-decoration: underline; 
        margin-bottom: 24px; 
        text-transform: uppercase;
        color: #000;
    }
    
    .doc-table { 
        width: 100%; 
        border-collapse: collapse; 
        margin-bottom: 18px; 
        table-layout: fixed;
    }
    .doc-table td, .doc-table th { 
        border: 1px solid #000; 
        padding: 6px 8px; 
        vertical-align: middle; 
        word-wrap: break-word;
    }
    .heading { 
        background-color: #000; 
        color: #fff; 
        font-weight: bold; 
        text-align: center; 
        text-transform: uppercase; 
        font-size: 9.5pt; 
        letter-spacing: 0.5px;
        padding: 6px 8px;
    }
    .doc-table .lbl { 
        background-color: #ee8f1f; 
        color: #fff; 
        font-weight: bold; 
        font-size: 9.5pt;
    }
    
    .section-title { 
        font-weight: bold; 
        margin-top: 14px; 
        margin-bottom: 8px; 
        font-size: 11pt; 
        text-transform: uppercase;
        border-bottom: 1px solid #eee;
        padding-bottom: 4px;
    }
    .doc-p { 
        margin-bottom: 6px; 
        line-height: 1.45; 
        text-align: justify; 
    }
    ul { margin: 0 0 10px 20px; padding: 0; }
    li { margin-bottom: 4px; }
    
    .var-table th {
        background: #ee8f1f;
        color: white;
        font-size: 9pt;
        text-align: center;
        padding: 4px 2px;
    }
    .var-table td {
        text-align: center;
        font-size: 10pt;
    }
    .donde-table td {
        border: none;
        padding: 4px 8px;
        font-size: 9.5pt;
        vertical-align: top;
    }
`;

function formatDateSpanish(isoStr) {
    if (!isoStr) return '—';
    try {
        const d = new Date(isoStr + 'T00:00:00');
        if (isNaN(d.getTime())) return '—';
        return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch { return '—'; }
}

export function CertificadoCifoModal({ isOpen, onClose, expediente, results, attachments: externalAttachments, onAttachmentsChange }) {
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [scale, setScale] = useState(1);
    
    // Si no vienen de fuera, usamos el inicial local (pero idealmente vienen del padre)
    const initialAttachments = [
        { id: 'aerotermia_cal', label: 'Ficha técnica aerotermia calefacción', file: null, required: true },
        { id: 'aerotermia_acs', label: 'Ficha técnica aerotermia ACS', file: null, required: true }
    ];

    const attachments = externalAttachments || initialAttachments;
    const setAttachments = (newVal) => {
        if (typeof newVal === 'function') {
            onAttachmentsChange(newVal(attachments));
        } else {
            onAttachmentsChange(newVal);
        }
    };

    const [isAnexosOpen, setIsAnexosOpen] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);

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

    const convertPdfToImages = async (dataUrl) => {
        try {
            const pdfjs = await loadPdfJs();
            const loadingTask = pdfjs.getDocument(dataUrl);
            const pdf = await loadingTask.promise;
            const images = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                await page.render({ canvasContext: context, viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.8));
            }
            return images;
        } catch (error) {
            console.error('Error converting PDF:', error);
            return [];
        }
    };

    const handleFileChange = async (targetIdOrIndex, file, isOther = false) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (rev) => {
            const dataUrl = rev.target.result;
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            
            let finalData = [dataUrl];
            if (isPdf) {
                setGenerating(true); 
                finalData = await convertPdfToImages(dataUrl);
                setGenerating(false);
            }

            const newFile = { name: file.name, data: finalData, isPdf };

            setAttachments(prev => {
                const copy = [...prev];
                if (isOther) {
                    // Añadir nuevo a "Otros"
                    return [...copy, { id: `other_${Date.now()}`, label: file.name, file: newFile, isOther: true }];
                } else if (typeof targetIdOrIndex === 'number') {
                    // Actualizar por índice (para otros que ya existen)
                    copy[targetIdOrIndex] = { ...copy[targetIdOrIndex], file: newFile };
                    return copy;
                } else {
                    // Actualizar por ID (para los fijos)
                    const idx = copy.findIndex(a => a.id === targetIdOrIndex);
                    if (idx !== -1) {
                        copy[idx] = { ...copy[idx], file: newFile };
                    }
                    return copy;
                }
            });
        };
        reader.readAsDataURL(file);
    };

    const removeAttachment = (index) => {
        setAttachments(prev => {
            const copy = [...prev];
            const item = copy[index];
            if (item.required) {
                // Si es fijo, solo limpiamos el archivo
                copy[index] = { ...item, file: null };
                return copy;
            } else {
                // Si es "Otro", lo eliminamos del array
                return copy.filter((_, i) => i !== index);
            }
        });
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
    ].includes(zoneStr) ? 'Cálidas' : (zoneStr === 'E1' ? 'medio' : 'Cálidas');

    const numexpte = expediente.numero_expediente || '';
    const facturasList = (doc.facturas || []).map(f => f.numero_factura).filter(Boolean).join(', ') || '—';

    const fechaInicio = formatDateSpanish(doc.fecha_inicio_cifo || doc.fecha_visita_cee_inicial);
    const fechaFin = formatDateSpanish(doc.fecha_fin_cifo || doc.fecha_firma_cee_final);

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

    // Identificación Actuación (Location)
    const locFullDir = `${inst.direccion || loc.direccion || cli.direccion || ''} ${inst.num || loc.num || ''}, ${inst.codigo_postal || loc.cp || cli.codigo_postal || ''} ${inst.municipio || loc.municipio || cli.municipio || ''} (${inst.provincia || loc.provincia || cli.provincia || ''})`.trim() || '—';
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

    const cp = inst.codigo_postal || loc.cp || cli.codigo_postal || opInputs.ccaa_cp || opInputs.cp || '';
    const provCode = cp ? String(cp).substring(0, 2).padStart(2, '0') : '';

    const locCA = (
        inst.ccaa || 
        loc.ccaa || 
        cli.ccaa || 
        (provCode ? PROV_CCAA[provCode] : '') || 
        '—'
    ).toUpperCase();
    const locRefCat = inst.ref_catastral || loc.ref_catastral || opInputs.rc || '—';
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
    const calNuMod = inst.aerotermia_cal?.modelo || '—';
    const calNuSerieEx = inst.aerotermia_cal?.numero_serie || inst.aerotermia_cal?.n_serie_ext || '—';
    const scopCalRaw = parseFloat(inst.aerotermia_cal?.scop) || 0;
    const scopCalStr = scopCalRaw ? scopCalRaw.toFixed(2).replace('.', ',') : '—';

    // ACS
    const tieneAcs = (inst.cambio_acs !== false) && (!!inst.aerotermia_acs?.aerotermia_db_id || !!inst.misma_aerotermia_acs);
    const acsExMarca = inst.caldera_antigua_acs?.marca || calExMarca;
    const acsExMod = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExSerie = inst.caldera_antigua_acs?.numero_serie || inst.caldera_antigua_acs?.n_serie || '—';
    
    const acsEffId = inst.caldera_antigua_acs?.rendimiento_id || boilerEffId;
    const acsEffEntry = BOILER_EFFICIENCIES.find(b => b.id === acsEffId);
    const acsExTipo = acsEffEntry?.label || calExTipo;
    const acsExComb = acsExTipo.split(',')[0] || '—';

    const acsNuMarca = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMarca : inst.aerotermia_acs?.marca || '—') : '—';
    const acsNuMod = tieneAcs ? (inst.misma_aerotermia_acs ? calNuMod : inst.aerotermia_acs?.modelo || '—') : '—';
    const acsNuSerieEx = tieneAcs ? (inst.misma_aerotermia_acs ? calNuSerieEx : inst.aerotermia_acs?.numero_serie || inst.aerotermia_acs?.n_serie_ext || '—') : '—';
    const scopAcsRaw = tieneAcs ? parseFloat(inst.misma_aerotermia_acs ? inst.aerotermia_cal?.scop : inst.aerotermia_acs?.scop || 0) : 0;
    const scopAcsStr = tieneAcs ? (scopAcsRaw ? scopAcsRaw.toFixed(2).replace('.', ',') : '—') : 'no aplica';

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
    const emiLabel  = EMITTER_OPTIONS.find(o => o.value === inst.tipo_emisor)?.label || '—';

    const AnexosModal = () => (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
            <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
                 onClick={e => e.stopPropagation()}>
                <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        </div>
                        <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Gestión de Anexos RES060</h3>
                    </div>
                    <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
                
                <div className="p-8 grid gap-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                    <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-2">Haz clic para mover y ordenar · Arrastra para reordenar archivos</p>
                    
                    {attachments.map((item, idx) => (
                        <div key={item.id} 
                             draggable
                             onDragStart={() => setDraggedIndex(idx)}
                             onDragOver={(e) => { 
                                 e.preventDefault(); 
                                 e.currentTarget.style.backgroundColor = 'rgba(242, 166, 64, 0.1)'; 
                             }}
                             onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                             onDrop={(e) => { 
                                 e.preventDefault(); 
                                 e.currentTarget.style.backgroundColor = '';
                                 if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                     // Es un archivo, lo subimos a este slot o como nuevo
                                     handleFileChange(item.id, e.dataTransfer.files[0], !item.required);
                                 } else {
                                     // Es una reordenación
                                     reorderAttachments(draggedIndex, idx); 
                                 }
                             }}
                             className={`group flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border transition-all duration-300 ${draggedIndex === idx ? 'opacity-30' : 'opacity-100'} ${item.file ? 'border-white/10 hover:border-brand/40' : 'border-white/5 border-dashed hover:border-white/20'}`}>
                            
                            <div className="flex items-center gap-4">
                                {/* Handle para arrastrar */}
                                <div className="cursor-grab active:cursor-grabbing text-white/5 hover:text-white/20 transition-colors">
                                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg>
                                </div>

                                <div className="flex flex-col gap-1">
                                    <span className={`text-[11px] font-black uppercase tracking-wider ${item.file ? 'text-white/80' : 'text-white/20'}`}>{item.label}</span>
                                    {item.file ? (
                                        <span className="text-[10px] text-brand font-bold flex items-center gap-1.5">
                                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/></svg>
                                            {item.file.name} ({item.file.data.length} pág)
                                        </span>
                                    ) : (
                                        <span className="text-[10px] text-white/10 italic">Subir archivo...</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex gap-2">
                                {item.file ? (
                                    <button onClick={() => removeAttachment(idx)} className="p-2.5 text-red-500/50 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
                                ) : (
                                    <label className="p-2.5 bg-white/5 text-white/40 border border-white/10 rounded-xl cursor-pointer hover:bg-brand hover:text-black hover:border-brand transition-all shadow-xl">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileChange(item.id, e.target.files[0])} />
                                    </label>
                                )}
                            </div>
                        </div>
                    ))}
                    
                    <div className="mt-4 flex flex-col items-center gap-4">
                        <div 
                            onDragOver={e => { e.preventDefault(); setIsGlobalDragging(true); }}
                            onDragLeave={() => setIsGlobalDragging(false)}
                            onDrop={e => {
                                e.preventDefault();
                                setIsGlobalDragging(false);
                                if (e.dataTransfer.files.length > 0) {
                                    handleFileChange(null, e.dataTransfer.files[0], true);
                                }
                            }}
                            className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isGlobalDragging ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/5 bg-white/[0.01]'}`}
                        >
                            <svg className={`w-8 h-8 transition-transform ${isGlobalDragging ? 'scale-110 text-brand' : 'text-white/10'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Suelta cualquier archivo PDF/JPG aquí para anexarlo</p>
                        </div>

                        <button 
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = 'image/*,.pdf';
                                input.onchange = (e) => handleFileChange(null, e.target.files[0], true);
                                input.click();
                            }}
                            className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-brand hover:text-black border border-white/10 hover:border-brand text-white/50 text-[10px] font-black rounded-2xl transition-all uppercase tracking-[0.2em] shadow-xl"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                            Explorar Archivos
                        </button>
                    </div>
                </div>
                
                <div className="p-6 bg-black/40 flex justify-end gap-3">
                    <button onClick={() => setIsAnexosOpen(false)} className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(242,166,64,0.3)] hover:scale-105 active:scale-95 transition-all">Guardar Anexos</button>
                </div>
            </div>
        </div>
    );

    // ── HTML GENERATION ──────────────────────────────────────────────
    const buildHtml = () => {
        const pages = [];

        // PÁGINA 1
        pages.push(`
            <div class="doc-page">
                <div class="subheading">CERTIFICADO DE INSTALACIÓN</div>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">IDENTIFICACIÓN DE LA ACTUACIÓN DE AHORRO DE ENERGÍA</td></tr>
                    <tr><td class="lbl" style="width: 35%;">Nombre de la actuación</td><td>Sustitución de caldera de combustión por una bomba de calor aire-agua (aerotermia)</td></tr>
                    <tr><td class="lbl">Código y nombre de la ficha</td><td>RES060: Sustitución de caldera de combustión por una bomba de calor tipo aire-aire, aire-agua, agua-agua o combinadas</td></tr>
                    <tr><td class="lbl">Comunidad autónoma de la actuación</td><td>${locCA}</td></tr>
                    <tr><td class="lbl">Dirección postal instal.</td><td>${locFullDir}</td></tr>
                    <tr><td class="lbl">Referencia catastral</td><td>${locRefCat}</td></tr>
                    <tr><td class="lbl">Coordenadas UTM</td><td>X: ${locUtmX} ; Y: ${locUtmY}</td></tr>
                    <tr><td class="lbl">Facturas asociadas</td><td>${facturasList}</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">IDENTIFICACIÓN DEL PROPIETARIO INICIAL DEL AHORRO</td></tr>
                    <tr><td class="lbl" style="width: 35%;">Propietario / Razón Social</td><td>${cliNombre}</td></tr>
                    <tr><td class="lbl">NIF/NIE</td><td>${cliNif}</td></tr>
                    <tr><td class="lbl">Domicilio</td><td>${cliDir}</td></tr>
                    <tr><td class="lbl">Teléfono</td><td>${cliTlf}</td></tr>
                    <tr><td class="lbl">Correo electrónico</td><td>${cli.email || '—'}</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">HITOS DE LA ACTUACIÓN</td></tr>
                    <tr><td class="lbl" style="width: 50%;">Fecha de inicio</td><td style="text-align: center;">${fechaInicio}</td></tr>
                    <tr><td class="lbl">Fecha de fin</td><td style="text-align: center;">${fechaFin}</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="3" class="heading">DATOS DE LA INSTALACIÓN DE CALEFACCIÓN</td></tr>
                    <tr><td class="lbl" style="width: 33%; text-align: center;">COMPARATIVA</td><td style="font-weight: bold; text-align: center; width: 33%">EXISTENTE</td><td style="font-weight: bold; text-align: center;">NUEVA</td></tr>
                    <tr><td class="lbl">Tipo de caldera</td><td>${calExTipo}</td><td>Bomba de calor</td></tr>
                    <tr><td class="lbl">Marca</td><td>${calExMarca}</td><td>${calNuMarca}</td></tr>
                    <tr><td class="lbl">Modelo</td><td>${calExMod}</td><td>${calNuMod}</td></tr>
                    <tr><td class="lbl">Fuente de energía</td><td>${calExComb}</td><td>Electricidad</td></tr>
                    <tr><td class="lbl">Nº serie unidad exterior</td><td>${calExSerie}</td><td>${calNuSerieEx}</td></tr>
                    <tr><td class="lbl">SCOPbdc / Rendimiento</td><td style="text-align: center;">${etaStr}</td><td style="text-align: center;">${scopCalStr}</td></tr>
                </table>
                <div class="footer" style="position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: right; font-size: 8pt; color: #666;">PAGE_X_OF_Y</div>
            </div>
        `);

        // PÁGINA 2
        pages.push(`
            <div class="doc-page">
                <table class="doc-table">
                    <tr><td colspan="3" class="heading">DATOS DE LA INSTALACIÓN AGUA CALIENTE SANITARIA (ACS)</td></tr>
                    <tr><td class="lbl" style="width: 33%; text-align: center;">COMPARATIVA</td><td style="font-weight: bold; text-align: center; width: 33%">EXISTENTE</td><td style="font-weight: bold; text-align: center;">NUEVA</td></tr>
                    <tr><td class="lbl">Tipo de caldera</td><td>${acsExTipo}</td><td>${tieneAcs ? 'Bomba de calor' : 'no aplica'}</td></tr>
                    <tr><td class="lbl">Marca</td><td>${acsExMarca}</td><td>${tieneAcs ? acsNuMarca : '—'}</td></tr>
                    <tr><td class="lbl">Modelo</td><td>${acsExMod}</td><td>${tieneAcs ? acsNuMod : '—'}</td></tr>
                    <tr><td class="lbl">Fuente de energía</td><td>${acsExComb}</td><td>${tieneAcs ? 'Electricidad' : '—'}</td></tr>
                    <tr><td class="lbl">Nº serie equipo ACS</td><td>${acsExSerie}</td><td>${tieneAcs ? acsNuSerieEx : '—'}</td></tr>
                    <tr><td class="lbl">SCOPdhw / Rendimiento</td><td style="text-align: center;">${etaStr}</td><td style="text-align: center;">${scopAcsStr}</td></tr>
                </table>
                <div class="heading" style="margin-bottom: 0;">Valores de las variables para el ahorro de energía</div>
                <table class="doc-table var-table">
                    <tr><th>F<sub>P</sub></th><th>D<sub>CAL</sub></th><th>S</th><th>D<sub>ACS</sub></th><th>η<sub>i</sub></th><th>SCOP<sub>bdc</sub></th><th>SCOP<sub>dhw</sub></th><th>AE<sub>TOTAL</sub></th><th>D<sub>i</sub></th></tr>
                    <tr><td>1</td><td>${dcal}</td><td>${sStr}</td><td>${dacsStr}</td><td>${etaStr}</td><td>${scopCalStr}</td><td>${scopAcsStr}</td><td style="font-weight: bold;">${aeKwhVal}</td><td>15</td></tr>
                </table>
                <div class="doc-p" style="font-weight: bold; margin-top: 15px; margin-bottom: 5px;">Donde:</div>
                <table class="donde-table" style="width: 100%; margin-bottom: 20px;">
                    <tr><td style="width: 25px;">1.</td><td style="width: 70px; font-weight: bold;">F<sub>P</sub></td><td>Factor de ponderación</td><td style="text-align: right; font-weight: bold; width: 120px;">1</td></tr>
                    <tr><td>2.</td><td style="font-weight: bold;">D<sub>CAL</sub></td><td>Demanda de energía en calefacción del edificio/vivienda</td><td style="text-align: right; font-weight: bold;">${dcal} kWh/m²·año</td></tr>
                    <tr><td>3.</td><td style="font-weight: bold;">S</td><td>Superficie útil habitable del edificio o vivienda</td><td style="text-align: right; font-weight: bold;">${sStr} m²</td></tr>
                    <tr><td>4.</td><td style="font-weight: bold;">D<sub>ACS</sub></td><td>Demanda de energía en agua caliente sanitaria</td><td style="text-align: right; font-weight: bold;">${dacsStr} kWh/año</td></tr>
                    <tr><td>5.</td><td style="font-weight: bold;">η<sub>i</sub></td><td>Rendimiento de caldera combustible fósil (PCS)</td><td style="text-align: right; font-weight: bold;">${etaStr}</td></tr>
                    <tr><td>6.</td><td style="font-weight: bold;">SCOP<sub>bdc</sub></td><td>Rendimiento estacional bomba calor calefacción</td><td style="text-align: right; font-weight: bold;">${scopCalStr}</td></tr>
                    <tr><td>7.</td><td style="font-weight: bold;">SCOP<sub>dhw</sub></td><td>Rendimiento estacional bomba calor ACS</td><td style="text-align: right; font-weight: bold;">${scopAcsStr}</td></tr>
                    <tr><td>8.</td><td style="font-weight: bold;">D<sub>i</sub></td><td>Vida útil de la actuación de eficiencia energética</td><td style="text-align: right; font-weight: bold;">15 años</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">DATOS DE LA EMPRESA INSTALADORA</td></tr>
                    <tr><td class="lbl" style="width: 35%;">Razón social</td><td>${empNombre}</td></tr>
                    <tr><td class="lbl">NIF/CIF</td><td>${empCif}</td></tr>
                    <tr><td class="lbl">Domicilio</td><td>${empDir} - ${empCp} ${empMun} (${empProv})</td></tr>
                    <tr><td class="lbl">Cargo firmante</td><td>${empCargo}</td></tr>
                    <tr><td class="lbl" style="height: 100px;">Firma y sello</td><td></td></tr>
                </table>
                <div class="footer" style="position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: right; font-size: 8pt; color: #666;">PAGE_X_OF_Y</div>
            </div>
        `);

        // PÁGINA 3
        pages.push(`
            <div class="doc-page">
                <div class="subheading">ANEXO I: Justificación de los valores de las variables de la fórmula de cálculo del ahorro de energía del apartado 3 de la ficha RES060.</div>
                <div class="section-title">1. FACTOR DE PONDERACIÓN Fp</div>
                <div class="doc-p">Este valor es 1, tal y como indica la ficha RES060.</div>
                <div class="section-title">2. JUSTIFICACIÓN DE D<sub>CAL</sub></div>
                <div class="doc-p">El valor de la demanda de calefacción se ha determinado directamente a partir del Certificado de Eficiencia Energética del Edificio, tal como se establece en la ficha RES060. Dicho certificado ha sido elaborado y firmado por un técnico competente, de acuerdo con lo dispuesto en el RD 390/2021, de 1 de junio.</div>
                <div class="section-title">3. JUSTIFICACIÓN DE LA SUPERFICIE S</div>
                <div class="doc-p">La superficie se ha obtenido directamente del Certificado de Eficiencia Energética adjunto a este expediente CAE.</div>
                <div class="section-title">4. JUSTIFICACIÓN DE LA DEMANDA DE ACS D<sub>ACS</sub></div>
                ${acsMode === 'xml' 
                    ? `<div class="doc-p" style="margin-top: 10px; line-height: 1.6;">
                         La demanda de ACS ha sido calculada según el archivo .xml del certificado de eficiencia energética cuyo valor es 
                         <strong>${parseFloat(ceeFinal.demandaACS || 0).toFixed(2).replace('.', ',')} kWh/m² · año</strong>, que si se multiplica por la superficie habitable 
                         (<strong>${parseFloat(ceeFinal.superficieHabitable || 0).toFixed(2).replace('.', ',')} m²</strong>), se obtiene el valor de 
                         <strong>${dacsStr} kWh/año</strong>.
                       </div>`
                    : `
                <div class="doc-p">Según el Anejo F del documento de Ahorro de energía HE, del Código Técnico de la Edificación (año 2022):</div>
                <div style="text-align: center; margin: 15px 0; font-size: 14pt;"><strong>D<sub>ACS</sub> = D<sub>L/D</sub> · N<sub>P</sub> · C<sub>e</sub> · 365 · ΔT</strong></div>
                <div class="doc-p">Donde:</div>
                <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 15px; margin-top: 10px;">
                    <table class="doc-table" style="width: 63%; margin-bottom: 5px;">
                        <tr><td style="width: 15%; font-style: italic; font-weight: bold;">D<sub>ACS</sub></td><td>Demanda de energía anual para ACS (kWh/año)</td></tr>
                        <tr><td style="font-style: italic; font-weight: bold;">D<sub>L/D</sub></td><td>Ver tabla c- Anejo F Demanda orientativa de ACS para residencial privado</td></tr>
                        <tr><td style="font-style: italic; font-weight: bold;">N<sub>P</sub></td><td>Número de personas consideradas</td></tr>
                        <tr><td style="font-style: italic; font-weight: bold;">C<sub>e</sub></td><td>Calor específico (agua) = 0,001162 kWh/kg · °C</td></tr>
                        <tr><td style="font-style: italic; font-weight: bold;">ΔT</td><td>Salto térmico con instalaciones a 60 °C de acumulación (°C) = 60 °C – 14 °C = 46 °C.</td></tr>
                    </table>
                    <table class="doc-table" style="width: 32%; margin-bottom: 5px;">
                        <tr><td colspan="2" class="heading" style="font-size: 8pt; padding: 4px; background: #000; color: #fff; text-align: center; font-weight: bold;">CÁLCULO SEGÚN CTE</td></tr>
                        <tr><td style="font-size: 8.5pt;">Nº de habitaciones</td><td style="text-align: center; font-weight: bold; background: #fef3c7; width: 40%; font-size: 10pt;">${numRooms}</td></tr>
                        <tr><td style="font-size: 8.5pt;">Nº de personas</td><td style="text-align: center; font-size: 9pt;">${numPeople}</td></tr>
                        <tr><td style="font-size: 8.5pt;">Litros persona/día</td><td style="text-align: center; font-size: 9pt;">28</td></tr>
                        <tr><td colspan="2" style="border: none; height: 5px;"></td></tr>
                        <tr><td style="font-size: 8.5pt;">C<sub>e</sub></td><td style="text-align: center; font-size: 9pt;">0,001162</td></tr>
                        <tr><td style="font-size: 8.5pt;">CTE</td><td style="text-align: center; font-size: 9pt;">365</td></tr>
                        <tr><td style="font-size: 8.5pt;">ΔT</td><td style="text-align: center; font-size: 9pt;">46</td></tr>
                        <tr style="background: #ecfccb;"><td style="font-weight: bold; font-size: 9pt;">D<sub>ACS</sub></td><td style="text-align: center; font-weight: bold; font-size: 10pt;">${dacsStr}</td></tr>
                    </table>
                </div>
                <div class="doc-p" style="margin-top: 15px;">La estimación de la demanda diaria de Agua Caliente Sanitaria (ACS) se ha realizado conforme a los criterios y valores orientativos establecidos en el Anejo F del Documento Básico de Ahorro de Energía HE del Código Técnico de la Edificación (CTE DB-HE, versión 2022).</div>
                ` }
                <div class="section-title">5. JUSTIFICACIÓN RENDIMIENTO DE CALDERA COMBUSTIBLE FÓSIL REFERIDO A PCS η<sub>i</sub></div>
                <div class="doc-p">Se ha utilizado un rendimiento estacional de <strong>${etaStr}</strong>, al tratarse de una caldera de <strong>${calExTipo}</strong>, siguiendo las indicaciones del Ministerio para la Transición Ecológica y el Reto Demográfico recogidas en los criterios de verificación "24/11.03: Rendimientos estacionales vs. nominales en fichas IND040, RES060, RES090-099, TER100 y TER170-179".</div>
                <div class="footer" style="position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: right; font-size: 8pt; color: #666;">PAGE_X_OF_Y</div>
            </div>
        `);

        // PÁGINA 4
        pages.push(`
            <div class="doc-page">
                <div class="section-title">6. COEFICIENTE DE RENDIMIENTO ESTACIONAL DE LA BOMBA CALOR EN CALEFACCIÓN SCOP<sub>bdc</sub></div>
                <ul><li>Ubicación de la instalación: Zona climática <strong>${zoneStr} (${zoneLabel})</strong> según DB-HE CTE</li><li>Tipo de bomba de calor: Aerotérmica</li><li>Sistema de emisión: ${emiLabel}</li></ul>
                <div class="doc-p" style="font-weight: bold; margin-top: 10px;">SCOP en Calefacción = ${scopCalStr} Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.</div>
                <div class="section-title">7. RENDIMIENTO ESTACIONAL SCOP<sub>dhw</sub></div>
                <div class="doc-p" style="font-weight: bold;">SCOP en ACS = ${scopAcsStr} Según la ficha técnica aportada por el fabricante que se entregará como anexo al expediente CAE.</div>
                <div class="footer" style="position: absolute; bottom: 30px; left: 70px; right: 70px; text-align: right; font-size: 8pt; color: #666;">PAGE_X_OF_Y</div>
            </div>
        `);

        // SEPARADOR ANEXOS
        const hasAttachments = attachments.some(a => a.file);
        if (hasAttachments) {
            pages.push(`
                <div class="doc-page" style="display: flex; align-items: center; justify-content: center; background: #fff;">
                    <div style="text-align: center; color: #000;">
                        <div style="font-size: 60pt; font-weight: 900; letter-spacing: 20px; margin-bottom: 20px;">ANEXOS</div>
                        <div style="width: 150px; height: 4px; background: #ee8f1f; margin: 0 auto;"></div>
                    </div>
                </div>
            `);
        }

        // PÁGINAS DE DOCUMENTACIÓN SUBIDA
        const getAttachmentPages = (attachment) => {
            if (!attachment || !attachment.data) return [];
            return attachment.data.map(pageData => `
                <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                    <img src="${pageData}" style="width: 100%; height: 100%; object-fit: contain;">
                    <div class="footer" style="position: absolute; bottom: 30px; left: 50px; right: 50px; background: white; padding: 5px 10px; border-radius: 5px; text-align: right; font-size: 8pt; color: #666;">PAGE_X_OF_Y</div>
                </div>
            `);
        };

        attachments.forEach(item => {
            if (item.file) {
                pages.push(...getAttachmentPages(item.file));
            }
        });

        // NUMERACIÓN DINÁMICA
        const totalPages = pages.length;
        const finalPages = pages.map((p, i) => p.replace('PAGE_X_OF_Y', `Página ${i + 1} de ${totalPages}`));

        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PDF_CSS}</style></head><body>${finalPages.join('')}</body></html>`;
    };

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildHtml() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${numexpte || 'DRAFT'} - Certificado_CIFO.pdf`;
            a.click();
        } catch { alert('Error al generar el PDF.'); }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive en la oportunidad.'); return; }
        setSavingDrive(true);
        try {
            await axios.post('/api/pdf/save-to-drive', {
                html: buildHtml(),
                folderId,
                fileName: `${numexpte || 'DRAFT'} - Certificado CIFO`,
                subfolderName: '6. ANEXOS CAE'
            });
            alert('✅ Guardado en Drive (carpeta 6. ANEXOS CAE)');
        } catch { alert('Error al guardar en Drive.'); }
        finally { setSavingDrive(false); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                {/* ── Toolbar ── */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                        </button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Certificado CIFO</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numexpte} · 4 páginas</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Botón Anexos */}
                        <button onClick={() => setIsAnexosOpen(true)}
                                className="flex items-center gap-2.5 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-[11px] font-black uppercase tracking-widest hover:bg-white/10 hover:border-white/20 hover:text-brand transition-all group">
                            <svg className="w-4 h-4 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            Anexos
                            {attachments.some(a => a.file) && (
                                <span className="w-2 h-2 rounded-full bg-brand animate-pulse"></span>
                            )}
                        </button>

                            <button onClick={handleSaveToDrive} disabled={savingDrive || generating}
                                    className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 text-xs font-bold hover:text-white hover:border-white/30 transition-all disabled:opacity-30">
                                {savingDrive ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>}
                                {savingDrive ? 'Guardando...' : 'Drive'}
                            </button>
                            <button onClick={handleDownloadPdf} disabled={generating || savingDrive} 
                                    className="flex items-center gap-2 px-5 py-2 bg-brand text-white text-xs font-black rounded-xl uppercase tracking-wider hover:bg-brand/90 transition-all disabled:opacity-30">
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
                            <div className="doc-wrap" dangerouslySetInnerHTML={{ __html: buildHtml() }} />
                        </div>
                    </div>

                    {isAnexosOpen && <AnexosModal />}
                </div>
            </div>
        );
    }

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);
