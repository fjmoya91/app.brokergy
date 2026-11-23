// ─── Una fila que se DESLIZA a la izquierda y enseña la papelera (23/11/2026) ─────────────
// Fran: «en el teléfono, desplazando hacia un lado que aparezca la papelera, y si se pulsa
// borrar, que salte un popup para confirmar». Solo con el DEDO (touch/pen): con el ratón no se
// arrastra —en el PC se borra desde dentro del presupuesto—. El scroll vertical lo sigue
// haciendo el navegador (`touch-action: pan-y`): el gesto solo se queda con lo que va de lado.
// La papelera NO borra: llama a `onBorrar`, que abre la confirmación.
//   abierta · onAbrir() · onCerrar() · onBorrar() · etiqueta (lo que lee el lector de pantalla)
import React, { useRef, useState } from 'react';
import { Icono } from './piezas';

export const ANCHO_PAPELERA = 92;
const UMBRAL = 10; // px antes de decidir si el gesto es de lado o de arriba abajo

/** Pura (para el test): a dónde se queda la fila al soltar. */
export function alSoltar(desplazado, ancho = ANCHO_PAPELERA) {
    return desplazado < -ancho / 2 ? 'abierta' : 'cerrada';
}

export const CSS_DESLIZA = `
.ia-desliza{position:relative;overflow:hidden;display:flex;flex-direction:column}
.ia-desliza-frente{position:relative;flex:1 1 auto;display:flex;background:#fff;touch-action:pan-y;transition:transform .22s cubic-bezier(.2,.8,.2,1);will-change:transform}
.ia-desliza-frente>.ia-fila{flex:1 1 auto}
.ia-desliza-frente.arrastra{transition:none}
.ia-desliza-borrar{position:absolute;top:0;right:0;bottom:0;width:${ANCHO_PAPELERA}px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
  border:0;background:var(--naranja-txt);color:#fff;font:700 13px/1 'Inter',system-ui,sans-serif;cursor:pointer}
.ia-desliza-borrar:focus-visible{outline:3px solid #fff;outline-offset:-6px}
.ia-desliza-pista{display:none;margin:-4px 4px 10px;font-size:13px;color:var(--gris)}
@media (hover:none) and (pointer:coarse){.ia-desliza-pista{display:block}}
@media (min-width:1024px){
  .ia-card.lista.ia-rejilla-filas>.ia-desliza{border-radius:18px;border:1px solid var(--linea);box-shadow:0 1px 2px rgba(20,17,17,.04)}
  .ia-rejilla-filas>.ia-desliza .ia-fila{padding:10px 14px;border-top:0}
  .ia-rejilla-filas>.ia-desliza:hover{border-color:rgba(20,17,17,.24)}
}
`;

export function FilaDeslizable({ abierta = false, onAbrir, onCerrar, onBorrar, etiqueta = 'Borrar', children }) {
    const [dx, setDx] = useState(null); // mientras se arrastra; null = en reposo
    const gesto = useRef(null);
    const arrastrado = useRef(false);

    const abajo = (e) => {
        arrastrado.current = false;
        if (e.pointerType === 'mouse' || (e.button != null && e.button !== 0)) return;
        gesto.current = { id: e.pointerId, x: e.clientX, y: e.clientY, base: abierta ? -ANCHO_PAPELERA : 0, modo: null, v: null };
    };
    const mueve = (e) => {
        const g = gesto.current;
        if (!g || g.id !== e.pointerId) return;
        const mx = e.clientX - g.x;
        const my = e.clientY - g.y;
        if (!g.modo) {
            if (Math.abs(mx) > UMBRAL && Math.abs(mx) > Math.abs(my) * 1.2) {
                g.modo = 'lado';
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura, sigue igual */ }
            } else if (Math.abs(my) > UMBRAL) { gesto.current = null; return; } else return;
        }
        // Un poco de goma más allá de la papelera; hacia la derecha, nada.
        const v = Math.max(-ANCHO_PAPELERA - 28, Math.min(0, g.base + mx));
        g.v = v;
        setDx(v);
    };
    const suelta = () => {
        const g = gesto.current;
        gesto.current = null;
        if (!g || g.modo !== 'lado') return;
        arrastrado.current = true;
        setDx(null);
        if (alSoltar(g.v ?? g.base) === 'abierta') onAbrir?.(); else onCerrar?.();
    };
    const cancela = () => { gesto.current = null; setDx(null); };
    // Tras arrastrar no se abre la ficha; con la papelera a la vista, tocar la fila la cierra.
    const clic = (e) => {
        if (arrastrado.current || abierta) {
            e.preventDefault(); e.stopPropagation();
            if (!arrastrado.current) onCerrar?.();
            arrastrado.current = false;
        }
    };

    const x = dx ?? (abierta ? -ANCHO_PAPELERA : 0);
    return (
        <div className="ia-desliza">
            <button type="button" className="ia-desliza-borrar" onClick={onBorrar} tabIndex={abierta ? 0 : -1} aria-hidden={abierta ? undefined : 'true'} aria-label={etiqueta}>
                <Icono n="papelera" size={22} />
                Borrar
            </button>
            <div className={`ia-desliza-frente${dx != null ? ' arrastra' : ''}`} style={{ transform: x ? `translateX(${x}px)` : undefined }}
                onPointerDown={abajo} onPointerMove={mueve} onPointerUp={suelta} onPointerCancel={cancela} onClickCapture={clic}>
                {children}
            </div>
        </div>
    );
}
