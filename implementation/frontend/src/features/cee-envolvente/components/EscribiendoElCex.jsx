import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Los dos momentos de generar el `.cex`: mientras se escribe, y cuando ya está.
//
// POR QUÉ EXISTE: generar tarda —hay que componer la ficha, bajar del Catastro
// la foto y el croquis, escribir quince pickles sobre la plantilla y subirlo a
// Drive— y hasta ahora eso era un botón que ponía «Generando…» sobre una
// pantalla quieta. Es el mismo problema que ya resolvió `MidiendoElEdificio`, y
// se resuelve igual: enseñando LO QUE ESTÁ PASANDO.
//
// Y sobre todo: al terminar, el fichero se va a una carpeta de Drive que el
// certificador ya tiene compartida. Ese enlace es el final del recorrido —es lo
// que se le pasa a él— y no puede quedarse en una línea verde al pie de la
// pantalla, que es donde estaba.
//
// REGLA — los rótulos son las fases REALES del backend y en su orden, no un
// porcentaje. Van por tiempo y se PARAN en la última: una barra que llega al
// 90 % y se queda ahí miente. El dibujo sí da vueltas, y eso es lo que dice que
// esto sigue vivo.
// ─────────────────────────────────────────────────────────────────────────────

//: Lo que de verdad hace la ruta `/cex`, en su orden (`routes/ceeEnvolvente.js`).
//: La segunda es la que manda el reloj: son dos peticiones al WAF del Catastro,
//: en serie y con pausa.
const FASES_INICIAL = [
    { a: 0, texto: 'Componiendo la ficha: titular, zona climática, transmitancias…' },
    { a: 2200, texto: 'Trayendo del Catastro la foto de fachada y el croquis…' },
    { a: 8000, texto: 'Escribiendo la envolvente y las instalaciones…' },
    { a: 12500, texto: 'Guardándolo en la carpeta del expediente…' },
];

//: El final no se levanta de cero: se copia el inicial y se le cambia el
//: generador. Por eso no pasa por Catastro y va mucho más rápido.
const FASES_FINAL = [
    { a: 0, texto: 'Cogiendo el .cex inicial de la carpeta…' },
    { a: 1800, texto: 'Retirando la caldera y poniendo la aerotermia…' },
    { a: 5000, texto: 'Guardándolo en 1. CEE / CEE FINAL…' },
];

export function EscribiendoElCex({ expediente, fase = 'inicial' }) {
    // Las dos listas son constantes del módulo, así que su identidad no cambia
    // entre renders y el reloj de abajo no se rearma solo.
    const fases = fase === 'final' ? FASES_FINAL : FASES_INICIAL;
    const [i, setI] = useState(0);

    // Sin reponer el contador al empezar: este popup se monta al pulsar y se
    // desmonta al terminar, así que arranca ya en la primera fase — y el
    // `key={fase}` de quien lo llama lo rehace si cambiara.
    useEffect(() => {
        const relojes = fases.slice(1).map(
            (f, n) => setTimeout(() => setI(n + 1), f.a));
        return () => relojes.forEach(clearTimeout);
    }, [fases]);

    // Portaleado a `body`: un `position: fixed` se ancla al ancestro más cercano
    // con `backdrop-filter`, y la cabecera de esta ventana lo lleva (regla 29.b).
    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4
                        backdrop-blur-sm">
            <style>{CSS}</style>
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-bkg-surface
                            p-6 shadow-2xl">
                <Dibujo />

                <p className="mt-5 text-center text-[13px] font-semibold text-white/85">
                    {fases[i].texto}
                </p>
                <p className="mt-1 text-center text-[11px] text-white/40">
                    {expediente || 'Envolvente térmica'} ·{' '}
                    {fase === 'final' ? 'CEE FINAL' : 'CEE INICIAL'}
                </p>

                <p className="mt-4 border-t border-white/[0.07] pt-3 text-center text-[11px]
                              leading-relaxed text-white/35">
                    {fase === 'final'
                        ? <>El final se hace <b className="text-white/50">sobre el inicial</b>: se
                          copia entero y solo se le cambia el generador, así que conserva la
                          envolvente, el técnico y las imágenes.</>
                        : <>Se piden al Catastro <b className="text-white/50">dos imágenes</b> que
                          van dentro del fichero, en serie y con pausa — al otro lado está el
                          mismo servicio del que depende el buscador de la app.</>}
                </p>
            </div>
        </div>,
        document.body);
}

