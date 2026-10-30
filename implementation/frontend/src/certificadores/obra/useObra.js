// ─── useObra — cargar una obra, autoguardarla y subir sus fotos ─────────────
// REGLA (la trampa del autoguardado, docs/conocimiento/cee-directos/…/el-
// formulario-se-guarda-solo-y-eso-tiene-una-trampa.md): el guardián compara
// VALORES contra lo último persistido, no «¿es el primer render?». Así:
//   · abrir la ficha no escribe nada (cero PUT);
//   · no se guarda mientras se carga (no hay formulario hasta que llega la obra);
//   · lo que vuelve del servidor al guardar NO pisa el formulario (se puede
//     estar escribiendo mientras viaja el PUT); solo se recogen los metadatos;
//   · se manda solo lo cambiado, con freno de 900 ms, y un PUT tras otro.
// Al volver a la pestaña (o desde otro dispositivo), si no hay nada pendiente,
// se recarga la obra: lo guardado en el móvil aparece en el ordenador.
// Antes de que la página se oculte (abrir la cámara, cambiar de app) se guarda ya.
// Fuera de BORRADOR el servidor congela la obra (PUT → 409 OBRA_CERRADA): si
// pasa (se pidió desde otra pestaña u otro dispositivo), lo pendiente se suelta
// y se recarga, y la ficha pasa sola a la vista de solo lectura.
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { API, errorDe, mensajeError } from '../api';
import { aPayload, cambiosDe, formDe, normalizarSlots, reducirTodas } from './comun';
import { SLOTS, contestar } from '../logic/cuestionario';

const FRENO_MS = 900;

// Las fotos suben UNA A UNA y con reintentos (30/10/2026, antes de la primera visita
// con el iPhone): en la visita la cobertura va y viene (sótanos, cuartos de calderas),
// y la foto hecha con la cámara desde aquí NO queda en el carrete. Antes iba toda la
// tanda en una petición: si caía, se perdían todas. Ahora lo que sí sube se queda, la
// red caída o un 5xx se reintenta solo, y lo que aun así no sube se guarda (en
// memoria, `pendientes`) para «Reintentar» sin volver a hacer la foto.
const ESPERAS_MS = [1500, 4000, 9000];
const esperar = (ms) => new Promise(r => setTimeout(r, ms));
// Sin respuesta (sin red), 5xx, 429, 408 y 401 (el token se renueva al volver la
// página a primer plano: tras la espera, la petición sale con el nuevo).
const reintentable = (err) => { const st = err?.response?.status; return !st || st === 401 || st === 408 || st === 429 || st >= 500; };

