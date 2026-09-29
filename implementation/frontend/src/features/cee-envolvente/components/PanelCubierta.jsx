import { useState } from 'react';
import { areaPoligono } from '../logic/geometriaPlano';
import { Hueco } from './PanelPared';

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
// ─────────────────────────────────────────────────────────────────────────────

export function CubiertaControl({ reforma, dibujando, vertices = [],
                                  onDibujar, onEntera, onQuitar,
                                  onCerrar, onCancelar }) {
    if (dibujando) {
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border
                            border-amber-400/45 bg-amber-400/[0.08] px-3 py-2">
                <b className="text-[11.5px] font-black uppercase tracking-wider text-amber-300">
                    ✎ Marca la cubierta
                </b>
                <span className="text-[11.5px] text-amber-100/80">
                    Pulsa cada esquina de la parte que se reforma y cierra en el primer punto
                    (o doble clic). <span className="text-amber-200/60">Esc cancela.</span>
                </span>
                <span className="text-[11.5px] tabular-nums text-amber-200/70">
                    {vertices.length} {vertices.length === 1 ? 'vértice' : 'vértices'}
                    {m2 ? ` · ≈${fmt(m2)} m²` : ''}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                    <button onClick={onCerrar} disabled={vertices.length < 3}
                            className="rounded-md border border-amber-400/60 bg-amber-400/15 px-2.5
                                       py-1 text-[10.5px] font-black uppercase tracking-wider
                                       text-amber-200 hover:bg-amber-400/25 disabled:opacity-40">
                        ✓ Cerrar
                    </button>
                    <button onClick={onCancelar}
                            className="px-1.5 text-[13px] leading-none text-amber-200/70
                                       hover:text-amber-100">✕</button>
                </span>
            </div>
        );
    }

    const entera = !!reforma?.entera;
    const parte = !!reforma?.poligono;
    const m2 = parte ? areaPoligono(reforma.poligono) : null;
    return (
        <div className={`mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-1.5
            ${reforma ? 'border-amber-400/35 bg-amber-400/[0.05]' : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/45"
                  title="El tejado de esta planta. Si se reforma, en CE3X sale como «CUBIERTA - CAMBIA»">
                Cubierta
            </span>
            <div className="flex items-center gap-0.5 rounded-lg border border-white/10
                            bg-white/[0.04] p-0.5">
                <Opcion activa={!reforma} onClick={onQuitar}
                        title="El tejado de esta planta se queda como está">
                    Se conserva
                </Opcion>
                <Opcion activa={entera} onClick={onEntera}
                        title="Se reforma entero: en CE3X sale «CUBIERTA - CAMBIA»">
                    Entera
                </Opcion>
                <Opcion activa={parte} onClick={() => onDibujar(true)}
                        title="Dibujar sobre el plano la parte que se reforma">
                    {parte ? '✎ Otra parte' : '✎ Solo una parte'}
                </Opcion>
            </div>
            {reforma && (
                <span className="text-[10.5px] tabular-nums text-amber-300/90">
                    {entera ? 'entera · se reforma' : `≈${fmt(m2)} m² se reforman`}
                </span>
            )}
        </div>
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
 * La tarjeta es la MISMA que la de un hueco de fachada (`Hueco`): dos
 * versiones del mismo formulario acabarían pidiendo cosas distintas.
 */
export function LucernariosCubierta({ planta, plano, defecto }) {
    const [abierto, setAbierto] = useState(false);
    const hs = plano?.lucernarios?.[planta] || [];
    const cubiertas = plano?.cubiertasDePlanta?.[planta] || [];
    const porConfirmar = hs.filter(h => h.estado !== 'medido').length;
    const anade = () => { plano.anadeLucernario(planta); setAbierto(true); };

    return (
        <div className="mb-2 flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border
                            border-white/[0.06] bg-white/[0.02] px-3 py-1.5">
                <button onClick={() => hs.length && setAbierto(a => !a)}
                        disabled={!hs.length}
                        className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/45
                                   enabled:hover:text-white/75"
                        title="Ventanas en el tejado. En CE3X salen como «Lucernario» de la cubierta">
                    {hs.length ? (abierto ? '▾ ' : '▸ ') : ''}Lucernarios
                </button>
                {hs.length ? (
                    <span className="text-[10.5px] tabular-nums text-white/55">
                        {hs.map(h => `${h.nombre} ${fmt2(h.ancho)}×${fmt2(h.alto)}`).join(' · ')}
                        {porConfirmar ? (
                            <span className="text-amber-300/85"> · {porConfirmar} por confirmar</span>
                        ) : null}
                    </span>
                ) : (
                    <span className="text-[10.5px] text-white/30">ninguno</span>
                )}
                <button onClick={anade}
                        className="ml-auto rounded-md border border-white/12 px-2 py-0.5 text-[10.5px]
                                   font-bold text-white/60 hover:border-brand/50 hover:text-brand">
                    + Lucernario
                </button>
            </div>
            {abierto && !!hs.length && (
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {hs.map((h, i) => (
                        <div key={h.uid || i} className="flex flex-col gap-1">
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
                                            className="rounded-md border border-white/12 bg-bkg-surface
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
            )}
        </div>
    );
}

const fmt2 = n => (Number(n) || 0).toFixed(2).replace('.', ',');

function Opcion({ activa, onClick, title, children }) {
    return (
        <button onClick={onClick} title={title}
                className={`rounded-md px-2 py-1 text-[10.5px] font-bold transition
                    ${activa ? 'bg-amber-400/20 text-amber-200'
                             : 'text-white/55 hover:bg-white/[0.06] hover:text-white/85'}`}>
            {children}
        </button>
    );
}

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default CubiertaControl;
