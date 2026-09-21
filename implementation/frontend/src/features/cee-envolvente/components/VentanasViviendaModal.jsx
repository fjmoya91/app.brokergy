import { useMemo, useState } from 'react';
import {
    MARCOS, VIDRIOS, VENTANAS_POR_DEFECTO, carpinteriaDe, propuestaDeLasFotos,
    rotuloMarco, rotuloVidrio,
} from '../logic/ventanasVivienda';
import { nombreHueco } from '../logic/usePlanoEnvolvente';

// ─────────────────────────────────────────────────────────────────────────────
// Lo primero que se pregunta al abrir la envolvente de un expediente nuevo —y
// después, el sitio desde el que se cambian las ventanas EN BLOQUE.
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
//
// A QUIÉN se aplica (desde 2026-09-19): a TODA la vivienda —el defecto que
// heredan los huecos que no dicen nada— o SOLO A LAS MARCADAS de una lista.
// Cambiar la cocina y el baño a PVC dejando el resto como estaba era antes
// abrir dos huecos y teclearlo dos veces; con veinte, veinte veces. Y desde
// aquí se marcan también las que SE CAMBIAN en la reforma («V1 - CAMBIA»),
// que casi siempre son «todas menos dos».
// ─────────────────────────────────────────────────────────────────────────────

