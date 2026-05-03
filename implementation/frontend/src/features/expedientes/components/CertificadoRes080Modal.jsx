import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { BOILER_EFFICIENCIES } from '../../calculator/logic/calculation';

// ─── CONSTANTES Y ESTILOS SAGRADOS ───────────────────────────────────────────

const PAGE_PADDING = '50px 70px';
const DOC_WIDTH = '794px'; 

const DOC_CSS = `
    .doc-wrap { background: #e8e8e8; width: ${DOC_WIDTH}; padding: 20px 0; margin: 0 auto; }
    .doc-page {
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10pt;
        color: #000;
        background: white;
        width: ${DOC_WIDTH};
        min-height: 1123px;
        padding: ${PAGE_PADDING};
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin: 0 auto 20px auto;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
        position: relative;
        text-align: left;
    }
    .doc-page:last-child { margin-bottom: 0; }
    
    .doc-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; }
    .doc-logo { height: 32px; }
    
    .doc-table {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: 12px;
        font-size: 8.5pt;
        table-layout: fixed;
    }
    .doc-table td, .doc-table th {
        border: 1px solid #000;
        padding: 4px 6px;
        vertical-align: middle;
        line-height: 1.25;
        word-wrap: break-word;
    }
    .lbl { background-color: #f2a640; color: #fff; font-weight: bold; width: 35%; }
    .heading { background-color: #000; color: #fff; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 9pt; padding: 5px; }
    
    .main-title { 
        font-weight: bold; 
        font-size: 13pt; 
        text-align: center; 
        text-decoration: underline; 
        margin: 20px 0 15px; 
        text-transform: uppercase;
    }
    
    .section-title { font-weight: bold; margin-bottom: 4px; margin-top: 12px; font-size: 9.5pt; text-transform: uppercase; border-bottom: 1px solid #ddd; padding-bottom: 1px; }
    .doc-p { margin-bottom: 6px; line-height: 1.4; text-align: justify; font-size: 9pt; }
    
    .footer { 
        margin-top: auto; 
        display: flex; 
        justify-content: space-between; 
        font-size: 8pt; 
        color: #999; 
        border-top: 1px solid #eee; 
        padding-top: 8px;
    }

    .signature-area {
        margin-top: 25px;
        text-align: right;
        font-size: 9.5pt;
    }
    
    /* In-place Editable Styles */
    .doc-editable { 
        outline: none; 
        background: #fffde7; 
        cursor: text; 
        min-height: 1rem;
        padding: 1px 3px;
        border-radius: 2px;
    }
    .doc-editable:focus { 
        background: #fff9c4; 
        box-shadow: inset 0 0 0 1px #f2a640;
    }
    
    .text-center { text-align: center; }
    .font-bold { font-weight: bold; }
    .bg-gray { background-color: #f9f9f9; }

    @media print { 
        .doc-wrap { background: white !important; padding: 0 !important; } 
        .doc-page { margin: 0 !important; box-shadow: none !important; } 
        .doc-editable { background: transparent !important; box-shadow: none !important; }
    }
`;

const PDF_CSS = `
    @page { size: A4; margin: 0; }
    body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; }
    .doc-page {
        font-family: Arial, sans-serif;
        color: #000;
        width: 210mm;
        min-height: 297mm;
        padding: 15mm 20mm;
        box-sizing: border-box;
        page-break-after: always;
        position: relative;
        display: flex;
        flex-direction: column;
    }
    .doc-header { display: flex; justify-content: space-between; margin-bottom: 8mm; }
    .doc-logo { height: 10mm; }
    .main-title { font-weight: bold; font-size: 14pt; text-align: center; text-decoration: underline; margin: 8mm 0 6mm; text-transform: uppercase; }
    .doc-table { width: 100%; border-collapse: collapse; margin-bottom: 4mm; font-size: 8.5pt; table-layout: fixed; }
    .doc-table td, .doc-table th { border: 0.2mm solid #000; padding: 1.2mm 2mm; vertical-align: middle; }
    .heading { background-color: #000 !important; color: #fff !important; font-weight: bold; text-align: center; text-transform: uppercase; font-size: 9pt; }
    .lbl { background-color: #f2a640 !important; color: #fff !important; font-weight: bold; }
    .section-title { font-weight: bold; margin-top: 3mm; margin-bottom: 2mm; font-size: 9.5pt; text-transform: uppercase; border-bottom: 0.1mm solid #000; }
    .doc-p { margin-bottom: 2mm; line-height: 1.35; text-align: justify; font-size: 9pt; }
    .signature-area { margin-top: 8mm; text-align: right; font-size: 9.5pt; }
    .footer { margin-top: auto; display: flex; justify-content: space-between; font-size: 8pt; color: #999; border-top: 0.1mm solid #eee; padding-top: 2mm; }
`;

