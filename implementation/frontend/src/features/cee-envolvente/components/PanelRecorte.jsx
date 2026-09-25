import { areaPoligono } from '../logic/geometriaPlano';

// ─────────────────────────────────────────────────────────────────────────────
// DELIMITAR LA VIVIENDA dentro de una comunidad de adosados.
//
// POR QUÉ EXISTE: en una hilera de adosados la parcela es la del CONJUNTO —dos
// hileras y su calle privada, medido en 26RES060_205: 188 paredes— y Catastro
// no dibuja dónde acaba cada casa. Se dibuja aquí el contorno de la vivienda y
// el motor vuelve a medir: lo de dentro es la casa, y lo construido fuera pasa
// a ser la casa de al lado, así que la pared contra ella sale como MEDIANERA.
//
// Vive en el plano, como la cubierta, porque se marca DIBUJANDO encima.
// Se puede dibujar a ojo por la calle y por el jardín —lo que sobresale del
// edificio no cuenta—: lo que tiene que ir con cuidado son las dos líneas que
// separan la casa de las de al lado.
// ─────────────────────────────────────────────────────────────────────────────

export function RecorteControl({ recorte, dibujando, vertices = [], midiendo = false,
                                 sugerir = false, onDibujar, onQuitar,
                                 onCerrar, onCancelar }) {
    if (dibujando) {
        const m2 = vertices.length >= 3 ? areaPoligono(vertices) : null;
        return (
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border
                            border-emerald-400/50 bg-emerald-400/[0.08] px-3 py-2">
                <b className="text-[11.5px] font-black uppercase tracking-wider text-emerald-300">
                    ✂ Dibuja la vivienda
                </b>
                <span className="text-[11.5px] text-white/75">
                    Pulsa las esquinas de SU parcela y cierra en el primer punto (o doble clic).
                    Por la calle y el jardín puedes pasarte: lo que importa son las dos
                    líneas con las casas de al lado.{' '}
                    <span className="text-white/45">Barra espaciadora + arrastrar mueve el plano. Esc cancela.</span>
                </span>
                <span className="text-[11.5px] tabular-nums text-white/55">
                    {vertices.length} {vertices.length === 1 ? 'vértice' : 'vértices'}
                    {m2 ? ` · ≈${fmt(m2)} m²` : ''}
                </span>
                <span className="ml-auto flex items-center gap-1.5">
                    <button onClick={onCerrar} disabled={vertices.length < 3}
                            className="rounded-md border border-emerald-400/60 bg-emerald-400/15 px-2.5 py-1
                                       text-[10.5px] font-black uppercase tracking-wider text-emerald-300
                                       hover:bg-emerald-400/25 disabled:opacity-40">
                        ✓ Cerrar y medir
                    </button>
                    <button onClick={onCancelar}
                            className="px-1.5 text-[13px] leading-none text-white/60
                                       hover:text-white/90">✕</button>
                </span>
            </div>
        );
    }

    const hay = Array.isArray(recorte?.poligono) && recorte.poligono.length >= 3;
    return (
        <div className={`mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border px-3 py-1.5
            ${hay ? 'border-emerald-400/40 bg-emerald-400/[0.06]'
                  : sugerir ? 'border-amber-400/40 bg-amber-400/[0.06]'
                            : 'border-white/[0.06] bg-white/[0.02]'}`}>
            <span className="text-[9.5px] font-black uppercase tracking-[0.12em] text-white/45"
                  title="Qué parte de lo construido es la vivienda que se certifica">
                Vivienda
            </span>
            {hay ? (
                <>
                    <span className="text-[10.5px] font-bold text-emerald-300">
                        ✂ Delimitada a mano · ≈{fmt(recorte.area_m2 ?? 0)} m² de parcela
                    </span>
                    <span className="text-[10.5px] text-white/50">
                        lo de fuera cuenta como las casas de al lado (medianera)
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                        <Boton onClick={() => onDibujar(true)} disabled={midiendo}>✎ Redibujar</Boton>
                        <Boton onClick={onQuitar} disabled={midiendo}>Quitar</Boton>
                    </span>
                </>
            ) : (
                <>
                    <span className={`text-[10.5px] ${sugerir ? 'text-amber-200/90' : 'text-white/50'}`}>
                        {sugerir
                            ? '¿Es un adosado dentro de una comunidad? Aquí se está midiendo el bloque entero.'
                            : 'Se mide todo lo construido de la parcela.'}
                    </span>
                    <span className="ml-auto">
                        <Boton onClick={() => onDibujar(true)} disabled={midiendo} fuerte={sugerir}>
                            ✂ Delimitar la vivienda
                        </Boton>
                    </span>
                </>
            )}
            {midiendo && <span className="text-[10.5px] text-white/55">volviendo a medir…</span>}
        </div>
    );
}

function Boton({ onClick, disabled, fuerte, children }) {
    return (
        <button onClick={onClick} disabled={disabled}
                className={`rounded-md border px-2 py-1 text-[10.5px] font-bold transition disabled:opacity-40
                    ${fuerte ? 'border-amber-400/60 bg-amber-400/15 text-amber-200 hover:bg-amber-400/25'
                             : 'border-white/10 bg-white/[0.04] text-white/70 hover:bg-white/[0.08] hover:text-white'}`}>
            {children}
        </button>
    );
}

const fmt = n => (Number(n) || 0).toFixed(1).replace('.', ',');

export default RecorteControl;
