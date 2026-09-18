import { useState } from 'react';
import { api } from '../logic/apiEnvolvente';
import axios from 'axios';
import { TIPOS_PARED, nuevoUid } from '../logic/usePlanoEnvolvente';
import { RUMBOS } from '../logic/geometriaPlano';
import { FotosCerramiento } from './FotosCerramiento';
import { LecturaFotoModal } from './LecturaFotoModal';

// ─────────────────────────────────────────────────────────────────────────────
// El panel de la pared seleccionada: cuántas ventanas, cuántas puertas, y qué
// mide cada una.
//
// El NOMBRE del hueco es editable porque es el que CE3X enseña en el árbol y
// el que usa el puente térmico para decir de qué hueco es. Tiene que ser único
// en todo el edificio.
// ─────────────────────────────────────────────────────────────────────────────

export function PanelPared({ plano, transmitancias, expedienteId }) {
    const { muros, sel, entrada, esMedianera, esParticion, esFuera, esDibujada,
            tipoDe, nombreDe,
            ponHuecos, cambiaHueco, duplicaHueco, quitaHueco, marcaComoParticion,
            marcaRevisada,
            confirmaHueco, confirmaPared, muevePared, borraPared,
            apartaDeLaEnvolvente, reclasifica, renombra, ponU, orienta,
            rumboDe, necesitaRumbo, rumbosDe,
            aplicaHuecosLeidos, anotaLecturaHueco } = plano;
    const m = sel ? muros[sel] : null;

    //: Lo leído de una foto, esperando a que lo revise una persona. Vive aquí y
    //: no dentro de `FotosCerramiento` porque lo que se aplica lo escribe el
    //: PLANO, y el popup tiene que saber qué huecos tiene ya la pared para no
    //: proponer duplicarla.
    const [propuesta, setPropuesta] = useState(null);

    /**
     * Aplica lo leído Y deja SEÑALADO en la foto dónde cae cada hueco.
     *
     * El modelo ya ha mirado dónde está cada ventana (`box`), así que atarlas a
     * mano después sería repetir un trabajo hecho. Se fija el `uid` ANTES de
     * crearlas —si naciera dentro del hook no habría forma de saber cuál le tocó
     * a cada caja— y las marcas se escriben en la foto, no en el plano.
     *
     * Un fallo al guardar las marcas NO deshace los huecos: lo que se ha pedido
     * es meterlos en la pared; la marca es la comodidad de encima.
     */
    async function aplicarLeidos(leidos, { reemplaza = false } = {}) {
        const conUid = leidos.map(l => ({ ...l, uid: l.uid || nuevoUid() }));
        aplicaHuecosLeidos(m.id, conUid, { de: `la foto de ${nombreDe(m)}`, reemplaza });

        const driveId = propuesta?.driveId;
        const marcas = conUid.filter(l => l.box).map(l => ({ uid: l.uid, box: l.box, de: 'lectura' }));
        if (driveId && marcas.length && expedienteId) {
            try {
                await axios.put(api(expedienteId, 'fotos/marcas'), {
                    clave: m.id, drive_id: driveId, marcas,
                    // FUNDIR: esta lectura solo sabe de los huecos que acaba de
                    // proponer. Las marcas que el certificador puso a mano en
                    // otros huecos de la misma foto se conservan.
                    fundir: true,
                });
            } catch { /* la marca es la comodidad; los huecos ya están puestos */ }
        }
        setPropuesta(null);
    }

    if (!m) {
        return (
            <Caja>
                <p className="text-sm text-white/45">
                    Pulsa una pared del plano para ponerle sus ventanas y puertas.
                </p>
            </Caja>
        );
    }

    const ventanas = (m.huecos || []).filter(h => h.tipo === 'ventana');
    const puertas = (m.huecos || []).filter(h => h.tipo === 'puerta');
    const fuera = esFuera(m);

    return (
        <Caja>
            <div className="flex flex-wrap items-center gap-2">
                {/* El nombre es EDITABLE: es el que se ve en CE3X y el que
                    enlaza sus puentes térmicos. Cambia solo al reclasificar
                    (FBE1 → PBE1) y se puede retocar. */}
                <input
                    value={m.nombre_manual ?? m.id}
                    onChange={e => renombra(m.id, e.target.value)}
                    title="El nombre que verás en CE3X"
                    aria-label="nombre de la pared"
                    maxLength={40}
                    /* Crece con lo escrito. Fijo en 78px cabían 7 caracteres, y
                       `FBX1 GARAJE ABIERTO` —que es lo que el motor mismo
                       escribe en otras paredes— se veía cortado a la mitad
                       mientras se teclea, que es justo cuando hay que leerlo. */
                    style={{ width: `calc(${Math.max(6, (m.nombre_manual ?? m.id).length)}ch + 1.6rem)` }}
                    className={`max-w-full rounded-md border px-2 py-1.5 text-[13px] font-black
                                uppercase tabular-nums
                        ${m.id === entrada
                            ? 'border-brand bg-brand text-black'
                            : 'border-white/10 bg-white/[0.04]'}`} />
                {m.id === entrada && (
                    <span className="text-[11px] font-bold text-brand">◆ entrada</span>
                )}
                {nombreDe(m) !== m.id && (
                    <button onClick={() => renombra(m.id, null)}
                            title={`Catastro lo llama ${m.id}`}
                            className="text-[10px] text-white/35 hover:text-white/70">
                        ({m.id})
                    </button>
                )}
                <span className="text-[12px] tabular-nums text-white/40">
                    {/* El rumbo EFECTIVO, no el de la geometría: si lo ha dicho
                        el certificador, es el que se va a escribir. */}
                    <span className={m.orientacion_manual ? 'text-brand' : undefined}>
                        {rumboDe(m) || '—'}
                    </span>
                    {' · '}{fmt(m.largo)} m · {fmt(m.superficie)} m²
                </span>
                {/* Una pared que ha puesto o corregido una PERSONA no puede
                    parecer una medida de Catastro: de ella sale una superficie
                    que va al certificado. */}
                {(esDibujada(m) || m.movida) && (
                    <Marca dibujada={esDibujada(m)} antes={m.largo_catastro}
                           onDeshacer={esDibujada(m) ? () => borraPared(m.id)
                                                     : () => muevePared(m.id, null)} />
                )}
                {/* Dar la pared por mirada. Va JUNTO AL NOMBRE porque es lo
                    último que se hace con ella y porque el contador que vacía
                    —«quedan N paredes por mirar»— está arriba, no al final del
                    panel. */}
                {!fuera && (
                    <Revisada si={!!m.revisada}
                              onCambio={() => marcaRevisada(m.id, !m.revisada)} />
                )}
            </div>

            {fuera ? (
                <Apartada propia={!!m.excluida}
                          huecos={(m.huecos || []).length}
                          onVolver={() => apartaDeLaEnvolvente(m.id, false)} />
            ) : (
                <Tipo m={m} tipo={tipoDe(m)} esEntrada={m.id === entrada}
                      huecos={(m.huecos || []).length}
                      falta={necesitaRumbo(m)} rumbo={rumboDe(m)} rumbos={rumbosDe(m)}
                      onRumbo={r => orienta(m.id, r)}
                      onCambio={t => reclasifica(m.id, t)}
                      onApartar={() => apartaDeLaEnvolvente(m.id, true)} />
            )}

            {!fuera && !esMedianera(m) && (
                <UDeLaPared m={m} deLaEpoca={uDelTipo(transmitancias, tipoDe(m))}
                            onCambio={u => ponU(m.id, u)} />
            )}

            {fuera ? null : esMedianera(m) || esParticion(m) ? (
                <SinHuecos particion={esParticion(m) || !!m.como_particion}
                           onCambio={si => marcaComoParticion(m.id, si)}
                           esMedianera={esMedianera(m)} m={m} />
            ) : (
                <>
                    {/* Los m² de hueco de ESTA pared van junto al contador: es
                        lo que mira el certificador para saber si lo que acaba de
                        poner se parece a lo que tiene delante. */}
                    <Contador etiqueta="Ventanas" n={ventanas.length}
                              onCambio={n => ponHuecos(m.id, 'ventana', n)}
                              nota={m2Hueco(m.huecos)} />
                    <Contador etiqueta="Puertas" n={puertas.length}
                              onCambio={n => ponHuecos(m.id, 'puerta', n)} />

                    <div className="flex flex-col gap-1.5">
                        {(m.huecos || []).map((h, i) => (
                            <Hueco key={h.uid || i} h={h}
                                   expedienteId={expedienteId} paredId={m.id}
                                   cerramiento={nombreDe(m)} muro={m} nombreDe={nombreDe}
                                   onLeido={l => setPropuesta({ ambito: 'hueco', l, hueco: h })}
                                   onCambio={(c, v) => cambiaHueco(m.id, i, c, v)}
                                   onDuplica={() => duplicaHueco(m.id, i)}
                                   onConfirma={() => confirmaHueco(m.id, i)}
                                   onQuita={() => quitaHueco(m.id, i)} />
                        ))}
                    </div>

                    {/* Y todas de una vez: se miran juntas —son las de la misma
                        pared, que se ha mirado de una sentada— y confirmarlas
                        una a una es el trabajo que hace que no se confirme
                        ninguna. */}
                    {(m.huecos || []).some(h => h.estado !== 'medido') && (
                        <button onClick={() => confirmaPared(m.id)}
                                className="rounded-lg border border-emerald-400/40 px-3 py-2
                                           text-[11px] font-bold text-emerald-300
                                           hover:bg-emerald-400/10">
                            ✓ Dar por buenas las medidas de esta pared
                        </button>
                    )}
                </>
            )}

            {/* La foto de la pared sale TAMBIÉN en medianeras y particiones, y
                ahí es donde más vale: es la prueba de que al otro lado hay de
                verdad un edificio y no un solar. Solo se calla en una pared
                apartada de la envolvente, que ya no describe nada de la obra. */}
            {!fuera && expedienteId && (
                <FotosCerramiento
                    expedienteId={expedienteId} clave={m.id}
                    titulo={`Foto de ${nombreDe(m)}`}
                    ambito="pared"
                    contexto={{ nombre: nombreDe(m), orientacion: m.orientacion,
                                largo: m.largo, alto: m.alto, tipo: tipoDe(m) }}
                    muro={m} nombreDe={nombreDe}
                    onLeido={(l, driveId) => setPropuesta({ ambito: 'pared', l, driveId })} />
            )}

            {propuesta && (
                <LecturaFotoModal
                    lectura={propuesta.l}
                    pared={m}
                    hueco={propuesta.hueco}
                    onCerrar={() => setPropuesta(null)}
                    onAplicar={(x) => {
                        if (propuesta.ambito === 'hueco') {
                            anotaLecturaHueco(m.id, propuesta.hueco?.uid, x);
                            setPropuesta(null);
                        } else {
                            aplicarLeidos(x);
                        }
                    }}
                    onReemplazar={(x) => aplicarLeidos(x, { reemplaza: true })} />
            )}
        </Caja>
    );
}

