// ─── cuestionario.js — la app de certificadores (cee.brokergy.es) ───────────
// FUENTE ÚNICA de lo que se le pregunta al certificador sobre la vivienda, de
// las fotos que se le piden, del BARRIDO antes de generar y del resumen que
// recibe la IA. Lo usan la app (formulario y ficha), el backend (barrido en el
// servidor al pedir el CEE y resumen para el aviso) y el generador (contexto de
// la skill generar-cee-inicial) por import() ESM. Si cada uno decidiera por su
// cuenta, la pantalla diría «listo» de una obra que el servidor rechaza.
//
// Lo que se pregunta es lo que lleva un CEE de vivienda en CE3X 3.2: datos
// generales, lo que rodea a la vivienda (medianeras, garajes, patios, terreno,
// cubierta), huecos, calefacción, ACS, refrigeración y renovables, y la medida
// de mejora. El vocabulario de calefacción y ACS sale del de los CEE directos
// (cuestionarioCee.js), ampliado: aquí lo contesta un técnico, no el cliente.
//
// REGLA — dos modos y un solo cuestionario. «¿Estás en la vivienda?»: SÍ → el
// formulario guía la visita (foto a foto, con la cámara); NO → pide lo mismo
// pero para subir fotos que ya tiene o mandar al propietario el enlace. Las
// preguntas no cambian; cambian los textos de ayuda y el orden de las fotos.
//
// REGLA — la foto que falta no bloquea: se sube ahora, después o se usa un
// equipo GENÉRICO (decisión del certificador, queda escrita). Lo que bloquea
// es lo que la IA no puede deducir ni de las fotos ni del Catastro: la
// referencia, la dirección, el titular y para qué es (25/10/2026, Fran: «al no
// tener todas las respuestas no me deja generar»). El tipo de vivienda, lo que
// la rodea, la calefacción y el agua caliente son AVISOS: los deduce la IA
// (`deduccionesCatastro` + «Lo que ha visto la IA») y el certificador confirma.
//
// REGLA — cada dato deducido lleva su ORIGEN (`c.origen[k]`): Catastro, fotos,
// Street View, placa, la época o lo habitual. Lo que contesta el certificador
// no lleva origen y una deducción NUNCA lo pisa. El generador lo recibe en el
// resumen («… (según el Catastro)») para saber qué es seguro y qué supuesto.
//
// Módulo JS PURO: sin React, sin fetch.
// ─────────────────────────────────────────────────────────────────────────────

// ── Para qué es el certificado ──────────────────────────────────────────────
export const PROPOSITOS = [
    { value: 'COMPRAVENTA', label: 'Venta de la vivienda', sub: 'Obligatorio para vender' },
    { value: 'ALQUILER', label: 'Alquiler', sub: 'Obligatorio para alquilar' },
    { value: 'IRPF_PLACAS', label: 'Deducción del IRPF por placas solares', sub: 'Hace falta el CEE de antes y el de después' },
    { value: 'IRPF_AEROTERMIA', label: 'Deducción del IRPF por aerotermia', sub: 'Hace falta el CEE de antes y el de después' },
    { value: 'IRPF_REFORMA', label: 'Deducción del IRPF por reforma (ventanas, aislamiento)', sub: 'Hace falta el CEE de antes y el de después' },
    { value: 'AYUDAS', label: 'Ayudas o subvenciones', sub: 'Programas de rehabilitación, CAE…' },
    { value: 'OTRO', label: 'Otro motivo', sub: 'Registro, informe, curiosidad…' },
];
export const PROPOSITO_VALUES = PROPOSITOS.map(p => p.value);

/**
 * Para qué es, que pueden ser VARIOS (Fran, 25/10/2026: «venta y además IRPF
 * por placas»). La lista vive en `cuestionario.propositos`; la columna
 * `proposito` de la obra guarda el PRIMERO (listados, avisos) y es lo único que
 * tienen las obras de antes.
 */
export function propositosDe(obra = {}) {
    const lista = Array.isArray(obra.cuestionario?.propositos)
        ? obra.cuestionario.propositos.filter(v => PROPOSITO_VALUES.includes(v)) : [];
    if (lista.length) return [...new Set(lista)];
    return PROPOSITO_VALUES.includes(obra.proposito) ? [obra.proposito] : [];
}

// ── La vivienda ─────────────────────────────────────────────────────────────
export const TIPOS_EDIFICIO = [
    { value: 'UNIFAMILIAR_AISLADA', label: 'Casa aislada', sub: 'Sin paredes compartidas' },
    { value: 'UNIFAMILIAR_PAREADA', label: 'Casa pareada', sub: 'Una pared compartida con otra casa' },
    { value: 'UNIFAMILIAR_ADOSADA', label: 'Casa adosada o entre medianeras', sub: 'Dos o más paredes compartidas' },
    { value: 'PISO', label: 'Piso en un bloque', sub: 'Una vivienda dentro de un edificio' },
    { value: 'BLOQUE', label: 'Edificio de viviendas entero', sub: 'Todo el bloque en un certificado' },
];

export const POSICION_PISO = [
    { value: 'BAJO', label: 'Planta baja', sub: 'Suelo sobre terreno, local o garaje' },
    { value: 'INTERMEDIO', label: 'Planta intermedia', sub: 'Viviendas encima y debajo' },
    { value: 'ULTIMO', label: 'Último piso', sub: 'La cubierta encima' },
];

export const SOTANO = [
    { value: 'NO', label: 'No tiene sótano' },
    { value: 'NO_HABITABLE', label: 'Sótano o semisótano NO habitable', sub: 'Garaje, bodega, trastero' },
    { value: 'HABITABLE', label: 'Sótano o semisótano habitable', sub: 'Forma parte de la vivienda' },
];

export const BAJO_CUBIERTA = [
    { value: 'NO', label: 'No hay bajo cubierta' },
    { value: 'NO_HABITABLE', label: 'Desván o cámara NO habitable' },
    { value: 'HABITABLE', label: 'Abuhardillado habitable', sub: 'Forma parte de la vivienda' },
];

export const CUBIERTA = [
    { value: 'INCLINADA', label: 'Inclinada (tejado)' },
    { value: 'PLANA', label: 'Plana (azotea)' },
    { value: 'NO_APLICA', label: 'No tiene: hay otra vivienda encima' },
];

export const SUELO = [
    { value: 'TERRENO', label: 'Sobre el terreno' },
    { value: 'CAMARA', label: 'Sobre cámara sanitaria o forjado ventilado' },
    { value: 'NO_CALEFACTADO', label: 'Sobre garaje, local o sótano sin calefacción' },
    { value: 'VIVIENDA', label: 'Sobre otra vivienda' },
    { value: 'EXTERIOR', label: 'Sobre un soportal o voladizo (aire exterior)' },
];

// Espacios NO calefactados con los que linda la vivienda: es lo que la IA no
// puede ver en una foto de fachada y cambia el resultado (particiones en CE3X).
export const COLINDANTES = [
    { value: 'GARAJE', label: 'Garaje o cochera' },
    { value: 'TRASTERO', label: 'Trastero o almacén' },
    { value: 'LOCAL', label: 'Local o nave sin calefacción' },
    { value: 'ESCALERA', label: 'Escalera o portal comunitario' },
    { value: 'PATIO_CUBIERTO', label: 'Patio cubierto o galería cerrada' },
    { value: 'OTRO', label: 'Otro espacio sin calefacción' },
];

// ── Fachadas y ventanas ─────────────────────────────────────────────────────
export const FACHADA = [
    { value: 'LADRILLO_VISTO', label: 'Ladrillo visto' },
    { value: 'ENFOSCADO', label: 'Enfoscado o revoco pintado' },
    { value: 'PIEDRA', label: 'Piedra o mampostería' },
    { value: 'BLOQUE', label: 'Bloque de hormigón' },
    { value: 'SATE', label: 'Aislada por fuera (SATE)' },
    { value: 'NO_SE', label: 'No lo sé' },
];

export const MARCO = [
    { value: 'MADERA', label: 'Madera' },
    { value: 'METALICO', label: 'Aluminio sin rotura de puente térmico' },
    { value: 'METALICO_RPT', label: 'Aluminio con rotura de puente térmico' },
    { value: 'PVC', label: 'PVC' },
    { value: 'MIXTO', label: 'Hay de varios tipos' },
];

