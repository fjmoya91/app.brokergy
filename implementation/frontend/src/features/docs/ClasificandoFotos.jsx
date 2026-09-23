import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Lo que se ve mientras el buzón mira las fotos y propone su apartado.
//
// POR QUÉ EXISTE: con veinte fotos esto tarda medio minuto —se reducen una a
// una en el navegador y el modelo las mira en tandas de doce—, y hasta ahora
// eso era una lista de casillas vacías con un rótulo pequeño arriba. Una espera
// larga delante de una pantalla quieta se lee como que se ha colgado, y lo
// siguiente es cerrar y volver a soltarlas, que empieza la espera otra vez.
//
// REGLA — la primera fase lleva el número DE VERDAD (`N de M`), porque reducir
// las fotos ocurre aquí y se puede contar. Lo que pasa en el servidor va por
// tiempo, con los rótulos de lo que de verdad está haciendo, y por eso el
// último SE QUEDA en vez de dar la vuelta: una cuenta que vuelve a empezar
// miente dos veces.
//
// El dibujo sí da vueltas, y eso está bien: es lo que dice que sigue vivo.
// ─────────────────────────────────────────────────────────────────────────────

//: Lo que hace el servicio, en su orden. Las marcas son de tiempo, no del
//: servidor: no hay forma de saber por qué foto va dentro de una tanda.
const FASES = [
    { a: 0, texto: 'Mirando cada foto…' },
    { a: 6000, texto: 'Reconociendo los aparatos…' },
    { a: 13000, texto: 'Buscando el apartado de cada una…' },
];

//: El servicio trocea en tandas de 12 (`MAX_POR_LLAMADA`). Con más, el modelo
//: empieza a confundir el orden de las imágenes con el de sus respuestas.
const POR_TANDA = 12;

/**
 * @param {number}  total      cuántas fotos se están mirando
 * @param {number?} preparadas cuántas van reducidas; `null` = ya está en el servidor
 */
export function ClasificandoFotos({ total = 0, preparadas = null }) {
    const [fase, setFase] = useState(0);
    const preparando = preparadas !== null && preparadas < total;

    // El reloj de las fases arranca cuando las fotos YA han salido: contarlo
    // desde que se abre el popup haría que con veinte fotos el primer rótulo se
    // hubiera pasado antes de que la petición saliera siquiera.
    useEffect(() => {
        if (preparando) return undefined;
        const relojes = FASES.slice(1).map(
            (f, i) => setTimeout(() => setFase(i + 1), f.a));
        return () => relojes.forEach(clearTimeout);
    }, [preparando]);

    const tandas = Math.max(1, Math.ceil(total / POR_TANDA));

    // Portaleado a `body`: el buzón lleva `backdrop-blur`, y un `position: fixed`
    // dentro de un ancestro con `backdrop-filter` se ancla a ÉL (regla 29.b) —
    // se recortaría a la caja del modal en vez de cubrir la pantalla.
    return createPortal(
        <div className="fixed inset-0 z-[340] flex items-center justify-center bg-black/85 p-4
                        backdrop-blur-sm">
            <style>{CSS}</style>
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0F1013]
                            p-6 shadow-2xl">
                <Dibujo />

                <p className="mt-5 text-center text-[13px] font-semibold text-white/85">
                    {preparando
                        ? `Preparando las fotos… ${preparadas} de ${total}`
                        : FASES[fase].texto}
                </p>
                <p className="mt-1 text-center text-[11px] text-white/40">
                    {total} foto{total === 1 ? '' : 's'}
                    {tandas > 1 && !preparando && ` · en ${tandas} tandas de ${POR_TANDA}`}
                </p>

                <p className="mt-4 border-t border-white/[0.07] pt-3 text-center text-[11px]
                              leading-relaxed text-white/35">
                    Se manda una <b className="text-white/50">copia reducida</b> de cada una: lo
                    que hay que reconocer es qué aparato sale, no leer su nº de serie. Después
                    subirá el fichero de verdad.
                </p>
            </div>
        </div>,
        document.body);
}

/**
 * Las fotos repartiéndose: salen de la pila, pasan bajo la lente y caen en su
 * apartado. Es lo que está ocurriendo, dibujado.
 *
 * SVG y `@keyframes`, sin una dependencia ni un GIF: no pesa en la carga, se
 * adapta al tema y no se pixela.
 */
