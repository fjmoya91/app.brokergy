// ─── Ficha — /obra/:id ──────────────────────────────────────────────────────
// BORRADOR: la ficha por FASES (obra/Fases.jsx sobre obra/fasesFicha.js): una fase
// por pantalla, igual en el móvil y en el ordenador (Fran, 25/10/2026: «hay que
// hacer demasiado scroll»). Antes: en el móvil una pregunta por pantalla y en
// el ordenador todas las secciones en tarjetas.
// EN_PREPARACION / LISTO / VALIDADO: ObraCerrada (historial, descargas, validar).
// En todas, «¿Algo mal en este certificado? Avísanos» y lo que el certificador nos
// ha contado de esa obra (IncidenciasObra).
// El guardado es de useObra (autoguardado sin trampa: compara valores).
import { useMemo } from 'react';
import { resumenCuestionario } from '../logic/cuestionario';
import { useIsMobile } from '../../utils/useIsMobile';
import { ErrorRed, Esqueleto } from '../ui/piezas';
import { useObra } from './useObra';
import { Fases } from './Fases';
import { ObraCerrada } from './ObraCerrada';
import { obraParaBarrido } from './comun';

export default function Ficha({ id }) {
    const o = useObra(id);
    const movil = useIsMobile();
    const { obra, form, slots } = o;
    const resumen = useMemo(() => (obra && form ? resumenCuestionario(obraParaBarrido(obra, form, slots)) : []), [obra, form, slots]);

    if (o.cargando && !obra) {
        return <div className={movil ? 'ca-col' : 'ca-col-fases'}><Esqueleto alto={160} /><div style={{ height: 12 }} /><Esqueleto alto={64} n={5} /></div>;
    }
    if (!obra || !form) {
        return <div className="ca-col"><ErrorRed error={o.error} onReintentar={() => o.cargar()} titulo="No hemos podido abrir la obra" /></div>;
    }
    if (obra.estado && obra.estado !== 'BORRADOR') {
        return <ObraCerrada o={o} resumen={resumen} />;
    }
    return <Fases o={o} id={id} movil={movil} />;
}
