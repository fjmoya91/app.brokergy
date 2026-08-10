// ceeAvisos — Comprobaciones cruzadas entre el CEE INICIAL y el CEE FINAL que aporta
// el cliente, y decisión de QUÉ demanda manda en el cálculo.
//
// Lógica PURA (sin React, sin red) para poder razonarla y probarla aparte. La usan:
//   - CeePrevioGate.jsx  → pinta los avisos antes de continuar con la simulación.
//   - ceeSeed.js         → `demandaDeCalculo()` decide qué demanda se siembra.
//
// ─────────────────────────────────────────────────────────────────────────────
// REGLA DE ORO — CON CEE FINAL, MANDA LA DEMANDA DEL FINAL
// ─────────────────────────────────────────────────────────────────────────────
// La demanda de calefacción (kWh/m²·año) es una propiedad de la ENVOLVENTE, no
// del generador. En un RES060 (sustituir la caldera por una bomba de calor) la
// envolvente no se toca, así que la demanda que la máquina nueva tiene que cubrir
// de verdad es la que declara el certificado POSTERIOR a la obra. Por eso, cuando
// hay CEE final, el ahorro se calcula SIEMPRE con su demanda — aunque también
// tengamos el inicial.
//
// De ahí salen los dos avisos que importan:
//
//   · demanda inicial > final  →  la envolvente MEJORÓ. Ese ahorro extra no lo
//     cubre la ficha RES060: es un RES080, y un RES080 exige justificar la obra
//     con FOTOS del antes/después y las FACTURAS. Se avisa para que nadie
//     prometa por RES060 un ahorro que en realidad hay que tramitar por RES080.
//
//   · demanda final > inicial  →  el edificio consume MÁS después de la obra.
//     Es un aviso a secas: casi siempre significa que uno de los dos certificados
//     no corresponde (o está intercambiado), pero no bloquea nada.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Demanda de calefacción del CEE en kWh/m²·año, o null. */
export function demandaCal(cee) {
    return num(cee?.demandas?.calefaccion_kwh_m2_ano);
}

/** Superficie habitable del CEE en m², o null. */
export function superficie(cee) {
    return num(cee?.superficie_habitable_m2);
}

/** Fecha del certificado como timestamp comparable, o null si no se puede leer. */
function fechaTs(cee) {
    const s = cee?.fecha_certificado;
    if (!s) return null;
    // Admite "YYYY-MM-DD" y "DD/MM/YYYY" (el OCR devuelve una u otra según la plantilla).
    const iso = /^\d{4}-\d{2}-\d{2}/.test(String(s))
        ? String(s).slice(0, 10)
        : (() => {
            const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(String(s));
            return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
        })();
    if (!iso) return null;
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : null;
}

