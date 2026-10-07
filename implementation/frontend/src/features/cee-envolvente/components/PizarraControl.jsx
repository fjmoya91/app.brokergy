import { HERRAMIENTAS, colorDeLapiz } from '../logic/pizarra';

// ============================================================================
// La PALETA de la pizarra: qué lápiz se tiene en la mano, lo último que la app
// ha entendido del trazo y la salida para confirmarlo («Así es como está»).
//
// Va bajo la barra de SU plano —como la cubierta—: el mando tiene que estar
// donde se dibuja. Los botones son de 44 px de alto: en una tablet se pulsan
// con el dedo, y uno de 28 px se falla una de cada tres veces.
// ============================================================================


function Icono({ id }) {
    const c = colorDeLapiz(id);
    const comun = { width: 22, height: 22, viewBox: '0 0 24 24', 'aria-hidden': true, className: 'shrink-0' };
    if (id === 'mano') {
        return (
            <svg {...comun} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" />
            </svg>
        );
    }
    if (id === 'FACHADA' || id === 'MEDIANERA' || id === 'PARTICION_VERTICAL') {
        return (
            <svg {...comun}>
                <line x1="3" y1="12" x2="21" y2="12" stroke={c} strokeWidth="5" strokeLinecap="round"
                      strokeDasharray={id === 'MEDIANERA' ? '4 3' : undefined} />
            </svg>
        );
    }
    if (id === 'ventana') {
        return (
            <svg {...comun} fill="none">
                <line x1="2" y1="12" x2="6" y2="12" stroke="var(--text-secondary)" strokeWidth="5" />
                <line x1="18" y1="12" x2="22" y2="12" stroke="var(--text-secondary)" strokeWidth="5" />
                <rect x="6" y="9.5" width="12" height="5" stroke={c} strokeWidth="1.6" />
                <line x1="6" y1="12" x2="18" y2="12" stroke={c} strokeWidth="1.6" />
            </svg>
        );
    }
    if (id === 'puerta') {
        return (
            <svg {...comun} fill="none">
                <line x1="2" y1="18" x2="6" y2="18" stroke="var(--text-secondary)" strokeWidth="5" />
                <line x1="18" y1="18" x2="22" y2="18" stroke="var(--text-secondary)" strokeWidth="5" />
                <path d="M6 18V6M6 6a12 12 0 0 1 12 12" stroke={c} strokeWidth="1.8" />
            </svg>
        );
    }
    // La goma.
    return (
        <svg {...comun} fill="none" stroke={c} strokeWidth="2" strokeLinejoin="round">
            <path d="M15.5 4.5l4 4-9.5 9.5H6l-2-2a1.5 1.5 0 0 1 0-2.1z" />
            <path d="M10 8l6 6M6 18h14" strokeLinecap="round" />
        </svg>
    );
}

export function PizarraControl({ herramienta, onHerramienta, aviso, onAviso, cambios = 0,
                                 onAsiEsComoEsta = null, onCerrar = null, pistaMover = null }) {
    const actual = HERRAMIENTAS.find(h => h.id === herramienta) || HERRAMIENTAS[0];
    return (
        <div className="mb-2 rounded-xl border border-violet-400/40 bg-violet-500/[0.06] p-2">
            {/* En el teléfono, una cuadrícula de 4 con el icono encima (como la paleta
                de usos del croquis): en fila ocupaban tres renglones y le quitaban
                al plano media pantalla. Desde `sm`, en fila. */}
            <div className="grid grid-cols-4 items-stretch gap-1.5 sm:flex sm:flex-wrap" role="toolbar"
                 aria-label="Lápices de la pizarra">
                {HERRAMIENTAS.map(h => {
                    const activo = h.id === herramienta;
                    return (
                        <button key={h.id} onClick={() => { onHerramienta(h.id); onAviso?.(null); }}
                                aria-pressed={activo} title={h.ayuda}
                                className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-lg
                                            border px-1 text-[11px] font-bold leading-tight transition-colors
                                            sm:min-h-[44px] sm:flex-row sm:gap-1.5 sm:px-2.5 sm:text-[12px]
                                            ${activo ? 'border-violet-300 bg-violet-600 text-white shadow'
                                                     : 'border-white/15 bg-white/[0.04] text-white/80 hover:border-white/30'}`}>
                            <Icono id={h.id} />
                            <span className="hidden sm:inline">{h.etiqueta}</span>
                            <span className="sm:hidden">{h.corta}</span>
                        </button>
                    );
                })}
                {onCerrar && (
                    <button onClick={onCerrar}
                            className="min-h-[48px] rounded-lg border border-white/15 px-3 text-[12px]
                                       font-bold text-white/70 hover:text-white sm:ml-auto sm:min-h-[44px]">
                        Cerrar
                    </button>
                )}
            </div>

            <p className="mt-1.5 px-1 text-[12px] leading-snug text-white/70">
                <b className="text-white">{actual.etiqueta}:</b> {actual.ayuda}.
                {pistaMover ? (
                    <span className="text-white/50">{' '}{pistaMover}</span>
                ) : (
                    <span className="hidden md:inline text-white/50">
                        {' '}Con la barra espaciadora pulsada se mueve el plano; en la tablet, con dos dedos.
                    </span>
                )}
            </p>

            {aviso?.texto && (
                <p className={`mt-1.5 rounded-lg px-2 py-1.5 text-[12.5px] leading-snug
                               ${aviso.ok ? 'bg-emerald-400/10 text-emerald-100'
                                          : 'bg-amber-400/10 text-amber-100'}`}
                   role="status">
                    {aviso.ok ? '✓ ' : ''}{aviso.texto}
                </p>
            )}

            {(cambios > 0 || onAsiEsComoEsta) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 px-1">
                    <span className="text-[12px] text-white/70">
                        {cambios
                            ? `${cambios} ${cambios === 1 ? 'cambio dibujado' : 'cambios dibujados'} sin confirmar`
                            : 'Cuando el plano esté como es de verdad:'}
                    </span>
                    {onAsiEsComoEsta && (
                        <button onClick={onAsiEsComoEsta}
                                className="ml-auto min-h-[40px] rounded-lg bg-emerald-600 px-3 text-[13px] font-black
                                           text-white shadow hover:bg-emerald-500">
                            ✓ Así es como está
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

/** El trazo de la pizarra mientras se dibuja. En PANTALLA: grueso, para verlo bajo el dedo. */
export function TrazoPizarra({ pts, tam, color }) {
    if (!pts?.length) return null;
    if (pts.length === 1) {
        return <circle cx={pts[0][0]} cy={pts[0][1]} r={tam * 0.35} fill={color} opacity={0.85}
                       style={{ pointerEvents: 'none' }} />;
    }
    return (
        <polyline points={pts.map(([x, y]) => `${x},${y}`).join(' ')} fill="none"
                  stroke={color} strokeWidth={tam * 0.32} strokeLinecap="round" strokeLinejoin="round"
                  opacity={0.85} style={{ pointerEvents: 'none' }} />
    );
}

export default PizarraControl;