export const VIDRIO = [
    { value: 'SIMPLE', label: 'Vidrio simple' },
    { value: 'DOBLE', label: 'Doble vidrio (Climalit)' },
    { value: 'DOBLE_BE', label: 'Doble vidrio bajo emisivo' },
    { value: 'TRIPLE', label: 'Triple vidrio' },
    { value: 'MIXTO', label: 'Hay de varios tipos' },
];

export const AISLAMIENTO = [
    { value: 'NO', label: 'No tiene o no consta' },
    { value: 'SI', label: 'Sí, añadido en una reforma' },
    { value: 'NO_SE', label: 'No lo sé' },
];

// ── Calefacción ─────────────────────────────────────────────────────────────
// `equipo`: qué fotos pide (ver SLOTS). Los valores de caldera coinciden con
// los de cuestionarioCee.js donde existen (gas, gasoleo, biomasa…).
export const CALEFACCION = [
    { value: 'gas', label: 'Caldera de gas natural', equipo: 'CALDERA', combustible: 'Gas natural' },
    { value: 'glp', label: 'Caldera de propano o butano (GLP)', equipo: 'CALDERA', combustible: 'GLP' },
    { value: 'gasoleo', label: 'Caldera de gasóleo', equipo: 'CALDERA', combustible: 'Gasóleo' },
    { value: 'biomasa', label: 'Caldera o estufa de biomasa', sub: 'Pellets, leña, hueso', equipo: 'CALDERA', combustible: 'Biomasa' },
    { value: 'aerotermia', label: 'Aerotermia (bomba de calor aire-agua)', equipo: 'AEROTERMIA', combustible: 'Electricidad' },
    { value: 'bomba_aire', label: 'Bomba de calor aire-aire (splits o conductos)', equipo: 'AIRE', combustible: 'Electricidad' },
    { value: 'electrica', label: 'Radiadores o acumuladores eléctricos', combustible: 'Electricidad' },
    { value: 'carbon', label: 'Carbón', equipo: 'CALDERA', combustible: 'Carbón' },
    { value: 'no_tiene', label: 'No tiene calefacción', sub: 'CE3X le pondrá el sistema por defecto' },
];

export const TIPO_CALDERA = [
    { value: 'ESTANDAR', label: 'Estándar (convencional)' },
    { value: 'BAJA_TEMPERATURA', label: 'Baja temperatura' },
    { value: 'CONDENSACION', label: 'Condensación' },
    { value: 'NO_SE', label: 'No lo sé (se mira en la placa)' },
];

export const EMISOR = [
    { value: 'RADIADORES', label: 'Radiadores' },
    { value: 'SUELO_RADIANTE', label: 'Suelo radiante' },
    { value: 'FANCOILS', label: 'Fancoils' },
    { value: 'MIXTO', label: 'Radiadores y suelo radiante' },
];

// ── Agua caliente ───────────────────────────────────────────────────────────
export const ACS = [
    { value: 'misma_caldera', label: 'La misma caldera de la calefacción' },
    { value: 'termo', label: 'Termo eléctrico', equipo: 'TERMO' },
    // `equipo` = el de sus SLOTS de fotos (estadoEquipos y fotos_decision van por él)
    { value: 'calentador', label: 'Calentador de gas o butano', equipo: 'TERMO' },
    { value: 'aerotermia', label: 'Aerotermia (la misma o una de ACS)', equipo: 'AEROTERMIA' },
    { value: 'solar', label: 'Placas solares térmicas', sub: 'Con su apoyo', equipo: 'SOLAR' },
    { value: 'no_tiene', label: 'No tiene agua caliente' },
];

export const LITROS_TERMO = ['30', '50', '80', '100', '150', '200', '300'];

// ── Qué se reforma (propósito IRPF por reforma) ─────────────────────────────
export const REFORMA_QUE = [
    { value: 'VENTANAS', label: 'Ventanas' },
    { value: 'FACHADA', label: 'Aislamiento de la fachada' },
    { value: 'CUBIERTA', label: 'Aislamiento de la cubierta' },
    { value: 'SUELO', label: 'Aislamiento del suelo' },
];

// ── Refrigeración y renovables ──────────────────────────────────────────────
export const TIPO_AIRE = [
    { value: 'SPLITS', label: 'Splits (unidades en la pared)' },
    { value: 'CONDUCTOS', label: 'Por conductos' },
    { value: 'MIXTO', label: 'Splits y conductos' },
];

export const PLACAS_FV = [
    { value: 'NO', label: 'No tiene placas fotovoltaicas' },
    { value: 'SI', label: 'Sí, ya tiene placas fotovoltaicas' },
];

// ── Medidas de mejora que puede llevar el CEE ───────────────────────────────
// (sin la palabra «genérica»: decisión de Fran para las medidas del .cex)
export const MEDIDAS = [
    { value: 'AEROTERMIA', label: 'Aerotermia para calefacción y agua caliente' },
    { value: 'AEROTERMIA_FV', label: 'Aerotermia + placas fotovoltaicas' },
    { value: 'PLACAS_FV', label: 'Placas fotovoltaicas de autoconsumo' },
    { value: 'VENTANAS', label: 'Cambio de ventanas' },
    { value: 'AISLAMIENTO_FACHADA', label: 'Aislamiento de fachada' },
    { value: 'AISLAMIENTO_CUBIERTA', label: 'Aislamiento de cubierta' },
];

// ── Fotos y documentos que se piden ─────────────────────────────────────────
// `cuando(c)`: si aplica a esta vivienda. `equipo`: la decisión subir / después
// / genérica se guarda por equipo en `c.fotos_decision[equipo]`. `opcional`: ayuda
// pero no hace falta; se puede dejar con «Ahora no» (`c.fotos_omitidas`).
// Ninguna foto bloquea: lo que falta lo pone la IA (Street View, su época…).
// `multiple`: se AÑADEN (nunca una sustituye a otra) y la galería deja elegir varias
// a la vez. `unaBasta`: aun así, con una del certificador el PROPIETARIO ya no la
// tiene que subir (sale `cubierto` en su enlace). Los equipos eran de una sola foto
// y cada una pisaba la anterior (Fran, 30/10/2026: «me las cambia»).
export const SLOTS = [
    {
        // Opcional (Fran, 25/10/2026): la que da a la calle la saca la IA de Google
        // Street View (`cee_inicial.js streetview`, un panorama por lado). La trasera no.
        id: 'FOTO_FACHADA_PRINCIPAL', label: 'Fachada principal', multiple: true, opcional: true,
        ayuda: 'De frente y entera, con todas sus ventanas. Si no cabe, en dos fotos.',
        ayudaRemota: 'Si no la tienes, la IA la saca de Google Street View (menos preciso).',
    },
    {
        id: 'FOTO_FACHADAS', label: 'Resto de fachadas', multiple: true,
        ayuda: 'Una foto de cada lado de la casa que tenga ventanas, también la trasera.',
    },
    {
        id: 'FOTO_PATIOS_INTERIORES', label: 'Patios', multiple: true,
        ayuda: 'Las paredes que dan a patios o patinillos, con sus ventanas.',
        cuando: c => c.patios === true,
    },
    {
        id: 'VIDEO_VIVIENDA', label: 'Vídeo de la vivienda', multiple: true, video: true,
        opcional: true,
        ayuda: 'Un recorrido despacio por dentro, ventana a ventana. Sustituye a muchas fotos.',
    },
    {
        id: 'FOTO_CALDERA', label: 'Caldera', equipo: 'CALDERA', multiple: true, unaBasta: true, opcional: true,
        ayuda: 'La caldera entera.',
        cuando: c => equipoCalefaccion(c) === 'CALDERA',
    },
    {
        id: 'FOTO_PLACA_CALDERA', label: 'Placa de la caldera', equipo: 'CALDERA', multiple: true, unaBasta: true, placa: true,
        ayuda: 'La pegatina con marca, modelo y potencia, que se lea. Suele estar en un lateral o bajo la tapa.',
        cuando: c => equipoCalefaccion(c) === 'CALDERA',
    },
    {
        id: 'FOTO_AEROTERMIA', label: 'Aerotermia (unidad exterior)', equipo: 'AEROTERMIA', multiple: true, unaBasta: true, opcional: true,
        ayuda: 'La máquina exterior entera.',
        cuando: c => equipoCalefaccion(c) === 'AEROTERMIA' || c.acs === 'aerotermia',
    },
    {
        id: 'FOTO_PLACA_AEROTERMIA', label: 'Placa de la aerotermia', equipo: 'AEROTERMIA', multiple: true, unaBasta: true, placa: true,
        ayuda: 'La pegatina de la unidad exterior (y la del depósito si es aparte).',
        cuando: c => equipoCalefaccion(c) === 'AEROTERMIA' || c.acs === 'aerotermia',
    },
    {
        id: 'FOTO_TERMO', label: 'Termo o calentador', equipo: 'TERMO', multiple: true, unaBasta: true, opcional: true,
        ayuda: 'El termo eléctrico o el calentador entero.',
        cuando: c => c.acs === 'termo' || c.acs === 'calentador' || c.termo_extra === true,
    },
    {
        id: 'FOTO_PLACA_TERMO', label: 'Placa del termo o calentador', equipo: 'TERMO', multiple: true, unaBasta: true, placa: true,
        ayuda: 'La pegatina con litros y potencia.',
        cuando: c => c.acs === 'termo' || c.acs === 'calentador' || c.termo_extra === true,
    },
    {
        id: 'FOTO_AIRE_EXTERIOR', label: 'Aire acondicionado (unidad exterior)', equipo: 'AIRE', multiple: true, opcional: true,
        ayuda: 'Las unidades exteriores.',
        cuando: c => c.aire_acondicionado === true || c.calefaccion === 'bomba_aire',
    },
    {
        id: 'FOTO_PLACA_AIRE', label: 'Placa del aire acondicionado', equipo: 'AIRE', placa: true, multiple: true,
        ayuda: 'La pegatina de cada unidad exterior (modelo y SEER/SCOP).',
        cuando: c => c.aire_acondicionado === true || c.calefaccion === 'bomba_aire',
    },
    {
        id: 'FOTO_PLACAS_SOLARES', label: 'Placas solares', equipo: 'SOLAR', multiple: true,
        ayuda: 'Las placas en la cubierta y, si se puede, el inversor con su pegatina.',
        cuando: c => c.placas_fv === 'SI' || c.acs === 'solar',
    },
    {
        id: 'FOTO_VENTANAS', label: 'Ventanas por dentro', multiple: true, opcional: true,
        ayuda: 'Una ventana de cada tipo, de cerca, que se vea el marco y el vidrio.',
    },
    {
        id: 'FOTO_CUBIERTA', label: 'Cubierta o tejado', multiple: true, opcional: true,
        ayuda: 'El tejado o la azotea.',
        cuando: c => c.tipo_edificio !== 'PISO' || c.posicion_piso === 'ULTIMO',
    },
    { id: 'DOC_PLANOS', label: 'Planos o croquis', multiple: true, documento: true, opcional: true, ayuda: 'Planos, un croquis a mano o la escritura.' },
    { id: 'DOC_CEE_EXISTENTE', label: 'Certificado anterior', multiple: true, documento: true, opcional: true, ayuda: 'Si la vivienda ya tenía un CEE (PDF, XML o .cex).' },
    { id: 'OTROS', label: 'Otros', multiple: true, documento: true, opcional: true, ayuda: 'Cualquier otra cosa útil.' },
];

