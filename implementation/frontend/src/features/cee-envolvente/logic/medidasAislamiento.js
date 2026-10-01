// ============================================================================
// medidasAislamiento.js — medidas de mejora de ENVOLVENTE para el CEE:
// aislamiento de cubierta y de fachada, con su solución constructiva y su texto.
//
// FUENTE ÚNICA del popup «Generar el CEE final» y del backend
// (`services/cee/ceeFinalDesdeMedida.js`, que la carga por import() ESM): el
// texto que se ve en pantalla es el que se escribe en el .cex. Puro: sin React
// ni nada del navegador.
//
// REGLA — la medida se escribe en modo «Características del aislamiento
// añadido» (λ + espesor), no con una U a secas: CE3X calcula entonces la U de
// CADA cerramiento con su U de partida (`U' = 1/(1/U + e/λ)`, comprobado en el
// corpus), y el texto puede decir qué material y qué espesor se ponen — que es
// lo que hace de la recomendación algo profesional y no un número.
//
// REGLA — los λ son valores de catálogo habituales de cada material; el
// espesor es una propuesta y se cambia en el popup. Nada de esto sale del
// edificio: sale de la solución elegida, y el texto lo dice con sus cifras.
// ============================================================================

//: Cada elemento: qué cerramientos del .cex toca y cómo se llama la medida.
//: `tipo` es el de la radiografía del .cex (una medianera ya viene aparte como
//: «Medianera» y nunca se aísla: es adiabática).
export const ELEMENTOS_AISLAMIENTO = {
    cubierta: {
        tipo: 'Cubierta',
        titulo: 'Aislamiento térmico en cubierta',
        conjunto: 'AISLAMIENTO TÉRMICO EN CUBIERTA',
        medida: 'AISLAMIENTO CUBIERTA',
        porDefecto: 'lana_forjado',
    },
    fachada: {
        tipo: 'Fachada',
        titulo: 'Aislamiento térmico en fachada',
        conjunto: 'AISLAMIENTO TÉRMICO EN FACHADA',
        medida: 'AISLAMIENTO FACHADA',
        porDefecto: 'sate',
    },
};

const num = (x, d = 2) => Number(x).toFixed(d).replace('.', ',');
const lam = (x) => num(x, 3);

/** El rango de U de un grupo de cerramientos, en texto: «U = 0,45» o «U entre 0,45 y 0,66».
 *  Sin rayas ni letras griegas: el texto va a un .cex, que se guarda en latin-1. */
function rangoU(us) {
    const vals = [...new Set(us.filter((u) => u > 0).map((u) => num(u)))];
    if (!vals.length) return '—';
    if (vals.length === 1) return `U = ${vals[0]}`;
    const ns = us.filter((u) => u > 0);
    return `U entre ${num(Math.min(...ns))} y ${num(Math.max(...ns))}`;
}

