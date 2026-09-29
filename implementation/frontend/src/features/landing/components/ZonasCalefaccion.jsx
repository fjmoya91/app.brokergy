// ─── ZonasCalefaccion.jsx ────────────────────────────────────────────────────
// "¿Dónde tienes calefacción?" — la parte de la ficha del inmueble que decide
// qué superficie se calienta, contada como una PREGUNTA y no como una tabla.
//
// POR QUÉ: el cliente veía una tabla técnica ("Tipo / Planta · Constr. · Útil
// ×0,8") con casillas que no sabía si tocar, en un móvil. Lo normal es que la
// calefacción esté justo en las plantas de vivienda que da el Catastro, así
// que se le enseñan esas y se le pregunta si es así: UN toque en el caso normal.
// Solo si dice que no se le abre la lista completa, porque a veces el Catastro
// llama "almacén" a una planta que en realidad es vivienda (y al revés).
//
// Es solo del flujo PÚBLICO: el interno ("Nueva simulación") conserva la tabla,
// que es más rápida para quien sabe lo que está mirando.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { IconCasa, IconCoche, IconCaja, IconTienda, IconCubierta } from '../../../components/IconosVivienda';

/** Cómo se llama cada tipo de construcción del Catastro, en lenguaje de casa. */
function tipoZona(type) {
    const u = String(type || '').toUpperCase();
    if (u.includes('VIVIENDA')) return { label: 'Vivienda', Icono: IconCasa, vivienda: true };
    if (u.includes('APARCAMIENTO') || u.includes('GARAJE')) return { label: 'Garaje', Icono: IconCoche };
    if (u.includes('ALMACEN') || u.includes('TRASTERO')) return { label: 'Almacén o trastero', Icono: IconCaja };
    if (u.includes('LOCAL') || u.includes('COMERCIO')) return { label: 'Local', Icono: IconTienda };
    if (u.includes('PORCHE') || u.includes('PORCH')) return { label: 'Porche', Icono: IconCubierta };
    if (u.includes('TERRAZA')) return { label: 'Terraza', Icono: IconCubierta };
    const t = String(type || 'Otra zona').toLowerCase();
    return { label: t.charAt(0).toUpperCase() + t.slice(1), Icono: IconCaja };
}

function planta(floor) {
    const n = parseInt(floor, 10);
    if (Number.isNaN(n)) return floor ? `Planta ${floor}` : '';
    if (n < 0) return `Sótano ${Math.abs(n)}`;
    if (n === 0) return 'Planta baja';
    return `Planta ${n}ª`;
}

const m2 = (n) => `${Math.round(n || 0).toLocaleString('es-ES')} m²`;

/** Una zona: dibujo, qué es y en qué planta, y sus m². Con casilla si se puede marcar. */
function Zona({ c, marcada, conCasilla, onClick }) {
    const { label, Icono, vivienda } = tipoZona(c.type);
    const Contenedor = conCasilla ? 'button' : 'div';
    return (
        <Contenedor type={conCasilla ? 'button' : undefined} onClick={onClick} aria-pressed={conCasilla ? marcada : undefined}
            // Fondo SÓLIDO: detrás está el fondo animado de la página, y a través de
            // una tarjeta transparente las líneas se cruzan con el texto.
            className={`w-full text-left flex items-center gap-3 p-3.5 rounded-2xl border-2 bg-bkg-surface/95 transition-colors ${
                marcada ? 'border-amber-400/70' : 'border-white/10'
            } ${conCasilla ? 'hover:border-amber-400/40' : ''}`}>
            <span className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${
                marcada ? 'bg-amber-400/15 text-amber-400' : vivienda ? 'bg-emerald-500/10 text-emerald-400' : 'bg-white/[0.06] text-white/70'
            }`}>
                <Icono className="w-8 h-8" />
            </span>
            <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-bold leading-snug ${marcada ? 'text-amber-300' : 'text-white'}`}>{label}</span>
                <span className="block text-[13px] text-white/70">{planta(c.floor)}</span>
            </span>
            <span className={`shrink-0 text-[15px] font-black tabular-nums ${marcada ? 'text-white' : 'text-white/70'}`}>{m2(c.surface)}</span>
            {conCasilla && (
                <span className={`shrink-0 w-6 h-6 rounded-md border-2 flex items-center justify-center ${marcada ? 'bg-amber-400 border-amber-400' : 'border-white/30'}`} aria-hidden="true">
                    {marcada && (
                        <svg className="w-3.5 h-3.5 text-bkg-deep" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" /></svg>
                    )}
                </span>
            )}
        </Contenedor>
    );
}

