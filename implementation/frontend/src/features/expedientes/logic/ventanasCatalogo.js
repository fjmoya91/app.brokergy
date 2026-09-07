// ============================================================================
// ventanasCatalogo.js — el catálogo de VENTANAS y lo que vuelca al expediente.
// ----------------------------------------------------------------------------
// Gemelo pequeño de `aerotermiaUnits` + `fichasTecnicas`, para el otro equipo que
// un RES080 tiene que justificar: la carpintería y el vidrio.
//
// REGLA — la MARCA es el fabricante del SISTEMA; el CARPINTERO va aparte.
// «Aluminios Manzanares S.L.» no es una marca de perfil: es quien fabrica y monta
// la ventana con perfil de otro (Cortizo, Kömmerling…). Medido sobre los 25
// RES080 con la envolvente rellena, en 12 el campo «marca» llevaba el carpintero,
// así que el certificado declaraba como fabricante del sistema a una carpintería
// de pueblo y el Uf no se podía comprobar contra ninguna ficha. Por eso el
// expediente guarda los dos: `marco_nuevo_marca` (del catálogo) y
// `marco_carpinteria` (texto libre, quien la hizo).
//
// REGLA — el valor lo pone el CATÁLOGO, pero manda lo que se teclee encima.
// `aplicarMarco`/`aplicarCristal` rellenan Uf, Ug, factor solar y composición al
// elegir un modelo; después son campos editables como cualquier otro. El catálogo
// dice lo que el modelo PUEDE dar; el expediente, lo que se instaló.
//
// REGLA — un modelo SIN VALIDAR no autorrellena en silencio.  `validado` significa
// que alguien ha comprobado la cifra contra la ficha. Los que no lo están (la
// ficha existe pero no imprime el Uf) se ofrecen igual —su ficha técnica ya es
// media función— pero se avisa en pantalla y NO pisan un valor ya escrito.
//
// Módulo ESM PURO (sin React ni Node): lo importan el módulo de Envolvente, la
// vista del catálogo y, por import() dinámico, las rutas del backend.
// ============================================================================

/**
 * Aperturas: cada una tiene SU Uf, y por eso son filas distintas del catálogo.
 *
 * Dos rótulos a propósito. El LARGO explica en el desplegable qué entra en cada
 * casilla ("abisagrada / oscilobatiente" son la misma familia). El CORTO es el
 * que viaja al expediente y de ahí al certificado: allí la apertura va pegada a
 * la serie ("A 70 · Abisagrada / oscilobatiente" no cabe en la celda de la tabla
 * comparativa, y el verificador no necesita la aclaración).
 */
export const APERTURAS = [
    { value: 'ABISAGRADA', label: 'Abisagrada / oscilobatiente', corto: 'Abisagrada' },
    { value: 'CORREDERA',  label: 'Corredera',                   corto: 'Corredera' },
    { value: 'ELEVABLE',   label: 'Elevable',                    corto: 'Elevable' },
    { value: 'FIJA',       label: 'Fija',                        corto: 'Fija' },
    { value: 'PUERTA',     label: 'Puerta',                      corto: 'Puerta' },
];

export const MATERIALES_MARCO = [
    'PVC',
    'ALUMINIO RPT',
    'ALUMINIO',
    'MADERA',
    'MIXTO MADERA-ALUMINIO',
];

/** Los dos fabricantes con los que se trabaja; la lista no está cerrada. */
export const FABRICANTES_CRISTAL = ['GUARDIAN', 'SAINT-GOBAIN'];

const norm = (v) => String(v ?? '').trim();
const up   = (v) => norm(v).toUpperCase();

