import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { compararDemanda, esperaDemandaMenor, fmtKwh, fmtDec, fmtPct } from '../logic/demandaPropuesta';
import { useIsMobile } from '../../../utils/useIsMobile';

// ─── LO QUE SE SIMULÓ, FRENTE A LO QUE CERTIFICA EL CEE ───────────────────────
// Un BOTÓN, no un recuadro. La fila del CEE ya es densa (cinco columnas, tres
// fechas, seis slots) y una banda permanente con dos cifras más la convertía en
// un muro: el expediente se lee de un vistazo o no se lee. El dato solo hace
// falta cuando se compara, así que vive detrás de la ⓘ.
//
// La EXCEPCIÓN es el aviso: si la demanda o la superficie certificadas quedan por
// DEBAJO de las que se simularon, el botón se pone rojo y parpadea. Eso sí tiene
// que verse sin pulsar nada — es la cifra sobre la que se prometió el bono.

const CARD = 'rounded-xl border bg-bkg-deep border-white/10 shadow-2xl';

// Los rótulos de las dos columnas se escriben UNA vez, en la cabecera. Repetidos
// dentro de cada fila ("Oportunidad 200,00 · Certificado 170,00 −15 %") no caben
// en el popover de 320 px y las dos mitades se tocan. Plantilla de columnas
// compartida por la cabecera y las filas para que las cifras queden alineadas.
const COLS = 'grid grid-cols-[minmax(0,1fr)_64px_96px] gap-x-2 items-baseline';

function Cabecera() {
    return (
        <div className={`${COLS} pb-1 border-b border-white/[0.06]`}>
            <span />
            <span className="text-[9px] text-white/25 uppercase tracking-widest text-right">Oportun.</span>
            <span className="text-[9px] text-white/25 uppercase tracking-widest text-right">Certificado</span>
        </div>
    );
}

function Fila({ label, unidad, prop, cee, deltaPct, alerta }) {
    return (
        <div className={`${COLS} py-2 border-b border-white/[0.06] last:border-0`}>
            <span className="min-w-0">
                <span className="block text-[11px] font-bold text-white/70 leading-tight">{label}</span>
                <span className="block text-[9px] text-white/25 uppercase tracking-widest">{unidad}</span>
            </span>
            <span className="font-mono text-[13px] text-white/60 text-right">{prop > 0 ? fmtDec(prop) : '—'}</span>
            <span className="text-right whitespace-nowrap">
                <span className={`font-mono text-[13px] font-bold ${alerta ? 'text-red-400' : 'text-white'}`}>
                    {cee > 0 ? fmtDec(cee) : '—'}
                </span>
                {deltaPct != null && (
                    // Un "+0 %" en verde da la falsa sensación de una mejora que no
                    // existe: cuando las dos cifras coinciden se dice que coinciden.
                    Math.abs(deltaPct) < 0.05 ? (
                        <span className="ml-1 text-[10px] font-black text-white/30">=</span>
                    ) : (
                        <span className={`ml-1 text-[10px] font-black ${alerta ? 'text-red-400' : 'text-emerald-400'}`}>
                            {fmtPct(deltaPct)}
                        </span>
                    )
                )}
            </span>
        </div>
    );
}

/**
 * El contenido del panel. Se exporta porque lo usan DOS superficies: el botón ⓘ
 * de la rejilla y el popup que salta al soltar el .xml en CeeModule. Antes cada
 * uno tenía su propia comparación —el popup por totales, el botón por factores—
 * y podían contradecirse sobre el mismo certificado: uno callaba mientras el
 * otro pintaba rojo.
 *
 * `cabecera` se apaga cuando el contenedor ya pone su propio titular.
 */
