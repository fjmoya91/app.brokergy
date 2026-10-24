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
// es lo que la IA no puede deducir ni de las fotos ni del Catastro.
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
// / genérica se guarda por equipo en `c.fotos_decision[equipo]`.
export const SLOTS = [
    {
        id: 'FOTO_FACHADA_PRINCIPAL', label: 'Fachada principal', multiple: true,
        ayuda: 'De frente y entera, con todas sus ventanas. Si no cabe, en dos fotos.',
        ayudaRemota: 'Si no la tienes, la IA mirará Google Street View (menos preciso).',
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
        ayuda: 'Opcional: un recorrido despacio por dentro, ventana a ventana. Sustituye a muchas fotos.',
    },
    {
        id: 'FOTO_CALDERA', label: 'Caldera', equipo: 'CALDERA',
        ayuda: 'La caldera entera.',
        cuando: c => equipoCalefaccion(c) === 'CALDERA',
    },
    {
        id: 'FOTO_PLACA_CALDERA', label: 'Placa de la caldera', equipo: 'CALDERA', placa: true,
        ayuda: 'La pegatina con marca, modelo y potencia, que se lea. Suele estar en un lateral o bajo la tapa.',
        cuando: c => equipoCalefaccion(c) === 'CALDERA',
    },
    {
        id: 'FOTO_AEROTERMIA', label: 'Aerotermia (unidad exterior)', equipo: 'AEROTERMIA',
        ayuda: 'La máquina exterior entera.',
        cuando: c => equipoCalefaccion(c) === 'AEROTERMIA' || c.acs === 'aerotermia',
    },
    {
        id: 'FOTO_PLACA_AEROTERMIA', label: 'Placa de la aerotermia', equipo: 'AEROTERMIA', placa: true,
        ayuda: 'La pegatina de la unidad exterior (y la del depósito si es aparte).',
        cuando: c => equipoCalefaccion(c) === 'AEROTERMIA' || c.acs === 'aerotermia',
    },
    {
        id: 'FOTO_TERMO', label: 'Termo o calentador', equipo: 'TERMO',
        ayuda: 'El termo eléctrico o el calentador entero.',
        cuando: c => c.acs === 'termo' || c.acs === 'calentador' || c.termo_extra === true,
    },
    {
        id: 'FOTO_PLACA_TERMO', label: 'Placa del termo o calentador', equipo: 'TERMO', placa: true,
        ayuda: 'La pegatina con litros y potencia.',
        cuando: c => c.acs === 'termo' || c.acs === 'calentador' || c.termo_extra === true,
    },
    {
        id: 'FOTO_AIRE_EXTERIOR', label: 'Aire acondicionado (unidad exterior)', equipo: 'AIRE', multiple: true,
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
        id: 'FOTO_VENTANAS', label: 'Ventanas por dentro', multiple: true,
        ayuda: 'Opcional: una ventana de cada tipo, de cerca, que se vea el marco y el vidrio.',
    },
    {
        id: 'FOTO_CUBIERTA', label: 'Cubierta o tejado', multiple: true,
        ayuda: 'Opcional: el tejado o la azotea.',
        cuando: c => c.tipo_edificio !== 'PISO' || c.posicion_piso === 'ULTIMO',
    },
    { id: 'DOC_PLANOS', label: 'Planos o croquis', multiple: true, documento: true, ayuda: 'Opcional: planos, un croquis a mano o la escritura.' },
    { id: 'DOC_CEE_EXISTENTE', label: 'Certificado anterior', multiple: true, documento: true, ayuda: 'Opcional: si la vivienda ya tenía un CEE (PDF, XML o .cex).' },
    { id: 'OTROS', label: 'Otros', multiple: true, documento: true, ayuda: 'Cualquier otra cosa útil.' },
];

export const SLOT_IDS = SLOTS.map(s => s.id);

export const DECISION_FOTO = [
    { value: 'SUBIR', label: 'La subo ahora' },
    { value: 'DESPUES', label: 'La subo después' },
    { value: 'GENERICA', label: 'Usar un equipo genérico' },
];

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
    reforma_que: [],            // IRPF_REFORMA: qué se reforma
    medidas: [],                // las que se meten en el CEE
    // fotos: equipo → SUBIR · DESPUES · GENERICA
    fotos_decision: {},
    notas: '',
};

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

/** Qué equipos necesitan foto y si la tienen o se decidió usar uno genérico. */
export function estadoEquipos(c = {}, uploads = {}) {
    const porEquipo = {};
    for (const s of slotsAplicables(c)) {
        if (!s.equipo) continue;
        const e = porEquipo[s.equipo] || (porEquipo[s.equipo] = { equipo: s.equipo, slots: [], fotos: 0, placa: 0 });
        e.slots.push(s.id);
        const n = cuentaSlot(uploads, s.id);
        e.fotos += n;
        if (s.placa) e.placa += n;
    }
    return Object.values(porEquipo).map(e => ({
        ...e,
        decision: c.fotos_decision?.[e.equipo] || null,
        completo: e.placa > 0,
    }));
}

