// ─────────────────────────────────────────────────────────────────────────────
// TARIFAS DE VERIFICACIÓN — lo que el verificador dice que cuesta, por tramos.
//
// El verificador no cobra por lote: cobra por NÚMERO DE ACTUACIONES, y con
// escalón — cuantas más van juntas, menos sale cada una. La tarifa orientativa
// que pasa Marwen (09/2026) es:
//
//      1 actuación  →   900 €      (900 €/act)
//      5            → 2.000 €      (400 €/act)
//     10            → 3.600 €      (360 €/act)
//     15            → 4.400 €      (293 €/act)
//
// Esto NO es lo que se paga: es la referencia contra la que se compara la oferta
// y la factura que llegan después. Por eso vive en la ficha del verificador y no
// en el lote — es un acuerdo con esa empresa, no un dato de un expediente.
//
// El módulo es PURO y sin imports: lo carga también el backend por import() ESM
// (un import relativo sin extensión lo resuelve vite pero no Node).
//
// ⚠ Todos los importes son BASE IMPONIBLE, sin IVA, como el resto de la app.
// ─────────────────────────────────────────────────────────────────────────────

/** Tolerancia con la que se da por buena una oferta frente a la tarifa (%). */
export const TOLERANCIA_PCT = 10;

const num = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

const eur = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Deja los tramos en forma canónica: números, ordenados y sin repetir el mismo
 * nº de actuaciones. Se ordena SIEMPRE, aunque se hayan tecleado desordenados:
 * la interpolación recorre la tabla de abajo arriba y con un tramo fuera de
 * sitio devolvería un importe que no está en ninguna fila.
 */
export function normalizarTramos(tramos) {
    const vistos = new Set();
    return (Array.isArray(tramos) ? tramos : [])
        .map((t) => ({ actuaciones: num(t?.actuaciones), importe: num(t?.importe) }))
        .filter((t) => t.actuaciones != null && t.importe != null
            && t.actuaciones >= 1 && t.importe >= 0)
        .map((t) => ({ actuaciones: Math.round(t.actuaciones), importe: eur(t.importe) }))
        .filter((t) => (vistos.has(t.actuaciones) ? false : vistos.add(t.actuaciones)))
        .sort((a, b) => a.actuaciones - b.actuaciones);
}

/** Una tarifa normalizada: nombre, a qué fichas aplica y sus tramos. */
export function normalizarTarifa(t, i = 0) {
    return {
        id: String(t?.id || `t${i + 1}`),
        nombre: String(t?.nombre || '').trim() || 'Tarifa de verificación',
        // Sin fichas declaradas, la tarifa vale para cualquiera. Es lo correcto
        // como valor por defecto: quien solo tiene una tarifa no debería tener
        // que enumerar las cinco fichas para que se le aplique.
        fichas: Array.isArray(t?.fichas) ? t.fichas.map((f) => String(f).toUpperCase()) : [],
        nota: String(t?.nota || '').trim(),
        tramos: normalizarTramos(t?.tramos),
    };
}

export function normalizarTarifas(valor) {
    const lista = Array.isArray(valor?.tarifas) ? valor.tarifas : [];
    return {
        tarifas: lista.map(normalizarTarifa).filter((t) => t.tramos.length > 0),
        actualizada_at: valor?.actualizada_at || null,
        actualizada_por: valor?.actualizada_por || null,
    };
}

/**
 * Precio por actuación de un tramo. Es la cifra con la que de verdad se compara
 * —un total de 2.000 € no dice nada sin saber cuántas actuaciones cubre—, y es
 * además lo que permite comparar una factura que agrupó varios lotes.
 */
export const porActuacion = (tramo) => (tramo?.actuaciones > 0 ? tramo.importe / tramo.actuaciones : null);

/**
 * Estimación para N actuaciones.
 *
 * Entre dos tramos se INTERPOLA linealmente; por encima del último se extrapola
 * con el precio marginal del último intervalo, y eso se marca `fueraDeTabla`:
 * es una conjetura nuestra, no un precio que el verificador haya dado, y quien
 * la lea tiene que saberlo antes de negociar con ella delante.
 *
 * @returns {{importe:number, porActuacion:number, base:'exacto'|'interpolado'|'extrapolado',
 *            fueraDeTabla:boolean, tramoBajo:object|null, tramoAlto:object|null, aviso:string|null}|null}
 */