//: Las tres cosas que puede ser una pared salen de `usePlanoEnvolvente`: las
//: leen también el globo y la leyenda del plano, y tres copias acabarían
//: llamando a lo mismo de tres maneras en la misma pantalla.

/**
 * Qué es esta pared. Va ARRIBA del todo porque decide lo demás: una medianera
 * no lleva huecos, y una partición los lleva contra un espacio no habitable.
 *
 * Catastro lo deduce de la geometría —hay edificio pegado, o no— y se equivoca:
 * un cobertizo sin dar de alta convierte una medianera en fachada. Con "ver el
 * entorno" el certificador lo comprueba, y aquí lo corrige.
 */
function Tipo({ m, tipo, onCambio, onApartar, esEntrada, huecos,
               falta, rumbo, rumbos, onRumbo }) {
    const cambiado = !!m.tipo_manual && m.tipo_manual !== m.tipo;
    // Un hueco solo cabe en un cerramiento al exterior: el motor RECHAZA el
    // .cex si no. Se dice aquí, al hacerlo, y no al pulsar Generar — que es
    // cuando se descubría, con las ventanas ya puestas una a una.
    const chocaConHuecos = tipo !== 'FACHADA' && huecos > 0;
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/40">
                    Da contra
                </span>
                {cambiado && (
                    <button onClick={() => onCambio(null)}
                            className="text-[10px] text-brand hover:underline">
                        cambiado · volver a lo de Catastro
                    </button>
                )}
            </div>
            <div className="flex gap-1.5">
                {TIPOS_PARED.map(t => (
                    <Opcion key={t.id} activa={tipo === t.id} title={t.ayuda}
                            onClick={() => onCambio(t.id === m.tipo ? null : t.id)}>
                        {t.etiqueta}
                    </Opcion>
                ))}
            </div>

            {tipo === 'FACHADA' && (falta || !!m.orientacion_manual) && (
                <Rumbo falta={falta} rumbo={rumbo} rumbos={rumbos}
                       propio={!!m.orientacion_manual} onCambio={onRumbo} />
            )}

            {chocaConHuecos && (
                <Aviso>
                    Esta pared tiene <b>{huecos === 1 ? 'un hueco' : `${huecos} huecos`}</b> y
                    ya no da al exterior: un hueco solo va en un cerramiento exterior, así que
                    el <code>.cex</code> no se puede escribir así.{' '}
                    <button onClick={() => onCambio('FACHADA')} className="underline">
                        Volver a exterior
                    </button> o quítalos abajo.
                </Aviso>
            )}

            {esEntrada && tipo !== 'FACHADA' && (
                <Aviso>
                    Por aquí has dicho que <b>se entra a la casa</b>. Una puerta de entrada
                    da a la calle, así que esta pared debería ser exterior.
                </Aviso>
            )}

            {/* La cuarta respuesta, y no es un tipo: «da contra» dice QUÉ HAY al
                otro lado, y esto dice si la pared CUENTA. Va debajo y en
                pequeño porque es lo raro — pero tiene que estar a la vista: sin
                ella, los muros del garaje se escriben como fachada y la demanda
                del certificado sale inflada. */}
            {esEntrada ? (
                <p className="text-[10.5px] leading-relaxed text-white/30">
                    Por aquí se entra a la vivienda, así que forma parte de la envolvente.
                </p>
            ) : (
                <button
                    onClick={onApartar}
                    title="Catastro dibuja lo CONSTRUIDO: el garaje, el trastero o un porche
                           cerrado salen con sus muros medidos, y no son de la vivienda"
                    className="self-start text-[10.5px] text-white/35 underline
                               decoration-dotted underline-offset-2 hover:text-amber-300">
                    ⊘ No es de la vivienda — apartarla de la envolvente
                </button>
            )}
        </div>
    );
}

