// ─────────────────────────────────────────────────────────────────────────────
// El plano de una planta. Cada pared se pulsa.
//
// TRES COSAS que se aprendieron a base de fallar y que hay que respetar:
//
// 1. El SVG está EN METROS. Un `viewBox` de 21 × 20 son 21 × 20 METROS, así que
//    `strokeWidth: 6` dibuja muros de seis metros de grosor. Los trazos llevan
//    `vectorEffect="non-scaling-stroke"` (grosor en píxeles, siempre) y los
//    textos se escalan con el tamaño del dibujo.
// 2. Las etiquetas SE PISAN cuando cuatro paredes se juntan en una esquina. Se
//    colocan evitando colisiones, la más larga primero, y la seleccionada y la
//    entrada se rotulan siempre aunque no quepan.
// 3. El sótano NO se dibuja: lo filtra `usePlanoEnvolvente`.
// ─────────────────────────────────────────────────────────────────────────────

const COLOR = {
    medido: '#00C853',
    dudoso: '#FFA000',
    falta: 'rgba(255,255,255,0.28)',
    fuera: 'rgba(255,255,255,0.10)',
};

export function PlanoPlanta({ planta, plano }) {
    const { muros, entrada, sel, elegir, esCandidata, esMedianera, estadoDe } = plano;
    const { ancho, alto } = planta;

    // Un tamaño de letra en METROS, proporcional al dibujo: así se lee igual en
    // una casa de 8 m que en una de 40.
    const tam = Math.max(ancho, alto) / 34;
    const rotulos = colocarRotulos(planta, muros, { sel, entrada, tam });

    return (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">
            <div className="mb-2 flex items-baseline gap-2">
                <b className="text-[13px] font-black tracking-wide">{planta.nombre}</b>
                <span className="text-[11px] tabular-nums text-white/35">
                    {planta.superficie
                        ? `${String(planta.superficie).replace('.', ',')} m² · zona`
                        : 'fuera de la envolvente'}
                </span>
            </div>

            <svg viewBox={`0 0 ${ancho} ${alto}`} className="block w-full h-auto"
                 style={{ touchAction: 'manipulation' }}>
                {planta.muros.map(base => {
                    const m = muros[base.id] || base;
                    const [a, b] = [base.svg[0], base.svg[base.svg.length - 1]];
                    const estado = estadoDe(m);
                    const candidato = !entrada && esCandidata(m);
                    return (
                        <g key={base.id}>
                            {m.id === entrada && (
                                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                                      stroke="#FFA000" strokeWidth={14} opacity={0.3}
                                      strokeLinecap="round"
                                      vectorEffect="non-scaling-stroke" />
                            )}
                            <line
                                x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]}
                                stroke={candidato ? '#FFA000' : COLOR[estado]}
                                strokeWidth={m.id === sel ? 10 : candidato ? 9 : 5}
                                strokeLinecap="round"
                                strokeDasharray={esMedianera(m) ? '7 5' : undefined}
                                vectorEffect="non-scaling-stroke"
                                className={`cursor-pointer transition-[stroke-width]
                                            ${candidato ? 'animate-pulse' : ''}`}
                                role="button" tabIndex={0}
                                aria-label={`${m.id}, ${m.orientacion}, ${fmt(m.largo)} metros`}
                                onClick={() => elegir(m.id)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault(); elegir(m.id);
                                    }
                                }} />
                        </g>
                    );
                })}

                {rotulos.map(r => (
                    <text key={r.id} x={r.x} y={r.y} fontSize={tam}
                          fontWeight={700} textAnchor="middle"
                          fill={r.destacado ? '#F0F0F2' : 'rgba(255,255,255,0.40)'}
                          style={{ pointerEvents: 'none' }}>
                        {r.id}
                    </text>
                ))}
            </svg>
        </div>
    );
}

/**
 * Rótulos sin solaparse: primero las paredes largas —que son las que el
 * certificador busca— y la seleccionada y la entrada SIEMPRE, quepan o no.
 */
function colocarRotulos(planta, muros, { sel, entrada, tam }) {
    const puestos = [];
    const salida = [];
    const orden = [...planta.muros].sort((x, y) =>
        (y.id === sel) - (x.id === sel) ||
        (y.id === entrada) - (x.id === entrada) ||
        (y.largo || 0) - (x.largo || 0));

    for (const base of orden) {
        const m = muros[base.id] || base;
        const [a, b] = [base.svg[0], base.svg[base.svg.length - 1]];
        const x = (a[0] + b[0]) / 2;
        const y = (a[1] + b[1]) / 2 + tam * 0.35;
        const forzado = m.id === sel || m.id === entrada;
        const choca = puestos.some(p =>
            Math.abs(p.x - x) < tam * 2.6 && Math.abs(p.y - y) < tam * 1.1);
        if (choca && !forzado) continue;
        puestos.push({ x, y });
        salida.push({ id: m.id, x, y, destacado: forzado });
    }
    return salida;
}

const fmt = n => (Number(n) || 0).toFixed(2).replace('.', ',');

export default PlanoPlanta;
