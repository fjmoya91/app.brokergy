import React, { useRef, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useModal } from '../../../context/ModalContext';
import { useAuth } from '../../../context/AuthContext';
import AppConfirm from '../../../components/AppConfirm';

const APP_URL = import.meta.env.VITE_APP_URL || window.location.origin;

const baseCss = `
        .prop-wrapper {
            transform-origin: top center;
            /* Se aplicará scale mediante style inline */
        }

        .prop-wrapper-inner {
            --orange: #FF6D00;
            --orange-dark: #E65100;
            --orange-light: #FFF8ED;
            --green: #00C853;
            --green-dark: #008135;
            --green-light: #EDF7ED;
            --dark: #08090C;
            --dark-mid: #13151A;
            --g800: #171717;
            --g700: #262626;
            --g600: #404040;
            --g500: #737373;
            --g400: #A3A3A3;
            --g300: #D4D4D4;
            --g200: #E5E5E5;
            --g100: #F5F5F5;
            --g50: #FAFAFA;
            --white: #FFFFFF;
            --red: #Ef4444;
            --red-light: #FEF2F2;
            --yellow: #F59E0B;
            --yellow-light: #FFFBEB;
            
            font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
            color: var(--g700);
            background: #DEE1E6;
            -webkit-font-smoothing: antialiased;
            line-height: 1.55;
            text-align: left;
            width: 794px; /* Ancho fijo A4 a 96 DPI */
            margin: 0 auto;
        }

        .prop-wrapper-inner * {
            box-sizing: border-box;
        }

        .prop-page {
            width: 794px; /* Cambiado de 210mm a px para escalado preciso */
            height: 1123px; /* Cambiado de 297mm a px */
            margin: 0 auto;
            background: var(--white);
            position: relative;
            overflow: hidden;
            page-break-after: always;
            break-after: page;
            box-shadow: 0 4px 40px rgba(0,0,0,0.1);
            margin-bottom: 24px;
        }
        
        .prop-page:first-child { margin-top: 24px; }
        .prop-page:last-child { page-break-after: avoid; break-after: avoid; }
        .prop-pb { padding: 0 44px; }

        .prop-hero {
            background: linear-gradient(135deg, var(--dark) 0%, var(--dark-mid) 100%);
            padding: 28px 44px 24px;
            position: relative; overflow: hidden;
        }
        .prop-compact .prop-hero { padding: 22px 44px 18px; }
        .prop-compact .prop-hero .prop-htitle h2 { font-size: 19px; }
        .prop-compact .prop-hero .prop-hline { margin: 12px 0 8px; }
        .prop-compact .prop-hsub { margin-top: 3px; font-size: 11px; }
        .prop-hero::before {
            content: ''; position: absolute; top: -80px; right: -40px;
            width: 260px; height: 260px;
            background: radial-gradient(circle, var(--orange) 0%, transparent 70%); opacity: 0.07;
        }
        .prop-hero-top { display: flex; justify-content: space-between; align-items: flex-start; position: relative; z-index: 1; }
        .prop-hero-top h1 { margin: 0; padding: 0; }
        .prop-logo h1 { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-weight: 900; font-size: 28px; color: var(--white); letter-spacing: 3.5px; }
        .prop-logo h1 span { color: var(--orange); }
        .prop-ltag { color: rgba(255,255,255,0.55); font-size: 9.5px; letter-spacing: 2.5px; text-transform: uppercase; font-weight: 700; }
        .prop-hmeta { text-align: right; color: rgba(255,255,255,0.45); font-size: 10.5px; line-height: 1.6; position: relative; z-index: 1; }
        .prop-hmeta strong { color: var(--orange); font-size: 11px; display: block; font-weight: 700; }
        .prop-hline { height: 1px; background: rgba(255,255,255,0.1); margin: 18px 0 14px; position: relative; z-index: 1; }
        .prop-htitle { position: relative; z-index: 1; }
        .prop-htitle h2 { margin: 0; padding: 0; font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; color: var(--white); font-size: 22px; font-weight: 800; line-height: 1.3; }
        .prop-htitle h2 em { font-style: normal; color: var(--orange); }
        .prop-hsub { color: rgba(255,255,255,0.4); font-size: 11px; margin-top: 5px; position: relative; z-index: 1; }

        .prop-cbar { 
            background: var(--orange); padding: 12px 40px; display: grid; grid-template-columns: 1fr 1.5fr 2.5fr; gap: 16px; align-items: start;
        }
        .prop-compact .prop-cbar { padding: 9px 40px; gap: 12px; }
        .prop-cf { display: flex; flex-direction: column; overflow: hidden; }
        .prop-cl { font-size: 7px; text-transform: uppercase; letter-spacing: 1.4px; color: rgba(255,255,255,0.7); font-weight: 700; margin-bottom: 2px; }
        .prop-cv { color: var(--white); font-weight: 700; font-size: 11.5px; display: block; line-height: 1.25; overflow-wrap: break-word; }
        .prop-stag { display: inline-flex; align-items: center; gap: 6px; margin-bottom: 5px; }
        .prop-sn { width: 17px; height: 17px; background: var(--orange); color: white; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 800; line-height: 1; }
        .prop-st { font-size: 8.5px; text-transform: uppercase; letter-spacing: 2px; font-weight: 700; color: var(--orange-dark); }
        .prop-stitle { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; font-size: 18px; color: var(--dark); font-weight: 800; margin-bottom: 5px; line-height: 1.25; }
        .prop-compact .prop-stag { margin-bottom: 4px; }
        .prop-compact .prop-stitle { font-size: 16px; margin-bottom: 4px; }
        .prop-sintro { color: var(--g500); font-size: 11px; margin-bottom: 12px; line-height: 1.6; margin-top: 0; padding: 0; }
        .prop-compact .prop-sintro { font-size: 10.5px; margin-bottom: 8px; line-height: 1.5; }
        .prop-ftable { border-radius: 10px; overflow: hidden; box-shadow: 0 1px 10px rgba(0,0,0,0.05); }
        .prop-ftable-title { 
            font-size: 9.5px; font-weight: 900; color: var(--dark); text-transform: uppercase; 
            letter-spacing: 0.8px; margin-bottom: 8px; padding-left: 2px; display: flex; align-items: center; gap: 6px; min-height: 28px; line-height: 1.2;
        }
        .prop-ftable-title i { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
        .prop-fgrid { display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px; }
        .prop-fcol { flex: 1; }
        .prop-fth { background: var(--orange); padding: 10px 22px; display: flex; justify-content: space-between; }
        .prop-fth span { color: white; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: 1.5px; }
        .prop-compact .prop-fth { padding: 8px 22px; }
        .prop-compact .prop-fth span { font-size: 9.5px; }
        .prop-ftr { display: flex; justify-content: space-between; align-items: center; padding: 12px 22px; border-bottom: 1px solid var(--g100); }
        .prop-ftr:nth-child(odd) { background: var(--g50); }
        .prop-ftr .prop-fl { font-size: 12.5px; color: var(--g700); }
        .prop-ftr .prop-fl small { color: var(--g400); font-size: 10.5px; }
        .prop-ftr .prop-fv { font-weight: 800; font-size: 16px; min-width: 110px; text-align: right; }
        .prop-ftr .prop-fv.grn { color: var(--green-dark); }
        .prop-compact .prop-ftr { padding: 9px 22px; }
        .prop-compact .prop-ftr .prop-fl { font-size: 11.5px; }
        .prop-compact .prop-ftr .prop-fv { font-size: 15px; }
        .prop-ftaids { background: var(--yellow); padding: 12px 22px; display: flex; justify-content: space-between; align-items: center; }
        .prop-ftaids .prop-fl { font-weight: 800; font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--g800); }
        .prop-ftaids .prop-fv { font-weight: 900; font-size: 20px; color: var(--g800); }
        .prop-compact .prop-ftaids { padding: 9px 22px; }
        .prop-compact .prop-ftaids .prop-fv { font-size: 18px; }
        .prop-ftpct { background: var(--green-light); padding: 10px 22px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(0,0,0,0.05); }
        .prop-ftpct .prop-fl { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--green-dark); }
        .prop-ftpct .prop-fv { font-weight: 900; font-size: 18px; color: var(--green-dark); }
        .prop-compact .prop-ftpct { padding: 8px 22px; }
        .prop-compact .prop-ftpct .prop-fv { font-size: 16px; }
        .prop-ftfin { background: var(--dark); padding: 16px 22px; display: flex; justify-content: space-between; align-items: center; border-radius: 0 0 10px 10px; box-shadow: 0 5px 15px rgba(0,0,0,0.2); }
        .prop-ftfin .prop-fl { color: white; font-weight: 800; font-size: 14px; text-transform: uppercase; letter-spacing: 1px; }
        .prop-ftfin .prop-fv { color: var(--orange); font-weight: 900; font-size: 30px; }
        .prop-compact .prop-ftfin { padding: 12px 22px; }
        .prop-compact .prop-ftfin .prop-fl { font-size: 13px; }
        .prop-compact .prop-ftfin .prop-fv { font-size: 26px; }
        .prop-nsm { margin-top: 10px; }
        .prop-compact .prop-nsm { margin-top: 8px; }
        .prop-nsm p { font-size: 9.5px; color: var(--g400); line-height: 1.5; margin-bottom: 3px; margin-top: 0; }
        .prop-compact .prop-nsm p { font-size: 8.5px; line-height: 1.4; margin-bottom: 2px; }
        .prop-nsm p b { color: var(--g600); }
        .prop-avl { text-align: center; font-size: 8.5px; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; color: var(--g400); margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--g200); }
        .prop-compact .prop-avl { margin-top: 5px; padding-top: 5px; font-size: 8px; }
        .prop-cta { background: linear-gradient(145deg, var(--dark) 0%, var(--dark-mid) 100%); padding: 22px 44px; text-align: center; position: absolute; bottom: 0; left: 0; right: 0; }
        .prop-compact .prop-cta { padding: 18px 44px; }
        .prop-cta h3 { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif; color: white; font-size: 17px; font-weight: 800; margin-bottom: 3px; margin-top: 0; }
        .prop-csub { color: rgba(255,255,255,0.45); font-size: 10.5px; margin-bottom: 14px; margin-top: 0;}
        .prop-cta-btn { display: inline-flex; align-items: center; gap: 8px; background: var(--orange); color: white; font-weight: 800; font-size: 13px; padding: 12px 36px; border-radius: 50px; text-decoration: none; letter-spacing: 0.5px; line-height: 1; }
        .prop-cfn { color: rgba(255,255,255,0.25); font-size: 8.5px; margin-top: 10px; line-height: 1.5; margin-bottom: 0; }
        .prop-mfoot { position: absolute; bottom: 0; left: 0; right: 0; padding: 7px 44px; display: flex; justify-content: space-between; font-size: 8px; color: var(--g400); border-top: 1px solid var(--g200); background: white; }
        .prop-mfoot a { color: var(--orange-dark); text-decoration: none; font-weight: 600; }
        .prop-ebox { border-radius: 8px; padding: 13px 16px; margin-bottom: 10px; border: 1px solid var(--g200); background: var(--g50); }
        .prop-ebox.ora { border-left: 3px solid var(--orange); background: var(--orange-light); }
        .prop-ebox.grn { border-left: 3px solid var(--green); background: var(--green-light); }
        .prop-ebox h4 { margin: 0; padding: 0; font-size: 10.5px; font-weight: 700; color: var(--dark); text-transform: uppercase; letter-spacing: 0.3px; margin-bottom: 4px; }
        .prop-ebox p { margin: 0; padding: 0; font-size: 10.5px; color: var(--g600); line-height: 1.6; }
        .prop-agrid { display: flex; gap: 8px; margin: 10px 0 4px; }
        .prop-ac { flex:1; text-align:center; padding:10px 4px; background:var(--g50); border-radius:7px; border:1px solid var(--g200); }
        .prop-ai { font-size:18px; margin-bottom:1px; }
        .prop-at { font-size:9.5px; font-weight:700; color:var(--dark); }
        .prop-as { font-size:8.5px; color:var(--g500); line-height:1.3; }
        .prop-sdiv { height:1px; background:var(--g200); margin:16px 0; }
        .prop-irow { display:flex; gap:10px; margin:6px 0 4px; }
        .prop-ibox { flex:1; background:var(--green-light); border-radius:7px; padding:9px; text-align:center; border:1px solid rgba(92,184,92,0.15); }
        .prop-iy { font-size:9.5px; color:var(--g500); font-weight:600; }
        .prop-ia { font-size:16px; font-weight:800; color:var(--green-dark); }
        .prop-srow { display:flex; margin:10px 0 4px; position:relative; }
        .prop-sl { position:absolute; top:13px; left:7%; right:7%; height:2px; background:var(--g200); z-index:0; }
        .prop-ps { flex:1; text-align:center; position:relative; z-index:1; padding:0 2px; }
        .prop-pn { width:26px; height:26px; border-radius:50%; background:var(--orange); color:white; font-weight:800; font-size:10px; display:inline-flex; align-items:center; justify-content:center; margin-bottom:3px; line-height:1; }
        .prop-ps:nth-child(even) .prop-pn { background:var(--green); }
        .prop-pt { font-size:8px; font-weight:700; color:var(--dark); text-transform:uppercase; letter-spacing:0.2px; }
        .prop-pd { font-size:7.5px; color:var(--g500); line-height:1.3; }
        .prop-dcols { display:flex; gap:20px; }
        .prop-dcol { flex:1; }
        .prop-dph { font-size:12px; font-weight:700; color:var(--dark); padding-bottom:3px; margin-bottom:6px; border-bottom:2.5px solid var(--orange); display:inline-block; text-transform:uppercase; letter-spacing:0.5px; }
        .prop-dph.gr { border-bottom-color:var(--green); }
        .prop-dgt { font-size:9px; font-weight:700; color:var(--g600); text-transform:uppercase; letter-spacing:0.4px; margin:8px 0 3px; }
        .prop-dl { list-style:none; margin: 0; padding: 0; }
        .prop-dl li { font-size:10.5px; color:var(--g700); padding:2.5px 0 2.5px 17px; position:relative; line-height:1.4; }
        .prop-dl li::before { content:''; position:absolute; left:0; top:6px; width:10px; height:10px; border:1.5px solid var(--g300); border-radius:2px; }
        .prop-dl li.s { padding-left:30px; font-size:9.5px; color:var(--g600); }
        .prop-dl li.s::before { left:15px; width:7px; height:7px; border-radius:50%; top:7px; }
        .prop-tipbar { background:var(--yellow-light); border:1px solid rgba(245,200,66,0.25); border-left:3px solid var(--yellow); border-radius:0 6px 6px 0; padding:10px 14px; margin-top:12px; }
        .prop-tipbar h5 { margin: 0; padding: 0; font-size:9.5px; font-weight:700; color:var(--g800); margin-bottom:3px; }
        .prop-tipbar p { margin: 0; padding: 0; font-size:9.5px; color:var(--g600); line-height:1.55; }
        .prop-cl-box { background:var(--g50); border-left:3px solid var(--g300); padding:11px 15px; border-radius:0 6px 6px 0; margin-bottom:9px; }
        .prop-cl-box.ora { background:var(--orange-light); border-left-color:var(--orange); }
        .prop-cl-box.grn { background:var(--green-light); border-left-color:var(--green); }
        .prop-cl-box.red { background:var(--red-light); border-left-color:var(--red); }
        .prop-cl-box h4 { margin: 0; padding: 0; font-size:9.5px; font-weight:700; color:var(--dark); text-transform:uppercase; letter-spacing:0.3px; margin-bottom:3px; }
        .prop-cl-box.red h4 { color:var(--red); }
        .prop-cl-box p { margin: 0; padding: 0; font-size:10.5px; color:var(--g700); line-height:1.6; }
        .prop-cgrid { margin-top:6px; background:rgba(255,255,255,0.6); border-radius:5px; overflow:hidden; }
        .prop-crow { display:flex; justify-content:space-between; padding:6px 12px; font-size:10.5px; border-bottom:1px solid rgba(0,0,0,0.04); }
        .prop-crow:last-child { border-bottom:none; }
        .prop-crow.ctot { background:rgba(0,0,0,0.03); font-weight:700; padding:7px 12px; font-size:11px; }
        .prop-crow em { font-style:normal; color:var(--green-dark); font-weight:700; }
        .prop-crow s { color:var(--g400); font-weight:400; }
        .prop-ptable { background:var(--red-light); border:1px solid rgba(220,38,38,0.12); border-radius:6px; overflow:hidden; margin:5px 0 9px; }
        .prop-pthead { background:rgba(220,38,38,0.07); padding:6px 12px; font-size:8.5px; font-weight:700; color:var(--red); text-transform:uppercase; letter-spacing:0.5px; }
        .prop-ptrow { display:flex; justify-content:space-between; padding:5px 12px; font-size:10.5px; border-bottom:1px dashed rgba(220,38,38,0.08); }
        .prop-ptrow:last-child { border-bottom:none; }
        .prop-pl { color:var(--g700); }
        .prop-pv { font-weight:700; color:var(--red); }
        .prop-ptrow.ptt { border-top:1.5px solid rgba(220,38,38,0.15); padding:7px 12px; font-weight:700; }
        .prop-ptrow.ptt .prop-pv { font-size:12px; }
    `;