export function estimar(tarifa, nActuaciones) {
    const tramos = normalizarTramos(tarifa?.tramos);
    const n = num(nActuaciones);
    if (!tramos.length || n == null || n < 1) return null;

    const exacto = tramos.find((t) => t.actuaciones === n);
    if (exacto) {
        return {
            importe: exacto.importe, porActuacion: porActuacion(exacto),
            base: 'exacto', fueraDeTabla: false,
            tramoBajo: exacto, tramoAlto: exacto, aviso: null,
        };
    }

    const primero = tramos[0];
    const ultimo = tramos[tramos.length - 1];

    // Por debajo del primer tramo (una tabla que empieza en 5 y se preguntan 3):
    // no se rebaja por nuestra cuenta. El precio de 5 es el suelo, y se dice.
    if (n < primero.actuaciones) {
        return {
            importe: primero.importe, porActuacion: primero.importe / n,
            base: 'extrapolado', fueraDeTabla: true,
            tramoBajo: null, tramoAlto: primero,
            aviso: `La tarifa empieza en ${primero.actuaciones} actuaciones; por debajo se toma ese importe como mínimo.`,
        };
    }

    if (n > ultimo.actuaciones) {
        const previo = tramos.length > 1 ? tramos[tramos.length - 2] : null;
        // Precio marginal del último intervalo: lo que costó cada actuación
        // añadida entre los dos últimos tramos. Con un solo tramo en la tabla no
        // hay marginal que leer y se prorratea su €/actuación.
        const marginal = previo
            ? (ultimo.importe - previo.importe) / (ultimo.actuaciones - previo.actuaciones)
            : porActuacion(ultimo);
        const importe = eur(ultimo.importe + marginal * (n - ultimo.actuaciones));
        return {
            importe, porActuacion: importe / n,
            base: 'extrapolado', fueraDeTabla: true,
            tramoBajo: ultimo, tramoAlto: null,
            aviso: `La tarifa llega a ${ultimo.actuaciones} actuaciones; a partir de ahí se prolonga a ${eur(marginal).toLocaleString('es-ES')} €/actuación. Confírmalo con el verificador.`,
        };
    }

    const bajo = [...tramos].reverse().find((t) => t.actuaciones < n);
    const alto = tramos.find((t) => t.actuaciones > n);
    const peso = (n - bajo.actuaciones) / (alto.actuaciones - bajo.actuaciones);
    const importe = eur(bajo.importe + peso * (alto.importe - bajo.importe));
    return {
        importe, porActuacion: importe / n,
        base: 'interpolado', fueraDeTabla: false,
        tramoBajo: bajo, tramoAlto: alto,
        aviso: null,
    };
}

/**
 * Qué tarifa aplica a un lote de estas fichas.
 *
 * Con una sola tarifa, esa. Con varias, la que cubra TODAS las fichas del lote,
 * prefiriendo la que las declara explícitamente sobre la genérica. Si empatan
 * dos, NO se elige: comparar contra la tarifa equivocada es peor que no
 * comparar, y quién manda lo decide una persona.
 */
export function tarifaPara(tarifas, fichas = []) {
    const lista = (Array.isArray(tarifas) ? tarifas : []).map(normalizarTarifa).filter((t) => t.tramos.length);
    if (!lista.length) return { tarifa: null, motivo: 'Este verificador no tiene tarifas registradas.' };

    // La cobertura se comprueba SIEMPRE, también con una sola tarifa. Una tarifa
    // que declara "RES060 · RES080 · RES093 · TER100" está diciendo que no cubre
    // lo demás: aplicársela a un TER173 sería comparar contra un precio que nadie
    // ha dado para esa ficha, y encima con la autoridad de una tabla.
    const quiere = [...new Set((fichas || []).filter(Boolean).map((f) => String(f).toUpperCase()))];
    const cubre = (t) => !t.fichas.length || quiere.every((f) => t.fichas.includes(f));
    const candidatas = lista.filter(cubre);
    if (!candidatas.length) {
        return { tarifa: null, motivo: `Ninguna tarifa cubre ${quiere.join(' · ') || 'estas fichas'}.` };
    }
    const especificas = candidatas.filter((t) => t.fichas.length);
    const finalistas = especificas.length ? especificas : candidatas;
    if (finalistas.length > 1) {
        return { tarifa: null, motivo: `Hay ${finalistas.length} tarifas que encajan; elige tú con cuál comparar.` };
    }
    return { tarifa: finalistas[0], motivo: null };
}

/**
 * Compara lo que nos han pedido (o facturado) con lo que dice la tarifa.
 * `tono` es la lectura de un vistazo, con la tolerancia de arriba: la tarifa es
 * ORIENTATIVA, así que una desviación pequeña no es una incidencia.
 */
export function comparar(estimacion, importeReal) {
    const real = num(importeReal);
    if (!estimacion || real == null) return null;
    const dif = eur(real - estimacion.importe);
    const pct = estimacion.importe > 0 ? (dif / estimacion.importe) * 100 : null;
    const dentro = pct != null && Math.abs(pct) <= TOLERANCIA_PCT;
    return {
        real, diferencia: dif, pct,
        dentro,
        tono: dentro ? 'ok' : (dif > 0 ? 'caro' : 'barato'),
        texto: dentro
            ? 'Cuadra con la tarifa'
            : (dif > 0 ? `${eur(Math.abs(dif)).toLocaleString('es-ES')} € por encima de la tarifa`
                       : `${eur(Math.abs(dif)).toLocaleString('es-ES')} € por debajo de la tarifa`),
    };
}
