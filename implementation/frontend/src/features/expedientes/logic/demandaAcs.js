// ============================================================================
// demandaAcs.js — FUENTE ÚNICA de la demanda anual de ACS (D_ACS) del expediente.
// ----------------------------------------------------------------------------
// D_ACS entra en la fórmula del ahorro en kWh/año ABSOLUTOS, pero el dato de
// partida cambia según de dónde salga. La misma derivación estaba copiada en el
// panel económico, en el CIFO, en la Ficha RES060 y en dos servicios del backend:
// cualquier modo nuevo obligaba a tocar los cinco sitios (y si uno se olvidaba,
// el documento oficial y el panel mostraban ahorros distintos). Aquí vive una vez.
//
// Modos (`expedientes.cee.acs_method`):
//   · 'xml'    → del .xml del CEE: demandaACS (kWh/m²·año) · superficie útil (m²).
//                De cuál de los DOS certificados lo decide `baseAcs`: manda el
//                INICIAL (criterio del verificador, ver más abajo).
//   · 'cte'    → estimación del Anejo F del CTE DB-HE para residencial privado:
//                28 l/persona·día · N_P · C_e (0,001162 kWh/kg·°C) · 365 · ΔT(46°C),
//                con N_P = nº de habitaciones + 1.
//   · 'litros' → los LITROS/DÍA que declara el propio certificado ("Demanda diaria
//                de ACS a 60°", en su apartado de instalaciones de ACS): se leen
//                del `.xml` (`cee_{fase}.acsLitrosDia`) y solo si el CEE no los
//                trae, de lo tecleado. Es el modo POR DEFECTO desde el 19/10/2026
//                (criterio de los verificadores, ver `litrosDelCertificado`).
//                Misma fórmula del Anejo F, pero SIN el tramo de
//                ocupación: la demanda diaria ya viene medida para el edificio, así
//                que multiplicarla otra vez por el nº de personas la multiplicaría
//                por cinco. Es el modo bueno cuando el certificado la trae, porque
//                entonces la cifra no es una estimación por dormitorios: es un dato
//                del CEE, y el ΔT de 46 °C (60 − 14) casa con esos mismos 60 °C.
//   · 'manual' → valor introducido a mano en kWh/año (`cee.dacs_manual`).
//                Es el modo del sector TERCIARIO (ficha TER100): en un hotel, una
//                residencia o un gimnasio la demanda de ACS va por plaza/servicio
//                (Anexo V de la ficha) o la da el proyecto, no la fórmula del CTE
//                por habitaciones de vivienda.
//
// Módulo ESM PURO (sin React ni Node): lo importan los módulos del frontend y,
// por import() dinámico, los servicios del backend.
// ============================================================================

export const ACS_METHOD = { XML: 'xml', CTE: 'cte', LITROS: 'litros', MANUAL: 'manual' };

// ─── De QUÉ certificado sale la demanda de ACS ───────────────────────────────
// REGLA DEL VERIFICADOR (2026-09-17): la demanda de ACS tiene que ser LA MISMA
// en el CEE inicial y en el final, y si no lo es, MANDA LA DEL INICIAL.
//
// Es la excepción a la regla general de `ceeFases.js` (con CEE final cargado
// manda el final), y tiene su razón: la demanda de ACS es una propiedad del USO
// del edificio —cuánta agua caliente se consume—, no de la envolvente ni del
// generador, así que la actuación no la mueve. Si los dos certificados no dicen
// lo mismo, la diferencia no describe una mejora: describe un criterio distinto
// del técnico que levantó el segundo. El de partida es el que el verificador
// toma como bueno, y es el que hay que declarar.
//
// La demanda de CALEFACCIÓN y la SUPERFICIE siguen saliendo del CEE que manda
// (`ceeBaseDocumento`): ahí el final SÍ recoge el resultado de la obra, y en un
// RES080 la diferencia entre los dos ES el ahorro que se justifica.

/** Margen con el que se comparan las dos cifras. Por debajo son redondeos del
 *  `.cex`; es el mismo 2 % que aplica el resto de la app. */
export const ACS_TOL = 0.02;

/**
 * El certificado del que sale la demanda de ACS: el INICIAL siempre que la
 * declare; si no la declara, lo que llegue como base.
 *
 * El escalón no es un matiz: un CEE inicial leído por OCR **no trae** demanda de
 * ACS —el PDF del certificado no imprime esa tabla, solo está en el `.xml`—, así
 * que exigir el inicial a ciegas dejaría a esos expedientes con D_ACS = 0 y el
 * AE_ACS del documento se iría a cero sin que nada lo delatara. Cuando hay DOS
 * cifras manda la del inicial; cuando solo hay una, se usa esa y se dice.
 *
 * @param {Object} cee      - `expedientes.cee`
 * @param {Object} ceeBase  - el CEE que manda para lo demás (ver `ceeBaseDocumento`)
 * @returns {{ base:Object, fase:('inicial'|'final'|null), hayDos:boolean, difiere:boolean, porM2Ini:number, porM2Fin:number }}
 */