/**
 * El edificio convirtiéndose en fichero.
 *
 * A la izquierda la planta, que se traza sola; sus muros salen volando y caen
 * en la hoja de la derecha convertidos en renglones. Es lo que de verdad está
 * pasando —la geometría medida pasa a ser un `.cex`— y por eso se entiende sin
 * leer nada.
 *
 * Es SVG y `@keyframes`, sin una dependencia ni un GIF: pesa nada, se adapta al
 * tema y no se pixela. Dos renglones van en el color de marca: son la
 * ENVOLVENTE y las INSTALACIONES, que es lo único que la app escribe sobre la
 * plantilla — los otros trece pickles se copian tal cual.
 */
function Dibujo() {
    return (
        <svg viewBox="0 0 200 132" className="mx-auto block w-full" role="img"
             aria-label="El edificio convirtiéndose en un fichero .cex">
            <defs>
                <pattern id="cex-rejilla" width="8" height="8" patternUnits="userSpaceOnUse">
                    <path d="M 8 0 L 0 0 0 8" fill="none" stroke="var(--border-subtle)"
                          strokeWidth="0.6" />
                </pattern>
            </defs>

            <rect x="0" y="0" width="200" height="132" fill="url(#cex-rejilla)" />

            {/* La planta, a la izquierda: se traza y se queda de fondo. */}
            <g className="cex-planta">
                <polyline points={PLANTA} fill="none" stroke="var(--brand-primary)"
                          strokeWidth="5" strokeLinejoin="round" opacity="0.25" />
                <polyline className="cex-traza" points={PLANTA} fill="none"
                          stroke="var(--brand-primary)" strokeWidth="1.6"
                          strokeLinecap="round" strokeLinejoin="round" />
            </g>

            {/* La HOJA, con su esquina doblada. */}
            <g className="cex-hoja">
                {/* ⚠️ El relleno NO puede ser `--bkg-deep`: en tema claro es
                    BLANCO, igual que la tarjeta del popup, y la hoja
                    desaparecía — solo se veían los renglones flotando. Un tinte
                    del color del texto contrasta en los dos temas. */}
                <path d="M118 16 H176 a3 3 0 0 1 3 3 V116 a3 3 0 0 1 -3 3 H104
                         a3 3 0 0 1 -3 -3 V30 Z"
                      fill="color-mix(in srgb, var(--text-secondary) 10%, transparent)"
                      stroke="var(--text-secondary)" strokeOpacity="0.45"
                      strokeWidth="1" />
                {/* La esquina doblada: el triangulito que completa el rectángulo
                    por dentro de la diagonal. Con la diagonal sola se lee como
                    una hoja cortada, no como una doblada. */}
                <path d="M101 30 L118 16 L118 30 Z"
                      fill="var(--text-secondary)" opacity="0.28" />
            </g>

            {/* Los renglones, escribiéndose. Los dos de marca son la envolvente
                y las instalaciones: lo único que la app escribe de verdad. */}
            <g className="cex-lineas">
                {RENGLONES.map((r, i) => (
                    <rect key={i} x="109" y={r.y} width={r.w} height="3.4" rx="1.7"
                          className={`cex-linea cex-l${i}`}
                          fill={r.nuestro ? 'var(--brand-primary)' : 'var(--text-secondary)'}
                          opacity={r.nuestro ? 0.95 : 0.4} />
                ))}
            </g>

            {/* El cursor, al final de lo escrito: es lo que dice que sigue. */}
            <rect className="cex-cursor" x="109" y="98" width="2" height="6" rx="1"
                  fill="var(--brand-primary)" />

            {/* Y los muros, que vuelan de la planta a la hoja. */}
            <g className="cex-vuelo">
                {[0, 1, 2].map(i => (
                    <rect key={i} className={`cex-pieza cex-p${i}`} x="0" y="0"
                          width="16" height="3.4" rx="1.7" fill="var(--brand-primary)" />
                ))}
            </g>

            <text x="140" y="112" textAnchor="middle" fontSize="9" fontWeight="800"
                  fill="var(--text-muted)" style={{ letterSpacing: '0.08em' }}>.cex</text>
        </svg>
    );
}

