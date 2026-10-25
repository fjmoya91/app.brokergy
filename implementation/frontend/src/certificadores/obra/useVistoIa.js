// ─── useVistoIa — pedirle a la IA que mire, y lo deducido del Catastro ──────
// Lo usan la ficha (Fases: al pasar de las fotos a «Lo que ha visto la IA» se
// lanza desde el clic, sin esperar a un efecto; y al confirmar se escribe lo
// deducido) y la propia fase (VistoIa.jsx). Contrato del servidor:
//   POST /api/certapp/obras/:id/visto-ia →
//   { at, propuesta: { valores, origen, notas, fotos }, dudas: [...], fuentes: { fotos, streetview, placa } }
//   429 VISTO_IA_TOPE (tope por cuenta y día) · 503 VISTO_IA_APAGADO.
import { useCallback, useState } from 'react';
import axios from 'axios';
import { API, mensajeError } from '../api';
import { aplicarDeducciones, deduccionesCatastro } from '../logic/cuestionario';
import { obraParaBarrido } from './comun';

export function useVistoIa({ obraId, guardar, setCuestionario }) {
    const [mirando, setMirando] = useState(false);
    const [error, setError] = useState(null);
    const mirar = useCallback(async () => {
        setMirando(true); setError(null);
        await guardar();   // el servidor lee las respuestas guardadas, no la pantalla
        try {
            const { data } = await axios.post(`${API}/obras/${obraId}/visto-ia`);
            setCuestionario(q => {
                const n = aplicarDeducciones(q, data?.propuesta || {});
                return {
                    ...n,
                    visto_ia: {
                        ...(n.visto_ia || {}),
                        at: data?.at || new Date().toISOString(),
                        fotos: { ...(n.visto_ia?.fotos || {}), ...(data?.propuesta?.fotos || {}) },
                        dudas: Array.isArray(data?.dudas) ? data.dudas : [],
                        fuentes: data?.fuentes || {},
                        confirmado_at: null,
                    },
                };
            });
        } catch (err) {
            setError(err.response?.status === 503
                ? 'La IA no está disponible ahora mismo. Puedes seguir: revisa lo de abajo y confirma.'
                : mensajeError(err, 'No se han podido mirar las fotos. Puedes seguir: revisa lo de abajo y confirma.'));
        } finally {
            setMirando(false);
        }
    }, [obraId, guardar, setCuestionario]);
    return { mirar, mirando, error };
}

/** El cuestionario con lo deducido del Catastro ya puesto (para enseñarlo y para confirmarlo). */
export function conDeducciones(obra, form, slots) {
    const ded = deduccionesCatastro(obraParaBarrido(obra, form, slots));
    return { cuestionario: aplicarDeducciones(form.cuestionario, ded), dudas: ded.dudas };
}
