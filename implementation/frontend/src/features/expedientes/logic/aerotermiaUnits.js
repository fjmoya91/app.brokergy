// ============================================================================
// aerotermiaUnits.js — FUENTE ÚNICA para instalaciones EN CASCADA (N equipos).
//
// Contexto: hasta 2026-07 el expediente tenía exactamente 2 slots de equipo
// nuevo (`instalacion.aerotermia_cal` y `instalacion.aerotermia_acs`), objetos
// sueltos. Cuando se instalan varias bombas de calor en cascada hacen falta N.
//
// MODELO DE DATOS (incremental, sin migración de esquema):
//   aerotermia_cal = {
//       ...campos de la UNIDAD 1 (marca, modelo, modelo_ud_exterior, numero_serie,
//          potencia, metodo_scop, url_*, es_acumulador, litros …),
//       scop:        SCOP **APLICADO** al cálculo = el MENOR de todas las unidades,
//       scop_propio: SCOP de la unidad 1 (solo presente si hay cascada),
//       equipos_extra: [ { marca, modelo, modelo_ud_exterior, numero_serie,
//                          scop, potencia, aerotermia_db_id, … }, … ]
//   }
//
// La clave del diseño es que `scop` sigue siendo el valor que se aplica: los
// ~12 consumidores existentes (fichas RES060/RES093, expedienteFinancials,
// cifoService, hibridación, listados) leen `aero.scop` y NO necesitan cambios.
// Con una sola unidad el objeto es byte-idéntico al de antes.
//
// Criterio del SCOP en cascada: se usa el MENOR de las unidades (criterio
// conservador; nunca sobreestima el ahorro declarado en el CAE).
//
// Este módulo es ESM puro (sin React, sin Node): lo importan tanto el frontend
// como el backend, que carga cifoDoc.js / res080Doc.js por import() dinámico.
// ============================================================================

/** Clona un nodo de aerotermia sin compartir la referencia de `equipos_extra`. */
export function cloneAero(aero) {
    if (!aero || typeof aero !== 'object') return aero;
    const out = { ...aero };
    if (Array.isArray(aero.equipos_extra)) out.equipos_extra = aero.equipos_extra.map(u => ({ ...u }));
    return out;
}

/** ¿La unidad tiene algún dato real? (evita contar tarjetas recién añadidas y vacías) */
function tieneDatos(u) {
    return !!(u && (u.marca || u.modelo || u.modelo_conjunto || u.numero_serie || u.aerotermia_db_id));
}

/**
 * Devuelve TODAS las unidades del bloque como array plano: [unidad1, ...extras].
 * La unidad 1 se devuelve sin la clave `equipos_extra` para que sea homogénea.
 */
export function getUnidades(aero) {
    if (!aero || typeof aero !== 'object') return [];
    const { equipos_extra, ...unidad1 } = aero;
    const extras = Array.isArray(equipos_extra) ? equipos_extra : [];
    return [unidad1, ...extras].filter(tieneDatos);
}

/** Número de equipos declarados. 0 si el bloque está vacío. */
export function countUnidades(aero) {
    return getUnidades(aero).length;
}

/** true si hay instalación en cascada (2+ equipos). */
export function esCascada(aero) {
    return countUnidades(aero) > 1;
}

/** Etiqueta de modelo de UNA unidad: "COMERCIAL · UD_EXTERIOR" (formato del CIFO). */
export function modeloUnidad(u) {
    return [u?.modelo, u?.modelo_ud_exterior].filter(Boolean).join(' · ') || u?.modelo_conjunto || '';
}

/**
 * SCOP propio de la unidad 1 (el que trae su modelo del catálogo), distinto del
 * SCOP aplicado cuando hay cascada. Sin cascada ambos coinciden.
 */
export function scopPropioUnidad1(aero) {
    return aero?.scop_propio ?? aero?.scop ?? null;
}

/**
 * SCOP APLICADO = el MENOR de los SCOP de todas las unidades. Es el valor que
 * debe quedar en `aero.scop` y el que entra en la fórmula de ahorro.
 * Devuelve null si no hay ningún SCOP válido (no pisa el valor existente).
 */
