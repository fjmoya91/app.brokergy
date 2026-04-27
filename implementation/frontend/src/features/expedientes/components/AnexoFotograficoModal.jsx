import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';

// ── COVER CSS (shared styles for the cover) ─────────────────────────────────
const COVER_STYLES = `
    .cover-page {
        font-family: 'Arial MT', Arial, Helvetica, sans-serif;
        position: relative;
        overflow: hidden;
    }
    .cover-top-band {
        width: 100%;
        height: 70px;
        background: linear-gradient(135deg, #ee8f1f 0%, #f5a623 50%, #ee8f1f 100%);
        position: relative;
    }
    .cover-top-band::after {
        content: '';
        position: absolute;
        bottom: -30px;
        left: 0;
        width: 100%;
        height: 60px;
        background: white;
        transform: skewY(-2deg);
    }
    .cover-accent-bar {
        position: absolute;
        top: 0;
        left: 0;
        width: 8px;
        height: 100%;
        background: linear-gradient(180deg, #ee8f1f 0%, #d97706 100%);
    }
    .cover-logo-area {
        position: absolute;
        top: 10px;
        right: 30px;
        z-index: 10;
    }
    .cover-logo-area img {
        height: 180px;
    }
    .cover-title-section {
        margin-top: 80px;
        padding: 0 70px;
        text-align: left;
        position: relative;
    }
    .cover-title-section::before {
        content: '';
        display: block;
        width: 80px;
        height: 4px;
        background: linear-gradient(90deg, #ee8f1f, #f5a623);
        margin-bottom: 20px;
        border-radius: 2px;
    }
    .cover-title-section h1 {
        font-size: 24pt;
        font-weight: 900;
        color: #1a1a1a;
        line-height: 1.15;
        text-transform: uppercase;
        letter-spacing: 1px;
        margin: 0 0 8px 0;
    }
    .cover-subtitle {
        font-size: 10pt;
        color: #888;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 3px;
        margin: 0;
    }
    .cover-photo-frame {
        margin: 30px 70px 0 70px;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #e5e5e5;
        background: #fafafa;
        box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        height: 280px;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .cover-photo-frame img {
        max-width: 100%;
        max-height: 280px;
        object-fit: contain;
    }
    .cover-info-table {
        margin: 25px 70px 0 70px;
    }
    .cover-info-table table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 9.5pt;
        table-layout: fixed;
        border: 1px solid #ccc;
        border-radius: 12px;
        overflow: hidden;
    }
    .cover-info-table td {
        border-bottom: 1px solid #ccc;
        border-right: 1px solid #ccc;
        padding: 7px 10px;
        vertical-align: middle;
        line-height: 1.3;
        word-wrap: break-word;
    }
    .cover-info-table tr:last-child td {
        border-bottom: none;
    }
    .cover-info-table td:last-child {
        border-right: none;
    }
    .cover-info-table .tbl-heading {
        background: #1a1a1a;
        color: #fff;
        font-weight: bold;
        text-align: center;
        text-transform: uppercase;
        font-size: 8.5pt;
        padding: 8px;
        letter-spacing: 2px;
    }
    .cover-info-table .tbl-label {
        background: #ee8f1f;
        color: #fff;
        font-weight: bold;
        font-size: 8.5pt;
        width: 40%;
    }
    .cover-info-table .tbl-value {
        background: #fff;
        color: #333;
        font-size: 9pt;
    }
    .cover-bottom-band {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 50px;
        border-top: 3px solid #ee8f1f;
        background: white;
    }
    .cover-bottom-band img {
        height: 35px;
    }
    .cover-decorative-circle {
        position: absolute;
        bottom: 80px;
        right: -40px;
        width: 180px;
        height: 180px;
        border: 3px solid rgba(238,143,31,0.12);
        border-radius: 50%;
    }
    .cover-decorative-circle-sm {
        position: absolute;
        bottom: 120px;
        right: 20px;
        width: 80px;
        height: 80px;
        border: 2px solid rgba(238,143,31,0.08);
        border-radius: 50%;
    }
`;