export function baseAcs(cee = {}, ceeBase = {}) {
    const ini = (cee || {}).cee_inicial || {};
    const fin = (cee || {}).cee_final || {};
    const porM2Ini = parseFloat(ini.demandaACS) || 0;
    const porM2Fin = parseFloat(fin.demandaACS) || 0;
    const hayDos = porM2Ini > 0 && porM2Fin > 0;
    const difiere = hayDos && Math.abs(porM2Fin - porM2Ini) > porM2Ini * ACS_TOL;
    const supBase = parseFloat((ceeBase || {}).superficieHabitable) || 0;

    if (porM2Ini > 0) {
        return {
            // La superficie sale del MISMO certificado que la demanda por m², o el
            // producto que imprime el documento no cuadraría con sus dos factores.
            base: {
                demandaACS: porM2Ini,
                superficieHabitable: parseFloat(ini.superficieHabitable) || supBase,
            },
            fase: 'inicial', hayDos, difiere, porM2Ini, porM2Fin,
        };
    }
    return {
        base: ceeBase || {},
        fase: porM2Fin > 0 ? 'final' : null,
        hayDos, difiere, porM2Ini, porM2Fin,
    };
}

/** Constantes de la fórmula del Anejo F del CTE DB-HE (residencial privado). */
export const CTE_ACS = {
    LITROS_PERSONA_DIA: 28,
    CALOR_ESPECIFICO: 0.001162, // kWh/kg·°C
    DIAS: 365,
    SALTO_TERMICO: 46,          // 60 °C de acumulación − 14 °C de red
};

/** Nº de personas consideradas por la estimación del CTE (habitaciones + 1). */
export function personasCte(cee = {}) {
    return (parseInt(cee.num_rooms, 10) || 4) + 1;
}

/** D_ACS (kWh/año) por la fórmula del Anejo F del CTE. */
export function dacsCte(cee = {}) {
    const { LITROS_PERSONA_DIA, CALOR_ESPECIFICO, DIAS, SALTO_TERMICO } = CTE_ACS;
    return LITROS_PERSONA_DIA * personasCte(cee) * CALOR_ESPECIFICO * DIAS * SALTO_TERMICO;
}

// ─── Los LITROS/DÍA, del certificado ─────────────────────────────────────────
// CRITERIO DE LOS VERIFICADORES (2026-10-19): la D_ACS se calcula SIEMPRE con los
// litros/día que declara el CEE («Demanda diaria de ACS a 60°»), no con su
// demanda en kWh/m²·año. La razón está medida: con los MISMOS litros/día, CE3X
// 2.3 y 3.x dan demandas de ACS distintas (26RES060_113: 112 l/día en los dos
// certificados y 13,23 frente a 22,90 kWh/m²·año), así que la cifra por m² no es
// un dato estable del edificio y los litros sí.
//
// Por eso, cuando el certificado los trae, MANDAN sobre lo tecleado: lo tecleado
// solo cubre al CEE que no los dice (uno leído por OCR de un PDF que no los
// imprima, o un `.xml` antiguo). De los dos certificados, el INICIAL, por la
// misma regla que la demanda por m² (`baseAcs`).

/** Litros/día que declara el `.xml` crudo. Sin DOM y sin distinguir mayúsculas:
 *  el `.xml` guardado en la BD está en MAYÚSCULAS (`normalizeData`). */
export function litrosDeXmlTexto(texto) {
    const m = /<DemandaDiariaACS>\s*([\d.,]+)/i.exec(String(texto || ''));
    const v = m ? parseFloat(m[1].replace(',', '.')) : NaN;
    return v > 0 && v < 9999999 ? v : 0;
}

/**
 * Los litros/día que declaran los certificados: los del INICIAL si los trae; si
 * no, los del final. `fase` dice de cuál han salido (null si ninguno los trae).
 */
export function litrosDelCertificado(cee = {}) {
    const c = cee || {};
    // Lo leído al cargar el `.xml` (`acsLitrosDia`) y, si no está —un `.xml`
    // cargado antes de que el lector lo guardara—, el propio `.xml` crudo, que
    // solo viene en el DETALLE del expediente (los listados no lo traen: regla 22).
    const de = (fase) => parseFloat((c[`cee_${fase}`] || {}).acsLitrosDia)
        || (c[`cee_${fase}`] ? litrosDeXmlTexto(c[`xml_${fase}`]) : 0)
        || 0;
    const ini = de('inicial');
    if (ini > 0) return { litros: ini, fase: 'inicial' };
    const fin = de('final');
    if (fin > 0) return { litros: fin, fase: 'final' };
    return { litros: 0, fase: null };
}

/** Litros/día a 60 °C con los que se calcula (modo 'litros'): los del
 *  certificado si los declara; si no, los tecleados. */
export function litrosDia(cee = {}) {
    return litrosDelCertificado(cee).litros || parseFloat(cee.dacs_litros_dia) || 0;
}