export function useObra(id) {
    const [obra, setObra] = useState(null);
    const [eventos, setEventos] = useState([]);
    const [enlaces, setEnlaces] = useState({});
    // La calificación y la firma del CEE entregado: { calificacion, firma } | null.
    const [cee, setCee] = useState(null);
    // Un encargo de BROKERGY (obra/Encargo.jsx): el encargo y lo que dice ahora el CRM. null si no lo es.
    const [encargo, setEncargo] = useState(null);
    const [barridoServidor, setBarridoServidor] = useState(null);
    const [form, setForm] = useState(null);
    const [slots, setSlots] = useState({});
    const [docsError, setDocsError] = useState(null);
    const [error, setError] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [guardado, setGuardado] = useState({ estado: 'ok' });
    const [subiendo, setSubiendo] = useState({}); // slot → 0..100
    const [pendientes, setPendientes] = useState({}); // slot → [File] que no han podido subir
    const subidasRef = useRef(0);
    const pendientesRef = useRef({});
    useEffect(() => { pendientesRef.current = pendientes; }, [pendientes]);

    const persistidoRef = useRef(null);
    const formRef = useRef(null);
    const obraRef = useRef(null);
    const timerRef = useRef(null);
    const enVueloRef = useRef(null);
    const vivo = useRef(true);
    useEffect(() => { formRef.current = form; }, [form]);
    useEffect(() => { obraRef.current = obra; }, [obra]);
    // Al salir de la ficha (otra pantalla de la app, sin recargar) lo pendiente se
    // escribe igual: el freno de 900 ms no puede comerse lo último que se tecleó.
    // `vivo` se vuelve a poner a true al montar (StrictMode monta dos veces).
    useEffect(() => {
        vivo.current = true;
        return () => {
            vivo.current = false;
            clearTimeout(timerRef.current);
            const c = cambiosDe(formRef.current, persistidoRef.current);
            const est = obraRef.current?.estado;
            if (c && (!est || est === 'BORRADOR')) {
                persistidoRef.current = { ...persistidoRef.current, ...c };
                axios.put(`${API}/obras/${id}`, aPayload(c)).catch(() => { /* se reintentará al volver */ });
            }
        };
    }, [id]);

    const editable = !obra || !obra.estado || obra.estado === 'BORRADOR';

    const recargarDocs = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/obras/${id}/docs`);
            if (vivo.current) { setSlots(normalizarSlots(data)); setDocsError(null); }
        } catch (err) {
            if (vivo.current) setDocsError(err);
        }
    }, [id]);

    const cargar = useCallback(async ({ silencioso = false } = {}) => {
        if (!silencioso) { setCargando(true); setError(null); }
        try {
            const { data } = await axios.get(`${API}/obras/${id}`);
            const o = data?.obra || data;
            if (!o || !o.id) throw Object.assign(new Error('La obra no ha llegado entera.'), { response: { status: 500, data: {} } });
            if (!vivo.current) return;
            const f = formDe(o);
            persistidoRef.current = f;
            formRef.current = f;
            setObra(o);
            setForm(f);
            setEventos(Array.isArray(data?.eventos) ? data.eventos : []);
            setEnlaces(data?.enlaces || {});
            setCee(data?.cee || null);
            setEncargo(data?.encargo || null);
            setBarridoServidor(data?.barrido || null);
            // Si `/obras/:id` ya trae las fotos, se usan; `/docs` trae miniaturas firmadas.
            if (o.documentacion?.reforma_uploads) setSlots(s => (Object.keys(s).length ? s : normalizarSlots(o.documentacion.reforma_uploads)));
            setError(null);
        } catch (err) {
            if (vivo.current && !silencioso) setError(err);
        } finally {
            if (vivo.current && !silencioso) setCargando(false);
        }
        recargarDocs();
    }, [id, recargarDocs]);

    useEffect(() => { cargar(); }, [cargar]);
    const cargarRef = useRef(cargar);
    useEffect(() => { cargarRef.current = cargar; }, [cargar]);

    /** Guarda YA lo pendiente. Devuelve true si todo quedó escrito. */
    const guardar = useCallback(async () => {
        clearTimeout(timerRef.current);
        if (enVueloRef.current) { try { await enVueloRef.current; } catch { /* sigue */ } }
        const f = formRef.current;
        const cambios = cambiosDe(f, persistidoRef.current);
        if (!cambios) return true;
        if (obraRef.current?.estado && obraRef.current.estado !== 'BORRADOR') return true;
        setGuardado({ estado: 'guardando' });
        const p = axios.put(`${API}/obras/${id}`, aPayload(cambios))
            .then(({ data }) => {
                // Lo que se mandó pasa a estar persistido (lo tecleado mientras tanto, no).
                persistidoRef.current = { ...persistidoRef.current, ...cambios };
                const o = data?.obra;
                if (o && vivo.current) {
                    setObra(prev => ({ ...prev, estado: o.estado ?? prev?.estado, updated_at: o.updated_at ?? prev?.updated_at, numero_expediente: o.numero_expediente ?? prev?.numero_expediente, zona_climatica: o.zona_climatica ?? prev?.zona_climatica }));
                }
                if (vivo.current) setGuardado({ estado: cambiosDe(formRef.current, persistidoRef.current) ? 'pendiente' : 'ok', at: Date.now() });
                return true;
            })
            .catch((err) => {
                if (err.response?.status === 409 && errorDe(err).code === 'OBRA_CERRADA') {
                    // Congelada: lo tecleado ya no se puede escribir. Se suelta y se recarga.
                    persistidoRef.current = formRef.current;
                    if (vivo.current) {
                        setGuardado({ estado: 'error', mensaje: 'El certificado ya está pedido: los datos de la obra ya no se cambian.' });
                        cargarRef.current?.({ silencioso: true });
                    }
                    return false;
                }
                if (vivo.current) setGuardado({ estado: 'error', mensaje: mensajeError(err, 'No se ha podido guardar.') });
                return false;
            })
            .finally(() => { enVueloRef.current = null; });
        enVueloRef.current = p;
        const ok = await p;
        // Si se siguió escribiendo durante el PUT, queda otro guardado pendiente.
        if (ok && cambiosDe(formRef.current, persistidoRef.current)) {
            clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => { guardar(); }, FRENO_MS);
        }
        return ok;
    }, [id]);

    // El autoguardado: compara VALORES; sin cambios, no hace nada.
    useEffect(() => {
        if (!form || !persistidoRef.current || !editable) return undefined;
        if (!cambiosDe(form, persistidoRef.current)) return undefined;
        setGuardado(g => (g.estado === 'guardando' ? g : { estado: 'pendiente' }));
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { guardar(); }, FRENO_MS);
        return () => clearTimeout(timerRef.current);
    }, [form, editable, guardar]);

    // Al ocultarse la página, guardar ya; al volver, traer lo de otros dispositivos.
    useEffect(() => {
        const alCambiar = () => {
            if (document.visibilityState === 'hidden') {
                if (cambiosDe(formRef.current, persistidoRef.current)) guardar();
            } else if (!enVueloRef.current && !cambiosDe(formRef.current, persistidoRef.current)) {
                cargar({ silencioso: true });
            }
        };
        const antesDeSalir = (e) => {
            const fotosEnJuego = subidasRef.current > 0 || Object.values(pendientesRef.current).some(l => l.length);
            if (cambiosDe(formRef.current, persistidoRef.current) || enVueloRef.current || fotosEnJuego) {
                guardar();
                e.preventDefault();
                e.returnValue = '';
            }
        };
        document.addEventListener('visibilitychange', alCambiar);
        window.addEventListener('beforeunload', antesDeSalir);
        return () => {
            document.removeEventListener('visibilitychange', alCambiar);
            window.removeEventListener('beforeunload', antesDeSalir);
        };
    }, [guardar, cargar]);

    // ── Editar ───────────────────────────────────────────────────────────────
    const setCampo = useCallback((k, v) => setForm(f => (f ? { ...f, [k]: v } : f)), []);
    // Lo que toca el certificador es SUYO: pierde el origen de la deducción (contestar).
    const setC = useCallback((k, v) => setForm(f => (f ? { ...f, cuestionario: contestar(f.cuestionario, { [k]: v }) } : f)), []);
    // Para lo que cambia varias claves a la vez (las deducciones, una duda, las fases).
    const setCuestionario = useCallback((fn) => setForm(f => (f ? { ...f, cuestionario: fn(f.cuestionario) } : f)), []);
    const setTitular = useCallback((k, v) => setForm(f => (f ? { ...f, titular: { ...f.titular, [k]: v } } : f)), []);
    const setDecision = useCallback((equipo, d) => setForm(f => (f ? {
        ...f, cuestionario: { ...f.cuestionario, fotos_decision: { ...(f.cuestionario.fotos_decision || {}), [equipo]: d } },
    } : f)), []);

    // ── Fotos ────────────────────────────────────────────────────────────────
    const subir = useCallback(async (slotId, fileList) => {
        const files = Array.from(fileList || []);
        if (!files.length) return { ok: false };
        const slot = SLOTS.find(s => s.id === slotId);
        setSubiendo(s => ({ ...s, [slotId]: 1 }));
        subidasRef.current += 1;
        let n = 0;
        const rechazados = [];
        const fallidos = [];
        let ultimoError = null;
        try {
            const listos = slot?.video || slot?.documento ? files : await reducirTodas(files);
            const total = listos.reduce((s, f) => s + (f.size || 1), 0) || 1;
            let hecho = 0;
            for (const f of listos) {
                for (let intento = 0; ; intento++) {
                    try {
                        const fd = new FormData();
                        fd.append('files', f);
                        const { data } = await axios.post(`${API}/obras/${id}/docs/${slotId}`, fd, {
                            headers: { 'Content-Type': 'multipart/form-data' },
                            onUploadProgress: (e) => {
                                if (e.total && vivo.current) setSubiendo(s => ({ ...s, [slotId]: Math.max(1, Math.round(95 * (hecho + (f.size || 1) * e.loaded / e.total) / total)) }));
                            },
                        });
                        // → { ok, subidos: [...], rechazados: [{ nombre, motivo }], errores: [{ nombre, error }], slots }
                        if (data?.slots && vivo.current) setSlots(normalizarSlots(data));
                        n += Array.isArray(data?.subidos) ? data.subidos.length : 1;
                        rechazados.push(...(data?.rechazados || []), ...(data?.errores || []).map(e => ({ nombre: e.nombre, motivo: e.error })));
                        break;
                    } catch (err) {
                        if (reintentable(err) && intento < ESPERAS_MS.length) { await esperar(ESPERAS_MS[intento]); continue; }
                        if (reintentable(err)) { fallidos.push(f); ultimoError = err; }
                        else {
                            const d = errorDe(err);
                            if (Array.isArray(d.rechazados) && d.rechazados.length) rechazados.push(...d.rechazados);
                            else rechazados.push({ nombre: f.name, motivo: mensajeError(err, 'no se ha podido subir') });
                        }
                        break;
                    }
                }
                hecho += f.size || 1;
            }
            if (!n && vivo.current) await recargarDocs();
        } catch (err) {
            // Fuera de la subida (reducir las fotos): se guardan las originales para reintentar.
            fallidos.push(...files);
            ultimoError = err;
        } finally {
            subidasRef.current -= 1;
            // Las que no han subido sustituyen, en su apartado, a las que se mandaban.
            setPendientes(p => ({ ...p, [slotId]: [...(p[slotId] || []).filter(x => !files.includes(x)), ...fallidos] }));
            if (vivo.current) setSubiendo(s => { const k = { ...s }; delete k[slotId]; return k; });
        }
        return {
            ok: !fallidos.length && (n > 0 || !rechazados.length), n, rechazados, fallidos,
            error: fallidos.length ? mensajeError(ultimoError, 'No se ha podido subir.') : null,
        };
    }, [id, recargarDocs]);

    /** Vuelve a mandar lo que no subió en un apartado (las mismas fotos, sin repetirlas). */
    const reintentar = useCallback((slotId) => subir(slotId, pendientesRef.current[slotId] || []), [subir]);

    // La fachada propuesta (Catastro o Street View) → «Fachada principal».
    const usarFachada = useCallback(async (fuente) => {
        const slotId = 'FOTO_FACHADA_PRINCIPAL';
        setSubiendo(s => ({ ...s, [slotId]: 50 }));
        try {
            const { data } = await axios.post(`${API}/obras/${id}/fachada-sugerida/${fuente}/usar`);
            if (data?.slots && vivo.current) setSlots(normalizarSlots(data));
            else await recargarDocs();
            return { ok: true };
        } catch (err) {
            return { ok: false, error: mensajeError(err, 'No se ha podido guardar la foto.') };
        } finally {
            if (vivo.current) setSubiendo(s => { const n = { ...s }; delete n[slotId]; return n; });
        }
    }, [id, recargarDocs]);

    const quitar = useCallback(async (slotId, driveId) => {
        try {
            const { data } = await axios.delete(`${API}/obras/${id}/docs/${slotId}/${encodeURIComponent(driveId)}`);
            if (data?.slots) setSlots(normalizarSlots(data));
            else setSlots(s => ({ ...s, [slotId]: (s[slotId] || []).filter(x => (x.driveId || x.id) !== driveId) }));
            return { ok: true };
        } catch (err) {
            return { ok: false, error: mensajeError(err, 'No se ha podido quitar.') };
        }
    }, [id]);

    return {
        obra, setObra, eventos, enlaces, cee, encargo, setEncargo, barridoServidor, setBarridoServidor,
        form, setCampo, setC, setCuestionario, setTitular, setDecision,
        slots, docsError, recargarDocs, subir, reintentar, pendientes, quitar, subiendo, usarFachada,
        error, cargando, cargar, guardar, guardado, editable,
    };
}

export default useObra;
