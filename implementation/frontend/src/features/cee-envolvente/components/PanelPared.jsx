import { useState } from 'react';
import { api } from '../logic/apiEnvolvente';
import axios from 'axios';
import { TIPOS_PARED, nuevoUid, nombreHueco, SUFIJO_CAMBIA } from '../logic/usePlanoEnvolvente';
import { RUMBOS } from '../logic/geometriaPlano';
import { SEPARACION_PILARES_M, pilaresEstimados } from '../logic/pilaresFachada';
import { MARCOS, VIDRIOS, carpinteriaDe, desdeLaFoto, rotuloMarco, rotuloVidrio }
    from '../logic/ventanasVivienda';
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

export function PanelPared({ plano, transmitancias, expedienteId,
                             carpinteriaDefecto }) {
    const { muros, sel, entrada, esMedianera, esParticion, esFuera, esDibujada,
            tipoDe, nombreDe, setSel, estadoDe,
            ponHuecos, cambiaHueco, duplicaHueco, quitaHueco, marcaComoParticion,
            marcaRevisada, siguientePorMirar, marcaCambia, marcaHuecoCambia,
            confirmaHueco, confirmaPared, muevePared, borraPared,
            apartaDeLaEnvolvente, reclasifica, renombra, ponU, orienta, ponPilares,
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
    const tipo = tipoDe(m);
    const estado = estadoDe(m);

    return (
        <Caja>
            {/* LA CABECERA de la pared: qué pared es, qué es, y en qué estado
                está. El tipo va en SU color —el mismo que en el plano—, y el
                estado en una chapa a la derecha: es lo que antes había que
                deducir leyendo tres cosas en gris. */}
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
                {!fuera && <ChapaTipo tipo={esMedianera(m) && m.como_particion ? 'PARTICION_VERTICAL' : tipo} />}
                {!fuera && <ChapaEstado estado={estado} />}
            </div>
            <div className="-mt-1 flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-white/55">
                {/* El rumbo EFECTIVO, no el de la geometría: si lo ha dicho
                    el certificador, es el que se va a escribir. */}
                <span>
                    <span className={m.orientacion_manual ? 'font-bold text-brand' : 'font-bold text-white/75'}>
                        {rumboDe(m) || '—'}
                    </span>
                    {' · '}{fmt(m.largo)} m · {fmt(m.superficie)} m²
                </span>
                {(m.huecos || []).length > 0 && (
                    <span className="text-white/40">
                        · {(m.huecos || []).length === 1 ? '1 hueco' : `${(m.huecos || []).length} huecos`}
                        {m2Hueco(m.huecos) ? ` (${m2Hueco(m.huecos)})` : ''}
                    </span>
                )}
                {/* Una pared que ha puesto o corregido una PERSONA no puede
                    parecer una medida de Catastro: de ella sale una superficie
                    que va al certificado. */}
                {(esDibujada(m) || m.movida) && (
                    <Marca dibujada={esDibujada(m)} antes={m.largo_catastro}
                           onDeshacer={esDibujada(m) ? () => borraPared(m.id)
                                                     : () => muevePared(m.id, null)} />
                )}
            </div>

            {/* Lo que se va a ESCRIBIR de esta pared, cuando no es su nombre a
                secas: con «- CAMBIA» detrás se ve aquí antes que en CE3X. */}
            {!fuera && m.cambia && (
                <p className="-mt-1 text-[10.5px] text-amber-300/80">
                    Se escribe en el <code>.cex</code> como{' '}
                    <b className="font-black">{nombreDe(m)} … {SUFIJO_CAMBIA.trim()}</b>
                </p>
            )}

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

            {/* ¿Se REFORMA esta pared? Va junto a su U porque es de lo mismo —el
                aislamiento— y porque es lo que hay que decidir mirándola. Al
                .cex solo llega como sufijo en el nombre: la medida la monta el
                certificador en CE3X, y el nombre es lo que le dice dónde. */}
            {!fuera && !esMedianera(m) && (
                <Actuacion cambia={!!m.cambia} onCambio={si => marcaCambia(m.id, si)} />
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

                    <Pilares m={m} onCambio={n => ponPilares(m.id, n)} />

                    <div className="flex flex-col gap-1.5">
                        {(m.huecos || []).map((h, i) => (
                            <Hueco key={h.uid || i} h={h} defecto={carpinteriaDefecto}
                                   expedienteId={expedienteId} paredId={m.id}
                                   cerramiento={nombreDe(m)} muro={m} nombreDe={nombreDe}
                                   onLeido={l => setPropuesta({ ambito: 'hueco', l, hueco: h })}
                                   onCambio={(c, v) => cambiaHueco(m.id, i, c, v)}
                                   onCambia={si => marcaHuecoCambia(m.id, i, si)}
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
                                className="self-start rounded-md border border-white/15 px-2.5 py-1.5
                                           text-[11px] font-bold text-white/70
                                           hover:border-emerald-400/50 hover:text-emerald-300">
                            ✓ Dar por buenas todas las medidas
                        </button>
                    )}
                </>
            )}

            {/* DAR POR REVISADA, en grande y al final de lo que se decide de la
                pared: es lo último que se hace con ella. La casilla de arriba
                dice el ESTADO de un vistazo; esto es la ACCIÓN, y lleva pegada
                la siguiente pared por mirar — marcar una y tener que ir a
                buscar la siguiente con el ratón es lo que hace que se deje de
                marcar. */}
            {!fuera && (
                <RevisarPared revisada={!!m.revisada}
                              siguiente={siguientePorMirar(m.id)}
                              nombreDe={id => (muros[id] ? nombreDe(muros[id]) : id)}
                              onMarcar={si => marcaRevisada(m.id, si)}
                              onIr={id => setSel(id)} />
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
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/55">
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
                <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/55">
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
                             tracking-[0.08em] text-white/55">Su U</span>
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
                             tracking-[0.08em] text-white/55">{etiqueta}</span>
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

/**
 * Cuántos pilares tiene esta fachada por dentro.
 *
 * POR QUÉ SE PREGUNTA: es el único puente térmico de los ocho de CE3X cuyo
 * número no está en ninguna parte — no lo dice Catastro, no se ve en el plano y
 * una foto de la calle no los cuenta. Lo sabe quien ha estado delante.
 *
 * REGLA — se PROPONE uno cada 3,5 m y sale dicho que es una estimación. Dejarlo
 * en blanco sería quitar un puente que llevan 32 de los 50 .cex del corpus;
 * darlo por contado sería afirmar algo que nadie ha mirado.
 */
function Pilares({ m, onCambio }) {
    const contados = Number.isFinite(m.pilares);
    const n = contados ? m.pilares : pilaresEstimados(m.largo);
    return (
        <div className="flex flex-col gap-1">
            <Contador etiqueta="Pilares" n={n} onCambio={onCambio}
                      nota={contados ? null : 'estimado'} />
            <p className="pl-[78px] text-[10.5px] leading-snug text-white/40"
               title={`Pilares integrados en la fachada (puente térmico). Sin contar se estima uno cada ${fmt(SEPARACION_PILARES_M)} m; a 0 no se escribe el puente.`}>
                {contados
                    ? <>Contados por ti · <button onClick={() => onCambio(null)}
                            className="text-white/50 underline hover:text-white/80">
                            volver a la estimación ({pilaresEstimados(m.largo)})
                        </button></>
                    : <>Estimados, uno cada {fmt(SEPARACION_PILARES_M)} m · cuéntalos si los ves</>}
            </p>
        </div>
    );
}

/** Los m² de hueco de una pared: la suma de sus ventanas y sus puertas. */
function m2Hueco(huecos) {
    const total = (huecos || []).reduce(
        (s, h) => s + (Number(h.ancho) || 0) * (Number(h.alto) || 0), 0);
    return total ? `${fmt(total)} m² de hueco` : null;
}

function Hueco({ h, onCambio, onCambia, onDuplica, onQuita, onConfirma, defecto,
                expedienteId, paredId, cerramiento, muro, nombreDe, onLeido }) {
    const [verFoto, setVerFoto] = useState(false);
    //: El editor de la carpintería, detrás del lápiz. Cerrado se lee en una
    //: línea; abierto son tres controles. En una fachada con seis ventanas,
    //: seis editores abiertos son un muro que esconde las medidas.
    const [editar, setEditar] = useState(false);
    const borde = { medido: 'border-l-emerald-400', dudoso: 'border-l-amber-400' }[h.estado]
        || 'border-l-white/25';
    const tono = { medido: 'text-emerald-400', dudoso: 'text-amber-400' }[h.estado]
        || 'text-white/40';
    return (
        <div className={`flex flex-col gap-1.5 rounded-lg border border-white/[0.07]
                         border-l-[3px] ${borde} bg-white/[0.02] px-2.5 py-2
                         ${h.cambia ? 'ring-1 ring-amber-400/35' : ''}`}>
            {/* `flex-wrap` y el grupo de iconos con `shrink-0`: con la fila
                rígida, el nombre no encogía y la ✕ se salía por fuera del borde
                de la tarjeta. Ahora, si no cabe, los iconos bajan a su renglón
                en vez de desbordar. */}
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={`text-[11px] font-bold uppercase tracking-[0.06em] ${tono}`}>
                    {h.tipo}
                </span>
                <input
                    value={h.nombre || ''}
                    onChange={e => onCambio('nombre', e.target.value)}
                    title="El nombre que verás en CE3X"
                    aria-label="nombre del hueco"
                    className="w-[58px] min-w-0 rounded-md border border-white/10 bg-white/[0.04]
                               px-1.5 py-1 text-[12.5px] font-bold tabular-nums" />
                {/* ¿Se CAMBIA en la reforma? Es una chapa que se enciende, y
                    en cuanto se enciende el nombre pasa a «V1 - CAMBIA»: se
                    lee aquí debajo antes que en CE3X. */}
                <button onClick={() => onCambia?.(!h.cambia)}
                        aria-pressed={!!h.cambia}
                        title={h.cambia
                            ? `Se reforma: se escribe «${nombreHueco(h)}». Pulsa para quitarlo`
                            : 'Marcar que este hueco se cambia en la reforma'}
                        className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-black
                                    uppercase tracking-wider transition
                            ${h.cambia
                                ? 'border-amber-400/60 bg-amber-400/15 text-amber-300'
                                : 'border-white/10 text-white/30 hover:border-white/25 hover:text-white/60'}`}>
                    {h.cambia ? '✓ cambia' : 'cambia'}
                </button>
                {/* El LÁPIZ: abre el marco, el vidrio y la persiana de ESTE
                    hueco. Va como icono y no como texto porque en la fila no
                    cabe más, y se enciende cuando el hueco tiene lo suyo. */}
                <span className="ml-auto flex shrink-0 items-center gap-0.5">
                <IconoBoton activo={editar || carpinteriaDe(h, defecto).propia}
                            onClick={() => setEditar(v => !v)}
                            pressed={editar}
                            etiqueta="editar la carpintería de este hueco"
                            title={editar ? 'Cerrar' : 'Marco, vidrio y persiana de este hueco'}>
                    ✎
                </IconoBoton>
                {/* Su FOTO. Va plegada tras un icono y no abierta: en una fachada
                    con seis ventanas, seis bloques de fotos abiertos son un muro
                    y esconden justo las medidas, que es a lo que se entra. El
                    icono se enciende cuando el hueco ya tiene la suya. */}
                {expedienteId && h.uid && (
                    <IconoBoton activo={verFoto || !!h.lectura}
                                onClick={() => setVerFoto(v => !v)}
                                pressed={verFoto}
                                etiqueta="foto de este hueco"
                                title={verFoto ? 'Cerrar' : 'La foto de este hueco'}>
                        {/* Una CÁMARA dibujada, no el emoji 📷: en el Chrome del
                            certificador salía como un rectángulo vacío — una
                            tecla que no se sabe qué hace. */}
                        <svg viewBox="0 0 16 16" width="13" height="13" fill="none"
                             stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
                            <path d="M1.8 5.2h2.6l1-1.6h5.2l1 1.6h2.6v7.4H1.8z"
                                  strokeLinejoin="round" />
                            <circle cx="8" cy="8.9" r="2.3" />
                        </svg>
                    </IconoBoton>
                )}
                {/* Duplicar, al lado de la medida que se acaba de teclear: tres
                    ventanas iguales es el caso normal. */}
                <IconoBoton onClick={onDuplica} etiqueta="duplicar este hueco"
                            title="Otra igual, con estas medidas">⧉</IconoBoton>
                <IconoBoton onClick={onQuita} etiqueta="quitar este hueco" peligro
                            title="Quitar este hueco">✕</IconoBoton>
                </span>
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
            {h.cambia && (
                <span className="text-[10.5px] leading-snug text-amber-300/80">
                    Se escribe como <b className="font-black">{nombreHueco(h)}</b>
                </span>
            )}

            {/* Su carpintería: la de la vivienda salvo que este hueco diga otra
                cosa. Va PLEGADA en una línea porque lo normal es que herede —en
                una fachada con seis ventanas, seis formularios abiertos son un
                muro y esconden las medidas, que es a lo que se entra. El lápiz
                de arriba la abre. */}
            <Carpinteria h={h} defecto={defecto} onCambio={onCambio}
                         abierto={editar} onAbrir={setEditar} />

            {/* Lo que su foto dijo de él, en una línea: la apertura y el estado
                no tienen casilla en el .cex y se siguen tecleando en CE3X. El
                marco, el vidrio y la persiana SÍ se escriben, y por eso están
                arriba, donde se pueden cambiar. */}
            {h.lectura && (
                <span className="text-[10.5px] leading-snug text-brand/75">
                    {[h.lectura.apertura,
                      h.lectura.hojas && `${h.lectura.hojas} hojas`,
                      h.lectura.reja === true && 'con reja',
                      h.lectura.estado,
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
 * El marco, el vidrio y la persiana de UN hueco.
 *
 * POR QUÉ EXISTE: la carpintería se contesta una vez para toda la vivienda, que
 * es como son las viviendas — pero no siempre. La cocina que ya se cambió, el
 * baño que sigue con vidrio simple: si eso no se pudiera declarar, o se
 * escribiría mal el hueco o se escribiría mal toda la casa.
 *
 * REGLA — lo que no declara nada HEREDA, no copia. Al cambiar la respuesta de la
 * vivienda cambian con ella todos los huecos que no hayan dicho lo contrario;
 * si aquí se guardara una copia, cambiar la vivienda no movería ninguno.
 */
function Carpinteria({ h, defecto, onCambio, abierto, onAbrir }) {
    const esPuerta = h.tipo === 'puerta';
    const { vidrio: v, marco, persiana, propia: propio } = carpinteriaDe(h, defecto);
    const setAbierto = f => onAbrir?.(typeof f === 'function' ? f(abierto) : f);

    // Lo que dice su FOTO, cuando no es lo que se va a escribir. No se aplica
    // solo: la carpintería la decide quien mira, y una foto no siempre deja ver
    // si el perfil lleva rotura. Pero tampoco puede perderse — es justo el dato
    // que antes se leía y se tiraba.
    const foto = desdeLaFoto(h.lectura);
    const discrepa = Object.entries(foto).filter(([k, x]) =>
        x !== undefined && x !== ({ vidrio: v, marco, persiana })[k]);

    return (
        <div className="flex flex-col gap-1">
            <button onClick={() => setAbierto(a => !a)}
                    className={`text-left text-[10.5px] leading-snug
                        ${propio ? 'text-brand/85' : 'text-white/35'} hover:text-white/70`}>
                {abierto ? '▾ ' : '▸ '}
                {esPuerta
                    ? <>Puerta · marco de madera al 90 % · {persiana ? 'con' : 'sin'} persiana</>
                    : <>{rotuloVidrio(v)} · {rotuloMarco(marco)} · {persiana ? 'con' : 'sin'} persiana</>}
                {propio ? ' · solo esta' : ''}
            </button>
            {abierto && (
                <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
                    {/* Una PUERTA no elige vidrio ni marco: el motor la escribe
                        con su 90 % de marco de madera, que es lo que hace
                        puerta a una puerta. Lo único que se decide es la
                        persiana, que por defecto no lleva. */}
                    {!esPuerta && (
                        <>
                            <Desplegable valor={v} opciones={VIDRIOS}
                                         etiqueta="vidrio de este hueco"
                                         onCambio={x => onCambio('vidrio', x)} />
                            <Desplegable valor={marco} opciones={MARCOS}
                                         etiqueta="marco de este hueco"
                                         onCambio={x => onCambio('marco', x)} />
                        </>
                    )}
                    <button onClick={() => onCambio('persiana', !persiana)}
                            className={`rounded-md border px-2 py-1 text-[10.5px] font-bold
                                ${persiana ? 'border-brand/60 bg-brand/10 text-brand'
                                           : 'border-white/12 text-white/45'}`}>
                        {persiana ? '✓ persiana' : 'sin persiana'}
                    </button>
                    {propio && (
                        <button onClick={() => { onCambio('vidrio', undefined);
                                                 onCambio('marco', undefined);
                                                 onCambio('persiana', undefined); }}
                                className="text-[10px] text-white/35 hover:text-white/70">
                            como el resto de la vivienda
                        </button>
                    )}
                </div>
            )}
            {abierto && !!discrepa.length && (
                <button onClick={() => discrepa.forEach(([k, x]) => onCambio(k, x))}
                        className="text-left text-[10px] leading-snug text-brand/75
                                   hover:text-brand">
                    Su foto dice {discrepa.map(([k, x]) => (
                        k === 'persiana' ? (x ? 'con persiana' : 'sin persiana')
                        : k === 'vidrio' ? rotuloVidrio(x) : rotuloMarco(x)
                    )).join(' · ')} · usarlo
                </button>
            )}
        </div>
    );
}

/**
 * Un icono de la fila del hueco: cuadrado, de 24 px, y con su `title`.
 *
 * Son cuatro en una fila estrecha, así que tienen que medir lo mismo y
 * alinearse; sueltos con `px-1` y tamaños distintos, la fila bailaba y el
 * último se salía de la tarjeta. 24 px no es el objetivo táctil de un móvil,
 * pero esta pantalla es de escritorio (`internalOnly`) y con más no caben.
 */
function IconoBoton({ onClick, title, etiqueta, activo, pressed, peligro, children }) {
    return (
        <button onClick={onClick} title={title} aria-label={etiqueta}
                {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[13px]
                            leading-none transition
                    ${activo ? 'text-brand' : 'text-white/35'}
                    ${peligro ? 'hover:bg-red-500/15 hover:text-red-400'
                              : 'hover:bg-white/[0.07] hover:text-brand'}`}>
            {children}
        </button>
    );
}

function Desplegable({ valor, opciones, etiqueta, onCambio }) {
    return (
        <select value={valor} aria-label={etiqueta}
                onChange={e => onCambio(e.target.value)}
                className="no-uppercase rounded-md border border-white/12 bg-white/[0.04]
                           px-1.5 py-1 text-[11px] font-bold">
            {opciones.map(o => (
                <option key={o.id} value={o.id} className="bg-bkg-surface">{o.rotulo}</option>
            ))}
        </select>
    );
}

/**
 * La ACCIÓN de dar la pared por revisada, y la siguiente que queda por mirar.
 *
 * La casilla de la cabecera dice el estado; esto es lo que se pulsa al
 * terminar con la pared. Va al final de lo que se decide de ella —tipo, U,
 * huecos— porque es lo último que se hace, y en GRANDE: una casilla de 10 px
 * arriba a la derecha es lo que hacía que nadie la marcara. Con la siguiente
 * pegada, revisar catorce paredes son catorce clics y ninguna búsqueda con el
 * ratón.
 */
function RevisarPared({ revisada, siguiente, nombreDe, onMarcar, onIr }) {
    if (revisada) {
        return (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border
                            border-emerald-400/30 bg-emerald-400/[0.06] px-2.5 py-2">
                <span className="text-[11.5px] font-bold text-emerald-300">✓ Pared revisada</span>
                {siguiente && (
                    <button onClick={() => onIr(siguiente)}
                            className="rounded-md border border-white/15 px-2 py-1 text-[11px]
                                       font-bold text-white/70 hover:border-brand/50 hover:text-brand">
                        Siguiente por mirar: {nombreDe(siguiente)} →
                    </button>
                )}
                <button onClick={() => onMarcar(false)}
                        className="ml-auto text-[10.5px] text-white/35 hover:text-white/70">
                    desmarcar
                </button>
            </div>
        );
    }
    return (
        <div className="flex flex-col gap-1">
            <button onClick={() => { onMarcar(true); if (siguiente) onIr(siguiente); }}
                    className="w-full rounded-lg border border-emerald-400/50 bg-emerald-400/15
                               px-3 py-2.5 text-[12px] font-black text-emerald-200
                               hover:bg-emerald-400/25">
                ✓ Dar esta pared por revisada
                {siguiente ? ` y pasar a ${nombreDe(siguiente)} →` : ''}
            </button>
            {siguiente && (
                <button onClick={() => onMarcar(true)}
                        className="self-end text-[10.5px] text-white/35 hover:text-white/70">
                    solo marcarla, sin cambiar de pared
                </button>
            )}
        </div>
    );
}

/**
 * ¿Se REFORMA esta pared (se mejora su aislamiento)?
 *
 * Dos opciones y ninguna cifra: al .cex va SOLO como sufijo en el nombre
 * («FBE1 CALLE - CAMBIA»), que es lo que le dice al certificador en el árbol
 * de CE3X sobre qué cerramientos montar la medida de mejora. La U de la pared
 * sigue siendo la de hoy —es el estado inicial del edificio— y la medida la
 * escribe él.
 */
function Actuacion({ cambia, onCambio }) {
    return (
        <div className="flex flex-col gap-1.5">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-white/55">
                En la reforma
            </span>
            <div className="flex gap-1.5">
                <Opcion activa={!cambia} onClick={() => onCambio(false)}
                        title="Esta pared se queda como está">
                    Se conserva
                </Opcion>
                <Opcion activa={cambia} onClick={() => onCambio(true)}
                        title="Se mejora su aislamiento: en CE3X sale con «- CAMBIA» detrás">
                    Se aísla → CAMBIA
                </Opcion>
            </div>
        </div>
    );
}

//: El tipo de pared, en SU color: el mismo que la pinta en el plano, para que
//: el panel y el dibujo se lean con el mismo código. Las clases son las que
//: `index.css` remapea en tema claro (`text-brand`, `text-sky-*`).
const CHAPA_TIPO = {
    FACHADA: 'border-brand/50 bg-brand/10 text-brand',
    MEDIANERA: 'border-sky-400/50 bg-sky-400/10 text-sky-300',
    PARTICION_VERTICAL: 'border-pink-400/50 bg-pink-400/10 text-pink-300',
};

function ChapaTipo({ tipo }) {
    const t = TIPOS_PARED.find(x => x.id === tipo);
    return (
        <span className={`rounded-md border px-1.5 py-0.5 text-[9.5px] font-black uppercase
                          tracking-wider ${CHAPA_TIPO[tipo] || 'border-white/15 text-white/50'}`}
              title={t?.ayuda}>
            {t?.etiqueta || tipo}
        </span>
    );
}

//: En qué estado está la pared: lo mismo que dice su color de TRAZO en el
//: plano, con palabras. Va a la derecha de la cabecera porque es lo primero
//: que se comprueba al pulsarla — ¿me queda algo aquí?
const CHAPA_ESTADO = {
    falta: ['Por mirar', 'border-white/20 bg-white/[0.04] text-white/60'],
    dudoso: ['Por confirmar', 'border-amber-400/50 bg-amber-400/10 text-amber-300'],
    medido: ['✓ Revisada', 'border-emerald-400/50 bg-emerald-400/10 text-emerald-300'],
    fuera: ['Apartada', 'border-white/15 text-white/40'],
};

function ChapaEstado({ estado }) {
    const [texto, cls] = CHAPA_ESTADO[estado] || CHAPA_ESTADO.falta;
    return (
        <span className={`ml-auto rounded-md border px-1.5 py-0.5 text-[9.5px] font-black
                          uppercase tracking-wider ${cls}`}>
            {texto}
        </span>
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
                             : 'border-white/10 text-white/65 hover:border-white/30 hover:text-white/90'}`}>
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