function Dibujo() {
    return (
        <svg viewBox="0 0 200 116" className="mx-auto block w-full" role="img"
             aria-label="Las fotos repartiéndose en sus apartados">
            <defs>
                {/* Una foto: marco, cielo y su montaña. Se reutiliza en la pila
                    y en las que viajan, así que las tres son la misma cosa. */}
                <symbol id="cla-foto" viewBox="0 0 34 26">
                    <rect x="0.7" y="0.7" width="32.6" height="24.6" rx="3"
                          fill="rgb(var(--bkg-elevated))" stroke="var(--text-secondary)"
                          strokeWidth="1.4" />
                    <circle cx="10" cy="8.5" r="2.6" fill="var(--brand-primary)" opacity="0.85" />
                    <path d="M3.5 21 L13 12 L20 18 L25 14.5 L30.5 21 Z"
                          fill="var(--text-secondary)" opacity="0.5" />
                </symbol>
                <radialGradient id="cla-lente">
                    <stop offset="55%" stopColor="var(--brand-primary)" stopOpacity="0" />
                    <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity="0.22" />
                </radialGradient>
            </defs>

            {/* La pila de la izquierda: lo que se acaba de soltar. */}
            <g className="cla-pila" opacity="0.55">
                <use href="#cla-foto" x="12" y="50" width="34" height="26"
                     transform="rotate(-7 29 63)" />
                <use href="#cla-foto" x="15" y="47" width="34" height="26"
                     transform="rotate(4 32 60)" />
                <use href="#cla-foto" x="14" y="45" width="34" height="26" />
            </g>

            {/* La lente: donde se mira cada una antes de decidir. */}
            <g className="cla-lente">
                <circle cx="100" cy="58" r="24" fill="url(#cla-lente)" />
                <circle cx="100" cy="58" r="23" fill="none" stroke="var(--brand-primary)"
                        strokeWidth="1.3" strokeDasharray="4 5" opacity="0.7" />
            </g>

            {/* Los tres apartados, cada uno con su pestaña de carpeta. */}
            <g className="cla-casillas">
                {[16, 46, 76].map((y, i) => (
                    <g key={y} className={`cla-casilla cla-casilla-${i + 1}`}
                       transform={`translate(0 ${y})`}>
                        <path d="M155 0 h10 l2.5 4 H191 a3 3 0 0 1 3 3 v13 a3 3 0 0 1 -3 3
                                 H155 a3 3 0 0 1 -3 -3 V3 a3 3 0 0 1 3 -3 z"
                              fill="rgb(var(--bkg-elevated))" stroke="var(--text-secondary)"
                              strokeWidth="1.2" />
                        <rect className="cla-marca" x="158" y="11" width="15" height="2.4"
                              rx="1.2" fill="var(--success)" />
                    </g>
                ))}
            </g>

            {/* Las que viajan: de la pila, bajo la lente, a su apartado. */}
            <g className="cla-vuela cla-vuela-1">
                <use href="#cla-foto" x="14" y="45" width="34" height="26" />
            </g>
            <g className="cla-vuela cla-vuela-2">
                <use href="#cla-foto" x="14" y="45" width="34" height="26" />
            </g>
            <g className="cla-vuela cla-vuela-3">
                <use href="#cla-foto" x="14" y="45" width="34" height="26" />
            </g>
        </svg>
    );
}

//: Los `@keyframes` van aquí y no en `index.css` porque solo existen mientras
//: se clasifica: son de este componente y no hay por qué cargarlos con la app.
const CSS = `
/* Sin \`fill-box\`, el \`scale\` de un elemento SVG pivota sobre el origen del
   viewBox y la foto sale disparada en diagonal en vez de encogerse donde está. */
.cla-vuela, .cla-marca { transform-box: fill-box; }
.cla-vuela { transform-origin: center; opacity: 0;
             animation: cla-reparte 4.5s cubic-bezier(.5,0,.4,1) infinite; }
.cla-vuela-1 { animation-delay: 0s;   --cla-y: -30px; }
.cla-vuela-2 { animation-delay: 1.5s; --cla-y: 0px;   }
.cla-vuela-3 { animation-delay: 3s;   --cla-y: 30px;  }

.cla-lente { transform-box: view-box; transform-origin: 100px 58px;
             animation: cla-mira 4.5s ease-in-out infinite; }
.cla-marca { opacity: 0; transform-origin: left; }
.cla-casilla-1 .cla-marca { animation: cla-recibe 4.5s ease-out 0s   infinite; }
.cla-casilla-2 .cla-marca { animation: cla-recibe 4.5s ease-out 1.5s infinite; }
.cla-casilla-3 .cla-marca { animation: cla-recibe 4.5s ease-out 3s   infinite; }

/* La foto sale de la pila (su centro, en 31,58), se para bajo la lente (100,58)
   y cae en el centro de su carpeta (173, 27,5 · 57,5 · 87,5). */
@keyframes cla-reparte {
    0%   { transform: translate(0, 0) scale(1);          opacity: 0; }
    8%   { transform: translate(6px, 0) scale(1);        opacity: 1; }
    30%  { transform: translate(69px, 0) scale(1.06);    opacity: 1; }
    44%  { transform: translate(69px, 0) scale(1.06);    opacity: 1; }
    66%  { transform: translate(142px, var(--cla-y)) scale(.42); opacity: 1; }
    73%  { transform: translate(142px, var(--cla-y)) scale(.34); opacity: 0; }
    100% { transform: translate(142px, var(--cla-y)) scale(.34); opacity: 0; }
}
@keyframes cla-mira {
    0%, 24%   { opacity: .45; transform: scale(.94); }
    36%       { opacity: 1;   transform: scale(1); }
    50%       { opacity: .9;  transform: scale(1); }
    70%, 100% { opacity: .45; transform: scale(.94); }
}
@keyframes cla-recibe {
    0%, 72% { opacity: 0; transform: scaleX(0); }
    82%     { opacity: 1; transform: scaleX(1); }
    94%     { opacity: 1; transform: scaleX(1); }
    100%    { opacity: 0; transform: scaleX(1); }
}

/* Quien ha pedido que no se le muevan las cosas ve el reparto quieto y ya
   hecho: el rótulo que va cambiando basta para saber que esto sigue. */
@media (prefers-reduced-motion: reduce) {
    .cla-vuela { display: none; }
    .cla-lente { animation: none; opacity: .6; }
    .cla-marca { opacity: 1; animation: none; }
}
`;

export default ClasificandoFotos;