export const SLOT_IDS = SLOTS.map(s => s.id);
const SLOT_OPCIONALES = SLOTS.filter(s => s.opcional).map(s => s.id);

export const DECISION_FOTO = [
    { value: 'SUBIR', label: 'La subo ahora' },
    { value: 'DESPUES', label: 'Ahora no, la subo luego' },
    { value: 'GENERICA', label: 'Usar un equipo genérico' },
];

// La antigüedad de un equipo genérico, con las mismas opciones que CE3X en
// «Rendimiento estacional: Estimado según instalación» (bombas de calor).
export const ANTIGUEDAD_EQUIPO = [
    { value: 'POSTERIOR_2013', label: 'Posterior a 2013' },
    { value: 'ENTRE_1994_2013', label: 'Entre 1994 y 2013' },
    { value: 'ANTERIOR_1994', label: 'Anterior a 1994' },
];
export const EQUIPOS_CON_ANTIGUEDAD = ['AIRE', 'AEROTERMIA'];

export const CUESTIONARIO_VACIO = {
    // la vivienda
    tipo_edificio: '', posicion_piso: '', plantas: '', altura_libre: '',
    sotano: '', bajo_cubierta: '', cubierta: '', suelo: '',
    // lo que la rodea
    colinda_no_calefactado: null, colindantes: [], colindantes_nota: '',
    patios: null, num_patios: '',
    // envolvente
    fachada: '', aislamiento_fachada: '', aislamiento_cubierta: '',
    marco: '', vidrio: '', persianas: null, anio_ventanas: '',
    anio_reforma: '',
    // instalaciones
    calefaccion: '', tipo_caldera: '', emisor: '', anio_calefaccion: '', potencia_kw: '',
    marca_modelo_calefaccion: '', cobertura_parcial: null, cobertura_pct: '',
    acs: '', termo_extra: null, litros_termo: '',
    aire_acondicionado: null, tipo_aire: '', num_aires: '',
    placas_fv: '', kwp: '',
    // para qué y medidas
    propositos: [],             // para qué (varios); el primero va también en obra.proposito
    reforma_que: [],            // IRPF_REFORMA: qué se reforma
    medidas: [],                // las que se meten en el CEE
    // fotos: equipo → SUBIR · DESPUES · GENERICA
    fotos_decision: {},
    fotos_antiguedad: {},       // equipo genérico → ANTIGUEDAD_EQUIPO (como en CE3X)
    fotos_omitidas: [],         // apartados opcionales dejados con «Ahora no» (ids de SLOTS)
    notas: '',
    // de dónde sale cada dato deducido (clave → ORIGENES); sin origen = lo contestó él
    origen: {},
    // «Lo que ha visto la IA»: { at, notas{k}, fotos{k}, dudas[], confirmado_at }
    visto_ia: null,
    // las fases que el certificador dio por buenas (FASE_IDS)
    fases_ok: [],
};

// ── De dónde sale cada dato ─────────────────────────────────────────────────
// `texto`: cómo se le dice al generador («Casa aislada (según el Catastro)»).
// `fiable`: si es un dato o un supuesto; un supuesto lo corrige lo que se vea.
export const ORIGENES = {
    CATASTRO: { label: 'Catastro', texto: 'según el Catastro', fiable: true },
    PLACA: { label: 'Placa', texto: 'leído en la placa', fiable: true },
    FOTO: { label: 'Fotos', texto: 'visto en las fotos', fiable: true },
    // Lo que ya sabía el CRM de un encargo de BROKERGY (la oportunidad y el
    // expediente: lo dijo el cliente o el instalador). Ver certapp/crm.js.
    BROKERGY: { label: 'BROKERGY', texto: 'según el expediente de BROKERGY', fiable: true },
    STREETVIEW: { label: 'Street View', texto: 'visto en Street View', fiable: false },
    EPOCA: { label: 'Su época', texto: 'lo normal de su año de construcción', fiable: false },
    HABITUAL: { label: 'Lo habitual', texto: 'lo habitual, sin ver', fiable: false },
};

// Las fases de la ficha, en orden. La pantalla las pinta (obra/fasesFicha.js); aquí
// solo los ids, para sanear lo que llega y para que el servidor sepa qué se vio.
export const FASE_IDS = ['inmueble', 'titular', 'proposito', 'fotos', 'generar'];   // sin 'visto_ia' desde el 26/10/2026

// ── Ayudas ──────────────────────────────────────────────────────────────────
const en = (lista, v) => lista.some(o => o.value === v);
const labelDe = (lista, v) => lista.find(o => o.value === v)?.label || null;
const num = (v) => {
    const n = Number(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};
const vacio = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0);

/** Qué equipo de calefacción hay (CALDERA · AEROTERMIA · AIRE · null). */
export function equipoCalefaccion(c = {}) {
    return CALEFACCION.find(o => o.value === c.calefaccion)?.equipo || null;
}

/** Los apartados de fotos que aplican a esta vivienda, en el orden de la visita. */
export function slotsAplicables(c = {}) {
    return SLOTS.filter(s => !s.cuando || s.cuando(c));
}

/** ¿Cuántos ficheros hay en un apartado? (documentacion.reforma_uploads) */
export function cuentaSlot(uploads, id) {
    return Array.isArray(uploads?.[id]) ? uploads[id].length : 0;
}

/** ¿Este apartado opcional se dejó con «Ahora no»? */
export function fotoOmitida(c = {}, id) {
    return Array.isArray(c.fotos_omitidas) && c.fotos_omitidas.includes(id);
}