//: La misma planta en L que dibuja `MidiendoElEdificio`, a escala: es la forma
//: de media España y la del expediente con el que se probó esto.
const PLANTA = '22,46 74,46 74,72 50,72 50,98 22,98 22,46';

//: Nueve renglones de largos distintos, que es lo que hace que una mancha se lea
//: como un texto. `nuestro` marca los dos que escribe la app.
const RENGLONES = [
    { y: 38, w: 52 }, { y: 46, w: 44 },
    { y: 56, w: 60, nuestro: true }, { y: 64, w: 50, nuestro: true },
    { y: 74, w: 38 }, { y: 82, w: 55 }, { y: 90, w: 30 },
];

//: De dónde sale cada pieza (un muro de la planta) y a qué renglón llega. Son
//: traslaciones, no interpolaciones de forma: el navegador las hace en la GPU.
const VUELO = [
    { de: [26, 46], a: [109, 56] },
    { de: [50, 72], a: [109, 64] },
    { de: [26, 96], a: [109, 74] },
];

const CSS = `
.cex-traza {
    stroke-dasharray: 210; stroke-dashoffset: 210;
    animation: cex-dibuja 5.5s cubic-bezier(.65,0,.35,1) 0s infinite;
}
.cex-hoja { opacity: 0; animation: cex-entra .6s ease-out .35s forwards; }
.cex-linea { transform-origin: 109px 0; transform: scaleX(0); }
${RENGLONES.map((r, i) => `
.cex-l${i} { animation: cex-escribe 5.5s ease-out ${0.9 + i * 0.22}s infinite; }`).join('')}
.cex-cursor { animation: cex-parpadea 1s steps(2) infinite; }
${VUELO.map((v, i) => `
.cex-p${i} {
    transform: translate(${v.de[0]}px, ${v.de[1]}px) scaleX(.5);
    opacity: 0;
    animation: cex-vuela-${i} 5.5s cubic-bezier(.5,0,.2,1) ${1.5 + i * 0.35}s infinite;
}
@keyframes cex-vuela-${i} {
    0%   { transform: translate(${v.de[0]}px, ${v.de[1]}px) scaleX(.5); opacity: 0; }
    6%   { transform: translate(${v.de[0]}px, ${v.de[1]}px) scaleX(.5); opacity: 1; }
    26%  { transform: translate(${v.a[0]}px, ${v.a[1]}px) scaleX(1); opacity: 1; }
    34%  { transform: translate(${v.a[0]}px, ${v.a[1]}px) scaleX(1); opacity: 0; }
    100% { transform: translate(${v.a[0]}px, ${v.a[1]}px) scaleX(1); opacity: 0; }
}`).join('')}

@keyframes cex-entra { to { opacity: 1; } }
@keyframes cex-dibuja {
    0%   { stroke-dashoffset: 210; }
    30%  { stroke-dashoffset: 0; }
    100% { stroke-dashoffset: 0; }
}
@keyframes cex-escribe {
    0%, 12% { transform: scaleX(0); }
    30%     { transform: scaleX(1); }
    88%     { transform: scaleX(1); }
    100%    { transform: scaleX(0); }
}
@keyframes cex-parpadea { 0% { opacity: 1; } 50% { opacity: 0; } }

/* Quien ha pedido que no se le muevan las cosas ve la hoja quieta y escrita: el
   rótulo que va cambiando basta para saber que esto sigue. */
@media (prefers-reduced-motion: reduce) {
    .cex-traza { stroke-dashoffset: 0; animation: none; }
    .cex-hoja { opacity: 1; animation: none; }
    .cex-linea { transform: scaleX(1); animation: none; }
    .cex-cursor, .cex-vuelo { display: none; }
}
`;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Ya está: dónde ha quedado y el enlace que se le pasa al certificador.
 *
 * REGLA — lo primero es la CARPETA, no el fichero. Es la que se le comparte al
 * certificador al encargarle el CEE (`1. CEE / CEE INICIAL`) y donde va a
 * buscarlo; el enlace del fichero suelto no le sirve para subir después el suyo.
 *
 * REGLA — el `_REVISAR` se explica AQUÍ. Este fichero lo ha escrito una máquina
 * y todavía no es un certificado: hay que abrirlo con CE3X y comprobarlo. Es el
 * único sitio donde eso se lee seguro, porque es la pantalla que sale sola.
 */
