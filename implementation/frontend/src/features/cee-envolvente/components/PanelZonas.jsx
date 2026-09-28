import { areaPoligono } from '../logic/geometriaPlano';
import { ETIQUETA_USO_ZONA, USOS_ZONA } from '../logic/zonasFuera';

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
}) {
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

            {!zonas.length && !hayRecorte && (
                <span className={`text-[10.5px] ${recorteSugerido ? 'text-amber-200/90' : 'text-white/50'}`}>
                    {recorteSugerido
                        ? '¿Es un adosado dentro de una comunidad? Aquí se está midiendo el bloque entero.'
                        : '¿Hay un garaje o un almacén dentro de esta planta?'}
                </span>
            )}

            <span className="ml-auto flex items-center gap-1">
                {onZonaModo && (
                    <Boton onClick={() => onZonaModo(true)} disabled={midiendo} fuerte={!recorteSugerido}
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

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default ViviendaPlantaControl;
