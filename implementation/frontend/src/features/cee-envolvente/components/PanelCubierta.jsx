import { areaPoligono } from '../logic/geometriaPlano';

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
