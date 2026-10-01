// ============================================================================
// useCroquisMovil — el CROQUIS se pinta en el MÓVIL y se ve AQUÍ según se pinta.
//
// El ordenador abre una sesión para UNA planta y enseña su QR; el teléfono abre
// la planta (`/croquis-movil/:token`, `views/CroquisMovilView.jsx`) y cada trazo
// —también el que va a medias— llega aquí por una petición LARGA que el
// servidor contesta en cuanto hay algo nuevo. Ver `services/croquisMovil.js`.
//
// El AJUSTE a Catastro lo hace SIEMPRE el ordenador, aunque lo pida el teléfono:
// es quien tiene el plano, vuelve a medir y guarda el trabajo. El teléfono solo
// dice «ajústalo» y recibe cómo ha ido.
//
// REGLA — la petición larga NO se reintenta a lo loco: un fallo espera un poco
// más cada vez (hasta 8 s). Si el servidor dice que la sesión ya no existe
// (caducada o cerrada), se acaba y se dice.
//
// Y las FOTOS de las paredes (2026-09-30): el teléfono sube la foto de una pared
// y lee sus huecos; aquí se entera de que hay fotos nuevas (`onFotos`, para
// refrescar las del panel) y, cuando allí se confirman los huecos, los PONE en
// el plano (`onHuecos`) y cuenta cómo ha ido. Uno cada vez, como el ajuste.
//
// Y DELIMITAR LA VIVIENDA (2026-10-01): el pedido de delimitar llega por la
// MISMA cola que el ajuste (`onPedido`, con `pedido.tipo === 'vivienda'`) —los
// dos vuelven a medir y no caben dos a la vez—; lo que se dice de cada pared
// (contra qué da) llega en su propia cola (`onContra`), en orden. Y cuando esta
// ventana vuelve a medir por su cuenta, `enviarPlano` pone al día la planta del
// teléfono.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { api } from './apiEnvolvente';

const PLAZO_ESPERA_MS = 45_000;   // el servidor contesta a los 20 s como mucho

// La sesión se recuerda en ESTE navegador: recargar la ventana de la envolvente
// (o cerrarla y volver a abrirla) no puede dejar al teléfono pintando para
// nadie. Solo es una comodidad —con try/catch, y si no está, no pasa nada—: lo
// que vale está en el servidor, que dice si la sesión sigue viva.
const clave = (id) => `brokergy.croquisMovil.${id}`;
function leerGuardada(id) {
    try { return JSON.parse(localStorage.getItem(clave(id)) || 'null'); } catch { return null; }
}
function guardar(id, s) {
    try {
        if (s) localStorage.setItem(clave(id), JSON.stringify(s));
        else localStorage.removeItem(clave(id));
    } catch { /* sin almacenamiento: se pierde al recargar, nada más */ }
}

