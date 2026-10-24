// El estado de «Generar con IA» de un CEE, con sondeo mientras la IA trabaja.
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { esVivo } from './logic/ceeIa';

const SONDEO_MS = 10_000;

/**
 * @param {{ negocio: 'cae'|'cee'|'op'|'ext', id: string|null, activo?: boolean }} p
 *   `activo` en false no pide nada (oportunidad sin guardar, certificador…).
 *   `ext` = la obra de la app de certificadores: solo la pide el equipo interno
 *   (la ruta es `staffOnly`); al certificador externo no se le enseña.
 */
export function useCeeIa({ negocio, id, activo = true }) {
    const [estado, setEstado] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const vivo = useRef(true);
    useEffect(() => () => { vivo.current = false; }, []);

    const recargar = useCallback(async () => {
        if (!activo || !id || !negocio) return null;
        setCargando(true);
        try {
            const { data } = await axios.get(`/api/cee-ia/${negocio}/${encodeURIComponent(id)}`);
            if (vivo.current) { setEstado(data); setError(null); }
            return data;
        } catch (e) {
            if (vivo.current) setError(e.response?.data?.error || 'No se puede saber ahora si la IA tiene algo de este CEE.');
            return null;
        } finally {
            if (vivo.current) setCargando(false);
        }
    }, [negocio, id, activo]);

    useEffect(() => { recargar(); }, [recargar]);

    // Mientras la IA trabaja, se pregunta cada 10 s; al terminar, se para solo.
    const trabajando = esVivo(estado?.trabajo);
    useEffect(() => {
        if (!trabajando) return undefined;
        const t = setInterval(() => { recargar(); }, SONDEO_MS);
        return () => clearInterval(t);
    }, [trabajando, recargar]);

    const pedir = useCallback(async ({ rehacer = false } = {}) => {
        const { data } = await axios.post(`/api/cee-ia/${negocio}/${encodeURIComponent(id)}`, { rehacer });
        if (vivo.current) setEstado(data.estado);
        return data;
    }, [negocio, id]);

    const cancelar = useCallback(async () => {
        const tid = estado?.trabajo?.id;
        if (!tid) return null;
        await axios.post(`/api/cee-ia/trabajo/${tid}/cancelar`);
        return recargar();
    }, [estado, recargar]);

    return { estado, cargando, error, recargar, pedir, cancelar, trabajando };
}

export default useCeeIa;