export function DemandaPropuestaPanel({ cmp, prop, section, esReforma, onClose, cabecera = true }) {
    const faseLabel = section === 'final' ? 'CEE final' : 'CEE inicial';
    const modoLabel = prop.modo === 'manual' ? 'demanda tecleada'
        : prop.modo === 'real' ? 'demanda de un CEE aportado'
        : 'demanda estimada';

    return (
        <>
            {cabecera && (
                <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="min-w-0">
                        <h4 className="text-[11px] font-black uppercase tracking-widest text-white">
                            Simulado · {faseLabel}
                        </h4>
                        <p className="text-[10px] text-white/35 leading-snug mt-0.5">
                            Sobre estas cifras se calculó el bono que se le ofreció al cliente ({modoLabel}).
                        </p>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="shrink-0 text-white/30 hover:text-white text-lg leading-none px-1">×</button>
                    )}
                </div>
            )}

            {cmp ? (
                <>
                    <Cabecera />
                    <Fila label="Demanda" unidad="kWh/m²·año"
                          prop={cmp.demanda.prop} cee={cmp.demanda.cee}
                          deltaPct={cmp.demanda.deltaPct} alerta={cmp.demanda.alerta} />
                    <Fila label="Superficie" unidad="m²"
                          prop={cmp.superficie.prop} cee={cmp.superficie.cee}
                          deltaPct={cmp.superficie.deltaPct} alerta={cmp.superficie.alerta} />

                    {/* El total va al pie y en gris: es la cifra que acaba viajando al
                        CIFO, pero el desvío se lee arriba factor a factor — una demanda
                        un 10 % más baja sobre una superficie un 10 % mayor da un total
                        idéntico y no delataría nada. */}
                    {cmp.total.cee > 0 && (
                        <p className="text-[10px] text-white/30 mt-2 font-mono">
                            Total anual: {fmtKwh(cmp.total.prop)} → {fmtKwh(cmp.total.cee)} kWh/año
                        </p>
                    )}

                    {cmp.alerta && (
                        <div className="mt-2.5 px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/25">
                            <p className="text-[10px] text-red-300/90 leading-snug">
                                {cmp.esperaMenor && cmp.demanda.alerta ? (
                                    <>
                                        <b className="text-red-400">La demanda certificada no ha bajado</b>{' '}
                                        respecto a la de la simulación. En un RES080 la actuación mejora la
                                        envolvente, así que el CEE posterior a la obra debe certificar MENOS
                                        demanda: comprueba con el técnico que el certificado es el de después
                                        de la obra — sin esa bajada la ficha se queda sin ahorro que justificar.
                                        {cmp.superficie.alerta && ' Además, la superficie certificada es menor que la simulada.'}
                                    </>
                                ) : (
                                    <>
                                        <b className="text-red-400">
                                            {cmp.demanda.alerta && cmp.superficie.alerta ? 'La demanda y la superficie certificadas son menores'
                                                : cmp.demanda.alerta ? 'La demanda certificada es menor'
                                                : 'La superficie certificada es menor'}
                                        </b>{' '}
                                        que la de la simulación.{' '}
                                        {esReforma
                                            ? 'En un RES080 el ahorro no sale de la demanda (va por emisiones o energía final), pero conviene comprobar que el certificado es de esta vivienda.'
                                            : 'El ahorro —y con él el bono CAE— se calculan sobre ella: revísalo con el técnico antes de seguir.'}
                                    </>
                                )}
                            </p>
                        </div>
                    )}
                </>
            ) : (
                // Sin CEE todavía: se enseña la referencia a secas. Saber qué demanda
                // tiene que salir ANTES de que el certificador entregue es justo lo que
                // permite avisarle a tiempo.
                <div className="py-2">
                    <div className="text-[9px] text-white/25 uppercase tracking-widest">Demanda simulada</div>
                    <div className="font-mono text-[15px] text-white font-bold">
                        {fmtDec(prop.qm2)} <span className="text-[10px] text-white/30">kWh/m²·año</span>
                    </div>
                    <div className="text-[9px] text-white/25 uppercase tracking-widest mt-2">Superficie simulada</div>
                    <div className="font-mono text-[15px] text-white font-bold">
                        {fmtDec(prop.superficie)} <span className="text-[10px] text-white/30">m²</span>
                    </div>
                    <p className="text-[10px] text-white/30 mt-2 leading-snug">
                        Cuando llegue el {faseLabel.toLowerCase()} se cruzarán aquí las dos cifras.
                    </p>
                </div>
            )}
        </>
    );
}

/**
 * @param sectionDemand  el CEE parseado de esta fase (puede estar vacío)
 * @param prop           demandaPropuesta(expediente) — null si no hay oportunidad
 */
