import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../../../context/AuthContext';
import { useModal } from '../../../context/ModalContext';

export function SubirFotosModal({ isOpen, onClose, inputs, result, onInputChange }) {
    const { user } = useAuth();
    const { showAlert, showConfirm } = useModal();
    const [uploading, setUploading] = useState(false);
    
    // We only need two specific photos here according to requirements
    const [fotos, setFotos] = useState({
        caldera_anterior: null,
        placa_caldera_anterior: null
    });

    const [previews, setPreviews] = useState({
        caldera_anterior: null,
        placa_caldera_anterior: null
    });

    // Marcas de imágenes con error de carga (URL rota / formato no soportado)
    const [previewErrors, setPreviewErrors] = useState({
        caldera_anterior: false,
        placa_caldera_anterior: false
    });

    const [scanningDrive, setScanningDrive] = useState(false);
    const [showExtraUpload, setShowExtraUpload] = useState(false);
    const [extraFiles, setExtraFiles] = useState([]);
    const [uploadingExtra, setUploadingExtra] = useState(false);
    const [extraUploaded, setExtraUploaded] = useState(false);
    const [extraProgress, setExtraProgress] = useState(0);

    // Valida que el data URL sea una imagen renderizable por el navegador
    const isValidImageData = (data) => {
        if (!data || typeof data !== 'string') return false;
        if (!data.startsWith('data:image/')) return false;
        // HEIC/HEIF no se renderiza en navegadores estándar
        if (/^data:image\/(heic|heif)/i.test(data)) return false;
        // Comprueba que tenga base64 con contenido mínimo
        const idx = data.indexOf(',');
        if (idx < 0 || data.length - idx < 100) return false;
        return true;
    };

    // Sync local state with inputs and Drive when opening
    React.useEffect(() => {
        if (!isOpen) return;

        console.log("[SubirFotosModal] Inicializando modal. Inputs:", inputs.id_oportunidad);

        // 1. First, load from existing inputs.photo_attachments if they exist
        if (Array.isArray(inputs.photo_attachments)) {
            const caldera = inputs.photo_attachments.find(p => p.id === 'caldera_anterior')?.file;
            const placa = inputs.photo_attachments.find(p => p.id === 'placa_caldera_anterior')?.file;

            setPreviews({
                caldera_anterior: caldera || null,
                placa_caldera_anterior: placa || null
            });
            setPreviewErrors({ caldera_anterior: false, placa_caldera_anterior: false });
        }

        // 2. Then, scan Drive for any photos uploaded via public link (not yet in inputs)
        const scanDrivePhotos = async () => {
            if (!inputs.id_oportunidad) {
                console.log("[SubirFotosModal] Sin id_oportunidad, omitiendo escaneo.");
                return;
            }
            
            setScanningDrive(true);
            try {
                console.log("[SubirFotosModal] Escaneando Drive para:", inputs.id_oportunidad);
                const response = await axios.get(`/api/public/scan-photos/${inputs.id_oportunidad}`);
                if (response.data?.success && response.data?.photos) {
                    const drivePhotos = response.data.photos;
                    console.log("[SubirFotosModal] Fotos encontradas en Drive:", Object.keys(drivePhotos));
                    
                    setPreviews(prev => {
                        const next = { ...prev };
                        if (!next.caldera_anterior && drivePhotos.FOTO_CALDERA_ANTES) {
                            console.log("[SubirFotosModal] Precargando Caldera desde Drive");
                            next.caldera_anterior = drivePhotos.FOTO_CALDERA_ANTES;
                        }
                        if (!next.placa_caldera_anterior && drivePhotos.FOTO_PLACA_CALDERA_ANTES) {
                            console.log("[SubirFotosModal] Precargando Placa desde Drive");
                            next.placa_caldera_anterior = drivePhotos.FOTO_PLACA_CALDERA_ANTES;
                        }
                        return next;
                    });
                }
            } catch (err) {
                console.error("Error scanning drive photos in Opportunity:", err);
            } finally {
                setScanningDrive(false);
            }
        };

        scanDrivePhotos();
    }, [isOpen, inputs.id_oportunidad]);

    if (!isOpen) return null;

    const compressImage = (file) => {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = (event) => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1024;
                    const MAX_HEIGHT = 1024;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                    resolve(dataUrl);
                };
            };
        });
    };

    const handleFileChange = async (e, key) => {
        const file = e.target.files[0];
        if (!file) return;

        // Si ya hay una foto cargada (preview válido), preguntamos confirmación
        if (previews[key] && isValidImageData(previews[key]?.data) && !previewErrors[key]) {
            const confirmed = await showConfirm(
                `Ya existe una foto cargada en este apartado. ¿Estás seguro de que deseas sobrescribirla con el nuevo archivo: ${file.name}?`,
                'Confirmar Sobrescritura',
                'warning'
            );
            if (!confirmed) {
                e.target.value = ''; // Reset input
                return;
            }
        }

        // Rechazar HEIC/HEIF en cliente (los iPhones lo guardan así y no se renderiza)
        const isHeic = /\.(heic|heif)$/i.test(file.name) || /image\/(heic|heif)/i.test(file.type || '');
        if (isHeic) {
            showAlert('Las imágenes HEIC/HEIF no son compatibles. Convierte la foto a JPG o PNG antes de subirla.', 'Formato no compatible', 'warning');
            e.target.value = '';
            return;
        }

        setFotos(prev => ({ ...prev, [key]: file }));
        const base64 = await compressImage(file);
        setPreviews(prev => ({ ...prev, [key]: { name: file.name, data: base64 } }));
        setPreviewErrors(prev => ({ ...prev, [key]: false }));
    };

    const handleUpload = async () => {
        if (!fotos.caldera_anterior && !fotos.placa_caldera_anterior) {
            showAlert('Por favor, selecciona al menos una foto para subir.', 'Atención', 'warning');
            return;
        }

        if (!inputs.id_oportunidad) {
            showAlert('Debes guardar la oportunidad antes de poder subir fotos a su carpeta.', 'Oportunidad no guardada', 'info');
            return;
        }

        setUploading(true);

        try {
            // 1. Send to Drive (12. DOCUMENTOS PARA CEE) via API if available
            if (fotos.caldera_anterior || fotos.placa_caldera_anterior) {
                const formData = new FormData();
                if (fotos.caldera_anterior) {
                    const ext = fotos.caldera_anterior.name.split('.').pop() || 'jpg';
                    formData.append('files', fotos.caldera_anterior, `FOTO_CALDERA_ANTES.${ext}`);
                }
                if (fotos.placa_caldera_anterior) {
                    const ext = fotos.placa_caldera_anterior.name.split('.').pop() || 'jpg';
                    formData.append('files', fotos.placa_caldera_anterior, `FOTO_PLACA_CALDERA_ANTES.${ext}`);
                }
    
                try {
                    await axios.post(`/api/public/upload-docs/${inputs.id_oportunidad}`, formData, {
                        headers: { 'Content-Type': 'multipart/form-data' }
                    });
                } catch (err) {
                    console.warn("Error uploading to Drive, but continuing to save in DB:", err);
                }
            }

            // 2. Save base64 previews in inputs so AnexoFotografico can preload them
            const currentPhotos = inputs.photo_attachments || [
                { id: 'caldera_anterior', label: 'Foto Caldera Anterior', file: null, required: true },
                { id: 'placa_caldera_anterior', label: 'Foto Placa de la Caldera Anterior', file: null, required: true },
                { id: 'unidad_exterior', label: 'Foto Unidad Exterior', file: null, required: true },
                { id: 'placa_unidad_exterior', label: 'Foto Placa de la Unidad Exterior', file: null, required: true },
            ];

            const updatedPhotos = currentPhotos.map(p => {
                if (p.id === 'caldera_anterior' && previews.caldera_anterior) {
                    return { ...p, file: previews.caldera_anterior };
                }
                if (p.id === 'placa_caldera_anterior' && previews.placa_caldera_anterior) {
                    return { ...p, file: previews.placa_caldera_anterior };
                }
                return p;
            });

            // Update inputs and trigger save
            const newInputs = {
                ...inputs,
                photo_attachments: updatedPhotos
            };

            // 3. Persistir a la Base de Datos directamente para evitar pérdidas si el usuario no pulsa Guardar después
            const payload = {
                id_oportunidad: inputs.id_oportunidad,
                ref_catastral: inputs.rc || 'MANUAL',
                prescriptor_id: user?.prescriptor_id || null,
                referencia_cliente: inputs.referenciaCliente,
                demanda_calefaccion: result?.q_net || 0,
                cliente_id: inputs.cliente_id || null,
                datos_calculo: {
                    ...newInputs,
                    result
                }
            };

            try {
                await axios.post('/api/oportunidades', payload);
                console.log("[SubirFotosModal] Oportunidad actualizada con fotos en la DB");
            } catch (dbErr) {
                console.warn("[SubirFotosModal] Error persistiendo fotos en DB:", dbErr);
                // No bloqueamos el éxito si falló el guardado secundario, pero avisamos al usuario si es crítico
            }

            // Update inputs locally
            onInputChange(newInputs);

            showAlert('Fotos vinculadas y guardadas correctamente en el expediente.', 'Éxito', 'success');
            onClose();
        } catch (error) {
            console.error('Error procesando las fotos:', error);
            showAlert('Ocurrió un error al procesar las fotos.', 'Error', 'error');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl relative max-w-2xl w-full border border-white/20 flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                <div className="px-6 py-5 bg-slate-900 border-b border-white/10 flex justify-between items-center shrink-0">
                    <h3 className="text-white font-black uppercase tracking-widest flex items-center gap-3 text-lg">
                        <span className="text-brand text-2xl">📸</span>
                        Anexar Fotos Iniciales
                        {scanningDrive && (
                            <span className="flex items-center gap-2 ml-4 text-[10px] text-brand/60 animate-pulse normal-case font-medium">
                                <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Escaneando Drive...
                            </span>
                        )}
                    </h3>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 overflow-y-auto bg-slate-50 flex-1">
                    <p className="text-sm text-slate-500 mb-6 font-medium">
                        Sube las fotos de la instalación actual. Se guardarán en la carpeta <span className="font-bold">12. DOCUMENTOS PARA CEE</span> en Drive y se precargarán automáticamente en el Anexo Fotográfico del expediente.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Caldera Anterior */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                                FOTO_CALDERA_ANTES
                            </label>
                            <div className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all min-h-[200px] ${
                                previews.caldera_anterior && isValidImageData(previews.caldera_anterior.data) && !previewErrors.caldera_anterior
                                    ? 'border-brand bg-brand/5'
                                    : previews.caldera_anterior
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-slate-300 hover:border-brand/50 bg-white'
                            }`}>
                                {previews.caldera_anterior && isValidImageData(previews.caldera_anterior.data) && !previewErrors.caldera_anterior ? (
                                    <div className="w-full h-full flex flex-col items-center gap-3">
                                        <img
                                            src={previews.caldera_anterior.data}
                                            alt="Preview"
                                            className="h-32 object-contain rounded-lg shadow-sm"
                                            onError={() => setPreviewErrors(prev => ({ ...prev, caldera_anterior: true }))}
                                        />
                                        <p className="text-xs font-medium text-slate-500 truncate max-w-[150px]">{previews.caldera_anterior.name}</p>
                                    </div>
                                ) : previews.caldera_anterior ? (
                                    <div className="text-center px-2">
                                        <svg className="w-8 h-8 text-amber-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Vista previa no disponible</p>
                                        <p className="text-[10px] text-slate-500 truncate max-w-[180px] mt-1">{previews.caldera_anterior.name}</p>
                                        <p className="text-[9px] text-slate-400 mt-1">Re-súbela en JPG/PNG</p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-sm text-slate-400 font-medium">Seleccionar Foto</span>
                                    </div>
                                )}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileChange(e, 'caldera_anterior')} />
                            </div>
                        </div>

                        {/* Placa Caldera */}
                        <div className="flex flex-col gap-2">
                            <label className="text-xs font-bold uppercase text-slate-700 tracking-wider">
                                FOTO_PLACA_CALDERA_ANTES
                            </label>
                            <div className={`relative border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center transition-all min-h-[200px] ${
                                previews.placa_caldera_anterior && isValidImageData(previews.placa_caldera_anterior.data) && !previewErrors.placa_caldera_anterior
                                    ? 'border-brand bg-brand/5'
                                    : previews.placa_caldera_anterior
                                    ? 'border-amber-400 bg-amber-50'
                                    : 'border-slate-300 hover:border-brand/50 bg-white'
                            }`}>
                                {previews.placa_caldera_anterior && isValidImageData(previews.placa_caldera_anterior.data) && !previewErrors.placa_caldera_anterior ? (
                                    <div className="w-full h-full flex flex-col items-center gap-3">
                                        <img
                                            src={previews.placa_caldera_anterior.data}
                                            alt="Preview"
                                            className="h-32 object-contain rounded-lg shadow-sm"
                                            onError={() => setPreviewErrors(prev => ({ ...prev, placa_caldera_anterior: true }))}
                                        />
                                        <p className="text-xs font-medium text-slate-500 truncate max-w-[150px]">{previews.placa_caldera_anterior.name}</p>
                                    </div>
                                ) : previews.placa_caldera_anterior ? (
                                    <div className="text-center px-2">
                                        <svg className="w-8 h-8 text-amber-500 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                        </svg>
                                        <p className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Vista previa no disponible</p>
                                        <p className="text-[10px] text-slate-500 truncate max-w-[180px] mt-1">{previews.placa_caldera_anterior.name}</p>
                                        <p className="text-[9px] text-slate-400 mt-1">Re-súbela en JPG/PNG</p>
                                    </div>
                                ) : (
                                    <div className="text-center">
                                        <svg className="w-8 h-8 text-slate-300 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                        <span className="text-sm text-slate-400 font-medium">Seleccionar Foto</span>
                                    </div>
                                )}
                                <input type="file" accept="image/jpeg,image/png,image/webp" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={(e) => handleFileChange(e, 'placa_caldera_anterior')} />
                            </div>
                        </div>
                    </div>

                    {/* Sección de fotos adicionales */}
                    <div className="mt-6">
                        {!showExtraUpload ? (
                            <button
                                onClick={() => { setShowExtraUpload(true); setExtraUploaded(false); setExtraFiles([]); }}
                                className="w-full py-3 border-2 border-dashed border-slate-300 hover:border-brand/50 rounded-xl text-slate-400 hover:text-brand text-sm font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                Añadir más fotos
                            </button>
                        ) : extraUploaded ? (
                            <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <div className="flex items-center gap-2 text-emerald-700 text-sm font-bold">
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                                    Fotos adicionales subidas correctamente
                                </div>
                                <button onClick={() => { setExtraUploaded(false); setExtraFiles([]); }} className="text-xs font-bold text-emerald-600 hover:underline uppercase">Subir más</button>
                            </div>
                        ) : (
                            <div className="border-2 border-dashed border-brand/30 rounded-xl p-5 bg-brand/5">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Fotos adicionales</p>
                                    <button onClick={() => { setShowExtraUpload(false); setExtraFiles([]); }} className="text-slate-400 hover:text-slate-600">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                    </button>
                                </div>

                                {!uploadingExtra && (
                                    <div className="relative mb-3">
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*,video/*"
                                            onChange={e => setExtraFiles(prev => [...prev, ...Array.from(e.target.files)].slice(0, 20))}
                                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                        />
                                        <div className="border border-dashed border-slate-300 rounded-lg p-5 text-center bg-white hover:border-brand/50 transition-all">
                                            <svg className="w-6 h-6 text-slate-300 mx-auto mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                                            <p className="text-xs text-slate-400 font-medium">Pulsa o arrastra tus fotos aquí</p>
                                        </div>
                                    </div>
                                )}

                                {extraFiles.length > 0 && !uploadingExtra && (
                                    <div className="space-y-1.5 mb-3 max-h-32 overflow-y-auto">
                                        {extraFiles.map((f, i) => (
                                            <div key={i} className="flex items-center justify-between bg-white px-3 py-1.5 rounded-lg border border-slate-100 text-xs">
                                                <span className="text-slate-600 truncate font-medium">{f.name}</span>
                                                <button onClick={() => setExtraFiles(prev => prev.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-400 ml-2 shrink-0">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {uploadingExtra && (
                                    <div className="py-3 text-center">
                                        <div className="text-brand font-black text-lg mb-1">{extraProgress}%</div>
                                        <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                            <div className="bg-brand h-full transition-all duration-300" style={{ width: `${extraProgress}%` }} />
                                        </div>
                                    </div>
                                )}

                                {extraFiles.length > 0 && !uploadingExtra && (
                                    <button
                                        onClick={async () => {
                                            if (!inputs.id_oportunidad) {
                                                showAlert('Guarda la oportunidad antes de subir fotos.', 'Atención', 'warning');
                                                return;
                                            }
                                            setUploadingExtra(true);
                                            setExtraProgress(0);
                                            let done = 0;
                                            try {
                                                for (const file of extraFiles) {
                                                    const fd = new FormData();
                                                    fd.append('files', file);
                                                    await axios.post(`/api/public/upload-docs/${inputs.id_oportunidad}`, fd, {
                                                        headers: { 'Content-Type': 'multipart/form-data' }
                                                    });
                                                    done++;
                                                    setExtraProgress(Math.round((done / extraFiles.length) * 100));
                                                }
                                                setExtraUploaded(true);
                                                setExtraFiles([]);
                                            } catch (err) {
                                                showAlert('Error al subir algunas fotos. Inténtalo de nuevo.', 'Error', 'error');
                                            } finally {
                                                setUploadingExtra(false);
                                            }
                                        }}
                                        className="w-full py-2 bg-brand text-bkg-deep font-black uppercase tracking-widest rounded-lg text-xs hover:shadow-md transition-all"
                                    >
                                        Subir {extraFiles.length} foto{extraFiles.length !== 1 ? 's' : ''}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-6 py-4 bg-white border-t border-slate-100 flex justify-end gap-3 shrink-0">
                    <button onClick={onClose} disabled={uploading} className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-wider disabled:opacity-50">
                        Cancelar
                    </button>
                    <button 
                        onClick={handleUpload} 
                        disabled={uploading || (!fotos.caldera_anterior && !fotos.placa_caldera_anterior && !previews.caldera_anterior && !previews.placa_caldera_anterior)} 
                        className="px-6 py-2 bg-brand text-bkg-deep font-black uppercase tracking-widest rounded-xl hover:shadow-lg hover:shadow-brand/20 transition-all disabled:opacity-50 flex items-center gap-2"
                    >
                        {uploading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-bkg-deep" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Subiendo...
                            </>
                        ) : 'Subir Fotos'}
                    </button>
                </div>
            </div>
        </div>
    );
}