/** De dónde salen los litros/día: 'inicial' · 'final' (del certificado),
 *  'tecleado' o null si no hay ninguno. */
export function litrosFase(cee = {}) {
    const { fase } = litrosDelCertificado(cee);
    if (fase) return fase;
    return parseFloat(cee.dacs_litros_dia) > 0 ? 'tecleado' : null;
}

/**
 * Qué hay que cambiar en el `cee` para seguir el criterio de los litros/día,
 * o null si nada. Se llama al cargar un certificado (y desde el script que pone
 * al día los expedientes en marcha):
 *   · en modo 'litros' sin cifra tecleada, se copia la del certificado (para que
 *     la casilla L/D la enseñe y quede en la BD);
 *   · en 'xml' o 'cte', si los DOS certificados declaran demandas de ACS
 *     distintas, se pasa a 'litros' — es justo el caso que el verificador ya no
 *     acepta. Si coinciden, no se toca: ahí da igual una cifra que la otra.
 *   · 'manual' (terciario) no se toca nunca.
 */
export function ajusteAcsLitros(cee = {}) {
    const mode = (cee || {}).acs_method || ACS_METHOD.XML;
    if (mode === ACS_METHOD.MANUAL) return null;
    const { litros } = litrosDelCertificado(cee);
    if (!(litros > 0)) return null;
    const tecleado = parseFloat(cee.dacs_litros_dia) || 0;
    if (mode === ACS_METHOD.LITROS) {
        return tecleado === litros ? null : { dacs_litros_dia: litros };
    }
    if (baseAcs(cee, {}).difiere) {
        return { acs_method: ACS_METHOD.LITROS, dacs_litros_dia: litros };
    }
    return null;
}

/**
 * D_ACS (kWh/año) a partir de los litros/día del certificado.
 * Misma fórmula que `dacsCte` salvo el tramo de ocupación (L/persona·día · N_P),
 * que aquí sobra: el dato del CEE ya es el consumo diario del edificio entero.
 */
export function dacsLitros(cee = {}) {
    const { CALOR_ESPECIFICO, DIAS, SALTO_TERMICO } = CTE_ACS;
    return litrosDia(cee) * CALOR_ESPECIFICO * DIAS * SALTO_TERMICO;
}

/**
 * Resuelve la demanda anual de ACS del expediente.
 *
 * En modo 'xml' la cifra sale del certificado que dice `baseAcs` —el INICIAL
 * siempre que la declare—, no del `ceeBase` que manda para la calefacción y la
 * superficie. `acsFase` dice de cuál ha salido y `acsDifiere`, si los dos
 * certificados no coinciden: es lo que hay que poder decir en el documento y en
 * el aviso previo a generarlo.
 *
 * @param {Object} cee      - `expedientes.cee`
 * @param {Object} ceeBase  - el CEE que manda (final si es válido, si no el inicial)
 * @param {Object} [extra]  - fallbacks de la oportunidad: { demandAcsFallback }
 * @returns {{ value:number, mode:string, dacsPorM2:number, superficie:number, personas:number, litrosDia:number, acsFase:string, acsDifiere:boolean, acsHayDos:boolean, acsPorM2Ini:number, acsPorM2Fin:number }}
 */
export function resolveDacs(cee = {}, ceeBase = {}, extra = {}) {
    const mode = cee.acs_method || ACS_METHOD.XML;
    const acs = baseAcs(cee, ceeBase);
    const superficie = parseFloat(acs.base.superficieHabitable) || 0;
    const dacsPorM2 = parseFloat(acs.base.demandaACS) || 0;

    let value;
    // Sin NINGÚN certificado cargado todavía (expediente recién creado, ya en
    // 'litros' por defecto) no hay litros que leer: hasta que llegue el CEE
    // inicial se enseña la D_ACS simulada. Con un certificado cargado que no los
    // diga, en cambio, la cifra se queda en 0 y la puerta del documento lo para.
    const sinCertificado = !(acs.porM2Ini > 0 || acs.porM2Fin > 0)
        && !((cee || {}).cee_inicial || (cee || {}).cee_final);
    if (mode === ACS_METHOD.MANUAL) {
        value = parseFloat(cee.dacs_manual) || 0;
    } else if (mode === ACS_METHOD.LITROS) {
        value = dacsLitros(cee)
            || (sinCertificado ? parseFloat(extra.demandAcsFallback) || 0 : 0);
    } else if (mode === ACS_METHOD.CTE) {
        value = dacsCte(cee);
    } else {
        value = dacsPorM2 * superficie || parseFloat(extra.demandAcsFallback) || 0;
    }

    return {
        value, mode, dacsPorM2, superficie,
        personas: personasCte(cee), litrosDia: litrosDia(cee), litrosFase: litrosFase(cee),
        acsFase: acs.fase, acsDifiere: acs.difiere, acsHayDos: acs.hayDos,
        acsPorM2Ini: acs.porM2Ini, acsPorM2Fin: acs.porM2Fin,
    };
}
