import { useEffect, useState } from 'react';
import { areaPoligono } from '../logic/geometriaPlano';
import { COLOR_CROQUIS, ETIQUETA_USO_ZONA, USOS_ZONA, textoCatastro } from '../logic/zonasFuera';
import { IconoDeshacer, IconoLapiz, IconoMovil } from './IconosCroquis';

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ ES VIVIENDA EN ESTA PLANTA — el mando que vive bajo la barra de cada plano.
//
// POR QUÉ EXISTE — 26RES080_85 (CL Sol 20, Campo de Criptana, 28/09/2026). La
// casa es UN cuerpo de dos plantas y en la planta BAJA tiene un garaje dentro,
// con la vivienda encima. Catastro no dibuja esa línea, y las dos herramientas
// que había no servían:
//   · una PARED DIBUJADA separa, pero no quita superficie («me seguía sumando
//     la superficie de suelo»);
//   · DELIMITAR LA VIVIENDA es un prisma para TODAS las plantas, así que el
//     garaje se llevaba también la primera («esa misma planta se copia en
//     planta primera»).
// El certificador lo dejó tras una hora y lo hizo a mano.
//
// Una ZONA se dibuja sobre el plano de UNA planta y el motor la resta SOLO de
// ella: la pared de la casa contra el garaje sale como partición con espacio no
// habitable, la fachada del garaje deja de ser de la vivienda y el forjado de
// la planta de arriba es un suelo sobre espacio no habitable.
//
// Delimitar la vivienda sigue aquí para lo que es —un ADOSADO dentro de una
// comunidad—, dicho con esas palabras y en segundo plano.
// ─────────────────────────────────────────────────────────────────────────────