export function useCroquisMovil(id, { onCambio, onPedido, onFin, onFotos, onHuecos, onContra } = {}) {
    //: { token, url, qr, alternativas, qrAlternativas, conCartografia, planta }
    const [sesion, setSesion] = useState(() => {
        const g = id ? leerGuardada(id) : null;
        return g?.token ? { ...g, restaurada: true } : null;
    });
    const [estado, setEstado] = useState({ conectado: false, enCurso: null });
    const [abriendo, setAbriendo] = useState(false);
    const [error, setError] = useState(null);
    // Los callbacks por ref: cambian en cada render de la vista y no pueden
    // reiniciar la espera, que es lo que harían metidos en las dependencias.
    const cb = useRef({});
    useEffect(() => { cb.current = { onCambio, onPedido, onFin, onFotos, onHuecos, onContra }; });

    const abrir = useCallback(async (planta, cuerpo) => {
        setAbriendo(true);
        setError(null);
        try {
            const { data } = await axios.post(api(id, 'croquis-movil'), cuerpo);
            setEstado({ conectado: false, enCurso: null });
            setSesion({ ...data, planta });
            guardar(id, { ...data, planta });
            return true;
        } catch (e) {
            setError(e.response?.data?.error || 'No se ha podido abrir el enlace para el móvil.');
            return false;
        } finally {
            setAbriendo(false);
        }
    }, [id]);

    const cerrar = useCallback(() => {
        setSesion((s) => {
            if (s) axios.delete(api(id, `croquis-movil/${s.token}`)).catch(() => {});
            return null;
        });
        guardar(id, null);
        setEstado({ conectado: false, enCurso: null });
    }, [id]);

    /**
     * La planta ha vuelto a medirse AQUÍ (delimitar, quitar un cuerpo…): se le
     * manda al teléfono, ya en SU lienzo, para que no siga sobre paredes viejas.
     */
    const enviarPlano = useCallback((cuerpo) => {
        if (!sesion || !cuerpo) return;
        axios.post(api(id, `croquis-movil/${sesion.token}/plano`), cuerpo).catch(() => {});
    }, [id, sesion]);

    /** Contarle al teléfono cómo ha ido un ajuste que se ha hecho desde AQUÍ. */
    const responder = useCallback((r) => {
        if (!sesion) return;
        axios.post(api(id, `croquis-movil/${sesion.token}/resultado`), r || {}).catch(() => {});
    }, [id, sesion]);

    // La ESPERA LARGA: una petición abierta que vuelve en cuanto el teléfono
    // manda algo. Vive mientras viva la sesión.
    useEffect(() => {
        if (!sesion) return undefined;
        let vivo = true;
        const ctrl = new AbortController();
        let version = 0;
        let atendido = 0;
        let atendidoHuecos = 0;
        let atendidoContra = 0;
        let fotosVistas = null;
        // Lo que se dice de cada pared: EN ORDEN y sin perder ninguno (se tocan
        // varias seguidas). Se atiende lo que haya y se cuenta hasta dónde.
        const colaContra = { ocupado: false, lista: [] };
        const atenderContras = async () => {
            if (colaContra.ocupado) return;
            colaContra.ocupado = true;
            try {
                while (colaContra.lista.length && vivo) {
                    const c = colaContra.lista.shift();
                    let r;
                    try { r = await cb.current.onContra?.(c); }
                    catch (e) { r = { ok: false, texto: e.message }; }
                    if (!vivo) return;
                    await axios.post(api(id, `croquis-movil/${sesion.token}/resultado-contra`),
                                     { n: c.n, pared: c.pared, ...(r || { ok: false, texto: 'No se ha podido cambiar.' }) })
                        .catch(() => {});
                }
            } finally {
                colaContra.ocupado = false;
            }
        };
        // Los huecos que se confirman en el teléfono, también de uno en uno.
        const colaHuecos = { ocupado: false, pendiente: null };
        const ponerHuecos = async (pedido) => {
            if (colaHuecos.ocupado) { colaHuecos.pendiente = pedido; return; }
            colaHuecos.ocupado = true;
            try {
                let r;
                try { r = await cb.current.onHuecos?.(pedido); }
                catch (e) { r = { ok: false, texto: e.message }; }
                if (!vivo) return;
                await axios.post(api(id, `croquis-movil/${sesion.token}/resultado-huecos`),
                                 { n: pedido.n, pared: pedido.pared,
                                   ...(r || { ok: false, texto: 'No se han podido poner.' }) })
                    .catch(() => {});
            } finally {
                colaHuecos.ocupado = false;
                if (colaHuecos.pendiente && vivo) {
                    const p = colaHuecos.pendiente;
                    colaHuecos.pendiente = null;
                    ponerHuecos(p);
                }
            }
        };
        // Los ajustes que pide el teléfono se hacen DE UNO EN UNO: el segundo
        // espera a que acabe el primero (volver a medir no admite dos a la vez).
        const cola = { ocupado: false, pendiente: null };
        const atender = async (pedido, trazos) => {
            if (cola.ocupado) { cola.pendiente = { pedido, trazos }; return; }
            cola.ocupado = true;
            try {
                let r;
                try { r = await cb.current.onPedido?.(pedido, trazos, sesion.planta); }
                catch (e) { r = { ok: false, texto: e.message }; }
                if (!vivo) return;
                await axios.post(api(id, `croquis-movil/${sesion.token}/resultado`),
                                 { n: pedido.n, ...(r || { ok: false, texto: 'No se ha podido ajustar.' }) })
                    .catch(() => {});
            } finally {
                cola.ocupado = false;
                if (cola.pendiente && vivo) {
                    const p = cola.pendiente;
                    cola.pendiente = null;
                    atender(p.pedido, p.trazos);
                }
            }
        };
        (async () => {
            let fallos = 0;
            while (vivo) {
                try {
                    const { data } = await axios.get(
                        api(id, `croquis-movil/${sesion.token}/esperar`, { v: version }),
                        { signal: ctrl.signal, timeout: PLAZO_ESPERA_MS });
                    if (!vivo) return;
                    fallos = 0;
                    if (data.estado !== 'abierta') {
                        vivo = false;
                        setSesion(null);
                        setEstado({ conectado: false, enCurso: null });
                        guardar(id, null);
                        // Una sesión RECORDADA que ya no existe (caducó con la
                        // ventana cerrada) se olvida en silencio: no es noticia.
                        if (!(sesion.restaurada && version === 0)) cb.current.onFin?.(data.estado);
                        return;
                    }
                    if (!(data.version > version)) continue;
                    version = data.version;
                    setEstado({ conectado: !!data.movilVisto, enCurso: data.enCurso || null,
                                contorno: data.contorno || null });
                    cb.current.onCambio?.(data, sesion.planta);
                    if (data.pedido && data.pedido.n > atendido) {
                        atendido = data.pedido.n;
                        atender(data.pedido, data.trazos);
                    }
                    // Fotos nuevas en alguna pared: que las vea el panel. La
                    // primera vuelta solo apunta desde dónde se cuenta.
                    if (fotosVistas !== null && data.fotos !== fotosVistas) cb.current.onFotos?.();
                    fotosVistas = data.fotos;
                    if (data.pedidoHuecos && data.pedidoHuecos.n > atendidoHuecos) {
                        atendidoHuecos = data.pedidoHuecos.n;
                        ponerHuecos(data.pedidoHuecos);
                    }
                    const nuevas = (data.contras || []).filter(c => c.n > atendidoContra);
                    if (nuevas.length) {
                        atendidoContra = Math.max(...nuevas.map(c => c.n));
                        colaContra.lista.push(...nuevas);
                        atenderContras();
                    }
                } catch (e) {
                    if (!vivo || axios.isCancel?.(e) || e.name === 'CanceledError') return;
                    fallos += 1;
                    await new Promise(r => setTimeout(r, Math.min(8000, 1000 * fallos)));
                }
            }
        })();
        return () => { vivo = false; ctrl.abort(); };
    }, [id, sesion]);

    return { sesion, estado, abriendo, error, setError, abrir, cerrar, responder, enviarPlano };
}

export default useCroquisMovil;