/** Marca o desmarca un apartado opcional como «Ahora no» (devuelve el cuestionario nuevo). */
export function omitirFoto(c = {}, id, si = true) {
    const antes = Array.isArray(c.fotos_omitidas) ? c.fotos_omitidas.filter(x => x !== id) : [];
    return { ...c, fotos_omitidas: si && SLOT_OPCIONALES.includes(id) ? [...antes, id] : antes };
}

/**
 * El siguiente apartado que falta en la visita guiada: ni documentos ni vídeo, ni
 * los opcionales dejados con «Ahora no», ni la placa de un equipo que se sube luego
 * o va con uno genérico.
 */
export function siguienteDeLaVisita(aplican, c, slots) {
    return aplican.find(s => !s.documento && !s.video && !(slots?.[s.id] || []).length
        && !fotoOmitida(c, s.id) && !(s.placa && c.fotos_decision?.[s.equipo]))?.id || null;
}

/**
 * Qué equipos necesitan foto y si la tienen o se decidió usar uno genérico.
 * Completo = con su placa; un equipo sin apartado de placa (las placas solares),
 * con cualquier foto suya.
 */
export function estadoEquipos(c = {}, uploads = {}) {
    const porEquipo = {};
    for (const s of slotsAplicables(c)) {
        if (!s.equipo) continue;
        const e = porEquipo[s.equipo] || (porEquipo[s.equipo] = { equipo: s.equipo, slots: [], fotos: 0, placa: 0, conPlaca: false });
        e.slots.push(s.id);
        const n = cuentaSlot(uploads, s.id);
        e.fotos += n;
        if (s.placa) { e.placa += n; e.conPlaca = true; }
    }
    return Object.values(porEquipo).map(({ conPlaca, ...e }) => ({
        ...e,
        decision: c.fotos_decision?.[e.equipo] || null,
        completo: conPlaca ? e.placa > 0 : e.fotos > 0,
    }));
}

// ── Medidas de mejora sugeridas según el propósito y lo que ya hay ──────────
// Criterio de BROKERGY: sin placas → aerotermia y aerotermia + FV; con placas y
// sin aerotermia → aerotermia; con aerotermia y sin placas → placas.
// `propositos`: la lista de propositosDe (o uno suelto, como antes).
export function medidasSugeridas(c = {}, propositos = []) {
    const ps = (Array.isArray(propositos) ? propositos : [propositos]).filter(Boolean);
    const tieneAerotermia = c.calefaccion === 'aerotermia';
    const tienePlacas = c.placas_fv === 'SI';
    const s = [];
    const add = (m) => { if (!s.includes(m)) s.push(m); };

    if (ps.includes('IRPF_PLACAS')) {
        add('PLACAS_FV');
        if (!tieneAerotermia) add('AEROTERMIA');
    }
    if (ps.includes('IRPF_AEROTERMIA')) {
        add('AEROTERMIA');
        if (!tienePlacas) add('AEROTERMIA_FV');
    }
    if (ps.includes('IRPF_REFORMA')) {
        const r = Array.isArray(c.reforma_que) ? c.reforma_que : [];
        const antes = s.length;
        if (r.includes('VENTANAS')) add('VENTANAS');
        if (r.includes('FACHADA')) add('AISLAMIENTO_FACHADA');
        if (r.includes('CUBIERTA')) add('AISLAMIENTO_CUBIERTA');
        if (s.length === antes) add('VENTANAS');
    }
    if (!s.length || ps.some(p => ['COMPRAVENTA', 'ALQUILER', 'AYUDAS', 'OTRO'].includes(p))) {
        if (!tieneAerotermia) add('AEROTERMIA');
        if (!tieneAerotermia && !tienePlacas) add('AEROTERMIA_FV');
        if (tieneAerotermia && !tienePlacas) add('PLACAS_FV');
        if (tieneAerotermia && tienePlacas) { add('VENTANAS'); add('AISLAMIENTO_CUBIERTA'); }
    }
    return s;
}

// ── BARRIDO antes de generar ────────────────────────────────────────────────
// `obra`: la fila de certapp_obras (titular, inmueble, cuestionario,
// documentacion.reforma_uploads). `cuenta`: la del certificador.
// Devuelve:
//   bloqueantes — sin esto no se pide el CEE (el servidor lo vuelve a mirar).
//                 SOLO lo que la IA no puede sacar de ningún sitio: referencia,
//                 dirección, titular y para qué (ver la REGLA de la cabecera).
//   avisos      — se puede pedir; el texto dice qué hará la IA sin ese dato
//   equiposSinFoto — para ofrecer «subir ahora / usar genérico» en el popup
// Cada item: { id, texto, paso } — `paso` es la sección del formulario donde se arregla.
export function barrido(obra = {}, cuenta = null) {
    const c = { ...CUESTIONARIO_VACIO, ...(obra.cuestionario || {}) };
    const t = obra.titular || {};
    const uploads = obra.documentacion?.reforma_uploads || {};
    const bloqueantes = [];
    const avisos = [];
    const B = (id, texto, paso) => bloqueantes.push({ id, texto, paso });
    const A = (id, texto, paso) => avisos.push({ id, texto, paso });

    // El inmueble
    if (vacio(obra.ref_catastral)) B('ref_catastral', 'Falta la referencia catastral.', 'inmueble');
    if (vacio(obra.direccion) || vacio(obra.municipio)) B('direccion', 'Falta la dirección o el municipio de la vivienda.', 'inmueble');
    if (!(num(obra.superficie_catastro) > 0)) A('superficie', 'No hay superficie del Catastro: la IA medirá sobre el plano.', 'inmueble');

    // El titular (hace falta para presentar el certificado)
    if (vacio(t.nombre)) B('titular_nombre', 'Falta el nombre del titular del certificado.', 'titular');
    if (vacio(t.nif)) A('titular_nif', 'Falta el NIF del titular: hará falta para registrarlo.', 'titular');
    if (vacio(t.email) && vacio(t.telefono)) A('titular_contacto', 'Sin email ni teléfono del titular.', 'titular');

    // Para qué
    if (!propositosDe(obra).length) B('proposito', 'Di para qué es el certificado (venta, alquiler, IRPF…).', 'proposito');

    // La vivienda
    if (vacio(c.tipo_edificio)) A('tipo_edificio', 'Sin decir qué tipo de vivienda es, la IA lo sacará del Catastro y del plano.', 'vivienda');
    if (c.tipo_edificio === 'PISO' && vacio(c.posicion_piso)) A('posicion_piso', 'Sin la planta del piso, la IA la sacará del Catastro y de las fotos.', 'vivienda');
    if (c.tipo_edificio !== 'PISO' && vacio(c.cubierta)) A('cubierta', 'Sin el tipo de cubierta se usará el de la época.', 'vivienda');
    if (vacio(c.suelo) && !(c.tipo_edificio === 'PISO' && c.posicion_piso === 'INTERMEDIO')) {
        A('suelo', 'Sin decir sobre qué apoya el suelo se supone terreno.', 'vivienda');
    }

    // Lo que la rodea: en una foto de fachada no se ve, pero el Catastro dice
    // si en la parcela hay garaje o almacén
    if (c.colinda_no_calefactado == null) {
        A('colindantes', 'No has dicho si alguna pared da a un garaje, trastero o escalera sin calefacción: la IA lo deducirá del Catastro.', 'entorno');
    } else if (c.colinda_no_calefactado === true && vacio(c.colindantes)) {
        A('colindantes_cuales', 'Linda con algo sin calefacción, pero no has dicho con qué: la IA supondrá un garaje.', 'entorno');
    }
    if (c.patios == null && c.tipo_edificio !== 'UNIFAMILIAR_AISLADA') {
        A('patios', '¿Tiene patios interiores? Sus paredes y ventanas cuentan.', 'entorno');
    }

    // Huecos
    if (vacio(c.marco) || vacio(c.vidrio)) A('ventanas', 'Sin el tipo de ventana se usarán los valores por defecto de la época.', 'ventanas');

    // Instalaciones
    if (vacio(c.calefaccion)) A('calefaccion', 'Sin decir con qué se calienta, la IA lo buscará en las fotos; si no lo ve, CE3X pondrá el sistema por defecto.', 'calefaccion');
    if (equipoCalefaccion(c) === 'CALDERA' && vacio(c.emisor)) A('emisor', 'Sin el emisor se suponen radiadores.', 'calefaccion');
    if (vacio(c.acs)) A('acs', 'Sin decir con qué se calienta el agua, la IA lo buscará en las fotos; si no lo ve, CE3X pondrá el sistema por defecto.', 'acs');
    if (c.acs === 'misma_caldera' && !equipoCalefaccion(c) && !vacio(c.calefaccion)) {
        A('acs_caldera', 'El agua caliente sale «de la misma caldera», pero la calefacción no es una caldera: revisa las dos.', 'acs');
    }
    if (c.acs === 'misma_caldera' && c.termo_extra == null) A('termo_extra', '¿Hay además un termo eléctrico?', 'acs');
    // Con la calefacción por bomba aire-aire el aire acondicionado ya está contestado.
    if (c.aire_acondicionado == null && c.calefaccion !== 'bomba_aire') A('aire', '¿Tiene aire acondicionado?', 'refrigeracion');
    if (c.aire_acondicionado === true && !(num(c.num_aires) > 0)) A('num_aires', '¿Cuántos aparatos de aire acondicionado?', 'refrigeracion');
    if (vacio(c.placas_fv)) A('placas_fv', '¿Tiene placas fotovoltaicas?', 'renovables');

    // Medidas de mejora
    if (vacio(c.medidas)) A('medidas', 'Sin medidas elegidas se pondrán las sugeridas.', 'medidas');

    // Fotos de la vivienda
    const fachada = cuentaSlot(uploads, 'FOTO_FACHADA_PRINCIPAL') + cuentaSlot(uploads, 'FOTO_FACHADAS');
    const video = cuentaSlot(uploads, 'VIDEO_VIVIENDA');
    if (!fachada && !video) {
        A('fotos_fachada', 'Sin fotos de las fachadas ni vídeo: la IA usará Google Street View y no verá la trasera.', 'fotos');
    }
    if (c.patios === true && !cuentaSlot(uploads, 'FOTO_PATIOS_INTERIORES') && !video) {
        A('fotos_patios', 'Dijiste que tiene patios y no hay fotos de ellos.', 'fotos');
    }

    // Equipos sin placa: subir ahora, después o genérico
    const equiposSinFoto = estadoEquipos(c, uploads).filter(e => !e.completo && e.decision !== 'GENERICA');
    for (const e of equiposSinFoto) {
        A(`placa_${e.equipo}`, `Falta ${placaDe(e.equipo)}: se usará un equipo genérico si no la subes.`, 'fotos');
    }

    // El certificador (sale en el .cex como técnico; lo puede poner luego en CE3X)
    if (cuenta) {
        const faltan = ['nombre', 'nif', 'titulacion'].filter(k => vacio(cuenta[k]));
        if (faltan.length) A('perfil', 'Completa tu perfil (nombre, NIF y titulación) para que salgan en el certificado.', 'perfil');
    }

    return { listo: bloqueantes.length === 0, bloqueantes, avisos, equiposSinFoto };
}

