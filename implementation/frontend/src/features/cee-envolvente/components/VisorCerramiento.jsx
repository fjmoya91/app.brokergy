import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLOR_HUECO } from './PlanoPlanta';

// ─────────────────────────────────────────────────────────────────────────────
// La foto de un cerramiento, ABIERTA Y ANOTADA.
//
// Antes esto era un lightbox: la foto grande y el nombre del fichero. Pero la
// foto se abre para RESPONDER A UNA PREGUNTA —«¿cuál de estas ventanas es V1?»,
// «¿esa de 1,71 es la de la reja?»— y para eso hacen falta las dos cosas a la
// vez: la imagen y los huecos que el plano declara en esa pared.
//
// REGLA — señalar una ventana en la foto es ATARLA a su nombre, no dibujar.
// De ese nombre cuelgan su medida en el `.cex` y sus puentes térmicos, así que
// una marca no es una anotación suelta: es lo que permite revisar el cerramiento
// sin volver a la obra, y lo que hace legible el expediente tres meses después.
//
// REGLA — la marca se guarda con el `uid` del hueco, nunca con su nombre. V1 se
// renombra y se recoloca solo al quitar un hueco de en medio; con el nombre, la
// marca acabaría señalando a la ventana de al lado.
//
// Las marcas salen SOLAS de la lectura (el modelo ya devuelve la caja de cada
// hueco), y se corrigen o se añaden a mano arrastrando sobre la foto.
// ─────────────────────────────────────────────────────────────────────────────

//: Menos que esto no es un rectángulo: es un clic con la mano temblando. Se
//: descarta en vez de dejar una marca de un píxel imposible de volver a coger.
const MINIMO = 0.015;

//: El MISMO color que en el plano. ⚠️ El token de marca es `--brand-primary`:
//: `var(--brand)` no existe en ninguna parte, y en un atributo SVG eso no es un
//: error visible — se resuelve a NEGRO, así que el rótulo de cada ventana salía
//: como un rectángulo negro sobre la fachada sin que nada lo delatara. Las
//: clases de Tailwind (`text-brand`) sí funcionan: son un color de su config,
//: no esa variable.
const MARCA_ACTIVA = 'var(--brand-primary)';
const fmt = (n) => (Number.isFinite(Number(n)) ? Number(n).toFixed(2).replace('.', ',') : '—');

