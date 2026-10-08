// ─────────────────────────────────────────────────────────────────────────────
// Las TIRAS que van bajo la barra de cada plano —Vivienda, Cubierta,
// Lucernarios, el contorno del adosado— y los MODOS de dibujo en que se
// convierten. Comparten estas piezas para medir y verse igual.
//
// POR QUÉ (2026-10-08, capturas de 26RES060_188 en «Las dos», tarjetas de
// ~470 px): eran tres cajas con tres estilos —botones de 22 a 42 px de alto,
// letra de 10,5 a 11,5— y los botones partían su texto en DOS líneas
// («Pintar desde el / móvil», «Quitar una / zona», «Delimitar / adosado»), así
// que quedaban de alturas distintas y el plano empezaba ~200 px por debajo de
// su barra. Ahora:
//   · todos los controles miden lo que los de la barra del plano (28 px, `h-7`);
//   · ningún botón parte su texto (`whitespace-nowrap`): cuando no cabe, la
//     ETIQUETA se ACORTA —el `title` sigue diciendo lo de siempre—;
//   · los chips truncan con su texto entero en el `title`.
//
// El ancho se MIDE en la propia tira (`useAnchoTira` de `logic/anchoTira.js`,
// ResizeObserver): lo que manda es lo que mide la TARJETA —en «Las dos» son
// dos de ~470 px aunque la pantalla tenga 1920—, no la pantalla, y Tailwind 3
// no tiene container queries.
//
// ⚠ Las clases van ESCRITAS ENTERAS en los mapas: Tailwind solo genera lo que
// encuentra literal en el código, y un `border-${tono}-400` no saldría.
// ─────────────────────────────────────────────────────────────────────────────

const TONO_TIRA = {
    neutro: 'border-white/[0.06] bg-white/[0.02]',
    sky: 'border-sky-400/30 bg-sky-400/[0.05]',
    amber: 'border-amber-400/35 bg-amber-400/[0.05]',
    emerald: 'border-emerald-400/40 bg-emerald-400/[0.06]',
};

/**
 * La tira en reposo: una fila de 28 px de controles (38 con su borde) que se
 * parte en dos solo si lo que lleva no cabe.
 */
export function Tira({ tono = 'neutro', refTira, className = '', children }) {
    return (
        <div ref={refTira}
             className={`mb-1.5 flex min-h-[38px] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border
                         px-2.5 py-1 ${TONO_TIRA[tono] || TONO_TIRA.neutro} ${className}`}>
            {children}
        </div>
    );
}

/** La etiqueta de la tira («VIVIENDA», «CUBIERTA»…): la misma en todas. */
export const CLASE_ETIQUETA = 'shrink-0 whitespace-nowrap text-[9.5px] font-black uppercase tracking-[0.12em] text-white/45';

export function EtiquetaTira({ title, children }) {
    return <span className={CLASE_ETIQUETA} title={title}>{children}</span>;
}

const TONO_MODO = {
    sky: { caja: 'border-sky-400/50 bg-sky-400/[0.08]', titulo: 'text-sky-300' },
    violet: { caja: 'border-violet-400/50 bg-violet-400/[0.08]', titulo: 'text-violet-300' },
    amber: { caja: 'border-amber-400/45 bg-amber-400/[0.08]', titulo: 'text-amber-300' },
    emerald: { caja: 'border-emerald-400/50 bg-emerald-400/[0.08]', titulo: 'text-emerald-300' },
};

/**
 * Un MODO de dibujo (la cubierta, una zona, el croquis, el adosado): la tira
 * pasa a ser la instrucción y sus mandos. Primera fila: qué se dibuja, lo que
 * se elige (el uso), lo que lleva (vértices, m²) y, a la derecha, cerrar y
 * cancelar. Debajo, a todo el ancho, la instrucción —que es lo que hace falta
 * leer mientras se dibuja— y lo que venga (`pie`).
 */