export const NOMBRE_EQUIPO = {
    CALDERA: 'la caldera',
    AEROTERMIA: 'la aerotermia',
    TERMO: 'el termo o calentador',
    AIRE: 'el aire acondicionado',
    SOLAR: 'las placas solares',
};

/** Los equipos genéricos en palabras: «el aire acondicionado (antigüedad en CE3X: entre 1994 y 2013)». */
export function genericosDe(c = {}) {
    return Object.entries(c.fotos_decision || {}).filter(([, d]) => d === 'GENERICA').map(([e]) => {
        const a = labelDe(ANTIGUEDAD_EQUIPO, c.fotos_antiguedad?.[e]);
        return `${NOMBRE_EQUIPO[e] || e}${a ? ` (antigüedad en CE3X: ${a.toLowerCase()})` : ''}`;
    });
}

/** «la placa del aire acondicionado», «la placa de la caldera»; las placas solares, «una foto de las placas solares». */
export function placaDe(equipo) {
    const n = NOMBRE_EQUIPO[equipo] || String(equipo || '').toLowerCase();
    if (equipo === 'SOLAR') return `una foto de ${n}`;
    return `la placa ${n.startsWith('el ') ? `del ${n.slice(3)}` : `de ${n}`}`;
}

// ── Lo que se deduce sin preguntar ──────────────────────────────────────────
// Lo que la IA puede dar por sabido. Cada uno, con su origen; lo que contestó
// el certificador (valor sin origen) no se toca nunca.
export const DEDUCIBLES = [
    'tipo_edificio', 'posicion_piso', 'plantas', 'altura_libre', 'sotano', 'bajo_cubierta', 'cubierta', 'suelo',
    'colinda_no_calefactado', 'colindantes', 'patios', 'fachada', 'aislamiento_fachada', 'aislamiento_cubierta',
    'marco', 'vidrio', 'persianas', 'anio_ventanas', 'anio_reforma',
    'calefaccion', 'tipo_caldera', 'emisor', 'anio_calefaccion', 'potencia_kw', 'marca_modelo_calefaccion',
    'acs', 'termo_extra', 'litros_termo', 'aire_acondicionado', 'tipo_aire', 'num_aires', 'placas_fv', 'kwp',
];

// Cuánto vale cada origen: uno peor no pisa a uno mejor (lo de la época no
// pisa lo visto en una foto).
export const RANGO_ORIGEN = { HABITUAL: 1, EPOCA: 2, STREETVIEW: 3, BROKERGY: 4, FOTO: 4, CATASTRO: 5, PLACA: 5 };

// Los valores de lista que admite cada clave (también para sanear).
const LISTAS_VALOR = {
    tipo_edificio: TIPOS_EDIFICIO, posicion_piso: POSICION_PISO, sotano: SOTANO,
    bajo_cubierta: BAJO_CUBIERTA, cubierta: CUBIERTA, suelo: SUELO, fachada: FACHADA,
    aislamiento_fachada: AISLAMIENTO, aislamiento_cubierta: AISLAMIENTO, marco: MARCO,
    vidrio: VIDRIO, calefaccion: CALEFACCION, tipo_caldera: TIPO_CALDERA, emisor: EMISOR,
    acs: ACS, tipo_aire: TIPO_AIRE, placas_fv: PLACAS_FV,
};
const CLAVES_SI_NO = ['colinda_no_calefactado', 'patios', 'persianas', 'cobertura_parcial', 'termo_extra', 'aire_acondicionado'];
const CLAVES_CORTAS = ['plantas', 'altura_libre', 'num_patios', 'anio_ventanas', 'anio_reforma', 'anio_calefaccion', 'potencia_kw', 'cobertura_pct', 'litros_termo', 'num_aires', 'kwp'];

/** ¿Es `v` un valor que la clave `k` admite? (para lo que propone la IA) */
export function valorValido(k, v) {
    if (LISTAS_VALOR[k]) return en(LISTAS_VALOR[k], v);
    if (CLAVES_SI_NO.includes(k)) return v === true || v === false;
    if (k === 'colindantes') return Array.isArray(v) && v.length > 0 && v.every(x => en(COLINDANTES, x));
    if (CLAVES_CORTAS.includes(k)) return !vacio(v) && String(v).length <= 12;
    if (k === 'marca_modelo_calefaccion') return !vacio(v) && String(v).length <= 120;
    return false;
}

/** Las ventanas normales de su año de construcción (la norma de cada época). */
function ventanasDeLaEpoca(anio) {
    if (!(anio > 1800)) return null;
    if (anio < 1980) return { marco: 'METALICO', vidrio: 'SIMPLE', por: `antes de 1980 lo normal es aluminio y vidrio simple` };
    if (anio < 2007) return { marco: 'METALICO', vidrio: 'DOBLE', por: `entre 1980 y 2006 lo normal es aluminio sin rotura y doble vidrio` };
    if (anio < 2014) return { marco: 'METALICO_RPT', vidrio: 'DOBLE', por: `desde el CTE de 2006, aluminio con rotura y doble vidrio` };
    return { marco: 'METALICO_RPT', vidrio: 'DOBLE_BE', por: `desde 2014, aluminio con rotura y doble vidrio bajo emisivo` };
}

const plantaNum = (p) => {
    const s = String(p ?? '').trim().toUpperCase();
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^(S|SS|SM)\d*$/.test(s)) return -1;   // sótano / semisótano
    return null;
};
const OTRAS_NO_CALEFACTADAS = [
    [/APARCAMIENTO|GARAJE/, 'GARAJE', 'garaje'],
    [/ALMAC[EÉ]N|TRASTERO/, 'TRASTERO', 'almacén'],
    [/INDUSTRIAL|AGRARIO|NAVE/, 'LOCAL', 'nave'],
];

