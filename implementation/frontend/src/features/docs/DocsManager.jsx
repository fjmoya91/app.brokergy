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
    const [dragOver, setDragOver] = useState(null); // slot.key sobre el que se arrastra
    const [namePrompt, setNamePrompt] = useState(null); // { slot, files } al subir a un slot "Otros"
    const [nameValue, setNameValue] = useState('');     // texto del nombre que escribe el usuario
    const [bulkValidating, setBulkValidating] = useState(null); // slot.key | '__antes__' | '__despues__' en validación masiva
    const [conceptPanel, setConceptPanel] = useState(false); // panel "Añadir apartado" abierto
    const [conceptBusy, setConceptBusy] = useState(null);    // concept.id en proceso de habilitar/quitar
    const [conceptError, setConceptError] = useState(null);  // error al cambiar un apartado

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

    // Refresco en segundo plano: al volver a la pestaña y cada 20s mientras esté visible.
    // Así, si el admin valida/rechaza/borra, el cliente ve el cambio sin recargar a mano.
    useEffect(() => {
        const refetch = () => { if (document.visibilityState === 'visible') load(true); };
        document.addEventListener('visibilitychange', refetch);
        const iv = setInterval(refetch, 30000);
        return () => { document.removeEventListener('visibilitychange', refetch); clearInterval(iv); };
        /* eslint-disable-next-line */
    }, [mode, idOrUuid, tokenProp]);

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
        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
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
                    { params: { token: tokenRef.current }, headers: { 'Content-Type': 'multipart/form-data' } }
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
            setSlotError(prev => ({ ...prev, [slot.key]: err.response?.data?.error || 'No se pudo subir. Inténtalo de nuevo.' }));
        } finally {
            setBusySlot(null);
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

    // Orden dentro de cada fase: lo accionable arriba, lo ya resuelto abajo.
    //   0 · rechazada (hay que volver a subir)   1 · pendiente (aún sin foto)
    //   2 · subida / en revisión   3 · validada (✓)   4 · "no necesario"   5 · catch-all "ya aportados"
    const tierOf = (s) => {
        if (s.existing) return 5;       // catch-all "ya aportados" → siempre al final del todo
        if (s.waived) return 4;         // marcado "no necesario" → por debajo de los validados
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
    const reqDone = reqAntes.filter(s => s.items?.length).length;
    const allReqDone = reqAntes.length > 0 && reqDone === reqAntes.length;

    // Progreso de la fase DESPUÉS (todas opcionales): apartados con al menos una foto.
    const despuesSlots = despues.filter(s => !s.existing);
    const despuesDone = despuesSlots.filter(s => s.items?.length).length;

    // Pendientes de revisión (estado 'subida') por fase, para los botones de "validar todo".
    const antesPending = canValidate ? pendingItemsOf(antes) : [];
    const despuesPending = canValidate ? pendingItemsOf(despues) : [];

    const renderSlot = (slot) => {
        const items = slot.items || [];
        const done = items.length > 0;
        const busy = busySlot === slot.key;
        const estado = slot.estado || (done ? 'subida' : 'pendiente');
        const ui = ESTADO_UI[estado] || ESTADO_UI.pendiente;
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
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <p className={`font-black text-sm md:text-base flex items-center gap-2 flex-wrap ${slot.waived ? 'text-white/50' : 'text-white'}`}>
                            {slot.label}
                            {slot.required && !done && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300">Obligatorio</span>}
                            {slot.waived && <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-white/50">No necesario</span>}
                            {ui.chip && <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${ui.chip.cls}`}>{ui.chip.txt}</span>}
                        </p>
                        {slot.help && <p className="text-white/45 text-xs mt-1 leading-snug">{slot.help}</p>}
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
                        <label className={`shrink-0 cursor-pointer px-4 py-2.5 rounded-xl font-black uppercase tracking-widest text-[11px] transition-all ${busy ? 'bg-white/10 text-white/40' : done ? 'bg-white/[0.06] text-white/70 hover:bg-white/[0.1] border border-white/10' : 'bg-gradient-to-r from-amber-500 to-amber-400 text-black shadow-lg shadow-amber-500/20'}`}>
                            {busy ? '…' : done ? (slot.multiple ? '+ Añadir' : 'Cambiar') : 'Subir'}
                            <input type="file" accept={slot.accept}
                                {...(slot.multiple ? { multiple: true } : {})}
                                disabled={busy}
                                onChange={e => { requestUpload(slot, e.target.files); e.target.value = ''; }}
                                className="hidden" />
                        </label>
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

            {/* Tabs — ocultas cuando el enlace está scoped por rol (solo una fase) */}
            {!roleFase && (
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

            {tab === 'ANTES' ? (
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
            )}

            {!roleFase && tab === 'ANTES' && !canSeeDespues && (
                <div className="mt-4 p-4 bg-white/[0.02] border border-white/10 rounded-2xl text-xs text-white/40 leading-relaxed text-center">
                    🔒 La fase <strong className="text-white/60">Después de la obra</strong> se activará cuando se acepte la propuesta.
                </div>
            )}

            {/* Modal de rechazo */}
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