/**
 * Hacia dónde da esta fachada.
 *
 * Solo aparece cuando hace falta contestarlo: las fachadas que vienen de
 * Catastro ya traen su rumbo y ahí no hay nada que preguntar. Las que no lo
 * traen son las que el certificador ha PASADO a fachada —una partición
 * vertical y una pared dibujada nacen sin él, porque no salen de ningún
 * polígono del que sacar la normal exterior— y sin rumbo el `.cex` no se puede
 * escribir: CE3X lo exige y de él cuelga la ganancia solar de sus huecos.
 *
 * REGLA — se ofrecen DOS, no ocho. Una pared mira perpendicular a sí misma, así
 * que las otras seis las descarta su propio trazo; enseñarlas sería invitar a
 * pulsar una que la geometría dice que no. Cuál de las dos es la buena no lo
 * puede deducir la app —una pared dibujada parte el edificio por la mitad y los
 * dos lados quedan dentro de la huella—, así que lo dice quien tiene el plano
 * y la brújula delante, y queda escrito que lo dijo.
 */
function Rumbo({ falta, rumbo, rumbos, propio, onCambio }) {
    const NOMBRE = { N: 'Norte', NE: 'Noreste', E: 'Este', SE: 'Sureste',
                     S: 'Sur', SO: 'Suroeste', O: 'Oeste', NO: 'Noroeste' };
    return (
        <div className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/40">
                    Hacia dónde da
                </span>
                {propio && (
                    <button onClick={() => onCambio(null)}
                            className="text-[10px] text-brand hover:underline">
                        lo has dicho tú · deshacer
                    </button>
                )}
            </div>
            <div className="flex flex-wrap gap-1.5">
                {(rumbos.length ? rumbos : RUMBOS).map(r => (
                    <Opcion key={r} activa={rumbo === r}
                            title={`La pared mira al ${NOMBRE[r]}`}
                            onClick={() => onCambio(rumbo === r ? null : r)}>
                        {NOMBRE[r]}
                    </Opcion>
                ))}
            </div>
            {falta && (
                <Aviso>
                    Esta pared no tiene orientación —la trae de Catastro solo lo que ya
                    era fachada— y una fachada sin rumbo <b>no se puede escribir</b>:
                    el <code>.cex</code> fallará al generarlo. Dice a cuál de los dos
                    lados da.
                </Aviso>
            )}
        </div>
    );
}