/**
 * Lo que se deduce del Catastro, del año y de lo habitual, SIN preguntar.
 * Puro: no escribe. Solo propone para las claves vacías o ya deducidas con un
 * origen peor; lo contestado por el certificador no se toca.
 *
 * @returns {{ valores: object, origen: object, notas: object, dudas: Array }}
 *   dudas: { id, k, pregunta, por_que, opciones: [{ label, valores }] } — lo
 *   que el Catastro no resuelve y se le pregunta en corto al certificador.
 */
export function deduccionesCatastro(obra = {}) {
    const c = { ...CUESTIONARIO_VACIO, ...(obra.cuestionario || {}) };
    const cat = obra.catastro || {};
    const anio = num(obra.anio_construccion) || num(cat.anio);
    const valores = {}, origen = {}, notas = {}, dudas = [];
    const actual = (k) => (k in valores ? valores[k] : c[k]);
    const puede = (k, o) => {
        if (vacio(c[k])) return true;
        const antes = c.origen?.[k];
        return !!antes && (RANGO_ORIGEN[o] || 0) >= (RANGO_ORIGEN[antes] || 0);
    };
    const pon = (k, v, o, nota) => {
        if (vacio(v) || !puede(k, o) || (k in valores)) return;
        // Ya está así y con ese origen: nada nuevo (la pantalla aplica mientras haya novedades).
        if (JSON.stringify(c[k]) === JSON.stringify(v) && c.origen?.[k] === o) return;
        valores[k] = v; origen[k] = o;
        if (nota) notas[k] = nota;
    };
    // Se pregunta lo que está vacío y también lo que solo es un SUPUESTO (Street
    // View, la época): «parece adosada desde la calle» no basta para darlo por hecho.
    const duda = (id, k, pregunta, por_que, opciones) => {
        if (k in valores) return;
        if (!vacio(c[k]) && (!c.origen?.[k] || ORIGENES[c.origen[k]]?.fiable)) return;
        dudas.push({ id, k, pregunta, por_que, opciones });
    };

    const cons = Array.isArray(cat.construcciones) ? cat.construcciones : [];
    const viv = cons.filter(x => /VIVIENDA/i.test(x.tipo || ''));
    const plantasViv = [...new Set(viv.map(x => plantaNum(x.planta)).filter(n => n != null))].sort((a, b) => a - b);
    const sobreRasante = plantasViv.filter(n => n >= 0);
    const tipoCat = String(cat.tipo || '');
    const part = num(String(cat.participacion ?? '').replace(',', '.'));
    const conDH = /varios inmuebles|con divisi[oó]n horizontal/i.test(tipoCat) || (part != null && part > 0 && part < 99.99);
    const sinDH = !conDH && /sin divisi[oó]n horizontal/i.test(tipoCat);

    // ── Casa o piso ──
    // Lo que solo «parece» (Street View) no gana al Catastro: se vuelve a decidir.
    const supuestoTipo = !!c.origen?.tipo_edificio && !ORIGENES[c.origen.tipo_edificio]?.fiable;
    let esCasa = c.tipo_edificio && !supuestoTipo ? c.tipo_edificio.startsWith('UNIFAMILIAR') : null;
    if (esCasa == null && sinDH) {
        esCasa = true;
        duda('tipo_casa', 'tipo_edificio', '¿Qué tipo de casa es?',
            'El Catastro dice que es una casa (parcela sin división horizontal), pero no si tiene paredes compartidas.',
            TIPOS_EDIFICIO.filter(t => t.value.startsWith('UNIFAMILIAR')).map(t => ({ label: t.label, sub: t.sub, valores: { tipo_edificio: t.value } })));
    } else if (esCasa == null && conDH) {
        if (sobreRasante.includes(0) && sobreRasante.length >= 2) {
            duda('tipo_dh', 'tipo_edificio', '¿Es un adosado o un piso?',
                'En el Catastro está en división horizontal, pero ocupa la planta baja y la de arriba: suele ser un adosado de una urbanización.',
                [
                    { label: 'Casa adosada', valores: { tipo_edificio: 'UNIFAMILIAR_ADOSADA' } },
                    { label: 'Casa pareada', valores: { tipo_edificio: 'UNIFAMILIAR_PAREADA' } },
                    { label: 'Piso (dúplex)', valores: { tipo_edificio: 'PISO' } },
                ]);
        } else {
            esCasa = false;
            pon('tipo_edificio', 'PISO', 'CATASTRO', 'El Catastro la tiene en un edificio con división horizontal.');
        }
    }
    if (esCasa == null && c.tipo_edificio) esCasa = c.tipo_edificio.startsWith('UNIFAMILIAR');
    const esPiso = actual('tipo_edificio') === 'PISO';

    // ── Plantas y sótano ──
    if (sobreRasante.length) pon('plantas', String(sobreRasante.length), 'CATASTRO', `El Catastro tiene vivienda en ${sobreRasante.length === 1 ? 'una planta' : `${sobreRasante.length} plantas`}.`);
    else if (num(cat.plantas) > 0 && esCasa) pon('plantas', String(num(cat.plantas)), 'CATASTRO');
    const bajoRasante = cons.filter(x => (plantaNum(x.planta) ?? 0) < 0);
    if (esCasa) {
        if (!bajoRasante.length) pon('sotano', 'NO', 'CATASTRO', 'El Catastro no tiene nada bajo rasante.');
        else if (bajoRasante.some(x => /VIVIENDA/i.test(x.tipo || ''))) pon('sotano', 'HABITABLE', 'CATASTRO', 'El Catastro tiene vivienda bajo rasante.');
        else pon('sotano', 'NO_HABITABLE', 'CATASTRO', `El Catastro tiene ${String(bajoRasante[0].tipo || '').toLowerCase()} bajo rasante.`);
    }

    // ── La planta del piso ──
    if (esPiso && plantasViv.length) {
        const p = plantasViv[0];
        if (p <= 0) pon('posicion_piso', 'BAJO', 'CATASTRO', 'El Catastro la tiene en la planta baja.');
        else {
            duda('posicion_piso', 'posicion_piso', `Está en la planta ${p}: ¿hay más viviendas encima?`,
                'El Catastro dice la planta del piso, no cuántas tiene el edificio.',
                [
                    { label: 'Sí, es una planta intermedia', valores: { posicion_piso: 'INTERMEDIO' } },
                    { label: 'No, es el último piso', valores: { posicion_piso: 'ULTIMO' } },
                ]);
        }
    }

    // ── Lo que la rodea ──
    if (esPiso) {
        pon('colinda_no_calefactado', true, 'HABITUAL', 'Un piso casi siempre da a la escalera o al portal.');
        pon('colindantes', ['ESCALERA'], 'HABITUAL');
    } else if (esCasa) {
        const otras = cons.filter(x => !/VIVIENDA/i.test(x.tipo || '') && (plantaNum(x.planta) ?? 0) >= 0)
            .map(x => ({ x, t: OTRAS_NO_CALEFACTADAS.find(([re]) => re.test(String(x.tipo || '').toUpperCase())) }))
            .filter(o => o.t);
        if (!otras.length) {
            pon('colinda_no_calefactado', false, 'CATASTRO', 'En la parcela solo hay vivienda.');
        } else {
            const o = otras[0];
            const m2 = num(o.x.superficie);
            const tipos = [...new Set(otras.map(q => q.t[1]))];
            duda('colindante', 'colinda_no_calefactado',
                `¿El ${o.t[2]}${m2 ? ` de ${m2} m²` : ''} está pegado a la vivienda?`,
                `El Catastro tiene ${otras.map(q => `${q.t[2]}${num(q.x.superficie) ? ` (${num(q.x.superficie)} m²)` : ''}`).join(' y ')} en la parcela.`,
                [
                    { label: 'Sí, pared con pared', valores: { colinda_no_calefactado: true, colindantes: tipos } },
                    { label: 'No, está separado', valores: { colinda_no_calefactado: false } },
                ]);
        }
    }

    // ── Cubierta y suelo ──
    const pos = actual('posicion_piso');
    if (esCasa) {
        pon('cubierta', 'INCLINADA', 'HABITUAL', 'Lo normal en una casa; si en las fotos es una azotea, cámbialo.');
        const sot = actual('sotano');
        pon('suelo', sot === 'NO_HABITABLE' ? 'NO_CALEFACTADO' : 'TERRENO', 'HABITUAL',
            sot === 'NO_HABITABLE' ? 'Encima del sótano.' : 'Una casa sin sótano apoya en el terreno.');
    } else if (esPiso && (pos === 'BAJO' || pos === 'INTERMEDIO')) {
        pon('cubierta', 'NO_APLICA', 'CATASTRO', 'Hay otra vivienda encima.');
    }
    if (esPiso && (pos === 'INTERMEDIO' || pos === 'ULTIMO')) pon('suelo', 'VIVIENDA', 'CATASTRO', 'Hay otra vivienda debajo.');

    // ── Ventanas y aislamiento, por su año ──
    const v = ventanasDeLaEpoca(anio);
    if (v) {
        const nota = `Construida en ${anio}: ${v.por}. Si en las fotos se ve otra cosa, cámbialo.`;
        pon('marco', v.marco, 'EPOCA', nota);
        pon('vidrio', v.vidrio, 'EPOCA', nota);
    }
    if (cat.reforma?.anio) pon('anio_reforma', String(cat.reforma.anio), 'CATASTRO', `El Catastro registra una reforma${cat.reforma.tipo ? ` (${cat.reforma.tipo})` : ''}.`);
    else if (anio) {
        const nota = 'Sin reforma en el Catastro: el aislamiento de su año (el de CE3X por defecto).';
        pon('aislamiento_fachada', 'NO', 'EPOCA', nota);
        if (esCasa || pos === 'ULTIMO') pon('aislamiento_cubierta', 'NO', 'EPOCA', nota);
    }

    // ── Instalaciones: lo habitual con lo que ya se sabe ──
    const cal = CALEFACCION.find(o => o.value === actual('calefaccion'));
    if (cal?.equipo === 'CALDERA') {
        pon('emisor', 'RADIADORES', 'HABITUAL', 'Con caldera, lo normal son radiadores.');
        if (cal.value !== 'biomasa' && cal.value !== 'carbon') pon('acs', 'misma_caldera', 'HABITUAL', 'Una caldera de gas o gasóleo suele dar también el agua caliente.');
    } else if (cal?.value === 'aerotermia') {
        pon('emisor', 'RADIADORES', 'HABITUAL', 'Sin otra cosa vista, radiadores.');
        pon('acs', 'aerotermia', 'HABITUAL', 'La aerotermia suele dar también el agua caliente.');
    }
    return { valores, origen, notas, dudas };
}

