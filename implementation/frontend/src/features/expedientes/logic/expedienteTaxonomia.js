// ============================================================================
// expedienteTaxonomia.js — Cómo se CLASIFICA un expediente (ficha, año, CCAA).
//
// FUENTE ÚNICA de los criterios de agrupación. Vivían dentro de ExpedientesView;
// se extraen aquí porque el Cuadro de Mando agrega por los mismos ejes y si cada
// vista se define su propio criterio los totales dejan de cuadrar entre pantallas.
// ============================================================================

// Provincia INE (2 díg.) → CCAA. Espejo del backend (geoCcaa.js).
export const CCAA_MAP = {
    '01': 'País Vasco', '02': 'Castilla-La Mancha', '03': 'Comunidad Valenciana', '04': 'Andalucía',
    '05': 'Castilla y León', '06': 'Extremadura', '07': 'Islas Baleares', '08': 'Cataluña',
    '09': 'Castilla y León', '10': 'Extremadura', '11': 'Andalucía', '12': 'Comunidad Valenciana',
    '13': 'Castilla-La Mancha', '14': 'Andalucía', '15': 'Galicia', '16': 'Castilla-La Mancha',
    '17': 'Cataluña', '18': 'Andalucía', '19': 'Castilla-La Mancha', '20': 'País Vasco',
    '21': 'Andalucía', '22': 'Aragón', '23': 'Andalucía', '24': 'Castilla y León',
    '25': 'Cataluña', '26': 'La Rioja', '27': 'Galicia', '28': 'Madrid',
    '29': 'Andalucía', '30': 'Murcia', '31': 'Navarra', '32': 'Galicia',
    '33': 'Asturias', '34': 'Castilla y León', '35': 'Canarias', '36': 'Galicia',
    '37': 'Castilla y León', '38': 'Canarias', '39': 'Cantabria', '40': 'Castilla y León',
    '41': 'Andalucía', '42': 'Castilla y León', '43': 'Cataluña', '44': 'Aragón',
    '45': 'Castilla-La Mancha', '46': 'Comunidad Valenciana', '47': 'Castilla y León',
    '48': 'País Vasco', '49': 'Castilla y León', '50': 'Aragón', '51': 'Ceuta', '52': 'Melilla'
};

// Código de provincia INE a 2 dígitos ('9' → '09'), o null.
export const pad2 = (v) => { const s = String(v ?? '').trim(); return s ? s.padStart(2, '0') : null; };

// Tipologías de ficha que maneja la app. FUENTE ÚNICA de la lista: los filtros,
// el selector de "cambiar tipo de actuación" y el cuadro de mando la recorren,
// así que añadir una ficha nueva aquí la propaga a todas esas pantallas.
export const FICHAS = ['RES060', 'RES080', 'RES093', 'TER100', 'TER173'];