const DOC_CSS = `
    .doc-wrap { background: #e8e8e8; width: 794px; }
    .doc-page {
        font-family: 'Arial MT', Arial, Helvetica, sans-serif;
        font-size: 11pt;
        color: #000;
        background: white;
        width: 794px;
        min-height: 1123px;
        padding: 0;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        page-break-after: always;
        margin-bottom: 12px;
        box-shadow: 0 2px 16px rgba(0,0,0,0.18);
        position: relative;
        overflow: hidden;
    }
    .doc-page:last-child { page-break-after: avoid; }
    .doc-page-content {
        padding: 60px 70px 80px 70px;
        flex: 1;
    }
    .photo-container {
        border: 1px solid #ddd;
        margin-bottom: 0;
        page-break-inside: avoid;
        border-radius: 6px;
        overflow: hidden;
    }
    .photo-img-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #fafafa;
    }
    .photo-img-wrapper img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    .photo-label {
        background: linear-gradient(135deg, #ee8f1f, #f5a623);
        color: #fff;
        font-weight: bold;
        text-align: center;
        text-transform: uppercase;
        font-size: 9pt;
        padding: 7px 10px;
        letter-spacing: 2px;
    }
    .footer-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 50px;
        border-top: 3px solid #ee8f1f;
    }
    .footer-bar img {
        height: 35px;
    }
    .footer-bar .page-num {
        font-size: 9pt;
        color: #666;
        font-weight: bold;
    }
    ${COVER_STYLES}
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
        padding: 0;
        box-sizing: border-box;
        page-break-after: always;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }
    .doc-page:last-child { page-break-after: avoid; }
    .doc-page-content {
        padding: 50px 60px 80px 60px;
        flex: 1;
    }
    .photo-container {
        border: 1px solid #ddd;
        margin-bottom: 0;
        page-break-inside: avoid;
        border-radius: 6px;
        overflow: hidden;
    }
    .photo-img-wrapper {
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        background: #fafafa;
    }
    .photo-img-wrapper img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
    }
    .photo-label {
        background: linear-gradient(135deg, #ee8f1f, #f5a623);
        color: #fff;
        font-weight: bold;
        text-align: center;
        text-transform: uppercase;
        font-size: 9pt;
        padding: 7px 10px;
        letter-spacing: 2px;
    }
    .footer-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 50px;
        border-top: 3px solid #ee8f1f;
    }
    .footer-bar img {
        height: 35px;
    }
    .footer-bar .page-num {
        font-size: 9pt;
        color: #666;
        font-weight: bold;
    }
    ${COVER_STYLES}
`;

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

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Default photo slots matching the user's requirements
const DEFAULT_PHOTO_SLOTS = [
    { id: 'caldera_anterior', label: 'Foto Caldera Anterior', file: null, required: true },
    { id: 'placa_caldera_anterior', label: 'Foto Placa de la Caldera Anterior', file: null, required: true },
    { id: 'unidad_exterior', label: 'Foto Unidad Exterior', file: null, required: true },
    { id: 'placa_unidad_exterior', label: 'Foto Placa de la Unidad Exterior', file: null, required: true },
    { id: 'unidad_interior', label: 'Foto Unidad Interior / ACS', file: null, required: true },
    { id: 'placa_unidad_interior', label: 'Foto Placa Unidad Interior / ACS', file: null, required: true },
];

