import { useState } from 'react';
import { areaPoligono } from '../logic/geometriaPlano';
import { estrecha, useAnchoTira } from '../logic/anchoTira';
import { Hueco } from './PanelPared';
import { BotonTira, CLASE_ETIQUETA, EtiquetaTira, GrupoTira, SegmentoTira, Tira, TiraModo } from './TiraPlano';

// ─────────────────────────────────────────────────────────────────────────────
// La CUBIERTA que se reforma, EN EL PLANO DE SU PLANTA.
//
// POR QUÉ VIVE AQUÍ Y NO EN EL PANEL DE LA DERECHA: la cubierta se marca
// DIBUJÁNDOLA sobre el plano, y el mando tiene que estar donde se dibuja. En
// una columna aparte, debajo del panel de la pared —que ya es largo—, había
// que bajar hasta el fondo para descubrir que existía; y además ese panel es
// «la pared seleccionada», y la cubierta no es una pared.
//
// Es una tira bajo la barra del plano, con las tres respuestas a la vista:
// se conserva · entera · solo una parte. Mientras se dibuja, la tira pasa a
// ser la instrucción y los dos mandos (cerrar y cancelar), que es lo único
// que hace falta en ese momento.
//
// Y puede llevar a la DERECHA sus lucernarios (`lucernarios`), en la misma
// fila: son los huecos de ESTA cubierta, y una fila entera para decir
// «ninguno · + Lucernario» era plano que se quedaba sin ver. Las piezas son
// las de `TiraPlano.jsx` (28 px, nada partido en dos líneas).
// ─────────────────────────────────────────────────────────────────────────────

export function CubiertaControl({ reforma, dibujando, vertices = [],
                                  onDibujar, onEntera, onQuitar,
                                  onCerrar, onCancelar,
                                  // `{ planta, plano, defecto }`: con ellos, los
                                  // lucernarios van en esta misma fila.
                                  lucernarios = null }) {
    // Antes de cualquier `return` (regla 62).
    const [refTira, ancho] = useAnchoTira();
    if (dibujando) {
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <TiraModo tono="amber" refTira={refTira}
                      titulo="✎ Marca la cubierta"
                      contador={`${vertices.length} ${vertices.length === 1 ? 'vértice' : 'vértices'}${m2 ? ` · ≈${fmt(m2)} m²` : ''}`}
                      acciones={<>
                          <BotonTira tono="ambar" mayus onClick={onCerrar} disabled={vertices.length < 3}>
                              ✓ Cerrar
                          </BotonTira>
                          <BotonTira tono="plano" cuadrado onClick={onCancelar} aria-label="Cancelar">✕</BotonTira>
                      </>}
                      instruccion={<>
                          Pulsa cada esquina de la parte que se reforma y cierra en el primer punto
                          (o doble clic). <span className="text-white/45">Esc cancela.</span>
                      </>} />
        );
    }

    // Con los lucernarios en la misma fila hace falta más sitio: se acortan
    // antes las etiquetas.
    const corto = estrecha(ancho, lucernarios ? 600 : 400);
    const minimo = estrecha(ancho, lucernarios ? 400 : 300);
    const entera = !!reforma?.entera;
    const parte = !!reforma?.poligono;
    const m2 = parte ? areaPoligono(reforma.poligono) : null;
    return (
        <Tira refTira={refTira} tono={reforma ? 'amber' : 'neutro'}>
            <EtiquetaTira title="El tejado de esta planta. Si se reforma, en CE3X sale como «CUBIERTA - CAMBIA»">
                Cubierta
            </EtiquetaTira>
            <GrupoTira>
                <SegmentoTira tono={!reforma ? 'elegido' : 'apagado'} aria-pressed={!reforma} onClick={onQuitar}
                              title="El tejado de esta planta se queda como está">
                    Se conserva
                </SegmentoTira>
                <SegmentoTira tono={entera ? 'elegido' : 'apagado'} aria-pressed={entera} onClick={onEntera}
                              title="Se reforma entero: en CE3X sale «CUBIERTA - CAMBIA»">
                    Entera
                </SegmentoTira>
                <SegmentoTira tono={parte ? 'elegido' : 'apagado'} aria-pressed={parte} onClick={() => onDibujar(true)}
                              title="Dibujar sobre el plano la parte que se reforma">
                    {parte ? '✎ Otra parte' : minimo ? '✎ Parte' : corto ? '✎ Una parte' : '✎ Solo una parte'}
                </SegmentoTira>
            </GrupoTira>
            {/* Lo que se reforma, en cifras. Con la etiqueta corta, «entera» ya
                lo dice el conmutador y solo queda la superficie de la parte. */}
            {reforma && !(corto && entera) && (
                <span className="whitespace-nowrap text-[10.5px] tabular-nums text-amber-300/90">
                    {entera ? 'entera · se reforma' : corto ? `≈${fmt(m2)} m²` : `≈${fmt(m2)} m² se reforman`}
                </span>
            )}
            {lucernarios && (
                <LucernariosCubierta {...lucernarios} enLinea corto={corto} anchoFila={ancho} />
            )}
        </Tira>
    );
}