//: Las soluciones de cada elemento. `texto` recibe {e, l, u0, u1} ya en texto.
export const SOLUCIONES_AISLAMIENTO = {
    cubierta: [
        {
            id: 'lana_forjado',
            etiqueta: 'Lana mineral sobre el último forjado (bajo cubierta)',
            lambda: 0.035, espesorCm: 12, exterior: true,
            texto: ({ e, l, u0, u1 }) =>
                `Mejora del aislamiento térmico de la cubierta mediante la colocación de mantas de lana mineral `
                + `de ${e} cm de espesor y conductividad térmica de ${l} W/m·K sobre el último forjado, en el `
                + 'espacio bajo cubierta no habitable, con barrera de vapor en la cara caliente y sin interrumpir la '
                + `ventilación del bajo cubierta. La transmitancia térmica de la cubierta pasa de ${u0} a ${u1} W/m²·K. `
                + 'Es una actuación rápida y sin obra en el interior de la vivienda, que reduce las pérdidas de calor en '
                + 'invierno y las ganancias en verano a través del techo, el cerramiento más expuesto del edificio.',
            otros: 'Actuación de ejecución rápida y bajo coste por m². Vida útil estimada de la mejora superior a 50 años.',
        },
        {
            id: 'xps_invertida',
            etiqueta: 'Cubierta invertida con XPS (por el exterior)',
            lambda: 0.034, espesorCm: 8, exterior: true,
            texto: ({ e, l, u0, u1 }) =>
                'Mejora del aislamiento térmico de la cubierta por el exterior, en solución de cubierta invertida: '
                + `colocación de planchas rígidas de poliestireno extruido (XPS) de ${e} cm de espesor y conductividad `
                + `térmica de ${l} W/m·K sobre la impermeabilización, con capa separadora geotextil y protección pesada `
                + `(grava o solado flotante). La transmitancia térmica de la cubierta pasa de ${u0} a ${u1} W/m²·K. `
                + 'Reduce las pérdidas de calor en invierno y el sobrecalentamiento en verano, protege la '
                + 'impermeabilización frente a los ciclos térmicos y se ejecuta sin afectar al uso interior de la vivienda.',
            otros: 'Se recomienda ejecutarla coincidiendo con la renovación de la impermeabilización. '
                + 'Vida útil estimada de la mejora superior a 50 años.',
        },
        {
            id: 'insuflado_cubierta',
            etiqueta: 'Insuflado de aislante en la cámara de la cubierta',
            lambda: 0.038, espesorCm: 10, exterior: true,
            texto: ({ e, l, u0, u1 }) =>
                'Mejora del aislamiento térmico de la cubierta mediante el insuflado de lana mineral '
                + `(conductividad térmica de ${l} W/m·K) en la cámara existente bajo el tablero, hasta un espesor medio de ${e} cm, a través `
                + 'de pequeñas perforaciones que se sellan al terminar. La transmitancia térmica de la cubierta pasa de '
                + `${u0} a ${u1} W/m²·K. Actuación mínimamente invasiva, que no modifica el acabado de la cubierta ni el `
                + 'interior de la vivienda y reduce de forma notable las pérdidas de calor a través del techo.',
            otros: 'Actuación sin obra, ejecutable en una jornada. Vida útil estimada de la mejora superior a 50 años.',
        },
    ],
    fachada: [
        {
            id: 'sate',
            etiqueta: 'SATE por el exterior (EPS grafitado)',
            lambda: 0.032, espesorCm: 8, exterior: true,
            texto: ({ e, l, u0, u1 }) =>
                'Rehabilitación térmica de las fachadas mediante un sistema de aislamiento térmico por el exterior '
                + `(SATE): paneles de poliestireno expandido grafitado (EPS) de ${e} cm de espesor y conductividad `
                + `térmica de ${l} W/m·K, adheridos y fijados mecánicamente al soporte, con mortero de armadura `
                + 'reforzado con malla de fibra de vidrio y revestimiento de acabado. La transmitancia térmica de las '
                + `fachadas pasa de ${u0} a ${u1} W/m²·K. Al trabajar desde el exterior envuelve de forma continua los `
                + 'cantos de forjado y los pilares, reduce sus puentes térmicos y el riesgo de condensaciones, renueva '
                + 'el acabado de la fachada y no resta superficie útil a la vivienda.',
            otros: 'Requiere andamiaje y licencia de obra. Vida útil estimada de la mejora superior a 50 años.',
        },
        {
            id: 'insuflado_camara',
            etiqueta: 'Insuflado en la cámara de aire de la fachada',
            lambda: 0.038, espesorCm: 5, exterior: false,
            texto: ({ e, l, u0, u1 }) =>
                'Mejora del aislamiento térmico de las fachadas mediante el relleno de la cámara de aire con lana '
                + `mineral insuflada (conductividad térmica de ${l} W/m·K), con un espesor de ${e} cm, a través de perforaciones que se `
                + `sellan al terminar. La transmitancia térmica de las fachadas pasa de ${u0} a ${u1} W/m²·K. `
                + 'Actuación rápida y sin obra: no altera el acabado exterior, no reduce la superficie útil y mejora el '
                + 'confort junto a los muros.',
            otros: 'Solo aplicable a fachadas de doble hoja con cámara de aire. Vida útil estimada de la mejora superior a 50 años.',
        },
        {
            id: 'trasdosado',
            etiqueta: 'Trasdosado interior con lana mineral',
            lambda: 0.035, espesorCm: 5, exterior: false,
            texto: ({ e, l, u0, u1 }) =>
                'Mejora del aislamiento térmico de las fachadas por el interior mediante un trasdosado autoportante '
                + `de placa de yeso laminado con lana mineral de ${e} cm de espesor (conductividad térmica de ${l} W/m·K) y barrera de `
                + `vapor. La transmitancia térmica de las fachadas pasa de ${u0} a ${u1} W/m²·K. Solución adecuada `
                + 'cuando la fachada no puede intervenirse por el exterior; reduce las pérdidas de calor y la '
                + 'sensación de pared fría en las estancias.',
            otros: 'Reduce ligeramente la superficie útil de las estancias afectadas. '
                + 'Vida útil estimada de la mejora superior a 50 años.',
        },
    ],
};