/**
 * Mete en el cuestionario lo deducido (de `deduccionesCatastro` o de la IA):
 * valores y su origen, y las notas en `visto_ia.notas`. Lo contestado por el
 * certificador no se toca (eso ya lo filtró quien dedujo, pero se vuelve a
 * mirar: este es el último paso antes de guardar).
 */
export function aplicarDeducciones(cuestionario = {}, ded = {}) {
    const c = { ...CUESTIONARIO_VACIO, ...cuestionario };
    const origen = { ...(c.origen || {}) };
    const visto = { ...(c.visto_ia || {}) };
    const notas = { ...(visto.notas || {}) };
    for (const [k, v] of Object.entries(ded.valores || {})) {
        const o = ded.origen?.[k];
        if (!DEDUCIBLES.includes(k) || !ORIGENES[o] || !valorValido(k, v)) continue;
        if (!vacio(c[k]) && !origen[k]) continue;   // lo contestó él
        if (!vacio(c[k]) && (RANGO_ORIGEN[o] || 0) < (RANGO_ORIGEN[origen[k]] || 0)) continue;
        c[k] = v;
        origen[k] = o;
        if (ded.notas?.[k]) notas[k] = String(ded.notas[k]).slice(0, 300);
    }
    return { ...c, origen, visto_ia: { ...visto, notas } };
}

/**
 * Contesta él: el valor queda como suyo (sin origen); lo que dependía de la
 * clave lo limpia sanearCuestionario al guardar. `valores`: { clave: valor }
 * (una duda puede fijar dos, p. ej. linda = sí + garaje).
 */
export function contestar(cuestionario = {}, valores = {}) {
    const origen = { ...(cuestionario.origen || {}) };
    for (const k of Object.keys(valores)) delete origen[k];
    if ('colinda_no_calefactado' in valores) delete origen.colindantes;
    return { ...cuestionario, ...valores, origen };
}

/** Avance del formulario, 0–100, para la barra de la ficha. */
export function avance(obra = {}) {
    const { bloqueantes, avisos } = barrido(obra);
    const total = 12;
    const pend = bloqueantes.length * 2 + Math.min(avisos.length, 6);
    return Math.max(0, Math.min(100, Math.round(100 * (1 - pend / (total * 2)))));
}

// ── Lo que se le pasa a la IA ───────────────────────────────────────────────
// Líneas [etiqueta, valor] legibles: la ficha de la obra, el aviso al equipo y
// el contexto de la skill generar-cee-inicial salen de aquí.
export function resumenCuestionario(obra = {}) {
    const c = { ...CUESTIONARIO_VACIO, ...(obra.cuestionario || {}) };
    const l = [];
    // `k`: la clave del cuestionario, para decir de dónde sale si es deducido.
    const P = (etiqueta, v, k = null) => {
        if (vacio(v)) return;
        const o = k ? ORIGENES[c.origen?.[k]] : null;
        l.push([etiqueta, o ? `${v} (${o.texto})` : String(v)]);
    };

    P('Para qué', propositosDe(obra).map(v => labelDe(PROPOSITOS, v)).join(' · '));
    P('Visita', obra.en_vivienda === true ? 'El certificador está en la vivienda' : obra.en_vivienda === false ? 'Sin visita: con fotos' : null);
    P('Tipo', labelDe(TIPOS_EDIFICIO, c.tipo_edificio), 'tipo_edificio');
    if (c.tipo_edificio === 'PISO') P('Planta', labelDe(POSICION_PISO, c.posicion_piso), 'posicion_piso');
    P('Plantas sobre rasante', c.plantas, 'plantas');
    P('Altura libre (m)', c.altura_libre, 'altura_libre');
    P('Sótano', labelDe(SOTANO, c.sotano), 'sotano');
    P('Bajo cubierta', labelDe(BAJO_CUBIERTA, c.bajo_cubierta), 'bajo_cubierta');
    P('Cubierta', labelDe(CUBIERTA, c.cubierta), 'cubierta');
    P('Suelo', labelDe(SUELO, c.suelo), 'suelo');
    if (c.colinda_no_calefactado === false) P('Linda con espacios sin calefacción', 'No', 'colinda_no_calefactado');
    if (c.colinda_no_calefactado === true) {
        P('Linda con espacios sin calefacción', (c.colindantes || []).map(v => labelDe(COLINDANTES, v) || v).join(', '), 'colinda_no_calefactado');
        P('Detalle de lo que linda', c.colindantes_nota);
    }
    if (c.patios != null) P('Patios', c.patios ? `Sí${c.num_patios ? ` (${c.num_patios})` : ''}` : 'No', 'patios');
    P('Fachada', labelDe(FACHADA, c.fachada), 'fachada');
    P('Aislamiento de fachada', labelDe(AISLAMIENTO, c.aislamiento_fachada), 'aislamiento_fachada');
    P('Aislamiento de cubierta', labelDe(AISLAMIENTO, c.aislamiento_cubierta), 'aislamiento_cubierta');
    P('Marco de las ventanas', labelDe(MARCO, c.marco), 'marco');
    P('Vidrio', labelDe(VIDRIO, c.vidrio), 'vidrio');
    if (c.persianas != null) P('Persianas', c.persianas ? 'Sí' : 'No');
    P('Año de las ventanas', c.anio_ventanas);
    P('Año de la última reforma', c.anio_reforma);

    const cal = CALEFACCION.find(o => o.value === c.calefaccion);
    if (cal) {
        const extra = [];
        if (cal.equipo === 'CALDERA' && c.tipo_caldera) extra.push(labelDe(TIPO_CALDERA, c.tipo_caldera));
        if (c.potencia_kw) extra.push(`${c.potencia_kw} kW`);
        if (c.anio_calefaccion) extra.push(`año ${c.anio_calefaccion}`);
        if (c.marca_modelo_calefaccion) extra.push(c.marca_modelo_calefaccion);
        P('Calefacción', cal.label + (extra.length ? ` · ${extra.join(' · ')}` : ''), 'calefaccion');
        P('Emisor', labelDe(EMISOR, c.emisor), 'emisor');
        if (c.cobertura_parcial === true) P('Cobertura de la calefacción', `Parcial${c.cobertura_pct ? ` (${c.cobertura_pct} %)` : ''}`);
    }
    const acs = labelDe(ACS, c.acs);
    if (acs) P('Agua caliente', acs + (c.termo_extra ? ' + termo eléctrico' : '') + (c.litros_termo ? ` · ${c.litros_termo} L` : ''), 'acs');
    if (c.aire_acondicionado != null) {
        P('Aire acondicionado', c.aire_acondicionado
            ? `Sí${c.num_aires ? ` · ${c.num_aires}` : ''}${c.tipo_aire ? ` · ${labelDe(TIPO_AIRE, c.tipo_aire)}` : ''}`
            : 'No', 'aire_acondicionado');
    }
    if (c.placas_fv) P('Placas fotovoltaicas', c.placas_fv === 'SI' ? `Sí${c.kwp ? ` · ${c.kwp} kWp` : ''}` : 'No', 'placas_fv');

    const medidas = vacio(c.medidas) ? medidasSugeridas(c, propositosDe(obra)) : c.medidas;
    P('Medidas de mejora', medidas.map(m => labelDe(MEDIDAS, m) || m).join(' · '));

    const genericos = genericosDe(c);
    if (genericos.length) P('Equipo genérico (sin placa)', genericos.join(', '));
    if (c.visto_ia?.confirmado_at) P('Lo deducido', 'Revisado y confirmado por el certificador antes de pedirlo');
    else if (Object.keys(c.origen || {}).length) P('Lo deducido', 'SIN confirmar por el certificador: compruébalo con las fotos');
    P('Notas del certificador', c.notas);
    return l;
}