export function scopAplicado(aero) {
    const [u1, ...extras] = getUnidades(aero);
    if (!u1) return null;
    const vals = [scopPropioUnidad1(aero), ...extras.map(u => u?.scop)]
        .map(v => parseFloat(v))
        .filter(v => v > 0);
    return vals.length ? Math.min(...vals) : null;
}

/**
 * Recalcula el SCOP aplicado y lo deja en `scop`, preservando el propio de la
 * unidad 1 en `scop_propio`. Al quedarse sin equipos extra restaura `scop` al
 * propio y elimina las claves de cascada → el objeto vuelve a ser idéntico al
 * de una instalación de un solo equipo.
 *
 * Llamar SIEMPRE antes de persistir un nodo de aerotermia editado.
 */
export function withScopAplicado(aero) {
    if (!aero || typeof aero !== 'object') return aero;
    const extras = Array.isArray(aero.equipos_extra) ? aero.equipos_extra : [];

    // Sin tarjetas extra volvemos al objeto de una sola unidad, byte-idéntico al
    // que producía la app antes de existir la cascada.
    // OJO: NO se filtran aquí las tarjetas a medio rellenar. La UI las mantiene
    // vivas mientras el usuario edita (si al vaciar la marca desapareciera la
    // tarjeta, no se podría cambiar de modelo). Las unidades sin datos las ignora
    // getUnidades(), así que nunca llegan a los documentos ni a las validaciones.
    if (!extras.length) {
        const { scop_propio, equipos_extra, ...rest } = aero;
        return scop_propio != null ? { ...rest, scop: scop_propio } : rest;
    }

    const propio = scopPropioUnidad1(aero);
    const min = scopAplicado(aero);
    return { ...aero, equipos_extra: extras, scop_propio: propio, scop: min != null ? min : aero.scop };
}

/** Potencia total instalada (kW) = suma de todas las unidades. */
export function potenciaTotal(aero) {
    return getUnidades(aero)
        .map(u => parseFloat(u?.potencia) || 0)
        .reduce((a, b) => a + b, 0);
}

/**
 * Modelo(s) para las tablas de los certificados. Agrupa unidades idénticas para
 * no repetir tres veces la misma línea, sin perder el recuento:
 *   1 ud.            → "SHP M PRO 012 · SHP M PRO 012"
 *   3 uds. iguales   → "SHP M PRO 012 · SHP M PRO 012 (×3)"
 *   2 + 1 distintas  → "MODELO A (×2) + MODELO B"
 * El detalle unidad a unidad no se pierde: va en la fila de números de serie.
 */
export function formatModelos(aero, dash = '—') {
    const grupos = [];
    for (const u of getUnidades(aero)) {
        const label = modeloUnidad(u);
        if (!label) continue;
        const g = grupos.find(x => x.label === label);
        if (g) g.n++;
        else grupos.push({ label, n: 1 });
    }
    if (!grupos.length) return dash;
    return grupos.map(g => (g.n > 1 ? `${g.label} (×${g.n})` : g.label)).join(' + ');
}

/** Marca(s), agrupadas igual que los modelos. */
export function formatMarcas(aero, dash = '—') {
    const marcas = [];
    for (const u of getUnidades(aero)) {
        const m = (u?.marca || '').trim();
        if (m && !marcas.includes(m)) marcas.push(m);
    }
    return marcas.length ? marcas.join(' + ') : dash;
}

/**
 * Números de serie de TODAS las unidades. Nunca se agrupan ni se omiten: cada
 * equipo instalado debe quedar identificado en el CIFO, el Anexo I y el RITE.
 *   1 ud.  → "ABC123"
 *   3 uds. → "Ud. 1: ABC123<br>Ud. 2: DEF456<br>Ud. 3: GHI789"
 * `sep` permite adaptar el separador al medio (HTML: '<br>'; texto plano: ' / ').
 */
export function formatSeries(aero, { dash = '—', sep = '<br>', prefijo = 'Ud. ' } = {}) {
    const series = getUnidades(aero)
        .map(u => String(u?.numero_serie || u?.n_serie_ext || '').trim())
        .filter(Boolean);
    if (!series.length) return dash;
    if (series.length === 1) return series[0];
    return series.map((s, i) => `${prefijo}${i + 1}: ${s}`).join(sep);
}