export function VisorCerramiento({
    url, nombre, muro, nombreDe, marcas = [], onMarcas, ambito = 'pared', hueco, onCerrar,
}) {
    //: Las proporciones de la imagen: sin ellas el SVG de las marcas no puede
    //: cubrir EXACTAMENTE la foto — con `object-contain` sobran bandas por dos
    //: lados y las cajas caerían corridas.
    const [aspecto, setAspecto] = useState(null);
    const [sel, setSel] = useState(() => hueco?.uid || null);
    const [senalando, setSenalando] = useState(null);   // uid del hueco a señalar
    const [trazo, setTrazo] = useState(null);
    const [guardando, setGuardando] = useState(false);
    const lienzo = useRef(null);

    const huecos = useMemo(() => muro?.huecos || [], [muro]);
    const porUid = useMemo(() => {
        const m = new Map();
        for (const x of marcas) m.set(x.uid, x);
        return m;
    }, [marcas]);

    //: Una marca de un hueco que ya no existe no se pinta. No se borra sola: el
    //: hueco puede volver de un «deshacer», y una marca huérfana no molesta a
    //: nadie mientras no se enseñe.
    const pintables = useMemo(
        () => huecos.filter((h) => porUid.has(h.uid)).map((h) => ({ h, box: porUid.get(h.uid).box })),
        [huecos, porUid]);

    const sinMarca = huecos.filter((h) => !porUid.has(h.uid)).length;

    useEffect(() => {
        const tecla = (e) => {
            if (e.key !== 'Escape') return;
            // Escape sale del modo señalar ANTES de cerrar: si cerrara del tirón,
            // salir de un arrastre mal empezado costaría volver a abrir la foto.
            if (senalando) { setSenalando(null); setTrazo(null); return; }
            onCerrar();
        };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onCerrar, senalando]);

    const guardar = useCallback(async (nuevas) => {
        setGuardando(true);
        try { await onMarcas?.(nuevas); } finally { setGuardando(false); }
    }, [onMarcas]);

    // ── Señalar: arrastrar un rectángulo sobre la foto ──────────────────────
    const rel = (e) => {
        const r = lienzo.current?.getBoundingClientRect();
        if (!r) return null;
        return {
            x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
            y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
        };
    };

    function empieza(e) {
        if (!senalando) return;
        const p = rel(e);
        if (!p) return;
        // ⚠️ Sin esto el navegador hace lo SUYO al arrastrar sobre una imagen:
        // la selecciona y la tiñe entera del azul del sistema. No es un fallo del
        // dibujo —las cajas salen bien debajo— pero la foto se vuelve ilegible
        // justo mientras se está señalando sobre ella.
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setTrazo({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    }
    function mueve(e) {
        if (!trazo) return;
        const p = rel(e);
        if (p) setTrazo((t) => ({ ...t, x1: p.x, y1: p.y }));
    }
    function suelta() {
        if (!trazo || !senalando) return;
        const box = {
            x: Math.min(trazo.x0, trazo.x1), y: Math.min(trazo.y0, trazo.y1),
            ancho: Math.abs(trazo.x1 - trazo.x0), alto: Math.abs(trazo.y1 - trazo.y0),
        };
        setTrazo(null);
        if (box.ancho < MINIMO || box.alto < MINIMO) { setSenalando(null); return; }
        const otras = marcas.filter((m) => m.uid !== senalando);
        guardar([...otras, { uid: senalando, box, de: 'mano' }]);
        setSel(senalando);
        setSenalando(null);
    }

    const quitar = (uid) => guardar(marcas.filter((m) => m.uid !== uid));

    return createPortal(
        <div className="fixed inset-0 z-[125] flex flex-col bg-[#0b0b0b]/97 backdrop-blur-sm">
            <Cabecera muro={muro} nombreDe={nombreDe} nombre={nombre}
                      guardando={guardando} onCerrar={onCerrar} />

            <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                {/* LA FOTO */}
                <div className="flex min-h-0 flex-1 items-center justify-center p-3 lg:p-5">
                    {!url && <span className="text-sm text-white/45">cargando…</span>}
                    {url && (
                        <div ref={lienzo}
                             onPointerDown={empieza} onPointerMove={mueve} onPointerUp={suelta}
                             style={aspecto ? { aspectRatio: aspecto } : undefined}
                             className={`relative max-h-full max-w-full select-none overflow-hidden
                                         rounded-lg
                                         ${aspecto ? 'h-full' : ''}
                                         ${senalando ? 'cursor-crosshair' : ''}`}>
                            <img src={url} alt={nombre} draggable={false}
                                 onLoad={(e) => setAspecto(
                                     e.target.naturalHeight
                                         ? e.target.naturalWidth / e.target.naturalHeight : null)}
                                 className="block h-full w-full object-contain" />

                            <svg viewBox="0 0 1 1" preserveAspectRatio="none"
                                 className="pointer-events-none absolute inset-0 h-full w-full">
                                {pintables.map(({ h, box }) => (
                                    <Marca key={h.uid} h={h} box={box}
                                           nombre={h.nombre}
                                           activa={sel === h.uid}
                                           apagada={!!senalando && senalando !== h.uid}
                                           onElegir={() => setSel(h.uid)} />
                                ))}
                                {trazo && (
                                    <rect x={Math.min(trazo.x0, trazo.x1)} y={Math.min(trazo.y0, trazo.y1)}
                                          width={Math.abs(trazo.x1 - trazo.x0)}
                                          height={Math.abs(trazo.y1 - trazo.y0)}
                                          fill={MARCA_ACTIVA} fillOpacity="0.18"
                                          stroke={MARCA_ACTIVA} strokeWidth="0.003" />
                                )}
                            </svg>

                            {senalando && (
                                <div className="pointer-events-none absolute inset-x-0 top-0 flex
                                                justify-center p-3">
                                    <span className="rounded-full border border-brand/40 bg-black/85 px-3
                                                     py-1.5 text-[12px] font-bold text-brand">
                                        Rodea {huecos.find(h => h.uid === senalando)?.nombre} en la foto
                                        <span className="ml-2 font-normal text-white/45">Esc para dejarlo</span>
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* EL PANEL: lo que el plano dice de esta pared */}
                <aside className="flex max-h-[45vh] shrink-0 flex-col border-t border-white/8
                                  bg-white/[0.02] lg:max-h-none lg:w-[330px] lg:border-l lg:border-t-0">
                    <DatosPared muro={muro} nombreDe={nombreDe} />

                    <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                        {!huecos.length ? (
                            <p className="px-1 text-[12px] leading-snug text-white/40">
                                Esta pared no tiene ningún hueco puesto todavía.
                                {ambito === 'pared' && ' Con «✨ Leer la foto» se cuentan solos.'}
                            </p>
                        ) : (
                            <>
                                <ul className="space-y-1.5">
                                    {huecos.map((h) => (
                                        <FilaHueco
                                            key={h.uid}
                                            h={h}
                                            marcado={porUid.has(h.uid)}
                                            deLectura={porUid.get(h.uid)?.de === 'lectura'}
                                            activa={sel === h.uid}
                                            esEste={ambito === 'hueco' && hueco?.uid === h.uid}
                                            senalando={senalando === h.uid}
                                            onEntrar={() => !senalando && setSel(h.uid)}
                                            onSenalar={() => { setSenalando(h.uid); setSel(h.uid); }}
                                            onQuitar={() => quitar(h.uid)} />
                                    ))}
                                </ul>

                                {/* Lo que falta por señalar se dice UNA vez y en
                                    grupo: repetirlo en cada fila sin marca es un
                                    reproche por cada ventana. */}
                                {sinMarca > 0 && (
                                    <p className="mt-3 rounded-lg border border-white/10 bg-white/[0.03]
                                                  px-3 py-2 text-[11px] leading-snug text-white/45">
                                        {sinMarca === huecos.length
                                            ? 'Ninguno está señalado en la foto todavía.'
                                            : `Quedan ${sinMarca} sin señalar.`}{' '}
                                        Pulsa <b className="text-white/70">Señalar</b> en uno y rodéalo
                                        con el ratón: así se sabe cuál es cuál sin abrir el plano.
                                    </p>
                                )}
                            </>
                        )}
                    </div>
                </aside>
            </div>
        </div>,
        document.body);
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Cabecera({ muro, nombreDe, nombre, guardando, onCerrar }) {
    return (
        <div className="flex shrink-0 items-center gap-3 border-b border-white/8 px-4 py-2.5">
            <span className="rounded-md bg-brand px-2 py-1 text-[12px] font-black text-black">
                {muro ? nombreDe?.(muro) || muro.id : '—'}
            </span>
            <span className="min-w-0 truncate text-[12px] text-white/40">{nombre}</span>
            {guardando && <span className="text-[11px] text-white/35">guardando…</span>}
            <button onClick={onCerrar}
                    className="ml-auto shrink-0 rounded-md border border-white/10 px-2.5 py-1
                               text-[12px] font-bold text-white/60 hover:border-white/30
                               hover:text-white">
                Cerrar ✕
            </button>
        </div>
    );
}

/** Lo que el PLANO sabe de esta pared: es contra lo que se compara la foto. */
function DatosPared({ muro, nombreDe }) {
    if (!muro) return null;
    const m2 = (muro.huecos || []).reduce(
        (s, h) => s + (Number(h.ancho) || 0) * (Number(h.alto) || 0), 0);
    return (
        <div className="shrink-0 border-b border-white/8 px-4 py-3">
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[12px]">
                <Dato k="Da contra" v={rotuloTipo(muro)} />
                <Dato k="Orientación" v={muro.orientacion && muro.orientacion !== '—'
                    ? muro.orientacion : null} />
                <Dato k="Mide" v={`${fmt(muro.largo)} m · ${fmt(muro.superficie)} m²`} />
                {Number.isFinite(muro.u_manual) && <Dato k="Su U" v={`${fmt(muro.u_manual)} W/m²K`} />}
                <Dato k="Huecos" v={`${(muro.huecos || []).length}${m2 ? ` · ${fmt(m2)} m²` : ''}`} />
            </dl>
            {nombreDe && nombreDe(muro) !== muro.id && (
                <p className="mt-1.5 text-[10.5px] text-white/30">Catastro la llama {muro.id}</p>
            )}
        </div>
    );
}

function Dato({ k, v }) {
    if (!v) return null;
    return (
        <>
            <dt className="text-white/35">{k}</dt>
            <dd className="font-bold text-white/80">{v}</dd>
        </>
    );
}

function rotuloTipo(m) {
    if (m.excluida) return 'Apartada de la envolvente';
    const t = m.tipo_manual || m.tipo;
    if (t === 'MEDIANERA') return m.como_particion ? 'A un local' : 'Al vecino';
    if (String(t).startsWith('PARTICION')) return 'A un local';
    return 'Al exterior';
}

/**
 * Un hueco en la lista.
 *
 * Es la MISMA información que su tarjeta del panel del plano —nombre, tipo y
 * medida— más lo único que aquí se puede contestar: si está señalado en la foto.
 */
function FilaHueco({ h, marcado, deLectura, activa, esEste, senalando,
                     onEntrar, onSenalar, onQuitar }) {
    const tono = { medido: 'border-l-emerald-400', dudoso: 'border-l-amber-400' }[h.estado]
        || 'border-l-white/25';
    return (
        <li onMouseEnter={onEntrar}
            className={`rounded-lg border border-l-[3px] px-2.5 py-2 transition ${tono}
                ${activa ? 'border-brand/45 bg-brand/[0.08]'
                         : 'border-white/[0.07] bg-white/[0.02]'}`}>
            <div className="flex items-center gap-2">
                <span className={`text-[12.5px] font-black tabular-nums
                    ${h.tipo === 'puerta' ? 'text-[#c98a5e]' : 'text-brand'}`}>
                    {h.nombre}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-white/30">{h.tipo}</span>
                {esEste && (
                    <span className="rounded bg-white/10 px-1.5 text-[9.5px] font-bold text-white/60">
                        es el de esta foto
                    </span>
                )}
                <span className="ml-auto text-[12px] tabular-nums text-white/55">
                    {fmt(h.ancho)} × {fmt(h.alto)} m
                </span>
            </div>

            {h.lectura && (
                <p className="mt-0.5 text-[10.5px] leading-snug text-brand/70">
                    {[h.lectura.material_marco && `marco de ${h.lectura.material_marco}`,
                      h.lectura.acristalamiento,
                      h.lectura.persiana === true && 'con persiana',
                     ].filter(Boolean).join(' · ')}
                </p>
            )}

            <div className="mt-1.5 flex items-center gap-2">
                {marcado ? (
                    <>
                        <span className="text-[10.5px] text-emerald-400/80">
                            ✓ señalado{deLectura ? ' al leer la foto' : ''}
                        </span>
                        <button onClick={onSenalar}
                                className="ml-auto text-[10.5px] text-white/35 hover:text-brand">
                            cambiar
                        </button>
                        <button onClick={onQuitar}
                                className="text-[10.5px] text-white/35 hover:text-red-400">
                            quitar
                        </button>
                    </>
                ) : (
                    <button onClick={onSenalar} disabled={senalando}
                            className="ml-auto rounded-md border border-white/12 px-2 py-1
                                       text-[10.5px] font-bold text-white/65 hover:border-brand/45
                                       hover:text-brand disabled:opacity-40">
                        {senalando ? 'Rodéalo en la foto…' : '⌖ Señalar'}
                    </button>
                )}
            </div>
        </li>
    );
}

/** La caja de un hueco sobre la foto, con su nombre pegado encima. */
function Marca({ h, box, nombre, activa, apagada, onElegir }) {
    const c = COLOR_HUECO[h.tipo === 'puerta' ? 'puerta' : 'ventana'];
    // El rótulo va FUERA de la caja cuando cabe: encima del hueco tapa justo el
    // dintel, que es donde se mira para distinguir una ventana de un ventanal.
    const arriba = box.y > 0.07;
    return (
        <g className="pointer-events-auto cursor-pointer" onClick={onElegir}
           opacity={apagada ? 0.25 : 1}>
            <rect x={box.x} y={box.y} width={box.ancho} height={box.alto}
                  fill={c} fillOpacity={activa ? 0.2 : 0.06}
                  stroke={c} strokeWidth={activa ? 0.005 : 0.003} />
            <rect x={box.x} y={arriba ? box.y - 0.045 : box.y}
                  width={Math.max(0.055, 0.021 * String(nombre || '').length + 0.03)} height="0.042"
                  fill={c} rx="0.006" />
            <text x={box.x + 0.014} y={(arriba ? box.y - 0.045 : box.y) + 0.031}
                  fontSize="0.032" fontWeight="800" fill="#000"
                  style={{ userSelect: 'none' }}>
                {nombre}
            </text>
        </g>
    );
}

export default VisorCerramiento;
