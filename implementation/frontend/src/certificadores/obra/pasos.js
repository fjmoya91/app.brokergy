// ─── pasos.js — cómo se ordena el cuestionario en pantalla ──────────────────
// Las preguntas, sus opciones y sus fotos salen de logic/cuestionario.js (fuente
// única). Aquí solo se decide el ORDEN, el texto de cada pregunta en pantalla y
// cuándo se enseña. Los `id` de los pasos son los `paso` que devuelve barrido(),
// para que «Ir a arreglarlo» lleve justo ahí.
import {
    PROPOSITOS, TIPOS_EDIFICIO, POSICION_PISO, SOTANO, BAJO_CUBIERTA, CUBIERTA, SUELO,
    COLINDANTES, FACHADA, MARCO, VIDRIO, AISLAMIENTO, CALEFACCION, TIPO_CALDERA, EMISOR,
    ACS, LITROS_TERMO, TIPO_AIRE, PLACAS_FV, REFORMA_QUE, equipoCalefaccion,
} from '../logic/cuestionario';

export { REFORMA_QUE };

export const SI_NO = [
    { value: true, label: 'Sí' },
    { value: false, label: 'No' },
];

const esPiso = (c) => c.tipo_edificio === 'PISO';
const tieneCubierta = (c) => !esPiso(c) || c.posicion_piso === 'ULTIMO';
const tieneSueloPropio = (c) => !(esPiso(c) && c.posicion_piso === 'INTERMEDIO');
const tieneCalefaccion = (c) => !!c.calefaccion && c.calefaccion !== 'no_tiene';

// ¿En qué paso se enseña la foto/placa de cada equipo? (un equipo, un sitio)
export function pasoDelEquipo(equipo, c) {
    switch (equipo) {
        case 'CALDERA': return 'calefaccion';
        case 'AEROTERMIA': return c.calefaccion === 'aerotermia' ? 'calefaccion' : 'acs';
        case 'AIRE': return c.calefaccion === 'bomba_aire' ? 'calefaccion' : 'refrigeracion';
        case 'TERMO': return 'acs';
        case 'SOLAR': return c.acs === 'solar' ? 'acs' : 'renovables';
        default: return 'fotos';
    }
}

/*
 * Cada pregunta:
 *   k        clave del cuestionario (o de la obra si `obra: true`)
 *   tipo     opciones · sino · multi · numero · texto · textarea · chips
 *            · inmueble · titular · equipos · medidas · fotos · resumen (a medida)
 *   titulo   lo que se pregunta (en el móvil, en grande)
 *   ayuda    una línea debajo
 *   lista    las opciones (de cuestionario.js)
 *   cuando   (c, form) => si se enseña
 *   opcional no hace falta para el barrido
 */