/** Series en texto plano separadas por " / " (para campos de formulario, RITE…). */
export function seriesPlanas(aero, dash = '—') {
    const series = getUnidades(aero)
        .map(u => String(u?.numero_serie || u?.n_serie_ext || '').trim())
        .filter(Boolean);
    return series.length ? series.join(' / ') : dash;
}

/** Unidades sin nº de serie (índice 1-based) — para validaciones y avisos. */
export function unidadesSinSerie(aero) {
    return getUnidades(aero)
        .map((u, i) => ({ n: i + 1, serie: String(u?.numero_serie || u?.n_serie_ext || '').trim() }))
        .filter(x => !x.serie)
        .map(x => x.n);
}

// ============================================================================
// TIPO DE EQUIPO NUEVO (bloque de ACS)
// ----------------------------------------------------------------------------
// El equipo nuevo de ACS no siempre es una bomba de calor: en las reformas
// integrales (RES080) el ACS puede quedar resuelto con un TERMO ELÉCTRICO
// (resistencia — efecto Joule), que no está en el catálogo de aerotermia y cuyo
// rendimiento es 1 POR DEFINICIÓN (toda la electricidad consumida se convierte
// en calor; no hay SCOP que justificar).
//
// Se guarda en `aero.tipo_equipo_nuevo`. Retrocompatible: los expedientes
// antiguos solo tienen el booleano `es_acumulador`, que sigue escribiéndose en
// paralelo para no romper a los lectores existentes.
// ============================================================================
export const EQUIPO_NUEVO = {
    BDC: 'bdc',                 // Bomba de calor aerotérmica (por defecto)
    ACUMULADOR: 'acumulador',   // Depósito calentado por la BdC de calefacción
    TERMO: 'termo_electrico',   // Termo eléctrico / resistencia · efecto Joule
};

/** Rendimiento de un equipo por efecto Joule (resistencia eléctrica). */
export const RENDIMIENTO_JOULE = 1;

/**
 * Tipo de equipo nuevo del bloque. Deriva de `es_acumulador` si no está fijado.
 *
 * OJO: se compara SIEMPRE en minúsculas. El backend pasa por `normalizeData`,
 * que sube todos los strings a MAYÚSCULAS antes de persistir, así que en BD el
 * valor guardado es 'TERMO_ELECTRICO'. Comparar con === contra el literal en
 * minúsculas hacía que el termo se leyera como bomba de calor.
 */
export function tipoEquipoNuevo(aero) {
    const t = String(aero?.tipo_equipo_nuevo ?? '').trim().toLowerCase();
    if (t === EQUIPO_NUEVO.TERMO || t === 'termo') return EQUIPO_NUEVO.TERMO;
    if (t === EQUIPO_NUEVO.ACUMULADOR || aero?.es_acumulador) return EQUIPO_NUEVO.ACUMULADOR;
    return EQUIPO_NUEVO.BDC;
}

/** true si el equipo nuevo es un termo eléctrico (efecto Joule, rendimiento 1). */
export function esTermoElectrico(aero) {
    return tipoEquipoNuevo(aero) === EQUIPO_NUEVO.TERMO;
}

/** true si el equipo lleva ficha técnica/EPREL que justifique un SCOP. */
export function justificaScop(aero) {
    return tipoEquipoNuevo(aero) === EQUIPO_NUEVO.BDC;
}

/**
 * Etiqueta de "Tipo de equipo" del equipo NUEVO para las tablas de los
 * certificados (CIFO, RES080). `sufijoBdc` permite el matiz de cada documento
 * (p. ej. " (aerotermia)" en el RES080).
 */
export function tipoEquipoNuevoLabel(aero, { sufijoBdc = '' } = {}) {
    const tipo = tipoEquipoNuevo(aero);
    if (tipo === EQUIPO_NUEVO.TERMO) return 'Termo eléctrico (efecto Joule)';
    if (tipo === EQUIPO_NUEVO.ACUMULADOR) return 'Acumulador ACS';
    return countUnidades(aero) > 1
        ? `Bombas de calor en cascada${sufijoBdc}`
        : `Bomba de calor${sufijoBdc}`;
}