/**
 * Lo que se dice de una pared APARTADA.
 *
 * Catastro dibuja el perímetro de lo CONSTRUIDO, y ahí dentro hay cosas que no
 * son la vivienda: el garaje, un trastero, un porche cerrado. Sus muros vienen
 * medidos y clasificados como cualquier otro —los de fuera, además, como
 * FACHADA, porque geométricamente dan a la calle—, pero no son la envolvente
 * del espacio habitable: escribirlos infla la superficie de pérdidas y con ella
 * la demanda del certificado.
 *
 * Se dibuja igual en el plano, apagada: una pared que desaparece es una pared
 * que no se puede devolver.
 */
function Apartada({ propia, huecos, onVolver }) {
    return (
        <div className="flex flex-col gap-2 rounded-lg border border-white/10
                        bg-white/[0.02] px-2.5 py-2">
            <p className="text-[11.5px] leading-relaxed text-white/55">
                <b className="text-white/80">Apartada de la envolvente.</b> No se escribe en
                el <code>.cex</code>: su superficie no cuenta como pérdida.
                {huecos > 0 && (huecos === 1
                    ? <> Su <b>hueco</b> tampoco se manda, pero se queda guardado por si
                         vuelve.</>
                    : <> Sus <b>{huecos} huecos</b> tampoco se mandan, pero se quedan
                         guardados por si vuelve.</>)}
            </p>
            {propia
                ? <button onClick={onVolver}
                          className="self-start rounded-lg border border-white/15 px-2.5 py-1.5
                                     text-[11px] font-semibold text-white/70
                                     hover:border-brand/50 hover:text-brand">
                      Volver a tenerla en cuenta
                  </button>
                : <p className="text-[10.5px] text-white/35">
                      La ha dejado fuera el motor al medir, no tú.
                  </p>}
        </div>
    );
}

