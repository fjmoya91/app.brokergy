/**
 * DocsManager — núcleo reutilizable de la superficie de documentación.
 *
 * Misma UI para todos; cambian los permisos según `mode`:
 *   - mode="token"  → cliente/instalador por enlace público (subir, ver, borrar)
 *   - mode="admin"  → usuario logueado (subir, ver, borrar) y, si canValidate,
 *                     validar/rechazar foto a foto.
 *
 * El estado vive POR FOTO. El admin lee por endpoint autenticado (que además
 * devuelve el upload_token), y sube/borra por el mismo canal público que el
 * cliente para no duplicar lógica.
 */

import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { prepararImagenParaSubir } from '../../utils/imageResize';
import { SlotIlustracion, tieneIlustracion } from './SlotIlustracion';

const ESTADO_UI = {
    pendiente: { ring: 'border-white/10 bg-white/[0.03]', chip: null },
    subida:    { ring: 'border-sky-400/40 bg-sky-400/[0.06]', chip: { txt: 'Recibida · en revisión', cls: 'bg-sky-400/15 text-sky-300' } },
    validada:  { ring: 'border-emerald-400/40 bg-emerald-400/[0.06]', chip: { txt: '✓ Validada', cls: 'bg-emerald-400/15 text-emerald-300' } },
    rechazada: { ring: 'border-red-400/40 bg-red-400/[0.06]', chip: { txt: '✗ Vuelve a subirla', cls: 'bg-red-400/15 text-red-300' } },
};

const FOTO_ESTADO_BORDER = {
    validada: 'border-emerald-400 ring-1 ring-emerald-400/40',
    rechazada: 'border-red-400 ring-1 ring-red-400/40',
    subida: 'border-white/10',
    pendiente: 'border-white/10',
};

const driveImgUrl = (driveId, size) => (driveId ? `https://lh3.googleusercontent.com/d/${driveId}=w${size}` : null);