export function AnexoFotograficoModal({ isOpen, onClose, expediente, photos: externalPhotos, onPhotosChange, onSaveDrive, results }) {
    const { showAlert, showConfirm } = useModal();
    const { user } = useAuth();
    const containerRef = useRef(null);
    const [generating, setGenerating] = useState(false);
    const [savingDrive, setSavingDrive] = useState(false);
    const [sendingEmail, setSendingEmail] = useState(false);
    const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
    const [scale, setScale] = useState(1);
    const [zoomedPhoto, setZoomedPhoto] = useState(null);
    const [zoomLevel, setZoomLevel] = useState(1);

    const [b64Logos, setB64Logos] = useState({ admin: '', doc: '' });

    useEffect(() => {
        const fetchBase64 = async (url) => {
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                return new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch (e) {
                console.error('Error loading logo:', url);
                return '';
            }
        };

        const loadLogos = async () => {
            const adminLogo = await fetchBase64('/logo-brokergy-admin.png');
            const docLogo = await fetchBase64('/logo_brokergy_doc.png');
            setB64Logos({ admin: adminLogo, doc: docLogo });
        };
        if (isOpen) {
            loadLogos();
        }
    }, [isOpen]);

    // ─── Scaneo de Drive para Pre-carga ──────────────────────────────────────────
    const [scanningDrive, setScanningDrive] = useState(false);

    useEffect(() => {
        const scanDrivePhotos = async () => {
            const needsCaldera = !photos.find(p => p.id === 'caldera_anterior')?.file;
            const needsPlaca = !photos.find(p => p.id === 'placa_caldera_anterior')?.file;

            const oppId = expediente?.id_oportunidad_ref || expediente?.oportunidades?.id_oportunidad;
            if (isOpen && (needsCaldera || needsPlaca) && oppId) {
                setScanningDrive(true);
                try {
                    console.log(`[AnexoFotografico] Escaneando Drive para Opportunity: ${oppId}...`);
                    const response = await axios.get(`/api/public/scan-photos/${oppId}`);
                    
                    if (response.data?.success && response.data?.photos) {
                        const drivePhotos = response.data.photos;
                        const hasNewData = drivePhotos.FOTO_CALDERA_ANTES || drivePhotos.FOTO_PLACA_CALDERA_ANTES;

                        if (hasNewData) {
                            setPhotos(prev => {
                                return prev.map(p => {
                                    if (p.id === 'caldera_anterior' && !p.file && drivePhotos.FOTO_CALDERA_ANTES) {
                                        return { ...p, file: drivePhotos.FOTO_CALDERA_ANTES };
                                    }
                                    if (p.id === 'placa_caldera_anterior' && !p.file && drivePhotos.FOTO_PLACA_CALDERA_ANTES) {
                                        return { ...p, file: drivePhotos.FOTO_PLACA_CALDERA_ANTES };
                                    }
                                    return p;
                                });
                            });
                            console.log('[AnexoFotografico] Fotos de Drive sincronizadas con éxito.');
                        }
                    }
                } catch (error) {
                    console.error('Error scanning preloaded photos:', error);
                } finally {
                    setScanningDrive(false);
                }
            }
        };

        if (isOpen) {
            scanDrivePhotos();
        }
    }, [isOpen, expediente?.id_oportunidad_ref]);

    // photo sizing controls
    const [photoSizes, setPhotoSizes] = useState({});
    const [dragOverId, setDragOverId] = useState(null);
    const [editingPhoto, setEditingPhoto] = useState(null); // { index, data, label }
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState();
    const imgRef = useRef(null);

    const photosRaw = externalPhotos || DEFAULT_PHOTO_SLOTS;
    // ensure all default slots appear even if the saved data is older
    const missingDefaults = DEFAULT_PHOTO_SLOTS.filter(d => !photosRaw.some(p => p.id === d.id));
    const photos = missingDefaults.length > 0 ? [...photosRaw, ...missingDefaults] : photosRaw;

    const setPhotos = (newVal) => {
        if (typeof newVal === 'function') {
            onPhotosChange(newVal(photos));
        } else {
            onPhotosChange(newVal);
        }
    };

    const [isPhotosManagerOpen, setIsPhotosManagerOpen] = useState(false);
    const [newFieldLabel, setNewFieldLabel] = useState('');

    const handleFileChange = async (targetIdOrIndex, file) => {
        if (!file) return;
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (rev) => {
                const dataUrl = rev.target.result;
                setPhotos(prev => {
                    const copy = [...prev];
                    if (typeof targetIdOrIndex === 'number') {
                        copy[targetIdOrIndex] = { ...copy[targetIdOrIndex], file: { name: file.name, data: dataUrl } };
                        return copy;
                    } else {
                        const idx = copy.findIndex(a => a.id === targetIdOrIndex);
                        if (idx !== -1) {
                            copy[idx] = { ...copy[idx], file: { name: file.name, data: dataUrl } };
                        }
                        return copy;
                    }
                });
                resolve();
            };
            reader.readAsDataURL(file);
        });
    };

    const removePhoto = (index) => {
        setPhotos(prev => {
            const copy = [...prev];
            const item = copy[index];
            if (item.required) {
                copy[index] = { ...item, file: null };
                return copy;
            } else {
                return copy.filter((_, i) => i !== index);
            }
        });
    };

    const addCustomField = () => {
        if (!newFieldLabel.trim()) return;
        setPhotos(prev => [...prev, {
            id: `custom_${Date.now()}`,
            label: newFieldLabel.trim(),
            file: null,
            required: false
        }]);
        setNewFieldLabel('');
    };

    // Photo size control
    const getPhotoSize = (photoId) => photoSizes[photoId] || 100;
    const setPhotoSize = (photoId, size) => {
        setPhotoSizes(prev => ({ ...prev, [photoId]: Math.max(30, Math.min(100, size)) }));
    };

    // Open cropper for a photo by index
    const openCropEditor = (idx) => {
        const item = photos[idx];
        if (item && item.file) {
            setEditingPhoto({ index: idx, data: item.file.data, label: item.label });
            setCrop(undefined);
            setCompletedCrop(undefined);
        }
    };

    const handleApplyCrop = async () => {
        if (!completedCrop || !imgRef.current) return;
        
        const image = imgRef.current;
        const canvas = document.createElement('canvas');
        const scaleX = image.naturalWidth / image.width;
        const scaleY = image.naturalHeight / image.height;
        const ctx = canvas.getContext('2d');

        canvas.width = completedCrop.width * scaleX;
        canvas.height = completedCrop.height * scaleY;

        ctx.drawImage(
            image,
            completedCrop.x * scaleX,
            completedCrop.y * scaleY,
            completedCrop.width * scaleX,
            completedCrop.height * scaleY,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const base64Image = canvas.toDataURL('image/jpeg', 0.92);
        
        setPhotos(prev => {
            const copy = [...prev];
            copy[editingPhoto.index] = { 
                ...copy[editingPhoto.index], 
                file: { ...copy[editingPhoto.index].file, data: base64Image } 
            };
            return copy;
        });
        
        setEditingPhoto(null);
        setCrop(undefined);
        setCompletedCrop(undefined);
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

    // Setup click-to-edit handler for preview photos
    useEffect(() => {
        window.__editPhoto = (photoId) => {
            const idx = photos.findIndex(p => p.id === photoId);
            if (idx !== -1 && photos[idx].file) {
                openCropEditor(idx);
            }
        };
        return () => { delete window.__editPhoto; };
    }, [photos]);

    if (!isOpen || !expediente) return null;

    // ── DATA EXTRACTION ─────────────────────────────────────────────────
    const op = expediente.oportunidades || {};
    const opInputs = op.datos_calculo || {};
    const inst = expediente.instalacion || {};
    const cli = expediente.clientes || expediente.cliente || {};
    const loc = expediente.ubicacion || {};

    const numexpte = expediente.numero_expediente || '';

    const cp = inst.codigo_postal || loc.cp || cli.codigo_postal || opInputs.ccaa_cp || opInputs.cp || '';
    const provCode = cp ? String(cp).substring(0, 2).padStart(2, '0') : '';

    const locCA = (
        inst.ccaa || loc.ccaa || cli.ccaa ||
        (provCode ? PROV_CCAA[provCode] : '') || '—'
    ).toUpperCase();

    const locFullDir = `${inst.direccion || loc.direccion || cli.direccion || ''} ${inst.num || loc.num || ''}, ${inst.codigo_postal || loc.cp || cli.codigo_postal || ''} ${inst.municipio || loc.municipio || cli.municipio || ''} (${inst.provincia || loc.provincia || cli.provincia || ''})`.trim() || '—';
    const locRefCat = inst.ref_catastral || loc.ref_catastral || opInputs.rc || '—';
    const locUtmX = inst.coord_x || loc.coord_x || opInputs.coordX || opInputs.coord_x || '—';
    const locUtmY = inst.coord_y || loc.coord_y || opInputs.coordY || opInputs.coord_y || '—';

    // Fallback to static URLs in preview if base64 not yet loaded
    const logoAdminSrc = b64Logos.admin || '/logo-brokergy-admin.png';
    const logoDocSrc = b64Logos.doc || '/logo_brokergy_doc.png';

    // ── LIGHTBOX ZOOM ─────────────────────────────────────────────────
    const handleCloseLightbox = () => { setZoomedPhoto(null); setZoomLevel(1); };

    // ── COVER PAGE HTML ────────────────────────────────────────────────
    const buildCoverHtml = () => {
        const coverPhoto = photos.find(p => p.id === 'unidad_exterior' && p.file) || photos.find(p => p.file);
        const coverImgHtml = coverPhoto
            ? `<img src="${coverPhoto.file.data}" alt="Vista instalación" />`
            : '<div style="width:200px;height:200px;background:#f0f0f0;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:12pt;">Sin imagen</div>';

        return `
            <div class="doc-page cover-page" style="padding:0;">
                <div class="cover-accent-bar"></div>
                <div class="cover-top-band"></div>
                <div class="cover-logo-area">
                    <img src="${logoAdminSrc}" alt="Brokergy" />
                </div>
                <div class="cover-title-section">
                    <p class="cover-subtitle">Documentación técnica</p>
                    <h1>Reportaje<br/>Fotográfico<br/>de las Actuaciones</h1>
                </div>
                <div class="cover-photo-frame">
                    ${coverImgHtml}
                </div>
                <div class="cover-info-table">
                    <table>
                        <tr><td colspan="2" class="tbl-heading">Identificación de la actuación de ahorro de energía</td></tr>
                        <tr><td class="tbl-label">Comunidad Autónoma</td><td class="tbl-value">${locCA}</td></tr>
                        <tr><td class="tbl-label">Dirección Postal</td><td class="tbl-value">${locFullDir}</td></tr>
                        <tr><td class="tbl-label">Referencia Catastral</td><td class="tbl-value">${locRefCat}</td></tr>
                        <tr><td class="tbl-label">Coordenadas UTM</td><td class="tbl-value">X: ${locUtmX} &nbsp;;&nbsp; Y: ${locUtmY}</td></tr>
                    </table>
                </div>
                <div class="cover-decorative-circle"></div>
                <div class="cover-decorative-circle-sm"></div>
                <div class="cover-bottom-band">
                    <img src="${logoDocSrc}" alt="Brokergy" />
                </div>
            </div>
        `;
    };

    // ── HTML GENERATION (FOR PDF) ──────────────────────────────────────
    const buildHtml = () => {
        const pages = [];
        pages.push(buildCoverHtml());

        // PHOTO PAGES
        const photosWithFiles = photos.filter(p => p.file);
        for (let i = 0; i < photosWithFiles.length; i += 2) {
            const photo1 = photosWithFiles[i];
            const photo2 = photosWithFiles[i + 1];
            pages.push(`
                <div class="doc-page">
                    <div class="doc-page-content" style="display: flex; flex-direction: column; gap: 20px; padding-bottom: 70px;">
                        <div class="photo-container" style="flex: 1;">
                            <div class="photo-img-wrapper" style="height: ${photo2 ? '410px' : '820px'}; display: flex; align-items: center; justify-content: center;">
                                <img src="${photo1.file.data}" style="max-width: ${getPhotoSize(photo1.id)}%; max-height: 100%; object-fit: contain;" />
                            </div>
                            <div class="photo-label">${photo1.label}</div>
                        </div>
                        ${photo2 ? `
                        <div class="photo-container" style="flex: 1;">
                            <div class="photo-img-wrapper" style="height: 410px; display: flex; align-items: center; justify-content: center;">
                                <img src="${photo2.file.data}" style="max-width: ${getPhotoSize(photo2.id)}%; max-height: 100%; object-fit: contain;" />
                            </div>
                            <div class="photo-label">${photo2.label}</div>
                        </div>
                        ` : ''}
                    </div>
                    <div class="footer-bar">
                        <img src="${logoDocSrc}" alt="Brokergy" />
                        <span class="page-num">PAGE_X_OF_Y</span>
                    </div>
                </div>
            `);
        }
        const totalPages = pages.length;
        const finalPages = pages.map((p, i) => p.replace(/PAGE_X_OF_Y/g, `Página ${i + 1} | ${totalPages}`));
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>${PDF_CSS}</style></head><body>${finalPages.join('')}</body></html>`;
    };

    const handleDownloadPdf = async () => {
        setGenerating(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildHtml() });
            const bytes = new Uint8Array(atob(data.pdf).split('').map(c => c.charCodeAt(0)));
            const blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
            a.download = `${numexpte || 'DRAFT'} - Anexo_Fotografico.pdf`; a.click();
        } catch { 
            showAlert('No se pudo generar el documento PDF. Por favor, inténtalo de nuevo.', 'Error de Generación', 'error'); 
        }
        finally { setGenerating(false); }
    };

    const handleSaveToDrive = async () => {
        const folderId = op.drive_folder_id || op.datos_calculo?.drive_folder_id || op.datos_calculo?.inputs?.drive_folder_id;
        if (!folderId) { 
            showAlert('No se encontró el identificador de la carpeta de Google Drive asociada a este expediente.', 'Carpeta no Encontrada', 'error'); 
            return; 
        }
        setSavingDrive(true);
        try {
            const { data } = await axios.post('/api/pdf/save-to-drive', {
                html: buildHtml(), folderId, fileName: `${numexpte || 'DRAFT'} - Anexo Fotografico`, subfolderName: '6. ANEXOS CAE'
            });
            if (data.driveLink) {
                if (onSaveDrive) onSaveDrive(data.driveLink);
                showAlert('El Anexo Fotográfico se ha guardado correctamente en la carpeta "6. ANEXOS CAE" de Google Drive.', 'Guardado en Drive', 'success');
            }
        } catch { 
            showAlert('No se pudo guardar el archivo en Google Drive.', 'Error de Guardado', 'error'); 
        }
        finally { setSavingDrive(false); }
    };

    const handleSendByEmail = async () => {
        const toEmail = cli.email;
        if (!toEmail) {
            showAlert('El cliente no tiene una dirección de correo electrónico registrada.', 'Email no Definido', 'warning');
            return;
        }
        setSendingEmail(true);
        try {
            const summaryData = {
                id: numexpte,
                docType: 'Anexo Fotográfico',
                userName: [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' ')
            };

            const response = await axios.post('/api/pdf/send-proposal', {
                html: buildHtml(),
                to: toEmail,
                userName: summaryData.userName,
                summaryData: { ...summaryData, id: numexpte }
            });

            if (response.data.success) {
                showAlert(`El Anexo Fotográfico ha sido enviado correctamente a ${toEmail}.`, 'Envío Exitoso', 'success');
            }
        } catch (error) {
            console.error('Error sending email:', error);
            showAlert('Error al enviar el correo: ' + (error.response?.data?.message || error.message), 'Error de Envío', 'error');
        } finally {
            setSendingEmail(false);
        }
    };

    const handleSendByWhatsapp = async () => {
        const toPhone = cli.tlf || cli.telefono || opInputs?.phone;
        if (!toPhone) {
            showAlert('El cliente no tiene un número de teléfono registrado.', 'Teléfono no Definido', 'warning');
            return;
        }
        setSendingWhatsapp(true);
        try {
            // 1. Comprobar WhatsApp status
            const st = await axios.get('/api/whatsapp/status');
            if (!st.data?.ready) {
                showAlert('El canal de WhatsApp no está conectado. Por favor, conéctalo desde la configuración.', 'WhatsApp Desconectado', 'error');
                return;
            }

            // 2. Generar PDF
            const pdfResp = await axios.post('/api/pdf/generate', { html: buildHtml() });
            const pdfBase64 = pdfResp.data?.pdf;

            // 3. Construir mensaje
            const firstName = (cli.nombre_razon_social || '').split(/\s+/)[0];
            const caption = `Hola ${firstName},\n\nTe adjunto el *Anexo Fotográfico* de tu expediente *${numexpte}*.\n\nUn saludo,\n*BROKERGY*`;

            // 4. Enviar
            await axios.post('/api/whatsapp/send-media', {
                phone: toPhone,
                caption,
                media: { base64: pdfBase64, filename: `${numexpte}_Anexo_Fotografico.pdf`, mimetype: 'application/pdf' },
                asDocument: true,
            });

            showAlert('El Anexo Fotográfico ha sido enviado por WhatsApp correctamente.', 'Envío Exitoso', 'success');
        } catch (error) {
            console.error('Error sending WhatsApp:', error);
            showAlert('Error al enviar por WhatsApp: ' + (error.response?.data?.message || error.message), 'Error de Envío', 'error');
        } finally {
            setSendingWhatsapp(false);
        }
    };

    const buildPreviewHtml = () => {
        const pages = [];
        // PORTADA (same cover as PDF)
        pages.push(buildCoverHtml());

        // PHOTO PAGES (with click-to-edit)
        const photosWithFiles = photos.filter(p => p.file);
        for (let i = 0; i < photosWithFiles.length; i += 2) {
            const photo1 = photosWithFiles[i]; const photo2 = photosWithFiles[i + 1];
            pages.push(`
                <div class="doc-page">
                    <div class="doc-page-content" style="display: flex; flex-direction: column; gap: 20px; padding-bottom: 70px;">
                        <div class="photo-container" style="flex: 1; cursor: pointer;" onclick="window.__editPhoto && window.__editPhoto('${photo1.id}')" title="Haz clic para recortar">
                            <div class="photo-img-wrapper" style="height: ${photo2 ? '410px' : '820px'}; display: flex; align-items: center; justify-content: center; position: relative;">
                                <img src="${photo1.file.data}" style="max-width: ${getPhotoSize(photo1.id)}%; max-height: 100%; object-fit: contain;" />
                                <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;padding:4px 10px;border-radius:20px;font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">✂ Recortar</div>
                            </div>
                            <div class="photo-label">${photo1.label}</div>
                        </div>
                        ${photo2 ? `
                        <div class="photo-container" style="flex: 1; cursor: pointer;" onclick="window.__editPhoto && window.__editPhoto('${photo2.id}')" title="Haz clic para recortar">
                            <div class="photo-img-wrapper" style="height: 410px; display: flex; align-items: center; justify-content: center; position: relative;">
                                <img src="${photo2.file.data}" style="max-width: ${getPhotoSize(photo2.id)}%; max-height: 100%; object-fit: contain;" />
                                <div style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);color:#fff;padding:4px 10px;border-radius:20px;font-size:8pt;font-weight:bold;text-transform:uppercase;letter-spacing:1px;opacity:0.7;">✂ Recortar</div>
                            </div>
                            <div class="photo-label">${photo2.label}</div>
                        </div>` : ''}
                    </div>
                </div>
            `);
        }
        return pages.join('');
    };

    const loadedCount = photos.filter(p => p.file).length;
    const totalCount = photos.length;
    const aeKwh = Math.round(results?.savingsKwh || results?.ahorroEnergiaFinalTotal || 0).toLocaleString('es-ES');
    const beneficioStr = Math.round((results?.savingsKwh || results?.ahorroEnergiaFinalTotal || 0) * (results?.price_kwh || 0.102)).toLocaleString('es-ES');

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-[#0F1013] border border-white/[0.07] rounded-2xl shadow-2xl flex flex-col overflow-hidden" 
                 style={{ width: '98vw', maxWidth: 1020, height: '96vh' }} onClick={e => e.stopPropagation()}>
                
                {/* HEADER */}
                <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-b border-white/[0.07]">
                    <div className="flex items-center gap-3">
                        <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        <div className="border-l border-white/10 pl-3">
                            <h2 className="text-sm font-black text-white tracking-wider uppercase">Anexo Fotográfico</h2>
                            <p className="text-white/30 text-xs mt-0.5">{numexpte} · {loadedCount}/{totalCount} fotos cargadas</p>
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

                        {scanningDrive && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand/5 border border-brand/20 text-brand text-[10px] font-black uppercase tracking-widest animate-pulse">
                                <div className="w-3 h-3 border-2 border-brand/20 border-t-brand rounded-full animate-spin" />
                                Buscando fotos en Drive...
                            </div>
                        )}
                        <button onClick={() => setIsPhotosManagerOpen(true)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-xs font-bold hover:text-brand hover:border-brand/30 transition-all">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/></svg>
                            Gestionar Fotos
                        </button>
                        {user?.rol === 'ADMIN' && (
                            <button
                                onClick={handleSaveToDrive}
                                disabled={savingDrive || generating || sendingEmail || sendingWhatsapp}
                                title="Guardar en Drive"
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

                        {/* Botón ENVIAR POR EMAIL */}
                        <button
                            onClick={handleSendByEmail}
                            disabled={sendingEmail || generating || savingDrive || sendingWhatsapp || loadedCount === 0}
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
                            disabled={sendingWhatsapp || generating || savingDrive || sendingEmail || loadedCount === 0}
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

                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp || loadedCount === 0} className="px-5 py-2 bg-brand text-black text-xs font-black rounded-xl uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 disabled:opacity-30">{generating ? <Spinner /> : 'Generar PDF'}</button>
                    </div>
                </div>

                {/* PREVIEW AREA */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left shadow-2xl" id="pdf-preview-canvas" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: DOC_CSS }} />
                        <div className="doc-wrap" dangerouslySetInnerHTML={{ __html: buildPreviewHtml() }} />
                    </div>
                </div>
            </div>

            {/* ── PHOTOS MANAGER MODAL ── */}
            {isPhotosManagerOpen && (
                <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl" onClick={() => setIsPhotosManagerOpen(false)}>
                    <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-8 py-5 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-white font-bold uppercase tracking-[0.2em] text-xs">Gestión de Fotos</h3>
                            <button onClick={() => setIsPhotosManagerOpen(false)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        </div>
                        <div className="p-6 grid gap-3 max-h-[55vh] overflow-y-auto custom-scrollbar">
                            {photos.map((item, idx) => (
                                <div 
                                    key={item.id} 
                                    className={`group flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                        dragOverId === item.id 
                                            ? 'bg-brand/10 border-brand shadow-lg shadow-brand/10 scale-[1.02]' 
                                            : 'bg-white/[0.03] border-white/10 hover:border-brand/40 hover:bg-white/[0.05]'
                                    }`}
                                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverId(item.id); }}
                                    onDragLeave={() => setDragOverId(null)}
                                    onDrop={e => {
                                        e.preventDefault(); e.stopPropagation();
                                        setDragOverId(null);
                                        const file = e.dataTransfer.files[0];
                                        if (file && file.type.startsWith('image/')) handleFileChange(item.id, file);
                                    }}
                                >
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        {item.file 
                                            ? <img src={item.file.data} className="w-14 h-14 rounded-lg object-cover border border-white/10 cursor-pointer hover:ring-2 hover:ring-brand/50 transition-all" alt="" onClick={() => openCropEditor(idx)} title="Clic para recortar" /> 
                                            : <div className="w-14 h-14 rounded-lg border border-dashed border-white/10 flex items-center justify-center text-white/10 text-lg">📷</div>
                                        }
                                        <div className="flex flex-col text-left min-w-0">
                                            <span className="text-[11px] font-black uppercase text-white/80 truncate">{item.label}</span>
                                            {item.file && <span className="text-[9px] text-white/20 mt-0.5">Clic en imagen para recortar</span>}
                                            {!item.required && <span className="text-[9px] text-brand/40 mt-0.5">Campo personalizado</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-center flex-shrink-0">
                                        {item.file && (
                                            <>
                                                <input type="range" min="30" max="100" value={getPhotoSize(item.id)} onChange={e => setPhotoSize(item.id, parseInt(e.target.value))} className="w-16 accent-brand cursor-pointer" title="Tamaño en PDF" />
                                                <button onClick={() => openCropEditor(idx)} className="p-2 text-white/40 hover:text-brand transition-all" title="Recortar">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h2m10-2h2a2 2 0 002-2v-2M6 8H4a2 2 0 00-2 2v2m16-4V6a2 2 0 00-2-2h-2"/></svg>
                                                </button>
                                                <button onClick={() => removePhoto(idx)} className="p-2 text-red-500/50 hover:text-red-500 transition-all" title="Eliminar">
                                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                                </button>
                                            </>
                                        )}
                                        <label className="p-2 bg-white/5 text-white/40 rounded-xl cursor-pointer hover:bg-brand hover:text-black transition-all" title="Cargar imagen">
                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M12 4v16m8-8H4"/></svg>
                                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileChange(item.id, e.target.files[0])} />
                                        </label>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ADD CUSTOM FIELD */}
                        <div className="px-6 py-4 border-t border-white/[0.06] bg-white/[0.01]">
                            <p className="text-[9px] font-black text-white/20 uppercase tracking-[0.2em] mb-3">Añadir nuevo campo de foto</p>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={newFieldLabel}
                                    onChange={e => setNewFieldLabel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCustomField()}
                                    placeholder="Ej: Foto del termostato, Foto del cuadro eléctrico..."
                                    className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs font-bold placeholder:text-white/15 focus:outline-none focus:border-brand/40 transition-all"
                                />
                                <button 
                                    onClick={addCustomField}
                                    disabled={!newFieldLabel.trim()}
                                    className="px-5 py-2.5 bg-brand/10 border border-brand/30 text-brand text-[10px] font-black rounded-xl uppercase tracking-widest hover:bg-brand hover:text-black transition-all disabled:opacity-20 disabled:cursor-not-allowed"
                                >
                                    Añadir
                                </button>
                            </div>
                        </div>

                        <div className="p-5 bg-black/40 flex justify-end gap-3">
                            <button onClick={() => setIsPhotosManagerOpen(false)} className="px-10 py-3 bg-brand text-black text-[11px] font-black rounded-2xl uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── CROP EDITOR MODAL ── */}
            {editingPhoto && (
                <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/98 backdrop-blur-2xl p-4 md:p-8" onClick={() => setEditingPhoto(null)}>
                    <div className="bg-[#16181D] border border-white/10 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-white font-bold uppercase tracking-widest text-xs">Editor de Imagen · {editingPhoto.label}</h3>
                            <button onClick={() => setEditingPhoto(null)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        </div>
                        <div className="flex-1 overflow-auto p-4 md:p-6 flex items-center justify-center bg-black/40">
                            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)}>
                                <img ref={imgRef} src={editingPhoto.data} alt="Edit" className="max-w-full max-h-[55vh] object-contain shadow-2xl" onLoad={e => { const { width, height } = e.currentTarget; setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, undefined, width, height), width, height)); }} />
                            </ReactCrop>
                        </div>
                        <div className="p-4 md:p-6 bg-black/60 flex flex-col md:flex-row gap-4 justify-between items-center px-8 border-t border-white/10">
                            <span className="text-[10px] uppercase font-black text-white/20 tracking-widest">Arrastra las esquinas para seleccionar el recorte</span>
                            <div className="flex gap-3">
                                <button onClick={() => setEditingPhoto(null)} className="px-8 py-2 bg-white/5 text-white/50 text-[11px] font-black rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all">Cancelar</button>
                                <button onClick={handleApplyCrop} className="px-10 py-2 bg-brand text-black text-[11px] font-black rounded-xl uppercase tracking-widest hover:scale-105 active:scale-95 transition-all">Aplicar Recorte</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LIGHTBOX ZOOM ── */}
            {zoomedPhoto && (
                <div className="fixed inset-0 z-[600] flex items-center justify-center bg-black/95 backdrop-blur-3xl cursor-zoom-out" onClick={handleCloseLightbox}>
                    <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
                        <img src={zoomedPhoto.data} alt={zoomedPhoto.label} className="max-w-[95vw] max-h-[90vh] object-contain transition-transform duration-300 shadow-2xl" style={{ transform: `scale(${zoomLevel})` }} />
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/80 backdrop-blur-2xl px-6 py-3 rounded-full border border-white/10 shadow-2xl">
                            <button onClick={() => setZoomLevel(z => Math.max(0.5, z - 0.25))} className="text-white/50 hover:text-white p-1 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" /></svg></button>
                            <span className="text-white/60 text-xs font-black min-w-[3rem] text-center">{Math.round(zoomLevel * 100)}%</span>
                            <button onClick={() => setZoomLevel(z => Math.min(3, z + 0.25))} className="text-white/50 hover:text-white p-1 transition-colors"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg></button>
                            <div className="w-px h-4 bg-white/20 mx-2" />
                            <button onClick={handleCloseLightbox} className="text-white/40 hover:text-red-400 p-1 transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