/** La U de un cerramiento al añadirle una capa de aislante (la cuenta de CE3X). */
export function uConAislante(u0, lambda, espesorM) {
    return 1 / (1 / Number(u0) + Number(espesorM) / Number(lambda));
}

/** Los cerramientos del .cex (radiografía) que toca un elemento. */
export function cerramientosDe(elemento, cerramientos = []) {
    const tipo = ELEMENTOS_AISLAMIENTO[elemento]?.tipo;
    return (cerramientos || []).filter((c) => c?.tipo === tipo && Number(c.u) > 0);
}

/**
 * La medida de aislamiento de un elemento, lista para el catálogo del popup y
 * para el motor: `datos` es la ficha que escribe `construir_medida_aislamiento`.
 */
export function medidaAislamiento({ elemento, solucion = null, espesorCm = null, lambda = null,
                                    cerramientos = [] } = {}) {
    const el = ELEMENTOS_AISLAMIENTO[elemento];
    if (!el) throw new Error(`elemento de aislamiento no contemplado: ${elemento}`);
    const soluciones = SOLUCIONES_AISLAMIENTO[elemento];
    const sol = soluciones.find((s) => s.id === solucion) || soluciones.find((s) => s.id === el.porDefecto);
    const e = Number(espesorCm) > 0 ? Number(espesorCm) : sol.espesorCm;
    const l = Number(lambda) > 0 ? Number(lambda) : sol.lambda;
    const afectados = cerramientosDe(elemento, cerramientos);
    const base = {
        id: `aislamiento_${elemento}`,
        titulo: el.titulo,
        elemento,
        soluciones: soluciones.map((s) => ({ id: s.id, etiqueta: s.etiqueta, lambda: s.lambda, espesorCm: s.espesorCm })),
        solucion: sol.id,
        espesorCm: e,
        lambda: l,
    };
    if (!afectados.length) {
        return { ...base, disponible: false, datos: null,
                 motivo: `El edificio no tiene ningún cerramiento de tipo ${el.tipo.toLowerCase()} que aislar.` };
    }
    const u0s = afectados.map((c) => Number(c.u));
    const u1s = u0s.map((u) => uConAislante(u, l, e / 100));
    const superficie = afectados.reduce((t, c) => t + (Number(c.superficie) || 0), 0);
    const t = { e: String(e).replace('.', ','), l: lam(l), u0: rangoU(u0s), u1: rangoU(u1s).replace(/^U (= )?/, '') };
    return {
        ...base,
        disponible: true,
        motivo: null,
        u_antes: u0s, u_despues: u1s, superficie: Math.round(superficie * 100) / 100,
        cerramientos: afectados.map((c) => c.nombre),
        datos: {
            nombre: el.conjunto,
            caracteristicas: sol.texto(t),
            otros_datos: sol.otros,
            aislamiento: [{
                nombre: el.medida, elementos: [elemento], modo: 'lambda',
                lambda: l, espesor: e / 100, exterior: sol.exterior,
            }],
        },
    };
}
