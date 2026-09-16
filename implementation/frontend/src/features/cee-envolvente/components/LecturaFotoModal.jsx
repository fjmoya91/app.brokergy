import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se ha leído de la foto, ANTES de tocar el plano.
//
// Gesto de DOS TIEMPOS, como el de las placas: se lee, se ve qué ha entendido la
// app, y solo entonces se aplica. De estos huecos sale la superficie que va al
// `.cex` y al certificado; un relleno automático que no se puede revisar es peor
// que contarlas a ojo, porque el error entra sin que nadie mire.
//
// REGLA — lo leído NACE DUDOSO. Ni la mejor lectura de una foto en perspectiva
// es un metro. Sale en ámbar, lo cuenta el titular («6 con medida por
// confirmar») y se cierra con el «✓ OK» que ya existe en cada hueco.
//
// REGLA — no se PISA lo que ya hay. Si la pared ya tiene huecos, las casillas
// nacen DESMARCADAS y se dice cuántos hay: lo que el certificador puso, lo puso
// con el edificio delante. Reemplazarlos es un botón aparte y se lee como lo que
// es.
// ─────────────────────────────────────────────────────────────────────────────

export function LecturaFotoModal({ lectura, pared, hueco, onAplicar, onReemplazar, onCerrar }) {
    if (!lectura) return null;
    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-end justify-center bg-black/80 p-0
                        backdrop-blur-sm md:items-center md:p-6"
             onClick={e => { if (e.target === e.currentTarget) onCerrar(); }}>
            <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden
                            rounded-t-2xl border border-white/10 bg-[#111] md:rounded-2xl">
                {lectura.ambito === 'hueco'
                    ? <DeUnHueco l={lectura} hueco={hueco} onAplicar={onAplicar} onCerrar={onCerrar} />
                    : <DeUnaFachada l={lectura} pared={pared} onAplicar={onAplicar}
                                    onReemplazar={onReemplazar} onCerrar={onCerrar} />}
            </div>
        </div>,
        document.body);
}

// ── La fachada: cuántos huecos hay ──────────────────────────────────────────

