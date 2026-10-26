// ─── Ayudas de movimiento: todo sale del número de fotograma ────────────────
// Nada de animaciones CSS (las `.ca-in` de la app): Remotion pinta cada
// fotograma por separado y una animación CSS no sabe en qué fotograma está.
import { Easing, interpolate } from 'remotion';

const suave = Easing.bezier(0.2, 0.8, 0.2, 1);

/** 0 → 1 entre `desde` y `desde + dur`, con la curva de la app. */
export const avance = (f, desde, dur = 12) =>
    interpolate(f, [desde, desde + dur], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: suave });

/** Aparece subiendo un poco (como `.ca-in`). */
export const aparece = (f, desde, dur = 14, dy = 14) => {
    const p = avance(f, desde, dur);
    return { opacity: p, transform: `translateY(${(1 - p) * dy}px)` };
};

/** Un dedo que toca: círculo que se encoge y onda que se abre. Va dentro del elemento tocado. */
export function Toque({ f, en }) {
    const t = f - en;
    if (t < -8 || t > 16) return null;
    const baja = interpolate(t, [-8, 0, 4, 16], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const escala = interpolate(t, [-8, 0, 3], [1.25, 0.9, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const onda = interpolate(t, [0, 16], [0.6, 2.4], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const ondaOp = interpolate(t, [0, 16], [0.5, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const base = { position: 'absolute', left: '50%', top: '50%', width: 46, height: 46, marginLeft: -23, marginTop: -23, borderRadius: 999, pointerEvents: 'none', zIndex: 20 };
    return (
        <>
            <span style={{ ...base, border: '3px solid rgba(20,17,17,.55)', transform: `scale(${onda})`, opacity: t >= 0 ? ondaOp : 0 }} />
            <span style={{ ...base, background: 'rgba(20,17,17,.22)', border: '2.5px solid rgba(255,255,255,.95)', boxShadow: '0 4px 14px rgba(20,17,17,.25)', transform: `scale(${escala})`, opacity: baja }} />
        </>
    );
}
