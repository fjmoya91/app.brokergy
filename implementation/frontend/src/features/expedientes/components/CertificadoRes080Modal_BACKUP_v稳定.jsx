import React, { useRef, useState, useCallback, useEffect } from 'react';
import axios from 'axios';
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

export function CertificadoRes080Modal({ isOpen, onClose, expediente, results }) {
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [scale, setScale] = useState(1);

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

            const initialFields = {
                nombre_actuacion: `${expediente.numero_expediente}: Rehabilitación profunda de edificios de viviendas generadora de ahorros energéticos`,
                fecha_inicio: doc.fecha_inicio_res080 || doc.fecha_inicio_cifo || '',
                fecha_fin: doc.fecha_fin_res080 || doc.fecha_fin_cifo || '',
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
                empresa_responsable: empName,
                empresa_cif: empCif,
                empresa_domicilio: empAddr
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
                    <tr><td class="lbl">SCOP / Rendimiento</td><td class="text-center">${calExEff.toFixed(2)}</td><td class="text-center">${calNuScop}</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="3" class="heading">Datos de la instalación Agua Caliente Sanitaria (ACS)</td></tr>
                    <tr class="text-center font-bold bg-gray"><td>COMPARATIVA</td><td>EXISTENTE</td><td>NUEVA</td></tr>
                    <tr><td class="lbl">Tipo de equipo</td><td>${acsExBrand === '—' ? 'Caldera estándar' : 'Caldera'}</td><td>${inst.cambio_acs === false ? 'No se cambia' : 'Bomba de Calor'}</td></tr>
                    <tr><td class="lbl">Marca</td><td>${acsExBrand}</td><td>${acsNuBrand}</td></tr>
                    <tr><td class="lbl">Modelo</td><td>${acsExMod}</td><td>${acsNuMod}</td></tr>
                    <tr><td class="lbl">Combustible</td><td>${acsExFuel}</td><td>Electricidad</td></tr>
                    <tr><td class="lbl">Nº serie Equipo de ACS</td><td>—</td><td>${acsNuSerie}</td></tr>
                    <tr><td class="lbl">SCOP / Rendimiento</td><td class="text-center">${calExEff.toFixed(2)}</td><td class="text-center">${acsNuScop}</td></tr>
                </table>
                <table class="doc-table">
                    <tr><td colspan="2" class="heading">Datos de la empresa instaladora</td></tr>
                    <tr><td class="lbl">Nombre o Razón Social</td><td>${eb('empresa_responsable')}</td></tr>
                    <tr><td class="lbl">CIF / NIF</td><td>${eb('empresa_cif')}</td></tr>
                    <tr><td class="lbl">Domicilio</td><td>${eb('empresa_domicilio')}</td></tr>
                    <tr><td class="lbl" style="height: 50px;">Firma y sello responsable</td><td></td></tr>
                </table>
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
                    <div class="footer">PAGE_X_OF_Y</div>
                </div>
            `);
        }

        // PÁGINA 5: ANEXOS
        pages.push(`
            <div class="doc-page">
                <div class="doc-header" style="border-bottom: 2px solid #f2a640; padding-bottom: 5px; display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px;">
                    <div style="display: flex; flex-direction: column;">
                        <div style="font-size: 7pt; font-weight: 900; color: #999; letter-spacing: 1px; text-transform: uppercase; margin-bottom: -2px;">Certificado CAE · RES080</div>
                        <div style="font-size: 13pt; font-weight: bold; color: #000;">Expte: ${numExpte}</div>
                    </div>
                    <img src="/logo_brokergy_doc.png" class="doc-logo">
                </div>
                <div class="section-title">Anexo: Justificación Técnica y Fichas</div>
                <div style="display: flex; flex-direction: column; gap: 20px; margin-top: 20px;">
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 10px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Ficha Técnica Aerotermia</div>
                        <img src="/assets/page1.png" style="width: 100%; height: 200px; object-fit: contain; background: #fdfdfd;">
                    </div>
                    ${env.sustituye_ventanas === true ? `
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 10px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Ficha Técnica Ventanas</div>
                        <img src="/assets/page1.png" style="width: 100%; height: 200px; object-fit: contain; background: #fdfdfd;">
                    </div>` : ''}
                    ${env.actua_cerramientos === true ? `
                    <div style="border: 1px solid #ddd; padding: 15px; border-radius: 10px;">
                        <div style="font-weight: bold; margin-bottom: 10px;">Ficha Técnica Aislamiento</div>
                        <img src="/assets/page1.png" style="width: 100%; height: 200px; object-fit: contain; background: #fdfdfd;">
                    </div>` : ''}
                </div>
                <div class="footer">PAGE_X_OF_Y</div>
            </div>
        `);

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
            await axios.post('/api/pdf/save-to-drive', { html: buildFullHtml(true), folderId, fileName: `${numExpte} - Certificado Reforma RES080`, subfolderName: '6. ANEXOS CAE' });
            alert('✅ Guardado en Drive');
        } catch (error) { console.error('Error Drive:', error); alert('Error al guardar en Drive.'); } finally { setSavingDrive(false); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
                        </button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-widest uppercase mb-0.5">Certificado RES080</h2>
                            <p className="text-white/30 text-[10px] uppercase font-bold tracking-wider">{numExpte}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-xs font-bold text-white/20 uppercase tracking-[0.2em] mr-4">Edición Directa Activa</div>
                        <button onClick={handleSaveToDrive} disabled={savingDrive || generating}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-white/50 text-[10px] font-black uppercase hover:text-white hover:border-white/30 transition-all disabled:opacity-30">
                            {savingDrive ? <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>}
                            Drive
                        </button>
                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive} 
                                className="flex items-center gap-1.5 px-5 py-2 bg-brand text-black text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-brand/90 transition-all disabled:opacity-30 shadow-lg shadow-brand/20">
                            {generating ? <div className="w-3 h-3 border-2 border-black/20 border-t-black rounded-full animate-spin" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>}
                            PDF
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
        </div>
    );
};