function DeUnaFachada({ l, pared, onAplicar, onReemplazar, onCerrar }) {
    const yaHay = (pared?.huecos || []).length;
    // Con la pared vacía, lo leído se ofrece marcado: es justo lo que se ha
    // pedido. Con huecos ya puestos, no — añadir a ciegas duplicaría la fachada.
    const [marcados, setMarcados] = useState(
        () => new Set(yaHay ? [] : (l.huecos || []).map(h => h.i)));

    const elegidos = useMemo(
        () => (l.huecos || []).filter(h => marcados.has(h.i)), [l.huecos, marcados]);

    const alterna = (i) => setMarcados(s => {
        const n = new Set(s);
        if (n.has(i)) n.delete(i); else n.add(i);
        return n;
    });

    const conMedida = (l.huecos || []).some(h => h.ancho && h.alto);

    return (
        <>
            <Cabecera
                titulo={`${l.ventanas} ${l.ventanas === 1 ? 'ventana' : 'ventanas'}`
                      + ` y ${l.puertas} ${l.puertas === 1 ? 'puerta' : 'puertas'}`}
                sub={`leídas en la foto de ${pared?.nombre || 'esta pared'}`}
                onCerrar={onCerrar} />

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {!l.huecos?.length && (
                    <p className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-sm
                                  text-white/55">
                        No se ha visto ningún hueco en esta foto.
                    </p>
                )}

                {!!l.huecos?.length && (
                    <>
                        {yaHay > 0 && (
                            <Nota tono="aviso">
                                Esta pared ya tiene <b>{yaHay}</b> {yaHay === 1 ? 'hueco' : 'huecos'}.
                                Lo que marques se <b>añade</b> a los que hay — no los sustituye.
                            </Nota>
                        )}

                        <ul className="mt-2 space-y-1.5">
                            {l.huecos.map(h => (
                                <li key={h.i}>
                                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg
                                                       border p-2.5 transition
                                        ${marcados.has(h.i)
                                            ? 'border-brand/40 bg-brand/[0.07]'
                                            : 'border-white/8 bg-white/[0.02] hover:border-white/20'}`}>
                                        <input type="checkbox" checked={marcados.has(h.i)}
                                               onChange={() => alterna(h.i)}
                                               className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                                <span className="text-[13px] font-bold capitalize">
                                                    {h.tipo}
                                                </span>
                                                {h.ancho && h.alto ? (
                                                    <span className="text-[13px] tabular-nums text-brand">
                                                        {fmt(h.ancho)} × {fmt(h.alto)} m
                                                    </span>
                                                ) : (
                                                    <span className="text-[11px] text-white/40">
                                                        sin medida — entra con la de por defecto
                                                    </span>
                                                )}
                                                {h.planta !== null && h.planta !== undefined && (
                                                    <span className="text-[10px] text-white/30">
                                                        {h.planta === 0 ? 'planta baja' : `planta ${h.planta}`}
                                                    </span>
                                                )}
                                            </div>
                                            {h.descripcion && (
                                                <p className="mt-0.5 text-[11px] leading-snug text-white/45">
                                                    {h.descripcion}
                                                </p>
                                            )}
                                            <Rasgos h={h} />
                                        </div>
                                    </label>
                                </li>
                            ))}
                        </ul>

                        {/* De dónde salen los metros. Es lo que separa «lo dice la
                            foto» de «lo ha estimado una máquina». */}
                        {conMedida && !!l.escala?.length && (
                            <Nota tono="info">
                                Las medidas salen de una regla de tres con {l.escala.join(' y ')}.
                                Son <b>estimadas</b>: entran en ámbar y hay que confirmarlas.
                            </Nota>
                        )}
                    </>
                )}

                {(l.avisos || []).map((a, i) => <Nota key={i} tono="aviso">{a}</Nota>)}

                {l.observaciones && (
                    <Nota tono="info"><b>De la fachada:</b> {l.observaciones}</Nota>
                )}
            </div>

            <Pie onCerrar={onCerrar}>
                {yaHay > 0 && !!l.huecos?.length && (
                    <button type="button"
                            onClick={() => onReemplazar(l.huecos)}
                            className="rounded-lg border border-white/12 px-3 py-2 text-[12px]
                                       font-bold text-white/60 hover:border-white/30 hover:text-white/85">
                        Quitar los {yaHay} y poner estos {l.huecos.length}
                    </button>
                )}
                <button type="button" disabled={!elegidos.length}
                        onClick={() => onAplicar(elegidos)}
                        className="rounded-lg bg-brand px-4 py-2 text-[13px] font-black text-black
                                   disabled:opacity-35">
                    {elegidos.length
                        ? `Añadir ${elegidos.length} a ${pared?.nombre || 'la pared'}`
                        : 'Marca lo que quieras añadir'}
                </button>
            </Pie>
        </>
    );
}

// ── El hueco: qué es ────────────────────────────────────────────────────────

const RASGOS = [
    ['material_marco', 'Carpintería'],
    ['acristalamiento', 'Vidrio'],
    ['apertura', 'Apertura'],
    ['hojas', 'Hojas'],
    ['persiana', 'Persiana'],
    ['cajon_persiana', 'Cajón de persiana'],
    ['rotura_puente_termico', 'Rotura de puente térmico'],
    ['reja', 'Reja'],
    ['estado', 'Estado'],
];

function DeUnHueco({ l, hueco, onAplicar, onCerrar }) {
    const filas = RASGOS
        .map(([k, rotulo]) => [rotulo, l[k], k])
        .filter(([, v]) => v !== null && v !== undefined && v !== '');

    return (
        <>
            <Cabecera titulo={`Lo que dice la foto de ${hueco?.nombre || 'este hueco'}`}
                      sub={l.tipo ? `Parece una ${l.tipo}` : null} onCerrar={onCerrar} />

            <div className="flex-1 overflow-y-auto px-4 py-3">
                {filas.length ? (
                    <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[13px]">
                        {filas.map(([rotulo, v, k]) => (
                            <Fila key={k} rotulo={rotulo} valor={v} />
                        ))}
                    </dl>
                ) : (
                    <p className="text-sm text-white/50">
                        No se ha podido sacar nada en claro de esta foto.
                    </p>
                )}

                {(l.rotura_evidencia || l.acristalamiento_evidencia) && (
                    <Nota tono="info">
                        <b>Por qué lo dice:</b>{' '}
                        {[l.acristalamiento_evidencia, l.rotura_evidencia].filter(Boolean).join(' · ')}
                    </Nota>
                )}

                {l.medida_texto && (
                    <Nota tono="info">
                        En la foto hay una medida escrita: «{l.medida_texto}». Compruébala y
                        tecléala en el hueco.
                    </Nota>
                )}

                {(l.avisos || []).map((a, i) => <Nota key={i} tono="aviso">{a}</Nota>)}
                {l.observaciones && <Nota tono="info">{l.observaciones}</Nota>}

                {/* Lo honesto: esto NO va al certificado todavía. */}
                <Nota tono="info">
                    Esto queda anotado en el hueco y en el expediente. <b>No se escribe en el
                    .cex</b>: la carpintería y el vidrio del hueco se siguen tecleando en CE3X.
                </Nota>
            </div>

            <Pie onCerrar={onCerrar}>
                <button type="button" onClick={() => onAplicar(l)}
                        className="rounded-lg bg-brand px-4 py-2 text-[13px] font-black text-black">
                    Anotarlo en {hueco?.nombre || 'el hueco'}
                </button>
            </Pie>
        </>
    );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Rasgos({ h }) {
    const r = [
        h.material_marco && `marco de ${h.material_marco}`,
        h.acristalamiento && (h.acristalamiento === 'monolitico'
            ? 'vidrio simple' : `vidrio ${h.acristalamiento}`),
        h.persiana === true && 'con persiana',
        h.persiana === false && 'sin persiana',
    ].filter(Boolean);
    if (!r.length) return null;
    return (
        <p className="mt-1 text-[10px] uppercase tracking-wide text-white/30">{r.join(' · ')}</p>
    );
}

function Fila({ rotulo, valor }) {
    const v = typeof valor === 'boolean' ? (valor ? 'Sí' : 'No') : String(valor);
    return (
        <>
            <dt className="text-white/40">{rotulo}</dt>
            <dd className="font-bold capitalize">{v}</dd>
        </>
    );
}

function Cabecera({ titulo, sub, onCerrar }) {
    return (
        <div className="flex shrink-0 items-start gap-3 border-b border-white/8 px-4 py-3">
            <div className="min-w-0">
                <h3 className="text-[15px] font-black leading-tight">{titulo}</h3>
                {sub && <p className="mt-0.5 text-[12px] text-white/45">{sub}</p>}
            </div>
            <button onClick={onCerrar}
                    className="ml-auto shrink-0 text-white/35 hover:text-white/80">✕</button>
        </div>
    );
}

function Pie({ children, onCerrar }) {
    return (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t
                        border-white/8 px-4 py-3
                        [padding-bottom:calc(0.75rem+env(safe-area-inset-bottom))]">
            <button type="button" onClick={onCerrar}
                    className="mr-auto text-[12px] text-white/40 hover:text-white/70">
                Cancelar
            </button>
            {children}
        </div>
    );
}

function Nota({ tono = 'info', children }) {
    const c = tono === 'aviso'
        ? 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200/85'
        : 'border-white/10 bg-white/[0.03] text-white/55';
    return (
        <p className={`mt-2 rounded-lg border px-3 py-2 text-[11.5px] leading-snug ${c}`}>
            {children}
        </p>
    );
}

const fmt = n => Number(n).toFixed(2).replace('.', ',');

export default LecturaFotoModal;