export function ViviendaPlantaControl({
    planta, zonas = [], dibujandoZona = false, vertices = [], uso = 'GARAJE', onUso,
    onZonaModo, onZonaCerrar, onZonaCancelar, onZonaQuitar,
    // El contorno del ADOSADO: solo llega al plano en el que se ofrece.
    recorte = null, onRecorteModo = null, onRecorteQuitar = null, recorteSugerido = false,
    midiendo = false,
    // El CROQUIS a mano alzada: lo más rápido cuando se sabe DÓNDE está cada
    // cosa pero no sus medidas. Los m² los pone Catastro (`catastroPlanta`).
    croquis = [], dibujandoCroquis = false, usoCroquis = 'GARAJE', onUsoCroquis,
    onCroquisModo = null, onCroquisAjustar, onCroquisDeshacer, onCroquisBorrar,
    catastroPlanta = [],
    // PINTAR DESDE EL MÓVIL: la sesión abierta en ESTA planta (o null) y sus
    // mandos. Lo que se pinta allí aparece en este plano según se dibuja.
    croquisMovil = null, abriendoMovil = false, onCroquisMovil = null,
    onCroquisMovilQr = null, onCroquisMovilCerrar = null,
    // La PROPUESTA de croquis (ver `gis/croquis_propuesta.py` en el motor):
    // dónde está, probablemente, lo que Catastro declara que no es vivienda.
    // Se OFRECE —«Ver la propuesta» la carga como un croquis más, que se
    // corrige y se ajusta igual— y se dice por qué va cada mancha donde va.
    propuesta = null, onVerPropuesta = null, notasPropuesta = null,
}) {
    // Cerrar el enlace con manchas pintadas y sin ajustar las DESCARTA: pide
    // un segundo toque (el hook va antes de cualquier `return`).
    const [confirmaCerrar, setConfirmaCerrar] = useState(false);
    useEffect(() => {
        if (!confirmaCerrar) return undefined;
        const t = setTimeout(() => setConfirmaCerrar(false), 3000);
        return () => clearTimeout(t);
    }, [confirmaCerrar]);
    const hintCatastro = textoCatastro(catastroPlanta);
    if (croquisMovil) {
        const pintando = !!croquisMovil.enCurso;
        const cerrar = () => {
            if (croquis.length && !confirmaCerrar) { setConfirmaCerrar(true); return; }
            setConfirmaCerrar(false);
            onCroquisMovilCerrar?.();
        };
        return (
            <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg
                            border border-violet-400/50 bg-violet-400/[0.08] px-3 py-2">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                        <b className="flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-wider text-violet-300">
                            <IconoMovil /> Croquis desde el móvil
                        </b>
                        <span className={`flex items-center gap-1.5 text-[11.5px] font-bold
                                          ${croquisMovil.conectado ? 'text-emerald-300' : 'text-white/70'}`}>
                            <span className={`inline-block h-2 w-2 rounded-full
                                              ${croquisMovil.conectado ? 'bg-emerald-400' : 'animate-pulse bg-violet-400'}
                                              ${pintando ? 'animate-pulse' : ''}`} />
                            {!croquisMovil.conectado ? 'Esperando a que se abra el QR en el móvil…'
                                : pintando ? 'Pintando en el móvil…' : 'Móvil conectado: lo que pinte aparece aquí'}
                        </span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-white/55">
                        {croquis.length} {croquis.length === 1 ? 'zona pintada' : 'zonas pintadas'}
                        {hintCatastro && <> · Catastro: {hintCatastro}</>}
                    </p>
                </div>
                <span className="flex items-center gap-1.5">
                    <Boton onClick={onCroquisMovilQr} title="Volver a enseñar el código QR">Ver QR</Boton>
                    <Boton onClick={() => onCroquisAjustar?.(false)} disabled={!croquis.length || midiendo}
                           title="Endereza los bordes pero respeta lo dibujado (cuando Catastro está desfasado)">
                        Solo enderezar
                    </Boton>
                    <BotonPrincipal onClick={() => onCroquisAjustar?.(true)} disabled={!croquis.length || midiendo}
                                    title="Lo mismo que pulsar «Ajustar a Catastro» en el móvil">
                        {midiendo ? 'Ajustando…' : '✓ Ajustar a Catastro'}
                    </BotonPrincipal>
                    <button onClick={cerrar}
                            aria-label={confirmaCerrar ? 'Confirmar: descartar lo pintado' : 'Dejar de pintar desde el móvil'}
                            title="Cierra el enlace del móvil (lo pintado sin ajustar se descarta)"
                            className={`flex h-7 items-center justify-center rounded-md border text-[11px] font-bold transition
                                ${confirmaCerrar ? 'border-rose-400/60 bg-rose-500/15 px-2 text-rose-200'
                                                 : 'w-7 border-white/15 text-white/60 hover:bg-white/[0.06] hover:text-white'}`}>
                        {confirmaCerrar ? '¿Descartar lo pintado?' : '✕'}
                    </button>
                </span>
            </div>
        );
    }
    if (dibujandoCroquis) {
        return (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border
                            border-violet-400/50 bg-violet-400/[0.08] px-3 py-2">
                <b className="flex items-center gap-1.5 text-[11.5px] font-black uppercase tracking-wider text-violet-300">
                    <IconoLapiz /> Croquis de {planta?.nombre?.toLowerCase() || 'esta planta'}
                </b>
                <span className="flex items-center gap-1">
                    {USOS_ZONA.map(u => (
                        <button key={u} onClick={() => onUsoCroquis?.(u)}
                                style={u === usoCroquis ? { borderColor: COLOR_CROQUIS[u], color: COLOR_CROQUIS[u] } : undefined}
                                className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold transition
                                    ${u === usoCroquis ? 'bg-white/[0.08]'
                                                       : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}>
                            <span className="mr-1 inline-block h-2 w-2 rounded-full"
                                  style={{ background: COLOR_CROQUIS[u] }} />
                            {ETIQUETA_USO_ZONA[u]}
                        </button>
                    ))}
                </span>
                {notasPropuesta?.length > 0 && <NotasPropuesta notas={notasPropuesta} />}
                <span className="text-[11.5px] text-white/75">
                    Rodea cada zona a mano alzada (puedes pasarte por fuera de las paredes).
                    Lo que no pintes es vivienda.{' '}
                    <span className="text-white/50">
                        Las superficies las pone Catastro{hintCatastro ? `: ${hintCatastro}` : ''}.
                    </span>
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                    <span className="text-[11px] tabular-nums text-white/55">
                        {croquis.length} {croquis.length === 1 ? 'zona' : 'zonas'}
                    </span>
                    <Boton onClick={onCroquisDeshacer} disabled={!croquis.length || midiendo}
                           title="Quita la última mancha"><IconoDeshacer size={12} /></Boton>
                    {onCroquisMovil && (
                        <Boton onClick={onCroquisMovil} disabled={midiendo || abriendoMovil}
                               title="Sigue pintando con el dedo en el móvil: lo que pintes allí aparece aquí">
                            {abriendoMovil ? 'Abriendo…' : <><IconoMovil size={12} className="-mt-px mr-1 inline" />En el móvil</>}
                        </Boton>
                    )}
                    <Boton onClick={() => onCroquisAjustar?.(false)} disabled={!croquis.length || midiendo}
                           title="Endereza los bordes pero respeta lo dibujado (cuando Catastro está desfasado)">
                        Solo enderezar
                    </Boton>
                    <BotonPrincipal onClick={() => onCroquisAjustar?.(true)} disabled={!croquis.length || midiendo}
                                    title="Endereza los bordes y ajusta cada zona a los m² de Catastro de esta planta">
                        {midiendo ? 'Ajustando…' : '✓ Ajustar a Catastro'}
                    </BotonPrincipal>
                    <button onClick={() => { onCroquisBorrar?.(); onCroquisModo?.(false); }}
                            aria-label="Cancelar el croquis"
                            className="px-1.5 text-[13px] leading-none text-white/60 hover:text-white/90">✕</button>
                </span>
            </div>
        );
    }
    if (dibujandoZona) {
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border
                            border-sky-400/50 bg-sky-400/[0.08] px-3 py-2">
                <b className="text-[11.5px] font-black uppercase tracking-wider text-sky-300">
                    ✂ Dibuja lo que NO es vivienda
                </b>
                <span className="flex items-center gap-1">
                    {USOS_ZONA.map(u => (
                        <button key={u} onClick={() => onUso?.(u)}
                                className={`rounded-md border px-2 py-0.5 text-[10.5px] font-bold transition
                                    ${u === uso ? 'border-sky-400/70 bg-sky-400/20 text-sky-200'
                                                : 'border-white/10 bg-white/[0.03] text-white/55 hover:text-white'}`}>
                            {ETIQUETA_USO_ZONA[u]}
                        </button>
                    ))}
                </span>
                <span className="text-[11.5px] text-white/75">
                    Pulsa sus esquinas y cierra en el primer punto (o doble clic). Los puntos se
                    pegan a las paredes; por fuera del edificio puedes pasarte.{' '}
                    <span className="text-white/45">
                        Solo se quita de {planta?.nombre?.toLowerCase() || 'esta planta'}: la de encima no se toca.
                        Barra espaciadora + arrastrar mueve el plano. Esc cancela.
                    </span>
                </span>
                <span className="text-[11.5px] tabular-nums text-white/55">
                    {vertices.length} {vertices.length === 1 ? 'vértice' : 'vértices'}
                    {m2 ? ` · ≈${fmt(m2)} m²` : ''}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                    <button onClick={onZonaCerrar} disabled={vertices.length < 3}
                            className="rounded-md border border-sky-400/60 bg-sky-400/15 px-2.5 py-1
                                       text-[10.5px] font-black uppercase tracking-wider text-sky-300
                                       hover:bg-sky-400/25 disabled:opacity-40">
                        ✓ Cerrar y medir
                    </button>
                    <button onClick={onZonaCancelar} aria-label="Cancelar"
                            className="px-1.5 text-[13px] leading-none text-white/60
                                       hover:text-white/90">✕</button>
                </span>
            </div>
        );
    }

    const hayRecorte = Array.isArray(recorte?.poligono) && recorte.poligono.length >= 3;
    return (
        <div className={`mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-1.5
            ${zonas.length || hayRecorte ? 'border-sky-400/30 bg-sky-400/[0.05]'
                                          : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/45"
                  title="Qué parte de lo construido en esta planta es la vivienda que se certifica">
                Vivienda
            </span>

            {zonas.map(z => (
                <span key={z.indice}
                      title={z.aplicada ? 'Se resta solo de esta planta'
                                        : 'El motor no la ha aplicado: mira el diagnóstico'}
                      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10.5px] font-bold
                          ${z.aplicada ? 'border-sky-400/40 bg-sky-400/10 text-sky-200'
                                       : 'border-amber-400/50 bg-amber-400/10 text-amber-200'}`}>
                    ✂ {ETIQUETA_USO_ZONA[z.uso] || 'No habitable'} fuera
                    {' · '}{fmt(z.area_real ?? z.area_m2 ?? 0)} m²
                    {!z.aplicada && ' · no se ha aplicado'}
                    <button onClick={() => onZonaQuitar?.(z.indice)} disabled={midiendo}
                            aria-label="Quitar esta zona" title="Quitar: vuelve a contar como vivienda"
                            className="ml-0.5 text-white/50 hover:text-white disabled:opacity-40">✕</button>
                </span>
            ))}

            {hayRecorte && (
                <span className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40
                                 bg-emerald-400/10 px-2 py-0.5 text-[10.5px] font-bold text-emerald-300">
                    Adosado delimitado · ≈{fmt(recorte.area_m2 ?? 0)} m² · todas las plantas
                    {onRecorteModo && (
                        <button onClick={() => onRecorteModo(true)} disabled={midiendo}
                                className="ml-1 text-white/55 hover:text-white disabled:opacity-40">✎</button>
                    )}
                    {onRecorteQuitar && (
                        <button onClick={onRecorteQuitar} disabled={midiendo} aria-label="Quitar el contorno"
                                className="text-white/55 hover:text-white disabled:opacity-40">✕</button>
                    )}
                </span>
            )}

            {!zonas.length && !hayRecorte && propuesta?.length > 0 && onVerPropuesta && (
                <button onClick={onVerPropuesta} disabled={midiendo}
                        title="Carga la propuesta como un croquis: corrígela si hace falta y pulsa «Ajustar a Catastro»"
                        className="inline-flex items-center gap-1.5 rounded-md border border-violet-400/50
                                   bg-violet-400/10 px-2 py-1 text-[10.5px] font-bold text-violet-200
                                   hover:bg-violet-400/20 disabled:opacity-40">
                    ✨ Catastro declara {textoCatastro(propuesta.map(t => ({ uso: ETIQUETA_USO_ZONA[t.uso] || t.uso,
                                                                         superficie: t.catastro_m2 || t.area_m2 })))}
                    {' '}aquí dentro · <span className="underline">Ver dónde</span>
                </button>
            )}
            {!zonas.length && !hayRecorte && !(propuesta?.length > 0 && onVerPropuesta) && (
                <span className={`text-[10.5px] ${recorteSugerido ? 'text-amber-200/90' : 'text-white/50'}`}>
                    {recorteSugerido
                        ? '¿Es un adosado dentro de una comunidad? Aquí se está midiendo el bloque entero.'
                        : '¿Hay un garaje o un almacén dentro de esta planta?'}
                </span>
            )}

            <span className="ml-auto flex items-center gap-1">
                {/* El CROQUIS es una herramienta con dos entradas —con el ratón
                    aquí o con el dedo en el móvil—: van juntas, como un botón
                    partido. */}
                {(onCroquisModo || onCroquisMovil) && (
                    <span className={`inline-flex overflow-hidden rounded-md border divide-x
                        ${recorteSugerido ? 'border-white/10 divide-white/10'
                                          : 'border-sky-400/50 divide-sky-400/30'}`}>
                        {onCroquisModo && (
                            <SegmentoCroquis onClick={() => onCroquisModo(true)} disabled={midiendo} fuerte={!recorteSugerido}
                                             title="Pinta a mano alzada dónde está el garaje, el porche…: la app lo ajusta a los m² de Catastro">
                                <IconoLapiz size={12} /> Croquis
                            </SegmentoCroquis>
                        )}
                        {onCroquisMovil && (
                            <SegmentoCroquis onClick={onCroquisMovil} disabled={midiendo || abriendoMovil} fuerte={!recorteSugerido}
                                             title="Enseña un QR: pinta el croquis con el dedo en el móvil y lo ves aquí según lo pintas">
                                <IconoMovil size={12} /> {abriendoMovil ? 'Abriendo…' : 'Pintar desde el móvil'}
                            </SegmentoCroquis>
                        )}
                    </span>
                )}
                {onZonaModo && (
                    <Boton onClick={() => onZonaModo(true)} disabled={midiendo} fuerte={!recorteSugerido && !onCroquisModo}
                           title="Dibuja lo que no es vivienda: se quita SOLO de esta planta">
                        ✂ Quitar una zona
                    </Boton>
                )}
                {onRecorteModo && !hayRecorte && (
                    <Boton onClick={() => onRecorteModo(true)} disabled={midiendo} ambar={recorteSugerido}
                           title="Para un adosado dentro de una comunidad: vale para TODAS las plantas y lo de fuera es la casa de al lado (medianera)">
                        Delimitar adosado
                    </Boton>
                )}
            </span>
            {midiendo && <span className="text-[10.5px] text-white/55">volviendo a medir…</span>}
        </div>
    );
}