// ── Medidas de mejora sugeridas según el propósito y lo que ya hay ──────────
// Criterio de BROKERGY: sin placas → aerotermia y aerotermia + FV; con placas y
// sin aerotermia → aerotermia; con aerotermia y sin placas → placas.
export function medidasSugeridas(c = {}, proposito = '') {
    const tieneAerotermia = c.calefaccion === 'aerotermia';
    const tienePlacas = c.placas_fv === 'SI';
    const s = [];
    const add = (m) => { if (!s.includes(m)) s.push(m); };

    if (proposito === 'IRPF_PLACAS') {
        add('PLACAS_FV');
        if (!tieneAerotermia) add('AEROTERMIA');
    } else if (proposito === 'IRPF_AEROTERMIA') {
        add('AEROTERMIA');
        if (!tienePlacas) add('AEROTERMIA_FV');
    } else if (proposito === 'IRPF_REFORMA') {
        const r = Array.isArray(c.reforma_que) ? c.reforma_que : [];
        if (r.includes('VENTANAS')) add('VENTANAS');
        if (r.includes('FACHADA')) add('AISLAMIENTO_FACHADA');
        if (r.includes('CUBIERTA')) add('AISLAMIENTO_CUBIERTA');
        if (!s.length) add('VENTANAS');
    }
    if (!s.length || ['COMPRAVENTA', 'ALQUILER', 'AYUDAS', 'OTRO'].includes(proposito)) {
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
//   bloqueantes — sin esto no se pide el CEE (el servidor lo vuelve a mirar)
//   avisos      — se puede pedir, pero el resultado será peor o habrá que
//                 completarlo en CE3X antes de registrar
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
    if (vacio(obra.proposito)) B('proposito', 'Di para qué es el certificado (venta, alquiler, IRPF…).', 'proposito');

    // La vivienda
    if (vacio(c.tipo_edificio)) B('tipo_edificio', 'Di qué tipo de vivienda es (casa, piso…).', 'vivienda');
    if (c.tipo_edificio === 'PISO' && vacio(c.posicion_piso)) B('posicion_piso', 'Di en qué planta está el piso (baja, intermedia, última).', 'vivienda');
    if (c.tipo_edificio !== 'PISO' && vacio(c.cubierta)) A('cubierta', 'Sin el tipo de cubierta se usará el de la época.', 'vivienda');
    if (vacio(c.suelo) && !(c.tipo_edificio === 'PISO' && c.posicion_piso === 'INTERMEDIO')) {
        A('suelo', 'Sin decir sobre qué apoya el suelo se supone terreno.', 'vivienda');
    }

    // Lo que la rodea: la IA no lo ve en una foto de fachada
    if (c.colinda_no_calefactado == null) {
        B('colindantes', '¿Alguna pared da a un garaje, cochera, trastero, local o escalera sin calefacción?', 'entorno');
    } else if (c.colinda_no_calefactado === true && vacio(c.colindantes)) {
        B('colindantes_cuales', 'Di con qué espacios sin calefacción linda la vivienda.', 'entorno');
    }
    if (c.patios == null && c.tipo_edificio !== 'UNIFAMILIAR_AISLADA') {
        A('patios', '¿Tiene patios interiores? Sus paredes y ventanas cuentan.', 'entorno');
    }

    // Huecos
    if (vacio(c.marco) || vacio(c.vidrio)) A('ventanas', 'Sin el tipo de ventana se usarán los valores por defecto de la época.', 'ventanas');

    // Instalaciones
    if (vacio(c.calefaccion)) B('calefaccion', 'Di con qué se calienta la vivienda.', 'calefaccion');
    if (equipoCalefaccion(c) === 'CALDERA' && vacio(c.emisor)) A('emisor', 'Sin el emisor se suponen radiadores.', 'calefaccion');
    if (vacio(c.acs)) B('acs', 'Di con qué se calienta el agua.', 'acs');
    if (c.acs === 'misma_caldera' && !equipoCalefaccion(c)) {
        B('acs_caldera', 'El agua caliente «de la misma caldera», pero no hay caldera en la calefacción.', 'acs');
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
        A(`placa_${e.equipo}`, `Falta la placa de ${NOMBRE_EQUIPO[e.equipo] || e.equipo}: se usará un equipo genérico si no la subes.`, 'fotos');
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
    const P = (k, v) => { if (!vacio(v)) l.push([k, String(v)]); };

    P('Para qué', labelDe(PROPOSITOS, obra.proposito));
    P('Visita', obra.en_vivienda === true ? 'El certificador está en la vivienda' : obra.en_vivienda === false ? 'Sin visita: con fotos' : null);
    P('Tipo', labelDe(TIPOS_EDIFICIO, c.tipo_edificio));
    if (c.tipo_edificio === 'PISO') P('Planta', labelDe(POSICION_PISO, c.posicion_piso));
    P('Plantas sobre rasante', c.plantas);
    P('Altura libre (m)', c.altura_libre);
    P('Sótano', labelDe(SOTANO, c.sotano));
    P('Bajo cubierta', labelDe(BAJO_CUBIERTA, c.bajo_cubierta));
    P('Cubierta', labelDe(CUBIERTA, c.cubierta));
    P('Suelo', labelDe(SUELO, c.suelo));
    if (c.colinda_no_calefactado === false) P('Linda con espacios sin calefacción', 'No');
    if (c.colinda_no_calefactado === true) {
        P('Linda con espacios sin calefacción', (c.colindantes || []).map(v => labelDe(COLINDANTES, v) || v).join(', '));
        P('Detalle de lo que linda', c.colindantes_nota);
    }
    if (c.patios != null) P('Patios', c.patios ? `Sí${c.num_patios ? ` (${c.num_patios})` : ''}` : 'No');
    P('Fachada', labelDe(FACHADA, c.fachada));
    P('Aislamiento de fachada', labelDe(AISLAMIENTO, c.aislamiento_fachada));
    P('Aislamiento de cubierta', labelDe(AISLAMIENTO, c.aislamiento_cubierta));
    P('Marco de las ventanas', labelDe(MARCO, c.marco));
    P('Vidrio', labelDe(VIDRIO, c.vidrio));
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
        P('Calefacción', cal.label + (extra.length ? ` · ${extra.join(' · ')}` : ''));
        P('Emisor', labelDe(EMISOR, c.emisor));
        if (c.cobertura_parcial === true) P('Cobertura de la calefacción', `Parcial${c.cobertura_pct ? ` (${c.cobertura_pct} %)` : ''}`);
    }
    const acs = labelDe(ACS, c.acs);
    if (acs) P('Agua caliente', acs + (c.termo_extra ? ' + termo eléctrico' : '') + (c.litros_termo ? ` · ${c.litros_termo} L` : ''));
    if (c.aire_acondicionado != null) {
        P('Aire acondicionado', c.aire_acondicionado
            ? `Sí${c.num_aires ? ` · ${c.num_aires}` : ''}${c.tipo_aire ? ` · ${labelDe(TIPO_AIRE, c.tipo_aire)}` : ''}`
            : 'No');
    }
    if (c.placas_fv) P('Placas fotovoltaicas', c.placas_fv === 'SI' ? `Sí${c.kwp ? ` · ${c.kwp} kWp` : ''}` : 'No');

    const medidas = vacio(c.medidas) ? medidasSugeridas(c, obra.proposito) : c.medidas;
    P('Medidas de mejora', medidas.map(m => labelDe(MEDIDAS, m) || m).join(' · '));

    const genericos = Object.entries(c.fotos_decision || {}).filter(([, d]) => d === 'GENERICA').map(([e]) => NOMBRE_EQUIPO[e] || e);
    if (genericos.length) P('Equipo genérico (sin placa)', genericos.join(', '));
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
    const listas = {
        tipo_edificio: TIPOS_EDIFICIO, posicion_piso: POSICION_PISO, sotano: SOTANO,
        bajo_cubierta: BAJO_CUBIERTA, cubierta: CUBIERTA, suelo: SUELO, fachada: FACHADA,
        aislamiento_fachada: AISLAMIENTO, aislamiento_cubierta: AISLAMIENTO, marco: MARCO,
        vidrio: VIDRIO, calefaccion: CALEFACCION, tipo_caldera: TIPO_CALDERA, emisor: EMISOR,
        acs: ACS, tipo_aire: TIPO_AIRE, placas_fv: PLACAS_FV,
    };
    for (const [k, lista] of Object.entries(listas)) out[k] = en(lista, raw[k]) ? raw[k] : '';
    const bool = (v) => (v === true || v === 'true' ? true : v === false || v === 'false' ? false : null);
    for (const k of ['colinda_no_calefactado', 'patios', 'persianas', 'cobertura_parcial', 'termo_extra', 'aire_acondicionado']) out[k] = bool(raw[k]);
    const corto = (v, n = 40) => String(v ?? '').slice(0, n).trim();
    for (const k of ['plantas', 'altura_libre', 'num_patios', 'anio_ventanas', 'anio_reforma', 'anio_calefaccion', 'potencia_kw', 'cobertura_pct', 'litros_termo', 'num_aires', 'kwp']) out[k] = corto(raw[k], 12);
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
    if (out.acs !== 'misma_caldera') out.termo_extra = null;
    if (out.aire_acondicionado !== true) { out.num_aires = ''; out.tipo_aire = ''; }
    if (out.colinda_no_calefactado !== true) { out.colindantes = []; out.colindantes_nota = ''; }
    return out;
}

export const PROPOSITO_VALUES = PROPOSITOS.map(p => p.value);
