// El RÓTULO de una mancha del croquis (o de una zona ya restada), en SVG.
//
// Mismo lenguaje que los rótulos de las paredes del plano: un papel detrás, el
// texto en TINTA y una raya del color del uso debajo. En el color del uso a
// secas no se leía — verde, ámbar y gris sobre papel claro quedan por debajo de
// 3:1— y así la paleta sigue siendo una sola: el color va en la raya y en el
// relleno, no en las letras. Debajo, los m²: es lo que se compara con Catastro.
//
// `tam` es el tamaño base del dibujo (constante en pantalla); el resto, en
// proporción. `papel` y `tinta` los pone quien lo usa: en el móvil el papel es
// claro siempre; en el ordenador sigue al tema.

export function EtiquetaMancha({ cx, cy, titulo, sub = null, color, tam, papel, tinta, tintaSub, escala = 1 }) {
    const f1 = tam * 0.95 * escala;
    const f2 = tam * 0.72 * escala;
    const ancho = Math.max(String(titulo).length * 0.64 * f1,
                           sub ? String(sub).length * 0.58 * f2 : 0) + tam * 0.9 * escala;
    const alto = (sub ? tam * 2.35 : tam * 1.55) * escala;
    const top = cy - alto / 2;
    const linea1 = top + tam * 1.02 * escala;
    return (
        <g style={{ pointerEvents: 'none' }}>
            <rect x={cx - ancho / 2} y={top} width={ancho} height={alto} rx={tam * 0.22 * escala}
                  fill={papel} fillOpacity={0.92} stroke={color} strokeOpacity={0.35}
                  strokeWidth={tam * 0.04 * escala} />
            <text x={cx} y={linea1} fontSize={f1} fontWeight={800} fill={tinta}
                  textAnchor="middle" letterSpacing={f1 * 0.02}>{titulo}</text>
            <rect x={cx - ancho / 2 + tam * 0.3 * escala} y={linea1 + tam * 0.2 * escala}
                  width={ancho - tam * 0.6 * escala} height={tam * 0.12 * escala}
                  rx={tam * 0.06 * escala} fill={color} />
            {sub && (
                <text x={cx} y={top + alto - tam * 0.38 * escala} fontSize={f2} fontWeight={700}
                      fill={tintaSub || tinta} textAnchor="middle">{sub}</text>
            )}
        </g>
    );
}

export default EtiquetaMancha;