export const PASOS = [
    {
        id: 'proposito', titulo: 'Para qué es', sub: 'Venta, alquiler, IRPF…',
        preguntas: [
            { k: 'proposito', obra: true, tipo: 'opciones', lista: PROPOSITOS, titulo: '¿Para qué es el certificado?', ayuda: 'Decide las medidas de mejora que se sugieren.' },
        ],
    },
    {
        id: 'inmueble', titulo: 'El inmueble', sub: 'Lo que dice el Catastro',
        preguntas: [{ tipo: 'inmueble', titulo: 'Comprueba los datos del Catastro', ayuda: 'Añade el piso y la puerta si faltan.' }],
    },
    {
        id: 'titular', titulo: 'El titular', sub: 'Quien firma la solicitud',
        preguntas: [{ tipo: 'titular', titulo: '¿Quién es el titular del certificado?', ayuda: 'El nombre hace falta para pedirlo; el NIF, para registrarlo.' }],
    },
    {
        id: 'vivienda', titulo: 'La vivienda', sub: 'Tipo, plantas, cubierta y suelo',
        preguntas: [
            { k: 'tipo_edificio', tipo: 'opciones', lista: TIPOS_EDIFICIO, titulo: '¿Qué tipo de vivienda es?' },
            { k: 'posicion_piso', tipo: 'opciones', lista: POSICION_PISO, titulo: '¿En qué planta está el piso?', cuando: esPiso },
            { k: 'plantas', tipo: 'numero', titulo: '¿Cuántas plantas sobre rasante tiene?', placeholder: '2', opcional: true, cuando: c => !esPiso(c) },
            { k: 'altura_libre', tipo: 'numero', titulo: 'Altura libre de suelo a techo', sufijo: 'm', placeholder: '2,60', decimal: true, opcional: true, ayuda: 'Si no la mides, se usa la habitual de la época.' },
            { k: 'sotano', tipo: 'opciones', lista: SOTANO, titulo: '¿Tiene sótano o semisótano?', opcional: true, cuando: c => !esPiso(c) || c.posicion_piso === 'BAJO' },
            { k: 'bajo_cubierta', tipo: 'opciones', lista: BAJO_CUBIERTA, titulo: '¿Y bajo cubierta?', opcional: true, cuando: tieneCubierta },
            { k: 'cubierta', tipo: 'opciones', lista: CUBIERTA, titulo: '¿Cómo es la cubierta?', cuando: tieneCubierta },
            { k: 'suelo', tipo: 'opciones', lista: SUELO, titulo: '¿Sobre qué apoya el suelo de la vivienda?', cuando: tieneSueloPropio },
        ],
    },
    {
        id: 'entorno', titulo: 'Lo que la rodea', sub: 'Garajes, escaleras, patios',
        preguntas: [
            { k: 'colinda_no_calefactado', tipo: 'sino', titulo: '¿Alguna pared, suelo o techo da a un espacio sin calefacción?', ayuda: 'Garaje, cochera, trastero, local, escalera… La IA no lo ve en una foto de fachada y cambia el resultado.' },
            { k: 'colindantes', tipo: 'multi', lista: COLINDANTES, titulo: '¿Con cuáles?', ayuda: 'Marca todos.', cuando: c => c.colinda_no_calefactado === true },
            { k: 'colindantes_nota', tipo: 'textarea', titulo: '¿Dónde están?', placeholder: 'Por ejemplo: el garaje está debajo del salón y la cocina; la escalera linda con el dormitorio principal.', opcional: true, cuando: c => c.colinda_no_calefactado === true },
            { k: 'patios', tipo: 'sino', titulo: '¿Tiene patios interiores o patinillos?', ayuda: 'Sus paredes y ventanas cuentan.', cuando: c => c.tipo_edificio !== 'UNIFAMILIAR_AISLADA' },
            { k: 'num_patios', tipo: 'numero', titulo: '¿Cuántos patios?', placeholder: '1', opcional: true, cuando: c => c.patios === true },
        ],
    },
    {
        id: 'ventanas', titulo: 'Fachadas y ventanas', sub: 'Acabado, aislamiento, marcos y vidrios',
        preguntas: [
            { k: 'fachada', tipo: 'opciones', lista: FACHADA, titulo: '¿Cómo es la fachada por fuera?', opcional: true },
            { k: 'aislamiento_fachada', tipo: 'opciones', lista: AISLAMIENTO, titulo: '¿La fachada tiene aislamiento?', opcional: true },
            { k: 'aislamiento_cubierta', tipo: 'opciones', lista: AISLAMIENTO, titulo: '¿Y la cubierta?', opcional: true, cuando: tieneCubierta },
            { k: 'marco', tipo: 'opciones', lista: MARCO, titulo: '¿De qué son los marcos de las ventanas?' },
            { k: 'vidrio', tipo: 'opciones', lista: VIDRIO, titulo: '¿Y el vidrio?' },
            { k: 'persianas', tipo: 'sino', titulo: '¿Tienen persianas?', opcional: true },
            { k: 'anio_ventanas', tipo: 'numero', titulo: '¿De qué año son las ventanas?', placeholder: '2005', opcional: true, ayuda: 'Si se cambiaron después de construir la casa.' },
            { k: 'anio_reforma', tipo: 'numero', titulo: '¿Año de la última reforma importante?', placeholder: '2012', opcional: true },
        ],
    },
    {
        id: 'calefaccion', titulo: 'Calefacción', sub: 'El equipo, su emisor y su placa',
        preguntas: [
            { k: 'calefaccion', tipo: 'opciones', lista: CALEFACCION, titulo: '¿Con qué se calienta la vivienda?' },
            { k: 'tipo_caldera', tipo: 'opciones', lista: TIPO_CALDERA, titulo: '¿Qué tipo de caldera es?', opcional: true, cuando: c => equipoCalefaccion(c) === 'CALDERA' },
            { k: 'emisor', tipo: 'opciones', lista: EMISOR, titulo: '¿Cómo llega el calor a las habitaciones?', cuando: c => ['CALDERA', 'AEROTERMIA'].includes(equipoCalefaccion(c)) },
            { tipo: 'equipos', titulo: 'La foto del equipo y su placa', cuando: c => !!equipoCalefaccion(c) },
            { k: 'marca_modelo_calefaccion', tipo: 'texto', titulo: 'Marca y modelo', placeholder: 'Si no lo dice la placa', opcional: true, cuando: c => !!equipoCalefaccion(c) },
            { k: 'potencia_kw', tipo: 'numero', titulo: 'Potencia', sufijo: 'kW', placeholder: '24', decimal: true, opcional: true, cuando: tieneCalefaccion },
            { k: 'anio_calefaccion', tipo: 'numero', titulo: '¿De qué año es el equipo?', placeholder: '2010', opcional: true, cuando: tieneCalefaccion },
            { k: 'cobertura_parcial', tipo: 'sino', titulo: '¿La calefacción llega solo a una parte de la vivienda?', opcional: true, cuando: tieneCalefaccion },
            { k: 'cobertura_pct', tipo: 'numero', titulo: '¿Qué parte cubre?', sufijo: '%', placeholder: '60', opcional: true, cuando: c => c.cobertura_parcial === true },
        ],
    },
    {
        id: 'acs', titulo: 'Agua caliente', sub: 'Con qué se calienta el agua',
        preguntas: [
            { k: 'acs', tipo: 'opciones', lista: ACS, titulo: '¿Con qué se calienta el agua?' },
            { k: 'termo_extra', tipo: 'sino', titulo: '¿Hay además un termo eléctrico?', cuando: c => c.acs === 'misma_caldera' },
            { k: 'litros_termo', tipo: 'chips', lista: LITROS_TERMO.map(l => ({ value: l, label: `${l} L` })), titulo: '¿De cuántos litros es el termo?', opcional: true, cuando: c => c.acs === 'termo' || c.termo_extra === true },
            { tipo: 'equipos', titulo: 'La foto del equipo y su placa', cuando: c => c.acs === 'termo' || c.acs === 'calentador' || c.termo_extra === true || (c.acs === 'aerotermia' && c.calefaccion !== 'aerotermia') || c.acs === 'solar' },
        ],
    },
    {
        id: 'refrigeracion', titulo: 'Aire acondicionado', sub: 'Refrigeración',
        preguntas: [
            { k: 'aire_acondicionado', tipo: 'sino', titulo: '¿Tiene aire acondicionado?', ayudaFn: c => (c.calefaccion === 'bomba_aire' ? 'Con bomba de calor aire-aire, normalmente sí.' : null) },
            { k: 'tipo_aire', tipo: 'opciones', lista: TIPO_AIRE, titulo: '¿Cómo es?', opcional: true, cuando: c => c.aire_acondicionado === true },
            { k: 'num_aires', tipo: 'numero', titulo: '¿Cuántos aparatos (unidades exteriores)?', placeholder: '2', cuando: c => c.aire_acondicionado === true },
            { tipo: 'equipos', titulo: 'La foto de las unidades y su placa', cuando: c => c.aire_acondicionado === true && c.calefaccion !== 'bomba_aire' },
        ],
    },
    {
        id: 'renovables', titulo: 'Placas fotovoltaicas', sub: 'Renovables',
        preguntas: [
            { k: 'placas_fv', tipo: 'opciones', lista: PLACAS_FV, titulo: '¿Tiene placas fotovoltaicas?' },
            { k: 'kwp', tipo: 'numero', titulo: '¿Qué potencia tienen?', sufijo: 'kWp', placeholder: '4,5', decimal: true, opcional: true, cuando: c => c.placas_fv === 'SI' },
            { tipo: 'equipos', titulo: 'La foto de las placas', cuando: c => c.placas_fv === 'SI' && c.acs !== 'solar' },
        ],
    },
    {
        id: 'medidas', titulo: 'Medidas de mejora', sub: 'Las que lleva el certificado',
        preguntas: [
            { k: 'reforma_que', tipo: 'multi', lista: REFORMA_QUE, titulo: '¿Qué se va a reformar?', ayuda: 'Para la deducción hace falta el CEE de antes y el de después.', cuando: (c, f) => f?.proposito === 'IRPF_REFORMA' },
            { tipo: 'medidas', titulo: '¿Qué medidas de mejora lleva el certificado?', ayuda: 'Marcadas, las que te sugerimos para esta vivienda. Cámbialas si quieres.' },
        ],
    },
    {
        id: 'fotos', titulo: 'Fotos y documentos', sub: 'Fachadas, equipos y lo que tengas',
        preguntas: [{ tipo: 'fotos', titulo: 'Fotos y documentos' }],
    },
    {
        id: 'notas', titulo: 'Notas', sub: 'Lo que quieras contarle a la IA',
        preguntas: [{ k: 'notas', tipo: 'textarea', titulo: '¿Algo más que deba saber la IA?', placeholder: 'Por ejemplo: la cocina se reformó en 2018 con ventanas nuevas; el dormitorio del fondo no tiene radiador.', opcional: true }],
    },
];

export const PASO_POR_ID = Object.fromEntries(PASOS.map(p => [p.id, p]));

/** Las preguntas que se enseñan ahora mismo en un paso. */
export function preguntasVisibles(paso, form) {
    const c = form?.cuestionario || {};
    return paso.preguntas.filter(p => !p.cuando || p.cuando(c, form));
}

/** Todas las preguntas visibles, en orden (el recorrido del móvil). */
export function recorrido(form) {
    const out = [];
    for (const paso of PASOS) {
        for (const p of preguntasVisibles(paso, form)) {
            out.push({ id: `${paso.id}:${p.k || p.tipo}`, paso, p });
        }
    }
    return out;
}

/** El valor de una pregunta en el formulario. */
export function valorDe(p, form) {
    if (!p.k) return undefined;
    return p.obra ? form?.[p.k] : form?.cuestionario?.[p.k];
}

/** ¿Está contestada? (para saltar a la primera que falta) */
export function contestada(p, form) {
    if (!p.k) return true;
    const v = valorDe(p, form);
    if (Array.isArray(v)) return v.length > 0;
    return v !== '' && v != null;
}
