import { useState } from 'react';
import {
    MARCOS, VIDRIOS, VENTANAS_POR_DEFECTO, propuestaDeLasFotos, rotuloMarco,
    rotuloVidrio,
} from '../logic/ventanasVivienda';

// ─────────────────────────────────────────────────────────────────────────────
// Lo primero que se pregunta al abrir la envolvente de un expediente nuevo.
//
// Dos preguntas, y las dos hacen falta ANTES de poner la primera ventana: de
// la carpintería sale la transmitancia de cada hueco —lo que más pesa en la
// demanda de una vivienda antigua— y de la persiana, su puente térmico de
// cajón, que la app no escribía en ningún expediente.
//
// REGLA — no se pregunta NADA más. Todo lo que se puede mirar en el plano o
// derivar del expediente ya se deriva; un popup que pregunta de más se
// responde sin leer, y entonces deja de servir para lo que sí importa.
//
// REGLA — no BLOQUEA. «Lo pongo luego» deja el .cex exactamente como salía
// antes de que esto existiera, y el botón sigue en la barra para volver.
// ─────────────────────────────────────────────────────────────────────────────

export function VentanasViviendaModal({ ventanas, muros, onGuardar, onCerrar,
                                        primeraVez = false }) {
    // Lo que dicen las fotos que ya se han leído en este expediente. Si el
    // instalador las subió y alguien las leyó, preguntar de cero es preguntar
    // lo que ya está contestado.
    const [foto] = useState(() => propuestaDeLasFotos(muros));
    const [v, setV] = useState(() => ({
        ...VENTANAS_POR_DEFECTO,
        ...(foto ? limpio(foto) : {}),
        ...(ventanas || {}),
    }));

    const desdeFoto = (campo) => !ventanas?.[campo] && foto?.[campo] !== undefined
                                 && String(foto[campo]) === String(v[campo]);

    return (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0
                        md:items-center md:p-4"
             onClick={onCerrar}>
            <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-2xl border
                            border-white/10 bg-bkg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]
                            md:rounded-2xl"
                 onClick={e => e.stopPropagation()}>

                <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                    {primeraVez ? 'Antes de empezar' : 'Las ventanas de la vivienda'}
                </p>
                <h3 className="mt-1 text-lg font-black leading-tight">
                    ¿Cómo son las ventanas de esta vivienda?
                </h3>
                <p className="mt-1.5 text-[12px] leading-relaxed text-white/55">
                    De esto salen la transmitancia de cada hueco y, si hay persianas, su
                    puente térmico de cajón. Se pregunta una vez y vale para todos los
                    huecos; la ventana que sea distinta se cambia luego en su panel.
                </p>

                {foto && (
                    <p className="mt-3 rounded-lg border border-brand/25 bg-brand/[0.07] px-3 py-2
                                  text-[11.5px] leading-relaxed text-white/75">
                        Viene contestado con lo que dicen las{' '}
                        <b className="text-white/90">{foto.leidos}</b>{' '}
                        {foto.leidos === 1 ? 'foto leída' : 'fotos leídas'} de este
                        expediente. Compruébalo: una foto no siempre deja ver si el perfil
                        lleva rotura de puente térmico.
                    </p>
                )}

                <Bloque titulo="El vidrio" n={1}>
                    {VIDRIOS.map(o => (
                        <Opcion key={o.id} elegida={v.vidrio === o.id}
                                onClick={() => setV(x => ({ ...x, vidrio: o.id }))}
                                rotulo={o.rotulo} ayuda={o.ayuda}
                                dato={`U ${fmt(o.u)} W/m²K`}
                                deFoto={desdeFoto('vidrio') && v.vidrio === o.id} />
                    ))}
                </Bloque>

                <Bloque titulo="El marco" n={2}>
                    {MARCOS.map(o => (
                        <Opcion key={o.id} elegida={v.marco === o.id}
                                onClick={() => setV(x => ({ ...x, marco: o.id }))}
                                rotulo={o.rotulo} ayuda={o.ayuda}
                                dato={`U ${fmt(o.u)} W/m²K`}
                                deFoto={desdeFoto('marco') && v.marco === o.id} />
                    ))}
                </Bloque>

                <Bloque titulo="¿Tienen persianas?" n={3}>
                    <Opcion elegida={v.persiana === true}
                            onClick={() => setV(x => ({ ...x, persiana: true }))}
                            rotulo="Sí, tienen persiana"
                            ayuda="Cada hueco lleva entonces su puente térmico de caja de
                                   persiana, que es el cajón por el que se cuela el aire."
                            deFoto={desdeFoto('persiana') && v.persiana === true} />
                    <Opcion elegida={v.persiana === false}
                            onClick={() => setV(x => ({ ...x, persiana: false }))}
                            rotulo="No tienen"
                            ayuda={null}
                            deFoto={desdeFoto('persiana') && v.persiana === false} />
                </Bloque>

                <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2
                              text-[11.5px] leading-relaxed text-white/60">
                    Se escribirá <b className="text-white/85">{rotuloVidrio(v.vidrio)}</b> +{' '}
                    <b className="text-white/85">{rotuloMarco(v.marco)}</b>
                    {v.persiana ? ', con caja de persiana' : ', sin caja de persiana'} en
                    todos los huecos.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={onCerrar}
                            className="rounded-lg px-3 py-2 text-[12px] font-bold text-white/50
                                       hover:text-white/80">
                        {primeraVez ? 'Lo pongo luego' : 'Cancelar'}
                    </button>
                    <button type="button" onClick={() => onGuardar(v)}
                            className="rounded-lg bg-brand px-4 py-2 text-[12px] font-black
                                       text-black hover:brightness-110">
                        Usar esto en toda la vivienda
                    </button>
                </div>
                {primeraVez && (
                    <p className="mt-2 text-right text-[10.5px] text-white/35">
                        Sin contestar se escribe {rotuloVidrio(VENTANAS_POR_DEFECTO.vidrio)} +{' '}
                        {rotuloMarco(VENTANAS_POR_DEFECTO.marco)}, como hasta ahora.
                    </p>
                )}
            </div>
        </div>
    );
}