export function VentanasViviendaModal({ ventanas, muros, nombreDe, esFuera, defecto,
                                        onGuardar, onCerrar, primeraVez = false }) {
    // Lo que dicen las fotos que ya se han leído en este expediente. Si el
    // instalador las subió y alguien las leyó, preguntar de cero es preguntar
    // lo que ya está contestado.
    const [foto] = useState(() => propuestaDeLasFotos(muros));
    const [v, setV] = useState(() => ({
        ...VENTANAS_POR_DEFECTO,
        // La persiana por defecto de ESTE expediente: en uno nuevo, con ella.
        ...(defecto && typeof defecto.persiana === 'boolean' ? { persiana: defecto.persiana } : {}),
        ...(foto ? limpio(foto) : {}),
        ...(ventanas || {}),
    }));

    //: A QUIÉN se aplica. La primera vez no se pregunta: es la respuesta de la
    //: vivienda y aún no hay ventanas que elegir.
    const [ambito, setAmbito] = useState('vivienda');
    //: Las ventanas marcadas, como `pared/uid`.
    const [marcadas, setMarcadas] = useState(() => new Set());
    //: ¿Se CAMBIAN en la reforma? `null` = no tocar la marca que tengan.
    const [cambia, setCambia] = useState(null);
    //: Al aplicar a toda la vivienda: ¿se quitan las excepciones hueco a hueco?
    const [quitarExcepciones, setQuitarExcepciones] = useState(false);

    const desdeFoto = (campo) => !ventanas?.[campo] && foto?.[campo] !== undefined
                                 && String(foto[campo]) === String(v[campo]);

    // Las VENTANAS del edificio, agrupadas por pared, en el orden del plano.
    // Las puertas no entran: no eligen vidrio ni marco (van con su 90 % de
    // madera) y «cambiar en bloque» es de las ventanas.
    const grupos = useMemo(() => Object.values(muros || {})
        .filter(m => !esFuera?.(m))
        .map(m => ({
            pared: m.id,
            nombre: nombreDe ? nombreDe(m) : m.id,
            planta: m.planta,
            huecos: (m.huecos || []).filter(h => h.tipo !== 'puerta' && h.uid),
        }))
        .filter(g => g.huecos.length)
        .sort((a, b) => String(a.planta).localeCompare(String(b.planta))
                        || String(a.nombre).localeCompare(String(b.nombre))),
        [muros, nombreDe, esFuera]);
    const total = grupos.reduce((s, g) => s + g.huecos.length, 0);
    const conPropia = grupos.reduce(
        (s, g) => s + g.huecos.filter(h => carpinteriaDe(h, defecto).propia).length, 0);

    const alterna = (clave) => setMarcadas(s => {
        const n = new Set(s);
        if (n.has(clave)) n.delete(clave); else n.add(clave);
        return n;
    });
    const marcaPared = (g, si) => setMarcadas(s => {
        const n = new Set(s);
        for (const h of g.huecos) {
            const k = `${g.pared}/${h.uid}`;
            if (si) n.add(k); else n.delete(k);
        }
        return n;
    });
    const marcaTodas = (si) => setMarcadas(
        si ? new Set(grupos.flatMap(g => g.huecos.map(h => `${g.pared}/${h.uid}`))) : new Set());

    const algunas = ambito === 'algunas';
    const nMarcadas = marcadas.size;
    const puede = !algunas || nMarcadas > 0;

    function guardar() {
        onGuardar(v, {
            ambito,
            objetivos: algunas
                ? [...marcadas].map(k => { const [pared, uid] = k.split('/'); return { pared, uid }; })
                : [],
            cambia,
            quitarExcepciones: !algunas && quitarExcepciones,
        });
    }

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
                    puente térmico de cajón. Se contesta una vez para toda la vivienda; lo que
                    sea distinto se cambia luego en su hueco (el lápiz ✎) o desde aquí,
                    marcando solo algunas.
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

                {/* A QUIÉN. Solo cuando ya hay ventanas puestas: la primera vez
                    es la respuesta de la vivienda y no hay nada que elegir. */}
                {!primeraVez && total > 0 && (
                    <Bloque titulo="A qué ventanas" n={0}>
                        <div className="flex gap-1.5">
                            <Pastilla activa={!algunas} onClick={() => setAmbito('vivienda')}>
                                Toda la vivienda
                            </Pastilla>
                            <Pastilla activa={algunas} onClick={() => setAmbito('algunas')}>
                                Solo las que marque{nMarcadas ? ` (${nMarcadas})` : ''}
                            </Pastilla>
                        </div>
                        {algunas ? (
                            <Seleccion grupos={grupos} marcadas={marcadas} defecto={defecto}
                                       onHueco={alterna} onPared={marcaPared}
                                       onTodas={marcaTodas} />
                        ) : conPropia > 0 ? (
                            <label className="flex items-start gap-2 text-[11.5px] leading-snug
                                              text-white/60">
                                <input type="checkbox" className="mt-0.5"
                                       checked={quitarExcepciones}
                                       onChange={e => setQuitarExcepciones(e.target.checked)} />
                                <span>
                                    Quitar también las excepciones: {conPropia === 1
                                        ? 'hay 1 ventana'
                                        : `hay ${conPropia} ventanas`} con carpintería propia
                                    que, si no, se quedan como están.
                                </span>
                            </label>
                        ) : null}
                    </Bloque>
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
                                   persiana, que es el cajón por el que se cuela el aire. Las
                                   puertas no la llevan."
                            deFoto={desdeFoto('persiana') && v.persiana === true} />
                    <Opcion elegida={v.persiana === false}
                            onClick={() => setV(x => ({ ...x, persiana: false }))}
                            rotulo="No tienen"
                            ayuda={null}
                            deFoto={desdeFoto('persiana') && v.persiana === false} />
                </Bloque>

                {/* ¿SE CAMBIAN en la reforma? Es lo que hace que el nombre del
                    hueco salga como «V1 - CAMBIA» en CE3X. Va aquí porque la
                    respuesta casi siempre es «todas» o «todas menos dos», y
                    eso se marca en bloque, no hueco a hueco. `null` no toca
                    nada: contestar cómo son las ventanas no puede desmarcar sin
                    querer lo que ya se había marcado. */}
                {!primeraVez && total > 0 && (
                    <Bloque titulo="¿Se cambian en la reforma?" n={4}>
                        <div className="flex gap-1.5">
                            <Pastilla activa={cambia === null} onClick={() => setCambia(null)}
                                      title="Dejar cada ventana con la marca que tenga">
                                No tocar
                            </Pastilla>
                            <Pastilla activa={cambia === true} onClick={() => setCambia(true)}
                                      title="Se escriben como «V1 - CAMBIA»">
                                Sí, se cambian → CAMBIA
                            </Pastilla>
                            <Pastilla activa={cambia === false} onClick={() => setCambia(false)}
                                      title="Quitar la marca: se escriben con su nombre a secas">
                                No, se conservan
                            </Pastilla>
                        </div>
                    </Bloque>
                )}

                <p className="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2
                              text-[11.5px] leading-relaxed text-white/60">
                    Se escribirá <b className="text-white/85">{rotuloVidrio(v.vidrio)}</b> +{' '}
                    <b className="text-white/85">{rotuloMarco(v.marco)}</b>
                    {v.persiana ? ', con caja de persiana' : ', sin caja de persiana'}
                    {algunas
                        ? <> en {nMarcadas === 1 ? 'la ventana marcada' : `las ${nMarcadas} ventanas marcadas`}</>
                        : <> en todos los huecos</>}
                    {cambia === true && <>, y {algunas ? 'esas' : 'todas'} salen con <b className="text-amber-300">- CAMBIA</b></>}
                    {cambia === false && <>, sin la marca de CAMBIA</>}.
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
                    <button type="button" onClick={onCerrar}
                            className="rounded-lg px-3 py-2 text-[12px] font-bold text-white/50
                                       hover:text-white/80">
                        {primeraVez ? 'Lo pongo luego' : 'Cancelar'}
                    </button>
                    <button type="button" onClick={guardar} disabled={!puede}
                            className="rounded-lg bg-brand px-4 py-2 text-[12px] font-black
                                       text-black hover:brightness-110 disabled:cursor-not-allowed
                                       disabled:opacity-40">
                        {algunas
                            ? (nMarcadas ? `Aplicar a ${nMarcadas === 1 ? '1 ventana' : `${nMarcadas} ventanas`}`
                                         : 'Marca alguna ventana')
                            : 'Usar esto en toda la vivienda'}
                    </button>
                </div>
                {primeraVez && (
                    <p className="mt-2 text-right text-[10.5px] text-white/35">
                        Sin contestar se escribe {rotuloVidrio(VENTANAS_POR_DEFECTO.vidrio)} +{' '}
                        {rotuloMarco(VENTANAS_POR_DEFECTO.marco)}
                        {defecto?.persiana ? ', con persiana' : ''}, como hasta ahora.
                    </p>
                )}
            </div>
        </div>
    );
}

/**
 * La lista de ventanas para marcar: por pared, con una casilla por pared y
 * otra para todas. Cada fila dice cómo está HOY esa ventana, para poder ver
 * de un vistazo cuáles son las que se quieren cambiar.
 */
function Seleccion({ grupos, marcadas, defecto, onHueco, onPared, onTodas }) {
    const total = grupos.reduce((s, g) => s + g.huecos.length, 0);
    const todas = total > 0 && marcadas.size === total;
    return (
        <div className="flex flex-col gap-1.5 rounded-lg border border-white/10 bg-white/[0.02] p-2">
            <div className="flex items-center gap-2 text-[11px]">
                <button type="button" onClick={() => onTodas(!todas)}
                        className="font-bold text-brand hover:underline">
                    {todas ? 'Ninguna' : 'Todas'}
                </button>
                <span className="text-white/30">·</span>
                <span className="text-white/45">{marcadas.size} de {total} marcadas</span>
            </div>
            <div className="max-h-[38vh] overflow-y-auto pr-1">
                {grupos.map(g => {
                    const suyas = g.huecos.filter(h => marcadas.has(`${g.pared}/${h.uid}`)).length;
                    const enteras = suyas === g.huecos.length;
                    return (
                        <div key={g.pared} className="mb-1.5">
                            <label className="flex cursor-pointer items-center gap-2 py-0.5 text-[11.5px]
                                              font-black uppercase tracking-wide text-white/70">
                                <input type="checkbox" checked={enteras}
                                       ref={el => { if (el) el.indeterminate = suyas > 0 && !enteras; }}
                                       onChange={e => onPared(g, e.target.checked)} />
                                {g.nombre}
                                <span className="font-normal normal-case tracking-normal text-white/35">
                                    {g.planta} · {g.huecos.length === 1 ? '1 ventana' : `${g.huecos.length} ventanas`}
                                </span>
                            </label>
                            <div className="ml-5 flex flex-col">
                                {g.huecos.map(h => {
                                    const k = `${g.pared}/${h.uid}`;
                                    const c = carpinteriaDe(h, defecto);
                                    return (
                                        <label key={k}
                                               className="flex cursor-pointer items-center gap-2 py-0.5
                                                          text-[11.5px] text-white/70">
                                            <input type="checkbox" checked={marcadas.has(k)}
                                                   onChange={() => onHueco(k)} />
                                            <b className="w-[74px] font-black tabular-nums">
                                                {nombreHueco(h)}
                                            </b>
                                            <span className="text-white/45">
                                                {fmtM(h.ancho)} × {fmtM(h.alto)} · {rotuloVidrio(c.vidrio)} ·{' '}
                                                {rotuloMarco(c.marco)} · {c.persiana ? 'con' : 'sin'} persiana
                                                {c.propia ? ' · propia' : ''}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}


function Bloque({ titulo, n, children }) {
    return (
        <div className="mt-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-white/40">
                {n ? `${n}. ` : ''}{titulo}
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

function Pastilla({ activa, onClick, title, children }) {
    return (
        <button type="button" onClick={onClick} title={title}
                className={`flex-1 rounded-lg border px-2.5 py-2 text-[11px] font-semibold
                    ${activa ? 'border-brand bg-brand/15 text-brand'
                             : 'border-white/10 text-white/50 hover:border-white/25'}`}>
            {children}
        </button>
    );
}

const fmt = n => Number(n).toFixed(1).replace('.', ',');
const fmtM = n => (Number(n) || 0).toFixed(2).replace('.', ',');

/** Lo leído de las fotos, sin las claves que la lectura no ha podido afirmar. */
function limpio(o) {
    const out = {};
    for (const k of ['vidrio', 'marco', 'persiana']) {
        if (o[k] !== undefined && o[k] !== null) out[k] = o[k];
    }
    return out;
}