// ─── Color de cada ficha ─────────────────────────────────────────────────────
// Los mismos tres usos en las cuatro superficies que pintan la ficha (el selector
// del filtro, el badge de la tabla, la inicial del certificador y la tarjeta del
// móvil). Estaban escritos como cuatro cadenas de ternarios idénticas, y al entrar
// la TER173 se habría quedado alguna atrás pintándola del color de RES060 — que es
// justo la que NO es.
//
// TER100 y TER173 son las dos del terciario y comparten familia (cian/teal): en un
// listado lo que hay que distinguir de un vistazo es el sector.
const COLOR_POR_DEFECTO = { texto: 'text-brand', badge: 'bg-brand/10 text-brand border-brand/20', chip: 'bg-brand/15 text-brand' };
export const FICHA_COLOR = {
    RES060: COLOR_POR_DEFECTO,
    RES080: { texto: 'text-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', chip: 'bg-emerald-500/15 text-emerald-400' },
    RES093: { texto: 'text-indigo-400', badge: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20', chip: 'bg-indigo-500/15 text-indigo-400' },
    TER100: { texto: 'text-cyan-400', badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', chip: 'bg-cyan-500/15 text-cyan-400' },
    TER173: { texto: 'text-teal-400', badge: 'bg-teal-500/10 text-teal-400 border-teal-500/20', chip: 'bg-teal-500/15 text-teal-400' },
};
export const fichaColor = (ficha) => FICHA_COLOR[ficha] || COLOR_POR_DEFECTO;

export const getFicha = (exp) => {
    const num = exp.numero_expediente || '';
    if (num.includes('RES080')) return 'RES080';
    if (num.includes('RES093')) return 'RES093';
    if (num.includes('TER173')) return 'TER173';
    if (num.includes('TER100')) return 'TER100';
    return 'RES060';
};

// Año de la ACTUACIÓN según la fecha de fin de obra del CIFO. Es el criterio con
// el que se agrupan los lotes, por eso no se sustituye por created_at.
export const getCifoYear = (exp) => {
    const fin = exp.fecha_fin_cifo;
    if (!fin) return null;
    const y = new Date(fin).getFullYear();
    return isNaN(y) ? null : y;
};

// CCAA de la ACTUACIÓN (instalación), NO la del cliente. Mismo criterio que el
// backend (geoCcaa.resolveCcaaInstalacion): así el filtro, la selección de lote y
// la validación del servidor coinciden. El cliente solo es último recurso.
export const getCCAA = (exp) => {
    const inst = exp.instalacion || {};
    // 1. Instalación con dirección propia → su provincia manda.
    if (inst.misma_direccion === false) {
        const cod = pad2(inst.provincia_cod);
        if (cod && CCAA_MAP[cod]) return CCAA_MAP[cod];
    }
    // 2. Código de provincia del funnel de la oportunidad (el dato más fiable).
    const opCod = pad2(exp.oportunidades?.datos_calculo?.inputs?.provincia);
    if (opCod && CCAA_MAP[opCod]) return CCAA_MAP[opCod];
    // 3. Fallbacks al cliente: CCAA guardada o provincia textual.
    if (exp.clientes?.ccaa) return exp.clientes.ccaa;
    if (exp.clientes?.provincia) return exp.clientes.provincia;
    return '—';
};

// ─── Qué ficha produce una SIMULACIÓN ────────────────────────────────────────
// Espejo de `detectPrograma` del backend (utils/fichas.js) para el lado de la
// CALCULADORA, donde todavía no hay ni número de expediente ni `op.ficha`: la
// ficha se deduce de lo que el usuario ha marcado.
//
// REGLA — el SECTOR se declara y se mira ANTES que la reforma. La RES080 es
// "rehabilitación profunda de edificios de VIVIENDAS" y no existe en el
// terciario, así que un terciario no puede caer nunca ahí. Dentro de cada sector
// lo que distingue la actuación es la hibridación:
//
//              │ sin hibridar │ hibridado
//   residencial│   RES060     │  RES093     (+ RES080 si es reforma)
//   terciario  │   TER100     │  TER173
export const SECTORES = { RESIDENCIAL: 'residencial', TERCIARIO: 'terciario' };

export const fichaDesdeInputs = (inputs = {}) => {
    const hibrido = inputs.hibridacion === true;
    if (inputs.sector === SECTORES.TERCIARIO) return hibrido ? 'TER173' : 'TER100';
    const reforma = inputs.isReforma === true || ['onlyReforma', 'both'].includes(inputs.reformaType);
    if (reforma) return 'RES080';
    return hibrido ? 'RES093' : 'RES060';
};

/** ¿La simulación es de un edificio del sector TERCIARIO (TER100 · TER173)? */
export const esSectorTerciario = (inputs = {}) => inputs.sector === SECTORES.TERCIARIO;

// ─── Normalización de CCAA para AGRUPAR ──────────────────────────────────────
// getCCAA devuelve la etiqueta bonita del CCAA_MAP cuando hay código de provincia,
// pero cae al campo del cliente cuando no lo hay — y ahí normalizeData guarda el
// texto en MAYÚSCULAS. Resultado: 'Madrid' y 'MADRID' conviven, y cualquier suma
// por comunidad se parte en dos grupos.
//
// Se usa SOLO para agrupar/filtrar (p.ej. el cuadro de mando). A propósito NO se
// aplica dentro de getCCAA: ese valor alimenta la creación de lotes, que el
// backend valida con su propio criterio, y cambiarlo podría desalinearlos.
const CLAVE_CCAA = (s) => (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
    .replace(/^(comunidadforalde|comunidadautonomade|comunidadde|principadode|regionde|islas|comunidad)/, '')
    .replace(/y/g, '');

const INDICE_CCAA = Object.values(CCAA_MAP).reduce((acc, canonica) => {
    acc[CLAVE_CCAA(canonica)] = canonica;
    return acc;
}, {});

export const normalizeCcaa = (valor) => {
    if (!valor || valor === '—') return '—';
    return INDICE_CCAA[CLAVE_CCAA(valor)] || valor;
};

// Año para PREVISIÓN de facturación. Difiere de getCifoYear a propósito: aquí no
// se puede descartar un expediente por no tener aún fecha de CIFO (justo los que
// están en curso son los que interesa prever), así que se cae al año del número
// de expediente ('26RES060_118' → 2026), que se asigna al crearlo.
export const getAnioPrevision = (exp) => {
    const cifo = getCifoYear(exp);
    if (cifo) return cifo;
    // El prefijo de la ficha no es solo "RES": TER100 (terciario) usa "TER".
    const m = /^(\d{2})(?:RES|TER|IND)/.exec(exp.numero_expediente || '');
    if (m) return 2000 + parseInt(m[1], 10);
    const created = exp.created_at ? new Date(exp.created_at).getFullYear() : null;
    return created && !isNaN(created) ? created : null;
};