export function TiraModo({ tono = 'sky', refTira, titulo, contador = null, acciones, instruccion = null,
                           pie = null, children }) {
    const t = TONO_MODO[tono] || TONO_MODO.sky;
    return (
        <div ref={refTira}
             className={`mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-1.5 ${t.caja}`}>
            <b className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[11px] font-black uppercase
                           tracking-wider ${t.titulo}`}>
                {titulo}
            </b>
            {children}
            {contador != null && (
                <span className="whitespace-nowrap text-[11px] tabular-nums text-white/55">{contador}</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1">{acciones}</span>
            {instruccion && (
                <p className="basis-full text-[11px] leading-snug text-white/70">{instruccion}</p>
            )}
            {pie}
        </div>
    );
}

const TONO_BOTON = {
    neutro: 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white',
    fuerte: 'border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20',
    ambar: 'border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25',
    sky: 'border-sky-400/60 bg-sky-400/15 text-sky-300 hover:bg-sky-400/25',
    emerald: 'border-emerald-400/60 bg-emerald-400/15 text-emerald-300 hover:bg-emerald-400/25',
    violeta: 'border-violet-400/50 bg-violet-400/10 text-violet-200 hover:bg-violet-400/20',
    // La acción PRINCIPAL de una barra: rellena, para que no se confunda con las demás.
    principal: 'border-transparent bg-violet-600 text-white shadow-sm hover:bg-violet-500 disabled:shadow-none',
    // El aspa de cancelar: sin caja, que no compita con «✓ Cerrar».
    plano: 'border-transparent text-white/60 hover:text-white/90',
    // El segundo toque de algo que descarta («¿Descartar lo pintado?»).
    peligro: 'border-rose-400/60 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25',
    // Añadir algo («+ Lucernario»): discreto hasta que se pasa por encima.
    marca: 'border-white/10 text-white/60 hover:border-brand/50 hover:text-brand',
};

/**
 * Un botón de tira: 28 px, nunca en dos líneas. `mayus` es la confirmación de
 * un modo («✓ CERRAR Y MEDIR»); `cuadrado`, un botón de solo icono (lleva
 * `aria-label`).
 */
export function BotonTira({ tono = 'neutro', mayus = false, cuadrado = false, className = '', children, ...props }) {
    return (
        <button type="button" {...props}
                className={`inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md
                            border transition disabled:opacity-40
                            ${cuadrado ? 'w-7' : mayus ? 'px-2.5' : 'px-2'}
                            ${mayus ? 'text-[10px] font-black uppercase tracking-wider' : 'text-[11px] font-bold'}
                            ${TONO_BOTON[tono] || TONO_BOTON.neutro} ${className}`}>
            {children}
        </button>
    );
}

const TONO_GRUPO = {
    neutro: 'border-white/10',
    fuerte: 'border-sky-400/50',
    ambar: 'border-amber-400/60',
};
const TONO_SEGMENTO = {
    neutro: 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white',
    fuerte: 'border-sky-400/30 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20',
    ambar: 'border-amber-400/40 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25',
    // Un CONMUTADOR (la cubierta: se conserva · entera · una parte): la
    // respuesta elegida en ámbar, las otras apagadas.
    elegido: 'border-white/10 bg-amber-400/20 text-amber-200',
    apagado: 'border-white/10 bg-white/[0.02] text-white/55 hover:bg-white/[0.06] hover:text-white/85',
};

/**
 * Un botón PARTIDO: dos entradas a lo mismo (con el ratón aquí o con el dedo
 * en el móvil), o las respuestas de un conmutador. La raya entre segmentos es
 * un `border-l` de cada uno y no un `divide-x`: el tema claro traduce los
 * `border-white/…` y no los `divide-white/…`, que en claro desaparecían.
 */
export function GrupoTira({ tono = 'neutro', children }) {
    return (
        <span className={`inline-flex h-7 shrink-0 overflow-hidden rounded-md border ${TONO_GRUPO[tono] || TONO_GRUPO.neutro}`}>
            {children}
        </span>
    );
}

export function SegmentoTira({ tono = 'neutro', className = '', children, ...props }) {
    return (
        <button type="button" {...props}
                className={`inline-flex h-full items-center gap-1 whitespace-nowrap border-l px-2 text-[11px] font-bold
                            transition first:border-l-0 disabled:opacity-40
                            ${TONO_SEGMENTO[tono] || TONO_SEGMENTO.neutro} ${className}`}>
            {children}
        </button>
    );
}

const TONO_CHIP = {
    sky: 'border-sky-400/40 bg-sky-400/10 text-sky-200',
    amber: 'border-amber-400/50 bg-amber-400/10 text-amber-200',
    emerald: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
};

/**
 * Lo que ya está puesto («✂ Garaje fuera · 139,2 m²», «Adosado delimitado…»)
 * con sus mandos pequeños al final. Si no cabe TRUNCA —el texto entero va en
 * el `title`— en vez de ocupar otra fila.
 */
export function ChipTira({ tono = 'sky', title, children, mandos = null }) {
    return (
        <span title={title}
              className={`inline-flex h-6 min-w-0 max-w-full items-center gap-1 rounded-md border pl-1.5 pr-1
                          text-[10.5px] font-bold ${TONO_CHIP[tono] || TONO_CHIP.sky}`}>
            <span className="min-w-0 truncate">{children}</span>
            {mandos}
        </span>
    );
}

/** Un mando dentro de un chip (✎, ✕): pequeño, pero con su `aria-label`. */
export function MandoChip({ children, ...props }) {
    return (
        <button type="button" {...props}
                className="shrink-0 px-0.5 leading-none text-white/55 hover:text-white disabled:opacity-40">
            {children}
        </button>
    );
}