/** Número tolerante con la coma decimal española. null si no hay cifra. */
export function num(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

// ─── Etiquetas ──────────────────────────────────────────────────────────────

export function aperturaLabel(v) {
    return APERTURAS.find(a => a.value === up(v))?.label || norm(v) || '—';
}

/** El rótulo que viaja a los documentos: "Abisagrada", no "Abisagrada / oscilobatiente". */
export function aperturaCorta(v) {
    return APERTURAS.find(a => a.value === up(v))?.corto || norm(v) || '';
}

/** "CORTIZO A 70 · Abisagrada" — como se lee en el desplegable y en la ficha. */
export function marcoLabel(m) {
    if (!m) return '';
    const base = [up(m.marca), norm(m.serie)].filter(Boolean).join(' ');
    const ap = aperturaCorta(m.apertura);
    return ap ? `${base} · ${ap}` : base;
}

/** "GUARDIAN SUN · 4 (16 AIRE) 4" — el fabricante va aparte, en su columna. */
export function cristalLabel(c) {
    if (!c) return '';
    return [up(c.gama), norm(c.composicion)].filter(Boolean).join(' · ');
}

/** Lo que hace única a una fila: es la clave del ON CONFLICT de la tabla. */
export function marcoKey(m)   { return [up(m?.marca), up(m?.serie), up(m?.apertura) || 'ABISAGRADA'].join('|'); }
export function cristalKey(c) { return [up(c?.fabricante), up(c?.gama), up(c?.composicion)].join('|'); }

// ─── Volcado al expediente ──────────────────────────────────────────────────

/**
 * Los campos de `documentacion.envolvente` que rellena elegir un MARCO.
 *
 * El Uf solo viaja si el catálogo lo tiene: un modelo cuya ficha no imprime el Uf
 * (la mitad de los de aluminio) no puede dejar el campo a cero — se conserva lo
 * que hubiera y se avisa de que hay que teclearlo.
 */
export function aplicarMarco(marco) {
    if (!marco) return {};
    const out = {
        marco_catalogo_id: marco.id || null,
        marco_nuevo_marca: up(marco.marca),
        marco_nuevo_modelo: [norm(marco.serie), aperturaCorta(marco.apertura)].filter(Boolean).join(' · '),
    };
    if (norm(marco.material)) out.marco_nuevo_material = up(marco.material);
    const uf = num(marco.uf);
    if (uf !== null) out.marco_nuevo_transmitancia = uf;
    return out;
}

/** Los campos de `documentacion.envolvente` que rellena elegir un CRISTAL. */
export function aplicarCristal(cristal) {
    if (!cristal) return {};
    const out = {
        cristal_catalogo_id: cristal.id || null,
        cristal_nuevo_marca: up(cristal.fabricante),
        cristal_nuevo_modelo: up(cristal.gama),
        cristal_nuevo_composicion: norm(cristal.composicion),
    };
    const ug = num(cristal.ug);
    if (ug !== null) out.cristal_nuevo_transmitancia = ug;
    const g = num(cristal.factor_solar);
    if (g !== null) out.cristal_nuevo_factor_solar = g;
    return out;
}

/**
 * Qué le falta a un modelo del catálogo para poder darlo por bueno. Lista de
 * frases cortas, listas para pintar; vacía si está completo.
 */
export function faltaEnMarco(m) {
    const f = [];
    if (num(m?.uf) === null) f.push('el Uf');
    if (!norm(m?.ficha_tecnica)) f.push('la ficha técnica');
    if (!norm(m?.material)) f.push('el material');
    return f;
}

export function faltaEnCristal(c) {
    const f = [];
    if (num(c?.ug) === null) f.push('el Ug');
    if (num(c?.factor_solar) === null) f.push('el factor solar');
    if (!norm(c?.ficha_tecnica)) f.push('la ficha técnica');
    return f;
}

/** "el Uf y la ficha técnica" */
export function enumerar(arr) {
    if (!arr || arr.length === 0) return '';
    if (arr.length === 1) return arr[0];
    return `${arr.slice(0, -1).join(', ')} y ${arr[arr.length - 1]}`;
}

// ─── Lo que declara el EXPEDIENTE ───────────────────────────────────────────

/**
 * ¿Este expediente sustituye ventanas? Es la condición para pedirle las fichas
 * técnicas del marco y del vidrio, y para pintar el bloque en el certificado.
 */
export function sustituyeVentanas(expediente) {
    const env = expediente?.documentacion?.envolvente;
    return !!env && env.sustituye_ventanas === true;
}

/**
 * Cómo se llama en los documentos el marco instalado: la MARCA del sistema con
 * su modelo, y detrás quién la fabricó, cuando consta y no es la propia marca.
 *
 * Es la fuente única del rótulo: el certificado RES080, la hoja de anexos y la
 * ficha del expediente tienen que decirlo igual, o el verificador ve dos empresas
 * distintas para la misma ventana.
 */
export function marcoDelExpediente(expediente) {
    const env = expediente?.documentacion?.envolvente || {};
    const marca = up(env.marco_nuevo_marca);
    const modelo = norm(env.marco_nuevo_modelo);
    const carp = up(env.marco_carpinteria);
    const sistema = [marca, modelo].filter(Boolean).join(' ');
    return {
        marca, modelo, carpinteria: carp,
        sistema: sistema || null,
        // El carpintero solo se nombra si aporta algo: repetir la marca sería ruido.
        conCarpinteria: carp && carp !== marca
            ? (sistema ? `${sistema} (fabricada por ${carp})` : carp)
            : (sistema || null),
        uf: num(env.marco_nuevo_transmitancia),
        material: up(env.marco_nuevo_material) || null,
        catalogoId: env.marco_catalogo_id || null,
    };
}

export function cristalDelExpediente(expediente) {
    const env = expediente?.documentacion?.envolvente || {};
    const fab = up(env.cristal_nuevo_marca);
    const gama = up(env.cristal_nuevo_modelo);
    const comp = norm(env.cristal_nuevo_composicion);
    // "GUARDIAN GUARDIAN SUN" es la marca dicha dos veces: la gama ya la lleva
    // dentro. Se antepone el fabricante solo cuando aporta algo (SAINT-GOBAIN
    // PLANITHERM 4S sí, GUARDIAN GUARDIAN SUN no).
    const etiqueta = gama.startsWith(fab) ? gama : [fab, gama].filter(Boolean).join(' ');
    return {
        fabricante: fab, gama, composicion: comp,
        etiqueta: etiqueta || null,
        completo: [etiqueta, comp].filter(Boolean).join(' · ') || null,
        ug: num(env.cristal_nuevo_transmitancia),
        factorSolar: num(env.cristal_nuevo_factor_solar),
        catalogoId: env.cristal_catalogo_id || null,
    };
}
