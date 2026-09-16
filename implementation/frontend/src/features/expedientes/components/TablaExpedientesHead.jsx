import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// ─── LA CABECERA DE LA TABLA DE EXPEDIENTES ──────────────────────────────────
// Las dos filas de arriba: los rótulos —que ORDENAN al pulsarlos y MUEVEN la
// columna al arrastrarlos— y la fila de filtros, que declara cada columna.
//
// Vive fuera de ExpedientesView porque el arrastre necesita estado propio (qué
// se mueve, dónde caería, dónde está el puntero) y ahí dentro sería un tercer
// bloque de estado visual en una vista que ya tiene 2.600 líneas. La vista le
// dice QUÉ columnas hay y qué hacer al soltar; el gesto es de la cabecera.
//
// REGLA — el arrastre va con EVENTOS DE PUNTERO, no con el drag&drop de HTML5.
// Tres motivos, y el tercero es el que decide: (1) es el mismo mecanismo que el
// tirador de ancho que vive dos centímetros a la derecha, en este mismo <th>;
// (2) el "fantasma" que genera Chrome de un <th> de 360 px es un rectángulo
// enorme y translúcido, mientras que aquí se pinta una etiqueta del tamaño de un
// dedo; y (3) el drag&drop nativo NO se puede disparar con eventos sintéticos,
// así que un gesto escrito con él no se puede comprobar ni en un banco de
// pruebas ni en un navegador automatizado — se verifica a ojo o no se verifica.
//
// REGLA — el ancho se arrastra por el BORDE y la columna por el ROTULO. El
// tirador de ancho para la propagación (`stopPropagation` + su propio
// preventDefault): sin eso, estrechar una columna la movía de sitio, que es el
// gesto de al lado y no se deshace con un clic.

const UMBRAL_PX = 4;     // por debajo de esto es un clic (ordenar), no un arrastre
const BORDE_PX = 56;     // franja del borde que arrastra la tabla al llegar a ella
const VELOCIDAD = 16;    // px por tic de auto-desplazamiento
const TIC_MS = 16;       // ~60 tics/s, como un fotograma
// Ventana en la que un clic se entiende como "el rebote del arrastre que acaba
// de terminar". El navegador lo emite en el mismo instante que el `pointerup`,
// así que basta con un pestañeo: más ancha se comería el clic siguiente, que un
// humano da a los ~200 ms.
const REBOTE_MS = 120;

