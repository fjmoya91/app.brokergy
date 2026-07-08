import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';
import { buildInstalacionAddress } from '../utils/docGenerators';
import { buildAnexoPages, buildAnexoFullHtml, ANEXO_SCREEN_CSS } from './anexoFotograficoDoc';
import ReactCrop, { centerCrop, makeAspectCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import FirmarConCertificadoModal from './FirmarConCertificadoModal';

const Spinner = () => (
    <svg className="animate-spin h-4 w-4 text-current inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

// Mapa slot legacy ↔ nombre canónico en Drive (carpeta "12. DOCUMENTOS PARA CEE").
// Se mantiene para que una subida manual desde el Anexo (campos legacy) siga
// guardándose en Drive con su nombre canónico. El Anexo es DINÁMICO: la lista de
// fotos se construye desde Drive vía /api/public/anexo-photos (no hay huecos fijos).
const SLOT_TO_CANONICAL = {
    caldera_anterior:        'FOTO_CALDERA_ANTES',
    placa_caldera_anterior:  'FOTO_PLACA_CALDERA_ANTES',
    unidad_exterior:         'FOTO_UNIDAD_EXTERIOR',
    placa_unidad_exterior:   'FOTO_UNIDAD_EXTERIOR_PLACA',
    unidad_interior:         'FOTO_UNIDAD_INTERIOR',
    placa_unidad_interior:   'FOTO_UNIDAD_INTERIOR_PLACA',
};

export function AnexoFotograficoModal({ isOpen, onClose, expediente, photos: externalPhotos, onPhotosChange, onSaveDrive, onSignedComplete, results }) {
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
    // Firma con certificado del Anexo Fotográfico (RES060/080/093)
    const [signOpen, setSignOpen] = useState(false);
    const [signPdfB64, setSignPdfB64] = useState(null);
    const [signBusy, setSignBusy] = useState(false);

    const [b64Logos, setB64Logos] = useState({ doc: '' });

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
            const docLogo = await fetchBase64('/logo_brokergy_doc.png');
            setB64Logos({ doc: docLogo });
        };
        if (isOpen) {
            loadLogos();
        }
    }, [isOpen]);

    // ─── Carga DINÁMICA de fotos desde Drive ─────────────────────────────────────
    const [scanningDrive, setScanningDrive] = useState(false);

    // Pide al backend los conceptos que REALMENTE tienen foto (orden antes→después) y
    // reconstruye la lista. Conserva el recorte/tamaño de filas drive_ ya guardadas y
    // las filas manuales (custom_). Un concepto sin foto no aparece.
    useEffect(() => {
        const loadDynamic = async () => {
            // Resolver el id de la oportunidad con TODOS los orígenes posibles. El
            // backend (resolveOportunidadId) admite tanto el id_oportunidad (string)
            // como el UUID; el UUID `oportunidad_id` casi siempre existe, así que sirve
            // de red de seguridad cuando el join `oportunidades` no trae id_oportunidad.
            const oppId = expediente?.id_oportunidad_ref
                || expediente?.oportunidades?.id_oportunidad
                || expediente?.oportunidades?.id
                || expediente?.oportunidad_id;
            if (!isOpen || !oppId) { console.warn('[AnexoFotografico] Sin id de oportunidad para cargar fotos', expediente); return; }
            setScanningDrive(true);
            try {
                const { data } = await axios.get(`/api/public/anexo-photos/${oppId}`);
                const groups = data?.groups || [];
                setPhotos(prev => {
                    const prevById = new Map((prev || []).map(p => [p.id, p]));
                    const rows = [];
                    for (const g of groups) {
                        (g.photos || []).forEach((ph, i) => {
                            const id = `drive_${ph.name}`;
                            const label = i === 0 ? g.label : `${g.label} (${i + 1})`;
                            const existing = prevById.get(id);
                            // Drive es la FUENTE DE VERDAD (regla 20): el base64 se toma
                            // SIEMPRE fresco del backend. No conservamos el file previo:
                            // el persistido en BD pudo quedar corrupto (normalizeData subía
                            // el base64 a MAYÚSCULAS → imagen rota) o simplemente obsoleto.
                            // slotKey/fase alimentan la agrupación por actuación del documento.
                            rows.push({ ...(existing || {}), id, label, slotKey: g.key, fase: g.fase, file: { name: ph.name, data: ph.data }, required: false });
                        });
                    }
                    // Mantener las filas añadidas a mano (no provienen de Drive).
                    for (const p of prev || []) {
                        if (String(p.id).startsWith('custom_') && !rows.some(r => r.id === p.id)) rows.push(p);
                    }
                    return rows;
                });
                console.log(`[AnexoFotografico] Fotos dinámicas cargadas: ${groups.length} concepto(s).`);
            } catch (error) {
                console.error('[AnexoFotografico] Error cargando fotos dinámicas:', error);
            } finally {
                setScanningDrive(false);
            }
        };
        loadDynamic();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, expediente?.id_oportunidad_ref, expediente?.oportunidades?.id_oportunidad, expediente?.oportunidad_id]);

    // photo sizing controls
    const [photoSizes, setPhotoSizes] = useState({});
    const [dragOverId, setDragOverId] = useState(null);
    const [editingPhoto, setEditingPhoto] = useState(null); // { index, data, label }
    const [crop, setCrop] = useState();
    const [completedCrop, setCompletedCrop] = useState();
    const imgRef = useRef(null);

    // Anexo DINÁMICO: la lista de fotos se construye desde lo que REALMENTE hay en
    // Drive (ver efecto de carga dinámica abajo). No se fuerzan huecos fijos: un
    // concepto sin foto no aparece. Del estado guardado solo se conservan las filas
    // con foto (recortes/tamaños y campos manuales), que el efecto re-fusiona.
    const photos = externalPhotos || [];

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

        // Resolver slot.id para mapearlo a nombre canónico en Drive
        const resolvedSlotId = typeof targetIdOrIndex === 'number'
            ? photos[targetIdOrIndex]?.id
            : targetIdOrIndex;
        const canonical = SLOT_TO_CANONICAL[resolvedSlotId];
        const oppId = expediente?.id_oportunidad_ref || expediente?.oportunidades?.id_oportunidad;

        // Fire-and-forget: subir a Drive con nombre canónico para que el SubirFotosModal y futuras
        // re-aperturas del Anexo encuentren la foto vía scan-photos. Renombramos vía
        // Content-Disposition (mecanismo probado) + canonical_names como red de seguridad.
        if (canonical && oppId) {
            const ext = ((file.name || '').split('.').pop() || 'jpg').toLowerCase();
            const fd = new FormData();
            fd.append('files', file, `${canonical}.${ext}`);
            fd.append('canonical_names', JSON.stringify([canonical]));
            axios.post(`/api/public/upload-docs/${oppId}`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' }
            })
                .then(() => console.log(`[AnexoFotografico] Foto ${resolvedSlotId} → ${canonical} guardada en Drive`))
                .catch(err => console.warn(`[AnexoFotografico] No se pudo guardar ${canonical} en Drive:`, err.message));
        }

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

    // Dirección de la INSTALACIÓN (Catastro/oportunidad), nunca la del cliente.
    // buildInstalacionAddress ya deriva la CCAA del código de provincia/CP.
    const instAddr = buildInstalacionAddress(expediente);

    const locUtmX = inst.coord_x || loc.coord_x || opInputs.coordX || opInputs.coord_x || '';
    const locUtmY = inst.coord_y || loc.coord_y || opInputs.coordY || opInputs.coord_y || '';

    // Fallback to static URL in preview if base64 not yet loaded
    const logoDocSrc = b64Logos.doc || '/logo_brokergy_doc.png';

    // ── LIGHTBOX ZOOM ─────────────────────────────────────────────────
    const handleCloseLightbox = () => { setZoomedPhoto(null); setZoomLevel(1); };

    // ── DATOS DEL DOCUMENTO (portada + pies de página) ─────────────────
    const docMeta = {
        ca: instAddr.ccaa || '',
        direccion: instAddr.full || '',
        refCatastral: instAddr.refCatastral || '',
        utmX: locUtmX,
        utmY: locUtmY,
        municipioLine: [instAddr.municipio, instAddr.provincia ? `(${instAddr.provincia})` : ''].filter(Boolean).join(' '),
        numexpte,
        logoSrc: logoDocSrc,
        clienteNombre: [cli.nombre_razon_social, cli.apellidos].filter(Boolean).join(' '),
        clienteDni: cli.dni || cli.nif || '',
    };

    // ── HTML GENERATION (FOR PDF) ──────────────────────────────────────
    const buildHtml = () => buildAnexoFullHtml(photos, docMeta, { photoSizes });

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

    // ── FIRMA CON CERTIFICADO (Anexo Fotográfico) ─────────────────────────────
    const handleFirmar = async () => {
        setSignBusy(true);
        try {
            const { data } = await axios.post('/api/pdf/generate', { html: buildHtml() });
            if (!data?.pdf) throw new Error('No se pudo generar el PDF');
            setSignPdfB64(data.pdf);
            setSignOpen(true);
        } catch {
            showAlert('No se pudo preparar el Anexo Fotográfico para firmar.', 'Error', 'error');
        } finally { setSignBusy(false); }
    };
    const handleSigned = async (signedB64) => {
        try {
            const { data } = await axios.post(`/api/expedientes/${expediente.id}/documentos/firmar-subir`, {
                field: 'anexo_fotografico_signed_link',
                signedPdfBase64: signedB64,
                fileName: `${numexpte || 'DRAFT'} - Anexo Fotografico_fdo`,
                subfolderName: '6. ANEXOS CAE',
            });
            setSignOpen(false); setSignPdfB64(null);
            if (data?.signed_link) {
                // Propaga al módulo padre: enciende el firmado y el validado (verde)
                // sin re-persistir (el backend ya guardó signed_link + docs_validados
                // y copió a "10. EXPEDIENTE CAE"; el previo se archivó en OLD).
                if (onSignedComplete) onSignedComplete('anexo_fotografico_signed_link', data.signed_link, data.validated);
                showAlert('Anexo Fotográfico firmado, validado y archivado en Drive. El anterior se movió a OLD.', 'Firmado', 'success');
            }
        } catch (err) {
            showAlert('Se firmó pero no se pudo guardar: ' + (err.response?.data?.error || err.message), 'Error', 'error');
        }
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

    // Preview: mismas páginas que el PDF, con clic-para-recortar en cada foto.
    const buildPreviewHtml = () => buildAnexoPages(photos, docMeta, { preview: true, photoSizes });

    const loadedCount = photos.filter(p => p.file).length;
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
                            <p className="text-white/30 text-xs mt-0.5">{numexpte} · {loadedCount} foto{loadedCount === 1 ? '' : 's'} en el anexo</p>
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

                        <button onClick={handleFirmar} disabled={signBusy || generating || savingDrive || sendingEmail || sendingWhatsapp || loadedCount === 0}
                                title="Firmar con certificado electrónico" className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.03] border border-white/10 text-white/50 text-xs font-bold hover:text-brand hover:border-brand/30 transition-all disabled:opacity-30">
                            {signBusy ? <Spinner /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>}
                            {signBusy ? 'Preparando...' : 'Firmar'}
                        </button>
                        <button onClick={handleDownloadPdf} disabled={generating || savingDrive || sendingEmail || sendingWhatsapp || loadedCount === 0} className="px-5 py-2 bg-brand text-black text-xs font-black rounded-xl uppercase tracking-wider transition-all hover:brightness-110 active:scale-95 disabled:opacity-30">{generating ? <Spinner /> : 'Generar PDF'}</button>
                    </div>
                </div>

                {signOpen && signPdfB64 && (
                    <FirmarConCertificadoModal
                        pdfBase64={signPdfB64}
                        title={`Firmar Anexo Fotográfico · ${numexpte}`}
                        signatureAnchor={['fdo', 'firma', 'conforme']}
                        onClose={() => { setSignOpen(false); setSignPdfB64(null); }}
                        onSigned={handleSigned}
                    />
                )}

                {/* PREVIEW AREA */}
                <div ref={containerRef} className="flex-1 overflow-auto bg-[#16181D] py-8 px-4 text-center">
                    <div className="inline-block text-left shadow-2xl" id="pdf-preview-canvas" style={{ transform: `scale(${scale})`, transformOrigin: 'top center', width: 794, flexShrink: 0 }}>
                        <style dangerouslySetInnerHTML={{ __html: ANEXO_SCREEN_CSS }} />
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
                        <div className="shrink-0 px-6 py-4 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                            <h3 className="text-white font-bold uppercase tracking-widest text-xs">Editor de Imagen · {editingPhoto.label}</h3>
                            <button onClick={() => setEditingPhoto(null)} className="text-white/20 hover:text-white transition-colors"><svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg></button>
                        </div>
                        {/* min-h-0 deja que el área de imagen encoja; la imagen se acota a la altura real
                            del modal (92vh) menos cabecera/pie → siempre cabe y el botón Aplicar queda visible. */}
                        <div className="flex-1 min-h-0 overflow-hidden p-4 md:p-6 flex items-center justify-center bg-black/40">
                            <ReactCrop crop={crop} onChange={c => setCrop(c)} onComplete={c => setCompletedCrop(c)} className="max-w-full max-h-full">
                                <img ref={imgRef} src={editingPhoto.data} alt="Edit" className="max-w-full object-contain shadow-2xl" style={{ maxHeight: 'calc(92vh - 210px)' }} onLoad={e => { const { width, height } = e.currentTarget; setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 90 }, undefined, width, height), width, height)); }} />
                            </ReactCrop>
                        </div>
                        <div className="shrink-0 p-4 md:p-6 bg-black/60 flex flex-col md:flex-row gap-4 justify-between items-center px-8 border-t border-white/10">
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