/** Normaliza una referencia catastral para comparar (sin espacios, mayúsculas). */
const normRc = (rc) => String(rc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/**
 * ¿Qué demanda (y superficie) usa el cálculo?
 *
 * Con CEE final → la del FINAL. Sin él → la del inicial. Es la fuente única de
 * esta decisión: no volver a escribirla en ReformaSubFlow ni en CalculatorView.
 *
 * @returns {{ demanda: number|null, superficie: number|null, origen: 'final'|'inicial'|null }}
 */
export function demandaDeCalculo(inicial, final) {
    const dFin = demandaCal(final);
    if (dFin != null && dFin > 0) {
        return { demanda: dFin, superficie: superficie(final) ?? superficie(inicial), origen: 'final' };
    }
    const dIni = demandaCal(inicial);
    if (dIni != null && dIni > 0) {
        return { demanda: dIni, superficie: superficie(inicial), origen: 'inicial' };
    }
    return { demanda: null, superficie: superficie(final) ?? superficie(inicial), origen: null };
}

/**
 * Avisos cruzados entre los dos certificados.
 *
 * @param {object|null} inicial  CEE normalizado (emptyCeeData) anterior a la obra
 * @param {object|null} final    CEE normalizado posterior a la obra
 * @returns {Array<{ codigo, nivel: 'alto'|'medio'|'info', titulo, detalle }>}
 */
export function avisosCee(inicial, final) {
    const avisos = [];
    if (!inicial && !final) return avisos;

    // ── Solo tiene sentido cruzar si hay dos ────────────────────────────────
    if (inicial && final) {
        // Referencia catastral distinta: no son de la misma vivienda.
        const rcIni = normRc(inicial.referencia_catastral);
        const rcFin = normRc(final.referencia_catastral);
        if (rcIni && rcFin && rcIni !== rcFin) {
            avisos.push({
                codigo: 'RC_DISTINTA',
                nivel: 'alto',
                titulo: 'Los dos certificados no son de la misma vivienda',
                detalle: `El inicial dice ${inicial.referencia_catastral} y el final ${final.referencia_catastral}. Revísalo antes de continuar: con referencias distintas el ahorro no es comparable.`,
            });
        }

        // Fechas: el final tiene que ser POSTERIOR al inicial.
        const tIni = fechaTs(inicial);
        const tFin = fechaTs(final);
        if (tIni != null && tFin != null && tFin <= tIni) {
            avisos.push({
                codigo: 'FECHA_INVERTIDA',
                nivel: 'alto',
                titulo: '¿Están intercambiados?',
                detalle: `El certificado marcado como FINAL (${final.fecha_certificado}) no es posterior al INICIAL (${inicial.fecha_certificado}). Compruébalo o intercámbialos.`,
            });
        }

        // Superficies muy dispares: casi siempre es que un certificado es de otro inmueble.
        const sIni = superficie(inicial);
        const sFin = superficie(final);
        if (sIni > 0 && sFin > 0) {
            const desvio = Math.abs(sFin - sIni) / sIni;
            if (desvio > 0.15) {
                avisos.push({
                    codigo: 'SUPERFICIE_DISPAR',
                    nivel: 'medio',
                    titulo: 'Las superficies no cuadran',
                    detalle: `${sIni} m² en el inicial frente a ${sFin} m² en el final (${Math.round(desvio * 100)} % de diferencia). La superficie es la base del ahorro: confirma cuál es la buena.`,
                });
            }
        }

        // ── Demanda: los dos casos que pidió el usuario ─────────────────────
        const dIni = demandaCal(inicial);
        const dFin = demandaCal(final);
        if (dIni > 0 && dFin > 0) {
            if (dIni > dFin) {
                const pct = Math.round(((dIni - dFin) / dIni) * 100);
                avisos.push({
                    codigo: 'MEJORA_ENVOLVENTE',
                    nivel: 'medio',
                    titulo: `La demanda baja un ${pct} % — esto es un RES080`,
                    detalle: `El certificado final declara ${dFin} kWh/m²·año frente a ${dIni} del inicial. Esa bajada solo puede venir de haber mejorado la envolvente (ventanas, aislamiento, cubierta), y ese ahorro NO lo recoge la ficha RES060: hay que tramitarlo como RES080. Para poder hacerlo necesitarás FOTOS del antes y del después y las FACTURAS de la obra.`,
                });
            } else if (dFin > dIni) {
                const pct = Math.round(((dFin - dIni) / dIni) * 100);
                avisos.push({
                    codigo: 'DEMANDA_SUBE',
                    nivel: 'medio',
                    titulo: `La demanda SUBE un ${pct} % después de la obra`,
                    detalle: `El certificado final declara ${dFin} kWh/m²·año frente a ${dIni} del inicial. Una reforma energética no debería aumentar la demanda: revisa que los dos certificados sean de esta vivienda y estén en el orden correcto. El cálculo seguirá usando la demanda del FINAL.`,
                });
            }
        }
    }

    // ── Con CEE final, se avisa de qué demanda manda ────────────────────────
    if (final && demandaCal(final) > 0) {
        avisos.push({
            codigo: 'MANDA_FINAL',
            nivel: 'info',
            titulo: 'El cálculo usa la demanda del CEE final',
            detalle: `Cuando hay certificado posterior a la obra, el ahorro se calcula con su demanda (${demandaCal(final)} kWh/m²·año): es la que la bomba de calor tiene que cubrir de verdad.`,
        });
    }

    return avisos;
}

/** ¿Hay algún aviso que convenga que el usuario lea antes de seguir? */
export function hayAvisosSerios(avisos) {
    return (avisos || []).some(a => a.nivel === 'alto');
}

// Margen por debajo del cual una diferencia de demanda es ruido de cálculo del
// certificador (redondeos, versión del CE3X) y no una mejora real de la envolvente.
const RUIDO_DEMANDA = 0.02; // 2 %

/**
 * ¿La obra tocó la ENVOLVENTE? → true = RES080, false = RES060.
 *
 * Con los dos certificados no hace falta preguntarlo: la demanda solo baja si se ha
 * actuado sobre ventanas, cubierta, fachada o suelo. Cambiar el generador no la mueve.
 * Devuelve null cuando no se puede decidir (falta un certificado o una demanda), que
 * es cuando SÍ hay que preguntar.
 */
export function esReformaSegunCee(inicial, final) {
    const dIni = demandaCal(inicial);
    const dFin = demandaCal(final);
    if (!(dIni > 0) || !(dFin > 0)) return null;
    return (dIni - dFin) / dIni > RUIDO_DEMANDA;
}

/**
 * Rendimiento estacional del generador de calefacción declarado por el CEE, como
 * fracción (0,85) y no como porcentaje (85).
 *
 * Es un dato MEJOR que el que usa el funnel, que lo deduce del combustible y la edad
 * de la caldera: aquí lo midió el certificador sobre esta instalación concreta. Se
 * acota a un rango razonable porque un OCR puede leer "8,5" o "850" y un η disparatado
 * multiplica o divide el ahorro sin que nadie lo note.
 */
export function rendimientoCalefaccion(cee) {
    let n = num(cee?.servicios?.calefaccion?.rendimiento_estacional_pct);
    if (n == null || n <= 0) return null;
    if (n > 3) n = n / 100;                 // venía en porcentaje
    if (n < 0.3 || n > 1.5) return null;    // fuera de rango creíble → no fiarse
    return Math.round(n * 1000) / 1000;
}