export function TablaExpedientesHead({
    cols,               // columnas visibles, en su orden
    ctx,                // contexto de las columnas (filtros, listas, rol…)
    anchos,             // { [key]: px }
    sortBy,             // { key, dir } | null
    onOrdenar,          // (key) => void
    onReordenar,        // (origen, destino, antes) => void
    onResizeStart,      // (key, event) => void
    selectMode,
    cabeceraSeleccion,  // JSX del checkbox de "seleccionar todo" (o null)
    anchoAcciones,
}) {
    // `arrastre` es lo que se está moviendo y por dónde va el puntero; `destino`
    // es dónde caería ({key, antes}). El destino se guarda con el LADO porque el
    // hueco donde va a entrar hay que enseñarlo ANTES de soltar: sin la marca, el
    // arrastre es a ciegas y hay que probar dos o tres veces hasta que cae donde
    // se quería.
    const [arrastre, setArrastre] = useState(null);   // { key, label, x, y }
    const [destino, setDestino] = useState(null);     // { key, antes }
    const gestoRef = useRef(null);                    // { key, label, x0, y0, movido }
    // La vista pasa `onReordenar` como flecha en línea (identidad nueva en cada
    // render). Por ref, para que el efecto no se re-suscriba en mitad del gesto.
    const onReordenarRef = useRef(onReordenar);
    onReordenarRef.current = onReordenar;
    const colsRef = useRef(cols);
    colsRef.current = cols;
    // Un arrastre NO puede acabar ordenando la columna: el `click` llega después
    // del `pointerup` y el navegador no sabe que veníamos de mover algo. Se
    // guarda CUÁNDO acabó, no un booleano: con una bandera, el clic que se traga
    // podía ser el de media hora después sobre otra cabecera — probado.
    const finArrastre = useRef(0);
    const limpiarEscuchas = useRef(null);
    const scrollerRef = useRef(null);   // el contenedor con overflow-x de la tabla
    const ticRef = useRef(0);

    const fin = useCallback(() => {
        clearInterval(ticRef.current);
        ticRef.current = 0;
        scrollerRef.current = null;
        limpiarEscuchas.current?.();
        limpiarEscuchas.current = null;
        gestoRef.current = null;
        setArrastre(null);
        setDestino(null);
    }, []);
    // Si la cabecera se desmonta a mitad de arrastre (un cambio de vista), las
    // escuchas de `window` se quedarían vivas para siempre.
    useEffect(() => () => limpiarEscuchas.current?.(), []);

    // Sobre qué cabecera está el puntero y en qué mitad. Se resuelve con
    // `elementFromPoint` y no guardando los rects al empezar: la tabla se puede
    // desplazar en horizontal durante el arrastre —de hecho se desplaza sola al
    // llegar al borde— y unos rects de hace un segundo dejarían la marca donde ya
    // no está la columna.
    //
    // REGLA — el gesto es TOLERANTE: mientras se arrastra, lo que manda es la
    // posición horizontal. Sin esto no se puede llevar una columna al final —al
    // llegar al borde, el puntero acaba sobre "Acciones", que no es un destino— ni
    // al principio, donde topa con el nº de expediente; y el arrastre se queda sin
    // sitio donde soltar justo en los dos extremos, que es a donde más se mueve.
    const dondeCaeria = (x, y, origen) => {
        const elegible = (key) => {
            if (!key || key === origen) return null;
            const col = colsRef.current.find(c => c.key === key);
            if (!col) return null;
            // La fija es el nº de expediente: soltar encima significa "lo más a la
            // izquierda que se pueda", que es justo DETRÁS de ella.
            if (col.fija) return { key, antes: false };
            const r = document.querySelector(`th[data-col="${key}"]`)?.getBoundingClientRect();
            return r ? { key, antes: x < r.left + r.width / 2 } : null;
        };

        const directo = elegible(document.elementFromPoint(x, y)?.closest?.('th[data-col]')?.dataset?.col);
        if (directo) return directo;

        // Fuera de una cabecera (sobre Acciones, sobre el checkbox o más abajo):
        // la columna cuyo centro queda más cerca en horizontal.
        let mejor = null;
        document.querySelectorAll('th[data-col]').forEach(el => {
            const r = el.getBoundingClientRect();
            const d = Math.abs(x - (r.left + r.width / 2));
            if (!mejor || d < mejor.d) mejor = { d, key: el.dataset.col };
        });
        return mejor ? elegible(mejor.key) : null;
    };

    const empezar = (col, e) => {
        if (col.fija || e.button !== 0) return;
        const g = { key: col.key, label: col.label, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, movido: false };
        gestoRef.current = g;
        // Con muchas columnas encendidas la tabla se desplaza en horizontal, así
        // que la columna a la que se quiere llegar puede estar FUERA de la vista:
        // sin esto, llevar la primera columna al final es imposible — no hay
        // dónde soltarla. Al acercar el puntero al borde, la tabla se desplaza.
        scrollerRef.current = e.currentTarget.closest('.overflow-x-auto') || null;
        // Con `requestAnimationFrame` NO se puede: el navegador lo congela cuando
        // la ventana no está a la vista, así que el auto-desplazamiento no se
        // puede comprobar en un banco de pruebas ni en un navegador
        // automatizado — el mismo tropiezo que el rasterizado de pdf.js.
        const autoDesplazar = () => {
            const sc = scrollerRef.current;
            const gg = gestoRef.current;
            if (!gg) { clearInterval(ticRef.current); ticRef.current = 0; return; }
            if (sc && gg.movido) {
                const r = sc.getBoundingClientRect();
                const dx = gg.x < r.left + BORDE_PX ? -VELOCIDAD
                    : gg.x > r.right - BORDE_PX ? VELOCIDAD : 0;
                if (dx) {
                    const antes = sc.scrollLeft;
                    sc.scrollLeft += dx;
                    // Las columnas se han movido bajo un puntero quieto: el destino
                    // hay que recalcularlo o la marca se queda donde ya no está.
                    if (sc.scrollLeft !== antes) setDestino(dondeCaeria(gg.x, gg.y, gg.key));
                }
            }
        };
        ticRef.current = setInterval(autoDesplazar, TIC_MS);

        // Las escuchas se enganchan AQUÍ y no en un `useEffect`, igual que hace el
        // tirador de ancho: con el efecto hay una ventana entre el `pointerdown` y
        // el render en la que los primeros movimientos se pierden — un arrastre
        // rápido empezaba a media columna.
        const onMove = (ev) => {
            if (!g.movido && Math.abs(ev.clientX - g.x0) < UMBRAL_PX && Math.abs(ev.clientY - g.y0) < UMBRAL_PX) return;
            g.movido = true;
            g.x = ev.clientX;
            g.y = ev.clientY;
            setArrastre({ key: g.key, label: g.label, x: ev.clientX, y: ev.clientY });
            setDestino(dondeCaeria(ev.clientX, ev.clientY, g.key));
        };
        const onUp = (ev) => {
            const d = g.movido ? dondeCaeria(ev.clientX, ev.clientY, g.key) : null;
            if (g.movido) finArrastre.current = Date.now();
            fin();
            if (g.movido && d) onReordenarRef.current(g.key, d.key, d.antes);
        };
        // Soltar fuera de la ventana, o un Escape, cancela: no mover es siempre una
        // salida válida de un arrastre que no se sabe dónde va a caer.
        const onEsc = (ev) => { if (ev.key === 'Escape') { finArrastre.current = Date.now(); fin(); } };
        const onCancel = () => fin();

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onCancel);
        window.addEventListener('keydown', onEsc);
        limpiarEscuchas.current = () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onCancel);
            window.removeEventListener('keydown', onEsc);
        };
    };

    // Tirador de ancho (Excel-style). Corta la propagación: ver la regla de arriba.
    const Tirador = ({ colKey }) => (
        <div
            onPointerDown={e => e.stopPropagation()}
            onMouseDown={e => { e.stopPropagation(); onResizeStart(colKey, e); }}
            className="absolute top-0 right-0 h-full w-3 flex items-center justify-center cursor-col-resize group/rh select-none z-10"
            title="Arrastra para redimensionar"
        >
            <div className="w-px h-4 bg-white/10 group-hover/rh:bg-brand/60 group-hover/rh:h-full transition-all" />
        </div>
    );

    const moviendo = !!arrastre;

    return (
        <>
        <thead>
            <tr className="bg-bkg-elevated/80">
                {selectMode && (
                    <th className="px-3 py-4 border-b border-white/[0.06] text-center" style={{ width: 44 }}>
                        {cabeceraSeleccion}
                    </th>
                )}
                {cols.map(col => {
                    const orden = sortBy?.key === col.key ? sortBy.dir : null;
                    const movible = !col.fija;
                    const marca = destino?.key === col.key ? destino.antes : null;
                    return (
                        <th
                            key={col.key}
                            data-col={col.key}
                            onPointerDown={e => empezar(col, e)}
                            className={`${col.pad || 'px-4'} py-4 text-[10px] font-black uppercase tracking-[0.15em] border-b border-white/[0.06] relative overflow-visible select-none transition-opacity ${
                                orden ? 'text-brand' : 'text-white/25'
                            } ${moviendo && arrastre.key === col.key ? 'opacity-30' : ''}`}
                            style={{ width: anchos[col.key] ?? col.ancho }}
                        >
                            {/* Dónde va a caer, antes de soltar */}
                            {marca !== null && (
                                <div className={`absolute top-0 bottom-0 w-[3px] bg-brand shadow-[0_0_8px_rgba(255,138,0,0.8)] z-20 ${marca ? 'left-0' : 'right-0'}`} />
                            )}
                            {/* El rótulo ORDENA con el clic y MUEVE con el arrastre. El
                                tercer clic vuelve al orden por prioridad, que es el que
                                la lista tiene por defecto. */}
                            <button
                                type="button"
                                onClick={() => {
                                    if (Date.now() - finArrastre.current < REBOTE_MS) return;   // rebote del arrastre
                                    if (col.valor) onOrdenar(col.key);
                                }}
                                title={[
                                    col.valor ? 'Ordenar por esta columna' : '',
                                    movible ? 'Arrastra para moverla de sitio' : 'Esta columna no se mueve: identifica la fila',
                                ].filter(Boolean).join(' · ')}
                                className={`flex items-center gap-1 uppercase tracking-[0.15em] ${
                                    movible ? 'cursor-grab active:cursor-grabbing' : ''
                                } ${col.valor ? 'hover:text-white/70 transition-colors' : 'cursor-default'}`}
                            >
                                {col.cabecera ? col.cabecera() : col.label}
                                {orden && <span className="text-[8px]">{orden === 'asc' ? '▲' : '▼'}</span>}
                            </button>
                            <Tirador colKey={col.key} />
                        </th>
                    );
                })}
                <th
                    className="px-4 py-4 text-[10px] font-black uppercase tracking-[0.15em] text-white/25 border-b border-white/[0.06] text-right whitespace-nowrap relative overflow-visible"
                    style={{ width: anchoAcciones }}
                >
                    Acciones
                </th>
            </tr>

            {/* Fila de filtros — la declara cada columna, no esta cabecera */}
            <tr className="bg-white/[0.01]">
                {selectMode && <td className="px-3 py-3 border-b border-white/[0.04]"></td>}
                {cols.map(col => (
                    <td key={col.key} className={`${col.pad || 'px-4'} py-3 border-b border-white/[0.04]`}>
                        {col.filtro ? col.filtro(ctx) : null}
                    </td>
                ))}
                <td className="px-4 py-2 border-b border-white/[0.04]"></td>
            </tr>
        </thead>

        {/* La etiqueta que sigue al cursor. Portaleada a `body` (la tabla recorta
            con overflow) y sin captar el puntero, o taparía al `elementFromPoint`
            justo donde hay que leer sobre qué columna estamos. */}
        {moviendo && createPortal(
            <div
                className="fixed z-[900] pointer-events-none px-2.5 py-1 rounded-lg bg-brand text-bkg-deep text-[10px] font-black uppercase tracking-widest shadow-2xl"
                style={{ left: arrastre.x + 12, top: arrastre.y - 10 }}
            >
                {arrastre.label}
            </div>,
            document.body
        )}
        </>
    );
}

export default TablaExpedientesHead;