export function CertificadoRes080Modal({ isOpen, onClose, expediente, results, attachments: externalAttachments, onAttachmentsChange, onSaveDrive }) {
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);

    // Initial structure for RES080 (managed by parent)
    const initialAttachments = [
        { id: 'aerotermia', label: 'Ficha técnica aerotermia', file: null, required: true },
        { id: 'rite', label: 'Certificado RITE / Memoria técnica', file: null, required: true },
        { id: 'marco', label: 'Ficha técnica Marco Ventana', file: null, required: false },
        { id: 'cristal', label: 'Ficha técnica Vidrio/Cristal', file: null, required: false },
        { id: 'aislamiento', label: 'Ficha técnica Aislamiento', file: null, required: false }
    ];

    const attachments = externalAttachments || initialAttachments;
    const setAttachments = (newVal) => {
        if (typeof newVal === 'function') {
            onAttachmentsChange(newVal(attachments));
        } else {
            onAttachmentsChange(newVal);
        }
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
        cristal_nuevo_u: '1.3',
        cristal_nuevo_marca: 'GUARDIAN',
        cristal_nuevo_modelo: 'SUN',
        cristal_nuevo_composicion: '4/16/4 Bajo emisivo',
        cristal_nuevo_ug: '1.1',
        cristal_nuevo_g: '0.43',
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

            const formatDate = (iso) => {
                if (!iso || !iso.includes('-')) return iso;
                const [y, m, d] = iso.split('-');
                return `${d}/${m}/${y}`;
            };

            const initialFields = {
                nombre_actuacion: `${expediente.numero_expediente}: Rehabilitación profunda de edificios de viviendas generadora de ahorros energéticos`,
                fecha_inicio: doc.fecha_inicio_res080 || doc.fecha_inicio_cifo || formatDate(doc.fecha_visita_cee_inicial) || '',
                fecha_fin: doc.fecha_fin_res080 || doc.fecha_fin_cifo || formatDate(doc.fecha_firma_cee_final) || '',
                descripcion_ventanas: env.descripcion_ventanas || editableRef.current.descripcion_ventanas || 'Se sustituyen las ventanas actuales por unas con mejores prestaciones térmicas y hermeticidad.',
                descripcion_termica: doc.descripcion_termica || editableRef.current.descripcion_termica,
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

    if (!isOpen || !expediente) return null;

    const op = expediente.oportunidades || {};
    const inst = expediente.instalacion || {};
    const cee = expediente.cee || {};
    const env = (expediente.documentacion || {}).envolvente || {};
    const cli = expediente.clientes || expediente.cliente || {};
    const loc = expediente.ubicacion || {};

    const numExpte = expediente.numero_expediente || '—';
    const locCA = (inst.ccaa || loc.ccaa || cli.ccaa || '—').toUpperCase();
    const locDir = `${inst.direccion || loc.direccion || cli.direccion || ''} ${inst.num || loc.num || ''}, ${inst.codigo_postal || loc.cp || cli.codigo_postal || ''} ${inst.municipio || loc.municipio || cli.municipio || ''} (${inst.provincia || loc.provincia || cli.provincia || ''})`.trim();
    const locCat = inst.ref_catastral || loc.ref_catastral || '—';
    const utmX = inst.coord_x || loc.coord_x || '—';
    const utmY = inst.coord_y || loc.coord_y || '—';

    const clientFull = `${cli.nombre_razon_social || ''} ${cli.apellidos || ''}`.trim();
    const clientDir = `${cli.direccion || ''}, ${cli.codigo_postal || ''} ${cli.municipio || ''} (${cli.provincia || ''})`;

    const formatNum = (val) => {
        if (!val && val !== 0) return '0';
        return Math.round(val).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
    };
    const formatN = (val, dec = 2) => val !== null && val !== undefined ? Number(val).toLocaleString('es-ES', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : '—';

    // Datos energéticos desde resultados
    const aeTotal = Math.round(results?.ahorroEnergiaFinalTotal || 0);
    const ef_i    = Math.round(results?.totalEnergiaInicialAno || 0);
    const ef_f    = Math.round(results?.totalEnergiaFinalAno || 0);
    const ee_i    = Math.round(results?.totalEnergiaInicialM2 || 0);
    const ee_f    = Math.round(results?.totalEnergiaFinalM2 || 0);
    const aeKwh = aeTotal.toLocaleString('es-ES');
    const beneficioStr = Math.round(aeTotal * (results?.price_kwh || 0.102)).toLocaleString('es-ES');

    // ─── LÓGICA DE EQUIPOS ───────────────────────────────────────────────────
    const calExBrand = inst.caldera_antigua_cal?.marca || '—';
    const calExMod   = inst.caldera_antigua_cal?.modelo || '—';
    const calExFuel  = inst.caldera_antigua_cal?.combustible || '—';
    const calExEff   = parseFloat(inst.caldera_antigua_cal?.rendimiento) || 0.65;
    
    const calNuBrand = inst.aerotermia_cal?.marca || '—';
    const calNuMod   = inst.aerotermia_cal?.modelo || '—';
    const calNuScop  = inst.aerotermia_cal?.scop || '—';
    const calNuSerieOut = inst.aerotermia_cal?.numero_serie || '—';

    const acsExBrand = inst.caldera_antigua_acs?.marca || calExBrand;
    const acsExMod   = inst.caldera_antigua_acs?.modelo || calExMod;
    const acsExFuel  = inst.caldera_antigua_acs?.combustible || calExFuel;

    const sameAero = !!inst.misma_aerotermia_acs;
    const acsNuBrand = sameAero ? calNuBrand : (inst.aerotermia_acs?.marca || '—');
    const acsNuMod   = sameAero ? calNuMod : (inst.aerotermia_acs?.modelo || '—');
    const acsNuScop  = sameAero ? calNuScop : (inst.aerotermia_acs?.scop || '—');
    const acsNuSerie = sameAero ? 'Misma unidad' : (inst.aerotermia_acs?.numero_serie || '—');

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

    const generateHtml = (isForPdf = false) => {
        const ed = (f) => editableData[f] || editableRef.current[f] || '';
        const eb = (f) => isForPdf ? ed(f) : `<div contenteditable="true" class="doc-editable" data-field="${f}">${ed(f)}</div>`;
        const formatN = (v) => v ? v.toString().replace('.', ',') : '—';

        const pages = [];

        // PÁGINA 0: PORTADA (No se numera)
        pages.push(`
            <div class="doc-page" style="justify-content: center; align-items: center; text-align: center;">
                <img src="/logo_brokergy_doc.png" class="doc-logo" style="position: absolute; top: 15mm; right: 20mm;">
                <div style="margin-top: -30mm;">
                    <h1 style="font-size: 30pt; font-weight: bold; text-transform: uppercase; border-top: 2px solid #f2a640; border-bottom: 2px solid #f2a640; padding: 20px 0;">
                        Certificado Final de Obra CAE
                    </h1>
                    <div style="margin-top: 50mm; font-size: 22pt; font-weight: bold; color: #555;">
                        ${numExpte} - ${formatNum(aeTotal)} CAES
                    </div>
                    <div style="margin-top: 10mm; font-size: 14pt; color: #999;">
                        RES080 - REHABILITACIÓN PROFUNDA
                    </div>
                </div>
                <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 40%; overflow: hidden; z-index: -1;">
                     <img src="/assets/page1.png" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.8;">
                </div>
            </div>
        `);

        // PÁGINA 1: DATOS GENERALES
        pages.push(`
            <div class="doc-page">
                <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                    <div style="display: flex; flex-direction: column;">
                        <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                        <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                    </div>
                    <img src="/logo_brokergy_doc.png" class="doc-logo">
                </div>
                <div class="main-title">Certificado de Obra de Rehabilitación Energética<br>RES080</div>
                <table class="doc-table">
                    <colgroup><col style="width: 30%;"><col style="width: 70%;"></colgroup>
                    <tr><td colspan="2" class="heading">Identificación de la actuación de ahorro de energía</td></tr>
                    <tr><td class="lbl">Nombre de la actuación</td><td>${eb('nombre_actuacion')}</td></tr>
                    <tr><td class="lbl">Código y nombre de la ficha</td><td>RES080: Rehabilitación profunda de edificios de viviendas</td></tr>
                    <tr><td class="lbl">Comunidad autónoma</td><td>${locCA}</td></tr>
                    <tr><td class="lbl">Dirección postal</td><td>${locDir}</td></tr>
                    <tr><td class="lbl">Referencia catastral</td><td>${locCat}</td></tr>
                    <tr><td class="lbl">Coordenadas UTM</td><td>X: ${utmX} ; Y: ${utmY}</td></tr>
                    <tr><td class="lbl">Breve descripción</td><td>${eb('descripcion_actuacion')}</td></tr>
                </table>
                <table class="doc-table">
                    <colgroup><col style="width: 25%;"><col style="width: 40%;"><col style="width: 15%;"><col style="width: 20%;"></colgroup>
                    <tr><td colspan="4" class="heading">Identificación del propietario inicial del ahorro</td></tr>
                    <tr><td class="lbl">Propietario / Razón Social</td><td colspan="3">${clientFull}</td></tr>
                    <tr><td class="lbl">Domicilio</td><td colspan="3">${clientDir}</td></tr>
                    <tr><td class="lbl">NIF/NIE</td><td>${cli.nif || cli.dni || '—'}</td><td class="lbl">Teléfono</td><td>${cli.tlf || cli.telefono || '—'}</td></tr>
                    <tr><td class="lbl">Correo electrónico</td><td colspan="3">${cli.email || '—'}</td></tr>
                </table>
                <table class="doc-table">
                     <colgroup><col style="width: 50%;"><col style="width: 50%;"></colgroup>
                    <tr><td colspan="2" class="heading">Hitos de la actuación</td></tr>
                    <tr><td class="lbl">Fecha de inicio</td><td class="text-center">${eb('fecha_inicio')}</td></tr>
                    <tr><td class="lbl">Fecha de fin</td><td class="text-center">${eb('fecha_fin')}</td></tr>
                </table>
                <table class="doc-table">
                    <colgroup><col style="width: 25%;"><col style="width: 40%;"><col style="width: 15%;"><col style="width: 20%;"></colgroup>
                    <tr><td colspan="4" class="heading">Director redactor del certificado</td></tr>
                    <tr><td class="lbl">Nombre</td><td colspan="3">${eb('director_nombre')}</td></tr>
                    <tr><td class="lbl">Entidad</td><td colspan="3">${eb('director_entidad')}</td></tr>
                    <tr><td class="lbl">Titulación</td><td colspan="3">${eb('director_titulacion')}</td></tr>
                    <tr><td class="lbl">Email</td><td>${eb('director_email')}</td><td class="lbl">Teléfono</td><td>${eb('director_tlf')}</td></tr>
                </table>
                <div class="section-title">Cálculo del ahorro de energía final total AEtotal</div>
                <div style="text-align: center; margin: 8px 0; font-size: 13pt; padding: 12px; background: #f9f9f9; border: 1px solid #ddd; border-radius: 8px;">
                    <strong>AE<sub>TOTAL</sub> = F<sub>P</sub> · (EF<sub>i</sub> – EF<sub>f</sub>)</strong>
                </div>
                <table class="doc-table text-center">
                    <colgroup><col style="width: 70%;"><col style="width: 30%;"></colgroup>
                    <tr><td class="lbl" style="text-align: left;">EF<sub>i</sub> : Consumo de energía final anual antes actuación [kWh/año]</td><td class="font-bold">${formatNum(ef_i)}</td></tr>
                    <tr><td class="lbl" style="text-align: left;">EF<sub>f</sub> : Consumo de energía final anual después actuación [kWh/año]</td><td class="font-bold">${formatNum(ef_f)}</td></tr>
                    <tr style="background: #fff8e1;"><td class="lbl" style="text-align: left;">AE<sub>TOTAL</sub> : Ahorro anual de energía final total [kWh/año]</td><td style="font-size: 12pt; font-weight: 900; color: #f2a640;">${formatNum(aeTotal)}</td></tr>
                </table>
                <div class="signature-area">En Tomelloso a fecha de firma electrónica<br>Fdo.: ${ed('director_nombre')}</div>
                <div class="footer">PAGE_X_OF_Y</div>
            </div>
        `);

        // PÁGINA 2: INSTALACIONES
        pages.push(`
            <div class="doc-page">
                <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                    <div style="display: flex; flex-direction: column;">
                        <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                        <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                    </div>
                    <img src="/logo_brokergy_doc.png" class="doc-logo">
                </div>
                <div class="section-title">Descripción de la actuación sobre la instalación térmica</div>
                <div style="margin-bottom: 10px;">${eb('descripcion_termica')}</div>
                <table class="doc-table">
                    <tr><td colspan="3" class="heading">Datos de la instalación térmica (Calefacción)</td></tr>
                    <tr class="text-center font-bold bg-gray"><td>COMPARATIVA</td><td>EXISTENTE</td><td>NUEVA</td></tr>
                    <tr><td class="lbl">Tipo de equipo</td><td>${calExBrand === '—' ? 'Caldera estándar' : 'Caldera'}</td><td>Bomba de Calor (Aerotermia)</td></tr>
                    <tr><td class="lbl">Marca</td><td>${calExBrand}</td><td>${calNuBrand}</td></tr>
                    <tr><td class="lbl">Modelo</td><td>${calExMod}</td><td>${calNuMod}</td></tr>
                    <tr><td class="lbl">Combustible</td><td>${calExFuel}</td><td>Electricidad</td></tr>
                    <tr><td class="lbl">Nº serie unidad exterior</td><td>—</td><td>${calNuSerieOut}</td></tr>
                    <tr><td class="lbl">SCOP / Rendimiento</td><td class="text-center">${calExEff.toFixed(2)} <sup>(1)</sup></td><td class="text-center">${calNuScop} <sup>(2)</sup></td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="3" class="heading">Datos de la instalación Agua Caliente Sanitaria (ACS)</td></tr>
                    <tr class="text-center font-bold bg-gray"><td>COMPARATIVA</td><td>EXISTENTE</td><td>NUEVA</td></tr>
                    <tr><td class="lbl">Tipo de equipo</td><td>${acsExBrand === '—' ? 'Caldera estándar' : 'Caldera'}</td><td>${inst.cambio_acs === false ? 'No se cambia' : 'Bomba de Calor'}</td></tr>
                    <tr><td class="lbl">Marca</td><td>${acsExBrand}</td><td>${acsNuBrand}</td></tr>
                    <tr><td class="lbl">Modelo</td><td>${acsExMod}</td><td>${acsNuMod}</td></tr>
                    <tr><td class="lbl">Combustible</td><td>${acsExFuel}</td><td>Electricidad</td></tr>
                    <tr><td class="lbl">Nº serie Equipo de ACS</td><td>—</td><td>${acsNuSerie}</td></tr>
                    <tr><td class="lbl">SCOP / Rendimiento</td><td class="text-center">${calExEff.toFixed(2)} <sup>(1)</sup></td><td class="text-center">${acsNuScop} <sup>(3)</sup></td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">Datos de la empresa instaladora</td></tr>
                    <tr><td class="lbl">Nombre o Razón Social</td><td>${eb('empresa_responsable')}</td></tr>
                    <tr><td class="lbl">CIF / NIF</td><td>${eb('empresa_cif')}</td></tr>
                    <tr><td class="lbl">Domicilio</td><td>${eb('empresa_domicilio')}</td></tr>
                    <tr><td class="lbl" style="height: 50px;">Firma y sello responsable</td><td></td></tr>
                </table>
                <div style="margin-top: 12px; font-size: 8.5pt; line-height: 1.5;">
                    <strong>Observaciones:</strong>
                    <ul style="margin: 4px 0 0 0; padding-left: 16px; list-style: none;">
                        <li><sup>(1)</sup> El valor del rendimiento es calculado directamente por el programa de Certificación CE3X para esta caldera [sin aislamiento/antigua con aislamiento medio/antigua con mal aislamiento/ bien aislada y mantenida] de Combustible sólido, alimentación manual, instalado en un espacio sin calefactar, siguiendo las indicaciones del Ministerio para la Transición Ecológica y el Reto Demográfico recogidas en los criterios de verificación <em>"24/11.03: Rendimientos estacionales vs. nominales en fichas IND040, RES060, RES090-099, TER100 y TER170-179"</em>.</li>
                        <li style="margin-top: 4px;"><sup>(2)</sup> Según ficha técnica aportada por el fabricante y/o para unos cálculos realizados según indican los anexos III y IV de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</li>
                        <li style="margin-top: 4px;"><sup>(3)</sup> Según ficha técnica aportada por el fabricante y/o para unos cálculos realizados según indican los anexos III, V y VI de la ficha RES060 de la Orden TED/845/2023, de 18 de julio.</li>
                        <li style="margin-top: 4px;">- La duración indicativa de la actuación (Di) es de 15 años según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética.</li>
                        <li style="margin-top: 4px;">- Se adjunta anexo al presente certificado las fichas técnicas de los nuevos equipos instalados.</li>
                    </ul>
                </div>
                <div class="footer">PAGE_X_OF_Y</div>
            </div>
        `);

        // PÁGINA 3: ENVOLVENTE TÉRMICA (OPACOS) - SÓLO SI SE ACTÚA
        if (env.actua_cerramientos === true) {
            pages.push(`
                <div class="doc-page">
                    <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                        <div style="display: flex; flex-direction: column;">
                            <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                            <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                        </div>
                        <img src="/logo_brokergy_doc.png" class="doc-logo">
                    </div>
                    <div class="section-title">Descripción de la actuación sobre los cerramientos opacos de la vivienda</div>
                    <div style="margin-bottom: 15px;">${eb('descripcion_envolvente')}</div>
                    <table class="doc-table">
                        <tr><td colspan="3" class="heading">Datos del aislamiento térmico</td></tr>
                        <tr class="text-center font-bold bg-gray"><td style="width: 34%"></td><td style="width: 33%">MUROS</td><td style="width: 33%">CUBIERTA</td></tr>
                        <tr><td class="lbl">¿Se añade aislamiento térmico?</td><td class="text-center">${eb('aislamiento_muros_sn')}</td><td class="text-center">${eb('aislamiento_cubierta_sn')}</td></tr>
                        <tr><td class="lbl">Tipo de aislamiento</td><td class="text-center">${eb('aislamiento_muros_tipo')}</td><td class="text-center">${eb('aislamiento_cubierta_tipo')}</td></tr>
                        <tr><td class="lbl">Material del aislamiento</td><td class="text-center">${eb('aislamiento_muros_mat')}</td><td class="text-center">${eb('aislamiento_cubierta_mat')}</td></tr>
                        <tr><td class="lbl">Espesor del aislamiento [cm]</td><td class="text-center">${eb('aislamiento_muros_esp')}</td><td class="text-center">${eb('aislamiento_cubierta_esp')}</td></tr>
                        <tr><td class="lbl">Conductividad térmica λ [W/mK]</td><td class="text-center">${eb('aislamiento_muros_cond')}</td><td class="text-center">${eb('aislamiento_cubierta_cond')}</td></tr>
                    </table>
                    <div class="section-title" style="text-align: center; background: #000; color: white; padding: 2px; margin-top: 15px;">Cerramientos antes de la rehabilitación</div>
                    <table class="doc-table text-center">
                        <tr class="bg-gray font-bold"><td>Cerramiento</td><td>Nombre</td><td>Orientación</td><td>U (W/m2)</td><td>Sup. Cerramiento (m²)</td></tr>
                        ${changedOpacos.map(o => `<tr><td>${o.initial?.tipo || '—'}</td><td>${o.initial?.nombre || '—'}</td><td>${o.initial?.orientacion || '—'}</td><td>${formatN(o.initial?.transmitancia)}</td><td>${formatN(o.initial?.superficie)}</td></tr>`).join('')}
                    </table>
                    <div class="section-title" style="text-align: center; background: #000; color: white; padding: 2px; margin-top: 10px;">Cerramientos después de la rehabilitación</div>
                    <table class="doc-table text-center">
                        <tr class="bg-gray font-bold"><td>Cerramiento</td><td>Nombre</td><td>Orientación</td><td>U (W/m2)</td><td>Sup. Cerramiento (m²)</td></tr>
                        ${changedOpacos.map(o => `<tr style="background: #e8f5e9;"><td>${o.final?.tipo || '—'}</td><td>${o.final?.nombre || '—'}</td><td>${o.final?.orientacion || '—'}</td><td>${formatN(o.final?.transmitancia)}</td><td>${formatN(o.final?.superficie)}</td></tr>`).join('')}
                    </table>
                    <div style="margin-top: 15px;"><strong>Observaciones:</strong><div style="margin-top: 5px; font-size: 9pt;">${eb('envolvente_observaciones')}</div></div>
                    <div class="footer">PAGE_X_OF_Y</div>
                </div>
            `);
        }

        // PÁGINA 4: VENTANAS - SÓLO SI SE ACTÚA
        if (env.sustituye_ventanas === true) {
            pages.push(`
                <div class="doc-page">
                    <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                        <div style="display: flex; flex-direction: column;">
                            <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                            <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                        </div>
                        <img src="/logo_brokergy_doc.png" class="doc-logo">
                    </div>
                    <div class="section-title">Descripción de la actuación sobre las ventanas de la vivienda</div>
                    <div style="margin-bottom: 10px;">${eb('descripcion_ventanas')}</div>
                    <table class="doc-table"><tr><td class="lbl" style="width: 35%">¿Se sustituyen las ventanas?</td><td class="text-center font-bold" style="font-size: 11pt;">${seSustituyen ? 'SÍ' : 'NO'}</td><td class="lbl" style="width: 35%">N.º ventanas sustituidas</td><td class="text-center">${env.num_ventanas || changedHuecos.length}</td></tr></table>
                    ${seSustituyen ? `
                        <div class="section-title" style="text-align: center; background: #000; color: white; padding: 2px;">Huecos antes de la rehabilitación</div>
                        <table class="doc-table text-center">
                            <tr class="bg-gray font-bold"><td>Cerramiento</td><td>Nombre</td><td>Orientación</td><td>Transmitancia (W/m²K)</td><td>Sup. (m²)</td><td>Factor solar</td><td>Permeabilidad (m³/hm²)</td></tr>
                            ${changedHuecos.map(h => `<tr><td>Hueco</td><td>${h.initial?.nombre || '—'}</td><td>${h.initial?.orientacion || '—'}</td><td>${formatN(h.initial?.transmitancia)}</td><td>${formatN(h.initial?.superficie)}</td><td>${formatN(h.initial?.factorSolar)}</td><td>100</td></tr>`).join('')}
                        </table>
                        <div class="section-title" style="text-align: center; background: #000; color: white; padding: 2px;">Huecos después de la rehabilitación</div>
                        <table class="doc-table text-center">
                            <tr class="bg-gray font-bold"><td>Cerramiento</td><td>Nombre</td><td>Orientación</td><td>Transmitancia (W/m²K)</td><td>Sup. (m²)</td><td>Factor solar</td><td>Permeabilidad (m³/hm²)</td></tr>
                            ${changedHuecos.map(h => `<tr style="background: #e8f5e9;"><td>Hueco</td><td>${h.final?.nombre || '—'}</td><td>${h.final?.orientacion || '—'}</td><td>${formatN(h.final?.transmitancia)}</td><td>${formatN(h.final?.superficie)}</td><td>${formatN(h.final?.factorSolar)}</td><td>3</td></tr>`).join('')}
                        </table>
                        <div class="section-title" style="text-align: center; background: #000; color: white; padding: 2px;">Características de las ventanas</div>
                        <table class="doc-table">
                            <colgroup><col style="width: 40%;"><col style="width: 30%;"><col style="width: 30%;"></colgroup>
                            <tr class="text-center font-bold bg-gray"><td>COMPARATIVA</td><td>EXISTENTES</td><td>NUEVAS</td></tr>
                            <tr><td class="lbl">Material del marco</td><td class="text-center">${env.marco_existente_material || '—'}</td><td class="text-center">${eb('marco_nuevo_material')}</td></tr>
                            <tr><td class="lbl">Marca del marco</td><td class="text-center">Desconocida</td><td class="text-center">${eb('marco_nuevo_marca')}</td></tr>
                            <tr><td class="lbl">Modelo del marco</td><td class="text-center">Desconocida</td><td class="text-center">${eb('marco_nuevo_modelo')}</td></tr>
                        </table>
                    ` : `<div style="margin-top: 40px; text-align: center; color: #999;">No hay sustitución de ventanas.</div>`}
                    <div style="margin-top: 15px;"><strong>Observaciones:</strong><div style="margin-top: 5px; font-size: 9pt;">
                        <div>- La duración indicativa de la actuación (Di) es de 25 años según Recomendación (UE) 2019/1658, de la Comisión, de 25 de septiembre, relativa a la transposición de la obligación de ahorro de energía en virtud de la Directiva de eficiencia energética.</div>
                        <div style="margin-top: 4px;">- Se adjunta ficha técnica completa del marco y del cristal en anexos.</div>
                    </div></div>
                    <div class="footer">PAGE_X_OF_Y</div>
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

            const renderCategory = (label, data) => `
                <tr style="background: #c8e6c9; font-weight: bold;">
                    <td style="padding: 5px 6px; border: 1px solid #000;">${label}</td>
                    <td style="padding: 5px 6px; border: 1px solid #000; text-align: center; font-size: 8pt;">${data.fuelIni || '—'}</td>
                    <td style="padding: 5px 6px; border: 1px solid #000; text-align: center; font-size: 8pt;">${data.fuelFin || '—'}</td>
                </tr>
                <tr>
                    <td style="padding: 4px 6px; border: 1px solid #000; font-size: 8.5pt;">Factor de paso de la fuente de energía seleccionada</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.factorIni, 3)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.factorFin, 3)}</td>
                </tr>
                <tr>
                    <td style="padding: 4px 6px; border: 1px solid #000; font-size: 8.5pt;">Emisiones de CO2 ${label.split(' para ')[1]?.toUpperCase() || ''} (kgCO2/m² año)</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.emissionsIni)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.emissionsFin)}</td>
                </tr>
                <tr>
                    <td style="padding: 4px 6px; border: 1px solid #000; font-size: 8.5pt;">Consumo de energía final para ${label.split(' para ')[1]?.toUpperCase() || ''} (kWh/m² año)</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.energyIni)}</td>
                    <td style="padding: 4px 6px; border: 1px solid #000; text-align: center; font-size: 8.5pt;">${fN(data.energyFin)}</td>
                </tr>`;

            pages.push(`
                <div class="doc-page">
                    <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                        <div style="display: flex; flex-direction: column;">
                            <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                            <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                        </div>
                        <img src="/logo_brokergy_doc.png" class="doc-logo">
                    </div>
                    <div class="section-title" style="font-size: 11pt; margin-bottom: 12px;">Justificación del cálculo de ahorro de energía inicial y final</div>
                    <table style="width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-bottom: 16px; table-layout: fixed;">
                        <colgroup><col style="width: 58%;"><col style="width: 21%;"><col style="width: 21%;"></colgroup>
                        <thead>
                            <tr style="background: #000; color: #fff; font-weight: bold; text-transform: uppercase; font-size: 8.5pt;">
                                <th style="padding: 6px 8px; border: 1px solid #000; text-align: left;">Parámetro Energético</th>
                                <th style="padding: 6px 8px; border: 1px solid #000; text-align: center;">INICIAL</th>
                                <th style="padding: 6px 8px; border: 1px solid #000; text-align: center;">FINAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${d.acs ? renderCategory('Tipo de combustible para ACS', d.acs) : ''}
                            ${d.cal ? renderCategory('Tipo de combustible para calefacción', d.cal) : ''}
                            ${d.ref ? renderCategory('Tipo de combustible para Refrigeración', d.ref) : ''}
                            <tr style="border-top: 2px solid #000; font-style: italic; font-weight: bold;">
                                <td style="padding: 5px 6px; border: 1px solid #000; font-size: 8.5pt;">Consumo Total de Energía final (kWh/m² año)</td>
                                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">${fN(results.totalEnergiaInicialM2)}</td>
                                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">${fN(results.totalEnergiaFinalM2)}</td>
                            </tr>
                            <tr style="font-style: italic; font-weight: bold;">
                                <td style="padding: 5px 6px; border: 1px solid #000; font-size: 8.5pt;">Consumo Total de Energía final (kWh/año)</td>
                                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">${fI(results.totalEnergiaInicialAno)}</td>
                                <td style="padding: 5px 6px; border: 1px solid #000; text-align: center;">${fI(results.totalEnergiaFinalAno)}</td>
                            </tr>
                            <tr style="background: #f2a640; color: #000; font-weight: 900;">
                                <td style="padding: 7px 8px; border: 1px solid #000; font-size: 10pt; text-transform: uppercase; letter-spacing: 0.5px;">Ahorro de Energía Final (MWh/año)</td>
                                <td colspan="2" style="padding: 7px 8px; border: 1px solid #000; text-align: center; font-size: 14pt;">${aeMwh}</td>
                            </tr>
                        </tbody>
                    </table>
                    <p style="font-size: 8pt; color: #555; font-style: italic; text-align: center; margin-top: 8px;">
                        Este desglose corresponde a la comparativa técnica entre los certificados energéticos (XML) aportados para la situación inicial y propuesta de reforma.
                    </p>
                    <div class="footer">PAGE_X_OF_Y</div>
                </div>
            `);
        }

        // PÁGINA SEPARADORA: ANEXOS (Siempre presente)
        pages.push(`
            <div class="doc-page" style="justify-content: center; align-items: center; text-align: center;">
                <div style="border: 4px solid #f2a640; padding: 40px 80px;">
                    <h1 style="font-size: 35pt; font-weight: 900; text-transform: uppercase; color: #000; margin: 0; letter-spacing: 15px;">
                        ANEXOS
                    </h1>
                </div>
            </div>
        `);

        // PÁGINAS DE DOCUMENTACIÓN SUBIDA
        const getAttachmentPages = (attachment) => {
            if (!attachment || !attachment.data) return [];
            return attachment.data.map(pageData => `
                <div class="doc-page" style="padding: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #fff;">
                    <img src="${pageData}" style="width: 100%; height: 100%; object-fit: contain;">
                    <div class="footer" style="position: absolute; bottom: 30px; left: 50px; right: 50px; background: white; padding: 5px 10px; border-radius: 5px; text-align: right;">PAGE_X_OF_Y</div>
                </div>
            `);
        };

        attachments.forEach(item => {
            if (item.file) {
                pages.push(...getAttachmentPages(item.file));
            }
        });

        // NUMERACIÓN DINÁMICA
        const total = pages.length - 1; // La portada no se cuenta
        return pages.map((p, idx) => {
            if (idx === 0) return p;
            return p.replace(/PAGE_X_OF_Y/g, `Página ${idx} | ${total}`);
        }).join('');
    };

    const buildFullHtml = (isForPdf = false) => `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${isForPdf ? PDF_CSS : DOC_CSS}</style></head><body><div class="${isForPdf ? '' : 'doc-wrap'}">${generateHtml(isForPdf)}</div></body></html>`;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildFullHtml(true) });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })); a.download = `${numExpte} - Certificado_Reforma_RES080.pdf`; a.click();
        } catch (error) { console.error('Error PDF:', error); alert('Error al generar el PDF.'); } finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { alert('No se encontró el identificador de la carpeta de Drive.'); return; }
        setSavingDrive(true);
        try {
            const { data } = await axios.post('/api/pdf/save-to-drive', { html: buildFullHtml(true), folderId, fileName: `${numExpte} - Certificado Reforma RES080`, subfolderName: '6. ANEXOS CAE' });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                alert('✅ Guardado en Drive');
            }
        } catch (error) { console.error('Error Drive:', error); alert('Error al guardar en Drive.'); } finally { setSavingDrive(false); }
    };

    const handleSendByEmail = async () => {
        const toEmail = cli.email;
        if (!toEmail) { alert("❌ El cliente no tiene un email registrado."); return; }
        setSendingEmail(true);
        try {
            const response = await axios.post('/api/pdf/send-proposal', {
                html: buildFullHtml(true),
                to: toEmail,
                userName: clientFull,
                summaryData: { id: numExpte, docType: 'Certificado RES080' }
            });
            if (response.data.success) alert(`✅ Certificado RES080 enviado correctamente a ${toEmail}`);
        } catch (error) { alert("❌ Error al enviar el correo."); } finally { setSendingEmail(false); }
    };

    const handleSendByWhatsapp = async () => {
        const toPhone = cli.tlf || cli.telefono;
        if (!toPhone || toPhone === '—') { alert("❌ El cliente no tiene un teléfono registrado."); return; }
        setSendingWhatsapp(true);
        try {
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) { alert("❌ WhatsApp no está conectado."); return; }
            const pdfResp = await axios.post('/api/pdf/generate', { html: buildFullHtml(true) });
            await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption: `Hola, te adjunto el Certificado RES080 de tu expediente ${numExpte}.`,
                media: { base64: pdfResp.data?.pdf, filename: `${numExpte}_Certificado_RES080.pdf`, mimetype: 'application/pdf' },
                asDocument: true,
            });
            alert(`✅ Certificado RES080 enviado por WhatsApp correctamente.`);
        } catch (error) { alert("❌ Error al enviar por WhatsApp."); } finally { setSendingWhatsapp(false); }
    };

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

    const handleFileChange = async (targetId, file, isNew = false) => {
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
            const newFileObj = { name: file.name, data: finalData, isPdf };
            setAttachments(prev => {
                if (isNew) return [...prev, { id: `extra_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`, label: `Documento Extra`, file: newFileObj, required: false }];
                if (!targetId) {
                    const emptyIdx = prev.findIndex(a => !a.file);
                    if (emptyIdx !== -1) return prev.map((a, i) => i === emptyIdx ? { ...a, file: newFileObj } : a);
                    return [...prev, { id: `extra_${Date.now()}`, label: `Documento Extra`, file: newFileObj, required: false }];
                }
                return prev.map(a => a.id === targetId ? { ...a, file: newFileObj } : a);
            });
        };
        reader.readAsDataURL(file);
    };

    const removeAttachment = (index) => {
        const item = attachments[index];
        if (item.required) setAttachments(prev => prev.map((a, i) => i === index ? { ...a, file: null } : a));
        else setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const reorderAttachments = (from, to) => {
        if (from === null || to === null || from === to) return;
        const newArr = [...attachments];
        const [removed] = newArr.splice(from, 1);
        newArr.splice(to, 0, removed);
        setAttachments(newArr);
        setDraggedIndex(null);
    };

    const AnexosModal = () => (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
            <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()}>
                <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                            <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        </div>
                        <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Gestión de Anexos Técnicos</h3>
                    </div>
                    <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                </div>
                <div className="p-8 grid gap-4 max-h-[65vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                    {attachments.map((item, idx) => (
                        <div key={item.id} draggable onDragStart={() => setDraggedIndex(idx)} onDrop={(e) => { e.preventDefault(); reorderAttachments(draggedIndex, idx); }} className={`group flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border ${item.file ? 'border-white/10' : 'border-white/5 border-dashed'}`}>
                            <div className="flex items-center gap-4">
                                <div className="cursor-grab text-white/5"><svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg></div>
                                <div className="flex flex-col gap-1">
                                    <span className={`text-[11px] font-black uppercase tracking-wider ${item.file ? 'text-white/80' : 'text-white/20'}`}>{item.label}</span>
                                    {item.file && <span className="text-[10px] text-brand font-bold">{item.file.name}</span>}
                                </div>
                            </div>
                            <div className="flex gap-2">
                                {item.file ? <button onClick={() => removeAttachment(idx)} className="p-2.5 text-red-500/50 hover:text-red-500"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button> : <label className="p-2.5 bg-white/5 text-white/40 rounded-xl cursor-pointer"><input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => handleFileChange(item.id, e.target.files[0])} /><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg></label>}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-6 bg-black/40 flex justify-end gap-3"><button onClick={() => setIsAnexosOpen(false)} className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em]">Guardar Anexos</button></div>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        <div className="border-l border-white/10 pl-3"><h2 className="text-sm font-black text-white tracking-widest uppercase mb-0.5">Certificado RES080</h2><p className="text-white/30 text-[10px] uppercase font-bold tracking-wider">{numExpte}</p></div>
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

                        <button onClick={() => setIsAnexosOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase hover:text-white hover:border-white/30 transition-all"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>Anexos</button>
                        {user?.rol?.toUpperCase() === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingDrive || generating || sendingEmail || sendingWhatsapp}
                                title="Guardar en Drive"
                                className="text-white/40 hover:text-blue-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                            >
                                {savingDrive ? (
                                    <div className="w-5 h-5 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
                                ) : (
                                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M7.71 3.5L1.15 15l3.43 6l6.55-11.5H22.85l-3.44-6H7.71zM10.31 16.5l-3.44 6H21.15l3.44-6H10.31z"/>
                                    </svg>
                                )}
                            </button>
                        )}

                        {/* Botón ENVIAR POR EMAIL */}
                        <button
                            onClick={handleSendByEmail}
                            disabled={sendingEmail || generating || savingDrive || sendingWhatsapp}
                            title="Enviar por Correo"
                            className="text-white/40 hover:text-brand w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingEmail ? (
                                <div className="w-5 h-5 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                            ) : (
                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2-2v10a2 2 0 002 2z" />
                                </svg>
                            )}
                        </button>

                        {/* Botón ENVIAR POR WHATSAPP */}
                        <button
                            onClick={handleSendByWhatsapp}
                            disabled={sendingWhatsapp || generating || savingDrive || sendingEmail}
                            title="Enviar por WhatsApp"
                            className="text-white/40 hover:text-emerald-400 w-10 h-10 flex items-center justify-center transition-all hover:bg-white/5 rounded-xl border border-transparent hover:border-white/10 shrink-0 active:scale-95 disabled:opacity-20"
                        >
                            {sendingWhatsapp ? (
                                <div className="w-5 h-5 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                            ) : (
                                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                </svg>
                            )}
                        </button>

                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp} 
                                className="px-5 py-2 bg-brand text-black text-xs font-black rounded-xl uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 disabled:opacity-30">
                            {generating ? <Spinner /> : 'Generar PDF'}
                        </button>
                    </div>
                </div>
                
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center custom-scrollbar">
                    <div className="inline-block text-left" 
                         style={{ transform: `scale(${scale})`, transformOrigin: 'top center' }}
                         onBlur={handleContentBlur}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
                        <div dangerouslySetInnerHTML={{ __html: generateHtml(false) }} />
                    </div>
                </div>
            </div>
            {isAnexosOpen && <AnexosModal />}
        </div>
    );
};