/** Lo que impide generar se dice DONDE se hace, no al final. */
function Aviso({ children }) {
    return (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-2.5 py-2
                      text-[11.5px] leading-relaxed text-amber-200/90">
            {children}
        </p>
    );
}

/**
 * La transmitancia de ESTA pared.
 *
 * Por defecto la de su época, la misma para todas. Pero una pared puede estar
 * aislada y las demás no —una fachada rehecha, un patio cerrado después— y
 * escribirlas todas iguales declara un edificio que no es. Lo que se ponga aquí
 * manda solo sobre esta, se marca, y sale en los avisos con la de la tabla al
 * lado.
 */
function UDeLaPared({ m, deLaEpoca, onCambio }) {
    const propia = Number.isFinite(m.u_manual);
    return (
        <div className="flex items-center gap-2">
            <span className="min-w-[66px] text-[10.5px] font-bold uppercase
                             tracking-[0.08em] text-white/40">Su U</span>
            <input
                type="number" step="0.01" min="0"
                value={propia ? m.u_manual : (deLaEpoca ?? '')}
                aria-label="transmitancia de esta pared"
                onChange={e => onCambio(e.target.value === '' ? null : Number(e.target.value))}
                className={`w-[70px] rounded-md border bg-white/[0.04] px-1.5 py-1
                            text-[12.5px] font-bold tabular-nums
                    ${propia ? 'border-brand/60 text-brand' : 'border-white/10'}`} />
            <span className="text-[10.5px] text-white/30">W/m²K</span>
            {propia
                ? <button onClick={() => onCambio(null)}
                          className="text-[10px] text-white/35 hover:text-white/70">
                      la de la época ({fmt(deLaEpoca)})
                  </button>
                : <span className="text-[10.5px] text-white/30">la de su época</span>}
        </div>
    );
}