/**
 * @param {Array}    constructions   las del Catastro ({ type, floor, surface })
 * @param {number[]} seleccion       índices marcados
 * @param {function} setSeleccion
 * @param {number[]} porDefecto      lo que se propone (las de vivienda, o todas)
 * @param {function} onContinuar     sigue con la selección actual
 */
export function ZonasCalefaccion({ constructions, seleccion, setSeleccion, porDefecto, onContinuar }) {
    const [ajustar, setAjustar] = useState(false);

    const propuestas = porDefecto.map(i => ({ c: constructions[i], i }));
    const hayOtras = constructions.length > porDefecto.length;
    const todasSonVivienda = propuestas.every(({ c }) => tipoZona(c?.type).vivienda);

    // En la lista completa, lo propuesto primero: es lo que casi siempre se queda.
    const orden = [
        ...porDefecto,
        ...constructions.map((_, i) => i).filter(i => !porDefecto.includes(i)),
    ];
    const total = constructions.filter((_, i) => seleccion.includes(i)).reduce((a, c) => a + (c.surface || 0), 0);
    const cambia = (i) => setSeleccion(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]));

    if (!ajustar) {
        return (
            <div>
                <h2 className="text-xl font-black text-white leading-tight tracking-tight">¿Dónde tienes calefacción?</h2>
                <p className="text-[14px] text-white/70 mt-2 leading-relaxed">
                    {todasSonVivienda ? 'Según el Catastro, tu vivienda es esto:' : 'Según el Catastro, tu inmueble tiene estas zonas:'}
                </p>
                <div className="mt-4 space-y-2.5">
                    {propuestas.map(({ c, i }) => <Zona key={i} c={c} marcada={false} />)}
                </div>
                <p className="text-[15px] font-bold text-white mt-5">
                    ¿Tienes calefacción en {propuestas.length === 1 ? 'esta zona' : 'estas zonas'}, y solo en {propuestas.length === 1 ? 'esta' : 'estas'}?
                </p>
                <div className="mt-3 space-y-2.5">
                    <button type="button" onClick={() => { setSeleccion(porDefecto); onContinuar(porDefecto); }}
                        className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-3">
                        Sí, es correcto
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
                    </button>
                    <button type="button" onClick={() => setAjustar(true)}
                        className="w-full py-3.5 rounded-2xl border-2 border-white/15 text-white font-bold text-[14px] hover:border-amber-400/50 transition-colors">
                        {hayOtras ? 'No, también en otras zonas' : 'No, alguna no tiene calefacción'}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div>
            <button type="button" onClick={() => { setSeleccion(porDefecto); setAjustar(false); }}
                className="-ml-1 mb-3 flex items-center gap-1.5 text-[13px] font-bold text-white/70 hover:text-amber-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                Volver
            </button>
            <h2 className="text-xl font-black text-white leading-tight tracking-tight">Marca dónde tienes calefacción</h2>
            <p className="text-[14px] text-white/70 mt-2 leading-relaxed">
                Toca cada zona para marcarla o desmarcarla. A veces el Catastro llama «almacén» a una planta que en realidad es vivienda.
            </p>
            <div className="mt-4 space-y-2.5">
                {orden.map(i => (
                    <Zona key={i} c={constructions[i]} marcada={seleccion.includes(i)} conCasilla onClick={() => cambia(i)} />
                ))}
            </div>
            <div className="mt-4 flex items-baseline justify-between px-1">
                <span className="text-[13px] text-white/70">Superficie con calefacción</span>
                <span className="text-lg font-black text-white tabular-nums">
                    {m2(total)} <span className="text-[12px] font-bold text-white/60">≈ {m2(total * 0.8)} útiles</span>
                </span>
            </div>
            <button type="button" onClick={() => onContinuar(seleccion)} disabled={seleccion.length === 0}
                className="mt-4 w-full py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-bkg-deep font-black uppercase tracking-widest text-sm shadow-lg shadow-amber-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-3">
                {seleccion.length === 0 ? 'Marca al menos una zona' : 'Continuar'}
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" /></svg>
            </button>
        </div>
    );
}

export default ZonasCalefaccion;