/**
 * Los LUCERNARIOS de la cubierta de esta planta.
 *
 * POR QUÉ EXISTE: la cubierta no se podía editar desde la app, así que un
 * lucernario había que meterlo después a mano en CE3X. Aquí se añade como
 * cualquier otro hueco —nombre, medidas, vidrio, marco y % de marco— y el
 * motor lo escribe como lo guarda CE3X: `Lucernario`, colgado de la cubierta y
 * con orientación «Techo» (19 de 19 en los .cex de producción).
 *
 * Va PLEGADO en una línea que ya dice cuántos hay y cuánto miden: la tira está
 * encima del plano, y abierta empujaría el dibujo hacia abajo. Se abre sola al
 * añadir uno, que es cuando hay que teclear.
 *
 * Dos formas: su PROPIA tira (lo de siempre), o `enLinea` DENTRO de la fila de
 * la cubierta —a la derecha, con las tarjetas a todo el ancho debajo—, que es
 * lo que hace `CubiertaControl` cuando le pasan `lucernarios`.
 *
 * La tarjeta es la MISMA que la de un hueco de fachada (`Hueco`): dos
 * versiones del mismo formulario acabarían pidiendo cosas distintas.
 */
export function LucernariosCubierta({ planta, plano, defecto, enLinea = false, corto: cortoFila = false,
                                      anchoFila = 0 }) {
    const [abierto, setAbierto] = useState(false);
    // En su propia tira se mide a sí misma; dentro de la cubierta, lo dice ella.
    const [refTira, anchoPropio] = useAnchoTira();
    const ancho = enLinea ? anchoFila : anchoPropio;
    const corto = enLinea ? cortoFila : estrecha(ancho, 360);
    const hs = plano?.lucernarios?.[planta] || [];
    const cubiertas = plano?.cubiertasDePlanta?.[planta] || [];
    const porConfirmar = hs.filter(h => h.estado !== 'medido').length;
    const anade = () => { plano.anadeLucernario(planta); setAbierto(true); };
    const lista = hs.map(h => `${h.nombre} ${fmt2(h.ancho)}×${fmt2(h.alto)}`).join(' · ');

    const cabecera = (
        <>
            <button type="button" onClick={() => hs.length && setAbierto(a => !a)}
                    disabled={!hs.length} aria-expanded={hs.length ? abierto : undefined}
                    className={`${CLASE_ETIQUETA} enabled:hover:text-white/75`}
                    title="Ventanas en el tejado. En CE3X salen como «Lucernario» de la cubierta">
                {hs.length ? (abierto ? '▾ ' : '▸ ') : ''}Lucernarios
            </button>
            {/* La lista TRUNCA (entera en el `title`) antes que mandar el «+» a
                otra fila. */}
            {hs.length ? (
                <span title={lista}
                      className={`min-w-0 truncate text-[10.5px] tabular-nums text-white/55 ${enLinea ? '' : 'flex-1 basis-0'}`}>
                    {lista}
                    {porConfirmar ? (
                        <span className="text-amber-300/85"> · {porConfirmar} por confirmar</span>
                    ) : null}
                </span>
            ) : (
                <span className="whitespace-nowrap text-[10.5px] text-white/30">ninguno</span>
            )}
            <BotonTira tono="marca" onClick={anade} cuadrado={corto}
                       aria-label="Añadir un lucernario" title="Añadir un lucernario a esta cubierta"
                       className={enLinea ? '' : 'ml-auto'}>
                {corto ? '+' : '+ Lucernario'}
            </BotonTira>
        </>
    );
    // Las tarjetas, a dos columnas solo si la tira da para ello (lo que manda
    // es la tarjeta del plano, no la pantalla).
    const tarjetas = abierto && !!hs.length && (
        <div className={`grid gap-1.5 ${ancho >= 600 || ancho === 0 ? 'grid-cols-2' : 'grid-cols-1'}
                         ${enLinea ? 'basis-full pb-0.5' : 'mb-1.5'}`}>
            {hs.map((h, i) => (
                <div key={h.uid || i} className="flex min-w-0 flex-col gap-1">
                    <Hueco h={h} defecto={defecto}
                             onCambio={(c, v) => plano.cambiaLucernario(planta, i, c, v)}
                             onCambia={si => plano.cambiaLucernario(planta, i, 'cambia', si)}
                             onDuplica={() => plano.duplicaLucernario(planta, i)}
                             onConfirma={() => plano.confirmaLucernario(planta, i)}
                             onQuita={() => plano.quitaLucernario(planta, i)} />
                    {/* Si la planta tiene VARIOS tejados (una parte de la
                        baja que la primera no cubre, dos cuerpos), se
                        dice en cuál está. Con uno solo no se pregunta. */}
                    {cubiertas.length > 1 && (
                        <label className="flex items-center gap-1.5 text-[10.5px] text-white/45">
                            en la cubierta
                            <select value={h.cubierta || cubiertas[0].id}
                                    onChange={e => plano.cambiaLucernario(planta, i, 'cubierta',
                                                                          e.target.value)}
                                    className="rounded-md border border-white/10 bg-bkg-surface
                                               px-1 py-0.5 text-[10.5px] font-bold">
                                {cubiertas.map(c => (
                                    <option key={c.id} value={c.id}>
                                        {c.id}{c.superficie ? ` · ${fmt(c.superficie)} m²` : ''}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                </div>
            ))}
        </div>
    );

    if (enLinea) {
        // Dentro de la fila de la cubierta, a la derecha. Con lista pide 180 px:
        // si los tiene se queda en la fila (y la lista trunca); si no, baja
        // entera a una segunda línea de la misma tira. Con «ninguno», lo que
        // mide. Sin raya delante: bajada a la segunda línea, una raya suelta a
        // la izquierda no separaba nada.
        return (
            <>
                <span className={`ml-auto flex min-w-0 items-center justify-end gap-2 pl-1
                                  ${hs.length ? 'flex-1 basis-[180px]' : ''}`}>
                    {cabecera}
                </span>
                {tarjetas}
            </>
        );
    }
    return (
        <>
            <Tira refTira={refTira}>{cabecera}</Tira>
            {tarjetas}
        </>
    );
}

const fmt2 = n => (Number(n) || 0).toFixed(2).replace('.', ',');

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default CubiertaControl;