export function CexGenerado({ g, avisos = [], onCerrar, onVerAvisos, onRegenerar }) {
    const [copiado, setCopiado] = useState(null);
    const enlace = g?.carpeta_link || g?.link;

    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape') onCerrar?.(); };
        window.addEventListener('keydown', tecla);
        return () => window.removeEventListener('keydown', tecla);
    }, [onCerrar]);

    // El acuse va en el PROPIO botón y no en un popup que habría que cerrar
    // antes de poder pegar el enlace. Y si el navegador no deja copiar —pasa sin
    // https, o con el portapapeles capado— se DICE: un botón que no hace nada no
    // se distingue de uno roto, y lo siguiente es volver a pulsarlo.
    const copiar = async () => {
        try {
            await navigator.clipboard.writeText(enlace);
            setCopiado('ok');
        } catch {
            setCopiado('no');
        }
        setTimeout(() => setCopiado(null), 2800);
    };

    return createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4
                        backdrop-blur-sm"
             onClick={onCerrar}>
            <div className="w-full max-w-md rounded-2xl border border-emerald-500/25
                            bg-bkg-surface p-6 shadow-2xl"
                 onClick={e => e.stopPropagation()}>
                <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full
                                     bg-emerald-500/15 text-[17px] text-emerald-300">✓</span>
                    <div>
                        <p className="text-[13px] font-black uppercase tracking-widest
                                      text-emerald-300">
                            {g?.fase === 'final' ? 'CEE final generado' : 'CEE inicial generado'}
                        </p>
                        <p className="mt-1 break-all text-[13px] text-white/85">
                            <code className="text-white">{g?.nombre}</code>
                        </p>
                        <p className="text-[11px] text-white/40">
                            en <b className="text-white/60">1. CEE / {g?.carpeta}</b>
                            {g?.bytes ? ` · ${Math.round(g.bytes / 1024)} KB` : ''}
                        </p>
                    </div>
                </div>

                {enlace && (
                    <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.12em]
                                      text-white/35">
                            La carpeta del certificador
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-white/45">
                            Es la misma que se le comparte al encargarle el CEE: aquí lo
                            encuentra, y aquí sube después el suyo.
                        </p>
                        <div className="mt-2.5 flex flex-wrap gap-2">
                            <a href={enlace} target="_blank" rel="noreferrer"
                               className="rounded-lg bg-brand px-3 py-2 text-[11px] font-black
                                          uppercase tracking-wider text-black
                                          hover:brightness-110">
                                Abrir la carpeta ↗
                            </a>
                            <button onClick={copiar}
                                    className="rounded-lg border border-white/15 px-3 py-2
                                               text-[11px] font-bold text-white/70
                                               hover:border-white/35 hover:text-white">
                                {copiado === 'ok' ? '✓ Enlace copiado'
                                    : copiado === 'no' ? 'No se ha podido copiar'
                                    : 'Copiar el enlace'}
                            </button>
                            {g?.link && (
                                <a href={g.link} target="_blank" rel="noreferrer"
                                   className="rounded-lg border border-white/15 px-3 py-2
                                              text-[11px] font-bold text-white/70
                                              hover:border-white/35 hover:text-white">
                                    Abrir el fichero ↗
                                </a>
                            )}
                        </div>
                    </div>
                )}

                {/* Lo que ha salido SIN imagen porque el Catastro no ha respondido.
                    Va en grande y antes que nada más: el .cex de 26RES093_9 salió
                    sin croquis con el aviso enterrado en la lista de avisos, y no
                    se vio hasta abrirlo en CE3X. No es que no la tenga — volver a
                    generarlo en un rato suele bastar. */}
                {g?.sin_imagenes?.length > 0 && (
                    <div className="mt-4 rounded-xl border border-red-400/35 bg-red-500/[0.08]
                                    px-3 py-2.5">
                        <p className="text-[12px] font-black text-red-300">
                            ⚠ Ha salido SIN {faltanImagenes(g.sin_imagenes)}
                        </p>
                        <p className="mt-1 text-[11px] leading-relaxed text-red-200/80">
                            El Catastro no ha respondido al pedirlo (un corte de conexión,
                            no es que no lo tenga). Vuelve a generarlo en un momento: no
                            hace falta tocar nada más.
                        </p>
                        {onRegenerar && (
                            <button onClick={() => { onCerrar?.(); onRegenerar(g.fase); }}
                                    className="mt-2 rounded-lg border border-red-300/40 px-3 py-1.5
                                               text-[11px] font-bold text-red-200
                                               hover:border-red-200 hover:text-white">
                                ↻ Volver a generar
                            </button>
                        )}
                    </div>
                )}

                {g?.archivado && (
                    <p className="mt-3 text-[11px] text-white/40">
                        Había otro con ese nombre: se ha archivado en <b>OLD</b>, no se ha
                        perdido.
                    </p>
                )}

                <p className="mt-3 rounded-lg border border-amber-400/25 bg-amber-400/[0.07]
                              px-3 py-2 text-[11px] leading-relaxed text-amber-200/85">
                    El <b>_REVISAR</b> del nombre es a propósito: esto lo ha escrito la app y
                    todavía <b>no es el CEE</b>. Ábrelo con CE3X, compruébalo y guarda desde el
                    propio CE3X el certificado definitivo.
                </p>

                <div className="mt-4 flex items-center justify-between gap-2">
                    {avisos.length ? (
                        <button onClick={() => { onVerAvisos?.(); onCerrar?.(); }}
                                className="text-[11px] font-bold text-amber-300 hover:underline">
                            Ver las {avisos.length} cosas que no son una medida →
                        </button>
                    ) : <span />}
                    <button onClick={onCerrar}
                            className="rounded-lg border border-white/15 px-4 py-2 text-[11px]
                                       font-bold text-white/70 hover:border-white/35
                                       hover:text-white">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>,
        document.body);
}

export default EscribiendoElCex;

//: Cómo se nombra lo que falta, en el orden en que CE3X enseña los dos botones.
const NOMBRE_IMAGEN = { fachada: 'la foto de fachada', croquis: 'el plano de situación' };
function faltanImagenes(claves) {
    const n = ['fachada', 'croquis'].filter(k => claves.includes(k)).map(k => NOMBRE_IMAGEN[k]);
    return n.length ? n.join(' ni ') : 'alguna imagen';
}