function Boton({ onClick, disabled, fuerte, ambar, title, children }) {
    return (
        <button onClick={onClick} disabled={disabled} title={title}
                className={`rounded-md border px-2 py-1 text-[10.5px] font-bold transition disabled:opacity-40
                    ${ambar ? 'border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                        : fuerte ? 'border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20'
                                 : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'}`}>
            {children}
        </button>
    );
}

/**
 * Por qué va cada mancha de la propuesta donde va. Es lo que separa «lo dice
 * una foto» de «es lo que queda»: con la confianza a la vista se sabe qué hay
 * que mirar dos veces.
 */
function NotasPropuesta({ notas }) {
    const tono = { alta: 'text-emerald-300', media: 'text-sky-200', baja: 'text-amber-200' };
    return (
        <div className="w-full rounded-md border border-violet-400/25 bg-violet-400/[0.06] px-2.5 py-1.5
                        text-[11px] leading-snug text-white/75">
            <b className="text-violet-200">Propuesta</b> — corrígela si no es así y pulsa «Ajustar a Catastro»:
            <ul className="mt-0.5 space-y-0.5">
                {notas.map((n, i) => (
                    <li key={i} className="flex flex-wrap items-baseline gap-x-1.5">
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full"
                              style={{ background: COLOR_CROQUIS[n.uso] || COLOR_CROQUIS['ESPACIO NO HABITABLE'] }} />
                        <b className="text-white/90">{ETIQUETA_USO_ZONA[n.uso] || n.uso}</b>
                        <span>{n.por_que}</span>
                        <span className={`text-[10px] font-bold uppercase ${tono[n.confianza] || tono.baja}`}>
                            · confianza {n.confianza}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** La acción PRINCIPAL de una barra: rellena, para que no se confunda con las demás. */
function BotonPrincipal({ onClick, disabled, title, children }) {
    return (
        <button onClick={onClick} disabled={disabled} title={title}
                className="rounded-md bg-violet-600 px-2.5 py-1 text-[10.5px] font-black uppercase tracking-wider
                           text-white shadow-sm transition hover:bg-violet-500 disabled:opacity-40
                           disabled:shadow-none">
            {children}
        </button>
    );
}

function SegmentoCroquis({ onClick, disabled, fuerte, title, children }) {
    return (
        <button onClick={onClick} disabled={disabled} title={title}
                className={`inline-flex items-center gap-1 px-2 py-1 text-[10.5px] font-bold transition disabled:opacity-40
                    ${fuerte ? 'bg-sky-400/10 text-sky-200 hover:bg-sky-400/20'
                             : 'bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'}`}>
            {children}
        </button>
    );
}

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default ViviendaPlantaControl;
