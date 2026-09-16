// ─────────────────────────────────────────────────────────────────────────────
// Cómo se NOMBRA un equipo del catálogo en un desplegable.
//
// REGLA — un equipo se identifica por la REFERENCIA DE SU PLACA, no por su
// nombre comercial. Es la misma regla con la que `casarConCatalogo` empareja lo
// que lee el OCR de una etiqueta, y con la que el catálogo distingue dos filas.
// Medido sobre los 490 equipos (16/09/2026): **11 grupos y 35 filas** comparten
// marca + nombre comercial + potencia, o sea que con esa etiqueta son
// INDISTINGUIBLES en pantalla. Y en 4 de esos grupos sus filas declaran SCOP
// distintos: la peor, "PANASONIC · Aquarea High Performance Serie M R290 All in
// One · 16 kW", son SEIS opciones iguales cuyo SCOP va de 2,85 a 4,34 — un 52 %.
// De ese número salen el ahorro, el bono que se le promete al cliente y el CIFO,
// así que elegir a ciegas ahí no es una molestia: es firmar otro ahorro.
//
// Fuente única de las TRES superficies que eligen equipo (el bloque de
// calefacción y el de ACS del expediente, sus unidades en cascada, y los dos
// desplegables de la calculadora). Estaba escrita dos veces dentro de
// `InstalacionModule` y las dos copias ya diferían: una decía si el equipo trae
// el depósito dentro y la otra no.
// ─────────────────────────────────────────────────────────────────────────────
import { esConjuntoAcs, litrosAcsCatalogo } from './acsCatalogo';

/**
 * Los dos renglones con los que se pinta un equipo:
 *   label    → Aquarea High Performance Serie M R290 All in One · 12 kW
 *   sublabel → Ud. ext: WH-WDG12ME5 · int: WH-ADC0916M3E51 · Conjunto con ACS · 120 L
 *
 * El `sublabel` es la línea por la que se BUSCA (ver `SearchableSelect`): es lo
 * que se tiene delante, leído de la etiqueta del aparato.
 */
export function opcionDeEquipo(m) {
    const ext = m.modelo_ud_exterior ? `Ud. ext: ${m.modelo_ud_exterior}` : '';
    const int = m.modelo_ud_interior ? `int: ${m.modelo_ud_interior}` : '';
    // Que el equipo traiga el depósito DENTRO cambia el trabajo: elegirlo en
    // calefacción resuelve también el ACS. Se dice aquí, que es donde se elige.
    const conj = esConjuntoAcs(m)
        ? `Conjunto con ACS${litrosAcsCatalogo(m) ? ` · ${litrosAcsCatalogo(m)} L` : ''}`
        : '';
    const sub = [ext, int, conj].filter(Boolean).join('  ·  ');
    return {
        value: String(m.id),
        label: `${m.modelo_comercial || m.modelo_conjunto || ''}${m.potencia_calefaccion ? ` · ${m.potencia_calefaccion} kW` : ''}`,
        // Sin ninguna referencia de placa (el 18 % del catálogo no la tiene) se
        // cae al nombre del conjunto, que al menos distingue las variantes.
        sublabel: sub || (m.modelo_conjunto ? `Conjunto: ${m.modelo_conjunto}` : ''),
    };
}

/** El texto que se pide en el buscador. Mismo en todas las superficies. */
export const BUSCAR_EQUIPO = 'Buscar por nombre o referencia de la placa (p. ej. WDG12ME5)…';