export function DemandaPropuestaInfo({ sectionDemand, prop, section, esReforma }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);   // { top, left } en coordenadas de ventana
    const ref = useRef(null);
    const botonRef = useRef(null);
    const isMobile = useIsMobile();

    // El panel se PORTALEA a document.body y va `fixed`. La rejilla del CEE vive
    // dentro de una tarjeta `relative overflow-hidden` (CeeModule): un popover
    // absoluto ahí dentro se RECORTA por abajo justo en la fila del CEE final,
    // que es la última. Mismo motivo por el que SendActionOverlay se portalea.
    useLayoutEffect(() => {
        if (!open || isMobile) { setPos(null); return; }
        const recolocar = () => {
            const b = botonRef.current?.getBoundingClientRect();
            if (!b) return;
            // ALTO_APROX va por encima del panel más alto medido (277 px: dos filas,
            // total y aviso) para que al abrirse hacia arriba no solape el botón.
            const ANCHO = 320, ALTO_APROX = 300, M = 8;
            let left = b.left + b.width / 2 - ANCHO / 2;
            left = Math.max(M, Math.min(left, window.innerWidth - ANCHO - M));
            // Si no cabe por debajo, se abre hacia arriba.
            const abajo = b.bottom + 8;
            const top = abajo + ALTO_APROX > window.innerHeight - M
                ? Math.max(M, b.top - ALTO_APROX - 8)
                : abajo;
            setPos({ top, left });
        };
        recolocar();
        window.addEventListener('resize', recolocar);
        window.addEventListener('scroll', recolocar, true);
        return () => {
            window.removeEventListener('resize', recolocar);
            window.removeEventListener('scroll', recolocar, true);
        };
    }, [open, isMobile]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
        const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    if (!prop) return null;   // CEE directo: no hay simulación detrás
    const esperaMenor = esperaDemandaMenor(prop, { section, esReforma });
    const cmp = compararDemanda(sectionDemand, prop, { esperaMenor });
    const alerta = !!cmp?.alerta;

    return (
        <span className="relative inline-flex" ref={ref}>
            <button
                type="button"
                ref={botonRef}
                onClick={() => setOpen(o => !o)}
                title={alerta
                    ? (esperaMenor && cmp?.demanda?.alerta
                        ? 'La demanda certificada no ha bajado respecto a la simulada'
                        : 'La demanda o la superficie certificadas son menores que las simuladas')
                    : 'Ver la demanda y la superficie que se simularon en la oportunidad'}
                aria-label="Comparar con la simulación de la oportunidad"
                className={`w-5 h-5 max-md:w-11 max-md:h-11 rounded-full border flex items-center justify-center text-[10px] max-md:text-[13px] font-black transition-all active:scale-95 ${
                    alerta
                        ? 'bg-red-500/15 border-red-500/50 text-red-400 animate-pulse shadow-[0_0_10px_rgba(248,113,113,0.35)] hover:bg-red-500/25'
                        : 'bg-white/[0.04] border-white/10 text-white/35 hover:text-white hover:border-white/25'
                }`}
            >
                {alerta ? '!' : 'i'}
            </button>

            {open && createPortal(isMobile ? (
                // En un móvil, 320 px colgando de un botón de 20 se salen de la
                // pantalla: hoja inferior, como el resto de los popups del módulo.
                <div className="fixed inset-0 z-[600] flex items-end bg-black/60" onClick={() => setOpen(false)}>
                    <div className={`${CARD} w-full rounded-b-none p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]`}
                         onClick={e => e.stopPropagation()}>
                        <DemandaPropuestaPanel cmp={cmp} prop={prop} section={section} esReforma={esReforma} onClose={() => setOpen(false)} />
                    </div>
                </div>
            ) : (
                <div
                    className={`${CARD} fixed z-[600] w-[320px] p-3 text-left`}
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
                    // Portaleado fuera del <span>: el cierre por clic fuera se
                    // apoyaba en `ref.contains`, que aquí ya no lo alcanza.
                    onMouseDown={e => e.stopPropagation()}
                >
                    <DemandaPropuestaPanel cmp={cmp} prop={prop} section={section} esReforma={esReforma} onClose={() => setOpen(false)} />
                </div>
            ), document.body)}
        </span>
    );
}

export default DemandaPropuestaInfo;
