// ─── IndiceSecciones — la barra fija de «Ir a…» de una página larga ─────────
// Fran (26/10/2026): «hay que hacer demasiado scroll; una serie de botones que te
// lleven directamente a cada parte… imagínate que estás en la visita: en
// cualquier momento debes poder ir a la foto de la fachada o de la caldera».
// Se queda pegada debajo de la barra de la app (mide su alto: cambia con el
// notch y al girar), marca dónde estás y, al pulsar, baja hasta allí. Va como
// hija DIRECTA de la columna de la página: dentro de una `.ca-card` no se pega
// (la tarjeta lleva `overflow:hidden`).
import { useEffect, useRef, useState } from 'react';
import { IcoCheck } from '../ui/Iconos';

/**
 * @param {{ id: string, label: string, hecho?: boolean, n?: number }[]} items  `id`: el del elemento al que baja
 * @param {string} etiqueta  para el lector de pantalla
 */
export function IndiceSecciones({ items, etiqueta = 'Ir a' }) {
    const [arriba, setArriba] = useState(0);
    const [activa, setActiva] = useState(null);
    const navRef = useRef(null);
    const ids = items.map(i => i.id).join('|');

    // El alto de la barra de la app.
    useEffect(() => {
        const bar = document.querySelector('.ca-bar');
        if (!bar || typeof ResizeObserver === 'undefined') return undefined;
        const ro = new ResizeObserver(() => setArriba(Math.round(bar.getBoundingClientRect().height)));
        ro.observe(bar);
        return () => ro.disconnect();
    }, []);

    // Dónde estás: la última sección que ya ha pasado por debajo de la barra.
    useEffect(() => {
        const lista = ids.split('|').filter(Boolean);
        let raf = 0;
        const mirar = () => {
            raf = 0;
            const linea = arriba + (navRef.current?.offsetHeight || 0) + 24;
            let act = lista[0] || null;
            for (const id of lista) {
                const el = document.getElementById(id);
                if (el && el.getBoundingClientRect().top <= linea) act = id;
            }
            // Al llegar abajo del todo, la última que se ve (si no, nunca se marcaría).
            if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
                const vistas = lista.filter(id => (document.getElementById(id)?.getBoundingClientRect().top ?? Infinity) < window.innerHeight);
                if (vistas.length) act = vistas[vistas.length - 1];
            }
            setActiva(act);
        };
        const alMover = () => { if (!raf) raf = requestAnimationFrame(mirar); };
        window.addEventListener('scroll', alMover, { passive: true });
        window.addEventListener('resize', alMover);
        alMover();
        return () => {
            window.removeEventListener('scroll', alMover);
            window.removeEventListener('resize', alMover);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [ids, arriba]);

    // La marcada, siempre a la vista dentro de la barra (en el móvil se desliza).
    useEffect(() => {
        const nav = navRef.current;
        const b = nav?.querySelector(`[data-id="${CSS.escape(activa || '')}"]`);
        if (!nav || !b || nav.scrollWidth <= nav.clientWidth) return;
        nav.scrollTo({ left: b.offsetLeft - (nav.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' });
    }, [activa]);

    const ir = (id) => {
        const el = document.getElementById(id);
        if (!el) return;
        const y = el.getBoundingClientRect().top + window.scrollY - arriba - (navRef.current?.offsetHeight || 0) - 12;
        const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        window.scrollTo({ top: Math.max(0, y), behavior: quieto ? 'auto' : 'smooth' });
        setActiva(id);
    };

    if (items.length < 2) return null;
    return (
        <nav ref={navRef} className="ca-indice" style={{ top: arriba }} aria-label={etiqueta}>
            {items.map(it => (
                <button key={it.id} type="button" data-id={it.id} onClick={() => ir(it.id)}
                    className={`ca-indice-chip${activa === it.id ? ' ca-indice-act' : ''}${it.hecho ? ' ca-indice-hecho' : ''}`}
                    aria-current={activa === it.id ? 'location' : undefined}>
                    {it.hecho && <IcoCheck size={13} strokeWidth={3} />}
                    {it.label}
                    {it.n != null && <small>{it.n}</small>}
                </button>
            ))}
        </nav>
    );
}

export default IndiceSecciones;
