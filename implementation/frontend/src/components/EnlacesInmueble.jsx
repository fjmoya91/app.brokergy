// ─────────────────────────────────────────────────────────────────────────────
// Los dos enlaces de un inmueble: su ficha en el Catastro y dónde está.
//
// Vivían sueltos dentro de `PropertySheet` y hacían falta también en la ventana
// de la envolvente. Se sacan a un sitio porque lo que no puede divergir es la
// URL: la de la Sede parte la referencia en dos trozos de 7 caracteres, y una
// partida distinta no da error — abre la ficha de OTRO inmueble.
//
// Lo que se enseña es un enlace, no un dato: si no hay referencia catastral no
// hay botón de Catastro, y sin dirección no hay botón de Maps. Un botón que
// abre una búsqueda vacía es peor que no tenerlo.
// ─────────────────────────────────────────────────────────────────────────────

import { enlaceSedeCatastro, enlaceMaps } from '../utils/enlacesInmueble';

/**
 * Los dos botones.
 *
 * `compacto` es para una cabecera densa (la ventana de la envolvente); sin él
 * salen con la altura de la ficha técnica de la oportunidad, que es donde
 * llevan desde siempre. Las clases de esa variante son las que ya tenía
 * `PropertySheet`: el mismo botón, en un sitio más.
 */
export function EnlacesInmueble({ rc, direccion, compacto = false, soloIconos = false, className = '' }) {
    const catastro = enlaceSedeCatastro(rc);
    const maps = enlaceMaps(direccion);
    if (!catastro && !maps) return null;

    // Solo iconos: con la misma caja que los accesos al expediente
    // (`ExpedienteAccesos`), para ir en la misma fila que ellos. En el listado
    // la fila entera es clicable, así que el clic no puede subir.
    if (soloIconos) {
        const btn = 'p-2 rounded-lg border transition-all flex-shrink-0';
        const parar = (e) => e.stopPropagation();
        return (
            <div className={`flex items-center gap-1.5 ${className}`}>
                {catastro && (
                    <a href={catastro} target="_blank" rel="noreferrer" onClick={parar}
                       title={`Ver en la Sede del Catastro (${String(rc).trim().toUpperCase()})`}
                       className={`${btn} bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01" />
                        </svg>
                    </a>
                )}
                {maps && (
                    <a href={maps} target="_blank" rel="noreferrer" onClick={parar}
                       title={`Ver en Google Maps: ${direccion}`}
                       className={`${btn} bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20`}>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                    </a>
                )}
            </div>
        );
    }

    const caja = compacto
        ? `h-9 px-2.5 text-[10px] font-black uppercase tracking-widest rounded-lg
           border border-white/10 text-white/45 hover:border-white/30 hover:text-white
           flex items-center gap-1.5 shrink-0`
        : `h-[52px] px-4 btn-secondary text-[10px] font-bold uppercase tracking-wider
           flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10
           border-white/10 rounded-xl`;
    const icono = compacto ? 'w-3.5 h-3.5' : 'w-4 h-4';

    return (
        <div className={`flex gap-2 ${className}`}>
            {catastro && (
                <a href={catastro} target="_blank" rel="noreferrer" className={caja}
                   title="Ir a la Sede Electrónica del Catastro">
                    <svg className={`${icono} text-brand flex-shrink-0`} fill="none"
                         stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span className="hidden sm:inline">
                        {compacto ? 'Catastro' : 'Enlace a Catastro'}
                    </span>
                </a>
            )}
            {maps && (
                <a href={maps} target="_blank" rel="noreferrer" className={caja}
                   title="Ver en Google Maps">
                    <svg className={`${icono} text-green-400 flex-shrink-0`} fill="none"
                         stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="hidden sm:inline">
                        {compacto ? 'Maps' : 'Ver en Maps'}
                    </span>
                </a>
            )}
        </div>
    );
}

export default EnlacesInmueble;
