import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';

/**
 * LA PLACA DE LA UNIDAD EXTERIOR QUE JUSTIFICA EL COP DEL ANEXO VI
 * ---------------------------------------------------------------------------
 * Cuando el SCOP_dhw se justifica por el ANEXO VI, el certificado declara
 * `SCOP_dhw = COP · F_c` y el COP a A7/W55 NO lo publican todas las fichas
 * técnicas: está en la PLACA del equipo. Sin enseñarla, el verificador ve un COP
 * que no encuentra en la documentación aportada y abre una inexactitud (medido
 * el 16/09/2026).
 *
 * Esta es la superficie COMPARTIDA por los dos popups que imprimen ese cálculo
 * —el del CIFO y el del Certificado RES080—: son el mismo gesto sobre el mismo
 * dato, y dos copias divergirían justo en el aviso de que falta la foto.
 *
 * REGLA — la foto se coge de DRIVE; subirla aquí es la excepción. Ya está en
 * «la pegatina de la máquina de fuera» en 12 de los 25 expedientes que van por
 * este método (medido el 17/09/2026). El botón existe para los otros, y sube por
 * la MISMA ruta que el enlace del instalador (`/api/public/reforma-docs/...`, que
 * admite sesión de staff sin token): así la foto entra en el slot de siempre y la
 * ven también el checklist, el Anexo Fotográfico y el lector de placas. No hay
 * una segunda vía de subida que mantener.
 */

const SLOT = 'FOTO_UNIDAD_EXTERIOR_PLACA';

/**
 * Carga, elección y subida de la placa. `activo` es el método de SCOP: el hook no
 * pide nada si el expediente no va por el Anexo VI (en los demás el COP no sale
 * de ninguna placa y la foto sería ruido en el certificado).
 */
export function usePlacaScopAcs(expediente, isOpen) {
    const [placa, setPlaca] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [subiendo, setSubiendo] = useState(false);
    const expId = expediente?.id;
    const metodo = expediente?.instalacion?.aerotermia_acs?.metodo_scop || 'ficha';

    const recargar = useCallback(async () => {
        if (!expId) return null;
        const { data } = await axios.get(`/api/expedientes/${expId}/placa-scop-acs`);
        setPlaca(data);
        return data;
    }, [expId]);

    useEffect(() => {
        if (!isOpen || !expId || metodo !== 'independiente') { setPlaca(null); return; }
        let vivo = true;
        setCargando(true);
        axios.get(`/api/expedientes/${expId}/placa-scop-acs`)
            .then(({ data }) => { if (vivo) setPlaca(data); })
            .catch((e) => {
                // Un fallo aquí NO puede dejar el certificado sin generar: sale sin
                // la placa, que es exactamente el comportamiento de siempre.
                console.warn('[placa Anexo VI] no se pudo leer:', e.message);
                if (vivo) setPlaca(null);
            })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [isOpen, expId, metodo]);

    /** Cuál de las fotos del slot lleva el COP. Se guarda solo el driveId (regla 21). */
    const elegir = useCallback(async (driveId) => {
        if (!expId || !driveId) return;
        setCargando(true);
        try {
            await axios.put(`/api/expedientes/${expId}/placa-scop-acs`, { driveId });
            await recargar();
        } catch (e) {
            console.warn('[placa Anexo VI] no se pudo cambiar:', e.message);
        } finally {
            setCargando(false);
        }
    }, [expId, recargar]);

    /**
     * Sube una foto al slot de siempre y la deja ELEGIDA: quien la sube aquí lo
     * hace para que sea la que se imprima, no para dejarla en la carpeta.
     */
    const subir = useCallback(async (file) => {
        const oppId = expediente?.oportunidad_id || expediente?.oportunidades?.id;
        if (!file || !oppId) return { ok: false, error: 'Este expediente no tiene oportunidad detrás.' };
        setSubiendo(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            const { data } = await axios.post(`/api/public/reforma-docs/${oppId}/${SLOT}`, fd);
            if (data?.driveId) await axios.put(`/api/expedientes/${expId}/placa-scop-acs`, { driveId: data.driveId });
            await recargar();
            return { ok: true };
        } catch (e) {
            const msg = e.response?.data?.error || 'No se ha podido subir la foto.';
            console.warn('[placa Anexo VI] subida:', msg);
            return { ok: false, error: msg };
        } finally {
            setSubiendo(false);
        }
    }, [expediente?.oportunidad_id, expediente?.oportunidades?.id, expId, recargar]);

    /**
     * Guardar (o quitar, con `null`) el ENCUADRE de la foto elegida. Se manda el
     * recuadro en %, nunca la imagen recortada: el original se conserva en Drive,
     * el recorte se deshace, y el certificado sale igual generándolo desde la app
     * o desde el backend — porque el encuadre vive en el expediente.
     */
    const recortar = useCallback(async (recorte) => {
        const driveId = placa?.elegida?.driveId;
        if (!expId || !driveId) return;
        setCargando(true);
        try {
            await axios.put(`/api/expedientes/${expId}/placa-scop-acs`, { driveId, recorte });
            await recargar();
        } catch (e) {
            console.warn('[placa Anexo VI] no se pudo guardar el recorte:', e.message);
        } finally {
            setCargando(false);
        }
    }, [expId, placa?.elegida?.driveId, recargar]);

    return { placa, cargando, subiendo, elegir, subir, recortar };
}