/** La U que le toca a esta pared por su tipo, de la tabla de la época. */
function uDelTipo(termicas, tipo) {
    if (!termicas) return null;
    const bloque = tipo === 'PARTICION_VERTICAL' ? 'particion_vertical' : 'fachada';
    return termicas[bloque]?.u ?? null;
}

/** Una pared que no da al aire no lleva ventanas: lo que hay que decir de
 *  ella es si al otro lado se pierde calor o no. */
function SinHuecos({ particion, esMedianera, m, onCambio }) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-white/50">
                {particion
                    ? <>Da a un espacio <b>sin calefactar</b>, así que por ahí
                       <b> se pierde calor</b> y lleva su transmitancia. No lleva
                       ventanas.</>
                    : <>Da contra el edificio de al lado, a la misma temperatura:
                       es <b>adiabática</b> y no lleva huecos. Compruébalo con
                       <b> «ver el entorno»</b> — si al otro lado hay un garaje o
                       un local, no lo es.</>}
            </p>
            {esMedianera && (
                <div className="flex gap-2">
                    <Opcion activa={!m.como_particion} onClick={() => onCambio(false)}>
                        Al otro lado hay vivienda
                    </Opcion>
                    <Opcion activa={!!m.como_particion} onClick={() => onCambio(true)}>
                        Garaje o local
                    </Opcion>
                </div>
            )}
        </div>
    );
}

function Contador({ etiqueta, n, onCambio, nota }) {
    return (
        <div className="flex items-center gap-3">
            <span className="min-w-[66px] text-[10.5px] font-bold uppercase
                             tracking-[0.08em] text-white/40">{etiqueta}</span>
            <div className="flex items-center overflow-hidden rounded-lg border border-white/10">
                <button onClick={() => onCambio(Math.max(0, n - 1))}
                        className="bg-white/[0.04] px-3.5 py-2 text-[15px] font-bold
                                   hover:bg-brand hover:text-black">−</button>
                <span className="min-w-[32px] text-center text-sm font-bold tabular-nums">{n}</span>
                <button onClick={() => onCambio(n + 1)}
                        className="bg-white/[0.04] px-3.5 py-2 text-[15px] font-bold
                                   hover:bg-brand hover:text-black">+</button>
            </div>
            {nota && (
                <span className="ml-auto text-[10.5px] tabular-nums text-white/30">{nota}</span>
            )}
        </div>
    );
}

/** Los m² de hueco de una pared: la suma de sus ventanas y sus puertas. */
function m2Hueco(huecos) {
    const total = (huecos || []).reduce(
        (s, h) => s + (Number(h.ancho) || 0) * (Number(h.alto) || 0), 0);
    return total ? `${fmt(total)} m² de hueco` : null;
}