const formatNumber = (val) => {
    const num = typeof val === 'number' ? val : parseFloat(val);
    if (num === null || num === undefined || isNaN(num)) return '0';
    return new Intl.NumberFormat('es-ES', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true
    }).format(Math.round(num));
};

export function ProposalModal({ isOpen, onClose, result, inputs, onSaveRequest }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const proposalRef = useRef(null);
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingToDrive, setSavingToDrive] = useState(false);
    const [scale, setScale] = useState(1);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [confirmConfig, setConfirmConfig] = useState(null);
    const [recipientChoice, setRecipientChoice] = useState(false);

    // -- ANEXOS STATE --
    const [isAnexosOpen, setIsAnexosOpen] = useState(false);
    const [anexoPosition, setAnexoPosition] = useState('after');
    const [attachments, setAttachments] = useState([]);
    const [loadingAnnexes, setLoadingAnnexes] = useState(false);
    const [isGlobalDragging, setIsGlobalDragging] = useState(false);
    const [draggedIndex, setDraggedIndex] = useState(null);

    // Cargar anexos desde Drive al abrir el modal
    useEffect(() => {
        const fetchAnnexes = async () => {
            if (!isOpen || !inputs?.id_oportunidad) return;
            
            setLoadingAnnexes(true);
            try {
                // 1. Obtener lista de archivos en la carpeta "0. PRESUPUESTO"
                const driveFolderId = inputs?.drive_folder_id;
                const resp = await axios.get(`/api/oportunidades/${inputs.id_oportunidad || 'unknown'}/anexos${driveFolderId ? `?driveFolderId=${driveFolderId}` : ''}`);
                const driveFiles = (resp.data || []).filter(f => f.name !== 'test.txt');

                if (driveFiles && driveFiles.length > 0) {
                    const loadedAttachments = [];
                    
                    for (const file of driveFiles) {
                        // 2. Descargar contenido de cada archivo
                        const fileResp = await axios.get(`/api/oportunidades/${inputs.id_oportunidad}/anexos/${file.id}`, { responseType: 'arraybuffer' });
                        const blob = new Blob([fileResp.data], { type: file.mimeType });
                        
                        const reader = new FileReader();
                        const dataUrl = await new Promise((resolve) => {
                            reader.onloadend = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });

                        const isPdf = file.mimeType === 'application/pdf';
                        let finalData = [dataUrl];
                        
                        if (isPdf) {
                            finalData = await convertPdfToImages(dataUrl);
                        }

                        loadedAttachments.push({
                            id: file.id,
                            label: file.name,
                            file: { name: file.name, data: finalData, type: file.mimeType },
                            isDrive: true
                        });
                    }
                    
                    setAttachments(loadedAttachments);
                }
            } catch (err) {
                console.error('Error cargando anexos desde Drive:', err);
            } finally {
                setLoadingAnnexes(false);
            }
        };

        fetchAnnexes();
    }, [isOpen, inputs?.id_oportunidad]);

    const displayId = inputs?.id_oportunidad || 'Simulación';
    // Para URLs seguras y no predecibles, usamos el UUID de la base de datos si existe
    const urlId = inputs?.id_uuid || displayId;

    // Estado para cachear datos del partner al abrir el modal
    const [partnerInfo, setPartnerInfo] = useState(null);
    const [instaladorInfo, setInstaladorInfo] = useState(null);
    const [clienteInfo, setClienteInfo] = useState(null);
    const [recipientSelections, setRecipientSelections] = useState(new Set());
    const [emailChoice, setEmailChoice] = useState(false);
    const [emailSelections, setEmailSelections] = useState(new Set());

    // Cargar datos del partner cuando el modal se abre y hay prescriptor_id
    useEffect(() => {
        if (!isOpen) { setPartnerInfo(null); return; }
        const partnerId = inputs?.prescriptor_id;
        if (!partnerId) { setPartnerInfo(null); return; }

        axios.get(`/api/prescriptores/${partnerId}`)
            .then(res => {
                const p = res.data;
                const useContact = p.contacto_notificaciones_activas === true || p.contacto_notificaciones_activas === 'true';
                const info = {
                    name: useContact ? (p.nombre_contacto || p.acronimo || p.razon_social) : (p.acronimo || p.razon_social || 'Partner'),
                    phone: useContact ? (p.tlf_contacto || p.tlf) : (p.tlf || p.telefono || (Array.isArray(p.usuarios) ? p.usuarios[0]?.tlf : p.usuarios?.tlf) || null),
                    email: useContact ? (p.email_contacto || p.email) : (p.email || (Array.isArray(p.usuarios) ? p.usuarios[0]?.email : p.usuarios?.email) || null),
                    redirectionActive: useContact
                };
                console.log('[PARTNER-DEBUG] Raw Data:', p);
                console.log('[PARTNER-DEBUG] Redirección activa:', useContact);
                console.log('[PARTNER-DEBUG] Final Info:', info);
                setPartnerInfo(info);
            })
            .catch(err => {
                console.warn('[PARTNER] No se pudo cargar partner por ID, intentando listado:', err.message);
                // Fallback: listar todos
                axios.get('/api/prescriptores')
                    .then(res2 => {
                        const found = res2.data?.find(p => p.id_empresa === partnerId || String(p.id_empresa) === String(partnerId));
                        if (found) {
                            const useContact = found.contacto_notificaciones_activas === true || found.contacto_notificaciones_activas === 'true';
                            setPartnerInfo({
                                name: useContact ? (found.nombre_contacto || found.acronimo || found.razon_social) : (found.acronimo || found.razon_social || 'Partner'),
                                phone: useContact ? (found.tlf_contacto || found.tlf) : (found.tlf || found.telefono || (Array.isArray(found.usuarios) ? found.usuarios[0]?.tlf : found.usuarios?.tlf) || null),
                                email: useContact ? (found.email_contacto || found.email) : (found.email || (Array.isArray(found.usuarios) ? found.usuarios[0]?.email : found.usuarios?.email) || null),
                                redirectionActive: useContact
                            });
                            console.log('[PARTNER] Cargado desde listado:', found.acronimo || found.razon_social);
                        } else {
                            setPartnerInfo({ name: 'Partner', phone: null });
                        }
                    })
                    .catch(() => setPartnerInfo({ name: 'Partner', phone: null }));
            });
    }, [isOpen, inputs?.prescriptor_id]);

    useEffect(() => {
        if (!isOpen) { setInstaladorInfo(null); return; }
        const instId = inputs?.instalador_asociado_id;
        if (!instId) { setInstaladorInfo(null); return; }
        axios.get(`/api/prescriptores/${instId}`)
            .then(res => {
                const p = res.data;
                setInstaladorInfo({ name: p.acronimo || p.razon_social || 'Instalador', phone: p.tlf || p.telefono || null, email: p.email || null });
            })
            .catch(() => setInstaladorInfo({ name: 'Instalador', phone: null, email: null }));
    }, [isOpen, inputs?.instalador_asociado_id]);

    useEffect(() => {
        if (!isOpen) { setClienteInfo(null); return; }
        const phoneFromInputs = inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || null;
        const name = inputs?.referenciaCliente || 'Cliente';
        if (phoneFromInputs) { setClienteInfo({ name, phone: phoneFromInputs }); return; }
        if (!inputs?.cliente_id) { setClienteInfo({ name, phone: null }); return; }
        axios.get(`/api/clientes/${inputs.cliente_id}`)
            .then(res => {
                const c = res.data;
                setClienteInfo({
                    name: c.nombre_razon_social || name,
                    phone: c.tlf || c.telefono || null,
                });
            })
            .catch(() => setClienteInfo({ name, phone: null }));
    }, [isOpen, inputs?.cliente_id, inputs?.tlf_contacto, inputs?.tlf, inputs?.telefono, inputs?.referenciaCliente]);

    // Ajustar la escala de la vista previa para que quepa en el ancho disponible
    useEffect(() => {
        if (!isOpen) return;

        const updateScale = () => {
            if (containerRef.current) {
                // El ancho fijo de nuestro diseño de página A4 es approx 794px (210mm a 96dpi) 
                // pero a efectos prácticos podemos usar ofsetWidth del prop-wrapper o constante
                const pagePixelWidth = 794;
                // Restamos un poco de padding al contenedor para que no pegue a los bordes
                const availableWidth = containerRef.current.clientWidth - 32;

                if (availableWidth < pagePixelWidth) {
                    setScale(availableWidth / pagePixelWidth);
                } else {
                    setScale(1);
                }
            }
        };

        // Ejecutar inicialmente y en cada resize
        updateScale();
        // Un pequeño timeout para asegurar que el DOM ha renderizado el contenedor
        setTimeout(updateScale, 50);

        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, [isOpen, attachments.length]);

    // -- ANEXOS LOGIC --
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
            console.log("[PDF] Iniciando conversión de PDF a imágenes...");
            const pdfjs = await loadPdfJs();
            
            // Convertir dataURL a Uint8Array para mayor compatibilidad con todas las versiones de PDF.js
            const base64 = dataUrl.split(',')[1];
            const binaryStr = atob(base64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
            }
            
            const loadingTask = pdfjs.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const images = [];
            
            console.log(`[PDF] Documento cargado. Páginas: ${pdf.numPages}`);
            
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                // Usamos un factor de escala 2 para buena calidad en el PDF final
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('2d');
                canvas.height = viewport.height;
                canvas.width = viewport.width;
                
                await page.render({ canvasContext: context, viewport }).promise;
                images.push(canvas.toDataURL('image/jpeg', 0.85)); // Un poco más de calidad
            }
            console.log("[PDF] Conversión completada con éxito.");
            return images;
        } catch (error) {
            console.error('[PDF] Error convirtiendo PDF:', error);
            return [];
        }
    };

    const handleFileChange = async (targetIdOrIndex, file, isOther = false, isBudget = false) => {
        if (!file) return;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async (rev) => {
                const dataUrl = rev.target.result;
                const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
                const isImage = file.type.startsWith('image/');
                
                setGenerating(true);
                try {
                    // 1. Subir a Drive primero para persistencia
                    const uploadResp = await axios.post(`/api/oportunidades/${inputs.id_oportunidad || 'unknown'}/anexos`, {
                        fileName: file.name,
                        mimeType: file.type,
                        base64: dataUrl,
                        driveFolderId: inputs?.drive_folder_id,
                        isBudget
                    });

                    if (!uploadResp.data.success) throw new Error("Error al subir a Drive");

                    const driveFile = uploadResp.data.file;

                    // 2. Procesar para vista previa
                    // Si el backend lo convirtió a PDF, el front debe tratarlo como tal
                    const effectiveIsPdf = isPdf || isImage || isBudget;
                    let finalData = [dataUrl];
                    if (effectiveIsPdf) {
                        finalData = await convertPdfToImages(dataUrl);
                    }

                    const newAttachment = { 
                        id: driveFile.id, 
                        label: isBudget ? "PRESUPUESTO DE LA INSTALACIÓN" : file.name, 
                        file: { name: driveFile.name, data: finalData, type: driveFile.mimeType }, 
                        isOther: !isBudget,
                        isDrive: true,
                        isBudget
                    };

                    setAttachments(prev => {
                        const filtered = isBudget ? prev.filter(a => !a.isBudget) : [...prev];
                        // Si es presupuesto, lo ponemos al principio (o según la lógica de orden)
                        return isBudget ? [newAttachment, ...filtered] : [...filtered, newAttachment];
                    });
                } catch (err) {
                    console.error("Error subiendo anexo:", err);
                    const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || "Error desconocido";
                    alert(`Error al subir el anexo: ${errorMessage}`);
                } finally {
                    setGenerating(false);
                    resolve();
                }
            };
            reader.readAsDataURL(file);
        });
    };

    const removeAttachment = async (index) => {
        const item = attachments[index];
        if (item && item.isDrive && item.id) {
            try {
                if (!item.id.toString().startsWith('temp_')) {
                    await axios.delete(`/api/oportunidades/${inputs.id_oportunidad}/anexos/${item.id}`);
                    console.log(`[Anexos] Archivo ${item.id} eliminado de Drive.`);
                }
            } catch (err) {
                console.error("Error al eliminar anexo de Drive:", err);
                alert("No se pudo eliminar el archivo de la nube, pero se quitará de la vista previa.");
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

    const AnexosModal = () => {
        const budgetAttachment = attachments.find(a => a.isBudget || a.label === "PRESUPUESTO DE LA INSTALACIÓN");
        const otherAttachments = attachments.filter(a => !a.isBudget && a.label !== "PRESUPUESTO DE LA INSTALACIÓN");

        return (
            <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsAnexosOpen(false)}>
                <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)]"
                    onClick={e => e.stopPropagation()}>
                    <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-brand/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                            </div>
                            <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Añadir Anexos</h3>
                        </div>
                        <button onClick={() => setIsAnexosOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                    </div>
                    
                    <div className="px-8 py-6 border-b border-white/10 bg-white/[0.01]">
                        <p className="text-white/50 text-sm mb-4">¿Dónde quieres situar los anexos?</p>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${anexoPosition === 'before' ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/30'}`}>
                                <input type="radio" name="position" className="hidden" checked={anexoPosition === 'before'} onChange={() => setAnexoPosition('before')} />
                                <span className={`text-sm font-bold ${anexoPosition === 'before' ? 'text-brand' : 'text-white/70'}`}>Antes de la Propuesta</span>
                                <span className="text-xs text-white/30 text-center">Útil para colocar el presupuesto como portada.</span>
                            </label>
                            <label className={`flex-1 flex flex-col items-center gap-2 p-4 rounded-xl border cursor-pointer transition-all ${anexoPosition === 'after' ? 'border-brand bg-brand/10' : 'border-white/10 hover:border-white/30'}`}>
                                <input type="radio" name="position" className="hidden" checked={anexoPosition === 'after'} onChange={() => setAnexoPosition('after')} />
                                <span className={`text-sm font-bold ${anexoPosition === 'after' ? 'text-brand' : 'text-white/70'}`}>Después de la Propuesta</span>
                                <span className="text-xs text-white/30 text-center">Útil para adjuntar documentación técnica al final.</span>
                            </label>
                        </div>
                    </div>

                    <div className="p-8 grid gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar bg-gradient-to-b from-transparent to-black/20">
                        
                        {/* SECCIÓN PRESUPUESTO */}
                        <div className="mb-4">
                            <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-3">Presupuesto del Instalador</p>
                            {budgetAttachment ? (
                                <div className="group flex items-center justify-between p-4 bg-brand/5 rounded-2xl border border-brand/30 transition-all duration-300">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-xl bg-brand/20 flex items-center justify-center text-brand">
                                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-[11px] font-black uppercase tracking-wider text-brand">PRESUPUESTO DE LA INSTALACIÓN</span>
                                            <span className="text-[9px] text-white/40 font-bold uppercase">{budgetAttachment.file.name}</span>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button 
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/*,.pdf';
                                                input.onchange = (e) => handleFileChange(null, e.target.files[0], false, true);
                                                input.click();
                                            }}
                                            className="p-2 text-white/20 hover:text-white hover:bg-white/5 rounded-lg transition-all" title="Sustituir presupuesto">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                        </button>
                                        <button onClick={() => removeAttachment(attachments.indexOf(budgetAttachment))} className="p-2 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => {
                                        const input = document.createElement('input');
                                        input.type = 'file';
                                        input.accept = 'image/*,.pdf';
                                        input.onchange = (e) => handleFileChange(null, e.target.files[0], false, true);
                                        input.click();
                                    }}
                                    className="w-full p-6 border-2 border-dashed border-white/5 bg-white/[0.02] hover:bg-brand/5 hover:border-brand/40 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group">
                                    <div className="w-12 h-12 rounded-full bg-white/5 group-hover:bg-brand/20 flex items-center justify-center transition-all">
                                        <svg className="w-6 h-6 text-white/20 group-hover:text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                                    </div>
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/30 group-hover:text-white/60">Subir Presupuesto del Instalador</span>
                                </button>
                            )}
                        </div>

                        <div className="w-full h-px bg-white/5 my-2" />

                        <p className="text-white/30 text-[10px] uppercase font-bold tracking-widest mb-2">Otros Anexos (Documentación Técnica, etc.)</p>
                        
                        {otherAttachments.map((item, idx) => {
                            const globalIdx = attachments.indexOf(item);
                            return (
                                <div key={item.id} 
                                    draggable
                                    onDragStart={() => setDraggedIndex(globalIdx)}
                                    onDragOver={(e) => { 
                                        e.preventDefault(); 
                                        e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; 
                                    }}
                                    onDragLeave={(e) => { e.currentTarget.style.backgroundColor = ''; }}
                                    onDrop={(e) => { 
                                        e.preventDefault(); 
                                        e.currentTarget.style.backgroundColor = '';
                                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                                            handleFileChange(null, e.dataTransfer.files[0], true);
                                        } else {
                                            reorderAttachments(draggedIndex, globalIdx); 
                                        }
                                    }}
                                    className={`group flex items-center justify-between p-4 bg-white/[0.03] rounded-2xl border transition-all duration-300 ${draggedIndex === globalIdx ? 'opacity-30' : 'opacity-100'} border-white/10 hover:border-white/20`}>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className="cursor-grab active:cursor-grabbing text-white/5 hover:text-white/20 transition-colors">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M7 2a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 7 14zm6-12a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 2zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 8zm0 6a2 2 0 1 0 .001 4.001A2 2 0 0 0 13 14z" /></svg>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-white/70">{item.label}</span>
                                            <span className="text-[9px] text-white/30 font-bold flex items-center gap-1.5">
                                                {item.file.name} ({item.file.data.length} pág)
                                            </span>
                                        </div>
                                    </div>

                                    <button onClick={() => removeAttachment(globalIdx)} className="p-2.5 text-white/10 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg></button>
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
                                    if (e.dataTransfer.files.length > 0) {
                                        handleFileChange(null, e.dataTransfer.files[0], true);
                                    }
                                }}
                                className={`w-full py-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-2 transition-all ${isGlobalDragging ? 'border-brand bg-brand/5 scale-[1.02]' : 'border-white/5 bg-white/[0.01]'}`}
                            >
                                <svg className={`w-8 h-8 transition-transform ${isGlobalDragging ? 'scale-110 text-brand' : 'text-white/10'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                                <p className="text-[10px] font-black uppercase tracking-widest text-white/20">Suelta otros archivos PDF/JPG aquí para anexar</p>
                            </div>

                            <button 
                                onClick={() => {
                                    const input = document.createElement('input');
                                    input.type = 'file';
                                    input.accept = 'image/*,.pdf';
                                    input.onchange = (e) => handleFileChange(null, e.target.files[0], true);
                                    input.click();
                                }}
                                className="flex items-center gap-2 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 text-[10px] font-black rounded-2xl transition-all uppercase tracking-[0.2em] shadow-xl"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                Explorar Otros Archivos
                            </button>
                        </div>
                    </div>
                    
                    <div className="p-6 bg-black/40 flex justify-end gap-3">
                        <button onClick={() => setIsAnexosOpen(false)} className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-[0.2em] shadow-[0_10px_20px_-5px_rgba(242,166,64,0.3)] hover:scale-105 active:scale-95 transition-all">Aceptar</button>
                    </div>
                </div>
            </div>
        );
    };

    const renderAnexos = () => {
        if (!attachments || attachments.length === 0) return null;
        
        return attachments.map((item, itemIdx) => {
            if (!item.file || !item.file.data || !Array.isArray(item.file.data)) return null;
            
            return item.file.data.map((pageData, pIdx) => (
                <div 
                    key={`anexo-${itemIdx}-${pIdx}`} 
                    className="prop-page" 
                    style={{ 
                        padding: 0, 
                        margin: '0 auto 24px', 
                        position: 'relative', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center', 
                        background: '#FFFFFF',
                        width: '794px',
                        height: '1123px',
                        overflow: 'hidden'
                    }}
                >
                    {/* Imagen del anexo */}
                    <img 
                        src={pageData} 
                        style={{ 
                            width: '100%', 
                            height: '100%', 
                            objectFit: 'contain',
                            display: 'block'
                        }} 
                        alt={`Anexo ${item.label} Pág ${pIdx + 1}`} 
                        onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.innerHTML += '<div style="color:red;font-weight:bold;">Error al cargar imagen de anexo</div>';
                        }}
                    />
                    
                    {/* Indicador de página (opcional, igual que el resto de la propuesta) */}
                    <div style={{ position: 'absolute', bottom: '30px', right: '44px', fontSize: '10px', color: '#999', fontWeight: 'bold' }}>
                        Documentación Adjunta • {item.label}
                    </div>
                </div>
            ));
        });
    };

    const proceedWithSend = useCallback(async (toPhoneInput, mode = 'CLIENTE', targetNameOverride = '') => {
        const toPhoneRaw = String(toPhoneInput || '');
        console.log('[WA-DEBUG] En función proceedWithSend para:', toPhoneRaw);
        
        setConfirmConfig({ 
            title: 'Preparando envío...', 
            message: `Generando propuesta en PDF y comprobando conexión para ${toPhoneRaw}. Por favor, espera...`, 
            confirmText: null, 
            cancelText: null 
        });

        setSendingWhatsapp(true);
        try {
            // 1. Limpiar y validar teléfono
            const toPhone = toPhoneRaw.replace(/[^0-9]/g, '');
            console.log('[WA-DEBUG] Teléfono limpio y listo:', toPhone);
            
            if (!toPhone || toPhone.length < 9) {
                 console.error('[WA-DEBUG] Teléfono inválido detectado:', toPhone);
                 setConfirmConfig({ 
                     title: 'Teléfono inválido', 
                     message: `❌ El número "${toPhoneRaw}" no es válido para WhatsApp.`, 
                     confirmText: 'Entendido', 
                     onConfirm: () => setConfirmConfig(null) 
                 });
                 setSendingWhatsapp(false);
                 return;
            }

            const targetName = targetNameOverride || inputs.referenciaCliente || (mode === 'PARTNER' ? 'Partner' : 'Cliente');
            try {
                const st = await axios.get('/api/whatsapp/status');
                if (!st.data?.ready) {
                    setConfirmConfig({ 
                        title: 'WhatsApp desconectado', 
                        message: `❌ WhatsApp no está conectado (estado: ${st.data?.state || 'desconocido'}).\n\n¿Quieres que intente conectar ahora?`, 
                        confirmText: 'Sí, conectar', 
                        cancelText: 'Cerrar',
                        onConfirm: async () => {
                            try {
                                setConfirmConfig({ title: 'Conectando...', message: 'Iniciando servicio de WhatsApp. Por favor, espera mientras establecemos el vínculo...', confirmText: null, cancelText: null });
                                await axios.post('/api/whatsapp/connect');
                                
                                // Iniciar bucle de comprobación (polling)
                                let attempts = 0;
                                let isConnected = false;
                                while (attempts < 8 && !isConnected) {
                                    await new Promise(r => setTimeout(r, 2500));
                                    try {
                                        const check = await axios.get('/api/whatsapp/status');
                                        if (check.data?.ready) {
                                            isConnected = true;
                                        }
                                        console.log(`[WA-POLL] Intento ${attempts + 1}: ${check.data?.state}`);
                                    } catch (e) {
                                        console.warn('[WA-POLL] Error en verificación intermedia');
                                    }
                                    attempts++;
                                }

                                if (isConnected) {
                                    setConfirmConfig({ 
                                        title: '¡WhatsApp Conectado!', 
                                        message: '✅ El servicio ya está activo y listo. Ya puedes realizar envíos de forma normal.\n\n¿Quieres continuar con el envío de esta propuesta?', 
                                        confirmText: 'Sí, enviar ahora', 
                                        cancelText: 'Cerrar',
                                        onConfirm: () => proceedWithSend(toPhoneRaw, mode, targetNameOverride) 
                                    });
                                } else {
                                    setConfirmConfig({ 
                                        title: 'Sigue desconectado', 
                                        message: 'No hemos podido confirmar la conexión automática. Por favor, ve a la sección de WhatsApp y escanea el código QR si es necesario.', 
                                        confirmText: 'Ir a WhatsApp', 
                                        onConfirm: () => { window.location.href = '/notificaciones'; },
                                        cancelText: 'Cerrar'
                                    });
                                }
                            } catch (err) {
                                console.error('[WA-DEBUG] Error reconectando:', err);
                                setConfirmConfig({ 
                                    title: 'Error de conexión', 
                                    message: `❌ No se pudo iniciar el servicio: ${err.response?.data?.error || err.message}`, 
                                    confirmText: 'Aceptar', 
                                    onConfirm: () => setConfirmConfig(null) 
                                });
                            }
                        }
                    });
                    setSendingWhatsapp(false);
                    return;
                }
            } catch (e) {
                setConfirmConfig({ 
                    title: 'Servicio no disponible', 
                    message: "❌ No se puede contactar con el servicio de WhatsApp. Revisa que estés logueado con permisos suficientes y el backend esté activo.", 
                    confirmText: 'Cerrar', 
                    onConfirm: () => setConfirmConfig(null) 
                });
                setSendingWhatsapp(false);
                return;
            }

            const element = proposalRef.current;
            if (!element) {
                // Reintentar hasta 10 veces con 200ms de espera (el modal puede tardar en renderizar)
                let retries = 0;
                while (!proposalRef.current && retries < 10) {
                    await new Promise(r => setTimeout(r, 200));
                    retries++;
                }
                if (!proposalRef.current) {
                    setConfirmConfig({ title: 'Error', message: "❌ No se encontró la propuesta en el DOM. Cierra y vuelve a abrir el modal.", confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
                    setSendingWhatsapp(false);
                    return;
                }
            }
            const elForHtml = proposalRef.current;

            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${elForHtml.innerHTML}
                    </div>
                </body>
                </html>
            `;

            const pdfResp = await axios.post('/api/pdf/generate', { html: fullHtml }, { timeout: 90000 });
            const pdfBase64 = pdfResp.data?.pdf;
            if (!pdfBase64) throw new Error(pdfResp.data?.message || 'No se pudo generar el PDF');

            setConfirmConfig({ title: 'Enviando...', message: `PDF generado con éxito. Entregando a WhatsApp para el número ${toPhone}...`, confirmText: null, cancelText: null });

            const f = result || {};
            const fAero = f.financials || {};
            const fReforma = f.financialsRes080 || {};
            
            const firstName = (targetName || '').split(/\s+/)[0] || '';
            const saludo = `¡Hola ${firstName || 'cliente'}!`;
            
            // Flags de tipo de propuesta
            const isReforma = !!inputs?.isReforma;
            const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
            const isBoth = isReforma && inputs?.comparativaReforma !== false;

            let caption = '';
            
            if (mode === 'PARTNER') {
                const partnerName = targetNameOverride || 'Partner';
                const clientNameForPartner = inputs.referenciaCliente || 'cliente';
                const fName = partnerName.split(/\s+/)[0];

                if (isOnlyReforma) {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la propuesta de ayudas diseñada para vuestro cliente ${clientNameForPartner} (Exp. ${displayId}), donde detallamos los ahorros y subvenciones que puede obtener por Reforma Energética:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en la vivienda tras la reforma, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si el cliente cumple los requisitos para acogerse a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que pueda solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* El cliente podría recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de su inversión en la reforma energética.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto de instalación.\n• Aceptar la propuesta técnica adjunta en PDF. Es vital emitir y registrar el Certificado Energético Inicial antes de que pague ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nEl cliente puede firmar la aceptación pulsando en el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* del PDF o directamente aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
                } else if (isBoth) {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el proyecto de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nEl cliente podría obtener una ayuda directa de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*), podría alcanzar un total de hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(Math.round(fReforma.caeBonus || 0))} €*. Sumando las deducciones del IRPF (*${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*), el total para el cliente podría llegar hasta los *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €*.\n\nTe recordamos que para que el cliente pueda acogerse a las deducciones del IRPF debe contar con retenciones aplicables. Por nuestra parte, dejaremos toda la parte técnica preparada para que las pueda solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar vuestro presupuesto de instalación.\n• Aceptar la propuesta técnica que adjuntamos en PDF. Así podremos presentar el CEE Inicial antes de que se emita ninguna factura, evitando problemas en el trámite.\n\nEl cliente puede firmar la aceptación pulsando en el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* del PDF o bien a través de este enlace:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
                } else {
                    caption = `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el expediente de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si el cliente puede acogerse a las deducciones en el IRPF por contar con retenciones aplicables y siempre que estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las pueda solicitar).\n\n💡 *Resumen total de las ayudas:* El cliente podría obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nPara avanzar, los siguientes pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que le emitan alguna factura, garantizando que el trámite siga su curso sin retrasos.\n\nEl cliente puede aceptar la propuesta pulsando sobre el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* en el PDF o bien accediendo a:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
                }
            } else {
                if (isOnlyReforma) {
                    // CASE 1: SOLO REFORMA ENERGÉTICA (RES080)
                    caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética (Nº ${displayId}), donde detallamos los ahorros y subvenciones que puedes obtener:

🔹 *A modo resumen:*

*Bono Energético:* Gracias al ahorro energético que se produciría en tu vivienda tras la reforma, podrías obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.

Además, si cumples los requisitos para acogerte a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que puedas solicitarlas con seguridad).

💡 *Resumen total de las ayudas:* Podrías recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de tu inversión en la reforma energética.

Siguientes pasos:

• Revisar y aceptar la propuesta técnica adjunta en PDF.
• Es vital emitir y registrar el Certificado Energético Inicial antes de que pagues ninguna factura de la obra para no perder el derecho a las deducciones fiscales.

Puedes firmar la aceptación pulsando en el botón del PDF *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* o directamente aquí: ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda.

Un saludo, Fran Moya

BROKERGY — Ingeniería Energética`;

            } else if (isBoth) {
                // CASE 2: COMPARATIVA (AEROTERMIA VS REFORMA) - TEXTO SOLICITADO POR USUARIO
                const bonoAero = Math.round(fAero.caeBonus || 0);
                const irpfAero = Math.round(fAero.irpfDeduction || 0);
                const totalAero = Math.round(fAero.totalAyuda || 0);
                
                const bonoReforma = Math.round(fReforma.caeBonus || 0);
                const irpfReforma = Math.round(fReforma.irpfDeduction || 0);
                const totalReforma = Math.round(fReforma.totalAyuda || 0);

                caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones:

🔹 *Opción 1: Instalando solo aerotermia*
Podrías obtener una ayuda directa de *${formatNumber(bonoAero)} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(irpfAero)} €*), podrías alcanzar un total de hasta *${formatNumber(totalAero)} €*.

🔹 *Opción 2: Aerotermia junto con mejora de la envolvente (cambio de ventanas y/o aislamiento en muros o cubierta)*
En este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(bonoReforma)} €*. Sumando las deducciones del IRPF (*${formatNumber(irpfReforma)} €*), el total podría llegar hasta los *${formatNumber(totalReforma)} €*.

Te recordamos que para acogerte a las deducciones del IRPF debes contar con retenciones aplicables y la normativa debe seguir vigente. Por nuestra parte, dejaremos toda la parte técnica preparada para que las puedas solicitar fácilmente.

Para avanzar con el proceso, los pasos serían:

• Aceptar el presupuesto del instalador.
• Aceptar la propuesta que te adjuntamos en PDF. Así podremos planificar el trabajo y presentar el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, evitando retrasos en el trámite.

Puedes aceptar el presupuesto pulsando sobre el botón *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* en el PDF adjunto, o bien accediendo directamente desde aquí:
🔗 ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda o aclaración.

Un saludo,

Fran Moya
BROKERGY | Ingeniería Energética
https://brokergy.es/`;

            } else {
                // CASE 3: SOLO AEROTERMIA (Original)
                caption = 
`${saludo}

Tal y como acordamos, te adjunto la simulación de las ayudas para tu expediente (Nº ${displayId}), presentando las siguientes opciones para tu caso:

🔹 *A modo resumen:*

*Opción 1:* Instalando el sistema de aerotermia, podrías obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.

Además, si en tu caso puedes acogerte a las deducciones en el IRPF por contar con retenciones aplicables y siempre y cuando estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las puedas solicitar).

💡 *Resumen total de las ayudas:* Podrías obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.

En caso de conformidad, los siguientes pasos serían:

• Aceptar el presupuesto al instalador (si no lo has aceptado ya)
• Aceptar la propuesta que te adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, para que el trámite pueda seguir su curso de manera ágil y sin retrasos.

El presupuesto lo puedes aceptar pulsando sobre el botón del PDF *“✍️ FIRMAR Y ACEPTAR PROPUESTA”* o bien directamente accediendo a ${APP_URL}/firma/${urlId}

Quedo a tu disposición para cualquier duda o aclaración.

Un saludo, Fran Moya

BROKERGY — Especialistas en Eficiencia Energética


info@brokergy.es · 623 926 179`;
                }
            }

            const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Propuesta';
            const safeName = baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
            const filename = `Propuesta_Brokergy_${safeName}.pdf`;

            console.log('[WA-DEBUG] Intentando POST a /api/whatsapp/send-media para', toPhone);
            const sendResp = await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption,
                media: { base64: pdfBase64, filename, mimetype: 'application/pdf' },
                asDocument: true,
            });

            console.log('[WA-DEBUG] Respuesta recibida:', sendResp.data);

            if (sendResp.data?.ok) {
                // AUTOMATIZACIÓN: Cambiar estado a ENVIADA al enviar por WhatsApp
                try {
                    await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' });
                    console.log(`[StatusUpdate] Oportunidad ${inputs.id_oportunidad} marcada como ENVIADA automáticamente.`);
                } catch (stErr) {
                    console.error('Error actualizando estado automático (WA):', stErr);
                }

                setConfirmConfig({ title: 'Enviado', message: `✅ Propuesta enviada correctamente a ${toPhone}`, confirmText: 'Genial', onConfirm: () => setConfirmConfig(null) });
            } else {
                throw new Error(sendResp.data?.error || 'Respuesta inesperada del servidor');
            }
        } catch (error) {
            console.error('[WA] Error sending WhatsApp:', error);
            setConfirmConfig({ title: 'Error', message: "❌ Error al enviar por WhatsApp: " + (error.response?.data?.error || error.message), confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        } finally {
            setSendingWhatsapp(false);
        }
    }, [inputs, result, displayId, urlId, proposalRef]);

    const buildCaption = useCallback((mode, targetName) => {
        const f = result || {};
        const fAero = f.financials || {};
        const fReforma = f.financialsRes080 || {};
        const isReforma = !!inputs?.isReforma;
        const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
        const isBoth = isReforma && inputs?.comparativaReforma !== false;

        if (mode === 'PARTNER' || mode === 'INSTALADOR') {
            const clientNameForPartner = inputs?.referenciaCliente || 'cliente';
            const fName = (targetName || (mode === 'INSTALADOR' ? 'Instalador' : 'Partner')).split(/\s+/)[0];
            if (isOnlyReforma) {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la propuesta de ayudas diseñada para vuestro cliente ${clientNameForPartner} (Exp. ${displayId}), donde detallamos los ahorros y subvenciones que puede obtener por Reforma Energética:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en la vivienda tras la reforma, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si el cliente cumple los requisitos para acogerse a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que pueda solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* El cliente podría recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de su inversión en la reforma energética.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto de instalación.\n• Aceptar la propuesta técnica adjunta en PDF. Es vital emitir y registrar el Certificado Energético Inicial antes de que pague ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nEl cliente puede firmar la aceptación pulsando en el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* del PDF o directamente aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda.\n\nUn saludo,\nFran Moya · BROKERGY`;
            } else if (isBoth) {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el proyecto de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nEl cliente podría obtener una ayuda directa de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*), podría alcanzar un total de hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(Math.round(fReforma.caeBonus || 0))} €*. Sumando las deducciones del IRPF (*${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*), el total para el cliente podría llegar hasta los *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €*.\n\nTe recordamos que para que el cliente pueda acogerse a las deducciones del IRPF debe contar con retenciones aplicables. Por nuestra parte, dejaremos toda la parte técnica preparada para que las pueda solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar vuestro presupuesto de instalación.\n• Aceptar la propuesta técnica que adjuntamos en PDF. Así podremos presentar el CEE Inicial antes de que se emita ninguna factura, evitando problemas en el trámite.\n\nEl cliente puede firmar la aceptación pulsando en el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* del PDF o bien a través de este enlace:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
            } else {
                return `¡Hola ${fName}! 👋\n\nTe adjunto la simulación de las ayudas para el expediente de ${clientNameForPartner} (Exp. ${displayId}), presentando las siguientes opciones para su caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, el cliente podría obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si el cliente puede acogerse a las deducciones en el IRPF por contar con retenciones aplicables y siempre que estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las pueda solicitar).\n\n💡 *Resumen total de las ayudas:* El cliente podría obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nPara avanzar, los siguientes pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que le emitan alguna factura, garantizando que el trámite siga su curso sin retrasos.\n\nEl cliente puede aceptar la propuesta pulsando sobre el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* en el PDF o bien accediendo a:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a vuestra disposición para cualquier duda o aclaración.\n\nUn saludo,\nFran Moya · BROKERGY`;
            }
        } else {
            // CLIENTE
            const firstName = (targetName || '').split(/\s+/)[0] || '';
            const saludo = `¡Hola ${firstName || 'cliente'}!`;
            if (isOnlyReforma) {
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu expediente de Reforma Energética (Nº ${displayId}), donde detallamos los ahorros y subvenciones que puedes obtener:\n\n🔹 *A modo resumen:*\n\n*Bono Energético:* Gracias al ahorro energético que se produciría en tu vivienda tras la reforma, podrías obtener una ayuda de *${formatNumber(Math.round(fReforma.caeBonus || 0))} €* gestionada a través de BROKERGY.\n\nAdemás, si cumples los requisitos para acogerte a las deducciones en el IRPF por rehabilitación, el importe estimado de estas sería de *${formatNumber(Math.round(fReforma.irpfDeduction || 0))} €*. (Nosotros nos encargamos de toda la justificación técnica necesaria para que puedas solicitarlas con seguridad).\n\n💡 *Resumen total de las ayudas:* Podrías recuperar hasta *${formatNumber(Math.round(fReforma.totalAyuda || 0))} €* de tu inversión en la reforma energética.\n\nSiguientes pasos:\n\n• Revisar y aceptar la propuesta técnica adjunta en PDF.\n• Es vital emitir y registrar el Certificado Energético Inicial antes de que pagues ninguna factura de la obra para no perder el derecho a las deducciones fiscales.\n\nPuedes firmar la aceptación pulsando en el botón del PDF *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* o directamente aquí: ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda.\n\nUn saludo, Fran Moya\n\nBROKERGY — Ingeniería Energética`;
            } else if (isBoth) {
                const bonoAero = Math.round(fAero.caeBonus || 0);
                const irpfAero = Math.round(fAero.irpfDeduction || 0);
                const totalAero = Math.round(fAero.totalAyuda || 0);
                const bonoReforma = Math.round(fReforma.caeBonus || 0);
                const irpfReforma = Math.round(fReforma.irpfDeduction || 0);
                const totalReforma = Math.round(fReforma.totalAyuda || 0);
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu proyecto, presentando las siguientes opciones:\n\n🔹 *Opción 1: Instalando solo aerotermia*\nPodrías obtener una ayuda directa de *${formatNumber(bonoAero)} €* gracias al Bono Energético BROKERGY. Si sumamos las deducciones del IRPF (*${formatNumber(irpfAero)} €*), podrías alcanzar un total de hasta *${formatNumber(totalAero)} €*.\n\n🔹 *Opción 2: Aerotermia junto con mejora de la envolvente (cambio de ventanas y/o aislamiento en muros o cubierta)*\nEn este caso, la ayuda del Bono Energético BROKERGY asciende a *${formatNumber(bonoReforma)} €*. Sumando las deducciones del IRPF (*${formatNumber(irpfReforma)} €*), el total podría llegar hasta los *${formatNumber(totalReforma)} €*.\n\nTe recordamos que para acogerte a las deducciones del IRPF debes contar con retenciones aplicables y la normativa debe seguir vigente. Por nuestra parte, dejaremos toda la parte técnica preparada para que las puedas solicitar fácilmente.\n\nPara avanzar con el proceso, los pasos serían:\n\n• Aceptar el presupuesto del instalador.\n• Aceptar la propuesta que te adjuntamos en PDF. Así podremos planificar el trabajo y presentar el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, evitando retrasos en el trámite.\n\nPuedes aceptar el presupuesto pulsando sobre el botón *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* en el PDF adjunto, o bien accediendo directamente desde aquí:\n🔗 ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda o aclaración.\n\nUn saludo,\n\nFran Moya\nBROKERGY | Ingeniería Energética\nhttps://brokergy.es/`;
            } else {
                return `${saludo}\n\nTal y como acordamos, te adjunto la simulación de las ayudas para tu expediente (Nº ${displayId}), presentando las siguientes opciones para tu caso:\n\n🔹 *A modo resumen:*\n\n*Opción 1:* Instalando el sistema de aerotermia, podrías obtener una ayuda de *${formatNumber(Math.round(fAero.caeBonus || 0))} €* gracias al Bono Energético BROKERGY.\n\nAdemás, si en tu caso puedes acogerte a las deducciones en el IRPF por contar con retenciones aplicables y siempre y cuando estén vigentes, el importe estimado de estas sería de *${formatNumber(Math.round(fAero.irpfDeduction || 0))} €*. (Nosotros dejaremos toda la parte técnica preparada para que las puedas solicitar).\n\n💡 *Resumen total de las ayudas:* Podrías obtener hasta *${formatNumber(Math.round(fAero.totalAyuda || 0))} €* combinando ambas opciones.\n\nEn caso de conformidad, los siguientes pasos serían:\n\n• Aceptar el presupuesto al instalador (si no lo has aceptado ya)\n• Aceptar la propuesta que te adjuntamos en PDF para que podamos planificar el trabajo y presentar cuanto antes el Certificado de Eficiencia Energética Inicial antes de que os emitan alguna factura, para que el trámite pueda seguir su curso de manera ágil y sin retrasos.\n\nEl presupuesto lo puedes aceptar pulsando sobre el botón del PDF *"✍️ FIRMAR Y ACEPTAR PROPUESTA"* o bien directamente accediendo a ${APP_URL}/firma/${urlId}\n\nQuedo a tu disposición para cualquier duda o aclaración.\n\nUn saludo, Fran Moya\n\nBROKERGY — Especialistas en Eficiencia Energética\n\n\ninfo@brokergy.es · 623 926 179`;
            }
        }
    }, [inputs, result, displayId, urlId]);

    const sendToMultiple = useCallback(async (selectedModes) => {
        setRecipientChoice(false);
        setSendingWhatsapp(true);

        // 1. Resolver datos de cada destinatario
        setConfirmConfig({ title: 'Preparando...', message: 'Resolviendo datos de contacto...', confirmText: null, cancelText: null });
        const recipients = [];
        for (const mode of selectedModes) {
            let phone = null, name = '';
            if (mode === 'CLIENTE') {
                if (clienteInfo) {
                    phone = clienteInfo.phone; name = clienteInfo.name;
                } else {
                    phone = inputs?.tlf_contacto || inputs?.tlf || inputs?.telefono || null;
                    name = inputs?.referenciaCliente || 'Cliente';
                    if (!phone && inputs?.cliente_id) {
                        try {
                            const r = await axios.get(`/api/clientes/${inputs.cliente_id}`);
                            phone = r.data?.tlf || r.data?.telefono || null;
                            if (r.data?.nombre_razon_social) name = r.data.nombre_razon_social;
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del cliente'); }
                    }
                }
            } else if (mode === 'PARTNER') {
                if (partnerInfo) {
                    name = partnerInfo.name; phone = partnerInfo.phone;
                } else {
                    const pid = inputs?.prescriptor_id;
                    if (pid) {
                        try {
                            const r = await axios.get(`/api/prescriptores/${pid}`);
                            const p = r.data;
                            const uc = p.contacto_notificaciones_activas === true;
                            name = uc ? (p.nombre_contacto || p.acronimo || p.razon_social) : (p.acronimo || p.razon_social || 'Partner');
                            phone = uc ? (p.tlf_contacto || p.tlf) : (p.tlf || p.telefono || null);
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del partner'); }
                    }
                }
            } else if (mode === 'INSTALADOR') {
                if (instaladorInfo) {
                    name = instaladorInfo.name; phone = instaladorInfo.phone;
                } else {
                    const iid = inputs?.instalador_asociado_id;
                    if (iid) {
                        try {
                            const r = await axios.get(`/api/prescriptores/${iid}`);
                            const p = r.data;
                            name = p.acronimo || p.razon_social || 'Instalador';
                            phone = p.tlf || p.telefono || null;
                        } catch (e) { console.warn('[WA] No se pudo obtener teléfono del instalador'); }
                    }
                }
            }
            recipients.push({ phone, mode, name });
        }

        // 2. Validar teléfonos
        const missing = recipients.filter(r => !r.phone || String(r.phone).replace(/\D/g, '').length < 9);
        if (missing.length > 0) {
            const msgList = missing.map(r => `• ${r.name || r.mode}: sin teléfono registrado`).join('\n');
            setConfirmConfig({ title: 'Faltan teléfonos', message: `❌ No se puede enviar a:\n${msgList}`, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        // 3. Verificar estado de WhatsApp
        try {
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) {
                setConfirmConfig({ title: 'WhatsApp desconectado', message: `❌ WhatsApp no está conectado (estado: ${st.data?.state || 'desconocido'}).`, confirmText: 'Cerrar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
                return;
            }
        } catch (e) {
            setConfirmConfig({ title: 'Servicio no disponible', message: '❌ No se puede contactar con el servicio de WhatsApp.', confirmText: 'Cerrar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        // 4. Generar PDF una sola vez
        setConfirmConfig({ title: 'Generando PDF...', message: 'Preparando la propuesta para enviar...', confirmText: null, cancelText: null });
        let pdfBase64;
        try {
            let retries = 0;
            while (!proposalRef.current && retries < 10) { await new Promise(r => setTimeout(r, 200)); retries++; }
            const el = proposalRef.current;
            if (!el) throw new Error('No se puede acceder al contenido de la propuesta.');
            const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:white}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><div class="prop-wrapper-inner">${el.innerHTML}</div></body></html>`;
            const r = await axios.post('/api/pdf/generate', { html: fullHtml }, { timeout: 90000 });
            pdfBase64 = r.data?.pdf;
            if (!pdfBase64) throw new Error(r.data?.message || 'No se pudo generar el PDF');
        } catch (e) {
            setConfirmConfig({ title: 'Error al generar PDF', message: '❌ ' + e.message, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingWhatsapp(false); } });
            return;
        }

        const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Propuesta';
        const filename = `Propuesta_Brokergy_${baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_')}.pdf`;

        // 5. Enviar a cada destinatario con su mensaje personalizado
        const results = [];
        for (let i = 0; i < recipients.length; i++) {
            const { phone, mode, name } = recipients[i];
            const toPhone = String(phone).replace(/[^0-9]/g, '');
            const caption = buildCaption(mode, name);
            setConfirmConfig({ title: `Enviando ${i + 1}/${recipients.length}...`, message: `Entregando a ${name} (${toPhone})...`, confirmText: null, cancelText: null });
            try {
                const r = await axios.post('/api/whatsapp/send-media', { phone: toPhone, caption, media: { base64: pdfBase64, filename, mimetype: 'application/pdf' }, asDocument: true });
                results.push({ name, ok: r.data?.ok === true });
            } catch (e) {
                results.push({ name, ok: false, error: e.response?.data?.error || e.message });
            }
        }

        // 6. Marcar como ENVIADA si se envió al cliente con éxito
        if (selectedModes.includes('CLIENTE') && results.some(r => r.ok)) {
            try {
                await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' });
            } catch (e) { console.warn('[WA] No se pudo actualizar estado:', e.message); }
        }

        // 7. Mostrar resultado final
        const allOk = results.every(r => r.ok);
        const summary = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.error ? ': ' + r.error : ''}`).join('\n');
        setConfirmConfig({ title: allOk ? '¡Propuesta enviada!' : 'Resultado del envío', message: summary, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        setSendingWhatsapp(false);
    }, [buildCaption, inputs, proposalRef, partnerInfo, instaladorInfo, clienteInfo]);

    const handleSendByWhatsapp = () => {
        setSendingWhatsapp(false);
        setRecipientSelections(new Set());
        setRecipientChoice(true);
    };

    if (!isOpen || !result || !result.financials) return null;

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const element = proposalRef.current;
            if (!element) {
                console.error("No se encontró el elemento de la propuesta.");
                return;
            }

            // Construir documento HTML completo autónomo con estilos base robustos
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${proposalRef.current.innerHTML}
                    </div>
                </body>
                </html>
            `;

            // Enviar al backend para generar PDF con Puppeteer
            const response = await axios.post('/api/pdf/generate',
                { html: fullHtml },
                { timeout: 90000 } // Más tiempo para evitar timeouts
            );

            if (!response.data || (!response.data.pdf && !response.data.error)) {
                throw new Error("Respuesta inválida del servidor.");
            }

            const { pdf: pdfBase64, error: serverError, message: serverMessage } = response.data;

            if (serverError || !pdfBase64) {
                throw new Error(serverMessage || 'Error desconocido en el servidor');
            }

            // Decodificar base64 a Blob
            const binaryStr = atob(pdfBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: 'application/pdf' });

            // Descargar el PDF recibido
            const baseFileName = inputs?.id_oportunidad || inputs?.rc || 'Simulacion';
            const safeName = baseFileName.toString().replace(/[^a-zA-Z0-9_\-]/g, '_');
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Propuesta_Brokergy_${safeName}.pdf`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Crash in handleDownloadPdf:', error);
            const msg = error.response?.data?.message || error.message || 'Error desconocido';
            setConfirmConfig({ title: 'Error', message: `❌ Error al generar el PDF: ${msg}`, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        } finally {
            setGenerating(false);
        }
    };

    const f = result.financials;
    const discountCerts = result.discountCertificates || false;
    const date = new Date();
    const formattedDate = date.toLocaleDateString('es-ES');

    const validUntilDate = new Date();
    validUntilDate.setMonth(validUntilDate.getMonth() + 2);
    const formattedValidDate = validUntilDate.toLocaleDateString('es-ES');

    const totalPages = 4 + attachments.reduce((acc, a) => acc + (a.file?.data?.length || 0), 0);

    // Costs - conditional on discount toggle
    const costeCEE = discountCerts ? 0 : 220;
    const costeTasas = discountCerts ? 0 : 32.78;
    const costeGestion = 0; // Always 100% DTO
    const totalDescuentoGestion = costeCEE + costeTasas + costeGestion;
    const caeBonus = f.caeBonus || 0;
    const caeNeto = Math.max(0, caeBonus - totalDescuentoGestion);

    const f80 = result.financialsRes080;
    const isReforma = !!inputs?.isReforma;
    const isBoth = isReforma && inputs?.comparativaReforma !== false;
    const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
    // Annual savings data
    const annualSavings = result.annualSavings;
    const payback = result.payback;
    const showAnnualSavings = result.includeAnnualSavings && annualSavings;

    const handleSendByEmail = () => {
        setSendingEmail(false);
        setEmailSelections(new Set());
        setEmailChoice(true);
    };

    const sendEmailToMultiple = useCallback(async (selectedModes) => {
        setEmailChoice(false);
        setSendingEmail(true);

        // 1. Resolver destinatarios
        setConfirmConfig({ title: 'Preparando...', message: 'Resolviendo datos de contacto...', confirmText: null, cancelText: null });
        const recipients = [];
        for (const mode of selectedModes) {
            let email = null, name = '';
            if (mode === 'CLIENTE') {
                email = clienteInfo?.email || inputs?.email_contacto || inputs?.email || null;
                name = clienteInfo?.name || inputs?.referenciaCliente || 'Cliente';
                if (!email && inputs?.cliente_id) {
                    try {
                        const r = await axios.get(`/api/clientes/${inputs.cliente_id}`);
                        email = r.data?.email || null;
                        if (r.data?.nombre_razon_social) name = r.data.nombre_razon_social;
                    } catch (e) { console.warn('[Email] No se pudo obtener email del cliente'); }
                }
            } else if (mode === 'PARTNER') {
                email = partnerInfo?.email || null;
                name = partnerInfo?.name || 'Partner';
                if (!email && inputs?.prescriptor_id) {
                    try {
                        const r = await axios.get(`/api/prescriptores/${inputs.prescriptor_id}`);
                        const uc = r.data.contacto_notificaciones_activas === true;
                        name = uc ? (r.data.nombre_contacto || r.data.acronimo || r.data.razon_social) : (r.data.acronimo || r.data.razon_social || 'Partner');
                        email = uc ? (r.data.email_contacto || r.data.email) : (r.data.email || null);
                    } catch (e) { console.warn('[Email] No se pudo obtener email del partner'); }
                }
            } else if (mode === 'INSTALADOR') {
                email = instaladorInfo?.email || null;
                name = instaladorInfo?.name || 'Instalador';
                if (!email && inputs?.instalador_asociado_id) {
                    try {
                        const r = await axios.get(`/api/prescriptores/${inputs.instalador_asociado_id}`);
                        name = r.data.acronimo || r.data.razon_social || 'Instalador';
                        email = r.data.email || null;
                    } catch (e) { console.warn('[Email] No se pudo obtener email del instalador'); }
                }
            }
            recipients.push({ email, mode, name });
        }

        // 2. Validar emails
        const missing = recipients.filter(r => !r.email || !r.email.includes('@'));
        if (missing.length > 0) {
            const msgList = missing.map(r => `• ${r.name || r.mode}: sin email registrado`).join('\n');
            setConfirmConfig({ title: 'Faltan emails', message: `❌ No se puede enviar a:\n${msgList}`, confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingEmail(false); } });
            return;
        }

        // 3. Generar HTML de la propuesta (una vez)
        const element = proposalRef.current;
        if (!element) { setConfirmConfig({ title: 'Error', message: '❌ No se puede acceder al contenido de la propuesta.', confirmText: 'Aceptar', onConfirm: () => { setConfirmConfig(null); setSendingEmail(false); } }); return; }
        const fullHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"><style>${baseCss} body{margin:0;padding:0;background:#e5e7eb;display:flex;justify-content:center;align-items:flex-start;min-height:100vh;font-family:'Inter',sans-serif;}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}.web-document-container{width:100%;min-height:1123px;background:white;margin:0;}@media screen{.web-document-container{max-width:794px;margin:40px auto;box-shadow:0 20px 25px -5px rgba(0,0,0,.1);border-radius:8px;overflow:hidden;}}@media print{body{background:white;display:block;}.web-document-container{margin:0;max-width:100%;width:100%;border-radius:0;}}</style></head><body><div class="web-document-container"><div class="prop-wrapper-inner">${element.innerHTML}</div></div></body></html>`;

        const f = result || {};
        const fAero = f.financials || {};
        const f80 = f.financialsRes080 || {};
        const isReforma = !!inputs?.isReforma;
        const isOnlyReforma = isReforma && inputs?.comparativaReforma === false;
        const isBoth = isReforma && inputs?.comparativaReforma !== false;
        const clienteName = clienteInfo?.name || inputs?.referenciaCliente || '';

        // 4. Enviar a cada destinatario
        const results = [];
        for (let i = 0; i < recipients.length; i++) {
            const { email, mode, name } = recipients[i];
            const isB2B = mode === 'PARTNER' || mode === 'INSTALADOR';
            setConfirmConfig({ title: `Enviando ${i + 1}/${recipients.length}...`, message: `Enviando a ${name} (${email})...`, confirmText: null, cancelText: null });
            try {
                const summaryData = {
                    id: displayId, urlId,
                    mode,
                    clienteName: isB2B ? clienteName : undefined,
                    isReforma, isOnlyReforma, isBoth,
                    caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`,
                    irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`,
                    totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €`,
                    fAero: { caeBonus: `${formatNumber(Math.round(fAero.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(fAero.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(fAero.totalAyuda || 0))} €` },
                    f80: isReforma ? { caeBonus: `${formatNumber(Math.round(f80.caeBonus || 0))} €`, irpfDeduction: `${formatNumber(Math.round(f80.irpfDeduction || 0))} €`, totalAyuda: `${formatNumber(Math.round(f80.totalAyuda || 0))} €` } : null,
                    htmlTable: ''
                };
                const r = await axios.post('/api/pdf/send-proposal', { html: fullHtml, to: email, userName: name, summaryData }, { timeout: 90000 });
                results.push({ name, ok: r.data?.success === true });
            } catch (e) {
                results.push({ name, ok: false, error: e.response?.data?.message || e.message });
            }
        }

        // 5. Marcar como ENVIADA si cliente recibió con éxito
        if (selectedModes.includes('CLIENTE') && results.some(r => r.ok)) {
            try { await axios.patch(`/api/oportunidades/${inputs.id_oportunidad}/estado`, { nuevo_estado: 'ENVIADA' }); } catch (e) { console.warn('[Email] No se pudo actualizar estado'); }
        }

        const allOk = results.every(r => r.ok);
        const summary = results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}${!r.ok && r.error ? ': ' + r.error : ''}`).join('\n');
        setConfirmConfig({ title: allOk ? '¡Correos enviados!' : 'Resultado del envío', message: summary, confirmText: 'Aceptar', onConfirm: () => setConfirmConfig(null) });
        setSendingEmail(false);
    }, [inputs, result, displayId, urlId, proposalRef, clienteInfo, partnerInfo, instaladorInfo]);



    const handleSaveToDrive = async () => {
        if (!inputs.id_oportunidad || !inputs.drive_folder_id) {
            const confirmed = await showConfirm(
                "Para guardar en Google Drive, primero debes guardar el expediente del cliente en el sistema. ¿Deseas guardarlo ahora?",
                'Expediente no Guardado',
                'warning'
            );
            if (confirmed) {
                onSaveRequest();
            }
            return;
        }

        setSavingToDrive(true);
        try {
            const fullHtml = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
                    <style>
                        ${baseCss}
                        body { margin: 0; padding: 0; background: white; }
                        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
                    </style>
                </head>
                <body>
                    <div class="prop-wrapper-inner">
                        ${proposalRef.current.innerHTML}
                    </div>
                </body>
                </html>
            `;

            const fileName = `Propuesta_${inputs.id_oportunidad}_${inputs.referenciaCliente || 'Cliente'}.pdf`;
            const response = await axios.post('/api/pdf/save-to-drive', {
                html: fullHtml,
                folderId: inputs.drive_folder_id,
                fileName: fileName
            }, { timeout: 90000 });

            if (response.data.success) {
                showAlert("La propuesta ha sido generada y guardada correctamente en la carpeta de Drive del cliente.", "Guardado en Drive", "success");
            } else {
                throw new Error(response.data.message || "Respuesta fallida del servidor");
            }
        } catch (err) {
            console.error('Error saving to Drive:', err);
            const msg = err.response?.data?.message || err.message || 'Error desconocido';
            showAlert("No se pudo guardar la propuesta en Drive: " + msg, "Error de Guardado", "error");
        } finally {
            setSavingToDrive(false);
        }
    };


    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-bkg-deep/60 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div className="bg-bkg-surface/95 backdrop-blur-2xl rounded-2xl max-w-6xl w-full h-[92vh] flex flex-col overflow-hidden border border-white/10 shadow-3xl relative" onClick={e => e.stopPropagation()}>

                <div className="flex justify-between items-center p-5 bg-white/[0.03] border-b border-white/[0.08] backdrop-blur-md">
                    <h3 className="text-white font-black text-xl flex items-center gap-3 tracking-tight">
                        <div className="w-10 h-10 rounded-xl bg-brand/10 flex items-center justify-center border border-brand/20">
                            <span className="text-brand text-xl">📄</span>
                        </div>
                        Vista Previa de Propuesta
                    </h3>
                    <div className="flex gap-3">
                        {/* Botón AÑADIR ANEXOS */}
                        <button
                            onClick={() => setIsAnexosOpen(true)}
                            title="Añadir presupuesto u otros anexos"
                            className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90 relative"
                        >
                            <svg className="w-8 h-8 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                            </svg>
                            {attachments.length > 0 && (
                                <div className="absolute top-1 right-0 w-4 h-4 bg-brand text-black text-[9px] font-black rounded-full flex items-center justify-center shadow-md">
                                    {attachments.length}
                                </div>
                            )}
                        </button>

                        {/* Botón ENVIAR POR EMAIL (Avioncito) */}
                        <button
                            onClick={handleSendByEmail}
                            disabled={sendingEmail}
                            title="Enviar propuesta por correo electrónico al cliente"
                            className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90"
                        >
                            {sendingEmail ? (
                                <div className="w-6 h-6 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                            ) : (
                                <div className="relative flex items-center justify-center group-hover:drop-shadow-[0_0_8px_rgba(255,109,0,0.3)]">
                                    <svg className="w-9 h-9 transition-transform group-hover:rotate-12 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                    </svg>
                                    <div className="absolute top-1 -right-1 w-2.5 h-2.5 bg-brand rounded-full border border-dark animate-pulse shadow-[0_0_6px_rgba(255,109,0,0.5)]" />
                                </div>
                            )}
                        </button>

                        {/* Botón ENVIAR POR WHATSAPP */}
                        <button
                            onClick={handleSendByWhatsapp}
                            disabled={sendingWhatsapp}
                            title="Enviar propuesta por WhatsApp al cliente (requiere móvil registrado)"
                            className="text-white/40 hover:text-emerald-400 w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90"
                        >
                            {sendingWhatsapp ? (
                                <div className="w-6 h-6 border-2 border-emerald-400/20 border-t-emerald-400 rounded-full animate-spin" />
                            ) : (
                                <div className="relative flex items-center justify-center group-hover:drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]">
                                    <svg className="w-8 h-8 transition-transform group-hover:-translate-y-0.5" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                    </svg>
                                </div>
                            )}
                        </button>

                        {/* Botón DRIVE (Minimalista) */}
                        {/* Botón ARCHIVAR EN DRIVE (Carpeta + Flecha) - Solo ADMIN */}
                        {user?.rol === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingToDrive}
                                title="Guardar propuesta en la carpeta Drive del cliente"
                                className="text-white/40 hover:text-brand w-12 h-12 flex items-center justify-center transition-all hover:bg-white/5 rounded-2xl border border-transparent hover:border-white/10 shrink-0 group active:scale-90"
                            >
                                {savingToDrive ? (
                                    <div className="w-6 h-6 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                                ) : (
                                    <div className="relative flex items-center justify-center group-hover:drop-shadow-[0_0_8px_rgba(255,109,0,0.3)]">
                                        {/* Icono de Carpeta */}
                                        <svg className="w-9 h-9 transition-transform group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.2}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                                        </svg>
                                        {/* Flecha de descarga */}
                                        <div className="absolute inset-0 flex items-center justify-center pt-2">
                                            <svg className="w-3.5 h-3.5 text-brand animate-bounce-subtle" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v13m0 0l-4-4m4 4l4-4" />
                                            </svg>
                                        </div>
                                    </div>
                                )}
                            </button>
                        )}

                        <button
                            onClick={handleDownloadPdf}
                            disabled={generating}
                            className="bg-brand hover:scale-105 active:scale-95 text-black font-black px-8 py-2.5 rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-lg shadow-brand/20"
                        >
                            {generating ? 'Generando...' : 'Descargar PDF'}
                            {!generating && (
                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-white/20 hover:text-white p-3 rounded-full hover:bg-white/5 border border-white/0 hover:border-white/10 transition-all"
                        >
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                <div ref={containerRef} className="flex-1 overflow-auto bg-neutral-900/50 p-4 sm:p-12 flex justify-center custom-scrollbar">

                    <div className="prop-wrapper" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', marginBottom: scale < 1 ? `-${1123 * totalPages * (1 - scale)}px` : '0', height: `${1123 * totalPages + 100}px` }}>
                        <div ref={proposalRef} className="prop-wrapper-inner" style={{ fontFamily: 'var(--font-family)' }}>
                            <style dangerouslySetInnerHTML={{ __html: baseCss }} />

                            {anexoPosition === 'before' && renderAnexos()}

                            {/* <!-- PAGINA 1 --> */}
                            <div className={`prop-page${showAnnualSavings ? ' prop-compact' : ''}`}>
                                <div className="prop-hero">
                                    <div className="prop-hero-top">
                                        <div className="prop-logo"><h1>BROKER<span>GY</span></h1><div className="prop-ltag">Especialistas en eficiencia energética</div></div>
                                        <div className="prop-hmeta"><strong>Propuesta Nº {displayId}</strong>Fecha: {formattedDate}<br />Oferta válida hasta: {formattedValidDate}</div>
                                    </div>
                                    <div className="prop-hline"></div>
                                    <div className="prop-htitle"><h2>Propuesta de <em>Bono Energético CAE</em> y servicios de eficiencia energética</h2></div>
                                    <div className="prop-hsub">Resumen personalizado de ayudas, subvenciones y deducciones fiscales</div>
                                </div>
                                <div className="prop-cbar">
                                    <div className="prop-cf"><span className="prop-cl">Cliente</span><span className="prop-cv">{inputs?.referenciaCliente || 'Sin Asignar'}</span></div>
                                    <div className="prop-cf"><span className="prop-cl">Ref. Catastral</span><span className="prop-cv">{inputs?.rc || 'MANUAL'}</span></div>
                                    <div className="prop-cf"><span className="prop-cl">Dirección</span><span className="prop-cv">{inputs?.direccion || inputs?.address || '---'}</span></div>
                                </div>
                                <div className="prop-pb" style={{ paddingTop: showAnnualSavings ? '16px' : '22px' }}>
                                    <div className="prop-stag"><span className="prop-sn">1</span><span className="prop-st">Sus ayudas</span></div>
                                    <div className="prop-stitle">Análisis de subvenciones y deducciones</div>
                                    <p className="prop-sintro">
                                        {isBoth 
                                            ? 'Hemos comparado su inversión actual en aerotermia frente a una reforma energética integral. Aquí tiene el desglose de ambas opciones:' 
                                            : isReforma
                                                ? 'Hemos analizado su proyecto de reforma energética y calculado las ayudas máximas a las que puede acceder. Este es el desglose personalizado de su propuesta.'
                                                : 'Hemos analizado su proyecto de mejora energética y calculado las ayudas máximas a las que puede acceder. Este es el desglose personalizado de su propuesta.'
                                        }
                                    </p>

                                    <div id="proposal-financial-capture" className={isBoth ? 'prop-fgrid' : ''}>
                                        {/* TABLA 1: AEROTERMIA (Siempre que no sea OnlyReforma) */}
                                        {!isOnlyReforma && (
                                            <div className={isBoth ? 'prop-fcol' : ''}>
                                                {isBoth && <div className="prop-ftable-title"><i style={{background:'var(--orange)'}}></i> OPCIÓN 1: AEROTERMIA</div>}
                                                    <div className="prop-ftable">
                                                        <div className="prop-fth" style={{background: 'var(--dark)'}}><span>Concepto</span><span>Importe</span></div>
                                                        <div className="prop-ftr"><span className="prop-fl">Inversión sustitución de caldera por aerotermia <small>(IVA INC.)</small></span><span className="prop-fv">{formatNumber(f.presupuesto)} €</span></div>
                                                        <div className="prop-ftr"><span className="prop-fl">Bono Energético CAE <small>(Ingreso Bruto)</small> {!f.isParticular && f.titularType !== 'particular' ? <small>(IVA INC.)</small> : ''}</span><span className="prop-fv grn">– {formatNumber(f.caeBonus)} €</span></div>
                                                        
                                                        {f.irpfCaeAmount > 0 && (
                                                            <div className="prop-ftr">
                                                                <span className="prop-fl">Impuestos aplicables por cobro de ayuda CAE <small>(Estimado)</small></span>
                                                                <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.irpfCaeAmount)} €</span>
                                                            </div>
                                                        )}

                                                    {f.caeMaintenanceCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Gestión tramitación Expediente CAE</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.caeMaintenanceCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f.legalizationCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Legalización Instalación</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.legalizationCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f.itpCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Ajuste Fiscal: Notaría e ITP</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f.itpCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f.irpfCap > 0 && Array.from({ length: Math.max(1, f.numOwners || 1) }).map((_, index) => (
                                                        <div key={`owner-${index}`} className="prop-ftr">
                                                            <span className="prop-fl">Deducción en el IRPF Propietario {index + 1} <small>({f.irpfRate}%, Límite {formatNumber(f.irpfCap)} €)</small></span>
                                                            <span className="prop-fv grn">– {formatNumber(f.irpfDeductionPerOwner || f.irpfDeduction)} €</span>
                                                        </div>
                                                    ))}

                                                    <div className="prop-ftaids" style={{background: 'var(--yellow)'}}>
                                                        <span className="prop-fl">AYUDA TOTAL ESTIMADA</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '16px' : '20px'}}>{formatNumber(f.totalBeneficioFiscal || f.totalAyuda)} €</span>
                                                    </div>
                                                    <div className="prop-ftpct" style={{background: 'var(--green-light)'}}>
                                                        <span className="prop-fl">PORCENTAJE CUBIERTO GRACIAS A LAS AYUDAS</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '14px' : '18px'}}>{formatNumber(f.porcentajeCubierto)}%</span>
                                                    </div>
                                                    <div className="prop-ftfin" style={{background: 'var(--dark)'}}>
                                                        <span className="prop-fl">INVERSIÓN NETA FINAL</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '18px' : '30px'}}>{formatNumber(f.costeFinal)} €</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* TABLA 2: REFORMA (Si es Both o OnlyReforma) */}
                                        {(isBoth || isOnlyReforma) && f80 && (
                                            <div className={isBoth ? 'prop-fcol' : ''}>
                                                {isBoth && <div className="prop-ftable-title"><i style={{background:'var(--green)'}}></i> OPCIÓN 2: AEROTERMIA + REFORMA</div>}
                                                    <div className="prop-ftable">
                                                        <div className="prop-fth" style={{background: 'var(--dark)'}}><span>Concepto</span><span>Importe</span></div>
                                                        <div className="prop-ftr"><span className="prop-fl">Inversión Reforma de Vivienda + Aerotermia <small>(IVA INC.)</small></span><span className="prop-fv">{formatNumber(f80.presupuesto)} €</span></div>
                                                        <div className="prop-ftr"><span className="prop-fl">Bono Energético CAE <small>(Ingreso Bruto)</small> {!f80.isParticular && f80.titularType !== 'particular' ? <small>(IVA INC.)</small> : ''}</span><span className="prop-fv grn">– {formatNumber(f80.caeBonus)} €</span></div>
                                                        
                                                        {f80.irpfCaeAmount > 0 && (
                                                            <div className="prop-ftr">
                                                                <span className="prop-fl">Impuestos aplicables por cobro de ayuda CAE <small>(Estimado)</small></span>
                                                                <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.irpfCaeAmount)} €</span>
                                                            </div>
                                                        )}

                                                    {f80.caeMaintenanceCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Gestión tramitación Expediente CAE</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.caeMaintenanceCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f80.legalizationCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Legalización Instalación</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.legalizationCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f80.itpCost > 0 && (
                                                        <div className="prop-ftr">
                                                            <span className="prop-fl">Ajuste Fiscal: Notaría e ITP</span>
                                                            <span className="prop-fv" style={{ color: 'var(--red)' }}>+ {formatNumber(f80.itpCost)} €</span>
                                                        </div>
                                                    )}

                                                    {f80.irpfCap > 0 && Array.from({ length: Math.max(1, f80.numOwners || 1) }).map((_, index) => (
                                                        <div key={`owner80-${index}`} className="prop-ftr">
                                                            <span className="prop-fl">Deducción en el IRPF Propietario {index + 1} <small>({f80.irpfRate}%, Límite {formatNumber(f80.irpfCap)} €)</small></span>
                                                            <span className="prop-fv grn">– {formatNumber(f80.irpfDeductionPerOwner || f80.irpfDeduction)} €</span>
                                                        </div>
                                                    ))}

                                                    <div className="prop-ftaids" style={{background: 'var(--yellow)'}}>
                                                        <span className="prop-fl">AYUDA TOTAL ESTIMADA</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '16px' : '20px'}}>{formatNumber(f80.totalBeneficioFiscal || f80.totalAyuda)} €</span>
                                                    </div>
                                                    <div className="prop-ftpct" style={{background: 'var(--green-light)'}}>
                                                        <span className="prop-fl">PORCENTAJE CUBIERTO GRACIAS A LAS AYUDAS</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '14px' : '18px'}}>{formatNumber(f80.porcentajeCubierto)}%</span>
                                                    </div>
                                                    <div className="prop-ftfin" style={{background: 'var(--dark)'}}>
                                                        <span className="prop-fl">INVERSIÓN NETA FINAL</span>
                                                        <span className="prop-fv" style={{fontSize: isBoth ? '18px' : '30px'}}>{formatNumber(f80.costeFinal)} €</span>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <div className="prop-nsm">
                                        <p><b>NOTA 1:</b> La ayuda Bono Energético CAE está garantizada por Brokergy. El importe es una estimación técnica que se ajustará tras emitir los CEE inicial y final.</p>
                                        {f.irpfCap > 0 && (
                                            <p><b>NOTA 2:</b> Las deducciones en el IRPF no suponen un descuento directo, sino un derecho a deducción en la renta. El ahorro dependerá de la situación fiscal del contribuyente.</p>
                                        )}
                                        {showAnnualSavings && (
                                            <p><b>NOTA 3:</b> El análisis de ahorro anual es un cálculo teórico basado en datos climáticos zonales. Los resultados reales dependerán de los hábitos de uso.</p>
                                        )}
                                        <div className="prop-avl">Aviso: Los cálculos son estimaciones teóricas. Los consumos reales pueden variar.</div>
                                    </div>

                                    {showAnnualSavings && (
                                        <div className="prop-ftable" style={{ marginTop: '10px' }}>
                                            <div className="prop-fth" style={{ background: 'var(--dark)', padding: '7px 22px' }}><span>Análisis de Ahorro y Rentabilidad</span><span>Importe</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto aproximado actual con {annualSavings.fuelLabel}</span><span className="prop-fv" style={{ color: 'var(--red)' }}>{formatNumber(Math.round(annualSavings.costeActual))} €/año</span></div>
                                            <div className="prop-ftr"><span className="prop-fl">Gasto estimado con Aerotermia</span><span className="prop-fv grn">{formatNumber(Math.round(annualSavings.costeNuevo))} €/año</span></div>
                                            <div className="prop-ftpct"><span className="prop-fl">Ahorro económico anual</span><span className="prop-fv" style={{ fontWeight: '900', fontSize: '18px', color: 'var(--green-dark)' }}>{formatNumber(Math.round(annualSavings.ahorroAnual))} €</span></div>
                                            {payback && payback.paybackYears < 100 && (
                                                <div className="prop-ftfin" style={{ padding: '10px 22px' }}><span className="prop-fl" style={{ fontSize: '11px' }}>Plazo de amortización de la inversión</span><span className="prop-fv" style={{ fontSize: '22px' }}>{formatNumber(payback.paybackYears)} años</span></div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div className="prop-cta">
                                    <h3>¿Listo para empezar a ahorrar?</h3>
                                    <p className="prop-csub">Acepte esta propuesta y comenzaremos a trabajar en su expediente de inmediato.</p>
                                    <a href={`${APP_URL}/firma/${urlId}`} target="_blank" rel="noopener noreferrer" className="prop-cta-btn">✍️&nbsp;&nbsp;FIRMAR Y ACEPTAR PROPUESTA</a>
                                    <p className="prop-cfn">Al firmar, acepta las condiciones descritas en este documento. Será redirigido a un formulario seguro.</p>
                                </div>
                            </div>

                            {/* <!-- PAGINA 2 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '30px' }}>
                                    <div className="prop-stag"><span className="prop-sn">2</span><span className="prop-st">Bono Energético CAE</span></div>
                                    <div className="prop-stitle">¿Qué son los Certificados de Ahorro Energético?</div>
                                    <p className="prop-sintro">Los CAE son un mecanismo regulado por el Ministerio para la Transición Ecológica y el Reto Demográfico (Real Decreto 36/2023) que premia económicamente las acciones de eficiencia energética realizadas en hogares y negocios.</p>

                                    <div className="prop-ebox" style={{ background: 'var(--g50)', borderLeft: '3px solid var(--dark)', marginBottom: '10px' }}>
                                        <h4>¿Cómo funcionan?</h4>
                                        <p>Cuando usted realiza una mejora que ahorra energía en su vivienda — como sustituir una caldera antigua por aerotermia, mejorar el aislamiento o cambiar ventanas — ese ahorro se puede cuantificar y convertir en un beneficio económico real a través de los Certificados de Ahorro Energético, dentro de un sistema oficial respaldado por el Gobierno de España.</p>
                                        <p>Las grandes empresas energéticas (llamadas "sujetos obligados") están obligadas por ley a comprar estos certificados. Sin embargo, <strong>solo adquieren CAE en grandes volúmenes</strong> y no negocian directamente con particulares. Además, el proceso requiere documentación técnica especializada, emisión de facturas específicas y una gestión administrativa compleja.</p>
                                    </div>

                                    <div className="prop-ebox ora">
                                        <h4>¿Por qué elegirnos? La solución BROKERGY</h4>
                                        <p>BROKERGY actúa como su intermediario especializado. Agrupamos su expediente con otros similares para crear paquetes atractivos para los grandes compradores, gestionamos toda la documentación técnica y administrativa, y negociamos directamente con los sujetos obligados para obtener el máximo precio por sus certificados.</p>
                                        <p><strong>Usted no tiene que preocuparse de nada:</strong> nosotros nos encargamos de todo el proceso de principio a fin, y usted solo necesita firmar dos documentos. Sin papeleo, sin complicaciones, y con la garantía de cobro.</p>
                                    </div>

                                    <div className="prop-agrid">
                                        <div className="prop-ac" style={{ background: 'var(--green-light)', borderColor: 'rgba(92,184,92,0.2)' }}><div className="prop-ai" style={{ fontSize: '22px' }}>🏆</div><div className="prop-at">100% de éxito</div><div className="prop-as">Todos los expedientes tramitados resueltos favorablemente</div></div>
                                        <div className="prop-ac"><div className="prop-ai" style={{ fontSize: '22px' }}>💸</div><div className="prop-at">Cobro 3-6 meses</div><div className="prop-as">Pago íntegro en plazo garantizado</div></div>
                                        <div className="prop-ac"><div className="prop-ai" style={{ fontSize: '22px' }}>📋</div><div className="prop-at">Solo 2 firmas</div><div className="prop-as">Mínima participación por su parte</div></div>
                                        <div className="prop-ac" style={{ background: 'var(--orange-light)', borderColor: 'rgba(245,166,35,0.2)' }}><div className="prop-ai" style={{ fontSize: '22px' }}>🎯</div><div className="prop-at">Sin adelantos</div><div className="prop-as">Cobramos a éxito del expediente</div></div>
                                    </div>

                                    {f.irpfCap > 0 && (
                                        <>
                                            <div className="prop-sdiv"></div>

                                            <div className="prop-stag"><span className="prop-sn">3</span><span className="prop-st">Ahorro adicional</span></div>
                                            <div className="prop-stitle">Deducciones en el IRPF — Hasta un 60%</div>
                                            <p className="prop-sintro">Además del Bono Energético, como contribuyente del IRPF puede deducirse hasta el 60% de la inversión (límite 9.000 €) en su declaración de la renta.</p>
                                            <div className="prop-ebox grn">
                                                <h4>Requisitos principales</h4>
                                                <p>Ser contribuyente del IRPF. Disponer de CEE antes y después de la actuación. No pagar en efectivo. Declarar en el ejercicio de la obra (ej: obras 2026 → renta 2027). Máximo deducible por año: 3.000 €; el exceso se prorratea en años siguientes.</p>
                                                <p style={{ marginTop: '6px', borderTop: '1px solid rgba(0,200,83,0.1)', paddingTop: '6px', fontSize: '10px' }}>
                                                    <b>Ámbito subjetivo:</b> Únicamente podrán aplicar la deducción los contribuyentes <b>propietarios</b> de las viviendas. Quedan excluidos nudos propietarios, usufructuarios y arrendatarios.
                                                </p>
                                                <p style={{ marginTop: '4px', fontSize: '8.5px' }}>
                                                    <a href="https://sede.agenciatributaria.gob.es/Sede/ayuda/manuales-videos-folletos/manuales-practicos/irpf-2025/c16-deducciones-generales-cuota/deducciones-obras-mejora-eficiencia-energetica-viviendas/obras-rehabilitacion-energetica-edificios.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--green-dark)', textDecoration: 'none', fontWeight: '700' }}>
                                                        ➜ Ampliar información en la Sede Electrónica de la Agencia Tributaria
                                                    </a>
                                                </p>
                                            </div>

                                            {(() => {
                                                const deduction = f.irpfDeductionPerOwner || f.irpfDeduction;
                                                const maxPerYear = 3000;
                                                const baseYear = new Date().getFullYear() + 1;
                                                const years = [];
                                                let remaining = deduction;
                                                while (remaining > 0 && years.length < 3) {
                                                    const amount = Math.min(remaining, maxPerYear);
                                                    years.push({ year: baseYear + years.length, amount });
                                                    remaining -= amount;
                                                }
                                                return deduction > maxPerYear ? (
                                                    <>
                                                        <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)' }}>Ejemplo de prorrateo (deducción de {formatNumber(deduction)} €):</p>
                                                        <div className="prop-irow">
                                                            {years.map(y => (
                                                                <div key={y.year} className="prop-ibox"><div className="prop-iy">Renta {y.year}</div><div className="prop-ia">{formatNumber(y.amount)} €</div></div>
                                                            ))}
                                                        </div>
                                                        <p style={{ fontSize: '9px', color: 'var(--g400)', fontStyle: 'italic', marginTop: '2px' }}>Cuando la vivienda es de propiedad compartida, los límites se aplican por contribuyente, pudiendo duplicarse la ayuda.</p>
                                                    </>
                                                ) : (
                                                    <>
                                                        <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)' }}>Ejemplo (deducción de {formatNumber(deduction)} €):</p>
                                                        <div className="prop-irow">
                                                            <div className="prop-ibox"><div className="prop-iy">Renta {baseYear}</div><div className="prop-ia">{formatNumber(deduction)} €</div></div>
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </>
                                    )}

                                    <div className="prop-sdiv"></div>

                                    <div className="prop-stag"><span className="prop-sn">{f.irpfCap > 0 ? '4' : '3'}</span><span className="prop-st">Proceso</span></div>
                                    <div className="prop-stitle">Pasos para obtener su Bono Energético</div>
                                    <div className="prop-srow">
                                        <div className="prop-sl"></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>01</div><div className="prop-pt">CEE Inicial</div><div className="prop-pd">Certificado antes de obra</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>02</div><div className="prop-pt">Reforma</div><div className="prop-pd">Mejora energética</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>03</div><div className="prop-pt">CEE Final</div><div className="prop-pd">Certificado posterior</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>04</div><div className="prop-pt">Facturas</div><div className="prop-pd">Recopilar facturas</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>05</div><div className="prop-pt">Expediente</div><div className="prop-pd">Tramitación CAE</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#5CB85C,#3D8B3D)' }}>06</div><div className="prop-pt">Justificación</div><div className="prop-pd">Verificación técnica</div></div>
                                        <div className="prop-ps"><div className="prop-pn" style={{ background: 'linear-gradient(135deg,#F5A623,#E0900F)' }}>07</div><div className="prop-pt">Cobro</div><div className="prop-pd">Recepción importe</div></div>
                                    </div>
                                </div>
                                <div className="prop-mfoot"><span>BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L.</span><span><a href="mailto:info@brokergy.es">info@brokergy.es</a> · <a href="tel:623926179">623 926 179</a> · <a href="https://www.brokergy.es">brokergy.es</a></span></div>
                            </div>

                            {/* <!-- PAGINA 3 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '28px' }}>
                                    <div className="prop-stag"><span className="prop-sn">5</span><span className="prop-st">Documentación</span></div>
                                    <div className="prop-stitle">¿Qué debe preparar para continuar?</div>
                                    <p className="prop-sintro" style={{ marginBottom: '14px' }}>Para agilizar la tramitación, necesitaremos la siguiente documentación. Puede enviarla por email o WhatsApp.</p>
                                    <div className="prop-dcols">
                                        <div className="prop-dcol">
                                            <div className="prop-dph">Antes de la obra</div>

                                            <div className="prop-dgt">📐 Documentación técnica de la vivienda</div>
                                            <ul className="prop-dl">
                                                <li>Planos (si existen) o croquis de la vivienda</li>
                                                <li>Fotografías de la caldera existente:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características totalmente legible</li>
                                                <li className="s">Si no está instalada: fotos del hueco donde estaba</li>
                                                <li>Fotografías del sistema de emisión:</li>
                                                <li className="s">Radiadores (al menos uno por estancia)</li>
                                                <li className="s">Suelo radiante (foto del cuadro/colector)</li>
                                            </ul>

                                            <div className="prop-dgt">🏠 Documentación de envolvente</div>
                                            <ul className="prop-dl">
                                                <li>Vídeo recorriendo la vivienda mostrando:</li>
                                                <li className="s">Ventanas, puertas y accesos a exteriores</li>
                                                <li className="s">Estancias y distribución general</li>
                                                <li>Fotos de todas las paredes exteriores (incl. patios):</li>
                                                <li className="s">Ventanas y puertas</li>
                                                <li className="s">Cerramientos singulares</li>
                                            </ul>

                                            <div className="prop-dgt">➕ Mejoras que pueden aumentar la ayuda</div>
                                            <ul className="prop-dl">
                                                <li>Si valora mejorar ventanas o añadir aislamiento:</li>
                                                <li className="s">Fotografías y/o vídeos de los elementos a sustituir</li>
                                                <li className="s">Presupuestos disponibles (ventanas, aislamiento…)</li>
                                            </ul>
                                        </div>
                                        <div className="prop-dcol">
                                            <div className="prop-dph gr">Después de la obra</div>
                                            <p style={{ fontSize: '9.5px', color: 'var(--g500)', marginBottom: '8px', lineHeight: '1.5' }}>Una vez finalizada la instalación, debemos justificar técnicamente la actuación y emitir el CEE Final.</p>

                                            <div className="prop-dgt">📸 Documentación fotográfica</div>
                                            <ul className="prop-dl">
                                                <li>Fotos del desmontaje de la caldera antigua</li>
                                                <li>Fotos de la caldera antigua ya desmontada</li>
                                                <li>Fotos de la unidad exterior nueva:</li>
                                                <li className="s">Vista general instalada</li>
                                                <li className="s">Placa de características visible y legible</li>
                                                <li>Fotos de la unidad interior de ACS y/o depósitos de inercia, con sus placas identificativas</li>
                                            </ul>

                                            <div className="prop-dgt">📄 Documentación obligatoria</div>
                                            <ul className="prop-dl">
                                                <li>Todas las facturas de la instalación (materiales + mano de obra)</li>
                                                <li>Certificado RITE de la instalación térmica</li>
                                                <li>Si existen depósitos ACS, buffer o kits hidráulicos externos: fotos y placas identificativas</li>
                                            </ul>

                                            <div style={{ background: 'var(--green-light)', border: '1px solid rgba(92,184,92,0.15)', borderRadius: '6px', padding: '10px 12px', marginTop: '12px' }}>
                                                <p style={{ fontSize: '9.5px', fontWeight: '700', color: 'var(--green-dark)', marginBottom: '3px' }}>📩 ¿Cómo enviar la documentación?</p>
                                                <p style={{ fontSize: '9.5px', color: 'var(--g600)', lineHeight: '1.5' }}>Puede enviar toda la documentación a <strong>info@brokergy.es</strong> o por WhatsApp al <strong>623 926 179</strong>. No es necesario enviarla toda de una vez; puede ir recopilándola progresivamente.</p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="prop-tipbar">
                                        <h5>⚠️ Recomendaciones para evitar retrasos en el expediente</h5>
                                        <p>Las placas de características deben ser completamente legibles. Las fotos deben hacerse con buena luz y evitando reflejos. Si la caldera antigua se retira antes de contactarnos, es imprescindible documentar bien el hueco donde estaba ubicada. Se debe comprobar que el modelo de aerotermia coincide exactamente con el presupuesto inicial, ya que afecta directamente al cálculo del CAE.</p>
                                    </div>

                                    <div style={{ background: 'var(--orange-light)', border: '1px solid rgba(245,166,35,0.2)', borderRadius: '8px', padding: '14px 18px', marginTop: '14px', display: 'flex', gap: '18px', alignItems: 'center' }}>
                                        <div style={{ fontSize: '32px', flexShrink: 0 }}>💡</div>
                                        <div>
                                            <p style={{ fontSize: '10.5px', fontWeight: '700', color: 'var(--dark)', marginBottom: '3px' }}>¿Sabía que puede aumentar considerablemente su ayuda?</p>
                                            <p style={{ fontSize: '10px', color: 'var(--g600)', lineHeight: '1.55' }}>Si además de la aerotermia tiene previsto mejorar las ventanas o el aislamiento térmico de su vivienda, el ahorro energético certificado será mayor, lo que se traduce en un <strong>importe CAE significativamente superior</strong>. Consúltenos sin compromiso y le realizaremos una nueva simulación incluyendo estas mejoras.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="prop-mfoot"><span>BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L.</span><span><a href="mailto:info@brokergy.es">info@brokergy.es</a> · <a href="tel:623926179">623 926 179</a> · <a href="https://www.brokergy.es">brokergy.es</a></span></div>
                            </div>

                            {/* <!-- PAGINA 4 --> */}
                            <div className="prop-page">
                                <div className="prop-pb" style={{ paddingTop: '26px' }}>
                                    <div className="prop-stag"><span className="prop-sn">6</span><span className="prop-st">Condiciones</span></div>
                                    <div className="prop-stitle">Condiciones del acuerdo y costes del servicio</div>

                                    <div className="prop-cl-box ora">
                                        <h4>Cláusula 1 — Objeto del acuerdo</h4>
                                        <p>BROKERGY se compromete a realizar los Certificados de Eficiencia Energética (inicial y final) y a gestionar íntegramente el expediente del Certificado de Ahorro Energético (CAE) asociado a la actuación de mejora energética del cliente.</p>
                                    </div>

                                    <div className="prop-cl-box grn">
                                        <h4>Cláusula 2 — Cobro a éxito y desglose de costes</h4>
                                        <p>El cliente no deberá realizar ningún pago anticipado. Los costes serán descontados directamente del importe obtenido por la venta de los CAE, una vez resuelto favorablemente:</p>
                                        <div className="prop-cgrid">
                                            <div className="prop-crow"><span>Certificados de Eficiencia Energética (inicial + final){discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 220,00 €)</span>0,00 €</> : '220,00 €'}</strong></div>
                                            <div className="prop-crow"><span>Tasas registro de certificados de eficiencia energética{discountCerts && <em> (PROMOCIÓN BROKERGY 100% DTO.)</em>}</span><strong>{discountCerts ? <><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 32,78 €)</span>0,00 €</> : '32,78 €'}</strong></div>
                                            <div className="prop-crow"><span>Gestión técnica y adm. expediente CAE <em>(PROMOCIÓN BROKERGY 100% DTO.)</em></span><strong><span style={{ color: 'var(--g400)', fontWeight: 'normal', fontSize: '10px', marginRight: '6px' }}>(Coste sin dto: 450,00 €)</span>0,00 €</strong></div>
                                            <div className="prop-crow prop-ctot"><span>Total a descontar del importe del CAE</span><span>{formatNumber(totalDescuentoGestion)} € + IVA</span></div>
                                        </div>
                                        <div style={{ background: 'var(--green-light)', borderRadius: '5px', display: 'flex', justifyContent: 'space-between', padding: '9px 12px', marginTop: '6px', alignItems: 'center', border: '1px solid rgba(92,184,92,0.2)' }}>
                                            <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--green-dark)' }}>Importe CAE neto que recibirá el cliente</span>
                                            <span style={{ fontSize: '15px', fontWeight: '900', color: 'var(--green-dark)' }}>{formatNumber(caeNeto)} €*</span>
                                        </div>
                                        <p style={{ marginTop: '4px', fontSize: '9px', color: 'var(--g400)', fontStyle: 'italic' }}>* Importe estimado resultante de descontar los costes de gestión del Bono Energético CAE.</p>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 3 — Vinculación de servicios</h4>
                                        <p>La presente propuesta forma parte de una promoción vinculada a la realización de los CEE necesarios para la tramitación del expediente CAE. Los certificados emitidos por BROKERGY forman parte inseparable del mismo.</p>
                                    </div>

                                    <div className="prop-cl-box red">
                                        <h4>Cláusula 4 — Penalización por incumplimiento</h4>
                                        <p>Si los CEE son realizados por BROKERGY pero no se utilizan para gestionar el expediente CAE a través de BROKERGY —por causas ajenas a esta—, el cliente abonará en un máximo de 15 días naturales el importe total sin descuentos, en concepto de compensación:</p>
                                    </div>
                                    <div className="prop-ptable">
                                        <div className="prop-pthead">Desglose de penalización por incumplimiento</div>
                                        <div className="prop-ptrow"><span className="prop-pl">Certificados de Eficiencia Energética (inicial + final)</span><span className="prop-pv">220,00 €</span></div>
                                        <div className="prop-ptrow"><span className="prop-pl">Tasas registro de certificados de eficiencia energética</span><span className="prop-pv">32,78 €</span></div>
                                        <div className="prop-ptrow"><span className="prop-pl">Gestión técnica y adm. expediente CAE (sin dto.)</span><span className="prop-pv">450,00 €</span></div>
                                        <div className="prop-ptrow ptt"><span className="prop-pl">Total penalización</span><span className="prop-pv">702,78 € + IVA</span></div>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 5 — Vigencia de la oferta</h4>
                                        <p>Propuesta válida <strong>2 meses</strong> desde la fecha de emisión. El importe estimado del Bono Energético CAE se mantendrá hasta septiembre de 2026. Transcurrido el plazo sin aceptación expresa, la propuesta quedará sin efecto.</p>
                                    </div>

                                    <div className="prop-cl-box">
                                        <h4>Cláusula 6 — Protección de datos</h4>
                                        <p>BROKERGY tratará los datos personales conforme al RGPD y la LO 3/2018 exclusivamente para la gestión del expediente CAE. Derechos: info@brokergy.es.</p>
                                    </div>
                                </div>

                                <div className="prop-cta">
                                    <h3>¿Listo para empezar a ahorrar?</h3>
                                    <p className="prop-csub">Acepte esta propuesta de forma digital y comenzaremos a trabajar en su expediente de inmediato.</p>
                                    <a href={`${APP_URL}/firma/${urlId}`} target="_blank" rel="noopener noreferrer" className="prop-cta-btn">✍️&nbsp;&nbsp;FIRMAR Y ACEPTAR PROPUESTA</a>
                                    <p className="prop-cfn">Al firmar, acepta las condiciones descritas en este documento. Será redirigido a un formulario seguro.<br />© 2026 BROKERGY — Soluciones Sostenibles para Eficiencia Energética, S.L. · CIF: B19350222</p>
                                </div>
                            </div>

                            {anexoPosition === 'after' && renderAnexos()}
                        </div>
                    </div>
                </div>
            </div>
            <AppConfirm 
                isOpen={!!confirmConfig}
                {...confirmConfig}
                onCancel={confirmConfig?.onCancel || (() => setConfirmConfig(null))}
            />

            {/* POPUP DE SELECCIÓN DE DESTINATARIOS (multi-select) */}
            {recipientChoice && (() => {
                const toggleMode = (mode) => {
                    setRecipientSelections(prev => {
                        const next = new Set(prev);
                        next.has(mode) ? next.delete(mode) : next.add(mode);
                        return next;
                    });
                };
                const options = [
                    { mode: 'CLIENTE', label: 'CLIENTE', sublabel: clienteInfo?.name || inputs?.referenciaCliente || null, phone: clienteInfo?.phone || null, color: 'bg-primary-600/20 border-primary-500/40 hover:border-primary-500', checkColor: 'bg-primary-500' },
                    ...(partnerInfo ? [{ mode: 'PARTNER', label: 'DISTRIBUIDOR', sublabel: partnerInfo.name, phone: partnerInfo.phone, color: 'bg-[#25D366]/10 border-[#25D366]/30 hover:border-[#25D366]', checkColor: 'bg-[#25D366]' }] : []),
                    ...(instaladorInfo ? [{ mode: 'INSTALADOR', label: 'INSTALADOR', sublabel: instaladorInfo.name, phone: instaladorInfo.phone, color: 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500', checkColor: 'bg-amber-500' }] : []),
                ];
                const nSelected = recipientSelections.size;
                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        <div className="glass-card max-w-sm w-full p-7 border border-white/20 shadow-2xl bg-[#1c1e26] animate-scale-in rounded-[20px]">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-full bg-[#25D366]/20 flex items-center justify-center text-[#25D366] border border-[#25D366]/30 shrink-0">
                                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-tight">Enviar Propuesta por WhatsApp</h3>
                                    <p className="text-white/50 text-xs">Selecciona uno o varios destinatarios</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2.5 mb-5">
                                {options.map(opt => {
                                    const checked = recipientSelections.has(opt.mode);
                                    return (
                                        <button
                                            key={opt.mode}
                                            onClick={() => toggleMode(opt.mode)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${opt.color} ${checked ? 'ring-1 ring-white/20' : ''}`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all ${checked ? `${opt.checkColor} border-transparent` : 'border-white/30 bg-transparent'}`}>
                                                {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-black uppercase tracking-widest text-white/50">{opt.label}</div>
                                                {opt.sublabel && <div className="text-sm font-bold text-white truncate">{opt.sublabel}</div>}
                                                {opt.phone
                                                    ? <div className="text-[11px] text-white/40 font-mono">{opt.phone}</div>
                                                    : <div className="text-[11px] text-red-400/80">Sin teléfono</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => sendToMultiple(Array.from(recipientSelections))}
                                disabled={nSelected === 0}
                                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all mb-2 bg-[#25D366] hover:bg-[#20bd5a] text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-[#25D366]/20"
                            >
                                {nSelected === 0 ? 'Selecciona al menos uno' : `Enviar a ${nSelected} destinatario${nSelected > 1 ? 's' : ''}`}
                            </button>
                            <button onClick={() => setRecipientChoice(false)} className="w-full py-2 text-white/40 hover:text-white text-xs font-semibold tracking-wide transition-colors">
                                CANCELAR
                            </button>
                        </div>
                    </div>
                );
            })()}
            
            {/* POPUP DE SELECCIÓN DE DESTINATARIOS EMAIL (multi-select) */}
            {emailChoice && (() => {
                const toggleMode = (mode) => {
                    setEmailSelections(prev => {
                        const next = new Set(prev);
                        next.has(mode) ? next.delete(mode) : next.add(mode);
                        return next;
                    });
                };
                const options = [
                    { mode: 'CLIENTE', label: 'CLIENTE', sublabel: clienteInfo?.name || inputs?.referenciaCliente || null, contact: clienteInfo?.email || null, color: 'bg-primary-600/20 border-primary-500/40 hover:border-primary-500', checkColor: 'bg-primary-500' },
                    ...(partnerInfo ? [{ mode: 'PARTNER', label: 'DISTRIBUIDOR', sublabel: partnerInfo.name, contact: partnerInfo.email, color: 'bg-blue-500/10 border-blue-500/30 hover:border-blue-500', checkColor: 'bg-blue-500' }] : []),
                    ...(instaladorInfo ? [{ mode: 'INSTALADOR', label: 'INSTALADOR', sublabel: instaladorInfo.name, contact: instaladorInfo.email, color: 'bg-amber-500/10 border-amber-500/30 hover:border-amber-500', checkColor: 'bg-amber-500' }] : []),
                ];
                const nSelected = emailSelections.size;
                return (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in" onClick={(e) => e.stopPropagation()}>
                        <div className="glass-card max-w-sm w-full p-7 border border-white/20 shadow-2xl bg-[#1c1e26] animate-scale-in rounded-[20px]">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 border border-blue-500/30 shrink-0">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-white leading-tight">Enviar Propuesta por Email</h3>
                                    <p className="text-white/50 text-xs">Selecciona uno o varios destinatarios</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-2.5 mb-5">
                                {options.map(opt => {
                                    const checked = emailSelections.has(opt.mode);
                                    return (
                                        <button
                                            key={opt.mode}
                                            onClick={() => toggleMode(opt.mode)}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${opt.color} ${checked ? 'ring-1 ring-white/20' : ''}`}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center border-2 shrink-0 transition-all ${checked ? `${opt.checkColor} border-transparent` : 'border-white/30 bg-transparent'}`}>
                                                {checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-xs font-black uppercase tracking-widest text-white/50">{opt.label}</div>
                                                {opt.sublabel && <div className="text-sm font-bold text-white truncate">{opt.sublabel}</div>}
                                                {opt.contact
                                                    ? <div className="text-[11px] text-white/40 truncate">{opt.contact}</div>
                                                    : <div className="text-[11px] text-red-400/80">Sin email</div>}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            <button
                                onClick={() => sendEmailToMultiple(Array.from(emailSelections))}
                                disabled={nSelected === 0}
                                className="w-full py-3 rounded-xl font-black text-sm uppercase tracking-wider transition-all mb-2 bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-30 disabled:cursor-not-allowed shadow-lg shadow-blue-500/20"
                            >
                                {nSelected === 0 ? 'Selecciona al menos uno' : `Enviar a ${nSelected} destinatario${nSelected > 1 ? 's' : ''}`}
                            </button>
                            <button onClick={() => setEmailChoice(false)} className="w-full py-2 text-white/40 hover:text-white text-xs font-semibold tracking-wide transition-colors">
                                CANCELAR
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Modal de Gestión de Anexos */}
            {isAnexosOpen && <AnexosModal />}
        </div>
    );
}