/** El resumen en texto plano (para el WhatsApp del equipo y el encargo a la IA). */
export function resumenTexto(obra = {}) {
    return resumenCuestionario(obra).map(([k, v]) => `• ${k}: ${v}`).join('\n');
}

// ── Puente con lo que ya leen la envolvente y la ficha del .cex ─────────────
// fichaCe3x.js lee `documentacion.cuestionario` con la forma de los CEE
// directos (cuestionarioCee.js). Se COMPONE al cargar la obra, no se guarda:
// la fuente es `certapp_obras.cuestionario`.
export function aCuestionarioCee(c = {}) {
    const calef = {
        gas: 'gas', glp: 'gas', gasoleo: 'gasoleo', biomasa: 'biomasa', carbon: 'carbon',
        aerotermia: 'aerotermia', bomba_aire: 'aerotermia', electrica: 'electrica', no_tiene: 'no_tiene',
    }[c.calefaccion] || '';
    const acs = {
        misma_caldera: 'misma_caldera', termo: 'termo', calentador: 'butano',
        aerotermia: 'aerotermia', solar: 'solar', no_tiene: 'no_tengo',
    }[c.acs] || '';
    const aa = c.aire_acondicionado === true || c.calefaccion === 'bomba_aire' ? true
        : c.aire_acondicionado === false ? false : null;
    return {
        calefaccion: calef,
        acs,
        termo_extra: acs === 'misma_caldera' ? (c.termo_extra === true ? true : c.termo_extra === false ? false : null) : null,
        aire_acondicionado: aa,
        num_aires: aa ? (num(c.num_aires) > 0 ? Math.round(num(c.num_aires)) : null) : null,
        placas: c.placas_fv === 'SI' ? 'si' : c.placas_fv === 'NO' ? 'no' : '',
    };
}

/** Deja el cuestionario con solo claves y valores conocidos (lo que llega del navegador). */
export function sanearCuestionario(raw = {}) {
    const out = {};
    for (const [k, lista] of Object.entries(LISTAS_VALOR)) out[k] = en(lista, raw[k]) ? raw[k] : '';
    const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
    for (const k of CLAVES_SI_NO) out[k] = bool(raw[k]);
    const corto = (v, n = 40) => String(v ?? '').slice(0, n).trim();
    for (const k of CLAVES_CORTAS) out[k] = corto(raw[k], 12);
    out.marca_modelo_calefaccion = corto(raw.marca_modelo_calefaccion, 120);
    out.colindantes_nota = corto(raw.colindantes_nota, 600);
    out.notas = corto(raw.notas, 2000);
    out.colindantes = Array.isArray(raw.colindantes) ? raw.colindantes.filter(v => en(COLINDANTES, v)) : [];
    out.reforma_que = Array.isArray(raw.reforma_que) ? raw.reforma_que.filter(v => en(REFORMA_QUE, v)) : [];
    out.medidas = Array.isArray(raw.medidas) ? raw.medidas.filter(v => en(MEDIDAS, v)) : [];
    out.fotos_decision = {};
    for (const [e, d] of Object.entries(raw.fotos_decision || {})) {
        if (NOMBRE_EQUIPO[e] && en(DECISION_FOTO, d)) out.fotos_decision[e] = d;
    }
    out.fotos_antiguedad = {};
    for (const [e, a] of Object.entries(raw.fotos_antiguedad || {})) {
        if (EQUIPOS_CON_ANTIGUEDAD.includes(e) && en(ANTIGUEDAD_EQUIPO, a)) out.fotos_antiguedad[e] = a;
    }
    out.fotos_omitidas = Array.isArray(raw.fotos_omitidas) ? [...new Set(raw.fotos_omitidas.filter(id => SLOT_OPCIONALES.includes(id)))] : [];
    if (out.acs !== 'misma_caldera') out.termo_extra = null;
    if (out.aire_acondicionado !== true) { out.num_aires = ''; out.tipo_aire = ''; }
    if (out.colinda_no_calefactado !== true) { out.colindantes = []; out.colindantes_nota = ''; }
    out.propositos = Array.isArray(raw.propositos) ? [...new Set(raw.propositos.filter(v => PROPOSITO_VALUES.includes(v)))] : [];
    // El origen, solo de claves deducibles que tengan valor (sin valor no hay nada que justificar).
    out.origen = {};
    for (const [k, o] of Object.entries(raw.origen || {})) {
        if (DEDUCIBLES.includes(k) && ORIGENES[o] && !vacio(out[k])) out.origen[k] = o;
    }
    out.visto_ia = sanearVistoIa(raw.visto_ia);
    out.fases_ok = Array.isArray(raw.fases_ok) ? [...new Set(raw.fases_ok.filter(f => FASE_IDS.includes(f)))] : [];
    return out;
}

const ID_DRIVE = /^[\w-]{10,120}$/;
/** «Lo que ha visto la IA», con solo lo conocido y recortado. */
function sanearVistoIa(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const fecha = (x) => (typeof x === 'string' && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : null);
    const texto = (x, n) => String(x ?? '').slice(0, n).trim();
    const notas = {}, fotos = {};
    for (const [k, t] of Object.entries(v.notas || {})) if (DEDUCIBLES.includes(k) && !vacio(t)) notas[k] = texto(t, 300);
    for (const [k, id] of Object.entries(v.fotos || {})) if (DEDUCIBLES.includes(k) && ID_DRIVE.test(String(id))) fotos[k] = String(id);
    const dudas = (Array.isArray(v.dudas) ? v.dudas : []).slice(0, 12)
        .filter(d => d && DEDUCIBLES.includes(d.k))
        .map(d => ({
            id: texto(d.id || d.k, 40), k: d.k, pregunta: texto(d.pregunta, 200), por_que: texto(d.por_que, 300),
            foto: ID_DRIVE.test(String(d.foto || '')) ? String(d.foto) : null,
            opciones: (Array.isArray(d.opciones) ? d.opciones : []).slice(0, 6).map(o => ({
                label: texto(o?.label, 80), sub: texto(o?.sub, 80) || undefined,
                valores: Object.fromEntries(Object.entries(o?.valores || {}).filter(([k, x]) => DEDUCIBLES.includes(k) && valorValido(k, x))),
            })).filter(o => o.label && Object.keys(o.valores).length),
        }))
        .filter(d => d.pregunta && d.opciones.length);
    const f = v.fuentes || {};
    return {
        at: fecha(v.at), confirmado_at: fecha(v.confirmado_at), notas, fotos, dudas,
        fuentes: { fotos: Math.max(0, Math.min(99, Number(f.fotos) || 0)), streetview: f.streetview === true, placa: f.placa === true },
    };
}