function Bloque({ titulo, n, children }) {
    return (
        <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                {n}. {titulo}
            </p>
            <div className="mt-1.5 flex flex-col gap-1.5">{children}</div>
        </div>
    );
}

function Opcion({ elegida, onClick, rotulo, ayuda, dato, deFoto }) {
    return (
        <button type="button" onClick={onClick}
                className={`w-full rounded-lg border px-3 py-2 text-left transition
                            ${elegida ? 'border-brand/60 bg-brand/[0.09]'
                                      : 'border-white/10 bg-white/[0.02] hover:border-white/25'}`}>
            <div className="flex items-baseline gap-2">
                <span className={`text-[13px] font-bold ${elegida ? '' : 'text-white/80'}`}>
                    {rotulo}
                </span>
                {deFoto && (
                    <span className="rounded bg-brand/20 px-1.5 py-px text-[9px] font-black
                                     uppercase tracking-wider text-brand">
                        de la foto
                    </span>
                )}
                {dato && (
                    <span className="ml-auto shrink-0 text-[10.5px] font-bold text-white/35">
                        {dato}
                    </span>
                )}
            </div>
            {ayuda && <p className="mt-0.5 text-[11px] leading-snug text-white/45">{ayuda}</p>}
        </button>
    );
}

const fmt = n => Number(n).toFixed(1).replace('.', ',');

/** Lo leído de las fotos, sin las claves que la lectura no ha podido afirmar. */
function limpio(o) {
    const out = {};
    for (const k of ['vidrio', 'marco', 'persiana']) {
        if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
    }
    return out;
}