const IMG_EXT = /\.(jpe?g|png|gif|webp|heic|heif|bmp|tiff?)$/i;
/** ¿El item es una imagen? (por mimeType o, en su defecto, por extensión del nombre) */
const isImageItem = (it) => {
    if (it?.mimeType) return it.mimeType.startsWith('image/');
    return IMG_EXT.test(it?.name || '');
};
/** Icono + etiqueta de extensión para documentos no-imagen. */
const docMetaFor = (it) => {
    const mt = it?.mimeType || '';
    const ext = (String(it?.name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toUpperCase();
    if (mt.startsWith('video/')) return { icon: '🎥', ext: ext || 'VÍDEO' };
    if (mt === 'application/pdf' || ext === 'PDF') return { icon: '📄', ext: 'PDF' };
    return { icon: '📎', ext: ext || 'DOC' };
};

/**
 * Imagen con previsualización local instantánea + reintento ante latencia de Drive.
 * Si se pasa `lowSrc` (p.ej. la miniatura ya cacheada), se muestra al instante
 * mientras carga la alta resolución, que aparece con un fundido (carga progresiva).
 */
function DriveImg({ localUrl, proxySrc = null, driveId, thumb, lowSrc = null, size = 400, fit = 'cover', alt = '' }) {
    const [attempt, setAttempt] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [dead, setDead] = useState(false);
    useEffect(() => { setAttempt(0); setLoaded(false); setDead(false); }, [localUrl, proxySrc, driveId, thumb]);

    // Candidatos de URL, en orden de fiabilidad:
    //   1) proxySrc → nuestro backend (mismo origen, SIEMPRE carga en el navegador)
    //   2) lh3 / 3) /thumbnail → hotlink directo a Drive (fallback; puede fallar en navegador)
    const candidates = [];
    if (proxySrc) candidates.push(proxySrc);
    if (driveId) {
        candidates.push(`https://lh3.googleusercontent.com/d/${driveId}=w${size}`);
        candidates.push(`https://drive.google.com/thumbnail?id=${driveId}&sz=w${size}`);
    } else if (thumb) {
        candidates.push(thumb);
    }

    if (!localUrl && candidates.length === 0) {
        return <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-white/30 text-[9px]">—</div>;
    }

    let src;
    if (localUrl) {
        src = localUrl;
    } else {
        const base = candidates[attempt % candidates.length];
        const cycle = Math.floor(attempt / candidates.length);
        src = cycle > 0 ? `${base}${base.includes('?') ? '&' : '?'}cb=${cycle}` : base;
    }

    const MAX_ATTEMPTS = 6; // ~6-7s total alternando endpoints

    return (
        <>
            {lowSrc && !loaded && !dead && (
                <img src={lowSrc} alt="" className={`absolute inset-0 w-full h-full object-${fit}`} />
            )}
            <img
                src={src} alt={alt}
                className={`absolute inset-0 w-full h-full object-${fit} transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => setLoaded(true)}
                onError={() => {
                    if (localUrl) { setDead(true); return; }
                    if (attempt < MAX_ATTEMPTS) setTimeout(() => setAttempt(a => a + 1), Math.min(400 + attempt * 300, 1500));
                    else setDead(true);
                }}
            />
            {!loaded && !dead && !lowSrc && <div className="absolute inset-0 flex items-center justify-center bg-white/5 text-[9px] text-white/40 animate-pulse pointer-events-none">cargando…</div>}
            {dead && !lowSrc && (
                <button
                    onClick={(e) => { e.stopPropagation(); setAttempt(0); setLoaded(false); setDead(false); }}
                    className="absolute inset-0 flex items-center justify-center bg-white/5 text-[9px] text-amber-400/80 pointer-events-auto"
                    title="Reintentar">↻ reintentar</button>
            )}
        </>
    );
}

export function DocsManager({ mode = 'token', idOrUuid, token: tokenProp, embedded = false, canValidate = false, rol = null, need = null }) {
    // Enlace scoped por rol: cliente sube el ANTES de la obra; instalador, el DESPUÉS
    // (instalación terminada + facturas + RITE). Restringe la vista a esa fase.
    const roleFase = rol === 'cliente' ? 'ANTES' : rol === 'instalador' ? 'DESPUES' : null;
    // `need` = lista de slots concretos que faltan (los marcados al "solicitar lo que
    // falta"). Si viene, mostramos ÚNICAMENTE esos slots.
    const needSet = need ? new Set(String(need).split(',').map(s => s.trim()).filter(Boolean)) : null;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [info, setInfo] = useState(null);
    const [tab, setTab] = useState(roleFase || 'ANTES');
    const [busySlot, setBusySlot] = useState(null);
    const [uploadPct, setUploadPct] = useState({}); // % de subida por slot
    // Subida MÚLTIPLE: los ficheros van de uno en uno, así que un % suelto vuelve a
    // cero en cada foto y parece que se ha atascado. Esto dice por cuál va.
    const [uploadN, setUploadN] = useState({});     // { slot: { hecho, total } }
    const [slotError, setSlotError] = useState({});
    const [lightbox, setLightbox] = useState(null);
    const [lbConfirmDelete, setLbConfirmDelete] = useState(false); // confirmación de borrado en lightbox
    const [lbReplacing, setLbReplacing] = useState(false); // sustituyendo la foto del visor
    const [lbZoom, setLbZoom] = useState(1);               // zoom con la rueda en el visor
    const [lbOrigin, setLbOrigin] = useState('50% 50%');   // origen del zoom (sigue al cursor)
    const lbImgRef = useRef(null);                          // contenedor de imagen del visor (wheel no-pasivo)
    const [acting, setActing] = useState(null); // `${slot}:${name}` en validación
    const [reject, setReject] = useState(null); // { slot, item } cuando se rechaza
    const [rejectMotivo, setRejectMotivo] = useState('');
    const [rejectNotifyTarget, setRejectNotifyTarget] = useState('cliente'); // 'cliente'|'instalador'|'ninguno'
    const [waiving, setWaiving] = useState(null); // slot.key cuyo "no necesario" se está cambiando
    const [merging, setMerging] = useState(null); // slot.key cuyas fotos se están uniendo en un PDF
    // Fin de obra comunicado desde el enlace público (el mensaje del CEE inicial se
    // lo pide al cliente/instalador; aquí es donde puede pulsarlo).
    const [finObra, setFinObra] = useState(null);       // fecha ISO tras comunicarlo
    const [finConfirm, setFinConfirm] = useState(false); // confirmación en dos pasos
    const [finBusy, setFinBusy] = useState(false);
    const [finError, setFinError] = useState(null);
    const [dragOver, setDragOver] = useState(null); // slot.key sobre el que se arrastra
    const [namePrompt, setNamePrompt] = useState(null); // { slot, files } al subir a un slot "Otros"
    const [nameValue, setNameValue] = useState('');     // texto del nombre que escribe el usuario
    const [bulkValidating, setBulkValidating] = useState(null); // slot.key | '__antes__' | '__despues__' en validación masiva
    const [verHechos, setVerHechos] = useState(false); // cliente: desplegar "ya enviado"
    // Modo GUIADO (solo cliente): un apartado en pantalla cada vez. Arranca activo
    // — es el recorrido para quien no se maneja; "ver todos" lo apaga y ya no vuelve
    // solo, porque quien lo apaga es justo quien prefiere la lista.
    const [guiado, setGuiado] = useState(true);
    const [saltados, setSaltados] = useState(() => new Set()); // apartados aplazados con "ahora no"
    // Paso elegido A MANO con Anterior/Siguiente. Mientras vale null manda el
    // recorrido automático (el primer pendiente), que es lo que quiere el 95 % del
    // tiempo; en cuanto el cliente navega, manda su elección.
    const [pasoKey, setPasoKey] = useState(null);
    // Fase forzada a mano ('ANTES'|'DESPUES'|null). Solo la usa quien llega con la
    // obra ya hecha y quiere adelantarse; null = manda el orden natural.
    const [faseManual, setFaseManual] = useState(null);
    // Acuse de recibo tras subir: sin él, la tarjeta cambia sola al paso siguiente
    // y no queda ninguna señal de que la foto haya llegado. Quien no se maneja
    // vuelve a subirla "por si acaso".
    const [flash, setFlash] = useState(null);
    // Confirmación de "quitar esta foto" en el recorrido guiado (nombre del fichero).
    const [quitarConfirm, setQuitarConfirm] = useState(null);
    const [conceptPanel, setConceptPanel] = useState(false); // panel "Añadir apartado" abierto
    const [conceptBusy, setConceptBusy] = useState(null);    // concept.id en proceso de habilitar/quitar
    const [conceptError, setConceptError] = useState(null);  // error al cambiar un apartado

    // ── Escaparate público: fotos publicadas + modal de publicación ──
    const [publicadas, setPublicadas] = useState({});   // driveId → fila publicada
    const [pubModal, setPubModal] = useState(null);      // { slot, item }
    const [pubForm, setPubForm] = useState({ titulo: '', actuacion: 'aerotermia', consent: false, revisado: false });
    const [pubBusy, setPubBusy] = useState(false);
    const deriveActuacion = (key = '') => {
        const s = key.toUpperCase();
        if (s.includes('VENTANA')) return 'ventanas';
        if (s.includes('CUBIERTA')) return 'cubierta';
        if (s.includes('FACHADA')) return 'fachada';
        if (s.includes('SUELO')) return 'suelo';
        return 'aerotermia';
    };

    // Para subir/borrar siempre usamos el canal público con uuid+token reales.
    const uuidRef = useRef(null);
    const tokenRef = useRef(tokenProp || null);
    const busyRef = useRef(false);
    useEffect(() => { busyRef.current = busySlot !== null || acting !== null; }, [busySlot, acting]);

    // silent=true → refresco en segundo plano (sin spinner, sin borrar la vista ante error,
    // y sin pisar una subida/borrado en curso).
    const load = async (silent = false) => {
        if (silent && busyRef.current) return;
        if (!silent) setLoading(true);
        try {
            if (mode === 'admin') {
                const res = await axios.get(`/api/oportunidades/${idOrUuid}/docs`);
                uuidRef.current = res.data.uuid;
                tokenRef.current = res.data.upload_token;
                setInfo(res.data);
            } else {
                const res = await axios.get(`/api/public/reforma-docs/${idOrUuid}`, { params: { token: tokenProp } });
                uuidRef.current = idOrUuid;
                tokenRef.current = tokenProp;
                setInfo(res.data);
            }
            if (!silent) setError(null);
        } catch (err) {
            if (!silent) setError(err.response?.data?.error || 'No pudimos cargar la documentación. Comprueba el enlace.');
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line */ }, [mode, idOrUuid, tokenProp]);

    // Fotos ya publicadas en el escaparate (solo admin).
    const loadPublicadas = async () => {
        if (mode !== 'admin' || !canValidate) return;
        try {
            const r = await axios.get(`/api/oportunidades/${idOrUuid}/docs/escaparate`);
            const map = {};
            (r.data.publicadas || []).forEach(p => { map[p.drive_id] = p; });
            setPublicadas(map);
        } catch { /* noop */ }
    };
    useEffect(() => { loadPublicadas(); /* eslint-disable-next-line */ }, [mode, idOrUuid, canValidate]);

    const openPublish = (slot, it) => {
        setPubForm({ titulo: slot.label || '', actuacion: deriveActuacion(slot.key), consent: false, revisado: false });
        setPubModal({ slot, item: it });
    };
    const doPublish = async () => {
        if (!pubModal || !pubForm.consent || !pubForm.revisado) return;
        const { slot, item } = pubModal;
        setPubBusy(true);
        try {
            await axios.post(`/api/oportunidades/${idOrUuid}/docs/${slot.key}/publicar-escaparate`, {
                driveId: item.driveId, name: item.name, titulo_publico: pubForm.titulo,
                actuacion: pubForm.actuacion, consentimiento_cliente: true,
            });
            setPubModal(null);
            await loadPublicadas();
        } catch (e) { setError(e.response?.data?.error || 'No se pudo publicar en el escaparate.'); }
        finally { setPubBusy(false); }
    };
    const unpublish = async (it) => {
        setPubBusy(true);
        try {
            await axios.delete(`/api/oportunidades/${idOrUuid}/docs/escaparate/${it.driveId}`);
            await loadPublicadas();
        } catch { /* noop */ } finally { setPubBusy(false); }
    };

    // Refresco en segundo plano: al volver a la pestaña y cada 20s mientras esté visible.
    // Así, si el admin valida/rechaza/borra, el cliente ve el cambio sin recargar a mano.
    useEffect(() => {
        const refetch = () => { if (document.visibilityState === 'visible') load(true); };
        document.addEventListener('visibilitychange', refetch);
        const iv = setInterval(refetch, 30000);
        return () => { document.removeEventListener('visibilitychange', refetch); clearInterval(iv); };
        /* eslint-disable-next-line */
    }, [mode, idOrUuid, tokenProp]);

    // El acuse de recibo ("✓ Recibida") se retira solo: es una confirmación, no un
    // estado. Si se quedara fijo, al siguiente paso parecería que habla de ÉL.
    useEffect(() => {
        if (!flash) return;
        const t = setTimeout(() => setFlash(null), 3200);
        return () => clearTimeout(t);
    }, [flash]);

    // Visor: reset del zoom al abrir/cambiar de foto.
    useEffect(() => { setLbZoom(1); setLbOrigin('50% 50%'); }, [lightbox]);
    // Visor: rueda del ratón para hacer zoom hacia el cursor. Listener NO pasivo
    // (con preventDefault) para que no scrollee el fondo al usar la rueda.
    useEffect(() => {
        const el = lbImgRef.current;
        if (!el || !lightbox) return;
        const onWheel = (e) => {
            e.preventDefault();
            const rect = el.getBoundingClientRect();
            const ox = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
            const oy = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
            setLbOrigin(`${ox}% ${oy}%`);
            setLbZoom(z => Math.min(6, Math.max(1, +(z * (e.deltaY < 0 ? 1.15 : 1 / 1.15)).toFixed(3))));
        };
        el.addEventListener('wheel', onWheel, { passive: false });
        return () => el.removeEventListener('wheel', onWheel);
    }, [lightbox]);

    const patchSlot = (key, fn) => setInfo(prev => ({ ...prev, slots: prev.slots.map(s => (s.key === key ? fn(s) : s)) }));

    const rollup = (items) => {
        if (!items.length) return 'pendiente';
        if (items.some(i => i.estado === 'rechazada')) return 'rechazada';
        if (items.every(i => i.estado === 'validada')) return 'validada';
        return 'subida';
    };

    // URL de miniatura servida por NUESTRO backend (mismo origen → siempre carga).
    const thumbProxy = (driveId, size) => (driveId && uuidRef.current && tokenRef.current)
        ? `/api/public/reforma-thumb/${uuidRef.current}/${driveId}?token=${tokenRef.current}&sz=${size}`
        : null;

    // Devuelve true si todas las subidas fueron OK (lo usa "Cambiar foto" para no
    // borrar la antigua si la nueva falló).
    // `label` (opcional): nombre legible para los slots "Otros". Si se suben varios
    // archivos a la vez con la misma etiqueta, se numeran _1, _2… en el fichero.
    const uploadFiles = async (slot, fileList, label = null) => {
        const files = Array.from(fileList || []);
        if (!files.length) return false;
        let ok = true;
        setBusySlot(slot.key);
        setSlotError(prev => ({ ...prev, [slot.key]: null }));
        if (files.length > 1) setUploadN(prev => ({ ...prev, [slot.key]: { hecho: 0, total: files.length } }));
        try {
            for (let i = 0; i < files.length; i++) {
                if (files.length > 1) setUploadN(prev => ({ ...prev, [slot.key]: { hecho: i, total: files.length } }));
                // Foto de móvil = 5-12 MB. Se reduce antes de subirla salvo en los
                // slots de PLACA (`fullRes`), donde hay que poder leer el nº de serie.
                // Aquí importa el doble: el cliente suele subir con datos móviles.
                const file = await prepararImagenParaSubir(files[i], { fullRes: slot.fullRes });
                const form = new FormData();
                // La etiqueta va ANTES del fichero para que multer la deje en req.body.
                let fileLabel = null;
                if (label) {
                    fileLabel = files.length > 1 ? `${label}_${i + 1}` : label;
                    form.append('label', fileLabel);
                }
                form.append('file', file);
                const res = await axios.post(
                    `/api/public/reforma-docs/${uuidRef.current}/${slot.key}`,
                    form,
                    {
                        params: { token: tokenRef.current },
                        headers: { 'Content-Type': 'multipart/form-data' },
                        timeout: 5 * 60 * 1000,
                        onUploadProgress: (e) => {
                            if (e.total) setUploadPct(prev => ({ ...prev, [slot.key]: Math.round((e.loaded / e.total) * 100) }));
                        },
                    }
                );
                const localUrl = file.type?.startsWith('image/') ? URL.createObjectURL(file) : null;
                const entry = { name: res.data.name, label: res.data.label ?? fileLabel, link: res.data.link, thumb: res.data.thumb, driveId: res.data.driveId, localUrl, estado: 'subida', at: new Date().toISOString() };
                patchSlot(slot.key, s => {
                    const items = s.multiple ? [...(s.items || []), entry] : [entry];
                    return { ...s, items, estado: rollup(items) };
                });
                if (!slot.multiple) break;
            }
        } catch (err) {
            ok = false;
            const msg = err.code === 'ECONNABORTED'
                ? 'La subida ha tardado demasiado. Comprueba tu conexión e inténtalo de nuevo.'
                : (err.response?.data?.error || 'No se pudo subir. Inténtalo de nuevo.');
            setSlotError(prev => ({ ...prev, [slot.key]: msg }));
        } finally {
            setBusySlot(null);
            setUploadPct(prev => ({ ...prev, [slot.key]: undefined }));
            setUploadN(prev => ({ ...prev, [slot.key]: undefined }));
        }
        if (ok) {
            // Acuse visible y vuelta al recorrido automático: el apartado deja de
            // estar pendiente, así que el siguiente aparece solo.
            setFlash({ key: slot.key, n: files.length });
            setPasoKey(null);
        }
        return ok;
    };

    // Punto de entrada de TODAS las subidas (botón e input + arrastrar y soltar).
    // En slots "Otros" (slot.named) primero pedimos un nombre legible; el resto
    // sube directo. Conserva la lista de ficheros para subirla al confirmar.
    const requestUpload = (slot, fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return;
        if (slot.named) {
            setNameValue('');
            setNamePrompt({ slot, files });
        } else {
            uploadFiles(slot, files);
        }
    };

    const confirmNamePrompt = async () => {
        if (!namePrompt) return;
        const label = nameValue.trim();
        if (!label) return;
        const { slot, files } = namePrompt;
        setNamePrompt(null);
        setNameValue('');
        await uploadFiles(slot, files, label);
    };

    const deleteItem = async (slot, item) => {
        setBusySlot(slot.key);
        try {
            await axios.delete(`/api/public/reforma-docs/${uuidRef.current}/${slot.key}`, { params: { token: tokenRef.current, name: item.name, driveId: item.driveId || undefined } });
            patchSlot(slot.key, s => {
                const items = (s.items || []).filter(it => (item.driveId ? it.driveId !== item.driveId : it.name !== item.name));
                return { ...s, items, estado: rollup(items) };
            });
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo borrar.' }));
        } finally {
            setBusySlot(null);
        }
    };

    // Cambiar (sustituir) una foto desde el visor: sube la nueva primero y, solo si
    // va bien, borra la antigua (sin ventana de pérdida de datos).
    const replaceItem = async (slot, item, file) => {
        if (!file) return;
        setLbReplacing(true);
        try {
            // Conserva el nombre legible en los slots "Otros" al sustituir.
            const ok = await uploadFiles(slot, [file], slot.named ? (item.label || null) : null);
            if (ok) {
                await deleteItem(slot, item);
                setLightbox(null);
                setLbConfirmDelete(false);
            }
        } finally {
            setLbReplacing(false);
        }
    };

    const reviewItem = async (slot, item, accion, motivo = null, notifyTarget = undefined) => {
        setActing(`${slot.key}:${item.name}`);
        try {
            await axios.post(`/api/oportunidades/${idOrUuid}/docs/${slot.key}/${accion === 'validar' ? 'validar' : 'rechazar'}`,
                accion === 'validar' ? { name: item.name } : { name: item.name, motivo, notifyTarget });
            patchSlot(slot.key, s => {
                const items = (s.items || []).map(it => it.name === item.name
                    ? { ...it, estado: accion === 'validar' ? 'validada' : 'rechazada', motivo: accion === 'validar' ? null : motivo }
                    : it);
                return { ...s, items, estado: rollup(items) };
            });
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo guardar la revisión.' }));
        } finally {
            setActing(null);
        }
    };

    // Admin: marca un obligatorio como "no necesario" (o lo reactiva).
    const toggleWaive = async (slot) => {
        const next = !slot.waived;
        setWaiving(slot.key);
        setSlotError(prev => ({ ...prev, [slot.key]: null }));
        try {
            await axios.post(`/api/oportunidades/${idOrUuid}/docs/${slot.key}/waive`, { waived: next });
            patchSlot(slot.key, s => ({ ...s, waived: next, required: next ? false : (s.baseRequired ?? s.required) }));
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo cambiar.' }));
        } finally {
            setWaiving(null);
        }
    };

    // Une las fotos de un slot (p.ej. las páginas del CEE existente) en un único PDF.
    // El backend las funde, sube el PDF a Drive y borra las sueltas → recargamos.
    const mergeSlotPdf = async (slot) => {
        setMerging(slot.key);
        setSlotError(prev => ({ ...prev, [slot.key]: null }));
        try {
            const res = await axios.post(
                `/api/public/reforma-docs/${uuidRef.current}/${slot.key}/merge-pdf`,
                null,
                { params: { token: tokenRef.current } }
            );
            await load(true); // el slot ahora muestra el PDF unificado en vez de las fotos
            if (res.data?.skipped > 0) {
                setSlotError(prev => ({ ...prev, [slot.key]: res.data.message }));
            }
        } catch (err) {
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo unir en un PDF.' }));
        } finally {
            setMerging(null);
        }
    };

    // Admin: habilita (o quita) un APARTADO de foto extra para este expediente
    // (ventanas, cubierta, fachada…) cuando el alcance cambió a posteriori.
    // Tras guardar, recarga para que aparezcan/desaparezcan los slots.
    const enableConcept = async (concept, enabled) => {
        setConceptBusy(concept.id);
        setConceptError(null);
        try {
            await axios.post(`/api/oportunidades/${idOrUuid}/docs/concept`, { conceptId: concept.id, enabled });
            await load(true);
        } catch (err) {
            setConceptError(err.response?.data?.error || 'No se pudo cambiar el apartado.');
        } finally {
            setConceptBusy(null);
        }
    };

    const confirmReject = async () => {
        if (!rejectMotivo.trim()) return;
        const { slot, item } = reject;
        setReject(null);
        await reviewItem(slot, item, 'rechazar', rejectMotivo.trim(), rejectNotifyTarget);
        setRejectMotivo('');
    };

    // Valida en serie una lista de { slot, item } (solo las que están en 'subida').
    // busyKey identifica el origen (slot.key, '__antes__' o '__despues__') para el spinner.
    const validateMany = async (targets, busyKey) => {
        const pend = (targets || []).filter(({ item }) => (item.estado || 'subida') === 'subida');
        if (!pend.length) return;
        setBulkValidating(busyKey);
        try {
            for (const { slot, item } of pend) {
                // reviewItem ya parchea el estado local foto a foto
                // eslint-disable-next-line no-await-in-loop
                await reviewItem(slot, item, 'validar');
            }
        } finally {
            setBulkValidating(null);
        }
    };

    // Recolecta los { slot, item } pendientes de revisión (estado 'subida') de una lista de slots.
    const pendingItemsOf = (slotList) => {
        const out = [];
        for (const s of slotList || []) {
            for (const it of (s.items || [])) {
                if ((it.estado || 'subida') === 'subida') out.push({ slot: s, item: it });
            }
        }
        return out;
    };

    if (loading) return <div className="py-16 text-center text-amber-500 font-bold tracking-widest text-sm uppercase animate-pulse">Cargando…</div>;
    if (error) return (
        <div className="py-16 text-center">
            <div className="text-5xl mb-4">🔒</div>
            <p className="text-white/70 font-bold">{error}</p>
        </div>
    );

    const slots = info?.slots || [];
    const aceptada = !!info?.aceptada;
    const canSeeDespues = aceptada || mode === 'admin' || roleFase === 'DESPUES';
    // Enlace público = se abre CON EL MÓVIL, de pie y desde un WhatsApp. Manda una
    // sola lista priorizada ("qué me falta"), no dos pestañas que hay que descubrir.
    // El admin trabaja con el PC sobre el expediente entero: conserva pestañas,
    // densidad y los controles de validación.
    const clientView = mode === 'token';

    // Un slot puede estar cubierto por un documento que ya está en el módulo de
    // Documentación del expediente (el RITE en cert_rite_drive_link, o facturas):
    // llega como externalRite/externalDocs, NO como items. Cuenta como resuelto —
    // es el MISMO documento, solo subido por otra puerta. Sin esto, el slot se
    // pintaba "Obligatorio/pendiente" teniéndolo ya, y parecía que faltaba.
    const coveredExternally = (s) => !(s.items?.length) && (!!s.externalRite || (s.externalDocs?.length > 0));
    const slotDone = (s) => (s.items?.length > 0) || coveredExternally(s);

    // Orden dentro de cada fase: lo accionable arriba, lo ya resuelto abajo.
    //   0 · rechazada (hay que volver a subir)   1 · pendiente (aún sin foto)
    //   2 · subida / en revisión   3 · validada / aportado en Doc.   4 · "no necesario"   5 · catch-all
    const tierOf = (s) => {
        if (s.existing) return 5;       // catch-all "ya aportados" → siempre al final del todo
        if (s.waived) return 4;         // marcado "no necesario" → por debajo de los validados
        if (coveredExternally(s)) return 3; // ya aportado en Documentación → resuelto
        const e = s.estado || (s.items?.length ? 'subida' : 'pendiente');
        if (e === 'rechazada') return 0; // acción urgente (volver a subir) → arriba del todo
        if (e === 'pendiente') return 1; // aún sin foto → acción pendiente, sube arriba
        if (e === 'validada') return 3;  // validadas → al fondo (ya resueltas)
        return 2;                        // subida / en revisión
    };
    const byTier = (arr) => arr
        .map((s, i) => ({ s, i }))
        .sort((a, b) => (tierOf(a.s) - tierOf(b.s)) || (a.i - b.i))
        .map(x => x.s);

    const matchesNeed = (s) => !needSet || needSet.has(s.key);
    const antes = byTier(slots.filter(s => s.fase === 'ANTES' && matchesNeed(s)));
    const despues = byTier(slots.filter(s => s.fase === 'DESPUES' && matchesNeed(s)));
    const reqAntes = antes.filter(s => s.required);
    const reqDone = reqAntes.filter(slotDone).length;
    const allReqDone = reqAntes.length > 0 && reqDone === reqAntes.length;

    // Progreso de la fase DESPUÉS (todas opcionales): apartados ya cubiertos
    // (foto subida O documento aportado en Documentación, p.ej. el RITE).
    const despuesSlots = despues.filter(s => !s.existing);
    const despuesDone = despuesSlots.filter(slotDone).length;

    // Pendientes de revisión (estado 'subida') por fase, para los botones de "validar todo".
    const antesPending = canValidate ? pendingItemsOf(antes) : [];
    const despuesPending = canValidate ? pendingItemsOf(despues) : [];

    // ── Reparto para la vista del CLIENTE ───────────────────────────────────
    // Un apartado pide acción si no tiene nada O si le rechazamos una foto (esa
    // vuelve arriba: es lo más urgente que puede haber en la pantalla).
    // Los "waived" (marcados no necesarios por el admin) y el cajón de material
    // ya aportado no se le enseñan como tarea.
    const necesitaAccion = (s) => !s.existing && !s.waived && (s.estado === 'rechazada' || !slotDone(s));
    const cliVisibles = (roleFase ? slots.filter(s => s.fase === roleFase) : slots.filter(s => s.fase === 'ANTES' || canSeeDespues))
        .filter(matchesNeed);
    const cliPendientes = byTier(cliVisibles.filter(necesitaAccion));
    const cliHechos = byTier(cliVisibles.filter(s => !necesitaAccion(s)));
    const cliRechazadas = cliPendientes.filter(s => s.estado === 'rechazada').length;
    // La barra mide apartados resueltos sobre los que se le piden de verdad.
    const cliTotal = cliVisibles.filter(s => !s.existing && !s.waived).length;
    const cliDone = Math.max(0, cliTotal - cliPendientes.length);
    const cliPct = cliTotal > 0 ? Math.round((cliDone / cliTotal) * 100) : 100;

    // ── EL ORDEN DE UNA REFORMA: PRIMERO LO VIEJO, DESPUÉS LO NUEVO ─────────
    // Una obra se documenta en dos actos y NO se pueden mezclar: primero lo que se
    // va a sustituir (la caldera vieja y su placa, las ventanas que se cambian, la
    // cubierta antes de tocarla) y solo después lo instalado.
    //
    // No es una preferencia de orden, es la única secuencia posible: la foto de la
    // caldera vieja hay que hacerla ANTES de desmontarla, y una vez fuera ya no se
    // puede recuperar — el expediente se queda sin el estado inicial y sin nada que
    // justifique el ahorro. Pedirle la placa de la aerotermia nueva a quien todavía
    // no ha fotografiado lo viejo es, además, pedirle lo imposible.
    //
    // Por eso la fase activa NO se decide por si ya hay alguna foto del "después"
    // (era el fallo: una sola foto del después adelantaba la fase entera y dejaba
    // el "antes" pendiente en un bloque al final de la pantalla). Se decide por si
    // queda algo pendiente del "antes".
    const obraEnMarcha = !!(finObra || info.fin_obra)
        || cliVisibles.some(s => s.fase === 'DESPUES' && slotDone(s));
    const pendAntes = cliPendientes.filter(s => s.fase === 'ANTES');
    const pendDespues = cliPendientes.filter(s => s.fase === 'DESPUES');
    // `faseManual` es la salida para quien llega con la obra YA TERMINADA y quiere
    // subirlo todo de una sentada: sigue siendo A y luego B, pero puede adelantarse
    // a B sin tener que ir aplazando apartado por apartado.
    const faseActiva = faseManual
        || (pendAntes.some(s => !saltados.has(s.key)) ? 'ANTES' : 'DESPUES');
    const cliAhora = faseActiva === 'DESPUES' ? pendDespues : pendAntes;
    const cliLuego = faseActiva === 'DESPUES' ? pendAntes : pendDespues;
    const cliObligatorias = cliAhora.filter(s => s.required).length;
    // ── Modo guiado: la COLA ────────────────────────────────────────────────
    // Se enseña siempre el PRIMER pendiente. Al subirlo deja de estar pendiente y
    // el siguiente aparece solo: no hace falta llevar un índice que se desajuste
    // cuando la lista cambia bajo los pies. "Ahora no" lo aparta a `saltados`; si
    // acaba apartando todos, la cola vuelve a empezar en vez de quedarse vacía —
    // aplazar no puede convertirse en "ya no me lo pides nunca".
    const colaGuiada = cliAhora.filter(s => !saltados.has(s.key));

    // RECORRIDO COMPLETO de la fase activa: lo pendiente Y lo ya enviado, en el
    // orden natural del checklist (no el de urgencia). Es lo que permite volver
    // atrás a mirar la foto que se subió antes — sin esto, un apartado resuelto
    // desaparecía de la pantalla y no había forma de volver a verlo.
    const recorrido = cliVisibles.filter(s => s.fase === faseActiva && !s.existing && !s.waived);
    // Progreso DE ESTA FASE, no global: mezclar "Paso 3 de 6" con una barra que
    // mide las dos fases juntas no dice nada. Cada acto tiene su propia cuenta.
    const faseDone = recorrido.filter(s => !necesitaAccion(s)).length;
    const fasePct = recorrido.length ? Math.round((faseDone / recorrido.length) * 100) : 100;
    // ¿Se acaba de cerrar la fase A? (para anunciar el paso a la B)
    const antesCerrado = faseActiva === 'DESPUES'
        && cliVisibles.some(s => s.fase === 'ANTES' && !s.existing && !s.waived)
        && pendAntes.length === 0;

    // Qué se enseña: lo que el cliente haya elegido con Anterior/Siguiente y, si
    // no ha elegido nada, el primer pendiente por urgencia (lo rechazado primero).
    const pasoSlot = (pasoKey && recorrido.find(s => s.key === pasoKey))
        || colaGuiada[0] || cliAhora[0] || null;
    const pasoIdx = pasoSlot ? recorrido.findIndex(s => s.key === pasoSlot.key) : -1;
    const enGuiado = clientView && guiado && !!pasoSlot;

    /** Mueve el recorrido. `salta` aparta el actual para que el automático no vuelva a él. */
    const irA = (idx, salta = false) => {
        if (salta && pasoSlot) setSaltados(prev => new Set(prev).add(pasoSlot.key));
        const destino = recorrido[idx];
        setPasoKey(destino ? destino.key : null);
        setFlash(null);
    };

    // El bloque de la fase que NO toca. Lo manda `faseActiva`, no `obraEnMarcha`:
    // si el bloque activo es el "antes", lo de después es "para cuando termines".
    const tituloLuego = faseActiva === 'DESPUES'
        ? 'Del estado anterior a la obra'
        : 'Para cuando termine la obra';
    const ayudaLuego = faseActiva === 'DESPUES'
        ? 'Quedó pendiente de antes de empezar. Si ya no puedes hacerlo, dínoslo y lo resolvemos por otra vía.'
        : 'No hace falta que lo hagas ahora: te lo dejamos aquí para cuando la instalación esté terminada.';

    // Comunicar el FIN DE OBRA: avisa a Brokergy (WhatsApp + email) y deja fecha en
    // el expediente. El backend ignora las repeticiones dentro de 24 h.
    const comunicarFinObra = async () => {
        setFinBusy(true);
        setFinError(null);
        try {
            const r = await axios.post(
                `/api/public/reforma-docs/${uuidRef.current}/fin-obra`,
                { rol: rol || (roleFase === 'DESPUES' ? 'instalador' : 'cliente') },
                { params: { token: tokenRef.current } }
            );
            setFinObra(r.data?.at || new Date().toISOString());
            setFinConfirm(false);
        } catch (err) {
            setFinError(err.response?.data?.error || 'No pudimos enviar el aviso. Inténtalo de nuevo.');
        } finally {
            setFinBusy(false);
        }
    };

    // Cómo se NOMBRA el apartado según quién mira. El backend manda los dos: el
    // técnico ("Placa de la unidad interior / DEPOSITO ACS"), con el que trabajan
    // el admin, el Anexo Fotográfico y el CIFO, y el de cliente ("La pegatina de
    // la máquina de dentro"). Un slot sin traducir cae al técnico.
    const textoDe = (slot) => (clientView
        ? { label: slot.labelCliente || slot.label, help: slot.helpCliente || slot.help }
        : { label: slot.label, help: slot.help });

    // Qué pone el botón MIENTRAS sube. Con varias fotos, el porcentaje suelto
    // vuelve a cero en cada una y da la sensación de que se ha colgado; decir
    // "3 de 7" es lo que deja esperar tranquilo.
    const textoSubiendo = (slot) => {
        const n = uploadN[slot.key];
        const pct = uploadPct[slot.key];
        if (n && n.total > 1) return `Subiendo ${Math.min(n.hecho + 1, n.total)} de ${n.total}…`;
        return pct != null ? `Subiendo… ${pct}%` : 'Subiendo…';
    };

    // Texto del botón de subida.
    //
    // NUNCA dice "Hacer foto": al pulsar, el móvil ofrece cámara Y galería, y
    // muchas de estas fotos ya están hechas de antes. Decir "hacer" hacía pensar
    // que había que estar delante del equipo en ese momento. Y va en PLURAL
    // cuando el apartado admite varias, que es donde el selector deja marcar más
    // de una: si el botón dice "foto" en singular, nadie prueba a marcar dos.
    const uploadCta = (slot, done) => {
        const varias = !!slot.multiple;
        if (done) return varias ? '+ Añadir más' : 'Cambiar';
        if (!clientView) return 'Subir';
        if (slot.key.startsWith('VIDEO_')) return '🎥 Subir vídeo';
        if (slot.key.startsWith('FOTO_')) return varias ? '📷 Subir fotos' : '📷 Subir foto';
        return varias ? '📎 Subir archivos' : '📎 Subir archivo';
    };

    const renderSlot = (slot) => {
        const items = slot.items || [];
        // Cubierto por Documentación (RITE/facturas ya en el expediente): resuelto,
        // aunque no tenga fichero propio en este slot. Ver coveredExternally.
        const coveredExt = coveredExternally(slot);
        const done = items.length > 0 || coveredExt;
        const busy = busySlot === slot.key;
        const estado = slot.estado || (items.length ? 'subida' : 'pendiente');
        // Anillo verde de "resuelto"; el chip propio lo pone externalRite/externalDocs
        // más abajo, así que aquí no duplicamos etiqueta (ui.chip se calla si coveredExt).
        const ui = coveredExt ? ESTADO_UI.validada : (ESTADO_UI[estado] || ESTADO_UI.pendiente);
        const isDragOver = !slot.existing && !busy && dragOver === slot.key;

        const dragHandlers = slot.existing ? {} : {
            onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); if (dragOver !== slot.key) setDragOver(slot.key); },
            onDragEnter: (e) => { e.preventDefault(); e.stopPropagation(); setDragOver(slot.key); },
            onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); },
            onDrop: (e) => {
                e.preventDefault(); e.stopPropagation();
                setDragOver(null);
                if (!busy) { const files = e.dataTransfer.files; if (files?.length) requestUpload(slot, files); }
            },
        };

        return (
            <div key={slot.key} {...dragHandlers} className={`p-4 md:p-5 rounded-2xl border-2 transition-all relative ${isDragOver ? 'border-amber-400 bg-amber-400/[0.1] shadow-[0_0_28px_rgba(251,191,36,0.28)] scale-[1.006]' : done ? ui.ring : slot.required ? 'border-amber-400/30 bg-amber-400/[0.04]' : 'border-white/10 bg-white/[0.03]'}`}>
            {isDragOver && (
                <div className="absolute inset-0 rounded-2xl flex items-center justify-center pointer-events-none z-10">
                    <div className="flex items-center gap-2 bg-black/70 backdrop-blur-sm px-5 py-2.5 rounded-xl border border-amber-400/60 shadow-xl shadow-amber-500/20">
                        <span className="text-xl leading-none">📥</span>
                        <span className="text-amber-300 font-black text-xs uppercase tracking-widest">Suelta para subir</span>
                    </div>
                </div>
            )}
                {/* En el enlace del cliente (móvil) el botón cae DEBAJO y a todo el
                    ancho: con el botón a la derecha, un título de dos líneas lo
                    empuja fuera del pulgar y la tarjeta deja de tener un objetivo
                    táctil claro. En el panel del admin (ratón) sigue a la derecha. */}
                <div className={`flex gap-4 ${clientView && !done ? 'flex-col items-stretch' : 'items-start justify-between'}`}>
                    <div className="flex-1 min-w-0">
                        <p className={`font-black text-sm md:text-base flex items-center gap-2 flex-wrap ${slot.waived ? 'text-white/50' : 'text-white'}`}>
                            {textoDe(slot).label}
                            {slot.required && !done && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">Obligatorio</span>}
                            {slot.waived && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/50">No necesario</span>}
                            {/* Documento que emite el INSTALADOR (RITE). Se ofrece por si ya
                                lo tiene, pero no es tarea del cliente: se lo pedimos nosotros. */}
                            {slot.aportaInstalador && !done && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-sky-400/15 text-sky-300">Lo aporta el instalador</span>}
                            {ui.chip && !coveredExt && <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${ui.chip.cls}`}>{ui.chip.txt}</span>}
                        </p>
                        {textoDe(slot).help && <p className="text-white/45 text-xs mt-1 leading-snug">{textoDe(slot).help}</p>}
                        {/* RITE unificado: ya aportado como enlace en el módulo de Documentación (admin) */}
                        {slot.externalRite && (
                            <a href={slot.externalRite.link} target="_blank" rel="noreferrer"
                                className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 transition-all">
                                ✓ Aportado en Documentación · Ver PDF
                            </a>
                        )}
                        {/* Facturas que ya están en el módulo de Documentación del expediente (admin) */}
                        {slot.externalDocs?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-2">
                                {slot.externalDocs.map((d, i) => (
                                    <a key={i} href={d.link} target="_blank" rel="noreferrer"
                                        className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-lg border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 transition-all">
                                        ✓ {d.label} (Documentación) · Ver
                                    </a>
                                ))}
                            </div>
                        )}
                        {/* Admin: marcar obligatorio (o cualquier slot de DESPUÉS) como "no necesario" (o reactivar) */}
                        {canValidate && (slot.required || slot.waived || slot.fase === 'DESPUES') && !slot.existing && (
                            <button
                                onClick={() => toggleWaive(slot)}
                                disabled={waiving === slot.key}
                                className={`mt-2 mr-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all disabled:opacity-40 ${slot.waived ? 'border-amber-400/30 text-amber-300 hover:bg-amber-400/10' : 'border-white/15 text-white/50 hover:bg-white/[0.06] hover:text-white/80'}`}
                            >
                                {waiving === slot.key ? '…' : slot.waived ? '↺ Volver a pedir' : '🚫 Marcar “no necesario”'}
                            </button>
                        )}
                        {/* Admin: validar de golpe todas las fotos pendientes de este slot (si hay varias) */}
                        {canValidate && (() => {
                            const pend = items.filter(it => (it.estado || 'subida') === 'subida');
                            if (items.length < 2 || pend.length === 0) return null;
                            return (
                                <button
                                    onClick={() => validateMany(pend.map(item => ({ slot, item })), slot.key)}
                                    disabled={bulkValidating !== null}
                                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-emerald-400/30 text-emerald-300 hover:bg-emerald-400/10 transition-all disabled:opacity-40"
                                >
                                    {bulkValidating === slot.key ? '…' : `✓ Validar todas (${pend.length})`}
                                </button>
                            );
                        })()}

                        {/* Unir las fotos del slot en un único PDF (CEE existente y similares).
                            Aparece cuando hay 2+ imágenes; las funde, sube el PDF y borra las sueltas. */}
                        {slot.mergePdf && (() => {
                            const imgCount = items.filter(isImageItem).length;
                            if (imgCount < 2) return null;
                            return (
                                <button
                                    onClick={() => mergeSlotPdf(slot)}
                                    disabled={merging === slot.key || busy}
                                    className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border border-sky-400/30 text-sky-300 hover:bg-sky-400/10 transition-all disabled:opacity-40"
                                >
                                    {merging === slot.key ? 'Uniendo…' : `📄 Unir ${imgCount} fotos en un PDF`}
                                </button>
                            );
                        })()}

                        {items.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-3">
                                {items.map((it, i) => {
                                    const fEstado = it.estado || 'subida';
                                    const img = isImageItem(it);
                                    const doc = img ? null : docMetaFor(it);
                                    return (
                                        <div key={i} className="flex flex-col items-center gap-1">
                                            <div className="relative group">
                                                {img ? (
                                                    <button
                                                        onClick={() => { setLbConfirmDelete(false); setLightbox({ slot, item: it, localUrl: it.localUrl, driveId: it.driveId, thumb: it.thumb, label: slot.label }); }}
                                                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${FOTO_ESTADO_BORDER[fEstado]} hover:opacity-90 transition-all block`}
                                                        title={it.motivo ? `Rechazada: ${it.motivo}` : 'Ver en grande'}
                                                    >
                                                        <DriveImg localUrl={it.localUrl} proxySrc={thumbProxy(it.driveId, 400)} driveId={it.driveId} thumb={it.thumb} size={400} fit="cover" />
                                                    </button>
                                                ) : (
                                                    <a
                                                        href={it.link || (it.driveId ? `https://drive.google.com/file/d/${it.driveId}/view` : '#')}
                                                        target="_blank" rel="noreferrer"
                                                        className={`relative w-16 h-16 rounded-lg overflow-hidden border-2 ${FOTO_ESTADO_BORDER[fEstado]} hover:opacity-90 transition-all flex flex-col items-center justify-center gap-0.5 bg-white/[0.04]`}
                                                        title={`${it.name}${it.motivo ? ` · Rechazada: ${it.motivo}` : ''}`}
                                                    >
                                                        <span className="text-xl leading-none">{doc.icon}</span>
                                                        <span className="text-[7px] font-black uppercase tracking-wider text-white/50">{doc.ext}</span>
                                                    </a>
                                                )}
                                                {/* Borrar: solo ADMIN */}
                                                {canValidate && (
                                                    <button onClick={() => deleteItem(slot, it)} disabled={busy} title="Eliminar"
                                                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-black flex items-center justify-center shadow-lg max-md:opacity-100 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50">✕</button>
                                                )}
                                                {/* Publicada en el escaparate → badge estrella */}
                                                {img && publicadas[it.driveId] && (
                                                    <span title="Publicada en el escaparate público"
                                                        className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-amber-500 text-white text-[10px] flex items-center justify-center shadow-lg">★</span>
                                                )}
                                            </div>
                                            {/* Nombre legible del documento (slots "Otros") */}
                                            {it.label && (
                                                <span className="text-[9px] text-white/55 font-bold max-w-[72px] text-center leading-tight break-words" title={it.label}>{it.label}</span>
                                            )}
                                            {/* Controles de validación (solo admin) */}
                                            {canValidate && (
                                                <div className="flex items-center gap-1.5">
                                                    <button onClick={() => reviewItem(slot, it, 'validar')} disabled={acting === `${slot.key}:${it.name}` || bulkValidating !== null}
                                                        title="Validar foto" aria-label="Validar foto"
                                                        className={`w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center transition-all disabled:opacity-50 ${fEstado === 'validada' ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/30'}`}>✓</button>
                                                    <button onClick={() => {
                                                        setReject({ slot, item: it });
                                                        setRejectMotivo('');
                                                        const sbp = it.subido_por;
                                                        if (sbp === 'instalador' && info?.recipients?.instalador) setRejectNotifyTarget('instalador');
                                                        else if (info?.recipients?.cliente) setRejectNotifyTarget('cliente');
                                                        else setRejectNotifyTarget('ninguno');
                                                    }} disabled={acting === `${slot.key}:${it.name}` || bulkValidating !== null}
                                                        title="Rechazar foto" aria-label="Rechazar foto"
                                                        className={`w-7 h-7 rounded-lg text-sm font-black flex items-center justify-center transition-all disabled:opacity-50 ${fEstado === 'rechazada' ? 'bg-red-500 text-white shadow-sm shadow-red-500/30' : 'bg-red-500/15 text-red-300 hover:bg-red-500/30'}`}>✗</button>
                                                    {/* Publicar en el escaparate — solo fotos VALIDADAS */}
                                                    {img && fEstado === 'validada' && (
                                                        publicadas[it.driveId]
                                                            ? <button onClick={() => unpublish(it)} disabled={pubBusy} title="Quitar del escaparate público"
                                                                className="w-7 h-7 rounded-lg text-sm flex items-center justify-center bg-amber-500 text-white shadow-sm shadow-amber-500/30 disabled:opacity-50">★</button>
                                                            : <button onClick={() => openPublish(slot, it)} disabled={pubBusy} title="Publicar en el escaparate público"
                                                                className="w-7 h-7 rounded-lg text-sm flex items-center justify-center bg-amber-500/15 text-amber-300 hover:bg-amber-500/30 disabled:opacity-50">☆</button>
                                                    )}
                                                </div>
                                            )}
                                            {fEstado === 'rechazada' && it.motivo && (
                                                <span className="text-[8px] text-red-300/80 max-w-[64px] text-center leading-tight">{it.motivo}</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        {slotError[slot.key] && <p className="text-red-400 text-xs mt-2">{slotError[slot.key]}</p>}
                    </div>

                    {!slot.existing && (
                        <div className={clientView && !done ? 'w-full' : 'shrink-0'}>
                            <label className={`block cursor-pointer rounded-xl font-black uppercase tracking-widest transition-all text-center ${clientView && !done ? 'w-full py-3.5 text-xs' : 'px-4 py-2.5 text-[11px]'} ${busy ? 'bg-white/10 text-white/40' : done ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/10' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/20'}`}>
                                {busy ? textoSubiendo(slot) : uploadCta(slot, done)}
                                <input type="file" accept={slot.accept}
                                    {...(slot.multiple ? { multiple: true } : {})}
                                    disabled={busy}
                                    onChange={e => { requestUpload(slot, e.target.files); e.target.value = ''; }}
                                    className="hidden" />
                            </label>
                            {/* Sin decirlo, nadie prueba a marcar más de una: el selector del
                                móvil no anuncia que admite selección múltiple. */}
                            {clientView && !done && slot.multiple && !busy && (
                                <p className="mt-1.5 text-center text-[11px] text-white/35">Puedes elegir varias a la vez</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div>
            {/* Cabecera de identificación */}
            <div className={`text-center ${embedded ? 'mb-4' : 'mb-6'}`}>
                {!embedded && <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight leading-tight">Documentación del expediente</h1>}
                <p className="text-white/60 text-sm mt-2">
                    Expediente <span className="font-mono text-amber-400 font-bold">{info.numero_expediente || info.id_oportunidad}</span>
                    {info.cliente ? <> · {info.cliente}</> : null}
                </p>
            </div>

            {/* ════════ VISTA DEL CLIENTE (enlace público, móvil) ════════
                Una sola lista: primero lo que hay que hacer, después —plegado— lo
                ya entregado. Sin pestañas: la pestaña "Después de la obra" era un
                sitio al que había que acordarse de entrar, y lo que falta ahí es
                tan urgente como lo de antes. */}
            {/* ════════ MODO GUIADO — un apartado en pantalla cada vez ════════
                Siete tarjetas iguales producen parálisis en quien no se maneja:
                busca lo primero que entiende y hace solo eso. Aquí hay UNA cosa,
                un dibujo de lo que se espera y un botón. Salida siempre a mano
                ("ver todos los apartados") para quien prefiera la lista. */}
            {enGuiado && (() => {
                const txt = textoDe(pasoSlot);
                const busy = busySlot === pasoSlot.key;
                const yaTiene = (pasoSlot.items || []).length;
                const paso = pasoIdx >= 0 ? pasoIdx + 1 : Math.min(cliDone + 1, cliTotal);
                const yaEnviado = !necesitaAccion(pasoSlot);
                return (
                    <div>
                        {/* Cabecera: dónde estoy y cuánto queda */}
                        {/* Qué ACTO se está documentando. Sin este rótulo, "Paso 3 de 6"
                            no dice si son las fotos de lo viejo o las de lo nuevo, que es
                            lo primero que hay que saber para hacerlas bien. */}
                        <div className="flex items-center justify-between gap-3 mb-2">
                            <span className={`text-[11px] font-black uppercase tracking-widest ${faseActiva === 'ANTES' ? 'text-amber-300/90' : 'text-emerald-300/90'}`}>
                                {faseActiva === 'ANTES' ? '① Antes de la obra' : '② La instalación nueva'}
                            </span>
                            <button onClick={() => setGuiado(false)}
                                className="text-[11px] font-bold text-white/45 hover:text-white/80 underline underline-offset-2">
                                Ver todos
                            </button>
                        </div>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="h-2 flex-1 rounded-full bg-white/10 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${faseActiva === 'ANTES' ? 'bg-gradient-to-r from-amber-500 to-amber-300' : 'bg-gradient-to-r from-emerald-500 to-emerald-300'}`}
                                    style={{ width: `${fasePct}%` }} />
                            </div>
                            <span className="shrink-0 text-[11px] font-black uppercase tracking-widest text-white/40">
                                {paso}/{recorrido.length}
                            </span>
                        </div>

                        {/* Se acaba de cerrar el primer acto: se anuncia, no se salta en
                            silencio. Es el hito que le dice que lo suyo va bien. */}
                        {antesCerrado && !flash && (
                            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] px-4 py-3 text-center">
                                <p className="text-emerald-300 font-black text-sm">✓ Ya tenemos todo lo de antes de la obra</p>
                                <p className="mt-1 text-white/50 text-xs">Ahora las fotos de la instalación nueva, ya terminada.</p>
                            </div>
                        )}

                        {flash && (
                            <div className="mb-3 flex items-center justify-center gap-2 rounded-2xl border border-emerald-400/40 bg-emerald-400/[0.12] py-3 text-emerald-300 font-black text-sm">
                                <span className="text-lg leading-none">✓</span>
                                {flash.n > 1 ? `${flash.n} fotos recibidas` : 'Recibida, gracias'}
                            </div>
                        )}

                        <div
                            onDragOver={(e) => { e.preventDefault(); if (!busy && dragOver !== pasoSlot.key) setDragOver(pasoSlot.key); }}
                            onDragEnter={(e) => { e.preventDefault(); if (!busy) setDragOver(pasoSlot.key); }}
                            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(null); }}
                            onDrop={(e) => {
                                e.preventDefault(); setDragOver(null);
                                if (!busy && e.dataTransfer.files?.length) requestUpload(pasoSlot, e.dataTransfer.files);
                            }}
                            className={`relative rounded-3xl border-2 p-5 md:p-6 transition-all ${dragOver === pasoSlot.key ? 'border-amber-400 bg-amber-400/[0.12] shadow-[0_0_36px_rgba(251,191,36,0.3)]' : pasoSlot.estado === 'rechazada' ? 'border-red-400/40 bg-red-400/[0.06]' : yaEnviado ? 'border-emerald-400/35 bg-emerald-400/[0.05]' : 'border-amber-400/30 bg-amber-400/[0.04]'}`}>
                            {dragOver === pasoSlot.key && (
                                <div className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-black/50 backdrop-blur-[2px] pointer-events-none">
                                    <span className="text-amber-300 font-black text-sm uppercase tracking-widest">📥 Suelta aquí las fotos</span>
                                </div>
                            )}
                            {pasoSlot.estado === 'rechazada' && (
                                <p className="mb-4 text-center text-xs font-black uppercase tracking-widest text-red-300">
                                    ⚠️ Hay que repetir esta foto
                                </p>
                            )}
                            {/* Apartado ya resuelto al que se ha vuelto con "Anterior".
                                Se dice claramente que NO hay nada que hacer aquí: si no,
                                se vuelve a subir la misma foto por si acaso. */}
                            {yaEnviado && pasoSlot.estado !== 'rechazada' && (
                                <p className="mb-4 text-center text-xs font-black uppercase tracking-widest text-emerald-300">
                                    ✓ Ya nos la has enviado
                                </p>
                            )}

                            {/* Qué se enseña arriba: si el apartado YA tiene foto, la SUYA
                                —es a lo que ha vuelto a mirar—; si no, el ejemplo, que
                                enseña el encuadre. A todo el ancho: en un móvil, una
                                miniatura de 160 px no deja ver si la pegatina se lee. */}
                            {yaTiene > 0 ? (
                                <button
                                    onClick={() => { const it = pasoSlot.items[0]; setLbConfirmDelete(false); setLightbox({ slot: pasoSlot, item: it, localUrl: it.localUrl, driveId: it.driveId, thumb: it.thumb, label: txt.label }); }}
                                    className="relative mb-4 aspect-[7/6] w-full max-w-sm mx-auto block overflow-hidden rounded-2xl border-2 border-emerald-400/40">
                                    <DriveImg localUrl={pasoSlot.items[0].localUrl} proxySrc={thumbProxy(pasoSlot.items[0].driveId, 800)} driveId={pasoSlot.items[0].driveId} thumb={pasoSlot.items[0].thumb} size={800} fit="cover" />
                                    <span className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white/90 backdrop-blur-sm">
                                        🔍 Ver en grande
                                    </span>
                                </button>
                            ) : tieneIlustracion(pasoSlot.key) ? (
                                <div className="mb-4 aspect-[7/6] w-full max-w-sm mx-auto">
                                    <SlotIlustracion slotKey={pasoSlot.key} className="w-full h-full" />
                                </div>
                            ) : null}

                            <h2 className="text-center text-xl md:text-2xl font-black text-white leading-tight">{txt.label}</h2>
                            {txt.help && <p className="mt-2.5 text-center text-sm text-white/55 leading-relaxed">{txt.help}</p>}

                            {/* Motivo del rechazo: qué falló exactamente la vez anterior */}
                            {pasoSlot.estado === 'rechazada' && (pasoSlot.items || []).filter(i => i.motivo).map((i, n) => (
                                <p key={n} className="mt-3 text-center text-xs text-red-300/90 bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">{i.motivo}</p>
                            ))}

                            {/* Lo ya subido a ESTE apartado, por si añade más */}
                            {/* Quitar la foto que acaba de ver y no le convence. Solo las que
                                están PENDIENTES DE REVISIÓN: una ya validada forma parte del
                                expediente y no se toca desde aquí. Volver atrás a mirar y no
                                poder corregir es media función; sin esto, el cliente sube la
                                buena encima y nos deja las dos, y hay que adivinar cuál vale. */}
                            {yaTiene > 0 && (pasoSlot.items[0].estado || 'subida') === 'subida' && !busy && (
                                quitarConfirm === pasoSlot.items[0].name ? (
                                    <div className="mt-3 flex items-center justify-center gap-2">
                                        <button onClick={async () => { setQuitarConfirm(null); await deleteItem(pasoSlot, pasoSlot.items[0]); }}
                                            className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-400/40 text-red-300 text-[11px] font-black uppercase tracking-widest hover:bg-red-500/30 transition-all">
                                            Sí, quitarla
                                        </button>
                                        <button onClick={() => setQuitarConfirm(null)}
                                            className="px-4 py-2 rounded-xl border border-white/15 text-white/50 text-[11px] font-black uppercase tracking-widest hover:text-white/80 transition-all">
                                            No, dejarla
                                        </button>
                                    </div>
                                ) : (
                                    <button onClick={() => setQuitarConfirm(pasoSlot.items[0].name)}
                                        className="mt-3 mx-auto block text-[11px] font-bold text-white/35 hover:text-red-300 transition-colors underline underline-offset-2">
                                        Esta foto no vale · quitarla
                                    </button>
                                )
                            )}

                            {yaTiene > 1 && (
                                <div className="mt-4 flex flex-wrap justify-center gap-2">
                                    {(pasoSlot.items || []).slice(1, 6).map((it, n) => (
                                        <button key={n}
                                            onClick={() => { setLbConfirmDelete(false); setLightbox({ slot: pasoSlot, item: it, localUrl: it.localUrl, driveId: it.driveId, thumb: it.thumb, label: txt.label }); }}
                                            className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/15">
                                            <DriveImg localUrl={it.localUrl} proxySrc={thumbProxy(it.driveId, 200)} driveId={it.driveId} thumb={it.thumb} size={200} fit="cover" />
                                        </button>
                                    ))}
                                    {yaTiene > 6 && <div className="w-14 h-14 rounded-lg border border-white/15 flex items-center justify-center text-[11px] font-black text-white/50">+{yaTiene - 6}</div>}
                                </div>
                            )}

                            <label className={`mt-5 block cursor-pointer rounded-2xl py-4 text-center font-black uppercase tracking-widest text-sm transition-all ${busy ? 'bg-white/10 text-white/40' : yaEnviado ? 'border border-white/15 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/25'}`}>
                                {busy ? textoSubiendo(pasoSlot) : uploadCta(pasoSlot, yaEnviado)}
                                <input type="file" accept={pasoSlot.accept}
                                    {...(pasoSlot.multiple ? { multiple: true } : {})}
                                    disabled={busy}
                                    onChange={e => { requestUpload(pasoSlot, e.target.files); e.target.value = ''; }}
                                    className="hidden" />
                            </label>
                            {pasoSlot.multiple && !busy && (
                                <p className="mt-2 text-center text-[11px] text-white/35">
                                    Puedes elegir varias a la vez
                                    {/* El arrastrar y soltar solo existe con raton: en un movil
                                        no hay de donde arrastrar y mencionarlo solo confunde. */}
                                    <span className="hidden md:inline"> · o arrástralas aquí</span>
                                </p>
                            )}
                            {slotError[pasoSlot.key] && <p className="mt-3 text-center text-red-400 text-xs">{slotError[pasoSlot.key]}</p>}

                            {/* Navegación del recorrido. "Siguiente" sobre un apartado aún
                                pendiente lo APLAZA (vuelve más tarde), nunca lo omite; por
                                eso lo dice con esas palabras y no con un "saltar". */}
                            {!busy && recorrido.length > 1 && (
                                <div className="mt-4 flex items-center gap-2">
                                    <button
                                        onClick={() => irA(pasoIdx - 1)}
                                        disabled={pasoIdx <= 0}
                                        className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white/85 hover:border-white/25 transition-all disabled:opacity-25 disabled:hover:text-white/50 disabled:hover:border-white/10">
                                        ‹ Anterior
                                    </button>
                                    <button
                                        onClick={() => irA(pasoIdx + 1, !yaEnviado)}
                                        disabled={pasoIdx < 0 || pasoIdx >= recorrido.length - 1}
                                        className="flex-1 py-3 rounded-xl border border-white/10 text-xs font-bold uppercase tracking-widest text-white/50 hover:text-white/85 hover:border-white/25 transition-all disabled:opacity-25 disabled:hover:text-white/50 disabled:hover:border-white/10">
                                        {yaEnviado ? 'Siguiente ›' : 'Ahora no ›'}
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Adelantarse al segundo acto. Existe porque hay quien llega con
                            la obra YA TERMINADA y quiere subirlo todo de una sentada; sin
                            esto tendría que aplazar apartado por apartado. No rompe el
                            orden: lo de antes sigue pendiente y se le dice. */}
                        {faseActiva === 'ANTES' && pendDespues.length > 0 && (
                            <button onClick={() => { setFaseManual('DESPUES'); setPasoKey(null); }}
                                className="mt-4 w-full py-3 rounded-2xl border border-white/10 text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white/75 hover:border-white/25 transition-all">
                                ¿La obra ya está hecha? · Subir también lo nuevo
                            </button>
                        )}
                        {faseActiva === 'DESPUES' && pendAntes.length > 0 && (
                            <button onClick={() => { setFaseManual('ANTES'); setPasoKey(null); }}
                                className="mt-4 w-full py-3 rounded-2xl border border-amber-400/25 bg-amber-400/[0.05] text-[11px] font-bold uppercase tracking-widest text-amber-300/80 hover:bg-amber-400/[0.12] transition-all">
                                ‹ Te falta {pendAntes.length === 1 ? 'una foto' : `${pendAntes.length} fotos`} de antes de la obra
                            </button>
                        )}

                        {/* Lo que ya nos ha mandado: tranquiliza sin distraer */}
                        {cliHechos.filter(s => !s.existing).length > 0 && (
                            <p className="mt-5 text-center text-xs text-emerald-300/60 font-bold">
                                ✓ Ya nos has enviado {cliHechos.filter(s => !s.existing).length} {cliHechos.filter(s => !s.existing).length === 1 ? 'cosa' : 'cosas'}
                            </p>
                        )}

                        {/* Fin de obra: también disponible sin salir del recorrido */}
                        {canSeeDespues && roleFase !== 'ANTES' && !(finObra || info.fin_obra) && !finConfirm && (
                            <button onClick={() => { setFinConfirm(true); setFinError(null); setGuiado(false); }}
                                className="mt-5 w-full py-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/[0.07] text-emerald-300/90 font-black uppercase tracking-widest text-[11px] hover:bg-emerald-500/15 transition-all">
                                🏁 He terminado la obra
                            </button>
                        )}
                    </div>
                );
            })()}

            {clientView && !enGuiado && (
                <>
                    {/* Volver al recorrido guiado */}
                    {cliAhora.length > 0 && (
                        <button onClick={() => { setGuiado(true); setSaltados(new Set()); }}
                            className="mb-4 w-full py-2.5 rounded-xl border border-amber-400/30 bg-amber-400/[0.06] text-amber-300 text-[11px] font-black uppercase tracking-widest hover:bg-amber-400/[0.12] transition-all">
                            ← Guíame paso a paso
                        </button>
                    )}
                    {/* Progreso: cuánto queda, en una línea */}
                    <div className="mb-5 p-4 rounded-2xl border border-white/10 bg-white/[0.03]">
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="text-xs font-black uppercase tracking-widest text-white/55">
                                {cliPendientes.length === 0
                                    ? 'Todo entregado'
                                    : cliAhora.length === 0 ? 'Nada pendiente ahora mismo'
                                    : cliAhora.length === 1 ? 'Te falta 1 cosa' : `Te faltan ${cliAhora.length} cosas`}
                            </span>
                            <span className="text-xs font-black text-white/40 tabular-nums">{cliDone}/{cliTotal}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-emerald-400 transition-all duration-500"
                                style={{ width: `${cliPct}%` }} />
                        </div>
                        {cliObligatorias > 0 && (
                            <p className="mt-2.5 text-[11px] text-amber-300/90 font-bold leading-snug">
                                {cliObligatorias === 1 ? 'Queda 1 imprescindible' : `Quedan ${cliObligatorias} imprescindibles`} para poder tramitar tu ayuda.
                            </p>
                        )}
                    </div>

                    {/* Lo rechazado va primero y se anuncia: es lo único que el
                        cliente ya dio por hecho y sin embargo sigue pendiente. */}
                    {cliRechazadas > 0 && (
                        <div className="mb-4 p-4 rounded-2xl border border-red-400/30 bg-red-400/[0.08] text-sm text-red-200/90 leading-relaxed">
                            ⚠️ <strong className="text-red-200">{cliRechazadas === 1 ? 'Hay 1 foto que repetir' : `Hay ${cliRechazadas} fotos que repetir`}.</strong>{' '}
                            Está la primera de la lista, con el motivo debajo.
                        </div>
                    )}

                    {cliAhora.length > 0 ? (
                        <section>
                            <p className="mb-3 text-sm text-white/60 leading-relaxed">
                                {needSet
                                    ? <>📋 Sube <strong className="text-white/85">solo lo que te pedimos</strong> aquí abajo. Puedes hacerlo desde el móvil, archivo a archivo.</>
                                    : <>📷 Puedes hacerlo <strong className="text-white/85">desde el móvil, una foto cada vez</strong>. No hace falta terminarlo de una sentada: vuelve a este enlace cuando quieras y sigue por donde lo dejaste.</>}
                            </p>
                            <div className="space-y-3">{cliAhora.map(renderSlot)}</div>
                        </section>
                    ) : cliPendientes.length === 0 ? (
                        <div className="p-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] text-center">
                            <div className="text-4xl mb-2">✅</div>
                            <p className="text-emerald-300 font-black">¡Listo! No nos falta nada por tu parte.</p>
                            <p className="text-white/50 text-xs mt-2 leading-relaxed">
                                Revisaremos lo que nos has enviado. Si alguna foto no se ve bien, te avisamos para repetirla.
                            </p>
                        </div>
                    ) : (
                        <div className="p-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.08] text-center">
                            <p className="text-emerald-300 font-black text-sm">✓ Por ahora no necesitamos nada más de ti.</p>
                            <p className="text-white/50 text-xs mt-2 leading-relaxed">Lo de aquí abajo es para más adelante.</p>
                        </div>
                    )}

                    {/* La otra fase: visible, pero detrás y con su "cuándo toca". */}
                    {cliLuego.length > 0 && (
                        <section className="mt-6 pt-5 border-t border-white/10">
                            <p className="text-[11px] font-black uppercase tracking-widest text-white/40">{tituloLuego} ({cliLuego.length})</p>
                            <p className="mt-1.5 mb-3 text-xs text-white/45 leading-relaxed">{ayudaLuego}</p>
                            <div className="space-y-3 opacity-80">{cliLuego.map(renderSlot)}</div>
                        </section>
                    )}

                    {/* Ya entregado: plegado. Ocupa una línea hasta que se pide verlo. */}
                    {cliHechos.length > 0 && (
                        <section className="mt-6">
                            <button onClick={() => setVerHechos(v => !v)}
                                className="w-full flex items-center justify-between gap-3 py-3.5 px-4 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                                <span className="text-xs font-black uppercase tracking-widest text-emerald-300/70">✓ Ya nos lo has enviado ({cliHechos.length})</span>
                                <span className="text-white/35 text-[10px] font-black">{verHechos ? '▲ OCULTAR' : '▼ VER'}</span>
                            </button>
                            {verHechos && <div className="space-y-3 mt-3">{cliHechos.map(renderSlot)}</div>}
                        </section>
                    )}

                    {!canSeeDespues && (
                        <div className="mt-5 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed text-center">
                            🔒 Cuando aceptes la propuesta te pediremos aquí mismo las fotos de la instalación terminada.
                        </div>
                    )}

                    {/* Fin de obra: el aviso del CEE inicial pide que nos lo comuniquen,
                        así que el botón vive aquí (solo en el enlace público). No se
                        ofrece en un enlace acotado al ANTES: quien lo recibe no está
                        en obra. */}
                    {canSeeDespues && roleFase !== 'ANTES' && (
                        (finObra || info.fin_obra) ? (
                            <div className="mt-6 p-4 bg-emerald-400/[0.08] border border-emerald-400/30 rounded-2xl text-sm text-emerald-300 text-center font-bold">
                                🏁 Nos has comunicado el fin de obra. Ya estamos con el certificado final.
                            </div>
                        ) : !finConfirm ? (
                            <button onClick={() => { setFinConfirm(true); setFinError(null); }}
                                className="mt-6 w-full py-3.5 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 text-emerald-300 font-black uppercase tracking-widest text-xs hover:bg-emerald-500/20 transition-all">
                                🏁 He terminado la obra
                            </button>
                        ) : (
                            <div className="mt-6 p-4 bg-white/[0.04] border border-emerald-400/30 rounded-2xl">
                                <p className="text-sm text-white/70 leading-relaxed">
                                    ¿Confirmas que la instalación está <strong className="text-white">terminada</strong>? Avisaremos a Brokergy para empezar con el certificado final.
                                    Antes, asegúrate de haber subido <strong className="text-white">las fotos de la instalación acabada y la factura</strong>.
                                </p>
                                {finError && <p className="text-red-400 text-xs mt-2">{finError}</p>}
                                <div className="mt-4 flex gap-2">
                                    <button onClick={comunicarFinObra} disabled={finBusy}
                                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-400 text-black font-black uppercase tracking-widest text-xs disabled:opacity-50">
                                        {finBusy ? 'Enviando…' : 'Sí, avisar a Brokergy'}
                                    </button>
                                    <button onClick={() => setFinConfirm(false)} disabled={finBusy}
                                        className="px-4 py-3 rounded-xl text-white/50 font-black uppercase tracking-widest text-xs hover:text-white/80 disabled:opacity-50">
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )
                    )}
                </>
            )}

            {/* Tabs — ocultas cuando el enlace está scoped por rol (solo una fase)
                y en el enlace del cliente, que va en una sola lista. */}
            {!clientView && !roleFase && (
                <div className="grid grid-cols-2 gap-2 mb-6 p-1 bg-white/[0.03] rounded-2xl border border-white/10">
                    <button onClick={() => setTab('ANTES')}
                        className={`py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all ${tab === 'ANTES' ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/20' : 'text-white/50 hover:text-white/80'}`}>
                        📋 Antes de la obra
                    </button>
                    <button onClick={() => canSeeDespues && setTab('DESPUES')} disabled={!canSeeDespues}
                        title={canSeeDespues ? '' : 'Se activa al aceptar la propuesta'}
                        className={`py-3 rounded-xl font-black uppercase tracking-widest text-xs transition-all flex items-center justify-center gap-1.5 ${tab === 'DESPUES' ? 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/20' : canSeeDespues ? 'text-white/50 hover:text-white/80' : 'text-white/25 cursor-not-allowed'}`}>
                        {canSeeDespues ? '🔧' : '🔒'} Después de la obra
                    </button>
                </div>
            )}

            {/* Añadir apartado de obra (solo admin): habilita conceptos extra —ventanas,
                cubierta, fachada…— cuando el alcance del expediente cambió a posteriori. */}
            {canValidate && (info.addableConcepts?.length > 0) && (
                <button onClick={() => { setConceptError(null); setConceptPanel(true); }}
                    className="mb-6 w-full py-2.5 rounded-xl border border-dashed border-white/20 text-white/55 text-xs font-black uppercase tracking-widest hover:border-amber-400/50 hover:text-amber-300 transition-all">
                    ➕ Añadir apartado de obra
                </button>
            )}

            {!clientView && (tab === 'ANTES' ? (
                <section>
                    <div className="mb-4 p-4 bg-amber-400/[0.06] border border-amber-400/20 rounded-2xl text-sm text-white/70 leading-relaxed">
                        {needSet
                            ? <>📋 Sube <strong className="text-amber-300">solo lo que te pedimos</strong> aquí abajo. Puedes hacerlo desde el móvil, archivo a archivo.</>
                            : <>📸 Haz estas fotos durante la visita. Las marcadas como <strong className="text-amber-300">obligatorias</strong> son imprescindibles para empezar el expediente.</>}
                        {!needSet && reqAntes.length > 0 && <span className="block mt-2 text-xs font-black uppercase tracking-widest text-white/50">Obligatorias: {reqDone}/{reqAntes.length}</span>}
                    </div>
                    {allReqDone && <div className="mb-4 p-3 bg-emerald-400/[0.08] border border-emerald-400/30 rounded-xl text-sm text-emerald-300 font-bold text-center">✓ ¡Listo! Ya tenemos lo imprescindible.</div>}
                    {canValidate && antesPending.length > 0 && (
                        <button onClick={() => validateMany(antesPending, '__antes__')} disabled={bulkValidating !== null}
                            className="mb-4 w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-40">
                            {bulkValidating === '__antes__' ? 'Validando…' : `✓ Validar todo lo pendiente (${antesPending.length})`}
                        </button>
                    )}
                    <div className="space-y-3">{antes.map(renderSlot)}</div>
                </section>
            ) : (
                <section>
                    <div className="mb-4 p-4 bg-white/[0.04] border border-white/10 rounded-2xl text-sm text-white/70 leading-relaxed">
                        {needSet
                            ? <>📎 Sube <strong className="text-white">solo lo que te pedimos</strong> aquí abajo (factura, RITE o las fotos indicadas).</>
                            : <>🔧 Sube las fotos de la instalación <strong className="text-white">ya terminada</strong>. Puedes ir añadiéndolas según avance la obra.</>}
                        {!needSet && despuesSlots.length > 0 && <span className="block mt-2 text-xs font-black uppercase tracking-widest text-white/50">Subidas: {despuesDone}/{despuesSlots.length}</span>}
                    </div>
                    {canValidate && despuesPending.length > 0 && (
                        <button onClick={() => validateMany(despuesPending, '__despues__')} disabled={bulkValidating !== null}
                            className="mb-4 w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-400/30 text-emerald-300 text-xs font-black uppercase tracking-widest hover:bg-emerald-500/20 transition-all disabled:opacity-40">
                            {bulkValidating === '__despues__' ? 'Validando…' : `✓ Validar todo lo pendiente (${despuesPending.length})`}
                        </button>
                    )}
                    <div className="space-y-3">{despues.map(renderSlot)}</div>
                </section>
            ))}

            {!clientView && !roleFase && tab === 'ANTES' && !canSeeDespues && (
                <div className="mt-4 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed text-center">
                    🔒 La fase <strong className="text-white/60">Después de la obra</strong> se activará cuando se acepte la propuesta.
                </div>
            )}

            {/* Modal de rechazo */}
            {/* Modal: publicar foto en el escaparate público */}
            {pubModal && (
                <div className="fixed inset-0 z-[70] bg-black/70 flex items-center justify-center p-4" onClick={() => !pubBusy && setPubModal(null)}>
                    <div className="bg-bkg-elevated border border-amber-500/30 rounded-2xl p-5 max-w-md w-full" onClick={e => e.stopPropagation()}>
                        <h3 className="text-white font-black text-lg">★ Publicar en el escaparate</h3>
                        <p className="text-white/50 text-xs mt-1 mb-4">Esta foto se mostrará en la ficha pública del instalador (instaladores.brokergy.es). Solo municipio y mes; nunca datos del cliente.</p>
                        <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-amber-500/40 mx-auto mb-4">
                            <DriveImg proxySrc={thumbProxy(pubModal.item.driveId, 400)} driveId={pubModal.item.driveId} size={400} fit="cover" />
                        </div>
                        <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1">Título público</label>
                        <input value={pubForm.titulo} onChange={e => setPubForm(f => ({ ...f, titulo: e.target.value }))}
                            placeholder="Sustitución de caldera por aerotermia"
                            className="w-full bg-bkg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
                        <label className="block text-[10px] uppercase tracking-widest font-black text-white/40 mb-1">Actuación</label>
                        <select value={pubForm.actuacion} onChange={e => setPubForm(f => ({ ...f, actuacion: e.target.value }))}
                            className="w-full bg-bkg-surface border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm mb-4 focus:outline-none">
                            {['aerotermia', 'ventanas', 'cubierta', 'fachada', 'suelo', 'obra'].map(a => <option key={a} value={a}>{a}</option>)}
                        </select>
                        <label className="flex items-start gap-2 text-xs text-white/70 mb-2 cursor-pointer">
                            <input type="checkbox" checked={pubForm.consent} onChange={e => setPubForm(f => ({ ...f, consent: e.target.checked }))} className="mt-0.5 accent-amber-500" />
                            <span><b>Consentimiento del cliente confirmado</b> para mostrar la foto de su vivienda con fines comerciales.</span>
                        </label>
                        <label className="flex items-start gap-2 text-xs text-white/70 mb-4 cursor-pointer">
                            <input type="checkbox" checked={pubForm.revisado} onChange={e => setPubForm(f => ({ ...f, revisado: e.target.checked }))} className="mt-0.5 accent-amber-500" />
                            <span>He revisado que la foto <b>no muestra datos personales</b> (caras, matrículas, direcciones, documentos legibles).</span>
                        </label>
                        <div className="flex gap-2">
                            <button onClick={() => setPubModal(null)} disabled={pubBusy} className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 text-sm font-bold hover:text-white disabled:opacity-50">Cancelar</button>
                            <button onClick={doPublish} disabled={pubBusy || !pubForm.consent || !pubForm.revisado}
                                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-black disabled:opacity-40">{pubBusy ? 'Publicando…' : 'Publicar'}</button>
                        </div>
                    </div>
                </div>
            )}

            {reject && (() => {
                const rcp = info?.recipients || {};
                const clienteRcp = rcp.cliente;
                const instaladorRcp = rcp.instalador;
                const rejectTargetCard = (value, title, name, contact, disabled) => (
                    <button type="button" disabled={disabled}
                        onClick={() => !disabled && setRejectNotifyTarget(value)}
                        className={`w-full text-left p-3 rounded-xl border-2 transition-all flex items-center gap-3 ${
                            disabled ? 'border-white/5 bg-white/[0.02] opacity-35 cursor-not-allowed'
                                : rejectNotifyTarget === value ? 'border-red-400/80 bg-red-400/[0.08]' : 'border-white/10 bg-white/[0.03] hover:border-white/20'
                        }`}>
                        <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${rejectNotifyTarget === value ? 'bg-red-500 border-red-500' : 'border-white/20'}`}>
                            {rejectNotifyTarget === value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[9px] font-black uppercase tracking-widest text-white/35">{title}</p>
                            <p className={`font-bold text-sm truncate ${disabled ? 'text-white/30' : 'text-white'}`}>{name}</p>
                            {contact && <p className="text-white/40 text-xs font-mono mt-0.5">{contact}</p>}
                        </div>
                    </button>
                );
                return (
                    <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setReject(null)}>
                        <div className="bg-[#16181D] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                            <div className="px-5 py-4 border-b border-white/10">
                                <h3 className="text-white font-black uppercase tracking-widest text-xs">Rechazar foto</h3>
                                <p className="text-white/50 text-xs mt-1">{reject.slot.label}</p>
                            </div>
                            <div className="p-5 space-y-4">
                                {/* Motivo */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">¿Por qué se rechaza?</label>
                                    <textarea
                                        autoFocus
                                        value={rejectMotivo}
                                        onChange={e => setRejectMotivo(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) confirmReject(); }}
                                        rows={3}
                                        placeholder="Ej: La placa no se lee, hazla más de cerca y con luz."
                                        className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-red-400/50 transition-all resize-none"
                                    />
                                </div>
                                {/* Destinatario del aviso */}
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-2">Avisar a</label>
                                    <div className="space-y-1.5">
                                        {rejectTargetCard('cliente', 'Cliente', clienteRcp?.name || 'Sin cliente vinculado', clienteRcp?.phone || null, !clienteRcp)}
                                        {rejectTargetCard('instalador', 'Instalador', instaladorRcp?.name || 'Sin instalador asignado', instaladorRcp?.phone || null, !instaladorRcp)}
                                        {rejectTargetCard('ninguno', 'Sin aviso', 'Solo rechazar, no enviar mensaje', null, false)}
                                    </div>
                                </div>
                            </div>
                            <div className="px-5 py-4 bg-black/30 flex justify-end gap-3">
                                <button onClick={() => setReject(null)} className="px-5 py-2 text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest">Cancelar</button>
                                <button onClick={confirmReject} disabled={!rejectMotivo.trim()}
                                    className="px-6 py-2 bg-red-500 text-white text-xs font-black rounded-xl uppercase tracking-widest hover:bg-red-600 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                    {rejectNotifyTarget === 'ninguno' ? 'Rechazar (sin avisar)' : 'Rechazar y avisar'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Panel "Añadir apartado de obra" */}
            {conceptPanel && (
                <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setConceptPanel(false)}>
                    <div className="bg-[#16181D] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col max-h-[88vh]" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-white/10">
                            <h3 className="text-white font-black uppercase tracking-widest text-xs">Añadir apartado de obra</h3>
                            <p className="text-white/50 text-xs mt-1">Habilita fotos de actuaciones extra para este expediente (no afecta al cálculo).</p>
                        </div>
                        <div className="p-4 space-y-2 overflow-y-auto">
                            {(info.addableConcepts || []).map(c => {
                                const busy = conceptBusy === c.id;
                                const canRemove = c.shown && c.enabled && !c.hasPhotos;
                                return (
                                    <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                                        <div className="min-w-0">
                                            <p className="text-white font-bold text-sm truncate">{c.label}</p>
                                            {c.shown && <p className="text-[10px] font-black uppercase tracking-wider text-emerald-300/70 mt-0.5">{c.hasPhotos ? 'Incluido · con fotos' : 'Incluido'}</p>}
                                        </div>
                                        {!c.shown ? (
                                            <button onClick={() => enableConcept(c, true)} disabled={busy}
                                                className="shrink-0 px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-amber-400 text-black text-[11px] font-black uppercase tracking-widest transition-all disabled:opacity-40">
                                                {busy ? '…' : 'Añadir'}
                                            </button>
                                        ) : canRemove ? (
                                            <button onClick={() => enableConcept(c, false)} disabled={busy}
                                                className="shrink-0 px-4 py-2 rounded-lg border border-white/15 text-white/55 text-[11px] font-black uppercase tracking-widest hover:bg-white/[0.06] transition-all disabled:opacity-40">
                                                {busy ? '…' : 'Quitar'}
                                            </button>
                                        ) : (
                                            <span className="shrink-0 text-emerald-400 text-lg">✓</span>
                                        )}
                                    </div>
                                );
                            })}
                            {conceptError && <p className="text-red-400 text-xs">{conceptError}</p>}
                        </div>
                        <div className="px-5 py-4 bg-black/30 flex justify-end">
                            <button onClick={() => setConceptPanel(false)} className="px-6 py-2 text-xs font-bold text-white/60 hover:text-white uppercase tracking-widest">Cerrar</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Popup "¿Qué documento es?" — slots Otros (pide nombre antes de subir) */}
            {namePrompt && (
                <div className="fixed inset-0 z-[460] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => { setNamePrompt(null); setNameValue(''); }}>
                    <div className="bg-[#16181D] border border-white/10 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-white/10">
                            <h3 className="text-white font-black uppercase tracking-widest text-xs">¿Qué documento es?</h3>
                            <p className="text-white/50 text-xs mt-1">
                                {namePrompt.files.length > 1
                                    ? <>Vas a subir <strong className="text-white/80">{namePrompt.files.length} archivos</strong>. Se guardarán con este nombre y numerados (_1, _2…).</>
                                    : <>Ponle un nombre para guardarlo identificado en Drive.</>}
                            </p>
                        </div>
                        <div className="p-5 space-y-2">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-white/40 mb-1">Nombre del documento</label>
                            <input
                                autoFocus
                                type="text"
                                value={nameValue}
                                onChange={e => setNameValue(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') confirmNamePrompt(); }}
                                placeholder="Ej: Presupuesto de ventanas"
                                maxLength={80}
                                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-amber-400/50 transition-all"
                            />
                            <p className="text-white/30 text-[11px]">Por ejemplo: «Presupuesto de ventanas», «Escritura», «Nota simple»…</p>
                        </div>
                        <div className="px-5 py-4 bg-black/30 flex justify-end gap-3">
                            <button onClick={() => { setNamePrompt(null); setNameValue(''); }} className="px-5 py-2 text-xs font-bold text-white/50 hover:text-white uppercase tracking-widest">Cancelar</button>
                            <button onClick={confirmNamePrompt} disabled={!nameValue.trim()}
                                className="px-6 py-2 bg-gradient-to-r from-amber-500 to-amber-400 text-black text-xs font-black rounded-xl uppercase tracking-widest hover:from-amber-400 hover:to-amber-300 transition-all disabled:opacity-30 disabled:cursor-not-allowed">
                                Subir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Lightbox */}
            {lightbox && (
                <div className="fixed inset-0 z-[400] flex items-center justify-center bg-black/95 backdrop-blur-sm p-4 cursor-zoom-out" onClick={() => setLightbox(null)}>
                    <div className="relative w-[88vw] max-w-3xl" onClick={e => e.stopPropagation()}>
                        <div ref={lbImgRef}
                            onDoubleClick={() => { setLbZoom(1); setLbOrigin('50% 50%'); }}
                            className={`relative w-full h-[78vh] rounded-xl overflow-hidden bg-black/40 shadow-2xl flex items-center justify-center ${lbZoom > 1 ? 'cursor-zoom-out' : 'cursor-zoom-in'}`}>
                            <div className="relative w-full h-full transition-transform duration-75" style={{ transform: `scale(${lbZoom})`, transformOrigin: lbOrigin }}>
                                <DriveImg localUrl={lightbox.localUrl} proxySrc={thumbProxy(lightbox.driveId, 1200)} driveId={lightbox.driveId} thumb={lightbox.thumb} lowSrc={lightbox.localUrl || thumbProxy(lightbox.driveId, 400)} size={1200} fit="contain" alt={lightbox.label} />
                            </div>
                            {lbZoom > 1
                                ? <div className="absolute top-2 right-2 bg-black/60 text-white/80 text-[10px] font-black px-2 py-1 rounded-md pointer-events-none">{Math.round(lbZoom * 100)}%</div>
                                : <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/50 text-white/45 text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md pointer-events-none">Rueda para zoom · doble clic para reiniciar</div>}
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-4">
                            <span className="text-white/70 text-sm font-bold">{lightbox.label}</span>
                            <div className="flex items-center gap-3">
                                {/* Cambiar (sustituir) la foto: sube la nueva y borra la antigua. */}
                                {lightbox.item && !lightbox.slot?.existing && !lbConfirmDelete && (
                                    <label className={`flex items-center gap-1.5 px-4 py-2 bg-white/10 border border-white/15 text-white/80 text-xs font-black rounded-lg uppercase tracking-widest hover:bg-white/15 transition-all cursor-pointer ${lbReplacing ? 'opacity-50 pointer-events-none' : ''}`}>
                                        {lbReplacing ? 'Cambiando…' : '🔄 Cambiar foto'}
                                        <input type="file" accept={lightbox.slot?.accept} className="hidden"
                                            onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) replaceItem(lightbox.slot, lightbox.item, f); }} />
                                    </label>
                                )}
                                {/* Eliminar foto: SOLO ADMIN. Confirmación inline (borra de Drive). */}
                                {canValidate && lightbox.item && (
                                    lbConfirmDelete ? (
                                        <span className="flex items-center gap-2">
                                            <span className="text-white/60 text-xs font-bold">¿Eliminar?</span>
                                            <button
                                                onClick={async () => {
                                                    const { slot, item } = lightbox;
                                                    setLightbox(null); setLbConfirmDelete(false);
                                                    await deleteItem(slot, item);
                                                }}
                                                className="px-4 py-2 bg-red-500 text-white text-xs font-black rounded-lg uppercase tracking-widest hover:bg-red-600 transition-all">
                                                Sí, eliminar
                                            </button>
                                            <button onClick={() => setLbConfirmDelete(false)} className="text-white/50 text-xs font-bold uppercase tracking-widest hover:text-white">No</button>
                                        </span>
                                    ) : (
                                        <button onClick={() => setLbConfirmDelete(true)}
                                            className="flex items-center gap-1.5 px-4 py-2 bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-black rounded-lg uppercase tracking-widest hover:bg-red-500/20 transition-all">
                                            🗑 Eliminar
                                        </button>
                                    )
                                )}
                                <button onClick={() => { setLightbox(null); setLbConfirmDelete(false); }} className="text-white/50 text-xs font-bold uppercase tracking-widest hover:text-white">Cerrar</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default DocsManager;
