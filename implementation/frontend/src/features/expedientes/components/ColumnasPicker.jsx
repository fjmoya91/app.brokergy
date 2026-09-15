import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { COLUMNAS, GRUPOS, PRESETS, COLUMNAS_POR_DEFECTO, puedeVer } from '../logic/expedientesColumnas';

// ─── QUÉ COLUMNAS SE VEN ──────────────────────────────────────────────────────
// Un botón con el CONTADOR a la vista ("Columnas · 7"), no un icono mudo: es lo
// que explica por qué esta tabla no se parece a la que recuerda quien la dejó
// con otras columnas.
//
// REGLA — el orden de las columnas lo fija el REGISTRO, no el orden en que se
// marcan. Si cada usuario pudiera reordenarlas, la misma pantalla contada por
// teléfono ("mira la tercera columna") dejaría de significar lo mismo; y el nº
// de expediente podría acabar el último, que es donde no sirve para nada.
//
// REGLA — un filtro activo NO puede esconderse al ocultar su columna. Al
// quitarla se limpia su filtro: una lista recortada por algo que no se ve en
// ninguna parte es la peor forma de quedarse a cero resultados.

const CARD = 'rounded-2xl border bg-bkg-deep border-white/10 shadow-2xl';

function Casilla({ col, marcada, onToggle }) {
    return (
        <button
            type="button"
            onClick={() => onToggle(col.key)}
            disabled={col.fija}
            className={`w-full flex items-start gap-2.5 px-2 py-1.5 rounded-lg text-left transition-colors ${
                col.fija ? 'opacity-40 cursor-default' : 'hover:bg-white/[0.05]'
            }`}
            title={col.fija ? 'Esta columna no se puede quitar' : ''}
        >
            <span className={`mt-[1px] w-4 h-4 shrink-0 rounded border flex items-center justify-center text-[10px] font-black transition-colors ${
                marcada ? 'bg-brand border-brand text-black' : 'border-white/20 text-transparent'
            }`}>
                ✓
            </span>
            <span className="min-w-0 flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-white/80 leading-tight">
                    {col.etiquetaPicker || col.label}
                </span>
                {/* El embudo dice que esa columna trae su propio filtro en la
                    tabla. Escrito con todas las letras en cada casilla (eran 20)
                    el panel se leía como una lista de advertencias. */}
                {col.filtro && (
                    <svg className="w-2.5 h-2.5 shrink-0 text-white/25" fill="none" viewBox="0 0 24 24" stroke="currentColor" title="Trae filtro">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />
                    </svg>
                )}
            </span>
        </button>
    );
}

export function ColumnasPicker({ visibles, onChange, rol }) {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState(null);
    const botonRef = useRef(null);
    const panelRef = useRef(null);

    const disponibles = COLUMNAS.filter(c => puedeVer(c, rol));
    const marcadas = new Set(visibles);

    useLayoutEffect(() => {
        if (!open) return;
        const recolocar = () => {
            const b = botonRef.current?.getBoundingClientRect();
            if (!b) return;
            const ANCHO = 560, ALTO = 460, M = 8;
            let left = b.right - ANCHO;                       // anclado por la derecha
            left = Math.max(M, Math.min(left, window.innerWidth - ANCHO - M));
            const abajo = b.bottom + 8;
            const top = abajo + ALTO > window.innerHeight - M
                ? Math.max(M, window.innerHeight - ALTO - M)
                : abajo;
            setPos({ top, left });
        };
        recolocar();
        window.addEventListener('resize', recolocar);
        window.addEventListener('scroll', recolocar, true);
        return () => {
            window.removeEventListener('resize', recolocar);
            window.removeEventListener('scroll', recolocar, true);
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onDown = (e) => {
            if (panelRef.current?.contains(e.target)) return;
            if (botonRef.current?.contains(e.target)) return;
            setOpen(false);
        };
        const onEsc = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDown);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDown);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const toggle = (key) => {
        const col = disponibles.find(c => c.key === key);
        if (!col || col.fija) return;
        onChange(marcadas.has(key) ? visibles.filter(k => k !== key) : [...visibles, key]);
    };

    const aplicarPreset = (preset) => onChange(preset.cols.filter(k => {
        const col = disponibles.find(c => c.key === k);
        return !!col;
    }));

    // El preset se marca como activo solo si coincide EXACTAMENTE con lo visible
    // (sin contar el orden): decir "Económica" sobre una vista retocada haría
    // creer que se está mirando otra cosa.
    const presetActivo = PRESETS.find(p => {
        const suyas = p.cols.filter(k => disponibles.some(c => c.key === k));
        const puestas = visibles.filter(k => disponibles.some(c => c.key === k));
        return suyas.length === puestas.length && suyas.every(k => marcadas.has(k));
    });

    // El contador cuenta lo que SE VE, no lo que hay guardado: a un rol que no
    // puede ver la mitad de las columnas, "Columnas · 7" sobre una tabla de tres
    // le dice que le faltan cuatro por algún fallo.
    const total = visibles.filter(k => disponibles.some(c => c.key === k)).length;

    return (
        <>
            <button
                ref={botonRef}
                onClick={() => setOpen(o => !o)}
                title="Elegir qué columnas se ven"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border ${
                    open ? 'text-brand border-brand/40 bg-brand/10'
                         : 'text-white/40 border-transparent hover:text-white/80 hover:bg-white/5 hover:border-white/10'
                }`}
            >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 5h16M4 5v14M10 5v14M16 5v14M20 5v14M4 19h16" />
                </svg>
                Columnas · {total}
                {presetActivo && <span className="text-white/30 normal-case tracking-normal">({presetActivo.nombre})</span>}
            </button>

            {open && createPortal(
                <div
                    ref={panelRef}
                    className={`${CARD} fixed z-[600] w-[560px] max-h-[460px] flex flex-col text-left`}
                    style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
                >
                    <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                        <div className="flex items-center justify-between">
                            <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-white/70">Columnas de la tabla</h4>
                            <button onClick={() => setOpen(false)} className="text-white/30 hover:text-white text-lg leading-none">×</button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {PRESETS.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => aplicarPreset(p)}
                                    title={p.descripcion}
                                    className={`px-2 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
                                        presetActivo?.id === p.id
                                            ? 'bg-brand/15 border-brand/50 text-brand'
                                            : 'border-white/10 text-white/40 hover:text-white hover:border-white/25'
                                    }`}
                                >
                                    {p.nombre}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-y-auto px-3 py-2 grid grid-cols-3 gap-x-3 gap-y-1">
                        {GRUPOS.map(grupo => {
                            const cols = disponibles.filter(c => c.grupo === grupo);
                            if (!cols.length) return null;
                            return (
                                <div key={grupo} className="mb-2">
                                    <p className="px-2 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-white/25">{grupo}</p>
                                    {cols.map(col => (
                                        <Casilla key={col.key} col={col} marcada={marcadas.has(col.key)} onToggle={toggle} />
                                    ))}
                                </div>
                            );
                        })}
                    </div>

                    <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between">
                        <span className="text-[10px] text-white/30">
                            Se guarda en este navegador · el orden lo fija la app
                        </span>
                        <button
                            onClick={() => onChange([...COLUMNAS_POR_DEFECTO])}
                            className="text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-brand transition-colors"
                        >
                            Restaurar
                        </button>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}

export default ColumnasPicker;
