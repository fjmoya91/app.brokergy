// ─────────────────────────────────────────────────────────────────────────────
// El panel de la pared seleccionada: cuántas ventanas, cuántas puertas, y qué
// mide cada una.
//
// El NOMBRE del hueco es editable porque es el que CE3X enseña en el árbol y
// el que usa el puente térmico para decir de qué hueco es. Tiene que ser único
// en todo el edificio.
// ─────────────────────────────────────────────────────────────────────────────

export function PanelPared({ plano }) {
    const { muros, sel, entrada, esMedianera, estadoDe,
            ponHuecos, cambiaHueco, quitaHueco, marcaComoParticion } = plano;
    const m = sel ? muros[sel] : null;

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

    return (
        <Caja>
            <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-md border px-2 py-1.5 text-[13px] font-black
                    ${m.id === entrada
                        ? 'border-brand bg-brand text-black'
                        : 'border-white/10 bg-white/[0.04]'}`}>
                    {m.id}{m.id === entrada ? ' ◆ entrada' : ''}
                </span>
                <span className="text-[12px] tabular-nums text-white/40">
                    {m.orientacion} · {fmt(m.largo)} m · {fmt(m.superficie)} m²
                </span>
            </div>

            {m.fuera && (
                <p className="text-xs text-white/40">
                    Esta pared no entra en la envolvente.
                </p>
            )}

            {esMedianera(m) ? (
                <Medianera m={m} onCambio={si => marcaComoParticion(m.id, si)} />
            ) : !m.fuera && (
                <>
                    <Contador etiqueta="Ventanas" n={ventanas.length}
                              onCambio={n => ponHuecos(m.id, 'ventana', n)} />
                    <Contador etiqueta="Puertas" n={puertas.length}
                              onCambio={n => ponHuecos(m.id, 'puerta', n)} />

                    <div className="flex flex-col gap-1.5">
                        {(m.huecos || []).map((h, i) => (
                            <Hueco key={i} h={h}
                                   onCambio={(c, v) => cambiaHueco(m.id, i, c, v)}
                                   onQuita={() => quitaHueco(m.id, i)} />
                        ))}
                    </div>
                </>
            )}
        </Caja>
    );
}

function Medianera({ m, onCambio }) {
    return (
        <div className="flex flex-col gap-2">
            <p className="text-xs leading-relaxed text-white/50">
                Da contra el edificio de al lado, así que no lleva huecos. Pero
                medianera lo es por lo que haya <b>al otro lado</b>: si ahí hay un
                garaje o un local, por ahí <b>se pierde calor</b> y no es adiabática.
            </p>
            <div className="flex gap-2">
                <Opcion activa={!m.como_particion} onClick={() => onCambio(false)}>
                    Al otro lado hay vivienda
                </Opcion>
                <Opcion activa={!!m.como_particion} onClick={() => onCambio(true)}>
                    Garaje o local
                </Opcion>
            </div>
        </div>
    );
}

function Contador({ etiqueta, n, onCambio }) {
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
        </div>
    );
}

function Hueco({ h, onCambio, onQuita }) {
    const borde = { medido: 'border-l-emerald-400', dudoso: 'border-l-amber-400' }[h.estado]
        || 'border-l-white/25';
    const tono = { medido: 'text-emerald-400', dudoso: 'text-amber-400' }[h.estado]
        || 'text-white/40';
    return (
        <div className={`flex flex-col gap-1.5 rounded-lg border border-white/[0.07]
                         border-l-4 ${borde} px-2.5 py-2`}>
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
                <button onClick={onQuita}
                        className="ml-auto px-1 text-[17px] leading-none text-white/30
                                   hover:text-red-400">×</button>
            </div>
            <div className="flex items-center gap-1.5">
                <Medida v={h.ancho} onCambio={v => onCambio('ancho', v)} />
                <span className="text-white/30">×</span>
                <Medida v={h.alto} onCambio={v => onCambio('alto', v)} />
                <span className="text-[11px] text-white/30">m</span>
            </div>
            {h.por_que && (
                <span className="text-[10.5px] leading-snug text-white/35">{h.por_que}</span>
            )}
        </div>
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

function Opcion({ activa, onClick, children }) {
    return (
        <button onClick={onClick}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[11px] font-semibold
                    ${activa ? 'border-brand bg-brand/15 text-brand'
                             : 'border-white/10 text-white/50 hover:border-white/25'}`}>
            {children}
        </button>
    );
}

function Caja({ children }) {
    return (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.06]
                        bg-white/[0.02] p-4 lg:sticky lg:top-4">
            {children}
        </div>
    );
}

const fmt = n => (Number(n) || 0).toFixed(2).replace('.', ',');

export default PanelPared;