function Hueco({ h, onCambio, onDuplica, onQuita, onConfirma,
                expedienteId, paredId, cerramiento, muro, nombreDe, onLeido }) {
    const [verFoto, setVerFoto] = useState(false);
    const borde = { medido: 'border-l-emerald-400', dudoso: 'border-l-amber-400' }[h.estado]
        || 'border-l-white/25';
    const tono = { medido: 'text-emerald-400', dudoso: 'text-amber-400' }[h.estado]
        || 'text-white/40';
    return (
        <div className={`flex flex-col gap-1.5 rounded-lg border border-white/[0.07]
                         border-l-[3px] ${borde} bg-white/[0.02] px-2.5 py-2`}>
            <div className="flex items-center gap-2">
                <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${tono}`}>
                    {h.tipo}
                </span>
                <input
                    value={h.nombre || ''}
                    onChange={e => onCambio('nombre', e.target.value)}
                    title="El nombre que verás en CE3X"
                    aria-label="nombre del hueco"
                    className="w-[66px] rounded-md border border-white/10 bg-white/[0.04]
                               px-1.5 py-1 text-[12.5px] font-bold tabular-nums" />
                {/* Su FOTO. Va plegada tras un icono y no abierta: en una fachada
                    con seis ventanas, seis bloques de fotos abiertos son un muro
                    y esconden justo las medidas, que es a lo que se entra. El
                    icono se enciende cuando el hueco ya tiene la suya. */}
                {expedienteId && h.uid && (
                    <button onClick={() => setVerFoto(v => !v)}
                            title={verFoto ? 'Cerrar' : 'La foto de esta ventana'}
                            aria-label="foto de este hueco"
                            className={`ml-auto px-1 text-[13px] leading-none
                                ${verFoto || h.lectura ? 'text-brand' : 'text-white/30'}
                                hover:text-brand`}>
                        📷
                    </button>
                )}
                {/* Duplicar, al lado de la medida que se acaba de teclear: tres
                    ventanas iguales es el caso normal. */}
                <button onClick={onDuplica} title="Otra igual, con estas medidas"
                        aria-label="duplicar este hueco"
                        className={`${expedienteId && h.uid ? '' : 'ml-auto '}px-1 text-[13px]
                                   leading-none text-white/30 hover:text-brand`}>⧉</button>
                <button onClick={onQuita} aria-label="quitar este hueco"
                        className="px-1 text-[17px] leading-none text-white/30
                                   hover:text-red-400">×</button>
            </div>
            <div className="flex items-center gap-1.5">
                <Medida v={h.ancho} onCambio={v => onCambio('ancho', v)} />
                <span className="text-white/30">×</span>
                <Medida v={h.alto} onCambio={v => onCambio('alto', v)} />
                <span className="text-[11px] text-white/30">m</span>
                {/* El OK va JUNTO A LA MEDIDA, que es lo que se está mirando
                    cuando se decide. Hasta ahora la única forma de quitar una
                    ventana de la cuenta de «medida por confirmar» era teclear
                    encima el mismo número que ya ponía — y cuando la medida por
                    defecto es la buena, que en una ventana de 1,30 es lo
                    corriente, decir que sí tiene que costar un clic. */}
                {h.estado !== 'medido' && (
                    <button onClick={onConfirma}
                            title="Dar esta medida por buena"
                            className="ml-auto rounded-md border border-emerald-400/40
                                       px-2 py-1 text-[10.5px] font-black uppercase
                                       tracking-wider text-emerald-300
                                       hover:bg-emerald-400/15">
                        ✓ Ok
                    </button>
                )}
            </div>
            {h.por_que && (
                <span className="text-[10.5px] leading-snug text-white/35">{h.por_que}</span>
            )}

            {/* Lo que su foto dijo de él, en una línea. Es lo que hay que teclear
                en CE3X, así que tiene que verse sin abrir nada. */}
            {h.lectura && (
                <span className="text-[10.5px] leading-snug text-brand/75">
                    {[h.lectura.material_marco && `marco de ${h.lectura.material_marco}`,
                      h.lectura.acristalamiento && (h.lectura.acristalamiento === 'monolitico'
                          ? 'vidrio simple' : `vidrio ${h.lectura.acristalamiento}`),
                      h.lectura.apertura,
                      h.lectura.persiana === true && 'con persiana',
                     ].filter(Boolean).join(' · ') || 'leído de su foto'}
                </span>
            )}

            {verFoto && (
                <FotosCerramiento
                    expedienteId={expedienteId} clave={`${paredId}/${h.uid}`}
                    titulo={`Foto de ${h.nombre || 'este hueco'}`}
                    ambito="hueco" compacto
                    contexto={{ nombre: h.nombre, cerramiento }}
                    muro={muro} nombreDe={nombreDe} hueco={h}
                    onLeido={onLeido} />
            )}
        </div>
    );
}

/**
 * La casilla de «ya la he mirado».
 *
 * Es una CASILLA y no un botón de acción («Dar por revisada») por dos motivos:
 * se activa y se desactiva —decir que no la habías mirado tiene que costar lo
 * mismo que decir que sí— y así, de un vistazo, se ve en qué estado está sin
 * tener que leer nada. Dice lo que hace en su `title`, porque lo que cambia
 * —el contador de arriba— está en la otra punta de la pantalla.
 */
function Revisada({ si, onCambio }) {
    return (
        <button onClick={onCambio}
                aria-pressed={si}
                title={si
                    ? 'Revisada: no cuenta en «paredes por mirar». Pulsa para desmarcarla'
                    : 'Darla por revisada: sale de «paredes por mirar» aunque no lleve huecos'}
                className={`ml-auto shrink-0 rounded-md border px-2 py-1 text-[10.5px] font-bold
                            uppercase tracking-[0.04em] transition
                    ${si ? 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300'
                         : 'border-white/12 text-white/40 hover:border-white/25 hover:text-white/70'}`}>
                {si ? '✓ Revisada' : '☐ Revisada'}
        </button>
    );
}

/**
 * Que esta pared la ha puesto o corregido una PERSONA.
 *
 * No es un adorno: de aquí sale una superficie que va al certificado, y
 * mezclada con las de Catastro no habría forma de saber cuál es cuál al
 * revisarlo tres semanas después. El motor lo repite en los avisos del `.cex`,
 * que es donde lo lee quien firma.
 */
function Marca({ dibujada, antes, onDeshacer }) {
    return (
        <span className="flex items-center gap-1.5 rounded-md border border-amber-400/40
                         bg-amber-400/10 px-2 py-1 text-[10px] font-bold uppercase
                         tracking-wider text-amber-300">
            {dibujada ? '✎ dibujada' : '✎ movida'}
            {!dibujada && antes ? (
                <span className="font-normal normal-case tracking-normal text-amber-200/70">
                    Catastro: {fmt(antes)} m
                </span>
            ) : null}
            <button onClick={onDeshacer}
                    title={dibujada ? 'Borrar esta pared'
                                    : 'Devolverla a donde la puso Catastro'}
                    className="text-amber-200/60 hover:text-amber-100">✕</button>
        </span>
    );
}

function Medida({ v, onCambio }) {
    return (
        <input
            type="number" step="0.05" min="0.1" value={v}
            onChange={e => onCambio(Number(e.target.value))}
            className="w-[58px] rounded-md border border-white/10 bg-white/[0.03]
                       px-1.5 py-1 text-[12.5px] font-semibold tabular-nums" />
    );
}

function Opcion({ activa, onClick, children, title }) {
    return (
        <button onClick={onClick} title={title}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[11px] font-semibold
                    ${activa ? 'border-brand bg-brand/15 text-brand'
                             : 'border-white/10 text-white/50 hover:border-white/25'}`}>
            {children}
        </button>
    );
}

function Caja({ children }) {
    return (
        // `top` mide la cabecera MÁS la barra de apartados: con los 16 px de
        // antes, el panel se metía debajo de las pestañas al bajar por la
        // ficha y lo primero que tapaba era el nombre de la pared.
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06]
                        bg-white/[0.02] p-4 lg:sticky lg:top-[7.5rem]">
            {children}
        </div>
    );
}

const fmt = n => (Number(n) || 0).toFixed(2).replace('.', ',');

export default PanelPared;
